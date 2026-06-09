/**
 * Tests for the shared persistence guard (remediation 1.3).
 * Run with: node src/state/__tests__/safeStorage.test.js
 */
import assert from 'node:assert';
import {
  safeWrite, isTrivialPayload, isSuspiciousOverwrite, createHydrationGate,
  mergeScenarioLists, BACKUP_SUFFIX, QUARANTINE_SUFFIX,
  SHRINK_RATIO, SHRINK_MIN_EXISTING_BYTES,
} from '../safeStorage.js';

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${e.message}`);
  }
}

// Mirrors the window.storage polyfill in src/main.jsx: get() THROWS on
// missing keys, set() returns a truthy result.
function createMockStorage(initial = {}) {
  const store = { ...initial };
  return {
    get: async (key) => {
      if (!(key in store)) throw new Error(`Key not found: ${key}`);
      return { key, value: store[key], shared: false };
    },
    set: async (key, value) => { store[key] = value; return { key, value, shared: false }; },
    _store: store,
  };
}

// Silence + capture console.warn for the quarantine assertions.
const warnings = [];
const realWarn = console.warn;
console.warn = (...args) => { warnings.push(args.join(' ')); };

console.log('\n=== isTrivialPayload ===');

await test('trivial payloads: null, undefined, "", "{}", "[]", "null", whitespace', () => {
  assert.strictEqual(isTrivialPayload(null), true);
  assert.strictEqual(isTrivialPayload(undefined), true);
  assert.strictEqual(isTrivialPayload(''), true);
  assert.strictEqual(isTrivialPayload('{}'), true);
  assert.strictEqual(isTrivialPayload('[]'), true);
  assert.strictEqual(isTrivialPayload('null'), true);
  assert.strictEqual(isTrivialPayload('  {} '), true);
});

await test('non-trivial payloads pass', () => {
  assert.strictEqual(isTrivialPayload('{"a":1}'), false);
  assert.strictEqual(isTrivialPayload('[1]'), false);
  assert.strictEqual(isTrivialPayload('0'), false);
});

console.log('\n=== isSuspiciousOverwrite ===');

await test('nothing stored -> never suspicious', () => {
  assert.strictEqual(isSuspiciousOverwrite(null, '{}'), null);
  assert.strictEqual(isSuspiciousOverwrite('', '[]'), null);
  assert.strictEqual(isSuspiciousOverwrite('{}', '[]'), null);
});

await test('empty over non-trivial -> empty-overwrite', () => {
  assert.strictEqual(isSuspiciousOverwrite('{"a":1}', '{}'), 'empty-overwrite');
  assert.strictEqual(isSuspiciousOverwrite('[{"x":1}]', '[]'), 'empty-overwrite');
  assert.strictEqual(isSuspiciousOverwrite('{"a":1}', null), 'empty-overwrite');
});

await test('default-equivalent payload -> default-overwrite', () => {
  const defaults = '{"a":0,"b":0}';
  const r = isSuspiciousOverwrite('{"a":5,"b":9}', defaults, {
    isDefaultPayload: (j) => j === defaults,
  });
  assert.strictEqual(r, 'default-overwrite');
});

await test('dramatic shrink of a large payload -> shrink-overwrite', () => {
  const existing = JSON.stringify({ data: 'x'.repeat(SHRINK_MIN_EXISTING_BYTES * 2) });
  const next = '{"data":"x"}';
  assert.ok(next.length < existing.length * SHRINK_RATIO, 'fixture sanity');
  assert.strictEqual(isSuspiciousOverwrite(existing, next), 'shrink-overwrite');
});

await test('moderate shrink (e.g. one deletion) is allowed', () => {
  const existing = JSON.stringify({ data: 'x'.repeat(4000) });
  const next = JSON.stringify({ data: 'x'.repeat(2000) }); // 50%
  assert.strictEqual(isSuspiciousOverwrite(existing, next), null);
});

await test('small existing payloads are exempt from the shrink check', () => {
  const existing = '{"tabs":["a","b","c"]}'; // < SHRINK_MIN_EXISTING_BYTES
  const next = '{"t":1}';
  assert.strictEqual(isSuspiciousOverwrite(existing, next), null);
});

console.log('\n=== safeWrite — happy paths ===');

await test('first write (nothing stored) succeeds without a backup', async () => {
  const storage = createMockStorage();
  const r = await safeWrite(storage, 'k', '{"a":1}');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(storage._store['k'], '{"a":1}');
  assert.ok(!('k' + BACKUP_SUFFIX in storage._store), 'no backup on first write');
});

await test('overwrite writes a one-generation backup first', async () => {
  const storage = createMockStorage({ k: '{"a":1}' });
  const r = await safeWrite(storage, 'k', '{"a":2}');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(storage._store['k'], '{"a":2}');
  assert.strictEqual(storage._store['k' + BACKUP_SUFFIX], '{"a":1}');
});

await test('backup rotates: only the previous generation is kept', async () => {
  const storage = createMockStorage({ k: '{"a":1}' });
  await safeWrite(storage, 'k', '{"a":2}');
  await safeWrite(storage, 'k', '{"a":3}');
  assert.strictEqual(storage._store['k'], '{"a":3}');
  assert.strictEqual(storage._store['k' + BACKUP_SUFFIX], '{"a":2}');
});

await test('unchanged payload is a successful no-op (no backup churn)', async () => {
  const storage = createMockStorage({ k: '{"a":1}' });
  const r = await safeWrite(storage, 'k', '{"a":1}');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.skipped, true);
  assert.ok(!('k' + BACKUP_SUFFIX in storage._store), 'no backup for a no-op');
});

console.log('\n=== safeWrite — anti-clobber ===');

await test('empty overwrite is refused, quarantined, and warned', async () => {
  const storage = createMockStorage({ k: '{"real":"data"}' });
  warnings.length = 0;
  const r = await safeWrite(storage, 'k', '{}', { label: 'test-layer' });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'empty-overwrite');
  assert.strictEqual(r.quarantined, true);
  assert.strictEqual(storage._store['k'], '{"real":"data"}', 'original intact');
  assert.strictEqual(storage._store['k' + QUARANTINE_SUFFIX], '{}');
  assert.ok(warnings.length === 1 && warnings[0].includes('test-layer'), 'console.warn fired with label');
});

await test('dramatic shrink is refused and quarantined; original intact', async () => {
  const big = JSON.stringify({ data: 'x'.repeat(SHRINK_MIN_EXISTING_BYTES * 2) });
  const storage = createMockStorage({ k: big });
  const r = await safeWrite(storage, 'k', '{"data":"x"}');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'shrink-overwrite');
  assert.strictEqual(storage._store['k'], big);
  assert.strictEqual(storage._store['k' + QUARANTINE_SUFFIX], '{"data":"x"}');
});

await test('default-equivalent payload is refused via isDefaultPayload', async () => {
  const defaults = '{"a":0}';
  const storage = createMockStorage({ k: '{"a":42}' });
  const r = await safeWrite(storage, 'k', defaults, {
    isDefaultPayload: (j) => j === defaults,
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'default-overwrite');
  assert.strictEqual(storage._store['k'], '{"a":42}');
});

console.log('\n=== safeWrite — intentional clear ===');

await test('intentionalClear writes an empty payload WITH backup first', async () => {
  const storage = createMockStorage({ k: '{"real":"data"}' });
  const r = await safeWrite(storage, 'k', '{}', { intentionalClear: true });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(storage._store['k'], '{}');
  assert.strictEqual(storage._store['k' + BACKUP_SUFFIX], '{"real":"data"}', 'cleared data recoverable');
});

await test('intentionalClear bypasses the shrink guard too', async () => {
  const big = JSON.stringify({ data: 'x'.repeat(SHRINK_MIN_EXISTING_BYTES * 2) });
  const storage = createMockStorage({ k: big });
  const r = await safeWrite(storage, 'k', '{"data":"x"}', { intentionalClear: true });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(storage._store['k'], '{"data":"x"}');
  assert.strictEqual(storage._store['k' + BACKUP_SUFFIX], big);
});

console.log('\n=== safeWrite — adapter edge cases ===');

await test('missing storage / missing get/set -> no-storage', async () => {
  assert.deepStrictEqual(await safeWrite(null, 'k', '{}'), { ok: false, reason: 'no-storage' });
  assert.deepStrictEqual(await safeWrite({}, 'k', '{}'), { ok: false, reason: 'no-storage' });
  assert.deepStrictEqual(
    await safeWrite({ set: async () => true }, 'k', '{}'),
    { ok: false, reason: 'no-storage' },
  );
});

await test('get() throwing (polyfill missing-key) is treated as nothing stored', async () => {
  const storage = createMockStorage();
  const r = await safeWrite(storage, 'never-written', '{"a":1}');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(storage._store['never-written'], '{"a":1}');
});

await test('set() throwing -> ok:false with error reason; nothing half-written', async () => {
  const storage = {
    get: async () => { throw new Error('Key not found'); },
    set: async () => { throw new Error('quota exceeded'); },
  };
  const r = await safeWrite(storage, 'k', '{"a":1}');
  assert.strictEqual(r.ok, false);
  assert.ok(r.reason.includes('quota exceeded'));
});

await test('set() returning null -> ok:false set-returned-null', async () => {
  const storage = {
    get: async () => { throw new Error('Key not found'); },
    set: async () => null,
  };
  const r = await safeWrite(storage, 'k', '{"a":1}');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'set-returned-null');
});

console.log('\n=== createHydrationGate ===');

await test('gate starts disarmed and settles exactly once', () => {
  const gate = createHydrationGate();
  assert.strictEqual(gate.isSettled(), false, 'auto-save must start disarmed');
  gate.settle();
  assert.strictEqual(gate.isSettled(), true);
  gate.settle(); // idempotent
  assert.strictEqual(gate.isSettled(), true);
});

await test('restore-race simulation: save deferred until restore settles', async () => {
  // Simulates the FinancialModel auto-save effect: the debounced save
  // checks the gate at fire time and skips while the restore is in flight.
  const storage = createMockStorage({ model: '{"sarahRate":275}' });
  const gate = createHydrationGate();
  const attemptAutoSave = async (json) => {
    if (!gate.isSettled()) return { ok: false, reason: 'not-hydrated' };
    return safeWrite(storage, 'model', json);
  };
  // Boot: debounce timer fires with INITIAL_STATE before restore lands.
  const early = await attemptAutoSave('{"sarahRate":0}');
  assert.strictEqual(early.ok, false);
  assert.strictEqual(early.reason, 'not-hydrated');
  assert.strictEqual(storage._store['model'], '{"sarahRate":275}', 'stored data untouched');
  // Restore settles; subsequent saves go through (with backup).
  gate.settle();
  const later = await attemptAutoSave('{"sarahRate":300}');
  assert.strictEqual(later.ok, true);
  assert.strictEqual(storage._store['model'], '{"sarahRate":300}');
  assert.strictEqual(storage._store['model' + BACKUP_SUFFIX], '{"sarahRate":275}');
});

console.log('\n=== mergeScenarioLists ===');

await test('stored-only scenarios survive the merge; memory wins on conflicts', () => {
  const memory = [{ name: 'A', state: { v: 'mem' } }];
  const stored = [{ name: 'A', state: { v: 'disk' } }, { name: 'B', state: { v: 'disk' } }];
  const merged = mergeScenarioLists(memory, stored);
  assert.strictEqual(merged.length, 2);
  assert.strictEqual(merged.find((s) => s.name === 'A').state.v, 'mem');
  assert.strictEqual(merged.find((s) => s.name === 'B').state.v, 'disk');
});

await test('merge tolerates non-array / junk inputs', () => {
  assert.deepStrictEqual(mergeScenarioLists(null, null), []);
  assert.deepStrictEqual(mergeScenarioLists(undefined, 'garbage'), []);
  const merged = mergeScenarioLists([{ name: 'A' }, null], [undefined, { name: 'B' }]);
  assert.deepStrictEqual(merged.map((s) => s.name), ['A', 'B']);
});

console.warn = realWarn;

console.log(`\n${'='.repeat(60)}`);
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'='.repeat(60)}\n`);

if (failed > 0) process.exit(1);
