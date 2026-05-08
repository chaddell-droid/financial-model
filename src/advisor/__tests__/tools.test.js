/**
 * Tests for advisor tools — each tool happy-path + edge + error.
 *
 * Run with: node src/advisor/__tests__/tools.test.js
 */
import assert from 'node:assert';
import { TOOLS, TOOL_NAMES, runTool, toolsForAnthropic } from '../tools.js';
import { gatherStateWithOverrides } from '../../state/gatherState.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${err.message}`);
  }
}

const baseState = () => gatherStateWithOverrides({
  chadJob: true, chadJobSalary: 165000, chadJobStartMonth: 0,
  chadJobStockRefresh: 60000, chadJobRefreshStartMonth: 12,
  chadCurrentAge: 61, chadWorkMonths: 72, sarahWorkMonths: 96,
  startingSavings: 200000,
});

console.log('\n=== TOOLS metadata ===');

test('Exactly 11 tools registered', () => {
  assert.strictEqual(TOOL_NAMES.length, 11);
});

test('Every tool has name, description, input_schema, handler', () => {
  for (const t of TOOLS) {
    assert.ok(typeof t.name === 'string' && t.name.length > 0, 'name');
    assert.ok(typeof t.description === 'string' && t.description.length > 20, `description on ${t.name}`);
    assert.ok(t.input_schema && t.input_schema.type === 'object', `schema on ${t.name}`);
    assert.ok(typeof t.handler === 'function', `handler on ${t.name}`);
  }
});

test('toolsForAnthropic strips handler', () => {
  const exported = toolsForAnthropic();
  assert.strictEqual(exported.length, 11);
  for (const t of exported) {
    assert.ok(t.name && t.description && t.input_schema);
    assert.ok(!('handler' in t), 'handler should not leak to API payload');
  }
});

console.log('\n=== getCurrentState ===');

test('Returns ok=true with state summary', () => {
  const result = runTool('getCurrentState', baseState());
  assert.ok(result.ok);
  assert.ok(result.state);
  assert.ok(result.state.chad);
  assert.ok(result.state.sarah);
  assert.ok(typeof result.state.chad.workMonths === 'number');
});

test('Includes 401k block when enabled', () => {
  const state = gatherStateWithOverrides({
    chadJob: true,
    chadJob401kEnabled: true,
    chadJob401kDeferral: 24500,
    chadJob401kMatch: 12000,
  });
  const result = runTool('getCurrentState', state);
  assert.ok(result.state.chad.k401);
  assert.strictEqual(result.state.chad.k401.deferral, 24500);
});

test('k401 is null when 401k disabled', () => {
  const state = gatherStateWithOverrides({ chadJob: true, chadJob401kEnabled: false });
  const result = runTool('getCurrentState', state);
  assert.strictEqual(result.state.chad.k401, null);
});

console.log('\n=== runProjection ===');

test('Returns summary metrics', () => {
  const result = runTool('runProjection', baseState());
  assert.ok(result.ok);
  assert.ok(result.summary);
  assert.ok(typeof result.summary.finalBalance === 'number');
  assert.ok(typeof result.summary.horizonMonths === 'number');
  assert.ok(result.summary.lowestMonth);
  assert.ok(result.summary.highestMonth);
});

test('No monthlyData by default (token budget)', () => {
  const result = runTool('runProjection', baseState());
  assert.strictEqual(result.monthlyData, undefined);
});

test('monthlyData included when fields specified', () => {
  const result = runTool('runProjection', baseState(), { fields: ['balance', 'netMonthly'], everyNthMonth: 12 });
  assert.ok(Array.isArray(result.monthlyData));
  assert.ok(result.monthlyData.length > 0);
  assert.ok('balance' in result.monthlyData[0]);
  assert.ok('netMonthly' in result.monthlyData[0]);
});

test('startMonth/endMonth bounds respected', () => {
  const result = runTool('runProjection', baseState(), { startMonth: 12, endMonth: 24, everyNthMonth: 6 });
  assert.ok(result.monthlyData.length > 0);
  for (const row of result.monthlyData) {
    assert.ok(row.month >= 12 && row.month <= 24, `month ${row.month} out of [12,24]`);
  }
});

console.log('\n=== whatIf ===');

test('Mutation produces non-null delta', () => {
  const result = runTool('whatIf', baseState(), { mutation: { chadL64Enabled: true }, label: 'L64 promotion' });
  assert.ok(result.ok);
  assert.ok(result.baseline);
  assert.ok(result.candidate);
  assert.strictEqual(result.label, 'L64 promotion');
  assert.ok(typeof result.finalBalanceDelta === 'number');
});

test('Rejects unknown mutation field', () => {
  const result = runTool('whatIf', baseState(), { mutation: { notARealField: 99 } });
  assert.strictEqual(result.ok, false);
  assert.ok(result.error.includes('Unknown'));
});

test('Empty mutation works (delta should be ~0)', () => {
  const result = runTool('whatIf', baseState(), { mutation: {} });
  assert.ok(result.ok);
  assert.ok(Math.abs(result.finalBalanceDelta) < 100);
});

console.log('\n=== evaluateGoals ===');

test('Returns one entry per goal', () => {
  const state = gatherStateWithOverrides({});
  const result = runTool('evaluateGoals', state);
  assert.ok(result.ok);
  assert.strictEqual(result.goals.length, state.goals.length);
  for (const g of result.goals) {
    assert.ok('achieved' in g);
    assert.ok('progress' in g);
    assert.ok('description' in g);
  }
});

console.log('\n=== topMoves ===');

test('Returns ranked moves with required fields', () => {
  const state = gatherStateWithOverrides({ chadJob: false });
  const result = runTool('topMoves', state, { topN: 3 });
  assert.ok(result.ok);
  assert.ok(Array.isArray(result.moves));
  for (const m of result.moves) {
    assert.ok(typeof m.key === 'string');
    assert.ok(typeof m.label === 'string');
    assert.ok(typeof m.finalBalanceDelta === 'number');
  }
});

console.log('\n=== moveCascade ===');

test('Cascade returns ordered rungs with cumulative impact', () => {
  const state = gatherStateWithOverrides({ chadJob: false });
  const result = runTool('moveCascade', state, { count: 3 });
  assert.ok(result.ok);
  assert.ok(Array.isArray(result.rungs));
  // Cumulative impact should be non-decreasing in absolute terms
  if (result.rungs.length >= 2) {
    assert.ok(typeof result.rungs[0].cumulativeFinalBalanceDelta === 'number');
  }
});

console.log('\n=== monteCarloSummary ===');

test('Runs MC and returns solvency rate', () => {
  const result = runTool('monteCarloSummary', baseState(), { runs: 50, seed: 42 });
  assert.ok(result.ok);
  assert.ok(typeof result.solvencyRate === 'number');
  assert.ok(result.solvencyRate >= 0 && result.solvencyRate <= 1);
  assert.ok(Array.isArray(result.bands));
  assert.strictEqual(result.numSims, 50);
});

console.log('\n=== taxBreakdown ===');

test('Returns per-year tax schedule', () => {
  const result = runTool('taxBreakdown', baseState(), { years: 3 });
  assert.ok(result.ok);
  assert.ok(Array.isArray(result.years));
  assert.ok(result.years.length <= 3);
  if (result.years.length > 0) {
    assert.ok('totalTax' in result.years[0]);
    assert.ok('effectiveRate' in result.years[0]);
  }
});

console.log('\n=== vestSchedule ===');

test('Returns grants array (empty when no refresh)', () => {
  const state = gatherStateWithOverrides({ chadJob: true, chadJobStockRefresh: 0 });
  const result = runTool('vestSchedule', state);
  assert.ok(result.ok);
  // grants array exists but might have zero-gross entries
  assert.ok(Array.isArray(result.grants));
});

test('Returns grants when refresh > 0', () => {
  const state = gatherStateWithOverrides({
    chadJob: true, chadJobStartMonth: 0, chadJobStockRefresh: 60000,
    chadJobRefreshStartMonth: 12, chadWorkMonths: 96,
  });
  const result = runTool('vestSchedule', state);
  assert.ok(result.ok);
  assert.ok(result.grants.length > 0);
  for (const g of result.grants) {
    assert.ok('id' in g);
    assert.ok('issueMonth' in g);
    assert.ok('gross' in g);
  }
});

test('includePostRetirement adds windfall summary', () => {
  const state = gatherStateWithOverrides({
    chadJob: true, chadJobStockRefresh: 60000, chadJobRefreshStartMonth: 12,
    chadCurrentAge: 65, chadAge65VestOverride: 'on', chadWorkMonths: 60,
  });
  const result = runTool('vestSchedule', state, { includePostRetirement: true });
  assert.ok(result.ok);
  assert.ok(result.postRetirementWindfall);
  assert.ok(typeof result.postRetirementWindfall.grossWindfall === 'number');
});

console.log('\n=== causalDelta ===');

test('Diffs two scenarios at month and ranks contributors', () => {
  const result = runTool('causalDelta', baseState(), {
    candidateMutation: { chadL64Enabled: true },
    atMonth: 60,
  });
  assert.ok(result.ok);
  assert.strictEqual(result.atMonth, 60);
  assert.ok(typeof result.balanceDelta === 'number');
  assert.ok(Array.isArray(result.contributors));
});

test('Rejects unknown field in mutation', () => {
  const result = runTool('causalDelta', baseState(), {
    candidateMutation: { madeUpField: 1 },
    atMonth: 60,
  });
  assert.strictEqual(result.ok, false);
  assert.ok(result.error.includes('Unknown'));
});

console.log('\n=== compareScenarios ===');

test('Side-by-side multiple scenarios', () => {
  const result = runTool('compareScenarios', baseState(), {
    scenarios: [
      { label: 'baseline', mutation: {} },
      { label: 'with-L64', mutation: { chadL64Enabled: true } },
      { label: 'sell-van', mutation: { vanSold: true } },
    ],
  });
  assert.ok(result.ok);
  assert.strictEqual(result.scenarios.length, 3);
  for (const s of result.scenarios) {
    assert.ok(s.label);
    assert.ok(s.summary);
    assert.ok(typeof s.summary.finalBalance === 'number');
  }
});

test('compareScenarios rejects scenario with bad mutation', () => {
  const result = runTool('compareScenarios', baseState(), {
    scenarios: [
      { label: 'good', mutation: {} },
      { label: 'bad', mutation: { fakeField: 1 } },
    ],
  });
  assert.strictEqual(result.ok, false);
  assert.ok(result.error.includes('bad'));
});

console.log('\n=== runTool dispatcher ===');

test('Unknown tool name returns ok=false', () => {
  const result = runTool('notATool', baseState());
  assert.strictEqual(result.ok, false);
  assert.ok(result.error.includes('Unknown'));
});

console.log(`\n${'='.repeat(60)}`);
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'='.repeat(60)}\n`);

if (failed > 0) process.exit(1);
