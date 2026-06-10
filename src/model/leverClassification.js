/**
 * Lever Classification — single source of truth for which levers the
 * recommendation engine treats as binary (toggle), bounded-continuous
 * (Phase 2 optimizer-eligible), or awareness-only (sensitivities display).
 *
 * Bounds for bounded-continuous levers come from the Constraint Workshop
 * (see _bmad-output/planning-artifacts/constraint-workshop-2026-04-23.md).
 * Every bound has a rationale captured in inline comments — future changes
 * to bounds should be made via the `leverConstraintsOverride` MODEL_KEY at
 * runtime (editable by the user) rather than by silently editing this file.
 *
 * `computeEffectiveLeverConstraints(override)` merges per-lever user
 * overrides on top of these defaults. Called by `gatherState` to expose the
 * effective bounds to downstream consumers (Phase 2 optimizer, slider UI).
 */

import { SGA_LIMIT } from './constants.js';

export const LEVER_CLASS = Object.freeze({
  BINARY: 'binary',
  BOUNDED_CONTINUOUS: 'bounded-continuous',
  AWARENESS_ONLY: 'awareness-only',
});

/**
 * Classification + default bounds per lever. Frozen so callers cannot
 * mutate the source of truth in place.
 */
export const LEVER_CLASSIFICATION = Object.freeze({
  // ─── Binary levers — toggle, no value to tune ──────────────────────────
  retireDebt: { classification: LEVER_CLASS.BINARY },
  lifestyleCutsApplied: { classification: LEVER_CLASS.BINARY },
  vanSold: { classification: LEVER_CLASS.BINARY },
  chadJob: { classification: LEVER_CLASS.BINARY },
  ssType: { classification: LEVER_CLASS.BINARY }, // enum-binary (ssdi vs ss)
  ssdiDenied: { classification: LEVER_CLASS.BINARY },
  // MSFT promotion ladder + 401(k) toggles. Gated on chadJob via prereq map
  // in moveCascade.js so the engine doesn't propose them when Chad isn't employed.
  chadL64Enabled: { classification: LEVER_CLASS.BINARY },
  chadL65Enabled: { classification: LEVER_CLASS.BINARY },
  chadJob401kEnabled: { classification: LEVER_CLASS.BINARY },

  // ─── Bounded-continuous — Phase 2 optimizer-eligible ────────────────────
  // Bounds from Constraint Workshop 2026-04-23, signed off by Chad.
  sarahRate: {
    classification: LEVER_CLASS.BOUNDED_CONTINUOUS,
    min: 200, // current rate — the floor
    max: 300, // 6yr horizon ceiling: tenure + market lift. Above $300 clients push back.
    defaultStep: 5,
  },
  sarahCurrentClients: {
    classification: LEVER_CLASS.BOUNDED_CONTINUOUS,
    min: 3.75, // current capacity
    max: 5, // post-twins-in-college ceiling. MVP uses 5 universally;
    // technically 4.5 applies before `kidsAgeOutMonths`. Phase-aware
    // bounds can be layered on in a future iteration if needed.
    defaultStep: 0.25,
  },
  cutsOverride: {
    classification: LEVER_CLASS.BOUNDED_CONTINUOUS,
    min: 0,
    max: 3000, // Aggressive total cut ceiling. IMPORTANT: `cutsOverride`
    // is an OVERRIDE, not additive — per gatherState.js, setting it
    // zeroes out the individual cut* fields. So $3,000/mo is the TOTAL
    // cut, not a delta above any already-set cuts.
    defaultStep: 100,
  },
  bcsParentsAnnual: {
    classification: LEVER_CLASS.BOUNDED_CONTINUOUS,
    min: 0, // grandparents / financial aid stop
    max: 43400, // = bcsAnnualTotal when grandparents fully cover. If
    // bcsAnnualTotal changes in initialState, this bound should follow —
    // consider auto-deriving from state in a future iteration.
    defaultStep: 500,
  },
  chadConsulting: {
    classification: LEVER_CLASS.BOUNDED_CONTINUOUS,
    min: 0,
    max: SGA_LIMIT, // SSDI Substantial Gainful Activity (SGA) cap — non-blind.
    // Sourced from the engine constant (constants.js) so the optimizer bound and
    // the projection clamp (projection.js, `Math.min(chadConsulting, SGA_LIMIT)`)
    // can never drift apart. Verify annually at ssa.gov/oact/cola/sga.html.
    // Going above SGA triggers SSDI loss, which defeats the purpose of
    // marginal-income optimization. User can override via
    // `leverConstraintsOverride.chadConsulting.max` when SSA updates.
    defaultStep: 50,
  },
  ssClaimAge: {
    classification: LEVER_CLASS.BOUNDED_CONTINUOUS,
    min: 62, // earliest claim age per SSA rules
    max: 70, // latest delay credit per SSA rules
    defaultStep: 1,
  },
  chadJobStartMonth: {
    classification: LEVER_CLASS.BOUNDED_CONTINUOUS,
    min: 0,
    max: 12, // 12-month realistic planning window for a W-2 offer
    defaultStep: 1,
  },
  vanSaleMonth: {
    classification: LEVER_CLASS.BOUNDED_CONTINUOUS,
    min: 0,
    max: 24, // 24-month window — waits for better market / replacement plan
    defaultStep: 1,
  },

  // ─── MSFT job/comp levers — gated on chadJob via prereq map ──────────
  chadJobSalary: {
    classification: LEVER_CLASS.BOUNDED_CONTINUOUS,
    min: 80000,                 // floor for L63 W-2; below this isn't a competitive offer
    max: 220000,                // L63 ceiling at top of band
    defaultStep: 5000,
  },
  chadJobBonusPct: {
    classification: LEVER_CLASS.BOUNDED_CONTINUOUS,
    min: 0,
    max: 20,                    // L63 bonus target ceiling
    defaultStep: 1,
  },
  chadJobStockRefresh: {
    classification: LEVER_CLASS.BOUNDED_CONTINUOUS,
    min: 0,
    max: 100000,                // typical L63 refresh ceiling
    defaultStep: 5000,
  },
  chadJobRaisePct: {
    classification: LEVER_CLASS.BOUNDED_CONTINUOUS,
    min: 0,
    max: 5,                     // 5% annual raise ceiling
    defaultStep: 0.25,
  },
  chadJobHireStockY1: {
    classification: LEVER_CLASS.BOUNDED_CONTINUOUS,
    min: 0,
    max: 200000,
    defaultStep: 5000,
  },
  chadJobHireStockY2: {
    classification: LEVER_CLASS.BOUNDED_CONTINUOUS,
    min: 0,
    max: 200000,
    defaultStep: 5000,
  },
  chadJobHireStockY3: {
    classification: LEVER_CLASS.BOUNDED_CONTINUOUS,
    min: 0,
    max: 200000,
    defaultStep: 5000,
  },
  chadJobHireStockY4: {
    classification: LEVER_CLASS.BOUNDED_CONTINUOUS,
    min: 0,
    max: 200000,
    defaultStep: 5000,
  },
  chadJobSignOnCash: {
    classification: LEVER_CLASS.BOUNDED_CONTINUOUS,
    min: 0,
    max: 100000,
    defaultStep: 5000,
  },
  chadJobRefreshStartMonth: {
    classification: LEVER_CLASS.BOUNDED_CONTINUOUS,
    min: 0,
    max: 24,                    // engine snaps to next August anyway, but this controls the floor
    defaultStep: 1,
  },
  // 401(k) — gated on chadJob401kEnabled
  chadJob401kDeferral: {
    classification: LEVER_CLASS.BOUNDED_CONTINUOUS,
    min: 0,
    max: 24500,                 // IRC §402(g) 2026 elective deferral limit
    defaultStep: 500,
  },
  chadJob401kCatchupRoth: {
    classification: LEVER_CLASS.BOUNDED_CONTINUOUS,
    min: 0,
    max: 11250,                 // SECURE 2.0 super catch-up ages 60-63
    defaultStep: 250,
  },
  chadJob401kMatch: {
    classification: LEVER_CLASS.BOUNDED_CONTINUOUS,
    min: 0,
    max: 12250,                 // typical employer match ceiling
    defaultStep: 250,
  },
  // L64 promotion — gated on chadL64Enabled
  chadL64Month: {
    classification: LEVER_CLASS.BOUNDED_CONTINUOUS,
    min: 6,
    max: 60,
    defaultStep: 3,
  },
  chadL64Salary: {
    classification: LEVER_CLASS.BOUNDED_CONTINUOUS,
    min: 180000,
    max: 320000,
    defaultStep: 5000,
  },
  chadL64StockRefresh: {
    classification: LEVER_CLASS.BOUNDED_CONTINUOUS,
    min: 0,
    max: 200000,
    defaultStep: 5000,
  },
  chadL64BonusPct: {
    classification: LEVER_CLASS.BOUNDED_CONTINUOUS,
    min: 0,
    max: 30,
    defaultStep: 1,
  },
  // L65 promotion — gated on chadL65Enabled
  chadL65Month: {
    classification: LEVER_CLASS.BOUNDED_CONTINUOUS,
    min: 12,
    max: 120,
    defaultStep: 3,
  },
  chadL65Salary: {
    classification: LEVER_CLASS.BOUNDED_CONTINUOUS,
    min: 220000,
    max: 400000,
    defaultStep: 5000,
  },
  chadL65StockRefresh: {
    classification: LEVER_CLASS.BOUNDED_CONTINUOUS,
    min: 0,
    max: 300000,
    defaultStep: 5000,
  },
  chadL65BonusPct: {
    classification: LEVER_CLASS.BOUNDED_CONTINUOUS,
    min: 0,
    max: 40,
    defaultStep: 1,
  },
  // Retirement timing
  chadWorkMonths: {
    classification: LEVER_CLASS.BOUNDED_CONTINUOUS,
    min: 12,
    max: 144,
    defaultStep: 3,
  },
  sarahWorkMonths: {
    classification: LEVER_CLASS.BOUNDED_CONTINUOUS,
    min: 36,
    max: 144,
    defaultStep: 3,
  },

  // ─── Awareness-only — never recommended as actions ──────────────────────
  investmentReturn: { classification: LEVER_CLASS.AWARENESS_ONLY },
  expenseInflationRate: { classification: LEVER_CLASS.AWARENESS_ONLY },
  msftGrowth: { classification: LEVER_CLASS.AWARENESS_ONLY },
  return401k: { classification: LEVER_CLASS.AWARENESS_ONLY },
  homeAppreciation: { classification: LEVER_CLASS.AWARENESS_ONLY },
  sarahRateGrowth: { classification: LEVER_CLASS.AWARENESS_ONLY },
  sarahClientGrowth: { classification: LEVER_CLASS.AWARENESS_ONLY },
});

/**
 * Look up a lever's classification entry by state key. Returns null for
 * unknown keys so callers can check explicitly.
 */
export function getLeverClassification(leverKey) {
  return Object.prototype.hasOwnProperty.call(LEVER_CLASSIFICATION, leverKey)
    ? LEVER_CLASSIFICATION[leverKey]
    : null;
}

/**
 * Predicate: is this lever eligible for the Phase 2 continuous optimizer?
 * Only `bounded-continuous` levers with defined min/max pass this gate.
 */
export function isOptimizerEligible(leverKey) {
  const entry = LEVER_CLASSIFICATION[leverKey];
  return Boolean(
    entry &&
      entry.classification === LEVER_CLASS.BOUNDED_CONTINUOUS &&
      typeof entry.min === 'number' &&
      typeof entry.max === 'number',
  );
}

/**
 * Return the list of lever keys eligible for the Phase 2 optimizer.
 */
export function getOptimizerEligibleLevers() {
  return Object.keys(LEVER_CLASSIFICATION).filter(isOptimizerEligible);
}

/**
 * Compute effective constraints for every bounded-continuous lever, merging
 * per-lever user overrides on top of workshop defaults.
 *
 * Input `override` is the MODEL_KEY `leverConstraintsOverride`, shaped:
 *   { [leverKey]: { min?: number, max?: number } } | null
 *
 * Output: `{ [leverKey]: { min, max } }` — one entry per optimizer-eligible
 * lever, with workshop default where override is absent. Consumers (Phase 2
 * optimizer, slider UI) read only from this resolved map and never touch
 * LEVER_CLASSIFICATION directly.
 *
 * Inverted windows (`min > max` after merging) are NORMALIZED by swapping the
 * bounds (remediation 2026-06-09, 6.5) so every downstream consumer — the
 * Story 2.3 optimizer hard-asserts min <= max; the Story 2.4 slider returns
 * null for inverted windows — always receives a valid window, even when a bad
 * override bypasses the schema sanitizer (which rejects inverted windows on
 * load, but not on runtime SET_FIELD).
 */
export function computeEffectiveLeverConstraints(override) {
  const result = {};
  for (const [key, entry] of Object.entries(LEVER_CLASSIFICATION)) {
    if (entry.classification !== LEVER_CLASS.BOUNDED_CONTINUOUS) continue;
    const userOverride =
      override && typeof override === 'object' && override[key] && typeof override[key] === 'object'
        ? override[key]
        : null;
    const min =
      userOverride && typeof userOverride.min === 'number' && Number.isFinite(userOverride.min)
        ? userOverride.min
        : entry.min;
    const max =
      userOverride && typeof userOverride.max === 'number' && Number.isFinite(userOverride.max)
        ? userOverride.max
        : entry.max;
    result[key] = min > max ? { min: max, max: min } : { min, max };
  }
  return result;
}
