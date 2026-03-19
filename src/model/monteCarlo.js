import { runMonthlySimulation, computeHomeProjection } from './projection.js';
import { evaluateGoalPass } from './goalEvaluation.js';

/**
 * Full Monte Carlo simulation with randomized parameters.
 * Returns percentile bands, solvency rate, summary statistics, and goal success rates.
 */
export function runMonteCarlo(base, mcParams, goals = []) {
  const { mcNumSims: N, mcInvestVol, mcBizGrowthVol, mcMsftVol, mcSsdiDelay, mcSsdiDenialPct, mcCutsDiscipline } = mcParams;
  const months = 72;

  // Box-Muller normal random
  const randNorm = (mean, std) => {
    const u1 = Math.random();
    const u2 = Math.random();
    return mean + std * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  };

  const allBalances = [];
  const goalSuccessCounts = goals.map(() => 0);

  // Pre-compute home equity once (deterministic — doesn't vary per sim)
  // 401k is now per-sim since it depends on cash flow via deficit drawdown
  let homeData = null;
  if (goals.some(g => g.type === 'net_worth_target')) {
    homeData = computeHomeProjection(base).homeData;
  }

  for (let sim = 0; sim < N; sim++) {
    const useSS = base.ssType === 'ss';
    const simParams = {
      ...base,
      investmentReturn: Math.max(0, randNorm(base.investmentReturn, mcInvestVol)),
      sarahClientGrowth: Math.max(0, randNorm(base.sarahClientGrowth, mcBizGrowthVol)),
      sarahRateGrowth: Math.max(0, randNorm(base.sarahRateGrowth, mcBizGrowthVol * 0.5)),
      msftGrowth: randNorm(base.msftGrowth, mcMsftVol),
      // SS retirement is guaranteed at age 62 — no delay or denial risk
      ssdiApprovalMonth: useSS ? base.ssdiApprovalMonth : base.ssdiApprovalMonth + Math.max(0, Math.round(Math.random() * mcSsdiDelay)),
      cutsDiscipline: Math.min(1, Math.max(0, randNorm(1, mcCutsDiscipline / 100))),
    };

    // Randomly deny SSDI based on denial probability (not applicable to SS retirement)
    if (!useSS && mcSsdiDenialPct > 0 && Math.random() * 100 < mcSsdiDenialPct) {
      simParams.ssdiDenied = true;
    }

    const { monthlyData } = runMonthlySimulation(simParams);
    allBalances.push(monthlyData.map(d => d.balance));

    // Evaluate goals for this simulation
    if (goals.length > 0) {
      const wealthData = homeData ? monthlyData.map((d, i) => ({
        month: d.month,
        balance401k: d.balance401k,
        homeEquity: homeData[i]?.homeEquity || 0,
      })) : null;
      const goalOpts = { wealthData, retireDebt: simParams.retireDebt };
      goals.forEach((goal, i) => {
        if (evaluateGoalPass(goal, monthlyData, goalOpts)) {
          goalSuccessCounts[i]++;
        }
      });
    }
  }

  // Compute percentiles at each month
  const percentiles = [10, 25, 50, 75, 90];
  const bands = percentiles.map(p => {
    const series = [];
    for (let m = 0; m <= months; m++) {
      const vals = allBalances.map(b => b[m]).sort((a, b) => a - b);
      const idx = Math.floor(vals.length * p / 100);
      series.push(vals[Math.min(idx, vals.length - 1)]);
    }
    return { pct: p, series };
  });

  // Solvency = % of sims that never go below 0
  const solvent = allBalances.filter(b => b.every(v => v >= 0)).length;
  const solvencyRate = solvent / N;

  // Trough: median of each sim's minimum balance
  const troughs = allBalances.map(b => Math.min(...b)).sort((a, b) => a - b);
  const medianTrough = troughs[Math.floor(troughs.length / 2)];

  // Final balances
  const finals = allBalances.map(b => b[b.length - 1]).sort((a, b) => a - b);
  const medianFinal = finals[Math.floor(finals.length / 2)];
  const p10Final = finals[Math.floor(finals.length * 0.1)];
  const p90Final = finals[Math.floor(finals.length * 0.9)];

  const goalSuccessRates = goals.map((g, i) => ({
    goalId: g.id,
    successRate: goalSuccessCounts[i] / N,
  }));

  return {
    bands, solvencyRate, medianTrough, medianFinal,
    p10Final, p90Final, numSims: N,
    params: { investVol: mcInvestVol, bizGrowthVol: mcBizGrowthVol, msftVol: mcMsftVol, ssdiDelay: mcSsdiDelay, cutsDiscipline: mcCutsDiscipline },
    goalSuccessRates,
  };
}

/**
 * Fast Monte Carlo for Dad Mode — seeded PRNG for deterministic, smooth slider response.
 * 200 simulations, returns solvency rate and final balance stats.
 */
export function runDadMonteCarlo(base) {
  const N = 200;
  const months = 72;

  // Seeded PRNG (mulberry32) — same seed = same random paths
  const seed = 42;
  const mulberry32 = (s) => { return () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
  const rng = mulberry32(seed);

  const randNorm = (mean, std) => {
    const u1 = rng() || 0.001;
    const u2 = rng();
    return mean + std * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  };

  let solvent = 0;
  const finals = [];

  for (let sim = 0; sim < N; sim++) {
    // Pre-generate randomized params using seeded PRNG
    const simParams = {
      ...base,
      investmentReturn: Math.max(0, randNorm(base.investmentReturn, 12)),
      sarahClientGrowth: Math.max(0, randNorm(base.sarahClientGrowth, 5)),
      sarahRateGrowth: Math.max(0, randNorm(base.sarahRateGrowth, 2.5)),
      msftGrowth: randNorm(base.msftGrowth, 15),
      ssdiApprovalMonth: base.ssdiApprovalMonth + Math.max(0, Math.round(rng() * 6)),
      cutsDiscipline: Math.min(1, Math.max(0, randNorm(1, 0.25))),
    };

    const { monthlyData } = runMonthlySimulation(simParams);
    const balances = monthlyData.map(d => d.balance);
    const everNeg = balances.some(b => b < 0);
    if (!everNeg) solvent++;
    finals.push(balances[balances.length - 1]);
  }

  finals.sort((a, b) => a - b);
  return { solvency: solvent / N, medianFinal: finals[Math.floor(N / 2)], p10: finals[Math.floor(N * 0.1)] };
}
