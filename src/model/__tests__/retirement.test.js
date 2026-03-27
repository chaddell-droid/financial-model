/**
 * Retirement simulation orchestration tests — run with:
 *   node src/model/__tests__/retirement.test.js
 *
 * Tests the core invariant: computeSWR produces a rate that, when simulated
 * via simulatePath, hits the target final value. Also covers untested functions:
 * computePreInhSWR, buildSupplementalFlows, buildScalingAndRescueFlows,
 * getRetirementPhaseSummary, and survivor-phase SS scenarios.
 */

import assert from 'node:assert';
import { computeSWR, computePreInhSWR, simulatePath } from '../ernWithdrawal.js';
import {
  buildRetirementContext,
  buildSupplementalFlows,
  buildScalingAndRescueFlows,
  getRetirementSSInfo,
  getRetirementIncomePlan,
  getRetirementPhaseSummary,
  sliceRetirementContext,
} from '../retirementIncome.js';
import { getBlendedReturns, getNumCohorts } from '../historicalReturns.js';

// --- Helpers ---

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL  ${name}`);
    console.log(`        ${err.message}`);
  }
}

function eq(actual, expected, label) {
  assert.strictEqual(actual, expected, label ? `${label}: expected ${expected}, got ${actual}` : undefined);
}

function near(actual, expected, tolerance, label) {
  const diff = Math.abs(actual - expected);
  assert.ok(
    diff <= tolerance,
    `${label || 'near'}: expected ~${expected} (±${tolerance}), got ${actual} (off by ${diff.toFixed(2)})`
  );
}

// Shared zero-flow helpers
function zeros(n) { return new Float64Array(n); }
function ones(n) { const a = new Float64Array(n); a.fill(1); return a; }
function filled(n, v) { const a = new Float64Array(n); a.fill(v); return a; }

// ════════════════════════════════════════════════════════════════════════
// Section 1: SWR ↔ simulatePath Round-Trip Consistency
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== SWR-simulatePath Round-Trip Consistency ===');

test('round-trip: zero returns, no flows, targetFV=0', () => {
  const T = 120;
  const blended = zeros(T);
  const flows = zeros(T);
  const scaling = ones(T);
  const pool = 1_000_000;

  const swr = computeSWR(blended, 0, T, flows, scaling, 0, pool);
  near(swr, pool / T, 0.01, 'SWR should be pool/T');

  const sim = simulatePath(blended, 0, T, swr, flows, scaling, pool, 0, zeros(T));
  near(sim.finalPool, 0, 1, 'finalPool should be ~0');
});

test('round-trip: zero returns, targetFV=200000', () => {
  const T = 120;
  const blended = zeros(T);
  const flows = zeros(T);
  const scaling = ones(T);
  const pool = 1_000_000;
  const targetFV = 200_000;

  const swr = computeSWR(blended, 0, T, flows, scaling, targetFV, pool);
  near(swr, (pool - targetFV) / T, 0.01, 'SWR should be (pool-FV)/T');

  const sim = simulatePath(blended, 0, T, swr, flows, scaling, pool, 0, zeros(T));
  near(sim.finalPool, targetFV, 1, 'finalPool should be ~targetFV');
});

test('round-trip: constant positive returns (0.5%/mo)', () => {
  const T = 60;
  const blended = filled(T, 0.005);
  const flows = zeros(T);
  const scaling = ones(T);
  const pool = 500_000;

  const swr = computeSWR(blended, 0, T, flows, scaling, 0, pool);
  assert.ok(swr > pool / T, 'positive returns should allow higher SWR than pool/T');

  const sim = simulatePath(blended, 0, T, swr, flows, scaling, pool, 0, zeros(T));
  near(sim.finalPool, 0, 1, 'finalPool should be ~0');
});

test('round-trip: constant negative returns (-1%/mo)', () => {
  const T = 60;
  const blended = filled(T, -0.01);
  const flows = zeros(T);
  const scaling = ones(T);
  const pool = 500_000;

  const swr = computeSWR(blended, 0, T, flows, scaling, 0, pool);
  assert.ok(swr < pool / T, 'negative returns should force lower SWR than pool/T');
  assert.ok(swr > 0, 'SWR should still be positive with sufficient pool');

  const sim = simulatePath(blended, 0, T, swr, flows, scaling, pool, 0, zeros(T));
  near(sim.finalPool, 0, 1, 'finalPool should be ~0');
});

test('round-trip: with supplemental flows ($1000/mo)', () => {
  const T = 60;
  const blended = zeros(T);
  const flows = filled(T, 1000);
  const scaling = ones(T);
  const pool = 300_000;

  const swr = computeSWR(blended, 0, T, flows, scaling, 0, pool);
  // With zero returns: effective total = pool + flows*T = 300k + 60k = 360k
  near(swr, 360_000 / T, 0.01, 'SWR includes supplemental flows');

  const sim = simulatePath(blended, 0, T, swr, flows, scaling, pool, 0, zeros(T));
  near(sim.finalPool, 0, 1, 'finalPool should be ~0');
});

test('round-trip: survivor scaling transition (1.0 → 0.6)', () => {
  const T = 120;
  const blended = zeros(T);
  const flows = zeros(T);
  const scaling = new Float64Array(T);
  for (let t = 0; t < T; t++) scaling[t] = t < 60 ? 1.0 : 0.6;
  const pool = 600_000;

  const swr = computeSWR(blended, 0, T, flows, scaling, 0, pool);

  const sim = simulatePath(blended, 0, T, swr, flows, scaling, pool, 0, zeros(T));
  near(sim.finalPool, 0, 1, 'finalPool should be ~0 with scaling transition');
});

test('round-trip: real historical returns (60/40 blend, 360 months)', () => {
  const T = 360;
  const blended = getBlendedReturns(0.6);
  const pool = 1_500_000;
  const targetFV = 250_000;

  const context = buildRetirementContext({
    horizonMonths: T,
    chadPassesAge: 82,
    ageDiff: 14,
    survivorSpendRatio: 0.6,
    chadSS: 2933,
    ssFRA: 4213,
    sarahOwnSS: 1900,
    survivorSS: 4186,
    trustMonthly: 2000,
  });

  const swr = computeSWR(blended, 0, T, context.supplementalFlows, context.scaling, targetFV, pool);
  assert.ok(swr > 0, 'SWR should be positive for first cohort with realistic params');

  const sim = simulatePath(blended, 0, T, swr, context.supplementalFlows, context.scaling, pool, 0, zeros(T));
  near(sim.finalPool, targetFV, 100, 'finalPool should be ~targetFV with real returns');
});

// ════════════════════════════════════════════════════════════════════════
// Section 2: computeSWR Properties
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== computeSWR Properties ===');

test('negative SWR for terrible cohort', () => {
  const T = 12;
  const blended = filled(T, -0.05);
  const flows = zeros(T);
  const scaling = ones(T);
  // Target exceeds what pool can achieve with -5%/mo returns
  const swr = computeSWR(blended, 0, T, flows, scaling, 200_000, 100_000);
  assert.ok(swr < 0, 'SWR should be negative when target exceeds achievable pool');
});

test('supplemental flows raise SWR', () => {
  const T = 60;
  const blended = filled(T, 0.003);
  const scaling = ones(T);
  const pool = 500_000;

  const swrNoFlows = computeSWR(blended, 0, T, zeros(T), scaling, 0, pool);
  const swrWithFlows = computeSWR(blended, 0, T, filled(T, 2000), scaling, 0, pool);

  assert.ok(swrWithFlows > swrNoFlows, 'supplemental flows should increase SWR');
});

test('higher targetFV lowers SWR', () => {
  const T = 60;
  const blended = filled(T, 0.003);
  const flows = zeros(T);
  const scaling = ones(T);
  const pool = 500_000;

  const swrZero = computeSWR(blended, 0, T, flows, scaling, 0, pool);
  const swrHigh = computeSWR(blended, 0, T, flows, scaling, 200_000, pool);

  assert.ok(swrHigh < swrZero, 'higher target FV should lower SWR');
});

test('larger pool raises SWR', () => {
  const T = 60;
  const blended = filled(T, 0.003);
  const flows = zeros(T);
  const scaling = ones(T);

  const swrSmall = computeSWR(blended, 0, T, flows, scaling, 0, 500_000);
  const swrLarge = computeSWR(blended, 0, T, flows, scaling, 0, 1_000_000);

  assert.ok(swrLarge > swrSmall, 'larger pool should yield higher SWR');
});

test('one-month SWR regression guard', () => {
  const blended = Float64Array.from([0.10]);
  const flows = Float64Array.from([100]);
  const scaling = Float64Array.from([1]);
  eq(Math.round(computeSWR(blended, 0, 1, flows, scaling, 0, 1000)), 1100, 'matches snapshot test');
});

// ════════════════════════════════════════════════════════════════════════
// Section 3: computePreInhSWR
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== computePreInhSWR ===');

test('pre-inheritance SWR with zero returns, analytical verification', () => {
  const T = 60;
  const blended = zeros(T);
  const flows = zeros(T);
  const scaling = ones(T);
  const pool = 600_000;
  const inhMonth = 30;
  const postRate = 5000;

  // With zero returns: post consumes 5000*30 = 150k, pre must consume remaining 450k over 30 months
  const preRate = computePreInhSWR(blended, 0, T, flows, scaling, 0, pool, postRate, inhMonth);
  near(preRate, 15_000, 0.01, 'pre-inheritance rate should be 15000');
});

test('pre-inheritance SWR at inhMonth=0 returns Infinity (edge case)', () => {
  const T = 12;
  const blended = zeros(T);
  const flows = zeros(T);
  const scaling = ones(T);

  const preRate = computePreInhSWR(blended, 0, T, flows, scaling, 0, 100_000, 5000, 0);
  assert.ok(!Number.isFinite(preRate), 'inhMonth=0 means zero preDenom → Infinity or -Infinity');
});

test('pre-inheritance SWR at inhMonth=T degenerates to computeSWR', () => {
  const T = 60;
  const blended = filled(T, 0.003);
  const flows = zeros(T);
  const scaling = ones(T);
  const pool = 500_000;

  const regularSWR = computeSWR(blended, 0, T, flows, scaling, 0, pool);
  // When inhMonth = T, postDenom = 0, so formula = (P*C - FV + flowG) / preDenom = computeSWR
  const preInhSWR = computePreInhSWR(blended, 0, T, flows, scaling, 0, pool, 5000, T);
  near(preInhSWR, regularSWR, 0.01, 'should degenerate to regular SWR when inhMonth=T');
});

test('pre-inh + post rate round-trip produces targetFV', () => {
  const T = 60;
  const blended = zeros(T);
  const flows = zeros(T);
  const scaling = ones(T);
  const pool = 600_000;
  const targetFV = 100_000;
  const inhMonth = 30;
  const postRate = 4000;

  const preRate = computePreInhSWR(blended, 0, T, flows, scaling, targetFV, pool, postRate, inhMonth);

  // Manual simulation of two-phase withdrawal
  let p = pool;
  for (let t = 0; t < T; t++) {
    const w = t < inhMonth ? preRate : postRate;
    p = (p - w * scaling[t] + flows[t]) * (1 + blended[t]);
  }
  near(p, targetFV, 1, 'two-phase simulation should hit targetFV');
});

// ════════════════════════════════════════════════════════════════════════
// Section 4: buildSupplementalFlows
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== buildSupplementalFlows ===');

test('couple phase includes trust + chadSS', () => {
  // chadPassesAge=69 → survivorStart=24, so all 24 months are couple phase
  // At month 0: chadAge=67, sarahAge=53 (under 62), no spousal
  const flows = buildSupplementalFlows({
    horizonMonths: 24,
    chadPassesAge: 69,
    ageDiff: 14,
    chadSS: 2933,
    ssFRA: 4213,
    sarahOwnSS: 1900,
    survivorSS: 4186,
    trustMonthly: 2000,
    hasInheritance: false,
    inheritanceMonth: 0,
    inheritanceAmount: 0,
  });

  eq(flows[0], 2000 + 2933, 'month 0: trust + chadSS only');
});

test('Sarah spousal benefit kicks in after age 62', () => {
  // At chadAge=76, sarahAge=62 → spousal kicks in
  // Need horizonMonths that spans chadAge from 67 to 76+ → 108+ months
  const flows = buildSupplementalFlows({
    horizonMonths: 120,
    chadPassesAge: 90,
    ageDiff: 14,
    chadSS: 2933,
    ssFRA: 4213,
    sarahOwnSS: 1900,
    survivorSS: 4186,
    trustMonthly: 2000,
    hasInheritance: false,
    inheritanceMonth: 0,
    inheritanceAmount: 0,
  });

  // Month 0: chadAge=67, sarahAge=53 → no spousal
  const earlyFlow = flows[0];
  // Month 108: chadAge=76, sarahAge=62 → spousal starts
  const lateFlow = flows[108];
  assert.ok(lateFlow > earlyFlow, 'flows should increase when Sarah spousal kicks in at 62');
});

test('inheritance lump sum at correct month', () => {
  const flows = buildSupplementalFlows({
    horizonMonths: 24,
    chadPassesAge: 90,
    ageDiff: 14,
    chadSS: 2933,
    ssFRA: 4213,
    sarahOwnSS: 1900,
    survivorSS: 4186,
    trustMonthly: 2000,
    hasInheritance: true,
    inheritanceMonth: 10,
    inheritanceAmount: 500_000,
  });

  const regularFlow = flows[9]; // month before inheritance
  eq(flows[10], regularFlow + 500_000, 'inheritance month includes lump sum');
  eq(flows[11], regularFlow, 'month after inheritance is regular');
});

test('no inheritance when hasInheritance is false', () => {
  const flows = buildSupplementalFlows({
    horizonMonths: 24,
    chadPassesAge: 90,
    ageDiff: 14,
    chadSS: 2933,
    ssFRA: 4213,
    sarahOwnSS: 1900,
    survivorSS: 4186,
    trustMonthly: 2000,
    hasInheritance: false,
    inheritanceMonth: 10,
    inheritanceAmount: 500_000,
  });

  // All flows should be SS + trust only
  eq(flows[10], flows[9], 'no lump sum when hasInheritance=false');
});

test('inheritance at boundary months (0 and horizonMonths-1)', () => {
  const base = {
    horizonMonths: 24,
    chadPassesAge: 90,
    ageDiff: 14,
    chadSS: 2933,
    ssFRA: 4213,
    sarahOwnSS: 1900,
    survivorSS: 4186,
    trustMonthly: 2000,
    hasInheritance: true,
    inheritanceAmount: 100_000,
  };

  const flowsAt0 = buildSupplementalFlows({ ...base, inheritanceMonth: 0 });
  const flowsAtEnd = buildSupplementalFlows({ ...base, inheritanceMonth: 23 });
  const flowsNone = buildSupplementalFlows({ ...base, hasInheritance: false });

  eq(flowsAt0[0], flowsNone[0] + 100_000, 'inheritance at month 0');
  eq(flowsAtEnd[23], flowsNone[23] + 100_000, 'inheritance at last month');
});

// ════════════════════════════════════════════════════════════════════════
// Section 5: buildScalingAndRescueFlows
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== buildScalingAndRescueFlows ===');

test('scaling transitions at survivorStartMonth', () => {
  // chadPassesAge=72 → survivorStart = (72-67)*12 = 60
  const { scaling } = buildScalingAndRescueFlows({
    horizonMonths: 120,
    chadPassesAge: 72,
    survivorSpendRatio: 0.6,
    hasInheritance: false,
    inheritanceMonth: 0,
    inheritanceAmount: 0,
  });

  eq(scaling[59], 1.0, 'last couple month');
  eq(scaling[60], 0.6, 'first survivor month');
  eq(scaling[119], 0.6, 'last month');
});

test('rescue flows placed at correct month', () => {
  const { rescueFlows } = buildScalingAndRescueFlows({
    horizonMonths: 120,
    chadPassesAge: 82,
    survivorSpendRatio: 0.6,
    hasInheritance: true,
    inheritanceMonth: 30,
    inheritanceAmount: 300_000,
  });

  eq(rescueFlows[30], 300_000, 'rescue at inheritance month');
  eq(rescueFlows[29], 0, 'no rescue before');
  eq(rescueFlows[31], 0, 'no rescue after');
});

test('no rescue flows when hasInheritance is false', () => {
  const { rescueFlows } = buildScalingAndRescueFlows({
    horizonMonths: 24,
    chadPassesAge: 82,
    survivorSpendRatio: 0.6,
    hasInheritance: false,
    inheritanceMonth: 10,
    inheritanceAmount: 300_000,
  });

  const allZero = rescueFlows.every(v => v === 0);
  assert.ok(allZero, 'all rescue flows should be zero');
});

test('out-of-bounds inheritance is ignored', () => {
  const { rescueFlows: negFlows } = buildScalingAndRescueFlows({
    horizonMonths: 24,
    chadPassesAge: 82,
    survivorSpendRatio: 0.6,
    hasInheritance: true,
    inheritanceMonth: -1,
    inheritanceAmount: 300_000,
  });
  const { rescueFlows: overFlows } = buildScalingAndRescueFlows({
    horizonMonths: 24,
    chadPassesAge: 82,
    survivorSpendRatio: 0.6,
    hasInheritance: true,
    inheritanceMonth: 24,
    inheritanceAmount: 300_000,
  });

  assert.ok(negFlows.every(v => v === 0), 'negative month ignored');
  assert.ok(overFlows.every(v => v === 0), 'month >= horizonMonths ignored');
});

// ════════════════════════════════════════════════════════════════════════
// Section 6: getRetirementSSInfo Survivor Scenarios
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== getRetirementSSInfo Survivor Scenarios ===');

const ssConfig = {
  ageDiff: 14,
  chadSS: 2933,
  ssFRA: 4213,
  sarahOwnSS: 1900,
  survivorSS: 4186,
};

test('survivor, Sarah >= 67: full survivor benefit', () => {
  // chadAge=82 → sarahAge=68
  const info = getRetirementSSInfo(82, false, ssConfig);
  eq(info.amount, 4186, 'max(survivorSS, sarahOwnSS)');
  eq(info.label, 'Sarah survivor');
  eq(info.sarahAge, 68);
});

test('survivor, Sarah 60-66: reduced survivor (71.5%)', () => {
  // chadAge=75 → sarahAge=61
  const info = getRetirementSSInfo(75, false, ssConfig);
  eq(info.amount, Math.round(4186 * 0.715), 'survivorSS * 0.715 rounded');
  eq(info.label, 'Sarah survivor (reduced)');
});

test('survivor, Sarah < 60: no SS', () => {
  // chadAge=72 → sarahAge=58
  const info = getRetirementSSInfo(72, false, ssConfig);
  eq(info.amount, 0, 'no SS before 60');
  eq(info.label, 'none');
});

test('couple, Sarah < 62: no spousal', () => {
  // chadAge=72 → sarahAge=58
  const info = getRetirementSSInfo(72, true, ssConfig);
  eq(info.amount, 2933, 'chad SS only');
  eq(info.label, 'Chad only');
});

test('couple, spousal capped at sarahOwnSS', () => {
  // chadAge=76 → sarahAge=62
  const info = getRetirementSSInfo(76, true, ssConfig);
  const spousal = Math.min(Math.round(4213 * 0.5), 1900);
  eq(info.amount, 2933 + spousal, 'chadSS + min(ssFRA*0.5, sarahOwnSS)');
});

test('survivor, sarahOwnSS exceeds survivorSS', () => {
  const info = getRetirementSSInfo(82, false, {
    ...ssConfig,
    sarahOwnSS: 5000,
  });
  eq(info.amount, 5000, 'max(survivorSS, sarahOwnSS) picks sarahOwnSS');
});

// ════════════════════════════════════════════════════════════════════════
// Section 7: getRetirementPhaseSummary
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== getRetirementPhaseSummary ===');

const planConfig = {
  chadPassesAge: 82,
  ageDiff: 14,
  baseMonthlyConsumption: 9000,
  survivorSpendRatio: 0.6,
  trustMonthly: 2000,
  chadSS: 2933,
  ssFRA: 4213,
  sarahOwnSS: 1900,
  survivorSS: 4186,
};

test('couple phase summary', () => {
  const summary = getRetirementPhaseSummary(67, 82, planConfig);
  eq(summary.totalTarget, 9000, 'couple phase target = baseMonthlyConsumption');
  eq(summary.start.chadAlive, true);
  eq(summary.end.chadAlive, true, 'end is age 81 (exclusive 82), still alive');
});

test('survivor phase summary', () => {
  const summary = getRetirementPhaseSummary(82, 104, planConfig);
  eq(summary.totalTarget, 5400, 'survivor target = 9000 * 0.6');
  eq(summary.start.chadAlive, false);
});

test('single-year degenerate case', () => {
  const summary = getRetirementPhaseSummary(70, 71, planConfig);
  eq(summary.start.chadAlive, summary.end.chadAlive, 'start and end should match');
  eq(summary.start.totalTarget, summary.end.totalTarget, 'same year, same target');
});

// ════════════════════════════════════════════════════════════════════════
// Section 8: simulatePath Richer Scenarios
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== simulatePath Richer Scenarios ===');

test('simulation with real historical returns, first cohort, 30yr', () => {
  const T = 360;
  const blended = getBlendedReturns(0.6);
  const flows = zeros(T);
  const scaling = ones(T);
  // Conservative withdrawal: 3% of 1M = $2500/mo
  const sim = simulatePath(blended, 0, T, 2500, flows, scaling, 1_000_000, 0, zeros(T));
  eq(sim.yearlyPools.length, 31, '31 year snapshots (years 0-30)');
  assert.ok(sim.finalPool > 0, 'conservative rate should not deplete with first cohort');
});

test('survivor scaling transition mid-simulation (deterministic)', () => {
  const T = 120;
  const blended = zeros(T);
  const flows = zeros(T);
  const scaling = new Float64Array(T);
  for (let t = 0; t < T; t++) scaling[t] = t < 60 ? 1.0 : 0.6;
  const pool = 1_000_000;
  const w = 5000;

  // First 60mo: 5000*1.0*60 = 300k consumed. Next 60mo: 5000*0.6*60 = 180k consumed.
  const sim = simulatePath(blended, 0, T, w, flows, scaling, pool, 0, zeros(T));
  eq(sim.finalPool, 520_000, 'deterministic scaling transition');
  eq(sim.everDepleted, false);
});

test('pool floor recovery via rescue flows', () => {
  const T = 24;
  const blended = zeros(T);
  const flows = zeros(T);
  const scaling = ones(T);
  const rescueFlows = zeros(T);
  rescueFlows[6] = 500_000;

  // Large withdrawal forces depletion, rescue at month 6 restores pool
  const sim = simulatePath(blended, 0, T, 10_000, flows, scaling, 50_000, 0, rescueFlows);
  eq(sim.everDepleted, true, 'should deplete before rescue');
  assert.ok(sim.finalPool > 0, 'rescue should restore pool');
});

test('maxConsecutiveDepleted tracks longest depletion streak', () => {
  const T = 24;
  const blended = zeros(T);
  const flows = zeros(T);
  const scaling = ones(T);
  const rescueFlows = zeros(T);
  // Small pool, big withdrawal → immediate depletion at floor 0
  // Rescue at month 6 lifts pool, then depletes again
  rescueFlows[6] = 100_000;
  rescueFlows[12] = 100_000;

  const sim = simulatePath(blended, 0, T, 20_000, flows, scaling, 10_000, 0, rescueFlows);
  eq(sim.everDepleted, true);
  // First streak: months 0-5 (6 months), second streak: depends on rescue amount
  assert.ok(sim.maxConsecutiveDepleted >= 1, 'should track consecutive depletion');
});

// ════════════════════════════════════════════════════════════════════════
// Section 9: Full Cohort Distribution Properties
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Full Cohort Distribution Properties ===');

test('all cohort SWRs have no NaN, min < median < max', () => {
  const T = 360;
  const blended = getBlendedReturns(0.6);
  const numCohorts = getNumCohorts(T);
  const flows = zeros(T);
  const scaling = ones(T);
  const pool = 1_000_000;

  const swrs = new Float64Array(numCohorts);
  for (let c = 0; c < numCohorts; c++) {
    swrs[c] = computeSWR(blended, c, T, flows, scaling, 0, pool);
  }

  assert.ok(swrs.every(v => Number.isFinite(v)), 'no NaN or Infinity in SWR distribution');

  const sorted = Float64Array.from(swrs).sort();
  const min = sorted[0];
  const median = sorted[Math.floor(sorted.length / 2)];
  const max = sorted[sorted.length - 1];

  assert.ok(min < median, `min (${min.toFixed(0)}) should be less than median (${median.toFixed(0)})`);
  assert.ok(median < max, `median (${median.toFixed(0)}) should be less than max (${max.toFixed(0)})`);
});

test('percentile extraction is monotonic', () => {
  const T = 360;
  const blended = getBlendedReturns(0.6);
  const numCohorts = getNumCohorts(T);
  const flows = zeros(T);
  const scaling = ones(T);
  const pool = 1_000_000;

  const swrs = [];
  for (let c = 0; c < numCohorts; c++) {
    swrs.push(computeSWR(blended, c, T, flows, scaling, 0, pool));
  }
  swrs.sort((a, b) => a - b);

  const pctile = (p) => swrs[Math.floor(swrs.length * p / 100)];
  const p10 = pctile(10);
  const p25 = pctile(25);
  const p50 = pctile(50);
  const p75 = pctile(75);
  const p90 = pctile(90);

  assert.ok(p10 <= p25, `p10 (${p10.toFixed(0)}) <= p25 (${p25.toFixed(0)})`);
  assert.ok(p25 <= p50, `p25 (${p25.toFixed(0)}) <= p50 (${p50.toFixed(0)})`);
  assert.ok(p50 <= p75, `p50 (${p50.toFixed(0)}) <= p75 (${p75.toFixed(0)})`);
  assert.ok(p75 <= p90, `p75 (${p75.toFixed(0)}) <= p90 (${p90.toFixed(0)})`);
});

test('worst cohort yields positive SWR with realistic parameters', () => {
  const T = 360;
  const blended = getBlendedReturns(0.6);
  const numCohorts = getNumCohorts(T);
  const pool = 1_500_000;

  const context = buildRetirementContext({
    horizonMonths: T,
    chadPassesAge: 82,
    ageDiff: 14,
    survivorSpendRatio: 0.6,
    chadSS: 2933,
    ssFRA: 4213,
    sarahOwnSS: 1900,
    survivorSS: 4186,
    trustMonthly: 2000,
  });

  let minSWR = Infinity;
  for (let c = 0; c < numCohorts; c++) {
    const swr = computeSWR(blended, c, T, context.supplementalFlows, context.scaling, 0, pool);
    if (swr < minSWR) minSWR = swr;
  }

  assert.ok(minSWR > 0, `worst cohort SWR (${minSWR.toFixed(0)}) should be positive with realistic params`);
});

// ════════════════════════════════════════════════════════════════════════
// Summary
// ════════════════════════════════════════════════════════════════════════
console.log(`\n${'='.repeat(50)}`);
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'='.repeat(50)}\n`);

if (failed > 0) process.exit(1);
