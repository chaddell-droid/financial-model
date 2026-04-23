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
    max: 1620, // SSDI Substantial Gainful Activity (SGA) cap — non-blind,
    // 2025 value per SSA. Verify annually at ssa.gov/oact/cola/sga.html.
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
 * If the user provides `min > max` in their override, the override value is
 * accepted as-is — callers are responsible for validation. (Story 2.3's
 * optimizer hard-asserts bounds; Story 2.4's UI should refuse invalid
 * user-entered bounds.)
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
    result[key] = { min, max };
  }
  return result;
}
