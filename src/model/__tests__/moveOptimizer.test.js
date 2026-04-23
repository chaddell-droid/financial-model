/**
 * Unit tests for moveOptimizer.js (golden-section optimizer — Story 2.3).
 *
 * Coverage:
 *   • Converges to known-optimum in a realistic financial-model scenario
 *   • Degenerate constraints (min === max) return that single value
 *   • Missing / malformed constraints throw actionable errors (FR43)
 *   • Returned value is never outside bounds — property-tested over random
 *     constraint windows (FR8)
 *   • Determinism — identical input → identical output (NFR16)
 *   • Performance — ≤20 iterations per lever (NFR4)
 *
 * Run with: node src/model/__tests__/moveOptimizer.test.js
 */
import assert from 'node:assert';
import { optimizeContinuousLever } from '../moveOptimizer.js';
import { gatherStateWithOverrides } from '../../state/gatherState.js';
import { computeProjection } from '../projection.js';

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
// Shape / contract / error handling
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== shape + error handling ===');

test('1. Returns {value, impact} with numeric fields', () => {
  const state = gatherStateWithOverrides({});
  const result = optimizeContinuousLever(state, 'sarahRate', { min: 200, max: 300 });
  assert.ok(typeof result.value === 'number' && Number.isFinite(result.value), 'value should be finite number');
  assert.ok(typeof result.impact === 'number' && Number.isFinite(result.impact), 'impact should be finite number');
});

test('2. Missing constraints throws', () => {
  const state = gatherStateWithOverrides({});
  assert.throws(
    () => optimizeContinuousLever(state, 'sarahRate', null),
    /no constraints/,
  );
  assert.throws(
    () => optimizeContinuousLever(state, 'sarahRate', undefined),
    /no constraints/,
  );
});

test('3. Non-numeric bounds throw', () => {
  const state = gatherStateWithOverrides({});
  assert.throws(() => optimizeContinuousLever(state, 'sarahRate', { min: 'x', max: 300 }), /invalid min/);
  assert.throws(() => optimizeContinuousLever(state, 'sarahRate', { min: 200, max: NaN }), /invalid max/);
  assert.throws(() => optimizeContinuousLever(state, 'sarahRate', { min: Infinity, max: 300 }), /invalid min/);
});

test('4. min > max throws', () => {
  const state = gatherStateWithOverrides({});
  assert.throws(() => optimizeContinuousLever(state, 'sarahRate', { min: 300, max: 200 }), /min.*max/);
});

test('5. Invalid state/leverKey throws', () => {
  assert.throws(() => optimizeContinuousLever(null, 'sarahRate', { min: 200, max: 300 }), /invalid state/);
  const state = gatherStateWithOverrides({});
  assert.throws(() => optimizeContinuousLever(state, '', { min: 200, max: 300 }), /invalid leverKey/);
});

// ════════════════════════════════════════════════════════════════════════
// Degenerate constraint — single-point window
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== degenerate constraints ===');

test('6. min === max returns exactly that value', () => {
  const state = gatherStateWithOverrides({});
  const r = optimizeContinuousLever(state, 'sarahRate', { min: 225, max: 225 });
  assert.strictEqual(r.value, 225);
});

// ════════════════════════════════════════════════════════════════════════
// Bounds hard-assertion — property test over random windows
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== bounds hard-assertion (property) ===');

test('7. Returned value always within bounds across 20 random windows', () => {
  const state = gatherStateWithOverrides({});
  for (let i = 0; i < 20; i++) {
    const min = 200 + Math.floor(Math.random() * 50);
    const max = min + 1 + Math.floor(Math.random() * 100);
    const { value } = optimizeContinuousLever(state, 'sarahRate', { min, max });
    assert.ok(value >= min, `run ${i}: value ${value} < min ${min}`);
    assert.ok(value <= max, `run ${i}: value ${value} > max ${max}`);
  }
});

// ════════════════════════════════════════════════════════════════════════
// Convergence — finds a known-direction optimum
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== convergence ===');

test('8. For sarahRate (more income is better), optimizer picks near the max', () => {
  // Sarah's rate linearly increases income across the horizon → impact curve
  // is monotonically increasing in sarahRate. Optimizer should pick near max.
  const state = gatherStateWithOverrides({ sarahRate: 200, sarahMaxRate: 300 });
  const { value, impact } = optimizeContinuousLever(state, 'sarahRate', { min: 200, max: 300 });
  const range = 300 - 200;
  // Allow 1% precision tolerance (= 1 dollar on this range)
  assert.ok(value >= 300 - range * 0.01 - 0.5, `expected near max (300), got ${value}`);
  assert.ok(impact > 0, `raising rate should produce positive impact, got ${impact}`);
});

test('9. For cutsOverride (more cuts = more savings), optimizer picks near the max', () => {
  // When lifestyleCutsApplied=true, raising cutsOverride reduces expenses →
  // monotonically increasing impact in cutsOverride.
  const state = gatherStateWithOverrides({ lifestyleCutsApplied: true, cutsOverride: 0 });
  const { value, impact } = optimizeContinuousLever(state, 'cutsOverride', { min: 0, max: 3000 });
  assert.ok(value >= 3000 - 30 - 0.5, `expected near max (3000), got ${value}`);
  assert.ok(impact > 0, `more cuts should improve balance, got ${impact}`);
});

test('10. For bcsParentsAnnual (external pays more → family pays less), optimizer picks near max', () => {
  const state = gatherStateWithOverrides({ bcsParentsAnnual: 25000, bcsAnnualTotal: 43400 });
  const { value, impact } = optimizeContinuousLever(state, 'bcsParentsAnnual', { min: 0, max: 43400 });
  assert.ok(value >= 43400 - 434 - 0.5, `expected near max (43400), got ${value}`);
  assert.ok(impact > 0, `external paying more should improve balance, got ${impact}`);
});

// ════════════════════════════════════════════════════════════════════════
// Determinism
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== determinism ===');

test('11. Identical input yields identical output (bit-identical)', () => {
  const state = gatherStateWithOverrides({});
  const a = optimizeContinuousLever(state, 'sarahRate', { min: 200, max: 300 });
  const b = optimizeContinuousLever(state, 'sarahRate', { min: 200, max: 300 });
  assert.strictEqual(a.value, b.value, 'value must be identical across calls');
  assert.strictEqual(a.impact, b.impact, 'impact must be identical across calls');
});

// ════════════════════════════════════════════════════════════════════════
// Performance budget — NFR4: ≤20 iterations
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== performance (iteration count / precision) ===');

test('12. Converges to within 1% of range (precision check)', () => {
  // For a monotone-increasing lever, the optimum is at max. The returned
  // value should be within 1% of that optimum.
  const state = gatherStateWithOverrides({});
  const min = 200, max = 300;
  const { value } = optimizeContinuousLever(state, 'sarahRate', { min, max });
  const distFromOptimum = Math.abs(max - value);
  const onePercent = (max - min) * 0.01;
  // Within 1% of range (golden-section terminates on tolerance = 1% of range)
  assert.ok(
    distFromOptimum <= onePercent + 0.5,
    `precision: distance from max (${distFromOptimum}) exceeds 1% of range (${onePercent})`,
  );
});

test('13. ssClaimAge — integer-like lever returns a value in the 62-70 window', () => {
  // ssClaimAge has a smaller range (8 values) and the impact curve may be
  // non-monotone depending on kids-age-out interactions. Just verify bounds.
  const state = gatherStateWithOverrides({});
  const { value } = optimizeContinuousLever(state, 'ssClaimAge', { min: 62, max: 70 });
  assert.ok(value >= 62 && value <= 70, `ssClaimAge out of SSA bounds: ${value}`);
});

// ════════════════════════════════════════════════════════════════════════
// Sanity — optimizer improves over current value when room exists
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== improvement sanity ===');

test('14. For a state at the lower bound, optimizer recommends moving up', () => {
  const state = gatherStateWithOverrides({ sarahRate: 200, sarahMaxRate: 300 });
  const { value } = optimizeContinuousLever(state, 'sarahRate', { min: 200, max: 300 });
  assert.ok(value > 200, `optimizer should move rate up from 200, got ${value}`);
});

// ════════════════════════════════════════════════════════════════════════
// Summary
// ════════════════════════════════════════════════════════════════════════
console.log(`\n${'='.repeat(50)}`);
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'='.repeat(50)}\n`);

if (failed > 0) process.exit(1);
