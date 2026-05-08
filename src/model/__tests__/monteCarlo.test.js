/**
 * Unit tests for the Monte Carlo simulation engine (runMonteCarlo).
 * Run with: node src/model/__tests__/monteCarlo.test.js
 */
import assert from 'node:assert';
import { runMonteCarlo } from '../monteCarlo.js';
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
    // Easy: savings never below -999999 (trivially true)
    { id: 'easy', name: 'Trivial floor', type: 'savings_floor', targetAmount: -999999, targetMonth: 72 },
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
// Summary
// ════════════════════════════════════════════════════════════════════════
console.log(`\n${'='.repeat(50)}`);
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log('='.repeat(50));
if (failed > 0) process.exit(1);
