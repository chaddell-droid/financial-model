/**
 * Unit tests for auto-save/restore of model state.
 * Run with: node src/state/__tests__/autoSave.test.js
 */
import assert from 'node:assert';
import { extractModelState, saveModelState, loadModelState, STORAGE_KEY } from '../autoSave.js';
import { INITIAL_STATE, MODEL_KEYS } from '../initialState.js';
import { reducer } from '../reducer.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  PASS  ${name}`); }
  catch (e) { failed++; console.error(`  FAIL  ${name}\n        ${e.message}`); }
}

// Mock storage
function createMockStorage() {
  const store = {};
  return {
    get: async (key) => ({ value: store[key] || null }),
    set: async (key, value) => { store[key] = value; return { success: true }; },
    _store: store,
  };
}

console.log('\n=== extractModelState ===');

test('extractModelState extracts only MODEL_KEYS from full state', () => {
  const state = {
    ...INITIAL_STATE,
    activeTab: 'plan',          // not in MODEL_KEYS
    savedScenarios: [{ x: 1 }], // not in MODEL_KEYS
    presentMode: true,           // not in MODEL_KEYS
  };
  const extracted = extractModelState(state);
  // Should have all MODEL_KEYS
  for (const key of MODEL_KEYS) {
    assert.ok(key in extracted, `extracted should contain MODEL_KEY "${key}"`);
  }
  // Should NOT have non-model keys
  assert.ok(!('activeTab' in extracted), 'should not contain activeTab');
  assert.ok(!('savedScenarios' in extracted), 'should not contain savedScenarios');
  assert.ok(!('presentMode' in extracted), 'should not contain presentMode');
});

test('extractModelState includes schemaVersion', () => {
  const extracted = extractModelState({ ...INITIAL_STATE, schemaVersion: 1 });
  assert.strictEqual(extracted.schemaVersion, 1);
});

test('extractModelState preserves complex fields (goals, milestones)', () => {
  const state = {
    ...INITIAL_STATE,
    goals: [{ id: 'g1', name: 'Test', type: 'savings_floor', targetAmount: 0, targetMonth: 72, color: '#4ade80' }],
    milestones: [{ name: 'College', month: 36, savings: 3000 }],
  };
  const extracted = extractModelState(state);
  assert.strictEqual(extracted.goals.length, 1);
  assert.strictEqual(extracted.goals[0].id, 'g1');
  assert.strictEqual(extracted.milestones.length, 1);
  assert.strictEqual(extracted.milestones[0].name, 'College');
});

console.log('\n=== saveModelState ===');

test('saveModelState writes to storage with correct key', async () => {
  const storage = createMockStorage();
  const result = await saveModelState(storage, INITIAL_STATE);
  assert.strictEqual(result, true);
  assert.ok(storage._store[STORAGE_KEY], 'should write to storage');
  const parsed = JSON.parse(storage._store[STORAGE_KEY]);
  assert.strictEqual(parsed.sarahRate, INITIAL_STATE.sarahRate);
});

test('saveModelState returns false with null storage', async () => {
  const result = await saveModelState(null, INITIAL_STATE);
  assert.strictEqual(result, false);
});

test('saveModelState returns false when storage.set throws', async () => {
  const storage = {
    set: async () => { throw new Error('quota exceeded'); },
  };
  const result = await saveModelState(storage, INITIAL_STATE);
  assert.strictEqual(result, false);
});

console.log('\n=== loadModelState ===');

test('loadModelState reads and parses stored state', async () => {
  const storage = createMockStorage();
  const saved = { sarahRate: 250, totalMonthlySpend: 40000, schemaVersion: 1 };
  storage._store[STORAGE_KEY] = JSON.stringify(saved);
  const result = await loadModelState(storage);
  assert.strictEqual(result.sarahRate, 250);
  assert.strictEqual(result.totalMonthlySpend, 40000);
});

test('loadModelState returns null when nothing saved', async () => {
  const storage = createMockStorage();
  const result = await loadModelState(storage);
  assert.strictEqual(result, null);
});

test('loadModelState returns null for malformed JSON', async () => {
  const storage = createMockStorage();
  storage._store[STORAGE_KEY] = 'not json{{{';
  const result = await loadModelState(storage);
  assert.strictEqual(result, null);
});

test('loadModelState returns null for array (not object)', async () => {
  const storage = createMockStorage();
  storage._store[STORAGE_KEY] = '[1,2,3]';
  const result = await loadModelState(storage);
  assert.strictEqual(result, null);
});

test('loadModelState returns null with null storage', async () => {
  const result = await loadModelState(null);
  assert.strictEqual(result, null);
});

console.log('\n=== Round-trip: save → load → RESTORE_STATE ===');

test('Full round-trip preserves modified model values through save/load/restore', async () => {
  const storage = createMockStorage();

  // Start with modified state
  const modifiedState = {
    ...INITIAL_STATE,
    sarahRate: 275,
    totalMonthlySpend: 35000,
    oneTimeExtras: 5000,
    oneTimeMonths: 3,
    retireDebt: true,
    investmentReturn: 12,
    activeTab: 'plan',           // UI state — should NOT persist
    presentMode: true,           // UI state — should NOT persist
  };

  // Save
  const saveResult = await saveModelState(storage, modifiedState);
  assert.strictEqual(saveResult, true);

  // Load
  const loaded = await loadModelState(storage);
  assert.ok(loaded !== null, 'should load successfully');

  // Restore via reducer (simulates what FinancialModel does)
  const restored = reducer(INITIAL_STATE, { type: 'RESTORE_STATE', state: loaded });

  // Model values should be preserved
  assert.strictEqual(restored.sarahRate, 275, 'sarahRate should survive round-trip');
  assert.strictEqual(restored.totalMonthlySpend, 35000, 'totalMonthlySpend should survive');
  assert.strictEqual(restored.oneTimeExtras, 5000, 'oneTimeExtras should survive');
  assert.strictEqual(restored.oneTimeMonths, 3, 'oneTimeMonths should survive');
  assert.strictEqual(restored.retireDebt, true, 'retireDebt should survive');
  assert.strictEqual(restored.investmentReturn, 12, 'investmentReturn should survive');

  // UI state should NOT be in the saved data (restored from INITIAL_STATE)
  assert.strictEqual(restored.activeTab, INITIAL_STATE.activeTab, 'activeTab should not persist');
  assert.strictEqual(restored.presentMode, INITIAL_STATE.presentMode, 'presentMode should not persist');
});

test('Round-trip with schema migration works correctly', async () => {
  const storage = createMockStorage();

  // Simulate a v0 state (no schemaVersion, has legacy lifestyleCuts)
  storage._store[STORAGE_KEY] = JSON.stringify({
    sarahRate: 200,
    lifestyleCuts: 5000,
    // no cutOliver → triggers v0→v1 migration
  });

  const loaded = await loadModelState(storage);
  const restored = reducer(INITIAL_STATE, { type: 'RESTORE_STATE', state: loaded });

  // Migration should have filled in individual cut fields
  assert.strictEqual(restored.cutOliver, INITIAL_STATE.cutOliver, 'migration should fill cutOliver');
  assert.strictEqual(restored.sarahRate, 200, 'sarahRate should be preserved through migration');
});

// ════════════════════════════════════════════════════════════════════════
// Summary
// ════════════════════════════════════════════════════════════════════════
console.log(`\n${'='.repeat(50)}`);
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'='.repeat(50)}\n`);

if (failed > 0) process.exit(1);
