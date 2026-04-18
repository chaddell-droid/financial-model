/**
 * Unit tests for exportModelData (src/model/exportData.js).
 * Run with: node src/model/__tests__/exportData.test.js
 */
import assert from 'node:assert';
import { exportModelData } from '../exportData.js';
import { gatherStateWithOverrides } from '../../state/gatherState.js';
import { computeProjection } from '../projection.js';
import { getVestEvents, getTotalRemainingVesting } from '../vesting.js';
import { INITIAL_STATE } from '../../state/initialState.js';
import { DAYS_PER_MONTH, VEST_SHARES } from '../constants.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (e) {
    console.log(`  FAIL  ${name}`);
    console.log(`        ${e.message}`);
    failed++;
  }
}

// ════════════════════════════════════════════════════════════════════════
// Helper: mock browser APIs and call exportModelData, returning parsed JSON
// ════════════════════════════════════════════════════════════════════════

function callExportAndCapture(state, projection, vestEvents, totalRemainingVesting, extras) {
  const savedBlob = globalThis.Blob;
  const savedUrl = globalThis.URL;
  const savedDocument = globalThis.document;

  let capturedJson = null;

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
    body: { appendChild() {}, removeChild() {} },
    createElement() {
      return { href: '', download: '', click() {} };
    },
  };

  try {
    exportModelData(state, projection, vestEvents, totalRemainingVesting, extras);
    return JSON.parse(capturedJson);
  } finally {
    globalThis.Blob = savedBlob;
    globalThis.URL = savedUrl;
    globalThis.document = savedDocument;
  }
}

// ════════════════════════════════════════════════════════════════════════
// Build default inputs from the real model pipeline
// ════════════════════════════════════════════════════════════════════════

function buildDefaultInputs(overrides = {}) {
  const s = gatherStateWithOverrides(overrides);
  const projection = computeProjection(s);
  const vestEvents = getVestEvents(s.msftGrowth || 0, s.msftPrice);
  const totalRemaining = getTotalRemainingVesting(s.msftGrowth || 0, s.msftPrice);

  const sarahGross = Math.round(s.sarahRate * s.sarahCurrentClients * DAYS_PER_MONTH);
  const sarahCurrentNet = Math.round(sarahGross * (1 - (s.sarahTaxRate ?? 25) / 100));

  const lifestyleCuts = s.lifestyleCuts || 0;
  const cutInHalf = s.cutInHalf || 0;
  const extraCuts = s.extraCuts || 0;
  const totalCuts = lifestyleCuts + cutInHalf + extraCuts;

  const rawMonthlyGap = sarahCurrentNet + (s.trustIncomeNow || 0) -
    (s.baseExpenses + s.debtService + (s.vanMonthlySavings || 0) + s.bcsFamilyMonthly);

  const extras = {
    rawMonthlyGap,
    sarahCurrentNet,
    advanceNeeded: Math.max(0, -rawMonthlyGap * 6),
    ssdiDenied: s.ssdiDenied || false,
    lifestyleCutsApplied: s.lifestyleCutsApplied || false,
    cutOliver: s.cutOliver || 0,
    cutVacation: s.cutVacation || 0,
    cutShopping: s.cutShopping || 0,
    cutMedical: s.cutMedical || 0,
    cutGym: s.cutGym || 0,
    cutAmazon: s.cutAmazon || 0,
    cutSaaS: s.cutSaaS || 0,
    cutEntertainment: s.cutEntertainment || 0,
    cutGroceries: s.cutGroceries || 0,
    cutPersonalCare: s.cutPersonalCare || 0,
    cutSmallItems: s.cutSmallItems || 0,
    lifestyleCuts,
    cutInHalf,
    extraCuts,
    goalResults: [],
  };

  return { s, projection, vestEvents, totalRemaining, extras };
}


// ════════════════════════════════════════════════════════════════════════
// Tests
// ════════════════════════════════════════════════════════════════════════

console.log('\n=== exportModelData — structure ===');

test('1. Export returns object with expected top-level keys', () => {
  const { s, projection, vestEvents, totalRemaining, extras } = buildDefaultInputs();
  const result = callExportAndCapture(s, projection, vestEvents, totalRemaining, extras);

  const expectedKeys = [
    '_meta', 'keyMetrics', 'income', 'expenses', 'toggles',
    'spendingCuts', 'debt', 'oneTimeCosts', 'savings', 'trajectory',
    'msftVesting', 'goals', 'wealth',
  ];
  for (const key of expectedKeys) {
    assert.ok(key in result, `missing top-level key: ${key}`);
  }
});

test('2. income.totalMonthly is a number and matches expected calculation', () => {
  const { s, projection, vestEvents, totalRemaining, extras } = buildDefaultInputs();
  const result = callExportAndCapture(s, projection, vestEvents, totalRemaining, extras);

  assert.strictEqual(typeof result.income.totalMonthly, 'number', 'totalMonthly should be a number');
  // totalMonthly = data[0].netCashFlow + data[0].expenses (i.e. total income)
  const data0 = projection.data[0];
  const expected = data0.netCashFlow + data0.expenses;
  assert.strictEqual(result.income.totalMonthly, expected,
    `totalMonthly should equal data[0].netCashFlow + data[0].expenses = ${expected}`);
});

test('3. expenses.totalRaw is a number', () => {
  const { s, projection, vestEvents, totalRemaining, extras } = buildDefaultInputs();
  const result = callExportAndCapture(s, projection, vestEvents, totalRemaining, extras);

  assert.strictEqual(typeof result.expenses.totalRaw, 'number', 'totalRaw should be a number');
  // totalRaw = baseExpenses + debtService + vanMonthlySavings + bcsFamilyMonthly
  const expected = s.baseExpenses + s.debtService + (s.vanMonthlySavings || 0) + s.bcsFamilyMonthly;
  assert.strictEqual(result.expenses.totalRaw, expected,
    `totalRaw should be ${expected}, got ${result.expenses.totalRaw}`);
});

test('4. debt totals match the input state', () => {
  const { s, projection, vestEvents, totalRemaining, extras } = buildDefaultInputs();
  const result = callExportAndCapture(s, projection, vestEvents, totalRemaining, extras);

  assert.strictEqual(result.debt.creditCards, s.debtCC, 'creditCards mismatch');
  assert.strictEqual(result.debt.personalLoans, s.debtPersonal, 'personalLoans mismatch');
  assert.strictEqual(result.debt.irs, s.debtIRS, 'irs mismatch');
  assert.strictEqual(result.debt.firstmark, s.debtFirstmark, 'firstmark mismatch');
  const expectedTotal = s.debtCC + s.debtPersonal + s.debtIRS + s.debtFirstmark;
  assert.strictEqual(result.debt.totalRetired, expectedTotal,
    `totalRetired should be ${expectedTotal}, got ${result.debt.totalRetired}`);
  assert.strictEqual(result.debt.monthlyServiceEliminated, s.debtService, 'monthlyServiceEliminated mismatch');
});

test('5. trajectory has the right number of rows', () => {
  const { s, projection, vestEvents, totalRemaining, extras } = buildDefaultInputs();
  const result = callExportAndCapture(s, projection, vestEvents, totalRemaining, extras);

  // milestoneMonths = [0, 3, 6, 9, 12, 18, 24, 30, 36, 42, 48, 60, 72]
  // monthlyData has 73 entries (0..72), so all 13 milestones should be present
  assert.strictEqual(result.trajectory.length, 13,
    `trajectory should have 13 rows, got ${result.trajectory.length}`);
});

test('6. trajectory rows have required fields', () => {
  const { s, projection, vestEvents, totalRemaining, extras } = buildDefaultInputs();
  const result = callExportAndCapture(s, projection, vestEvents, totalRemaining, extras);

  const requiredFields = [
    'month', 'label', 'sarahIncome', 'msftIncome', 'msftIncomeSmoothed',
    'trustLLCIncome', 'ssBenefit', 'ssBenefitType', 'investReturn', 'totalCashIncome',
    'totalCashIncomeSmoothed', 'expenses', 'netCashFlow',
    'netCashFlowSmoothed', 'netMonthly', 'netMonthlySmoothed', 'savingsBalance',
  ];
  for (const row of result.trajectory) {
    for (const field of requiredFields) {
      assert.ok(field in row, `trajectory row month=${row.month} missing field: ${field}`);
    }
  }
  // Verify first row is month 0
  assert.strictEqual(result.trajectory[0].month, 0, 'first trajectory row should be month 0');
  assert.strictEqual(result.trajectory[0].label, 'Y0M0', 'first trajectory label should be Y0M0');
});

test('7. Vesting events are included and match expected count', () => {
  const { s, projection, vestEvents, totalRemaining, extras } = buildDefaultInputs();
  const result = callExportAndCapture(s, projection, vestEvents, totalRemaining, extras);

  assert.strictEqual(result.msftVesting.length, VEST_SHARES.length,
    `msftVesting should have ${VEST_SHARES.length} events, got ${result.msftVesting.length}`);
  // Each event should have label, shares, gross, net, monthlySmoothed
  for (const v of result.msftVesting) {
    assert.ok('label' in v, 'vesting event missing label');
    assert.ok('shares' in v, 'vesting event missing shares');
    assert.ok('gross' in v, 'vesting event missing gross');
    assert.ok('net' in v, 'vesting event missing net');
    assert.ok('monthlySmoothed' in v, 'vesting event missing monthlySmoothed');
    assert.strictEqual(typeof v.net, 'number', 'vesting net should be a number');
    assert.strictEqual(v.monthlySmoothed, Math.round(v.net / 3),
      'monthlySmoothed should be net / 3 rounded');
  }
});

console.log('\n=== exportModelData — state sensitivity ===');

test('8. Different sarahRate produces different income values', () => {
  const { s: s1, projection: p1, vestEvents: v1, totalRemaining: tr1, extras: e1 } = buildDefaultInputs();
  const result1 = callExportAndCapture(s1, p1, v1, tr1, e1);

  const { s: s2, projection: p2, vestEvents: v2, totalRemaining: tr2, extras: e2 } =
    buildDefaultInputs({ sarahRate: 300 });
  const result2 = callExportAndCapture(s2, p2, v2, tr2, e2);

  assert.notStrictEqual(result1.income.sarah.rate, result2.income.sarah.rate,
    'sarah rate should differ between exports');
  assert.strictEqual(result2.income.sarah.rate, 300, 'sarahRate should be 300 in override');
  assert.notStrictEqual(result1.income.totalMonthly, result2.income.totalMonthly,
    'totalMonthly should change when sarahRate changes');
});

console.log('\n=== exportModelData — edge cases ===');

test('9. Handles zero/default values gracefully', () => {
  const { s, projection, vestEvents, totalRemaining, extras } = buildDefaultInputs({
    startingSavings: 0,
    debtCC: 0,
    debtPersonal: 0,
    debtIRS: 0,
    debtFirstmark: 0,
    chadConsulting: 0,
    trustIncomeNow: 0,
    trustIncomeFuture: 0,
  });
  const result = callExportAndCapture(s, projection, vestEvents, totalRemaining, extras);

  assert.strictEqual(result.savings.starting, 0, 'starting savings should be 0');
  assert.strictEqual(result.debt.totalRetired, 0, 'totalRetired should be 0 when all debts are 0');
  assert.strictEqual(result.income.trustLLC.currentMonthly, 0, 'trust current should be 0');
  assert.strictEqual(result.income.consulting.monthly, 0, 'consulting should be 0');
  // Still produces valid trajectory
  assert.ok(result.trajectory.length > 0, 'trajectory should still have rows');
});

test('10. _meta.exportedAt is a valid ISO date string', () => {
  const { s, projection, vestEvents, totalRemaining, extras } = buildDefaultInputs();
  const result = callExportAndCapture(s, projection, vestEvents, totalRemaining, extras);

  assert.ok(result._meta.exportedAt, '_meta.exportedAt should be present');
  const parsed = new Date(result._meta.exportedAt);
  assert.ok(!isNaN(parsed.getTime()), '_meta.exportedAt should be a valid ISO date');
  assert.ok(result._meta.model.includes('Dellinger'), '_meta.model should mention Dellinger');
});

// ════════════════════════════════════════════════════════════════════════
// Summary
// ════════════════════════════════════════════════════════════════════════

console.log(`\n${'='.repeat(50)}`);
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log('='.repeat(50));
if (failed > 0) process.exit(1);
