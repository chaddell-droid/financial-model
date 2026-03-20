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
 * Compute the safe withdrawal rate for one historical cohort.
 * @param {Float64Array} blended - full array of blended monthly real returns
 * @param {number} start - start index into blended for this cohort
 * @param {number} T - horizon in months
 * @param {Float64Array} flows - supplemental flows (inheritance)
 * @param {Float64Array} scaling - withdrawal scaling factors
 * @param {number} targetFV - target final pool value (floor)
 * @param {number} initialPool - starting pool
 * @returns {number} monthly withdrawal amount in dollars (the SWR)
 */
export function computeSWR(blended, start, T, flows, scaling, targetFV, initialPool) {
  // Build opportunity cost factors backwards
  // G[t] = prod(1+r[i], i=t+1..T-1), with G[T-1] = 1
  const G = new Float64Array(T);
  G[T - 1] = 1;
  for (let t = T - 2; t >= 0; t--) {
    G[t] = G[t + 1] * (1 + blended[start + t + 1]);
  }

  // C = total cumulative growth = (1+r[0]) * G[0]
  const C = (1 + blended[start]) * G[0];

  let flowG = 0, scalingG = 0;
  for (let t = 0; t < T; t++) {
    flowG += flows[t] * G[t];
    scalingG += scaling[t] * G[t];
  }

  if (scalingG <= 0) return 0;
  return (initialPool * C - targetFV + flowG) / scalingG;
}

/**
 * Compute the maximum pre-inheritance withdrawal rate.
 * Post-inheritance withdrawal is fixed at postRate (monthly $).
 *
 * w_pre = [P*C - FV + sum(f_t*G_t) - postRate * sum_{t>=inh}(s_t*G_t)]
 *         / sum_{t<inh}(s_t*G_t)
 */
export function computePreInhSWR(blended, start, T, flows, scaling, targetFV, initialPool, postRate, inhMonth) {
  const G = new Float64Array(T);
  G[T - 1] = 1;
  for (let t = T - 2; t >= 0; t--) {
    G[t] = G[t + 1] * (1 + blended[start + t + 1]);
  }
  const C = (1 + blended[start]) * G[0];

  let flowG = 0, preDenom = 0, postDenom = 0;
  for (let t = 0; t < T; t++) {
    flowG += flows[t] * G[t];
    if (t < inhMonth) preDenom += scaling[t] * G[t];
    else postDenom += scaling[t] * G[t];
  }

  if (preDenom <= 0) return 0;
  return (initialPool * C - targetFV + flowG - postRate * postDenom) / preDenom;
}

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
