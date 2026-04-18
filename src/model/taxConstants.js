// 2025 Federal Tax Constants — Married Filing Jointly

export const BRACKETS_MFJ_2025 = [
  [23850, 0.10],
  [96950, 0.12],
  [206700, 0.22],
  [394600, 0.24],
  [501050, 0.32],
  [751600, 0.35],
  [Infinity, 0.37],
];

// Social Security
export const SS_WAGE_BASE = 176100;
export const SS_RATE = 0.124;

// Medicare
export const MEDICARE_RATE = 0.029;
export const ADDL_MEDICARE_RATE = 0.009;
export const ADDL_MEDICARE_THRESHOLD = 250000;
export const ADDL_MEDICARE_W2_THRESHOLD = 200000;

// Self-Employment
export const SE_FACTOR = 0.9235;

// Deductions
export const STD_DED = 30000;
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
export const QBI_RATE = 0.20;
export const QBI_PHASE_OUT = 394600;
export const QBI_PHASE_OUT_RANGE = 100000;
export const QBI_PHASE_OUT_WARNING = 364600;

// Credits
export const CTC_AMOUNT = 2000;
export const ODC_AMOUNT = 500;

// Solo 401(k) — 2025 limits
export const SOLO_401K_EMPLOYEE_LIMIT = 23500;
export const SOLO_401K_EMPLOYER_RATE = 0.25;
export const SOLO_401K_TOTAL_LIMIT = 70000;

// SS benefit taxation thresholds (Married Filing Jointly)
export const SS_PROVISIONAL_THRESHOLD_1 = 32000;
export const SS_PROVISIONAL_THRESHOLD_2 = 44000;
export const SS_TAXABLE_TIER_1 = 0.50;
export const SS_TAXABLE_TIER_2 = 0.85;
