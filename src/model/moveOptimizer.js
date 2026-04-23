/**
 * Golden-Section Search Optimizer for bounded-continuous levers.
 *
 * Finds the specific numeric value for a continuous lever that maximizes the
 * plan's end-of-horizon final balance, searching only within user-defined
 * realistic bounds (from the Constraint Workshop).
 *
 * Why golden section: the impact-vs-value curve for a continuous lever on a
 * horizon-level financial projection is typically unimodal within its valid
 * range (monotone or single-maximum). Golden-section search is the
 * classical method for unimodal extrema on a bounded interval — reliable,
 * deterministic, no derivatives needed, and converges at a fixed log rate
 * (0.618^N per iteration).
 *
 * Performance (NFR4): ≤20 iterations, precision ≤1% of lever's range.
 * Purity (NFR18): no React, no DOM, runnable under plain `node`.
 * Determinism (NFR16): identical inputs produce identical outputs.
 *
 * Used by:
 *   • moveCascade.js (Story 2.3) — optimize continuous-lever candidates during
 *     each greedy step, conditioned on prior locked-in moves.
 *   • Phase 2 slider UI (Story 2.4) — show optimizer's chosen value as the
 *     default slider position; user can drag to override.
 *
 * Hard-asserts: the returned value is always within the user-defined bounds
 * (FR8). Adversarial inputs (no constraints, non-numeric bounds, min > max)
 * throw early with an actionable message.
 */

import { computeProjection } from './projection.js';
import { gatherState } from '../state/gatherState.js';

/** Golden ratio conjugate — (√5 − 1) / 2 ≈ 0.618033988… */
const GOLDEN = (Math.sqrt(5) - 1) / 2;

/** Convergence budget per NFR4. */
const MAX_ITERATIONS = 20;

/** Precision target: ≤1% of the lever's valid range. */
const PRECISION_FRACTION = 0.01;

/**
 * Optimize a single bounded-continuous lever.
 *
 * @param {object} state — projection-ready state (output of gatherState)
 * @param {string} leverKey — the MODEL_KEY to optimize (e.g., 'sarahRate')
 * @param {{min: number, max: number}} constraints — user-defined bounds
 *   (typically from effectiveLeverConstraints[leverKey])
 * @returns {{value: number, impact: number}} — the optimal value within
 *   bounds, and the final-balance impact at that value (vs input state).
 *   `impact` can be zero or negative if no improvement is possible within
 *   the constraints; callers filter those out at the cascade level.
 * @throws if constraints are missing, malformed, or min > max — optimizer
 *   NEVER guesses bounds. This is FR43.
 */
export function optimizeContinuousLever(state, leverKey, constraints) {
  if (!state || typeof state !== 'object') {
    throw new Error(`optimizeContinuousLever: invalid state (expected object)`);
  }
  if (typeof leverKey !== 'string' || leverKey.length === 0) {
    throw new Error(`optimizeContinuousLever: invalid leverKey`);
  }
  if (!constraints || typeof constraints !== 'object') {
    throw new Error(`optimizeContinuousLever: no constraints defined for '${leverKey}' (FR43)`);
  }
  const { min, max } = constraints;
  if (typeof min !== 'number' || !Number.isFinite(min)) {
    throw new Error(`optimizeContinuousLever: '${leverKey}' has invalid min (${min})`);
  }
  if (typeof max !== 'number' || !Number.isFinite(max)) {
    throw new Error(`optimizeContinuousLever: '${leverKey}' has invalid max (${max})`);
  }
  if (min > max) {
    throw new Error(`optimizeContinuousLever: '${leverKey}' min (${min}) > max (${max})`);
  }

  // Precompute the baseline final balance once — every eval during the search
  // compares against this fixed reference.
  const baseProj = computeProjection(state);
  const baseFinal = baseProj.monthlyData[baseProj.monthlyData.length - 1].balance;

  const evalImpactAt = (v) => {
    const testState = gatherState({ ...state, [leverKey]: v });
    const testProj = computeProjection(testState);
    const testFinal = testProj.monthlyData[testProj.monthlyData.length - 1].balance;
    return testFinal - baseFinal;
  };

  // Degenerate case: constraint window is a single point. Evaluate once, done.
  if (min === max) {
    const value = min;
    const impact = evalImpactAt(value);
    assertBounds(value, min, max, leverKey);
    return { value, impact };
  }

  const tolerance = (max - min) * PRECISION_FRACTION;

  // Classical golden-section bracket: two interior probes at the 0.618
  // fractions from each end, then shrink the interval toward the better one.
  let a = min;
  let b = max;
  let c = b - GOLDEN * (b - a);
  let d = a + GOLDEN * (b - a);
  let fc = evalImpactAt(c);
  let fd = evalImpactAt(d);

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    if (b - a <= tolerance) break;
    if (fc > fd) {
      // Maximum is in [a, d] — shrink from the right.
      b = d;
      d = c;
      fd = fc;
      c = b - GOLDEN * (b - a);
      fc = evalImpactAt(c);
    } else {
      // Maximum is in [c, b] — shrink from the left.
      a = c;
      c = d;
      fc = fd;
      d = a + GOLDEN * (b - a);
      fd = evalImpactAt(d);
    }
  }

  // Pick the better of the two interior probes rather than the midpoint —
  // avoids leaving impact on the table when the function is flat near the
  // optimum but skewed across the final bracket.
  const value = fc > fd ? c : d;
  assertBounds(value, min, max, leverKey);
  const impact = fc > fd ? fc : fd;
  return { value, impact };
}

function assertBounds(value, min, max, leverKey) {
  if (!(value >= min && value <= max)) {
    throw new Error(
      `optimizeContinuousLever: '${leverKey}' returned ${value} outside bounds [${min}, ${max}] (FR8)`,
    );
  }
}
