import { INITIAL_STATE, MODEL_KEYS } from './initialState.js';
import { ssAdjustmentFactor, TWINS_AGE_OUT_MONTH, SS_START_OFFSET } from '../model/constants.js';
import { composePreviewState } from './previewState.js';

/**
 * Build the projection-ready state object from the full UI state.
 *
 * Extracts MODEL_KEYS from `state`, computes BCS family share, and
 * resolves cutsOverride into the three cuts buckets.
 *
 * If the input state has `previewMoves`, those mutations are composed onto
 * the state BEFORE MODEL_KEYS are extracted — so derivations (bcsFamilyMonthly,
 * lifestyleCuts, ssPersonal, etc.) run on the composed input. The returned
 * state does NOT contain `previewMoves` (it's not in MODEL_KEYS), so callers
 * who re-pass the result into gatherState won't double-apply.
 *
 * @param {object} state — full UI state (or a partial override merged onto INITIAL_STATE)
 * @returns {object} — projection-ready state
 */
export function gatherState(state) {
  const stIn = state || INITIAL_STATE;
  // Compose any staged preview moves onto the input BEFORE extracting MODEL_KEYS
  // so all downstream derivations read the composed values. No-op when
  // previewMoves is empty or absent (the common case).
  const st = (stIn.previewMoves && stIn.previewMoves.length > 0)
    ? composePreviewState(stIn, stIn.previewMoves)
    : stIn;
  const s = {};
  for (const key of MODEL_KEYS) s[key] = st[key] ?? INITIAL_STATE[key];

  // Capital items migration shim: if the array is empty but legacy scalar fields
  // are populated, derive the array from legacy. Dual-write preserved — legacy
  // fields remain readable/writable so no saved scenario loses data.
  if (!Array.isArray(s.capitalItems) || s.capitalItems.length === 0) {
    s.capitalItems = deriveCapitalItemsFromLegacy(s);
  }
  if (!Array.isArray(s.customLevers)) s.customLevers = [];

  s.chadRetirementMonth = s.chadWorkMonths || 72;
  s.totalProjectionMonths = Math.max(s.chadWorkMonths || 72, s.sarahWorkMonths || 72);
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
    const projectedMonthsWorked = Math.max(0, (s.chadWorkMonths || 72) - (s.chadJobStartMonth || 0));
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

/**
 * Derive capital items from legacy scalar fields (moldCost/roofCost/otherProjects +
 * their *Include booleans). Used as a one-time seed so pre-v6 saved scenarios and
 * the default state both surface in the new array-based UI.
 */
export function deriveCapitalItemsFromLegacy(s) {
  return [
    {
      id: 'legacy-mold',
      name: 'Mold remediation',
      description: 'Basement · quoted by Elite ENV',
      cost: Math.max(0, s.moldCost || 0),
      include: Boolean(s.moldInclude),
      likelihood: 100,
    },
    {
      id: 'legacy-roof',
      name: 'Roof replacement',
      description: 'Est. replacement',
      cost: Math.max(0, s.roofCost || 0),
      include: Boolean(s.roofInclude),
      likelihood: 100,
    },
    {
      id: 'legacy-other',
      name: 'House projects & trailers',
      description: 'Landscape + pop-up trailer',
      cost: Math.max(0, s.otherProjects || 0),
      include: Boolean(s.otherInclude),
      likelihood: 100,
    },
  ];
}
