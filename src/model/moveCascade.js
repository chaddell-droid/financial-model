import { computeProjection } from './projection.js';
import { gatherState } from '../state/gatherState.js';
import {
  BREAKEVEN_MULTIPLIER,
  buildLeverCandidates,
  computeBreakevenMonthDelta,
} from './sensitivityAnalysis.js';
import { optimizeContinuousLever } from './moveOptimizer.js';

// ─── Continuous-lever candidate generation (Story 2.3) ─────────────────────
// Conditional activation gates for continuous levers that only apply when a
// prerequisite binary lever is active. Keeps the optimizer from burning
// cycles on inapplicable levers (e.g., vanSaleMonth is meaningless until
// vanSold is true).
const CONTINUOUS_LEVER_PREREQS = {
  cutsOverride: (s) => Boolean(s.lifestyleCutsApplied),
  chadJobStartMonth: (s) => Boolean(s.chadJob),
  vanSaleMonth: (s) => Boolean(s.vanSold),
};

/**
 * Format a human-readable label for a continuous-lever optimization move.
 * Keeps UI-ready text here so the cascade's result shape stays uniform
 * with the discrete-lever candidates from buildLeverCandidates.
 */
function labelForContinuousMove(leverKey, currentValue, newValue) {
  const rounded = Math.round(newValue * 100) / 100;
  switch (leverKey) {
    case 'sarahRate':
      return `Raise Sarah's rate to $${Math.round(rounded)}/hr`;
    case 'sarahCurrentClients':
      return `Sarah sees ${rounded} clients/day`;
    case 'cutsOverride':
      return `Increase spending cuts to $${Math.round(rounded)}/mo`;
    case 'bcsParentsAnnual':
      return `Raise external BCS contribution to $${Math.round(rounded).toLocaleString()}/yr`;
    case 'chadConsulting':
      return `Scale consulting to $${Math.round(rounded)}/mo`;
    case 'ssClaimAge':
      return `Claim SS at age ${Math.round(rounded)}`;
    case 'chadJobStartMonth':
      return `Start W-2 job at month ${Math.round(rounded)}`;
    case 'vanSaleMonth':
      return `Sell the van at month ${Math.round(rounded)}`;
    default:
      return `Optimize ${leverKey} to ${rounded}`;
  }
}

/**
 * Build continuous-lever candidates for a given working state.
 * For each bounded-continuous lever whose prerequisites are met AND whose
 * current value leaves room to improve, run the optimizer and emit a
 * candidate with the optimizer's chosen value as the mutation.
 *
 * Skipping rules:
 *   • Prerequisite binary inactive → skip (e.g., vanSaleMonth when vanSold=false)
 *   • Current value already at or beyond optimizer's suggestion → skip
 *   • Optimizer returns non-positive impact → skip (filter matches discrete
 *     lever filter in the main cascade loop)
 */
function buildContinuousLeverCandidates(state) {
  const candidates = [];
  const effective = state.effectiveLeverConstraints;
  if (!effective || typeof effective !== 'object') return candidates;

  for (const [leverKey, constraints] of Object.entries(effective)) {
    const prereq = CONTINUOUS_LEVER_PREREQS[leverKey];
    if (prereq && !prereq(state)) continue;

    const currentValue = state[leverKey];
    if (typeof currentValue === 'number' && currentValue >= constraints.max) continue;

    let optimized;
    try {
      optimized = optimizeContinuousLever(state, leverKey, constraints);
    } catch (err) {
      // Swallow — optimizer error is surfaced via the thrown message but
      // should never crash the cascade. Skip the offending lever.
      continue;
    }

    const { value, impact } = optimized;
    if (impact <= 0) continue;
    if (typeof currentValue === 'number' && Math.abs(value - currentValue) < 1e-6) continue;

    candidates.push({
      id: `optimize:${leverKey}`,
      label: labelForContinuousMove(leverKey, currentValue, value),
      unit: 'optimized',
      monthlyImpact: 0, // continuous levers don't have a canonical monthly impact
      mutation: { [leverKey]: value },
    });
  }

  return candidates;
}

/**
 * Greedy cascade recommendation engine.
 *
 * Given a baseline state, produce an ordered sequence of next-best moves where
 * each move is the best choice CONDITIONED on all prior moves being applied.
 * Unlike `computeTopMoves`, which ranks inactive levers independently against
 * the baseline, the cascade locks each selected move into the working state
 * before evaluating the next candidate.
 *
 * Selection score mirrors `computeTopMoves`:
 *   score = marginalFinalBalanceDelta + (-marginalBreakevenMonthDelta) * $5k
 * where "marginal" is measured against the CURRENT working state (baseline +
 * all previously-locked moves), not against the original baseline.
 *
 * Each returned rung carries TWO views of impact:
 *   • STANDALONE — as if THIS move alone were applied to the ORIGINAL baseline
 *   • CUMULATIVE — composed state (baseline + all moves through this one) vs baseline
 *
 * For the first rung, standalone === cumulative.
 *
 * Result shape per rung:
 *   {
 *     id, label, mutation,               // lever identity (from buildLeverCandidates)
 *     monthlyImpact,                     // lever's intrinsic $/mo value
 *     cumulativeMonthlyImpact,           // sum of monthlyImpact through this rung
 *     finalBalanceDelta,                 // standalone: this lever vs baseline
 *     cumulativeFinalBalanceDelta,       // composed: everything-so-far vs baseline
 *     breakevenMonthDelta,               // standalone; negative = earlier (good)
 *     cumulativeBreakevenMonthDelta,     // composed; negative = earlier (good)
 *   }
 *
 * Greedy correctness: because each selected move improves the composite score
 * vs the current working state, cumulativeFinalBalanceDelta is non-decreasing
 * along the cascade when every selected move is a final-balance improver. A
 * move that trades worse final balance for earlier breakeven can violate the
 * strict monotonicity on that single axis (by design of the composite score).
 */
export function computeMoveCascade(baseState, count = 3) {
  if (!baseState || count <= 0) return [];

  const baselineProj = computeProjection(baseState);
  const baselineMonthly = baselineProj.monthlyData;
  if (!baselineMonthly || baselineMonthly.length === 0) return [];
  const baselineFinalBalance = baselineMonthly[baselineMonthly.length - 1].balance;
  const baselineQuarterly = baselineProj.data;

  const results = [];
  let workingState = baseState;
  let workingFinalBalance = baselineFinalBalance;
  let workingQuarterly = baselineQuarterly;

  for (let step = 0; step < count; step++) {
    const discrete = buildLeverCandidates(workingState);
    const continuous = buildContinuousLeverCandidates(workingState);
    const candidates = [...discrete, ...continuous];
    if (candidates.length === 0) break;

    let best = null;

    for (const cand of candidates) {
      const composedState = gatherState({ ...workingState, ...cand.mutation });
      const composedProj = computeProjection(composedState);
      const composedMonthly = composedProj.monthlyData;
      const composedFinalBalance = composedMonthly[composedMonthly.length - 1].balance;
      const composedQuarterly = composedProj.data;

      // Marginal impact vs current working state — drives selection
      const marginalFinalDelta = composedFinalBalance - workingFinalBalance;
      const marginalBreakevenDelta = computeBreakevenMonthDelta(workingQuarterly, composedQuarterly);

      // Filter: must improve on at least one axis (mirrors computeTopMoves)
      if (marginalFinalDelta <= 0 && marginalBreakevenDelta >= 0) continue;

      const score = marginalFinalDelta + (-marginalBreakevenDelta) * BREAKEVEN_MULTIPLIER;

      if (!best || score > best.score) {
        best = {
          cand,
          composedState,
          composedFinalBalance,
          composedQuarterly,
          score,
        };
      }
    }

    if (!best) break;

    // Standalone reference: apply ONLY this move to the ORIGINAL baseline
    const standaloneState = gatherState({ ...baseState, ...best.cand.mutation });
    const standaloneProj = computeProjection(standaloneState);
    const standaloneMonthly = standaloneProj.monthlyData;
    const standaloneFinalBalance = standaloneMonthly[standaloneMonthly.length - 1].balance;
    const standaloneFinalDelta = Math.round(standaloneFinalBalance - baselineFinalBalance);
    const standaloneBreakevenDelta = computeBreakevenMonthDelta(baselineQuarterly, standaloneProj.data);

    // Cumulative reference: composed (working + this move) vs baseline
    const cumulativeFinalDelta = Math.round(best.composedFinalBalance - baselineFinalBalance);
    const cumulativeBreakevenDelta = computeBreakevenMonthDelta(baselineQuarterly, best.composedQuarterly);

    const prevCumMonthly = results.length > 0 ? results[results.length - 1].cumulativeMonthlyImpact : 0;
    const cumulativeMonthlyImpact = Math.round(prevCumMonthly + (best.cand.monthlyImpact || 0));

    results.push({
      id: best.cand.id,
      label: best.cand.label,
      mutation: best.cand.mutation,
      monthlyImpact: Math.round(best.cand.monthlyImpact || 0),
      cumulativeMonthlyImpact,
      finalBalanceDelta: standaloneFinalDelta,
      cumulativeFinalBalanceDelta: cumulativeFinalDelta,
      breakevenMonthDelta: standaloneBreakevenDelta,
      cumulativeBreakevenMonthDelta: cumulativeBreakevenDelta,
    });

    // Advance working state for next iteration
    workingState = best.composedState;
    workingFinalBalance = best.composedFinalBalance;
    workingQuarterly = best.composedQuarterly;
  }

  return results;
}
