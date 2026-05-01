/**
 * Schema versioning, validation, and migration for saved scenarios.
 *
 * validateAndSanitize(raw) — coerces types, clamps ranges, fills missing fields.
 * migrate(state) — applies sequential schema migrations (v0→v1 absorbs legacy cuts).
 */

import { INITIAL_STATE, MODEL_KEYS } from './initialState.js';

export const CURRENT_SCHEMA_VERSION = 7;

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
  sarahTaxRate: { min: 0, max: 50 },
  chadJobTaxRate: { min: 0, max: 100 },
  return401k: { min: -50, max: 100 },
  homeAppreciation: { min: -50, max: 100 },
  mcInvestVol: { min: 0, max: 100 },
  mcBizGrowthVol: { min: 0, max: 100 },
  mcMsftVol: { min: 0, max: 100 },
  mcSsdiDenialPct: { min: 0, max: 100 },
  mcCutsDiscipline: { min: 0, max: 100 },
  // SS claiming
  ssClaimAge: { min: 62, max: 70 },
  ssPIA: { min: 0, max: 5000 },
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
  chadWorkMonths: { min: 12, max: 144 },
  sarahWorkMonths: { min: 36, max: 144 },
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
  chadJobPensionRate: { min: 0, max: 5 },
  chadJobPensionContrib: { min: 0, max: 15 },
  chadJobRaisePct: { min: 0, max: 5 },
  chadJobBonusPct: { min: 0, max: 30 },
  chadJobBonusMonth: { min: 0, max: 11 },
  chadJobStockRefresh: { min: 0 },
  chadJobRefreshStartMonth: { min: 0, max: 24 },
  chadJobHireStockY1: { min: 0 },
  chadJobHireStockY2: { min: 0 },
  chadJobHireStockY3: { min: 0 },
  chadJobHireStockY4: { min: 0 },
  chadJobSignOnCash: { min: 0 },
  totalMonthlySpend: { min: 0 },
  oneTimeExtras: { min: 0 },
  oneTimeMonths: { min: 0, max: 72 },
  baseExpenses: { min: 0 },
  debtService: { min: 0 },
  expenseInflationRate: { min: 0, max: 15 },
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
  seqBadY1: { min: -50, max: 50 },
  seqBadY2: { min: -50, max: 50 },
  msftGrowth: { min: -50, max: 50 },
  cutsOverride: { min: 0 },
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
  {
    from: 1,
    to: 2,
    fn: (state) => {
      const result = { ...state };
      if (result.sarahWorkYears === undefined) {
        result.sarahWorkYears = 6;
      }
      return result;
    },
  },
  {
    from: 2,
    to: 3,
    fn: (state) => {
      const result = { ...state };
      if (result.ssClaimAge === undefined) result.ssClaimAge = 62;
      if (result.ssPIA === undefined) result.ssPIA = 4214;
      return result;
    },
  },
  {
    from: 3,
    to: 4,
    fn: (state) => {
      const result = { ...state };
      // Convert sarahWorkYears (years) → sarahWorkMonths (months)
      if (result.sarahWorkYears !== undefined) {
        result.sarahWorkMonths = (result.sarahWorkYears || 6) * 12;
        delete result.sarahWorkYears;
      }
      if (result.sarahWorkMonths === undefined) result.sarahWorkMonths = 72;
      if (result.chadWorkMonths === undefined) result.chadWorkMonths = 72;
      return result;
    },
  },
  {
    from: 4,
    to: 5,
    fn: (state) => {
      const result = { ...state };
      if (result.expenseInflation === undefined) result.expenseInflation = true;
      if (result.expenseInflationRate === undefined) result.expenseInflationRate = 3;
      return result;
    },
  },
  {
    from: 5,
    to: 6,
    fn: (state) => {
      const result = { ...state };
      // Initialize new array fields; gatherState performs legacy→capitalItems seeding on every load.
      if (!Array.isArray(result.capitalItems)) result.capitalItems = [];
      if (!Array.isArray(result.customLevers)) result.customLevers = [];
      return result;
    },
  },
  {
    from: 6,
    to: 7,
    fn: (state) => {
      const result = { ...state };
      // Story 2.2: leverConstraintsOverride defaults to null (use workshop
      // defaults). User can set per-lever overrides at runtime via the UI.
      if (result.leverConstraintsOverride === undefined) {
        result.leverConstraintsOverride = null;
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
      result[key] = sanitizeMilestones(rawVal, defaultVal);
      continue;
    }
    if (key === 'capitalItems') {
      result[key] = sanitizeCapitalItems(rawVal);
      continue;
    }
    if (key === 'customLevers') {
      result[key] = sanitizeCustomLevers(rawVal);
      continue;
    }
    if (key === 'leverConstraintsOverride') {
      result[key] = sanitizeLeverConstraintsOverride(rawVal);
      continue;
    }
    if (expectedType === 'nullable') {
      if (rawVal === null) {
        result[key] = null;
      } else {
        let v = coerceNumber(rawVal, defaultVal);
        const range = RANGE[key];
        if (range) {
          if (range.min !== undefined && v < range.min) v = range.min;
          if (range.max !== undefined && v > range.max) v = range.max;
        }
        result[key] = v;
      }
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

function sanitizeMilestones(milestones, fallback) {
  if (!Array.isArray(milestones)) return fallback;
  return milestones.filter(m =>
    m && typeof m === 'object' &&
    typeof m.month === 'number' && Number.isFinite(m.month) &&
    typeof m.savings === 'number' && Number.isFinite(m.savings)
  ).map(m => ({
    name: typeof m.name === 'string' ? m.name : '',
    month: m.month,
    savings: m.savings,
  }));
}

function clampNum(v, min, max, fallback) {
  let n = typeof v === 'number' && Number.isFinite(v) ? v : Number(v);
  if (!Number.isFinite(n)) n = fallback;
  if (min !== undefined && n < min) n = min;
  if (max !== undefined && n > max) n = max;
  return n;
}

export function sanitizeCapitalItems(items) {
  if (!Array.isArray(items)) return [];
  return items.filter(it => it && typeof it === 'object').map(it => ({
    id: typeof it.id === 'string' && it.id.length > 0 ? it.id : genId('cap'),
    name: typeof it.name === 'string' ? it.name : 'Untitled item',
    description: typeof it.description === 'string' ? it.description : '',
    cost: clampNum(it.cost, 0, 5_000_000, 0),
    include: Boolean(it.include),
    likelihood: clampNum(it.likelihood, 0, 100, 100),
  }));
}

/**
 * Sanitize the `leverConstraintsOverride` MODEL_KEY (Story 2.2).
 *
 * Accepts null, undefined, or an object mapping lever keys to { min?, max? }
 * objects. Malformed entries are stripped; non-object input returns null.
 * Returns null when the cleaned map is empty so save/load round-trips
 * cleanly — the gatherState derivation treats null as "use workshop defaults."
 */
export function sanitizeLeverConstraintsOverride(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) return null;
  const result = {};
  for (const [leverKey, val] of Object.entries(raw)) {
    if (typeof leverKey !== 'string' || leverKey.length === 0) continue;
    if (!val || typeof val !== 'object') continue;
    const entry = {};
    if (typeof val.min === 'number' && Number.isFinite(val.min)) entry.min = val.min;
    if (typeof val.max === 'number' && Number.isFinite(val.max)) entry.max = val.max;
    if (Object.keys(entry).length === 0) continue;
    result[leverKey] = entry;
  }
  return Object.keys(result).length > 0 ? result : null;
}

export function sanitizeCustomLevers(levers) {
  if (!Array.isArray(levers)) return [];
  return levers.filter(l => l && typeof l === 'object').map(l => {
    const maxImpact = clampNum(l.maxImpact, 0, 50000, 0);
    const currentValue = clampNum(l.currentValue, 0, maxImpact, maxImpact);
    return {
      id: typeof l.id === 'string' && l.id.length > 0 ? l.id : genId('lv'),
      name: typeof l.name === 'string' ? l.name : 'Custom lever',
      description: typeof l.description === 'string' ? l.description : '',
      maxImpact,
      currentValue,
      active: Boolean(l.active),
    };
  });
}

let _idCounter = 0;
function genId(prefix) {
  _idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${_idCounter.toString(36)}`;
}
