import { useState, useMemo, useEffect } from "react";

const MONTHS = ["Q1'26", "Q2'26", "Q3'26", "Q4'26", "Q1'27", "Q2'27", "Q3'27", "Q4'27", "Q1'28", "Q2'28", "Q3'28", "Q4'28", "Q1'29", "Q2'29", "Q3'29", "Q4'29", "Q1'30", "Q2'30", "Q3'30", "Q4'30"];
const MONTH_VALUES = [0, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36, 39, 42, 45, 48, 51, 54, 57];

// MSFT vesting schedule (net 80% of gross) — hedged at $410.68/share floor
// Starting March 2026 = month 0. Each vest covers ~3 months.
const MSFT_FLOOR_PRICE = 410.68;

// Share counts per vest period
const VEST_SHARES = [
  { startMonth: 0,  endMonth: 2,  shares: 133, label: "May '26" },
  { startMonth: 3,  endMonth: 5,  shares: 134, label: "Aug '26" },
  { startMonth: 6,  endMonth: 8,  shares: 88,  label: "Nov '26" },
  { startMonth: 9,  endMonth: 11, shares: 88,  label: "Feb '27" },
  { startMonth: 12, endMonth: 14, shares: 88,  label: "May '27" },
  { startMonth: 15, endMonth: 17, shares: 89,  label: "Aug '27" },
  { startMonth: 18, endMonth: 20, shares: 32,  label: "Nov '27" },
  { startMonth: 21, endMonth: 23, shares: 32,  label: "Feb '28" },
  { startMonth: 24, endMonth: 26, shares: 32,  label: "May '28" },
  { startMonth: 27, endMonth: 29, shares: 33,  label: "Aug '28" },
];

function getMsftPrice(monthOffset, annualGrowth) {
  return MSFT_FLOOR_PRICE * Math.pow(1 + annualGrowth / 100, monthOffset / 12);
}

function getVestingMonthly(monthOffset, msftGrowth) {
  for (const v of VEST_SHARES) {
    if (monthOffset >= v.startMonth && monthOffset <= v.endMonth) {
      const price = getMsftPrice(v.endMonth, msftGrowth);
      return Math.round(v.shares * price * 0.8 / 3);
    }
  }
  return 0;
}

function getVestingLumpSum(monthOffset, msftGrowth) {
  for (const v of VEST_SHARES) {
    if (monthOffset === v.endMonth) {
      const price = getMsftPrice(v.endMonth, msftGrowth);
      return Math.round(v.shares * price * 0.8);
    }
  }
  return 0;
}

function getVestEvents(msftGrowth) {
  return VEST_SHARES.map(v => {
    const price = getMsftPrice(v.endMonth, msftGrowth);
    const gross = v.shares * price;
    return { label: v.label, shares: v.shares, gross, net: Math.round(gross * 0.8), price: Math.round(price * 100) / 100 };
  });
}

function getTotalRemainingVesting(msftGrowth) {
  return getVestEvents(msftGrowth).reduce((sum, v) => sum + v.net, 0);
}

const fmt = (n) => {
  if (Math.abs(n) >= 1000) return (n < 0 ? "-" : "") + "$" + Math.abs(Math.round(n / 100) / 10).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "K";
  return "$" + Math.round(n).toLocaleString();
};

const fmtFull = (n) => (n < 0 ? "-" : "") + "$" + Math.abs(Math.round(n)).toLocaleString();

const Toggle = ({ label, checked, onChange, color = "#4ade80" }) => (
  <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "6px 0" }}>
    <div
      onClick={(e) => { e.preventDefault(); onChange(!checked); }}
      style={{
        width: 44, height: 24, borderRadius: 12, position: "relative",
        background: checked ? color : "#334155", transition: "background 0.2s",
        flexShrink: 0
      }}
    >
      <div style={{
        width: 20, height: 20, borderRadius: 10, background: "#fff",
        position: "absolute", top: 2, left: checked ? 22 : 2, transition: "left 0.2s",
        boxShadow: "0 1px 3px rgba(0,0,0,0.3)"
      }} />
    </div>
    <span style={{ fontSize: 14, color: "#e2e8f0", lineHeight: 1.3 }}>{label}</span>
  </label>
);

const Slider = ({ label, value, onChange, min, max, step = 1, format = fmtFull, color = "#60a5fa" }) => (
  <div style={{ padding: "4px 0" }}>
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
      <span style={{ fontSize: 13, color: "#94a3b8" }}>{label}</span>
      <span style={{ fontSize: 13, color, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>{format(value)}</span>
    </div>
    <input type="range" min={min} max={max} step={step} value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{ width: "100%", accentColor: color, height: 6 }} />
  </div>
);

const SGA_LIMIT = 1690;
const DAYS_PER_MONTH = 21.5;

function computeProjection(s) {
  const backPayGross = (s.ssdiBackPayMonths || 0) * (s.ssdiPersonal || 4152);
  const backPayFee = Math.min(Math.round(backPayGross * 0.25), 9200);
  const backPayActual = backPayGross - backPayFee;
  const ms = s.milestones || [];
  const trustNow = s.trustIncomeNow || 0;
  const trustFuture = s.trustIncomeFuture || 0;
  const trustMonth = s.trustIncreaseMonth || 11;
  const monthlyReturnRate = Math.pow(1 + (s.investmentReturn || 0) / 100, 1/12) - 1;

  // Single monthly loop — source of truth for everything
  const monthlyData = [];
  let balance = s.startingSavings || 0;

  for (let m = 0; m <= 72; m++) {
    const rate = Math.min(s.sarahRate * Math.pow(1 + s.sarahRateGrowth / 100, m / 12), s.sarahMaxRate);
    const clients = Math.min(s.sarahCurrentClients * Math.pow(1 + s.sarahClientGrowth / 100, m / 12), s.sarahMaxClients);
    const sarahIncome = Math.round(rate * clients * DAYS_PER_MONTH);
    const msftSmoothed = getVestingMonthly(m, s.msftGrowth || 0);
    const msftLump = getVestingLumpSum(m, s.msftGrowth || 0);
    const llcMonthly = Math.round(m < (s.llcDelayMonths || 24) ? s.llcAnnual / 12 : (s.llcImproves ? (s.llcAnnual * s.llcMultiplier) / 12 : s.llcAnnual / 12));
    const trust = m < trustMonth ? trustNow : trustFuture;
    let ssdi = 0;
    if (m >= s.ssdiApprovalMonth) {
      ssdi = m < s.ssdiApprovalMonth + s.kidsAgeOutMonths ? s.ssdiFamilyTotal : s.ssdiPersonal;
    }
    const consulting = m >= s.ssdiApprovalMonth ? Math.min(s.chadConsulting || 0, SGA_LIMIT) : 0;

    // Investment return on current balance (before this month's cash flow)
    const investReturn = balance > 0 ? Math.round(balance * monthlyReturnRate) : 0;

    // Expenses
    let expenses = s.baseExpenses;
    if (!s.retireDebt) expenses += s.debtService;
    if (!s.vanSold) expenses += (s.vanMonthlySavings || 0);
    if (s.lifestyleCutsApplied) expenses -= (s.lifestyleCuts || 0) + (s.cutInHalf || 0) + (s.extraCuts || 0);
    if (m < (s.bcsYearsLeft || 3) * 12) expenses += s.bcsFamilyMonthly;
    for (const mi of ms) { if (m >= mi.month) expenses -= mi.savings; }
    expenses = Math.max(expenses, 0); // floor at zero

    // Cash income (earned, not investment)
    const cashIncome = sarahIncome + msftSmoothed + llcMonthly + ssdi + consulting + trust;
    // For savings: use lump sum MSFT (realistic timing)
    const cashIncomeLump = sarahIncome + msftLump + llcMonthly + ssdi + consulting + trust;

    // Update balance: returns compound, then add cash flow with lump vesting
    balance += investReturn;
    balance += (cashIncomeLump - expenses);
    if (m === s.ssdiApprovalMonth + 2) balance += backPayActual;

    monthlyData.push({
      month: m,
      sarahIncome, msftSmoothed, msftLump, llcMonthly, ssdi, consulting, trust,
      investReturn, cashIncome, expenses,
      netCashFlow: cashIncome - expenses,
      netMonthly: cashIncome + investReturn - expenses,
      balance: Math.round(balance),
    });
  }

  // Aggregate to quarterly snapshots for charts (every 3rd month starting at 0)
  const data = MONTH_VALUES.map((m, i) => {
    // Sum 3 months of data for this quarter
    const months = monthlyData.filter(d => d.month >= m && d.month < m + 3);
    if (months.length === 0) return null;

    const first = months[0]; // Use first month for rate/client display
    const qtrInvestReturn = months.reduce((sum, d) => sum + d.investReturn, 0);
    const avgInvestReturn = Math.round(qtrInvestReturn / months.length);
    const avgCashIncome = Math.round(months.reduce((sum, d) => sum + d.cashIncome, 0) / months.length);
    const avgExpenses = Math.round(months.reduce((sum, d) => sum + d.expenses, 0) / months.length);
    const avgNetCash = Math.round(months.reduce((sum, d) => sum + d.netCashFlow, 0) / months.length);
    const avgNetMonthly = Math.round(months.reduce((sum, d) => sum + d.netMonthly, 0) / months.length);

    return {
      label: MONTHS[i], month: m,
      sarahIncome: first.sarahIncome,
      msftVesting: first.msftSmoothed,
      llcMonthly: first.llcMonthly,
      ssdi: first.ssdi,
      consulting: first.consulting,
      trust: first.trust,
      investReturn: avgInvestReturn,
      investReturnQtr: qtrInvestReturn,
      totalIncome: Math.round(avgCashIncome + avgInvestReturn),
      expenses: avgExpenses,
      netCashFlow: avgNetCash,
      netMonthly: avgNetMonthly,
    };
  }).filter(Boolean);

  // Savings data for the chart (monthly from the same loop)
  const savingsData = monthlyData.map(d => {
    const yr = Math.floor(d.month / 12);
    const mo = d.month % 12;
    const label = d.month === 0 ? "Now" : d.month < 12 ? `M${d.month}` : mo === 0 ? `Y${yr}` : `Y${yr}.${Math.round(mo/12*10)/10}`;
    return { month: d.month, balance: d.balance, label };
  });

  return { data, savingsData, backPayActual, monthlyData };
}

export default function FinancialModel() {
  const [sarahRate, setSarahRate] = useState(200);
  const [sarahMaxRate, setSarahMaxRate] = useState(250);
  const [sarahRateGrowth, setSarahRateGrowth] = useState(5); // % per year
  const [sarahCurrentClients, setSarahCurrentClients] = useState(3.75);
  const [sarahMaxClients, setSarahMaxClients] = useState(4.5);
  const [sarahClientGrowth, setSarahClientGrowth] = useState(10); // % per year
  const daysPerMonth = DAYS_PER_MONTH;
  const sarahCurrentNet = Math.round(sarahRate * sarahCurrentClients * daysPerMonth);
  const sarahCeiling = Math.round(sarahMaxRate * sarahMaxClients * daysPerMonth);
  const [llcAnnual, setLlcAnnual] = useState(10700);
  const [llcMultiplier, setLlcMultiplier] = useState(2.5);
  const [llcDelayMonths, setLlcDelayMonths] = useState(24);
  const [msftGrowth, setMsftGrowth] = useState(0); // annual % price growth above floor

  const vestEvents = useMemo(() => getVestEvents(msftGrowth), [msftGrowth]);
  const totalRemainingVesting = useMemo(() => getTotalRemainingVesting(msftGrowth), [msftGrowth]); // 1031 exchange timeline


  const [ssdiApprovalMonth, setSsdiApprovalMonth] = useState(7);
  const [ssdiPersonal, setSsdiPersonal] = useState(4152);
  const [ssdiFamilyTotal, setSsdiFamilyTotal] = useState(6500);
  const [kidsAgeOutMonths, setKidsAgeOutMonths] = useState(36);
  const [chadConsulting, setChadConsulting] = useState(0);
  const sgaLimit = SGA_LIMIT;

  const [baseExpenses, setBaseExpenses] = useState(42313); // $52,677 minus debt($6,434) minus van($2,597) minus BCS family share($1,333)
  const [debtService, setDebtService] = useState(6434);
  
  // BCS Tuition — 3 tiers
  const [bcsAnnualTotal, setBcsAnnualTotal] = useState(41000); // total annual tuition
  const [bcsParentsAnnual, setBcsParentsAnnual] = useState(25000); // 0 = none, 25000 = status quo, 41000 = full
  const [bcsYearsLeft, setBcsYearsLeft] = useState(3);

  // Spending cuts from budget plan
  const [lifestyleCutsApplied, setLifestyleCutsApplied] = useState(false);
  const [lifestyleCuts, setLifestyleCuts] = useState(6996); // Oliver, Bitcoin, gym, Chad PayPal, cloud
  const [cutInHalf, setCutInHalf] = useState(2995); // Medical, dining, AI/SaaS, internet, coffee, subs
  const [extraCuts, setExtraCuts] = useState(3000); // Groceries, shopping, Amazon, misc

  // Trust income
  const [trustIncomeNow, setTrustIncomeNow] = useState(833); // $10K/yr
  const [trustIncomeFuture, setTrustIncomeFuture] = useState(2083); // $25K/yr from Feb 2027
  const [trustIncreaseMonth, setTrustIncreaseMonth] = useState(11); // month 11 = Feb 2027

  // Van sale
  const [vanSold, setVanSold] = useState(true);
  const [vanMonthlySavings, setVanMonthlySavings] = useState(2597); // $1,914 loan + $683 ops

  const [milestones, setMilestones] = useState([
    { name: "Twins to college", month: 36, savings: 2000 },
  ]);

  const [retireDebt, setRetireDebt] = useState(false);
  const [llcImproves, setLlcImproves] = useState(false);

  // BCS computed
  const bcsFamilyMonthly = Math.round(Math.max(0, bcsAnnualTotal - bcsParentsAnnual) / 12);

  const [startingSavings, setStartingSavings] = useState(200000);
  const [investmentReturn, setInvestmentReturn] = useState(15);

  const [ssdiBackPayMonths, setSsdiBackPayMonths] = useState(18);

  const [moldCost, setMoldCost] = useState(60000);
  const [moldInclude, setMoldInclude] = useState(true);
  const [roofCost, setRoofCost] = useState(40000);
  const [roofInclude, setRoofInclude] = useState(true);
  const [otherProjects, setOtherProjects] = useState(40000);
  const [otherInclude, setOtherInclude] = useState(true);

  // Debt balances (Scenario C — everything except Firstmark)
  const [debtCC, setDebtCC] = useState(92760); // 10 credit card accounts
  const [debtPersonal, setDebtPersonal] = useState(57611); // Affirm + Lending Club + Afterpay
  const [debtIRS, setDebtIRS] = useState(17937); // IRS back taxes
  const [debtFirstmark, setDebtFirstmark] = useState(21470); // Student loan (NOT paid off)


  const [savingsTooltip, setSavingsTooltip] = useState(null); // { x, y, balance, month }
  const [msftTooltip, setMsftTooltip] = useState(null); // { pctX, pctY, value, label }
  const [incomeTooltip, setIncomeTooltip] = useState(null); // { pctX, data, label }
  const [savedScenarios, setSavedScenarios] = useState([]);
  const [scenarioName, setScenarioName] = useState("");
  const [showSaveLoad, setShowSaveLoad] = useState(false);
  const [presentMode, setPresentMode] = useState(false);
  const [dadMode, setDadMode] = useState(false);
  const [dadStep, setDadStep] = useState(1);
  const [dadDebtPct, setDadDebtPct] = useState(0);
  const [dadBcsParents, setDadBcsParents] = useState(25000);
  const [dadMold, setDadMold] = useState(false);
  const [dadRoof, setDadRoof] = useState(false);
  const [dadProjects, setDadProjects] = useState(false);
  const [dadMcResult, setDadMcResult] = useState(null);
  const [dadBaselineBalance, setDadBaselineBalance] = useState(null);
  const [compareState, setCompareState] = useState(null);
  const [compareName, setCompareName] = useState("");

  // Monte Carlo simulation
  const [mcResults, setMcResults] = useState(null);
  const [mcRunning, setMcRunning] = useState(false);
  const [mcNumSims, setMcNumSims] = useState(500);
  const [mcInvestVol, setMcInvestVol] = useState(12); // annual std dev of returns (%)
  const [mcBizGrowthVol, setMcBizGrowthVol] = useState(5); // std dev of Sarah's client growth rate
  const [mcMsftVol, setMcMsftVol] = useState(15); // std dev of MSFT price (%)
  const [mcSsdiDelay, setMcSsdiDelay] = useState(6); // max additional months delay
  const [mcCutsDiscipline, setMcCutsDiscipline] = useState(25); // std dev: % of cuts NOT achieved

  // Must be defined before projection useMemo
  const gatherState = () => ({
    sarahRate, sarahMaxRate, sarahRateGrowth, sarahCurrentClients, sarahMaxClients, sarahClientGrowth,
    llcAnnual, llcMultiplier, llcDelayMonths, msftGrowth,
    ssdiApprovalMonth, ssdiPersonal, ssdiFamilyTotal, kidsAgeOutMonths, chadConsulting,
    baseExpenses, debtService, bcsAnnualTotal, bcsParentsAnnual, bcsFamilyMonthly, bcsYearsLeft,
    lifestyleCutsApplied, lifestyleCuts, cutInHalf, extraCuts,
    trustIncomeNow, trustIncomeFuture, trustIncreaseMonth,
    vanSold, vanMonthlySavings,
    retireDebt, llcImproves,
    startingSavings, investmentReturn, ssdiBackPayMonths,
    moldCost, moldInclude, roofCost, roofInclude, otherProjects, otherInclude,
    debtCC, debtPersonal, debtIRS, debtFirstmark, milestones,
  });

  const projection = useMemo(() => computeProjection(gatherState()), [
    sarahRate, sarahMaxRate, sarahRateGrowth, sarahCurrentClients, sarahMaxClients, sarahClientGrowth,
    llcAnnual, llcMultiplier, llcDelayMonths, msftGrowth,
    ssdiApprovalMonth, ssdiPersonal, ssdiFamilyTotal, kidsAgeOutMonths, chadConsulting,
    baseExpenses, debtService, bcsAnnualTotal, bcsParentsAnnual, bcsYearsLeft, milestones,
    lifestyleCutsApplied, lifestyleCuts, cutInHalf, extraCuts,
    trustIncomeNow, trustIncomeFuture, trustIncreaseMonth,
    vanSold, vanMonthlySavings,
    retireDebt, llcImproves,
    startingSavings, investmentReturn, ssdiBackPayMonths,
    moldCost, moldInclude, roofCost, roofInclude, otherProjects, otherInclude,
    debtCC, debtPersonal, debtIRS, debtFirstmark
  ]);
  const data = projection.data;
  const savingsData = projection.savingsData;
  const monthlyDetail = projection.monthlyData;
  const ssdiBackPayActual = projection.backPayActual;
  const ssdiBackPayGross = ssdiBackPayMonths * ssdiPersonal;
  const ssdiAttorneyFee = Math.min(Math.round(ssdiBackPayGross * 0.25), 9200);

  const compareProjection = useMemo(() => {
    if (!compareState) return null;
    return computeProjection(compareState);
  }, [compareState]);

  const debtTotal = debtCC + debtPersonal + debtIRS; // Scenario C — excludes Firstmark (kept)
  const oneTimeTotal = (moldInclude ? moldCost : 0) + (roofInclude ? roofCost : 0) + (otherInclude ? otherProjects : 0);
  const bcsParentsMonthly = Math.round(bcsParentsAnnual / 12);
  const advanceNeeded = (retireDebt ? debtTotal : 0) + oneTimeTotal;

  const restoreState = (s) => {
    if (!s) return;
    if (s.sarahRate !== undefined) setSarahRate(s.sarahRate);
    if (s.sarahMaxRate !== undefined) setSarahMaxRate(s.sarahMaxRate);
    if (s.sarahRateGrowth !== undefined) setSarahRateGrowth(s.sarahRateGrowth);
    if (s.sarahCurrentClients !== undefined) setSarahCurrentClients(s.sarahCurrentClients);
    if (s.sarahMaxClients !== undefined) setSarahMaxClients(s.sarahMaxClients);
    if (s.sarahClientGrowth !== undefined) setSarahClientGrowth(s.sarahClientGrowth);
    if (s.llcAnnual !== undefined) setLlcAnnual(s.llcAnnual);
    if (s.llcMultiplier !== undefined) setLlcMultiplier(s.llcMultiplier);
    if (s.llcDelayMonths !== undefined) setLlcDelayMonths(s.llcDelayMonths);
    if (s.msftGrowth !== undefined) setMsftGrowth(s.msftGrowth);
    if (s.ssdiApprovalMonth !== undefined) setSsdiApprovalMonth(s.ssdiApprovalMonth);
    if (s.ssdiPersonal !== undefined) setSsdiPersonal(s.ssdiPersonal);
    if (s.ssdiFamilyTotal !== undefined) setSsdiFamilyTotal(s.ssdiFamilyTotal);
    if (s.kidsAgeOutMonths !== undefined) setKidsAgeOutMonths(s.kidsAgeOutMonths);
    if (s.chadConsulting !== undefined) setChadConsulting(s.chadConsulting);
    if (s.baseExpenses !== undefined) setBaseExpenses(s.baseExpenses);
    if (s.debtService !== undefined) setDebtService(s.debtService);
    if (s.bcsAnnualTotal !== undefined) setBcsAnnualTotal(s.bcsAnnualTotal);
    if (s.bcsParentsAnnual !== undefined) setBcsParentsAnnual(s.bcsParentsAnnual);
    if (s.bcsYearsLeft !== undefined) setBcsYearsLeft(s.bcsYearsLeft);
    if (s.lifestyleCutsApplied !== undefined) setLifestyleCutsApplied(s.lifestyleCutsApplied);
    if (s.lifestyleCuts !== undefined) setLifestyleCuts(s.lifestyleCuts);
    if (s.cutInHalf !== undefined) setCutInHalf(s.cutInHalf);
    if (s.extraCuts !== undefined) setExtraCuts(s.extraCuts);
    if (s.trustIncomeNow !== undefined) setTrustIncomeNow(s.trustIncomeNow);
    if (s.trustIncomeFuture !== undefined) setTrustIncomeFuture(s.trustIncomeFuture);
    if (s.trustIncreaseMonth !== undefined) setTrustIncreaseMonth(s.trustIncreaseMonth);
    if (s.vanSold !== undefined) setVanSold(s.vanSold);
    if (s.vanMonthlySavings !== undefined) setVanMonthlySavings(s.vanMonthlySavings);
    if (s.retireDebt !== undefined) setRetireDebt(s.retireDebt);
    if (s.llcImproves !== undefined) setLlcImproves(s.llcImproves);
    if (s.startingSavings !== undefined) setStartingSavings(s.startingSavings);
    if (s.investmentReturn !== undefined) setInvestmentReturn(s.investmentReturn);
    if (s.ssdiBackPayMonths !== undefined) setSsdiBackPayMonths(s.ssdiBackPayMonths);
    if (s.moldCost !== undefined) setMoldCost(s.moldCost);
    if (s.moldInclude !== undefined) setMoldInclude(s.moldInclude);
    if (s.roofCost !== undefined) setRoofCost(s.roofCost);
    if (s.roofInclude !== undefined) setRoofInclude(s.roofInclude);
    if (s.otherProjects !== undefined) setOtherProjects(s.otherProjects);
    if (s.otherInclude !== undefined) setOtherInclude(s.otherInclude);
    if (s.debtCC !== undefined) setDebtCC(s.debtCC);
    if (s.debtPersonal !== undefined) setDebtPersonal(s.debtPersonal);
    if (s.debtIRS !== undefined) setDebtIRS(s.debtIRS);
    if (s.debtFirstmark !== undefined) setDebtFirstmark(s.debtFirstmark);
    if (s.milestones !== undefined) setMilestones(s.milestones);
  };

  const [storageStatus, setStorageStatus] = useState("");
  const storageAvailable = typeof window !== "undefined" && window.storage && typeof window.storage.set === "function";

  useEffect(() => {
    if (!storageAvailable) {
      setStorageStatus("no-storage");
      return;
    }
    (async () => {
      try {
        const result = await window.storage.get("fin-scenarios");
        if (result && result.value) {
          const parsed = JSON.parse(result.value);
          if (Array.isArray(parsed)) {
            setSavedScenarios(parsed);
            setStorageStatus(`loaded-${parsed.length}`);
          }
        }
      } catch (e) {
        // Key doesn't exist yet — that's fine
        setStorageStatus("empty");
      }
    })();
  }, []);

  const saveScenario = async (name) => {
    if (!name.trim()) return;
    const state = gatherState();
    const entry = { name: name.trim(), state, savedAt: new Date().toISOString() };
    const updated = [...savedScenarios.filter(s => s.name !== name.trim()), entry];
    setSavedScenarios(updated);
    setScenarioName("");
    
    if (!storageAvailable) {
      setStorageStatus("no-storage");
      return;
    }
    try {
      const val = JSON.stringify(updated);
      const result = await window.storage.set("fin-scenarios", val);
      if (result) {
        setStorageStatus("saved");
        setTimeout(() => setStorageStatus(""), 3000);
      } else {
        setStorageStatus("set-returned-null");
      }
    } catch (e) {
      setStorageStatus("error: " + e.message);
    }
  };

  const deleteScenario = async (name) => {
    const updated = savedScenarios.filter(s => s.name !== name);
    setSavedScenarios(updated);
    if (storageAvailable) {
      try { await window.storage.set("fin-scenarios", JSON.stringify(updated)); } catch (e) { /* */ }
    }
  };

  // Monte Carlo simulation engine
  const runMonteCarlo = () => {
    setMcRunning(true);
    // Use setTimeout to let UI update with "running" state
    setTimeout(() => {
      const base = gatherState();
      const N = mcNumSims;
      const months = 72;

      // Box-Muller normal random
      const randNorm = (mean, std) => {
        const u1 = Math.random();
        const u2 = Math.random();
        return mean + std * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      };

      // Each sim produces a balance array of length months+1
      const allBalances = [];

      for (let sim = 0; sim < N; sim++) {
        // Randomize parameters for this simulation
        const simInvestReturn = Math.max(0, randNorm(base.investmentReturn, mcInvestVol));
        const simClientGrowth = Math.max(0, randNorm(base.sarahClientGrowth, mcBizGrowthVol));
        const simRateGrowth = Math.max(0, randNorm(base.sarahRateGrowth, mcBizGrowthVol * 0.5));
        const simMsftGrowth = randNorm(base.msftGrowth, mcMsftVol);
        const simSsdiDelay = Math.max(0, Math.round(Math.random() * mcSsdiDelay));
        const simSsdiApproval = base.ssdiApprovalMonth + simSsdiDelay;
        const simCutsPct = base.lifestyleCutsApplied
          ? Math.min(1, Math.max(0, randNorm(1, mcCutsDiscipline / 100)))
          : 0;

        const monthlyReturnRate = Math.pow(1 + simInvestReturn / 100, 1/12) - 1;
        const backPayGross = (base.ssdiBackPayMonths || 0) * (base.ssdiPersonal || 4152);
        const backPayFee = Math.min(Math.round(backPayGross * 0.25), 9200);
        const backPayActual = backPayGross - backPayFee;
        const trustNow = base.trustIncomeNow || 0;
        const trustFuture = base.trustIncomeFuture || 0;
        const trustMonth = base.trustIncreaseMonth || 11;

        let balance = base.startingSavings || 0;
        const balances = [balance];

        for (let m = 1; m <= months; m++) {
          const rate = Math.min(base.sarahRate * Math.pow(1 + simRateGrowth / 100, m / 12), base.sarahMaxRate);
          const clients = Math.min(base.sarahCurrentClients * Math.pow(1 + simClientGrowth / 100, m / 12), base.sarahMaxClients);
          const sarahIncome = rate * clients * DAYS_PER_MONTH;
          const msftLump = getVestingLumpSum(m, simMsftGrowth);
          const llcMonthly = m < (base.llcDelayMonths || 24) ? base.llcAnnual / 12 : (base.llcImproves ? (base.llcAnnual * base.llcMultiplier) / 12 : base.llcAnnual / 12);
          const trust = m < trustMonth ? trustNow : trustFuture;
          let ssdi = 0;
          if (m >= simSsdiApproval) {
            ssdi = m < simSsdiApproval + base.kidsAgeOutMonths ? base.ssdiFamilyTotal : base.ssdiPersonal;
          }
          const consulting = m >= simSsdiApproval ? Math.min(base.chadConsulting || 0, SGA_LIMIT) : 0;
          const investReturn = balance > 0 ? balance * monthlyReturnRate : 0;
          const cashIncome = sarahIncome + msftLump + llcMonthly + ssdi + consulting + trust;

          let expenses = base.baseExpenses;
          if (!base.retireDebt) expenses += base.debtService;
          if (!base.vanSold) expenses += (base.vanMonthlySavings || 0);
          // Apply randomized % of lifestyle cuts
          const totalCuts = (base.lifestyleCuts || 0) + (base.cutInHalf || 0) + (base.extraCuts || 0);
          expenses -= totalCuts * simCutsPct;
          if (m < (base.bcsYearsLeft || 3) * 12) expenses += base.bcsFamilyMonthly;
          for (const mi of (base.milestones || [])) { if (m >= mi.month) expenses -= mi.savings; }
          expenses = Math.max(expenses, 0);

          balance += investReturn;
          balance += (cashIncome - expenses);
          if (m === simSsdiApproval + 2) balance += backPayActual;
          balances.push(Math.round(balance));
        }
        allBalances.push(balances);
      }

      // Compute percentiles at each month
      const percentiles = [10, 25, 50, 75, 90];
      const bands = percentiles.map(p => {
        const series = [];
        for (let m = 0; m <= months; m++) {
          const vals = allBalances.map(b => b[m]).sort((a, b) => a - b);
          const idx = Math.floor(vals.length * p / 100);
          series.push(vals[Math.min(idx, vals.length - 1)]);
        }
        return { pct: p, series };
      });

      // Solvency = % of sims that never go below 0
      const solvent = allBalances.filter(b => b.every(v => v >= 0)).length;
      const solvencyRate = solvent / N;

      // Trough: median of each sim's minimum balance
      const troughs = allBalances.map(b => Math.min(...b)).sort((a, b) => a - b);
      const medianTrough = troughs[Math.floor(troughs.length / 2)];

      // Final balances
      const finals = allBalances.map(b => b[b.length - 1]).sort((a, b) => a - b);
      const medianFinal = finals[Math.floor(finals.length / 2)];
      const p10Final = finals[Math.floor(finals.length * 0.1)];
      const p90Final = finals[Math.floor(finals.length * 0.9)];

      setMcResults({
        bands, solvencyRate, medianTrough, medianFinal,
        p10Final, p90Final, numSims: N,
        // Store params used for display
        params: { investVol: mcInvestVol, bizGrowthVol: mcBizGrowthVol, msftVol: mcMsftVol, ssdiDelay: mcSsdiDelay, cutsDiscipline: mcCutsDiscipline }
      });
      setMcRunning(false);
    }, 50);
  };

  // Find when savings hit zero
  const savingsZeroMonth = savingsData.find(d => d.balance <= 0);
  const savingsZeroLabel = savingsZeroMonth ? `~${Math.round(savingsZeroMonth.month)} months` : "6+ years";

  // Dad Mode helpers
  const enterDadMode = () => {
    // Compute "without support" baseline — no debt help, no extra BCS, no cuts, van not sold
    const baseState = {
      ...gatherState(),
      retireDebt: false,
      debtService: debtService, // full debt service
      bcsParentsAnnual: 25000,
      bcsFamilyMonthly: Math.round(Math.max(0, bcsAnnualTotal - 25000) / 12),
      lifestyleCutsApplied: false,
      vanSold: false,
    };
    const baseline = computeProjection(baseState);
    setDadBaselineBalance(baseline.savingsData);
    setDadDebtPct(0);
    setDadBcsParents(25000);
    setDadMold(false);
    setDadRoof(false);
    setDadProjects(false);
    setDadStep(1);
    setDadMcResult(null);
    setDadMode(true);
  };

  // Compute dad's "with support" projection based on his slider choices
  const dadSupportState = useMemo(() => {
    if (!dadMode) return null;
    const s = {
      ...gatherState(),
      // What the family commits to (always on in dad mode)
      vanSold: true,
      lifestyleCutsApplied: true,
      // Debt: proportional — reduce debtService by the % paid off
      retireDebt: false, // we handle it via reduced debtService instead
      debtService: Math.round(debtService * (1 - dadDebtPct / 100)),
      // What dad controls
      bcsParentsAnnual: dadBcsParents,
      bcsFamilyMonthly: Math.round(Math.max(0, bcsAnnualTotal - dadBcsParents) / 12),
      moldInclude: dadMold,
      roofInclude: dadRoof,
      otherInclude: dadProjects,
    };
    return s;
  }, [dadMode, dadDebtPct, dadBcsParents, dadMold, dadRoof, dadProjects,
      sarahRate, sarahMaxRate, sarahRateGrowth, sarahCurrentClients, sarahMaxClients, sarahClientGrowth,
      llcAnnual, llcMultiplier, llcDelayMonths, msftGrowth, ssdiApprovalMonth, ssdiPersonal, ssdiFamilyTotal,
      kidsAgeOutMonths, chadConsulting, baseExpenses, debtService, bcsAnnualTotal, bcsYearsLeft,
      lifestyleCuts, cutInHalf, extraCuts, trustIncomeNow, trustIncomeFuture, trustIncreaseMonth,
      vanMonthlySavings, startingSavings, investmentReturn, ssdiBackPayMonths,
      moldCost, roofCost, otherProjects, debtCC, debtPersonal, debtIRS, milestones, bcsFamilyMonthly]);

  const dadProjection = useMemo(() => {
    if (!dadSupportState) return null;
    return computeProjection(dadSupportState);
  }, [dadSupportState]);

  // Fast MC for dad mode — seeded PRNG for smooth slider response
  const dadMcRun = useMemo(() => {
    if (!dadSupportState || dadStep < 3) return null;
    const base = dadSupportState;
    const N = 200;
    const months = 72;

    // Seeded PRNG (mulberry32) — same seed = same random paths
    // Only the deterministic parameters (debt, BCS, mold) change between runs
    const seed = 42;
    const mulberry32 = (s) => { return () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
    const rng = mulberry32(seed);

    // Pre-generate all random values for consistency
    const randNorm = (mean, std) => {
      const u1 = rng() || 0.001;
      const u2 = rng();
      return mean + std * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    };

    let solvent = 0;
    const finals = [];
    for (let sim = 0; sim < N; sim++) {
      const simInvestReturn = Math.max(0, randNorm(base.investmentReturn, 12));
      const simClientGrowth = Math.max(0, randNorm(base.sarahClientGrowth, 5));
      const simRateGrowth = Math.max(0, randNorm(base.sarahRateGrowth, 2.5));
      const simMsftGrowth = randNorm(base.msftGrowth, 15);
      const simSsdiDelay = Math.max(0, Math.round(rng() * 6));
      const simSsdiApproval = base.ssdiApprovalMonth + simSsdiDelay;
      const simCutsPct = Math.min(1, Math.max(0, randNorm(1, 0.25)));
      const mRR = Math.pow(1 + simInvestReturn / 100, 1/12) - 1;
      const bpg = (base.ssdiBackPayMonths || 0) * (base.ssdiPersonal || 4152);
      const bpa = bpg - Math.min(Math.round(bpg * 0.25), 9200);
      const tN = base.trustIncomeNow || 0; const tF = base.trustIncomeFuture || 0; const tM = base.trustIncreaseMonth || 11;
      let bal = base.startingSavings || 0; let everNeg = false;
      for (let m = 1; m <= months; m++) {
        const r = Math.min(base.sarahRate * Math.pow(1 + simRateGrowth / 100, m / 12), base.sarahMaxRate);
        const c = Math.min(base.sarahCurrentClients * Math.pow(1 + simClientGrowth / 100, m / 12), base.sarahMaxClients);
        const si = r * c * DAYS_PER_MONTH;
        const mv = getVestingLumpSum(m, simMsftGrowth);
        const ll = m < (base.llcDelayMonths || 24) ? base.llcAnnual / 12 : (base.llcImproves ? (base.llcAnnual * base.llcMultiplier) / 12 : base.llcAnnual / 12);
        const tr = m < tM ? tN : tF;
        let ssdi = 0;
        if (m >= simSsdiApproval) ssdi = m < simSsdiApproval + base.kidsAgeOutMonths ? base.ssdiFamilyTotal : base.ssdiPersonal;
        const co = m >= simSsdiApproval ? Math.min(base.chadConsulting || 0, SGA_LIMIT) : 0;
        const ir = bal > 0 ? bal * mRR : 0;
        const ci = si + mv + ll + ssdi + co + tr;
        let exp = base.baseExpenses;
        if (!base.retireDebt) exp += base.debtService;
        if (!base.vanSold) exp += (base.vanMonthlySavings || 0);
        const tc = (base.lifestyleCuts || 0) + (base.cutInHalf || 0) + (base.extraCuts || 0);
        if (base.lifestyleCutsApplied) exp -= tc * simCutsPct;
        if (m < (base.bcsYearsLeft || 3) * 12) exp += base.bcsFamilyMonthly;
        for (const mi of (base.milestones || [])) { if (m >= mi.month) exp -= mi.savings; }
        exp = Math.max(exp, 0);
        bal += ir + (ci - exp);
        if (m === simSsdiApproval + 2) bal += bpa;
        if (bal < 0) everNeg = true;
      }
      if (!everNeg) solvent++;
      finals.push(bal);
    }
    finals.sort((a, b) => a - b);
    return { solvency: solvent / N, medianFinal: finals[Math.floor(N / 2)], p10: finals[Math.floor(N * 0.1)] };
  }, [dadSupportState, dadStep]);

  const minNet = Math.min(...data.map(d => d.netMonthly));
  const maxNet = Math.max(...data.map(d => d.netMonthly));
  const maxVesting = Math.max(...data.map(d => d.msftVesting));
  const chartH = 380;
  // Bar scale only based on cash flow values, NOT vesting — vesting overlay has its own scale
  const netRange = Math.max(Math.abs(minNet), Math.abs(maxNet)) || 1;
  const yAxisPadding = 60;

  const breakevenIdx = data.findIndex(d => d.netMonthly >= 0);
  const bestIdx = data.reduce((bestI, d, i) => d.netMonthly > data[bestI].netMonthly ? i : bestI, 0);
  const highlightIdx = breakevenIdx >= 0 ? breakevenIdx : bestIdx;
  const highlightLabel = breakevenIdx >= 0 ? "BREAKEVEN" : "BEST";
  const breakevenLabel = breakevenIdx >= 0 ? data[breakevenIdx].label : `Best: ${fmt(data[bestIdx].netMonthly)} at ${data[bestIdx].label}`;

  return (
    <div style={{
      fontFamily: "'Inter', -apple-system, sans-serif",
      background: "#0f172a",
      color: "#e2e8f0",
      minHeight: "100vh",
      padding: "24px 16px"
    }}>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom: 28, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h1 style={{ fontSize: presentMode ? 28 : 22, fontWeight: 700, color: "#f8fafc", margin: 0, letterSpacing: "-0.02em" }}>
              Financial Planning Model
            </h1>
            <p style={{ fontSize: presentMode ? 15 : 13, color: "#64748b", margin: "4px 0 0" }}>
              {presentMode ? "Family financial sustainability plan — 5-year projection" : "Interactive scenario planner — adjust assumptions below"}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button
              onClick={() => setPresentMode(!presentMode)}
              style={{
                background: presentMode ? "#4ade80" : "transparent",
                border: `1px solid ${presentMode ? "#4ade80" : "#475569"}`, borderRadius: 8,
                color: presentMode ? "#0f172a" : "#94a3b8", fontSize: 12, padding: "8px 14px", cursor: "pointer",
                transition: "all 0.2s", fontFamily: "'Inter', sans-serif", whiteSpace: "nowrap",
                fontWeight: presentMode ? 700 : 400
              }}
            >
              {presentMode ? "✕ Exit Presentation" : "▶ Present"}
            </button>
            {!presentMode && <button
              onClick={enterDadMode}
              style={{
                background: "transparent", border: "1px solid #c084fc", borderRadius: 8,
                color: "#c084fc", fontSize: 12, padding: "8px 14px", cursor: "pointer",
                transition: "all 0.2s", fontFamily: "'Inter', sans-serif", whiteSpace: "nowrap"
              }}
            >
              👨‍👧 Dad Mode
            </button>}
            {!presentMode && <button
              onClick={() => setShowSaveLoad(!showSaveLoad)}
              style={{
                background: showSaveLoad ? "#1e293b" : "transparent", border: "1px solid #475569", borderRadius: 8,
                color: showSaveLoad ? "#60a5fa" : "#94a3b8", fontSize: 12, padding: "8px 14px", cursor: "pointer",
                transition: "all 0.2s", fontFamily: "'Inter', sans-serif", whiteSpace: "nowrap"
              }}
              onMouseEnter={(e) => { e.target.style.borderColor = "#60a5fa"; e.target.style.color = "#60a5fa"; }}
              onMouseLeave={(e) => { e.target.style.borderColor = "#475569"; e.target.style.color = showSaveLoad ? "#60a5fa" : "#94a3b8"; }}
            >
              {showSaveLoad ? "Hide Scenarios" : `Saved (${savedScenarios.length})`}
            </button>}
            {!presentMode && <button
            onClick={() => {
              setSarahRate(200); setSarahMaxRate(250); setSarahRateGrowth(5); setSarahCurrentClients(3.75); setSarahMaxClients(4.5); setSarahClientGrowth(10);
              setLlcAnnual(10700); setLlcMultiplier(2.5); setLlcDelayMonths(24); setMsftGrowth(0);
              setSsdiApprovalMonth(7); setSsdiPersonal(4152);
              setSsdiFamilyTotal(6500); setKidsAgeOutMonths(36); setChadConsulting(0);
              setBaseExpenses(42313); setDebtService(6434); setBcsAnnualTotal(41000); setBcsParentsAnnual(25000); setBcsYearsLeft(3);
              setLifestyleCutsApplied(false); setLifestyleCuts(6996); setCutInHalf(2995); setExtraCuts(3000);
              setTrustIncomeNow(833); setTrustIncomeFuture(2083); setTrustIncreaseMonth(11);
              setVanSold(true); setVanMonthlySavings(2597);
              setDebtCC(92760); setDebtPersonal(57611); setDebtIRS(17937); setDebtFirstmark(21470);
              setRetireDebt(false); setLlcImproves(false);
              setStartingSavings(200000); setInvestmentReturn(15);
              setSsdiBackPayMonths(18);
              setMoldCost(60000); setMoldInclude(true); setRoofCost(40000); setRoofInclude(true); setOtherProjects(40000); setOtherInclude(true);
              setMilestones([{name:"Twins to college",month:36,savings:2000}]);
            }}
            style={{
              background: "transparent", border: "1px solid #475569", borderRadius: 8,
              color: "#94a3b8", fontSize: 12, padding: "8px 14px", cursor: "pointer",
              transition: "all 0.2s", fontFamily: "'Inter', sans-serif", whiteSpace: "nowrap"
            }}
            onMouseEnter={(e) => { e.target.style.borderColor = "#f87171"; e.target.style.color = "#f87171"; }}
            onMouseLeave={(e) => { e.target.style.borderColor = "#475569"; e.target.style.color = "#94a3b8"; }}
          >
            ↺ Reset All
          </button>}
          </div>
        </div>

        {/* Save/Load Panel */}
        {!presentMode && showSaveLoad && (
          <div style={{
            background: "#1e293b", borderRadius: 12, padding: "16px 20px",
            border: "1px solid #60a5fa33", marginBottom: 24
          }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
              <input
                type="text"
                value={scenarioName}
                onChange={(e) => setScenarioName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveScenario(scenarioName)}
                placeholder="Name this scenario..."
                style={{
                  flex: 1, background: "#0f172a", border: "1px solid #334155", borderRadius: 6,
                  color: "#e2e8f0", padding: "8px 12px", fontSize: 13,
                  fontFamily: "'Inter', sans-serif", outline: "none"
                }}
              />
              <button
                onClick={() => saveScenario(scenarioName)}
                disabled={!scenarioName.trim()}
                style={{
                  background: scenarioName.trim() ? "#60a5fa" : "#334155", border: "none", borderRadius: 6,
                  color: scenarioName.trim() ? "#0f172a" : "#64748b", fontSize: 12, padding: "8px 16px",
                  cursor: scenarioName.trim() ? "pointer" : "not-allowed",
                  fontWeight: 700, fontFamily: "'Inter', sans-serif", whiteSpace: "nowrap",
                  transition: "all 0.2s"
                }}
              >
                Save Current
              </button>
              {storageStatus === "saved" && (
                <span style={{ fontSize: 11, color: "#4ade80", whiteSpace: "nowrap" }}>Saved!</span>
              )}
              {storageStatus === "no-storage" && (
                <span style={{ fontSize: 11, color: "#f87171", whiteSpace: "nowrap" }}>Storage unavailable</span>
              )}
              {storageStatus.startsWith("error") && (
                <span style={{ fontSize: 11, color: "#f87171", whiteSpace: "nowrap" }}>{storageStatus}</span>
              )}
              {storageStatus === "set-returned-null" && (
                <span style={{ fontSize: 11, color: "#f87171", whiteSpace: "nowrap" }}>Save failed (null)</span>
              )}
            </div>
            {savedScenarios.length === 0 ? (
              <div style={{ fontSize: 12, color: "#475569", fontStyle: "italic" }}>No saved scenarios yet. Adjust settings and save to compare later.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {savedScenarios.map((s, i) => (
                  <div key={i} style={{
                    padding: "8px 12px", background: "#0f172a", borderRadius: 6, border: "1px solid #334155"
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ fontSize: 13, color: "#e2e8f0", fontWeight: 600 }}>{s.name}</div>
                        <div style={{ fontSize: 10, color: "#475569" }}>
                          {new Date(s.savedAt).toLocaleDateString()} {new Date(s.savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                        <button onClick={() => { restoreState(s.state); setScenarioName(s.name); }}
                          style={{ background: "transparent", border: "1px solid #4ade80", borderRadius: 4, color: "#4ade80", fontSize: 11, padding: "4px 10px", cursor: "pointer", fontFamily: "'Inter', sans-serif" }}>
                          Load
                        </button>
                        <button onClick={() => saveScenario(s.name)}
                          style={{ background: "transparent", border: "1px solid #60a5fa", borderRadius: 4, color: "#60a5fa", fontSize: 11, padding: "4px 10px", cursor: "pointer", fontFamily: "'Inter', sans-serif" }}>
                          Update
                        </button>
                        <button onClick={() => { if (compareState && compareName === s.name) { setCompareState(null); setCompareName(""); } else { setCompareState(s.state); setCompareName(s.name); }}}
                          style={{ background: compareName === s.name ? "#fbbf2420" : "transparent", border: "1px solid #fbbf24", borderRadius: 4, color: "#fbbf24", fontSize: 11, padding: "4px 10px", cursor: "pointer", fontFamily: "'Inter', sans-serif" }}>
                          {compareName === s.name ? "Comparing" : "Compare"}
                        </button>
                        <button onClick={() => deleteScenario(s.name)}
                          style={{ background: "transparent", border: "1px solid #475569", borderRadius: 4, color: "#64748b", fontSize: 11, padding: "4px 8px", cursor: "pointer", fontFamily: "'Inter', sans-serif" }}>
                          ✕
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ marginTop: 8, fontSize: 10, color: "#334155" }}>
              Storage: {storageAvailable ? "available" : "unavailable"} | Status: {storageStatus || "idle"} | Scenarios in memory: {savedScenarios.length}
            </div>
          </div>
        )}

        {/* ============ DAD MODE ============ */}
        {dadMode && (() => {
          const familyCommitSavings = (vanSold ? vanMonthlySavings : 0) + (lifestyleCuts + cutInHalf + extraCuts);
          const currentGap = data[0].netCashFlow;
          const gapAfterCommit = currentGap + familyCommitSavings;
          const dadDebtAmount = Math.round(debtTotal * dadDebtPct / 100);
          const dadDebtMonthly = dadDebtPct > 0 ? Math.round(debtService * dadDebtPct / 100) : 0;
          const dadBcsFamilyMo = Math.round(Math.max(0, bcsAnnualTotal - dadBcsParents) / 12);
          const statusQuoBcsMo = Math.round(Math.max(0, bcsAnnualTotal - 25000) / 12);
          const dadBcsSavings = statusQuoBcsMo - dadBcsFamilyMo;
          const oneTime = dadDebtAmount + (dadMold ? moldCost : 0) + (dadRoof ? roofCost : 0) + (dadProjects ? otherProjects : 0);
          const ongoingAnnual = dadBcsParents > 25000 ? (dadBcsParents - 25000) : 0;

          // Interest cost: credit cards ~22% avg, personal loans ~18%, IRS ~8%
          const annualInterestBurned = Math.round(debtCC * 0.22 + debtPersonal * 0.18 + debtIRS * 0.08);
          const monthlyInterestBurned = Math.round(annualInterestBurned / 12);

          // Dad's solvency result
          const solv = dadMcRun;

          // Savings lines for chart
          const dadSavings = dadProjection?.savingsData || [];
          const baseSavings = dadBaselineBalance || [];

          // Chart computation
          const months = 72;
          const svgW = 700; const svgH = 200;
          const padL = 55; const padR = 80; const padT = 15; const padB = 25;
          const plotW = svgW - padL - padR;
          const plotH = svgH - padT - padB;
          // Lock Y-axis to baseline range so the green line visibly rises when dad helps
          const baseVals = baseSavings.map(d => d.balance);
          const dadVals = dadSavings.map(d => d.balance);
          const minB = Math.min(...baseVals, ...dadVals, -50000) * 1.1;
          // Max: always show at least baseline max, but grow if dad's projection exceeds it
          const maxB = Math.max(Math.max(...baseVals, 200000) * 1.5, ...dadVals) * 1.05;
          const chartRange = (maxB - minB) || 1;
          const xOf = (m) => padL + (m / months) * plotW;
          const yOf = (v) => padT + ((maxB - v) / chartRange) * plotH;

          const makePath = (data) => data.filter(d => d.month <= months).map((d, i) => `${i === 0 ? "M" : "L"} ${xOf(d.month).toFixed(1)},${yOf(d.balance).toFixed(1)}`).join(" ");
          const dadPath = makePath(dadSavings);
          const basePath = makePath(baseSavings);
          const dadFinal = dadSavings.find(d => d.month === months)?.balance || 0;
          const baseFinal = baseSavings.find(d => d.month === months)?.balance || 0;

          return (
            <div style={{ maxWidth: 800, margin: "0 auto" }}>
              {/* Exit */}
              <div style={{ textAlign: "right", marginBottom: 16 }}>
                <button onClick={() => setDadMode(false)} style={{
                  background: "transparent", border: "1px solid #475569", borderRadius: 6,
                  color: "#94a3b8", fontSize: 11, padding: "6px 12px", cursor: "pointer"
                }}>← Back to full model</button>
              </div>

              {/* ACT 1 */}
              {dadStep >= 1 && (
                <div style={{
                  background: "#1e293b", borderRadius: 12, padding: "32px 24px", marginBottom: 16,
                  border: "1px solid #334155", textAlign: "center"
                }}>
                  <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>
                    Chad & Sarah · 3 kids at home · Kirkland, WA
                  </div>
                  <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 16 }}>
                    Right now, our family spends more than we earn every month.
                  </div>
                  <div style={{
                    fontSize: 48, fontWeight: 700, color: "#f87171",
                    fontFamily: "'JetBrains Mono', monospace", marginBottom: 4
                  }}>
                    {fmtFull(currentGap)}<span style={{ fontSize: 20 }}>/mo</span>
                  </div>
                  <div style={{ fontSize: 12, color: "#64748b", marginBottom: 20 }}>monthly deficit</div>

                  {/* Income vs Expense bar */}
                  <div style={{ maxWidth: 500, margin: "0 auto 16px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>
                      <span>Income: {fmtFull(data[0].totalIncome - data[0].investReturn)}</span>
                      <span>Expenses: {fmtFull(data[0].expenses)}</span>
                    </div>
                    <div style={{ height: 20, borderRadius: 10, background: "#0f172a", overflow: "hidden", position: "relative" }}>
                      <div style={{
                        height: "100%", width: `${Math.min(100, ((data[0].totalIncome - data[0].investReturn) / data[0].expenses) * 100)}%`,
                        background: "linear-gradient(90deg, #4ade80, #22c55e)", borderRadius: 10
                      }} />
                      <div style={{
                        position: "absolute", right: 0, top: 0, bottom: 0,
                        width: `${100 - Math.min(100, ((data[0].totalIncome - data[0].investReturn) / data[0].expenses) * 100)}%`,
                        background: "#f8717133", borderRadius: "0 10px 10px 0"
                      }} />
                    </div>
                  </div>

                  {/* Where the money goes */}
                  {(() => {
                    const totalExp = data[0].expenses;
                    const cutsOn = lifestyleCutsApplied;
                    const buckets = [
                      { label: "Housing (mortgage, utilities, rent)", amount: 6075 + 1229 + 782, color: "#94a3b8" },
                      { label: "Debt payments (CC, loans, IRS)", amount: retireDebt ? 0 : debtService, color: "#f87171" },
                      { label: "Healthcare + insurance", amount: 3653, color: "#60a5fa" },
                      { label: "Family support (Oliver)", amount: cutsOn ? 0 : 3988, color: "#fb923c" },
                      { label: "Sarah's practice costs", amount: 1981 + (cutsOn ? 557 : 1114), color: "#38bdf8" },
                      { label: "Kids (school, sports, activities)", amount: bcsFamilyMonthly + 1033, color: "#c084fc" },
                      { label: "Van (loan + insurance)", amount: vanSold ? 0 : vanMonthlySavings, color: "#f59e0b" },
                      { label: "Bitcoin + trading tools", amount: cutsOn ? 0 : 2040, color: "#fbbf24" },
                      { label: "Food (groceries, dining, coffee)", amount: cutsOn ? 2104 : 2888, color: "#4ade80" },
                      { label: "Shopping + clothing", amount: cutsOn ? 700 : 1806, color: "#e879f9" },
                      { label: "Gym + fitness", amount: cutsOn ? 0 : 655, color: "#fb923c" },
                    ].filter(b => b.amount > 0);
                    const bucketTotal = buckets.reduce((s, b) => s + b.amount, 0);
                    const remainder = totalExp - bucketTotal;
                    if (remainder > 200) buckets.push({
                      label: "Everything else *",
                      amount: remainder, color: "#475569"
                    });

                    return (
                      <div style={{ maxWidth: 520, margin: "0 auto 16px", textAlign: "left" }}>
                        <div style={{ fontSize: 10, color: "#475569", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6, textAlign: "center" }}>
                          Where {fmtFull(totalExp)}/month goes
                        </div>
                        {/* Stacked horizontal bar */}
                        <div style={{ display: "flex", height: 14, borderRadius: 6, overflow: "hidden", marginBottom: 8 }}>
                          {buckets.map((b, i) => (
                            <div key={i} style={{
                              width: `${(b.amount / totalExp) * 100}%`,
                              background: b.color, opacity: 0.7,
                              borderRight: i < buckets.length - 1 ? "1px solid #0f172a" : "none"
                            }} />
                          ))}
                        </div>
                        {/* Legend in 2 columns */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 12px" }}>
                          {buckets.map((b, i) => (
                            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
                                <div style={{ width: 6, height: 6, borderRadius: 1, background: b.color, opacity: 0.7, flexShrink: 0 }} />
                                <span style={{ fontSize: 9, color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.label}</span>
                              </div>
                              <span style={{ fontSize: 9, color: "#e2e8f0", fontFamily: "'JetBrains Mono', monospace", flexShrink: 0, marginLeft: 4 }}>
                                {fmtFull(b.amount)}
                              </span>
                            </div>
                          ))}
                        </div>
                        {remainder > 200 && (
                          <div style={{ fontSize: 8, color: "#334155", marginTop: 4, textAlign: "center" }}>
                            * Auto, home, & life insurance · taxes · phone · transport · storage · subscriptions · household misc
                          </div>
                        )}
                        <div style={{ fontSize: 9, color: "#334155", textAlign: "center", marginTop: 4 }}>
                          Bellevue, WA · Family of 5 · 3 kids in school
                        </div>
                      </div>
                    );
                  })()}

                  <div style={{ fontSize: 12, color: "#64748b" }}>
                    Savings: {fmtFull(startingSavings)} — at this rate, gone in ~{savingsZeroMonth ? Math.round(savingsZeroMonth.month) : "60+"} months
                  </div>

                  {dadStep === 1 && (
                    <button onClick={() => setDadStep(2)} style={{
                      marginTop: 24, background: "#334155", border: "none", borderRadius: 8,
                      color: "#e2e8f0", fontSize: 14, padding: "12px 32px", cursor: "pointer", fontWeight: 600
                    }}>
                      Here's what we're already doing →
                    </button>
                  )}
                </div>
              )}

              {/* ACT 2 */}
              {dadStep >= 2 && (
                <div style={{
                  background: "#1e293b", borderRadius: 12, padding: "24px 24px", marginBottom: 16,
                  border: "1px solid #334155"
                }}>
                  <h3 style={{ fontSize: 15, color: "#f8fafc", margin: "0 0 4px", fontWeight: 700 }}>
                    What we've already committed to
                  </h3>
                  <p style={{ fontSize: 11, color: "#64748b", margin: "0 0 16px" }}>
                    These changes are happening regardless — this is what we control
                  </p>

                  {[
                    { label: "Selling the van", detail: `Frees ${fmtFull(vanMonthlySavings)}/month in loan + insurance`, value: vanMonthlySavings, icon: "🚐" },
                    { label: "Cutting lifestyle spending", detail: `Oliver's support, Bitcoin, gym, dining, subscriptions`, value: lifestyleCuts + cutInHalf + extraCuts, icon: "✂️" },
                    { label: "Sarah growing her practice", detail: `$200/hr × 3.75 → $${sarahMaxRate}/hr × ${sarahMaxClients} clients/day`, value: null, icon: "📈" },
                    { label: "SSDI approved (expected Oct '26)", detail: `${fmtFull(ssdiFamilyTotal)}/month + ${fmtFull(ssdiBackPayActual)} back pay`, value: ssdiFamilyTotal, icon: "🏥" },
                    ...(chadConsulting > 0 ? [{ label: "Chad consulting (under SGA)", detail: `${fmtFull(chadConsulting)}/month after SSDI`, value: chadConsulting, icon: "💻" }] : []),
                  ].map((item, i) => (
                    <div key={i} style={{
                      display: "flex", alignItems: "center", gap: 12, padding: "10px 12px",
                      background: "#0f172a", borderRadius: 8, marginBottom: 6,
                      border: "1px solid #334155"
                    }}>
                      <span style={{ fontSize: 20 }}>{item.icon}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, color: "#e2e8f0", fontWeight: 600 }}>{item.label}</div>
                        <div style={{ fontSize: 11, color: "#64748b" }}>{item.detail}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <span style={{ fontSize: 14, color: "#4ade80", fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
                          ✓ {item.value ? `+${fmtFull(item.value)}` : "Growing"}
                        </span>
                      </div>
                    </div>
                  ))}

                  <div style={{ textAlign: "center", marginTop: 16, fontSize: 13, color: "#94a3b8" }}>
                    Total self-help: <span style={{ color: "#4ade80", fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>+{fmtFull(familyCommitSavings)}/month</span> in expense reductions alone
                  </div>

                  <div style={{ textAlign: "center", marginTop: 8, fontSize: 13, color: "#94a3b8" }}>
                    But even with all of this, the gap persists — especially when MSFT vesting ends in 2028.
                  </div>

                  {dadStep === 2 && (
                    <div style={{ textAlign: "center" }}>
                      <button onClick={() => setDadStep(3)} style={{
                        marginTop: 16, background: "#c084fc", border: "none", borderRadius: 8,
                        color: "#0f172a", fontSize: 14, padding: "12px 32px", cursor: "pointer", fontWeight: 700
                      }}>
                        Here's where you can make the difference →
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* ACT 3 */}
              {dadStep >= 3 && (
                <div style={{
                  background: "#1e293b", borderRadius: 12, padding: "24px 24px", marginBottom: 16,
                  border: `1px solid ${solv && solv.solvency >= 0.9 ? "#4ade8033" : "#33415566"}`
                }}>
                  <h3 style={{ fontSize: 15, color: "#f8fafc", margin: "0 0 16px", fontWeight: 700 }}>
                    Your support changes everything
                  </h3>

                  {/* Dad's 3 levers */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
                    {/* Debt */}
                    <div style={{ background: "#0f172a", borderRadius: 8, padding: "14px 14px", border: "1px solid #1e293b" }}>
                      <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Debt Freedom</div>
                      <Slider label="Pay off debt" value={dadDebtPct} onChange={setDadDebtPct} min={0} max={100} step={5} format={(v) => v === 0 ? "None" : v === 100 ? `All (${fmtFull(debtTotal)})` : `${v}% (${fmtFull(Math.round(debtTotal * v / 100))})`} color="#4ade80" />
                      {dadDebtPct > 0 && (
                        <div style={{ fontSize: 11, marginTop: 6 }}>
                          <div style={{ color: "#4ade80" }}>Frees {fmtFull(dadDebtMonthly)}/month</div>
                          <div style={{ color: "#f87171", marginTop: 2 }}>
                            Currently burning {fmtFull(monthlyInterestBurned)}/mo in interest
                          </div>
                          <div style={{ color: "#fbbf24", fontSize: 10, marginTop: 2 }}>
                            Pays for itself in {Math.round(dadDebtAmount / (dadDebtMonthly + monthlyInterestBurned * (dadDebtPct / 100)))} months
                          </div>
                        </div>
                      )}
                    </div>

                    {/* BCS */}
                    <div style={{ background: "#0f172a", borderRadius: 8, padding: "14px 14px", border: "1px solid #1e293b" }}>
                      <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>School Tuition</div>
                      <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 6 }}>BCS — {bcsYearsLeft} years remaining</div>
                      <input type="range" min={0} max={bcsAnnualTotal} step={1000} value={dadBcsParents}
                        onChange={(e) => setDadBcsParents(Number(e.target.value))}
                        style={{ width: "100%", accentColor: "#c084fc", height: 6 }} />
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#475569", marginTop: 4 }}>
                        <span>$0</span><span>$25K</span><span>{fmtFull(bcsAnnualTotal)}</span>
                      </div>
                      <div style={{ fontSize: 12, color: "#c084fc", fontWeight: 600, marginTop: 6, fontFamily: "'JetBrains Mono', monospace" }}>
                        Your contribution: {fmtFull(dadBcsParents)}/yr
                      </div>
                      <div style={{ fontSize: 11, color: "#64748b" }}>
                        Our share: {dadBcsFamilyMo > 0 ? `${fmtFull(dadBcsFamilyMo)}/mo` : "Fully covered"}
                      </div>
                    </div>

                    {/* House */}
                    <div style={{ background: "#0f172a", borderRadius: 8, padding: "14px 14px", border: "1px solid #1e293b" }}>
                      <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Home Safety</div>
                      <Toggle label={`Mold remediation (${fmtFull(moldCost)})`} checked={dadMold} onChange={setDadMold} color="#fbbf24" />
                      <div style={{ fontSize: 10, color: "#475569", marginLeft: 54, marginTop: -4, marginBottom: 4 }}>Chad's health — MCAS triggered by mold</div>
                      <Toggle label={`Roof replacement (${fmtFull(roofCost)})`} checked={dadRoof} onChange={setDadRoof} color="#fbbf24" />
                      <Toggle label={`House projects (${fmtFull(otherProjects)})`} checked={dadProjects} onChange={setDadProjects} color="#fbbf24" />
                    </div>
                  </div>

                  {/* THE RESULT — live updating */}
                  <div style={{
                    background: "#0f172a", borderRadius: 10, padding: "20px 24px",
                    border: `1px solid ${solv && solv.solvency >= 0.9 ? "#4ade8033" : "#334155"}`,
                    textAlign: "center"
                  }}>
                    {/* Solvency gauge */}
                    {solv && (
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6 }}>
                          Probability your daughter's family stays solvent through 2033
                        </div>
                        <div style={{
                          fontSize: 56, fontWeight: 700,
                          color: solv.solvency >= 0.9 ? "#4ade80" : solv.solvency >= 0.7 ? "#fbbf24" : "#f87171",
                          fontFamily: "'JetBrains Mono', monospace",
                          lineHeight: 1
                        }}>
                          {(solv.solvency * 100).toFixed(0)}%
                        </div>
                        <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>
                          {solv.solvency >= 0.95 ? "Strong — plan is resilient to most setbacks" :
                           solv.solvency >= 0.80 ? "Good — some risk remains in adverse scenarios" :
                           solv.solvency >= 0.50 ? "Marginal — vulnerable to multiple setbacks" :
                           "High risk — significant chance of running out of savings"}
                        </div>
                      </div>
                    )}

                    {/* Savings trajectory chart */}
                    <svg viewBox={`0 0 ${svgW} ${svgH}`} style={{ width: "100%", height: "auto" }}>
                      {/* Zero line */}
                      {minB < 0 && <line x1={padL} x2={svgW - padR} y1={yOf(0)} y2={yOf(0)} stroke="#f8717133" strokeWidth="1" />}

                      {/* Year labels */}
                      {[0, 12, 24, 36, 48, 60, 72].map(m => (
                        <text key={m} x={xOf(m)} y={svgH - 4} textAnchor="middle" fill="#475569" fontSize="9" fontFamily="'JetBrains Mono', monospace">
                          {m === 0 ? "Now" : `Y${m/12}`}
                        </text>
                      ))}

                      {/* Without support line */}
                      <path d={basePath} fill="none" stroke="#f87171" strokeWidth="2" strokeDasharray="6,4" opacity="0.6" />

                      {/* With support line */}
                      <path d={dadPath} fill="none" stroke="#4ade80" strokeWidth="3" strokeLinejoin="round" />

                      {/* Endpoint labels */}
                      <text x={svgW - padR + 6} y={yOf(baseFinal)} fill="#f87171" fontSize="10" fontWeight="600" fontFamily="'JetBrains Mono', monospace" dominantBaseline="middle">
                        {fmt(baseFinal)}
                      </text>
                      <text x={svgW - padR + 6} y={yOf(baseFinal) + 12} fill="#f87171" fontSize="8" dominantBaseline="middle">
                        Without help
                      </text>
                      <text x={svgW - padR + 6} y={yOf(dadFinal)} fill="#4ade80" fontSize="10" fontWeight="700" fontFamily="'JetBrains Mono', monospace" dominantBaseline="middle">
                        {fmt(dadFinal)}
                      </text>
                      <text x={svgW - padR + 6} y={yOf(dadFinal) + 12} fill="#4ade80" fontSize="8" dominantBaseline="middle">
                        With your help
                      </text>
                    </svg>

                    <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 8, fontSize: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <div style={{ width: 16, height: 3, background: "#4ade80", borderRadius: 2 }} />
                        <span style={{ color: "#94a3b8" }}>With your support</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <div style={{ width: 16, height: 0, borderTop: "2px dashed #f87171" }} />
                        <span style={{ color: "#94a3b8" }}>Without support</span>
                      </div>
                    </div>
                  </div>

                  {/* The Ask Summary */}
                  <div style={{
                    marginTop: 16, padding: "16px 20px",
                    background: "#0f172a", borderRadius: 8, border: "1px solid #334155"
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                      <span style={{ fontSize: 13, color: "#94a3b8" }}>Your total support:</span>
                      <span style={{ fontSize: 22, fontWeight: 700, color: "#fbbf24", fontFamily: "'JetBrains Mono', monospace" }}>
                        {fmtFull(oneTime)}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.8 }}>
                      {dadDebtPct > 0 && <div>Debt payoff: <span style={{ color: "#e2e8f0" }}>{fmtFull(dadDebtAmount)}</span> — eliminates {fmtFull(dadDebtMonthly)}/mo in payments</div>}
                      {dadMold && <div>Mold remediation: <span style={{ color: "#e2e8f0" }}>{fmtFull(moldCost)}</span> — critical for Chad's health</div>}
                      {dadRoof && <div>Roof replacement: <span style={{ color: "#e2e8f0" }}>{fmtFull(roofCost)}</span></div>}
                      {dadProjects && <div>House projects: <span style={{ color: "#e2e8f0" }}>{fmtFull(otherProjects)}</span></div>}
                      {ongoingAnnual > 0 && <div>BCS tuition increase: <span style={{ color: "#c084fc" }}>+{fmtFull(ongoingAnnual)}/yr × {bcsYearsLeft} yrs</span> above current $25K</div>}
                      {oneTime === 0 && !ongoingAnnual && <div style={{ fontStyle: "italic" }}>Move the sliders above to explore options</div>}
                    </div>
                    {oneTime > 0 && (
                      <div style={{ marginTop: 8, fontSize: 11, color: "#475569", fontStyle: "italic" }}>
                        Every dollar goes to debt elimination or essential home safety. Current savings ($200K) remains untouched as the family emergency reserve.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* ============ MAIN MODEL (hidden during Dad Mode) ============ */}
        {!dadMode && <>

        {/* Key Metrics */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 24 }}>
          {[
            { label: "Current Monthly Gap", value: data[0].netMonthly, color: data[0].netMonthly >= 0 ? "#4ade80" : "#f87171" },
            { label: "Cash Flow Breakeven", value: breakevenLabel, isText: true, color: breakevenIdx >= 0 ? "#4ade80" : "#fbbf24", sublabel: "When income ≥ expenses", smallText: breakevenIdx < 0 },
            { label: "Savings Runway", value: savingsZeroLabel, isText: true, color: savingsZeroMonth ? "#f87171" : "#4ade80", sublabel: savingsZeroMonth ? "Until savings depleted" : "Savings survive 6+ yrs" },
            { label: "Advance Ask", value: advanceNeeded, color: "#fbbf24", isPositive: true },
            ...(mcResults ? [{ label: "MC Solvency", value: `${(mcResults.solvencyRate * 100).toFixed(1)}%`, isText: true, color: mcResults.solvencyRate >= 0.95 ? "#4ade80" : mcResults.solvencyRate >= 0.80 ? "#fbbf24" : "#f87171", sublabel: `${mcResults.numSims} simulations` }] : []),
          ].map((m, i) => (
            <div key={i} style={{
              background: "#1e293b", borderRadius: 10, padding: "14px 16px",
              border: "1px solid #334155"
            }}>
              <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{m.label}</div>
              <div style={{
                fontSize: m.smallText ? 15 : 22, fontWeight: 700, color: m.color,
                fontFamily: "'JetBrains Mono', monospace"
              }}>
                {m.isText ? m.value : (m.isPositive ? fmtFull(m.value) : fmtFull(m.value))}
              </div>
              {m.sublabel && (
                <div style={{ fontSize: 10, color: "#475569", marginTop: 2 }}>{m.sublabel}</div>
              )}
            </div>
          ))}
        </div>

        {/* Comparison Banner */}
        {compareState && (
          <div style={{
            background: "#fbbf2410", borderRadius: 12, padding: "12px 20px",
            border: "1px solid #fbbf2433", marginBottom: 16,
            display: "flex", justifyContent: "space-between", alignItems: "center"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 12, height: 3, background: "#fbbf24", borderRadius: 1 }} />
              <span style={{ fontSize: 13, color: "#fbbf24", fontWeight: 600 }}>
                Comparing current settings vs "{compareName}"
              </span>
              <span style={{ fontSize: 11, color: "#64748b" }}>
                — dashed line = "{compareName}", solid line = current
              </span>
            </div>
            <button
              onClick={() => { setCompareState(null); setCompareName(""); }}
              style={{
                background: "transparent", border: "1px solid #fbbf24", borderRadius: 4,
                color: "#fbbf24", fontSize: 11, padding: "4px 10px", cursor: "pointer",
                fontFamily: "'Inter', sans-serif"
              }}
            >
              Clear comparison
            </button>
          </div>
        )}

        {!presentMode && <>{/* MSFT Vesting Runway */}
        <div style={{
          background: "#1e293b", borderRadius: 12, padding: "16px 20px",
          border: "1px solid #f59e0b33", marginBottom: 24
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
            <h3 style={{ fontSize: 14, color: "#f59e0b", margin: 0, fontWeight: 700 }}>MSFT Vesting Runway — Actual Quarterly Payouts</h3>
            <span style={{ fontSize: 12, color: "#94a3b8" }}>Total remaining: <span style={{ color: "#f59e0b", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{fmtFull(totalRemainingVesting)}</span></span>
          </div>
          <div style={{ display: "flex", gap: 3, height: 80, alignItems: "flex-end" }}>
            {vestEvents.map((v, i) => {
              const maxNet = Math.max(...vestEvents.map(ve => ve.net));
              const barH = (v.net / maxNet) * 60;
              const isLow = v.net < 15000;
              const priceChanged = Math.abs(v.price - MSFT_FLOOR_PRICE) > 0.5;
              return (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                  <div style={{
                    fontSize: 9, color: isLow ? "#f87171" : "#f59e0b",
                    fontFamily: "'JetBrains Mono', monospace", whiteSpace: "nowrap", fontWeight: 600
                  }}>
                    {fmtFull(v.net)}
                  </div>
                  <div style={{
                    fontSize: 7, color: "#475569",
                    fontFamily: "'JetBrains Mono', monospace", whiteSpace: "nowrap", marginBottom: 1
                  }}>
                    {v.shares}sh
                  </div>
                  <div style={{
                    width: "85%", height: barH, borderRadius: "3px 3px 0 0",
                    background: isLow
                      ? "linear-gradient(180deg, #f87171, #dc2626)"
                      : "linear-gradient(180deg, #fbbf24, #f59e0b)",
                  }} />
                </div>
              );
            })}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 2 }}>
              <div style={{ fontSize: 9, color: "#475569", fontFamily: "'JetBrains Mono', monospace" }}>$0</div>
              <div style={{ width: "85%", height: 2, background: "#334155", borderRadius: 1 }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 3, marginTop: 4 }}>
            {vestEvents.map((v, i) => (
              <div key={i} style={{ flex: 1, textAlign: "center" }}>
                <div style={{ fontSize: 9, color: "#64748b" }}>{v.label}</div>
                <div style={{ fontSize: 7, color: v.price < MSFT_FLOOR_PRICE - 0.5 ? "#f87171" : v.price > MSFT_FLOOR_PRICE + 0.5 ? "#4ade80" : "#475569", fontFamily: "'JetBrains Mono', monospace" }}>
                  ${Math.round(v.price)}
                </div>
              </div>
            ))}
            <div style={{ flex: 1, textAlign: "center", fontSize: 9, color: "#ef4444", fontWeight: 700 }}>Done</div>
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: "#64748b", fontStyle: "italic" }}>
            Each bar = one quarterly vest (net after 20% tax). Nothing arrives between vests.
          </div>
          <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ flex: 1 }}>
              <Slider label="MSFT annual price growth" value={msftGrowth} onChange={setMsftGrowth}
                min={-30} max={30} format={(v) => (v >= 0 ? "+" : "") + v + "%"} color="#f59e0b" />
            </div>
            <div style={{ fontSize: 11, color: "#64748b", whiteSpace: "nowrap", textAlign: "right" }}>
              Floor: <span style={{ color: "#94a3b8", fontFamily: "'JetBrains Mono', monospace" }}>${MSFT_FLOOR_PRICE}</span>
              {msftGrowth !== 0 && (
                <> → Y5: <span style={{ color: "#f59e0b", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>${Math.round(getMsftPrice(60, msftGrowth))}</span></>
              )}
            </div>
          </div>
        </div>

        {/* Scenarios Strip */}
        <div style={{
          background: "#1e293b", borderRadius: 12, padding: "16px 20px",
          border: "1px solid #fbbf2433", marginBottom: 24,
          display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20
        }}>
          <div>
            <h3 style={{ fontSize: 13, color: "#fbbf24", margin: "0 0 10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Scenarios
            </h3>
            <Toggle label={`Retire all debt (${fmtFull(debtTotal)} → saves ${fmtFull(debtService)}/mo)`} checked={retireDebt} onChange={setRetireDebt} color="#4ade80" />
            <Toggle label={`Lifestyle + spending cuts (saves ${fmtFull(lifestyleCuts + cutInHalf + extraCuts)}/mo)`} checked={lifestyleCutsApplied} onChange={setLifestyleCutsApplied} color="#4ade80" />
            <Toggle label="LLC distributions improve (1031 exchange)" checked={llcImproves} onChange={setLlcImproves} color="#60a5fa" />
            <div style={{ margin: "8px 0 2px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: "#94a3b8" }}>BCS tuition — parents' contribution</span>
                <span style={{ fontSize: 11, color: "#c084fc", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
                  We owe {bcsFamilyMonthly > 0 ? fmtFull(bcsFamilyMonthly) + "/mo" : "$0/mo"}
                </span>
              </div>
              <div style={{ position: "relative", padding: "0 2px" }}>
                <input type="range" min={0} max={bcsAnnualTotal} step={1000} value={bcsParentsAnnual}
                  onChange={(e) => setBcsParentsAnnual(Number(e.target.value))}
                  style={{ width: "100%", accentColor: "#c084fc", cursor: "pointer" }} />
                {/* Tick marks */}
                <div style={{ position: "relative", height: 18, marginTop: -2 }}>
                  {[
                    { value: 0, label: "$0", sub: "We pay all" },
                    { value: 25000, label: "$25K", sub: "Status quo" },
                    { value: bcsAnnualTotal, label: fmtFull(bcsAnnualTotal), sub: "Fully covered" },
                  ].map(tick => {
                    const pct = (tick.value / bcsAnnualTotal) * 100;
                    const isActive = Math.abs(bcsParentsAnnual - tick.value) < 500;
                    return (
                      <div key={tick.value} style={{
                        position: "absolute", left: `${pct}%`, transform: "translateX(-50%)",
                        textAlign: "center", cursor: "pointer"
                      }} onClick={() => setBcsParentsAnnual(tick.value)}>
                        <div style={{ width: 2, height: 6, background: isActive ? "#c084fc" : "#475569", margin: "0 auto 2px" }} />
                        <div style={{ fontSize: 9, fontWeight: isActive ? 700 : 400, color: isActive ? "#c084fc" : "#64748b", whiteSpace: "nowrap" }}>
                          {tick.label}
                        </div>
                        <div style={{ fontSize: 8, color: isActive ? "#c084fc88" : "#47556988", whiteSpace: "nowrap" }}>
                          {tick.sub}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
          <div style={{ padding: "0 0 0 12px", borderLeft: "1px solid #334155" }}>
            <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Inheritance Advance Ask</div>
            <div style={{ fontSize: 12, color: "#e2e8f0", lineHeight: 1.7 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Debt retirement:</span>
                <span style={{ color: retireDebt ? "#4ade80" : "#475569", fontFamily: "'JetBrains Mono', monospace" }}>
                  {retireDebt ? fmtFull(debtTotal) : "\u2014"}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Mold remediation:</span>
                <span style={{ color: moldInclude ? "#fbbf24" : "#475569", fontFamily: "'JetBrains Mono', monospace" }}>
                  {moldInclude ? fmtFull(moldCost) : "\u2014"}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Roof:</span>
                <span style={{ color: roofInclude ? "#fbbf24" : "#475569", fontFamily: "'JetBrains Mono', monospace" }}>
                  {roofInclude ? fmtFull(roofCost) : "\u2014"}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>House projects + toilets:</span>
                <span style={{ color: otherInclude ? "#fbbf24" : "#475569", fontFamily: "'JetBrains Mono', monospace" }}>
                  {otherInclude ? fmtFull(otherProjects) : "\u2014"}
                </span>
              </div>
              {bcsParentsAnnual > 25000 && (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>BCS increase ({bcsYearsLeft} yrs):</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", color: "#c084fc" }}>{fmtFull((bcsParentsAnnual - 25000) * bcsYearsLeft)} add'l</span>
                </div>
              )}
              <div style={{ borderTop: "1px solid #334155", marginTop: 6, paddingTop: 6, display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
                <span>One-time advance:</span>
                <span style={{ color: "#fbbf24", fontFamily: "'JetBrains Mono', monospace", fontSize: 14 }}>{fmtFull(advanceNeeded)}</span>
              </div>
            </div>
          </div>
        </div>

        </>}
        {/* Bridge to Sustainability — Dual View */}
        {(() => {
          const months = 60;
          const svgW = 800;
          const svgH = 280;
          const padL = 60;
          const padR = 16;
          const padT = 30;
          const padB = 28;
          const plotW = svgW - padL - padR;
          const plotH = svgH - padT - padB;

          // Monthly net cash flow (including investment returns) for first 60 months
          const pts = monthlyDetail.filter(d => d.month <= months);

          // Find range
          const allNet = pts.map(p => Math.round(p.netMonthly));
          const maxNet = Math.max(...allNet, 1000) * 1.15;
          const minNet = Math.min(...allNet, -1000) * 1.15;
          const range = (maxNet - minNet) || 1;

          const xOf = (m) => padL + (m / months) * plotW;
          const yOf = (v) => padT + ((maxNet - v) / range) * plotH;
          const zeroY = yOf(0);

          // Build stepped line path (horizontal then vertical at each month)
          const steppedPath = pts.map((p, i) => {
            const x = xOf(p.month);
            const y = yOf(Math.round(p.netMonthly));
            if (i === 0) return `M ${x},${y}`;
            const prevX = xOf(pts[i-1].month);
            return `H ${x} V ${y}`;
          }).join(" ");

          // Area fill for positive (green) and negative (red) regions
          // Build separate area paths for above/below zero
          const posAreaPts = pts.map(p => ({ m: p.month, v: Math.max(0, Math.round(p.netMonthly)) }));
          const negAreaPts = pts.map(p => ({ m: p.month, v: Math.min(0, Math.round(p.netMonthly)) }));

          // Build event markers — labeled transitions on the line
          const events = [];
          // Debt retired (if toggled) — month 0
          if (retireDebt) events.push({ m: 0, label: "Debt retired", color: "#4ade80" });
          if (vanSold) events.push({ m: 0, label: "Van sold", color: "#4ade80" });
          if (lifestyleCutsApplied) events.push({ m: 0.5, label: "Cuts applied", color: "#4ade80" });

          // SSDI
          events.push({ m: ssdiApprovalMonth, label: `SSDI +${fmtFull(ssdiFamilyTotal)}`, color: "#4ade80" });

          // Trust increase
          if (trustIncomeFuture > trustIncomeNow) {
            events.push({ m: trustIncreaseMonth, label: `Trust +${fmtFull(trustIncomeFuture - trustIncomeNow)}`, color: "#a78bfa" });
          }

          // MSFT cliff
          events.push({ m: 18, label: "MSFT cliff", color: "#f59e0b" });
          events.push({ m: 30, label: "MSFT ends", color: "#f87171" });

          // Milestones
          for (const ms of milestones) {
            if (ms.savings > 0 && ms.month <= months) {
              events.push({ m: ms.month, label: ms.name, color: "#94a3b8" });
            }
          }

          // BCS ends
          if (bcsYearsLeft * 12 <= months) {
            events.push({ m: bcsYearsLeft * 12, label: "BCS ends", color: "#94a3b8" });
          }

          // Deduplicate — nudge events that are too close
          events.sort((a, b) => a.m - b.m);
          for (let i = 1; i < events.length; i++) {
            if (events[i].m <= events[i-1].m + 0.5) events[i].m = events[i-1].m + 1.5;
          }

          // Alternate event labels above/below the line
          events.forEach((ev, i) => { ev.above = i % 2 === 0; });

          // Find crossover month (first month net >= 0)
          const crossMonth = pts.find(p => Math.round(p.netMonthly) >= 0);

          // Final month net
          const finalNet = Math.round(pts[pts.length - 1]?.netMonthly || 0);

          // === MINI WATERFALL DATA ===
          const currentMsft = data[0].msftVesting;
          const baseIncome = sarahCurrentNet + currentMsft + Math.round(llcAnnual / 12) + trustIncomeNow;
          let currentExpenses = baseExpenses + bcsFamilyMonthly;
          if (!retireDebt) currentExpenses += debtService;
          if (!vanSold) currentExpenses += vanMonthlySavings;
          if (lifestyleCutsApplied) currentExpenses -= (lifestyleCuts + cutInHalf + extraCuts);
          currentExpenses = Math.max(currentExpenses, 0);
          const todayGap = baseIncome - currentExpenses;

          const wfSteps = [
            { name: "Today", value: todayGap, isStart: true },
          ];
          let running = todayGap;
          const monthlyReturn = startingSavings > 0 ? Math.round(startingSavings * (Math.pow(1 + investmentReturn / 100, 1/12) - 1)) : 0;
          const wfLevers = [
            ...(monthlyReturn > 0 ? [{ name: `Returns (${investmentReturn}%)`, value: monthlyReturn, color: "#22d3ee" }] : []),
            ...(retireDebt ? [{ name: "Retire debt", value: debtService, color: "#4ade80" }] : []),
            ...(vanSold ? [{ name: "Van sold", value: vanMonthlySavings, color: "#4ade80" }] : []),
            ...(lifestyleCutsApplied ? [{ name: "Spending cuts", value: lifestyleCuts + cutInHalf + extraCuts, color: "#4ade80" }] : []),
            { name: "SSDI", value: ssdiFamilyTotal, color: "#4ade80" },
            ...(chadConsulting > 0 ? [{ name: "Consulting", value: Math.min(chadConsulting, sgaLimit), color: "#38bdf8" }] : []),
          ];
          const sarahY3Rate = Math.min(sarahRate * Math.pow(1 + sarahRateGrowth / 100, 3), sarahMaxRate);
          const sarahY3Clients = Math.min(sarahCurrentClients * Math.pow(1 + sarahClientGrowth / 100, 3), sarahMaxClients);
          const sarahGrowth = Math.round(sarahY3Rate * sarahY3Clients * daysPerMonth) - sarahCurrentNet;
          if (sarahGrowth > 0) wfLevers.push({ name: "Sarah (Y3)", value: sarahGrowth, color: "#60a5fa" });
          if (trustIncomeFuture > trustIncomeNow) wfLevers.push({ name: "Trust ↑", value: trustIncomeFuture - trustIncomeNow, color: "#a78bfa" });

          const postCliffMsft = getVestingMonthly(18, msftGrowth);
          const cliffLoss = currentMsft - postCliffMsft;
          const endLoss = postCliffMsft;
          const wfNeg = [
            ...(cliffLoss > 0 ? [{ name: "MSFT cliff", value: -cliffLoss, color: "#f59e0b" }] : []),
            ...(endLoss > 0 ? [{ name: "MSFT ends", value: -endLoss, color: "#f87171" }] : []),
          ];

          for (const l of wfLevers) { running += l.value; wfSteps.push({ ...l, running }); }
          for (const l of wfNeg) { running += l.value; wfSteps.push({ ...l, running }); }
          wfSteps.push({ name: "Final", value: running, isEnd: true });

          const wfMax = Math.max(...wfSteps.map(s => s.running || s.value), 0) * 1.1;
          const wfMin = Math.min(...wfSteps.map(s => s.running || s.value), 0) * 1.1;
          const wfRange = (wfMax - wfMin) || 1;
          const wfH = 220;
          const wfTopPad = 24;
          const wfLabelH = 36;
          const wfPlotH = wfH - wfTopPad - wfLabelH;
          const wfToY = (v) => wfTopPad + ((wfMax - v) / wfRange) * wfPlotH;
          const wfZeroY = wfToY(0);

          return (
            <div style={{
              background: "#1e293b", borderRadius: 12, padding: "20px 16px",
              border: "1px solid #334155", marginBottom: 24
            }}>
              <h3 style={{ fontSize: 14, color: "#94a3b8", margin: "0 0 2px", fontWeight: 600 }}>Bridge to Sustainability</h3>
              <p style={{ fontSize: 11, color: "#475569", margin: "0 0 12px" }}>
                Monthly cash flow over time — does the plan reach breakeven before MSFT vesting ends?
                {crossMonth && <span style={{ color: "#4ade80", fontWeight: 600 }}> → Breakeven at month {crossMonth.month}</span>}
                {!crossMonth && <span style={{ color: "#f87171", fontWeight: 600 }}> → Not yet breakeven by month {months}</span>}
              </p>

              {/* STEPPED LINE CHART */}
              <svg viewBox={`0 0 ${svgW} ${svgH}`} style={{ width: "100%", height: "auto" }}>
                {/* Y-axis grid */}
                {(() => {
                  const step = range > 30000 ? 10000 : range > 15000 ? 5000 : 2500;
                  const ticks = [];
                  for (let v = Math.ceil(minNet / step) * step; v <= maxNet; v += step) {
                    ticks.push(v);
                  }
                  return ticks.map(v => (
                    <g key={v}>
                      <line x1={padL} x2={svgW - padR} y1={yOf(v)} y2={yOf(v)} stroke="#1e293b" strokeWidth="1" />
                      <text x={padL - 6} y={yOf(v) + 3} textAnchor="end" fill="#475569" fontSize="9" fontFamily="'JetBrains Mono', monospace">
                        {v >= 1000 || v <= -1000 ? `$${Math.round(v/1000)}K` : `$${v}`}
                      </text>
                    </g>
                  ));
                })()}

                {/* Zero line */}
                <line x1={padL} x2={svgW - padR} y1={zeroY} y2={zeroY} stroke="#475569" strokeWidth="1.5" />
                <text x={padL - 6} y={zeroY + 3} textAnchor="end" fill="#64748b" fontSize="9" fontWeight="700" fontFamily="'JetBrains Mono', monospace">$0</text>

                {/* X-axis labels */}
                {[0, 12, 24, 36, 48, 60].map(m => (
                  <text key={m} x={xOf(m)} y={svgH - 4} textAnchor="middle" fill="#475569" fontSize="9" fontFamily="'JetBrains Mono', monospace">
                    {m === 0 ? "Now" : `Y${m/12}`}
                  </text>
                ))}

                {/* Positive area fill (green) */}
                <clipPath id="bridgeAbove">
                  <rect x={padL} y={padT} width={plotW} height={zeroY - padT} />
                </clipPath>
                <path d={`${steppedPath} H ${xOf(months)} V ${zeroY} H ${xOf(0)} Z`}
                  fill="#4ade8015" clipPath="url(#bridgeAbove)" />

                {/* Negative area fill (red) */}
                <clipPath id="bridgeBelow">
                  <rect x={padL} y={zeroY} width={plotW} height={padT + plotH - zeroY} />
                </clipPath>
                <path d={`${steppedPath} H ${xOf(months)} V ${zeroY} H ${xOf(0)} Z`}
                  fill="#f8717115" clipPath="url(#bridgeBelow)" />

                {/* Stepped line */}
                <path d={steppedPath} fill="none" stroke="#e2e8f0" strokeWidth="2" strokeLinejoin="round" />

                {/* Event markers */}
                {events.map((ev, i) => {
                  const x = xOf(ev.m);
                  const pt = pts.find(p => p.month >= ev.m) || pts[0];
                  const lineY = yOf(Math.round(pt.netMonthly));
                  const labelAbove = ev.above;
                  const labelY = labelAbove ? Math.min(lineY - 8, zeroY - 20) : Math.max(lineY + 14, zeroY + 16);
                  return (
                    <g key={i}>
                      <line x1={x} x2={x} y1={padT} y2={padT + plotH} stroke={ev.color} strokeWidth="1" strokeDasharray="3,3" opacity="0.3" />
                      <circle cx={x} cy={lineY} r="3" fill={ev.color} stroke="#0f172a" strokeWidth="1" />
                      <text x={x} y={labelY} textAnchor="middle" fill={ev.color} fontSize="8" fontWeight="600" fontFamily="'JetBrains Mono', monospace">
                        {ev.label}
                      </text>
                    </g>
                  );
                })}

                {/* Crossover marker */}
                {crossMonth && (
                  <g>
                    <circle cx={xOf(crossMonth.month)} cy={zeroY} r="5" fill="none" stroke="#4ade80" strokeWidth="2" />
                    <text x={xOf(crossMonth.month)} y={zeroY - 10} textAnchor="middle" fill="#4ade80" fontSize="9" fontWeight="700" fontFamily="'JetBrains Mono', monospace">
                      Breakeven
                    </text>
                  </g>
                )}

                {/* Endpoint label */}
                <text x={xOf(months) + 4} y={yOf(finalNet)} fill={finalNet >= 0 ? "#4ade80" : "#f87171"} fontSize="10" fontWeight="700" fontFamily="'JetBrains Mono', monospace" dominantBaseline="middle">
                  {fmtFull(finalNet)}/mo
                </text>
              </svg>

              {/* MINI WATERFALL */}
              <div style={{ marginTop: 12, borderTop: "1px solid #334155", paddingTop: 12 }}>
                <div style={{ fontSize: 10, color: "#475569", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Lever summary — total monthly impact of each action
                </div>
                <div style={{ position: "relative", height: wfH }}>
                  <div style={{
                    position: "absolute", left: 0, right: 0, top: wfZeroY, height: 1,
                    background: "#475569", zIndex: 1
                  }} />
                  <div style={{ display: "flex", gap: 2, height: wfH - wfLabelH, paddingTop: wfTopPad }}>
                    {wfSteps.map((s, i) => {
                      const prev = i === 0 ? 0 : (s.isEnd ? 0 : wfSteps[i-1].running || wfSteps[i-1].value);
                      const curr = s.running || s.value;
                      let barTop, barBot;
                      if (s.isStart || s.isEnd) {
                        barTop = s.value >= 0 ? wfToY(s.value) : wfZeroY;
                        barBot = s.value >= 0 ? wfZeroY : wfToY(s.value);
                      } else {
                        barTop = wfToY(Math.max(prev, curr));
                        barBot = wfToY(Math.min(prev, curr));
                      }
                      const barH = Math.max(barBot - barTop, 2);
                      let barColor;
                      if (s.isStart) barColor = s.value >= 0 ? "#4ade80" : "#f87171";
                      else if (s.isEnd) barColor = curr >= 0 ? "#4ade80" : "#f87171";
                      else barColor = s.color || "#4ade80";

                      return (
                        <div key={i} style={{ flex: 1, position: "relative", height: "100%" }}>
                          <div style={{
                            position: "absolute", top: barTop - wfTopPad, height: barH,
                            left: "8%", right: "8%",
                            background: barColor, opacity: (s.isStart || s.isEnd) ? 0.9 : 0.65,
                            borderRadius: 2,
                            border: (s.isStart || s.isEnd) ? "1px solid rgba(255,255,255,0.15)" : "none",
                            zIndex: 2
                          }} />
                          <div style={{
                            position: "absolute",
                            top: (s.value < 0 && !s.isStart && !s.isEnd) ? barBot - wfTopPad + 2 : barTop - wfTopPad - 16,
                            left: 0, right: 0, textAlign: "center",
                            fontSize: 10, fontWeight: 700, color: barColor,
                            fontFamily: "'JetBrains Mono', monospace",
                            whiteSpace: "nowrap", zIndex: 3
                          }}>
                            {(s.isStart || s.isEnd) ? fmtFull(s.value) : ((s.value >= 0 ? "+" : "") + fmtFull(s.value))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ display: "flex", gap: 2, height: wfLabelH, alignItems: "flex-start", paddingTop: 4 }}>
                    {wfSteps.map((s, i) => (
                      <div key={i} style={{
                        flex: 1, textAlign: "center", fontSize: 9,
                        color: (s.isStart || s.isEnd) ? "#e2e8f0" : (s.value < 0 ? s.color : "#94a3b8"),
                        fontWeight: (s.isStart || s.isEnd) ? 700 : 400,
                        lineHeight: 1.3, whiteSpace: "pre-line"
                      }}>
                        {s.name}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Savings Drawdown Chart */}
        <div style={{
          background: "#1e293b", borderRadius: 12, padding: "20px 16px",
          border: savingsZeroMonth ? "1px solid #f8717133" : "1px solid #334155", marginBottom: 24
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
            <h3 style={{ fontSize: 14, color: savingsZeroMonth ? "#f87171" : "#4ade80", margin: 0, fontWeight: 600 }}>
              Savings Balance Over Time
            </h3>
            {savingsZeroMonth && (
              <span style={{ fontSize: 12, color: "#f87171", fontWeight: 600 }}>Depleted: {savingsZeroLabel}</span>
            )}
          </div>

          {/* Key numbers strip */}
          <div style={{
            display: "flex", gap: 2, marginBottom: 16, flexWrap: "wrap"
          }}>
            {(() => {
              const annualReturn = Math.round(startingSavings * (Math.pow(1 + investmentReturn / 100, 1) - 1));
              return [
                { label: "Starting Savings", value: fmtFull(startingSavings), color: "#e2e8f0" },
                { label: "Monthly Income (incl. returns)", value: fmtFull(data[0].totalIncome), color: "#4ade80" },
                { label: "Monthly Expenses", value: fmtFull(data[0].expenses), color: "#f87171" },
                { label: "Monthly Net", value: (data[0].netMonthly >= 0 ? "+" : "") + fmtFull(data[0].netMonthly), color: data[0].netMonthly >= 0 ? "#4ade80" : "#f87171" },
                { label: `Annual Return (${investmentReturn}% on savings)`, value: fmtFull(annualReturn) + "/yr", sub: `${fmtFull(data[0].investReturnQtr)}/qtr · ${fmtFull(data[0].investReturn)}/mo`, color: "#22d3ee" },
              ];
            })().map((item, i) => (
              <div key={i} style={{
                flex: 1, minWidth: 100,
                background: "#0f172a", borderRadius: 6, padding: "6px 10px",
                border: "1px solid #1e293b"
              }}>
                <div style={{ fontSize: 9, color: "#64748b", marginBottom: 2 }}>{item.label}</div>
                <div style={{
                  fontSize: 14, fontWeight: 700, color: item.color,
                  fontFamily: "'JetBrains Mono', monospace"
                }}>
                  {item.value}
                </div>
                {item.sub && (
                  <div style={{ fontSize: 9, color: "#475569", marginTop: 1, fontFamily: "'JetBrains Mono', monospace" }}>
                    {item.sub}
                  </div>
                )}
              </div>
            ))}
          </div>
          {(() => {
            const svgH = 200;
            const svgW = 800;
            const padL = 60;
            const padR = 20;
            const padT = 20;
            const padB = 30;
            const plotW = svgW - padL - padR;
            const plotH = svgH - padT - padB;
            
            const compSavings = compareProjection ? compareProjection.savingsData : null;
            const dataMax = Math.max(startingSavings, ...savingsData.map(d => d.balance), ...(compSavings || []).map(d => d.balance));
            const dataMin = Math.min(0, ...savingsData.map(d => d.balance), ...(compSavings || []).map(d => d.balance));
            // Lock range to at least -startingSavings to startingSavings*1.5 so small changes don't rescale
            const maxBal = Math.max(dataMax, startingSavings * 1.5);
            const minBal = Math.min(dataMin, -startingSavings);
            const range = maxBal - minBal || 1;
            
            const x = (m) => padL + (m / 72) * plotW;
            const y = (b) => padT + (1 - (b - minBal) / range) * plotH;
            
            // Build SVG path
            const pathPoints = savingsData.map(d => `${x(d.month)},${y(d.balance)}`);
            const linePath = `M ${pathPoints.join(" L ")}`;
            
            // Area fill path (down to zero line or bottom)
            const zeroY = y(0);
            const areaPath = `M ${x(savingsData[0].month)},${zeroY} L ${pathPoints.join(" L ")} L ${x(savingsData[savingsData.length-1].month)},${zeroY} Z`;
            
            // Y-axis ticks
            const yTicks = [];
            const tickStep = range < 300000 ? 50000 : 100000;
            for (let v = Math.floor(minBal / tickStep) * tickStep; v <= maxBal; v += tickStep) {
              yTicks.push(v);
            }
            
            return (
              <div style={{ position: "relative" }}
                onMouseLeave={() => setSavingsTooltip(null)}>
              <svg viewBox={`0 0 ${svgW} ${svgH}`} style={{ width: "100%", height: "auto", display: "block" }}
                onMouseMove={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const mouseX = (e.clientX - rect.left) / rect.width * svgW;
                  let closest = savingsData[0];
                  let closestDist = Infinity;
                  for (const d of savingsData) {
                    const dist = Math.abs(x(d.month) - mouseX);
                    if (dist < closestDist) { closestDist = dist; closest = d; }
                  }
                  const pctX = (x(closest.month) / svgW) * 100;
                  const pctY = (y(closest.balance) / svgH) * 100;
                  setSavingsTooltip({ pctX, pctY, balance: closest.balance, month: closest.month });
                }}>
                {/* Clip regions for above/below zero */}
                <defs>
                  <clipPath id="savAboveZero">
                    <rect x={padL} y={padT} width={plotW} height={zeroY - padT} />
                  </clipPath>
                  <clipPath id="savBelowZero">
                    <rect x={padL} y={zeroY} width={plotW} height={padT + plotH - zeroY} />
                  </clipPath>
                  <linearGradient id="savingsGradGreen" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4ade80" />
                    <stop offset="100%" stopColor="transparent" />
                  </linearGradient>
                  <linearGradient id="savingsGradRed" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="transparent" />
                    <stop offset="100%" stopColor="#f87171" />
                  </linearGradient>
                </defs>

                {/* Grid lines and Y labels */}
                {yTicks.map((v, i) => (
                  <g key={i}>
                    <line x1={padL} x2={svgW - padR} y1={y(v)} y2={y(v)}
                      stroke={v === 0 ? "#475569" : "#1e293b"} strokeWidth={v === 0 ? 1.5 : 0.5} />
                    <text x={padL - 6} y={y(v) + 3} textAnchor="end"
                      fill="#64748b" fontSize="10" fontFamily="'JetBrains Mono', monospace">
                      {fmt(v)}
                    </text>
                  </g>
                ))}
                
                {/* Area fills — green above zero, red below */}
                <path d={areaPath} fill="url(#savingsGradGreen)" opacity="0.25" clipPath="url(#savAboveZero)" />
                <path d={areaPath} fill="url(#savingsGradRed)" opacity="0.25" clipPath="url(#savBelowZero)" />
                
                {/* Line — green above zero */}
                <path d={linePath} fill="none" stroke="#4ade80" strokeWidth="2.5"
                  strokeLinejoin="round" strokeLinecap="round" clipPath="url(#savAboveZero)" />
                {/* Line — red below zero */}
                <path d={linePath} fill="none" stroke="#f87171" strokeWidth="2.5"
                  strokeLinejoin="round" strokeLinecap="round" clipPath="url(#savBelowZero)" />

                {/* Comparison line overlay */}
                {compSavings && (() => {
                  const compPoints = compSavings.map(d => `${x(d.month)},${y(d.balance)}`);
                  const compLinePath = `M ${compPoints.join(" L ")}`;
                  const compZeroMonth = compSavings.find(d => d.balance <= 0);
                  const compEnd = compSavings[compSavings.length - 1];
                  return (
                    <>
                      <path d={compLinePath} fill="none" stroke="#fbbf24" strokeWidth="2"
                        strokeLinejoin="round" strokeLinecap="round" strokeDasharray="8,4" opacity="0.8" />
                      {compZeroMonth && (
                        <>
                          <line x1={x(compZeroMonth.month)} x2={x(compZeroMonth.month)}
                            y1={padT} y2={padT + plotH}
                            stroke="#fbbf24" strokeWidth="1" strokeDasharray="3,3" opacity="0.5" />
                        </>
                      )}
                      {/* Comparison end-of-line label */}
                      <circle cx={x(compEnd.month)} cy={y(compEnd.balance)} r="3" fill="#fbbf24" />
                      <text x={x(compEnd.month) - 6} y={y(compEnd.balance) - 8} textAnchor="end"
                        fill="#fbbf24" fontSize="10" fontWeight="600" fontFamily="'JetBrains Mono', monospace">
                        {compareName}
                      </text>
                    </>
                  );
                })()}

                {/* Current line end-of-line label */}
                {(() => {
                  const curEnd = savingsData[savingsData.length - 1];
                  const curColor = curEnd.balance >= 0 ? "#4ade80" : "#f87171";
                  return compSavings ? (
                    <>
                      <circle cx={x(curEnd.month)} cy={y(curEnd.balance)} r="3" fill={curColor} />
                      <text x={x(curEnd.month) - 6} y={y(curEnd.balance) + 14} textAnchor="end"
                        fill={curColor} fontSize="10" fontWeight="600" fontFamily="'JetBrains Mono', monospace">
                        Current
                      </text>
                    </>
                  ) : null;
                })()}
                
                {/* Hover highlight dot */}
                {savingsTooltip && (
                  <circle cx={x(savingsTooltip.month)} cy={y(savingsTooltip.balance)} r="5"
                    fill={savingsTooltip.balance >= 0 ? "#4ade80" : "#f87171"}
                    stroke="#f8fafc" strokeWidth="2" />
                )}
                
                {/* X-axis labels */}
                {savingsData.filter(d => d.month % 12 === 0).map((d, i) => (
                  <text key={i} x={x(d.month)} y={svgH - 5} textAnchor="middle"
                    fill="#64748b" fontSize="10" fontFamily="'JetBrains Mono', monospace">
                    {d.month === 0 ? "Now" : `Y${d.month / 12}`}
                  </text>
                ))}
                
                {/* Zero crossing marker */}
                {savingsZeroMonth && (
                  <g>
                    <line x1={x(savingsZeroMonth.month)} x2={x(savingsZeroMonth.month)}
                      y1={padT} y2={padT + plotH}
                      stroke="#f87171" strokeWidth="1" strokeDasharray="4,3" />
                    <text x={x(savingsZeroMonth.month)} y={padT - 14} textAnchor="middle"
                      fill="#f87171" fontSize="10" fontWeight="700"
                      fontFamily="'JetBrains Mono', monospace">
                      Savings
                    </text>
                    <text x={x(savingsZeroMonth.month)} y={padT - 4} textAnchor="middle"
                      fill="#f87171" fontSize="10" fontWeight="700"
                      fontFamily="'JetBrains Mono', monospace">
                      Exhausted
                    </text>
                  </g>
                )}

                {/* SSDI back pay arrival marker */}
                {ssdiBackPayActual > 0 && (ssdiApprovalMonth + 2) <= 72 && (
                  <g>
                    <line x1={x(ssdiApprovalMonth + 2)} x2={x(ssdiApprovalMonth + 2)}
                      y1={padT} y2={padT + plotH}
                      stroke="#4ade80" strokeWidth="1" strokeDasharray="4,3" />
                    <text x={x(ssdiApprovalMonth + 2)} y={padT + plotH + 14} textAnchor="middle"
                      fill="#4ade80" fontSize="9" fontWeight="700"
                      fontFamily="'JetBrains Mono', monospace">
                      Back pay +{fmtFull(ssdiBackPayActual)}
                    </text>
                  </g>
                )}
                
              </svg>

              {/* Tooltip */}
              {savingsTooltip && (
                <div style={{
                  position: "absolute",
                  left: `${savingsTooltip.pctX}%`,
                  top: `${savingsTooltip.pctY}%`,
                  transform: "translate(-50%, -120%)",
                  background: "#0f172a",
                  border: `1px solid ${savingsTooltip.balance >= 0 ? "#4ade80" : "#f87171"}`,
                  borderRadius: 6,
                  padding: "6px 10px",
                  pointerEvents: "none",
                  zIndex: 10,
                  whiteSpace: "nowrap",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.5)"
                }}>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 2 }}>
                    Month {savingsTooltip.month} ({savingsTooltip.month < 12 ? `${savingsTooltip.month}mo` : `Y${(savingsTooltip.month / 12).toFixed(1)}`})
                  </div>
                  <div style={{
                    fontSize: 14, fontWeight: 700,
                    color: savingsTooltip.balance >= 0 ? "#4ade80" : "#f87171",
                    fontFamily: "'JetBrains Mono', monospace"
                  }}>
                    {fmtFull(savingsTooltip.balance)}
                  </div>
                </div>
              )}
              </div>
            );
          })()}
          {!presentMode && <>
          <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Slider label="Starting savings" value={startingSavings} onChange={setStartingSavings}
              min={50000} max={500000} step={10000} color="#60a5fa" />
            <Slider label="Investment return (annual)" value={investmentReturn} onChange={setInvestmentReturn}
              min={0} max={50} format={(v) => v + "%"} color="#60a5fa" />
          </div>
          <div style={{ marginTop: 4, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Slider label="Base living expenses/mo" value={baseExpenses} onChange={setBaseExpenses} min={25000} max={55000} step={500} color="#f87171" />
            <Slider label="Debt service/mo (freed if retired)" value={debtService} onChange={setDebtService} min={3000} max={12000} step={100} color={retireDebt ? "#334155" : "#f87171"} />
          </div>
          <div style={{ marginTop: 4, display: "flex", justifyContent: "space-between", fontSize: 11, padding: "0 2px" }}>
            <span style={{ color: "#64748b" }}>
              Total outflow: <span style={{ color: "#f87171", fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>{fmtFull(data[0].expenses)}/mo</span>
            </span>
            <span style={{ color: "#64748b" }}>
              Investment returns ({investmentReturn}%): <span style={{ color: "#22d3ee", fontFamily: "'JetBrains Mono', monospace" }}>{fmtFull(Math.round(startingSavings * (Math.pow(1 + investmentReturn / 100, 1) - 1)))}/yr</span> on initial savings
            </span>
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: "#64748b", fontStyle: "italic", lineHeight: 1.5 }}>
            Investment returns compound monthly while balance is positive — but only matter when the monthly deficit is small. At a {fmtFull(Math.abs(data[0].netCashFlow))}/mo burn rate, savings drain before returns can compound meaningfully. Toggle debt retirement and spending cuts to shrink the deficit — that's when returns become a powerful lever.
          </div>
          </>}
          {compareState && (
            <div style={{ marginTop: 6, display: "flex", gap: 16, fontSize: 11, alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 20, height: 3, background: "#4ade80", borderRadius: 1 }} />
                <span style={{ color: "#94a3b8" }}>Current settings</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 20, height: 0, borderTop: "2px dashed #fbbf24" }} />
                <span style={{ color: "#fbbf24" }}>"{compareName}"</span>
              </div>
            </div>
          )}
        </div>

        {/* Monte Carlo Simulation */}
        {!presentMode && (
        <div style={{
          background: "#1e293b", borderRadius: 12, padding: "20px 16px",
          border: "1px solid #334155", marginBottom: 24
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div>
              <h3 style={{ fontSize: 15, color: "#f8fafc", margin: "0 0 2px", fontWeight: 700 }}>Monte Carlo Simulation</h3>
              <p style={{ fontSize: 11, color: "#64748b", margin: 0 }}>
                {mcResults ? `${mcResults.numSims} scenarios with randomized outcomes` : "Stress-test the plan against uncertainty"}
              </p>
            </div>
            <button onClick={runMonteCarlo} disabled={mcRunning} style={{
              background: mcRunning ? "#334155" : "#4ade80", color: "#0f172a",
              border: "none", borderRadius: 6, padding: "8px 16px",
              fontSize: 12, fontWeight: 700, cursor: mcRunning ? "wait" : "pointer"
            }}>
              {mcRunning ? "Running..." : mcResults ? "Re-run Simulation" : "Run Simulation"}
            </button>
          </div>

          {/* Uncertainty controls */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
            <div style={{ background: "#0f172a", borderRadius: 6, padding: "8px 10px", border: "1px solid #1e293b" }}>
              <Slider label="Investment volatility" value={mcInvestVol} onChange={setMcInvestVol} min={0} max={30} step={1} format={(v) => v + "% σ"} color="#22d3ee" />
            </div>
            <div style={{ background: "#0f172a", borderRadius: 6, padding: "8px 10px", border: "1px solid #1e293b" }}>
              <Slider label="Business growth uncertainty" value={mcBizGrowthVol} onChange={setMcBizGrowthVol} min={0} max={15} step={1} format={(v) => v + "% σ"} color="#60a5fa" />
            </div>
            <div style={{ background: "#0f172a", borderRadius: 6, padding: "8px 10px", border: "1px solid #1e293b" }}>
              <Slider label="MSFT price uncertainty" value={mcMsftVol} onChange={setMcMsftVol} min={0} max={30} step={1} format={(v) => v + "% σ"} color="#f59e0b" />
            </div>
            <div style={{ background: "#0f172a", borderRadius: 6, padding: "8px 10px", border: "1px solid #1e293b" }}>
              <Slider label="SSDI max delay" value={mcSsdiDelay} onChange={setMcSsdiDelay} min={0} max={18} step={1} format={(v) => v + " mo"} color="#4ade80" />
            </div>
            <div style={{ background: "#0f172a", borderRadius: 6, padding: "8px 10px", border: "1px solid #1e293b" }}>
              <Slider label="Spending discipline uncertainty" value={mcCutsDiscipline} onChange={setMcCutsDiscipline} min={0} max={50} step={5} format={(v) => v + "% σ"} color="#f87171" />
            </div>
            <div style={{ background: "#0f172a", borderRadius: 6, padding: "8px 10px", border: "1px solid #1e293b" }}>
              <Slider label="Number of simulations" value={mcNumSims} onChange={setMcNumSims} min={100} max={1000} step={100} format={(v) => v.toString()} color="#94a3b8" />
            </div>
          </div>

          {/* Results */}
          {mcResults && (() => {
            const { bands, solvencyRate, medianTrough, medianFinal, p10Final, p90Final } = mcResults;
            const months = bands[0].series.length - 1;
            const svgW = 800;
            const svgH = 260;
            const padL = 60;
            const padR = 20;
            const padT = 20;
            const padB = 30;
            const plotW = svgW - padL - padR;
            const plotH = svgH - padT - padB;

            // Find data range across all bands
            const allVals = bands.flatMap(b => b.series);
            const maxBal = Math.max(...allVals, 0) * 1.1;
            const minBal = Math.min(...allVals, 0) * 1.1;
            const range = (maxBal - minBal) || 1;

            const xOf = (m) => padL + (m / months) * plotW;
            const yOf = (v) => padT + ((maxBal - v) / range) * plotH;
            const zeroY = yOf(0);

            // Band colors (outer to inner)
            const bandColors = [
              { lo: 0, hi: 4, fill: "#22d3ee", opacity: 0.08 }, // p10-p90
              { lo: 1, hi: 3, fill: "#22d3ee", opacity: 0.12 }, // p25-p75
            ];
            const medianIdx = 2; // p50

            // Build area paths for bands
            const bandPaths = bandColors.map(({ lo, hi, fill, opacity }) => {
              const upper = bands[hi].series;
              const lower = bands[lo].series;
              const d = upper.map((v, m) => `${m === 0 ? "M" : "L"} ${xOf(m).toFixed(1)},${yOf(v).toFixed(1)}`).join(" ")
                + [...lower].reverse().map((v, i) => `L ${xOf(months - i).toFixed(1)},${yOf(v).toFixed(1)}`).join(" ") + " Z";
              return { d, fill, opacity };
            });

            // Median line
            const medianPath = bands[medianIdx].series.map((v, m) => `${m === 0 ? "M" : "L"} ${xOf(m).toFixed(1)},${yOf(v).toFixed(1)}`).join(" ");

            // Deterministic line (from savingsData)
            const detPath = savingsData.filter(d => d.month <= months).map(d => `${d.month === 0 ? "M" : "L"} ${xOf(d.month).toFixed(1)},${yOf(d.balance).toFixed(1)}`).join(" ");

            // Solvency color
            const solvColor = solvencyRate >= 0.95 ? "#4ade80" : solvencyRate >= 0.80 ? "#fbbf24" : "#f87171";
            const solvEmoji = solvencyRate >= 0.95 ? "🟢" : solvencyRate >= 0.80 ? "🟡" : "🔴";

            return (
              <div>
                {/* Stats row */}
                <div style={{ display: "flex", gap: 2, marginBottom: 12, flexWrap: "wrap" }}>
                  {[
                    { label: "Solvency Rate", value: `${(solvencyRate * 100).toFixed(1)}%`, sub: `${solvEmoji} ${Math.round(solvencyRate * mcResults.numSims)}/${mcResults.numSims} scenarios stay positive`, color: solvColor },
                    { label: "Median Trough", value: fmtFull(medianTrough), sub: "Worst point in median path", color: medianTrough >= 0 ? "#4ade80" : "#f87171" },
                    { label: "Median Final (Y6)", value: fmtFull(medianFinal), color: medianFinal >= 0 ? "#4ade80" : "#f87171" },
                    { label: "10th Percentile Final", value: fmtFull(p10Final), sub: "Bad luck scenario", color: p10Final >= 0 ? "#fbbf24" : "#f87171" },
                    { label: "90th Percentile Final", value: fmtFull(p90Final), sub: "Good luck scenario", color: "#4ade80" },
                  ].map((item, i) => (
                    <div key={i} style={{
                      flex: 1, minWidth: 110,
                      background: "#0f172a", borderRadius: 6, padding: "6px 10px",
                      border: i === 0 ? `1px solid ${solvColor}33` : "1px solid #1e293b"
                    }}>
                      <div style={{ fontSize: 9, color: "#64748b", marginBottom: 2 }}>{item.label}</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: item.color, fontFamily: "'JetBrains Mono', monospace" }}>
                        {item.value}
                      </div>
                      {item.sub && <div style={{ fontSize: 9, color: "#475569", marginTop: 1 }}>{item.sub}</div>}
                    </div>
                  ))}
                </div>

                {/* Fan chart */}
                <svg viewBox={`0 0 ${svgW} ${svgH}`} style={{ width: "100%", height: "auto" }}>
                  {/* Y-axis */}
                  {(() => {
                    const ticks = [];
                    const step = range > 2000000 ? 500000 : range > 1000000 ? 250000 : range > 500000 ? 100000 : 50000;
                    for (let v = Math.ceil(minBal / step) * step; v <= maxBal; v += step) {
                      ticks.push(v);
                    }
                    return ticks.map(v => (
                      <g key={v}>
                        <line x1={padL} x2={svgW - padR} y1={yOf(v)} y2={yOf(v)} stroke="#1e293b" strokeWidth="1" />
                        <text x={padL - 6} y={yOf(v) + 3} textAnchor="end" fill="#475569" fontSize="9" fontFamily="'JetBrains Mono', monospace">
                          {v >= 1000000 || v <= -1000000 ? `$${(v/1000000).toFixed(1)}M` : v >= 1000 || v <= -1000 ? `$${Math.round(v/1000)}K` : `$${v}`}
                        </text>
                      </g>
                    ));
                  })()}

                  {/* Zero line */}
                  {minBal < 0 && (
                    <line x1={padL} x2={svgW - padR} y1={zeroY} y2={zeroY} stroke="#f8717155" strokeWidth="1.5" />
                  )}

                  {/* X-axis labels */}
                  {[0, 12, 24, 36, 48, 60, 72].map(m => (
                    <text key={m} x={xOf(m)} y={svgH - 4} textAnchor="middle" fill="#475569" fontSize="9" fontFamily="'JetBrains Mono', monospace">
                      {m === 0 ? "Now" : `Y${m/12}`}
                    </text>
                  ))}

                  {/* Band fills */}
                  {bandPaths.map((bp, i) => (
                    <path key={i} d={bp.d} fill={bp.fill} opacity={bp.opacity} />
                  ))}

                  {/* P10 and P90 edge lines */}
                  <path d={bands[0].series.map((v, m) => `${m === 0 ? "M" : "L"} ${xOf(m).toFixed(1)},${yOf(v).toFixed(1)}`).join(" ")}
                    fill="none" stroke="#22d3ee" strokeWidth="0.5" opacity="0.3" />
                  <path d={bands[4].series.map((v, m) => `${m === 0 ? "M" : "L"} ${xOf(m).toFixed(1)},${yOf(v).toFixed(1)}`).join(" ")}
                    fill="none" stroke="#22d3ee" strokeWidth="0.5" opacity="0.3" />

                  {/* Deterministic base case (dashed) */}
                  <path d={detPath} fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="6,4" opacity="0.5" />

                  {/* Median line (bold) */}
                  <path d={medianPath} fill="none" stroke="#22d3ee" strokeWidth="2.5" strokeLinejoin="round" />

                  {/* Endpoint labels */}
                  <text x={xOf(months) + 4} y={yOf(bands[medianIdx].series[months]) + 4} fill="#22d3ee" fontSize="9" fontWeight="700" fontFamily="'JetBrains Mono', monospace">
                    P50: {fmt(bands[medianIdx].series[months])}
                  </text>
                  <text x={xOf(months) + 4} y={yOf(bands[0].series[months]) + 4} fill="#475569" fontSize="8" fontFamily="'JetBrains Mono', monospace">
                    P10: {fmt(bands[0].series[months])}
                  </text>
                  <text x={xOf(months) + 4} y={yOf(bands[4].series[months]) + 4} fill="#475569" fontSize="8" fontFamily="'JetBrains Mono', monospace">
                    P90: {fmt(bands[4].series[months])}
                  </text>
                </svg>

                {/* Legend */}
                <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 8, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <div style={{ width: 20, height: 3, background: "#22d3ee", borderRadius: 2 }} />
                    <span style={{ fontSize: 10, color: "#94a3b8" }}>Median (P50)</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <div style={{ width: 20, height: 8, background: "#22d3ee", opacity: 0.12, borderRadius: 2 }} />
                    <span style={{ fontSize: 10, color: "#94a3b8" }}>25th–75th percentile</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <div style={{ width: 20, height: 8, background: "#22d3ee", opacity: 0.06, borderRadius: 2 }} />
                    <span style={{ fontSize: 10, color: "#94a3b8" }}>10th–90th percentile</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <div style={{ width: 20, height: 0, borderTop: "2px dashed #94a3b8" }} />
                    <span style={{ fontSize: 10, color: "#94a3b8" }}>Deterministic base case</span>
                  </div>
                </div>
              </div>
            );
          })()}

          {!mcResults && (
            <div style={{ textAlign: "center", padding: "24px 0", color: "#475569", fontSize: 12 }}>
              Adjust uncertainty parameters above, then click <strong style={{ color: "#4ade80" }}>Run Simulation</strong> to see probabilistic outcomes.
            </div>
          )}
        </div>
        )}

        {/* Timeline */}
        {(() => {
          const totalMonths = 60;
          const padL = 60; // px padding left for cards
          const padR = 60; // px padding right for cards
          const pct = (m) => (m / totalMonths) * 100;
          const cardW = 100;

          // Positive events (above)
          const above = [];
          if (retireDebt) {
            above.push({ m: 1, label: "Debt retired", detail: `+${fmtFull(debtService)}/mo freed` });
          }
          above.push({ m: ssdiApprovalMonth, label: "SSDI approved", detail: `+${fmtFull(ssdiFamilyTotal)}/mo` });
          above.push({ m: ssdiApprovalMonth + 2, label: "SSDI back pay", detail: `+${fmtFull(ssdiBackPayActual)} lump` });
          if (chadConsulting > 0) {
            above.push({ m: ssdiApprovalMonth + 1, label: "Consulting starts", detail: `+${fmtFull(chadConsulting)}/mo` });
          }
          for (const ms of milestones) {
            if (ms.savings > 0 && ms.month <= totalMonths) {
              above.push({ m: ms.month, label: ms.name, detail: `+${fmtFull(ms.savings)}/mo saved` });
            }
          }
          above.push({ m: bcsYearsLeft * 12 + 3, label: "BCS graduates", detail: `+${fmtFull(bcsFamilyMonthly)}/mo saved` });
          if (llcImproves) {
            above.push({ m: llcDelayMonths, label: "1031 exchange", detail: `LLC → ${fmtFull(Math.round(llcAnnual * llcMultiplier / 12))}/mo` });
          }
          if (trustIncomeFuture > trustIncomeNow) {
            above.push({ m: trustIncreaseMonth, label: "Trust increases", detail: `${fmtFull(trustIncomeNow)} → ${fmtFull(trustIncomeFuture)}/mo` });
          }
          if (vanSold) {
            above.push({ m: 1.5, label: "Van sold", detail: `+${fmtFull(vanMonthlySavings)}/mo freed` });
          }
          above.sort((a, b) => a.m - b.m);

          // Negative events (below)
          const below = [];
          below.push({ m: 0, label: "MSFT today", detail: `${fmtFull(data[0].msftVesting)}/mo (134 sh)`, color: "#f59e0b" });
          below.push({ m: 6, label: "MSFT drops", detail: `→ ${fmtFull(getVestingMonthly(6, msftGrowth))}/mo (88 sh)`, color: "#f59e0b" });
          below.push({ m: 18, label: "MSFT cliff", detail: `→ ${fmtFull(getVestingMonthly(18, msftGrowth))}/mo (32 sh)`, color: "#f87171" });
          below.push({ m: 30, label: "MSFT ends", detail: "$0/mo — final vest", color: "#f87171" });
          if (ssdiApprovalMonth + kidsAgeOutMonths < totalMonths) {
            below.push({ m: ssdiApprovalMonth + kidsAgeOutMonths, label: "Kids turn 18", detail: `SSDI → ${fmtFull(ssdiPersonal)}/mo`, color: "#f87171" });
          }
          below.sort((a, b) => a.m - b.m);

          // Deduplicate across both sets — no two diamonds on the same spot
          const allEvents = [...above.map(e => ({...e, side: "a"})), ...below.map(e => ({...e, side: "b"}))];
          allEvents.sort((a, b) => a.m - b.m);
          for (let i = 1; i < allEvents.length; i++) {
            if (allEvents[i].m <= allEvents[i-1].m + 0.8) {
              allEvents[i].m = allEvents[i-1].m + 1.5;
            }
          }
          // Write back
          const aboveFinal = allEvents.filter(e => e.side === "a");
          const belowFinal = allEvents.filter(e => e.side === "b");

          // Stagger: push cards to different heights when close horizontally
          const cardH = 38; // approximate card height
          const stagger = (items) => {
            const positioned = [];
            for (let i = 0; i < items.length; i++) {
              let tier = 0;
              for (let j = positioned.length - 1; j >= 0; j--) {
                const prev = positioned[j];
                const dist = Math.abs(pct(items[i].m) - pct(prev.m));
                if (dist < 12) {
                  tier = Math.max(tier, prev.tier + 1);
                }
              }
              positioned.push({ ...items[i], tier });
            }
            return positioned;
          };

          const abovePos = stagger(aboveFinal);
          const belowPos = stagger(belowFinal);

          const maxAboveTier = Math.max(0, ...abovePos.map(e => e.tier));
          const maxBelowTier = Math.max(0, ...belowPos.map(e => e.tier));
          
          const stemBase = 16;
          const tierStep = cardH + 8;
          const aboveSpace = stemBase + (maxAboveTier + 1) * tierStep + 10;
          const belowSpace = stemBase + (maxBelowTier + 1) * tierStep + 20; // extra for year labels
          const lineY = aboveSpace;
          const totalH = aboveSpace + belowSpace;

          // Card horizontal offset: clamp so card stays in view
          const getCardLeft = (leftPct) => {
            // Default: center card on the stem
            return -cardW / 2;
          };

          return (
            <div style={{
              background: "#1e293b", borderRadius: 12, padding: "24px 20px 16px",
              border: "1px solid #334155", marginBottom: 24
            }}>
              <h3 style={{ fontSize: 15, color: "#f8fafc", margin: "0 0 2px", fontWeight: 700 }}>5-Year Timeline</h3>
              <p style={{ fontSize: 11, color: "#64748b", margin: "0 0 12px" }}>
                <span style={{ color: "#4ade80" }}>Above</span> = income &amp; improvements &nbsp;&nbsp;
                <span style={{ color: "#f87171" }}>Below</span> = declining &amp; losses
              </p>

              <div style={{ position: "relative", height: totalH, margin: `0 ${padR}px 0 ${padL}px` }}>
                {/* Main line */}
                <div style={{
                  position: "absolute", left: 0, right: 0, top: lineY,
                  height: 2, background: "#334155"
                }} />

                {/* Year ticks + labels */}
                {[0, 12, 24, 36, 48, 60].map(m => (
                  <div key={m} style={{
                    position: "absolute", left: `${pct(m)}%`, top: lineY - 3,
                    transform: "translateX(-1px)"
                  }}>
                    <div style={{ width: 2, height: 8, background: "#475569" }} />
                    <div style={{
                      position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)",
                      fontSize: 9, color: "#64748b", whiteSpace: "nowrap",
                      fontFamily: "'JetBrains Mono', monospace"
                    }}>
                      {m === 0 ? "Now" : m === 60 ? "'31" : `'${26 + Math.floor((2 + m) / 12)}`}
                    </div>
                  </div>
                ))}

                {/* Above events */}
                {abovePos.map((ev, i) => {
                  const left = pct(ev.m);
                  const stemH = stemBase + ev.tier * tierStep;
                  const cardOffset = getCardLeft(left);
                  return (
                    <div key={`a${i}`} style={{ position: "absolute", left: `${left}%`, top: lineY, zIndex: 2 + ev.tier }}>
                      <div style={{
                        position: "absolute", left: -5, top: -5,
                        width: 10, height: 10, background: "#4ade80",
                        transform: "rotate(45deg)", borderRadius: 2,
                        boxShadow: "0 0 6px #4ade8044", zIndex: 5
                      }} />
                      <div style={{
                        position: "absolute", left: 0, width: 1,
                        bottom: 4, height: stemH,
                        background: "#4ade8033"
                      }} />
                      <div style={{
                        position: "absolute", left: cardOffset, width: cardW,
                        bottom: stemH + 4,
                        background: "#0f172a",
                        border: "1px solid #4ade8025",
                        borderRadius: 5, padding: "4px 7px"
                      }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "#4ade80", lineHeight: 1.2, marginBottom: 1 }}>{ev.label}</div>
                        <div style={{ fontSize: 9, color: "#94a3b8", lineHeight: 1.2 }}>{ev.detail}</div>
                      </div>
                    </div>
                  );
                })}

                {/* Below events */}
                {belowPos.map((ev, i) => {
                  const left = pct(ev.m);
                  const c = ev.color || "#f87171";
                  const stemH = stemBase + ev.tier * tierStep;
                  const cardOffset = getCardLeft(left);
                  return (
                    <div key={`b${i}`} style={{ position: "absolute", left: `${left}%`, top: lineY, zIndex: 2 + ev.tier }}>
                      <div style={{
                        position: "absolute", left: -5, top: -5,
                        width: 10, height: 10, background: c,
                        transform: "rotate(45deg)", borderRadius: 2,
                        boxShadow: `0 0 6px ${c}44`, zIndex: 5
                      }} />
                      <div style={{
                        position: "absolute", left: 0, width: 1,
                        top: 4, height: stemH,
                        background: `${c}33`
                      }} />
                      <div style={{
                        position: "absolute", left: cardOffset, width: cardW,
                        top: stemH + 4,
                        background: "#0f172a",
                        border: `1px solid ${c}25`,
                        borderRadius: 5, padding: "4px 7px"
                      }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: c, lineHeight: 1.2, marginBottom: 1 }}>{ev.label}</div>
                        <div style={{ fontSize: 9, color: "#94a3b8", lineHeight: 1.2 }}>{ev.detail}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Sarah's Practice Growth */}
        {(() => {
          const months = 60;
          const chartW = 800;
          const chartH = 240;
          const padL = 55;
          const padR = 20;
          const padT = 20;
          const padB = 30;
          const plotW = chartW - padL - padR;
          const plotH = chartH - padT - padB;

          // Compute monthly data points
          const pts = [];
          for (let m = 0; m <= months; m++) {
            const rate = Math.min(sarahRate * Math.pow(1 + sarahRateGrowth / 100, m / 12), sarahMaxRate);
            const clients = Math.min(sarahCurrentClients * Math.pow(1 + sarahClientGrowth / 100, m / 12), sarahMaxClients);
            const gross = Math.round(rate * clients * daysPerMonth);
            pts.push({ m, rate: Math.round(rate), clients: +clients.toFixed(2), gross });
          }

          const maxGross = Math.max(...pts.map(p => p.gross)) * 1.1;
          const minGross = Math.min(...pts.map(p => p.gross)) * 0.9;
          const grossRange = maxGross - minGross || 1;

          const xOf = (m) => padL + (m / months) * plotW;
          const yOf = (val) => padT + ((maxGross - val) / grossRange) * plotH;

          // Income line path
          const linePath = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${xOf(p.m).toFixed(1)},${yOf(p.gross).toFixed(1)}`).join(" ");
          // Area fill
          const areaPath = `${linePath} L ${xOf(months)},${yOf(minGross)} L ${xOf(0)},${yOf(minGross)} Z`;

          // Target income line
          const targetGross = Math.round(sarahMaxRate * sarahMaxClients * daysPerMonth);
          const targetY = yOf(targetGross);
          const currentGross = pts[0].gross;
          const currentY = yOf(currentGross);

          // Find when target is reached
          const targetMonth = pts.findIndex(p => p.gross >= targetGross * 0.99);

          // Y-axis ticks
          const yTicks = [];
          const tickStep = grossRange > 20000 ? 5000 : grossRange > 10000 ? 2500 : 1000;
          for (let v = Math.ceil(minGross / tickStep) * tickStep; v <= maxGross; v += tickStep) {
            yTicks.push(v);
          }

          return (
            <div style={{
              background: "#1e293b", borderRadius: 12, padding: "20px 16px",
              border: "1px solid #334155", marginBottom: 24
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                <h3 style={{ fontSize: 14, color: "#60a5fa", margin: 0, fontWeight: 600 }}>Sarah's Practice Growth</h3>
                <div style={{ fontSize: 11, color: "#64748b" }}>
                  <span style={{ color: "#60a5fa", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{fmtFull(currentGross)}</span>
                  <span> → </span>
                  <span style={{ color: "#4ade80", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{fmtFull(targetGross)}</span>
                  <span>/mo</span>
                </div>
              </div>
              <p style={{ fontSize: 11, color: "#475569", margin: "0 0 12px" }}>
                ${sarahRate}/hr × {sarahCurrentClients.toFixed(1)} clients → ${sarahMaxRate}/hr × {sarahMaxClients.toFixed(1)} clients
                {" "}| Rate +{sarahRateGrowth}%/yr, Clients +{sarahClientGrowth}%/yr
              </p>

              <svg viewBox={`0 0 ${chartW} ${chartH}`} style={{ width: "100%", height: "auto" }}>
                {/* Grid lines */}
                {yTicks.map(v => (
                  <g key={v}>
                    <line x1={padL} x2={chartW - padR} y1={yOf(v)} y2={yOf(v)}
                      stroke="#1e293b" strokeWidth="1" />
                    <text x={padL - 6} y={yOf(v) + 3} textAnchor="end"
                      fill="#475569" fontSize="9" fontFamily="'JetBrains Mono', monospace">
                      {v >= 1000 ? `$${Math.round(v/1000)}K` : `$${v}`}
                    </text>
                  </g>
                ))}

                {/* Year markers on X axis */}
                {[0, 12, 24, 36, 48, 60].map(m => (
                  <text key={m} x={xOf(m)} y={chartH - 4} textAnchor="middle"
                    fill="#475569" fontSize="9" fontFamily="'JetBrains Mono', monospace">
                    {m === 0 ? "Now" : m === 60 ? "'31" : `'${26 + Math.floor((2+m)/12)}`}
                  </text>
                ))}

                {/* Target line */}
                <line x1={padL} x2={chartW - padR} y1={targetY} y2={targetY}
                  stroke="#4ade80" strokeWidth="1" strokeDasharray="6,4" opacity="0.5" />
                <text x={chartW - padR - 2} y={targetY - 5} textAnchor="end"
                  fill="#4ade80" fontSize="9" opacity="0.7" fontFamily="'JetBrains Mono', monospace">
                  Target: {fmtFull(targetGross)}
                </text>

                {/* Current line */}
                <line x1={padL} x2={chartW - padR} y1={currentY} y2={currentY}
                  stroke="#64748b" strokeWidth="1" strokeDasharray="4,4" opacity="0.3" />
                <text x={padL + 4} y={currentY - 5}
                  fill="#64748b" fontSize="9" fontFamily="'JetBrains Mono', monospace">
                  Today: {fmtFull(currentGross)}
                </text>

                {/* Area fill */}
                <path d={areaPath} fill="url(#sarahGrad)" />

                {/* Gradient def */}
                <defs>
                  <linearGradient id="sarahGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#60a5fa" stopOpacity="0.02" />
                  </linearGradient>
                </defs>

                {/* Income line */}
                <path d={linePath} fill="none" stroke="#60a5fa" strokeWidth="2.5" strokeLinejoin="round" />

                {/* Target reached marker */}
                {targetMonth > 0 && targetMonth < months && (
                  <g>
                    <line x1={xOf(targetMonth)} x2={xOf(targetMonth)}
                      y1={padT} y2={padT + plotH}
                      stroke="#4ade80" strokeWidth="1" strokeDasharray="4,3" opacity="0.4" />
                    <circle cx={xOf(targetMonth)} cy={yOf(pts[targetMonth].gross)}
                      r="4" fill="#4ade80" stroke="#0f172a" strokeWidth="1.5" />
                    <text x={xOf(targetMonth) + 6} y={yOf(pts[targetMonth].gross) - 6}
                      fill="#4ade80" fontSize="9" fontWeight="700" fontFamily="'JetBrains Mono', monospace">
                      Target hit ~{Math.floor(targetMonth / 12)}y{targetMonth % 12}m
                    </text>
                  </g>
                )}

                {/* Data callouts at key points */}
                {[0, 12, 24, 36].filter(m => m <= months).map(m => {
                  const p = pts[m];
                  return (
                    <g key={`dot-${m}`}>
                      <circle cx={xOf(m)} cy={yOf(p.gross)} r="3" fill="#60a5fa" stroke="#0f172a" strokeWidth="1" />
                      {m > 0 && (
                        <text x={xOf(m)} y={yOf(p.gross) + 14} textAnchor="middle"
                          fill="#94a3b8" fontSize="8" fontFamily="'JetBrains Mono', monospace">
                          ${p.rate} × {p.clients}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>

              {/* Stats row */}
              <div style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
                {[
                  { label: "Today", rate: pts[0].rate, clients: pts[0].clients, gross: pts[0].gross },
                  { label: "Year 1", rate: pts[12]?.rate, clients: pts[12]?.clients, gross: pts[12]?.gross },
                  { label: "Year 2", rate: pts[24]?.rate, clients: pts[24]?.clients, gross: pts[24]?.gross },
                  { label: "Year 3", rate: pts[36]?.rate, clients: pts[36]?.clients, gross: pts[36]?.gross },
                ].map((s, i) => (
                  <div key={i} style={{
                    flex: 1, minWidth: 100, background: "#0f172a", borderRadius: 6, padding: "6px 8px",
                    border: i === 0 ? "1px solid #60a5fa33" : "1px solid #1e293b"
                  }}>
                    <div style={{ fontSize: 9, color: "#64748b", marginBottom: 2 }}>{s.label}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#60a5fa", fontFamily: "'JetBrains Mono', monospace" }}>
                      {fmtFull(s.gross)}
                    </div>
                    <div style={{ fontSize: 9, color: "#475569" }}>
                      ${s.rate}/hr × {s.clients}/day
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Income Composition Chart */}
        {(() => {
          const stackH = 300;
          const maxIncome = Math.max(...data.map(d => d.sarahIncome + d.msftVesting + d.ssdi + d.llcMonthly + d.consulting + (d.trust || 0) + (d.investReturn || 0)));
          const maxExpense = Math.max(...data.map(d => d.expenses));
          const stackMax = Math.max(maxIncome, maxExpense) * 1.1 || 1;
          const stackYPad = 60;

          const sources = [
            { key: "sarahIncome", label: "Sarah's Business", color: "#60a5fa" },
            { key: "msftVesting", label: "MSFT Vesting", color: "#f59e0b" },
            { key: "ssdi", label: "SSDI", color: "#4ade80" },
            { key: "consulting", label: "Chad Consulting", color: "#38bdf8" },
            { key: "trust", label: "Trust Income", color: "#a78bfa" },
            { key: "investReturn", label: `Invest Returns (${investmentReturn}%/yr)`, color: "#22d3ee" },
            { key: "llcMonthly", label: "LLC Distribution", color: "#c084fc" },
          ];

          return (
            <div style={{
              background: "#1e293b", borderRadius: 12, padding: "20px 16px",
              border: "1px solid #334155", marginBottom: 24
            }}>
              <h3 style={{ fontSize: 14, color: "#94a3b8", margin: "0 0 4px", fontWeight: 600 }}>Income Composition vs Expenses</h3>
              <p style={{ fontSize: 10, color: "#475569", margin: "0 0 12px" }}>All values are monthly rates at each quarter — hover for breakdown</p>
              <div style={{ position: "relative", height: stackH + 40, paddingLeft: stackYPad }}
                onMouseLeave={() => setIncomeTooltip(null)}>
                {/* Y-axis labels */}
                {(() => {
                  const ticks = [];
                  const tickCount = 6;
                  for (let i = 0; i <= tickCount; i++) {
                    const val = stackMax - (i * stackMax / tickCount);
                    const yPos = (i / tickCount) * stackH;
                    ticks.push(
                      <div key={`sl-${i}`} style={{ position: "absolute", left: 0, top: yPos - 7, width: stackYPad - 8, textAlign: "right" }}>
                        <span style={{ fontSize: 10, color: "#64748b", fontFamily: "'JetBrains Mono', monospace" }}>
                          {fmt(val)}
                        </span>
                      </div>
                    );
                    ticks.push(
                      <div key={`sg-${i}`} style={{
                        position: "absolute", left: stackYPad, right: 0, top: yPos,
                        height: 1, background: "#1e293b80", zIndex: 0
                      }} />
                    );
                  }
                  return ticks;
                })()}

                {/* Stacked bars */}
                <div style={{ display: "flex", alignItems: "flex-end", height: stackH, gap: 2, position: "relative" }}>
                  {data.map((d, i) => {
                    const vals = sources.map(s => d[s.key] || 0);
                    const total = vals.reduce((a, b) => a + b, 0);
                    const n = data.length;
                    const pctX = ((i + 0.5) / n) * 100;

                    return (
                      <div key={i} style={{ flex: 1, height: "100%", position: "relative", display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", cursor: "default" }}
                        onMouseEnter={() => setIncomeTooltip({
                          pctX,
                          label: d.label,
                          sources: sources.map((s, si) => ({ label: s.label, color: s.color, value: vals[si] })).filter(s => s.value > 0),
                          total,
                          expenses: d.expenses,
                          net: d.netMonthly
                        })}>
                        {/* Stacked segments */}
                        <div style={{ width: "75%", display: "flex", flexDirection: "column-reverse" }}>
                          {sources.map((s, si) => {
                            const segH = (vals[si] / stackMax) * stackH;
                            return segH > 0 ? (
                              <div key={si} style={{
                                height: segH,
                                background: s.color,
                                opacity: incomeTooltip?.label === d.label ? 0.9 : 0.7,
                                borderRadius: si === sources.length - 1 ? "3px 3px 0 0" :
                                  (si === sources.length - 1 || vals.slice(si + 1).every(v => v === 0)) ? "3px 3px 0 0" : 0,
                                transition: "height 0.3s ease, opacity 0.15s ease"
                              }} />
                            ) : null;
                          })}
                        </div>

                        {/* Quarter label */}
                        <div style={{
                          position: "absolute", bottom: -24, fontSize: 9, color: "#64748b",
                          whiteSpace: "nowrap", transform: "rotate(-35deg)", transformOrigin: "top left"
                        }}>
                          {d.label}
                        </div>
                      </div>
                    );
                  })}

                  {/* Expense line */}
                  <div style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    top: stackH - (data[0].expenses / stackMax) * stackH,
                    height: 2,
                    background: "#f87171",
                    zIndex: 3,
                    pointerEvents: "none"
                  }} />
                </div>

                {/* Tooltip */}
                {incomeTooltip && (
                  <div style={{
                    position: "absolute",
                    left: `${incomeTooltip.pctX}%`,
                    top: 10,
                    transform: "translateX(-50%)",
                    background: "#0f172a",
                    border: "1px solid #475569",
                    borderRadius: 8,
                    padding: "10px 14px",
                    pointerEvents: "none",
                    zIndex: 10,
                    whiteSpace: "nowrap",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
                    minWidth: 180
                  }}>
                    <div style={{ fontSize: 12, color: "#f8fafc", fontWeight: 700, marginBottom: 6, borderBottom: "1px solid #334155", paddingBottom: 4 }}>
                      {incomeTooltip.label}
                    </div>
                    {incomeTooltip.sources.map((s, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, fontSize: 11, marginTop: 3 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                          <div style={{ width: 8, height: 8, borderRadius: 2, background: s.color, flexShrink: 0 }} />
                          <span style={{ color: "#94a3b8" }}>{s.label}</span>
                        </div>
                        <span style={{ color: s.color, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{fmtFull(s.value)}</span>
                      </div>
                    ))}
                    <div style={{ borderTop: "1px solid #334155", marginTop: 6, paddingTop: 4 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginTop: 2 }}>
                        <span style={{ color: "#94a3b8" }}>Total income</span>
                        <span style={{ color: "#e2e8f0", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{fmtFull(incomeTooltip.total)}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginTop: 2 }}>
                        <span style={{ color: "#94a3b8" }}>Expenses</span>
                        <span style={{ color: "#f87171", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{fmtFull(incomeTooltip.expenses)}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 4, paddingTop: 4, borderTop: "1px solid #334155" }}>
                        <span style={{ color: incomeTooltip.net >= 0 ? "#4ade80" : "#f87171", fontWeight: 700 }}>
                          {incomeTooltip.net >= 0 ? "Surplus" : "Deficit"}
                        </span>
                        <span style={{ color: incomeTooltip.net >= 0 ? "#4ade80" : "#f87171", fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>
                          {incomeTooltip.net >= 0 ? "+" : ""}{fmtFull(incomeTooltip.net)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Legend */}
              <div style={{ display: "flex", gap: 14, marginTop: 32, justifyContent: "center", flexWrap: "wrap" }}>
                {sources.map((s, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <div style={{ width: 12, height: 12, borderRadius: 2, background: s.color, opacity: 0.7 }} />
                    <span style={{ fontSize: 11, color: "#94a3b8" }}>{s.label}</span>
                  </div>
                ))}
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <div style={{ width: 16, height: 2, background: "#f87171" }} />
                  <span style={{ fontSize: 11, color: "#94a3b8" }}>Expenses</span>
                </div>
              </div>
            </div>
          );
        })()}

        {!presentMode && <>{/* Chart */}
        <div style={{
          background: "#1e293b", borderRadius: 12, padding: "20px 16px",
          border: "1px solid #334155", marginBottom: 24
        }}>
          <h3 style={{ fontSize: 14, color: "#94a3b8", margin: "0 0 16px", fontWeight: 600 }}>Monthly Cash Flow Over Time</h3>
          <div style={{ position: "relative", height: chartH + 50, paddingLeft: yAxisPadding }}>
            {/* Y-axis labels and grid lines */}
            {(() => {
              const tickCount = 8;
              const ticks = [];
              for (let i = 0; i <= tickCount; i++) {
                const val = netRange - (i * 2 * netRange / tickCount);
                const yPos = (i / tickCount) * chartH;
                ticks.push(
                  <div key={`label-${i}`} style={{ position: "absolute", left: 0, top: yPos - 7, width: yAxisPadding - 8, textAlign: "right" }}>
                    <span style={{ fontSize: 10, color: "#64748b", fontFamily: "'JetBrains Mono', monospace" }}>
                      {fmt(val)}
                    </span>
                  </div>
                );
                ticks.push(
                  <div key={`line-${i}`} style={{
                    position: "absolute", left: yAxisPadding, right: 0, top: yPos,
                    height: 1,
                    background: Math.abs(val) < netRange * 0.02 ? "#475569" : "#1e293b80",
                    zIndex: 1
                  }} />
                );
              }
              return ticks;
            })()}

            {/* Bars + MSFT vesting overlay */}
            <div style={{ display: "flex", alignItems: "center", height: chartH, gap: 2, paddingLeft: 0, position: "relative" }}
              onMouseLeave={() => setMsftTooltip(null)}>
              {/* SVG overlay for MSFT vesting area + line */}
              <svg viewBox={`0 0 ${data.length * 100} ${chartH}`} preserveAspectRatio="none" style={{ position: "absolute", top: 0, left: 0, width: "100%", height: chartH, pointerEvents: "none", zIndex: 4 }}>
                {(() => {
                  const n = data.length;
                  const colW = 100;
                  const zeroY = chartH / 2;
                  // MSFT line scale: fit to top half of chart, independent of bar scale
                  const msftScale = maxVesting > 0 ? (chartH / 2 - 20) / maxVesting : 1;
                  
                  const points = data.map((d, i) => {
                    const xPos = i * colW + colW / 2;
                    const vestH = d.msftVesting * msftScale;
                    const yPos = zeroY - vestH;
                    return { x: xPos, y: yPos };
                  });
                  
                  const areaTop = points.map(p => `${p.x},${p.y}`).join(" L ");
                  const areaPath = `M ${points[0].x},${zeroY} L ${areaTop} L ${points[n-1].x},${zeroY} Z`;
                  const linePath = `M ${points.map(p => `${p.x},${p.y}`).join(" L ")}`;
                  
                  const ssdiIdx = data.findIndex(d => d.ssdi > 0);
                  const ssdiX = ssdiIdx >= 0 ? ssdiIdx * colW + colW / 2 : null;
                  
                  return (
                    <>
                      <path d={linePath} fill="none" stroke="#f59e0b" strokeWidth="3" strokeLinejoin="round" strokeDasharray="8,4" opacity="0.7" />
                      {points.map((p, i) => (
                        data[i].msftVesting > 0 && <circle key={i} cx={p.x} cy={p.y} r="4" fill="#f59e0b" opacity="0.5" />
                      ))}
                      {ssdiX !== null && (
                        <line x1={ssdiX} x2={ssdiX} y1={26} y2={chartH} stroke="#4ade80" strokeWidth="2" strokeDasharray="6,4" opacity="0.6" />
                      )}
                    </>
                  );
                })()}
              </svg>

              {/* Invisible hover zones for MSFT tooltip */}
              {data.map((d, i) => {
                const n = data.length;
                const pctLeft = (i / n) * 100;
                const pctWidth = (1 / n) * 100;
                const msftScale = maxVesting > 0 ? (chartH / 2 - 20) / maxVesting : 1;
                const vestH = d.msftVesting * msftScale;
                const yPct = ((chartH / 2 - vestH) / chartH) * 100;
                return d.msftVesting > 0 ? (
                  <div key={`msft-hover-${i}`}
                    style={{ position: "absolute", left: `${pctLeft}%`, width: `${pctWidth}%`, top: 0, height: chartH, zIndex: 5, cursor: "default" }}
                    onMouseEnter={() => setMsftTooltip({ pctX: pctLeft + pctWidth / 2, pctY: yPct, value: d.msftVesting, label: d.label })}
                    onMouseLeave={() => setMsftTooltip(null)}
                  />
                ) : null;
              })}

              {/* SSDI starts HTML label */}
              {(() => {
                const ssdiIdx = data.findIndex(d => d.ssdi > 0);
                if (ssdiIdx < 0) return null;
                const pctX = ((ssdiIdx + 0.5) / data.length) * 100;
                return (
                  <div style={{
                    position: "absolute",
                    left: `${pctX}%`,
                    top: 2,
                    transform: "translateX(-50%)",
                    zIndex: 6,
                    whiteSpace: "nowrap",
                    pointerEvents: "none"
                  }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#4ade80", fontFamily: "'JetBrains Mono', monospace" }}>
                      SSDI starts
                    </span>
                  </div>
                );
              })()}

              {/* MSFT tooltip */}
              {msftTooltip && (
                <div style={{
                  position: "absolute",
                  left: `${msftTooltip.pctX}%`,
                  top: `${msftTooltip.pctY}%`,
                  transform: "translate(-50%, -120%)",
                  background: "#0f172a",
                  border: "1px solid #f59e0b",
                  borderRadius: 6,
                  padding: "6px 10px",
                  pointerEvents: "none",
                  zIndex: 10,
                  whiteSpace: "nowrap",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.5)"
                }}>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 2 }}>{msftTooltip.label}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#f59e0b", fontFamily: "'JetBrains Mono', monospace" }}>
                    MSFT: {fmtFull(msftTooltip.value)}/mo
                  </div>
                </div>
              )}
              
              {data.map((d, i) => {
                const barH = Math.abs(d.netMonthly) / netRange * (chartH / 2 - 10);
                const isPos = d.netMonthly >= 0;
                const isHighlight = i === highlightIdx;
                return (
                  <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", height: "100%", position: "relative" }}>
                    {isHighlight && (
                      <div style={{
                        position: "absolute", top: 0, bottom: 0, width: "100%",
                        background: isPos ? "rgba(74, 222, 128, 0.08)" : "rgba(251, 191, 36, 0.08)",
                        border: `1px solid ${isPos ? "rgba(74, 222, 128, 0.3)" : "rgba(251, 191, 36, 0.3)"}`,
                        borderRadius: 4,
                        zIndex: 0
                      }} />
                    )}
                    <div style={{
                      position: "absolute",
                      top: isPos ? (chartH / 2 - barH) : chartH / 2,
                      height: Math.max(barH, 2),
                      width: "70%",
                      background: isPos
                        ? "linear-gradient(180deg, #4ade80, #22c55e)"
                        : isHighlight
                          ? "linear-gradient(180deg, #fbbf24, #f59e0b)"
                          : "linear-gradient(180deg, #ef4444, #f87171)",
                      borderRadius: isPos ? "3px 3px 0 0" : "0 0 3px 3px",
                      transition: "all 0.3s ease",
                      zIndex: 2
                    }} />
                    <div style={{
                      position: "absolute",
                      top: isPos ? (chartH / 2 - barH - 16) : (chartH / 2 + barH + 4),
                      fontSize: 9,
                      color: isPos ? "#4ade80" : (isHighlight ? "#fbbf24" : "#f87171"),
                      fontFamily: "'JetBrains Mono', monospace",
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                      zIndex: 3
                    }}>
                      {fmt(d.netMonthly)}
                    </div>
                    <div style={{
                      position: "absolute", bottom: -24, fontSize: 9,
                      color: isHighlight ? (isPos ? "#4ade80" : "#fbbf24") : "#64748b",
                      fontWeight: isHighlight ? 700 : 400,
                      whiteSpace: "nowrap", transform: "rotate(-35deg)", transformOrigin: "top left"
                    }}>
                      {d.label}
                    </div>
                    {isHighlight && (
                      <div style={{
                        position: "absolute",
                        top: isPos ? (chartH / 2 - barH - 28) : (chartH / 2 + barH + 18),
                        fontSize: 8,
                        color: isPos ? "#4ade80" : "#fbbf24",
                        fontWeight: 700,
                        whiteSpace: "nowrap",
                        zIndex: 3
                      }}>
                        {highlightLabel}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Legend */}
          <div style={{ display: "flex", gap: 16, marginTop: 32, justifyContent: "center", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 12, height: 12, borderRadius: 2, background: "#4ade80" }} />
              <span style={{ fontSize: 11, color: "#94a3b8" }}>Surplus</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 12, height: 12, borderRadius: 2, background: "#f87171" }} />
              <span style={{ fontSize: 11, color: "#94a3b8" }}>Deficit</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 16, height: 2, background: "#f59e0b", borderTop: "2px dashed #f59e0b" }} />
              <span style={{ fontSize: 11, color: "#94a3b8" }}>MSFT vesting income</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 16, height: 2, background: "#4ade80", borderTop: "2px dashed #4ade80" }} />
              <span style={{ fontSize: 11, color: "#94a3b8" }}>SSDI starts</span>
            </div>
          </div>
        </div>

        </>}

        {!presentMode && <>{/* Controls */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginBottom: 24 }}>
          {/* Income Assumptions */}
          <div style={{
            background: "#1e293b", borderRadius: 12, padding: 20,
            border: "1px solid #334155"
          }}>
            <h3 style={{ fontSize: 14, color: "#60a5fa", margin: "0 0 12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Income Assumptions
            </h3>
            <div style={{ padding: "10px 12px", background: "#0f172a", borderRadius: 8, border: "1px solid #334155", marginBottom: 12 }}>
              <h4 style={{ fontSize: 11, color: "#60a5fa", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Sarah's Business — Rate</h4>
              <Slider label="Current hourly rate" value={sarahRate} onChange={setSarahRate} min={150} max={300} step={10} format={(v) => "$" + v + "/hr"} />
              <Slider label="Rate growth/yr" value={sarahRateGrowth} onChange={setSarahRateGrowth} min={0} max={20} format={(v) => v + "%"} />
              <Slider label="Max hourly rate (ceiling)" value={sarahMaxRate} onChange={setSarahMaxRate} min={200} max={400} step={10} format={(v) => "$" + v + "/hr"} color="#94a3b8" />
            </div>
            <div style={{ padding: "10px 12px", background: "#0f172a", borderRadius: 8, border: "1px solid #334155", marginBottom: 12 }}>
              <h4 style={{ fontSize: 11, color: "#60a5fa", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Sarah's Business — Clients</h4>
              <Slider label="Current clients/day" value={sarahCurrentClients} onChange={setSarahCurrentClients} min={1} max={5} step={0.1} format={(v) => v.toFixed(1)} />
              <Slider label="Client growth/yr" value={sarahClientGrowth} onChange={setSarahClientGrowth} min={0} max={30} format={(v) => v + "%"} />
              <Slider label="Max clients/day (ceiling)" value={sarahMaxClients} onChange={setSarahMaxClients} min={3} max={7} step={0.5} format={(v) => v.toFixed(1)} color="#94a3b8" />
            </div>
            <div style={{ padding: "8px 12px", background: "#0f172a", borderRadius: 8, border: "1px solid #334155", marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ color: "#64748b" }}>Current net/mo:</span>
                <span style={{ color: "#60a5fa", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{fmtFull(sarahCurrentNet)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 2 }}>
                <span style={{ color: "#64748b" }}>Ceiling:</span>
                <span style={{ color: "#94a3b8", fontFamily: "'JetBrains Mono', monospace" }}>{fmtFull(sarahCeiling)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 2 }}>
                <span style={{ color: "#64748b" }}>Capacity used:</span>
                <span style={{ color: sarahCurrentNet / sarahCeiling > 0.8 ? "#fbbf24" : "#4ade80", fontFamily: "'JetBrains Mono', monospace" }}>{Math.round(sarahCurrentNet / sarahCeiling * 100)}%</span>
              </div>
            </div>
            <Slider label="SSDI family total/mo" value={ssdiFamilyTotal} onChange={setSsdiFamilyTotal} min={4000} max={7000} step={100} />
            <Slider label="SSDI personal (post kids)" value={ssdiPersonal} onChange={setSsdiPersonal} min={3000} max={4500} step={50} />
            <Slider label="Kids age out (months)" value={kidsAgeOutMonths} onChange={setKidsAgeOutMonths} min={24} max={48} />

            <div style={{ marginTop: 12, padding: "10px 12px", background: "#0f172a", borderRadius: 8, border: "1px solid #334155" }}>
              <h4 style={{ fontSize: 11, color: "#38bdf8", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Chad Consulting (Post-SSDI)</h4>
              <Slider label="Monthly consulting income" value={chadConsulting} onChange={setChadConsulting} min={0} max={sgaLimit} step={100} color="#38bdf8" />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginTop: 4 }}>
                <span style={{ color: "#64748b" }}>SGA limit (2026):</span>
                <span style={{ color: "#94a3b8", fontFamily: "'JetBrains Mono', monospace" }}>{fmtFull(sgaLimit)}/mo</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginTop: 2 }}>
                <span style={{ color: "#64748b" }}>Annual:</span>
                <span style={{ color: "#38bdf8", fontFamily: "'JetBrains Mono', monospace" }}>{fmtFull(chadConsulting * 12)}/yr</span>
              </div>
              {chadConsulting > 0 && (
                <div style={{ fontSize: 10, color: "#475569", marginTop: 4, fontStyle: "italic" }}>
                  Starts after SSDI approval. Stay under SGA to protect benefits.
                </div>
              )}
            </div>

            <div style={{ marginTop: 12, padding: "10px 12px", background: "#0f172a", borderRadius: 8, border: "1px solid #334155" }}>
              <h4 style={{ fontSize: 11, color: "#a78bfa", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Trust Income (Guaranteed)</h4>
              <Slider label="Current monthly" value={trustIncomeNow} onChange={setTrustIncomeNow} min={0} max={3000} step={50} color="#a78bfa" />
              <Slider label="After increase" value={trustIncomeFuture} onChange={setTrustIncomeFuture} min={0} max={5000} step={50} color="#a78bfa" />
              <Slider label="Increase at month" value={trustIncreaseMonth} onChange={setTrustIncreaseMonth} min={3} max={24} format={(v) => v + " mo"} color="#a78bfa" />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginTop: 4, color: "#64748b" }}>
                <span>Annual: {fmtFull(trustIncomeNow * 12)} → {fmtFull(trustIncomeFuture * 12)}</span>
              </div>
            </div>

            <div style={{ marginTop: 12, padding: "10px 12px", background: "#0f172a", borderRadius: 8, border: "1px solid #334155" }}>
              <h4 style={{ fontSize: 11, color: "#94a3b8", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Van Sale</h4>
              <Toggle label={`Van sold (saves ${fmtFull(vanMonthlySavings)}/mo)`} checked={vanSold} onChange={setVanSold} color="#4ade80" />
              {!vanSold && (
                <Slider label="Van monthly cost" value={vanMonthlySavings} onChange={setVanMonthlySavings} min={1500} max={4000} step={50} color="#f87171" />
              )}
            </div>

            <div style={{ marginTop: 12, padding: "10px 12px", background: "#0f172a", borderRadius: 8, border: "1px solid #334155" }}>
              <h4 style={{ fontSize: 11, color: "#c084fc", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>LLC Distributions</h4>
              <Slider label="Current annual distribution" value={llcAnnual} onChange={setLlcAnnual} min={5000} max={20000} step={500} color="#c084fc" />
              <div style={{ opacity: llcImproves ? 1 : 0.4 }}>
                <Slider label="Post-1031 multiplier" value={llcMultiplier} onChange={setLlcMultiplier} min={1.5} max={3.5} step={0.1} format={(v) => v.toFixed(1) + "x"} color={llcImproves ? "#c084fc" : "#334155"} />
                <Slider label="1031 exchange completes" value={llcDelayMonths} onChange={setLlcDelayMonths} min={6} max={36} format={(v) => v + " mo"} color={llcImproves ? "#c084fc" : "#334155"} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 6, paddingTop: 6, borderTop: "1px solid #334155" }}>
                <span style={{ color: "#64748b" }}>Current monthly:</span>
                <span style={{ color: "#c084fc", fontFamily: "'JetBrains Mono', monospace" }}>{fmtFull(Math.round(llcAnnual / 12))}</span>
              </div>
              {llcImproves && (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 2 }}>
                    <span style={{ color: "#64748b" }}>Post-1031 monthly:</span>
                    <span style={{ color: "#4ade80", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{fmtFull(Math.round(llcAnnual * llcMultiplier / 12))}</span>
                  </div>
                  <div style={{ fontSize: 10, color: "#64748b", marginTop: 4, fontStyle: "italic" }}>
                    Improvement kicks in at month {llcDelayMonths} ({Math.round(llcDelayMonths / 12 * 10) / 10} yrs)
                  </div>
                </>
              )}
              {!llcImproves && (
                <div style={{ fontSize: 10, color: "#475569", marginTop: 4, fontStyle: "italic" }}>
                  Enable "LLC distributions improve" toggle to model post-1031 increase
                </div>
              )}
            </div>

            <div style={{ marginTop: 12, padding: "10px 12px", background: "#0f172a", borderRadius: 8, border: "1px solid #334155" }}>
              <h4 style={{ fontSize: 11, color: "#4ade80", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>SSDI Back Pay (Lump Sum)</h4>
              <Slider label="Back pay months" value={ssdiBackPayMonths} onChange={setSsdiBackPayMonths} min={6} max={24} color="#4ade80" format={(v) => v + " mo"} />
              <Slider label="SSDI approval (months out)" value={ssdiApprovalMonth} onChange={setSsdiApprovalMonth} min={3} max={18} color="#4ade80" format={(v) => v + " mo"} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 6 }}>
                <span style={{ color: "#64748b" }}>Gross ({ssdiBackPayMonths} × {fmtFull(ssdiPersonal)}):</span>
                <span style={{ color: "#94a3b8", fontFamily: "'JetBrains Mono', monospace" }}>{fmtFull(ssdiBackPayGross)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 2 }}>
                <span style={{ color: "#64748b" }}>Attorney fee (25% cap):</span>
                <span style={{ color: "#f87171", fontFamily: "'JetBrains Mono', monospace" }}>-{fmtFull(ssdiAttorneyFee)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginTop: 4, paddingTop: 4, borderTop: "1px solid #334155", fontWeight: 700 }}>
                <span style={{ color: "#4ade80" }}>Net lump sum:</span>
                <span style={{ color: "#4ade80", fontFamily: "'JetBrains Mono', monospace" }}>{fmtFull(ssdiBackPayActual)}</span>
              </div>
            </div>
          </div>

          {/* Expense Assumptions */}
          <div style={{
            background: "#1e293b", borderRadius: 12, padding: 20,
            border: "1px solid #334155"
          }}>
            <h3 style={{ fontSize: 14, color: "#f87171", margin: "0 0 12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Expense Assumptions
            </h3>
            <div style={{ marginBottom: 12, padding: "8px 10px", background: "#0f172a", borderRadius: 6, border: "1px solid #334155" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ color: "#94a3b8" }}>Total monthly outflow:</span>
                <span style={{ color: "#f87171", fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
                  {fmtFull(baseExpenses + (retireDebt ? 0 : debtService) + ((bcsParentsAnnual >= bcsAnnualTotal ? 0 : bcsFamilyMonthly)) + (vanSold ? 0 : vanMonthlySavings) - (lifestyleCutsApplied ? lifestyleCuts + cutInHalf + extraCuts : 0))}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginTop: 4 }}>
                <span style={{ color: "#64748b" }}>Current (no changes):</span>
                <span style={{ color: "#64748b", fontFamily: "'JetBrains Mono', monospace" }}>
                  {fmtFull(baseExpenses + debtService + bcsFamilyMonthly + vanMonthlySavings)}
                </span>
              </div>
            </div>

            <div style={{ marginTop: 8, padding: "10px 12px", background: "#0f172a", borderRadius: 8, border: "1px solid #334155" }}>
              <h4 style={{ fontSize: 11, color: "#f87171", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Debt Balances (Scenario C)</h4>
              <Slider label="Credit cards (10 accts)" value={debtCC} onChange={setDebtCC} min={0} max={150000} step={1000} color={retireDebt ? "#4ade80" : "#f87171"} />
              <Slider label="Personal loans (Affirm/LC/AP)" value={debtPersonal} onChange={setDebtPersonal} min={0} max={100000} step={1000} color={retireDebt ? "#4ade80" : "#f87171"} />
              <Slider label="IRS back taxes" value={debtIRS} onChange={setDebtIRS} min={0} max={30000} step={500} color={retireDebt ? "#4ade80" : "#f87171"} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginTop: 4, color: "#64748b" }}>
                <span>Firstmark student loan (kept):</span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{fmtFull(debtFirstmark)} @ $251/mo</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 6, paddingTop: 6, borderTop: "1px solid #334155", fontWeight: 700 }}>
                <span style={{ color: "#94a3b8" }}>Total debt:</span>
                <span style={{ color: retireDebt ? "#4ade80" : "#f87171", fontFamily: "'JetBrains Mono', monospace" }}>{fmtFull(debtTotal)}</span>
              </div>
            </div>

            <div style={{ marginTop: 8, padding: "10px 12px", background: "#0f172a", borderRadius: 8, border: "1px solid #334155" }}>
              <h4 style={{ fontSize: 11, color: lifestyleCutsApplied ? "#4ade80" : "#f87171", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Spending Cuts ({lifestyleCutsApplied ? "Applied" : "Not yet applied"})
              </h4>
              <Slider label="Eliminate (Oliver, Bitcoin, gym)" value={lifestyleCuts} onChange={setLifestyleCuts} min={0} max={10000} step={250} color={lifestyleCutsApplied ? "#4ade80" : "#334155"} />
              <Slider label="Cut in half (medical, dining, etc)" value={cutInHalf} onChange={setCutInHalf} min={0} max={5000} step={250} color={lifestyleCutsApplied ? "#4ade80" : "#334155"} />
              <Slider label="Extra cuts (groceries, shopping)" value={extraCuts} onChange={setExtraCuts} min={0} max={5000} step={250} color={lifestyleCutsApplied ? "#4ade80" : "#334155"} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 6, paddingTop: 6, borderTop: "1px solid #334155", fontWeight: 700 }}>
                <span style={{ color: "#94a3b8" }}>Total if applied:</span>
                <span style={{ color: lifestyleCutsApplied ? "#4ade80" : "#64748b", fontFamily: "'JetBrains Mono', monospace" }}>-{fmtFull(lifestyleCuts + cutInHalf + extraCuts)}/mo</span>
              </div>
            </div>

            <div style={{ marginTop: 8, padding: "10px 12px", background: "#0f172a", borderRadius: 8, border: "1px solid #334155" }}>
              <h4 style={{ fontSize: 11, color: "#c084fc", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>BCS Tuition</h4>
              <Slider label="Total annual tuition" value={bcsAnnualTotal} onChange={setBcsAnnualTotal} min={30000} max={50000} step={1000} color="#c084fc" />
              <Slider label="Parents pay annually" value={bcsParentsAnnual} onChange={setBcsParentsAnnual} min={0} max={bcsAnnualTotal} step={1000} color="#c084fc" />
              <Slider label="Years remaining" value={bcsYearsLeft} onChange={setBcsYearsLeft} min={1} max={5} format={(v) => v + " yrs"} color="#c084fc" />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginTop: 4, color: "#64748b" }}>
                <span>Family share:</span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", color: bcsFamilyMonthly > 0 ? "#f87171" : "#4ade80" }}>
                  {bcsFamilyMonthly > 0 ? fmtFull(bcsFamilyMonthly) + "/mo" : "Fully covered"}
                </span>
              </div>
            </div>

            <div style={{ marginTop: 12, padding: "10px 12px", background: "#0f172a", borderRadius: 8, border: "1px solid #334155" }}>
              <h4 style={{ fontSize: 11, color: "#94a3b8", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Expense Milestones</h4>
              {milestones.map((ms, i) => (
                <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
                  <input
                    type="text" value={ms.name}
                    onChange={(e) => { const u = [...milestones]; u[i] = {...u[i], name: e.target.value}; setMilestones(u); }}
                    style={{ flex: 2, background: "#1e293b", border: "1px solid #334155", borderRadius: 4, color: "#e2e8f0", padding: "4px 6px", fontSize: 11, fontFamily: "'Inter', sans-serif", outline: "none" }}
                  />
                  <div style={{ flex: 1 }}>
                    <Slider label="" value={ms.month} onChange={(v) => { const u = [...milestones]; u[i] = {...u[i], month: v}; setMilestones(u); }}
                      min={3} max={60} format={(v) => v + "mo"} color="#94a3b8" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <Slider label="" value={ms.savings} onChange={(v) => { const u = [...milestones]; u[i] = {...u[i], savings: v}; setMilestones(u); }}
                      min={0} max={5000} step={100} color="#4ade80" />
                  </div>
                  <span style={{ fontSize: 10, color: "#4ade80", fontFamily: "'JetBrains Mono', monospace", whiteSpace: "nowrap", minWidth: 55, textAlign: "right" }}>
                    -{fmtFull(ms.savings)}
                  </span>
                  <button
                    onClick={() => setMilestones(milestones.filter((_, j) => j !== i))}
                    style={{ background: "transparent", border: "1px solid #334155", borderRadius: 4, color: "#64748b", fontSize: 10, padding: "2px 6px", cursor: "pointer" }}
                  >✕</button>
                </div>
              ))}
              <button
                onClick={() => setMilestones([...milestones, { name: "New event", month: 24, savings: 500 }])}
                style={{ background: "transparent", border: "1px dashed #334155", borderRadius: 4, color: "#64748b", fontSize: 11, padding: "4px 10px", cursor: "pointer", width: "100%", marginTop: 4, fontFamily: "'Inter', sans-serif" }}
              >+ Add milestone</button>
              {milestones.length > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginTop: 6, paddingTop: 6, borderTop: "1px solid #334155" }}>
                  <span style={{ color: "#64748b" }}>Total reductions (all active):</span>
                  <span style={{ color: "#4ade80", fontFamily: "'JetBrains Mono', monospace" }}>-{fmtFull(milestones.reduce((s, m) => s + m.savings, 0))}/mo</span>
                </div>
              )}
            </div>

            <div style={{ marginTop: 12 }}>
              <h4 style={{ fontSize: 12, color: "#fbbf24", margin: "0 0 8px", textTransform: "uppercase" }}>One-Time Capital Needs (Advance Items)</h4>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Toggle label="" checked={moldInclude} onChange={setMoldInclude} color="#fbbf24" />
                <div style={{ flex: 1, opacity: moldInclude ? 1 : 0.4 }}>
                  <Slider label="Mold remediation" value={moldCost} onChange={setMoldCost} min={20000} max={100000} step={5000} color={moldInclude ? "#fbbf24" : "#334155"} />
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Toggle label="" checked={roofInclude} onChange={setRoofInclude} color="#fbbf24" />
                <div style={{ flex: 1, opacity: roofInclude ? 1 : 0.4 }}>
                  <Slider label="Roof" value={roofCost} onChange={setRoofCost} min={20000} max={60000} step={5000} color={roofInclude ? "#fbbf24" : "#334155"} />
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Toggle label="" checked={otherInclude} onChange={setOtherInclude} color="#fbbf24" />
                <div style={{ flex: 1, opacity: otherInclude ? 1 : 0.4 }}>
                  <Slider label="House projects + toilets" value={otherProjects} onChange={setOtherProjects} min={10000} max={60000} step={5000} color={otherInclude ? "#fbbf24" : "#334155"} />
                </div>
              </div>
            </div>
          </div>
        </div>

        </>}

        {!presentMode && <>{/* Data Table */}
        <div style={{
          background: "#1e293b", borderRadius: 12, padding: 20,
          border: "1px solid #334155", overflowX: "auto"
        }}>
          <h3 style={{ fontSize: 14, color: "#94a3b8", margin: "0 0 12px", fontWeight: 600 }}>Detailed Projections</h3>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #334155" }}>
                {["Period", "Sarah", "MSFT", "LLC", "SSDI", "Consult", "Trust", "Invest/Q", "Total In", "Expenses", "Net/Mo"].map((h, i) => (
                  <th key={i} style={{ padding: "8px 6px", textAlign: i === 0 ? "left" : "right", color: "#64748b", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((d, i) => {
                const isPostVesting = d.msftVesting === 0 && d.month > 0;
                return (
                  <tr key={i} style={{
                    borderBottom: "1px solid #1e293b",
                    background: isPostVesting ? "rgba(245, 158, 11, 0.03)" : (i % 2 === 0 ? "transparent" : "rgba(15, 23, 42, 0.13)")
                  }}>
                    <td style={{ padding: "6px", color: "#94a3b8", fontWeight: 600 }}>{d.label}</td>
                    <td style={{ padding: "6px", textAlign: "right", color: "#60a5fa" }}>{fmt(d.sarahIncome)}</td>
                    <td style={{ padding: "6px", textAlign: "right", color: d.msftVesting > 0 ? (d.msftVesting < 6000 ? "#f87171" : "#f59e0b") : "#334155", fontWeight: d.msftVesting === 0 ? 400 : 600 }}>
                      {d.msftVesting > 0 ? fmt(d.msftVesting) : (d.month > 0 ? "\u2014" : fmt(d.msftVesting))}
                    </td>
                    <td style={{ padding: "6px", textAlign: "right", color: "#c084fc" }}>{fmt(d.llcMonthly)}</td>
                    <td style={{ padding: "6px", textAlign: "right", color: d.ssdi > 0 ? "#fbbf24" : "#334155" }}>{d.ssdi > 0 ? fmt(d.ssdi) : "\u2014"}</td>
                    <td style={{ padding: "6px", textAlign: "right", color: d.consulting > 0 ? "#38bdf8" : "#334155" }}>{d.consulting > 0 ? fmt(d.consulting) : "\u2014"}</td>
                    <td style={{ padding: "6px", textAlign: "right", color: d.trust > 0 ? "#a78bfa" : "#334155" }}>{d.trust > 0 ? fmt(d.trust) : "\u2014"}</td>
                    <td style={{ padding: "6px", textAlign: "right", color: d.investReturnQtr > 0 ? "#22d3ee" : "#334155" }}>{d.investReturnQtr > 0 ? fmt(d.investReturnQtr) : "\u2014"}</td>
                    <td style={{ padding: "6px", textAlign: "right", color: "#e2e8f0", fontWeight: 600 }}>{fmt(d.totalIncome)}</td>
                    <td style={{ padding: "6px", textAlign: "right", color: "#f87171" }}>{fmt(d.expenses)}</td>
                    <td style={{
                      padding: "6px", textAlign: "right", fontWeight: 700,
                      color: d.netMonthly >= 0 ? "#4ade80" : "#f87171"
                    }}>{d.netMonthly >= 0 ? "+" : ""}{fmt(d.netMonthly)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        </>}

        {/* Summary for parents */}
        <div style={{
          background: "linear-gradient(135deg, #1e293b, #0f172a)", borderRadius: 12, padding: 20,
          border: "1px solid #475569", marginTop: 24
        }}>
          <h3 style={{ fontSize: 14, color: "#fbbf24", margin: "0 0 12px", fontWeight: 700 }}>The Ask — Summary</h3>
          <div style={{ fontSize: 13, color: "#cbd5e1", lineHeight: 1.8 }}>
            <p style={{ margin: "0 0 10px" }}>
              <strong style={{ color: "#f59e0b" }}>Critical context:</strong> MSFT retirement stock vesting ({fmtFull(totalRemainingVesting)} remaining) declines sharply in late 2027 and ends entirely by August 2028. This is currently funding ~{fmtFull(data[0].msftVesting)}/month of our expenses and is not replaceable.
              {savingsZeroMonth && (<> At the current burn rate, our {fmtFull(startingSavings)} in savings will be depleted in approximately {savingsZeroLabel}.</>)}
            </p>
            <p style={{ margin: "0 0 10px" }}>
              <strong style={{ color: "#4ade80" }}>SSDI back pay:</strong> Upon approval (~{ssdiApprovalMonth} months out), Chad is entitled to an estimated {fmtFull(ssdiBackPayActual)} lump sum covering {ssdiBackPayMonths} months of retroactive benefits (onset Sept 2024, net of attorney fees). This provides a one-time buffer for savings.
            </p>
            {retireDebt && (
              <p style={{ margin: "0 0 10px" }}>
                <strong style={{ color: "#f8fafc" }}>Debt retirement:</strong> Retire high-interest debt ({fmtFull(debtTotal)}) to free up {fmtFull(debtService)}/month in cash flow.
              </p>
            )}
            {moldInclude && (
              <p style={{ margin: "0 0 10px" }}>
                <strong style={{ color: "#f8fafc" }}>Mold remediation:</strong> {fmtFull(moldCost)} — directly impacts Chad's health (MCAS exacerbated by mold exposure). Urgent.
              </p>
            )}
            {roofInclude && (
              <p style={{ margin: "0 0 10px" }}>
                <strong style={{ color: "#f8fafc" }}>Roof replacement:</strong> {fmtFull(roofCost)} — can be phased but needed within 12 months.
              </p>
            )}
            {otherInclude && (
              <p style={{ margin: "0 0 10px" }}>
                <strong style={{ color: "#f8fafc" }}>House projects + toilets:</strong> {fmtFull(otherProjects)} — can be phased over 12\u201318 months.
              </p>
            )}
            {bcsParentsAnnual > 25000 && (
              <p style={{ margin: "0 0 10px" }}>
                <strong style={{ color: "#c084fc" }}>Ongoing ({bcsYearsLeft} yrs):</strong> Parents increase BCS contribution from $25K to {fmtFull(bcsParentsAnnual)}/yr (our share: {fmtFull(bcsFamilyMonthly)}/mo → {bcsFamilyMonthly === 0 ? "fully covered" : fmtFull(bcsFamilyMonthly) + "/mo"}).
              </p>
            )}
            <p style={{ margin: "0 0 10px" }}>
              <strong style={{ color: "#f8fafc" }}>Total one-time advance request:</strong>{" "}
              <span style={{ color: "#fbbf24", fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", fontSize: 16 }}>
                {fmtFull(advanceNeeded)}
              </span>
            </p>
            <p style={{ margin: 0, color: "#94a3b8", fontSize: 12, fontStyle: "italic" }}>
              With debt retired and SSDI active, monthly cash flow moves from {fmtFull(data[0].netMonthly)} to approximately {fmtFull(data[breakevenIdx >= 0 ? breakevenIdx : 4]?.netMonthly || 0)}/month \u2014 achieving sustainability before vesting ends.
            </p>
          </div>
        </div>
        </>}
      </div>
    </div>
  );
}
