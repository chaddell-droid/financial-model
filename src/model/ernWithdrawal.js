/**
 * ERN (Early Retirement Now) closed-form Safe Withdrawal Rate engine.
 *
 * Pool dynamics per month t:
 *   pool_{t+1} = (pool_t - w * s_t + f_t) * (1 + r_t)
 *
 * Closed-form SWR:
 *   w = [P * C - FV + sum(f_t * G_t)] / sum(s_t * G_t)
 *
 * where:
 *   C  = cumulative growth of initial principal over full horizon
 *   G_t = opportunity cost factor (growth from month t to end)
 *   FV = target final value (pool floor)
 *   s_t = withdrawal scaling factor (1.0 couple, survivorRatio survivor)
 *   f_t = supplemental flow at month t
 *
 * All functions accept the full blended return array + start index
 * to avoid creating sliced copies per cohort.
 */

// Module-level pooled array for opportunity-cost factors.
// Eliminates ~924KB of ephemeral Float64Array allocations per render cycle
// (~260 computeSWR calls × 444 months × 8 bytes). Safe because JS is
// single-threaded and G is fully written before any read.
let _pooledG = null;
let _pooledLen = 0;
function getG(T) {
  if (T > _pooledLen) { _pooledG = new Float64Array(T); _pooledLen = T; }
  return _pooledG;
}

/**
 * Closed-form SWR for one cohort.
 * Returns monthly consumption w in dollars (can be negative for bad cohorts).
 */
export function computeSWR(blended, start, T, supplementalFlows, scaling, targetFV, initialPool) {
  const G = getG(T);
  G[T - 1] = 1 + blended[start + T - 1];
  for (let t = T - 2; t >= 0; t--) {
    G[t] = G[t + 1] * (1 + blended[start + t]);
  }
  const C = G[0];

  let flowG = 0;
  let scalingG = 0;
  for (let t = 0; t < T; t++) {
    flowG += supplementalFlows[t] * G[t];
    scalingG += scaling[t] * G[t];
  }

  return (initialPool * C - targetFV + flowG) / scalingG;
}

/**
 * Pre-inheritance SWR: solve for the withdrawal rate used before the
 * inheritance arrives, given that post-inheritance uses postRate.
 */
export function computePreInhSWR(blended, start, T, supplementalFlows, scaling, targetFV, initialPool, postRate, inhMonth) {
  const G = getG(T);
  G[T - 1] = 1 + blended[start + T - 1];
  for (let t = T - 2; t >= 0; t--) {
    G[t] = G[t + 1] * (1 + blended[start + t]);
  }
  const C = G[0];

  let flowG = 0;
  let preDenom = 0;
  let postDenom = 0;
  for (let t = 0; t < T; t++) {
    flowG += supplementalFlows[t] * G[t];
    if (t < inhMonth) {
      preDenom += scaling[t] * G[t];
    } else {
      postDenom += scaling[t] * G[t];
    }
  }

  return (initialPool * C - targetFV + flowG - postRate * postDenom) / preDenom;
}

/**
 * Simulate pool trajectory at a given withdrawal rate for one cohort.
 * Returns yearly pool snapshots (start-of-year values).
 */
export function simulatePath(blended, start, T, monthlyW, supplementalFlows, scaling, initialPool, floor, rescueFlows) {
  let pool = initialPool;
  const numYears = Math.floor(T / 12);
  const yearlyPools = [];
  let everDepleted = pool <= floor;
  let consecutiveDepleted = 0;
  let maxConsecutiveDepleted = 0;
  const hasWithdrawalSchedule = ArrayBuffer.isView(monthlyW) || Array.isArray(monthlyW);

  for (let y = 0; y <= numYears; y++) {
    yearlyPools.push(Math.round(pool));
    if (y >= numYears) break;

    for (let m = 0; m < 12; m++) {
      const t = y * 12 + m;
      const scheduledWithdrawal = hasWithdrawalSchedule ? monthlyW[t] : monthlyW;
      if (pool > floor) {
        pool = (pool - scheduledWithdrawal * scaling[t] + supplementalFlows[t]) * (1 + blended[start + t]);
        if (pool < floor) pool = floor;
        if (pool <= floor) everDepleted = true;
        if (pool > floor) {
          consecutiveDepleted = 0;
        } else {
          consecutiveDepleted++;
          if (consecutiveDepleted > maxConsecutiveDepleted) maxConsecutiveDepleted = consecutiveDepleted;
        }
      } else {
        everDepleted = true;
        consecutiveDepleted++;
        if (consecutiveDepleted > maxConsecutiveDepleted) maxConsecutiveDepleted = consecutiveDepleted;
        if (rescueFlows && rescueFlows[t] > 0) {
          pool += rescueFlows[t];
        }
      }
    }
  }

  return { yearlyPools, finalPool: Math.round(pool), everDepleted, maxConsecutiveDepleted };
}
