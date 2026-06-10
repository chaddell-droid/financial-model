/**
 * Tests for advisor conversation store.
 *
 * Run with: node src/advisor/__tests__/conversationStore.test.js
 */
import assert from 'node:assert';
import {
  loadAll, save, createNew, appendMessage, updateMessage, deleteConversation,
  exportAsMarkdown, exportAsJSON, fingerprint, uuid, trimForStorage,
} from '../conversationStore.js';
import { ADVISOR_STORAGE_KEY_CONVERSATIONS, ADVISOR_MAX_CONVERSATIONS } from '../config.js';
import { gatherStateWithOverrides } from '../../state/gatherState.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      return result.then(() => { passed++; console.log(`  PASS  ${name}`); },
        (err) => { failed++; console.log(`  FAIL  ${name}\n        ${err.message}`); });
    }
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (err) { failed++; console.log(`  FAIL  ${name}\n        ${err.message}`); }
}

function makeFakeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    get: async (key) => {
      if (!data.has(key)) throw new Error(`Key not found: ${key}`);
      return { key, value: data.get(key), shared: false };
    },
    set: async (key, value) => { data.set(key, value); return { key, value, shared: false }; },
    delete: async (key) => { data.delete(key); return { key, deleted: true, shared: false }; },
    list: async () => ({ keys: [...data.keys()], shared: false }),
    _data: data,
  };
}

console.log('\n=== uuid + fingerprint ===');

test('uuid produces unique strings', () => {
  const ids = new Set();
  for (let i = 0; i < 100; i++) ids.add(uuid());
  assert.strictEqual(ids.size, 100);
});

test('fingerprint is deterministic for the same state', () => {
  const s = gatherStateWithOverrides({ chadJob: true, chadJobSalary: 165000 });
  assert.strictEqual(fingerprint(s), fingerprint(s));
});

test('fingerprint differs when state changes', () => {
  const a = gatherStateWithOverrides({ chadJobSalary: 165000 });
  const b = gatherStateWithOverrides({ chadJobSalary: 175000 });
  assert.notStrictEqual(fingerprint(a), fingerprint(b));
});

test('fingerprint of null/undefined state is "0"', () => {
  assert.strictEqual(fingerprint(null), '0');
  assert.strictEqual(fingerprint(undefined), '0');
});

console.log('\n=== createNew + appendMessage + updateMessage ===');

test('createNew produces a conversation with id, timestamps, fingerprint', () => {
  const state = gatherStateWithOverrides({});
  const c = createNew({ scenarioName: 'baseline', state });
  assert.ok(c.id);
  assert.ok(c.createdAt);
  assert.ok(c.updatedAt);
  assert.strictEqual(c.scenarioName, 'baseline');
  assert.strictEqual(c.stateFingerprint, fingerprint(state));
  assert.deepStrictEqual(c.messages, []);
});

test('appendMessage adds message and updates timestamp', () => {
  const c = createNew({ state: gatherStateWithOverrides({}) });
  const c2 = appendMessage(c, { role: 'user', content: 'hello' });
  assert.strictEqual(c2.messages.length, 1);
  assert.strictEqual(c2.messages[0].role, 'user');
  assert.ok(c2.messages[0].id);
  assert.ok(c2.messages[0].timestamp);
});

test('updateMessage patches by id', () => {
  let c = createNew({ state: gatherStateWithOverrides({}) });
  c = appendMessage(c, { role: 'assistant', content: 'thinking...' });
  const id = c.messages[0].id;
  c = updateMessage(c, id, { content: 'final answer' });
  assert.strictEqual(c.messages[0].content, 'final answer');
});

test('deleteConversation removes by id', () => {
  const a = createNew({ state: gatherStateWithOverrides({}) });
  const b = createNew({ state: gatherStateWithOverrides({}) });
  const list = [a, b];
  const after = deleteConversation(list, a.id);
  assert.strictEqual(after.length, 1);
  assert.strictEqual(after[0].id, b.id);
});

console.log('\n=== save + loadAll round-trip ===');

await test('Save and load round-trips conversations', async () => {
  const storage = makeFakeStorage();
  const a = createNew({ state: gatherStateWithOverrides({}) });
  const b = createNew({ state: gatherStateWithOverrides({}) });
  await save([a, b], storage);
  const loaded = await loadAll(storage);
  assert.strictEqual(loaded.length, 2);
  assert.deepStrictEqual(loaded.map((c) => c.id).sort(), [a.id, b.id].sort());
});

await test('loadAll returns [] when nothing stored', async () => {
  const storage = makeFakeStorage();
  const loaded = await loadAll(storage);
  assert.deepStrictEqual(loaded, []);
});

await test('loadAll returns [] on malformed JSON', async () => {
  const storage = makeFakeStorage({ [ADVISOR_STORAGE_KEY_CONVERSATIONS]: 'not-json' });
  const loaded = await loadAll(storage);
  assert.deepStrictEqual(loaded, []);
});

await test('loadAll returns [] on missing storage adapter', async () => {
  const loaded = await loadAll(null);
  assert.deepStrictEqual(loaded, []);
});

await test('Save trims heavy fields (monthlyData)', async () => {
  const storage = makeFakeStorage();
  let c = createNew({ state: gatherStateWithOverrides({}) });
  // Append an assistant message with a tool call result containing monthlyData
  const fatRow = { month: 0, balance: 200000 };
  const fatMonthlyData = Array.from({ length: 200 }, () => fatRow);
  c = appendMessage(c, {
    role: 'assistant',
    content: [{ type: 'text', text: 'ok' }],
    toolCalls: [{ name: 'runProjection', input: {}, result: { ok: true, monthlyData: fatMonthlyData }, durationMs: 12 }],
  });
  await save([c], storage);
  const loaded = await loadAll(storage);
  // monthlyData should have been replaced by trim marker
  const tc = loaded[0].messages[0].toolCalls[0];
  assert.strictEqual(tc.result.monthlyData, '<trimmed-for-storage>');
});

await test('Save preserves tool-call ids (React keys after reload)', async () => {
  const storage = makeFakeStorage();
  let c = createNew({ state: gatherStateWithOverrides({}) });
  c = appendMessage(c, {
    role: 'assistant',
    content: [{ type: 'text', text: 'ok' }],
    toolCalls: [
      { id: 'toolu_01', name: 'runProjection', input: {}, result: { ok: true }, durationMs: 5 },
      { id: 'toolu_02', name: 'getCurrentState', input: {}, result: { ok: true }, durationMs: 3 },
    ],
  });
  await save([c], storage);
  const loaded = await loadAll(storage);
  const ids = loaded[0].messages[0].toolCalls.map((tc) => tc.id);
  assert.deepStrictEqual(ids, ['toolu_01', 'toolu_02'], 'tool-call ids must survive the storage round-trip');
});

test('exportAsJSON preserves tool-call ids', () => {
  let c = createNew({ scenarioName: null, state: gatherStateWithOverrides({}) });
  c = appendMessage(c, {
    role: 'assistant',
    content: [{ type: 'text', text: 'ok' }],
    toolCalls: [{ id: 'toolu_x', name: 'runProjection', input: {}, result: { ok: true }, durationMs: 2 }],
  });
  const parsed = JSON.parse(exportAsJSON(c));
  assert.strictEqual(parsed.messages[0].toolCalls[0].id, 'toolu_x');
});

console.log('\n=== pruning at cap ===');

await test(`Save prunes oldest when count > ADVISOR_MAX_CONVERSATIONS (${ADVISOR_MAX_CONVERSATIONS})`, async () => {
  const storage = makeFakeStorage();
  // Build cap+5 conversations, oldest first
  const overflow = 5;
  const all = [];
  for (let i = 0; i < ADVISOR_MAX_CONVERSATIONS + overflow; i++) {
    const c = createNew({ state: gatherStateWithOverrides({}) });
    // Spread updatedAt across distinct timestamps so sort is deterministic
    c.updatedAt = new Date(Date.now() - (ADVISOR_MAX_CONVERSATIONS + overflow - i) * 1000).toISOString();
    all.push(c);
  }
  const result = await save(all, storage);
  assert.strictEqual(result.pruned, overflow);
  const loaded = await loadAll(storage);
  assert.strictEqual(loaded.length, ADVISOR_MAX_CONVERSATIONS);
});

console.log('\n=== exports ===');

test('exportAsMarkdown produces readable text with headings', () => {
  let c = createNew({ scenarioName: 'baseline', state: gatherStateWithOverrides({}) });
  c = appendMessage(c, { role: 'user', content: 'How does my plan look?' });
  c = appendMessage(c, {
    role: 'assistant',
    content: [{ type: 'text', text: 'Your final balance is $325,000.' }],
    toolCalls: [{ name: 'runProjection', input: {}, result: { finalBalance: 325000 }, durationMs: 8 }],
    verifier: { stats: { total: 1, covered: 1, mismatchCount: 0 } },
  });
  const md = exportAsMarkdown(c);
  assert.ok(md.includes('# Advisor Conversation'));
  assert.ok(md.includes('## You'));
  assert.ok(md.includes('## Advisor'));
  assert.ok(md.includes('How does my plan look?'));
  assert.ok(md.includes('Your final balance is $325,000.'));
  assert.ok(md.includes('Tool calls'));
  assert.ok(md.includes('runProjection'));
  assert.ok(md.includes('1/1 numbers traced'));
});

test('exportAsMarkdown does not include raw API key strings', () => {
  let c = createNew({ scenarioName: null, state: gatherStateWithOverrides({}) });
  c = appendMessage(c, { role: 'user', content: 'hi' });
  const md = exportAsMarkdown(c);
  assert.ok(!md.includes('sk-ant-'));
});

test('exportAsJSON produces parseable JSON with same conversation id', () => {
  let c = createNew({ scenarioName: null, state: gatherStateWithOverrides({}) });
  c = appendMessage(c, { role: 'user', content: 'hi' });
  const json = exportAsJSON(c);
  const parsed = JSON.parse(json);
  assert.strictEqual(parsed.id, c.id);
});

console.log('\n=== trimForStorage ===');

test('trimForStorage replaces HEAVY_KEYS with marker', () => {
  const trimmed = trimForStorage({ monthlyData: [1, 2, 3], summary: { finalBalance: 1000 } });
  assert.strictEqual(trimmed.monthlyData, '<trimmed-for-storage>');
  assert.deepStrictEqual(trimmed.summary, { finalBalance: 1000 });
});

test('trimForStorage truncates arrays > 50 entries', () => {
  const trimmed = trimForStorage({ items: Array.from({ length: 100 }, (_, i) => i) });
  assert.strictEqual(trimmed.items.length, 51); // 50 + marker
  assert.ok(trimmed.items[50].__trimmed);
});

test('trimForStorage truncates strings > 5KB', () => {
  const long = 'x'.repeat(8000);
  const trimmed = trimForStorage(long);
  assert.ok(trimmed.length < 6000);
  assert.ok(trimmed.endsWith('[trimmed]'));
});

console.log(`\n${'='.repeat(60)}`);
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'='.repeat(60)}\n`);

if (failed > 0) process.exit(1);
