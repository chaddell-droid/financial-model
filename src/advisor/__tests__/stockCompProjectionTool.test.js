/**
 * Tests for the advisor `getStockCompProjection` tool.
 *
 * Locks the contract that the tool returns the SAME numbers as the
 * IncomeControls W-2 Net Diagnostic (single source: src/model/w2Diagnostic.js).
 * Also locks degenerate-input behavior and the chadJob=false branch.
 *
 * Run with: node src/advisor/__tests__/stockCompProjectionTool.test.js
 */
import assert from 'node:assert';
import { runTool } from '../tools.js';
import { computeW2Diagnostic } from '../../model/w2Diagnostic.js';
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

// Representative state from the task spec:
//   salary 180K, refresh 40K, hire 160K total, growth 15%
const repState = () => gatherStateWithOverrides({
  chadJob: true,
  chadJobSalary: 180000,
  chadJobTaxRate: 28,
  chadJobBonusPct: 15,
  chadJobNoFICA: false,
  chadJobStockRefresh: 40000,
  chadJobRefreshStartMonth: 12,
  chadJobHireStockTotal: 160000, // 2026-06-10: one total grant (was 4 × 40K)
  chadJob401kEnabled: false,
  chadJobPensionContrib: 0,
  msftGrowth: 15,
  chadCurrentAge: 61, chadWorkMonths: 72, sarahWorkMonths: 96,
  startingSavings: 200000,
});

console.log('\n=== getStockCompProjection ===');

test('Tool returns ok=true for representative state', () => {
  const r = runTool('getStockCompProjection', repState());
  assert.ok(r.ok, 'ok flag should be true');
  assert.strictEqual(r.jobNotEnabled, false);
});

test('Tool totalAvgMo matches the W-2 diagnostic for representative state', () => {
  const s = repState();
  const r = runTool('getStockCompProjection', s);
  const direct = computeW2Diagnostic(s);
  // Tool rounds totalAvgMo via Math.round in computeW2Diagnostic + r() in tool.
  // Both paths should agree exactly because they share the helper.
  assert.strictEqual(r.totals.totalAvgMo, Math.round(direct.totalAvgMo),
    `expected ${Math.round(direct.totalAvgMo)}, got ${r.totals.totalAvgMo}`);
});

test('Tool totalAvgYr is close to (salaryNet + bonusNet + refreshNet + hireNetAvg)', () => {
  const s = repState();
  const r = runTool('getStockCompProjection', s);
  const sum = r.salary.annualSalaryNet + r.bonus.bonusNetYr + r.refresh.refreshNetYrSteady + r.hireStock.hireNetAvgYr;
  // Allow $5 rounding drift across 4 r() calls on independent components.
  assert.ok(Math.abs(r.totals.totalAvgYr - sum) <= 5,
    `totalAvgYr ${r.totals.totalAvgYr} should match sum ${sum}`);
});

test('Refresh net reflects 15% MSFT growth (steady-state mult > 1)', () => {
  const s = repState();
  const r = runTool('getStockCompProjection', s);
  // With g=15%, the steady-state mult averages (1.15^0.5 + 1.15^1.5 + ... + 1.15^4.5) / 5
  // ≈ 1.446 — materially larger than the no-growth case (1.0).
  assert.ok(r.refresh.refreshSteadyMult > 1.4 && r.refresh.refreshSteadyMult < 1.5,
    `expected refreshSteadyMult in (1.4, 1.5) for g=15%, got ${r.refresh.refreshSteadyMult}`);
  // refreshGrant 40K × (1 - 0.28) × ~1.446 ≈ 41.6K — direction sanity check
  // (matches the spec's published $43,382/yr at slightly different assumptions).
  assert.ok(r.refresh.refreshNetYrSteady > 35000,
    `expected refreshNetYrSteady > $35K with growth, got ${r.refresh.refreshNetYrSteady}`);
});

test('Hire stock grown total > sum at hire (MSFT growth applied)', () => {
  const s = repState();
  const r = runTool('getStockCompProjection', s);
  assert.strictEqual(r.hireStock.hireTotalAtHire, 160000);
  assert.ok(r.hireStock.hireGrownTotal > r.hireStock.hireTotalAtHire,
    `hireGrownTotal ${r.hireStock.hireGrownTotal} should exceed hireTotalAtHire ${r.hireStock.hireTotalAtHire}`);
});

test('Tool exposes input echoes for transparency', () => {
  const r = runTool('getStockCompProjection', repState());
  assert.strictEqual(r.inputs.chadJobSalary, 180000);
  assert.strictEqual(r.inputs.msftGrowth, 15);
  assert.strictEqual(r.inputs.chadJobTaxRate, 28);
  assert.strictEqual(r.inputs.chadJobNoFICA, false);
});

test('includeNotes=true attaches explanatory notes', () => {
  const r = runTool('getStockCompProjection', repState(), { includeNotes: true });
  assert.ok(r.notes && typeof r.notes.refreshSteadyState === 'string');
  assert.ok(r.notes.source.includes('projection.js'));
});

test('chadJob=false returns jobNotEnabled=true with zero totals', () => {
  const s = gatherStateWithOverrides({
    chadJob: false,
    chadJobSalary: 180000, // values present but should be ignored
    msftGrowth: 15,
    chadCurrentAge: 61, chadWorkMonths: 72, sarahWorkMonths: 96,
    startingSavings: 200000,
  });
  const r = runTool('getStockCompProjection', s);
  assert.ok(r.ok);
  assert.strictEqual(r.jobNotEnabled, true);
  assert.strictEqual(r.totals.totalAvgMo, 0);
  assert.strictEqual(r.totals.totalAvgYr, 0);
  assert.ok(typeof r.message === 'string' && r.message.toLowerCase().includes('chadjob'));
});

test('Degenerate input — zero salary, zero refresh, zero hire — returns finite zeros', () => {
  const s = gatherStateWithOverrides({
    chadJob: true,
    chadJobSalary: 0,
    chadJobTaxRate: 25,
    chadJobBonusPct: 0,
    chadJobStockRefresh: 0,
    chadJobHireStockTotal: 0,
    msftGrowth: 0,
    chadJob401kEnabled: false,
    chadJobPensionContrib: 0,
    chadCurrentAge: 61, chadWorkMonths: 72, sarahWorkMonths: 96,
    startingSavings: 200000,
  });
  const r = runTool('getStockCompProjection', s);
  assert.ok(r.ok);
  // chadJobSalary=0 → IncomeControls defaults effectiveSalary to 80000 (matches diagnostic).
  // Verify the result is finite and reasonable, NOT NaN.
  assert.ok(Number.isFinite(r.totals.totalAvgMo), 'totalAvgMo must be finite');
  assert.ok(Number.isFinite(r.totals.totalAvgYr), 'totalAvgYr must be finite');
  assert.ok(Number.isFinite(r.refresh.refreshNetYrSteady), 'refreshNetYrSteady must be finite');
  assert.ok(Number.isFinite(r.hireStock.hireGrownTotal), 'hireGrownTotal must be finite');
  // Refresh net with zero refresh grant should be exactly zero.
  assert.strictEqual(r.refresh.refreshNetYrSteady, 0);
  // Hire grown total with all zeros should be zero.
  assert.strictEqual(r.hireStock.hireGrownTotal, 0);
});

test('Degenerate growth=0 collapses refreshSteadyMult to 1.0', () => {
  const s = gatherStateWithOverrides({
    chadJob: true,
    chadJobSalary: 100000,
    chadJobTaxRate: 25,
    chadJobStockRefresh: 50000,
    msftGrowth: 0,
    chadJob401kEnabled: false,
    chadJobPensionContrib: 0,
    chadCurrentAge: 61, chadWorkMonths: 72, sarahWorkMonths: 96,
    startingSavings: 200000,
  });
  const r = runTool('getStockCompProjection', s);
  assert.strictEqual(r.multipliers.refreshSteadyMult, 1,
    'With msftGrowth=0, refreshSteadyMult should be exactly 1');
});

console.log(`\n=== Summary: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exit(1);
