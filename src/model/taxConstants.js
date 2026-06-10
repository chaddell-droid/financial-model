// Federal tax statutory parameters — Married Filing Jointly.
// Source: IRS Rev. Proc. 2025-32 (Oct 2025) + One Big Beautiful Bill Act (OBBBA, P.L. 119-21),
// IRS Notice 2025-67 (401(k) limits), SSA (wage base).
//
// Phase-0 remediation (2026-06-10, item 0.1 / improvement a-4): ALL year-dependent
// statutory values flow from one year-indexed table, `getTaxParamsForYear(year)`.
// Published years live in TAX_PARAMS; later years are projected with an assumed
// chained-CPI index rate; legally frozen thresholds are pinned (never indexed).
// The flat exported constants below are derived from the base-year table entry so
// existing call sites keep working with zero duplicates — the annual statutory
// update is a one-entry diff to TAX_PARAMS.

export const TAX_PARAMS_BASE_YEAR = 2026;
// Assumed chained-CPI indexing for years beyond the published table.
export const TAX_ASSUMED_INDEX_RATE = 0.025;

// Legally frozen (non-indexed) thresholds — pinned in statute, NEVER inflated:
//   addlMedicareThreshold / addlMedicareW2Threshold (IRC §3101(b)(2), fixed since 2013)
//   ssProvisionalThreshold1/2 ($32k/$44k MFJ, fixed since 1984/1993)
//   ctcPhaseoutThresholdMfj ($400k MFJ, fixed by TCJA/OBBBA)
const FROZEN_PARAM_KEYS = [
  'addlMedicareThreshold', 'addlMedicareW2Threshold',
  'ssProvisionalThreshold1', 'ssProvisionalThreshold2',
  'ctcPhaseoutThresholdMfj',
  // qbiPhaseOutRange is a statutory width ($150k MFJ under OBBBA), not an indexed amount.
  'qbiPhaseOutRange',
  // C4: the §1411 NIIT threshold ($250k MFJ) has been frozen since 2013.
  'niitThresholdMfj',
];

export const TAX_PARAMS = {
  2026: {
    // Brackets per Rev. Proc. 2025-32 (verified via IRS / Tax Foundation).
    bracketsMfj: [
      [24800, 0.10],
      [100800, 0.12],
      [211400, 0.22],
      [403550, 0.24],
      [512450, 0.32],
      [768700, 0.35],
      [Infinity, 0.37],
    ],
    stdDeductionMfj: 32200,       // post-OBBBA, Rev. Proc. 2025-32
    // C4 (remediation 2026-06-10): LTCG 0/15/20 breakpoints MFJ per
    // Rev. Proc. 2025-32 — 0% up to $98,900, 15% up to $613,700, 20% above.
    ltcgBracketsMfj: [
      [98900, 0],
      [613700, 0.15],
      [Infinity, 0.20],
    ],
    ssWageBase: 184500,           // SSA 2026 (2025: $176,100)
    qbiPhaseOutStart: 403500,     // MFJ phase-in threshold, Rev. Proc. 2025-32
    qbiPhaseOutRange: 150000,     // OBBBA widened to $150K MFJ (was $100K) — statutory width
    ctcAmount: 2200,              // OBBBA, indexed
    solo401kEmployeeLimit: 24500, // 402(g), IRS Notice 2025-67
    solo401kTotalLimit: 72000,    // 415(c), IRS Notice 2025-67
    k401CatchupLimit: 8000,       // age-50+ catch-up, Notice 2025-67
    k401SuperCatchupLimit: 11250, // SECURE 2.0 ages 60-63, $11,250 for 2026 per Notice 2025-67 (indexed)
    // Frozen thresholds (see FROZEN_PARAM_KEYS):
    addlMedicareThreshold: 250000,
    addlMedicareW2Threshold: 200000,
    ssProvisionalThreshold1: 32000,
    ssProvisionalThreshold2: 44000,
    ctcPhaseoutThresholdMfj: 400000,
    niitThresholdMfj: 250000,     // C4: §1411, legally frozen since 2013
  },
};

// Rounding conventions for projected (assumed-index) years, approximating the
// statutory rounding rules: brackets $50 (IRC §1(f)(7) MFJ), std deduction $100,
// wage base $300 (SSA), retirement limits $500, CTC $100, QBI threshold $50.
function roundTo(value, increment) {
  return Math.round(value / increment) * increment;
}

const taxParamsCache = new Map();
export function getTaxParamsForYear(year) {
  const y = Math.floor(Number(year));
  if (!Number.isFinite(y) || y <= TAX_PARAMS_BASE_YEAR) return TAX_PARAMS[TAX_PARAMS_BASE_YEAR];
  if (TAX_PARAMS[y]) return TAX_PARAMS[y];
  if (taxParamsCache.has(y)) return taxParamsCache.get(y);

  const publishedYears = Object.keys(TAX_PARAMS).map(Number);
  const latestYear = Math.max(...publishedYears);
  const base = TAX_PARAMS[latestYear];
  const factor = Math.pow(1 + TAX_ASSUMED_INDEX_RATE, y - latestYear);

  const projected = {
    bracketsMfj: base.bracketsMfj.map(([cap, rate]) =>
      [cap === Infinity ? Infinity : roundTo(cap * factor, 50), rate]),
    // C4: LTCG breakpoints index like the ordinary brackets ($50 rounding).
    ltcgBracketsMfj: base.ltcgBracketsMfj.map(([cap, rate]) =>
      [cap === Infinity ? Infinity : roundTo(cap * factor, 50), rate]),
    stdDeductionMfj: roundTo(base.stdDeductionMfj * factor, 100),
    ssWageBase: roundTo(base.ssWageBase * factor, 300),
    qbiPhaseOutStart: roundTo(base.qbiPhaseOutStart * factor, 50),
    qbiPhaseOutRange: base.qbiPhaseOutRange,
    ctcAmount: roundTo(base.ctcAmount * factor, 100),
    solo401kEmployeeLimit: roundTo(base.solo401kEmployeeLimit * factor, 500),
    solo401kTotalLimit: roundTo(base.solo401kTotalLimit * factor, 500),
    k401CatchupLimit: roundTo(base.k401CatchupLimit * factor, 500),
    k401SuperCatchupLimit: roundTo(base.k401SuperCatchupLimit * factor, 500),
  };
  for (const key of FROZEN_PARAM_KEYS) projected[key] = base[key];

  taxParamsCache.set(y, projected);
  return projected;
}

const BASE = TAX_PARAMS[TAX_PARAMS_BASE_YEAR];

// ── Derived flat constants (single source: TAX_PARAMS) ─────────────────────
export const BRACKETS_MFJ_2026 = BASE.bracketsMfj;
// Backwards-compat alias (legacy import name still used in some places).
export const BRACKETS_MFJ_2025 = BRACKETS_MFJ_2026;

// Social Security
export const SS_WAGE_BASE = BASE.ssWageBase;
export const SS_RATE = 0.124;

// Medicare
export const MEDICARE_RATE = 0.029;
export const ADDL_MEDICARE_RATE = 0.009;
export const ADDL_MEDICARE_THRESHOLD = BASE.addlMedicareThreshold;
export const ADDL_MEDICARE_W2_THRESHOLD = BASE.addlMedicareW2Threshold;

// Self-Employment
export const SE_FACTOR = 0.9235;

// Deductions
export const STD_DED = BASE.stdDeductionMfj;
export const MEDICAL_FLOOR = 0.075;
export const CAP_LOSS_LIMIT = -3000;

// ── SALT (OBBBA) — cap AND phase-down threshold are year-scheduled ─────────
// Cap: $40,000 in 2025, +1%/yr through 2029, reverts to $10,000 in 2030.
export const SALT_CAP_FLOOR = 10000;
export const SALT_PHASEOUT_RATE = 0.30;
export const SALT_CAP_SCHEDULE = {
  2024: 10000,
  2025: 40000,
  2026: 40400,
  2027: 40804,
  2028: 41212,
  2029: 41624,
};
export function getSaltCapForYear(year) {
  if (year <= 2024) return 10000;
  if (year >= 2030) return 10000;
  return SALT_CAP_SCHEDULE[year] ?? 40000;
}
// Phase-down MAGI threshold (C8, remediation 2026-06-10 Phase 0 item 0.5):
// OBBBA indexes the $500,000 (2025) threshold +1%/yr through 2029, mirroring
// the cap schedule. The old frozen $500,000 understated the 2026+ threshold.
export const SALT_MAGI_THRESHOLD_SCHEDULE = {
  2025: 500000,
  2026: 505000,
  2027: 510050,
  2028: 515151,
  2029: 520302,
};
export function getSaltThresholdForYear(year) {
  if (year <= 2025) return 500000;
  // 2030+: the cap reverts to a flat $10,000 == SALT_CAP_FLOOR, so the
  // phase-down can never bind; the threshold is moot. Return the last
  // scheduled value for continuity.
  if (year >= 2030) return SALT_MAGI_THRESHOLD_SCHEDULE[2029];
  return SALT_MAGI_THRESHOLD_SCHEDULE[year] ?? 500000;
}
// Defaults used when callers don't pass a year-specific value (base year 2026).
export const SALT_CAP = getSaltCapForYear(TAX_PARAMS_BASE_YEAR);
export const SALT_MAGI_THRESHOLD = getSaltThresholdForYear(TAX_PARAMS_BASE_YEAR);

// ── Capital gains (C4, remediation 2026-06-10) ─────────────────────────────
// LTCG 0/15/20 stack breakpoints (MFJ, Rev. Proc. 2025-32) and the §1411 net
// investment income tax. The NIIT threshold is legally frozen (never indexed).
export const LTCG_BRACKETS_MFJ_2026 = BASE.ltcgBracketsMfj;
export const NIIT_RATE = 0.038;
export const NIIT_THRESHOLD_MFJ = BASE.niitThresholdMfj;

// Qualified Business Income
export const QBI_RATE = 0.20;
export const QBI_PHASE_OUT = BASE.qbiPhaseOutStart;
export const QBI_PHASE_OUT_RANGE = BASE.qbiPhaseOutRange;
export const QBI_PHASE_OUT_WARNING = BASE.qbiPhaseOutStart - 30000;

// Credits
// CTC phases out at $50 per $1,000 (or fraction thereof) of MAGI over $400K MFJ — i.e. 5%.
export const CTC_AMOUNT = BASE.ctcAmount;
export const ODC_AMOUNT = 500;
export const CTC_PHASEOUT_THRESHOLD_MFJ = BASE.ctcPhaseoutThresholdMfj;
export const CTC_PHASEOUT_RATE = 0.05;

// Solo 401(k) — 2026 limits (IRS Notice 2025-67). Remediation 2026-06-09 Phase 4.
export const SOLO_401K_EMPLOYEE_LIMIT = BASE.solo401kEmployeeLimit;
// Plan-document employer rate for common-law employees (25% of comp).
export const SOLO_401K_EMPLOYER_RATE = 0.25;
// C2 (remediation 2026-06-10): for the SELF-EMPLOYED, Pub 560 reduces the
// employer rate because the contribution base is net SE earnings net of the
// contribution itself: effective rate = rate / (1 + rate) = 0.25/1.25 = 20%.
// computeMax401k (Sarah's Sch C) must use this, never the raw 25%.
export const SOLO_401K_EMPLOYER_RATE_SE = SOLO_401K_EMPLOYER_RATE / (1 + SOLO_401K_EMPLOYER_RATE);
export const SOLO_401K_TOTAL_LIMIT = BASE.solo401kTotalLimit;

// SS benefit taxation thresholds (Married Filing Jointly) — legally frozen.
export const SS_PROVISIONAL_THRESHOLD_1 = BASE.ssProvisionalThreshold1;
export const SS_PROVISIONAL_THRESHOLD_2 = BASE.ssProvisionalThreshold2;
export const SS_TAXABLE_TIER_1 = 0.50;
export const SS_TAXABLE_TIER_2 = 0.85;
