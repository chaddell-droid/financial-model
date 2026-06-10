/**
 * Shared interpolated percentile utility.
 *
 * Phase-0 remediation (2026-06-10, item 0.4 / improvement b-5). This module is
 * the single tested quantile definition — linear interpolation between closest
 * ranks at position (N−1)·p/100, the same method as
 * pwaDistribution.getDistributionPercentile (and numpy's default).
 *
 * Adopted app-wide in Phase 4 (C15, item 4.3): monteCarlo.js (bands + headline
 * finals), useRetirementSimulation.js (cohort bands), and retirementParams.js
 * (optimal-rate extraction) all quantile through this function now.
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
