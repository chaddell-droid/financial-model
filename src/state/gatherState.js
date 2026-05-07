import { INITIAL_STATE, MODEL_KEYS } from './initialState.js';
import { ssAdjustmentFactor, TWINS_AGE_OUT_MONTH, SS_START_OFFSET } from '../model/constants.js';
import { composePreviewState } from './previewState.js';
import { computeEffectiveLeverConstraints } from '../model/leverClassification.js';

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
  // Preserve schemaVersion so saved scenarios skip already-applied migrations
  // on reload. Without this, every load re-runs every migration from version 0,
  // and the 1→2 / 3→4 migration pair silently overwrites sarahWorkMonths with 72.
  if (st.schemaVersion !== undefined) s.schemaVersion = st.schemaVersion;
  else if (INITIAL_STATE.schemaVersion !== undefined) s.schemaVersion = INITIAL_STATE.schemaVersion;

  // Capital items migration shim: if the array is empty but legacy scalar fields
  // are populated, derive the array from legacy. Dual-write preserved — legacy
  // fields remain readable/writable so no saved scenario loses data.
  if (!Array.isArray(s.capitalItems) || s.capitalItems.length === 0) {
    s.capitalItems = deriveCapitalItemsFromLegacy(s);
  }
  if (!Array.isArray(s.customLevers)) s.customLevers = [];

  s.chadRetirementMonth = s.chadWorkMonths || 72;
  // Extend projection horizon to cover post-retirement RSU vests when the
  // age-65 vest-continuation rule applies. Each grant vests for up to 60
  // months from issuance, so the tail extends ~60 months past retirement.
  //
  // CRITICAL: post-retirement income MUST be properly modeled in projection.js
  // (auto-SS fallback) so the savings simulation doesn't crash to zero in the
  // extended period. See projection.js post-retirement SS fallback.
  const ageAtRet = (s.chadCurrentAge ?? 61) + s.chadRetirementMonth / 12;
  const age65Eligible = ageAtRet >= 65;
  const age65Override = s.chadAge65VestOverride || 'auto';
  const vestTailApplies = age65Override === 'on' || (age65Override === 'auto' && age65Eligible);
  const hasRefreshGrant = (s.chadJobStockRefresh || 0) > 0
    || (s.chadL64Enabled && (s.chadL64StockRefresh || 0) > 0)
    || (s.chadL65Enabled && (s.chadL65StockRefresh || 0) > 0);
  const vestTailMonths = (s.chadJob && vestTailApplies && hasRefreshGrant) ? 60 : 0;
  s.totalProjectionMonths = Math.max(
    s.chadWorkMonths || 72,
    s.sarahWorkMonths || 72,
    s.chadRetirementMonth + vestTailMonths,
  );
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
    // SSA family-max cap — actual formula is tiered 150-188% of PIA, but 150%
    // is a safe conservative lower-bound that prevents the family-window
    // window from over-paying when 2+ kids would otherwise push total past
    // the realistic ceiling. Caps the per-month payout (ssPersonal stays uncapped).
    const familyMaxCap = Math.round(pia * 1.5);
    s.ssFamilyTotal = Math.min(s.ssFamilyTotal, familyMaxCap);
  }

  // Sarah's spousal SS — derived from Chad's PIA + her current age + her claim age.
  // Earliest she can collect is when she reaches sarahSpousalClaimAge AND Chad has
  // claimed (gated in projection.js by `ssBenefit > 0`). Spousal = 50% of Chad's PIA
  // at her FRA, reduced via ssAdjustmentFactor for early claim.
  // Always derive both fields so projection.js can read them unconditionally; when
  // toggle is off we set start month to a sentinel (999) so the flow never fires.
  const sarahSpousalEnabled = s.sarahSpousalEnabled !== false;
  if (sarahSpousalEnabled) {
    const piaForSpousal = s.ssPIA || 0;
    const sarahPIA50 = Math.round(piaForSpousal * 0.5);
    const sarahClaimAge = s.sarahSpousalClaimAge || 67;
    s.sarahSpousalAmount = Math.round(sarahPIA50 * ssAdjustmentFactor(sarahClaimAge));
    const sarahCurAge = s.sarahCurrentAge ?? 59;
    s.sarahSpousalStartMonth = Math.max(0, (sarahClaimAge - sarahCurAge) * 12);
  } else {
    s.sarahSpousalAmount = 0;
    s.sarahSpousalStartMonth = 999;
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

  // Effective lever constraints — workshop defaults + any user override.
  // Phase 2 optimizer (Story 2.3) and slider UI (Story 2.4) read from here,
  // never from LEVER_CLASSIFICATION directly.
  s.effectiveLeverConstraints = computeEffectiveLeverConstraints(s.leverConstraintsOverride);

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
