import { runMonthlySimulation } from './projection.js';
import { evaluateGoalPass } from './goalEvaluation.js';
import { interpolatedPercentile } from './percentile.js';

function createMulberry32(seed) {
  let s = seed | 0;
  return () => {
    s |= 0;
    s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function createRandomSource(seed) {
  return Number.isFinite(seed) ? createMulberry32(Math.trunc(seed)) : Math.random;
}

// ── Correlated market factor (A6 + B11 — remediation 2026-06-10 item 4.1,
// decision D7). One common normal deviate Z per sim drives every
// market-exposed assumption:
//   savings return  — loading 1.0 (sigma = mcInvestVol)
//   401(k) return   — loading 1.0 (same equity exposure, same sigma)
//   MSFT growth     — rho 0.7 (single stock: mostly market, some idiosyncratic)
//   home appreciation — rho 0.3 with its OWN smaller sigma (residential
//     real-estate vol is a fraction of equity vol; sigma = mcInvestVol/3,
//     ≈4%/yr at the 12% default)
// Previously the 401(k) and home compounded deterministically in every sim
// (bands401k p10=p50=p90) and MSFT was drawn independent of market returns.
export const MSFT_MARKET_RHO = 0.7;
export const HOME_MARKET_RHO = 0.3;
export const HOME_SIGMA_FRACTION = 1 / 3;

/**
 * Compute percentile bands at each month index for an array of per-sim series.
 *
 * Each month's cross-sim values are sorted ONCE and reused across every
 * requested percentile (remediation 2026-06-09, 6.7) — the previous
 * per-percentile loop re-sorted the same values five times per month.
 * Exported for unit tests (parity vs the reference implementation).
 *
 * C15 (remediation 2026-06-10, item 4.3): quantiles use the shared
 * INTERPOLATED percentile (percentile.js) — linear interpolation at position
 * (N−1)·p/100, the same definition the PWA distribution uses — instead of the
 * old nearest-rank floor(N·p/100), which was mildly optimistic on the
 * downside bands and gave the app two quantile definitions.
 *
 * @param {number[][]} series - one series per sim, each of length months+1
 * @param {number[]} percentiles - which percentiles to compute (e.g. [10, 25, 50, 75, 90])
 * @param {number} months - total months in horizon (length-1 of each series)
 * @returns {{pct:number, series:number[]}[]}
 */
export function computeBands(series, percentiles, months) {
  const bands = percentiles.map(p => ({ pct: p, series: [] }));
  for (let m = 0; m <= months; m++) {
    const vals = Float64Array.from(series, b => b[m]).sort();
    for (let i = 0; i < percentiles.length; i++) {
      bands[i].series.push(interpolatedPercentile(vals, percentiles[i], { sorted: true }));
    }
  }
  return bands;
}

/** Interpolated nth-percentile of an unsorted array (C15 — shared definition). */
function percentileAt(arr, p) {
  return interpolatedPercentile(arr, p);
}

/**
 * Full Monte Carlo simulation with randomized parameters.
 *
 * Tracks four reserves per-sim: savings, 401(k), home equity, and net worth
 * (sum of the three). Returns parallel percentile bands for each, plus
 * solvency stats and goal-success rates.
 *
 * Solvency definitions:
 *   - solvencyRate: % of sims where savings (post-drawdown) stayed ≥ 0 every
 *     month. Because the deterministic projection auto-pulls from 401(k) →
 *     home equity when savings goes negative, a sim can pass this test while
 *     having drained reserves. Useful as "didn't go bankrupt."
 *   - savingsOnlySolvencyRate (NEW): % of sims that stayed ≥ 0 WITHOUT EVER
 *     touching 401(k) or home equity (i.e., the drawdown waterfall never
 *     fired). The stricter test: "never had to dip into long-term reserves."
 *
 * Withdrawal stats:
 *   - perSimWithdrawals tracked but only summary percentiles returned.
 */
export function runMonteCarlo(base, mcParams, goals = [], options = {}) {
  const { mcNumSims: N, mcInvestVol, mcBizGrowthVol, mcMsftVol, mcSsdiDelay, mcSsdiDenialPct, mcCutsDiscipline } = mcParams;
  const months = base.totalProjectionMonths || 72;
  const clampGrowth = (value) => Math.max(-99.9, value);
  const rng = createRandomSource(options.seed);
  const drawDelayMonths = (maxDelay) => Math.floor(rng() * (Math.max(0, maxDelay) + 1));

  // Box-Muller normal random
  const randNorm = (mean, std) => {
    const u1 = Math.max(rng(), 1e-9);
    const u2 = rng();
    return mean + std * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  };

  // Per-sim tracked series (one entry per month per sim).
  const allBalances = [];      // savings (post-drawdown)
  const all401k = [];          // 401(k) (after MC growth, contributions, and drawdown reductions)
  const allHomeEquity = [];    // home equity (after appreciation and equity-sale draw reductions)
  const allNetWorth = [];      // savings + 401(k) + home equity per month

  // Per-sim cumulative withdrawal totals (scalar per sim).
  const totalWithdrawal401k = [];
  const totalWithdrawalHome = [];

  // Per-sim flag: did the savings ever go negative (i.e., did drawdown fire)?
  const drawdownFired = [];

  const goalSuccessCounts = goals.map(() => 0);

  for (let sim = 0; sim < N; sim++) {
    const useSS = base.ssType === 'ss';
    // Common market factor Z + idiosyncratic deviates (A6 + B11, D7).
    // Correlated draws use z = rho*Z + sqrt(1-rho^2)*eps so each stays N(0,1).
    const Z = randNorm(0, 1);
    const zMsft = MSFT_MARKET_RHO * Z
      + Math.sqrt(1 - MSFT_MARKET_RHO * MSFT_MARKET_RHO) * randNorm(0, 1);
    const zHome = HOME_MARKET_RHO * Z
      + Math.sqrt(1 - HOME_MARKET_RHO * HOME_MARKET_RHO) * randNorm(0, 1);
    const homeVol = mcInvestVol * HOME_SIGMA_FRACTION;
    const simParams = {
      ...base,
      investmentReturn: clampGrowth(base.investmentReturn + mcInvestVol * Z),
      return401k: clampGrowth((base.return401k ?? 8) + mcInvestVol * Z),
      homeAppreciation: clampGrowth((base.homeAppreciation ?? 4) + homeVol * zHome),
      sarahClientGrowth: clampGrowth(randNorm(base.sarahClientGrowth, mcBizGrowthVol)),
      sarahRateGrowth: clampGrowth(randNorm(base.sarahRateGrowth, mcBizGrowthVol * 0.5)),
      msftGrowth: clampGrowth(base.msftGrowth + mcMsftVol * zMsft),
      // SS retirement is guaranteed at age 62 — no delay or denial risk
      ssdiApprovalMonth: useSS ? base.ssdiApprovalMonth : base.ssdiApprovalMonth + drawDelayMonths(mcSsdiDelay),
      cutsDiscipline: Math.min(1, Math.max(0, randNorm(1, mcCutsDiscipline / 100))),
    };

    // Randomly deny SSDI based on denial probability (not applicable to SS retirement)
    if (!useSS && mcSsdiDenialPct > 0 && rng() * 100 < mcSsdiDenialPct) {
      simParams.ssdiDenied = true;
    }

    const { monthlyData } = runMonthlySimulation(simParams);

    // Collect per-month series.
    const balSeries = monthlyData.map(d => d.balance);
    const k401Series = monthlyData.map(d => d.balance401k || 0);
    const homeSeries = monthlyData.map(d => d.homeEquity || 0);
    const netWorthSeries = monthlyData.map(d => (d.balance || 0) + (d.balance401k || 0) + (d.homeEquity || 0));

    allBalances.push(balSeries);
    all401k.push(k401Series);
    allHomeEquity.push(homeSeries);
    allNetWorth.push(netWorthSeries);

    // Cumulative withdrawals over the horizon.
    let sum401k = 0;
    for (const d of monthlyData) sum401k += (d.withdrawal401k || 0);
    totalWithdrawal401k.push(sum401k);
    // Home equity drawdowns (equity-sale draws, D7): derived from home-equity
    // series differences when they exceed the appreciation step. The projection
    // updates homeEquity in place (grow then decrement by the draw), so we
    // approximate the cumulative equity sold as max(0, expected-after-growth -
    // actual). Cheap, monotone, sufficient for a percentile summary.
    const monthlyHomeRate = Math.pow(1 + (simParams.homeAppreciation ?? 4) / 100, 1 / 12) - 1;
    let sumHome = 0;
    let prevHome = simParams.homeEquity || 0;
    for (let i = 0; i < homeSeries.length; i++) {
      const expectedAfterGrowth = i === 0 ? prevHome : Math.round(prevHome * (1 + monthlyHomeRate));
      const drop = Math.max(0, expectedAfterGrowth - homeSeries[i]);
      sumHome += drop;
      prevHome = homeSeries[i];
    }
    totalWithdrawalHome.push(sumHome);
    drawdownFired.push(sum401k > 0 || sumHome > 0);

    // Evaluate goals for this simulation
    if (goals.length > 0) {
      const wealthData = goals.some(g => g.type === 'net_worth_target') ? monthlyData.map(d => ({
        month: d.month,
        balance401k: d.balance401k,
        homeEquity: d.homeEquity,
      })) : null;
      const goalOpts = { wealthData, retireDebt: simParams.retireDebt };
      goals.forEach((goal, i) => {
        if (evaluateGoalPass(goal, monthlyData, goalOpts)) {
          goalSuccessCounts[i]++;
        }
      });
    }
  }

  // Compute percentile bands for each tracked reserve.
  const percentiles = [10, 25, 50, 75, 90];
  const bands = computeBands(allBalances, percentiles, months);
  const bands401k = computeBands(all401k, percentiles, months);
  const bandsHomeEquity = computeBands(allHomeEquity, percentiles, months);
  const bandsNetWorth = computeBands(allNetWorth, percentiles, months);

  // Solvency = % of sims where savings stayed ≥ 0 every month (post-drawdown).
  const solvent = allBalances.filter(b => b.every(v => v >= 0)).length;
  const solvencyRate = solvent / N;

  // Stricter solvency: never touched reserves at all.
  const noDrawdown = drawdownFired.filter(d => !d).length;
  const savingsOnlySolvencyRate = noDrawdown / N;

  // Trough: median of each sim's minimum savings balance (C15: interpolated).
  const troughs = allBalances.map(b => Math.min(...b));
  const medianTrough = percentileAt(troughs, 50);

  // Final balances (savings) — C15: same interpolated quantile definition as
  // the bands, so the headline cards and the fan-chart endpoints agree.
  const finals = allBalances.map(b => b[b.length - 1]);
  const medianFinal = percentileAt(finals, 50);
  const p10Final = percentileAt(finals, 10);
  const p90Final = percentileAt(finals, 90);

  // Final net worth percentiles.
  const finalsNetWorth = allNetWorth.map(b => b[b.length - 1]);
  const medianFinalNetWorth = percentileAt(finalsNetWorth, 50);
  const p10FinalNetWorth = percentileAt(finalsNetWorth, 10);
  const p90FinalNetWorth = percentileAt(finalsNetWorth, 90);

  // 401(k) and home equity finals.
  const finals401k = all401k.map(b => b[b.length - 1]);
  const finalsHome = allHomeEquity.map(b => b[b.length - 1]);

  const goalSuccessRates = goals.map((g, i) => ({
    goalId: g.id,
    successRate: goalSuccessCounts[i] / N,
  }));

  return {
    // Existing (preserved for back-compat)
    bands, solvencyRate, medianTrough, medianFinal,
    p10Final, p90Final, numSims: N,
    params: { investVol: mcInvestVol, bizGrowthVol: mcBizGrowthVol, msftVol: mcMsftVol, ssdiDelay: mcSsdiDelay, cutsDiscipline: mcCutsDiscipline },
    goalSuccessRates,

    // NEW — total wealth tracking
    bands401k,
    bandsHomeEquity,
    bandsNetWorth,
    medianFinalNetWorth,
    p10FinalNetWorth,
    p90FinalNetWorth,
    medianFinal401k: percentileAt(finals401k, 50),
    p10Final401k: percentileAt(finals401k, 10),
    p90Final401k: percentileAt(finals401k, 90),
    medianFinalHomeEquity: percentileAt(finalsHome, 50),
    p10FinalHomeEquity: percentileAt(finalsHome, 10),
    p90FinalHomeEquity: percentileAt(finalsHome, 90),

    // NEW — stricter solvency definition
    savingsOnlySolvencyRate,
    drawdownFiredCount: drawdownFired.filter(d => d).length,

    // NEW — withdrawal exposure (the cost of the drawdown waterfall)
    medianWithdrawal401k: percentileAt(totalWithdrawal401k, 50),
    p90Withdrawal401k: percentileAt(totalWithdrawal401k, 90),
    medianWithdrawalHome: percentileAt(totalWithdrawalHome, 50),
    p90WithdrawalHome: percentileAt(totalWithdrawalHome, 90),
  };
}

