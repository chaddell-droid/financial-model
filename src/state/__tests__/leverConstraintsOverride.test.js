/**
 * Integration tests for the leverConstraintsOverride MODEL_KEY (Story 2.4).
 *
 * UI slider + constraint editor behavior is verified in the browser. These
 * tests cover the state→engine round trip:
 *   • reducer persists leverConstraintsOverride correctly
 *   • gatherState exposes merged effectiveLeverConstraints
 *   • moveOptimizer respects the override (produces different values for
 *     different bounds)
 *   • autoSave round-trip preserves the override
 *   • Schema v7 migration adds leverConstraintsOverride=null for legacy
 *     scenarios (idempotent)
 *
 * Run with: node src/state/__tests__/leverConstraintsOverride.test.js
 */
import assert from 'node:assert';
import { reducer } from '../reducer.js';
import { gatherState, gatherStateWithOverrides } from '../gatherState.js';
import { extractModelState } from '../autoSave.js';
import { migrate, CURRENT_SCHEMA_VERSION } from '../schemaValidation.js';
import { INITIAL_STATE } from '../initialState.js';
import { optimizeContinuousLever } from '../../model/moveOptimizer.js';

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
// Reducer — SET_FIELD('leverConstraintsOverride')
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== reducer SET_FIELD ===');

test('1. Reducer sets leverConstraintsOverride via SET_FIELD', () => {
  const s = { ...INITIAL_STATE };
  const override = { sarahRate: { min: 210, max: 280 } };
  const next = reducer(s, { type: 'SET_FIELD', field: 'leverConstraintsOverride', value: override });
  assert.deepStrictEqual(next.leverConstraintsOverride, override);
});

test('2. Reducer clears override to null', () => {
  const s = { ...INITIAL_STATE, leverConstraintsOverride: { sarahRate: { min: 210 } } };
  const next = reducer(s, { type: 'SET_FIELD', field: 'leverConstraintsOverride', value: null });
  assert.strictEqual(next.leverConstraintsOverride, null);
});

// ════════════════════════════════════════════════════════════════════════
// gatherState exposes effectiveLeverConstraints correctly
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== gatherState effectiveLeverConstraints ===');

test('3. gatherState with null override returns workshop defaults', () => {
  const s = gatherStateWithOverrides({ leverConstraintsOverride: null });
  assert.strictEqual(s.effectiveLeverConstraints.sarahRate.min, 200);
  assert.strictEqual(s.effectiveLeverConstraints.sarahRate.max, 300);
});

test('4. gatherState merges partial override (min only) with default max', () => {
  const s = gatherStateWithOverrides({
    leverConstraintsOverride: { sarahRate: { min: 220 } },
  });
  assert.strictEqual(s.effectiveLeverConstraints.sarahRate.min, 220);
  assert.strictEqual(s.effectiveLeverConstraints.sarahRate.max, 300); // default
});

test('5. gatherState merges partial override (max only) with default min', () => {
  const s = gatherStateWithOverrides({
    leverConstraintsOverride: { chadConsulting: { max: 1700 } }, // simulate SGA bump
  });
  assert.strictEqual(s.effectiveLeverConstraints.chadConsulting.min, 0);
  assert.strictEqual(s.effectiveLeverConstraints.chadConsulting.max, 1700);
});

test('6. gatherState merges full override (min + max)', () => {
  const s = gatherStateWithOverrides({
    leverConstraintsOverride: { sarahRate: { min: 250, max: 350 } },
  });
  assert.strictEqual(s.effectiveLeverConstraints.sarahRate.min, 250);
  assert.strictEqual(s.effectiveLeverConstraints.sarahRate.max, 350);
});

// ════════════════════════════════════════════════════════════════════════
// Optimizer respects the override
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== optimizer respects override ===');

test('7. Optimizer output differs with different override bounds', () => {
  const sDefault = gatherStateWithOverrides({});
  const defaultBounds = sDefault.effectiveLeverConstraints.sarahRate;
  const defaultResult = optimizeContinuousLever(sDefault, 'sarahRate', defaultBounds);

  const sTighter = gatherStateWithOverrides({
    leverConstraintsOverride: { sarahRate: { min: 200, max: 250 } }, // tighter cap
  });
  const tighterBounds = sTighter.effectiveLeverConstraints.sarahRate;
  const tighterResult = optimizeContinuousLever(sTighter, 'sarahRate', tighterBounds);

  // Default capped at 300, tighter at 250. Both monotone levers → both
  // should land near their max. Tighter should be strictly below default.
  assert.ok(tighterResult.value < defaultResult.value,
    `tighter value (${tighterResult.value}) should be below default (${defaultResult.value})`);
  assert.ok(tighterResult.value <= 250, `tighter value (${tighterResult.value}) exceeds tighter max 250`);
});

test('8. Optimizer enforces user override (never returns outside user bounds)', () => {
  const s = gatherStateWithOverrides({
    leverConstraintsOverride: { chadConsulting: { min: 100, max: 500 } }, // tight window
  });
  const bounds = s.effectiveLeverConstraints.chadConsulting;
  const result = optimizeContinuousLever(s, 'chadConsulting', bounds);
  assert.ok(result.value >= 100, `value ${result.value} below override min 100`);
  assert.ok(result.value <= 500, `value ${result.value} above override max 500`);
});

// ════════════════════════════════════════════════════════════════════════
// autoSave round-trip
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== autoSave round-trip ===');

test('9. extractModelState preserves leverConstraintsOverride', () => {
  const override = { sarahRate: { min: 210, max: 280 } };
  const state = { ...INITIAL_STATE, leverConstraintsOverride: override };
  const persisted = extractModelState(state);
  assert.deepStrictEqual(persisted.leverConstraintsOverride, override);
});

test('10. JSON round-trip preserves leverConstraintsOverride structure', () => {
  const override = { sarahRate: { min: 210, max: 280 }, chadConsulting: { max: 1700 } };
  const json = JSON.stringify(override);
  const parsed = JSON.parse(json);
  assert.deepStrictEqual(parsed, override);
});

// ════════════════════════════════════════════════════════════════════════
// Schema v7 migration
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== schema v6 → v7 migration ===');

test('11. Legacy v6 state (no leverConstraintsOverride) migrates with null default', () => {
  const legacy = { schemaVersion: 6, retireDebt: false };
  const migrated = migrate(legacy);
  assert.strictEqual(migrated.leverConstraintsOverride, null);
  assert.strictEqual(migrated.schemaVersion, CURRENT_SCHEMA_VERSION);
});

test('12. Migration is idempotent (already has override, stays intact)', () => {
  const existing = {
    schemaVersion: 6,
    leverConstraintsOverride: { sarahRate: { min: 210 } },
  };
  const migrated = migrate(existing);
  assert.deepStrictEqual(migrated.leverConstraintsOverride, { sarahRate: { min: 210 } });
  assert.strictEqual(migrated.schemaVersion, CURRENT_SCHEMA_VERSION);
});

test('13. Migration from earlier version (v5) still adds leverConstraintsOverride', () => {
  const ancient = { schemaVersion: 5, retireDebt: false };
  const migrated = migrate(ancient);
  assert.strictEqual(migrated.leverConstraintsOverride, null);
  assert.strictEqual(migrated.schemaVersion, CURRENT_SCHEMA_VERSION);
});

// ════════════════════════════════════════════════════════════════════════
// Summary
// ════════════════════════════════════════════════════════════════════════
console.log(`\n${'='.repeat(50)}`);
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'='.repeat(50)}\n`);

if (failed > 0) process.exit(1);
