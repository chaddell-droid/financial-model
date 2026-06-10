/**
 * Tests for advisor keyStore.
 *
 * Run with: node src/advisor/__tests__/keyStore.test.js
 */
import assert from 'node:assert';
import { getKey, setKey, clearKey, hasKey, keySource } from '../keyStore.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      return result.then(
        () => { passed++; console.log(`  PASS  ${name}`); },
        (err) => { failed++; console.log(`  FAIL  ${name}\n        ${err.message}`); },
      );
    }
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${err.message}`);
  }
}

// In-memory fake of window.storage matching the polyfill shape (main.jsx:9-49).
function makeFakeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    get: async (key) => {
      if (!data.has(key)) throw new Error(`Key not found: ${key}`);
      return { key, value: data.get(key), shared: false };
    },
    set: async (key, value) => {
      data.set(key, value);
      return { key, value, shared: false };
    },
    delete: async (key) => {
      data.delete(key);
      return { key, deleted: true, shared: false };
    },
    list: async () => ({ keys: [...data.keys()], shared: false }),
    _data: data,
  };
}

console.log('\n=== keyStore — basic round-trip ===');

await test('getKey returns null when storage is empty and no env', async () => {
  const storage = makeFakeStorage();
  const k = await getKey(storage);
  assert.strictEqual(k, null);
});

await test('setKey then getKey round-trips a string (default: session tier)', async () => {
  const storage = makeFakeStorage();
  await setKey('sk-ant-test-12345', storage);
  const k = await getKey(storage);
  assert.strictEqual(k, 'sk-ant-test-12345');
  await clearKey(storage);
});

await test('setKey trims whitespace', async () => {
  const storage = makeFakeStorage();
  await setKey('  sk-ant-spaces  ', storage);
  const k = await getKey(storage);
  assert.strictEqual(k, 'sk-ant-spaces');
  await clearKey(storage);
});

await test('setKey rejects empty/whitespace input', async () => {
  const storage = makeFakeStorage();
  assert.strictEqual(await setKey('', storage), false);
  assert.strictEqual(await setKey('   ', storage), false);
  assert.strictEqual(await setKey(null, storage), false);
  assert.strictEqual(await getKey(storage), null);
});

await test('clearKey removes the stored key', async () => {
  const storage = makeFakeStorage({ 'advisor-key': 'sk-ant-existing' });
  assert.strictEqual(await getKey(storage), 'sk-ant-existing');
  await clearKey(storage);
  assert.strictEqual(await getKey(storage), null);
});

await test('hasKey reports correctly', async () => {
  const storage = makeFakeStorage();
  assert.strictEqual(await hasKey(storage), false);
  await setKey('sk-ant-x', storage);
  assert.strictEqual(await hasKey(storage), true);
  await clearKey(storage);
  assert.strictEqual(await hasKey(storage), false);
});

await test('keySource reports null when empty', async () => {
  const storage = makeFakeStorage();
  assert.strictEqual(await keySource(storage), null);
});

await test('keySource reports "storage" when remembered (persisted)', async () => {
  const storage = makeFakeStorage();
  await setKey('sk-ant-stored', storage, { remember: true });
  assert.strictEqual(await keySource(storage), 'storage');
  await clearKey(storage);
});

await test('Operations gracefully handle missing storage adapter', async () => {
  // No storage and no env → null/false everywhere, no throws.
  assert.strictEqual(await getKey(null), null);
  assert.strictEqual(await hasKey(null), false);
  assert.strictEqual(await keySource(null), null);
  // Session-tier set works without a persistent adapter…
  assert.strictEqual(await setKey('sk-x', null), true);
  assert.strictEqual(await getKey(null), 'sk-x');
  assert.strictEqual(await clearKey(null), true);
  assert.strictEqual(await getKey(null), null);
  // …but a remembered (persisted) set requires the adapter.
  assert.strictEqual(await setKey('sk-x', null, { remember: true }), false);
});

await test('getKey survives storage.get throwing "not found"', async () => {
  // The polyfill throws on missing keys (see main.jsx:13). Verify we tolerate it.
  const storage = makeFakeStorage();
  // Storage starts empty, so .get('advisor-key') will throw — getKey must return null, not propagate.
  const k = await getKey(storage);
  assert.strictEqual(k, null);
});

console.log('\n=== keyStore — remember toggle (session vs persisted) ===');

await test('Default setKey is session-only: nothing written to persistent storage', async () => {
  const storage = makeFakeStorage();
  await setKey('sk-ant-session-only', storage);
  assert.strictEqual(await getKey(storage), 'sk-ant-session-only');
  assert.strictEqual(await keySource(storage), 'session');
  assert.strictEqual(storage._data.has('advisor-key'), false, 'default save must NOT persist the key');
  await clearKey(storage);
});

await test('remember: true persists to storage and reports source "storage"', async () => {
  const storage = makeFakeStorage();
  await setKey('sk-ant-persisted', storage, { remember: true });
  assert.strictEqual(storage._data.get('advisor-key'), 'sk-ant-persisted');
  assert.strictEqual(await keySource(storage), 'storage');
  assert.strictEqual(await getKey(storage), 'sk-ant-persisted');
  await clearKey(storage);
});

await test('Saving with remember OFF removes a previously-persisted key (single source of truth)', async () => {
  const storage = makeFakeStorage();
  await setKey('sk-ant-old-persisted', storage, { remember: true });
  await setKey('sk-ant-new-session', storage); // remember defaults to false
  assert.strictEqual(await getKey(storage), 'sk-ant-new-session');
  assert.strictEqual(await keySource(storage), 'session');
  assert.strictEqual(storage._data.has('advisor-key'), false, 'persisted copy must be removed');
  await clearKey(storage);
});

await test('Saving with remember ON replaces the session copy', async () => {
  const storage = makeFakeStorage();
  await setKey('sk-ant-session-first', storage);
  await setKey('sk-ant-then-persisted', storage, { remember: true });
  assert.strictEqual(await getKey(storage), 'sk-ant-then-persisted');
  assert.strictEqual(await keySource(storage), 'storage');
  await clearKey(storage);
});

await test('clearKey clears BOTH tiers', async () => {
  const storage = makeFakeStorage();
  await setKey('sk-ant-persisted', storage, { remember: true });
  await setKey('sk-ant-session', storage); // wipes persisted, sets session
  await setKey('sk-ant-persisted-2', storage, { remember: true });
  await clearKey(storage);
  assert.strictEqual(await getKey(storage), null);
  assert.strictEqual(await keySource(storage), null);
  assert.strictEqual(storage._data.has('advisor-key'), false);
});

console.log(`\n${'='.repeat(60)}`);
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'='.repeat(60)}\n`);

if (failed > 0) process.exit(1);
