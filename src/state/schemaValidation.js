/**
 * Schema versioning, validation, and migration for saved scenarios.
 *
 * validateAndSanitize(raw) — coerces types, clamps ranges, fills missing fields.
 * migrate(state) — applies sequential schema migrations (v0→v1 absorbs legacy cuts).
 */

import { INITIAL_STATE, MODEL_KEYS } from './initialState.js';

export const CURRENT_SCHEMA_VERSION = 1;

// --- Type map derived from INITIAL_STATE at module load ---

const TYPE_MAP = new Map();
for (const key of MODEL_KEYS) {
  const val = INITIAL_STATE[key];
  if (Array.isArray(val)) TYPE_MAP.set(key, 'array');
  else if (val === null) TYPE_MAP.set(key, 'nullable');
  else TYPE_MAP.set(key, typeof val);
}

// --- Range constraints: { min, max } ---

const RANGE = {
  // Rates (%)
  sarahRateGrowth: { min: 0, max: 100 },
  sarahClientGrowth: { min: 0, max: 100 },
  investmentReturn: { min: -50, max: 100 },
  chadJobTaxRate: { min: 0, max: 100 },
  return401k: { min: -50, max: 100 },
  homeAppreciation: { min: -50, max: 100 },
  mcInvestVol: { min: 0, max: 100 },
  mcBizGrowthVol: { min: 0, max: 100 },
  mcMsftVol: { min: 0, max: 100 },
  mcSsdiDenialPct: { min: 0, max: 100 },
  mcCutsDiscipline: { min: 0, max: 100 },
  // Month offsets
  ssdiApprovalMonth: { min: 0, max: 120 },
  kidsAgeOutMonths: { min: 0, max: 120 },
  ssStartMonth: { min: 0, max: 120 },
  ssKidsAgeOutMonths: { min: 0, max: 120 },
  chadJobStartMonth: { min: 0, max: 120 },
  trustIncreaseMonth: { min: 0, max: 120 },
  vanSaleMonth: { min: 0, max: 120 },
  ssdiBackPayMonths: { min: 0, max: 120 },
  mcSsdiDelay: { min: 0, max: 120 },
  // Counts
  sarahCurrentClients: { min: 0, max: 50 },
  sarahMaxClients: { min: 0, max: 50 },
  bcsYearsLeft: { min: 0, max: 10 },
  mcNumSims: { min: 10, max: 10000 },
  // Dollar amounts (non-negative)
  msftPrice: { min: 1 },
  sarahRate: { min: 0 },
  sarahMaxRate: { min: 0 },
  ssdiPersonal: { min: 0 },
  ssdiFamilyTotal: { min: 0 },
  chadConsulting: { min: 0 },
  ssFamilyTotal: { min: 0 },
  ssPersonal: { min: 0 },
  chadJobSalary: { min: 0 },
  chadJobHealthSavings: { min: 0 },
  totalMonthlySpend: { min: 0 },
  baseExpenses: { min: 0 },
  debtService: { min: 0 },
  bcsAnnualTotal: { min: 0 },
  bcsParentsAnnual: { min: 0 },
  trustIncomeNow: { min: 0 },
  trustIncomeFuture: { min: 0 },
  vanMonthlySavings: { min: 0 },
  vanSalePrice: { min: 0 },
  vanLoanBalance: { min: 0 },
  startingSavings: { min: 0 },
  moldCost: { min: 0 },
  roofCost: { min: 0 },
  otherProjects: { min: 0 },
  debtCC: { min: 0 },
  debtPersonal: { min: 0 },
  debtIRS: { min: 0 },
  debtFirstmark: { min: 0 },
  starting401k: { min: 0 },
  homeEquity: { min: 0 },
  // Cut items can be zero but not negative
  cutOliver: { min: 0 },
  cutVacation: { min: 0 },
  cutShopping: { min: 0 },
  cutMedical: { min: 0 },
  cutGym: { min: 0 },
  cutAmazon: { min: 0 },
  cutSaaS: { min: 0 },
  cutEntertainment: { min: 0 },
  cutGroceries: { min: 0 },
  cutPersonalCare: { min: 0 },
  cutSmallItems: { min: 0 },
};

// --- Enum constraints ---

const ENUMS = {
  ssType: ['ssdi', 'ss'],
};

const VALID_GOAL_TYPES = new Set(['savings_floor', 'income_target', 'savings_target', 'net_worth_target']);

// --- Migrations ---

const MIGRATIONS = [
  {
    from: 0,
    to: 1,
    fn: (state) => {
      const result = { ...state };
      // Legacy aggregate cuts → individual cuts defaults
      if (result.lifestyleCuts !== undefined && result.cutOliver === undefined) {
        result.cutOliver = INITIAL_STATE.cutOliver;
        result.cutVacation = INITIAL_STATE.cutVacation;
        result.cutShopping = INITIAL_STATE.cutShopping;
        result.cutMedical = INITIAL_STATE.cutMedical;
        result.cutGym = INITIAL_STATE.cutGym;
        result.cutAmazon = INITIAL_STATE.cutAmazon;
        result.cutSaaS = INITIAL_STATE.cutSaaS;
        result.cutEntertainment = INITIAL_STATE.cutEntertainment;
        result.cutGroceries = INITIAL_STATE.cutGroceries;
        result.cutPersonalCare = INITIAL_STATE.cutPersonalCare;
        result.cutSmallItems = INITIAL_STATE.cutSmallItems;
      }
      return result;
    },
  },
];

/**
 * Apply sequential schema migrations from state's version to current.
 */
export function migrate(state) {
  let current = { ...state };
  let version = current.schemaVersion || 0;
  for (const m of MIGRATIONS) {
    if (version === m.from) {
      current = m.fn(current);
      version = m.to;
    }
  }
  current.schemaVersion = CURRENT_SCHEMA_VERSION;
  return current;
}

/**
 * Validate and sanitize a restored state object:
 * - Fill missing MODEL_KEYS with INITIAL_STATE defaults
 * - Coerce types (string→number, etc.)
 * - Clamp ranges
 * - Validate enums
 * - Validate goals array structure
 */
export function validateAndSanitize(raw) {
  const result = {};

  for (const key of MODEL_KEYS) {
    const rawVal = raw[key];
    const expectedType = TYPE_MAP.get(key);
    const defaultVal = INITIAL_STATE[key];

    // Missing field → use default
    if (rawVal === undefined) {
      result[key] = defaultVal;
      continue;
    }

    // Special cases
    if (key === 'goals') {
      result[key] = sanitizeGoals(rawVal);
      continue;
    }
    if (key === 'milestones') {
      result[key] = Array.isArray(rawVal) ? rawVal : defaultVal;
      continue;
    }
    if (expectedType === 'nullable') {
      // cutsOverride: null or number
      result[key] = rawVal === null ? null : coerceNumber(rawVal, defaultVal);
      continue;
    }

    // Type coercion + range clamping
    if (expectedType === 'number') {
      let v = coerceNumber(rawVal, defaultVal);
      const range = RANGE[key];
      if (range) {
        if (range.min !== undefined && v < range.min) v = range.min;
        if (range.max !== undefined && v > range.max) v = range.max;
      }
      result[key] = v;
    } else if (expectedType === 'boolean') {
      result[key] = Boolean(rawVal);
    } else if (expectedType === 'string') {
      const enumValues = ENUMS[key];
      if (enumValues) {
        result[key] = enumValues.includes(rawVal) ? rawVal : defaultVal;
      } else {
        result[key] = typeof rawVal === 'string' ? rawVal : defaultVal;
      }
    } else {
      result[key] = rawVal;
    }
  }

  result.schemaVersion = CURRENT_SCHEMA_VERSION;
  return result;
}

function coerceNumber(val, fallback) {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  const parsed = Number(val);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sanitizeGoals(goals) {
  if (!Array.isArray(goals)) return INITIAL_STATE.goals;
  return goals.filter(g =>
    g && typeof g === 'object' &&
    typeof g.id === 'string' &&
    typeof g.name === 'string' &&
    VALID_GOAL_TYPES.has(g.type)
  ).map(g => ({
    id: g.id,
    name: g.name,
    type: g.type,
    targetAmount: typeof g.targetAmount === 'number' ? g.targetAmount : 0,
    targetMonth: typeof g.targetMonth === 'number' ? g.targetMonth : 72,
    color: typeof g.color === 'string' ? g.color : '#4ade80',
  }));
}
