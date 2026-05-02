/**
 * Tax-engine fix tests (FIX #1, #2, #3, #4, #M3).
 *
 * Run with:
 *   node src/model/__tests__/taxFixes.test.js
 *
 * These tests cover the high-severity tax fixes:
 *   TX1 — NoFICA reduces tax owed by ~6.2% × wage base
 *   TX2 — Pension contribution reduces taxable W-2 wages
 *   TX3 — 2026 STD_DED is applied (post-OBBBA, Rev. Proc. 2025-32)
 *   TX4 — SSDI back-pay is taxed in the approval year
 *   TX5 — CTC drops when twins age out (TWINS_AGE_OUT_MONTH)
 */
import assert from 'node:assert';
import { buildTaxSchedule } from '../taxProjection.js';
import {
  calculateTax,
  computeSelfEmploymentTax,
  computeW2EmployeeFica,
} from '../taxEngine.js';
import { gatherStateWithOverrides } from '../../state/gatherState.js';
import { STD_DED, SS_WAGE_BASE, BRACKETS_MFJ_2026, QBI_PHASE_OUT } from '../taxConstants.js';
import { TWINS_AGE_OUT_MONTH } from '../constants.js';

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

function near(actual, expected, tolerance, label) {
  const diff = Math.abs(actual - expected);
  if (diff > tolerance) {
    throw new Error(
      `${label || 'near'}: expected ~${expected} (+/-${tolerance}), got ${actual} (diff ${diff})`
    );
  }
}

// ════════════════════════════════════════════════════════════════════════
// Constants sanity (FIX #2, #3)
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Tax constants — 2026 values ===');

test('Constants. SS_WAGE_BASE = 184500 (2026 SSA value)', () => {
  assert.strictEqual(SS_WAGE_BASE, 184500);
});

test('Constants. STD_DED = 32200 (2026 MFJ, Rev. Proc. 2025-32)', () => {
  assert.strictEqual(STD_DED, 32200);
});

test('Constants. QBI MFJ phase-in threshold = 403500', () => {
  assert.strictEqual(QBI_PHASE_OUT, 403500);
});

test('Constants. 2026 MFJ brackets begin with 24800 @ 10%', () => {
  assert.deepStrictEqual(BRACKETS_MFJ_2026[0], [24800, 0.10]);
  assert.deepStrictEqual(BRACKETS_MFJ_2026[1], [100800, 0.12]);
});

// ════════════════════════════════════════════════════════════════════════
// FIX #1 — NoFICA + pension contribution
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== FIX #1: NoFICA + pension reduces W-2 tax ===');

test('TX1a. computeW2EmployeeFica zeroes SS portion when noFICA=true', () => {
  const r = computeW2EmployeeFica(100000, true);
  assert.strictEqual(r.ssTax, 0, 'SS should be zero with noFICA=true');
  near(r.medTax, 100000 * 0.0145, 1, 'Medicare 1.45% should still apply');
});

test('TX1b. computeW2EmployeeFica charges normal SS+Medicare otherwise', () => {
  const r = computeW2EmployeeFica(100000, false);
  near(r.ssTax, 100000 * 0.062, 1, 'SS tax 6.2%');
  near(r.medTax, 100000 * 0.0145, 1, 'Medicare 1.45%');
});

test('TX1c. computeW2EmployeeFica caps SS at 2026 SS_WAGE_BASE (184500)', () => {
  const r = computeW2EmployeeFica(300000, false);
  near(r.ssTax, 184500 * 0.062, 1, 'SS capped at 2026 wage base');
  near(r.medTax, 300000 * 0.0145, 1, 'Medicare uncapped');
});

test('TX1d. computeSelfEmploymentTax with noFICA leaves full SS base for SE', () => {
  // W-2 = 100K, schC = 200K. With noFICA, full SS_WAGE_BASE is available for SE.
  const without = computeSelfEmploymentTax(200000, 100000, false);
  const withNoFICA = computeSelfEmploymentTax(200000, 100000, true);
  // Without noFICA, only SS_WAGE_BASE - 100K = 84500 is available for SE SS tax.
  // With noFICA, all of SE base (up to SS_WAGE_BASE) is taxable.
  assert.ok(
    withNoFICA.ssTax > without.ssTax,
    `noFICA should leave more SS base for SE: with=${withNoFICA.ssTax} without=${without.ssTax}`
  );
});

test('TX1. NoFICA reduces total tax by ~6.2% × wage-base-capped salary ($100K)', () => {
  // Setup: Chad earns $100K W-2 only (no SchC, no benefits, no deductions to itemize).
  // Year 1 with noFICA=false vs noFICA=true.
  const baseOverrides = {
    chadJob: true,
    chadJobSalary: 100000,
    chadJobStartMonth: 0,
    chadJobBonusPct: 0,
    chadJobStockRefresh: 0,
    chadJobHireStockY1: 0, chadJobHireStockY2: 0, chadJobHireStockY3: 0, chadJobHireStockY4: 0,
    chadJobSignOnCash: 0,
    chadJobPensionContrib: 0,
    // Sarah dormant so we isolate Chad's W-2
    sarahCurrentClients: 0, sarahMaxClients: 0,
    // No SS benefits / SSDI to isolate
    ssType: 'ss', ssStartMonth: 999,
  };
  const sNo = gatherStateWithOverrides({ ...baseOverrides, chadJobNoFICA: false });
  const sYes = gatherStateWithOverrides({ ...baseOverrides, chadJobNoFICA: true });
  const noFicaSchedule = buildTaxSchedule(sYes);
  const ficaSchedule = buildTaxSchedule(sNo);
  const delta = ficaSchedule[0].annualTotalTax - noFicaSchedule[0].annualTotalTax;
  // Expected: ~6.2% of W-2 (employee SS portion suppressed). Since 100K < SS_WAGE_BASE,
  // delta should be ~ 100K × 6.2% = $6,200.
  near(delta, 6200, 50, `expected ~$6,200 reduction with noFICA, got delta=${delta}`);
});

// ════════════════════════════════════════════════════════════════════════
// FIX #1 (cont.) — Pension contribution
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== FIX #1: Pension contribution reduces W-2 wages ===');

test('TX2. Pension 10% on $100K salary reduces taxable W-2 by ~$10K', () => {
  const baseOverrides = {
    chadJob: true,
    chadJobSalary: 100000,
    chadJobStartMonth: 0,
    chadJobBonusPct: 0,
    chadJobStockRefresh: 0,
    chadJobHireStockY1: 0, chadJobHireStockY2: 0, chadJobHireStockY3: 0, chadJobHireStockY4: 0,
    chadJobSignOnCash: 0,
    chadJobNoFICA: false,
    sarahCurrentClients: 0, sarahMaxClients: 0,
    ssType: 'ss', ssStartMonth: 999,
  };
  const sNo = gatherStateWithOverrides({ ...baseOverrides, chadJobPensionContrib: 0 });
  const sYes = gatherStateWithOverrides({ ...baseOverrides, chadJobPensionContrib: 10 });
  const schedNo = buildTaxSchedule(sNo);
  const schedYes = buildTaxSchedule(sYes);
  // With 10% pension on $100K salary, taxable W-2 drops by $10K.
  near(schedYes[0].chadW2, 90000, 5, 'taxable W-2 should be ~$90K with 10% pension');
  near(schedNo[0].chadW2, 100000, 5, 'baseline W-2 should be $100K');
  // Tax should be lower with pension (less taxable income).
  assert.ok(
    schedYes[0].annualTotalTax < schedNo[0].annualTotalTax,
    `pension should reduce tax: with=${schedYes[0].annualTotalTax} without=${schedNo[0].annualTotalTax}`
  );
});

// ════════════════════════════════════════════════════════════════════════
// FIX #3 — 2026 standard deduction
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== FIX #3: 2026 standard deduction ===');

test('TX3. STD_DED of 32200 is applied when itemized < standard', () => {
  // AGI low enough that itemized doesn't beat standard, no SchC.
  const r = calculateTax({
    w2Wages: 50000,
    propertyTax: 0, salesTax: 0, personalPropTax: 0,
    mortgageInt: 0, charitable: 0, totalMedicalInput: 0,
  });
  assert.strictEqual(r.deductionUsed, 32200, 'standard deduction should be 32200 (2026 MFJ)');
  assert.strictEqual(r.usingItemized, false);
  // taxableBeforeQbi = AGI - 32200. AGI ≈ 50000 (no SchC, no SS, no halfSeTax).
  near(r.taxableBeforeQbi, 50000 - 32200, 1, 'taxable income = AGI - STD_DED');
});

// ════════════════════════════════════════════════════════════════════════
// FIX #4 — SSDI back-pay taxed in approval year
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== FIX #4: SSDI back-pay taxed in approval year ===');

test('TX4. SSDI back-pay raises taxable SS in approval year vs no-back-pay', () => {
  // Two scenarios identical except for back-pay months.
  const base = {
    ssType: 'ssdi',
    ssdiDenied: false,
    ssdiApprovalMonth: 7, // back-pay receipt at month 9 → year 0
    ssdiPersonal: 4214,
    ssdiFamilyTotal: 6321,
    kidsAgeOutMonths: 24,
    chadJob: false,
    // Provide some wage income so SS is taxable (provisional income above thresholds).
    sarahRate: 200, sarahCurrentClients: 4,
  };
  const sNoBackPay = gatherStateWithOverrides({ ...base, ssdiBackPayMonths: 0 });
  const sBackPay = gatherStateWithOverrides({ ...base, ssdiBackPayMonths: 12 });

  const schedNoBP = buildTaxSchedule(sNoBackPay);
  const schedBP = buildTaxSchedule(sBackPay);

  // Year 0 contains approvalMonth+2=9. The SS-taxable amount in year 0 should be
  // higher when back-pay is included, because the engine sees more SS benefits.
  const taxableNoBP = schedNoBP[0].fullTax.ssTaxableIncome;
  const taxableBP = schedBP[0].fullTax.ssTaxableIncome;
  assert.ok(
    taxableBP > taxableNoBP,
    `back-pay should raise SS-taxable amount in approval year: BP=${taxableBP} no-BP=${taxableNoBP}`
  );
  // Back-pay = 12 × $4,214 = $50,568 gross, minus 25% adult fee (~$12,642 capped at $9,200 cap)
  // ≈ $41,368 actual. Up to 85% taxable ⇒ at least ~$10K extra taxable income.
  assert.ok(
    taxableBP - taxableNoBP > 10000,
    `back-pay should add at least $10K to taxable SS, got ${taxableBP - taxableNoBP}`
  );
});

// ════════════════════════════════════════════════════════════════════════
// FIX #M3 — CTC drops when kids age out
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== FIX #M3: CTC drops when twins age out ===');

test('TX5. CTC drops in the year containing TWINS_AGE_OUT_MONTH', () => {
  // Use a steady-state W-2 income, no Sarah, no SS so we isolate the CTC delta.
  const overrides = {
    chadJob: true,
    chadJobSalary: 100000,
    chadJobStartMonth: 0,
    chadJobBonusPct: 0,
    chadJobStockRefresh: 0,
    chadJobHireStockY1: 0, chadJobHireStockY2: 0, chadJobHireStockY3: 0, chadJobHireStockY4: 0,
    chadJobSignOnCash: 0,
    chadJobPensionContrib: 0,
    chadJobNoFICA: false,
    chadRetirementMonth: 72,
    sarahCurrentClients: 0, sarahMaxClients: 0,
    ssType: 'ss', ssStartMonth: 999,
    taxCtcChildren: 2,
    totalProjectionMonths: 72,
  };
  const s = gatherStateWithOverrides(overrides);
  const schedule = buildTaxSchedule(s);

  // Find the year containing TWINS_AGE_OUT_MONTH (= 34 → year index 2).
  const ageOutYear = Math.floor(TWINS_AGE_OUT_MONTH / 12); // 2
  const priorYear = ageOutYear - 1;

  const ctcAgeOut = schedule[ageOutYear].ctcChildrenForYear;
  const ctcPrior = schedule[priorYear].ctcChildrenForYear;
  assert.strictEqual(ctcAgeOut, 0, 'CTC should be 0 in age-out year');
  assert.strictEqual(ctcPrior, 2, 'CTC should be 2 in prior year');

  const taxAgeOut = schedule[ageOutYear].annualTotalTax;
  const taxPrior = schedule[priorYear].annualTotalTax;
  // Each child's CTC = $2,000. With 2 kids aging out, age-out year tax should be
  // ~$4,000 higher than prior year (after dropping CTC). Allow tolerance for
  // raises/inflation moving income across the years.
  const delta = taxAgeOut - taxPrior;
  assert.ok(
    delta > 1500,
    `expected ~$2K-$4K rise from losing CTC, got delta=${delta}`
  );
});

// ════════════════════════════════════════════════════════════════════════
// Summary
// ════════════════════════════════════════════════════════════════════════
console.log(`\n${'='.repeat(50)}`);
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'='.repeat(50)}\n`);

if (failed > 0) process.exit(1);
