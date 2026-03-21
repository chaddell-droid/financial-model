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
import { runMonthlySimulation, computeProjection, computeWealthProjection, findOperationalBreakevenIndex } from './projection.js';
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
import { runDadMonteCarlo, runMonteCarlo } from './monteCarlo.js';
import { fmt } from './formatters.js';
import { exportModelData } from './exportData.js';
import { buildPwaDistribution, getDistributionPercentile, getPwaSummary } from './pwaDistribution.js';
import { selectPwaWithdrawal, simulateAdaptivePwaStrategy } from './pwaStrategies.js';

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

test('backPayActual', () => eq(backPayActual, 65788));
test('month 0 balance', () => eq(monthlyData[0].balance, 165119));
test('month 12 balance', () => eq(monthlyData[12].balance, 0));
test('month 36 balance', () => eq(monthlyData[36].balance, 0));
test('month 72 balance', () => eq(monthlyData[72].balance, 0));
test('month 0 netCashFlow', () => eq(monthlyData[0].netCashFlow, -37224));
test('month 36 netCashFlow', () => eq(monthlyData[36].netCashFlow, -18866));
test('month 72 netCashFlow', () => eq(monthlyData[72].netCashFlow, -19412));
test('produces 73 months (0-72)', () => eq(monthlyData.length, 73));
test('min balance is at month 12', () => {
  const minBal = Math.min(...monthlyData.map(d => d.balance));
  eq(minBal, 0);
  eq(monthlyData.findIndex(d => d.balance === minBal), 12);
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
test('month 72 balance', () => eq(deniedData[72].balance, -269206));
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

test('SSDI attorney fee caps at 9200', () => eq(cappedBackPayActual, 90800));

console.log('\n=== Retire Debt ===');

const debtRetired = gatherState({ retireDebt: true });
const { monthlyData: debtData } = runMonthlySimulation(debtRetired);

test('month 0 expenses (no debt service)', () => eq(debtData[0].expenses, 47748));
test('month 12 balance', () => eq(debtData[12].balance, 86827));
test('month 72 balance', () => eq(debtData[72].balance, 0));
test('expenses lower than default', () => {
  assert.ok(debtData[0].expenses < monthlyData[0].expenses, 'Expenses should be lower with debt retired');
});

console.log('\n=== Lifestyle Cuts Applied ===');

const cutsOn = gatherState({ lifestyleCutsApplied: true });
const { monthlyData: cutsData } = runMonthlySimulation(cutsOn);

test('month 0 expenses (cuts reduce)', () => eq(cutsData[0].expenses, 36078));
test('month 12 balance', () => eq(cutsData[12].balance, 249672));
test('month 72 balance (positive!)', () => eq(cutsData[72].balance, 359702));
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

test('savings positive at Y6 - passes', () => eq(goalResults[0].achieved, true));
test('savings positive at Y6 - value', () => eq(goalResults[0].currentValue, 0));
test('cash flow breakeven - fails', () => eq(goalResults[1].achieved, false));
test('cash flow breakeven - value', () => eq(goalResults[1].currentValue, -18866));
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
test('savings positive at Y6 - passes with cuts', () => eq(cutsGoalResults[0].achieved, true));
test('savings positive at Y6 - value with cuts', () => eq(cutsGoalResults[0].currentValue, 160846));
test('emergency fund $50k - passes with cuts', () => eq(cutsGoalResults[2].achieved, true));
test('emergency fund $50k - value with cuts', () => eq(cutsGoalResults[2].currentValue, 301135));
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
    'reserve_never_touched',
    'finish_above_reserve',
    'probability_no_cut',
    'bequest_target',
    'pwa_strategy',
    'pwa_target_percentile',
    'pwa_tolerance_band',
    'max_depletion_gap',
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
test('Retirement help layout keeps the overview rail wider and uses responsive retirement grids', () => {
  const appSource = fs.readFileSync(new URL('../FinancialModel.jsx', import.meta.url), 'utf8');
  const retirementSource = fs.readFileSync(new URL('../charts/RetirementIncomeChart.jsx', import.meta.url), 'utf8');
  assert.ok(appSource.includes('minmax(580px, 660px)'), 'overview rail should reserve more width for retirement content');
  assert.ok(retirementSource.includes("repeat(auto-fit, minmax(220px, 1fr))"), 'retirement controls should use responsive auto-fit grids');
  assert.ok(retirementSource.includes("repeat(auto-fit, minmax(200px, 1fr))"), 'retirement summary cards should use responsive auto-fit grids');
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
test('runDadMonteCarlo stays finite with extreme negative MSFT growth', () => {
  const result = runDadMonteCarlo({
    ...base,
    msftGrowth: -200,
  });
  assert.ok(Number.isFinite(result.solvency), 'solvency should be finite');
  assert.ok(Number.isFinite(result.medianFinal), 'medianFinal should be finite');
  assert.ok(Number.isFinite(result.p10), 'p10 should be finite');
});

console.log('\n=== UI Harness Guards ===');

test('main installs the browser UI harness in development builds', () => {
  const mainSource = fs.readFileSync(new URL('../main.jsx', import.meta.url), 'utf8');
  const harnessSource = fs.readFileSync(new URL('../testing/uiHarness.js', import.meta.url), 'utf8');
  assert.ok(mainSource.includes('installUiTestHarness'), 'main should install the UI test harness');
  assert.ok(harnessSource.includes('__FIN_MODEL_TEST__'), 'UI harness should expose a browser test API');
  assert.ok(harnessSource.includes('resetStorage'), 'UI harness should expose a storage reset hook');
  assert.ok(harnessSource.includes('getMonteCarloSeed'), 'UI harness should expose Monte Carlo seed controls');
});
test('shared input primitives expose stable automation metadata', () => {
  const sliderSource = fs.readFileSync(new URL('../components/Slider.jsx', import.meta.url), 'utf8');
  const toggleSource = fs.readFileSync(new URL('../components/Toggle.jsx', import.meta.url), 'utf8');
  assert.ok(sliderSource.includes('data-testid'), 'Slider should expose a data-testid hook');
  assert.ok(sliderSource.includes('aria-label'), 'Slider should expose an aria-label hook');
  assert.ok(toggleSource.includes('data-testid'), 'Toggle should expose a data-testid hook');
  assert.ok(toggleSource.includes('role="switch"'), 'Toggle should behave like a switch for automation and accessibility');
});
test('shell controls expose Wave 0 selectors', () => {
  const headerSource = fs.readFileSync(new URL('../components/Header.jsx', import.meta.url), 'utf8');
  const saveLoadSource = fs.readFileSync(new URL('../components/SaveLoadPanel.jsx', import.meta.url), 'utf8');
  const tabSource = fs.readFileSync(new URL('../components/TabBar.jsx', import.meta.url), 'utf8');
  assert.ok(headerSource.includes('header-present-mode'), 'header should expose a presentation-mode selector');
  assert.ok(headerSource.includes('header-export-json'), 'header should expose an export selector');
  assert.ok(saveLoadSource.includes('save-load-panel'), 'save/load panel should expose a root selector');
  assert.ok(saveLoadSource.includes('save-load-save-current'), 'save/load panel should expose a save selector');
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
  assert.ok(retirementSource.includes('data-testid={`retirement-mode-${mode.value}`}'), 'retirement surface should expose mode selectors');
  assert.ok(retirementSource.includes('retirement-main-chart-hover-surface'), 'retirement surface should expose a stable hover surface');
  assert.ok(retirementSource.includes('retirement-pool-draw-rate'), 'retirement surface should expose the pool draw slider selector');
  assert.ok(pwaDistributionSource.includes("testIdPrefix = 'pwa-distribution'"), 'PWA distribution chart should support caller-provided selector prefixes');
  assert.ok(monteCarloSource.includes('monte-carlo-fan-chart-hover-surface'), 'Monte Carlo should expose a stable hover surface');
});
test('retirement empty-state fallback keeps safe-rate fields numeric', () => {
  const retirementSource = fs.readFileSync(new URL('../charts/RetirementIncomeChart.jsx', import.meta.url), 'utf8');
  assert.ok(retirementSource.includes('safeRate: 0, safeMonthly: 0'), 'retirement empty fallback should define safeRate and safeMonthly');
});

console.log('\n=== UI Swarm Contract Guards ===');

test('UI swarm operator guide and manifest exist', () => {
  const readmeSource = fs.readFileSync(new URL('../../tests/ui/README.md', import.meta.url), 'utf8');
  const manifestSource = fs.readFileSync(new URL('../../tests/ui/coverage-manifest.json', import.meta.url), 'utf8');
  assert.ok(readmeSource.includes('UI Swarm Validation'), 'README should describe the UI swarm workflow');
  assert.ok(manifestSource.length > 0, 'coverage manifest should not be empty');
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
    'sarah_mode.entry_exit_and_sliders',
    'dad_mode.entry_exit_and_progression'
  ].forEach((id) => {
    assert.ok(entryIds.has(id), `manifest should include ${id}`);
  });
});
test('UI swarm manifest retirement selectors match the current DOM contract', () => {
  const manifest = JSON.parse(fs.readFileSync(new URL('../../tests/ui/coverage-manifest.json', import.meta.url), 'utf8'));
  const historical = manifest.entries.find((entry) => entry.id === 'retirement.historical_controls');
  const distribution = manifest.entries.find((entry) => entry.id === 'retirement.pwa_distribution.hover');
  const selectors = historical.elements.map((element) => element.selector);
  assert.ok(selectors.includes('[aria-label=\"Pool floor reserve\"]'), 'manifest should target the pool floor reserve aria label');
  assert.ok(selectors.includes('[aria-label=\"Chad passes at\"]'), 'manifest should target the Chad passes at aria label');
  assert.ok(selectors.includes("[aria-label=\"Sarah's age at inheritance\"]"), 'manifest should target the Sarah age at inheritance aria label');
  eq(distribution.elements[0].selector, '[data-testid=\"retirement-pwa-distribution-hover-surface\"]', 'retirement PWA distribution selector');
});

console.log('\n=== Formatter Guards ===');

test('fmt uses M for seven-figure values', () => eq(fmt(1500000), '$1.5M'));
test('fmt avoids 1000.0K spillover near one million', () => eq(fmt(999999), '$1.0M'));
test('fmt rounds negative compact values symmetrically', () => eq(fmt(-1050), '-$1.1K'));
test('fmt uses B for billion-scale values', () => eq(fmt(1500000000), '$1.5B'));

// --- Summary ---
console.log('\n' + '='.repeat(50));
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log('='.repeat(50) + '\n');

process.exit(failed > 0 ? 1 : 0);
