/**
 * Unit tests for scenarioProvenance.js
 *   • withProvenance — default-applied, idempotent, safe on malformed input
 *   • withProvenanceAll — array mapping, non-array inputs
 *   • buildRecommendationProvenance — shape, baseline handling, moves filtering
 *   • isRecommendationSourced — predicate on scenario objects
 *   • Round-trip: load legacy → default applied → save → reload returns identical
 *
 * Run with: node src/state/__tests__/scenarioProvenance.test.js
 */
import assert from 'node:assert';
import {
  DEFAULT_PROVENANCE,
  withProvenance,
  withProvenanceAll,
  buildRecommendationProvenance,
  isRecommendationSourced,
} from '../scenarioProvenance.js';

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
// DEFAULT_PROVENANCE
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== DEFAULT_PROVENANCE ===');

test('1. DEFAULT_PROVENANCE has expected shape', () => {
  assert.strictEqual(DEFAULT_PROVENANCE.source, 'manual');
  assert.strictEqual(DEFAULT_PROVENANCE.baseline, null);
  assert.strictEqual(DEFAULT_PROVENANCE.moves, null);
});

test('2. DEFAULT_PROVENANCE is frozen (immutable)', () => {
  assert.throws(() => { DEFAULT_PROVENANCE.source = 'mutated'; }, TypeError);
});

// ════════════════════════════════════════════════════════════════════════
// withProvenance — default-applied, idempotent
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== withProvenance ===');

test('3. Legacy scenario (no provenance) gets default provenance added', () => {
  const legacy = { name: 'Old', state: { a: 1 }, schemaVersion: 5, savedAt: '2025-01-01' };
  const result = withProvenance(legacy);
  assert.deepStrictEqual(result.provenance, { source: 'manual', baseline: null, moves: null });
  // Original preserved
  assert.strictEqual(result.name, 'Old');
  assert.strictEqual(result.schemaVersion, 5);
});

test('4. Already-valid scenario returned unchanged (idempotent, reference-equal)', () => {
  const scenario = {
    name: 'With provenance',
    state: {},
    provenance: { source: 'manual', baseline: null, moves: null },
  };
  const result = withProvenance(scenario);
  assert.strictEqual(result, scenario, 'valid scenario should be returned by reference');
});

test('5. Recommendation-sourced scenario passes through unchanged', () => {
  const scenario = {
    name: 'From recs',
    state: {},
    provenance: {
      source: 'recommendations',
      baseline: 'Baseline',
      moves: [{ id: 'retire_debt', label: 'Retire all debt', mutation: { retireDebt: true } }],
    },
  };
  const result = withProvenance(scenario);
  assert.strictEqual(result, scenario);
});

test('6. Malformed provenance (bad source enum) gets default applied', () => {
  const bad = { name: 'x', provenance: { source: 'bogus', baseline: null, moves: null } };
  const result = withProvenance(bad);
  assert.strictEqual(result.provenance.source, 'manual');
});

test('7. Malformed provenance (non-object) gets default applied', () => {
  const bad = { name: 'x', provenance: 'not an object' };
  const result = withProvenance(bad);
  assert.strictEqual(result.provenance.source, 'manual');
});

test('8. Null/undefined scenario returns input unchanged', () => {
  assert.strictEqual(withProvenance(null), null);
  assert.strictEqual(withProvenance(undefined), undefined);
});

test('9. Double-apply is idempotent', () => {
  const legacy = { name: 'Old' };
  const once = withProvenance(legacy);
  const twice = withProvenance(once);
  assert.strictEqual(twice, once, 'second call must be no-op (reference equal)');
});

// ════════════════════════════════════════════════════════════════════════
// withProvenanceAll
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== withProvenanceAll ===');

test('10. Array of legacy scenarios all get default provenance', () => {
  const arr = [{ name: 'A' }, { name: 'B' }];
  const result = withProvenanceAll(arr);
  assert.strictEqual(result.length, 2);
  for (const s of result) assert.strictEqual(s.provenance.source, 'manual');
});

test('11. Non-array input returns empty array', () => {
  assert.deepStrictEqual(withProvenanceAll(null), []);
  assert.deepStrictEqual(withProvenanceAll(undefined), []);
  assert.deepStrictEqual(withProvenanceAll('not an array'), []);
});

// ════════════════════════════════════════════════════════════════════════
// buildRecommendationProvenance
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== buildRecommendationProvenance ===');

test('12. Builds a valid recommendation provenance from moves', () => {
  const moves = [
    { id: 'retire_debt', label: 'Retire all debt', mutation: { retireDebt: true } },
    { id: 'sell_van', label: 'Sell the van', mutation: { vanSold: true, vanSaleMonth: 12 } },
  ];
  const p = buildRecommendationProvenance('Baseline', moves);
  assert.strictEqual(p.source, 'recommendations');
  assert.strictEqual(p.baseline, 'Baseline');
  assert.strictEqual(p.moves.length, 2);
  assert.strictEqual(p.moves[0].id, 'retire_debt');
  assert.strictEqual(p.moves[1].mutation.vanSold, true);
});

test('13. Null baseline is preserved as null (preview from root baseline)', () => {
  const p = buildRecommendationProvenance(null, []);
  assert.strictEqual(p.baseline, null);
  assert.deepStrictEqual(p.moves, []);
});

test('14. Invalid baseline type coerces to null', () => {
  const p = buildRecommendationProvenance(42, []);
  assert.strictEqual(p.baseline, null);
});

test('15. Malformed moves are filtered out', () => {
  const moves = [
    null,
    { id: 'x' }, // missing mutation
    { mutation: {} }, // missing id
    { id: 'ok', mutation: { a: 1 } }, // valid
    'not an object',
  ];
  const p = buildRecommendationProvenance(null, moves);
  assert.strictEqual(p.moves.length, 1);
  assert.strictEqual(p.moves[0].id, 'ok');
});

test('16. Move mutation is deep-copied (not held by reference)', () => {
  const original = { a: 1 };
  const moves = [{ id: 'x', label: 'X', mutation: original }];
  const p = buildRecommendationProvenance(null, moves);
  original.a = 999;
  assert.strictEqual(p.moves[0].mutation.a, 1, 'stored mutation should be a copy');
});

test('17. Label defaults to id when missing', () => {
  const moves = [{ id: 'fallback_id', mutation: {} }];
  const p = buildRecommendationProvenance(null, moves);
  assert.strictEqual(p.moves[0].label, 'fallback_id');
});

// ════════════════════════════════════════════════════════════════════════
// isRecommendationSourced
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== isRecommendationSourced ===');

test('18. Returns true for recommendation-sourced scenario', () => {
  const s = { provenance: { source: 'recommendations', baseline: null, moves: [] } };
  assert.strictEqual(isRecommendationSourced(s), true);
});

test('19. Returns false for manual scenario', () => {
  const s = { provenance: { source: 'manual', baseline: null, moves: null } };
  assert.strictEqual(isRecommendationSourced(s), false);
});

test('20. Returns false for scenario without provenance', () => {
  assert.strictEqual(isRecommendationSourced({ name: 'Old' }), false);
  assert.strictEqual(isRecommendationSourced(null), false);
  assert.strictEqual(isRecommendationSourced(undefined), false);
});

// ════════════════════════════════════════════════════════════════════════
// Round-trip simulation — legacy scenario load → default applied → save → reload
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== round-trip ===');

test('21. Legacy load → default applied → JSON round-trip preserves provenance', () => {
  const legacy = { name: 'Legacy', state: { baseExpenses: 1000 }, schemaVersion: 5 };
  // Simulate load path: apply default provenance
  const withDefault = withProvenance(legacy);
  // Save: serialize
  const json = JSON.stringify([withDefault]);
  // Reload: parse + apply defaulting again
  const parsed = JSON.parse(json);
  const reloaded = withProvenanceAll(parsed);
  assert.strictEqual(reloaded.length, 1);
  assert.deepStrictEqual(reloaded[0].provenance, { source: 'manual', baseline: null, moves: null });
});

test('22. Recommendation-sourced scenario round-trips with moves intact', () => {
  const moves = [
    { id: 'retire_debt', label: 'Retire all debt', mutation: { retireDebt: true } },
  ];
  const p = buildRecommendationProvenance('Baseline', moves);
  const scenario = { name: 'From recs', state: { baseExpenses: 500 }, provenance: p };
  const json = JSON.stringify([scenario]);
  const parsed = JSON.parse(json);
  const reloaded = withProvenanceAll(parsed);
  assert.strictEqual(reloaded[0].provenance.source, 'recommendations');
  assert.strictEqual(reloaded[0].provenance.baseline, 'Baseline');
  assert.strictEqual(reloaded[0].provenance.moves.length, 1);
  assert.strictEqual(reloaded[0].provenance.moves[0].id, 'retire_debt');
  assert.strictEqual(reloaded[0].provenance.moves[0].mutation.retireDebt, true);
});

// ════════════════════════════════════════════════════════════════════════
// Summary
// ════════════════════════════════════════════════════════════════════════
console.log(`\n${'='.repeat(50)}`);
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'='.repeat(50)}\n`);

if (failed > 0) process.exit(1);
