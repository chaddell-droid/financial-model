/**
 * Bridge between the tax engine and the financial model's projection loop.
 *
 * buildTaxSchedule(s) pre-computes per-year tax results for the full
 * projection horizon. The projection loop looks up the current year's
 * monthly tax amounts instead of applying a flat rate.
 */

import { DAYS_PER_MONTH, CHAD_RETIREMENT_MONTH } from './constants.js';
import { BRACKETS_MFJ_2025, getSaltCapForYear } from './taxConstants.js';
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
 */
function estimateAnnualSSBenefits(s) {
  const useSS = s.ssType === 'ss';
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
    } else if (!useSS && !s.chadJob && !s.ssdiDenied && m >= ssdiApproval) {
      benefit = (m < ssdiApproval + kidsOut) ? (s.ssdiFamilyTotal || 0) : (s.ssdiPersonal || 0);
    }
    annualBenefits[Math.floor(m / 12)] += benefit;
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
  const chadJobSalary = s.chadJobSalary || 0;
  const ssAnnualBenefits = estimateAnnualSSBenefits(s);
  const schedule = [];

  for (let y = 0; y < years; y++) {
    const startMonth = y * 12;
    const endMonth = Math.min(startMonth + 11, months);
    const monthsInYear = endMonth - startMonth + 1;

    // Sum Sarah's actual monthly gross for this year
    let annualSarahGross = 0;
    let chadMonthsEmployed = 0;

    for (let m = startMonth; m <= endMonth; m++) {
      const rate = Math.min(
        s.sarahRate * Math.pow(1 + s.sarahRateGrowth / 100, m / 12),
        s.sarahMaxRate
      );
      const clients = Math.min(
        s.sarahCurrentClients * Math.pow(1 + s.sarahClientGrowth / 100, m / 12),
        s.sarahMaxClients
      );
      annualSarahGross += Math.round(rate * clients * DAYS_PER_MONTH);

      if (chadJob && m >= chadJobStartMonth && m <= CHAD_RETIREMENT_MONTH) {
        chadMonthsEmployed++;
      }
    }

    // Pro-rate to 12 months if partial year (last year of projection)
    if (monthsInYear < 12) {
      annualSarahGross = Math.round(annualSarahGross * 12 / monthsInYear);
    }

    // Sch C net after business expenses
    const schCNet = Math.round(annualSarahGross * (1 - expenseRatio));

    // Chad's W-2 wages (pro-rated for months employed in this year)
    const chadW2 = chadJob ? Math.round(chadJobSalary * chadMonthsEmployed / 12) : 0;

    // Inflation-adjusted brackets and SALT cap
    const inflationFactor = s.taxInflationAdjust
      ? Math.pow(1 + (s.taxInflationRate || 2) / 100, y)
      : 1;
    // Calendar year ≈ 2026 + yearIndex (projection starts ~2026)
    const calendarYear = 2026 + y;
    const saltCap = Math.round(getSaltCapForYear(calendarYear) * inflationFactor);
    // Inflate bracket thresholds so income doesn't creep into higher brackets
    const inflatedBrackets = inflationFactor > 1
      ? inflateBrackets(BRACKETS_MFJ_2025, inflationFactor)
      : null;

    const taxInputs = getTaxInputs(s, y);

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
      ctcChildren: taxInputs.ctcChildren,
      odcDependents: taxInputs.odcDependents,
      solo401kContribution: taxInputs.solo401kContribution,
      ssBenefitAnnual: ssAnnualBenefits[y] || 0,
      saltCap,
      brackets: inflatedBrackets,
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
      ctcChildren: taxInputs.ctcChildren,
      odcDependents: taxInputs.odcDependents,
      solo401kContribution: 0, // No Solo 401(k) without self-employment
      saltCap,
      brackets: inflatedBrackets,
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
      chadW2,

      // Full engine results for detailed display
      fullTax,
    });
  }

  return schedule;
}
