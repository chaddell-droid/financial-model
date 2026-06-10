/**
 * railConfigStorage tests (remediation Phase 9 — the rail subsystem had an
 * empty __tests__ dir). Covers round-trips, malformed payloads, missing
 * window.storage, and the safeWrite guards added in remediation 1.3/1.5.
 *
 * Run with: node src/rail/__tests__/railConfigStorage.test.js
 */
import assert from 'node:assert';
import {
  loadRailConfig,
  saveRailConfig,
  loadSavedRailConfig,
  saveSavedRailConfig,
  clearRailConfig,
  buildPersistedRailConfig,
} from '../railConfigStorage.js';
import { BACKUP_SUFFIX, QUARANTINE_SUFFIX } from '../../state/safeStorage.js';

const LIVE_KEY = 'fin-rail-config';
const SAVED_KEY = 'fin-rail-config-saved';

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
  } finally {
    delete globalThis.window; // never leak the mock between tests
  }
}

// Mirrors the window.storage polyfill in src/main.jsx (get THROWS on missing).
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

function installWindow(storage) {
  globalThis.window = { storage };
  return storage;
}

// Silence + capture the guard's console.warn for the refusal tests.
const warnings = [];
const realWarn = console.warn;
console.warn = (...args) => { warnings.push(args.join(' ')); };

console.log('\n=== round-trips ===');

await test('live config round-trips through save -> load', async () => {
  installWindow(createMockStorage());
  const config = { overview: ['savings', 'bridge'], income: [], railWidth: 640 };
  await saveRailConfig(config);
  assert.deepStrictEqual(await loadRailConfig(), config);
});

await test('saved checkpoint round-trips independently of the live config', async () => {
  const storage = installWindow(createMockStorage());
  await saveRailConfig({ overview: ['bridge'] });
  await saveSavedRailConfig({ overview: ['savings', 'networth'] });
  assert.deepStrictEqual(await loadRailConfig(), { overview: ['bridge'] });
  assert.deepStrictEqual(await loadSavedRailConfig(), { overview: ['savings', 'networth'] });
  assert.ok(LIVE_KEY in storage._store && SAVED_KEY in storage._store, 'two distinct keys');
});

await test('buildPersistedRailConfig + save preserves railWidth across a chart-list write (fix 1.5)', async () => {
  installWindow(createMockStorage());
  await saveRailConfig(buildPersistedRailConfig({ overview: ['savings'] }, 700));
  await saveRailConfig(buildPersistedRailConfig({ overview: ['savings', 'networth'] }, 700));
  const loaded = await loadRailConfig();
  assert.strictEqual(loaded.railWidth, 700);
  assert.deepStrictEqual(loaded.overview, ['savings', 'networth']);
});

console.log('\n=== malformed payloads ===');

await test('malformed JSON loads as null instead of throwing', async () => {
  installWindow(createMockStorage({ [LIVE_KEY]: 'not json{{{', [SAVED_KEY]: '[broken' }));
  assert.strictEqual(await loadRailConfig(), null);
  assert.strictEqual(await loadSavedRailConfig(), null);
});

await test('valid-JSON-but-wrong-shape payloads load as null (array, null, scalar)', async () => {
  installWindow(createMockStorage({ [LIVE_KEY]: '["savings"]' }));
  assert.strictEqual(await loadRailConfig(), null, 'array rejected');
  installWindow(createMockStorage({ [LIVE_KEY]: 'null' }));
  assert.strictEqual(await loadRailConfig(), null, 'null rejected');
  installWindow(createMockStorage({ [LIVE_KEY]: '42' }));
  assert.strictEqual(await loadRailConfig(), null, 'scalar rejected');
  installWindow(createMockStorage({ [LIVE_KEY]: '' }));
  assert.strictEqual(await loadRailConfig(), null, 'empty string rejected');
});

console.log('\n=== missing window.storage ===');

await test('no window at all: load returns null, save/clear resolve without throwing', async () => {
  // No globalThis.window installed.
  assert.strictEqual(await loadRailConfig(), null);
  assert.strictEqual(await loadSavedRailConfig(), null);
  await saveRailConfig({ overview: ['savings'] }); // must not throw
  await saveSavedRailConfig({ overview: ['savings'] });
  await clearRailConfig();
});

await test('window present but storage missing/partial: load null, save swallows', async () => {
  globalThis.window = {};
  assert.strictEqual(await loadRailConfig(), null);
  await saveRailConfig({ overview: ['savings'] }); // safeWrite returns no-storage; no throw
  globalThis.window = { storage: { set: async () => true } }; // adapter without get()
  assert.strictEqual(await loadRailConfig(), null, 'get() missing -> null');
  assert.strictEqual(await loadSavedRailConfig(), null);
});

await test('storage.set throwing (quota) is swallowed by saveRailConfig', async () => {
  globalThis.window = {
    storage: {
      get: async () => { throw new Error('Key not found'); },
      set: async () => { throw new Error('quota exceeded'); },
    },
  };
  await saveRailConfig({ overview: ['savings'] }); // must not throw
  await saveSavedRailConfig({ overview: ['savings'] });
});

console.log('\n=== safeWrite guards (remediation 1.3) ===');

await test('overwrite rotates a one-generation .bak of the previous config', async () => {
  const storage = installWindow(createMockStorage());
  await saveRailConfig({ overview: ['savings'] });
  await saveRailConfig({ overview: ['savings', 'networth'] });
  assert.strictEqual(storage._store[LIVE_KEY + BACKUP_SUFFIX], JSON.stringify({ overview: ['savings'] }));
  await saveRailConfig({ overview: ['savings', 'networth', 'bridge'] });
  assert.strictEqual(
    storage._store[LIVE_KEY + BACKUP_SUFFIX],
    JSON.stringify({ overview: ['savings', 'networth'] }),
    'backup holds exactly the previous generation',
  );
});

await test('empty config over a real one is refused and quarantined; original intact', async () => {
  const real = JSON.stringify({ overview: ['savings'], railWidth: 600 });
  const storage = installWindow(createMockStorage({ [LIVE_KEY]: real }));
  warnings.length = 0;
  await saveRailConfig({});
  assert.strictEqual(storage._store[LIVE_KEY], real, 'stored config untouched');
  assert.strictEqual(storage._store[LIVE_KEY + QUARANTINE_SUFFIX], '{}', 'attempt parked in quarantine');
  assert.ok(warnings.some((w) => w.includes('rail-config')), 'guard warned with the layer label');
});

await test('saved-checkpoint writes are guarded too (empty refusal + label)', async () => {
  const real = JSON.stringify({ overview: ['savings', 'networth'] });
  const storage = installWindow(createMockStorage({ [SAVED_KEY]: real }));
  warnings.length = 0;
  await saveSavedRailConfig({});
  assert.strictEqual(storage._store[SAVED_KEY], real);
  assert.strictEqual(storage._store[SAVED_KEY + QUARANTINE_SUFFIX], '{}');
  assert.ok(warnings.some((w) => w.includes('rail-config-saved')));
});

await test('clearRailConfig is an INTENTIONAL clear: backup first, then nulled', async () => {
  const real = JSON.stringify({ overview: ['savings'], railWidth: 600 });
  const storage = installWindow(createMockStorage({ [LIVE_KEY]: real }));
  await clearRailConfig();
  assert.strictEqual(storage._store[LIVE_KEY + BACKUP_SUFFIX], real, 'cleared config recoverable');
  assert.strictEqual(await loadRailConfig(), null, 'next load falls back to defaults');
});

await test('saving the identical config is a no-op (no backup churn)', async () => {
  const real = JSON.stringify({ overview: ['savings'] });
  const storage = installWindow(createMockStorage({ [LIVE_KEY]: real }));
  await saveRailConfig({ overview: ['savings'] });
  assert.ok(!(LIVE_KEY + BACKUP_SUFFIX in storage._store), 'no backup written for a no-op save');
});

console.warn = realWarn;

console.log(`\n${'='.repeat(60)}`);
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'='.repeat(60)}\n`);

if (failed > 0) process.exit(1);
