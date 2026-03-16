/**
 * Model layer snapshot tests — run with:
 *   node src/model/__snapshots__.test.js
 *
 * Zero dependencies. Uses Node.js built-in assert.
 * These snapshots lock the current correct output so future changes
 * that shift financial projections are immediately visible.
 */

import assert from 'node:assert';
import { INITIAL_STATE, MODEL_KEYS } from '../state/initialState.js';
import { runMonthlySimulation, computeProjection, computeWealthProjection } from './projection.js';
import { getVestEvents, getTotalRemainingVesting } from './vesting.js';
import { evaluateGoal, evaluateGoalPass, evaluateAllGoals } from './goalEvaluation.js';

// --- Helpers ---

function gatherState(overrides = {}) {
  const state = { ...INITIAL_STATE, ...overrides };
  const s = {};
  for (const key of MODEL_KEYS) s[key] = state[key];
  s.bcsFamilyMonthly = Math.round(Math.max(0, state.bcsAnnualTotal - state.bcsParentsAnnual) / 12);
  s.lifestyleCuts = state.cutOliver + state.cutVacation + state.cutGym;
  s.cutInHalf = state.cutMedical + state.cutShopping + state.cutSaaS;
  s.extraCuts = state.cutAmazon + state.cutEntertainment + state.cutGroceries + state.cutPersonalCare + state.cutSmallItems;
  return s;
}

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL  ${name}`);
    console.log(`        ${e.message}`);
  }
}

function eq(actual, expected, label = '') {
  assert.strictEqual(actual, expected, `${label}: expected ${expected}, got ${actual}`);
}

// --- Snapshot Tests ---

console.log('\n=== Default Projection ===');

const base = gatherState();
const { monthlyData, backPayActual } = runMonthlySimulation(base);

test('backPayActual', () => eq(backPayActual, 65536));
test('month 0 balance', () => eq(monthlyData[0].balance, 166011));
test('month 12 balance', () => eq(monthlyData[12].balance, 9231));
test('month 36 balance', () => eq(monthlyData[36].balance, -455222));
test('month 72 balance', () => eq(monthlyData[72].balance, -1160568));
test('month 0 netCashFlow', () => eq(monthlyData[0].netCashFlow, -21767));
test('month 36 netCashFlow', () => eq(monthlyData[36].netCashFlow, -18974));
test('month 72 netCashFlow', () => eq(monthlyData[72].netCashFlow, -19534));
test('produces 73 months (0-72)', () => eq(monthlyData.length, 73));
test('min balance is at month 72', () => {
  const minBal = Math.min(...monthlyData.map(d => d.balance));
  eq(minBal, -1160568);
  eq(monthlyData.findIndex(d => d.balance === minBal), 72);
});

console.log('\n=== SSDI Denied ===');

const denied = gatherState({ ssdiDenied: true });
const { monthlyData: deniedData } = runMonthlySimulation(denied);

test('month 12 balance', () => eq(deniedData[12].balance, -97009));
test('month 36 balance', () => eq(deniedData[36].balance, -717570));
test('month 72 balance', () => eq(deniedData[72].balance, -1586476));
test('ssdi is always 0', () => {
  assert.ok(deniedData.every(d => d.ssdi === 0), 'SSDI should be 0 for all months when denied');
});

console.log('\n=== Retire Debt ===');

const debtRetired = gatherState({ retireDebt: true });
const { monthlyData: debtData } = runMonthlySimulation(debtRetired);

test('month 0 expenses (no debt service)', () => eq(debtData[0].expenses, 47748));
test('month 12 balance', () => eq(debtData[12].balance, 99013));
test('month 72 balance', () => eq(debtData[72].balance, -678032));
test('expenses lower than default', () => {
  assert.ok(debtData[0].expenses < monthlyData[0].expenses, 'Expenses should be lower with debt retired');
});

console.log('\n=== Lifestyle Cuts Applied ===');

const cutsOn = gatherState({ lifestyleCutsApplied: true });
const { monthlyData: cutsData } = runMonthlySimulation(cutsOn);

test('month 0 expenses (cuts reduce)', () => eq(cutsData[0].expenses, 36078));
test('month 12 balance', () => eq(cutsData[12].balance, 261859));
test('month 72 balance (positive!)', () => eq(cutsData[72].balance, 414742));
test('expenses lower than default', () => {
  assert.ok(cutsData[0].expenses < monthlyData[0].expenses, 'Expenses should be lower with cuts');
});

console.log('\n=== MSFT Vesting ===');

const events0 = getVestEvents(0);
const total0 = getTotalRemainingVesting(0);

test('10 vesting events', () => eq(events0.length, 10));
test('first vest net (0% growth)', () => eq(events0[0].net, 43696));
test('total remaining (0% growth)', () => eq(total0, 246078));

const total10 = getTotalRemainingVesting(10);
test('total remaining (10% growth)', () => eq(total10, 269862));
test('growth increases vesting value', () => {
  assert.ok(total10 > total0, '10% growth should yield more than 0%');
});

console.log('\n=== Wealth Projection ===');

const { wealthData } = computeWealthProjection({ starting401k: 478000, return401k: 8, homeEquity: 700000, homeAppreciation: 4 });

test('month 0 - 401k unchanged', () => eq(wealthData[0].balance401k, 478000));
test('month 0 - home unchanged', () => eq(wealthData[0].homeEquity, 700000));
test('month 36 - 401k', () => eq(wealthData[36].balance401k, 602142));
test('month 36 - home', () => eq(wealthData[36].homeEquity, 787405));
test('month 72 - 401k', () => eq(wealthData[72].balance401k, 758526));
test('month 72 - home', () => eq(wealthData[72].homeEquity, 885723));
test('401k grows faster than home', () => {
  assert.ok(wealthData[72].balance401k / 478000 > wealthData[72].homeEquity / 700000, '8% > 4%');
});

console.log('\n=== Goal Evaluation ===');

const goals = INITIAL_STATE.goals;
const goalResults = evaluateAllGoals(goals, monthlyData, { wealthData, retireDebt: false });

test('savings positive at Y6 - fails', () => eq(goalResults[0].achieved, false));
test('savings positive at Y6 - value', () => eq(goalResults[0].currentValue, -1160568));
test('cash flow breakeven - fails', () => eq(goalResults[1].achieved, false));
test('cash flow breakeven - value', () => eq(goalResults[1].currentValue, -18974));
test('emergency fund $50k - fails', () => eq(goalResults[2].achieved, false));
test('emergency fund $50k - value', () => eq(goalResults[2].currentValue, -689771));

console.log('\n=== evaluateGoal / evaluateGoalPass Lockstep ===');

for (const goal of goals) {
  const full = evaluateGoal(goal, monthlyData, { wealthData, retireDebt: false });
  const fast = evaluateGoalPass(goal, monthlyData, { wealthData, retireDebt: false });
  test(`${goal.name} - full/fast agree`, () => eq(full.achieved, fast));
}

// --- With cuts + SSDI (a passing scenario) ---
console.log('\n=== Goal Evaluation (Cuts + SSDI) ===');

const cutsGoalResults = evaluateAllGoals(goals, cutsData, { wealthData, retireDebt: false });
test('savings positive at Y6 - passes with cuts', () => eq(cutsGoalResults[0].achieved, true));
test('emergency fund $50k - passes with cuts', () => eq(cutsGoalResults[2].achieved, true));

console.log('\n=== computeProjection quarterly aggregation ===');

const proj = computeProjection(base);
test('20 quarterly data points', () => eq(proj.data.length, 20));
test('73 savings data points', () => eq(proj.savingsData.length, 73));
test('first quarter label', () => eq(proj.data[0].label, "Q1'26"));
test('last quarter label', () => eq(proj.data[19].label, "Q4'30"));

// --- Summary ---
console.log('\n' + '='.repeat(50));
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log('='.repeat(50) + '\n');

process.exit(failed > 0 ? 1 : 0);
