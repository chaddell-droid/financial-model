/**
 * Tests for systemPrompt + summarizeHousehold.
 *
 * Run with: node src/advisor/__tests__/systemPrompt.test.js
 */
import assert from 'node:assert';
import { buildSystemPrompt, buildSystemPromptString, summarizeHousehold } from '../systemPrompt.js';
import { gatherStateWithOverrides } from '../../state/gatherState.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try { fn(); passed++; console.log(`  PASS  ${name}`); }
  catch (err) { failed++; console.log(`  FAIL  ${name}\n        ${err.message}`); }
}

console.log('\n=== systemPrompt — structure ===');

test('buildSystemPrompt returns 4 blocks (persona, household, philosophy, boundaries)', () => {
  const state = gatherStateWithOverrides({});
  const prompt = buildSystemPrompt(state);
  assert.ok(Array.isArray(prompt));
  assert.strictEqual(prompt.length, 4);
  for (const block of prompt) {
    assert.strictEqual(block.type, 'text');
    assert.ok(typeof block.text === 'string' && block.text.length > 50);
  }
});

test('Static blocks (persona, philosophy, boundaries) are cache_control-tagged', () => {
  const state = gatherStateWithOverrides({});
  const prompt = buildSystemPrompt(state);
  // 0 = persona, 1 = household, 2 = philosophy, 3 = boundaries
  assert.deepStrictEqual(prompt[0].cache_control, { type: 'ephemeral' });
  assert.strictEqual(prompt[1].cache_control, undefined, 'household must NOT be cached (varies per turn)');
  assert.deepStrictEqual(prompt[2].cache_control, { type: 'ephemeral' });
  assert.deepStrictEqual(prompt[3].cache_control, { type: 'ephemeral' });
});

test('Persona block emphasizes CFP role and explanatory stance', () => {
  const state = gatherStateWithOverrides({});
  const [persona] = buildSystemPrompt(state);
  assert.ok(persona.text.includes('Certified Financial Planner'));
  assert.ok(persona.text.toLowerCase().includes('explanatory'));
});

test('Tool philosophy includes the hard rule about citing every number', () => {
  const state = gatherStateWithOverrides({});
  const [, , philosophy] = buildSystemPrompt(state);
  assert.ok(philosophy.text.includes('every dollar'));
  assert.ok(philosophy.text.toLowerCase().includes('tool result'));
});

console.log('\n=== summarizeHousehold — content ===');

test('Includes both ages and retirement timing', () => {
  const state = gatherStateWithOverrides({ chadCurrentAge: 61, sarahCurrentAge: 59, chadWorkMonths: 72 });
  const summary = summarizeHousehold(state);
  assert.ok(summary.includes('Chad'));
  assert.ok(summary.includes('Sarah'));
  assert.ok(summary.includes('61'));
  assert.ok(summary.includes('59'));
  assert.ok(summary.includes('72'));
});

test('Reflects MSFT job ON state with promotions', () => {
  const state = gatherStateWithOverrides({
    chadJob: true, chadJobSalary: 165000,
    chadL64Enabled: true, chadL64Month: 24,
    chadL65Enabled: true, chadL65Month: 60,
  });
  const summary = summarizeHousehold(state);
  assert.ok(summary.includes('ENABLED'), 'should mark chadJob enabled');
  assert.ok(summary.includes('165,000'), 'should include salary with thousands separator');
  assert.ok(summary.includes('L64 promotion: ENABLED'));
  assert.ok(summary.includes('L65 promotion: ENABLED'));
});

test('Reflects MSFT job OFF state', () => {
  const state = gatherStateWithOverrides({ chadJob: false });
  const summary = summarizeHousehold(state);
  assert.ok(summary.includes('NOT ENABLED'));
});

test('401(k) block surfaces deferral/match when enabled', () => {
  const state = gatherStateWithOverrides({
    chadJob: true, chadJob401kEnabled: true,
    chadJob401kDeferral: 24500, chadJob401kMatch: 12000,
  });
  const summary = summarizeHousehold(state);
  assert.ok(summary.includes('401(k): ENABLED'));
  assert.ok(summary.includes('24,500'));
  assert.ok(summary.includes('12,000'));
});

test('Includes debts with totals', () => {
  const state = gatherStateWithOverrides({
    debtCC: 92000, debtPersonal: 57000, debtIRS: 17000, debtFirstmark: 21000,
  });
  const summary = summarizeHousehold(state);
  assert.ok(summary.includes('187,000') || summary.includes('Debts'));
  assert.ok(summary.includes('92,000'));
});

test('Includes goals when defined', () => {
  const state = gatherStateWithOverrides({});
  const summary = summarizeHousehold(state);
  // Default INITIAL_STATE includes 3 default goals
  assert.ok(summary.includes('goals'));
});

test('Deterministic — same state produces identical summary', () => {
  const state = gatherStateWithOverrides({ chadJob: true, chadJobSalary: 195000 });
  const a = summarizeHousehold(state);
  const b = summarizeHousehold(state);
  assert.strictEqual(a, b);
});

test('summarizeHousehold output is bounded — under 6000 chars', () => {
  // Token-budget guard. Even with all features on, the summary should fit comfortably.
  const state = gatherStateWithOverrides({
    chadJob: true, chadL64Enabled: true, chadL65Enabled: true,
    chadJob401kEnabled: true, vanSold: true, lifestyleCutsApplied: true,
    cutsOverride: 1500, ssType: 'ss',
  });
  const summary = summarizeHousehold(state);
  assert.ok(summary.length < 6000, `summary length ${summary.length} exceeds soft cap`);
});

test('buildSystemPromptString concatenates blocks with separators', () => {
  const state = gatherStateWithOverrides({});
  const str = buildSystemPromptString(state);
  assert.ok(typeof str === 'string');
  assert.ok(str.includes('Certified Financial Planner'));
  assert.ok(str.includes('Tool philosophy'));
  assert.ok(str.includes('Boundaries'));
});

console.log(`\n${'='.repeat(60)}`);
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'='.repeat(60)}\n`);

if (failed > 0) process.exit(1);
