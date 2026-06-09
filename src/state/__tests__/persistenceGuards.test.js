/**
 * Layer-level persistence-guard tests (remediation 1.3 / 1.4 / 1.5).
 *
 * Exercises each storage layer through the shared safeWrite guard:
 *   - fin-model-state   (autoSave.js)
 *   - fin-scenarios     (merge-after-failed-load composition)
 *   - advisor conversations (conversationStore.js)
 *   - fin-rail-config   (railConfigStorage.js, incl. the railWidth wipe fix)
 *
 * Run with: node src/state/__tests__/persistenceGuards.test.js
 */
import assert from 'node:assert';
import {
  extractModelState, saveModelState, loadModelState, isDefaultModelPayload, STORAGE_KEY,
} from '../autoSave.js';
import { safeWrite, mergeScenarioLists, BACKUP_SUFFIX, QUARANTINE_SUFFIX } from '../safeStorage.js';
import { INITIAL_STATE } from '../initialState.js';
import { loadAll, save, createNew, appendMessage } from '../../advisor/conversationStore.js';
import { ADVISOR_STORAGE_KEY_CONVERSATIONS } from '../../advisor/config.js';
import {
  loadRailConfig, saveRailConfig, clearRailConfig, buildPersistedRailConfig,
} from '../../rail/railConfigStorage.js';

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

// Mirrors the window.storage polyfill in src/main.jsx (get throws on missing).
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

// Silence the guard's console.warn during the refusal tests.
const realWarn = console.warn;
console.warn = () => {};

// ═══════════════════════════════════════════════════════════════════════
// Layer: fin-model-state (autoSave.js)
// ═══════════════════════════════════════════════════════════════════════
console.log('\n=== model-state layer ===');

const MODIFIED_STATE = { ...INITIAL_STATE, sarahRate: 275, totalMonthlySpend: 35000 };
const MODIFIED_JSON = JSON.stringify(extractModelState(MODIFIED_STATE));

await test('isDefaultModelPayload matches only the INITIAL_STATE serialization', () => {
  assert.strictEqual(isDefaultModelPayload(JSON.stringify(extractModelState(INITIAL_STATE))), true);
  assert.strictEqual(isDefaultModelPayload(MODIFIED_JSON), false);
});

await test('restore-race protection: INITIAL_STATE-equivalent save over real data is refused', async () => {
  const storage = createMockStorage({ [STORAGE_KEY]: MODIFIED_JSON });
  const ok = await saveModelState(storage, INITIAL_STATE);
  assert.strictEqual(ok, false, 'default payload must not clobber modified data');
  assert.strictEqual(storage._store[STORAGE_KEY], MODIFIED_JSON, 'stored data untouched');
  assert.ok(storage._store[STORAGE_KEY + QUARANTINE_SUFFIX], 'attempted payload quarantined');
});

await test('intentional RESET_ALL persists factory defaults WITH backup', async () => {
  const storage = createMockStorage({ [STORAGE_KEY]: MODIFIED_JSON });
  const ok = await saveModelState(storage, INITIAL_STATE, { intentionalClear: true });
  assert.strictEqual(ok, true);
  assert.strictEqual(storage._store[STORAGE_KEY], JSON.stringify(extractModelState(INITIAL_STATE)));
  assert.strictEqual(storage._store[STORAGE_KEY + BACKUP_SUFFIX], MODIFIED_JSON, 'reset is recoverable');
});

await test('corrupted-load: unreadable payload survives in .bak after the next save', async () => {
  const storage = createMockStorage({ [STORAGE_KEY]: 'not json{{{' });
  assert.strictEqual(await loadModelState(storage), null, 'corrupt payload loads as null');
  const ok = await saveModelState(storage, MODIFIED_STATE);
  assert.strictEqual(ok, true);
  assert.strictEqual(storage._store[STORAGE_KEY], MODIFIED_JSON);
  assert.strictEqual(storage._store[STORAGE_KEY + BACKUP_SUFFIX], 'not json{{{', 'corrupt original preserved');
});

await test('ordinary modified-over-modified save writes with backup', async () => {
  const storage = createMockStorage({ [STORAGE_KEY]: MODIFIED_JSON });
  const next = { ...MODIFIED_STATE, sarahRate: 300 };
  const ok = await saveModelState(storage, next);
  assert.strictEqual(ok, true);
  assert.strictEqual(storage._store[STORAGE_KEY], JSON.stringify(extractModelState(next)));
  assert.strictEqual(storage._store[STORAGE_KEY + BACKUP_SUFFIX], MODIFIED_JSON);
});

// ═══════════════════════════════════════════════════════════════════════
// Layer: fin-scenarios (merge-after-failed-load composition)
// ═══════════════════════════════════════════════════════════════════════
console.log('\n=== scenarios layer ===');

await test('failed-load flow: re-read + merge keeps disk-only scenarios on the next save', async () => {
  // Simulates FinancialModel.persistScenarios after a load that failed at
  // boot but where storage is readable again at save time.
  const disk = [{ name: 'Old plan', state: { sarahRate: 250 } }];
  const storage = createMockStorage({ 'fin-scenarios': JSON.stringify(disk) });
  const memory = [{ name: 'New plan', state: { sarahRate: 300 } }];
  // re-read + merge (memory wins on name conflicts)
  const stored = JSON.parse(storage._store['fin-scenarios']);
  const merged = mergeScenarioLists(memory, stored);
  const result = await safeWrite(storage, 'fin-scenarios', JSON.stringify(merged), { label: 'scenarios' });
  assert.strictEqual(result.ok, true);
  const final = JSON.parse(storage._store['fin-scenarios']);
  assert.deepStrictEqual(final.map((s) => s.name).sort(), ['New plan', 'Old plan']);
});

await test('failed-load flow: still-unreadable payload survives in .bak after overwrite', async () => {
  const storage = createMockStorage({ 'fin-scenarios': '{"corrupt": tru' });
  const memory = [{ name: 'New plan', state: { sarahRate: 300 } }];
  const result = await safeWrite(storage, 'fin-scenarios', JSON.stringify(memory), { label: 'scenarios' });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(storage._store['fin-scenarios' + BACKUP_SUFFIX], '{"corrupt": tru');
});

await test('deleting the last scenario persists via intentionalClear with backup', async () => {
  const disk = JSON.stringify([{ name: 'Only plan', state: { sarahRate: 250 } }]);
  const storage = createMockStorage({ 'fin-scenarios': disk });
  // Without the escape hatch the empty list is refused…
  const refused = await safeWrite(storage, 'fin-scenarios', '[]', { label: 'scenarios' });
  assert.strictEqual(refused.ok, false);
  assert.strictEqual(storage._store['fin-scenarios'], disk);
  // …with it (the deleteScenario path) it sticks, backup taken first.
  const result = await safeWrite(storage, 'fin-scenarios', '[]', { intentionalClear: true, label: 'scenarios' });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(storage._store['fin-scenarios'], '[]');
  assert.strictEqual(storage._store['fin-scenarios' + BACKUP_SUFFIX], disk);
});

// ═══════════════════════════════════════════════════════════════════════
// Layer: advisor conversations (conversationStore.js)
// ═══════════════════════════════════════════════════════════════════════
console.log('\n=== advisor-conversations layer ===');

function makeConvoWithMessage(text) {
  let c = createNew({ scenarioName: null, state: { sarahRate: 250 } });
  c = appendMessage(c, { role: 'user', content: text });
  return c;
}

await test('empty conversation list does NOT clobber stored history (boot-race shape)', async () => {
  const storage = createMockStorage();
  const existing = [makeConvoWithMessage('important conversation history')];
  await save(existing, storage);
  const before = storage._store[ADVISOR_STORAGE_KEY_CONVERSATIONS];
  const result = await save([], storage);
  assert.strictEqual(result.ok, false, 'empty overwrite refused');
  assert.strictEqual(storage._store[ADVISOR_STORAGE_KEY_CONVERSATIONS], before, 'history intact');
});

await test('intentional clear-all empties the store WITH backup', async () => {
  const storage = createMockStorage();
  const existing = [makeConvoWithMessage('history to clear')];
  await save(existing, storage);
  const before = storage._store[ADVISOR_STORAGE_KEY_CONVERSATIONS];
  const result = await save([], storage, { intentionalClear: true });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(storage._store[ADVISOR_STORAGE_KEY_CONVERSATIONS], '[]');
  assert.strictEqual(storage._store[ADVISOR_STORAGE_KEY_CONVERSATIONS + BACKUP_SUFFIX], before);
});

await test('corrupted-load: loadAll returns []; next save backs up the corrupt payload', async () => {
  const storage = createMockStorage({ [ADVISOR_STORAGE_KEY_CONVERSATIONS]: 'corrupt!!!' });
  assert.deepStrictEqual(await loadAll(storage), []);
  const result = await save([makeConvoWithMessage('fresh start')], storage);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(storage._store[ADVISOR_STORAGE_KEY_CONVERSATIONS + BACKUP_SUFFIX], 'corrupt!!!');
});

await test('ordinary append round-trips and rotates the backup', async () => {
  const storage = createMockStorage();
  const a = makeConvoWithMessage('first');
  await save([a], storage);
  const firstJson = storage._store[ADVISOR_STORAGE_KEY_CONVERSATIONS];
  await save([a, makeConvoWithMessage('second')], storage);
  assert.strictEqual(storage._store[ADVISOR_STORAGE_KEY_CONVERSATIONS + BACKUP_SUFFIX], firstJson);
  const loaded = await loadAll(storage);
  assert.strictEqual(loaded.length, 2);
});

// ═══════════════════════════════════════════════════════════════════════
// Layer: fin-rail-config (railConfigStorage.js) — uses the window global
// ═══════════════════════════════════════════════════════════════════════
console.log('\n=== rail-config layer ===');

await test('buildPersistedRailConfig merges railWidth into the saved object (fix 1.5)', () => {
  const config = { overview: ['savings', 'networth'], risk: ['montecarlo'] };
  const out = buildPersistedRailConfig(config, 640);
  assert.strictEqual(out.railWidth, 640);
  assert.deepStrictEqual(out.overview, ['savings', 'networth']);
  // Input config is not mutated.
  assert.ok(!('railWidth' in config));
});

await test('buildPersistedRailConfig ignores non-finite / missing widths', () => {
  assert.ok(!('railWidth' in buildPersistedRailConfig({ a: [] }, undefined)));
  assert.ok(!('railWidth' in buildPersistedRailConfig({ a: [] }, NaN)));
  assert.ok(!('railWidth' in buildPersistedRailConfig({ a: [] }, '640')));
  assert.deepStrictEqual(buildPersistedRailConfig(null, 520), { railWidth: 520 });
});

await test('regression 1.5: chart add/remove no longer erases the committed railWidth', async () => {
  const storage = createMockStorage();
  globalThis.window = { storage };
  try {
    // 1. User commits a rail width (commitRailWidth path).
    await saveRailConfig(buildPersistedRailConfig({ overview: ['savings'] }, 700));
    assert.strictEqual(JSON.parse(storage._store['fin-rail-config']).railWidth, 700);
    // 2. User adds a chart (updateConfig path — now merges railWidth back in).
    await saveRailConfig(buildPersistedRailConfig({ overview: ['savings', 'networth'] }, 700));
    const stored = JSON.parse(storage._store['fin-rail-config']);
    assert.strictEqual(stored.railWidth, 700, 'railWidth survives a chart-list save');
    assert.deepStrictEqual(stored.overview, ['savings', 'networth']);
    // 3. Round-trip through loadRailConfig.
    const loaded = await loadRailConfig();
    assert.strictEqual(loaded.railWidth, 700);
  } finally {
    delete globalThis.window;
  }
});

await test('clearRailConfig is an intentional clear: backup taken, then nulled', async () => {
  const storage = createMockStorage({ 'fin-rail-config': '{"overview":["savings"],"railWidth":600}' });
  globalThis.window = { storage };
  try {
    await clearRailConfig();
    assert.strictEqual(
      storage._store['fin-rail-config' + BACKUP_SUFFIX],
      '{"overview":["savings"],"railWidth":600}',
    );
    assert.strictEqual(await loadRailConfig(), null, 'config cleared for next load');
  } finally {
    delete globalThis.window;
  }
});

await test('saveRailConfig refuses an empty payload over a real config (guarded)', async () => {
  const real = JSON.stringify({ overview: ['savings'], railWidth: 600 });
  const storage = createMockStorage({ 'fin-rail-config': real });
  globalThis.window = { storage };
  try {
    await saveRailConfig({});
    assert.strictEqual(storage._store['fin-rail-config'], real, 'real config intact');
    assert.strictEqual(storage._store['fin-rail-config' + QUARANTINE_SUFFIX], '{}');
  } finally {
    delete globalThis.window;
  }
});

console.warn = realWarn;

console.log(`\n${'='.repeat(60)}`);
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'='.repeat(60)}\n`);

if (failed > 0) process.exit(1);
