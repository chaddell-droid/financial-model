/**
 * On-hire stock vest schedule (2026-06-10 change request):
 *   ONE slider — chadJobHireStockTotal (grant-date $ value) — replaces the
 *   four chadJobHireStockY1..Y4 annual-anniversary lumps.
 *
 *   MSFT actual schedule: 25% of total vests at month 12 after job start,
 *   then 6.25% every 3 months — months 15, 18, ..., 48 (12 quarterly
 *   tranches). 25% + 12 × 6.25% = 100%.
 *
 *   Each tranche appreciates issue→vest: tranche × (1+g)^(monthsWorked/12),
 *   netted with the bonus/RSU multiplier, paid as cash in the vest month.
 *
 * Single source of truth: vesting.js exports the schedule + helpers consumed
 * by projection.js, taxProjection.js, w2Diagnostic.js, sensitivityAnalysis.js.
 *
 * Run with:
 *   node src/model/__tests__/hireVestSchedule.test.js
 */
import assert from 'node:assert';
import {
  HIRE_VEST_TRANCHES,
  hireVestGrossInMonth,
  hireVestGrossForEmploymentYear,
  hireVestGrowthWeightedMean,
} from '../vesting.js';
import { computeW2Diagnostic } from '../w2Diagnostic.js';
import { buildTaxSchedule } from '../taxProjection.js';
import { runMonthlySimulation } from '../projection.js';
import { gatherStateWithOverrides, prepareComparisonState } from '../../state/gatherState.js';
import { migrate, validateAndSanitize } from '../../state/schemaValidation.js';

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

function near(actual, expected, tol, label) {
  assert.ok(Math.abs(actual - expected) <= tol,
    `${label}: expected ~${expected}, got ${actual}`);
}

console.log('\n=== Schedule shape ===');

test('SCHED-1. 13 tranches: 25% at month 12, then 6.25% at 15, 18, ..., 48', () => {
  assert.strictEqual(HIRE_VEST_TRANCHES.length, 13, '13 tranches');
  assert.strictEqual(HIRE_VEST_TRANCHES[0].monthsAfterStart, 12);
  assert.strictEqual(HIRE_VEST_TRANCHES[0].fraction, 0.25);
  for (let i = 1; i < 13; i++) {
    assert.strictEqual(HIRE_VEST_TRANCHES[i].monthsAfterStart, 12 + 3 * i,
      `tranche ${i} month`);
    assert.strictEqual(HIRE_VEST_TRANCHES[i].fraction, 0.0625, `tranche ${i} fraction`);
  }
  assert.strictEqual(HIRE_VEST_TRANCHES[12].monthsAfterStart, 48, 'last tranche at month 48');
});

test('SCHED-2. Fractions sum to exactly 1 (0.25 and 0.0625 are binary-exact)', () => {
  const sum = HIRE_VEST_TRANCHES.reduce((a, t) => a + t.fraction, 0);
  assert.strictEqual(sum, 1, `fractions must sum to exactly 1, got ${sum}`);
});

console.log('\n=== hireVestGrossInMonth — tranche boundaries ===');

test('VEST-1. Nothing vests before month 12', () => {
  for (let mw = 0; mw <= 11; mw++) {
    assert.strictEqual(hireVestGrossInMonth(160000, mw, 0), 0, `monthsWorked=${mw}`);
  }
});

test('VEST-2. 25% of total vests at month 12 (g=0)', () => {
  assert.strictEqual(hireVestGrossInMonth(160000, 12, 0), 40000);
});

test('VEST-3. Non-tranche months pay nothing (13, 14, 16, 17, 47, 49, 50)', () => {
  for (const mw of [13, 14, 16, 17, 47, 49, 50]) {
    assert.strictEqual(hireVestGrossInMonth(160000, mw, 0), 0, `monthsWorked=${mw}`);
  }
});

test('VEST-4. 6.25% vests at every quarterly month 15..48 (g=0)', () => {
  for (let mw = 15; mw <= 48; mw += 3) {
    assert.strictEqual(hireVestGrossInMonth(160000, mw, 0), 10000, `monthsWorked=${mw}`);
  }
});

test('VEST-5. Nothing vests after month 48', () => {
  for (const mw of [51, 54, 60, 120]) {
    assert.strictEqual(hireVestGrossInMonth(160000, mw, 0), 0, `monthsWorked=${mw}`);
  }
});

test('VEST-6. All tranches sum to exactly the total (g=0)', () => {
  let sum = 0;
  for (let mw = 0; mw <= 60; mw++) sum += hireVestGrossInMonth(160000, mw, 0);
  assert.strictEqual(sum, 160000);
});

test('VEST-7. Growth weighting: tranche × (1+g)^(monthsWorked/12)', () => {
  const g = 12;
  near(hireVestGrossInMonth(160000, 12, g), 40000 * Math.pow(1.12, 1), 1e-6, 'm12');
  near(hireVestGrossInMonth(160000, 15, g), 10000 * Math.pow(1.12, 15 / 12), 1e-6, 'm15');
  near(hireVestGrossInMonth(160000, 48, g), 10000 * Math.pow(1.12, 4), 1e-6, 'm48');
});

test('VEST-8. Zero/absent total vests nothing', () => {
  assert.strictEqual(hireVestGrossInMonth(0, 12, 10), 0);
  assert.strictEqual(hireVestGrossInMonth(undefined, 12, 10), 0);
});

console.log('\n=== Employment-year sums (SS earnings test basis) ===');

test('YEAR-1. Year 1 = 43.75% (m12 + m15 + m18 + m21), years 2-3 = 25%, year 4 = 6.25% (g=0)', () => {
  assert.strictEqual(hireVestGrossForEmploymentYear(160000, 1, 0), 160000 * 0.4375);
  assert.strictEqual(hireVestGrossForEmploymentYear(160000, 2, 0), 40000);
  assert.strictEqual(hireVestGrossForEmploymentYear(160000, 3, 0), 40000);
  assert.strictEqual(hireVestGrossForEmploymentYear(160000, 4, 0), 10000);
  assert.strictEqual(hireVestGrossForEmploymentYear(160000, 0, 0), 0, 'year 0: nothing');
  assert.strictEqual(hireVestGrossForEmploymentYear(160000, 5, 0), 0, 'year 5: nothing');
});

test('YEAR-2. Year sums cover the whole grant (g=0) and each is growth-weighted per tranche', () => {
  const g0 = [1, 2, 3, 4].reduce((a, y) => a + hireVestGrossForEmploymentYear(160000, y, 0), 0);
  assert.strictEqual(g0, 160000);
  const g = 10;
  const expectedY1 = 160000 * (0.25 * Math.pow(1.1, 1)
    + 0.0625 * (Math.pow(1.1, 15 / 12) + Math.pow(1.1, 18 / 12) + Math.pow(1.1, 21 / 12)));
  near(hireVestGrossForEmploymentYear(160000, 1, g), expectedY1, 1e-6, 'year-1 growth-weighted');
});

console.log('\n=== Growth-weighted mean (w2Diagnostic basis) ===');

test('MEAN-1. g=0 → exactly 1; g>0 sits between (1+g)^1 and (1+g)^4', () => {
  assert.strictEqual(hireVestGrowthWeightedMean(0), 1);
  const m = hireVestGrowthWeightedMean(10);
  assert.ok(m > Math.pow(1.1, 1) && m < Math.pow(1.1, 4),
    `mean ${m} should sit between first- and last-tranche multipliers`);
  // Exact: Σ fᵢ (1+g)^(tᵢ/12) across the 13 tranches.
  const expected = HIRE_VEST_TRANCHES.reduce(
    (a, t) => a + t.fraction * Math.pow(1.1, t.monthsAfterStart / 12), 0);
  near(m, expected, 1e-12, 'closed-form mean');
});

console.log('\n=== Engine integration (projection.js) ===');

test('ENG-1. Quarterly hire vests land as cash income on the schedule (g=0)', () => {
  const s = gatherStateWithOverrides({
    chadJob: true, chadJobSalary: 100000, chadJobTaxRate: 25, chadJobStartMonth: 0,
    chadJobHireStockTotal: 160000, chadWorkMonths: 72, msftGrowth: 0,
  });
  const { monthlyData } = runMonthlySimulation(s);
  assert.strictEqual(monthlyData[11].chadJobStockHireNet, 0, 'm11: nothing before cliff');
  assert.strictEqual(monthlyData[12].chadJobStockHireNet, Math.round(40000 * 0.75), 'm12: 25% cliff');
  assert.strictEqual(monthlyData[13].chadJobStockHireNet, 0, 'm13: nothing');
  assert.strictEqual(monthlyData[15].chadJobStockHireNet, Math.round(10000 * 0.75), 'm15: 6.25%');
  assert.strictEqual(monthlyData[24].chadJobStockHireNet, Math.round(10000 * 0.75), 'm24: 6.25% (not an annual lump)');
  assert.strictEqual(monthlyData[48].chadJobStockHireNet, Math.round(10000 * 0.75), 'm48: final tranche');
  assert.strictEqual(monthlyData[51].chadJobStockHireNet, 0, 'm51: fully vested');
});

test('ENG-2. Late start: schedule anchors to chadJobStartMonth', () => {
  const s = gatherStateWithOverrides({
    chadJob: true, chadJobSalary: 100000, chadJobTaxRate: 25, chadJobStartMonth: 5,
    chadJobHireStockTotal: 80000, chadWorkMonths: 96, msftGrowth: 0,
    sarahWorkMonths: 96,
  });
  const { monthlyData } = runMonthlySimulation(s);
  assert.strictEqual(monthlyData[16].chadJobStockHireNet, 0, 'm16 (mw=11): nothing');
  assert.strictEqual(monthlyData[17].chadJobStockHireNet, Math.round(20000 * 0.75), 'm17 (mw=12): cliff');
  assert.strictEqual(monthlyData[20].chadJobStockHireNet, Math.round(5000 * 0.75), 'm20 (mw=15): quarterly');
});

test('ENG-3. Growth applies issue→vest per tranche', () => {
  const s = gatherStateWithOverrides({
    chadJob: true, chadJobSalary: 100000, chadJobTaxRate: 25, chadJobStartMonth: 0,
    chadJobHireStockTotal: 160000, chadWorkMonths: 72, msftGrowth: 10,
  });
  const { monthlyData } = runMonthlySimulation(s);
  assert.strictEqual(monthlyData[12].chadJobStockHireNet,
    Math.round(40000 * Math.pow(1.1, 1) * 0.75), 'm12 grown');
  assert.strictEqual(monthlyData[15].chadJobStockHireNet,
    Math.round(10000 * Math.pow(1.1, 15 / 12) * 0.75), 'm15 grown');
});

test('ENG-4. Partial horizon: vesting stops at retirement (unvested tranches forfeit)', () => {
  const s = gatherStateWithOverrides({
    chadJob: true, chadJobSalary: 100000, chadJobTaxRate: 25, chadJobStartMonth: 0,
    chadJobHireStockTotal: 160000, chadWorkMonths: 24, sarahWorkMonths: 72, msftGrowth: 0,
  });
  const { monthlyData } = runMonthlySimulation(s);
  assert.strictEqual(monthlyData[24].chadJobStockHireNet, Math.round(10000 * 0.75), 'm24: last vest at retirement');
  assert.strictEqual(monthlyData[27].chadJobStockHireNet, 0, 'm27: post-retirement tranche forfeited');
  assert.strictEqual(monthlyData[27].chadJobIncome, 0, 'm27: no job income at all');
});

console.log('\n=== Tax engine parity (taxProjection.js) ===');

test('TAX-1. Calendar-year W-2 gross carries the schedule-derived tranche sums', () => {
  const base = {
    chadJob: true, chadJobStartMonth: 0, chadJobSalary: 200000,
    chadJobBonusPct: 0, chadJobStockRefresh: 0, chadJobSignOnCash: 0,
    msftGrowth: 0, chadWorkMonths: 60, sarahWorkMonths: 72,
  };
  const noStock = buildTaxSchedule(gatherStateWithOverrides(base));
  const withStock = buildTaxSchedule(gatherStateWithOverrides({ ...base, chadJobHireStockTotal: 160000 }));
  // m=0 is Mar 2026; calendar 2027 = m=10..21 → tranches at m=12,15,18,21 = 43.75%.
  assert.strictEqual(withStock[1].chadW2Gross - noStock[1].chadW2Gross, 160000 * 0.4375,
    'year 1 (2027): cliff + 3 quarterly tranches');
  // Calendar 2028 = m=22..33 → tranches at m=24,27,30,33 = 25%.
  assert.strictEqual(withStock[2].chadW2Gross - noStock[2].chadW2Gross, 40000, 'year 2 (2028)');
  // Calendar 2030 = m=46..57 → tranche at m=48 only = 6.25%.
  assert.strictEqual(withStock[4].chadW2Gross - noStock[4].chadW2Gross, 10000, 'year 4 (2030): tail');
  // Whole grant lands in the W-2 across the vest window.
  const totalDiff = withStock.reduce((a, y, i) => a + y.chadW2Gross - noStock[i].chadW2Gross, 0);
  near(totalDiff, 160000, 1, 'whole grant taxed exactly once');
});

console.log('\n=== W-2 diagnostic (w2Diagnostic.js) ===');

test('W2D-1. g=0: hireGrownTotal = total, hireNetAvgYr = total × netMult / 4', () => {
  const d = computeW2Diagnostic(gatherStateWithOverrides({
    chadJob: true, chadJobSalary: 180000, chadJobTaxRate: 25,
    chadJobHireStockTotal: 160000, msftGrowth: 0,
  }));
  assert.strictEqual(d.hireTotalAtHire, 160000);
  assert.strictEqual(d.hireGrownTotal, 160000);
  near(d.hireNetAvgYr, 160000 * 0.75 / 4, 1e-9, 'hireNetAvgYr');
});

test('W2D-2. g>0: hireGrownTotal = total × growth-weighted mean across 13 tranches', () => {
  const d = computeW2Diagnostic(gatherStateWithOverrides({
    chadJob: true, chadJobSalary: 180000, chadJobTaxRate: 25,
    chadJobHireStockTotal: 160000, msftGrowth: 10,
  }));
  const expected = 160000 * hireVestGrowthWeightedMean(10);
  near(d.hireGrownTotal, expected, 1e-6, 'hireGrownTotal');
  near(d.hireNetAvgYr, expected * 0.75 / 4, 1e-6, 'hireNetAvgYr');
});

console.log('\n=== Backward compatibility — Y1..Y4 → total migration ===');

test('MIG-1. v8 payload with only Y1..Y4 set migrates total = Y1+Y2+Y3+Y4', () => {
  const out = validateAndSanitize(migrate({
    schemaVersion: 8,
    chadJobHireStockY1: 40000, chadJobHireStockY2: 80000,
    chadJobHireStockY3: 120000, chadJobHireStockY4: 30000,
  }));
  assert.strictEqual(out.chadJobHireStockTotal, 270000);
});

test('MIG-2. Pre-v8 payload (no schemaVersion) also migrates through the chain', () => {
  const out = validateAndSanitize(migrate({
    chadJobHireStockY1: 55000, chadJobHireStockY2: 30000,
    chadJobHireStockY3: 25000, chadJobHireStockY4: 10000,
  }));
  assert.strictEqual(out.chadJobHireStockTotal, 120000);
});

test('MIG-3. Existing chadJobHireStockTotal wins over legacy Y fields', () => {
  const out = validateAndSanitize(migrate({
    schemaVersion: 8,
    chadJobHireStockTotal: 200000,
    chadJobHireStockY1: 40000,
  }));
  assert.strictEqual(out.chadJobHireStockTotal, 200000);
});

test('MIG-4. No hire stock anywhere → total stays 0', () => {
  const out = validateAndSanitize(migrate({ schemaVersion: 8 }));
  assert.strictEqual(out.chadJobHireStockTotal, 0);
});

test('MIG-5. Saved-scenario round trip: legacy Y-only scenario projects with the migrated total', () => {
  const legacySaved = {
    schemaVersion: 8,
    chadJob: true, chadJobSalary: 100000, chadJobTaxRate: 25, chadJobStartMonth: 0,
    chadJobHireStockY1: 40000, chadJobHireStockY2: 40000,
    chadJobHireStockY3: 40000, chadJobHireStockY4: 40000,
    chadWorkMonths: 72, msftGrowth: 0,
  };
  const sLegacy = prepareComparisonState(legacySaved);
  assert.strictEqual(sLegacy.chadJobHireStockTotal, 160000, 'migrated total');
  const { monthlyData } = runMonthlySimulation(sLegacy);
  assert.strictEqual(monthlyData[12].chadJobStockHireNet, Math.round(160000 * 0.25 * 0.75),
    'legacy scenario vests on the new quarterly schedule');
});

console.log(`\n${'='.repeat(60)}`);
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'='.repeat(60)}\n`);

if (failed > 0) process.exit(1);
