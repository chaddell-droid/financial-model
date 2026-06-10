// Phase-0 remediation (2026-06-10, item 0.4 / improvement b-5): tests for the
// shared interpolated percentile utility. Phase 4 (C15) adopts it at the
// monteCarlo / useRetirementSimulation / retirementParams call sites.
import assert from 'node:assert';
import { interpolatedPercentile } from '../percentile.js';
import { getDistributionPercentile } from '../pwaDistribution.js';

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

console.log('\n=== interpolatedPercentile (Phase 0) ===');

test('PCT-1. empty / missing input returns 0', () => {
  assert.strictEqual(interpolatedPercentile([], 50), 0);
  assert.strictEqual(interpolatedPercentile(null, 50), 0);
  assert.strictEqual(interpolatedPercentile(undefined, 50), 0);
});

test('PCT-2. single element returns that element for any percentile', () => {
  assert.strictEqual(interpolatedPercentile([42], 0), 42);
  assert.strictEqual(interpolatedPercentile([42], 50), 42);
  assert.strictEqual(interpolatedPercentile([42], 100), 42);
});

test('PCT-3. exact ranks: min at p=0, max at p=100, median of odd-length array', () => {
  const v = [10, 20, 30, 40, 50];
  assert.strictEqual(interpolatedPercentile(v, 0), 10);
  assert.strictEqual(interpolatedPercentile(v, 100), 50);
  assert.strictEqual(interpolatedPercentile(v, 50), 30);
  assert.strictEqual(interpolatedPercentile(v, 25), 20);
});

test('PCT-4. interpolates between ranks (even-length median, quartiles)', () => {
  assert.strictEqual(interpolatedPercentile([10, 20], 50), 15);
  assert.strictEqual(interpolatedPercentile([0, 100], 25), 25);
  // [10,20,30,40]: p50 → position 1.5 → 25; p10 → position 0.3 → 13
  assert.strictEqual(interpolatedPercentile([10, 20, 30, 40], 50), 25);
  assert.ok(Math.abs(interpolatedPercentile([10, 20, 30, 40], 10) - 13) < 1e-9);
});

test('PCT-5. clamps out-of-range and defaults non-finite percentile to 50', () => {
  const v = [1, 2, 3];
  assert.strictEqual(interpolatedPercentile(v, -10), 1);
  assert.strictEqual(interpolatedPercentile(v, 250), 3);
  assert.strictEqual(interpolatedPercentile(v, NaN), 2);
  assert.strictEqual(interpolatedPercentile(v, undefined), 2);
});

test('PCT-6. unsorted input is sorted internally WITHOUT mutating the caller', () => {
  const v = [50, 10, 40, 20, 30];
  assert.strictEqual(interpolatedPercentile(v, 50), 30);
  assert.deepStrictEqual(v, [50, 10, 40, 20, 30], 'input array must not be mutated');
});

test('PCT-7. sorted:true fast path matches the default path and skips the copy', () => {
  const sorted = Float64Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  for (const p of [0, 10, 33, 50, 75, 90, 100]) {
    assert.strictEqual(
      interpolatedPercentile(sorted, p, { sorted: true }),
      interpolatedPercentile(Array.from(sorted), p),
      `p=${p}`,
    );
  }
});

test('PCT-8. typed-array input (Float64Array) works on both paths', () => {
  const v = Float64Array.from([30, 10, 20]);
  assert.strictEqual(interpolatedPercentile(v, 50), 20);
  assert.deepStrictEqual(Array.from(v), [30, 10, 20], 'typed input not mutated');
});

test('PCT-9. parity with pwaDistribution.getDistributionPercentile (same definition)', () => {
  // Deterministic pseudo-random sample (LCG) — no Math.random in tests.
  let seed = 123456789;
  const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const sample = Array.from({ length: 257 }, () => next() * 1e6 - 2e5);
  const sorted = Float64Array.from(sample);
  sorted.sort();
  for (const p of [0, 5, 10, 25, 50, 75, 90, 95, 100, 33.3]) {
    const a = interpolatedPercentile(sample, p);
    const b = getDistributionPercentile(sorted, p);
    assert.ok(Math.abs(a - b) < 1e-9, `p=${p}: ${a} !== ${b}`);
  }
});

test('PCT-10. negative values and duplicates', () => {
  assert.strictEqual(interpolatedPercentile([-30, -10, -20], 50), -20);
  assert.strictEqual(interpolatedPercentile([5, 5, 5, 5], 37), 5);
});

console.log(`\n${'='.repeat(50)}`);
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'='.repeat(50)}\n`);

if (failed > 0) process.exit(1);
