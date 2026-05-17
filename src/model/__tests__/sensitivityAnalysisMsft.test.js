/**
 * MSFT Offer Bundle Tests — verify the "Take the MSFT offer" sensitivity
 * recommendation's displayed monthlyImpact correctly reflects the engine
 * (projection.js msftMultIssueToVest formula) and responds to msftGrowth.
 *
 * Bug fixed: previously hardcoded gross formula omitted hire stock entirely
 * and ignored msftGrowth — so display would say "+$X/mo" but the engine
 * actually delivered a different (typically larger) outcome.
 *
 * Run with: node src/model/__tests__/sensitivityAnalysisMsft.test.js
 */
import assert from 'node:assert';
import { buildLeverCandidates, computeTopMoves } from '../sensitivityAnalysis.js';
import { computeProjection } from '../projection.js';
import { gatherState, gatherStateWithOverrides } from '../../state/gatherState.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL  ${name}`);
    console.log(`        ${err.message}`);
  }
}

function findMsftBundle(state) {
  const cands = buildLeverCandidates(state);
  const bundle = cands.find((c) => c.id === 'take_msft_offer');
  assert.ok(bundle, 'MSFT bundle should be present when chadJob is off');
  return bundle;
}

// State helper: ensure chadJob is OFF so the bundle appears.
function baseStateNoJob(overrides = {}) {
  return gatherStateWithOverrides({ chadJob: false, ...overrides });
}

// ════════════════════════════════════════════════════════════════════════
// 1. Bundle structure
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== MSFT bundle — structure ===');

test('Bundle exists when chadJob is off', () => {
  const s = baseStateNoJob();
  const bundle = findMsftBundle(s);
  assert.strictEqual(bundle.id, 'take_msft_offer');
  assert.ok(bundle.mutation.chadJob === true, 'mutation should turn chadJob on');
  assert.ok(bundle.monthlyImpact > 0, 'monthlyImpact should be positive');
});

test('Bundle includes hire stock fields in mutation', () => {
  const s = baseStateNoJob();
  const bundle = findMsftBundle(s);
  assert.ok((bundle.mutation.chadJobHireStockY1 || 0) > 0, 'hire stock Y1 should be filled');
  assert.ok((bundle.mutation.chadJobHireStockY4 || 0) > 0, 'hire stock Y4 should be filled');
  assert.ok((bundle.mutation.chadJobStockRefresh || 0) > 0, 'refresh should be filled');
});

// ════════════════════════════════════════════════════════════════════════
// 2. msftGrowth sensitivity (the core bug)
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== MSFT bundle — msftGrowth sensitivity ===');

test('monthlyImpact INCREASES when msftGrowth increases (0 → 10)', () => {
  const sZero = baseStateNoJob({ msftGrowth: 0 });
  const sHigh = baseStateNoJob({ msftGrowth: 10 });
  const bZero = findMsftBundle(sZero);
  const bHigh = findMsftBundle(sHigh);
  assert.ok(
    bHigh.monthlyImpact > bZero.monthlyImpact,
    `expected impact at 10% growth (${bHigh.monthlyImpact}) > impact at 0% growth (${bZero.monthlyImpact})`,
  );
  // Sanity: the lift should be meaningful — hire stock + refresh together
  // get hit by the growth factor, so we expect at least a few hundred $/mo.
  const lift = bHigh.monthlyImpact - bZero.monthlyImpact;
  assert.ok(lift > 200, `growth-driven lift should be >$200/mo, got $${lift}/mo`);
});

test('monthlyImpact DECREASES when msftGrowth goes negative', () => {
  const sZero = baseStateNoJob({ msftGrowth: 0 });
  const sNeg = baseStateNoJob({ msftGrowth: -10 });
  const bZero = findMsftBundle(sZero);
  const bNeg = findMsftBundle(sNeg);
  assert.ok(
    bNeg.monthlyImpact < bZero.monthlyImpact,
    `expected impact at -10% growth (${bNeg.monthlyImpact}) < impact at 0% growth (${bZero.monthlyImpact})`,
  );
});

// ════════════════════════════════════════════════════════════════════════
// 3. Engine parity — applying the mutation produces sane projection
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== MSFT bundle — engine parity ===');

test('Applying bundle mutation produces finite (non-NaN) projection output', () => {
  const s = baseStateNoJob();
  const bundle = findMsftBundle(s);
  const testState = gatherState({ ...s, ...bundle.mutation });
  const proj = computeProjection(testState);
  const finalBalance = proj.monthlyData[proj.monthlyData.length - 1].balance;
  assert.ok(Number.isFinite(finalBalance), `final balance should be finite, got ${finalBalance}`);
  // The bundle should produce monthlyData of expected length, all finite balances
  assert.ok(proj.monthlyData.length >= 12, 'should have at least 12 months');
  for (const m of proj.monthlyData) {
    assert.ok(Number.isFinite(m.balance), `month ${m.month} balance not finite`);
  }
});

test('Engine impact ALSO grows with msftGrowth (validates display tracks engine direction)', () => {
  const sZero = baseStateNoJob({ msftGrowth: 0 });
  const sHigh = baseStateNoJob({ msftGrowth: 10 });

  const bZero = findMsftBundle(sZero);
  const bHigh = findMsftBundle(sHigh);

  const projZero = computeProjection(gatherState({ ...sZero, ...bZero.mutation }));
  const projHigh = computeProjection(gatherState({ ...sHigh, ...bHigh.mutation }));

  const baseZero = computeProjection(sZero);
  const baseHigh = computeProjection(sHigh);

  const deltaZero = projZero.monthlyData[projZero.monthlyData.length - 1].balance
                  - baseZero.monthlyData[baseZero.monthlyData.length - 1].balance;
  const deltaHigh = projHigh.monthlyData[projHigh.monthlyData.length - 1].balance
                  - baseHigh.monthlyData[baseHigh.monthlyData.length - 1].balance;

  assert.ok(
    deltaHigh > deltaZero,
    `engine should also show larger lift at higher growth — got zero-growth delta $${Math.round(deltaZero)}, high-growth delta $${Math.round(deltaHigh)}`,
  );
});

// ════════════════════════════════════════════════════════════════════════
// 4. State preservation — orDefault should keep custom user values
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== MSFT bundle — state preservation ===');

test('User-tuned salary survives bundle (orDefault keeps non-zero)', () => {
  const customSalary = 199000;
  const s = baseStateNoJob({ chadJobSalary: customSalary });
  const bundle = findMsftBundle(s);
  assert.strictEqual(bundle.mutation.chadJobSalary, customSalary,
    'custom salary should be preserved, not overwritten with default 165000');
});

test('User-tuned hire stock survives bundle', () => {
  const s = baseStateNoJob({
    chadJobHireStockY1: 45000,
    chadJobHireStockY2: 40000,
    chadJobHireStockY3: 35000,
    chadJobHireStockY4: 20000,
  });
  const bundle = findMsftBundle(s);
  assert.strictEqual(bundle.mutation.chadJobHireStockY1, 45000);
  assert.strictEqual(bundle.mutation.chadJobHireStockY4, 20000);
});

// ════════════════════════════════════════════════════════════════════════
// 5. computeTopMoves end-to-end smoke
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== MSFT bundle — computeTopMoves smoke ===');

test('computeTopMoves can return MSFT bundle as a top move', () => {
  const s = baseStateNoJob();
  const moves = computeTopMoves(s, 10);
  const msftMove = moves.find((m) => m.key === 'take_msft_offer');
  // Don't require it to appear (score depends on full lever ranking),
  // but if it does, sanity-check its fields.
  if (msftMove) {
    assert.ok(Number.isFinite(msftMove.finalBalanceDelta), 'finalBalanceDelta should be finite');
    assert.ok(Number.isFinite(msftMove.score), 'score should be finite');
    assert.ok(msftMove.delta > 0, 'delta (monthlyImpact) should be positive');
  }
});

// ════════════════════════════════════════════════════════════════════════
// Summary
// ════════════════════════════════════════════════════════════════════════
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
