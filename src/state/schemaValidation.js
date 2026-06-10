/**
 * Schema versioning, validation, and migration for saved scenarios.
 *
 * validateAndSanitize(raw) — coerces types, clamps ranges, fills missing fields.
 * migrate(state) — applies sequential schema migrations (v0→v1 absorbs legacy cuts).
 */

import { INITIAL_STATE, MODEL_KEYS } from './initialState.js';

export const CURRENT_SCHEMA_VERSION = 8;

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
  // 6.5 (remediation 2026-06-10, improvement b-11): % of the taxable return
  // lost to tax each month. 100 = fully taxed away (the engine clamps the
  // multiplier at 0 — returns can never flip sign from drag alone).
  taxableReturnDragPct: { min: 0, max: 100 },
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
  // A2 (2026-06-10): annual SS COLA % (D2 — default 2.5, slider 0–4)
  ssColaRate: { min: 0, max: 4 },
  ssPIA: { min: 0, max: 5000 },
  // Sarah's spousal SS — current age + claim age (62–70 per SSA rules)
  sarahCurrentAge: { min: 18, max: 100 },
  sarahSpousalClaimAge: { min: 62, max: 70 },
  sarahOwnSS: { min: 0, max: 10000 },                 // Her own-record monthly benefit (retirement sim)
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
  chadJob401kDeferral: { min: 0, max: 24500 },        // IRC §402(g) 2026 elective deferral limit
  chadJob401kCatchupRoth: { min: 0, max: 11250 },     // SECURE 2.0 super catch-up ages 60-63 ($11,250); regular 50+ = $8,000
  chadJob401kMatch: { min: 0, max: 50000 },           // No fixed cap; IRC §415(c) total annual additions = $70K base + catch-up
  chadCurrentAge: { min: 18, max: 100 },              // Used for age-65 RSU vest continuation eligibility
  chadL64Month: { min: 0, max: 120 },                 // Months after hire until L64 promotion (matches UI slider)
  chadL64Salary: { min: 0, max: 1_000_000 },
  chadL64StockRefresh: { min: 0, max: 1_000_000 },
  chadL64BonusPct: { min: 0, max: 40 },                // Matches UI slider cap
  chadL65Month: { min: 0, max: 180 },                  // Months after hire until L65 promotion (matches UI slider)
  chadL65Salary: { min: 0, max: 1_000_000 },
  chadL65StockRefresh: { min: 0, max: 1_000_000 },
  chadL65BonusPct: { min: 0, max: 50 },                // Matches UI slider cap
  totalMonthlySpend: { min: 0 },
  oneTimeExtras: { min: 0 },
  oneTimeMonths: { min: 0, max: 72 },
  baseExpenses: { min: 0 },
  debtService: { min: 0 },
  // Mortgage P&I split (6.3 — remediation 2026-06-10, improvement b-12, D5).
  // Per-debt bounds for the debts array live in sanitizeDebts (DEBT_* consts).
  mortgagePI: { min: 0, max: 20000 },
  mortgageBalance: { min: 0, max: 5_000_000 },
  mortgageRate: { min: 0, max: 25 },
  expenseInflationRate: { min: 0, max: 15 },
  // Healthcare cost path (6.4 — remediation 2026-06-10, improvement a-6, D6).
  // Premium ceiling is a corruption guard (~5× the current $4,200 family
  // premium); trend shares the expense-inflation ceiling. ssdiEntitlementMonth
  // is NULLABLE (null = no Medicare modeled) — the nullable branch in
  // validateAndSanitize applies this clamp; negative = entitlement in the past
  // (with 18 months of back pay the award letter can predate the projection).
  healthPremiumMonthly: { min: 0, max: 20000 },
  medicalTrendRate: { min: 0, max: 15 },
  ssdiEntitlementMonth: { min: -120, max: 120 },
  bcsAnnualTotal: { min: 0 },
  bcsParentsAnnual: { min: 0 },
  // Twins' college (6.2 — remediation 2026-06-10, D4). Cost ceiling is a
  // corruption guard (~$120k/kid/yr), not a UI mirror; start month parallels
  // the milestone guard (well past any projection horizon).
  collegeCostPerKidMonthly: { min: 0, max: 10000 },
  collegeStartMonth: { min: 0, max: 240 },
  collegeMonths: { min: 0, max: 120 },
  college529Balance: { min: 0, max: 5_000_000 },
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
  // Effective tax rate on 401(k) deficit withdrawals (remediation 2026-06-09 D7).
  // Capped well below 100% — the gross-up divides by (1 - rate).
  deficit401kTaxRate: { min: 0, max: 60 },
  // Effective tax rate on RETIREMENT 401(k) withdrawals (A5 — remediation
  // 2026-06-10 item 3.1, D3 default 13). Same cap as the deficit-draw rate.
  retirement401kTaxRate: { min: 0, max: 60 },
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
  // Tax engine controls (Tax tab — remediation 2026-06-09 D1).
  // Bounds match the TaxSettingsPanel sliders.
  taxInflationRate: { min: 0, max: 10 },
  taxSchCExpenseRatio: { min: 0, max: 80 },
  taxPropertyTax: { min: 0, max: 50000 },
  taxSalesTax: { min: 0, max: 50000 },
  taxPersonalPropTax: { min: 0, max: 10000 },
  taxMortgageInt: { min: 0, max: 100000 },
  taxCharitable: { min: 0, max: 100000 },
  taxMedical: { min: 0, max: 200000 },
  taxW2Withholding: { min: 0, max: 100000 },
  taxCtcChildren: { min: 0, max: 10 },
  taxOdcDependents: { min: 0, max: 10 },
  taxCapGainLoss: { min: -100000, max: 100000 },
  taxSolo401k: { min: 0, max: 70000 },
  msftGrowth: { min: -50, max: 50 },
  // FIX M-Cuts: bound cutsOverride at 10x typical baseExpenses (~$10K/mo).
  // Generous ceiling but prevents pathological scenarios from corrupting the projection.
  cutsOverride: { min: 0, max: 100000 },
};

// --- Enum constraints ---

const ENUMS = {
  ssType: ['ssdi', 'ss'],
  chadAge65VestOverride: ['auto', 'on', 'off'],
  postJobBenefit: ['ssRetirement', 'ssdi', 'none'],
  taxMode: ['flat', 'engine'],
  // Remediation 2026-06-09 D4 — capital items funding source.
  capitalFundingSource: ['advance', 'savings'],
};

// Must cover every type GoalPanel.jsx offers (GOAL_TYPES) — a missing entry
// here silently DELETES that goal on save/load. Parity is locked by
// saveLoadRoundtrip.test.js ("a goal of EVERY type GoalPanel offers...").
const VALID_GOAL_TYPES = new Set(['savings_floor', 'income_target', 'savings_target', 'net_worth_target', 'debt_free']);

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
      // Convert legacy sarahWorkYears (years) → sarahWorkMonths (months) ONLY when
      // sarahWorkMonths is missing. The 1→2 migration injects sarahWorkYears=6
      // for forward-compat, so a saved state with both keys would otherwise
      // have its sarahWorkMonths silently overwritten with 72. Bug found by
      // the saveLoadRoundtrip audit.
      if (result.sarahWorkYears !== undefined) {
        if (result.sarahWorkMonths === undefined) {
          result.sarahWorkMonths = (result.sarahWorkYears || 6) * 12;
        }
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
  {
    from: 7,
    to: 8,
    fn: (state) => {
      const result = { ...state };
      // 6.3 (remediation 2026-06-10, improvement a-5, gate D5): per-debt
      // amortization list. Empty list == flat debtService (snapshot-preserving
      // default). The mortgage scalar fields (mortgagePI/Balance/Rate) fall
      // through validateAndSanitize defaults (0 = no-op).
      if (!Array.isArray(result.debts)) result.debts = [];
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
    if (key === 'debts') {
      result[key] = sanitizeDebts(rawVal);
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
    // Finite checks (remediation phase 5): typeof NaN === 'number', so the
    // old checks let NaN/Infinity through into goal evaluation.
    targetAmount: typeof g.targetAmount === 'number' && Number.isFinite(g.targetAmount) ? g.targetAmount : 0,
    targetMonth: typeof g.targetMonth === 'number' && Number.isFinite(g.targetMonth) ? g.targetMonth : 72,
    color: typeof g.color === 'string' ? g.color : '#4ade80',
  }));
}

// Milestone range bounds (remediation phase 5). The UI slider caps month at
// totalProjectionMonths (≤204) and savings at $5,000/mo; the sanitizer is
// deliberately more generous (corruption guard, not a UI mirror) so direct
// JSON edits survive, but a corrupted payload (e.g. savings: 1e15) can no
// longer flow into the projection's expense math.
const MILESTONE_MONTH_MAX = 600;     // 50 years — far past any projection horizon
const MILESTONE_SAVINGS_MAX = 50000; // 10× the UI slider ceiling

function sanitizeMilestones(milestones, fallback) {
  if (!Array.isArray(milestones)) return fallback;
  return milestones.filter(m =>
    m && typeof m === 'object' &&
    typeof m.month === 'number' && Number.isFinite(m.month) &&
    typeof m.savings === 'number' && Number.isFinite(m.savings)
  ).map(m => ({
    name: typeof m.name === 'string' ? m.name : '',
    month: clampNum(m.month, 0, MILESTONE_MONTH_MAX, 0),
    savings: clampNum(m.savings, 0, MILESTONE_SAVINGS_MAX, 0),
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

// Per-debt corruption guards (6.3 — remediation 2026-06-10, improvement a-5,
// gate D5). Balance shares the capital-items $5M ceiling; APR is capped at
// 50% (above any consumer rate); payment at $50k/mo (~8× the flat
// debtService). Guards, not UI mirrors — direct JSON edits survive.
const DEBT_BALANCE_MAX = 5_000_000;
const DEBT_APR_MAX = 50;
const DEBT_PAYMENT_MAX = 50_000;

export function sanitizeDebts(debts) {
  if (!Array.isArray(debts)) return [];
  return debts.filter(d => d && typeof d === 'object').map(d => ({
    id: typeof d.id === 'string' && d.id.length > 0 ? d.id : genId('debt'),
    name: typeof d.name === 'string' ? d.name : 'Untitled debt',
    balance: clampNum(d.balance, 0, DEBT_BALANCE_MAX, 0),
    apr: clampNum(d.apr, 0, DEBT_APR_MAX, 0),
    payment: clampNum(d.payment, 0, DEBT_PAYMENT_MAX, 0),
  }));
}

// Lever bound ceiling (remediation phase 5). Every bounded-continuous lever
// is non-negative; the largest workshop default is $400K (chadL65Salary), so
// $5M is a generous corruption guard that still leaves room for overrides.
const LEVER_BOUND_MAX = 5_000_000;

/**
 * Sanitize the `leverConstraintsOverride` MODEL_KEY (Story 2.2).
 *
 * Accepts null, undefined, or an object mapping lever keys to { min?, max? }
 * objects. Malformed entries are stripped; non-object input returns null.
 * Bounds are clamped to [0, LEVER_BOUND_MAX] and inverted windows
 * (min > max) are REJECTED — the entry reverts to workshop defaults, since
 * downstream consumers (Story 2.3 optimizer, Story 2.4 sliders) assume
 * min <= max (remediation phase 5 hardening).
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
    if (typeof val.min === 'number' && Number.isFinite(val.min)) {
      entry.min = clampNum(val.min, 0, LEVER_BOUND_MAX, 0);
    }
    if (typeof val.max === 'number' && Number.isFinite(val.max)) {
      entry.max = clampNum(val.max, 0, LEVER_BOUND_MAX, 0);
    }
    if (Object.keys(entry).length === 0) continue;
    // Inverted window — reject the whole entry (revert to workshop defaults).
    if (entry.min !== undefined && entry.max !== undefined && entry.min > entry.max) continue;
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

/**
 * Sanitize a parsed checkInHistory array restored from storage (remediation 1.1).
 *
 * Check-ins are irreplaceable user work, so this is deliberately minimal:
 * keep every entry that is a plain object with a finite numeric `month`
 * (all fields preserved verbatim), drop anything structurally invalid, and
 * sort by month to match the RECORD_CHECK_IN invariant.
 *
 * IMPORTANT: checkInHistory is NOT a MODEL_KEY, so it must NEVER be restored
 * through RESTORE_STATE — validateAndSanitize would drop it AND reset every
 * missing MODEL_KEY to defaults (the data-loss bug this replaced). Restore it
 * via SET_FIELD with this sanitizer, mirroring the monthlyActuals pattern.
 */
export function sanitizeCheckInHistory(val) {
  if (!Array.isArray(val)) return [];
  return val
    .filter(c =>
      c && typeof c === 'object' && !Array.isArray(c) &&
      typeof c.month === 'number' && Number.isFinite(c.month)
    )
    .sort((a, b) => a.month - b.month);
}

let _idCounter = 0;
function genId(prefix) {
  _idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${_idCounter.toString(36)}`;
}
