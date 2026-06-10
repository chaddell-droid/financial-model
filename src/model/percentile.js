/**
 * Shared interpolated percentile utility.
 *
 * Phase-0 remediation (2026-06-10, item 0.4 / improvement b-5; prerequisite for
 * Phase 4's C15). The app currently computes quantiles three different ways:
 * nearest-rank floor(N·p/100) in monteCarlo.js and retirementParams.js,
 * floor((N−1)·p/100)-ish in useRetirementSimulation.js, and linear interpolation
 * in pwaDistribution.js. This module is the single tested definition — linear
 * interpolation between closest ranks at position (N−1)·p/100, the same method
 * as pwaDistribution.getDistributionPercentile (and numpy's default).
 *
 * NOT yet adopted at the monteCarlo / useRetirementSimulation / retirementParams
 * call sites — Phase 4 (C15) swaps them over so the band changes land together.
 *
 * @param {number[]|Float64Array} values - sample values (plain or typed array)
 * @param {number} percentile - 0..100 (clamped; non-finite → 50)
 * @param {{sorted?: boolean}} [opts] - pass sorted:true if values are already
 *   ascending to skip the copy+sort (the input is never mutated).
 * @returns {number} interpolated percentile value; 0 for an empty input.
 */
export function interpolatedPercentile(values, percentile, { sorted = false } = {}) {
  if (!values || values.length === 0) return 0;

  let p = Number(percentile);
  if (!Number.isFinite(p)) p = 50;
  p = Math.max(0, Math.min(100, p)) / 100;

  let v = values;
  if (!sorted) {
    // Copy before sorting — never mutate the caller's array.
    v = Float64Array.from(values);
    v.sort();
  }

  const position = (v.length - 1) * p;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  if (lowerIndex === upperIndex) return v[lowerIndex];

  const weight = position - lowerIndex;
  return v[lowerIndex] + (v[upperIndex] - v[lowerIndex]) * weight;
}
