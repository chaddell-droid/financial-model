export const MONTHS = ["Q1'26", "Q2'26", "Q3'26", "Q4'26", "Q1'27", "Q2'27", "Q3'27", "Q4'27", "Q1'28", "Q2'28", "Q3'28", "Q4'28", "Q1'29", "Q2'29", "Q3'29", "Q4'29", "Q1'30", "Q2'30", "Q3'30", "Q4'30"];
export const MONTH_VALUES = [0, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36, 39, 42, 45, 48, 51, 54, 57];

// MSFT vesting schedule (net 80% of gross) — hedged at $410.68/share floor
// Starting March 2026 = month 0. Each vest covers ~3 months.
// Calendar month-of-year (0=Jan) at projection-month 0 — used to map projection
// months to real calendar months (e.g. lump-sum bonus paid each September).
export const PROJECTION_START_MONTH = 2; // March 2026 = month 0

// Quarterly stock-vest calendar months (0-indexed): Feb, May, Aug, Nov — last day.
// Used for Chad's annual stock refresh grants (5%/quarter over 5 years per grant).
export const STOCK_VEST_CALENDAR_MONTHS = [1, 4, 7, 10];
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

// ── SSA statutory limits, year-indexed (remediation 2026-06-10 Phase 0, item 0.2; fixes B3) ──
// Published values go in SSA_LIMITS; years beyond the table are projected with an
// assumed wage-index rate (SSA indexes the earnings-test exempt amounts and SGA by
// national average wage growth). 2026 values verified against ssa.gov/oact/cola/rtea.html
// (earnings test $24,480 / $65,160) — the old constants ($22,320 / $62,160) were the
// 2024 lower and 2025 FRA-year amounts mislabeled "2026".
export const SSA_LIMITS_BASE_YEAR = 2026;
export const SSA_ASSUMED_WAGE_INDEX_RATE = 0.025; // assumed AWI growth for years past the table
export const SSA_LIMITS = {
  2026: {
    earningsTestAnnual: 24480,        // lower exempt amount, $1 withheld per $2 over (pre-FRA years)
    earningsTestFraYearAnnual: 65160, // FRA-calendar-year exempt amount, $1 per $3 over
    sgaMonthly: 1690,                 // SGA, non-blind
    attorneyFeeCap: 9200,             // SSA fee-agreement cap — statutory, raised ad hoc (Nov 2024), NOT auto-indexed
  },
};
const ssaLimitsCache = new Map();
export function getSsaLimitsForYear(year) {
  const y = Math.floor(Number(year));
  if (!Number.isFinite(y) || y <= SSA_LIMITS_BASE_YEAR) return SSA_LIMITS[SSA_LIMITS_BASE_YEAR];
  if (SSA_LIMITS[y]) return SSA_LIMITS[y];
  if (ssaLimitsCache.has(y)) return ssaLimitsCache.get(y);
  // Project forward from the latest published year with the assumed wage index.
  const publishedYears = Object.keys(SSA_LIMITS).map(Number);
  const latestYear = Math.max(...publishedYears);
  const base = SSA_LIMITS[latestYear];
  const factor = Math.pow(1 + SSA_ASSUMED_WAGE_INDEX_RATE, y - latestYear);
  const projected = {
    // SSA rounds the MONTHLY exempt amounts to a $10 multiple → annual amounts are $120 multiples.
    earningsTestAnnual: Math.round(base.earningsTestAnnual * factor / 120) * 120,
    earningsTestFraYearAnnual: Math.round(base.earningsTestFraYearAnnual * factor / 120) * 120,
    sgaMonthly: Math.round(base.sgaMonthly * factor / 10) * 10, // SGA rounds to $10
    attorneyFeeCap: base.attorneyFeeCap, // pinned until SSA raises it by rule
  };
  ssaLimitsCache.set(y, projected);
  return projected;
}
// Current-year (projection-start-year) convenience constants — single source is the table above.
export const SGA_LIMIT = SSA_LIMITS[SSA_LIMITS_BASE_YEAR].sgaMonthly;
export const SS_EARNINGS_LIMIT_ANNUAL = SSA_LIMITS[SSA_LIMITS_BASE_YEAR].earningsTestAnnual; // 2026, before FRA
export const SS_EARNINGS_LIMIT_FRA_YEAR = SSA_LIMITS[SSA_LIMITS_BASE_YEAR].earningsTestFraYearAnnual; // 2026, FRA year ($1 per $3 over)
export const SSDI_ATTORNEY_FEE_CAP = SSA_LIMITS[SSA_LIMITS_BASE_YEAR].attorneyFeeCap;
export const DAYS_PER_MONTH = 21.5;
// FIX #9: TWINS_AGE_OUT_MONTH is the FIRST INELIGIBLE month (used via `m < TWINS_AGE_OUT_MONTH`).
// March 2026 = m=0 (PROJECTION_START_MONTH=2 → calendar offset). Twins turn 18 between
// m=33 (Dec 2028, last eligible) and m=34 (Jan 2029, first ineligible). Both SS and SSDI
// kids-age-out paths resolve to this calendar moment.
export const TWINS_AGE_OUT_MONTH = 34; // First month kids are NO LONGER eligible (Jan 2029)
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

// ── Retirement/survivor family maximum (remediation 2026-06-10 Phase 0, item 0.3; improvement b-13) ──
// 2026 family-maximum bend points (workers who turn 62 or die in 2026), verified
// against ssa.gov/oact/cola/familymax.html. Statutory percentages are fixed
// (150% / 272% / 134% / 175%); only the dollar bend points move each year.
// NOTE: the SSDI family maximum uses a DIFFERENT rule (85% of AIME, 100–150% of PIA)
// — this helper is for the retirement/survivor maximum only. Not yet wired into
// gatherState — Phase 1 (B5/A7) adopts it.
export const FAMILY_MAX_BEND_POINTS = [1643, 2371, 3093]; // 2026
export function familyMaxForPIA(pia) {
  if (!Number.isFinite(pia) || pia <= 0) return 0;
  const [b1, b2, b3] = FAMILY_MAX_BEND_POINTS;
  const fmax =
    1.50 * Math.min(pia, b1) +
    2.72 * Math.max(0, Math.min(pia, b2) - b1) +
    1.34 * Math.max(0, Math.min(pia, b3) - b2) +
    1.75 * Math.max(0, pia - b3);
  // SSA rounds the family maximum down to the next lower dime.
  return Math.floor(fmax * 10) / 10;
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
  // Cover the FULL projection horizon (remediation 2026-06-09 item 2.7 — the
  // old `totalProjectionMonths - 12` limit hid the last 12 months from every
  // quarterly chart). computeProjection's aggregation already averages partial
  // trailing quarters over however many months exist, so no padding is needed.
  const limit = totalProjectionMonths;
  for (let m = 0; m < limit; m += 3) {
    const quarterIndex = m / 3;
    const q = ((baseQuarter - 1 + quarterIndex) % 4) + 1;
    const y = baseYear + Math.floor((baseQuarter - 1 + quarterIndex) / 4);
    labels.push(`Q${q}'${y}`);
    monthValues.push(m);
  }
  return { labels, monthValues };
}
