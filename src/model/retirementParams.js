/**
 * Pure parameter derivations for the retirement simulation
 * (useRetirementSimulation). Extracted so plain-node tests can verify parity
 * between the hook's derived values and gatherState-derived state.
 *
 * Finding 2026-06-09 2.3: the hook hardcoded ageDiff=14 ("Chad is 60, Sarah
 * is 46") and sarahOwnSS=1900 while state said chadCurrentAge=61 /
 * sarahCurrentAge=59 (ageDiff 2). Everything here now derives from the same
 * state fields the rest of the app uses.
 */
import { ssRecalculatedBenefit } from './constants.js';

// Sarah's planning horizon: simulate until she reaches this age.
export const SARAH_TARGET_AGE = 90;
// Survivor spending ratio after Chad passes (60% of couple spending).
export const SURVIVOR_SPEND_RATIO = 0.6;

/**
 * Derive the retirement-simulation parameters from state-backed inputs.
 * All inputs come straight from gatherState/MODEL_KEYS fields (no UI-only
 * values), so a parity test can compare against gatherStateWithOverrides.
 */
export function deriveRetirementParams({
  chadCurrentAge, sarahCurrentAge, sarahOwnSS,
  ssType, ssPIA, ssClaimAge, ssMonthsWithheld,
  trustIncomeFuture, chadJobPensionMonthly,
} = {}) {
  // Age gap from state — the sim indexes time by Chad's age (retires at 67),
  // so Sarah's age at month t is chadAge - ageDiff.
  const ageDiff = (chadCurrentAge ?? 61) - (sarahCurrentAge ?? 59);
  const sarahTargetAge = SARAH_TARGET_AGE;
  const endAge = sarahTargetAge + ageDiff; // Chad's age when Sarah reaches target
  const years = Math.max(1, endAge - 67); // guard: never a non-positive horizon
  const horizonMonths = years * 12;
  const survivorSpendRatio = SURVIVOR_SPEND_RATIO;

  // Chad's SS — PIA from state. SS-retirement path credits months withheld by
  // the earnings test via the SSA recalculation at FRA.
  const ssFRA = ssPIA || 4214;
  const chadSS = (ssType === 'ss')
    ? ssRecalculatedBenefit(ssFRA, ssClaimAge || 62, ssMonthsWithheld || 0)
    : ssFRA;
  // Sarah's own-record SS benefit — state field (was hardcoded 1900).
  // `?? 1900` keeps an explicit 0 (no own benefit) intact.
  const ownSS = sarahOwnSS ?? 1900;
  // Survivor benefit: if Chad claimed before FRA, Sarah gets
  // max(his benefit, 82.5% of PIA). If Chad claimed at/after FRA (or SSDI,
  // which converts at FRA), Sarah gets his full benefit.
  const claimAge = ssClaimAge || 67;
  const claimedEarly = ssType === 'ss' && claimAge < 67;
  const survivorSS = claimedEarly
    ? Math.max(chadSS, Math.round(ssFRA * 0.825))
    : chadSS;
  const trustMonthly = trustIncomeFuture || 0;
  const pensionMonthly = chadJobPensionMonthly || 0;
  const startingCoupleIncome = chadSS + trustMonthly + pensionMonthly;

  return {
    ageDiff, sarahTargetAge, endAge, years, horizonMonths, survivorSpendRatio,
    ssFRA, chadSS, sarahOwnSS: ownSS, claimAge, claimedEarly, survivorSS,
    trustMonthly, pensionMonthly, startingCoupleIncome,
  };
}

/**
 * Scale factor mapping the user's pool-draw slider onto the per-cohort
 * closed-form consumption schedules (finding 2026-06-09 2.5a). The two-phase
 * band path claimed to scale "to user's slider" but ran every cohort at its
 * own full SWR, so the slider had no effect on the bands when an inheritance
 * was active. factor = userConsumption / optimalConsumption; 1 when the
 * optimal is unknown (empty cohorts / zero pool).
 */
export function withdrawalScaleFactor(userConsumption, optimalConsumption) {
  if (!Number.isFinite(userConsumption) || !Number.isFinite(optimalConsumption)) return 1;
  if (optimalConsumption <= 0 || userConsumption < 0) return 1;
  return userConsumption / optimalConsumption;
}

/**
 * Per-cohort two-phase withdrawal schedule: pre-inheritance rate until
 * inheritanceMonth, post-inheritance rate from then on — BOTH phases scaled
 * by `factor` so the user's slider moves the whole schedule proportionally.
 */
export function buildTwoPhaseSchedule(horizonMonths, inheritanceMonth, preRate, postRate, factor = 1) {
  const schedule = new Float64Array(horizonMonths);
  for (let t = 0; t < horizonMonths; t++) {
    schedule[t] = (t < inheritanceMonth ? preRate : postRate) * factor;
  }
  return schedule;
}

/**
 * The withdrawal slider auto-syncs to the optimal (90% finish-above-reserve)
 * rate ONLY while pristine; once the user drags it, the manual value sticks
 * (finding 2026-06-09 2.5b — the sync effect used to clobber manual values
 * whenever any input shifted the optimal rate).
 */
export function shouldAutoSyncWithdrawalRate({ isPwaMode, dirty, optimalRate }) {
  return !isPwaMode && !dirty && optimalRate > 0;
}
