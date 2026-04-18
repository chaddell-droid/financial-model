import { INITIAL_STATE, MODEL_KEYS } from './initialState.js';
import { ssAdjustmentFactor, TWINS_AGE_OUT_MONTH, SS_START_OFFSET } from '../model/constants.js';

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
  s.totalProjectionMonths = (s.sarahWorkYears || 6) * 12;
  s.bcsFamilyMonthly = Math.round(Math.max(0, (s.bcsAnnualTotal || 0) - (s.bcsParentsAnnual || 0)) / 12);
  // If totalMonthlySpend is set, back-calculate baseExpenses from it.
  // Use status-quo BCS ($25K parents) so the BCS slider actually changes expenses
  // rather than being absorbed into baseExpenses (which would persist after BCS ends).
  if (s.totalMonthlySpend != null) {
    const statusQuoBcsMonthly = Math.round(Math.max(0, (s.bcsAnnualTotal || 0) - 25000) / 12);
    s.baseExpenses = Math.max(0, s.totalMonthlySpend - (s.debtService || 0) - (s.vanMonthlySavings || 0) - statusQuoBcsMonthly);
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
  // SS Retirement: compute derived fields from ssClaimAge + ssPIA
  if (s.ssType === 'ss') {
    const pia = s.ssPIA || 4214;
    const age = s.ssClaimAge || 67;
    s.ssPersonal = Math.round(pia * ssAdjustmentFactor(age));
    s.ssStartMonth = (age - 62) * 12 + SS_START_OFFSET;
    s.ssKidsAgeOutMonths = Math.max(0, TWINS_AGE_OUT_MONTH - s.ssStartMonth);
    s.ssFamilyTotal = s.ssKidsAgeOutMonths > 0
      ? s.ssPersonal + 2 * Math.round(pia * 0.5)
      : s.ssPersonal;
  }
  // Compute projected pension at retirement
  if (s.chadJob && s.chadJobPensionRate > 0) {
    const projectedMonthsWorked = Math.max(0, (s.totalProjectionMonths || 72) - (s.chadJobStartMonth || 0));
    const yearsOfService = projectedMonthsWorked / 12;
    s.chadJobPensionMonthly = Math.round(
      (s.chadJobSalary / 12) * (s.chadJobPensionRate / 100) * yearsOfService
    );
  } else {
    s.chadJobPensionMonthly = 0;
  }

  // Cross-field clamping: ensure sarahRate never exceeds sarahMaxRate.
  if (s.sarahRate > s.sarahMaxRate) s.sarahRate = s.sarahMaxRate;

  return s;
}

/**
 * Convenience wrapper: merge overrides onto INITIAL_STATE, then gather.
 * Useful in tests where you want to override just a few fields.
 */
export function gatherStateWithOverrides(overrides = {}) {
  return gatherState({ ...INITIAL_STATE, ...overrides });
}
