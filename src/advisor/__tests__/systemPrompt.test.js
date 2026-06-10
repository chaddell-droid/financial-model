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

test('buildSystemPrompt returns 4 blocks (persona, philosophy, boundaries, household)', () => {
  const state = gatherStateWithOverrides({});
  const prompt = buildSystemPrompt(state);
  assert.ok(Array.isArray(prompt));
  assert.strictEqual(prompt.length, 4);
  for (const block of prompt) {
    assert.strictEqual(block.type, 'text');
    assert.ok(typeof block.text === 'string' && block.text.length > 50);
  }
  // Static blocks come FIRST (cacheable prefix); volatile household block LAST.
  assert.ok(prompt[0].text.includes('Certified Financial Planner'), 'persona first');
  assert.ok(prompt[1].text.includes('Tool philosophy'), 'tool philosophy second');
  assert.ok(prompt[2].text.includes('Boundaries'), 'boundaries third');
  assert.ok(prompt[3].text.includes('CURRENT PLAN'), 'household block last');
});

test('Single cache breakpoint on the LAST static block; household uncached', () => {
  const state = gatherStateWithOverrides({});
  const prompt = buildSystemPrompt(state);
  // 0 = persona, 1 = philosophy, 2 = boundaries, 3 = household
  const tagged = prompt.filter((b) => b.cache_control);
  assert.strictEqual(tagged.length, 1, 'exactly one system breakpoint (covers the whole static prefix)');
  assert.strictEqual(prompt[0].cache_control, undefined);
  assert.strictEqual(prompt[1].cache_control, undefined);
  assert.deepStrictEqual(prompt[2].cache_control, { type: 'ephemeral' }, 'breakpoint on boundaries (last static)');
  assert.strictEqual(prompt[3].cache_control, undefined, 'household must NOT be cached (varies per turn)');
});

test('Persona block emphasizes CFP role and explanatory stance', () => {
  const state = gatherStateWithOverrides({});
  const [persona] = buildSystemPrompt(state);
  assert.ok(persona.text.includes('Certified Financial Planner'));
  assert.ok(persona.text.toLowerCase().includes('explanatory'));
});

test('Tool philosophy includes the hard rule about citing every number', () => {
  const state = gatherStateWithOverrides({});
  const [, philosophy] = buildSystemPrompt(state);
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

test('Reflects MSFT job ON state with promotions in active block', () => {
  const state = gatherStateWithOverrides({
    chadJob: true, chadJobSalary: 165000,
    chadL64Enabled: true, chadL64Month: 24, chadL64Salary: 220000,
    chadL65Enabled: true, chadL65Month: 60, chadL65Salary: 280000,
  });
  const summary = summarizeHousehold(state);
  assert.ok(summary.includes('Chad\'s MSFT W-2 (ACTIVE)'), 'should mark MSFT job ACTIVE');
  assert.ok(summary.includes('165,000'), 'should include salary');
  assert.ok(summary.includes('L64'), 'should mention L64');
  assert.ok(summary.includes('L65'), 'should mention L65');
  assert.ok(summary.includes('220,000'), 'should include L64 salary');
  assert.ok(summary.includes('280,000'), 'should include L65 salary');
});

test('Reflects MSFT job OFF state in INACTIVE LEVERS', () => {
  const state = gatherStateWithOverrides({ chadJob: false });
  const summary = summarizeHousehold(state);
  // The MSFT W-2 should NOT appear under "Active income" when chadJob=false.
  const activeIdx = summary.indexOf('Active income');
  const inactiveIdx = summary.indexOf('Inactive levers');
  assert.ok(activeIdx >= 0, 'should have Active income section');
  assert.ok(inactiveIdx > activeIdx, 'should have Inactive levers section after active');
  // The "MSFT W-2 (ACTIVE)" text should NOT appear because chadJob is off.
  assert.ok(!summary.includes('MSFT W-2 (ACTIVE)'), 'should NOT mark MSFT W-2 as active');
  // chadJob=false should appear under Inactive levers
  assert.ok(summary.includes('chadJob=false'), 'inactive lever should reference chadJob=false');
});

test('401(k) block surfaces deferral/match when enabled (in active block)', () => {
  const state = gatherStateWithOverrides({
    chadJob: true, chadJob401kEnabled: true,
    chadJob401kDeferral: 24500, chadJob401kMatch: 12000,
  });
  const summary = summarizeHousehold(state);
  assert.ok(summary.includes('401(k) ACTIVE'));
  assert.ok(summary.includes('24,500'));
  assert.ok(summary.includes('12,000'));
});

test('401(k) appears in INACTIVE LEVERS when toggle off but chadJob on', () => {
  const state = gatherStateWithOverrides({
    chadJob: true, chadJob401kEnabled: false,
    chadJob401kDeferral: 24500, chadJob401kMatch: 12000,
  });
  const summary = summarizeHousehold(state);
  assert.ok(!summary.includes('401(k) ACTIVE'), '401k should not be active');
  assert.ok(summary.includes('401(k)') && summary.includes('toggle off'),
    '401k should be listed as inactive lever');
});

test('SSDI + W-2 conflict surfaces a plan-consistency warning', () => {
  // Both chadJob (high salary) and ssType=ssdi (not denied) are active — real-world conflict.
  const state = gatherStateWithOverrides({
    chadJob: true, chadJobSalary: 165000,
    ssType: 'ssdi', ssdiDenied: false,
  });
  const summary = summarizeHousehold(state);
  assert.ok(summary.includes('Plan-consistency notes'), 'should include warnings section');
  assert.ok(summary.toLowerCase().includes('sga') || summary.toLowerCase().includes('substantial gainful'),
    'warning should mention SGA cap');
  assert.ok(summary.toLowerCase().includes('mutually exclusive'),
    'warning should call out mutual exclusivity');
});

test('No exclusivity warning when chadJob is off and SSDI is on', () => {
  const state = gatherStateWithOverrides({
    chadJob: false, ssType: 'ssdi', ssdiDenied: false,
  });
  const summary = summarizeHousehold(state);
  // Either no warnings section, or warnings don't include the SSDI+W-2 conflict.
  assert.ok(!summary.includes('SSDI + Chad\'s W-2'),
    'should NOT have SSDI+W-2 conflict warning when chadJob is off');
});

test('Spousal-without-SS warning when sarahSpousalEnabled but no SS branch active', () => {
  const state = gatherStateWithOverrides({
    chadJob: true,           // employed → SSDI typically wouldn't apply but ssType is still set
    ssType: 'ssdi', ssdiDenied: true,  // SSDI denied → no SS branch active
    sarahSpousalEnabled: true,
  });
  const summary = summarizeHousehold(state);
  assert.ok(summary.includes('Sarah\'s spousal'), 'should reference spousal benefit warning');
  assert.ok(summary.toLowerCase().includes('will not flow') || summary.toLowerCase().includes('won\'t flow') || summary.toLowerCase().includes('not flow'),
    'should explain spousal won\'t flow without active SS branch');
});

test('Active income summary lists all currently-flowing sources in one line', () => {
  const state = gatherStateWithOverrides({
    chadJob: true, chadJobSalary: 165000, chadL64Enabled: true, chadL65Enabled: true,
    ssType: 'ss',
  });
  const summary = summarizeHousehold(state);
  assert.ok(summary.includes('Active income sources:'), 'should have active income one-liner');
  assert.ok(summary.includes("L63→L64→L65"), 'should describe ladder progression');
});

test('Tool philosophy mentions active vs inactive distinction', () => {
  const state = gatherStateWithOverrides({});
  const [, philosophy] = buildSystemPrompt(state);
  assert.ok(philosophy.text.toLowerCase().includes('active'), 'philosophy should reference active branches');
  assert.ok(philosophy.text.toLowerCase().includes('inactive') || philosophy.text.toLowerCase().includes('turned off'),
    'philosophy should reference inactive levers');
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

test('summarizeHousehold output is bounded — under 8000 chars', () => {
  // Token-budget guard. Even with all features on, the summary should fit comfortably.
  // Bumped from 6000 → 8000 after adding ACTIVE/INACTIVE structuring and warning blocks.
  const state = gatherStateWithOverrides({
    chadJob: true, chadL64Enabled: true, chadL65Enabled: true,
    chadJob401kEnabled: true, vanSold: true, lifestyleCutsApplied: true,
    cutsOverride: 1500, ssType: 'ss',
  });
  const summary = summarizeHousehold(state);
  assert.ok(summary.length < 8000, `summary length ${summary.length} exceeds soft cap`);
});

test('buildSystemPromptString concatenates blocks with separators', () => {
  const state = gatherStateWithOverrides({});
  const str = buildSystemPromptString(state);
  assert.ok(typeof str === 'string');
  assert.ok(str.includes('Certified Financial Planner'));
  assert.ok(str.includes('Tool philosophy'));
  assert.ok(str.includes('Boundaries'));
  // Same order as the block form: static prefix first, household last.
  const personaIdx = str.indexOf('Certified Financial Planner');
  const philosophyIdx = str.indexOf('Tool philosophy');
  const boundariesIdx = str.indexOf('# Boundaries');
  const householdIdx = str.indexOf('CURRENT PLAN');
  assert.ok(personaIdx < philosophyIdx, 'persona before philosophy');
  assert.ok(philosophyIdx < boundariesIdx, 'philosophy before boundaries');
  assert.ok(boundariesIdx < householdIdx, 'household block last');
});

console.log(`\n${'='.repeat(60)}`);
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'='.repeat(60)}\n`);

if (failed > 0) process.exit(1);
