/**
 * Tests for the dev harness storage reset (remediation 1.7):
 * ?reset_storage=1 / clearStorage / resetStorage must snapshot all fs_*
 * keys to a timestamped backup key BEFORE deleting anything.
 *
 * Run with: node src/testing/__tests__/uiHarness.test.js
 */
import assert from 'node:assert';
import { resetStorageWithBackup } from '../uiHarness.js';

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

const BACKUP_PREFIX = 'fin-harness-reset-backup-';

// Minimal localStorage mock: data lives as own enumerable props (matching
// how Object.keys(window.localStorage) works in the browser).
function createMockLocalStorage(initial = {}) {
  const ls = {};
  Object.defineProperties(ls, {
    getItem: { value(k) { return Object.prototype.hasOwnProperty.call(this, k) ? this[k] : null; } },
    setItem: { value(k, v) { this[k] = String(v); } },
    removeItem: { value(k) { delete this[k]; } },
  });
  Object.assign(ls, initial);
  return ls;
}

function withWindow(localStorage, fn) {
  globalThis.window = { localStorage };
  try { return fn(); } finally { delete globalThis.window; }
}

function backupKeys(ls) {
  return Object.keys(ls).filter((k) => k.startsWith(BACKUP_PREFIX)).sort();
}

console.log('\n=== resetStorageWithBackup ===');

await test('snapshots every fs_* key into a timestamped backup BEFORE deleting', () => {
  const ls = createMockLocalStorage({
    'fs_fin-model-state': '{"sarahRate":275}',
    'fs_fin-actuals': '{"0":{"transactions":[]}}',
    'fs_fin-scenarios': '[{"name":"plan"}]',
    'unrelated-key': 'untouched',
  });
  withWindow(ls, () => {
    const deleted = resetStorageWithBackup();
    assert.strictEqual(deleted, 3, 'returns the number of fs_* keys deleted');
    // fs_* keys are gone…
    assert.ok(!('fs_fin-model-state' in ls));
    assert.ok(!('fs_fin-actuals' in ls));
    assert.ok(!('fs_fin-scenarios' in ls));
    // …non-fs keys untouched…
    assert.strictEqual(ls['unrelated-key'], 'untouched');
    // …and a single backup key holds the full snapshot.
    const backups = backupKeys(ls);
    assert.strictEqual(backups.length, 1);
    assert.ok(!backups[0].startsWith('fs_'), 'backup key must survive future resets');
    const snapshot = JSON.parse(ls[backups[0]]);
    assert.deepStrictEqual(snapshot, {
      'fs_fin-model-state': '{"sarahRate":275}',
      'fs_fin-actuals': '{"0":{"transactions":[]}}',
      'fs_fin-scenarios': '[{"name":"plan"}]',
    });
  });
});

await test('empty storage: no backup written, returns 0', () => {
  const ls = createMockLocalStorage({ 'unrelated-key': 'x' });
  withWindow(ls, () => {
    const deleted = resetStorageWithBackup();
    assert.strictEqual(deleted, 0);
    assert.strictEqual(backupKeys(ls).length, 0, 'no pointless empty backup');
    assert.strictEqual(ls['unrelated-key'], 'x');
  });
});

await test('prunes old reset backups beyond the keep window (oldest first)', () => {
  const ls = createMockLocalStorage({ 'fs_fin-model-state': '{"a":1}' });
  // Pre-seed 6 old backups with ascending timestamps.
  for (let i = 0; i < 6; i++) {
    ls[`${BACKUP_PREFIX}2026-01-0${i + 1}T00-00-00-000Z`] = '{}';
  }
  withWindow(ls, () => {
    resetStorageWithBackup();
    const backups = backupKeys(ls);
    assert.strictEqual(backups.length, 5, 'keeps at most 5 backups');
    assert.ok(!backups.includes(`${BACKUP_PREFIX}2026-01-01T00-00-00-000Z`), 'oldest pruned');
    assert.ok(!backups.includes(`${BACKUP_PREFIX}2026-01-02T00-00-00-000Z`), 'second-oldest pruned');
    // The brand-new backup (today's timestamp sorts after 2026-01-*) survived.
    const fresh = backups[backups.length - 1];
    assert.deepStrictEqual(JSON.parse(ls[fresh]), { 'fs_fin-model-state': '{"a":1}' });
  });
});

await test('no window (SSR/node): safe no-op returning 0', () => {
  assert.strictEqual(typeof window, 'undefined', 'precondition');
  assert.strictEqual(resetStorageWithBackup(), 0);
});

console.log(`\n${'='.repeat(60)}`);
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'='.repeat(60)}\n`);

if (failed > 0) process.exit(1);
