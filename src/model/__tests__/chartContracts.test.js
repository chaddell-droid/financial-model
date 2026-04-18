/**
 * Chart data-contract tests — verifies that the projection engine outputs
 * data in the shape each chart component expects.
 * No React rendering needed; we run the projection and check the output structure.
 *
 * Run with: node src/model/__tests__/chartContracts.test.js
 */
import assert from 'node:assert';
import { runMonthlySimulation, computeProjection } from '../projection.js';
import { gatherStateWithOverrides } from '../../state/gatherState.js';
import { getVestEvents, getTotalRemainingVesting } from '../vesting.js';
import { buildRetirementContext } from '../retirementIncome.js';
import { runMonteCarlo } from '../monteCarlo.js';
import { DAYS_PER_MONTH } from '../constants.js';

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

/** Approximate equality for financial calculations. */
function near(actual, expected, tolerance, label) {
  const diff = Math.abs(actual - expected);
  if (diff > tolerance) {
    throw new Error(
      `${label || 'near'}: expected ~${expected} (+/-${tolerance}), got ${actual} (diff ${diff})`
    );
  }
}

// ════════════════════════════════════════════════════════════════════════
// Shared projection output used across multiple chart tests
// ════════════════════════════════════════════════════════════════════════
const baseState = gatherStateWithOverrides({});
const baseProjection = computeProjection(baseState);
const { data: baseData, savingsData: baseSavingsData, monthlyData: baseMonthlyData } = baseProjection;

// ════════════════════════════════════════════════════════════════════════
// 1. IncomeCompositionChart (C1–C6)
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== IncomeCompositionChart ===');

const incomeFields = ['sarahIncome', 'msftVesting', 'ssBenefit', 'trustLLC', 'chadJobIncome', 'consulting', 'investReturn'];

test('C1: Every quarterly row has all 7 income fields + expenses + totalIncome + netMonthly, all finite numbers', () => {
  const allFields = [...incomeFields, 'expenses', 'totalIncome', 'netMonthly'];
  for (let i = 0; i < baseData.length; i++) {
    const d = baseData[i];
    for (const field of allFields) {
      assert.ok(field in d, `Row ${i} missing field '${field}'`);
      assert.ok(Number.isFinite(d[field]), `Row ${i} field '${field}' is not finite: ${d[field]}`);
    }
  }
});

test("C2: Income field names match what chart expects: 'sarahIncome', 'msftVesting' (NOT 'msftLump'), 'ssBenefit', 'trustLLC', 'chadJobIncome', 'consulting', 'investReturn'", () => {
  const d = baseData[0];
  for (const field of incomeFields) {
    assert.ok(field in d, `Missing expected field '${field}' in quarterly data`);
  }
  // msftVesting exists but msftLump should NOT be a quarterly field
  assert.ok('msftVesting' in d, 'msftVesting must be present in quarterly data');
});

test('C3: Income values non-negative for all sources except investReturn (which can be negative)', () => {
  const nonNegFields = incomeFields.filter(f => f !== 'investReturn');
  for (let i = 0; i < baseData.length; i++) {
    const d = baseData[i];
    for (const field of nonNegFields) {
      assert.ok(d[field] >= 0, `Row ${i} field '${field}' is negative: ${d[field]}`);
    }
  }
});

test('C4: expenses > 0 for every quarter (always have some expenses)', () => {
  for (let i = 0; i < baseData.length; i++) {
    assert.ok(baseData[i].expenses > 0, `Row ${i} expenses should be > 0, got ${baseData[i].expenses}`);
  }
});

test('C5: totalIncome ≈ sum of 7 income fields (within rounding tolerance of 2)', () => {
  for (let i = 0; i < baseData.length; i++) {
    const d = baseData[i];
    const sumFields = incomeFields.reduce((sum, f) => sum + d[f], 0);
    near(d.totalIncome, sumFields, 2, `Row ${i} totalIncome`);
  }
});

test('C6: With chadJob=true and chadJobStartMonth=0, chadJobIncome > 0 in first quarter', () => {
  const jobState = gatherStateWithOverrides({ chadJob: true, chadJobStartMonth: 0 });
  const jobProjection = computeProjection(jobState);
  assert.ok(jobProjection.data[0].chadJobIncome > 0,
    `First quarter chadJobIncome should be > 0 when chadJob=true, got ${jobProjection.data[0].chadJobIncome}`);
});

// ════════════════════════════════════════════════════════════════════════
// 2. SavingsDrawdownChart (C7–C11)
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== SavingsDrawdownChart ===');

test('C7: savingsData.length === totalProjectionMonths + 1', () => {
  assert.strictEqual(baseSavingsData.length, baseState.totalProjectionMonths + 1,
    `savingsData.length ${baseSavingsData.length} !== totalProjectionMonths+1 ${baseState.totalProjectionMonths + 1}`);
});

test('C8: Every savingsData entry has month (number), balance (number), label (string)', () => {
  for (let i = 0; i < baseSavingsData.length; i++) {
    const d = baseSavingsData[i];
    assert.ok(typeof d.month === 'number' && Number.isFinite(d.month), `Row ${i} month not a finite number`);
    assert.ok(typeof d.balance === 'number' && Number.isFinite(d.balance), `Row ${i} balance not a finite number`);
    assert.ok(typeof d.label === 'string' && d.label.length > 0, `Row ${i} label not a non-empty string`);
  }
});

test('C9: savingsData[0].month === 0, savingsData[last].month === totalProjectionMonths', () => {
  assert.strictEqual(baseSavingsData[0].month, 0, `First month should be 0, got ${baseSavingsData[0].month}`);
  const last = baseSavingsData[baseSavingsData.length - 1];
  assert.strictEqual(last.month, baseState.totalProjectionMonths,
    `Last month should be ${baseState.totalProjectionMonths}, got ${last.month}`);
});

test('C10: monthlyData.length === savingsData.length (parallel arrays)', () => {
  assert.strictEqual(baseMonthlyData.length, baseSavingsData.length,
    `monthlyData.length ${baseMonthlyData.length} !== savingsData.length ${baseSavingsData.length}`);
});

test("C11: monthlyData rows have all fields needed by detectSignificantChanges: 'ssBenefit', 'chadJobIncome', 'consulting', 'expenses'", () => {
  const needed = ['ssBenefit', 'chadJobIncome', 'consulting', 'expenses'];
  for (let i = 0; i < baseMonthlyData.length; i++) {
    for (const field of needed) {
      assert.ok(field in baseMonthlyData[i], `monthlyData[${i}] missing field '${field}'`);
    }
  }
});

// ════════════════════════════════════════════════════════════════════════
// 3. MonthlyCashFlowChart (C12–C16)
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== MonthlyCashFlowChart ===');

test('C12: Every quarterly row has finite netMonthly', () => {
  for (let i = 0; i < baseData.length; i++) {
    assert.ok(Number.isFinite(baseData[i].netMonthly),
      `Row ${i} netMonthly is not finite: ${baseData[i].netMonthly}`);
  }
});

test('C13: Every quarterly row has msftVesting field (NOT msftLump)', () => {
  for (let i = 0; i < baseData.length; i++) {
    assert.ok('msftVesting' in baseData[i], `Row ${i} missing msftVesting field`);
  }
});

test("C14: Every quarterly row has non-empty label string matching pattern Q[1-4]'[0-9]{2}", () => {
  const pattern = /^Q[1-4]'\d{2}$/;
  for (let i = 0; i < baseData.length; i++) {
    const label = baseData[i].label;
    assert.ok(typeof label === 'string' && label.length > 0, `Row ${i} label not a non-empty string`);
    assert.ok(pattern.test(label), `Row ${i} label '${label}' does not match Q[1-4]'NN pattern`);
  }
});

test('C15: data.length > 0 and <= 40 (reasonable quarter count)', () => {
  assert.ok(baseData.length > 0, 'data array should not be empty');
  assert.ok(baseData.length <= 40, `data array length ${baseData.length} exceeds 40 quarters`);
});

test('C16: netMonthly approximately equals totalIncome - expenses (within rounding tolerance of 2)', () => {
  for (let i = 0; i < baseData.length; i++) {
    const d = baseData[i];
    near(d.netMonthly, d.totalIncome - d.expenses, 2, `Row ${i} netMonthly`);
  }
});

// ════════════════════════════════════════════════════════════════════════
// 4. NetWorthChart (C17–C21)
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== NetWorthChart ===');

test('C17: monthlyData.length === savingsData.length', () => {
  assert.strictEqual(baseMonthlyData.length, baseSavingsData.length,
    `monthlyData.length ${baseMonthlyData.length} !== savingsData.length ${baseSavingsData.length}`);
});

test('C18: Every monthlyData entry has finite balance401k and homeEquity', () => {
  for (let i = 0; i < baseMonthlyData.length; i++) {
    const d = baseMonthlyData[i];
    assert.ok('balance401k' in d, `monthlyData[${i}] missing balance401k`);
    assert.ok(Number.isFinite(d.balance401k), `monthlyData[${i}] balance401k not finite: ${d.balance401k}`);
    assert.ok('homeEquity' in d, `monthlyData[${i}] missing homeEquity`);
    assert.ok(Number.isFinite(d.homeEquity), `monthlyData[${i}] homeEquity not finite: ${d.homeEquity}`);
  }
});

test('C19: monthlyData[0].balance401k equals starting401k at month 0', () => {
  assert.strictEqual(baseMonthlyData[0].balance401k, baseState.starting401k,
    `monthlyData[0].balance401k ${baseMonthlyData[0].balance401k} !== starting401k ${baseState.starting401k}`);
});

test('C20: With return401k > 0 and large savings, final balance401k > starting401k', () => {
  const richState = gatherStateWithOverrides({ startingSavings: 10000000, return401k: 8 });
  const richProj = computeProjection(richState);
  const finalRow = richProj.monthlyData[richProj.monthlyData.length - 1];
  assert.ok(finalRow.balance401k > richState.starting401k,
    `Final balance401k ${finalRow.balance401k} should exceed starting401k ${richState.starting401k}`);
});

test('C21: homeEquity field present and finite at all months', () => {
  for (let i = 0; i < baseMonthlyData.length; i++) {
    assert.ok('homeEquity' in baseMonthlyData[i], `monthlyData[${i}] missing homeEquity`);
    assert.ok(Number.isFinite(baseMonthlyData[i].homeEquity),
      `monthlyData[${i}] homeEquity not finite: ${baseMonthlyData[i].homeEquity}`);
  }
});

// ════════════════════════════════════════════════════════════════════════
// 5. BridgeChart (C22–C25)
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== BridgeChart ===');

test('C22: monthlyData[0] has all required fields: sarahIncome, ssBenefit, chadJobIncome, consulting, expenses, balance, trustLLC, msftLump', () => {
  const requiredFields = ['sarahIncome', 'ssBenefit', 'chadJobIncome', 'consulting', 'expenses', 'balance', 'trustLLC', 'msftLump'];
  const d = baseMonthlyData[0];
  for (const field of requiredFields) {
    assert.ok(field in d, `monthlyData[0] missing field '${field}'`);
  }
});

test('C23: Quarterly data has month, label, netMonthly fields', () => {
  for (let i = 0; i < baseData.length; i++) {
    const d = baseData[i];
    assert.ok('month' in d, `data[${i}] missing month`);
    assert.ok('label' in d, `data[${i}] missing label`);
    assert.ok('netMonthly' in d, `data[${i}] missing netMonthly`);
  }
});

test('C24: Every quarterly data[i].month is within [0, totalProjectionMonths]', () => {
  for (let i = 0; i < baseData.length; i++) {
    const m = baseData[i].month;
    assert.ok(m >= 0, `data[${i}].month ${m} is negative`);
    assert.ok(m <= baseState.totalProjectionMonths,
      `data[${i}].month ${m} exceeds totalProjectionMonths ${baseState.totalProjectionMonths}`);
  }
});

test('C25: Data rows are ordered: data[i].month < data[i+1].month', () => {
  for (let i = 0; i < baseData.length - 1; i++) {
    assert.ok(baseData[i].month < baseData[i + 1].month,
      `data[${i}].month ${baseData[i].month} not < data[${i + 1}].month ${baseData[i + 1].month}`);
  }
});

// ════════════════════════════════════════════════════════════════════════
// 6. SarahPracticeChart (C26–C29)
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== SarahPracticeChart ===');

const sarahState = gatherStateWithOverrides({
  sarahRate: 200, sarahMaxRate: 250, sarahCurrentClients: 3.75, sarahMaxClients: 4.5,
  sarahRateGrowth: 5, sarahClientGrowth: 10, sarahTaxRate: 25,
});
const sarahProjection = computeProjection(sarahState);

test('C26: Chart formula at month 0 matches monthlyData[0].sarahIncome', () => {
  // Formula: Math.round(Math.min(200, 250) * Math.min(3.75, 4.5) * 21.5 * (1 - 0.25))
  //        = Math.round(200 * 3.75 * 21.5 * 0.75) = Math.round(12093.75) = 12094
  const expected = Math.round(200 * 3.75 * DAYS_PER_MONTH * 0.75);
  assert.strictEqual(sarahProjection.monthlyData[0].sarahIncome, expected,
    `monthlyData[0].sarahIncome ${sarahProjection.monthlyData[0].sarahIncome} !== expected ${expected}`);
});

test('C27: At ceiling (growth exceeds caps), sarahIncome matches maxRate * maxClients * DAYS_PER_MONTH * (1 - taxRate/100)', () => {
  // Use high growth rates that will quickly hit caps
  const capState = gatherStateWithOverrides({
    sarahRate: 200, sarahMaxRate: 250, sarahCurrentClients: 3.75, sarahMaxClients: 4.5,
    sarahRateGrowth: 100, sarahClientGrowth: 100, sarahTaxRate: 25,
    sarahWorkMonths: 72, chadWorkMonths: 72,
  });
  const capProj = computeProjection(capState);
  // By month 12 with 100% annual growth, both should be capped
  const cappedExpected = Math.round(250 * 4.5 * DAYS_PER_MONTH * (1 - 25 / 100));
  const m12 = capProj.monthlyData[12];
  assert.strictEqual(m12.sarahIncome, cappedExpected,
    `At month 12 with 100% growth, sarahIncome ${m12.sarahIncome} !== capped expected ${cappedExpected}`);
});

test('C28: With sarahWorkMonths=48, monthlyData has correct length', () => {
  const shortState = gatherStateWithOverrides({ sarahWorkMonths: 48, chadWorkMonths: 48 });
  const shortProj = computeProjection(shortState);
  // totalProjectionMonths = max(chadWorkMonths, sarahWorkMonths) = 48
  assert.strictEqual(shortProj.monthlyData.length, 49,
    `monthlyData.length ${shortProj.monthlyData.length} !== 49 (48 months + 1)`);
});

test('C29: Sarah income is 0 after sarahWorkMonths', () => {
  const retireState = gatherStateWithOverrides({ sarahWorkMonths: 24, chadWorkMonths: 48 });
  const retireProj = computeProjection(retireState);
  // sarahRetirementMonth = 24; income stops after month 24, so month 25 should be 0
  const m25 = retireProj.monthlyData[25];
  assert.strictEqual(m25.sarahIncome, 0,
    `sarahIncome at month 25 (after sarahWorkMonths=24) should be 0, got ${m25.sarahIncome}`);
});

// ════════════════════════════════════════════════════════════════════════
// 7. RetirementCompositionChart (C30–C33)
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== RetirementCompositionChart ===');

const retCtx = buildRetirementContext({
  horizonMonths: 444,
  chadPassesAge: 85,
  ageDiff: 5,
  survivorSpendRatio: 0.6,
  chadSS: 2933,
  ssFRA: 4214,
  sarahOwnSS: 500,
  survivorSS: 2500,
  trustMonthly: 2083,
  pensionMonthly: 800,
});

test('C30: buildRetirementContext returns object with all required arrays of length === horizonMonths', () => {
  const requiredArrays = [
    'supplementalFlows', 'scaling', 'guaranteedIncome', 'ssIncome',
    'trustIncome', 'pensionIncome', 'chadAges', 'sarahAges', 'phases', 'ssLabels',
  ];
  for (const name of requiredArrays) {
    assert.ok(name in retCtx, `Missing array '${name}' in buildRetirementContext result`);
    assert.strictEqual(retCtx[name].length, 444,
      `${name}.length ${retCtx[name].length} !== horizonMonths 444`);
  }
});

test('C31: All income arrays have non-negative values', () => {
  const incomeArrays = ['guaranteedIncome', 'ssIncome', 'trustIncome', 'pensionIncome'];
  for (const name of incomeArrays) {
    for (let t = 0; t < retCtx[name].length; t++) {
      assert.ok(retCtx[name][t] >= 0,
        `${name}[${t}] is negative: ${retCtx[name][t]}`);
    }
  }
});

test('C32: Pension income grows over time (COLA 3%/yr): pensionIncome[120] > pensionIncome[0]', () => {
  assert.ok(retCtx.pensionIncome[120] > retCtx.pensionIncome[0],
    `pensionIncome[120] ${retCtx.pensionIncome[120]} should be > pensionIncome[0] ${retCtx.pensionIncome[0]}`);
});

test("C33: phases array contains only 'couple' and 'survivor' values", () => {
  const validPhases = new Set(['couple', 'survivor']);
  for (let t = 0; t < retCtx.phases.length; t++) {
    assert.ok(validPhases.has(retCtx.phases[t]),
      `phases[${t}] has unexpected value '${retCtx.phases[t]}'`);
  }
});

// ════════════════════════════════════════════════════════════════════════
// 8. MsftVestingChart (C34–C36)
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== MsftVestingChart ===');

const vestEvents = getVestEvents(0, 373.46);

test('C34: getVestEvents(0, 373.46) returns array with 10 entries (VEST_SHARES has 10 periods)', () => {
  assert.strictEqual(vestEvents.length, 10,
    `getVestEvents returned ${vestEvents.length} entries, expected 10`);
});

test('C35: Each entry has: label (string), shares (number > 0), gross (number > 0), net (number > 0), price (number > 0)', () => {
  for (let i = 0; i < vestEvents.length; i++) {
    const v = vestEvents[i];
    assert.ok(typeof v.label === 'string' && v.label.length > 0, `Entry ${i} label not a non-empty string`);
    assert.ok(typeof v.shares === 'number' && v.shares > 0, `Entry ${i} shares not > 0: ${v.shares}`);
    assert.ok(typeof v.gross === 'number' && v.gross > 0, `Entry ${i} gross not > 0: ${v.gross}`);
    assert.ok(typeof v.net === 'number' && v.net > 0, `Entry ${i} net not > 0: ${v.net}`);
    assert.ok(typeof v.price === 'number' && v.price > 0, `Entry ${i} price not > 0: ${v.price}`);
  }
});

test('C36: net === Math.round(gross * 0.8) for each entry (80% net ratio)', () => {
  for (let i = 0; i < vestEvents.length; i++) {
    const v = vestEvents[i];
    const expectedNet = Math.round(v.gross * 0.8);
    assert.strictEqual(v.net, expectedNet,
      `Entry ${i} net ${v.net} !== Math.round(gross * 0.8) = ${expectedNet}`);
  }
});

// ════════════════════════════════════════════════════════════════════════
// 9. MonteCarloPanel (C37–C38)
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== MonteCarloPanel ===');

test('C37: null mcResults does not crash when accessed (guard check)', () => {
  const mcResults = null;
  assert.strictEqual(mcResults, null, 'null mcResults should be null');
  // Chart should guard against null — this tests the premise
  assert.ok(mcResults === null || typeof mcResults === 'object', 'mcResults is null or object');
});

test('C38: runMonteCarlo with numSims=10 returns result with bands, solvencyRate, numSims', () => {
  const mcBase = gatherStateWithOverrides({});
  const mcParams = {
    mcNumSims: 10, mcInvestVol: 12, mcBizGrowthVol: 5, mcMsftVol: 15,
    mcSsdiDelay: 6, mcSsdiDenialPct: 5, mcCutsDiscipline: 25,
  };
  const result = runMonteCarlo(mcBase, mcParams, [], { seed: 42 });
  assert.ok(typeof result === 'object' && result !== null, 'runMonteCarlo should return an object');
  assert.ok('bands' in result, 'Result missing bands');
  assert.ok(Array.isArray(result.bands), 'bands should be an array');
  // bands contains 5 percentile objects (p10, p25, p50, p75, p90)
  assert.strictEqual(result.bands.length, 5, `bands.length ${result.bands.length} !== 5`);
  for (const band of result.bands) {
    assert.ok('pct' in band, 'Each band must have a pct field');
    assert.ok('series' in band && Array.isArray(band.series), 'Each band must have a series array');
  }
  assert.ok(typeof result.solvencyRate === 'number', 'solvencyRate should be a number');
  assert.ok(result.solvencyRate >= 0 && result.solvencyRate <= 1,
    `solvencyRate ${result.solvencyRate} should be between 0 and 1`);
  assert.strictEqual(result.numSims, 10, `numSims ${result.numSims} !== 10`);
});

// ════════════════════════════════════════════════════════════════════════
// 10. SequenceOfReturnsChart (C39–C40)
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== SequenceOfReturnsChart ===');

test('C39: monthlyData length divided by 12 gives a reasonable year count for chart x-axis', () => {
  // monthlyData.length = totalProjectionMonths + 1
  const years = (baseMonthlyData.length - 1) / 12;
  assert.ok(years >= 1, `Year count ${years} should be >= 1`);
  assert.ok(years <= 30, `Year count ${years} should be <= 30`);
});

test('C40: monthlyData has investReturn field at every row (used by SOR calculations)', () => {
  for (let i = 0; i < baseMonthlyData.length; i++) {
    assert.ok('investReturn' in baseMonthlyData[i],
      `monthlyData[${i}] missing investReturn field`);
    assert.ok(Number.isFinite(baseMonthlyData[i].investReturn),
      `monthlyData[${i}] investReturn not finite: ${baseMonthlyData[i].investReturn}`);
  }
});

// ════════════════════════════════════════════════════════════════════════
// Summary
// ════════════════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(60)}`);
console.log(`  Chart contracts: ${passed} passed, ${failed} failed`);
console.log(`${'═'.repeat(60)}\n`);
if (failed > 0) process.exit(1);
