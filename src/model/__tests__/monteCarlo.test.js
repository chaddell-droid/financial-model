/**
 * Unit tests for the Monte Carlo simulation engine (runMonteCarlo).
 * Run with: node src/model/__tests__/monteCarlo.test.js
 */
import assert from 'node:assert';
import { runMonteCarlo, computeBands, sampleBootstrapDeviations } from '../monteCarlo.js';
import { runMonthlySimulation } from '../projection.js';
import { gatherStateWithOverrides } from '../../state/gatherState.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (e) {
    console.log(`  FAIL  ${name}`);
    console.log(`        ${e.message}`);
    failed++;
  }
}

/** Approximate equality for financial calculations. */
function near(actual, expected, tolerance, label) {
  const diff = Math.abs(actual - expected);
  if (diff > tolerance) {
    throw new Error(
      `${label || 'near'}: expected ~${expected} (+/-${tolerance}), got ${actual} (diff ${diff})`
    );
  }
}

// Helper: build mcParams from overrides on top of defaults
function mcParams(overrides = {}) {
  return {
    mcNumSims: 50,
    mcInvestVol: 12,
    mcBizGrowthVol: 5,
    mcMsftVol: 15,
    mcSsdiDelay: 6,
    mcSsdiDenialPct: 5,
    mcCutsDiscipline: 25,
    ...overrides,
  };
}

// ════════════════════════════════════════════════════════════════════════
// 1. Results have expected structure
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Monte Carlo — result structure ===');

test('1. Result has expected top-level keys', () => {
  const base = gatherStateWithOverrides({});
  const mc = mcParams();
  const result = runMonteCarlo(base, mc, [], { seed: 42 });

  assert.strictEqual(typeof result.solvencyRate, 'number', 'solvencyRate should be a number');
  assert.ok(Array.isArray(result.bands), 'bands should be an array');
  assert.strictEqual(result.bands.length, 5, 'should have 5 percentile bands (10,25,50,75,90)');
  assert.strictEqual(typeof result.medianTrough, 'number', 'medianTrough should be a number');
  assert.strictEqual(typeof result.medianFinal, 'number', 'medianFinal should be a number');
  assert.strictEqual(typeof result.p10Final, 'number', 'p10Final should be a number');
  assert.strictEqual(typeof result.p90Final, 'number', 'p90Final should be a number');
  assert.strictEqual(result.numSims, 50, 'numSims should match mcNumSims');
  assert.ok(Array.isArray(result.goalSuccessRates), 'goalSuccessRates should be an array');
  assert.ok(result.params, 'params should be present');
  assert.strictEqual(result.params.investVol, 12, 'params.investVol should match input');
});

test('2. Each percentile band has correct shape', () => {
  const base = gatherStateWithOverrides({});
  const mc = mcParams();
  const result = runMonteCarlo(base, mc, [], { seed: 42 });

  const expectedPcts = [10, 25, 50, 75, 90];
  result.bands.forEach((band, i) => {
    assert.strictEqual(band.pct, expectedPcts[i], `band[${i}].pct should be ${expectedPcts[i]}`);
    assert.ok(Array.isArray(band.series), `band[${i}].series should be an array`);
    assert.strictEqual(band.series.length, 73, `band[${i}].series should have 73 entries (months 0-72)`);
  });
});

// ════════════════════════════════════════════════════════════════════════
// 2. numSims matches mcNumSims
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Monte Carlo — simulation count ===');

test('3. numSims in result matches the requested mcNumSims', () => {
  const base = gatherStateWithOverrides({});
  const mc = mcParams({ mcNumSims: 77 });
  const result = runMonteCarlo(base, mc, [], { seed: 1 });
  assert.strictEqual(result.numSims, 77, 'numSims should be 77');
});

// ════════════════════════════════════════════════════════════════════════
// 3. Deterministic seeding produces identical results
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Monte Carlo — deterministic seeding ===');

test('4. Same seed produces identical solvencyRate and medianFinal', () => {
  const base = gatherStateWithOverrides({});
  const mc = mcParams({ mcNumSims: 80 });

  const r1 = runMonteCarlo(base, mc, [], { seed: 12345 });
  const r2 = runMonteCarlo(base, mc, [], { seed: 12345 });

  assert.strictEqual(r1.solvencyRate, r2.solvencyRate, 'solvencyRate should be identical');
  assert.strictEqual(r1.medianFinal, r2.medianFinal, 'medianFinal should be identical');
  assert.strictEqual(r1.medianTrough, r2.medianTrough, 'medianTrough should be identical');
  assert.strictEqual(r1.p10Final, r2.p10Final, 'p10Final should be identical');
  assert.strictEqual(r1.p90Final, r2.p90Final, 'p90Final should be identical');

  // Also verify band data matches
  for (let b = 0; b < r1.bands.length; b++) {
    for (let m = 0; m < r1.bands[b].series.length; m++) {
      assert.strictEqual(
        r1.bands[b].series[m], r2.bands[b].series[m],
        `band[${b}].series[${m}] should be identical across runs`
      );
    }
  }
});

test('5. Different seeds produce different results', () => {
  const base = gatherStateWithOverrides({});
  const mc = mcParams({ mcNumSims: 80 });

  const r1 = runMonteCarlo(base, mc, [], { seed: 100 });
  const r2 = runMonteCarlo(base, mc, [], { seed: 999 });

  // With enough volatility, different seeds should produce different medianFinals
  const differ = r1.medianFinal !== r2.medianFinal || r1.medianTrough !== r2.medianTrough;
  assert.ok(differ, 'Different seeds should produce different results');
});

// ════════════════════════════════════════════════════════════════════════
// 4. Volatility = 0 produces deterministic (narrow) output
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Monte Carlo — zero volatility ===');

test('6. Zero volatility produces identical outcomes across all sims', () => {
  const base = gatherStateWithOverrides({
    ssType: 'ss',  // SS retirement — no SSDI denial/delay randomness
  });
  const mc = mcParams({
    mcNumSims: 50,
    mcInvestVol: 0,
    mcBizGrowthVol: 0,
    mcMsftVol: 0,
    mcSsdiDelay: 0,
    mcSsdiDenialPct: 0,
    mcCutsDiscipline: 0,
  });

  const result = runMonteCarlo(base, mc, [], { seed: 42 });

  // With zero volatility and SS (no SSDI randomness), all percentile bands
  // should be identical — every sim produces the same trajectory
  const p10 = result.bands.find(b => b.pct === 10);
  const p50 = result.bands.find(b => b.pct === 50);
  const p90 = result.bands.find(b => b.pct === 90);

  for (let m = 0; m < p50.series.length; m++) {
    assert.strictEqual(p10.series[m], p50.series[m],
      `Month ${m}: p10 (${p10.series[m]}) should equal p50 (${p50.series[m]}) with zero vol`);
    assert.strictEqual(p50.series[m], p90.series[m],
      `Month ${m}: p50 (${p50.series[m]}) should equal p90 (${p90.series[m]}) with zero vol`);
  }

  // Solvency rate must be exactly 0 or 1 (all same)
  assert.ok(
    result.solvencyRate === 0 || result.solvencyRate === 1,
    `solvencyRate should be exactly 0 or 1 with zero vol, got ${result.solvencyRate}`
  );
});

// ════════════════════════════════════════════════════════════════════════
// 5. Higher volatility produces wider distribution
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Monte Carlo — volatility spread ===');

test('7. Higher investVol produces wider p10-p90 spread', () => {
  const base = gatherStateWithOverrides({ ssType: 'ss' });

  const mcLow = mcParams({
    mcNumSims: 100,
    mcInvestVol: 2,
    mcBizGrowthVol: 0,
    mcMsftVol: 0,
    mcSsdiDenialPct: 0,
    mcCutsDiscipline: 0,
  });
  const mcHigh = mcParams({
    mcNumSims: 100,
    mcInvestVol: 30,
    mcBizGrowthVol: 0,
    mcMsftVol: 0,
    mcSsdiDenialPct: 0,
    mcCutsDiscipline: 0,
  });

  const rLow = runMonteCarlo(base, mcLow, [], { seed: 42 });
  const rHigh = runMonteCarlo(base, mcHigh, [], { seed: 42 });

  const spreadLow = rLow.p90Final - rLow.p10Final;
  const spreadHigh = rHigh.p90Final - rHigh.p10Final;

  assert.ok(spreadHigh > spreadLow,
    `High vol spread (${spreadHigh}) should exceed low vol spread (${spreadLow})`);
});

// ════════════════════════════════════════════════════════════════════════
// 6. SSDI denial rate
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Monte Carlo — SSDI denial ===');

test('8. mcSsdiDenialPct=100 with SSDI type produces lower solvency than 0%', () => {
  const base = gatherStateWithOverrides({ ssType: 'ssdi' });

  const mcNoDenial = mcParams({
    mcNumSims: 60,
    mcInvestVol: 0,
    mcBizGrowthVol: 0,
    mcMsftVol: 0,
    mcSsdiDelay: 0,
    mcSsdiDenialPct: 0,
    mcCutsDiscipline: 0,
  });

  const mcAllDenied = mcParams({
    mcNumSims: 60,
    mcInvestVol: 0,
    mcBizGrowthVol: 0,
    mcMsftVol: 0,
    mcSsdiDelay: 0,
    mcSsdiDenialPct: 100,
    mcCutsDiscipline: 0,
  });

  const rNone = runMonteCarlo(base, mcNoDenial, [], { seed: 42 });
  const rAll = runMonteCarlo(base, mcAllDenied, [], { seed: 42 });

  // With SSDI denied in all sims, the median final balance should be lower
  assert.ok(rAll.medianFinal < rNone.medianFinal,
    `All-denied medianFinal (${rAll.medianFinal}) should be less than no-denial (${rNone.medianFinal})`);
});

test('9. mcSsdiDenialPct has no effect when ssType is SS retirement', () => {
  const base = gatherStateWithOverrides({ ssType: 'ss' });

  const mcNoDenial = mcParams({
    mcNumSims: 50,
    mcInvestVol: 0,
    mcBizGrowthVol: 0,
    mcMsftVol: 0,
    mcSsdiDelay: 0,
    mcSsdiDenialPct: 0,
    mcCutsDiscipline: 0,
  });

  const mcAllDenied = mcParams({
    mcNumSims: 50,
    mcInvestVol: 0,
    mcBizGrowthVol: 0,
    mcMsftVol: 0,
    mcSsdiDelay: 0,
    mcSsdiDenialPct: 100,
    mcCutsDiscipline: 0,
  });

  const rNone = runMonteCarlo(base, mcNoDenial, [], { seed: 42 });
  const rAll = runMonteCarlo(base, mcAllDenied, [], { seed: 42 });

  // SS retirement ignores denial — results should be identical
  assert.strictEqual(rNone.medianFinal, rAll.medianFinal,
    'SS retirement medianFinal should be unaffected by denial pct');
  assert.strictEqual(rNone.solvencyRate, rAll.solvencyRate,
    'SS retirement solvencyRate should be unaffected by denial pct');
});

// ════════════════════════════════════════════════════════════════════════
// 7. Goal success rates are wired correctly
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Monte Carlo — goal success rates ===');

test('10. goalSuccessRates array matches goals length and has correct ids', () => {
  const goals = [
    { id: 'g1', name: 'Stay solvent', type: 'savings_floor', targetAmount: 0, targetMonth: 72 },
    { id: 'g2', name: 'Build savings', type: 'savings_target', targetAmount: 50000, targetMonth: 48 },
  ];

  const base = gatherStateWithOverrides({});
  const mc = mcParams({ mcNumSims: 50 });
  const result = runMonteCarlo(base, mc, goals, { seed: 42 });

  assert.strictEqual(result.goalSuccessRates.length, 2, 'Should have 2 goal results');
  assert.strictEqual(result.goalSuccessRates[0].goalId, 'g1', 'First goal id should be g1');
  assert.strictEqual(result.goalSuccessRates[1].goalId, 'g2', 'Second goal id should be g2');
  assert.ok(result.goalSuccessRates[0].successRate >= 0 && result.goalSuccessRates[0].successRate <= 1,
    'successRate should be between 0 and 1');
  assert.ok(result.goalSuccessRates[1].successRate >= 0 && result.goalSuccessRates[1].successRate <= 1,
    'successRate should be between 0 and 1');
});

test('11. Easy goal has higher success rate than hard goal', () => {
  const goals = [
    // Easy: savings never below -$10M (trivially true). Was -999999, but the
    // D7 gross-up of 401(k) deficit draws (remediation 2026-06-09) pushes the
    // worst seeded sims below -$1M, so the old floor was no longer trivial.
    { id: 'easy', name: 'Trivial floor', type: 'savings_floor', targetAmount: -9999999, targetMonth: 72 },
    // Hard: savings above $10M at month 72 (nearly impossible)
    { id: 'hard', name: 'Impossible target', type: 'savings_target', targetAmount: 10000000, targetMonth: 72 },
  ];

  const base = gatherStateWithOverrides({ expenseInflation: false });
  const mc = mcParams({ mcNumSims: 50 });
  const result = runMonteCarlo(base, mc, goals, { seed: 42 });

  const easyRate = result.goalSuccessRates.find(g => g.goalId === 'easy').successRate;
  const hardRate = result.goalSuccessRates.find(g => g.goalId === 'hard').successRate;

  assert.strictEqual(easyRate, 1, 'Trivially easy goal should have 100% success');
  assert.strictEqual(hardRate, 0, 'Nearly impossible goal should have 0% success');
});

// ════════════════════════════════════════════════════════════════════════
// 8. Solvency rate bounds and sanity
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Monte Carlo — solvency sanity ===');

test('12. Solvency rate is between 0 and 1', () => {
  const base = gatherStateWithOverrides({});
  const mc = mcParams({ mcNumSims: 50 });
  const result = runMonteCarlo(base, mc, [], { seed: 42 });

  assert.ok(result.solvencyRate >= 0, `solvencyRate (${result.solvencyRate}) should be >= 0`);
  assert.ok(result.solvencyRate <= 1, `solvencyRate (${result.solvencyRate}) should be <= 1`);
});

// ════════════════════════════════════════════════════════════════════════
// 9. Total-wealth tracking (401k + home equity + net worth)
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Monte Carlo — total wealth tracking ===');

test('13. Result exposes bands401k, bandsHomeEquity, bandsNetWorth alongside savings bands', () => {
  const base = gatherStateWithOverrides({});
  const mc = mcParams({ mcNumSims: 50 });
  const result = runMonteCarlo(base, mc, [], { seed: 42 });
  for (const key of ['bands401k', 'bandsHomeEquity', 'bandsNetWorth']) {
    assert.ok(Array.isArray(result[key]), `${key} should be an array`);
    assert.strictEqual(result[key].length, 5, `${key} should have 5 percentile bands`);
    for (const band of result[key]) {
      assert.strictEqual(band.series.length, 73, `${key} bands should have 73 entries (months 0-72)`);
    }
  }
});

test('14. Net worth = savings + 401k + home equity at the median final', () => {
  const base = gatherStateWithOverrides({ ssType: 'ss' }); // less variance for cleaner check
  const mc = mcParams({
    mcNumSims: 100,
    mcInvestVol: 0, mcBizGrowthVol: 0, mcMsftVol: 0,
    mcSsdiDelay: 0, mcSsdiDenialPct: 0, mcCutsDiscipline: 0,
  });
  const result = runMonteCarlo(base, mc, [], { seed: 42 });
  // With zero volatility, every sim is identical, so median final NW should
  // equal medianFinal + medianFinal401k + medianFinalHomeEquity exactly.
  const sum = result.medianFinal + result.medianFinal401k + result.medianFinalHomeEquity;
  near(result.medianFinalNetWorth, sum, 5, 'medianFinalNetWorth should equal sum of medians at zero volatility');
});

test('15. 401k final percentiles are in p10 ≤ p50 ≤ p90 order', () => {
  const base = gatherStateWithOverrides({});
  const mc = mcParams({ mcNumSims: 100 });
  const result = runMonteCarlo(base, mc, [], { seed: 42 });
  assert.ok(result.p10Final401k <= result.medianFinal401k,
    `p10 401k (${result.p10Final401k}) should be <= median (${result.medianFinal401k})`);
  assert.ok(result.medianFinal401k <= result.p90Final401k,
    `median 401k (${result.medianFinal401k}) should be <= p90 (${result.p90Final401k})`);
});

test('16. Net worth final percentiles are in p10 ≤ p50 ≤ p90 order', () => {
  const base = gatherStateWithOverrides({});
  const mc = mcParams({ mcNumSims: 100 });
  const result = runMonteCarlo(base, mc, [], { seed: 42 });
  assert.ok(result.p10FinalNetWorth <= result.medianFinalNetWorth);
  assert.ok(result.medianFinalNetWorth <= result.p90FinalNetWorth);
});

test('17. 401k bands grow from starting401k under positive return when no drawdown fires', () => {
  // To isolate 401k growth, give the household enough savings that the
  // drawdown waterfall never fires (savings stays ≥ 0 every month).
  // 401k should then just compound at return401k.
  const base = gatherStateWithOverrides({
    ssType: 'ss',                 // suppress SSDI randomness
    chadJob: true, chadJobSalary: 200000,  // strong income → savings stays positive
    starting401k: 478000,
    return401k: 8,
    startingSavings: 1000000,     // big buffer so no drawdown
  });
  const mc = mcParams({
    mcNumSims: 50,
    mcInvestVol: 0, mcBizGrowthVol: 0, mcMsftVol: 0,
    mcSsdiDelay: 0, mcSsdiDenialPct: 0, mcCutsDiscipline: 0,
  });
  const result = runMonteCarlo(base, mc, [], { seed: 42 });
  const median = result.bands401k.find(b => b.pct === 50);
  const finalK = median.series[median.series.length - 1];
  // 478K compounded at 8%/yr for 6 years (72 months) ≈ 758K. Since chadJob is
  // on but 401k contributions are off (chadJob401kEnabled defaults to false),
  // the only growth is interest. Expect final > starting.
  assert.ok(finalK > 478000,
    `401k median final (${finalK}) should exceed starting (478000) under positive return when no drawdown fires`);
  // And drawdowns should not have fired in this scenario.
  assert.strictEqual(result.drawdownFiredCount, 0,
    `Drawdown should not have fired in this no-deficit scenario; got ${result.drawdownFiredCount}/${result.numSims}`);
});

// ════════════════════════════════════════════════════════════════════════
// A6 + B11 (remediation 2026-06-10, item 4.1, gate D7): one common market
// factor Z drives savings return, 401(k) return (rho=1), MSFT price
// (rho 0.7), and home appreciation (rho 0.3, smaller sigma). Before this
// fix the 401(k) compounded at a deterministic return401k and the home at a
// deterministic homeAppreciation in EVERY sim (bands401k p10=p50=p90 in
// solvent runs), understating downside risk.
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Monte Carlo — correlated market factor (A6 + B11) ===');

// Solvent scenario (no drawdown noise): the only way 401(k)/home bands can
// spread is if their growth rates are actually randomized.
function solventBase() {
  return gatherStateWithOverrides({
    ssType: 'ss',
    chadJob: true, chadJobSalary: 200000,
    starting401k: 478000,
    return401k: 8,
    startingSavings: 1000000,
    // 6.2 (2026-06-10): disable the (default-on) twins' college tuition so
    // this household stays cash-solvent — these tests isolate variance
    // sources, and the tuition tips low-MSFT sims into 401(k) deficit draws,
    // which legitimately leak MSFT variance into the 401k/home bands via the
    // deficit chain.
    collegeMonths: 0,
  });
}

test('22. A6: bands401k spread p10 < p50 < p90 under investment volatility alone', () => {
  const mc = mcParams({
    mcNumSims: 200,
    mcInvestVol: 12, mcBizGrowthVol: 0, mcMsftVol: 0,
    mcSsdiDelay: 0, mcSsdiDenialPct: 0, mcCutsDiscipline: 0,
  });
  const result = runMonteCarlo(solventBase(), mc, [], { seed: 42 });
  const p10 = result.bands401k.find(b => b.pct === 10);
  const p50 = result.bands401k.find(b => b.pct === 50);
  const p90 = result.bands401k.find(b => b.pct === 90);
  const last = p10.series.length - 1;
  assert.ok(p10.series[last] < p50.series[last],
    `401k p10 final (${p10.series[last]}) should be < p50 (${p50.series[last]}) — 401(k) return must be randomized`);
  assert.ok(p50.series[last] < p90.series[last],
    `401k p50 final (${p50.series[last]}) should be < p90 (${p90.series[last]})`);
});

test('23. A6: home-equity bands spread under investment volatility alone (rho 0.3 + own sigma)', () => {
  const mc = mcParams({
    mcNumSims: 200,
    mcInvestVol: 12, mcBizGrowthVol: 0, mcMsftVol: 0,
    mcSsdiDelay: 0, mcSsdiDenialPct: 0, mcCutsDiscipline: 0,
  });
  const result = runMonteCarlo(solventBase(), mc, [], { seed: 42 });
  const p10 = result.bandsHomeEquity.find(b => b.pct === 10);
  const p90 = result.bandsHomeEquity.find(b => b.pct === 90);
  const last = p10.series.length - 1;
  assert.ok(p10.series[last] < p90.series[last],
    `home equity p10 final (${p10.series[last]}) should be < p90 (${p90.series[last]}) — home appreciation must be randomized`);
});

test('24. A6: home spread is narrower than 401k spread (smaller sigma, rho 0.3)', () => {
  const mc = mcParams({
    mcNumSims: 200,
    mcInvestVol: 12, mcBizGrowthVol: 0, mcMsftVol: 0,
    mcSsdiDelay: 0, mcSsdiDenialPct: 0, mcCutsDiscipline: 0,
  });
  const result = runMonteCarlo(solventBase(), mc, [], { seed: 42 });
  const rel = (bands) => {
    const p10 = bands.find(b => b.pct === 10).series;
    const p50 = bands.find(b => b.pct === 50).series;
    const p90 = bands.find(b => b.pct === 90).series;
    const last = p10.length - 1;
    return (p90[last] - p10[last]) / Math.max(1, Math.abs(p50[last]));
  };
  assert.ok(rel(result.bandsHomeEquity) < rel(result.bands401k),
    'relative home-equity spread should be narrower than the 401k spread');
});

test('25. A6: zero investment vol -> 401k and home bands stay degenerate even with MSFT vol on', () => {
  const mc = mcParams({
    mcNumSims: 100,
    mcInvestVol: 0, mcBizGrowthVol: 0, mcMsftVol: 20,
    mcSsdiDelay: 0, mcSsdiDenialPct: 0, mcCutsDiscipline: 0,
  });
  const result = runMonteCarlo(solventBase(), mc, [], { seed: 42 });
  for (const key of ['bands401k', 'bandsHomeEquity']) {
    const p10 = result[key].find(b => b.pct === 10);
    const p90 = result[key].find(b => b.pct === 90);
    for (let m = 0; m < p10.series.length; m++) {
      assert.strictEqual(p10.series[m], p90.series[m],
        `${key} month ${m}: MSFT-only volatility must not leak into 401k/home growth`);
    }
  }
});

// ════════════════════════════════════════════════════════════════════════
// Item 4.2 (remediation 2026-06-10, gate D7): opt-in block-bootstrap mode.
// 12-month blocks sampled from the Shiller monthly real stock series drive
// the savings/401(k) return SEQUENCE per sim (recentered on the user's
// expected return) — true sequence-of-returns risk inside the MC.
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Monte Carlo — block bootstrap (item 4.2, D7) ===');

test('26. bootstrap default OFF: explicit false matches a params object without the key (back-compat)', () => {
  const base = gatherStateWithOverrides({});
  const rNoKey = runMonteCarlo(base, mcParams({ mcNumSims: 60 }), [], { seed: 7 });
  const rFalse = runMonteCarlo(base, mcParams({ mcNumSims: 60, mcBlockBootstrap: false }), [], { seed: 7 });
  assert.strictEqual(rNoKey.medianFinal, rFalse.medianFinal);
  assert.strictEqual(rNoKey.solvencyRate, rFalse.solvencyRate);
  assert.strictEqual(rNoKey.p10Final, rFalse.p10Final);
});

test('27. bootstrap ON is deterministic with a seed and differs from OFF', () => {
  const base = gatherStateWithOverrides({});
  const mc = mcParams({ mcNumSims: 60, mcBlockBootstrap: true });
  const r1 = runMonteCarlo(base, mc, [], { seed: 7 });
  const r2 = runMonteCarlo(base, mc, [], { seed: 7 });
  assert.strictEqual(r1.medianFinal, r2.medianFinal, 'same seed must reproduce');
  assert.strictEqual(r1.p10Final, r2.p10Final, 'same seed must reproduce p10');
  const rOff = runMonteCarlo(base, mcParams({ mcNumSims: 60 }), [], { seed: 7 });
  assert.ok(r1.medianFinal !== rOff.medianFinal || r1.p10Final !== rOff.p10Final,
    'bootstrap mode should produce different outcomes than constant-draw mode');
});

test('28. bootstrap ON: savings bands spread even with EVERY volatility slider at zero (sequence risk)', () => {
  const mc = mcParams({
    mcNumSims: 100, mcBlockBootstrap: true,
    mcInvestVol: 0, mcBizGrowthVol: 0, mcMsftVol: 0,
    mcSsdiDelay: 0, mcSsdiDenialPct: 0, mcCutsDiscipline: 0,
  });
  const result = runMonteCarlo(solventBase(), mc, [], { seed: 7 });
  const p10 = result.bands.find(b => b.pct === 10);
  const p90 = result.bands.find(b => b.pct === 90);
  const last = p10.series.length - 1;
  assert.ok(p10.series[last] < p90.series[last],
    `bootstrap savings p10 final (${p10.series[last]}) should be < p90 (${p90.series[last]}) — historical sequences carry their own volatility`);
  // 401(k) rides the SAME bootstrapped market path — its bands spread too.
  const k10 = result.bands401k.find(b => b.pct === 10);
  const k90 = result.bands401k.find(b => b.pct === 90);
  assert.ok(k10.series[last] < k90.series[last],
    `bootstrap 401k p10 final (${k10.series[last]}) should be < p90 (${k90.series[last]})`);
});

test('29. sampleBootstrapDeviations: 12-month blocks of finite, mean-centered deviations', () => {
  // Deterministic rng stub: always picks block start 0.
  const devs = sampleBootstrapDeviations(() => 0, 30);
  assert.strictEqual(devs.length, 30, 'returns exactly the requested number of months');
  for (let m = 0; m < devs.length; m++) {
    assert.ok(Number.isFinite(devs[m]), `dev[${m}] must be finite`);
  }
  // Block structure: months 0-11 and 12-23 are the SAME historical block
  // (start 0 both times with the stub rng).
  for (let k = 0; k < 12; k++) {
    assert.strictEqual(devs[k], devs[12 + k], 'repeated block start must repeat the block');
  }
  // Deviations are vs the series mean: a long sample should average near 0.
  const all = sampleBootstrapDeviations(createSeq(), 1200);
  const mean = all.reduce((a, b) => a + b, 0) / all.length;
  assert.ok(Math.abs(mean) < 0.01, `long-run mean deviation should be ~0, got ${mean}`);
});

// Linear-congruential stub for test 29's long sample (deterministic, no seed plumbing).
function createSeq() {
  let s = 42;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

test('30. projection accepts per-month return paths: constant path == constant rate (parity)', () => {
  const base = gatherStateWithOverrides({ ssType: 'ss' });
  const months = (base.totalProjectionMonths || 72);
  const monthlyRate = Math.pow(1 + base.investmentReturn / 100, 1 / 12) - 1;
  const k401Rate = Math.pow(1 + (base.return401k ?? 8) / 100, 1 / 12) - 1;
  const withPath = {
    ...base,
    investmentReturnMonthlyPath: Array(months + 1).fill(monthlyRate),
    return401kMonthlyPath: Array(months + 1).fill(k401Rate),
  };
  const a = runMonthlySimulation(base).monthlyData;
  const b = runMonthlySimulation(withPath).monthlyData;
  assert.strictEqual(a.length, b.length);
  for (let m = 0; m < a.length; m++) {
    assert.strictEqual(a[m].balance, b[m].balance, `month ${m}: constant path must equal constant rate`);
    assert.strictEqual(a[m].balance401k, b[m].balance401k, `month ${m}: 401k path parity`);
  }
});

console.log('\n=== Monte Carlo — solvency tiers + withdrawals ===');

test('18. savingsOnlySolvencyRate is between 0 and 1, and ≤ solvencyRate', () => {
  const base = gatherStateWithOverrides({});
  const mc = mcParams({ mcNumSims: 100 });
  const result = runMonteCarlo(base, mc, [], { seed: 42 });
  assert.ok(result.savingsOnlySolvencyRate >= 0 && result.savingsOnlySolvencyRate <= 1);
  assert.ok(result.savingsOnlySolvencyRate <= result.solvencyRate,
    `savingsOnlySolvencyRate (${result.savingsOnlySolvencyRate}) must be ≤ solvencyRate (${result.solvencyRate}); strict subset`);
});

test('19. drawdownFiredCount + (savingsOnlySolvencyRate * N) sums coherently', () => {
  const base = gatherStateWithOverrides({});
  const mc = mcParams({ mcNumSims: 100 });
  const result = runMonteCarlo(base, mc, [], { seed: 42 });
  // savingsOnlySolvencyRate = (N - drawdownFiredCount) / N
  // → drawdownFiredCount = N - savingsOnlySolvencyRate * N
  const expected = result.numSims - Math.round(result.savingsOnlySolvencyRate * result.numSims);
  assert.strictEqual(result.drawdownFiredCount, expected,
    `drawdownFiredCount (${result.drawdownFiredCount}) should equal N - savingsOnlySolvencyRate*N (${expected})`);
});

test('20. Withdrawal stats are non-negative and percentiles ordered', () => {
  const base = gatherStateWithOverrides({});
  const mc = mcParams({ mcNumSims: 100 });
  const result = runMonteCarlo(base, mc, [], { seed: 42 });
  assert.ok(result.medianWithdrawal401k >= 0);
  assert.ok(result.p90Withdrawal401k >= result.medianWithdrawal401k,
    `p90 withdrawal (${result.p90Withdrawal401k}) should be ≥ median (${result.medianWithdrawal401k})`);
  assert.ok(result.medianWithdrawalHome >= 0);
  assert.ok(result.p90WithdrawalHome >= result.medianWithdrawalHome);
});

test('21. Zero-volatility run produces identical 401k bands across percentiles', () => {
  const base = gatherStateWithOverrides({ ssType: 'ss' });
  const mc = mcParams({
    mcNumSims: 50,
    mcInvestVol: 0, mcBizGrowthVol: 0, mcMsftVol: 0,
    mcSsdiDelay: 0, mcSsdiDenialPct: 0, mcCutsDiscipline: 0,
  });
  const result = runMonteCarlo(base, mc, [], { seed: 42 });
  const p10 = result.bands401k.find(b => b.pct === 10);
  const p90 = result.bands401k.find(b => b.pct === 90);
  for (let m = 0; m < p10.series.length; m++) {
    assert.strictEqual(p10.series[m], p90.series[m],
      `Month ${m}: 401k p10 should equal p90 with zero vol`);
  }
});

// ════════════════════════════════════════════════════════════════════════
// computeBands — shared interpolated percentile definition (C15 — remediation
// 2026-06-10 item 4.3). The bands must match an INDEPENDENT linear-interpolation
// reference at position (N−1)·p/100 — the same definition as percentile.js and
// pwaDistribution — not the old nearest-rank floor(N·p/100).
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== computeBands — interpolated percentile parity (C15) ===');

// Independent reference: linear interpolation between closest ranks (numpy
// default), written inline so the test does not depend on percentile.js.
function refPct(sortedVals, p) {
  // Same operation order as the shared util ((N−1)·(p/100)) so the parity
  // check is exact to the last float ulp, not just approximately equal.
  const pos = (sortedVals.length - 1) * (p / 100);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sortedVals[lo];
  return sortedVals[lo] + (sortedVals[hi] - sortedVals[lo]) * (pos - lo);
}
function referenceBands(series, percentiles, months) {
  return percentiles.map(p => {
    const out = [];
    for (let m = 0; m <= months; m++) {
      const vals = series.map(b => b[m]).sort((a, b) => a - b);
      out.push(refPct(vals, p));
    }
    return { pct: p, series: out };
  });
}

test('computeBands matches the interpolated-percentile reference implementation (C15)', () => {
  // Deterministic pseudo-random series: 40 sims × 25 months
  const months = 24;
  const series = [];
  let s = 1;
  const next = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 40; i++) {
    series.push(Array.from({ length: months + 1 }, () => Math.round(next() * 1000000 - 200000)));
  }
  const percentiles = [10, 25, 50, 75, 90];
  assert.deepStrictEqual(
    computeBands(series, percentiles, months),
    referenceBands(series, percentiles, months),
  );
});

test('computeBands handles a single sim and a single month', () => {
  const out = computeBands([[5, 7]], [10, 50, 90], 1);
  assert.deepStrictEqual(out, [
    { pct: 10, series: [5, 7] },
    { pct: 50, series: [5, 7] },
    { pct: 90, series: [5, 7] },
  ]);
});

test('computeBands percentile ordering: p10 <= p50 <= p90 at every month', () => {
  const months = 12;
  const series = [];
  let s = 99;
  const next = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 17; i++) {
    series.push(Array.from({ length: months + 1 }, () => next() * 500000));
  }
  const [p10, p50, p90] = computeBands(series, [10, 50, 90], months);
  for (let m = 0; m <= months; m++) {
    assert.ok(p10.series[m] <= p50.series[m], `month ${m}: p10 <= p50`);
    assert.ok(p50.series[m] <= p90.series[m], `month ${m}: p50 <= p90`);
  }
});

// ════════════════════════════════════════════════════════════════════════
// Summary
// ════════════════════════════════════════════════════════════════════════
console.log(`\n${'='.repeat(50)}`);
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log('='.repeat(50));
if (failed > 0) process.exit(1);
