/**
 * Bridge between the tax engine and the financial model's projection loop.
 *
 * buildTaxSchedule(s) pre-computes per-year tax results for the full
 * projection horizon. The projection loop looks up the current year's
 * monthly tax amounts instead of applying a flat rate.
 */

import { DAYS_PER_MONTH, PROJECTION_START_MONTH, STOCK_VEST_CALENDAR_MONTHS, TWINS_AGE_OUT_MONTH, SSDI_ATTORNEY_FEE_CAP } from './constants.js';

// Mirror the projection's quarterly stock-vest helpers (kept in sync).
function isStockVestMonth(m) {
  return STOCK_VEST_CALENDAR_MONTHS.includes((m + PROJECTION_START_MONTH) % 12);
}
function nextStockVestMonthAfter(month) {
  for (let k = month + 1; k <= month + 3; k++) {
    if (isStockVestMonth(k)) return k;
  }
  return month + 3;
}
import { BRACKETS_MFJ_2026, getSaltCapForYear } from './taxConstants.js';
import { calculateTax } from './taxEngine.js';

/**
 * Inflate bracket thresholds by a compounding factor.
 * Returns a new brackets array with scaled thresholds (rates unchanged).
 */
export function inflateBrackets(brackets, factor) {
  return brackets.map(([cap, rate]) =>
    [cap === Infinity ? Infinity : Math.round(cap * factor), rate]
  );
}

/**
 * Build tax params from gathered state, optionally inflation-adjusted.
 * Returns the deduction/credit inputs for calculateTax().
 */
export function getTaxInputs(s, yearIndex) {
  const factor = s.taxInflationAdjust
    ? Math.pow(1 + (s.taxInflationRate || 2) / 100, yearIndex)
    : 1;

  return {
    propertyTax: Math.round((s.taxPropertyTax || 0) * factor),
    salesTax: Math.round((s.taxSalesTax || 0) * factor),
    personalPropTax: Math.round((s.taxPersonalPropTax || 0) * factor),
    mortgageInt: Math.round((s.taxMortgageInt || 0) * factor),
    charitable: Math.round((s.taxCharitable || 0) * factor),
    totalMedicalInput: Math.round((s.taxMedical || 0) * factor),
    ctcChildren: s.taxCtcChildren ?? 2,
    odcDependents: s.taxOdcDependents ?? 0,
    capGainLoss: s.taxCapGainLoss ?? -3000,
    solo401kContribution: s.taxSolo401k ?? 0,
    w2Withholding: s.taxW2Withholding ?? 0,
  };
}

/**
 * Pre-estimate annual SS/SSDI benefits for each projection year.
 * Mirrors the SS income logic from projection.js so the tax schedule
 * can incorporate SS benefit taxation before the monthly loop runs.
 *
 * FIX #4: Includes SSDI back-pay lump (paid at effectiveSsdiApproval + 2)
 * in the year that contains the back-pay receipt month, so up-to-85%
 * taxability of that lump is captured. Gating mirrors projection.js:
 *   - only when ssType==='ssdi' (i.e. !useSS) AND !ssdiDenied AND !chadJob.
 */
function estimateAnnualSSBenefits(s) {
  const useSS = s.ssType === 'ss';
  const chadJob = s.chadJob || false;
  const months = s.totalProjectionMonths || 72;
  const years = Math.ceil(months / 12);
  const annualBenefits = new Array(years).fill(0);
  const ssStart = s.ssStartMonth ?? 18;
  const ssKidsOut = s.ssKidsAgeOutMonths ?? 18;
  const ssdiApproval = s.ssdiApprovalMonth ?? 7;
  const kidsOut = s.kidsAgeOutMonths || 0;

  for (let m = 0; m < months; m++) {
    let benefit = 0;
    if (useSS && m >= ssStart) {
      benefit = (m < ssStart + ssKidsOut) ? (s.ssFamilyTotal || 0) : (s.ssPersonal || 0);
    } else if (!useSS && !chadJob && !s.ssdiDenied && m >= ssdiApproval) {
      benefit = (m < ssdiApproval + kidsOut) ? (s.ssdiFamilyTotal || 0) : (s.ssdiPersonal || 0);
    }
    annualBenefits[Math.floor(m / 12)] += benefit;
  }

  // FIX #4: Add SSDI back-pay to the calendar year containing approval+2.
  // Re-derive backPayActual the same way projection.js does (in case the caller
  // hasn't already attached it to state).
  if (!useSS && !chadJob && !s.ssdiDenied && (s.ssdiBackPayMonths || 0) > 0) {
    const totalBackPayMonths = s.ssdiBackPayMonths || 0;
    const auxBackPayMonths = Math.min(totalBackPayMonths, kidsOut);
    const ssdiPersonal = s.ssdiPersonal || 4214;
    const ssdiFamilyTotal = s.ssdiFamilyTotal || 6321;
    const adultBackPayGross = totalBackPayMonths * ssdiPersonal;
    const auxBackPayGross = auxBackPayMonths * Math.max(0, ssdiFamilyTotal - ssdiPersonal);
    const backPayFee = Math.min(Math.round(adultBackPayGross * 0.25), SSDI_ATTORNEY_FEE_CAP);
    const backPayActual = adultBackPayGross + auxBackPayGross - backPayFee;
    const receiptMonth = ssdiApproval + 2;
    const receiptYearIdx = Math.floor(receiptMonth / 12);
    if (receiptYearIdx >= 0 && receiptYearIdx < years) {
      annualBenefits[receiptYearIdx] += backPayActual;
    }
  }

  return annualBenefits;
}

/**
 * Pre-compute per-year tax results for the entire projection.
 *
 * For each projection year:
 *   1. Sum Sarah's monthly gross across 12 months, apply expense ratio → Sch C net
 *   2. Determine Chad's W-2 wages (pro-rated if partial year)
 *   3. Call calculateTax() for full household, then again with schCNet=0
 *   4. Sarah's attributed tax = full - w2Only (marginal method)
 *
 * Returns an array indexed by year, each with monthly tax amounts.
 *
 * Note: inflation adjustment applies to brackets and SALT cap (parameterizable)
 * and to user-entered deduction amounts. SS wage base, standard deduction,
 * QBI thresholds, and Medicare thresholds are NOT inflated in this version.
 */
export function buildTaxSchedule(s) {
  const months = s.totalProjectionMonths || 72;
  const years = Math.ceil((months + 1) / 12);
  const expenseRatio = (s.taxSchCExpenseRatio ?? 25) / 100;
  const chadJob = s.chadJob || false;
  const chadJobStartMonth = s.chadJobStartMonth ?? 3;
  const chadRetirementMonth = s.chadRetirementMonth || 72;
  const sarahRetirementMonth = s.sarahWorkMonths || 72;
  const chadJobSalary = s.chadJobSalary || 0;
  const chadJobRaisePct = (s.chadJobRaisePct || 0) / 100;
  const chadJobBonusPct = (s.chadJobBonusPct || 0) / 100;
  const chadJobBonusMonth = s.chadJobBonusMonth ?? 8;
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
  // FIX #1: Pull NoFICA + pension contrib pct so we can flow them into the tax engine.
  const chadJobNoFICA = !!s.chadJobNoFICA;
  const chadJobPensionContribPct = (s.chadJobPensionContrib || 0) / 100;
  // 401(k): pre-tax deferral reduces W-2 wages reported on Box 1. Roth catch-up does NOT.
  const chadJob401kDeferralAnnual = s.chadJob401kDeferral || 0;
  const ssAnnualBenefits = estimateAnnualSSBenefits(s);
  const schedule = [];

  for (let y = 0; y < years; y++) {
    const startMonth = y * 12;
    const endMonth = Math.min(startMonth + 11, months);
    const monthsInYear = endMonth - startMonth + 1;

    // Sum Sarah's actual monthly gross for this year
    let annualSarahGross = 0;
    let chadMonthsEmployed = 0;
    let chadAnnualSalary = 0;
    let chadAnnualBonus = 0;
    let chadAnnualStock = 0;
    let chadAnnualSignOn = 0;

    for (let m = startMonth; m <= endMonth; m++) {
      if (m <= sarahRetirementMonth) {
        const rate = Math.min(
          s.sarahRate * Math.pow(1 + s.sarahRateGrowth / 100, m / 12),
          s.sarahMaxRate
        );
        const clients = Math.min(
          s.sarahCurrentClients * Math.pow(1 + s.sarahClientGrowth / 100, m / 12),
          s.sarahMaxClients
        );
        annualSarahGross += Math.round(rate * clients * DAYS_PER_MONTH);
      }

      if (chadJob && m >= chadJobStartMonth && m <= chadRetirementMonth) {
        chadMonthsEmployed++;
        const monthsWorked = m - chadJobStartMonth;
        const yearsWorked = Math.floor(monthsWorked / 12);
        const annualSalaryCurr = chadJobSalary * Math.pow(1 + chadJobRaisePct, yearsWorked);
        chadAnnualSalary += annualSalaryCurr / 12;

        // Lump-sum bonus paid in configured calendar month
        const calendarMonthOfYear = (m + PROJECTION_START_MONTH) % 12;
        if (chadJobBonusPct > 0 && monthsWorked > 0 && calendarMonthOfYear === chadJobBonusMonth) {
          let bonusFraction;
          if (monthsWorked >= 12) bonusFraction = 1;
          else if (chadJobBonusProrateFirst) bonusFraction = monthsWorked / 12;
          else bonusFraction = 0;
          chadAnnualBonus += annualSalaryCurr * chadJobBonusPct * bonusFraction;
        }

        // Stock comp — lumpy events sum into the calendar year they occur in.
        // Refresh: first grant at start + chadJobRefreshStartMonth, then every 12 months.
        // 5% of each active grant on Feb/May/Aug/Nov.
        if (chadJobStockRefresh > 0 && isStockVestMonth(m)) {
          const monthsSinceFirstRefresh = monthsWorked - chadJobRefreshStartMonth;
          if (monthsSinceFirstRefresh >= 0) {
            const maxGrantIdx = Math.floor(monthsSinceFirstRefresh / 12);
            for (let g = 0; g <= maxGrantIdx; g++) {
              const issueMonth = chadJobStartMonth + chadJobRefreshStartMonth + 12 * g;
              if (issueMonth >= m) break;
              const firstVest = nextStockVestMonthAfter(issueMonth);
              if (m < firstVest) continue;
              const vestIdx = (m - firstVest) / 3;
              if (vestIdx >= 0 && vestIdx < 20) {
                chadAnnualStock += chadJobStockRefresh * 0.05;
              }
            }
          }
        }
        // Hire stock: lump on each work anniversary.
        if (monthsWorked > 0 && monthsWorked % 12 === 0) {
          const yearIdx = monthsWorked / 12 - 1;
          if (yearIdx >= 0 && yearIdx < 4) {
            chadAnnualStock += chadJobHireStock[yearIdx];
          }
        }
        // Cash sign-on: 50% on hire date, 50% on 1-yr anniversary
        if (chadJobSignOnCash > 0) {
          if (monthsWorked === 0 || monthsWorked === 12) {
            chadAnnualSignOn += chadJobSignOnCash * 0.5;
          }
        }
      }
    }

    // Pro-rate salary to 12 months if partial year (last year of projection).
    // Bonus and stock are discrete events — don't annualize.
    if (monthsInYear < 12) {
      annualSarahGross = Math.round(annualSarahGross * 12 / monthsInYear);
      if (chadMonthsEmployed > 0) {
        chadAnnualSalary = chadAnnualSalary * 12 / monthsInYear;
      }
    }

    // Sch C net after business expenses
    const schCNet = Math.round(annualSarahGross * (1 - expenseRatio));

    // Chad's W-2 wages (salary + bonus + RSU vesting + sign-on, with compounded raises)
    const chadW2Gross = chadJob ? Math.round(chadAnnualSalary + chadAnnualBonus + chadAnnualStock + chadAnnualSignOn) : 0;

    // FIX #1: Pension contribution is pre-tax for both federal income tax AND FICA.
    // Reduce taxable W-2 wages by (annual salary × pension %). Pension is on salary
    // only (not bonus/RSU/sign-on), matching projection.js's chadJobSalaryNetMult.
    // FIX #M2: chadJobHealthSavings is intentionally NOT subtracted here. Re-read of
    // projection.js (lines 96, 304-306) confirms it is a premium-savings expense
    // OFFSET (employer pays more of the premium so household expenses are lower);
    // it is NOT an employee pre-tax HSA contribution, so it does not reduce W-2
    // taxable wages. If it ever becomes a true pre-tax HSA contribution, subtract
    // it from chadW2 here.
    const pensionDollar = chadJob ? Math.round(chadAnnualSalary * chadJobPensionContribPct) : 0;
    // 401(k): pre-tax deferral reduces W-2 wages reported on Box 1. Pro-rate by
    // months actually worked this projection year (so a half-year doesn't get the full annual deferral).
    const chad401kDeferralDollar = chadJob && chadMonthsEmployed > 0
      ? Math.round(chadJob401kDeferralAnnual * (chadMonthsEmployed / 12))
      : 0;
    const chadW2 = Math.max(0, chadW2Gross - pensionDollar - chad401kDeferralDollar);

    // Inflation-adjusted brackets and SALT cap
    const inflationFactor = s.taxInflationAdjust
      ? Math.pow(1 + (s.taxInflationRate || 2) / 100, y)
      : 1;
    // Calendar year ≈ 2026 + yearIndex (projection starts ~2026)
    const calendarYear = 2026 + y;
    const saltCap = Math.round(getSaltCapForYear(calendarYear) * inflationFactor);
    // Inflate bracket thresholds so income doesn't creep into higher brackets
    const inflatedBrackets = inflationFactor > 1
      ? inflateBrackets(BRACKETS_MFJ_2026, inflationFactor)
      : null;

    const taxInputs = getTaxInputs(s, y);

    // FIX #M3: CTC drops once twins age out. Per the project's canonical
    // TWINS_AGE_OUT_MONTH (last month of SS-auxiliary eligibility), we treat
    // years whose end-month reaches that boundary as ineligible for CTC.
    // (Strictly the IRS test is "under 17 at end of tax year", which would
    // cut a year earlier; using TWINS_AGE_OUT_MONTH matches the project's
    // single source of truth and the spec's worked example.)
    const ctcChildrenForYear = (endMonth < TWINS_AGE_OUT_MONTH) ? taxInputs.ctcChildren : 0;

    // Full household tax (Sarah + Chad)
    const fullTax = calculateTax({
      w2Wages: chadW2,
      w2Withholding: taxInputs.w2Withholding,
      schCNet,
      capGainLoss: taxInputs.capGainLoss,
      propertyTax: taxInputs.propertyTax,
      salesTax: taxInputs.salesTax,
      personalPropTax: taxInputs.personalPropTax,
      mortgageInt: taxInputs.mortgageInt,
      charitable: taxInputs.charitable,
      totalMedicalInput: taxInputs.totalMedicalInput,
      ctcChildren: ctcChildrenForYear,
      odcDependents: taxInputs.odcDependents,
      solo401kContribution: taxInputs.solo401kContribution,
      ssBenefitAnnual: ssAnnualBenefits[y] || 0,
      saltCap,
      brackets: inflatedBrackets,
      noFICA: chadJobNoFICA, // FIX #1
    });

    // W-2 only tax (for marginal attribution — what would tax be without Sarah?)
    const w2OnlyTax = calculateTax({
      w2Wages: chadW2,
      w2Withholding: taxInputs.w2Withholding,
      schCNet: 0,
      capGainLoss: taxInputs.capGainLoss,
      propertyTax: taxInputs.propertyTax,
      salesTax: taxInputs.salesTax,
      personalPropTax: taxInputs.personalPropTax,
      mortgageInt: taxInputs.mortgageInt,
      charitable: taxInputs.charitable,
      totalMedicalInput: taxInputs.totalMedicalInput,
      ctcChildren: ctcChildrenForYear,
      odcDependents: taxInputs.odcDependents,
      solo401kContribution: 0, // No Solo 401(k) without self-employment
      ssBenefitAnnual: ssAnnualBenefits[y] || 0, // FIX RA-1: include SS in counterfactual to avoid attribution drift
      saltCap,
      brackets: inflatedBrackets,
      noFICA: chadJobNoFICA, // FIX #1
    });

    // Marginal attribution
    const sarahAnnualTax = Math.max(0, fullTax.totalTax - w2OnlyTax.totalTax);
    const chadAnnualTax = w2OnlyTax.totalTax;

    // Sarah's effective rate on gross revenue (combined expenses + tax burden)
    const sarahEffectiveOnGross = annualSarahGross > 0
      ? (annualSarahGross * expenseRatio + sarahAnnualTax) / annualSarahGross
      : 0;

    schedule.push({
      // Monthly amounts for the projection loop
      sarahMonthlyTax: Math.round(sarahAnnualTax / 12),
      chadMonthlyTax: chadW2 > 0 ? Math.round(chadAnnualTax / 12) : 0,
      chadMonthlyNet: chadW2 > 0 ? Math.round((chadW2 - chadAnnualTax) / 12) : 0,

      // Rates for display
      effectiveTaxRate: fullTax.effectiveRate,
      marginalRate: fullTax.marginalRate,
      sarahEffectiveOnGross,
      chadEffectiveRate: chadW2 > 0 ? chadAnnualTax / chadW2 : 0,

      // Annual totals for tax tab display
      annualTotalTax: fullTax.totalTax,
      annualSarahTax: sarahAnnualTax,
      annualChadTax: chadAnnualTax,
      annualSarahGross,
      schCNet,
      chadW2,           // FIX #1: W-2 wages AFTER pension + 401(k) deferral reduction (taxable)
      chadW2Gross,      // FIX #1: W-2 wages BEFORE pension reduction (for display)
      chadPensionDollar: pensionDollar, // FIX #1: pre-tax pension dollar amount this year
      chad401kDeferralDollar, // 401(k): pre-tax deferral dollars this year (already prorated)
      ctcChildrenForYear, // FIX #M3: CTC kids actually used this year
      noFICA: chadJobNoFICA, // FIX #1

      // Full engine results for detailed display
      fullTax,
    });
  }

  return schedule;
}
