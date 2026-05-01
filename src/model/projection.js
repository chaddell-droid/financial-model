import { MONTHS, MONTH_VALUES, DAYS_PER_MONTH, SGA_LIMIT, SS_EARNINGS_LIMIT_ANNUAL, SS_EARNINGS_LIMIT_FRA_YEAR, SS_FRA_MONTH, SSDI_ATTORNEY_FEE_CAP, PROJECTION_START_MONTH, STOCK_VEST_CALENDAR_MONTHS, buildQuarterlySchedule } from './constants.js';

/**
 * Helpers for lumpy stock-vest calendar math.
 * Refresh grants vest 5% on each Feb/May/Aug/Nov (last day) for 5 years (20 vests).
 */
function isStockVestMonth(m) {
  return STOCK_VEST_CALENDAR_MONTHS.includes((m + PROJECTION_START_MONTH) % 12);
}
// First quarterly vest strictly AFTER `month` (so a grant issued in a vest month
// skips its same-month vest — first payout 3 months later).
function nextStockVestMonthAfter(month) {
  for (let k = month + 1; k <= month + 3; k++) {
    if (isStockVestMonth(k)) return k;
  }
  return month + 3; // fallback (shouldn't hit — vest months are every 3 months)
}
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
  // Back pay includes auxiliary benefits for dependent kids during their eligibility window.
  // Bound auxiliary months by kidsAgeOutMonths as a forward-looking proxy: if kids are
  // eligible at/after approval they were eligible during the (past) back-pay window too.
  // Attorney fee applies only to the worker's share, not auxiliary benefits.
  const totalBackPayMonths = (useSS || chadJob || s.ssdiDenied) ? 0 : (s.ssdiBackPayMonths || 0);
  const auxBackPayMonths = Math.min(totalBackPayMonths, s.kidsAgeOutMonths || 0);
  const adultBackPayGross = totalBackPayMonths * (s.ssdiPersonal || 4214);
  const auxBackPayGross = auxBackPayMonths * Math.max(0, (s.ssdiFamilyTotal || 6321) - (s.ssdiPersonal || 4214));
  const backPayFee = Math.min(Math.round(adultBackPayGross * 0.25), SSDI_ATTORNEY_FEE_CAP);
  const backPayActual = adultBackPayGross + auxBackPayGross - backPayFee;
  const backPayGross = adultBackPayGross + auxBackPayGross;
  const ssStartMonth = s.ssStartMonth ?? 18;
  const ssFamilyTotal = s.ssFamilyTotal || 7099;
  const ssPersonal = s.ssPersonal || 2933;
  const ssKidsAgeOutMonths = s.ssKidsAgeOutMonths ?? 18;
  const ms = s.milestones || [];
  const trustNow = s.trustIncomeNow || 0;
  const trustFuture = s.trustIncomeFuture || 0;
  const trustMonth = s.trustIncreaseMonth ?? 11;
  // Custom levers (Plan Decision Console) — active levers add currentValue to monthly cashIncome.
  const customLeverMonthly = Array.isArray(s.customLevers)
    ? s.customLevers.reduce((sum, lv) => sum + (lv && lv.active ? Math.max(0, Number(lv.currentValue) || 0) : 0), 0)
    : 0;
  const monthlyReturnRate = Math.pow(1 + (s.investmentReturn || 0) / 100, 1/12) - 1;

  // Chad's work duration — driven by chadWorkMonths state field (was hardcoded chadRetirementMonth = 72)
  const chadRetirementMonth = s.chadRetirementMonth || 72;

  // Chad Gets a Job
  // chadJobTaxRate is the ALL-IN effective income tax rate.
  // No-FICA adds 6.2% back (non-SS-covered employer saves that portion).
  // Pension contribution is deducted automatically from gross.
  const chadJobStartMonth = s.chadJobStartMonth ?? 3;
  const ficaSavings = s.chadJobNoFICA ? 0.062 : 0;
  const pensionContrib = (s.chadJobPensionContrib || 0) / 100;
  const chadJobBaseSalary = s.chadJobSalary || 0;
  const chadJobRaisePct = (s.chadJobRaisePct || 0) / 100;
  const chadJobBonusPct = (s.chadJobBonusPct || 0) / 100;
  const chadJobBonusMonth = s.chadJobBonusMonth ?? 8; // 0=Jan, 8=Sept
  const chadJobBonusProrateFirst = s.chadJobBonusProrateFirst !== false;
  const chadJobStockRefresh = s.chadJobStockRefresh || 0;
  const chadJobRefreshStartMonth = s.chadJobRefreshStartMonth ?? 12;
  const chadJobHireStock = [
    s.chadJobHireStockY1 || 0,
    s.chadJobHireStockY2 || 0,
    s.chadJobHireStockY3 || 0,
    s.chadJobHireStockY4 || 0,
  ];
  const chadJobSignOnCash = s.chadJobSignOnCash || 0;
  const chadJobTaxRate = (s.chadJobTaxRate ?? 25) / 100;
  // Pension is deducted from salary only (not bonuses or RSUs, per typical employer rules)
  const chadJobSalaryNetMult = 1 - chadJobTaxRate + ficaSavings - pensionContrib;
  const chadJobBonusNetMult = 1 - chadJobTaxRate + ficaSavings;
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

  // Sarah's practice stops at her work duration
  const sarahRetirementMonth = s.sarahWorkMonths || 72;

  for (let m = 0; m <= months; m++) {
    let sarahIncome = 0;
    if (m <= sarahRetirementMonth) {
      const rate = Math.min(s.sarahRate * Math.pow(1 + s.sarahRateGrowth / 100, m / 12), s.sarahMaxRate);
      const clients = Math.min(s.sarahCurrentClients * Math.pow(1 + s.sarahClientGrowth / 100, m / 12), s.sarahMaxClients);
      const sarahGross = Math.round(rate * clients * DAYS_PER_MONTH);
      sarahIncome = Math.round(sarahGross * (1 - (s.sarahTaxRate ?? 25) / 100));
    }
    const msftSmoothed = getVestingMonthly(m, s.msftGrowth || 0, s.msftPrice);
    const msftLump = getVestingLumpSum(m, s.msftGrowth || 0, s.msftPrice);
    const trustLLC = m < trustMonth ? trustNow : trustFuture;

    // Chad's job income (after tax) — salary compounds with annual raise; bonus
    // is paid as a lump sum once per year in the configured calendar month
    // (default September). First-year bonus prorated by months worked when
    // chadJobBonusProrateFirst is true; otherwise it pays only after a full
    // year of employment.
    let chadJobIncome = 0;
    let chadJobSalaryNet = 0;
    let chadJobBonusNet = 0;
    let chadJobStockRefreshNet = 0;
    let chadJobStockHireNet = 0;
    let chadJobSignOnNet = 0;
    let chadJobBonusGross = 0;
    let chadJobStockGross = 0;
    let chadCurrentAnnualSalary = 0;
    if (chadJob && m >= chadJobStartMonth && m <= chadRetirementMonth) {
      const monthsWorked = m - chadJobStartMonth;
      const yearsWorked = Math.floor(monthsWorked / 12);
      chadCurrentAnnualSalary = chadJobBaseSalary * Math.pow(1 + chadJobRaisePct, yearsWorked);
      const monthlySalaryGross = chadCurrentAnnualSalary / 12;
      chadJobSalaryNet = Math.round(monthlySalaryGross * chadJobSalaryNetMult);

      // Lump-sum bonus on the configured calendar month, after at least 1 month
      // of employment (so a same-month start doesn't pay an instant bonus).
      const calendarMonthOfYear = (m + PROJECTION_START_MONTH) % 12;
      if (chadJobBonusPct > 0 && monthsWorked > 0 && calendarMonthOfYear === chadJobBonusMonth) {
        let bonusFraction;
        if (monthsWorked >= 12) {
          bonusFraction = 1;
        } else if (chadJobBonusProrateFirst) {
          bonusFraction = monthsWorked / 12;
        } else {
          bonusFraction = 0; // strict eligibility — no bonus until 1 full year
        }
        chadJobBonusGross = chadCurrentAnnualSalary * chadJobBonusPct * bonusFraction;
        chadJobBonusNet = Math.round(chadJobBonusGross * chadJobBonusNetMult);
      }

      // Stock comp — both schedules are lumpy.
      // Refresh: first grant issued at start + chadJobRefreshStartMonth (default 12 for
      // MSFT — after first review). Subsequent grants every 12 months thereafter.
      // Each grant vests 5% on the next Feb/May/Aug/Nov (skipping same-month-as-issuance),
      // then every 3 months for 20 quarterly vests total (5 years).
      let refreshGrossThisMonth = 0;
      if (chadJobStockRefresh > 0 && isStockVestMonth(m)) {
        const monthsSinceFirstRefresh = monthsWorked - chadJobRefreshStartMonth;
        if (monthsSinceFirstRefresh >= 0) {
          const maxGrantIdx = Math.floor(monthsSinceFirstRefresh / 12);
          for (let g = 0; g <= maxGrantIdx; g++) {
            const issueMonth = chadJobStartMonth + chadJobRefreshStartMonth + 12 * g;
            if (issueMonth >= m) break; // no instant vest on grant date
            const firstVest = nextStockVestMonthAfter(issueMonth);
            if (m < firstVest) continue;
            const vestIdx = (m - firstVest) / 3; // integer — both endpoints are vest months
            if (vestIdx >= 0 && vestIdx < 20) {
              refreshGrossThisMonth += chadJobStockRefresh * 0.05;
            }
          }
        }
      }
      // Hire stock: lump on each work anniversary (start + 12, +24, +36, +48).
      let hireGrossThisMonth = 0;
      if (monthsWorked > 0 && monthsWorked % 12 === 0) {
        const yearIdx = monthsWorked / 12 - 1; // m=startMonth+12 → Y1 amount
        if (yearIdx >= 0 && yearIdx < 4) {
          hireGrossThisMonth = chadJobHireStock[yearIdx];
        }
      }
      chadJobStockGross = refreshGrossThisMonth + hireGrossThisMonth;
      chadJobStockRefreshNet = refreshGrossThisMonth > 0 ? Math.round(refreshGrossThisMonth * chadJobBonusNetMult) : 0;
      chadJobStockHireNet = hireGrossThisMonth > 0 ? Math.round(hireGrossThisMonth * chadJobBonusNetMult) : 0;

      // Cash sign-on bonus — 50% on hire date (m === startMonth), 50% on 1-yr anniversary.
      if (chadJobSignOnCash > 0) {
        if (monthsWorked === 0) {
          chadJobSignOnNet = Math.round(chadJobSignOnCash * 0.5 * chadJobBonusNetMult);
        } else if (monthsWorked === 12) {
          chadJobSignOnNet = Math.round(chadJobSignOnCash * 0.5 * chadJobBonusNetMult);
        }
      }

      chadJobIncome = chadJobSalaryNet + chadJobBonusNet + chadJobStockRefreshNet + chadJobStockHireNet + chadJobSignOnNet;
    }

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
    const consulting = (m > chadRetirementMonth) ? 0
      : chadJob ? 0
      : useSS
        ? (m >= ssStartMonth ? (s.chadConsulting || 0) : 0)
        : (m >= effectiveSsdiApproval ? Math.min(s.chadConsulting || 0, SGA_LIMIT) : 0);
    // SS earnings test: applies to total earned income (salary if employed, consulting if not)
    const ssPreTestBenefit = ssBenefit;
    if (useSS && ssBenefit > 0) {
      const isEmployed = chadJob && m >= chadJobStartMonth && m <= chadRetirementMonth;
      // Annualized stock comp for SS earnings test — chadJobStockGross is lumpy
      // (only nonzero on quarterly vest / anniversary months), so we project the
      // expected annual stock comp from the current year of employment instead.
      const yearsWorkedForSS = Math.max(0, Math.floor((m - chadJobStartMonth) / 12));
      // Refresh grants begin at chadJobRefreshStartMonth — none active before that.
      const monthsSinceFirstRefreshForSS = (m - chadJobStartMonth) - chadJobRefreshStartMonth;
      const activeRefreshForSS = monthsSinceFirstRefreshForSS < 0
        ? 0
        : Math.min(5, Math.floor(monthsSinceFirstRefreshForSS / 12) + 1);
      const annualStockProjected = activeRefreshForSS * 0.20 * chadJobStockRefresh
        + (yearsWorkedForSS < 4 ? chadJobHireStock[yearsWorkedForSS] : 0);
      // Sign-on cash: 50% in employment year 0, 50% in year 1.
      const signOnYear = yearsWorkedForSS === 0 || yearsWorkedForSS === 1 ? chadJobSignOnCash * 0.5 : 0;
      const annualEarned = isEmployed
        ? chadCurrentAnnualSalary * (1 + chadJobBonusPct) + annualStockProjected + signOnYear  // salary + bonus + RSU + sign-on
        : consulting * 12;                                                                       // annualized consulting
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

    // Base living expenses with optional inflation (debt/van/BCS are fixed contracts, not inflated)
    let inflatedBase = s.baseExpenses;
    if (s.expenseInflation) {
      inflatedBase = Math.round(inflatedBase * Math.pow(1 + (s.expenseInflationRate || 0) / 100, m / 12));
    }
    // Track expense breakdown so tooltips can show the math that rolls up to `expenses`.
    const expenseBreakdown = { baseLiving: inflatedBase };
    let expenses = inflatedBase;
    if (!s.retireDebt) {
      expenses += s.debtService;
      expenseBreakdown.debtService = s.debtService;
    }
    // Van: if sold, monthly cost stops at sale month; if not sold, cost continues forever
    const vanSaleMonth = s.vanSaleMonth ?? 12;
    if (s.vanSold) {
      if (m < vanSaleMonth) {
        expenses += (s.vanMonthlySavings || 0); // still paying before sale
        expenseBreakdown.van = s.vanMonthlySavings || 0;
      }
    } else {
      expenses += (s.vanMonthlySavings || 0); // never sold, always paying
      expenseBreakdown.van = s.vanMonthlySavings || 0;
    }
    const totalCuts = (s.lifestyleCuts || 0) + (s.cutInHalf || 0) + (s.extraCuts || 0);
    if (s.lifestyleCutsApplied) {
      const appliedCuts = Math.round(totalCuts * cutsDiscipline);
      expenses -= appliedCuts;
      expenseBreakdown.lifestyleCuts = -appliedCuts;
    }
    if (m < (s.bcsYearsLeft ?? 3) * 12) {
      expenses += s.bcsFamilyMonthly;
      expenseBreakdown.bcs = s.bcsFamilyMonthly;
    }
    let milestoneSavings = 0;
    for (const mi of ms) { if (m >= mi.month) milestoneSavings += (mi.savings || 0); }
    if (milestoneSavings > 0) {
      expenses -= milestoneSavings;
      expenseBreakdown.milestones = -milestoneSavings;
    }
    // Employer health insurance saves on premiums
    if (chadJob && m >= chadJobStartMonth && m <= chadRetirementMonth) {
      expenses -= chadJobHealthSavings;
      expenseBreakdown.healthInsurance = -chadJobHealthSavings;
    }
    // One-time extras: temporary additional costs for a limited duration
    const oneTimeExtras = s.oneTimeExtras || 0;
    const oneTimeMonths = s.oneTimeMonths || 0;
    if (oneTimeExtras > 0 && m < oneTimeMonths) {
      expenses += oneTimeExtras;
      expenseBreakdown.oneTimeExtras = oneTimeExtras;
    }
    expenses = Math.max(expenses, 0);

    // Canonical monthly cash-flow rows use actual vest timing so they reconcile to
    // savings balance changes. Keep smoothed MSFT as an explicit secondary series.
    const cashIncome = sarahIncome + msftLump + trustLLC + ssBenefit + consulting + chadJobIncome + customLeverMonthly;
    const cashIncomeSmoothed = sarahIncome + msftSmoothed + trustLLC + ssBenefit + consulting + chadJobIncome + customLeverMonthly;

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
      chadJobSalaryNet, chadJobBonusNet, chadJobStockRefreshNet, chadJobStockHireNet, chadJobSignOnNet,
      investReturn, cashIncome, cashIncomeSmoothed, expenses, expenseBreakdown, homeEquity,
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

    // Aggregate expense breakdown across the quarter (monthly average per component).
    const expenseBreakdownKeys = new Set();
    for (const mo of months) {
      if (mo.expenseBreakdown) for (const k of Object.keys(mo.expenseBreakdown)) expenseBreakdownKeys.add(k);
    }
    const expenseBreakdownAvg = {};
    for (const k of expenseBreakdownKeys) {
      const sum = months.reduce((s, mo) => s + ((mo.expenseBreakdown && mo.expenseBreakdown[k]) || 0), 0);
      expenseBreakdownAvg[k] = Math.round(sum / months.length);
    }

    return {
      label: qLabels[i], month: m,
      sarahIncome: Math.round(months.reduce((sum, d) => sum + d.sarahIncome, 0) / months.length),
      msftVesting: Math.round(months.reduce((sum, d) => sum + d.msftLump, 0) / months.length),
      trustLLC: Math.round(months.reduce((sum, d) => sum + d.trustLLC, 0) / months.length),
      ssBenefit: Math.round(months.reduce((sum, d) => sum + d.ssBenefit, 0) / months.length),
      ssBenefitType: months.find(d => d.ssBenefitType)?.ssBenefitType ?? null,
      consulting: Math.round(months.reduce((sum, d) => sum + d.consulting, 0) / months.length),
      chadJobIncome: Math.round(months.reduce((sum, d) => sum + d.chadJobIncome, 0) / months.length),
      // ChadJob breakdown (monthly avg across the quarter)
      chadJobSalary: Math.round(months.reduce((sum, d) => sum + (d.chadJobSalaryNet || 0), 0) / months.length),
      chadJobBonus: Math.round(months.reduce((sum, d) => sum + (d.chadJobBonusNet || 0), 0) / months.length),
      chadJobStockRefresh: Math.round(months.reduce((sum, d) => sum + (d.chadJobStockRefreshNet || 0), 0) / months.length),
      chadJobStockHire: Math.round(months.reduce((sum, d) => sum + (d.chadJobStockHireNet || 0), 0) / months.length),
      chadJobSignOn: Math.round(months.reduce((sum, d) => sum + (d.chadJobSignOnNet || 0), 0) / months.length),
      investReturn: avgInvestReturn,
      investReturnQtr: qtrInvestReturn,
      totalIncome: Math.round(avgCashIncome + avgInvestReturn),
      expenses: avgExpenses,
      expenseBreakdown: expenseBreakdownAvg,
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

