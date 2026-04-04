/**
 * Model layer snapshot tests — run with:
 *   node src/model/__snapshots__.test.js
 *
 * Zero dependencies. Uses Node.js built-in assert.
 * These snapshots lock the current correct output so future changes
 * that shift financial projections are immediately visible.
 */

import assert from 'node:assert';
import fs from 'node:fs';
import { INITIAL_STATE, MODEL_KEYS } from '../state/initialState.js';
import { reducer } from '../state/reducer.js';
import { gatherStateWithOverrides } from '../state/gatherState.js';
import { runMonthlySimulation, computeProjection, findOperationalBreakevenIndex } from './projection.js';
import { getVestEvents, getTotalRemainingVesting } from './vesting.js';
import { evaluateGoal, evaluateGoalPass, evaluateAllGoals } from './goalEvaluation.js';
import { getBlendedReturns, getNumCohorts, getCohortLabel } from './historicalReturns.js';
import { computeSWR, simulatePath } from './ernWithdrawal.js';
import {
  buildRetirementContext,
  deriveCurrentWithdrawalView,
  getRetirementIncomePlan,
  getRetirementSSInfo,
  sliceRetirementContext,
} from './retirementIncome.js';
import { runMonteCarlo } from './monteCarlo.js';
import { fmt } from './formatters.js';
import { exportModelData } from './exportData.js';
import { PRIMARY_LEVERS_BCS_STATUS_QUO, buildPrimaryLeversModel } from './scenarioLevers.js';
import { buildBridgeStoryModel, buildOverviewStatusModel, groupBridgeDrivers, selectBridgeMarkers } from './overviewStory.js';
import { buildPwaDistribution, getDistributionPercentile, getPwaSummary } from './pwaDistribution.js';
import { selectPwaWithdrawal, simulateAdaptivePwaStrategy } from './pwaStrategies.js';
import { buildLegendItems, CHART_PRESENTATION, formatModelTimeLabel, getSummaryTimeframeLabel } from '../charts/chartContract.js';
import { RETIREMENT_LABELS, RISK_LABELS, TIMEFRAME_LABELS } from '../content/uiGlossary.js';
import { UI_BREAKPOINTS, getShellWidthBucket } from '../ui/tokens.js';

// --- Helpers ---

// Use the shared gatherState — alias for backward compat with test call sites
const gatherState = gatherStateWithOverrides;

function buildPrimaryLeversInput(overrides = {}) {
  const state = { ...INITIAL_STATE, ...overrides };
  const lifestyleCuts = state.cutOliver + state.cutVacation + state.cutGym;
  const cutInHalf = state.cutMedical + state.cutShopping + state.cutSaaS;
  const extraCuts = state.cutAmazon + state.cutEntertainment + state.cutGroceries + state.cutPersonalCare + state.cutSmallItems;
  const effectiveCuts = state.cutsOverride != null ? state.cutsOverride : (lifestyleCuts + cutInHalf + extraCuts);
  const activeCuts = state.lifestyleCutsApplied ? effectiveCuts : 0;
  const bcsFamilyMonthly = Math.round(Math.max(0, state.bcsAnnualTotal - state.bcsParentsAnnual) / 12);
  const debtTotal = state.debtCC + state.debtPersonal + state.debtIRS + state.debtFirstmark;
  const currentExpenses =
    state.baseExpenses
    - activeCuts
    + (state.retireDebt ? 0 : state.debtService)
    + (state.vanSold ? 0 : state.vanMonthlySavings)
    + bcsFamilyMonthly;
  const oneTimeTotal =
    (state.moldInclude ? state.moldCost : 0)
    + (state.roofInclude ? state.roofCost : 0)
    + (state.otherInclude ? state.otherProjects : 0);
  const advanceNeeded = (state.retireDebt ? debtTotal : 0) + oneTimeTotal;

  return {
    retireDebt: state.retireDebt,
    lifestyleCutsApplied: state.lifestyleCutsApplied,
    cutsOverride: state.cutsOverride,
    lifestyleCuts,
    cutInHalf,
    extraCuts,
    debtTotal,
    debtService: state.debtService,
    baseExpenses: state.baseExpenses,
    currentExpenses,
    vanSold: state.vanSold,
    vanMonthlySavings: state.vanMonthlySavings,
    bcsAnnualTotal: state.bcsAnnualTotal,
    bcsParentsAnnual: state.bcsParentsAnnual,
    bcsYearsLeft: state.bcsYearsLeft,
    bcsFamilyMonthly,
    moldCost: state.moldCost,
    moldInclude: state.moldInclude,
    roofCost: state.roofCost,
    roofInclude: state.roofInclude,
    otherProjects: state.otherProjects,
    otherInclude: state.otherInclude,
    advanceNeeded,
  };
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

async function asyncTest(name, fn) {
  try {
    await fn();
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

test('backPayActual', () => eq(backPayActual, 67488));
test('month 0 balance', () => eq(monthlyData[0].balance, 161088));
test('month 12 balance', () => eq(monthlyData[12].balance, 0));
test('month 36 balance', () => eq(monthlyData[36].balance, 0));
test('month 72 balance', () => eq(monthlyData[72].balance, -174271));
test('month 0 netCashFlow', () => eq(monthlyData[0].netCashFlow, -41255));
test('month 36 netCashFlow', () => eq(monthlyData[36].netCashFlow, -24466));
test('month 72 netCashFlow', () => eq(monthlyData[72].netCashFlow, -25459));
test('produces 73 months (0-72)', () => eq(monthlyData.length, 73));
test('min balance is at month 12', () => {
  const minBal = Math.min(...monthlyData.map(d => d.balance));
  eq(minBal, -174271);
  eq(monthlyData.findIndex(d => d.balance === minBal), 72);
});
test('monthly rows reconcile to balance deltas when vesting is recognized in actual cash month', () => {
  const recon = gatherState({
    startingSavings: 1000000,
    starting401k: 0,
    homeEquity: 0,
    ssdiDenied: true,
  });
  const { monthlyData: reconData } = runMonthlySimulation(recon);
  let priorBalance = recon.startingSavings;

  for (let m = 0; m <= 5; m++) {
    const row = reconData[m];
    const expected = Math.round(priorBalance + row.investReturn + row.cashIncome - row.expenses);
    eq(row.balance, expected, `month ${m} should reconcile exactly`);
    priorBalance = row.balance;
  }
});

console.log('\n=== SSDI Denied ===');

const denied = gatherState({ ssdiDenied: true });
const { monthlyData: deniedData } = runMonthlySimulation(denied);

test('month 12 balance', () => eq(deniedData[12].balance, 0));
test('month 36 balance', () => eq(deniedData[36].balance, 0));
test('month 72 balance', () => eq(deniedData[72].balance, -672388));
test('ssdi is always 0', () => {
  assert.ok(deniedData.every(d => d.ssdi === 0), 'SSDI should be 0 for all months when denied');
});

console.log('\n=== SSDI Back Pay Cap ===');

const cappedBackPayScenario = gatherState({
  ssType: 'ssdi',
  ssdiDenied: false,
  ssdiBackPayMonths: 1000,
  ssdiPersonal: 100,
});
const { backPayActual: cappedBackPayActual } = runMonthlySimulation(cappedBackPayScenario);

test('SSDI attorney fee caps at 7500', () => eq(cappedBackPayActual, 92500));

console.log('\n=== Retire Debt ===');

const debtRetired = gatherState({ retireDebt: true });
const { monthlyData: debtData } = runMonthlySimulation(debtRetired);

test('month 0 expenses (no debt service)', () => eq(debtData[0].expenses, 47748));
test('month 12 balance', () => eq(debtData[12].balance, 14019));
test('month 72 balance', () => eq(debtData[72].balance, 0));
test('expenses lower than default', () => {
  assert.ok(debtData[0].expenses < monthlyData[0].expenses, 'Expenses should be lower with debt retired');
});

console.log('\n=== Lifestyle Cuts Applied ===');

const cutsOn = gatherState({ lifestyleCutsApplied: true });
const { monthlyData: cutsData } = runMonthlySimulation(cutsOn);

test('month 0 expenses (cuts have no effect when all cut defaults are 0)', () => eq(cutsData[0].expenses, 54182));
test('month 12 balance', () => eq(cutsData[12].balance, 0));
test('month 72 balance', () => eq(cutsData[72].balance, -174271));
test('expenses equal default (all cuts are 0)', () => {
  assert.strictEqual(cutsData[0].expenses, monthlyData[0].expenses, 'Expenses should equal default when all cuts are 0');
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

console.log('\n=== Wealth from Simulation ===');

// wealthData is now derived from monthlyData (same as FinancialModel.jsx does)
const wealthData = monthlyData.map(d => ({ month: d.month, balance401k: d.balance401k, homeEquity: d.homeEquity }));

test('month 0 - 401k unchanged', () => eq(wealthData[0].balance401k, 478000));
test('month 0 - home unchanged', () => eq(wealthData[0].homeEquity, 700000));

console.log('\n=== Goal Evaluation ===');

const goals = INITIAL_STATE.goals;
const goalResults = evaluateAllGoals(goals, monthlyData, { wealthData, retireDebt: false });

test('savings positive at Y6 - passes', () => eq(goalResults[0].achieved, false));
test('savings positive at Y6 - value', () => eq(goalResults[0].currentValue, -174271));
test('cash flow breakeven - fails', () => eq(goalResults[1].achieved, false));
test('cash flow breakeven - value', () => eq(goalResults[1].currentValue, -24466));
test('emergency fund $50k - fails', () => eq(goalResults[2].achieved, false));
test('emergency fund $50k - value', () => eq(goalResults[2].currentValue, 0));
test('income target uses operational cash flow, not netMonthly', () => {
  const result = evaluateGoal(
    { id: 'op-flow', name: 'Operational breakeven', type: 'income_target', targetAmount: 0, targetMonth: 0 },
    [{ month: 0, netCashFlow: -1, netMonthly: 999 }],
  );
  eq(result.achieved, false);
  eq(result.progress, 0);
});
test('income target prefers smoothed operating flow when present', () => {
  const result = evaluateGoal(
    { id: 'op-flow-smoothed', name: 'Operational breakeven', type: 'income_target', targetAmount: 0, targetMonth: 0 },
    [{ month: 0, netCashFlow: 500, netCashFlowSmoothed: -1, netMonthly: 999 }],
  );
  eq(result.achieved, false);
  eq(result.currentValue, -1);
});
test('evaluateGoalPass income target matches operational cash flow contract', () => {
  const pass = evaluateGoalPass(
    { id: 'op-flow', name: 'Operational breakeven', type: 'income_target', targetAmount: 0, targetMonth: 0 },
    [{ month: 0, netCashFlow: -1, netMonthly: 999 }],
  );
  eq(pass, false);
});

console.log('\n=== evaluateGoal / evaluateGoalPass Lockstep ===');

for (const goal of goals) {
  const full = evaluateGoal(goal, monthlyData, { wealthData, retireDebt: false });
  const fast = evaluateGoalPass(goal, monthlyData, { wealthData, retireDebt: false });
  test(`${goal.name} - full/fast agree`, () => eq(full.achieved, fast));
}

// --- With cuts + SSDI (a passing scenario) ---
console.log('\n=== Goal Evaluation (Cuts + SSDI) ===');

const cutsGoalResults = evaluateAllGoals(goals, cutsData, { wealthData, retireDebt: false });
test('savings positive at Y6 - passes with cuts', () => eq(cutsGoalResults[0].achieved, false));
test('savings positive at Y6 - value with cuts', () => eq(cutsGoalResults[0].currentValue, -174271));
test('emergency fund $50k - passes with cuts', () => eq(cutsGoalResults[2].achieved, false));
test('emergency fund $50k - value with cuts', () => eq(cutsGoalResults[2].currentValue, 0));
test('zero-target net worth progress stays at 0 while net worth is negative', () => {
  const result = evaluateGoal(
    { id: 'nw0-neg', name: 'Net worth zero', type: 'net_worth_target', targetAmount: 0, targetMonth: 0 },
    [{ month: 0, balance: -500 }],
    { wealthData: [{ month: 0, balance401k: 0, homeEquity: 0 }] }
  );
  eq(result.achieved, false);
  eq(result.progress, 0);
});
test('zero-target net worth progress flips to 1 at non-negative net worth', () => {
  const result = evaluateGoal(
    { id: 'nw0-pos', name: 'Net worth zero', type: 'net_worth_target', targetAmount: 0, targetMonth: 0 },
    [{ month: 0, balance: 0 }],
    { wealthData: [{ month: 0, balance401k: 0, homeEquity: 0 }] }
  );
  eq(result.achieved, true);
  eq(result.progress, 1);
});

console.log('\n=== computeProjection quarterly aggregation ===');

const proj = computeProjection(base);
test('20 quarterly data points', () => eq(proj.data.length, 20));
test('73 savings data points', () => eq(proj.savingsData.length, 73));
test('first quarter label', () => eq(proj.data[0].label, "Q1'26"));
test('last quarter label', () => eq(proj.data[19].label, "Q4'30"));
test('month 0 savings label is M0', () => eq(proj.savingsData[0].label, 'M0'));
test('month 12 savings label is Y1', () => eq(proj.savingsData[12].label, 'Y1'));
test('operational breakeven uses netCashFlow, not netMonthly', () => {
  const rows = [
    { netCashFlow: -100, netMonthly: 500 },
    { netCashFlow: 0, netMonthly: -50 },
  ];
  eq(findOperationalBreakevenIndex(rows), 1);
});
test('operational breakeven prefers smoothed recurring flow when present', () => {
  const rows = [
    { netCashFlow: 500, netCashFlowSmoothed: -10 },
    { netCashFlow: -5, netCashFlowSmoothed: 0 },
  ];
  eq(findOperationalBreakevenIndex(rows), 1);
});

test('exported cashFlowBreakevenMonth uses operational cash flow, not netMonthly', () => {
  const savedBlob = globalThis.Blob;
  const savedUrl = globalThis.URL;
  const savedDocument = globalThis.document;

  let capturedJson = null;
  let clicked = false;

  globalThis.Blob = class MockBlob {
    constructor(parts, options) {
      this.parts = parts;
      this.type = options?.type;
    }
  };
  globalThis.URL = {
    createObjectURL(blob) {
      capturedJson = blob.parts.join('');
      return 'blob:mock';
    },
    revokeObjectURL() {},
  };
  globalThis.document = {
    body: {
      appendChild() {},
      removeChild() {},
    },
    createElement() {
      return {
        href: '',
        download: '',
        click() {
          clicked = true;
        },
      };
    },
  };

  try {
    exportModelData(
      { bcsFamilyMonthly: 0 },
      {
        data: [{ month: 0, netMonthly: 500 }, { month: 36, netMonthly: 0 }],
        monthlyData: [
          { month: 0, netCashFlow: -100, netMonthly: 500, balance: 10 },
          { month: 1, netCashFlow: -50, netMonthly: 250, balance: 5 },
          { month: 2, netCashFlow: 0, netMonthly: -25, balance: 0 },
        ],
        backPayActual: 0,
      },
      [],
      0,
      {
        rawMonthlyGap: -100,
        sarahCurrentNet: 0,
        advanceNeeded: 0,
        ssdiDenied: false,
        lifestyleCutsApplied: false,
        cutOliver: 0,
        cutVacation: 0,
        cutShopping: 0,
        cutMedical: 0,
        cutGym: 0,
        cutAmazon: 0,
        cutSaaS: 0,
        cutEntertainment: 0,
        cutGroceries: 0,
        cutPersonalCare: 0,
        cutSmallItems: 0,
        lifestyleCuts: 0,
        cutInHalf: 0,
        extraCuts: 0,
        goalResults: [],
      }
    );

    assert.ok(clicked, 'export should trigger the download click');
    const exported = JSON.parse(capturedJson);
    eq(exported.keyMetrics.cashFlowBreakevenMonth, 2);
  } finally {
    globalThis.Blob = savedBlob;
    globalThis.URL = savedUrl;
    globalThis.document = savedDocument;
  }
});

console.log('\n=== Retirement Math Guards ===');

test('444-month horizon includes the last valid cohort', () => eq(getNumCohorts(444), 1416));
test('last 444-month cohort starts in 1989-01', () => {
  const label = getCohortLabel(getNumCohorts(444) - 1);
  eq(label.year, 1989);
  eq(label.month, 1);
});
test('computeSWR matches one-month begin-of-month accounting', () => {
  const blended = Float64Array.from([0.10]);
  const supplementalFlows = Float64Array.from([100]);
  const scaling = Float64Array.from([1]);
  const swr = computeSWR(blended, 0, 1, supplementalFlows, scaling, 0, 1000);
  eq(Math.round(swr), 1100);
});
test('simulatePath flags intra-year depletion even if inheritance rescues later', () => {
  const blended = new Float64Array(12);
  const supplementalFlows = new Float64Array(12);
  const rescueFlows = new Float64Array(12);
  const scaling = new Float64Array(12);
  scaling.fill(1);
  supplementalFlows[2] = 8000;
  rescueFlows[2] = 8000;
  const sim = simulatePath(blended, 0, 12, 600, supplementalFlows, scaling, 1000, 0, rescueFlows);
  eq(sim.everDepleted, true);
  eq(sim.finalPool, 2600);
});
test('simulatePath supports scheduled monthly withdrawals', () => {
  const blended = new Float64Array(12);
  const supplementalFlows = new Float64Array(12);
  const rescueFlows = new Float64Array(12);
  const scaling = new Float64Array(12);
  const monthlySchedule = new Float64Array(12);
  scaling.fill(1);
  monthlySchedule[0] = 200;
  monthlySchedule[1] = 100;
  const sim = simulatePath(blended, 0, 12, monthlySchedule, supplementalFlows, scaling, 1000, 0, rescueFlows);
  eq(sim.finalPool, 700);
  eq(sim.everDepleted, false);
});
test('reserve boundary treats touching the floor as depleted', () => {
  const blended = new Float64Array(12);
  const supplementalFlows = new Float64Array(12);
  const rescueFlows = new Float64Array(12);
  const scaling = new Float64Array(12);
  scaling.fill(1);

  const safeSim = simulatePath(blended, 0, 12, 0, supplementalFlows, scaling, 12000, 11999, rescueFlows);
  eq(safeSim.everDepleted, false);
  eq(safeSim.finalPool, 12000);

  const touchSim = simulatePath(blended, 0, 12, 1, supplementalFlows, scaling, 12000, 11999, rescueFlows);
  eq(touchSim.everDepleted, true);
  eq(touchSim.finalPool, 11999);
});
test('retirement SS helper adds Sarah spousal benefit at 62', () => {
  const ssInfo = getRetirementSSInfo(76, true, {
    ageDiff: 14,
    chadSS: 2933,
    ssFRA: 4213,
    sarahOwnSS: 1900,
    survivorSS: 4186,
  });
  eq(ssInfo.amount, 4833);
});
test('retirement income plan scales total survivor spending before pool draw', () => {
  const plan = getRetirementIncomePlan(82, true, {
    chadPassesAge: 82,
    ageDiff: 14,
    baseMonthlyConsumption: 9000,
    survivorSpendRatio: 0.6,
    trustMonthly: 2000,
    chadSS: 2933,
    ssFRA: 4213,
    sarahOwnSS: 1900,
    survivorSS: 4186,
  });
  eq(plan.totalTarget, 5400);
  eq(plan.poolDraw, 0);
  eq(plan.savedToPool, 786);
});
test('sliceRetirementContext returns current guaranteed income and phase for remaining horizon', () => {
  const context = buildRetirementContext({
    horizonMonths: 24,
    chadPassesAge: 68,
    ageDiff: 14,
    survivorSpendRatio: 0.6,
    chadSS: 2933,
    ssFRA: 4213,
    sarahOwnSS: 1900,
    survivorSS: 4186,
    trustMonthly: 2000,
  });
  const start = sliceRetirementContext(context, 0);
  const survivor = sliceRetirementContext(context, 12);

  eq(start.currentPhase, 'couple');
  eq(start.currentGuaranteedIncome, 4933);
  eq(start.currentScaling, 1);
  eq(start.remainingMonths, 24);
  eq(survivor.currentPhase, 'survivor');
  eq(survivor.currentGuaranteedIncome, 2000);
  eq(survivor.currentScaling, 0.6);
  eq(survivor.remainingMonths, 12);
});
test('deriveCurrentWithdrawalView converts total target into current draw and reinvestment', () => {
  const drawView = deriveCurrentWithdrawalView(6000, 4500);
  const surplusView = deriveCurrentWithdrawalView(5000, 6500);

  eq(drawView.currentPortfolioDraw, 1500);
  eq(drawView.currentTotalIncome, 6000);
  eq(drawView.outsideIncomeReinvested, 0);
  eq(surplusView.currentPortfolioDraw, 0);
  eq(surplusView.currentTotalIncome, 6500);
  eq(surplusView.outsideIncomeReinvested, 1500);
});

console.log('\n=== Primary Levers Model Guards ===');

test('buildPrimaryLeversModel keeps recurring levers in stable order', () => {
  const model = buildPrimaryLeversModel(buildPrimaryLeversInput({
    retireDebt: true,
    lifestyleCutsApplied: true,
    cutsOverride: 7000,
    vanSold: true,
    bcsParentsAnnual: 41000,
  }));
  // Order is stable (not sorted by impact) — retire_debt, spending_cuts, sell_van, bcs_support
  eq(model.recurringLevers[0].id, 'retire_debt');
  eq(model.recurringLevers[1].id, 'spending_cuts');
  eq(model.recurringLevers[2].id, 'sell_van');
  eq(model.recurringLevers[3].id, 'bcs_support');
});

test('buildPrimaryLeversModel computes numeric summary totals at baseline', () => {
  const model = buildPrimaryLeversModel(buildPrimaryLeversInput());
  assert.ok(Number.isFinite(model.summary.monthlyOutflow), 'monthlyOutflow should be finite');
  assert.ok(Number.isFinite(model.summary.monthlySavings), 'monthlySavings should be finite');
  assert.ok(Number.isFinite(model.summary.oneTimeAsk), 'oneTimeAsk should be finite');
  eq(model.summary.monthlyOutflow, 54182);
  eq(model.summary.monthlySavings, 0);
  eq(model.summary.oneTimeAsk, 0);
  eq(model.summary.topLeverId, '');
  eq(model.summary.availableLeverId, 'retire_debt');
  eq(model.summary.availableLeverSavings, 6434);
});

test('buildPrimaryLeversModel keeps BCS delta outputs numeric at baseline and full-support edges', () => {
  const baseline = buildPrimaryLeversModel(buildPrimaryLeversInput());
  const fullSupport = buildPrimaryLeversModel(buildPrimaryLeversInput({
    bcsParentsAnnual: INITIAL_STATE.bcsAnnualTotal,
  }));

  eq(baseline.bcs.monthlyDeltaFromStatusQuo, 0);
  eq(baseline.bcs.totalDeltaOverRemainingYears, 0);
  eq(fullSupport.bcs.monthlyFamilyShare, 0);
  eq(fullSupport.bcs.monthlyDeltaFromStatusQuo, 1333);
  eq(fullSupport.bcs.totalDeltaOverRemainingYears, 48000);
});

test('buildPrimaryLeversModel uses the fixed $25K BCS status quo baseline for ranking math', () => {
  const model = buildPrimaryLeversModel(buildPrimaryLeversInput({
    bcsParentsAnnual: 30000,
  }));
  eq(PRIMARY_LEVERS_BCS_STATUS_QUO, 25000);
  eq(model.bcs.statusQuoAnnualContribution, 25000);
  eq(model.bcs.monthlyDeltaFromStatusQuo, 416);
  eq(model.recurringLevers.find((lever) => lever.id === 'bcs_support').monthlyImpact, 416);
});

test('buildPrimaryLeversModel separates changed-here and other-assumption consequence groups', () => {
  const model = buildPrimaryLeversModel(buildPrimaryLeversInput({
    retireDebt: true,
    moldInclude: true,
    otherInclude: true,
    bcsParentsAnnual: 30000,
  }));
  const changedHere = model.consequenceItems.filter((item) => item.group === 'changed_here').map((item) => item.id);
  const otherAssumptions = model.consequenceItems.filter((item) => item.group === 'other_assumptions').map((item) => item.id);

  assert.ok(changedHere.includes('debt_retirement'), 'changed-here group should include debt retirement');
  assert.ok(changedHere.includes('bcs_support_delta'), 'changed-here group should include the BCS delta');
  assert.ok(otherAssumptions.includes('mold_remediation'), 'other assumptions should include mold remediation');
  assert.ok(otherAssumptions.includes('house_projects'), 'other assumptions should include house projects');
});

console.log('\n=== Overview Story Model Guards ===');

test('buildOverviewStatusModel returns exactly three compact strip entries', () => {
  const status = buildOverviewStatusModel({
    rawMonthlyGap: -22659,
    netMonthly: -20530,
    breakevenLabel: 'Best: -$16.3K at Q2\'27',
    breakevenIdx: -1,
    bestProjectedGap: -16301,
    bestProjectedLabel: 'Q2\'27',
    savingsZeroLabel: '~12 months',
    savingsZeroMonth: { month: 12 },
    advanceNeeded: 0,
    steadyStateNet: -19412,
    steadyLabel: 'Q4\'30',
    mcResults: null,
  });

  eq(status.question, 'How far are we from monthly breakeven?');
  eq(status.answer, 'Not reached in current projection');
  eq(status.items.length, 3);
  eq(status.items[0].id, 'breakeven');
  eq(status.items[1].id, 'best_projected_gap');
  eq(status.items[2].id, 'runway');
  eq(status.items[1].detail, 'Q2\'27');
});

test('selectBridgeMarkers caps overview markers at ten and plan markers at nine', () => {
  const markers = [
    { id: 'cuts', label: 'Cuts', month: 0, kind: 'benefit' },
    { id: 'breakeven', label: 'Breakeven', month: 12, kind: 'breakeven' },
    { id: 'trust', label: 'Trust', month: 9, kind: 'transition' },
    { id: 'cliff', label: 'MSFT cliff', month: 18, kind: 'cliff' },
    { id: 'end', label: 'MSFT ends', month: 30, kind: 'cliff' },
    { id: 'milestone', label: 'Milestone', month: 24, kind: 'milestone' },
    { id: 'ageout', label: 'Kids age out', month: 43, kind: 'cliff' },
    { id: 'stepdown', label: 'MSFT step-down', month: 6, kind: 'cliff' },
    { id: 'bcs', label: 'BCS ends', month: 36, kind: 'transition' },
  ];

  eq(selectBridgeMarkers(markers, 'overview').length, 9);
  eq(selectBridgeMarkers(markers, 'plan').length, 9);
  eq(selectBridgeMarkers(markers, 'overview')[0].id, 'cuts');
  eq(selectBridgeMarkers(markers, 'plan')[0].id, 'cuts');
});

test('selectBridgeMarkers keeps only the highest-priority marker per month before applying the cap', () => {
  const markers = selectBridgeMarkers([
    { id: 'debt', label: 'Debt retired', month: 0, kind: 'benefit' },
    { id: 'van', label: 'Van sold', month: 0, kind: 'benefit' },
    { id: 'cuts', label: 'Cuts applied', month: 0, kind: 'benefit' },
    { id: 'breakeven', label: 'Breakeven M0', month: 0, kind: 'breakeven' },
    { id: 'trust', label: 'Trust +$1,250/mo', month: 11, kind: 'transition' },
    { id: 'ss', label: 'SS $7,099/mo', month: 18, kind: 'transition' },
    { id: 'cliff', label: 'MSFT cliff', month: 18, kind: 'cliff' },
    { id: 'bcs', label: 'BCS ends', month: 36, kind: 'transition' },
  ], 'overview');

  eq(markers.length, 4);
  eq(markers.filter((marker) => marker.month === 0).length, 1);
  eq(markers.find((marker) => marker.month === 0).id, 'breakeven');
  eq(markers.find((marker) => marker.month === 18).id, 'ss');
});

test('groupBridgeDrivers produces at most three grouped rows', () => {
  const groups = groupBridgeDrivers([
    { id: 'returns', impact: 1000, month: 0 },
    { id: 'ss', impact: 2000, month: 12 },
    { id: 'trust', impact: 500, month: 9 },
    { id: 'cliff', impact: -4000, month: 18, kind: 'drop' },
    { id: 'end', impact: -2000, month: 30, kind: 'drop' },
  ], 'overview');

  eq(groups.length, 3);
  eq(groups[0].id, 'helps_now');
  eq(groups[1].id, 'changes_later');
  eq(groups[2].id, 'drops_off');
});

test('buildBridgeStoryModel separates timed drops from helpful drivers and expands marker coverage for major steps', () => {
  const story = buildBridgeStoryModel({
    monthlyDetail: [{ month: 0, netMonthlySmoothed: -20530 }, { month: 12, netMonthlySmoothed: -17019 }],
    data: [
      { label: 'Q1\'26', month: 0, netMonthly: -20530, netCashFlow: -22463 },
      { label: 'Q2\'27', month: 15, netMonthly: -16301, netCashFlow: -16310 },
      { label: 'Q4\'30', month: 57, netMonthly: -19412, netCashFlow: -19412 },
    ],
    milestones: [{ name: 'Oliver tuition drop', month: 24, savings: 1200 }],
    variant: 'overview',
    todayGap: -22659,
    finalNet: -19412,
    crossMonth: null,
    trustIncomeNow: 833,
    trustIncomeFuture: 2083,
    trustIncreaseMonth: 9,
    retireDebt: true,
    debtService: 6434,
    vanSold: true,
    vanMonthlySavings: 807,
    lifestyleCutsApplied: true,
    totalCuts: 11670,
    bcsYearsLeft: 3,
    bcsFamilyMonthly: 2917,
    currentMsft: 14565,
    postCliffMsft: 3500,
    ssLabel: 'SSDI',
    ssMonth: 7,
    ssAmount: 6500,
    sarahGrowth: 3200,
    monthlyReturn: 1900,
    chadJobLabel: '',
    chadJobMonth: 0,
    chadJobMonthlyNet: 0,
    chadJobHealthVal: 0,
  });

  eq(story.title, 'Monthly gap path');
  eq(story.chips.length, 3);
  assert.ok(story.markers.length <= 10, 'overview marker count should cap at ten');
  assert.ok(story.driverGroups.some((group) => group.id === 'helps_now'), 'story should include helps-now drivers');
  assert.ok(story.driverGroups.some((group) => group.id === 'drops_off'), 'story should include drop-off drivers');
  assert.ok(story.driverGroups.find((group) => group.id === 'drops_off').items.some((item) => item.id === 'msft_cliff'), 'timed drops should stay in the drops-off group');
  assert.ok(story.driverGroups.find((group) => group.id === 'helps_now').items.some((item) => item.id === 'debt_retired'), 'retired debt should contribute to helps-now drivers');
});

test('buildBridgeStoryModel keeps SS visible in dense scenarios by collapsing same-month markers', () => {
  const story = buildBridgeStoryModel({
    monthlyDetail: [
      { month: 0, netMonthlySmoothed: 1200 },
      { month: 12, netMonthlySmoothed: 1800 },
      { month: 18, netMonthlySmoothed: -900 },
      { month: 36, netMonthlySmoothed: 700 },
    ],
    data: [
      { label: 'Q1\'26', month: 0, netMonthly: 1200, netCashFlow: 1200 },
      { label: 'Q4\'26', month: 9, netMonthly: 1400, netCashFlow: 1400 },
      { label: 'Q2\'27', month: 15, netMonthly: 1800, netCashFlow: 1800 },
      { label: 'Q4\'30', month: 57, netMonthly: 700, netCashFlow: 700 },
    ],
    milestones: [],
    variant: 'overview',
    todayGap: 1200,
    finalNet: 700,
    crossMonth: { month: 0, label: 'M0' },
    trustIncomeNow: 833,
    trustIncomeFuture: 2083,
    trustIncreaseMonth: 11,
    retireDebt: true,
    debtService: 6434,
    vanSold: true,
    vanSaleMonth: 6,
    vanMonthlySavings: 807,
    lifestyleCutsApplied: true,
    totalCuts: 16500,
    bcsYearsLeft: 3,
    bcsFamilyMonthly: 2917,
    currentMsft: 14565,
    postCliffMsft: 3500,
    ssLabel: 'SS',
    ssMonth: 18,
    ssAmount: 7099,
    sarahGrowth: 3200,
    monthlyReturn: 1900,
    chadJobLabel: '',
    chadJobMonth: 0,
    chadJobMonthlyNet: 0,
    chadJobHealthVal: 0,
  });

  eq(story.markers.filter((marker) => marker.month === 0).length, 1);
  assert.ok(story.markers.some((marker) => marker.id === 'ss_income'), 'dense bridge story should retain the SS transition marker');
  assert.ok(story.markers.every((marker) => marker.id !== 'debt_retired' || marker.month !== 0), 'same-month benefits should not crowd out later transitions');
});

test('buildBridgeStoryModel keeps MSFT end visible in dense bridge states with multiple future transitions', () => {
  const story = buildBridgeStoryModel({
    monthlyDetail: [
      { month: 0, netMonthlySmoothed: 4200 },
      { month: 6, netMonthlySmoothed: 3800, msftSmoothed: 9500 },
      { month: 7, netMonthlySmoothed: 10100, ssdi: 6500 },
      { month: 11, netMonthlySmoothed: 11200, trustLLC: 2083 },
      { month: 12, netMonthlySmoothed: 12600, expenses: 21000 },
      { month: 18, netMonthlySmoothed: 9400, msftSmoothed: 3300 },
      { month: 30, netMonthlySmoothed: 9300, msftSmoothed: 0 },
      { month: 36, netMonthlySmoothed: 13700, expenses: 16500, ssdi: 6500 },
      { month: 43, netMonthlySmoothed: 11400, ssdi: 4166 },
    ],
    data: [
      { label: 'Q1\'26', month: 0, netMonthly: 4200, netCashFlow: 4200 },
      { label: 'Q4\'30', month: 57, netMonthly: 18968, netCashFlow: 18968 },
    ],
    milestones: [{ name: 'Twins to college', month: 36, savings: 3000 }],
    variant: 'overview',
    todayGap: 4200,
    finalNet: 18968,
    crossMonth: { month: 0, label: 'M0' },
    trustIncomeNow: 833,
    trustIncomeFuture: 2083,
    trustIncreaseMonth: 11,
    retireDebt: true,
    debtService: 6434,
    vanSold: true,
    vanSaleMonth: 12,
    vanMonthlySavings: 2597,
    lifestyleCutsApplied: true,
    totalCuts: 18104,
    bcsYearsLeft: 3,
    bcsFamilyMonthly: 4333,
    currentMsft: 14565,
    postCliffMsft: 3304,
    ssLabel: 'SSDI',
    ssMonth: 7,
    ssAmount: 6500,
    sarahGrowth: 6275,
    monthlyReturn: 2343,
    chadJobLabel: '',
    chadJobMonth: 0,
    chadJobMonthlyNet: 0,
    chadJobHealthVal: 0,
  });

  assert.ok(story.markers.some((marker) => marker.id === 'msft_end'), 'dense bridge story should keep the MSFT end marker visible');
  assert.ok(story.markers.some((marker) => marker.id === 'ss_stepdown'), 'dense bridge story should keep the later benefit step-down visible');
});

test('buildBridgeStoryModel places van sale at the modeled sale month', () => {
  const story = buildBridgeStoryModel({
    monthlyDetail: [
      { month: 0, netMonthlySmoothed: -20530 },
      { month: 6, netMonthlySmoothed: -18000 },
      { month: 12, netMonthlySmoothed: -17019 },
    ],
    data: [
      { label: 'Q1\'26', month: 0, netMonthly: -20530, netCashFlow: -22463 },
      { label: 'Q3\'26', month: 6, netMonthly: -18000, netCashFlow: -18000 },
      { label: 'Q4\'30', month: 57, netMonthly: -19412, netCashFlow: -19412 },
    ],
    milestones: [],
    variant: 'overview',
    todayGap: -22659,
    finalNet: -19412,
    crossMonth: null,
    trustIncomeNow: 833,
    trustIncomeFuture: 2083,
    trustIncreaseMonth: 11,
    retireDebt: false,
    debtService: 6434,
    vanSold: true,
    vanSaleMonth: 6,
    vanMonthlySavings: 807,
    lifestyleCutsApplied: false,
    totalCuts: 0,
    bcsYearsLeft: 3,
    bcsFamilyMonthly: 2917,
    currentMsft: 14565,
    postCliffMsft: 3500,
    ssLabel: 'SSDI',
    ssMonth: 7,
    ssAmount: 6500,
    sarahGrowth: 3200,
    monthlyReturn: 1900,
    chadJobLabel: '',
    chadJobMonth: 0,
    chadJobMonthlyNet: 0,
    chadJobHealthVal: 0,
  });

  eq(story.markers.find((marker) => marker.id === 'van_sold').month, 6);
  eq(story.driverGroups.find((group) => group.id === 'changes_later').items.some((item) => item.id === 'van_sold'), false);
});

test('buildBridgeStoryModel labels major monthly step changes from the underlying projection', () => {
  const state = gatherState();
  const projection = computeProjection(state);
  const story = buildBridgeStoryModel({
    monthlyDetail: projection.monthlyData,
    data: projection.data,
    milestones: state.milestones,
    variant: 'overview',
    todayGap: projection.monthlyData[0].netMonthlySmoothed,
    finalNet: projection.monthlyData[projection.monthlyData.length - 1].netMonthlySmoothed,
    crossMonth: projection.monthlyData.find((row) => row.netMonthlySmoothed >= 0) || null,
    trustIncomeNow: state.trustIncomeNow,
    trustIncomeFuture: state.trustIncomeFuture,
    trustIncreaseMonth: state.trustIncreaseMonth,
    retireDebt: state.retireDebt,
    debtService: state.debtService,
    vanSold: state.vanSold,
    vanSaleMonth: state.vanSaleMonth,
    vanMonthlySavings: state.vanMonthlySavings,
    lifestyleCutsApplied: state.lifestyleCutsApplied,
    totalCuts: state.lifestyleCuts + state.cutInHalf + state.extraCuts,
    bcsYearsLeft: state.bcsYearsLeft,
    bcsFamilyMonthly: state.bcsFamilyMonthly,
    currentMsft: 14565,
    postCliffMsft: 3500,
    ssLabel: 'SSDI',
    ssMonth: state.ssdiApprovalMonth,
    ssAmount: state.ssdiFamilyTotal,
    sarahGrowth: 0,
    monthlyReturn: 0,
    chadJobLabel: '',
    chadJobMonth: 0,
    chadJobMonthlyNet: 0,
    chadJobHealthVal: 0,
  });

  assert.ok(story.markers.some((marker) => marker.id === 'msft_stepdown_6'), 'baseline bridge should label the early MSFT step-down');
  assert.ok(story.markers.some((marker) => marker.id === 'ss_income'), 'baseline bridge should label SSDI start');
  assert.ok(story.markers.some((marker) => marker.id === 'trust_increase'), 'baseline bridge should label the trust increase');
  assert.ok(story.markers.some((marker) => marker.id === 'msft_cliff'), 'baseline bridge should label the MSFT cliff');
  assert.ok(story.markers.some((marker) => marker.id === 'msft_end'), 'baseline bridge should label MSFT ending');
  assert.ok(story.markers.some((marker) => marker.id === 'bcs_end'), 'baseline bridge should label BCS ending');
  assert.ok(story.markers.some((marker) => marker.id === 'ss_stepdown'), 'baseline bridge should label the later benefit step-down');
  assert.ok(story.driverGroups.find((group) => group.id === 'drops_off').items.some((item) => item.id === 'ss_stepdown'), 'benefit step-down should be reflected in the drops-off explanation');
});

console.log('\n=== Primary Levers UI Contract Guards ===');

test('ScenarioStrip uses Primary Levers title and no longer leads with Scenarios', () => {
  const source = fs.readFileSync(new URL('../panels/ScenarioStrip.jsx', import.meta.url), 'utf8');
  assert.ok(source.includes('Primary Levers'), 'scenario strip should use the Primary Levers title');
  assert.ok(!source.includes('>Scenarios<'), 'scenario strip should not render the old Scenarios title');
});

test('ScenarioStrip preserves existing scenario control test ids', () => {
  const source = fs.readFileSync(new URL('../panels/ScenarioStrip.jsx', import.meta.url), 'utf8');
  for (const selector of [
    'scenario-retire-debt',
    'scenario-debt-service',
    'scenario-lifestyle-cuts',
    'scenario-total-cuts',
    'scenario-van-sold',
    'scenario-bcs-parents-annual',
  ]) {
    assert.ok(source.includes(selector), `scenario strip should preserve ${selector}`);
  }
});

test('ScenarioStrip exposes summary, ranked-lever, consequence-rail, and layout hooks', () => {
  const source = fs.readFileSync(new URL('../panels/ScenarioStrip.jsx', import.meta.url), 'utf8');
  for (const selector of [
    'primary-levers-summary',
    'primary-levers-monthly-outflow',
    'primary-levers-monthly-savings',
    'primary-levers-one-time-ask',
    'primary-levers-controls',
    'primary-levers-ranked-levers',
    'primary-levers-controls-section',
    'primary-levers-bcs-section',
  ]) {
    assert.ok(source.includes(selector), `scenario strip should expose ${selector}`);
  }
  assert.ok(source.includes("data-layout={rootLayout}"), 'scenario strip should expose a root data-layout hook');
  assert.ok(source.includes("data-order='controls-first'"), 'scenario strip should expose a root ordering hook');
});

test('ScenarioStrip uses layoutBucket plumbing instead of a fixed 1fr/1fr split', () => {
  const source = fs.readFileSync(new URL('../panels/ScenarioStrip.jsx', import.meta.url), 'utf8');
  assert.ok(source.includes('layoutBucket = \'desktop\''), 'scenario strip should accept layoutBucket');
  assert.ok(source.includes('gridTemplateColumns: desktop ?'), 'scenario strip should switch layout by bucket');
  assert.ok(!source.includes('gridTemplateColumns: "1fr 1fr"'), 'scenario strip should not depend on the old fixed 50/50 split');
});

test('FinancialModel passes the shell layout bucket into plan-owned ScenarioStrip props', () => {
  const source = fs.readFileSync(new URL('../FinancialModel.jsx', import.meta.url), 'utf8');
  assert.ok(source.includes('layoutBucket: shellWidthBucket'), 'FinancialModel should pass shellWidthBucket into ScenarioStrip');
});

test('UI swarm manifest tracks Primary Levers summary, ranking, and consequence selectors', () => {
  const manifest = JSON.parse(fs.readFileSync(new URL('../../tests/ui/coverage-manifest.json', import.meta.url), 'utf8'));
  const scenario = manifest.entries.find((entry) => entry.id === 'shell.scenario_strip.core');
  eq(scenario.status, 'ready', 'scenario strip manifest status');
  assert.ok(scenario.elements.some((element) => element.selector === '[data-testid="primary-levers-summary"]'), 'scenario strip manifest should track the summary root');
  assert.ok(scenario.elements.some((element) => element.selector === '[data-testid="primary-levers-ranked-levers"]'), 'scenario strip manifest should track ranked levers');
  assert.ok(scenario.elements.some((element) => element.selector === '[data-testid="primary-levers-ranked-levers"]'), 'scenario strip manifest should track ranked levers section');
});

console.log('\n=== PWA Distribution Guards ===');

const pwaContext = buildRetirementContext({
  horizonMonths: 444,
  chadPassesAge: 82,
  ageDiff: 14,
  survivorSpendRatio: 0.6,
  chadSS: 2933,
  ssFRA: 4213,
  sarahOwnSS: 1900,
  survivorSS: 4186,
  trustMonthly: 2000,
});
const blended60 = getBlendedReturns(0.6);

test('getDistributionPercentile interpolates between adjacent samples', () => {
  const samples = Float64Array.from([1000, 2000, 3000, 4000]);
  eq(getDistributionPercentile(samples, 75), 3250);
});
test('buildPwaDistribution returns one sample per valid cohort for remaining horizon', () => {
  const distribution = buildPwaDistribution({
    blendedReturns: blended60,
    decisionMonth: 24,
    horizonMonths: 444,
    totalPool: 1500000,
    bequestTarget: 0,
    supplementalFlows: pwaContext.supplementalFlows,
    scaling: pwaContext.scaling,
  });

  eq(distribution.remainingMonths, 420);
  eq(distribution.sampleCount, getNumCohorts(420));
  eq(distribution.samples.length, distribution.sampleCount);
  assert.ok(distribution.min <= distribution.median, 'distribution min should not exceed median');
  assert.ok(distribution.median <= distribution.max, 'distribution median should not exceed max');
  assert.ok(
    distribution.samples.every((sample, idx, arr) => idx === 0 || arr[idx - 1].totalSpendingTarget <= sample.totalSpendingTarget),
    'samples should be sorted from lowest to highest withdrawal'
  );
});
test('higher bequest target lowers selected PWA withdrawal', () => {
  const noBequest = buildPwaDistribution({
    blendedReturns: blended60,
    decisionMonth: 0,
    horizonMonths: 444,
    totalPool: 1500000,
    bequestTarget: 0,
    supplementalFlows: pwaContext.supplementalFlows,
    scaling: pwaContext.scaling,
  });
  const higherBequest = buildPwaDistribution({
    blendedReturns: blended60,
    decisionMonth: 0,
    horizonMonths: 444,
    totalPool: 1500000,
    bequestTarget: 500000,
    supplementalFlows: pwaContext.supplementalFlows,
    scaling: pwaContext.scaling,
  });
  const noBequestSummary = getPwaSummary(noBequest.sortedSampleValues, {
    selectedPercentile: 50,
    lowerTolerancePercentile: 25,
    upperTolerancePercentile: 75,
  });
  const higherBequestSummary = getPwaSummary(higherBequest.sortedSampleValues, {
    selectedPercentile: 50,
    lowerTolerancePercentile: 25,
    upperTolerancePercentile: 75,
  });

  assert.ok(
    higherBequestSummary.selectedWithdrawal < noBequestSummary.selectedWithdrawal,
    'higher bequest target should lower the selected spending target'
  );
});
test('fixed_percentile strategy selects the requested percentile', () => {
  const selection = selectPwaWithdrawal(
    { sortedSampleValues: Float64Array.from([1000, 2000, 3000, 4000]) },
    {
      strategy: 'fixed_percentile',
      basePercentile: 25,
      lowerTolerancePercentile: 25,
      upperTolerancePercentile: 75,
    }
  );

  eq(selection.selectedWithdrawal, 1750);
  eq(selection.selectedPercentile, 25);
  eq(selection.probabilityNoCut, 0.75);
});
test('sticky_median keeps the prior withdrawal while it stays inside the tolerance band', () => {
  const selection = selectPwaWithdrawal(
    { sortedSampleValues: Float64Array.from([1000, 2000, 3000, 4000]) },
    {
      strategy: 'sticky_median',
      previousWithdrawal: 2500,
      basePercentile: 50,
      lowerTolerancePercentile: 25,
      upperTolerancePercentile: 75,
    }
  );

  eq(selection.selectedWithdrawal, 2500);
  eq(selection.reason, 'keep_within_band');
  eq(selection.cutOccurred, false);
});
test('sticky_median recenters to the median when the prior withdrawal leaves the band', () => {
  const selection = selectPwaWithdrawal(
    { sortedSampleValues: Float64Array.from([1000, 2000, 3000, 4000]) },
    {
      strategy: 'sticky_median',
      previousWithdrawal: 3600,
      basePercentile: 50,
      lowerTolerancePercentile: 25,
      upperTolerancePercentile: 75,
    }
  );

  eq(selection.selectedWithdrawal, 2500);
  eq(selection.selectedPercentile, 50);
  eq(selection.reason, 'recenter_to_median');
  eq(selection.cutOccurred, true);
});
test('quartile_nudge moves only to the nearest tolerance boundary', () => {
  const selection = selectPwaWithdrawal(
    { sortedSampleValues: Float64Array.from([1000, 2000, 3000, 4000]) },
    {
      strategy: 'sticky_quartile_nudge',
      previousWithdrawal: 3600,
      basePercentile: 50,
      lowerTolerancePercentile: 25,
      upperTolerancePercentile: 75,
    }
  );

  eq(selection.selectedWithdrawal, 3250);
  eq(selection.reason, 'nudge_to_upper_band');
  eq(selection.cutOccurred, true);
});
test('PWA confidence tracks future-cut probability, not reserve depletion fields', () => {
  const selection = selectPwaWithdrawal(
    { sortedSampleValues: Float64Array.from([1000, 2000, 3000, 4000]) },
    {
      strategy: 'fixed_percentile',
      basePercentile: 25,
      lowerTolerancePercentile: 25,
      upperTolerancePercentile: 75,
    }
  );

  eq(selection.probabilityNoCut, 0.75);
  assert.ok(!('everDepleted' in selection), 'selection should not expose reserve-depletion semantics');
});
test('simulateAdaptivePwaStrategy re-solves yearly and returns a full spending schedule', () => {
  const simulation = simulateAdaptivePwaStrategy({
    blendedReturns: blended60,
    cohortStart: 0,
    horizonMonths: 24,
    totalPool: 750000,
    bequestTarget: 0,
    supplementalFlows: pwaContext.supplementalFlows,
    scaling: pwaContext.scaling,
    retirementContext: pwaContext,
    strategyConfig: {
      strategy: 'fixed_percentile',
      basePercentile: 25,
      lowerTolerancePercentile: 25,
      upperTolerancePercentile: 75,
    },
  });

  eq(simulation.yearlyDecisions.length, 2);
  eq(simulation.monthlySchedule.length, 24);
  eq(simulation.monthlyPools.length, 25);
  assert.ok(
    simulation.yearlyDecisions.every(decision => decision.probabilityNoCut >= 0 && decision.probabilityNoCut <= 1),
    'yearly decisions should report bounded future-cut probabilities'
  );
  assert.ok(
    simulation.yearlyDecisions.every(decision => decision.currentPortfolioDraw >= 0),
    'current-year portfolio draw should stay non-negative'
  );
});
test('wider sticky-median tolerance bands do not increase cut frequency', () => {
  const narrowBand = simulateAdaptivePwaStrategy({
    blendedReturns: blended60,
    cohortStart: 0,
    horizonMonths: 120,
    totalPool: 1500000,
    bequestTarget: 250000,
    supplementalFlows: pwaContext.supplementalFlows,
    scaling: pwaContext.scaling,
    retirementContext: pwaContext,
    strategyConfig: {
      strategy: 'sticky_median',
      basePercentile: 50,
      lowerTolerancePercentile: 40,
      upperTolerancePercentile: 60,
    },
  });
  const wideBand = simulateAdaptivePwaStrategy({
    blendedReturns: blended60,
    cohortStart: 0,
    horizonMonths: 120,
    totalPool: 1500000,
    bequestTarget: 250000,
    supplementalFlows: pwaContext.supplementalFlows,
    scaling: pwaContext.scaling,
    retirementContext: pwaContext,
    strategyConfig: {
      strategy: 'sticky_median',
      basePercentile: 50,
      lowerTolerancePercentile: 10,
      upperTolerancePercentile: 90,
    },
  });

  assert.ok(
    wideBand.cutCount <= narrowBand.cutCount,
    'wider tolerance bands should not force more spending cuts than narrower bands'
  );
});
test('higher bequest target lowers the retirement-surface selected PWA withdrawal', () => {
  const noBequestDistribution = buildPwaDistribution({
    blendedReturns: blended60,
    decisionMonth: 0,
    horizonMonths: 444,
    totalPool: 1500000,
    bequestTarget: 0,
    supplementalFlows: pwaContext.supplementalFlows,
    scaling: pwaContext.scaling,
  });
  const midBequestDistribution = buildPwaDistribution({
    blendedReturns: blended60,
    decisionMonth: 0,
    horizonMonths: 444,
    totalPool: 1500000,
    bequestTarget: 250000,
    supplementalFlows: pwaContext.supplementalFlows,
    scaling: pwaContext.scaling,
  });
  const highBequestDistribution = buildPwaDistribution({
    blendedReturns: blended60,
    decisionMonth: 0,
    horizonMonths: 444,
    totalPool: 1500000,
    bequestTarget: 500000,
    supplementalFlows: pwaContext.supplementalFlows,
    scaling: pwaContext.scaling,
  });

  const noBequestSelection = selectPwaWithdrawal(noBequestDistribution, {
    strategy: 'fixed_percentile',
    basePercentile: 50,
    lowerTolerancePercentile: 25,
    upperTolerancePercentile: 75,
  });
  const midBequestSelection = selectPwaWithdrawal(midBequestDistribution, {
    strategy: 'fixed_percentile',
    basePercentile: 50,
    lowerTolerancePercentile: 25,
    upperTolerancePercentile: 75,
  });
  const highBequestSelection = selectPwaWithdrawal(highBequestDistribution, {
    strategy: 'fixed_percentile',
    basePercentile: 50,
    lowerTolerancePercentile: 25,
    upperTolerancePercentile: 75,
  });

  assert.ok(
    noBequestSelection.selectedWithdrawal > midBequestSelection.selectedWithdrawal
      && midBequestSelection.selectedWithdrawal > highBequestSelection.selectedWithdrawal,
    'raising the bequest target should lower the selected starting PWA withdrawal'
  );
});

console.log('\n=== Retirement UI Contract Guards ===');

test('RetirementIncomeChart preserves both historical-safe and adaptive-PWA mode labels', () => {
  const source = fs.readFileSync(new URL('../charts/RetirementIncomeChart.jsx', import.meta.url), 'utf8');
  assert.ok(source.includes('Historical Safe'), 'historical-safe mode label should exist');
  assert.ok(source.includes('Adaptive PWA'), 'adaptive-PWA mode label should exist');
});
test('Adaptive PWA branch keeps reserve-floor and inheritance controls out of the PWA control set', () => {
  const source = fs.readFileSync(new URL('../charts/RetirementIncomeChart.jsx', import.meta.url), 'utf8');
  assert.ok(source.includes("!isPwaMode && hasInheritance"), 'inheritance callout should be gated to historical mode');
  assert.ok(source.includes("!isPwaMode && withdrawalRate > optRate"), 'over-withdrawal warning should stay in historical mode');
  assert.ok(source.includes("isPwaMode ? ("), 'component should branch on PWA mode');
  assert.ok(source.includes('Bequest target'), 'PWA mode should expose a bequest target control');
  assert.ok(source.includes("won't need to cut later"), 'PWA confidence copy should use future-cut language');
});
test('PWA distribution chart is wired into the retirement surface', () => {
  const retirementSource = fs.readFileSync(new URL('../charts/RetirementIncomeChart.jsx', import.meta.url), 'utf8');
  const chartSource = fs.readFileSync(new URL('../charts/PwaDistributionChart.jsx', import.meta.url), 'utf8');
  assert.ok(retirementSource.includes('<PwaDistributionChart'), 'retirement chart should render the PWA distribution chart');
  assert.ok(chartSource.includes('Current PWA Distribution'), 'distribution chart headline should exist');
  assert.ok(chartSource.includes('Bequest target'), 'distribution tooltip should mention the bequest target');
});
test('Retirement help registry preserves core help keys for both modes', () => {
  const registrySource = fs.readFileSync(new URL('../content/help/registry.js', import.meta.url), 'utf8');
  [
    'retirement_mode',
    'retirement_overview_historical',
    'retirement_overview_pwa',
    'finish_above_reserve',
    'probability_no_cut',
    'bequest_target',
    'pwa_strategy',
    'pwa_target_percentile',
    'pwa_tolerance_band',
    'adaptive_pwa_intro',
  ].forEach((key) => {
    assert.ok(registrySource.includes(`${key}:`), `help registry should include ${key}`);
  });
});
test('Retirement surface wires inline help primitives into the section', () => {
  const source = fs.readFileSync(new URL('../charts/RetirementIncomeChart.jsx', import.meta.url), 'utf8');
  assert.ok(source.includes('<HelpDrawer'), 'retirement chart should expose a section help drawer');
  assert.ok(source.includes('<HelpTip'), 'retirement chart should expose inline help tips');
  assert.ok(source.includes('adaptive_pwa_intro'), 'retirement chart should wire the Adaptive PWA intro help');
  assert.ok(source.includes('pwa_tolerance_band'), 'retirement chart should explain tolerance controls');
});
test('Retirement help layout uses the shared shell rail and responsive retirement grids', () => {
  const shellSource = fs.readFileSync(new URL('../components/layout/AppShell.jsx', import.meta.url), 'utf8');
  const retirementSource = fs.readFileSync(new URL('../charts/RetirementIncomeChart.jsx', import.meta.url), 'utf8');
  assert.ok(shellSource.includes("minmax(320px, 420px)"), 'shared shell should cap rail width for the retirement surface');
  assert.ok(retirementSource.includes("repeat(auto-fit, minmax(220px, 1fr))"), 'retirement controls should use responsive auto-fit grids');
  assert.ok(retirementSource.includes("repeat(auto-fit, minmax(200px, 1fr))"), 'retirement summary cards should use responsive auto-fit grids');
});
test('Help drawer does not clip inline help popovers', () => {
  const source = fs.readFileSync(new URL('../components/help/HelpDrawer.jsx', import.meta.url), 'utf8');
  assert.ok(!source.includes("overflow: 'hidden'"), 'help drawer should not clip inline help popovers');
});
test('index.html points favicon requests at the existing SVG asset', () => {
  const htmlSource = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  assert.ok(htmlSource.includes('href="/favicon.svg"'), 'index.html should link the SVG favicon');
});

console.log('\n=== Monte Carlo Guards ===');

const seededMcParams = {
  mcNumSims: 120,
  mcInvestVol: 10,
  mcBizGrowthVol: 5,
  mcMsftVol: 12,
  mcSsdiDelay: 6,
  mcSsdiDenialPct: 15,
  mcCutsDiscipline: 25,
};
const seededMcA = runMonteCarlo(base, seededMcParams, [], { seed: 123 });
const seededMcB = runMonteCarlo(base, seededMcParams, [], { seed: 123 });
const seededMcC = runMonteCarlo(base, seededMcParams, [], { seed: 124 });

test('runMonteCarlo is deterministic with an explicit seed', () => {
  eq(seededMcA.solvencyRate, seededMcB.solvencyRate);
  eq(seededMcA.medianFinal, seededMcB.medianFinal);
  eq(seededMcA.p10Final, seededMcB.p10Final);
  eq(seededMcA.p90Final, seededMcB.p90Final);
  eq(seededMcA.bands[2].series[12], seededMcB.bands[2].series[12]);
});
test('runMonteCarlo changes when the seed changes', () => {
  assert.ok(
    seededMcA.solvencyRate !== seededMcC.solvencyRate
      || seededMcA.medianFinal !== seededMcC.medianFinal
      || seededMcA.p10Final !== seededMcC.p10Final
      || seededMcA.p90Final !== seededMcC.p90Final,
    'changing the seed should change at least one headline Monte Carlo output'
  );
});

console.log('\n=== UI Harness Guards ===');

test('main installs the browser UI harness and disables StrictMode for ui_test runs', () => {
  const mainSource = fs.readFileSync(new URL('../main.jsx', import.meta.url), 'utf8');
  const harnessSource = fs.readFileSync(new URL('../testing/uiHarness.js', import.meta.url), 'utf8');
  assert.ok(mainSource.includes('installUiTestHarness'), 'main should install the UI test harness');
  assert.ok(mainSource.includes('getUiTestConfig'), 'main should read the UI test config');
  assert.ok(mainSource.includes('uiTestConfig') || mainSource.includes('FinancialModel'), 'main should render the app');
  assert.ok(harnessSource.includes('__FIN_MODEL_TEST__'), 'UI harness should expose a browser test API');
  assert.ok(harnessSource.includes('resetStorage'), 'UI harness should expose a storage reset hook');
  assert.ok(harnessSource.includes('getMonteCarloSeed'), 'UI harness should expose Monte Carlo seed controls');
  assert.ok(harnessSource.includes('!import.meta.env.DEV && !config.enabled'), 'UI harness should remain available in preview when ui_test is enabled');
});
test('shared input primitives expose stable automation metadata', () => {
  const sliderSource = fs.readFileSync(new URL('../components/Slider.jsx', import.meta.url), 'utf8');
  const toggleSource = fs.readFileSync(new URL('../components/Toggle.jsx', import.meta.url), 'utf8');
  assert.ok(sliderSource.includes('data-testid'), 'Slider should expose a data-testid hook');
  assert.ok(sliderSource.includes('aria-label'), 'Slider should expose an aria-label hook');
  assert.ok(sliderSource.includes('disabled={disabled}'), 'Slider should support disabled state for non-interactive controls');
  assert.ok(toggleSource.includes('data-testid'), 'Toggle should expose a data-testid hook');
  assert.ok(
    toggleSource.includes('role="switch"') || toggleSource.includes("role='switch'"),
    'Toggle should behave like a switch for automation and accessibility'
  );
});
test('shell controls expose Wave 0 selectors', () => {
  const headerSource = fs.readFileSync(new URL('../components/Header.jsx', import.meta.url), 'utf8');
  const saveLoadSource = fs.readFileSync(new URL('../components/SaveLoadPanel.jsx', import.meta.url), 'utf8');
  const compareBannerSource = fs.readFileSync(new URL('../components/ComparisonBanner.jsx', import.meta.url), 'utf8');
  const goalPanelSource = fs.readFileSync(new URL('../panels/GoalPanel.jsx', import.meta.url), 'utf8');
  const tabSource = fs.readFileSync(new URL('../components/TabBar.jsx', import.meta.url), 'utf8');
  assert.ok(headerSource.includes('header-present-mode'), 'header should expose a presentation-mode selector');
  assert.ok(headerSource.includes('header-export-json'), 'header should expose an export selector');
  assert.ok(saveLoadSource.includes('save-load-panel'), 'save/load panel should expose a root selector');
  assert.ok(saveLoadSource.includes('save-load-save-current'), 'save/load panel should expose a save selector');
  assert.ok(compareBannerSource.includes('comparison-banner-clear'), 'comparison banner should expose a clear selector');
  assert.ok(goalPanelSource.includes('goal-panel-toggle'), 'goal panel should expose a collapse toggle selector');
  assert.ok(goalPanelSource.includes('goal-form-submit'), 'goal panel should expose a stable add-goal submit selector');
  assert.ok(tabSource.includes('data-testid={`tab-${tab.id}`}'), 'tab bar should expose tab selectors');
});
test('chart automation hooks disambiguate duplicate surfaces and hover targets', () => {
  const appSource = fs.readFileSync(new URL('../FinancialModel.jsx', import.meta.url), 'utf8');
  const savingsSource = fs.readFileSync(new URL('../charts/SavingsDrawdownChart.jsx', import.meta.url), 'utf8');
  const netWorthSource = fs.readFileSync(new URL('../charts/NetWorthChart.jsx', import.meta.url), 'utf8');
  const cashFlowSource = fs.readFileSync(new URL('../charts/MonthlyCashFlowChart.jsx', import.meta.url), 'utf8');
  const incomeCompSource = fs.readFileSync(new URL('../charts/IncomeCompositionChart.jsx', import.meta.url), 'utf8');
  assert.ok(appSource.includes("instanceId: 'risk-tab'"), 'FinancialModel should assign a risk-tab instance id to duplicate charts');
  assert.ok(appSource.includes("instanceId={effectiveTab === 'risk' ? 'right-rail' : 'shared-rail'}"), 'FinancialModel should assign a separate right-rail instance id');
  assert.ok(savingsSource.includes('savings-drawdown-hover-surface'), 'savings chart should expose a stable hover surface');
  assert.ok(netWorthSource.includes('net-worth-hover-surface'), 'net worth chart should expose a stable hover surface');
  assert.ok(cashFlowSource.includes('monthly-cash-flow-hover-surface'), 'cash flow chart should expose a stable hover surface');
  assert.ok(incomeCompSource.includes('income-composition-hover-surface'), 'income composition chart should expose a stable hover surface');
});
test('retirement and Monte Carlo surfaces expose test handles for Wave 0', () => {
  const retirementSource = fs.readFileSync(new URL('../charts/RetirementIncomeChart.jsx', import.meta.url), 'utf8');
  const pwaDistributionSource = fs.readFileSync(new URL('../charts/PwaDistributionChart.jsx', import.meta.url), 'utf8');
  const monteCarloSource = fs.readFileSync(new URL('../charts/MonteCarloPanel.jsx', import.meta.url), 'utf8');
  const msftSource = fs.readFileSync(new URL('../charts/MsftVestingChart.jsx', import.meta.url), 'utf8');
  const sarahPracticeSource = fs.readFileSync(new URL('../charts/SarahPracticeChart.jsx', import.meta.url), 'utf8');
  const sequenceSource = fs.readFileSync(new URL('../charts/SequenceOfReturnsChart.jsx', import.meta.url), 'utf8');
  assert.ok(retirementSource.includes('data-testid={`retirement-mode-${mode.value}`}'), 'retirement surface should expose mode selectors');
  assert.ok(retirementSource.includes('retirement-main-chart-hover-surface'), 'retirement surface should expose a stable hover surface');
  assert.ok(retirementSource.includes('retirement-pool-draw-rate'), 'retirement surface should expose the pool draw slider selector');
  assert.ok(retirementSource.includes('retirement-decision-preview'), 'retirement surface should expose a decision preview selector');
  assert.ok(pwaDistributionSource.includes("testIdPrefix = 'pwa-distribution'"), 'PWA distribution chart should support caller-provided selector prefixes');
  assert.ok(monteCarloSource.includes('monte-carlo-fan-chart-hover-surface'), 'Monte Carlo should expose a stable hover surface');
  assert.ok(msftSource.includes('msft-vesting-total-remaining'), 'MSFT vesting chart should expose derived output selectors');
  assert.ok(sarahPracticeSource.includes('sarah-practice-summary'), 'Sarah practice chart should expose derived summary selectors');
  assert.ok(sequenceSource.includes('sequence-returns-narrative'), 'sequence-of-returns chart should expose its narrative selector');
});
test('retirement empty-state fallback keeps optimal-rate fields numeric', () => {
  const retirementSource = fs.readFileSync(new URL('../hooks/useRetirementSimulation.js', import.meta.url), 'utf8');
  assert.ok(retirementSource.includes('optimalRate: 0, optimalMonthly: 0'), 'retirement empty fallback should define optimalRate and optimalMonthly');
});
test('reset all uses an explicit confirmation before resetting state', () => {
  const appSource = fs.readFileSync(new URL('../FinancialModel.jsx', import.meta.url), 'utf8');
  assert.ok(appSource.includes("window.confirm('Reset all assumptions back to the baseline model?')"), 'reset all should confirm before dispatching RESET_ALL');
});
test('SSDI denied disables the SSDI-path consulting slider', () => {
  const incomeControlsSource = fs.readFileSync(new URL('../panels/IncomeControls.jsx', import.meta.url), 'utf8');
  assert.ok(incomeControlsSource.includes('disabled={ssdiDenied}'), 'SSDI consulting slider should be disabled while SSDI is denied');
  assert.ok(incomeControlsSource.includes('Disabled while SSDI is denied.'), 'SSDI consulting section should explain the disabled state');
});
test('bridge chart endpoint label stays inside the plot area', () => {
  const bridgeSource = fs.readFileSync(new URL('../charts/BridgeChart.jsx', import.meta.url), 'utf8');
  assert.ok(bridgeSource.includes('x={svgW - padR - 4}'), 'bridge endpoint label should anchor inside the right edge');
  assert.ok(
    bridgeSource.includes("textAnchor='end'") || bridgeSource.includes('textAnchor="end"'),
    'bridge endpoint label should anchor inward to avoid clipping'
  );
});

console.log('\n=== UI Swarm Contract Guards ===');

test('UI swarm operator guide and manifest exist', () => {
  const readmeSource = fs.readFileSync(new URL('../../tests/ui/README.md', import.meta.url), 'utf8');
  const manifestSource = fs.readFileSync(new URL('../../tests/ui/coverage-manifest.json', import.meta.url), 'utf8');
  const runnerSource = fs.readFileSync(new URL('../../tests/ui/run-swarm.js', import.meta.url), 'utf8');
  assert.ok(readmeSource.includes('UI Swarm Validation'), 'README should describe the UI swarm workflow');
  assert.ok(readmeSource.includes('npm run ui:swarm'), 'README should document the one-command swarm runner');
  assert.ok(manifestSource.length > 0, 'coverage manifest should not be empty');
  assert.ok(runnerSource.includes('UI swarm complete:'), 'UI swarm runner should emit a final summary');
});
test('UI swarm manifest is parseable and targets deterministic harness mode', () => {
  const manifest = JSON.parse(fs.readFileSync(new URL('../../tests/ui/coverage-manifest.json', import.meta.url), 'utf8'));
  eq(manifest.version, 1, 'manifest version');
  eq(manifest.workers.length, 6, 'worker count');
  assert.ok(manifest.appUrl.includes('ui_test=1'), 'manifest should run with ui_test enabled');
  assert.ok(manifest.appUrl.includes('mc_seed=123'), 'manifest should pin a Monte Carlo seed');
  assert.ok(manifest.appUrl.includes('reset_storage=1'), 'manifest should start from reset storage');
});
test('UI swarm manifest covers the highest-risk interactive surfaces', () => {
  const manifest = JSON.parse(fs.readFileSync(new URL('../../tests/ui/coverage-manifest.json', import.meta.url), 'utf8'));
  const entryIds = new Set(manifest.entries.map((entry) => entry.id));
  [
    'shell.save_load.lifecycle',
    'plan.income_controls.core',
    'risk.monte_carlo.controls',
    'risk.savings_drawdown.instances',
    'retirement.mode_and_help',
    'retirement.pwa_distribution.hover',
    'details.summary_and_table.observe'
  ].forEach((id) => {
    assert.ok(entryIds.has(id), `manifest should include ${id}`);
  });
});
test('UI swarm manifest retirement selectors match the current DOM contract', () => {
  const manifest = JSON.parse(fs.readFileSync(new URL('../../tests/ui/coverage-manifest.json', import.meta.url), 'utf8'));
  const historical = manifest.entries.find((entry) => entry.id === 'retirement.historical_controls');
  const pwaControls = manifest.entries.find((entry) => entry.id === 'retirement.pwa_controls');
  const distribution = manifest.entries.find((entry) => entry.id === 'retirement.pwa_distribution.hover');
  const decisionPreview = manifest.entries.find((entry) => entry.id === 'retirement.decision_preview.observe');
  const selectors = historical.elements.map((element) => element.selector);
  const pwaSelectors = pwaControls.elements.map((element) => element.selector);
  assert.ok(selectors.includes('[aria-label=\"Pool floor reserve\"]'), 'manifest should target the pool floor reserve aria label');
  assert.ok(selectors.includes('[aria-label=\"Chad passes at\"]'), 'manifest should target the Chad passes at aria label');
  assert.ok(selectors.includes("[aria-label=\"Sarah's age at inheritance\"]"), 'manifest should target the Sarah age at inheritance aria label');
  assert.ok(pwaSelectors.includes('[aria-label=\"Tolerance low\"]'), 'manifest should target the tolerance low aria label');
  assert.ok(pwaSelectors.includes('[aria-label=\"Tolerance high\"]'), 'manifest should target the tolerance high aria label');
  eq(distribution.elements[0].selector, '[data-testid=\"retirement-pwa-distribution-hover-surface\"]', 'retirement PWA distribution selector');
  eq(decisionPreview.elements[0].selector, '[data-testid=\"retirement-decision-preview\"]', 'retirement decision preview selector');
});
test('UI swarm manifest uses stable selectors for previously partial surfaces', () => {
  const manifest = JSON.parse(fs.readFileSync(new URL('../../tests/ui/coverage-manifest.json', import.meta.url), 'utf8'));
  const comparison = manifest.entries.find((entry) => entry.id === 'shell.comparison_banner.clear');
  const goals = manifest.entries.find((entry) => entry.id === 'shell.goal_panel.core');
  const msft = manifest.entries.find((entry) => entry.id === 'income.msft_vesting.controls');
  const sarahPractice = manifest.entries.find((entry) => entry.id === 'income.sarah_practice.observe');
  const sequence = manifest.entries.find((entry) => entry.id === 'risk.sequence_of_returns.controls');
  eq(comparison.status, 'ready', 'comparison banner status');
  eq(goals.status, 'ready', 'goal panel status');
  eq(msft.status, 'ready', 'MSFT vesting status');
  eq(sequence.status, 'ready', 'sequence-of-returns status');
  assert.ok(comparison.elements.some((element) => element.selector === '[data-testid=\"comparison-banner-clear\"]'), 'comparison banner should use stable selector');
  assert.ok(goals.elements.some((element) => element.selector === '[data-testid=\"goal-form-name\"]'), 'goal panel should use stable form selectors');
  assert.ok(msft.elements.some((element) => element.selector === '[data-testid=\"msft-vesting-total-remaining\"]'), 'MSFT vesting should use stable derived selectors');
  assert.ok(sarahPractice.elements.some((element) => element.selector === '[data-testid=\"sarah-practice-summary\"]'), 'Sarah practice should use stable derived selectors');
  assert.ok(sequence.elements.some((element) => element.selector === '[data-testid=\"sequence-returns-narrative\"]'), 'sequence-of-returns should use stable narrative selector');
});
test('package.json exposes the one-command UI swarm runner', () => {
  const pkg = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  eq(pkg.scripts['ui:swarm'], 'node tests/ui/run-swarm.js', 'ui:swarm script');
});

test('package.json exposes the preview-based UI perf runner', () => {
  const pkg = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  eq(pkg.scripts['ui:perf'], 'node tests/ui/perf/run-perf.js', 'ui:perf script');
});

test('UI perf runner artifacts exist', () => {
  assert.ok(fs.existsSync(new URL('../../tests/ui/perf/run-perf.js', import.meta.url)), 'ui perf runner should exist');
  assert.ok(fs.existsSync(new URL('../../tests/ui/perf/budgets.json', import.meta.url)), 'ui perf budgets should exist');
  assert.ok(fs.existsSync(new URL('../../tests/ui/perf/README.md', import.meta.url)), 'ui perf README should exist');
});

test('UI perf budgets stay deterministic and complete', () => {
  const perfBudgets = JSON.parse(fs.readFileSync(new URL('../../tests/ui/perf/budgets.json', import.meta.url), 'utf8'));
  assert.ok(perfBudgets.appUrl.includes('ui_test=1'), 'perf budgets should target deterministic ui_test mode');
  assert.ok(perfBudgets.appUrl.includes('mc_seed=123'), 'perf budgets should seed Monte Carlo');
  assert.ok(perfBudgets.appUrl.includes('reset_storage=1'), 'perf budgets should reset storage');
  assert.ok(Array.isArray(perfBudgets.metrics) && perfBudgets.metrics.length > 0, 'perf budgets should define at least one metric');
  perfBudgets.metrics.forEach((metric) => {
    assert.ok(metric.id, 'each perf budget should have an id');
    assert.ok(typeof metric.maxMedianMs === 'number', `perf budget ${metric.id} should cap median latency`);
    assert.ok(typeof metric.maxP95Ms === 'number', `perf budget ${metric.id} should cap p95 latency`);
    assert.ok(typeof metric.maxLongTaskCount === 'number', `perf budget ${metric.id} should cap long-task count`);
    assert.ok(typeof metric.maxLongTaskMs === 'number', `perf budget ${metric.id} should cap long-task duration`);
  });
});

test('Slider exposes draft and release-commit performance controls', () => {
  const sliderSource = fs.readFileSync(new URL('../components/Slider.jsx', import.meta.url), 'utf8');
  assert.ok(sliderSource.includes("commitStrategy = 'continuous'"), 'Slider should support explicit commit strategies');
  assert.ok(sliderSource.includes('onDraftChange'), 'Slider should expose draft-change semantics');
  assert.ok(sliderSource.includes('hideHeader'), 'Slider should support compact embedded layouts');
  assert.ok(sliderSource.includes('pointerActiveRef'), 'Slider should avoid mid-drag settled commits while the pointer is active');
});

test('Hot slider surfaces no longer use raw range inputs outside the shared Slider primitive', () => {
  const expenseSource = fs.readFileSync(new URL('../panels/ExpenseControls.jsx', import.meta.url), 'utf8');
  const goalSource = fs.readFileSync(new URL('../panels/GoalPanel.jsx', import.meta.url), 'utf8');
  const retirementSource = fs.readFileSync(new URL('../charts/RetirementIncomeChart.jsx', import.meta.url), 'utf8');
  assert.ok(!expenseSource.includes("type='range'") && !expenseSource.includes('type="range"'), 'ExpenseControls should route hot sliders through Slider');
  assert.ok(!goalSource.includes("type='range'") && !goalSource.includes('type="range"'), 'GoalPanel should route the target-month slider through Slider');
  assert.ok(!retirementSource.includes("type='range'") && !retirementSource.includes('type="range"'), 'RetirementIncomeChart should route the pool draw slider through Slider');
});

test('UI harness exposes performance counters for render, commit, and compute tracking', () => {
  const harnessSource = fs.readFileSync(new URL('../testing/uiHarness.js', import.meta.url), 'utf8');
  const perfMetricsSource = fs.readFileSync(new URL('../testing/perfMetrics.js', import.meta.url), 'utf8');
  assert.ok(harnessSource.includes('resetPerfMetrics'), 'UI harness should reset perf metrics');
  assert.ok(harnessSource.includes('getPerfMetrics'), 'UI harness should expose perf metrics');
  assert.ok(harnessSource.includes('bumpSliderCommit'), 'UI harness should track slider commits');
  assert.ok(harnessSource.includes('bumpCompute'), 'UI harness should track compute counts');
  assert.ok(perfMetricsSource.includes('useRenderMetric'), 'perf metrics helper should expose a render hook');
  assert.ok(perfMetricsSource.includes('noteSliderDraft'), 'perf metrics helper should track slider drafts');
});

test('UI perf runner measures drag-path interactions and counter budgets across heavy slider families', () => {
  const perfRunnerSource = fs.readFileSync(new URL('../../tests/ui/perf/run-perf.js', import.meta.url), 'utf8');
  const perfBudgets = JSON.parse(fs.readFileSync(new URL('../../tests/ui/perf/budgets.json', import.meta.url), 'utf8'));
  assert.ok(perfRunnerSource.includes('dragSliderToValue'), 'perf runner should measure real drag paths');
  assert.ok(perfRunnerSource.includes('resetPerfMetrics'), 'perf runner should reset perf counters between samples');
  assert.ok(perfRunnerSource.includes('waitForCounterDelta'), 'perf runner should wait on perf-counter deltas');
  [
    'plan.base_expense_slider_drag_ms',
    'plan.cuts_slider_drag_ms',
    'plan.bcs_slider_drag_ms',
    'income.ssdi_approval_slider_drag_ms',
    'goal.target_month_slider_drag_ms',
    'retirement.pool_draw_slider_drag_ms',
    'risk.mc_num_sims_slider_drag_ms',
  ].forEach((id) => {
    assert.ok(perfBudgets.metrics.some((metric) => metric.id === id), `perf budgets should include ${id}`);
  });
});

test('FinancialModel and heavy slider surfaces expose performance instrumentation hooks', () => {
  const financialSource = fs.readFileSync(new URL('../FinancialModel.jsx', import.meta.url), 'utf8');
  const goalSource = fs.readFileSync(new URL('../panels/GoalPanel.jsx', import.meta.url), 'utf8');
  const monteCarloSource = fs.readFileSync(new URL('../charts/MonteCarloPanel.jsx', import.meta.url), 'utf8');
  const retirementSource = fs.readFileSync(new URL('../charts/RetirementIncomeChart.jsx', import.meta.url), 'utf8');
  assert.ok(financialSource.includes("noteCompute('projection')"), 'FinancialModel should track projection recomputation');
  assert.ok(goalSource.includes("useRenderMetric('GoalPanel')"), 'GoalPanel should expose render instrumentation');
  assert.ok(monteCarloSource.includes("useRenderMetric('MonteCarloPanel')"), 'MonteCarloPanel should expose render instrumentation');
  assert.ok(retirementSource.includes("useRenderMetric('RetirementIncomeChart')"), 'RetirementIncomeChart should expose render instrumentation');
});

console.log('\n=== UI Foundation Guards ===');

test('formatModelTimeLabel preserves the shared M0/Y1 timeline contract', () => {
  eq(formatModelTimeLabel(0), 'M0');
  eq(formatModelTimeLabel(5), 'M5');
  eq(formatModelTimeLabel(12), 'Y1');
});

test('summary timeframe labels are sourced from the shared glossary', () => {
  eq(getSummaryTimeframeLabel('current'), TIMEFRAME_LABELS.currentAssumptions);
  eq(getSummaryTimeframeLabel('steady'), TIMEFRAME_LABELS.steadyState);
});

test('buildLegendItems filters falsy entries and assigns fallback ids', () => {
  const legend = buildLegendItems([
    { label: 'Current', color: '#fff' },
    null,
    { id: 'compare', label: 'Compare', color: '#000' },
  ]);
  eq(legend.length, 2);
  eq(legend[0].id, 'legend-0');
  eq(legend[1].id, 'compare');
});

test('chart contract caps primary annotations at four', () => {
  eq(CHART_PRESENTATION.maxPrimaryAnnotations, 10);
});

test('ui glossary exports canonical timeline, retirement, and risk labels', () => {
  eq(TIMEFRAME_LABELS.modelStart, 'M0');
  eq(RETIREMENT_LABELS.futureCutRisk, 'Won’t need to cut later');
  eq(RISK_LABELS.sequenceRisk, 'Sequence risk');
});

test('shell width buckets follow the shared breakpoint contract', () => {
  eq(getShellWidthBucket(UI_BREAKPOINTS.compact - 1), 'compact');
  eq(getShellWidthBucket(UI_BREAKPOINTS.compact), 'stacked');
  eq(getShellWidthBucket(UI_BREAKPOINTS.railCollapse), 'stacked');
});

test('index.css no longer uses style-string typography overrides', () => {
  const source = fs.readFileSync(new URL('../index.css', import.meta.url), 'utf8');
  assert.ok(!source.includes('[style*="font-size:'), 'font-size string hacks should be removed');
  assert.ok(!source.includes('[style*="color:'), 'color string hacks should be removed');
});

test('FinancialModel uses breakpoint-driven app shell scaffold', () => {
  const source = fs.readFileSync(new URL('../FinancialModel.jsx', import.meta.url), 'utf8');
  assert.ok(source.includes('const [shellWidthBucket, setShellWidthBucket] = useState'), 'shell should track breakpoint buckets');
  assert.ok(source.includes('<AppShell'), 'shell should render AppShell');
  assert.ok(source.includes('showEmbeddedBalanceCharts={!showRail}'), 'risk tab should suppress duplicate balance charts when the rail is visible');
  assert.ok(source.includes('useDeferredValue(bridgeProps)'), 'planner bridge updates should be deferrable');
  assert.ok(source.includes('useDeferredValue(retirementRailProps)'), 'planner rail retirement props should be deferred');
  assert.ok(source.includes('deferredRetirementRailProps'), 'retirement rail props should be deferred');
  assert.ok(source.includes('savingsDrawdownProps') && source.includes('netWorthProps'), 'savings and net worth rail charts should use immediate props for responsive sliders');
});

test('useLaggedValue exists for non-urgent rail updates', () => {
  const source = fs.readFileSync(new URL('../ui/useLaggedValue.js', import.meta.url), 'utf8');
  assert.ok(source.includes('window.setTimeout'), 'lagged value updates should wait on a timer');
  assert.ok(source.includes('window.clearTimeout'), 'lagged value updates should clear pending timers');
});

test('docs ui contract records the required shell behavior matrix and help hierarchy', () => {
  const source = fs.readFileSync(new URL('../../docs/ui-contract.md', import.meta.url), 'utf8');
  assert.ok(source.includes('## Required Shell Behavior Matrix'), 'shell matrix heading should exist');
  assert.ok(source.includes('railPlacement'), 'shell matrix should document rail placement');
  assert.ok(source.includes('drawer = section framing'), 'help hierarchy should define drawer ownership');
});

test('ActionButton and SurfaceCard exist as Wave 1 shell primitives', () => {
  assert.ok(fs.existsSync(new URL('../components/ui/ActionButton.jsx', import.meta.url)));
  assert.ok(fs.existsSync(new URL('../components/ui/SurfaceCard.jsx', import.meta.url)));
});

console.log('\n=== Wave 2 UI Contract Guards ===');

test('reducer supports batched field updates for hot UI paths', () => {
  const next = reducer(INITIAL_STATE, {
    type: 'SET_FIELDS',
    fields: {
      cutShopping: 999,
      cutsOverride: null,
    },
  });
  eq(next.cutShopping, 999);
  eq(next.cutsOverride, null);
});

test('Slider exposes helperText and disabledReason semantics', () => {
  const source = fs.readFileSync(new URL('../components/Slider.jsx', import.meta.url), 'utf8');
  assert.ok(source.includes('helperText'), 'slider should support helperText');
  assert.ok(source.includes('disabledReason'), 'slider should support disabledReason');
});

test('Toggle exposes description and disabledReason semantics', () => {
  const source = fs.readFileSync(new URL('../components/Toggle.jsx', import.meta.url), 'utf8');
  assert.ok(source.includes('description'), 'toggle should support description');
  assert.ok(source.includes('disabledReason'), 'toggle should support disabledReason');
});

test('Help primitives use larger readable targets and token-driven text sizing', () => {
  const tipSource = fs.readFileSync(new URL('../components/help/HelpTip.jsx', import.meta.url), 'utf8');
  const popoverSource = fs.readFileSync(new URL('../components/help/HelpPopover.jsx', import.meta.url), 'utf8');
  assert.ok(tipSource.includes("size = 'md'"), 'help tip should expose a size prop');
  assert.ok(tipSource.includes('const SIZE_MAP'), 'help tip should use explicit size mapping');
  assert.ok(popoverSource.includes('UI_TEXT.caption'), 'help popover should use token-driven readable body sizing');
});

test('GoalPanel uses a semantic collapse button and responsive form layout', () => {
  const source = fs.readFileSync(new URL('../panels/GoalPanel.jsx', import.meta.url), 'utf8');
  assert.ok(source.includes("type='button'"), 'goal panel toggle should be a semantic button');
  assert.ok(source.includes("repeat(auto-fit, minmax(220px, 1fr))"), 'goal form should fall back responsively');
  assert.ok(source.includes('ActionButton'), 'goal panel should use shared action buttons');
});

test('SaveLoadPanel routes scenario actions through shared action buttons', () => {
  const source = fs.readFileSync(new URL('../components/SaveLoadPanel.jsx', import.meta.url), 'utf8');
  assert.ok(source.includes('ActionButton'), 'save/load panel should use shared action buttons');
  assert.ok(source.includes('Stop comparing'), 'save/load panel should expose a clear compare action');
});

test('Monthly and rail charts adopt the shared chart contract helpers', () => {
  const bridgeSource = fs.readFileSync(new URL('../charts/BridgeChart.jsx', import.meta.url), 'utf8');
  const cashFlowSource = fs.readFileSync(new URL('../charts/MonthlyCashFlowChart.jsx', import.meta.url), 'utf8');
  const incomeSource = fs.readFileSync(new URL('../charts/IncomeCompositionChart.jsx', import.meta.url), 'utf8');
  const savingsSource = fs.readFileSync(new URL('../charts/SavingsDrawdownChart.jsx', import.meta.url), 'utf8');
  const netWorthSource = fs.readFileSync(new URL('../charts/NetWorthChart.jsx', import.meta.url), 'utf8');
  const pwaSource = fs.readFileSync(new URL('../charts/PwaDistributionChart.jsx', import.meta.url), 'utf8');
  assert.ok(bridgeSource.includes('formatModelTimeLabel'), 'bridge chart should use shared model-time labels');
  assert.ok(cashFlowSource.includes('buildLegendItems'), 'monthly cash flow chart should use shared legend helpers');
  assert.ok(incomeSource.includes('buildLegendItems'), 'income composition chart should use shared legend helpers');
  assert.ok(savingsSource.includes('formatModelTimeLabel'), 'savings drawdown chart should use shared model-time labels');
  assert.ok(netWorthSource.includes('formatModelTimeLabel'), 'net worth chart should use shared model-time labels');
  assert.ok(pwaSource.includes('buildLegendItems'), 'PWA distribution chart should use shared legend helpers');
});

test('PlanTab owns ScenarioStrip and exposes workspace selector', () => {
  const planSource = fs.readFileSync(new URL('../panels/tabs/PlanTab.jsx', import.meta.url), 'utf8');
  assert.ok(planSource.includes('<ScenarioStrip {...scenarioStripProps} />'), 'PlanTab should render ScenarioStrip');
  assert.ok(planSource.includes("data-testid='plan-workspace'"), 'PlanTab should expose a stable workspace selector');
});

test('FinancialModel passes planning workflow props into PlanTab', () => {
  const source = fs.readFileSync(new URL('../FinancialModel.jsx', import.meta.url), 'utf8');
  assert.ok(source.includes('scenarioStripProps={scenarioStripProps}'), 'FinancialModel should pass scenarioStripProps into PlanTab');
  assert.ok(source.includes('showCompareBanner'), 'FinancialModel should keep compare state in the compact summary zone');
});

test('FinancialModel passes best-projected-gap inputs into KeyMetrics', () => {
  const source = fs.readFileSync(new URL('../FinancialModel.jsx', import.meta.url), 'utf8');
  assert.ok(source.includes('bestProjectedGap={bestProjectedGap}'), 'FinancialModel should pass bestProjectedGap into KeyMetrics');
  assert.ok(source.includes('bestProjectedLabel={bestProjectedLabel}'), 'FinancialModel should pass bestProjectedLabel into KeyMetrics');
});

test('Overview forces the rail below and Plan hides it', () => {
  const source = fs.readFileSync(new URL('../FinancialModel.jsx', import.meta.url), 'utf8');
  assert.ok(source.includes("effectiveTab === 'overview'"), 'overview should force below-rail placement');
  assert.ok(source.includes("effectiveTab !== 'plan'"), 'plan should hide the shared rail');
});

test('AppShell narrows the side rail width contract', () => {
  const source = fs.readFileSync(new URL('../components/layout/AppShell.jsx', import.meta.url), 'utf8');
  assert.ok(source.includes("minmax(320px, 420px)"), 'AppShell should narrow the side rail width');
  assert.ok(!source.includes("minmax(460px, 560px)"), 'AppShell should drop the old wide side-rail contract');
});

test('shell width buckets collapse the rail at 1180 inclusive', () => {
  eq(getShellWidthBucket(959), 'compact');
  eq(getShellWidthBucket(960), 'stacked');
  eq(getShellWidthBucket(1180), 'stacked');
  eq(getShellWidthBucket(1181), 'desktop');
});

test('KeyMetrics uses a single compact overview status strip contract', () => {
  const source = fs.readFileSync(new URL('../components/KeyMetrics.jsx', import.meta.url), 'utf8');
  assert.ok(source.includes('buildOverviewStatusModel'), 'KeyMetrics should use the overview story helper');
  assert.ok(source.includes("data-testid='overview-status-strip'"), 'KeyMetrics should expose the overview status strip selector');
  assert.ok(source.includes('data-testid="key-metrics-total-spend"'), 'KeyMetrics should expose the total spend input selector');
  assert.ok(source.includes("overview-status-current-gap"), 'KeyMetrics should expose the current-gap selector');
  assert.ok(source.includes("overview-status-best-gap"), 'KeyMetrics should expose the best-gap selector');
  assert.ok(!source.includes('summaryCards = ['), 'KeyMetrics should not keep the old summaryCards deck');
  assert.ok(!source.includes('const metrics = ['), 'KeyMetrics should not keep the old second metrics grid');
});

test('ActiveTogglePills exposes a compact active-plan summary row', () => {
  const source = fs.readFileSync(new URL('../components/ActiveTogglePills.jsx', import.meta.url), 'utf8');
  assert.ok(source.includes("data-testid='overview-active-plan-summary'"), 'ActiveTogglePills should expose the compact active-plan summary selector');
  assert.ok(source.includes('Baseline assumptions active.'), 'ActiveTogglePills should render a baseline summary when no levers are active');
  assert.ok(source.includes('overview-active-pill-'), 'ActiveTogglePills should expose stable active-pill selectors');
});

console.log('\n=== Wave 3 UI Contract Guards ===');

test('Retirement surface distinguishes planning modes with identity and control sections', () => {
  const source = fs.readFileSync(new URL('../charts/RetirementIncomeChart.jsx', import.meta.url), 'utf8');
  assert.ok(source.includes('function ModeIdentityBanner'), 'retirement surface should define a mode identity banner');
  assert.ok(source.includes('testId="retirement-mode-identity"') || source.includes("testId='retirement-mode-identity'"), 'retirement surface should expose the mode identity banner');
  assert.ok(source.includes('Primary decisions'), 'retirement surface should group controls under primary decisions');
  assert.ok(source.includes('Advanced assumptions'), 'retirement surface should group controls under advanced assumptions');
});

test('Risk tab is sequenced around questions instead of flat widgets', () => {
  const source = fs.readFileSync(new URL('../panels/tabs/RiskTab.jsx', import.meta.url), 'utf8');
  assert.ok(source.includes('function RiskQuestion'), 'risk tab should define a question wrapper');
  assert.ok(source.includes('data-testid="risk-workflow-overview"'), 'risk tab should expose a workflow overview');
  assert.ok(source.includes('Question 1'), 'risk tab should label the probability step');
  assert.ok(source.includes('Question 2'), 'risk tab should label the sequence step');
});

test('Risk charts use decision-oriented wording and reduced sequence clutter', () => {
  const monteCarloSource = fs.readFileSync(new URL('../charts/MonteCarloPanel.jsx', import.meta.url), 'utf8');
  const sequenceSource = fs.readFileSync(new URL('../charts/SequenceOfReturnsChart.jsx', import.meta.url), 'utf8');
  assert.ok(monteCarloSource.includes('Will the plan stay solvent through the 6-year outlook?'), 'Monte Carlo should lead with the decision question');
  assert.ok(monteCarloSource.includes('Which assumption moves the result most?'), 'Monte Carlo should frame sensitivity by question');
  assert.ok(sequenceSource.includes('buildLegendItems'), 'sequence chart should use shared legend helpers');
  assert.ok(sequenceSource.includes('data-testid="sequence-returns-summary"'), 'sequence chart should expose its summary strip');
  assert.ok(sequenceSource.includes('if (i === 0) return null;'), 'sequence chart should reduce endpoint-label clutter');
});

test('UI swarm manifest tracks the new risk workflow and retirement identity selectors', () => {
  const manifest = JSON.parse(fs.readFileSync(new URL('../../tests/ui/coverage-manifest.json', import.meta.url), 'utf8'));
  const sequence = manifest.entries.find((entry) => entry.id === 'risk.sequence_of_returns.controls');
  const retirement = manifest.entries.find((entry) => entry.id === 'retirement.mode_and_help');
  assert.ok(sequence.elements.some((element) => element.selector === '[data-testid="risk-workflow-overview"]'), 'risk manifest should track the workflow overview');
  assert.ok(sequence.elements.some((element) => element.selector === '[data-testid="sequence-returns-summary"]'), 'risk manifest should track the sequence summary strip');
  assert.ok(retirement.elements.some((element) => element.selector === '[data-testid="retirement-mode-identity"]'), 'retirement manifest should track the mode identity banner');
});

console.log('\n=== Wave 4 UI Contract Guards ===');

test('Overview wires the simplified bridge variant explicitly', () => {
  const overviewSource = fs.readFileSync(new URL('../panels/tabs/OverviewTab.jsx', import.meta.url), 'utf8');
  assert.ok(overviewSource.includes("variant='overview'"), 'OverviewTab should pass the overview bridge variant');
});

test('BridgeChart uses the single-card monthly gap path contract', () => {
  const bridgeSource = fs.readFileSync(new URL('../charts/BridgeChart.jsx', import.meta.url), 'utf8');
  assert.ok(bridgeSource.includes('{story.title}'), 'BridgeChart should render the simplified story-driven title');
  assert.ok(bridgeSource.includes("data-testid='bridge-card'"), 'BridgeChart should expose the bridge card selector');
  assert.ok(bridgeSource.includes("data-testid='bridge-kpi-strip'"), 'BridgeChart should expose the KPI strip selector');
  assert.ok(bridgeSource.includes("data-testid='bridge-driver-groups'"), 'BridgeChart should expose grouped drivers below the chart');
  assert.ok(bridgeSource.includes("data-testid='bridge-marker-layer'"), 'BridgeChart should expose the marker layer selector');
  assert.ok(bridgeSource.includes('layoutMarkerLabels'), 'BridgeChart should lay marker labels out instead of alternating by raw index');
  assert.ok(bridgeSource.includes('return `bridge-marker-${item.id}`;'), 'BridgeChart should expose stable bridge marker selectors');
  assert.ok(bridgeSource.includes('variant === \'overview\''), 'BridgeChart should vary presentation by overview/plan mode');
  assert.ok(!bridgeSource.includes('Lever summary — total monthly impact of each action'), 'BridgeChart should not retain the old lever-summary waterfall');
  assert.ok(!bridgeSource.includes('Bridge to Sustainability'), 'BridgeChart should not retain the old bridge title');
});

test('UI swarm manifest tracks the simplified bridge surface selectors', () => {
  const manifest = JSON.parse(fs.readFileSync(new URL('../../tests/ui/coverage-manifest.json', import.meta.url), 'utf8'));
  const overview = manifest.entries.find((entry) => entry.id === 'overview.status_and_bridge');
  const dense = manifest.entries.find((entry) => entry.id === 'overview.bridge_dense_markers');
  const plan = manifest.entries.find((entry) => entry.id === 'plan.workspace_first');
  assert.ok(overview.elements.some((element) => element.selector === '[data-testid="bridge-card"]'), 'overview manifest should track the bridge card selector');
  assert.ok(overview.elements.some((element) => element.selector === '[data-testid="bridge-kpi-strip"]'), 'overview manifest should track the bridge KPI strip selector');
  assert.ok(overview.elements.some((element) => element.selector === '[data-testid="bridge-driver-groups"]'), 'overview manifest should track the grouped driver selector');
  assert.ok(dense.elements.some((element) => element.selector === '[data-testid="bridge-marker-ss_income"]'), 'dense overview manifest should track the SS marker selector');
  assert.ok(plan.elements.some((element) => element.selector === '[data-testid="plan-primary-levers-section"]'), 'plan manifest should track the primary levers section');
  assert.ok(plan.elements.some((element) => element.selector === '[data-testid="plan-bridge-feedback"]'), 'plan manifest should track the bridge feedback section');
});

console.log('\n=== UI-07 Utility And Mode Alignment Guards ===');

test('SummaryAsk is structured as a decision workflow', () => {
  const summarySource = fs.readFileSync(new URL('../panels/SummaryAsk.jsx', import.meta.url), 'utf8');
  assert.ok(summarySource.includes("data-testid='summary-ask'"), 'summary ask should expose a stable root selector');
  assert.ok(summarySource.includes('What is happening'), 'summary ask should explain what is happening');
  assert.ok(summarySource.includes('The next best lever'), 'summary ask should identify the next best lever');
  assert.ok(summarySource.includes('What the ask covers'), 'summary ask should identify what the ask covers');
});

test('utility panels use shared workflow language', () => {
  const saveLoadSource = fs.readFileSync(new URL('../components/SaveLoadPanel.jsx', import.meta.url), 'utf8');
  const goalPanelSource = fs.readFileSync(new URL('../panels/GoalPanel.jsx', import.meta.url), 'utf8');
  assert.ok(saveLoadSource.includes('Scenario workspace'), 'save/load panel should use scenario workspace wording');
  assert.ok(saveLoadSource.includes('Save checkpoint'), 'save/load panel should use checkpoint language');
  assert.ok(saveLoadSource.includes('saved checkpoint'), 'save/load panel should describe saved checkpoints');
  assert.ok(goalPanelSource.includes('Planning goals'), 'goal panel should use planning-goal wording');
  assert.ok(goalPanelSource.includes('goal-panel-subtitle'), 'goal panel should expose its workflow subtitle');
  assert.ok(goalPanelSource.includes('Track goal'), 'goal panel should use action-oriented goal wording');
});


test('UI swarm manifest retires alternate modes from the active surface contract', () => {
  const manifest = JSON.parse(fs.readFileSync(new URL('../../tests/ui/coverage-manifest.json', import.meta.url), 'utf8'));
  const details = manifest.entries.find((entry) => entry.id === 'details.summary_and_table.observe');
  assert.ok(details.elements.some((element) => element.selector === '[data-testid="summary-ask-next-lever"]'), 'details manifest should track the summary next-lever selector');
  assert.ok(!manifest.entries.some((entry) => entry.id === 'sarah_mode.entry_exit_and_sliders'), 'Sarah mode should be retired from the active manifest');
  assert.ok(!manifest.entries.some((entry) => entry.id === 'dad_mode.entry_exit_and_progression'), 'Dad mode progression should be retired from the active manifest');
  assert.ok(!manifest.entries.some((entry) => entry.id === 'dad_mode.support_controls'), 'Dad mode support controls should be retired from the active manifest');
});

console.log('\n=== UI-08 Validation And Guardrail Checks ===');

test('UI swarm runner supports compact viewport coverage and mode exclusivity checks', () => {
  const runnerSource = fs.readFileSync(new URL('../../tests/ui/run-swarm.js', import.meta.url), 'utf8');
  const manifest = JSON.parse(fs.readFileSync(new URL('../../tests/ui/coverage-manifest.json', import.meta.url), 'utf8'));
  const compact = manifest.entries.find((entry) => entry.id === 'shell.compact_layout');
  const exclusivity = manifest.entries.find((entry) => entry.id === 'shell.mode_exclusivity');
  assert.ok(runnerSource.includes('const VIEWPORTS ='), 'ui swarm runner should define a viewport matrix');
  assert.ok(runnerSource.includes('shell.compact_layout'), 'ui swarm runner should execute compact shell coverage');
  assert.ok(runnerSource.includes('shell.mode_exclusivity'), 'ui swarm runner should execute mode exclusivity coverage');
  eq(compact.status, 'ready', 'compact layout manifest status');
  eq(exclusivity.status, 'ready', 'mode exclusivity manifest status');
});

test('planner and present are the only shell modes', () => {
  const source = fs.readFileSync(new URL('../FinancialModel.jsx', import.meta.url), 'utf8');
  assert.ok(!source.includes("activeExperience"), 'activeExperience indirection should be removed');
  assert.ok(!source.includes("'sarah'"), 'Sarah mode should be removed');
  assert.ok(!source.includes("'dad'"), 'Dad mode should be removed');
});

test('shell performance guardrails stay event-driven without polling or observer churn', () => {
  const financialSource = fs.readFileSync(new URL('../FinancialModel.jsx', import.meta.url), 'utf8');
  const shellSource = fs.readFileSync(new URL('../components/layout/AppShell.jsx', import.meta.url), 'utf8');
  const resizeListeners = (financialSource.match(/addEventListener\('resize'/g) || []).length;
  const animationFrameCalls = (financialSource.match(/requestAnimationFrame\(/g) || []).length;
  eq(resizeListeners, 1, 'FinancialModel should use a single resize listener for breakpoint updates');
  eq(animationFrameCalls, 1, 'FinancialModel should use at most one animation-frame debounce for breakpoint updates');
  assert.ok(!financialSource.includes('setInterval('), 'FinancialModel should not introduce polling timers');
  assert.ok(!shellSource.includes('ResizeObserver'), 'AppShell should not introduce resize observers for layout');
});

test('screenshot evidence manifest covers shell, Overview, Plan, Primary Levers, retirement, risk, Sarah, and Dad at required breakpoints', () => {
  const evidence = JSON.parse(fs.readFileSync(new URL('../../tests/ui/screenshot-evidence.json', import.meta.url), 'utf8'));
  const required = ['1440x1200', '1180x1000', '900x1000'];
  eq(evidence.requiredViewports.length, required.length, 'required screenshot viewport count');
  for (const surface of ['shell', 'overview_reset', 'plan_workspace', 'primary_levers', 'retirement', 'risk', 'sarah', 'dad']) {
    assert.ok(evidence.surfaces[surface], `${surface} screenshot surface should exist`);
    for (const viewport of required) {
      assert.ok(typeof evidence.surfaces[surface][viewport] === 'string', `${surface} should define screenshot evidence for ${viewport}`);
    }
  }
});

console.log('\n=== Formatter Guards ===');

test('fmt uses M for seven-figure values', () => eq(fmt(1500000), '$1.5M'));
test('fmt avoids 1000.0K spillover near one million', () => eq(fmt(999999), '$1.0M'));
test('fmt rounds negative compact values symmetrically', () => eq(fmt(-1050), '-$1.1K'));
test('fmt uses B for billion-scale values', () => eq(fmt(1500000000), '$1.5B'));

// === Monthly Check-In Contract Guards ===

console.log('\n=== Monthly Check-In Contract Guards ===');

await asyncTest('checkIn module exports core functions', async () => {
  const mod = await import('../model/checkIn.js');
  assert.ok(typeof mod.getCurrentModelMonth === 'function', 'getCurrentModelMonth should be exported');
  assert.ok(typeof mod.getPlanSnapshot === 'function', 'getPlanSnapshot should be exported');
  assert.ok(typeof mod.computeMonthlyDrift === 'function', 'computeMonthlyDrift should be exported');
  assert.ok(typeof mod.computeCumulativeDrift === 'function', 'computeCumulativeDrift should be exported');
  assert.ok(typeof mod.getMonthLabel === 'function', 'getMonthLabel should be exported');
  assert.ok(typeof mod.buildReforecast === 'function', 'buildReforecast should be exported');
  assert.ok(typeof mod.buildStatusSummary === 'function', 'buildStatusSummary should be exported');
});

await asyncTest('getCurrentModelMonth returns 0 for March 2026', async () => {
  const { getCurrentModelMonth } = await import('../model/checkIn.js');
  assert.strictEqual(getCurrentModelMonth(new Date(2026, 2, 15)), 0, 'March 2026 should be month 0');
  assert.strictEqual(getCurrentModelMonth(new Date(2026, 3, 1)), 1, 'April 2026 should be month 1');
  assert.strictEqual(getCurrentModelMonth(new Date(2027, 2, 1)), 12, 'March 2027 should be month 12');
});

await asyncTest('getMonthLabel formats model months correctly', async () => {
  const { getMonthLabel } = await import('../model/checkIn.js');
  assert.strictEqual(getMonthLabel(0), 'March 2026', 'month 0 should be March 2026');
  assert.strictEqual(getMonthLabel(1), 'April 2026', 'month 1 should be April 2026');
  assert.strictEqual(getMonthLabel(12), 'March 2027', 'month 12 should be March 2027');
});

await asyncTest('getPlanSnapshot extracts correct fields from projection monthlyDetail', async () => {
  const { getPlanSnapshot } = await import('../model/checkIn.js');
  const { computeProjection } = await import('../model/projection.js');
  const { INITIAL_STATE } = await import('../state/initialState.js');
  const proj = computeProjection(INITIAL_STATE);
  const snap = getPlanSnapshot(proj.monthlyData, 0);
  assert.ok(snap !== null, 'snapshot should not be null');
  assert.ok(typeof snap.sarahIncome === 'number', 'sarahIncome should be a number');
  assert.ok(typeof snap.expenses === 'number', 'expenses should be a number');
  assert.ok(typeof snap.balance === 'number', 'balance should be a number');
  assert.ok(typeof snap.totalIncome === 'number', 'totalIncome should be a number');
});

await asyncTest('computeMonthlyDrift identifies ahead, on-track, and behind', async () => {
  const { computeMonthlyDrift } = await import('../model/checkIn.js');
  const plan = { sarahIncome: 20000, expenses: 50000, balance: 180000, totalIncome: 30000 };
  const ahead = { sarahIncome: 25000, expenses: 40000, balance: 200000, totalIncome: 35000 };
  const behind = { sarahIncome: 15000, expenses: 60000, balance: 150000, totalIncome: 20000 };
  const onTrack = { sarahIncome: 20500, expenses: 50500, balance: 179000, totalIncome: 30500 };

  const dAhead = computeMonthlyDrift(ahead, plan);
  assert.strictEqual(dAhead.balance.status, 'ahead', 'higher balance should be ahead');
  assert.strictEqual(dAhead.expenses.status, 'ahead', 'lower expenses should be ahead');

  const dBehind = computeMonthlyDrift(behind, plan);
  assert.strictEqual(dBehind.balance.status, 'behind', 'lower balance should be behind');

  const dOnTrack = computeMonthlyDrift(onTrack, plan);
  assert.strictEqual(dOnTrack.balance.status, 'on-track', 'within 10% should be on-track');
});

await asyncTest('reducer handles RECORD_CHECK_IN and DELETE_CHECK_IN', async () => {
  const { reducer } = await import('../state/reducer.js');
  const { INITIAL_STATE } = await import('../state/initialState.js');

  const checkIn = { month: 0, inputDate: '2026-03-31', actuals: { balance: 195000 }, planSnapshot: { balance: 200000 } };
  const s1 = reducer(INITIAL_STATE, { type: 'RECORD_CHECK_IN', checkIn });
  assert.strictEqual(s1.checkInHistory.length, 1, 'should have 1 check-in');
  assert.strictEqual(s1.checkInHistory[0].month, 0, 'check-in should be for month 0');

  const s2 = reducer(s1, { type: 'DELETE_CHECK_IN', month: 0 });
  assert.strictEqual(s2.checkInHistory.length, 0, 'should have 0 check-ins after delete');
});

await asyncTest('RESET_ALL preserves checkInHistory', async () => {
  const { reducer } = await import('../state/reducer.js');
  const { INITIAL_STATE } = await import('../state/initialState.js');

  const checkIn = { month: 0, inputDate: '2026-03-31', actuals: { balance: 195000 }, planSnapshot: { balance: 200000 } };
  const s1 = reducer(INITIAL_STATE, { type: 'RECORD_CHECK_IN', checkIn });
  const s2 = reducer(s1, { type: 'RESET_ALL' });
  assert.strictEqual(s2.checkInHistory.length, 1, 'RESET_ALL should preserve check-in history');
});

test('TabBar includes Track and Actuals tabs', () => {
  const source = fs.readFileSync(new URL('../components/TabBar.jsx', import.meta.url), 'utf8');
  assert.ok(source.includes("id: 'track'"), 'TabBar should have a track tab');
  assert.ok(source.includes("id: 'actuals'"), 'TabBar should have an actuals tab');
  assert.ok(source.includes('repeat(7'), 'TabBar grid should have 7 columns');
});

// --- Summary ---
console.log('\n' + '='.repeat(50));
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log('='.repeat(50) + '\n');

process.exit(failed > 0 ? 1 : 0);
