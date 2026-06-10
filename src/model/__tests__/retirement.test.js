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
  getPensionAtMonth,
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

  const sim = simulatePath(blended, 0, T, swr, flows, scaling, pool, 0);
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

  const sim = simulatePath(blended, 0, T, swr, flows, scaling, pool, 0);
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

  const sim = simulatePath(blended, 0, T, swr, flows, scaling, pool, 0);
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

  const sim = simulatePath(blended, 0, T, swr, flows, scaling, pool, 0);
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

  const sim = simulatePath(blended, 0, T, swr, flows, scaling, pool, 0);
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

  const sim = simulatePath(blended, 0, T, swr, flows, scaling, pool, 0);
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

  const sim = simulatePath(blended, 0, T, swr, context.supplementalFlows, context.scaling, pool, 0);
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
  // chadAge=82 → sarahAge=68; no survivorClaimAge supplied → claim age falls
  // back to her current age (68 ≥ FRA 67 → reduction factor 1.0).
  const info = getRetirementSSInfo(82, false, ssConfig);
  eq(info.amount, 4186, 'max(survivorSS, sarahOwnSS)');
  eq(info.label, 'Sarah survivor');
  eq(info.sarahAge, 68);
});

test('survivor, Sarah 60-66: reduction interpolated by claim age (SSA rule, D3)', () => {
  // chadAge=75 → sarahAge=61. SSA reduces survivor benefits from 71.5% at 60
  // linearly to 100% at the survivor's FRA (67) — NOT a flat 71.5% for every
  // claim age 60-66 (the old conservative rule this test used to lock).
  // factor(61) = 0.715 + 1 × (0.285/7).
  const info = getRetirementSSInfo(75, false, ssConfig);
  const factor = 0.715 + (61 - 60) * (0.285 / 7);
  eq(info.amount, Math.round(4186 * factor), 'survivorSS × interpolated factor');
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

test('couple, own < spousal ceiling: own topped up to spousal (SSA rule, D3)', () => {
  // chadAge=76 → sarahAge=62. SSA pays the household roughly the LARGER of
  // Sarah's own benefit or the spousal amount (her own benefit is topped up
  // toward 50% of Chad's PIA). The old rule paid min(half-PIA, own), a
  // conservative floor that under-paid whenever the two differed.
  const info = getRetirementSSInfo(76, true, ssConfig);
  const spousal = Math.max(Math.round(4213 * 0.5), 1900);
  eq(info.amount, 2933 + spousal, 'chadSS + max(ssFRA*0.5, sarahOwnSS)');
  eq(info.label, 'Chad + Sarah spousal', 'top-up in effect → spousal label');
});

test('couple, own > spousal ceiling: own record wins (SSA rule, D3)', () => {
  // Own benefit 3000 exceeds the spousal ceiling round(4213×0.5)=2107 — the
  // household keeps her larger own-record benefit; spousal adds nothing.
  const info = getRetirementSSInfo(76, true, { ...ssConfig, sarahOwnSS: 3000 });
  eq(info.amount, 2933 + 3000, 'chadSS + sarahOwnSS when own exceeds spousal ceiling');
  eq(info.label, 'Chad + Sarah own record');
});

test('survivor, sarahOwnSS exceeds survivorSS', () => {
  const info = getRetirementSSInfo(82, false, {
    ...ssConfig,
    sarahOwnSS: 5000,
  });
  eq(info.amount, 5000, 'max(survivorSS, sarahOwnSS) picks sarahOwnSS');
  eq(info.label, 'Sarah own record');
});

// — D3 boundary tests: survivor reduction factor locked at CLAIM age —
// SSA: the reduction is set when the survivor benefit starts (widowed age,
// floored at 60) and is PERMANENT — it neither stays pinned at 71.5% through
// 66 nor "heals" to 100% at 67 (the old rule did both).

test('survivor claim at 60: 71.5% floor, permanent (D3 boundary)', () => {
  const info = getRetirementSSInfo(75, false, { ...ssConfig, survivorClaimAge: 60 });
  eq(info.amount, Math.round(4186 * 0.715), 'factor locked at claim-age-60 floor');
  eq(info.label, 'Sarah survivor (reduced)');
  // Same claim age evaluated when she is 70 (chadAge=84): still reduced.
  const later = getRetirementSSInfo(84, false, { ...ssConfig, survivorClaimAge: 60 });
  eq(later.amount, Math.round(4186 * 0.715), 'no jump to 100% at FRA — reduction is permanent');
});

test('survivor claim at 63: interpolated factor (D3 boundary)', () => {
  const info = getRetirementSSInfo(78, false, { ...ssConfig, survivorClaimAge: 63 });
  const factor = 0.715 + (63 - 60) * (0.285 / 7);
  eq(info.amount, Math.round(4186 * factor), 'factor(63) = 0.715 + 3×(0.285/7)');
  eq(info.label, 'Sarah survivor (reduced)');
});

test('survivor claim at FRA (67): full benefit, own-record floor (D3 boundary)', () => {
  const info = getRetirementSSInfo(82, false, { ...ssConfig, survivorClaimAge: 67 });
  eq(info.amount, 4186, 'factor(67) = 1.0 → max(survivorSS, sarahOwnSS)');
  eq(info.label, 'Sarah survivor');
});

test('survivor: own record floor applies from 62 even when reduced survivor is smaller (D3)', () => {
  // Widowed at 60 with a large own benefit: reduced survivor = round(4186×0.715)=2993,
  // own = 3500. From 62 she switches to her own record (SSA allows the swap).
  const at61 = getRetirementSSInfo(75, false, { ...ssConfig, sarahOwnSS: 3500, survivorClaimAge: 60 });
  eq(at61.amount, Math.round(4186 * 0.715), 'before 62 only the reduced survivor is payable');
  const at63 = getRetirementSSInfo(77, false, { ...ssConfig, sarahOwnSS: 3500, survivorClaimAge: 60 });
  eq(at63.amount, 3500, 'from 62 the larger own-record benefit wins');
});

test('buildRetirementContext locks the survivor factor at the widowed age (D3)', () => {
  // chadPassesAge=74, ageDiff=14 → Sarah widowed at 60 → claims at 60 →
  // factor 0.715 forever. Old rule jumped to max(survivorSS, own) once she
  // turned 67 (month (67+14-67)×12 = 168).
  const ctx = buildRetirementContext({
    horizonMonths: 240,
    chadPassesAge: 74,
    ageDiff: 14,
    survivorSpendRatio: 0.6,
    chadSS: 2933,
    ssFRA: 4213,
    sarahOwnSS: 1900,
    survivorSS: 4186,
    trustMonthly: 2000,
  });
  const reduced = Math.round(4186 * 0.715);
  // Month 96: chadAge 75 → sarahAge 61 (survivor, pre-62).
  eq(ctx.ssIncome[96], reduced, 'reduced survivor at 61');
  // Month 180: chadAge 82 → sarahAge 68 (past her FRA) — STILL the locked factor.
  eq(ctx.ssIncome[180], reduced, 'claim-age-60 reduction is permanent past FRA');
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
  const sim = simulatePath(blended, 0, T, 2500, flows, scaling, 1_000_000, 0);
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
  const sim = simulatePath(blended, 0, T, w, flows, scaling, pool, 0);
  eq(sim.finalPool, 520_000, 'deterministic scaling transition');
  eq(sim.everDepleted, false);
});

test('pool floor recovery via lump-sum supplemental flow (single carrier)', () => {
  const T = 24;
  const blended = zeros(T);
  const flows = zeros(T);
  const scaling = ones(T);
  // Single-carrier contract (finding 2026-06-09 2.1): lump-sum events ride in
  // supplementalFlows, the same carrier the closed-form computeSWR credits.
  flows[6] = 500_000;

  // Large withdrawal forces depletion, lump sum at month 6 restores pool
  const sim = simulatePath(blended, 0, T, 10_000, flows, scaling, 50_000, 0);
  eq(sim.everDepleted, true, 'should deplete before the lump sum');
  assert.ok(sim.finalPool > 0, 'lump-sum supplemental flow should restore pool');
});

test('maxConsecutiveDepleted tracks longest depletion streak', () => {
  const T = 24;
  const blended = zeros(T);
  const flows = zeros(T);
  const scaling = ones(T);
  // Small pool, big withdrawal → immediate depletion at floor 0
  // Lump-sum supplemental flow at months 6/12 lifts pool, then depletes again
  flows[6] = 100_000;
  flows[12] = 100_000;

  const sim = simulatePath(blended, 0, T, 20_000, flows, scaling, 10_000, 0);
  eq(sim.everDepleted, true);
  // First streak: months 0-5 (6 months), second streak: depends on lump-sum amount
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
// Section 10: Pension held FLAT in real terms (finding 2.1)
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Pension Real-Dollar (no nominal COLA growth) ===');

test('P1: pension at year 20 ~= pension at year 0 (no nominal COLA in a real model)', () => {
  // Realistic fixture (~$800/mo PERS Plan 2), NOT the $5k headline.
  // Previously this grew by 1.03^20 ≈ 1.806x; owner decision: hold flat in real terms like SS.
  const pensionMonthly = 800;
  const year0 = getPensionAtMonth(0, pensionMonthly, true);
  const year20 = getPensionAtMonth(20 * 12, pensionMonthly, true);
  near(year20, year0, 1, 'pension year 20 should ~= year 0 (flat in real terms)');
  eq(year0, 800, 'pension year 0 = base monthly');
});

test('P2: pension is constant across the full couple-phase horizon (flat real)', () => {
  const pensionMonthly = 800;
  for (let yr = 0; yr <= 30; yr++) {
    eq(getPensionAtMonth(yr * 12, pensionMonthly, true), 800,
      `pension at year ${yr} should remain flat at 800`);
  }
});

test('P3: survivor pension is exactly 50% and also flat in real terms', () => {
  const pensionMonthly = 800;
  eq(getPensionAtMonth(0, pensionMonthly, false), 400, 'survivor year 0 = 50%');
  eq(getPensionAtMonth(20 * 12, pensionMonthly, false), 400, 'survivor year 20 = 50%, unchanged');
});

test('P4: zero pension stays zero', () => {
  eq(getPensionAtMonth(120, 0, true), 0);
  eq(getPensionAtMonth(120, 0, false), 0);
});

// ════════════════════════════════════════════════════════════════════════
// Section 11: simulatePath credits guaranteed income at/below floor (finding 2.2)
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== simulatePath floor is a hard clamp, not an income cutoff ===');

test('S1: survivor-phase pool RECOVERS above floor when scaled spend < guaranteed income', () => {
  // Survivor-phase fixture from report §2.2:
  //   supplementalFlows = 5000/mo (guaranteed income)
  //   scaling = 1.0 (couple) then 0.5 (survivor)
  //   withdrawal = 9000/mo, pool0 = 10000, returns = 0, floor = 0
  // Couple phase: net drain = 9000*1.0 - 5000 = 4000/mo -> hits floor fast.
  // Survivor phase: net = 9000*0.5 - 5000 = -500/mo -> pool should RECOVER.
  const T = 120;
  const blended = zeros(T);                 // returns = 0
  const flows = filled(T, 5000);            // guaranteed income 5000/mo
  const scaling = new Float64Array(T);
  for (let t = 0; t < T; t++) scaling[t] = t < 12 ? 1.0 : 0.5;
  const sim = simulatePath(blended, 0, T, 9000, flows, scaling, 10_000, 0);

  assert.ok(sim.finalPool > 0,
    `survivor-phase pool should recover above 0, got ${sim.finalPool}`);
  eq(sim.everDepleted, true, 'pool did touch the floor during the couple phase');
});

test('S2: guaranteed income is credited every month even after touching the floor', () => {
  // Pure income, no withdrawal: once at floor, income must still accrue.
  const T = 24;
  const blended = zeros(T);
  const flows = filled(T, 1000);            // 1000/mo guaranteed
  const scaling = ones(T);
  // Start at 0 (== floor) with no withdrawal: pool must climb from income.
  const sim = simulatePath(blended, 0, T, 0, flows, scaling, 0, 0);
  assert.ok(sim.finalPool > 0,
    `income must accrue from the floor, got finalPool ${sim.finalPool}`);
});

test('S3: floor is still a hard clamp (pool never reported below floor)', () => {
  const T = 24;
  const blended = zeros(T);
  const flows = zeros(T);                   // no guaranteed income
  const scaling = ones(T);
  // Big withdrawal, no income, no recovery: must clamp at floor, not go negative.
  const sim = simulatePath(blended, 0, T, 50_000, flows, scaling, 10_000, 0);
  for (const p of sim.yearlyPools) {
    assert.ok(p >= 0, `pool snapshot ${p} should never be below floor 0`);
  }
  eq(sim.finalPool, 0, 'no income + heavy spend stays clamped at floor');
  eq(sim.everDepleted, true);
});

// ════════════════════════════════════════════════════════════════════════
// Section 12: Inheritance single carrier — credited exactly once (finding 2026-06-09 2.1)
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Inheritance single carrier (supplementalFlows only) ===');

test('I1: cash event in BOTH supplementalFlows and rescueFlows credits the pool exactly once (pool above floor)', () => {
  // This is how the bug shipped: useRetirementSimulation put the inheritance
  // into supplementalFlows AND rescueFlows, and simulatePath credited both.
  const T = 12;
  const blended = zeros(T);
  const flows = zeros(T);
  const rescueFlows = zeros(T);
  const scaling = ones(T);
  flows[3] = 10_000;
  rescueFlows[3] = 10_000; // legacy duplicate carrier — must NOT credit again
  const sim = simulatePath(blended, 0, T, 0, flows, scaling, 1000, 0, rescueFlows);
  eq(sim.finalPool, 11_000, 'pool + event exactly once (double-count produced 21,000)');
});

test('I2: event credited exactly once even when the pool is pinned at the floor', () => {
  const T = 12;
  const blended = zeros(T);
  const flows = zeros(T);
  const rescueFlows = zeros(T);
  const scaling = ones(T);
  flows[3] = 10_000;
  rescueFlows[3] = 10_000;
  // Pool starts AT the floor — supplementalFlows still accrue (finding 2.2),
  // so the event arrives via the single supplemental carrier, never twice.
  const sim = simulatePath(blended, 0, T, 0, flows, scaling, 0, 0, rescueFlows);
  eq(sim.finalPool, 10_000, 'event exactly once from the floor (double-count produced 20,000)');
});

test('I3: closed-form SWR round-trips through simulatePath when a duplicate rescue event is supplied', () => {
  // computeSWR has no rescue concept — it credits supplementalFlows once.
  // simulatePath must agree, even if a caller also passes the event as a
  // rescue flow, or the chart bands diverge from the closed-form survival math.
  const T = 120;
  const blended = zeros(T);
  const scaling = ones(T);
  const flows = filled(T, 1000);
  flows[30] += 200_000; // inheritance in the single carrier
  const rescueFlows = zeros(T);
  rescueFlows[30] = 200_000; // duplicate event in the legacy rescue carrier
  const pool = 500_000;

  const swr = computeSWR(blended, 0, T, flows, scaling, 0, pool);
  const sim = simulatePath(blended, 0, T, swr, flows, scaling, pool, 0, rescueFlows);
  near(sim.finalPool, 0, 1, 'duplicate rescue event must not inflate the final pool by $200k');
});

// ════════════════════════════════════════════════════════════════════════
// Summary
// ════════════════════════════════════════════════════════════════════════
console.log(`\n${'='.repeat(50)}`);
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'='.repeat(50)}\n`);

if (failed > 0) process.exit(1);
