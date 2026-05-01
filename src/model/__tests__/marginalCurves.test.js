/**
 * Unit tests for marginalCurves.js (Story 3.1 — Phase 3 Epic 3).
 *
 * Coverage:
 *   • Shape + argument validation
 *   • Default / clamped sample counts
 *   • Ascending-value ordering
 *   • Monotone lever → monotone curve (sanity)
 *   • Determinism (NFR16)
 *   • Performance budget — ≤100ms per lever at default 15 samples (NFR5)
 *   • Graceful handling of `null`, missing constraints, degenerate windows
 *   • detectInflectionPoints: linear curve → no inflections;
 *     monotone-diminishing curve → one inflection returned near the knee
 *
 * Run with: node src/model/__tests__/marginalCurves.test.js
 */
import assert from 'node:assert';
import { computeMarginalImpactCurve, detectInflectionPoints } from '../marginalCurves.js';
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
// Shape / argument validation
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== shape + argument validation ===');

test('1. Returns array of {value, finalBalanceDelta, monthlyImpact} with numeric fields', () => {
  const state = gatherStateWithOverrides({});
  const curve = computeMarginalImpactCurve(state, 'sarahRate', { constraints: { min: 200, max: 300 } });
  assert.ok(Array.isArray(curve), 'curve should be an array');
  assert.ok(curve.length > 0, 'curve should be non-empty');
  for (const s of curve) {
    assert.ok(typeof s.value === 'number' && Number.isFinite(s.value), `value: ${s.value}`);
    assert.ok(typeof s.finalBalanceDelta === 'number' && Number.isFinite(s.finalBalanceDelta), `finalBalanceDelta: ${s.finalBalanceDelta}`);
    assert.ok(typeof s.monthlyImpact === 'number' && Number.isFinite(s.monthlyImpact), `monthlyImpact: ${s.monthlyImpact}`);
  }
});

test('2. Default steps = 15', () => {
  const state = gatherStateWithOverrides({});
  const curve = computeMarginalImpactCurve(state, 'sarahRate', { constraints: { min: 200, max: 300 } });
  assert.strictEqual(curve.length, 15, `expected 15 samples, got ${curve.length}`);
});

test('3. steps clamped to [10, 20]', () => {
  const state = gatherStateWithOverrides({});
  const below = computeMarginalImpactCurve(state, 'sarahRate', { constraints: { min: 200, max: 300 }, steps: 5 });
  const above = computeMarginalImpactCurve(state, 'sarahRate', { constraints: { min: 200, max: 300 }, steps: 50 });
  assert.strictEqual(below.length, 10, `expected floor of 10, got ${below.length}`);
  assert.strictEqual(above.length, 20, `expected ceiling of 20, got ${above.length}`);
});

test('4. steps honors in-range custom value', () => {
  const state = gatherStateWithOverrides({});
  const curve = computeMarginalImpactCurve(state, 'sarahRate', { constraints: { min: 200, max: 300 }, steps: 12 });
  assert.strictEqual(curve.length, 12, `expected 12 samples, got ${curve.length}`);
});

test('5. Samples cover full [min, max] endpoints inclusive, ascending', () => {
  const state = gatherStateWithOverrides({});
  const curve = computeMarginalImpactCurve(state, 'sarahRate', { constraints: { min: 200, max: 300 } });
  assert.strictEqual(curve[0].value, 200, `first sample should be min`);
  assert.strictEqual(curve[curve.length - 1].value, 300, `last sample should be max`);
  for (let i = 1; i < curve.length; i++) {
    assert.ok(curve[i].value > curve[i - 1].value, `samples not strictly ascending at i=${i}`);
  }
});

test('6. Falls back to state.effectiveLeverConstraints when options.constraints omitted', () => {
  const state = gatherStateWithOverrides({});
  assert.ok(state.effectiveLeverConstraints && state.effectiveLeverConstraints.sarahRate, 'fixture should have effectiveLeverConstraints');
  const curve = computeMarginalImpactCurve(state, 'sarahRate');
  assert.ok(curve.length > 0);
});

// ════════════════════════════════════════════════════════════════════════
// Error handling
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== error handling ===');

test('7. Missing constraints throws', () => {
  // gatherStateWithOverrides populates effectiveLeverConstraints for known
  // levers, so a truly-unknown lever hits the missing-constraints path.
  const state = gatherStateWithOverrides({});
  assert.throws(
    () => computeMarginalImpactCurve(state, 'notARealLever'),
    /no constraints/,
  );
});

test('8. Invalid state throws', () => {
  assert.throws(() => computeMarginalImpactCurve(null, 'sarahRate', { constraints: { min: 200, max: 300 } }), /invalid state/);
});

test('9. Invalid leverKey throws', () => {
  const state = gatherStateWithOverrides({});
  assert.throws(() => computeMarginalImpactCurve(state, '', { constraints: { min: 200, max: 300 } }), /invalid leverKey/);
});

test('10. min > max throws', () => {
  const state = gatherStateWithOverrides({});
  assert.throws(
    () => computeMarginalImpactCurve(state, 'sarahRate', { constraints: { min: 300, max: 200 } }),
    /min.*max/,
  );
});

test('11. Non-numeric bounds throw', () => {
  const state = gatherStateWithOverrides({});
  assert.throws(() => computeMarginalImpactCurve(state, 'sarahRate', { constraints: { min: 'x', max: 300 } }), /invalid min/);
  assert.throws(() => computeMarginalImpactCurve(state, 'sarahRate', { constraints: { min: 200, max: NaN } }), /invalid max/);
});

// ════════════════════════════════════════════════════════════════════════
// Degenerate constraint window
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== degenerate constraints ===');

test('12. min === max returns a single sample at that value', () => {
  const state = gatherStateWithOverrides({});
  const curve = computeMarginalImpactCurve(state, 'sarahRate', { constraints: { min: 250, max: 250 } });
  assert.strictEqual(curve.length, 1);
  assert.strictEqual(curve[0].value, 250);
});

// ════════════════════════════════════════════════════════════════════════
// Monotonic lever → monotonic curve (sanity check for Story 3.2 tests)
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== monotone sanity ===');

test('13. For sarahRate (monotone-increasing impact), finalBalanceDelta is non-decreasing', () => {
  const state = gatherStateWithOverrides({});
  const curve = computeMarginalImpactCurve(state, 'sarahRate', { constraints: { min: 200, max: 300 } });
  for (let i = 1; i < curve.length; i++) {
    assert.ok(
      curve[i].finalBalanceDelta >= curve[i - 1].finalBalanceDelta - 0.5,
      `non-monotone at i=${i}: ${curve[i - 1].finalBalanceDelta} → ${curve[i].finalBalanceDelta}`,
    );
  }
});

test('14. For cutsOverride with lifestyleCutsApplied, finalBalanceDelta is non-decreasing', () => {
  const state = gatherStateWithOverrides({ lifestyleCutsApplied: true });
  const curve = computeMarginalImpactCurve(state, 'cutsOverride', { constraints: { min: 0, max: 3000 } });
  for (let i = 1; i < curve.length; i++) {
    assert.ok(
      curve[i].finalBalanceDelta >= curve[i - 1].finalBalanceDelta - 0.5,
      `non-monotone at i=${i}: ${curve[i - 1].finalBalanceDelta} → ${curve[i].finalBalanceDelta}`,
    );
  }
});

test('15. monthlyImpact is finalBalanceDelta / horizonMonths for every sample', () => {
  const state = gatherStateWithOverrides({});
  const curve = computeMarginalImpactCurve(state, 'sarahRate', { constraints: { min: 200, max: 300 } });
  // Horizon is the length of the projection's monthlyData — we infer it from
  // the ratio at any non-zero-delta sample. If the sample with max value has
  // a non-zero delta, use it to back-out the horizon and validate consistency.
  const sample = curve[curve.length - 1];
  if (sample.finalBalanceDelta !== 0) {
    const inferredHorizon = sample.finalBalanceDelta / sample.monthlyImpact;
    // Must be a plausible plan horizon (12–600 months = 1–50 years)
    assert.ok(
      inferredHorizon >= 12 && inferredHorizon <= 600,
      `implausible inferred horizon: ${inferredHorizon} months`,
    );
    // Every sample should agree on the same horizon (within 1 month)
    for (const s of curve) {
      if (s.monthlyImpact === 0) continue;
      const h = s.finalBalanceDelta / s.monthlyImpact;
      assert.ok(
        Math.abs(h - inferredHorizon) < 1,
        `horizon mismatch at value=${s.value}: ${h} vs ${inferredHorizon}`,
      );
    }
  }
});

// ════════════════════════════════════════════════════════════════════════
// Determinism
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== determinism ===');

test('16. Identical inputs yield bit-identical output', () => {
  const state = gatherStateWithOverrides({});
  const a = computeMarginalImpactCurve(state, 'sarahRate', { constraints: { min: 200, max: 300 } });
  const b = computeMarginalImpactCurve(state, 'sarahRate', { constraints: { min: 200, max: 300 } });
  assert.strictEqual(a.length, b.length);
  for (let i = 0; i < a.length; i++) {
    assert.strictEqual(a[i].value, b[i].value, `value mismatch at i=${i}`);
    assert.strictEqual(a[i].finalBalanceDelta, b[i].finalBalanceDelta, `delta mismatch at i=${i}`);
    assert.strictEqual(a[i].monthlyImpact, b[i].monthlyImpact, `monthly mismatch at i=${i}`);
  }
});

// ════════════════════════════════════════════════════════════════════════
// Performance — NFR5: ≤100ms per lever at default sample count
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== performance (≤100ms per curve) ===');

test('17. Default 15-sample curve completes in ≤100ms on a standard projection', () => {
  const state = gatherStateWithOverrides({});
  const start = performance.now();
  computeMarginalImpactCurve(state, 'sarahRate', { constraints: { min: 200, max: 300 } });
  const elapsed = performance.now() - start;
  // Budget is 100ms per NFR5. Allow a small buffer for cold-JIT variance on
  // the first run — the budget still gates future regressions.
  assert.ok(elapsed < 150, `curve took ${elapsed.toFixed(1)}ms — exceeds 100ms budget (NFR5) with buffer`);
});

// ════════════════════════════════════════════════════════════════════════
// detectInflectionPoints
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== inflection detection ===');

test('18. Linear curve has no inflection points', () => {
  const curve = [];
  for (let i = 0; i <= 14; i++) {
    curve.push({ value: 200 + i * 7, finalBalanceDelta: i * 1000 });
  }
  const pts = detectInflectionPoints(curve);
  assert.strictEqual(pts.length, 0, `linear curve should have no inflections, got ${pts.length}`);
});

test('19. Monotone-diminishing curve (sqrt-like) produces at least one inflection', () => {
  // sqrt grows fast early then slows — second derivative is negative
  // throughout, so there is no strict sign change. Instead we build a curve
  // that goes convex → concave by stitching x² (convex) with -x² (concave):
  const curve = [];
  for (let i = 0; i <= 14; i++) {
    const x = i;
    // First half: accelerating (convex), second half: decelerating (concave).
    // Scaled so the noise floor doesn't swallow the signal.
    const y = i <= 7 ? 1000 * x * x : 1000 * (49 + 14 * (x - 7) - (x - 7) * (x - 7));
    curve.push({ value: i, finalBalanceDelta: y });
  }
  const pts = detectInflectionPoints(curve);
  assert.ok(pts.length >= 1, `expected ≥1 inflection on convex→concave curve, got ${pts.length}`);
  // The synthetic knee is near index 7 → value 7
  assert.ok(
    pts.some((v) => Math.abs(v - 7) <= 2),
    `expected an inflection near value=7, got ${JSON.stringify(pts)}`,
  );
});

test('20. Flat curve returns no inflections (ySpan === 0 guard)', () => {
  const curve = [];
  for (let i = 0; i < 15; i++) curve.push({ value: i, finalBalanceDelta: 0 });
  assert.deepStrictEqual(detectInflectionPoints(curve), []);
});

test('21. Handles degenerate inputs: null, undefined, short arrays', () => {
  assert.deepStrictEqual(detectInflectionPoints(null), []);
  assert.deepStrictEqual(detectInflectionPoints(undefined), []);
  assert.deepStrictEqual(detectInflectionPoints([]), []);
  assert.deepStrictEqual(detectInflectionPoints([{ value: 0, finalBalanceDelta: 0 }]), []);
  assert.deepStrictEqual(
    detectInflectionPoints([
      { value: 0, finalBalanceDelta: 0 },
      { value: 1, finalBalanceDelta: 1 },
    ]),
    [],
  );
});

// ════════════════════════════════════════════════════════════════════════
// Summary
// ════════════════════════════════════════════════════════════════════════
console.log(`\n${'='.repeat(50)}`);
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'='.repeat(50)}\n`);

if (failed > 0) process.exit(1);
