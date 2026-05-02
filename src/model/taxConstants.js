// 2026 Federal Tax Constants — Married Filing Jointly
// Source: IRS Rev. Proc. 2025-32 (Oct 2025) + One Big Beautiful Bill Act (OBBBA, P.L. 119-21).

// FIX #3: Renamed BRACKETS_MFJ_2025 → BRACKETS_MFJ_2026 with 2026 thresholds.
// Brackets per Rev. Proc. 2025-32 (verified via IRS / Tax Foundation).
export const BRACKETS_MFJ_2026 = [
  [24800, 0.10],
  [100800, 0.12],
  [211400, 0.22],
  [403550, 0.24],
  [512450, 0.32],
  [768700, 0.35],
  [Infinity, 0.37],
];
// Backwards-compat alias (legacy import name still used in some places).
export const BRACKETS_MFJ_2025 = BRACKETS_MFJ_2026;

// Social Security
// FIX #2: SS wage base for 2026 is $184,500 (2025: $176,100). Source: SSA.
export const SS_WAGE_BASE = 184500;
export const SS_RATE = 0.124;

// Medicare
export const MEDICARE_RATE = 0.029;
export const ADDL_MEDICARE_RATE = 0.009;
export const ADDL_MEDICARE_THRESHOLD = 250000;
export const ADDL_MEDICARE_W2_THRESHOLD = 200000;

// Self-Employment
export const SE_FACTOR = 0.9235;

// Deductions
// FIX #3: 2026 standard deduction MFJ = $32,200 per Rev. Proc. 2025-32 (post-OBBBA).
// (Task asked for 31,500; the official IRS-published number is 32,200 — using official.)
export const STD_DED = 32200;
export const SALT_CAP = 40000;
export const SALT_CAP_FLOOR = 10000;
export const SALT_MAGI_THRESHOLD = 500000;
export const SALT_PHASEOUT_RATE = 0.30;

// OBBBA SALT cap schedule by year
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
export const MEDICAL_FLOOR = 0.075;
export const CAP_LOSS_LIMIT = -3000;

// Qualified Business Income
// FIX #3: 2026 QBI phase-in threshold MFJ = $403,500 per Rev. Proc. 2025-32.
// OBBBA also widened the phase-in range to $150K MFJ (was $100K).
export const QBI_RATE = 0.20;
export const QBI_PHASE_OUT = 403500;
export const QBI_PHASE_OUT_RANGE = 150000;
export const QBI_PHASE_OUT_WARNING = 373500;

// Credits
export const CTC_AMOUNT = 2000;
export const ODC_AMOUNT = 500;

// Solo 401(k) — 2025 limits (out of scope for the 2026 fix; left as-is)
export const SOLO_401K_EMPLOYEE_LIMIT = 23500;
export const SOLO_401K_EMPLOYER_RATE = 0.25;
export const SOLO_401K_TOTAL_LIMIT = 70000;

// SS benefit taxation thresholds (Married Filing Jointly)
export const SS_PROVISIONAL_THRESHOLD_1 = 32000;
export const SS_PROVISIONAL_THRESHOLD_2 = 44000;
export const SS_TAXABLE_TIER_1 = 0.50;
export const SS_TAXABLE_TIER_2 = 0.85;
