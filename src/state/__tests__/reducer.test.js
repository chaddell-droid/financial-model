/**
 * Unit tests for the reducer and gatherState.
 * Run with: node src/state/__tests__/reducer.test.js
 */
import assert from 'node:assert';
import { INITIAL_STATE, MODEL_KEYS } from '../initialState.js';
import { reducer } from '../reducer.js';
import { gatherState, gatherStateWithOverrides } from '../gatherState.js';
import { validateAndSanitize, migrate, CURRENT_SCHEMA_VERSION } from '../schemaValidation.js';

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
// Reducer — SET_FIELD
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Reducer — SET_FIELD ===');

test('SET_FIELD updates a single field', () => {
  const next = reducer(INITIAL_STATE, { type: 'SET_FIELD', field: 'sarahRate', value: 300 });
  assert.strictEqual(next.sarahRate, 300);
  assert.strictEqual(next.msftGrowth, INITIAL_STATE.msftGrowth, 'other fields unchanged');
});

test('SET_FIELD returns a new object (immutable)', () => {
  const next = reducer(INITIAL_STATE, { type: 'SET_FIELD', field: 'sarahRate', value: 300 });
  assert.notStrictEqual(next, INITIAL_STATE);
});

// ════════════════════════════════════════════════════════════════════════
// Reducer — SET_FIELDS
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Reducer — SET_FIELDS ===');

test('SET_FIELDS updates multiple fields at once', () => {
  const next = reducer(INITIAL_STATE, {
    type: 'SET_FIELDS',
    fields: { sarahRate: 300, msftGrowth: 5 },
  });
  assert.strictEqual(next.sarahRate, 300);
  assert.strictEqual(next.msftGrowth, 5);
});

// ════════════════════════════════════════════════════════════════════════
// Reducer — RESTORE_STATE (backward compatibility)
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Reducer — RESTORE_STATE ===');

test('RESTORE_STATE merges saved state onto current state', () => {
  const saved = { sarahRate: 999, msftGrowth: 10 };
  const next = reducer(INITIAL_STATE, { type: 'RESTORE_STATE', state: saved });
  assert.strictEqual(next.sarahRate, 999);
  assert.strictEqual(next.msftGrowth, 10);
  assert.strictEqual(next.baseExpenses, INITIAL_STATE.baseExpenses, 'unsaved fields preserved');
});

test('RESTORE_STATE migrates legacy aggregate cuts to individual cuts', () => {
  // Legacy scenario has lifestyleCuts but no cutOliver
  const legacy = { lifestyleCuts: 5000, sarahRate: 200 };
  const next = reducer(INITIAL_STATE, { type: 'RESTORE_STATE', state: legacy });
  // Should get INITIAL_STATE defaults for individual cut items
  assert.strictEqual(next.cutOliver, INITIAL_STATE.cutOliver, 'cutOliver gets default');
  assert.strictEqual(next.cutVacation, INITIAL_STATE.cutVacation, 'cutVacation gets default');
  assert.strictEqual(next.cutGym, INITIAL_STATE.cutGym, 'cutGym gets default');
  assert.strictEqual(next.cutMedical, INITIAL_STATE.cutMedical, 'cutMedical gets default');
  assert.strictEqual(next.cutShopping, INITIAL_STATE.cutShopping, 'cutShopping gets default');
  assert.strictEqual(next.cutSaaS, INITIAL_STATE.cutSaaS, 'cutSaaS gets default');
  assert.strictEqual(next.cutAmazon, INITIAL_STATE.cutAmazon, 'cutAmazon gets default');
});

test('RESTORE_STATE does NOT apply legacy migration when cutOliver exists', () => {
  const modern = { lifestyleCuts: 5000, cutOliver: 1000, sarahRate: 200 };
  const next = reducer(INITIAL_STATE, { type: 'RESTORE_STATE', state: modern });
  assert.strictEqual(next.cutOliver, 1000, 'cutOliver preserved from saved state');
});

test('RESTORE_STATE ensures goals is always an array', () => {
  const noGoals = { sarahRate: 200 }; // no goals field
  const next = reducer(INITIAL_STATE, { type: 'RESTORE_STATE', state: noGoals });
  assert.ok(Array.isArray(next.goals), 'goals should be an array');
  assert.deepStrictEqual(next.goals, INITIAL_STATE.goals, 'goals should default to INITIAL_STATE.goals');
});

test('RESTORE_STATE fixes corrupted goals (non-array)', () => {
  const corruptGoals = { goals: 'not-an-array', sarahRate: 200 };
  const next = reducer(INITIAL_STATE, { type: 'RESTORE_STATE', state: corruptGoals });
  assert.ok(Array.isArray(next.goals), 'goals should be an array even if saved value was not');
  assert.deepStrictEqual(next.goals, INITIAL_STATE.goals);
});

test('RESTORE_STATE preserves valid goals array', () => {
  const customGoals = [{ id: 'custom-1', name: 'My Goal', type: 'savings_target', targetAmount: 100000, targetMonth: 36, color: '#60a5fa' }];
  const saved = { goals: customGoals };
  const next = reducer(INITIAL_STATE, { type: 'RESTORE_STATE', state: saved });
  assert.deepStrictEqual(next.goals, customGoals, 'valid goals should be preserved');
});

// ════════════════════════════════════════════════════════════════════════
// Reducer — RESET_ALL
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Reducer — RESET_ALL ===');

test('RESET_ALL returns to initial state', () => {
  const modified = { ...INITIAL_STATE, sarahRate: 999, msftGrowth: 50 };
  const next = reducer(modified, { type: 'RESET_ALL' });
  assert.strictEqual(next.sarahRate, INITIAL_STATE.sarahRate);
  assert.strictEqual(next.msftGrowth, INITIAL_STATE.msftGrowth);
});

test('RESET_ALL preserves savedScenarios', () => {
  const withScenarios = { ...INITIAL_STATE, savedScenarios: [{ name: 'test' }] };
  const next = reducer(withScenarios, { type: 'RESET_ALL' });
  assert.deepStrictEqual(next.savedScenarios, [{ name: 'test' }]);
});

test('RESET_ALL preserves checkInHistory', () => {
  const withCheckIns = { ...INITIAL_STATE, checkInHistory: [{ month: 0, data: {} }] };
  const next = reducer(withCheckIns, { type: 'RESET_ALL' });
  assert.deepStrictEqual(next.checkInHistory, [{ month: 0, data: {} }]);
});

test('RESET_ALL preserves storageStatus', () => {
  const withStatus = { ...INITIAL_STATE, storageStatus: 'loaded' };
  const next = reducer(withStatus, { type: 'RESET_ALL' });
  assert.strictEqual(next.storageStatus, 'loaded');
});

// ════════════════════════════════════════════════════════════════════════
// Reducer — RECORD_CHECK_IN / DELETE_CHECK_IN
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Reducer — Check-In Actions ===');

test('RECORD_CHECK_IN adds a new check-in sorted by month', () => {
  const state = { ...INITIAL_STATE, checkInHistory: [{ month: 0 }] };
  const next = reducer(state, { type: 'RECORD_CHECK_IN', checkIn: { month: 2 } });
  assert.strictEqual(next.checkInHistory.length, 2);
  assert.strictEqual(next.checkInHistory[0].month, 0);
  assert.strictEqual(next.checkInHistory[1].month, 2);
});

test('RECORD_CHECK_IN replaces existing check-in for same month', () => {
  const state = { ...INITIAL_STATE, checkInHistory: [{ month: 0, data: 'old' }] };
  const next = reducer(state, { type: 'RECORD_CHECK_IN', checkIn: { month: 0, data: 'new' } });
  assert.strictEqual(next.checkInHistory.length, 1);
  assert.strictEqual(next.checkInHistory[0].data, 'new');
});

test('RECORD_CHECK_IN clears activeCheckInMonth', () => {
  const state = { ...INITIAL_STATE, activeCheckInMonth: 3, checkInHistory: [] };
  const next = reducer(state, { type: 'RECORD_CHECK_IN', checkIn: { month: 3 } });
  assert.strictEqual(next.activeCheckInMonth, null);
});

test('DELETE_CHECK_IN removes the check-in for a given month', () => {
  const state = { ...INITIAL_STATE, checkInHistory: [{ month: 0 }, { month: 1 }, { month: 2 }] };
  const next = reducer(state, { type: 'DELETE_CHECK_IN', month: 1 });
  assert.strictEqual(next.checkInHistory.length, 2);
  assert.ok(!next.checkInHistory.some(c => c.month === 1));
});

// ════════════════════════════════════════════════════════════════════════
// Reducer — RESET_ACTUALS_MONTH / RESET_ACTUALS_ALL
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Reducer — Actuals Reset ===');

test('RESET_ACTUALS_MONTH removes a single month of transactions', () => {
  const state = {
    ...INITIAL_STATE,
    monthlyActuals: {
      '2026-01': { transactions: [{ id: 'a', amount: -50 }] },
      '2026-02': { transactions: [{ id: 'b', amount: -30 }] },
      '2026-03': { transactions: [{ id: 'c', amount: -20 }] },
    },
  };
  const next = reducer(state, { type: 'RESET_ACTUALS_MONTH', month: '2026-02' });
  assert.strictEqual(Object.keys(next.monthlyActuals).length, 2);
  assert.ok(!('2026-02' in next.monthlyActuals), 'target month removed');
  assert.ok('2026-01' in next.monthlyActuals, 'other months preserved');
  assert.ok('2026-03' in next.monthlyActuals, 'other months preserved');
});

test('RESET_ACTUALS_MONTH on non-existent month is a no-op', () => {
  const state = {
    ...INITIAL_STATE,
    monthlyActuals: { '2026-01': { transactions: [{ id: 'a' }] } },
  };
  const next = reducer(state, { type: 'RESET_ACTUALS_MONTH', month: '2099-12' });
  assert.deepStrictEqual(next.monthlyActuals, state.monthlyActuals);
});

test('RESET_ACTUALS_MONTH with clearClassifications clears merchant data', () => {
  const state = {
    ...INITIAL_STATE,
    monthlyActuals: {
      '2026-01': { transactions: [{ id: 'a' }] },
      '2026-02': { transactions: [{ id: 'b' }] },
    },
    merchantClassifications: { 'Amazon': 'core' },
  };
  const next = reducer(state, { type: 'RESET_ACTUALS_MONTH', month: '2026-01', clearClassifications: true });
  assert.strictEqual(Object.keys(next.monthlyActuals).length, 1, 'only target month removed');
  assert.deepStrictEqual(next.merchantClassifications, {}, 'classifications cleared');
});

test('RESET_ACTUALS_MONTH without clearClassifications preserves merchant data', () => {
  const state = {
    ...INITIAL_STATE,
    monthlyActuals: { '2026-01': { transactions: [{ id: 'a' }] } },
    merchantClassifications: { 'Amazon': 'core' },
  };
  const next = reducer(state, { type: 'RESET_ACTUALS_MONTH', month: '2026-01' });
  assert.deepStrictEqual(next.merchantClassifications, { 'Amazon': 'core' }, 'classifications preserved');
});

test('RESET_ACTUALS_ALL with clearClassifications clears everything', () => {
  const state = {
    ...INITIAL_STATE,
    monthlyActuals: {
      '2026-01': { transactions: [{ id: 'a' }] },
      '2026-02': { transactions: [{ id: 'b' }] },
    },
    merchantClassifications: { 'Amazon': 'core', 'Costco': 'core' },
  };
  const next = reducer(state, { type: 'RESET_ACTUALS_ALL', clearClassifications: true });
  assert.deepStrictEqual(next.monthlyActuals, {}, 'all actuals cleared');
  assert.deepStrictEqual(next.merchantClassifications, {}, 'all classifications cleared');
});

test('RESET_ACTUALS_ALL without clearClassifications preserves merchant data', () => {
  const state = {
    ...INITIAL_STATE,
    monthlyActuals: { '2026-01': { transactions: [{ id: 'a' }] } },
    merchantClassifications: { 'Amazon': 'core' },
  };
  const next = reducer(state, { type: 'RESET_ACTUALS_ALL' });
  assert.deepStrictEqual(next.monthlyActuals, {}, 'actuals cleared');
  assert.deepStrictEqual(next.merchantClassifications, { 'Amazon': 'core' }, 'classifications preserved');
});

test('RESET_ACTUALS_ALL preserves model state and scenarios', () => {
  const state = {
    ...INITIAL_STATE,
    sarahRate: 999,
    savedScenarios: [{ name: 'test' }],
    monthlyActuals: { '2026-01': { transactions: [] } },
    merchantClassifications: { 'Foo': 'core' },
  };
  const next = reducer(state, { type: 'RESET_ACTUALS_ALL', clearClassifications: true });
  assert.strictEqual(next.sarahRate, 999, 'model state preserved');
  assert.deepStrictEqual(next.savedScenarios, [{ name: 'test' }], 'scenarios preserved');
});

// ════════════════════════════════════════════════════════════════════════
// Reducer — Unknown Action
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Reducer — Edge Cases ===');

test('unknown action returns state unchanged', () => {
  const next = reducer(INITIAL_STATE, { type: 'UNKNOWN_ACTION' });
  assert.strictEqual(next, INITIAL_STATE);
});

// ════════════════════════════════════════════════════════════════════════
// Schema Validation + Migration
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Schema Validation ===');

test('validateAndSanitize fills missing fields with defaults', () => {
  const result = validateAndSanitize({ sarahRate: 300 });
  assert.strictEqual(result.sarahRate, 300);
  assert.strictEqual(result.msftGrowth, INITIAL_STATE.msftGrowth, 'missing field gets default');
  assert.strictEqual(result.baseExpenses, INITIAL_STATE.baseExpenses);
});

test('validateAndSanitize coerces string numbers to numbers', () => {
  const result = validateAndSanitize({ sarahRate: '250', investmentReturn: '15' });
  assert.strictEqual(typeof result.sarahRate, 'number');
  assert.strictEqual(result.sarahRate, 250);
  assert.strictEqual(result.investmentReturn, 15);
});

test('validateAndSanitize clamps out-of-range values', () => {
  const result = validateAndSanitize({ investmentReturn: 999, chadJobTaxRate: -10 });
  assert.strictEqual(result.investmentReturn, 100, 'clamped to max 100');
  assert.strictEqual(result.chadJobTaxRate, 0, 'clamped to min 0');
});

test('validateAndSanitize validates ssType enum', () => {
  const valid = validateAndSanitize({ ssType: 'ss' });
  assert.strictEqual(valid.ssType, 'ss');
  const invalid = validateAndSanitize({ ssType: 'bogus' });
  assert.strictEqual(invalid.ssType, INITIAL_STATE.ssType, 'invalid enum falls back to default');
});

test('validateAndSanitize handles cutsOverride as number', () => {
  const withZero = validateAndSanitize({ cutsOverride: 0 });
  assert.strictEqual(withZero.cutsOverride, 0);
  const withNum = validateAndSanitize({ cutsOverride: 5000 });
  assert.strictEqual(withNum.cutsOverride, 5000);
  const withNeg = validateAndSanitize({ cutsOverride: -100 });
  assert.strictEqual(withNeg.cutsOverride, 0, 'clamped to min 0');
});

test('validateAndSanitize filters corrupt goals entries', () => {
  const goals = [
    { id: 'good', name: 'Test', type: 'savings_floor', targetAmount: 1000, targetMonth: 36 },
    { id: 'bad' }, // missing name, type
    'not-an-object',
    { id: 'ok', name: 'Valid', type: 'income_target' }, // missing amounts, should fill defaults
  ];
  const result = validateAndSanitize({ goals });
  assert.strictEqual(result.goals.length, 2, 'only valid goals survive');
  assert.strictEqual(result.goals[0].id, 'good');
  assert.strictEqual(result.goals[1].id, 'ok');
  assert.strictEqual(result.goals[1].targetAmount, 0, 'default targetAmount');
  assert.strictEqual(result.goals[1].targetMonth, 72, 'default targetMonth');
});

test('validateAndSanitize sets schemaVersion', () => {
  const result = validateAndSanitize({});
  assert.strictEqual(result.schemaVersion, CURRENT_SCHEMA_VERSION);
});

test('validateAndSanitize coerces NaN and Infinity to defaults', () => {
  const result = validateAndSanitize({ sarahRate: NaN, msftGrowth: Infinity });
  assert.strictEqual(result.sarahRate, INITIAL_STATE.sarahRate, 'NaN falls back to default');
  assert.strictEqual(result.msftGrowth, INITIAL_STATE.msftGrowth, 'Infinity falls back to default');
});

console.log('\n=== Schema Migration ===');

test('migrate applies v0→v1 legacy cuts migration', () => {
  const legacy = { lifestyleCuts: 5000 }; // no cutOliver → v0 scenario
  const result = migrate(legacy);
  assert.strictEqual(result.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.strictEqual(result.cutOliver, INITIAL_STATE.cutOliver);
  assert.strictEqual(result.cutVacation, INITIAL_STATE.cutVacation);
});

test('migrate skips legacy migration when cutOliver exists', () => {
  const modern = { schemaVersion: 1, cutOliver: 999 };
  const result = migrate(modern);
  assert.strictEqual(result.cutOliver, 999);
  assert.strictEqual(result.schemaVersion, CURRENT_SCHEMA_VERSION);
});

test('RESTORE_STATE integrates validation (end-to-end)', () => {
  const corrupt = { sarahRate: '500', investmentReturn: 999, ssType: 'invalid', goals: 'not-array' };
  const next = reducer(INITIAL_STATE, { type: 'RESTORE_STATE', state: corrupt });
  assert.strictEqual(next.sarahRate, 500, 'string coerced to number');
  assert.strictEqual(next.investmentReturn, 100, 'clamped to max');
  assert.strictEqual(next.ssType, INITIAL_STATE.ssType, 'invalid enum replaced');
  assert.ok(Array.isArray(next.goals), 'non-array goals fixed');
  assert.strictEqual(next.schemaVersion, CURRENT_SCHEMA_VERSION);
});

// ════════════════════════════════════════════════════════════════════════
// gatherState
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== gatherState ===');

test('gatherState extracts MODEL_KEYS from state', () => {
  const result = gatherState(INITIAL_STATE);
  for (const key of MODEL_KEYS) {
    assert.ok(key in result, `MODEL_KEY "${key}" should be in gathered state`);
  }
});

test('gatherState falls back to INITIAL_STATE for missing keys', () => {
  const partial = { sarahRate: 500, sarahMaxRate: 500 }; // missing most keys
  const result = gatherState(partial);
  assert.strictEqual(result.sarahRate, 500, 'provided value used');
  assert.strictEqual(result.msftGrowth, INITIAL_STATE.msftGrowth, 'missing key falls back to INITIAL_STATE');
});

test('gatherState computes bcsFamilyMonthly correctly', () => {
  const result = gatherState({ ...INITIAL_STATE, bcsAnnualTotal: 41000, bcsParentsAnnual: 25000 });
  assert.strictEqual(result.bcsFamilyMonthly, Math.round((41000 - 25000) / 12));
});

test('gatherState bcsFamilyMonthly floors at zero', () => {
  const result = gatherState({ ...INITIAL_STATE, bcsAnnualTotal: 10000, bcsParentsAnnual: 25000 });
  assert.strictEqual(result.bcsFamilyMonthly, 0, 'negative should be clamped to 0');
});

test('gatherState uses cutsOverride as total cuts', () => {
  const state = {
    ...INITIAL_STATE,
    cutsOverride: 5000,
  };
  const result = gatherState(state);
  assert.strictEqual(result.lifestyleCuts, 5000, 'lifestyleCuts = cutsOverride');
  assert.strictEqual(result.cutInHalf, 0, 'cutInHalf = 0 when override set');
  assert.strictEqual(result.extraCuts, 0, 'extraCuts = 0 when override set');
});

test('gatherState uses cutsOverride when set', () => {
  const state = {
    ...INITIAL_STATE,
    cutsOverride: 5000,
    cutOliver: 100, cutVacation: 200, cutGym: 300,
  };
  const result = gatherState(state);
  assert.strictEqual(result.lifestyleCuts, 5000, 'lifestyleCuts should be the override value');
  assert.strictEqual(result.cutInHalf, 0, 'cutInHalf should be zeroed with override');
  assert.strictEqual(result.extraCuts, 0, 'extraCuts should be zeroed with override');
});

test('gatherState treats cutsOverride of 0 as set (not null)', () => {
  const state = { ...INITIAL_STATE, cutsOverride: 0 };
  const result = gatherState(state);
  assert.strictEqual(result.lifestyleCuts, 0);
  assert.strictEqual(result.cutInHalf, 0);
  assert.strictEqual(result.extraCuts, 0);
});

test('gatherStateWithOverrides merges overrides onto INITIAL_STATE', () => {
  const result = gatherStateWithOverrides({ sarahRate: 500, sarahMaxRate: 500 });
  assert.strictEqual(result.sarahRate, 500);
  assert.strictEqual(result.msftGrowth, INITIAL_STATE.msftGrowth);
});

test('gatherStateWithOverrides with no args uses all defaults', () => {
  const result = gatherStateWithOverrides();
  assert.strictEqual(result.sarahRate, INITIAL_STATE.sarahRate);
});

// ════════════════════════════════════════════════════════════════════════
// totalMonthlySpend in gatherState
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== totalMonthlySpend in gatherState ===');

test('gatherState with totalMonthlySpend=60000 back-calculates baseExpenses', () => {
  const bcsFamilyMonthly = Math.round(Math.max(0, INITIAL_STATE.bcsAnnualTotal - INITIAL_STATE.bcsParentsAnnual) / 12);
  const expected = 60000 - INITIAL_STATE.debtService - INITIAL_STATE.vanMonthlySavings - bcsFamilyMonthly;
  const result = gatherState({ ...INITIAL_STATE, totalMonthlySpend: 60000 });
  assert.strictEqual(result.baseExpenses, expected);
});

test('gatherState with totalMonthlySpend=null leaves baseExpenses unchanged', () => {
  const result = gatherState({ ...INITIAL_STATE, totalMonthlySpend: null });
  assert.strictEqual(result.baseExpenses, INITIAL_STATE.baseExpenses);
});

test('gatherState with totalMonthlySpend less than fixed costs clamps baseExpenses to 0', () => {
  const result = gatherState({ ...INITIAL_STATE, totalMonthlySpend: 5000 });
  assert.strictEqual(result.baseExpenses, 0);
});

test('gatherState with totalMonthlySpend=0 sets baseExpenses to 0', () => {
  const result = gatherState({ ...INITIAL_STATE, totalMonthlySpend: 0 });
  assert.strictEqual(result.baseExpenses, 0);
});

// ════════════════════════════════════════════════════════════════════════
// msftPrice in gatherState
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== msftPrice in gatherState ===');

test('gatherStateWithOverrides({ msftPrice: 500 }) extracts msftPrice as 500', () => {
  const result = gatherStateWithOverrides({ msftPrice: 500 });
  assert.strictEqual(result.msftPrice, 500);
});

test('gatherStateWithOverrides({}) falls back to INITIAL_STATE.msftPrice', () => {
  const result = gatherStateWithOverrides({});
  assert.strictEqual(result.msftPrice, INITIAL_STATE.msftPrice);
});

// ════════════════════════════════════════════════════════════════════════
// Schema validation — nullable clamping
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Schema validation — nullable clamping ===');

test('validateAndSanitize({ totalMonthlySpend: null }) preserves null', () => {
  const result = validateAndSanitize({ totalMonthlySpend: null });
  assert.strictEqual(result.totalMonthlySpend, null);
});

test('validateAndSanitize({ totalMonthlySpend: 0 }) preserves 0', () => {
  const result = validateAndSanitize({ totalMonthlySpend: 0 });
  assert.strictEqual(result.totalMonthlySpend, 0);
});

test('validateAndSanitize({ totalMonthlySpend: -5000 }) clamps to 0', () => {
  const result = validateAndSanitize({ totalMonthlySpend: -5000 });
  assert.strictEqual(result.totalMonthlySpend, 0);
});

test('validateAndSanitize({ totalMonthlySpend: "50000" }) coerces string to number', () => {
  const result = validateAndSanitize({ totalMonthlySpend: '50000' });
  assert.strictEqual(result.totalMonthlySpend, 50000);
});

test('validateAndSanitize({ cutsOverride: -100 }) clamps to 0', () => {
  const result = validateAndSanitize({ cutsOverride: -100 });
  assert.strictEqual(result.cutsOverride, 0);
});

// ════════════════════════════════════════════════════════════════════════
// Schema validation — msftPrice
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Schema validation — msftPrice ===');

test('validateAndSanitize({ msftPrice: 0 }) clamps to 1', () => {
  const result = validateAndSanitize({ msftPrice: 0 });
  assert.strictEqual(result.msftPrice, 1);
});

test('validateAndSanitize({ msftPrice: "500" }) coerces string to number', () => {
  const result = validateAndSanitize({ msftPrice: '500' });
  assert.strictEqual(result.msftPrice, 500);
});

// ════════════════════════════════════════════════════════════════════════
// Schema validation — milestones
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Schema validation — milestones ===');

test('validateAndSanitize filters out invalid milestones', () => {
  const result = validateAndSanitize({ milestones: [{ month: 'abc', savings: undefined }] });
  assert.ok(Array.isArray(result.milestones));
  assert.strictEqual(result.milestones.length, 0);
});

test('validateAndSanitize preserves valid milestones', () => {
  const result = validateAndSanitize({ milestones: [{ name: 'Test', month: 12, savings: 500 }] });
  assert.strictEqual(result.milestones.length, 1);
  assert.strictEqual(result.milestones[0].name, 'Test');
  assert.strictEqual(result.milestones[0].month, 12);
  assert.strictEqual(result.milestones[0].savings, 500);
});

// ════════════════════════════════════════════════════════════════════════
// gatherState — partial state fallbacks
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== gatherState — partial state fallbacks ===');

test('gatherState with cutsOverride=0 results in zero cuts', () => {
  const result = gatherState({ ...INITIAL_STATE, cutsOverride: 0 });
  assert.strictEqual(result.lifestyleCuts, 0, 'cutsOverride=0 means zero cuts');
  assert.strictEqual(result.cutInHalf, 0);
  assert.strictEqual(result.extraCuts, 0);
});

// ════════════════════════════════════════════════════════════════════════
// patchUiState safety
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== patchUiState safety ===');

test('SET_FIELDS does not reset model keys when patching UI state', () => {
  const customState = { ...INITIAL_STATE, sarahRate: 999, baseExpenses: 50000, msftGrowth: 10 };
  const next = reducer(customState, { type: 'SET_FIELDS', fields: { presentMode: true, showSaveLoad: false } });
  assert.strictEqual(next.presentMode, true, 'presentMode should be set');
  assert.strictEqual(next.sarahRate, 999, 'sarahRate should be preserved');
  assert.strictEqual(next.baseExpenses, 50000, 'baseExpenses should be preserved');
  assert.strictEqual(next.msftGrowth, 10, 'msftGrowth should be preserved');
});

// ════════════════════════════════════════════════════════════════════════
// Summary
// ════════════════════════════════════════════════════════════════════════
console.log(`\n${'='.repeat(50)}`);
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'='.repeat(50)}\n`);

if (failed > 0) process.exit(1);
