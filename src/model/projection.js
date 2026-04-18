import { MONTHS, MONTH_VALUES, DAYS_PER_MONTH, SGA_LIMIT, SS_EARNINGS_LIMIT_ANNUAL, SS_EARNINGS_LIMIT_FRA_YEAR, SS_FRA_MONTH, SSDI_ATTORNEY_FEE_CAP, CHAD_RETIREMENT_MONTH, buildQuarterlySchedule } from './constants.js';
import { getVestingMonthly, getVestingLumpSum } from './vesting.js';

export function findOperationalBreakevenIndex(rows) {
  if (!Array.isArray(rows)) return -1;
  return rows.findIndex((row) => (
    row?.netCashFlowSmoothed
    ?? row?.netCashFlow
    ?? Number.NEGATIVE_INFINITY
  ) >= 0);
}

/**
 * Core monthly simulation loop — single source of truth for all projections.
 * Tracks both savings balance AND 401k balance. When savings would go negative,
 * draws from 401k to cover the deficit (no early withdrawal penalty at 60+).
 * Accepts `cutsDiscipline` (default 1.0) to scale lifestyle cuts for Monte Carlo.
 * Returns { monthlyData, backPayActual }.
 */
export function runMonthlySimulation(s) {
  const months = s.totalProjectionMonths || 72;
  const cutsDiscipline = s.cutsDiscipline ?? 1.0;
  const useSS = s.ssType === 'ss';
  const chadJob = s.chadJob || false;
  // If SS retirement, SSDI denied, or Chad has a job: no SSDI, no back pay.
  const effectiveSsdiApproval = (useSS || chadJob) ? 999 : (s.ssdiDenied ? 999 : (s.ssdiApprovalMonth ?? 7));
  const backPayGross = (useSS || chadJob) ? 0 : (s.ssdiDenied ? 0 : (s.ssdiBackPayMonths || 0) * (s.ssdiPersonal || 4152));
  const backPayFee = Math.min(Math.round(backPayGross * 0.25), SSDI_ATTORNEY_FEE_CAP);
  const backPayActual = backPayGross - backPayFee;
  const ssStartMonth = s.ssStartMonth ?? 18;
  const ssFamilyTotal = s.ssFamilyTotal || 7099;
  const ssPersonal = s.ssPersonal || 2933;
  const ssKidsAgeOutMonths = s.ssKidsAgeOutMonths ?? 18;
  const ms = s.milestones || [];
  const trustNow = s.trustIncomeNow || 0;
  const trustFuture = s.trustIncomeFuture || 0;
  const trustMonth = s.trustIncreaseMonth ?? 11;
  const monthlyReturnRate = Math.pow(1 + (s.investmentReturn || 0) / 100, 1/12) - 1;

  // Chad Gets a Job
  const chadJobStartMonth = s.chadJobStartMonth ?? 3;
  const ficaRate = s.chadJobNoFICA ? 0 : 0.062;
  const pensionContribRate = (s.chadJobPensionContrib || 0) / 100;
  const chadJobMonthlyNet = chadJob
    ? Math.round((s.chadJobSalary || 0) * (1 - (s.chadJobTaxRate || 25) / 100 - ficaRate - pensionContribRate) / 12)
    : 0;
  const chadJobHealthSavings = chadJob ? (s.chadJobHealthSavings || 4200) : 0;

  // 401k and home equity — tracked alongside savings for deficit drawdown
  const monthly401kRate = Math.pow(1 + (s.return401k ?? 8) / 100, 1/12) - 1;
  const monthlyHomeRate = Math.pow(1 + (s.homeAppreciation ?? 4) / 100, 1/12) - 1;

  const monthlyData = [];
  let balance = s.startingSavings || 0;
  let bal401k = s.starting401k || 0;
  let homeEquity = s.homeEquity || 0;
  let ssMonthsWithheld = 0;
  let ssTotalAmountWithheld = 0;

  for (let m = 0; m <= months; m++) {
    const rate = Math.min(s.sarahRate * Math.pow(1 + s.sarahRateGrowth / 100, m / 12), s.sarahMaxRate);
    const clients = Math.min(s.sarahCurrentClients * Math.pow(1 + s.sarahClientGrowth / 100, m / 12), s.sarahMaxClients);
    const sarahGross = Math.round(rate * clients * DAYS_PER_MONTH);
    const sarahIncome = Math.round(sarahGross * (1 - (s.sarahTaxRate ?? 25) / 100));
    const msftSmoothed = getVestingMonthly(m, s.msftGrowth || 0, s.msftPrice);
    const msftLump = getVestingLumpSum(m, s.msftGrowth || 0, s.msftPrice);
    const trustLLC = m < trustMonth ? trustNow : trustFuture;

    // Chad's job income (after tax)
    const chadJobIncome = (chadJob && m >= chadJobStartMonth && m <= CHAD_RETIREMENT_MONTH) ? chadJobMonthlyNet : 0;

    // SS/SSDI income — SS retirement can coexist with job (earnings test applies);
    // SSDI requires no job (SGA rules)
    let ssBenefit = 0;
    if (useSS) {
      if (m >= ssStartMonth) {
        ssBenefit = (m < ssStartMonth + ssKidsAgeOutMonths) ? ssFamilyTotal : ssPersonal;
      }
    } else if (!chadJob && m >= effectiveSsdiApproval) {
      ssBenefit = m < effectiveSsdiApproval + s.kidsAgeOutMonths ? s.ssdiFamilyTotal : s.ssdiPersonal;
    }
    // Consulting: only when not employed full-time
    const consulting = (m > CHAD_RETIREMENT_MONTH) ? 0
      : chadJob ? 0
      : useSS
        ? (m >= ssStartMonth ? (s.chadConsulting || 0) : 0)
        : (m >= effectiveSsdiApproval ? Math.min(s.chadConsulting || 0, SGA_LIMIT) : 0);
    // SS earnings test: applies to total earned income (salary if employed, consulting if not)
    const ssPreTestBenefit = ssBenefit;
    if (useSS && ssBenefit > 0) {
      const isEmployed = chadJob && m >= chadJobStartMonth && m <= CHAD_RETIREMENT_MONTH;
      const annualEarned = isEmployed
        ? (s.chadJobSalary || 0)  // gross salary for earnings test
        : consulting * 12;        // annualized consulting
      if (annualEarned > 0) {
        if (m >= SS_FRA_MONTH) {
          // At/after FRA: no earnings test
        } else if (m >= SS_FRA_MONTH - 12) {
          // In FRA year: higher limit, $1 per $3 over
          const annualExcess = Math.max(0, annualEarned - SS_EARNINGS_LIMIT_FRA_YEAR);
          ssBenefit = Math.max(0, ssBenefit - Math.round(annualExcess / 3 / 12));
        } else {
          // Before FRA year: standard limit, $1 per $2 over
          const annualExcess = Math.max(0, annualEarned - SS_EARNINGS_LIMIT_ANNUAL);
          ssBenefit = Math.max(0, ssBenefit - Math.round(annualExcess / 2 / 12));
        }
      }
    }
    if (useSS && ssPreTestBenefit > 0) {
      const ssWithheldThisMonth = ssPreTestBenefit - ssBenefit;
      if (ssWithheldThisMonth > 0) { ssMonthsWithheld++; ssTotalAmountWithheld += ssWithheldThisMonth; }
    }

    const investReturn = balance > 0 ? Math.round(balance * monthlyReturnRate) : 0;

    let expenses = s.baseExpenses;
    if (!s.retireDebt) expenses += s.debtService;
    // Van: if sold, monthly cost stops at sale month; if not sold, cost continues forever
    const vanSaleMonth = s.vanSaleMonth ?? 12;
    if (s.vanSold) {
      if (m < vanSaleMonth) expenses += (s.vanMonthlySavings || 0); // still paying before sale
    } else {
      expenses += (s.vanMonthlySavings || 0); // never sold, always paying
    }
    const totalCuts = (s.lifestyleCuts || 0) + (s.cutInHalf || 0) + (s.extraCuts || 0);
    if (s.lifestyleCutsApplied) expenses -= totalCuts * cutsDiscipline;
    if (m < (s.bcsYearsLeft ?? 3) * 12) expenses += s.bcsFamilyMonthly;
    for (const mi of ms) { if (m >= mi.month) expenses -= mi.savings; }
    // Employer health insurance saves on premiums
    if (chadJob && m >= chadJobStartMonth && m <= CHAD_RETIREMENT_MONTH) expenses -= chadJobHealthSavings;
    // One-time extras: temporary additional costs for a limited duration
    const oneTimeExtras = s.oneTimeExtras || 0;
    const oneTimeMonths = s.oneTimeMonths || 0;
    if (oneTimeExtras > 0 && m < oneTimeMonths) expenses += oneTimeExtras;
    expenses = Math.max(expenses, 0);

    // Canonical monthly cash-flow rows use actual vest timing so they reconcile to
    // savings balance changes. Keep smoothed MSFT as an explicit secondary series.
    const cashIncome = sarahIncome + msftLump + trustLLC + ssBenefit + consulting + chadJobIncome;
    const cashIncomeSmoothed = sarahIncome + msftSmoothed + trustLLC + ssBenefit + consulting + chadJobIncome;

    balance += investReturn;
    balance += (cashIncome - expenses);
    if (m === effectiveSsdiApproval + 2) balance += backPayActual;
    // Van sale shortfall: one-time cost at sale month (loan balance - sale price)
    if (s.vanSold && m === vanSaleMonth) {
      const vanShortfall = Math.max(0, (s.vanLoanBalance || 0) - (s.vanSalePrice || 0));
      balance -= vanShortfall;
    }

    // 401k grows (skip month 0 to match standalone behavior)
    if (m > 0) bal401k *= (1 + monthly401kRate);
    bal401k = Math.round(bal401k);

    // Deficit transfer chain: savings → 401k → home equity (HELOC)
    let withdrawal401k = 0;
    let withdrawalHome = 0;
    if (balance < 0 && bal401k > 0) {
      withdrawal401k = Math.min(Math.round(-balance), bal401k);
      balance += withdrawal401k;
      bal401k -= withdrawal401k;
    }
    // If still negative after 401k exhausted, draw from home equity
    if (balance < 0 && homeEquity > 0) {
      withdrawalHome = Math.min(Math.round(-balance), homeEquity);
      balance += withdrawalHome;
      homeEquity -= withdrawalHome;
    }

    // Home equity appreciates (even if partially drawn via HELOC)
    if (m > 0) homeEquity = Math.round(homeEquity * (1 + monthlyHomeRate));

    const ssBenefitType = ssBenefit > 0 ? (useSS ? 'retirement' : 'ssdi') : null;
    monthlyData.push({
      month: m,
      sarahIncome, msftSmoothed, msftLump, trustLLC, ssBenefit, ssBenefitType, consulting, chadJobIncome,
      investReturn, cashIncome, cashIncomeSmoothed, expenses, homeEquity,
      netCashFlow: cashIncome - expenses,
      netCashFlowSmoothed: cashIncomeSmoothed - expenses,
      netMonthly: cashIncome + investReturn - expenses,
      netMonthlySmoothed: cashIncomeSmoothed + investReturn - expenses,
      balance: Math.round(balance),
      balance401k: bal401k,
      withdrawal401k,
    });
  }

  return { monthlyData, backPayActual, ssWithheldSummary: { monthsFullyWithheld: ssMonthsWithheld, totalAmountWithheld: ssTotalAmountWithheld } };
}

export function computeProjection(s) {
  const { monthlyData, backPayActual, ssWithheldSummary } = runMonthlySimulation(s);

  // Aggregate to quarterly snapshots for charts (every 3rd month starting at 0)
  const { labels: qLabels, monthValues: qMonthValues } = buildQuarterlySchedule(s.totalProjectionMonths || 72);
  const data = qMonthValues.map((m, i) => {
    const months = monthlyData.filter(d => d.month >= m && d.month < m + 3);
    if (months.length === 0) return null;

    const qtrInvestReturn = months.reduce((sum, d) => sum + d.investReturn, 0);
    const avgInvestReturn = Math.round(qtrInvestReturn / months.length);
    const avgCashIncome = Math.round(months.reduce((sum, d) => sum + d.cashIncome, 0) / months.length);
    const avgExpenses = Math.round(months.reduce((sum, d) => sum + d.expenses, 0) / months.length);
    const avgNetCash = Math.round(months.reduce((sum, d) => sum + d.netCashFlow, 0) / months.length);
    const avgNetMonthly = Math.round(months.reduce((sum, d) => sum + d.netMonthly, 0) / months.length);

    return {
      label: qLabels[i], month: m,
      sarahIncome: Math.round(months.reduce((sum, d) => sum + d.sarahIncome, 0) / months.length),
      msftVesting: Math.round(months.reduce((sum, d) => sum + d.msftLump, 0) / months.length),
      trustLLC: Math.round(months.reduce((sum, d) => sum + d.trustLLC, 0) / months.length),
      ssBenefit: Math.round(months.reduce((sum, d) => sum + d.ssBenefit, 0) / months.length),
      ssBenefitType: months.find(d => d.ssBenefitType)?.ssBenefitType ?? null,
      consulting: Math.round(months.reduce((sum, d) => sum + d.consulting, 0) / months.length),
      chadJobIncome: Math.round(months.reduce((sum, d) => sum + d.chadJobIncome, 0) / months.length),
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
    // Month 0 is the first simulated snapshot, not an opening balance.
    const label = d.month === 0 ? "M0" : d.month < 12 ? `M${d.month}` : mo === 0 ? `Y${yr}` : `Y${yr}.${Math.round(mo/12*10)/10}`;
    return { month: d.month, balance: d.balance, label };
  });

  return { data, savingsData, backPayActual, monthlyData, ssWithheldSummary };
}

