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
import { getNumCohorts, getCohortLabel } from './historicalReturns.js';

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
  sarahSpousalClaimAge,
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
  // A7 (remediation 2026-06-10, item 1.5): Sarah's spousal claim age flows
  // from state (D9 default 67, slider 62–70) into the retirement sim, which
  // gates her benefit at this age and applies the SPOUSAL reduction factor
  // to the 50%-of-PIA ceiling (see getRetirementSSInfo).
  const spousalClaimAge = Math.min(70, Math.max(62, sarahSpousalClaimAge ?? 67));

  return {
    ageDiff, sarahTargetAge, endAge, years, horizonMonths, survivorSpendRatio,
    ssFRA, chadSS, sarahOwnSS: ownSS, claimAge, claimedEarly, survivorSS,
    sarahSpousalClaimAge: spousalClaimAge,
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

/** Empty-state fallback: every field numeric so the UI never renders NaN. */
export const EMPTY_OPTIMAL_RATES = Object.freeze({
  optimalRate: 0, optimalMonthly: 0, optimalPreRate: 0, optimalPreMonthly: 0,
  numCohorts: 0, worstCohort: Object.freeze({ year: 0 }), cohortRange: '',
  optimalConsumption: 0, sliderMax: 30,
});

/**
 * Optimal withdrawal rates — closed-form percentile extraction from the
 * per-cohort SWRs (no binary search). Extracted from useRetirementSimulation
 * (remediation Phase 9) so node tests can verify the math and the empty-pool
 * fallback directly instead of grepping the hook's source text.
 *
 * The 10th-percentile cohort consumption = the total monthly consumption that
 * 90% of historical cohorts could sustain; subtracting guaranteed income
 * (startingCoupleIncome) converts it to a pool draw and an annualized rate.
 */
export function computeOptimalRates({
  cohortSWRs, cohortPreSwrs, totalPool, horizonMonths, startingCoupleIncome,
}) {
  const empty = { ...EMPTY_OPTIMAL_RATES, worstCohort: { year: 0 } };
  if (!(totalPool > 0)) return empty;

  const numCohorts = getNumCohorts(horizonMonths);
  if (numCohorts <= 0 || !cohortSWRs || cohortSWRs.length === 0) return empty;

  const initialIncome = startingCoupleIncome;

  // Sort cohort SWRs; 10th percentile = consumption at 90% survival
  const sorted = Float64Array.from(cohortSWRs).sort();
  const p10idx = Math.floor(numCohorts * 0.10);
  const optimalConsumption = Math.max(0, sorted[p10idx]);

  // Convert total consumption → pool withdrawal rate
  const optimalPoolDraw = Math.max(0, optimalConsumption - initialIncome);
  const optimalRate = totalPool > 0
    ? Math.round(optimalPoolDraw * 12 / totalPool * 1000) / 10 : 0;
  const optimalMonthly = Math.round(optimalPoolDraw);

  // Pre-inheritance rate via closed-form (if applicable)
  let optimalPreRate = optimalRate, optimalPreMonthly = optimalMonthly;
  if (cohortPreSwrs && cohortPreSwrs.length > 0) {
    const sortedPre = Float64Array.from(cohortPreSwrs).sort();
    const preConsumption = Math.max(0, sortedPre[p10idx]);
    const prePoolDraw = Math.max(0, preConsumption - initialIncome);
    optimalPreRate = totalPool > 0
      ? Math.round(prePoolDraw * 12 / totalPool * 1000) / 10 : 0;
    optimalPreMonthly = Math.round(prePoolDraw);
  }

  // Worst historical cohort (lowest formula SWR)
  let worstIdx = 0;
  let worstSWR = Infinity;
  for (let c = 0; c < numCohorts; c++) {
    if (cohortSWRs[c] < worstSWR) { worstSWR = cohortSWRs[c]; worstIdx = c; }
  }
  const worstLabel = getCohortLabel(worstIdx);

  const firstLabel = getCohortLabel(0);
  const lastLabel = getCohortLabel(numCohorts - 1);
  const cohortRange = `${firstLabel.year}–${lastLabel.year}`;

  const sliderMax = Math.max(30, Math.ceil(optimalRate / 5) * 5 + 5);

  return {
    optimalRate, optimalMonthly, optimalPreRate, optimalPreMonthly,
    numCohorts, worstCohort: { year: worstLabel.year }, cohortRange,
    optimalConsumption, sliderMax,
  };
}
