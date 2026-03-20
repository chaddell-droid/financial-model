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
 */
export function simulatePath(blended, start, T, monthlyW, flows, scaling, initialPool, floor) {
  let pool = initialPool;
  const numYears = Math.floor(T / 12);
  const yearlyPools = [];

  for (let y = 0; y <= numYears; y++) {
    yearlyPools.push(Math.round(pool));
    if (y >= numYears) break;

    for (let m = 0; m < 12; m++) {
      const t = y * 12 + m;
      if (pool > floor) {
        pool = pool * (1 + blended[start + t]) - monthlyW * scaling[t] + flows[t];
        if (pool < floor) pool = floor;
      } else if (flows[t] > 0) {
        pool += flows[t]; // inheritance can rescue a depleted pool
      }
    }
  }

  // Check if pool ever hit the floor (depleted at any point)
  const everDepleted = yearlyPools.some(p => p <= floor);

  return { yearlyPools, finalPool: Math.round(pool), everDepleted };
}
