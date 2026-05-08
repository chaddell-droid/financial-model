/**
 * Tests for advisor agent loop — uses a fake Anthropic client that emits
 * scripted streams. No network calls.
 *
 * Run with: node src/advisor/__tests__/agentLoop.test.js
 */
import assert from 'node:assert';
import { streamAdvisorTurn } from '../advisorAgent.js';
import { gatherStateWithOverrides } from '../../state/gatherState.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  const r = fn();
  if (r && typeof r.then === 'function') {
    return r.then(() => { passed++; console.log(`  PASS  ${name}`); },
      (err) => { failed++; console.log(`  FAIL  ${name}\n        ${err.message}`); });
  }
  passed++;
  console.log(`  PASS  ${name}`);
}

/**
 * Fake stream that exposes:
 *   - on('text', cb) and on('contentBlock', cb) listeners
 *   - finalMessage() returning the scripted final result
 *
 * Pass `script` as an array of objects: { textDeltas, toolUse?, stop_reason, usage }
 * The script entries are returned in order across successive .stream() calls
 * (one per agent loop iteration).
 */
function makeFakeClient(script) {
  let idx = 0;
  return {
    messages: {
      stream: (req) => {
        const turn = script[idx];
        if (!turn) throw new Error(`Fake client out of script (called ${idx + 1} times)`);
        idx++;
        const handlers = { text: [], contentBlock: [] };
        // Simulate emitting events synchronously when the caller registers handlers.
        // We defer firing until both handlers are attached using process.nextTick.
        const stream = {
          _request: req,
          on: (event, cb) => { (handlers[event] || (handlers[event] = [])).push(cb); return stream; },
          finalMessage: async () => {
            // Fire text deltas
            for (const delta of turn.textDeltas || []) {
              for (const cb of handlers.text || []) cb(delta);
            }
            // Fire contentBlock events (one per block)
            const content = [];
            if (turn.textDeltas && turn.textDeltas.length > 0) {
              content.push({ type: 'text', text: (turn.textDeltas || []).join('') });
            }
            for (const tu of turn.toolUse || []) {
              content.push({ type: 'tool_use', id: tu.id, name: tu.name, input: tu.input });
              for (const cb of handlers.contentBlock || []) cb({ type: 'tool_use', id: tu.id, name: tu.name, input: tu.input });
            }
            return {
              content,
              stop_reason: turn.stop_reason,
              usage: turn.usage || { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
            };
          },
        };
        return stream;
      },
    },
  };
}

const baseState = () => gatherStateWithOverrides({
  chadJob: true, chadJobSalary: 165000, chadJobStockRefresh: 60000,
  chadCurrentAge: 61, chadWorkMonths: 72, sarahWorkMonths: 96,
});

console.log('\n=== streamAdvisorTurn — single-turn no tools ===');

await test('end_turn with text only — no tool calls', async () => {
  const client = makeFakeClient([
    { textDeltas: ['Hi! ', 'How can I help?'], stop_reason: 'end_turn' },
  ]);
  const captured = { text: '' };
  const out = await streamAdvisorTurn({
    client,
    state: baseState(),
    messages: [],
    userMessage: 'Hello',
    onTextDelta: (d) => { captured.text += d; },
  });
  assert.strictEqual(out.stopReason, 'end_turn');
  assert.strictEqual(captured.text, 'Hi! How can I help?');
  assert.strictEqual(out.toolCalls.length, 0);
  assert.strictEqual(out.assistantText, 'Hi! How can I help?');
});

console.log('\n=== streamAdvisorTurn — tool-use loop ===');

await test('Two-iteration loop: tool_use → tool_result → end_turn', async () => {
  const client = makeFakeClient([
    {
      textDeltas: ['Let me check the projection. '],
      toolUse: [{ id: 'tu_001', name: 'runProjection', input: {} }],
      stop_reason: 'tool_use',
    },
    {
      textDeltas: ['Your final balance looks good.'],
      stop_reason: 'end_turn',
    },
  ]);
  const out = await streamAdvisorTurn({
    client,
    state: baseState(),
    messages: [],
    userMessage: 'How am I doing?',
  });
  assert.strictEqual(out.stopReason, 'end_turn');
  assert.strictEqual(out.toolCalls.length, 1);
  assert.strictEqual(out.toolCalls[0].name, 'runProjection');
  assert.ok(out.toolCalls[0].result.ok);
  assert.ok(out.toolCalls[0].result.summary);
  assert.ok(typeof out.toolCalls[0].result.summary.finalBalance === 'number');
});

await test('Multiple tool calls within one turn', async () => {
  const client = makeFakeClient([
    {
      textDeltas: ['Analyzing... '],
      toolUse: [
        { id: 'tu_a', name: 'getCurrentState', input: {} },
        { id: 'tu_b', name: 'evaluateGoals', input: {} },
      ],
      stop_reason: 'tool_use',
    },
    {
      textDeltas: ['Both look fine.'],
      stop_reason: 'end_turn',
    },
  ]);
  const out = await streamAdvisorTurn({
    client, state: baseState(), messages: [], userMessage: 'Status check',
  });
  assert.strictEqual(out.toolCalls.length, 2);
  assert.deepStrictEqual(out.toolCalls.map((t) => t.name), ['getCurrentState', 'evaluateGoals']);
});

await test('Tool error returns ok=false but does not throw', async () => {
  const client = makeFakeClient([
    {
      textDeltas: [''],
      toolUse: [{ id: 'tu_bad', name: 'whatIf', input: { mutation: { invalidField: 99 } } }],
      stop_reason: 'tool_use',
    },
    {
      textDeltas: ['I cannot mutate that field.'],
      stop_reason: 'end_turn',
    },
  ]);
  const out = await streamAdvisorTurn({
    client, state: baseState(), messages: [], userMessage: 'try a bad mutation',
  });
  assert.strictEqual(out.toolCalls.length, 1);
  assert.strictEqual(out.toolCalls[0].result.ok, false);
  assert.ok(out.toolCalls[0].result.error.includes('Unknown'));
  assert.strictEqual(out.stopReason, 'end_turn');
});

console.log('\n=== usage tracking ===');

await test('Usage accumulates across turns', async () => {
  const client = makeFakeClient([
    {
      textDeltas: ['x'],
      toolUse: [{ id: 'tu', name: 'getCurrentState', input: {} }],
      stop_reason: 'tool_use',
      usage: { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 500, cache_creation_input_tokens: 0 },
    },
    {
      textDeltas: ['done'],
      stop_reason: 'end_turn',
      usage: { input_tokens: 1500, output_tokens: 300, cache_read_input_tokens: 1000, cache_creation_input_tokens: 0 },
    },
  ]);
  const out = await streamAdvisorTurn({
    client, state: baseState(), messages: [], userMessage: 'sum check',
  });
  assert.strictEqual(out.usage.inputTokens, 2500);
  assert.strictEqual(out.usage.outputTokens, 500);
  assert.strictEqual(out.usage.cacheReadTokens, 1500);
  assert.ok(typeof out.usage.estimatedCost === 'number');
  assert.ok(out.usage.estimatedCost > 0);
});

console.log('\n=== verifier integration ===');

await test('Verifier runs over assistantText + toolCalls', async () => {
  // Make the model say "$1,234,567" but a tool returns finalBalance: 1234567
  const client = makeFakeClient([
    {
      textDeltas: ['Final balance: '],
      toolUse: [{ id: 'tu', name: 'runProjection', input: {} }],
      stop_reason: 'tool_use',
    },
    {
      textDeltas: ['$1,234,567 by month 60.'],
      stop_reason: 'end_turn',
    },
  ]);
  // The real runProjection will return whatever the engine computes — for our
  // verifier check, we only need to assert the verifier ran (stats present).
  const out = await streamAdvisorTurn({
    client, state: baseState(), messages: [], userMessage: 'final?',
  });
  assert.ok(out.verifier);
  assert.ok(out.verifier.stats);
  assert.ok(typeof out.verifier.stats.total === 'number');
});

console.log('\n=== safety rails ===');

await test('Iteration cap prevents runaway tool loops', async () => {
  // Build a script that always returns tool_use, never terminates.
  const script = Array.from({ length: 20 }, () => ({
    textDeltas: ['.'],
    toolUse: [{ id: `tu_${Math.random().toString(16).slice(2)}`, name: 'getCurrentState', input: {} }],
    stop_reason: 'tool_use',
  }));
  const client = makeFakeClient(script);
  let errored = false;
  await streamAdvisorTurn({
    client, state: baseState(), messages: [], userMessage: 'loop forever',
    onError: () => { errored = true; },
  });
  assert.ok(errored, 'onError should have been called when iteration cap hit');
});

await test('Missing client throws synchronously via onError', async () => {
  let errored = null;
  try {
    await streamAdvisorTurn({
      client: null, state: baseState(), messages: [], userMessage: 'no client',
      onError: (e) => { errored = e; },
    });
  } catch (e) {
    errored = e;
  }
  assert.ok(errored);
  assert.ok(errored.message.includes('Anthropic client'));
});

console.log('\n=== onComplete callback ===');

await test('onComplete fires with full result', async () => {
  const client = makeFakeClient([
    { textDeltas: ['done'], stop_reason: 'end_turn' },
  ]);
  let completed = null;
  await streamAdvisorTurn({
    client, state: baseState(), messages: [], userMessage: 'done',
    onComplete: (out) => { completed = out; },
  });
  assert.ok(completed);
  assert.strictEqual(completed.stopReason, 'end_turn');
  assert.strictEqual(completed.assistantText, 'done');
});

console.log(`\n${'='.repeat(60)}`);
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'='.repeat(60)}\n`);

if (failed > 0) process.exit(1);
