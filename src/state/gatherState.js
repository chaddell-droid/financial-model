import { INITIAL_STATE, MODEL_KEYS } from './initialState.js';

/**
 * Build the projection-ready state object from the full UI state.
 *
 * Extracts MODEL_KEYS from `state`, computes BCS family share, and
 * resolves cutsOverride into the three cuts buckets.
 *
 * @param {object} state — full UI state (or a partial override merged onto INITIAL_STATE)
 * @returns {object} — projection-ready state
 */
export function gatherState(state) {
  const st = state || INITIAL_STATE;
  const s = {};
  for (const key of MODEL_KEYS) s[key] = st[key] ?? INITIAL_STATE[key];
  s.bcsFamilyMonthly = Math.round(Math.max(0, (s.bcsAnnualTotal || 0) - (s.bcsParentsAnnual || 0)) / 12);
  // Spend schedule supersedes totalMonthlySpend. If spendSchedule has entries,
  // pass it through to projection (per-month back-calc happens in simulation loop).
  // Legacy fallback: convert totalMonthlySpend to single-entry schedule.
  if ((s.spendSchedule || []).length === 0 && s.totalMonthlySpend != null) {
    s.spendSchedule = [{ month: 0, amount: s.totalMonthlySpend }];
  }
  // If cutsOverride is set, use it as total cuts (split into lifestyleCuts, zero the rest)
  // Otherwise use the individual item sums
  const override = s.cutsOverride;
  if (override != null) {
    s.lifestyleCuts = override;
    s.cutInHalf = 0;
    s.extraCuts = 0;
  } else {
    s.lifestyleCuts = (s.cutOliver || 0) + (s.cutVacation || 0) + (s.cutGym || 0);
    s.cutInHalf = (s.cutMedical || 0) + (s.cutShopping || 0) + (s.cutSaaS || 0);
    s.extraCuts = (s.cutAmazon || 0) + (s.cutEntertainment || 0) + (s.cutGroceries || 0) + (s.cutPersonalCare || 0) + (s.cutSmallItems || 0);
  }
  return s;
}

/**
 * Convenience wrapper: merge overrides onto INITIAL_STATE, then gather.
 * Useful in tests where you want to override just a few fields.
 */
export function gatherStateWithOverrides(overrides = {}) {
  return gatherState({ ...INITIAL_STATE, ...overrides });
}
