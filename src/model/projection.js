import { MONTHS, MONTH_VALUES, DAYS_PER_MONTH, SGA_LIMIT } from './constants.js';
import { getVestingMonthly, getVestingLumpSum } from './vesting.js';

/**
 * Core monthly simulation loop — single source of truth for all projections.
 * Accepts `cutsDiscipline` (default 1.0) to scale lifestyle cuts for Monte Carlo.
 * Returns { monthlyData, backPayActual }.
 */
export function runMonthlySimulation(s) {
  const months = 72;
  const cutsDiscipline = s.cutsDiscipline ?? 1.0;
  const useSS = s.ssType === 'ss';
  // If SS retirement: no SSDI, no back pay. If SSDI denied: push approval to never.
  const effectiveSsdiApproval = useSS ? 999 : (s.ssdiDenied ? 999 : (s.ssdiApprovalMonth || 7));
  const backPayGross = useSS ? 0 : (s.ssdiDenied ? 0 : (s.ssdiBackPayMonths || 0) * (s.ssdiPersonal || 4152));
  const backPayFee = Math.min(Math.round(backPayGross * 0.25), 9200);
  const backPayActual = backPayGross - backPayFee;
  const ssStartMonth = s.ssStartMonth || 18;
  const ssFamilyTotal = s.ssFamilyTotal || 7099;
  const ssPersonal = s.ssPersonal || 2933;
  const ssKidsAgeOutMonths = s.ssKidsAgeOutMonths || 18;
  const ms = s.milestones || [];
  const trustNow = s.trustIncomeNow || 0;
  const trustFuture = s.trustIncomeFuture || 0;
  const trustMonth = s.trustIncreaseMonth || 11;
  const monthlyReturnRate = Math.pow(1 + (s.investmentReturn || 0) / 100, 1/12) - 1;

  // Chad Gets a Job
  const chadJob = s.chadJob || false;
  const chadJobStartMonth = s.chadJobStartMonth || 3;
  const chadJobMonthlyGross = chadJob ? Math.round((s.chadJobSalary || 0) / 12) : 0;
  const chadJobMonthlyNet = chadJob ? Math.round((s.chadJobSalary || 0) * (1 - (s.chadJobTaxRate || 25) / 100) / 12) : 0;
  const chadJobHealthSavings = chadJob ? (s.chadJobHealthSavings || 4200) : 0;
  // SS earnings test: before FRA (67), SS reduced by $1 per $2 earned above annual limit
  const ssEarningsLimitAnnual = 22320; // 2026 estimate
  const ssAnnualExcess = chadJob ? Math.max(0, (s.chadJobSalary || 0) - ssEarningsLimitAnnual) : 0;
  const ssMonthlyReduction = Math.round(ssAnnualExcess / 2 / 12); // $1 per $2 excess, monthly

  const monthlyData = [];
  let balance = s.startingSavings || 0;

  for (let m = 0; m <= months; m++) {
    const rate = Math.min(s.sarahRate * Math.pow(1 + s.sarahRateGrowth / 100, m / 12), s.sarahMaxRate);
    const clients = Math.min(s.sarahCurrentClients * Math.pow(1 + s.sarahClientGrowth / 100, m / 12), s.sarahMaxClients);
    const sarahIncome = Math.round(rate * clients * DAYS_PER_MONTH);
    const msftSmoothed = getVestingMonthly(m, s.msftGrowth || 0);
    const msftLump = getVestingLumpSum(m, s.msftGrowth || 0);
    const trustLLC = m < trustMonth ? trustNow : trustFuture;

    // Chad's job income (after tax)
    const chadJobIncome = (chadJob && m >= chadJobStartMonth) ? chadJobMonthlyNet : 0;

    let ssdi = 0;
    if (useSS) {
      // SS retirement: family total while twins are under 18, then personal only
      if (m >= ssStartMonth) {
        const rawSS = (m < ssStartMonth + ssKidsAgeOutMonths) ? ssFamilyTotal : ssPersonal;
        // Apply earnings test if Chad has a job — reduces SS benefits
        if (chadJob && m >= chadJobStartMonth) {
          ssdi = Math.max(0, rawSS - ssMonthlyReduction);
        } else {
          ssdi = rawSS;
        }
      }
    } else if (m >= effectiveSsdiApproval) {
      // SSDI: a full-time job exceeds SGA, disqualifying SSDI
      if (chadJob && m >= chadJobStartMonth) {
        ssdi = 0; // Can't receive SSDI while working full-time
      } else {
        ssdi = m < effectiveSsdiApproval + s.kidsAgeOutMonths ? s.ssdiFamilyTotal : s.ssdiPersonal;
      }
    }
    // Consulting: SGA limit only applies under SSDI, not SS retirement
    // If Chad has a full-time job, consulting is replaced by the job
    const consulting = (chadJob && m >= chadJobStartMonth) ? 0
      : useSS
        ? (m >= ssStartMonth ? (s.chadConsulting || 0) : 0)
        : (m >= effectiveSsdiApproval ? Math.min(s.chadConsulting || 0, SGA_LIMIT) : 0);

    const investReturn = balance > 0 ? Math.round(balance * monthlyReturnRate) : 0;

    let expenses = s.baseExpenses;
    if (!s.retireDebt) expenses += s.debtService;
    if (!s.vanSold) expenses += (s.vanMonthlySavings || 0);
    const totalCuts = (s.lifestyleCuts || 0) + (s.cutInHalf || 0) + (s.extraCuts || 0);
    if (s.lifestyleCutsApplied) expenses -= totalCuts * cutsDiscipline;
    if (m < (s.bcsYearsLeft || 3) * 12) expenses += s.bcsFamilyMonthly;
    for (const mi of ms) { if (m >= mi.month) expenses -= mi.savings; }
    // Employer health insurance saves on premiums
    if (chadJob && m >= chadJobStartMonth) expenses -= chadJobHealthSavings;
    expenses = Math.max(expenses, 0);

    const cashIncome = sarahIncome + msftSmoothed + trustLLC + ssdi + consulting + chadJobIncome;
    const cashIncomeLump = sarahIncome + msftLump + trustLLC + ssdi + consulting + chadJobIncome;

    balance += investReturn;
    balance += (cashIncomeLump - expenses);
    if (m === effectiveSsdiApproval + 2) balance += backPayActual;

    monthlyData.push({
      month: m,
      sarahIncome, msftSmoothed, msftLump, trustLLC, ssdi, consulting, chadJobIncome,
      investReturn, cashIncome, expenses,
      netCashFlow: cashIncome - expenses,
      netMonthly: cashIncome + investReturn - expenses,
      balance: Math.round(balance),
    });
  }

  return { monthlyData, backPayActual };
}

export function computeProjection(s) {
  const { monthlyData, backPayActual } = runMonthlySimulation(s);

  // Aggregate to quarterly snapshots for charts (every 3rd month starting at 0)
  const data = MONTH_VALUES.map((m, i) => {
    const months = monthlyData.filter(d => d.month >= m && d.month < m + 3);
    if (months.length === 0) return null;

    const first = months[0];
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
      trustLLC: first.trustLLC,
      ssdi: first.ssdi,
      consulting: first.consulting,
      chadJobIncome: first.chadJobIncome,
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

export function computeWealthProjection(s) {
  const months = 72;
  const monthly401kRate = Math.pow(1 + (s.return401k || 8) / 100, 1/12) - 1;
  const monthlyHomeRate = Math.pow(1 + (s.homeAppreciation || 4) / 100, 1/12) - 1;
  const wealthData = [];
  let bal401k = s.starting401k || 0;
  let home = s.homeEquity || 0;
  for (let m = 0; m <= months; m++) {
    if (m > 0) {
      bal401k *= (1 + monthly401kRate);
      home *= (1 + monthlyHomeRate);
    }
    wealthData.push({ month: m, balance401k: Math.round(bal401k), homeEquity: Math.round(home) });
  }
  return { wealthData };
}
