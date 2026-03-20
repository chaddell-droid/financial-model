/**
 * ERN (Early Retirement Now) closed-form Safe Withdrawal Rate engine.
 *
 * Pool dynamics per month t:
 *   pool_{t+1} = pool_t * (1 + r_t) - w * s_t + f_t
 *
 * Closed-form SWR:
 *   w = [P * C - FV + sum(f_t * G_t)] / sum(s_t * G_t)
 *
 * where:
 *   C  = cumulative growth of initial principal over full horizon
 *   G_t = opportunity cost factor (growth from month t+1 to end)
 *   FV = target final value (pool floor)
 *   s_t = withdrawal scaling factor (1.0 couple, survivorRatio survivor)
 *   f_t = supplemental flow at month t (inheritance lump sum)
 *
 * All functions accept the full blended return array + start index
 * to avoid creating sliced copies per cohort.
 */

/**
 * Simulate pool trajectory at a given withdrawal rate for one cohort.
 * Returns yearly pool snapshots (start-of-year values).
 *
 * @param {Float64Array} flows - monthly cash inflows (SS + trust) added when pool is solvent
 * @param {Float64Array} [rescueFlows] - lump sums (inheritance) that apply even when depleted
 *
 * Survivor scaling (0.6x) applies only to pool withdrawal, not SS/trust inflows.
 * This diverges from ERN's blanket 60% survivor rule but is more accurate:
 * each income stream has its own survivor transition (survivorSS replaces coupleSS,
 * trust continues unchanged), so only the discretionary pool draw scales.
 */
export function simulatePath(blended, start, T, monthlyW, flows, scaling, initialPool, floor, rescueFlows) {
  let pool = initialPool;
  const numYears = Math.floor(T / 12);
  const yearlyPools = [];

  for (let y = 0; y <= numYears; y++) {
    yearlyPools.push(Math.round(pool));
    if (y >= numYears) break;

    for (let m = 0; m < 12; m++) {
      const t = y * 12 + m;
      const rescue = rescueFlows ? rescueFlows[t] : 0;
      if (pool > floor) {
        pool = pool * (1 + blended[start + t]) - monthlyW * scaling[t] + flows[t] + rescue;
        if (pool < floor) pool = floor;
      } else if (rescue > 0) {
        pool += rescue;
      }
    }
  }

  // Check if pool ever hit the floor (depleted at any point)
  const everDepleted = yearlyPools.some(p => p <= floor);

  return { yearlyPools, finalPool: Math.round(pool), everDepleted };
}
