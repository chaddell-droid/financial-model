/**
 * Regression tests for the check-in restore data-loss bug (remediation 1.1).
 *
 * The bug: FinancialModel restored check-ins from the "fin-check-ins" storage
 * key by dispatching:
 *   { type: 'RESTORE_STATE', state: { checkInHistory: parsed } }
 *
 * RESTORE_STATE runs migrate + validateAndSanitize, which fills EVERY missing
 * MODEL_KEY with INITIAL_STATE defaults — so this partial payload wiped the
 * user's entire model back to defaults. Worse, checkInHistory is not a
 * MODEL_KEY, so the sanitizer dropped it and the check-ins were not even
 * restored. The debounced auto-save then persisted the wiped defaults over
 * the real saved model.
 *
 * Existing RESTORE_STATE tests dispatched over INITIAL_STATE, which masked
 * the clobber (defaults overwritten with identical defaults).
 *
 * Fix: restore check-ins via sanitizeCheckInHistory + SET_FIELD (the same
 * dedicated pattern monthlyActuals uses) — never through RESTORE_STATE.
 *
 * Run with: node src/state/__tests__/checkInRestore.test.js
 */
import assert from 'node:assert';
import fs from 'node:fs';
import { INITIAL_STATE } from '../initialState.js';
import { reducer } from '../reducer.js';
import { sanitizeCheckInHistory } from '../schemaValidation.js';
import { saveModelState, loadModelState } from '../autoSave.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  PASS  ${name}`); }
  catch (e) { failed++; console.error(`  FAIL  ${name}\n        ${e.message}`); }
}
async function asyncTest(name, fn) {
  try { await fn(); passed++; console.log(`  PASS  ${name}`); }
  catch (e) { failed++; console.error(`  FAIL  ${name}\n        ${e.message}`); }
}

// Mock storage (same shape as autoSave.test.js)
function createMockStorage() {
  const store = {};
  return {
    get: async (key) => ({ value: store[key] || null }),
    set: async (key, value) => { store[key] = value; return { success: true }; },
    _store: store,
  };
}

// The production restore dispatch for check-ins (mirrors FinancialModel.jsx).
function restoreCheckInsAction(parsedJson) {
  return { type: 'SET_FIELD', field: 'checkInHistory', value: sanitizeCheckInHistory(parsedJson) };
}

// A realistic recorded check-in (full data fidelity matters — irreplaceable user work).
const SAMPLE_CHECK_IN = {
  month: 2,
  inputDate: '2026-05-31',
  notes: 'May check-in — vesting landed early',
  actuals: { sarahIncome: 9500, msftVesting: 12000, totalIncome: 27500, expenses: 41000, balance: 187000, balance401k: 481000 },
  planSnapshot: { sarahIncome: 9000, msftVesting: 11000, totalIncome: 26000, expenses: 43818, balance: 192000, balance401k: 478000 },
};

// Multiple NON-default model values. The old masking tests started from
// INITIAL_STATE, so a wipe-to-defaults was invisible.
const NON_DEFAULTS = {
  sarahRate: 999,
  baseExpenses: 50000,
  startingSavings: 350000,
  chadJob: true,
  chadJobSalary: 195000,
  msftPrice: 425.5,
  investmentReturn: 9,
  debtCC: 12345,
  goals: [{ id: 'g-nd', name: 'Custom', type: 'savings_target', targetAmount: 75000, targetMonth: 30, color: '#60a5fa' }],
};

// ════════════════════════════════════════════════════════════════════════
// sanitizeCheckInHistory
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== sanitizeCheckInHistory ===');

test('preserves valid check-ins with full data fidelity', () => {
  const input = [SAMPLE_CHECK_IN, { ...SAMPLE_CHECK_IN, month: 3, notes: '' }];
  const result = sanitizeCheckInHistory(JSON.parse(JSON.stringify(input)));
  assert.deepStrictEqual(result, input, 'no field of any check-in may be lost or mutated');
});

test('returns [] for non-array input', () => {
  for (const bad of [null, undefined, {}, 'not-an-array', 42, true]) {
    assert.deepStrictEqual(sanitizeCheckInHistory(bad), [], `expected [] for ${JSON.stringify(bad)}`);
  }
});

test('filters structurally invalid entries, keeps valid ones', () => {
  const input = [
    null,
    'garbage',
    { notes: 'no month' },
    { month: NaN },
    { month: '2' },          // string month — invalid
    [5],
    SAMPLE_CHECK_IN,
  ];
  const result = sanitizeCheckInHistory(input);
  assert.deepStrictEqual(result, [SAMPLE_CHECK_IN]);
});

test('sorts check-ins by month ascending', () => {
  const result = sanitizeCheckInHistory([{ month: 5 }, { month: 1 }, { month: 3 }]);
  assert.deepStrictEqual(result.map(c => c.month), [1, 3, 5]);
});

// ════════════════════════════════════════════════════════════════════════
// Masking-proof: why partial payloads must never route through RESTORE_STATE
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== RESTORE_STATE partial-payload clobber (documented bug mechanism) ===');

test('RESTORE_STATE with a partial { checkInHistory } payload wipes non-default model fields AND drops the check-ins', () => {
  // This locks the reducer semantics that made the old call site a data-loss
  // bug: RESTORE_STATE is a FULL-state restore (missing MODEL_KEYS → defaults,
  // non-MODEL_KEYS dropped). Correct for scenario loads; fatal for partials.
  const rich = { ...INITIAL_STATE, ...NON_DEFAULTS };
  const next = reducer(rich, { type: 'RESTORE_STATE', state: { checkInHistory: [SAMPLE_CHECK_IN] } });
  for (const key of Object.keys(NON_DEFAULTS)) {
    assert.deepStrictEqual(next[key], INITIAL_STATE[key],
      `${key} should be reset to default by a partial RESTORE_STATE (proves the clobber the old code triggered)`);
  }
  assert.deepStrictEqual(next.checkInHistory, [],
    'checkInHistory is not a MODEL_KEY — RESTORE_STATE does not even restore it');
});

test('dedicated check-in restore over non-default state preserves every model field and restores check-ins', () => {
  const rich = { ...INITIAL_STATE, ...NON_DEFAULTS };
  const next = reducer(rich, restoreCheckInsAction([SAMPLE_CHECK_IN]));
  for (const key of Object.keys(rich)) {
    if (key === 'checkInHistory') continue;
    assert.deepStrictEqual(next[key], rich[key], `${key} must survive check-in restore unchanged`);
  }
  assert.deepStrictEqual(next.checkInHistory, [SAMPLE_CHECK_IN]);
});

test('FinancialModel.jsx no longer routes check-ins through RESTORE_STATE (source guard)', () => {
  const source = fs.readFileSync(new URL('../../FinancialModel.jsx', import.meta.url), 'utf8');
  assert.ok(!/RESTORE_STATE',\s*state:\s*\{\s*checkInHistory/.test(source),
    'fin-check-ins restore must not dispatch RESTORE_STATE with a partial payload');
  assert.ok(source.includes('sanitizeCheckInHistory'),
    'fin-check-ins restore must sanitize the parsed array via sanitizeCheckInHistory');
});

// ════════════════════════════════════════════════════════════════════════
// Round-trip: record check-in → persist → reload → model + check-ins intact
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Round-trip: record → persist → reload ===');

await asyncTest('record a check-in, simulate the reload path: model fields survive AND checkInHistory is restored', async () => {
  const storage = createMockStorage();

  // 1. User works: non-default model values + a recorded check-in.
  let state = reducer({ ...INITIAL_STATE }, { type: 'SET_FIELDS', fields: NON_DEFAULTS });
  state = reducer(state, { type: 'RECORD_CHECK_IN', checkIn: SAMPLE_CHECK_IN });

  // 2. Persist (mirrors the two auto-save effects).
  assert.strictEqual(await saveModelState(storage, state), true);
  await storage.set('fin-check-ins', JSON.stringify(state.checkInHistory));

  // 3. Reload: fresh mount → model restore, then check-in restore.
  let reloaded = reducer({ ...INITIAL_STATE }, { type: 'RESTORE_STATE', state: await loadModelState(storage) });
  const checkInsRaw = JSON.parse((await storage.get('fin-check-ins')).value);
  reloaded = reducer(reloaded, restoreCheckInsAction(checkInsRaw));

  // 4. Model fields survived the reload.
  for (const [key, val] of Object.entries(NON_DEFAULTS)) {
    assert.deepStrictEqual(reloaded[key], val, `${key} must survive reload`);
  }
  // 5. Check-ins survived with full fidelity.
  assert.deepStrictEqual(reloaded.checkInHistory, [SAMPLE_CHECK_IN]);
});

await asyncTest('reload survives either async resolution order (check-ins restored BEFORE model state)', async () => {
  // The original bug was order-dependent: whichever restore resolved last won.
  const storage = createMockStorage();
  let state = reducer({ ...INITIAL_STATE }, { type: 'SET_FIELDS', fields: NON_DEFAULTS });
  state = reducer(state, { type: 'RECORD_CHECK_IN', checkIn: SAMPLE_CHECK_IN });
  await saveModelState(storage, state);
  await storage.set('fin-check-ins', JSON.stringify(state.checkInHistory));

  // Reversed order: check-in restore first, model restore second.
  const checkInsRaw = JSON.parse((await storage.get('fin-check-ins')).value);
  let reloaded = reducer({ ...INITIAL_STATE }, restoreCheckInsAction(checkInsRaw));
  reloaded = reducer(reloaded, { type: 'RESTORE_STATE', state: await loadModelState(storage) });

  for (const [key, val] of Object.entries(NON_DEFAULTS)) {
    assert.deepStrictEqual(reloaded[key], val, `${key} must survive reload (reversed order)`);
  }
  assert.deepStrictEqual(reloaded.checkInHistory, [SAMPLE_CHECK_IN]);
});

await asyncTest('empty stored check-in array does not dispatch (mirrors the length>0 guard)', async () => {
  // The call site only dispatches when the sanitized array is non-empty —
  // protects an in-memory history from being clobbered by an empty payload.
  const parsed = sanitizeCheckInHistory(JSON.parse('[]'));
  assert.strictEqual(parsed.length, 0, 'guard condition: nothing to dispatch');
  const withHistory = { ...INITIAL_STATE, checkInHistory: [SAMPLE_CHECK_IN] };
  // Production code skips the dispatch entirely when parsed.length === 0;
  // state must therefore keep its existing history.
  const next = parsed.length > 0 ? reducer(withHistory, restoreCheckInsAction(parsed)) : withHistory;
  assert.deepStrictEqual(next.checkInHistory, [SAMPLE_CHECK_IN]);
});

// ════════════════════════════════════════════════════════════════════════
// Summary
// ════════════════════════════════════════════════════════════════════════
console.log(`\n${'='.repeat(60)}`);
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'='.repeat(60)}\n`);

if (failed > 0) process.exit(1);
