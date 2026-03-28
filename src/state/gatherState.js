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
  s.bcsFamilyMonthly = Math.round(Math.max(0, (st.bcsAnnualTotal || 0) - (st.bcsParentsAnnual || 0)) / 12);
  // If totalMonthlySpend is set, back-calculate baseExpenses from it
  if (s.totalMonthlySpend != null) {
    s.baseExpenses = Math.max(0, s.totalMonthlySpend - (s.debtService || 0) - (s.vanMonthlySavings || 0) - s.bcsFamilyMonthly);
  }
  // If cutsOverride is set, use it as total cuts (split into lifestyleCuts, zero the rest)
  // Otherwise use the individual item sums
  const override = st.cutsOverride;
  if (override != null) {
    s.lifestyleCuts = override;
    s.cutInHalf = 0;
    s.extraCuts = 0;
  } else {
    s.lifestyleCuts = (st.cutOliver || 0) + (st.cutVacation || 0) + (st.cutGym || 0);
    s.cutInHalf = (st.cutMedical || 0) + (st.cutShopping || 0) + (st.cutSaaS || 0);
    s.extraCuts = (st.cutAmazon || 0) + (st.cutEntertainment || 0) + (st.cutGroceries || 0) + (st.cutPersonalCare || 0) + (st.cutSmallItems || 0);
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
