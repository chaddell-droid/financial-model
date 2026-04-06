/**
 * Unit tests for sensitivityAnalysis.js (computeTopMoves).
 * Run with: node src/model/__tests__/sensitivityAnalysis.test.js
 */
import assert from 'node:assert';
import { computeTopMoves } from '../sensitivityAnalysis.js';
import { gatherStateWithOverrides } from '../../state/gatherState.js';

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

// ════════════════════════════════════════════════════════════════════════
// computeTopMoves — basics
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== computeTopMoves — basics ===');

test('1. Returns an array', () => {
  const s = gatherStateWithOverrides({});
  const results = computeTopMoves(s);
  assert.ok(Array.isArray(results), 'should return an array');
});

test('2. Returns at most topN results (default 3)', () => {
  const s = gatherStateWithOverrides({});
  const results = computeTopMoves(s);
  assert.ok(results.length <= 3, `expected at most 3 results, got ${results.length}`);
});

test('3. Results are sorted by score descending', () => {
  const s = gatherStateWithOverrides({});
  const results = computeTopMoves(s, 10);
  for (let i = 1; i < results.length; i++) {
    assert.ok(
      results[i - 1].score >= results[i].score,
      `result ${i - 1} (score ${results[i - 1].score}) should be >= result ${i} (score ${results[i].score})`
    );
  }
});

test('4. Each result has required fields', () => {
  const s = gatherStateWithOverrides({});
  const results = computeTopMoves(s, 10);
  for (const r of results) {
    assert.ok('key' in r, 'missing key');
    assert.ok('label' in r, 'missing label');
    assert.ok('finalBalanceDelta' in r, 'missing finalBalanceDelta');
    assert.ok('runwayDelta' in r, 'missing runwayDelta');
    assert.ok('score' in r, 'missing score');
    assert.ok('baseValue' in r, 'missing baseValue');
    assert.ok('testValue' in r, 'missing testValue');
    assert.ok('delta' in r, 'missing delta');
    assert.ok('unit' in r, 'missing unit');
  }
});

// ════════════════════════════════════════════════════════════════════════
// computeTopMoves — directional correctness
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== computeTopMoves — directional correctness ===');

test('5. Increasing sarahRate produces a positive finalBalanceDelta', () => {
  const s = gatherStateWithOverrides({});
  const results = computeTopMoves(s, 10);
  const rateResult = results.find(r => r.key === 'sarahRate');
  // sarahRate should appear and have positive impact
  assert.ok(rateResult, 'sarahRate should appear in results');
  assert.ok(rateResult.finalBalanceDelta > 0, `expected positive finalBalanceDelta, got ${rateResult.finalBalanceDelta}`);
});

test('6. Results only include improvements (no negative impacts)', () => {
  const s = gatherStateWithOverrides({});
  const results = computeTopMoves(s, 10);
  for (const r of results) {
    const isImprovement = r.finalBalanceDelta > 0 || r.runwayDelta > 0;
    assert.ok(isImprovement, `result ${r.key} should be an improvement: finalBalanceDelta=${r.finalBalanceDelta}, runwayDelta=${r.runwayDelta}`);
  }
});

test('7. Custom topN limits output length', () => {
  const s = gatherStateWithOverrides({});
  const results1 = computeTopMoves(s, 1);
  assert.ok(results1.length <= 1, `expected at most 1 result, got ${results1.length}`);
  const results5 = computeTopMoves(s, 5);
  assert.ok(results5.length <= 5, `expected at most 5 results, got ${results5.length}`);
});

test('8. Reducing baseExpenses produces a positive finalBalanceDelta', () => {
  const s = gatherStateWithOverrides({});
  const results = computeTopMoves(s, 10);
  const expResult = results.find(r => r.key === 'baseExpenses');
  assert.ok(expResult, 'baseExpenses should appear in results');
  assert.ok(expResult.finalBalanceDelta > 0, `expected positive finalBalanceDelta for expense reduction, got ${expResult.finalBalanceDelta}`);
});

// ════════════════════════════════════════════════════════════════════════
// Summary
// ════════════════════════════════════════════════════════════════════════
console.log(`\n${'='.repeat(50)}`);
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'='.repeat(50)}\n`);

if (failed > 0) process.exit(1);
