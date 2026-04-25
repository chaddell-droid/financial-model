export const MONTHS = ["Q1'26", "Q2'26", "Q3'26", "Q4'26", "Q1'27", "Q2'27", "Q3'27", "Q4'27", "Q1'28", "Q2'28", "Q3'28", "Q4'28", "Q1'29", "Q2'29", "Q3'29", "Q4'29", "Q1'30", "Q2'30", "Q3'30", "Q4'30"];
export const MONTH_VALUES = [0, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36, 39, 42, 45, 48, 51, 54, 57];

// MSFT vesting schedule (net 80% of gross) — hedged at $410.68/share floor
// Starting March 2026 = month 0. Each vest covers ~3 months.
export const MSFT_FLOOR_PRICE = 410.68;

// Share counts per vest period
export const VEST_SHARES = [
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

export const SGA_LIMIT = 1690;
export const SS_EARNINGS_LIMIT_ANNUAL = 22320; // 2026 earnings test limit (before FRA)
export const SS_EARNINGS_LIMIT_FRA_YEAR = 62160; // 2026 earnings test in FRA year ($1 per $3 over)
export const SSDI_ATTORNEY_FEE_CAP = 9200; // SSA statutory cap, raised to $9,200 in Nov 2024 and unchanged for 2026
export const DAYS_PER_MONTH = 21.5;
export const TWINS_AGE_OUT_MONTH = 34; // Last eligible child benefit month (Jan 2029; twins turn 18 Feb 11, 2029)
export const SS_FRA = 67; // Full Retirement Age for 1960+ birth cohort
export const SS_FRA_MONTH = 79; // Month when Chad reaches FRA (Oct 2032; born Sep 17, must be 67 full month)
// SS start offset: +19 months from baseline for age 62 (Oct 2027, not Sep — mid-month birthday)
export const SS_START_OFFSET = 19; // Months from baseline (Mar 2026) to first eligible month at age 62

/**
 * SS benefit adjustment factor based on claiming age vs FRA (67).
 * Before FRA: 5/9% per month for first 36 months early, 5/12% for additional.
 * After FRA: 2/3% per month delayed retirement credit (8% per year).
 */
export function ssAdjustmentFactor(claimAge) {
  const monthsFromFRA = (claimAge - SS_FRA) * 12;
  if (monthsFromFRA >= 0) {
    return 1 + monthsFromFRA * (2 / 3) / 100;
  }
  const monthsEarly = -monthsFromFRA;
  if (monthsEarly <= 36) {
    return 1 - monthsEarly * 5 / 9 / 100;
  }
  return 1 - 36 * 5 / 9 / 100 - (monthsEarly - 36) * 5 / 12 / 100;
}

export function ssRecalculatedBenefit(pia, originalClaimAge, monthsWithheld) {
  if (!monthsWithheld || monthsWithheld <= 0) return Math.round(pia * ssAdjustmentFactor(originalClaimAge));
  const originalMonthsEarly = Math.max(0, (SS_FRA - originalClaimAge) * 12);
  const effectiveMonthsEarly = Math.max(0, originalMonthsEarly - monthsWithheld);
  const effectiveClaimAge = SS_FRA - effectiveMonthsEarly / 12;
  return Math.round(pia * ssAdjustmentFactor(Math.min(effectiveClaimAge, SS_FRA)));
}

export function buildQuarterlySchedule(totalProjectionMonths = 72) {
  const labels = [];
  const monthValues = [];
  const baseYear = 26;
  const baseQuarter = 1;
  const limit = totalProjectionMonths - 12;
  for (let m = 0; m < limit; m += 3) {
    const quarterIndex = m / 3;
    const q = ((baseQuarter - 1 + quarterIndex) % 4) + 1;
    const y = baseYear + Math.floor((baseQuarter - 1 + quarterIndex) / 4);
    labels.push(`Q${q}'${y}`);
    monthValues.push(m);
  }
  return { labels, monthValues };
}
