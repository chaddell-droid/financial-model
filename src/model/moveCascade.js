import { computeProjection } from './projection.js';
import { gatherState } from '../state/gatherState.js';
import {
  BREAKEVEN_MULTIPLIER,
  GOAL_PROGRESS_MULTIPLIER,
  buildLeverCandidates,
  computeBreakevenMonthDelta,
} from './sensitivityAnalysis.js';
import { evaluateAllGoals } from './goalEvaluation.js';
import { optimizeContinuousLever } from './moveOptimizer.js';
import { getEndingResourceValue } from './projectionMetrics.js';

// ─── Continuous-lever candidate generation (Story 2.3) ─────────────────────
// Conditional activation gates for continuous levers that only apply when a
// prerequisite binary lever is active. Keeps the optimizer from burning
// cycles on inapplicable levers (e.g., vanSaleMonth is meaningless until
// vanSold is true).
const CONTINUOUS_LEVER_PREREQS = {
  cutsOverride: (s) => Boolean(s.lifestyleCutsApplied),
  chadJobStartMonth: (s) => Boolean(s.chadJob),
  vanSaleMonth: (s) => Boolean(s.vanSold),
  // ssClaimAge only applies when the user is on SS retirement (not SSDI).
  // Without this gate the engine would emit a "Claim SS at age X" rung that
  // the projection ignores because ssType==='ssdi'. (Math audit M11.)
  ssClaimAge: (s) => s.ssType === 'ss',
  // MSFT comp & 401(k) levers — meaningless unless Chad is employed.
  chadJobSalary: (s) => Boolean(s.chadJob),
  chadJobBonusPct: (s) => Boolean(s.chadJob),
  chadJobStockRefresh: (s) => Boolean(s.chadJob),
  chadJobRaisePct: (s) => Boolean(s.chadJob),
  chadJobHireStockTotal: (s) => Boolean(s.chadJob),
  chadJobSignOnCash: (s) => Boolean(s.chadJob),
  chadJobRefreshStartMonth: (s) => Boolean(s.chadJob),
  // 401(k) deferral/catchup/match only relevant when 401(k) is enabled.
  chadJob401kDeferral: (s) => Boolean(s.chadJob) && Boolean(s.chadJob401kEnabled),
  chadJob401kCatchupRoth: (s) => Boolean(s.chadJob) && Boolean(s.chadJob401kEnabled),
  chadJob401kMatch: (s) => Boolean(s.chadJob) && Boolean(s.chadJob401kEnabled),
  // Promotion ladder fields — only when the corresponding level is enabled.
  chadL64Month: (s) => Boolean(s.chadJob) && Boolean(s.chadL64Enabled),
  chadL64Salary: (s) => Boolean(s.chadJob) && Boolean(s.chadL64Enabled),
  chadL64StockRefresh: (s) => Boolean(s.chadJob) && Boolean(s.chadL64Enabled),
  chadL64BonusPct: (s) => Boolean(s.chadJob) && Boolean(s.chadL64Enabled),
  chadL65Month: (s) => Boolean(s.chadJob) && Boolean(s.chadL65Enabled),
  chadL65Salary: (s) => Boolean(s.chadJob) && Boolean(s.chadL65Enabled),
  chadL65StockRefresh: (s) => Boolean(s.chadJob) && Boolean(s.chadL65Enabled),
  chadL65BonusPct: (s) => Boolean(s.chadJob) && Boolean(s.chadL65Enabled),
};

/**
 * Format a human-readable label for a continuous-lever optimization move.
 * Keeps UI-ready text here so the cascade's result shape stays uniform
 * with the discrete-lever candidates from buildLeverCandidates.
 */
function labelForContinuousMove(leverKey, currentValue, newValue) {
  const rounded = Math.round(newValue * 100) / 100;
  const dollarsK = (v) => '$' + Math.round(v / 1000) + 'K';
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
    // MSFT job + 401(k) + promotion ladder + retirement timing
    case 'chadJobSalary':
      return `Negotiate base salary to ${dollarsK(rounded)}`;
    case 'chadJobBonusPct':
      return `Negotiate bonus target to ${Math.round(rounded)}%`;
    case 'chadJobStockRefresh':
      return `Negotiate annual refresh to ${dollarsK(rounded)}`;
    case 'chadJobRaisePct':
      return `Raise % target to ${rounded.toFixed(2)}%/yr`;
    case 'chadJobHireStockTotal':
      return `On-hire stock grant to ${dollarsK(rounded)}`;
    case 'chadJobSignOnCash':
      return `Sign-on cash to ${dollarsK(rounded)}`;
    case 'chadJobRefreshStartMonth':
      return `First refresh ${Math.round(rounded)} mo after hire (snaps to next August)`;
    case 'chadJob401kDeferral':
      return `401(k) pre-tax deferral to ${dollarsK(rounded)}/yr`;
    case 'chadJob401kCatchupRoth':
      return `401(k) Roth catch-up to ${dollarsK(rounded)}/yr`;
    case 'chadJob401kMatch':
      return `Negotiate employer 401(k) match to ${dollarsK(rounded)}/yr`;
    case 'chadL64Month':
      return `Promote to L64 at month ${Math.round(rounded)}`;
    case 'chadL64Salary':
      return `Negotiate L64 salary to ${dollarsK(rounded)}`;
    case 'chadL64StockRefresh':
      return `Negotiate L64 refresh to ${dollarsK(rounded)}`;
    case 'chadL64BonusPct':
      return `Negotiate L64 bonus to ${Math.round(rounded)}%`;
    case 'chadL65Month':
      return `Promote to L65 at month ${Math.round(rounded)}`;
    case 'chadL65Salary':
      return `Negotiate L65 salary to ${dollarsK(rounded)}`;
    case 'chadL65StockRefresh':
      return `Negotiate L65 refresh to ${dollarsK(rounded)}`;
    case 'chadL65BonusPct':
      return `Negotiate L65 bonus to ${Math.round(rounded)}%`;
    case 'chadWorkMonths':
      return `Chad works ${Math.round(rounded)} months total`;
    case 'sarahWorkMonths':
      return `Sarah works ${Math.round(rounded)} months total`;
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
  // Score by total ending RESOURCES (savings + 401k + home equity), not
  // savings-only, so moves that shift value into the 401k/home buckets are not
  // filtered out as "negative" by the savings-only delta guard. See finding 1.3.
  const baselineFinalBalance = getEndingResourceValue(baselineMonthly);
  const baselineQuarterly = baselineProj.data;

  const results = [];
  let workingState = baseState;
  let workingFinalBalance = baselineFinalBalance;
  let workingQuarterly = baselineQuarterly;
  let workingMonthly = baselineMonthly;
  // Track goal-eval at the WORKING state (not baseline) so each rung's goal
  // delta is marginal — the cascade picks moves that incrementally close gaps.
  const baseGoals = Array.isArray(baseState.goals) ? baseState.goals : [];
  let workingGoalsEval = baseGoals.length > 0
    ? evaluateAllGoals(baseGoals, workingMonthly, { wealthData: workingMonthly, retireDebt: !!workingState.retireDebt })
    : [];

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
      const composedFinalBalance = getEndingResourceValue(composedMonthly);
      const composedQuarterly = composedProj.data;

      // Marginal impact vs current working state — drives selection
      const marginalFinalDelta = composedFinalBalance - workingFinalBalance;
      const marginalBreakevenDelta = computeBreakevenMonthDelta(workingQuarterly, composedQuarterly);

      // Marginal goal-progress (vs current working state). Only computed when
      // the user has goals defined.
      let marginalGoalDelta = 0;
      if (workingGoalsEval.length > 0) {
        const composedGoalsEval = evaluateAllGoals(
          composedState.goals || [],
          composedMonthly,
          { wealthData: composedMonthly, retireDebt: !!composedState.retireDebt },
        );
        for (let i = 0; i < composedGoalsEval.length; i++) {
          const before = workingGoalsEval[i]?.progress ?? 0;
          const after = composedGoalsEval[i]?.progress ?? 0;
          marginalGoalDelta += (after - before);
        }
      }

      // Filter: must improve on at least one axis (incl. goal progress)
      if (marginalFinalDelta <= 0 && marginalBreakevenDelta >= 0 && marginalGoalDelta <= 0) continue;

      const score = marginalFinalDelta
        + (-marginalBreakevenDelta) * BREAKEVEN_MULTIPLIER
        + marginalGoalDelta * GOAL_PROGRESS_MULTIPLIER;

      if (!best || score > best.score) {
        best = {
          cand,
          composedState,
          composedFinalBalance,
          composedQuarterly,
          composedMonthly,
          score,
        };
      }
    }

    if (!best) break;

    // Standalone reference: apply ONLY this move to the ORIGINAL baseline
    const standaloneState = gatherState({ ...baseState, ...best.cand.mutation });
    const standaloneProj = computeProjection(standaloneState);
    const standaloneFinalBalance = getEndingResourceValue(standaloneProj.monthlyData);
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
    workingMonthly = best.composedMonthly;
    if (baseGoals.length > 0) {
      workingGoalsEval = evaluateAllGoals(
        workingState.goals || [],
        workingMonthly,
        { wealthData: workingMonthly, retireDebt: !!workingState.retireDebt },
      );
    }
  }

  return results;
}
