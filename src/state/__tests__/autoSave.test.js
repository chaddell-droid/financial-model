/**
 * Unit tests for auto-save/restore of model state.
 * Run with: node src/state/__tests__/autoSave.test.js
 */
import assert from 'node:assert';
import {
  extractModelState, extractProjectionInputs, projectionInputsEqual,
  saveModelState, loadModelState, STORAGE_KEY,
} from '../autoSave.js';
import { INITIAL_STATE, MODEL_KEYS } from '../initialState.js';
import { reducer } from '../reducer.js';
import { gatherState } from '../gatherState.js';

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

console.log('\n=== extractProjectionInputs / projectionInputsEqual (remediation 6.1) ===');

test('extractProjectionInputs includes MODEL_KEYS, schemaVersion, and previewMoves', () => {
  const moves = [{ id: 'mv-1', label: 'Raise rate', mutation: { sarahRate: 240 } }];
  const state = { ...INITIAL_STATE, previewMoves: moves };
  const extracted = extractProjectionInputs(state);
  for (const key of MODEL_KEYS) {
    assert.ok(key in extracted, `extracted should contain MODEL_KEY "${key}"`);
  }
  assert.strictEqual(extracted.schemaVersion, INITIAL_STATE.schemaVersion, 'should carry schemaVersion');
  assert.strictEqual(extracted.previewMoves, moves, 'should carry previewMoves by reference');
});

test('extractProjectionInputs omits UI-only fields', () => {
  const state = {
    ...INITIAL_STATE,
    activeTab: 'risk',
    scenarioName: 'typing…',
    storageStatus: 'saved',
    mcRunning: true,
    mcResults: { bands: [] },
    checkInHistory: [{ month: 3 }],
    monthlyActuals: { '2026-05': { transactions: [] } },
    savedScenarios: [{ name: 'x' }],
  };
  const extracted = extractProjectionInputs(state);
  for (const key of ['activeTab', 'scenarioName', 'storageStatus', 'mcRunning', 'mcResults',
    'checkInHistory', 'monthlyActuals', 'savedScenarios']) {
    assert.ok(!(key in extracted), `extracted should NOT contain UI field "${key}"`);
  }
});

test('projectionInputsEqual is stable across UI-only reducer changes (default behavior)', () => {
  let state = { ...INITIAL_STATE };
  const before = extractProjectionInputs(state);
  // Simulate the exact UI-only dispatches that used to invalidate the projection:
  // tab switch, scenario-name keystrokes, storage-status timer, MC running flag.
  state = reducer(state, { type: 'SET_FIELD', field: 'activeTab', value: 'risk' });
  state = reducer(state, { type: 'SET_FIELD', field: 'scenarioName', value: 'My plan v2' });
  state = reducer(state, { type: 'SET_FIELD', field: 'storageStatus', value: 'saved' });
  state = reducer(state, { type: 'SET_FIELD', field: 'mcRunning', value: true });
  state = reducer(state, { type: 'SET_FIELD', field: 'mcResults', value: { bands: [] } });
  const after = extractProjectionInputs(state);
  assert.strictEqual(projectionInputsEqual(before, after), true,
    'UI-only changes must not change the projection-input subset');
});

test('projectionInputsEqual detects model-field changes (override behavior)', () => {
  const base = extractProjectionInputs(INITIAL_STATE);
  // Scalar model field
  const s1 = reducer(INITIAL_STATE, { type: 'SET_FIELD', field: 'sarahRate', value: 240 });
  assert.strictEqual(projectionInputsEqual(base, extractProjectionInputs(s1)), false,
    'scalar model-field change must be detected');
  // Array model field (new reference)
  const s2 = reducer(INITIAL_STATE, {
    type: 'SET_FIELD', field: 'milestones',
    value: [{ name: 'Twins to college', month: 36, savings: 3000 }],
  });
  assert.strictEqual(projectionInputsEqual(base, extractProjectionInputs(s2)), false,
    'array model-field identity change must be detected');
  // MC tunable params ARE model keys (they persist) — must be detected too
  const s3 = reducer(INITIAL_STATE, { type: 'SET_FIELD', field: 'mcInvestVol', value: 20 });
  assert.strictEqual(projectionInputsEqual(base, extractProjectionInputs(s3)), false,
    'mc parameter change must be detected');
});

test('projectionInputsEqual detects previewMoves changes (edge: composed by gatherState)', () => {
  const base = extractProjectionInputs(INITIAL_STATE);
  const s1 = reducer(INITIAL_STATE, {
    type: 'APPLY_PREVIEW_MOVE',
    move: { id: 'mv-1', label: 'Raise rate', mutation: { sarahRate: 240 } },
  });
  assert.strictEqual(projectionInputsEqual(base, extractProjectionInputs(s1)), false,
    'applying a preview move must invalidate the projection inputs');
  const s2 = reducer(s1, { type: 'CLEAR_PREVIEW' });
  assert.strictEqual(
    projectionInputsEqual(extractProjectionInputs(s1), extractProjectionInputs(s2)),
    false,
    'clearing the preview must invalidate the projection inputs');
});

test('projectionInputsEqual handles null/identical references (edge)', () => {
  const a = extractProjectionInputs(INITIAL_STATE);
  assert.strictEqual(projectionInputsEqual(a, a), true, 'same reference is equal');
  assert.strictEqual(projectionInputsEqual(a, null), false, 'null right is unequal');
  assert.strictEqual(projectionInputsEqual(null, a), false, 'null left is unequal');
});

test('gatherState parity: gathering the extracted subset equals gathering the full state', () => {
  // A full state with modified model fields, staged preview moves, AND noisy
  // UI fields. The projection pipeline keyed on extractProjectionInputs must
  // produce EXACTLY the same gathered (projection-ready) state as the full
  // state object did — this locks the contract that gatherState reads only
  // MODEL_KEYS + schemaVersion + previewMoves.
  const full = {
    ...INITIAL_STATE,
    sarahRate: 225,
    totalMonthlySpend: 38000,
    retireDebt: true,
    chadJob: true,
    chadJobSalary: 180000,
    ssType: 'ss',
    capitalItems: [{ id: 'c1', name: 'Roof', description: '', cost: 30000, include: true, likelihood: 50 }],
    previewMoves: [{ id: 'mv-1', label: 'Cuts', mutation: { lifestyleCutsApplied: true, cutsOverride: 1500 } }],
    // UI noise that must not matter:
    activeTab: 'risk',
    scenarioName: 'noise',
    storageStatus: 'saved',
    mcRunning: true,
    presentMode: true,
  };
  const fromSubset = gatherState(extractProjectionInputs(full));
  const fromFull = gatherState(full);
  assert.deepStrictEqual(fromSubset, fromFull,
    'gatherState(extractProjectionInputs(state)) must equal gatherState(state)');
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
