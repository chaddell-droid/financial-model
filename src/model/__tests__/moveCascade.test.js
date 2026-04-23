/**
 * Unit tests for moveCascade.js (computeMoveCascade — greedy cascade engine).
 * Run with: node src/model/__tests__/moveCascade.test.js
 */
import assert from 'node:assert';
import { computeMoveCascade } from '../moveCascade.js';
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

const REQUIRED_FIELDS = [
  'id',
  'label',
  'mutation',
  'monthlyImpact',
  'cumulativeMonthlyImpact',
  'finalBalanceDelta',
  'cumulativeFinalBalanceDelta',
  'breakevenMonthDelta',
  'cumulativeBreakevenMonthDelta',
];

// ════════════════════════════════════════════════════════════════════════
// Shape + basic contract
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== computeMoveCascade — shape and contract ===');

test('1. Returns an array', () => {
  const s = gatherStateWithOverrides({});
  const result = computeMoveCascade(s);
  assert.ok(Array.isArray(result), 'should return an array');
});

test('2. Returns at most N rungs (default 3)', () => {
  const s = gatherStateWithOverrides({});
  const result = computeMoveCascade(s);
  assert.ok(result.length <= 3, `expected at most 3 rungs, got ${result.length}`);
});

test('3. Custom N caps output length', () => {
  const s = gatherStateWithOverrides({});
  const r1 = computeMoveCascade(s, 1);
  assert.ok(r1.length <= 1, `expected at most 1, got ${r1.length}`);
  const r5 = computeMoveCascade(s, 5);
  assert.ok(r5.length <= 5, `expected at most 5, got ${r5.length}`);
});

test('4. Each rung has all required fields', () => {
  const s = gatherStateWithOverrides({});
  const result = computeMoveCascade(s, 5);
  assert.ok(result.length > 0, 'precondition: baseline should produce at least one rung');
  for (const rung of result) {
    for (const field of REQUIRED_FIELDS) {
      assert.ok(field in rung, `rung ${rung.id ?? '?'} missing field: ${field}`);
    }
    assert.ok(typeof rung.id === 'string', 'id should be a string');
    assert.ok(typeof rung.label === 'string', 'label should be a string');
    assert.ok(rung.mutation && typeof rung.mutation === 'object', 'mutation should be an object');
  }
});

test('5. Returns empty array when count <= 0 or baseState is missing', () => {
  const s = gatherStateWithOverrides({});
  assert.deepStrictEqual(computeMoveCascade(s, 0), [], 'count=0 should return []');
  assert.deepStrictEqual(computeMoveCascade(s, -1), [], 'negative count should return []');
  assert.deepStrictEqual(computeMoveCascade(null, 3), [], 'null state should return []');
});

// ════════════════════════════════════════════════════════════════════════
// Greedy correctness invariant (final balance monotonic on realistic state)
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== greedy correctness ===');

test('6. cumulativeFinalBalanceDelta is monotonically non-decreasing (solvent baseline)', () => {
  // Use a solvent baseline (high starting savings) so every lever's marginal
  // contribution shows up in the final balance rather than being absorbed by
  // the insolvency floor at 0. With Chad's actual default state the plan is
  // insolvent at horizon end, which compresses the signal for secondary rungs
  // onto the breakeven axis — correct behavior, but not ideal for testing the
  // final-balance monotonicity invariant.
  const s = gatherStateWithOverrides({ startingSavings: 2000000, investmentReturn: 6 });
  const result = computeMoveCascade(s, 5);
  assert.ok(result.length >= 2, `precondition: need at least 2 rungs; got ${result.length} — ids: ${result.map(r => r.id).join(',')}`);
  for (let k = 1; k < result.length; k++) {
    assert.ok(
      result[k].cumulativeFinalBalanceDelta >= result[k - 1].cumulativeFinalBalanceDelta,
      `rung ${k} cumulative (${result[k].cumulativeFinalBalanceDelta}) should be >= rung ${k - 1} cumulative (${result[k - 1].cumulativeFinalBalanceDelta})`
    );
  }
});

test('7. cumulativeMonthlyImpact is strictly non-decreasing', () => {
  const s = gatherStateWithOverrides({ startingSavings: 2000000, investmentReturn: 6 });
  const result = computeMoveCascade(s, 5);
  assert.ok(result.length >= 2, 'precondition: need multi-rung cascade for this test');
  for (let k = 1; k < result.length; k++) {
    assert.ok(
      result[k].cumulativeMonthlyImpact >= result[k - 1].cumulativeMonthlyImpact,
      `rung ${k} cumulativeMonthlyImpact should be >= previous rung`
    );
  }
});

test('8. No duplicate ids across rungs', () => {
  const s = gatherStateWithOverrides({ startingSavings: 2000000, investmentReturn: 6 });
  const result = computeMoveCascade(s, 10);
  assert.ok(result.length >= 2, 'precondition: need multi-rung cascade');
  const seen = new Set();
  for (const rung of result) {
    assert.ok(!seen.has(rung.id), `duplicate rung id: ${rung.id}`);
    seen.add(rung.id);
  }
});

// ════════════════════════════════════════════════════════════════════════
// Empty-output cases
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== empty output ===');

test('9. Fully-leveraged state returns empty cascade', () => {
  // Mirror the "fully leveraged" scenario from sensitivityAnalysis.test.js
  const s = gatherStateWithOverrides({
    retireDebt: true,
    lifestyleCutsApplied: true,
    cutsOverride: 1000,
    vanSold: true,
    bcsAnnualTotal: 43400,
    bcsParentsAnnual: 43400,
    customLevers: [],
  });
  const result = computeMoveCascade(s, 5);
  assert.strictEqual(result.length, 0, `expected 0 rungs when all levers active, got ${result.length}`);
});

// ════════════════════════════════════════════════════════════════════════
// Determinism
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== determinism ===');

test('10. Two calls with the same input produce identical output', () => {
  const s = gatherStateWithOverrides({});
  const a = computeMoveCascade(s, 5);
  const b = computeMoveCascade(s, 5);
  assert.strictEqual(a.length, b.length, 'length mismatch');
  for (let i = 0; i < a.length; i++) {
    assert.strictEqual(a[i].id, b[i].id, `rung ${i} id differs: ${a[i].id} vs ${b[i].id}`);
    assert.strictEqual(
      a[i].cumulativeFinalBalanceDelta,
      b[i].cumulativeFinalBalanceDelta,
      `rung ${i} cumulative delta differs`
    );
    assert.strictEqual(
      a[i].finalBalanceDelta,
      b[i].finalBalanceDelta,
      `rung ${i} standalone delta differs`
    );
    assert.strictEqual(
      a[i].cumulativeMonthlyImpact,
      b[i].cumulativeMonthlyImpact,
      `rung ${i} cumulative monthly differs`
    );
  }
});

// ════════════════════════════════════════════════════════════════════════
// First-rung self-check (standalone === cumulative for rung 0)
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== first-rung self-check ===');

test('11. For rung 0, cumulative === standalone on all three axes', () => {
  const s = gatherStateWithOverrides({});
  const result = computeMoveCascade(s, 3);
  assert.ok(result.length >= 1, 'precondition: need at least one rung');
  const r0 = result[0];
  assert.strictEqual(
    r0.cumulativeMonthlyImpact,
    r0.monthlyImpact,
    `rung 0 cumulativeMonthlyImpact (${r0.cumulativeMonthlyImpact}) should equal monthlyImpact (${r0.monthlyImpact})`
  );
  assert.strictEqual(
    r0.cumulativeFinalBalanceDelta,
    r0.finalBalanceDelta,
    `rung 0 cumulativeFinalBalanceDelta (${r0.cumulativeFinalBalanceDelta}) should equal finalBalanceDelta (${r0.finalBalanceDelta})`
  );
  assert.strictEqual(
    r0.cumulativeBreakevenMonthDelta,
    r0.breakevenMonthDelta,
    `rung 0 cumulativeBreakevenMonthDelta should equal breakevenMonthDelta`
  );
});

// ════════════════════════════════════════════════════════════════════════
// Mutation integrity (preserved for later APPLY_PREVIEW_MOVE dispatch)
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== mutation integrity ===');

test('12. Each rung preserves a non-empty mutation object', () => {
  const s = gatherStateWithOverrides({});
  const result = computeMoveCascade(s, 5);
  for (const rung of result) {
    assert.ok(
      rung.mutation && Object.keys(rung.mutation).length > 0,
      `rung ${rung.id} has empty or missing mutation`
    );
  }
});

test('13. Lever activations produce known mutation keys', () => {
  const s = gatherStateWithOverrides({});
  const result = computeMoveCascade(s, 10);
  // Each selected rung must be one of the buildLeverCandidates outputs
  const knownIds = new Set(['retire_debt', 'spending_cuts', 'sell_van', 'bcs_fully_covered']);
  for (const rung of result) {
    const isKnown = knownIds.has(rung.id) || rung.id.startsWith('custom:');
    assert.ok(isKnown, `unknown rung id: ${rung.id}`);
  }
});

// ════════════════════════════════════════════════════════════════════════
// Cascade vs single-move comparison (sanity check that cascade outperforms
// a naive top-3 independent ranking when moves compound)
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== cascade vs single-move sanity ===');

test('14. Applying all cascade mutations yields the engine-claimed cumulative delta', () => {
  // Verifies the cascade's cumulative claim is achievable: if we manually apply
  // every rung's mutation through gatherState, the resulting projection should
  // have finalBalance = baseline + lastRung.cumulativeFinalBalanceDelta.
  const s = gatherStateWithOverrides({});
  const result = computeMoveCascade(s, 5);
  if (result.length === 0) return; // no cascade, nothing to verify

  const baselineProj = computeProjection(s);
  const baselineFinal = baselineProj.monthlyData[baselineProj.monthlyData.length - 1].balance;

  let composed = s;
  for (const rung of result) {
    composed = gatherState({ ...composed, ...rung.mutation });
  }
  const composedProj = computeProjection(composed);
  const composedFinal = composedProj.monthlyData[composedProj.monthlyData.length - 1].balance;
  const actualCumDelta = Math.round(composedFinal - baselineFinal);
  const claimedCumDelta = result[result.length - 1].cumulativeFinalBalanceDelta;

  assert.strictEqual(
    actualCumDelta,
    claimedCumDelta,
    `applying all mutations yields ${actualCumDelta}, but engine claims ${claimedCumDelta}`
  );
});

// ════════════════════════════════════════════════════════════════════════
// Summary
// ════════════════════════════════════════════════════════════════════════
console.log(`\n${'='.repeat(50)}`);
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'='.repeat(50)}\n`);

if (failed > 0) process.exit(1);
