/**
 * Marginal Impact Curves — Story 3.1 (Phase 3, Epic 3).
 *
 * For a given state + bounded-continuous lever, sample the end-of-horizon
 * outcome across the lever's [min, max] range so a UI layer can render a
 * sensitivity sparkline (Story 3.2) and an expanded curve view with
 * inflection marks + tooltips (Story 3.3).
 *
 * Purity (NFR18): no React, no DOM, runnable under plain `node`.
 * Determinism (NFR16): identical inputs → identical outputs.
 * Performance (NFR5): ≤100ms per lever at default 15 samples on Chad's
 *   hardware. Caller is responsible for debouncing where appropriate — this
 *   module is pure and will recompute on every call.
 *
 * Used by:
 *   • SensitivityCurveSparkline.jsx (Story 3.2) — inline sparkline next to
 *     every continuous-lever slider in the Staged list.
 *   • ExpandedCurveView.jsx (Story 3.3) — larger view with tooltips and
 *     inflection-point marks.
 */

import { computeProjection } from './projection.js';
import { gatherState } from '../state/gatherState.js';

/** Default number of samples across the lever's valid range. Tuned for
 *  visual fidelity (≥10 renders a readable curve) vs compute budget
 *  (≤20 keeps us under the 100ms NFR5 ceiling). */
const DEFAULT_STEPS = 15;

/** Clamp bounds for caller-supplied `options.steps`. Fewer than 10 produces
 *  misleading curves; more than 20 blows the perf budget without improving
 *  the visual. */
const MIN_STEPS = 10;
const MAX_STEPS = 20;

/**
 * Sample the marginal impact of a bounded-continuous lever across its valid
 * range. Every sample is a fresh projection conditioned on the input state
 * with `leverKey` overridden; the baseline projection is computed once as
 * the reference for `finalBalanceDelta` (zero at the state's current lever
 * value by construction only if that value is among the samples, which it
 * usually isn't — so the zero-crossing is informational, not structural).
 *
 * @param {object} state — projection-ready state (typically gatherState output)
 * @param {string} leverKey — the MODEL_KEY to sweep (e.g., 'sarahRate')
 * @param {object} [options]
 * @param {{min: number, max: number}} [options.constraints] — bounds to
 *   sweep across. Falls back to `state.effectiveLeverConstraints[leverKey]`
 *   when omitted. Throws if neither is available.
 * @param {number} [options.steps=15] — sample count, clamped to [10, 20].
 * @returns {Array<{value: number, finalBalanceDelta: number, monthlyImpact: number}>}
 *   Samples in ascending order by `value`. `finalBalanceDelta` is dollars
 *   vs the input state's projection. `monthlyImpact` is
 *   `finalBalanceDelta / horizonMonths` — the average monthly benefit if
 *   the lever were fixed at this value across the plan horizon.
 * @throws if constraints are missing, malformed, or min > max.
 */
export function computeMarginalImpactCurve(state, leverKey, options = {}) {
  if (!state || typeof state !== 'object') {
    throw new Error(`computeMarginalImpactCurve: invalid state (expected object)`);
  }
  if (typeof leverKey !== 'string' || leverKey.length === 0) {
    throw new Error(`computeMarginalImpactCurve: invalid leverKey`);
  }

  const constraints = options.constraints
    || (state.effectiveLeverConstraints && state.effectiveLeverConstraints[leverKey])
    || null;
  if (!constraints || typeof constraints !== 'object') {
    throw new Error(
      `computeMarginalImpactCurve: no constraints defined for '${leverKey}' (pass options.constraints or populate state.effectiveLeverConstraints)`,
    );
  }
  const { min, max } = constraints;
  if (typeof min !== 'number' || !Number.isFinite(min)) {
    throw new Error(`computeMarginalImpactCurve: '${leverKey}' has invalid min (${min})`);
  }
  if (typeof max !== 'number' || !Number.isFinite(max)) {
    throw new Error(`computeMarginalImpactCurve: '${leverKey}' has invalid max (${max})`);
  }
  if (min > max) {
    throw new Error(`computeMarginalImpactCurve: '${leverKey}' min (${min}) > max (${max})`);
  }

  const steps = clampSteps(options.steps);

  const baseProj = computeProjection(state);
  const baseMonthly = baseProj.monthlyData;
  if (!baseMonthly || baseMonthly.length === 0) return [];
  const horizonMonths = baseMonthly.length;
  const baseFinal = baseMonthly[horizonMonths - 1].balance;

  // Degenerate range: constraints collapsed to a single point. One sample is
  // enough — more would duplicate the same computation.
  if (min === max) {
    const finalDelta = evalFinalDelta(state, leverKey, min) - baseFinal;
    return [{
      value: min,
      finalBalanceDelta: finalDelta,
      monthlyImpact: finalDelta / horizonMonths,
    }];
  }

  const samples = [];
  for (let i = 0; i < steps; i++) {
    // Linear spacing — endpoints inclusive. Avoids (max - min) / (steps - 1)
    // landing on floating-point noise by computing via fraction.
    const t = i / (steps - 1);
    const value = min + t * (max - min);
    const finalAt = evalFinalDelta(state, leverKey, value);
    const finalBalanceDelta = finalAt - baseFinal;
    samples.push({
      value,
      finalBalanceDelta,
      monthlyImpact: finalBalanceDelta / horizonMonths,
    });
  }
  return samples;
}

function evalFinalDelta(state, leverKey, value) {
  const testState = gatherState({ ...state, [leverKey]: value });
  const proj = computeProjection(testState);
  return proj.monthlyData[proj.monthlyData.length - 1].balance;
}

function clampSteps(raw) {
  const n = typeof raw === 'number' && Number.isFinite(raw) ? Math.round(raw) : DEFAULT_STEPS;
  return Math.max(MIN_STEPS, Math.min(MAX_STEPS, n));
}

/**
 * Detect inflection points (diminishing-returns boundaries) on a marginal
 * impact curve. An inflection is a point where the curve's second derivative
 * changes sign — i.e., where the slope transitions from accelerating to
 * decelerating (or vice versa). In financial-planning terms: "after this
 * value, you get less bang per marginal unit."
 *
 * Uses discrete second differences over `finalBalanceDelta`. Requires at
 * least 3 samples; returns an empty array when there aren't enough points
 * or when the curve is monotonically linear (no sign changes in d²).
 *
 * A small noise-threshold guards against floating-point chatter from the
 * projection: a second difference smaller in absolute value than
 * `NOISE_THRESHOLD_FRACTION` of the curve's overall |Δy| is treated as
 * zero and does not count as a sign change.
 *
 * @param {Array<{value: number, finalBalanceDelta: number}>} curve
 *   — output of computeMarginalImpactCurve.
 * @returns {Array<number>} — lever values at detected inflection points, in
 *   ascending order. Empty when no inflection is detected.
 */
export function detectInflectionPoints(curve) {
  if (!Array.isArray(curve) || curve.length < 3) return [];

  // Curve span — used to normalize the noise threshold. If every sample has
  // the same y-value (flat curve), no inflection is meaningful.
  let yMin = curve[0].finalBalanceDelta;
  let yMax = curve[0].finalBalanceDelta;
  for (const s of curve) {
    if (s.finalBalanceDelta < yMin) yMin = s.finalBalanceDelta;
    if (s.finalBalanceDelta > yMax) yMax = s.finalBalanceDelta;
  }
  const ySpan = yMax - yMin;
  if (ySpan <= 0) return [];

  const noiseFloor = ySpan * NOISE_THRESHOLD_FRACTION;

  // Second differences over ascending values. Keep the sign from the
  // previous *significant* (above-noise) second difference so a long flat
  // stretch doesn't trigger a phantom sign change on re-entry.
  const inflections = [];
  let prevSig = 0; // +1, -1, or 0 if no significant second difference seen yet

  for (let i = 1; i < curve.length - 1; i++) {
    const a = curve[i - 1].finalBalanceDelta;
    const b = curve[i].finalBalanceDelta;
    const c = curve[i + 1].finalBalanceDelta;
    const d2 = c - 2 * b + a;
    if (Math.abs(d2) < noiseFloor) continue;
    const sig = d2 > 0 ? 1 : -1;
    if (prevSig !== 0 && sig !== prevSig) {
      inflections.push(curve[i].value);
    }
    prevSig = sig;
  }
  return inflections;
}

/** A second-difference whose magnitude is below this fraction of the curve's
 *  overall y-span is treated as zero. 0.5% empirically filters projection
 *  noise without obscuring real diminishing-returns kinks. */
const NOISE_THRESHOLD_FRACTION = 0.005;
