import { MONTHLY_REAL_RETURNS } from './shillerReturns.js';

/**
 * Blend stock and bond monthly real returns at the given equity weight.
 * @param {number} equityWeight - 0 to 1 (e.g., 0.6 = 60% stocks / 40% bonds)
 * @returns {Float64Array} array of monthly real returns
 */
export function getBlendedReturns(equityWeight) {
  const data = MONTHLY_REAL_RETURNS;
  const N = data.length;
  const result = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    result[i] = equityWeight * data[i][2] + (1 - equityWeight) * data[i][3];
  }
  return result;
}

/**
 * Number of valid starting cohorts for the given horizon.
 */
export function getNumCohorts(horizonMonths) {
  return Math.max(0, MONTHLY_REAL_RETURNS.length - horizonMonths + 1);
}

/**
 * Get the year/month label for a cohort starting at the given index.
 */
export function getCohortLabel(startIdx) {
  const [year, month] = MONTHLY_REAL_RETURNS[startIdx];
  return { year, month };
}
