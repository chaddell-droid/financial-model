/**
 * Phase 4 tax-engine accuracy regression tests (remediation plan 2026-06-09).
 *
 * Run with:
 *   node src/model/__tests__/taxPhase4.test.js
 *
 * Covers:
 *   P4-CTC   — CTC $2,200/child + 5%-over-$400K-MAGI phase-out
 *   P4-AM    — Additional Medicare: full liability in totalTax; withheld 0.9%
 *              is a PREPAYMENT in balance, not a reduction of liability
 *   P4-PI    — Provisional income subtracts halfSeTax + effective401k
 *   P4-QBI   — QBI base = max(0, schCNet − halfSeTax − effective401k)
 *   P4-SALT  — SALT cap: no inflation double-count; 2026 default cap
 *   P4-401K  — Solo 401(k) 2026 limits ($24,500 / $72,000)
 *   P4-SSEST — estimateAnnualSSBenefits parity with projection.js monthly loop
 */
import assert from 'node:assert';
import {
  calculateTax,
  computeSSTaxableAmount,
  computeItemizedDeductions,
  computeMax401k,
  computeAdditionalMedicare,
} from '../taxEngine.js';
import { buildTaxSchedule, estimateAnnualSSBenefits } from '../taxProjection.js';
import { getSaltCapForYear, CTC_AMOUNT, SOLO_401K_EMPLOYEE_LIMIT, SOLO_401K_TOTAL_LIMIT, SALT_CAP } from '../taxConstants.js';
import { runMonthlySimulation } from '../projection.js';
import { gatherStateWithOverrides } from '../../state/gatherState.js';
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
// P4-CTC — Child Tax Credit: $2,200/child with $400K MAGI phase-out
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== P4-CTC: $2,200 CTC + 5%-over-$400K phase-out ===');

test('P4-CTC-1. CTC_AMOUNT constant is 2200 (2026 OBBBA)', () => {
  assert.strictEqual(CTC_AMOUNT, 2200);
});

test('P4-CTC-2. mid-income year: 2 kids → $4,400 total credits', () => {
  // W-2 only, AGI = $200K, well under the $400K phase-out threshold.
  const r = calculateTax({ w2Wages: 200000, ctcChildren: 2 });
  assert.strictEqual(r.totalCredits, 4400, `expected $4,400 for 2 kids, got ${r.totalCredits}`);
});

test('P4-CTC-3. MAGI $440K → credit reduced by $2,000 (5% of $40K excess)', () => {
  // W-2 only with no SE/401k/SS → AGI = w2Wages exactly.
  const r = calculateTax({ w2Wages: 440000, ctcChildren: 2 });
  assert.strictEqual(r.agi, 440000, `AGI should equal W-2 wages, got ${r.agi}`);
  assert.strictEqual(r.totalCredits, 2400, `expected 4400 − 2000 = 2400, got ${r.totalCredits}`);
});

test('P4-CTC-4. MAGI $500K → credit fully phased out (floor at 0)', () => {
  const r = calculateTax({ w2Wages: 500000, ctcChildren: 2 });
  assert.strictEqual(r.totalCredits, 0, `expected fully phased-out credit, got ${r.totalCredits}`);
});

test('P4-CTC-5. fraction of $1,000 over threshold rounds UP ($50 step)', () => {
  // $400,500 MAGI → excess $500 → one $1,000 step → $50 reduction.
  const r = calculateTax({ w2Wages: 400500, ctcChildren: 2 });
  assert.strictEqual(r.totalCredits, 4350, `expected 4400 − 50 = 4350, got ${r.totalCredits}`);
});

test('P4-CTC-6. buildTaxSchedule mid-income year applies $4,400 for 2 kids', () => {
  const s = gatherStateWithOverrides({
    chadJob: true, chadJobSalary: 150000, chadJobStartMonth: 0,
    chadJobStockRefresh: 0, chadJobBonusPct: 0,
    sarahCurrentClients: 0, sarahMaxClients: 0,
    ssType: 'ss', ssClaimAge: 70, // ssStartMonth 115 — outside horizon
    taxCtcChildren: 2,
  });
  const yr0 = buildTaxSchedule(s)[0];
  assert.strictEqual(yr0.fullTax.totalCredits, 4400,
    `expected $4,400 credits in year 0, got ${yr0.fullTax.totalCredits}`);
});

test('P4-CTC-7. flatCredits override bypasses the phase-out (simplified mode contract)', () => {
  const r = calculateTax({ w2Wages: 500000, flatCredits: 4000 });
  assert.strictEqual(r.totalCredits, 4000);
});

// ════════════════════════════════════════════════════════════════════════
// P4-AM — Additional Medicare: full liability in totalTax, withheld = prepayment
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== P4-AM: Additional Medicare liability vs prepayment ===');

test('P4-AM-1. totalTax includes the FULL additional-Medicare liability', () => {
  const r = calculateTax({ w2Wages: 300000, schCNet: 100000 });
  const expectedLiability = (300000 + 100000 * 0.9235 - 250000) * 0.009;
  near(r.addlMedicare, expectedLiability, 1, 'full liability returned');
  const expectedTotal = Math.max(0, r.fedTax - r.totalCredits) + r.seTax + r.addlMedicare + r.w2FicaTax;
  near(r.totalTax, expectedTotal, 0.01, 'totalTax includes full liability, not the net-of-withholding amount');
});

test('P4-AM-2. withheld 0.9% is credited as a prepayment in balance', () => {
  const r = calculateTax({ w2Wages: 300000, schCNet: 100000, w2Withholding: 60000 });
  near(r.addlMedicareWithheld, (300000 - 200000) * 0.009, 0.01, 'withheld = (W2 − 200K) × 0.9%');
  near(r.balance, 60000 + r.addlMedicareWithheld - r.totalTax, 0.01,
    'balance = withholding + addl-Medicare prepayment − totalTax');
});

test('P4-AM-3. withholding never changes the liability itself', () => {
  // Same income, different W-2 withholding → identical totalTax.
  const a = calculateTax({ w2Wages: 300000, schCNet: 100000, w2Withholding: 0 });
  const b = calculateTax({ w2Wages: 300000, schCNet: 100000, w2Withholding: 50000 });
  assert.strictEqual(a.totalTax, b.totalTax, 'totalTax must not depend on withholding');
  near(b.balance - a.balance, 50000, 0.01, 'balance shifts by exactly the withholding delta');
});

test('P4-AM-4. mirrors taxProjection: liability = computeAdditionalMedicare().addlMedicare', () => {
  const r = calculateTax({ w2Wages: 400000 });
  const aml = computeAdditionalMedicare({ w2Wages: 400000, seBase: 0 });
  near(r.addlMedicare, aml.addlMedicare, 0.01, 'engine liability matches the helper gross amount');
  near(r.addlMedicareOwed, aml.addlMedicareOwed, 0.01, 'net "owed at filing" still exposed for display');
});

// ════════════════════════════════════════════════════════════════════════
// P4-PI — Provisional income: otherAGI net of halfSeTax + effective401k
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== P4-PI: provisional income on a combined Sch C + SS year ===');

test('P4-PI-1. otherAGI subtracts halfSeTax and effective 401(k)', () => {
  const r = calculateTax({ schCNet: 60000, ssBenefitAnnual: 30000, solo401kContribution: 10000 });
  const otherAGI = 60000 - r.halfSeTax - 10000;
  const expected = computeSSTaxableAmount(30000, otherAGI);
  assert.strictEqual(r.ssTaxableIncome, expected,
    `ssTaxableIncome should use net otherAGI: expected ${expected}, got ${r.ssTaxableIncome}`);
  // And the corrected basis must be strictly lower than the old (gross) basis here.
  const oldBasis = computeSSTaxableAmount(30000, 60000);
  assert.ok(r.ssTaxableIncome < oldBasis,
    `net basis (${r.ssTaxableIncome}) should tax less SS than gross basis (${oldBasis})`);
});

test('P4-PI-2. no SE income / no 401(k) → behavior unchanged', () => {
  const r = calculateTax({ w2Wages: 80000, ssBenefitAnnual: 50000 });
  assert.strictEqual(r.ssTaxableIncome, computeSSTaxableAmount(50000, 80000));
});

// ════════════════════════════════════════════════════════════════════════
// P4-QBI — QBI base reduced by halfSeTax + effective401k
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== P4-QBI: QBI base = max(0, schCNet − halfSeTax − 401k) ===');

test('P4-QBI-1. representative Sarah year: QBI base nets out SE-tax half + 401(k)', () => {
  // Chad W-2 keeps taxableBeforeQbi well above the QBI base so the base term binds.
  const r = calculateTax({ w2Wages: 150000, schCNet: 120000, solo401kContribution: 20000 });
  const expected = Math.max(0, 120000 - r.halfSeTax - 20000) * 0.20;
  near(r.qbi, expected, 1, 'QBI = 20% of (schCNet − halfSeTax − effective401k)');
  assert.ok(r.qbi < 120000 * 0.20, 'QBI must be below 20% of raw Sch C net');
});

test('P4-QBI-2. negative base floors at zero', () => {
  // Tiny Sch C net with a 401(k) contribution larger than the net.
  const r = calculateTax({ w2Wages: 200000, schCNet: 5000, solo401kContribution: 23500 });
  assert.strictEqual(r.qbi, 0, `expected QBI 0 when base ≤ 0, got ${r.qbi}`);
});

// ════════════════════════════════════════════════════════════════════════
// P4-SALT — no inflation double-count; 2026 default cap
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== P4-SALT: cap schedule without inflation double-count ===');

test('P4-SALT-1. engine default SALT cap is the 2026 value ($40,400)', () => {
  assert.strictEqual(SALT_CAP, 40400);
  const r = computeItemizedDeductions({
    agi: 300000, propertyTax: 50000, salesTax: 0, personalPropTax: 0,
    mortgageInt: 0, charitable: 0, totalMedicalInput: 0,
  });
  assert.strictEqual(r.saltDeductible, 40400, `expected 2026 cap 40400, got ${r.saltDeductible}`);
});

test('P4-SALT-2. inflation-adjust ON does not inflate the statutory cap (no double-count)', () => {
  // Plain state object (taxProjection.test.js makeState pattern) — the tax*
  // fields are not yet in MODEL_KEYS, so gatherState would drop the overrides.
  const s = {
    sarahRate: 200, sarahMaxRate: 250, sarahRateGrowth: 5,
    sarahCurrentClients: 4, sarahMaxClients: 4.5, sarahClientGrowth: 10,
    sarahWorkMonths: 72, totalProjectionMonths: 72, chadRetirementMonth: 72,
    chadJob: false,
    ssType: 'ss', ssStartMonth: 999, // SS outside horizon
    taxSchCExpenseRatio: 25,
    taxInflationAdjust: true, taxInflationRate: 10,
    taxPropertyTax: 50000, taxSalesTax: 0, taxPersonalPropTax: 0,
    taxMortgageInt: 0, taxCharitable: 0, taxMedical: 0,
    taxW2Withholding: 0, taxCtcChildren: 2, taxOdcDependents: 0,
    taxCapGainLoss: -3000, taxSolo401k: 0,
  };
  const sched = buildTaxSchedule(s);
  // Year 3 → calendar 2029 → statutory cap $41,624. Inflated property tax
  // (50000 × 1.1^3 ≈ 66,550) exceeds it, so the deductible IS the cap.
  const yr3 = sched[3].fullTax;
  assert.ok(yr3.agi < 500000, `test setup: AGI must stay under SALT phase-down (got ${yr3.agi})`);
  assert.strictEqual(yr3.saltDeductible, getSaltCapForYear(2029),
    `expected statutory 2029 cap ${getSaltCapForYear(2029)}, got ${yr3.saltDeductible}`);
});

// ════════════════════════════════════════════════════════════════════════
// P4-401K — Solo 401(k) 2026 limits
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== P4-401K: 2026 Solo 401(k) limits ===');

test('P4-401K-1. employee deferral limit = $24,500 (2026)', () => {
  assert.strictEqual(SOLO_401K_EMPLOYEE_LIMIT, 24500);
  assert.strictEqual(computeMax401k(0, 0).totalMax, 24500);
});

test('P4-401K-2. total DC limit = $72,000 (2026)', () => {
  assert.strictEqual(SOLO_401K_TOTAL_LIMIT, 72000);
  assert.strictEqual(computeMax401k(500000, 5000).totalMax, 72000);
});

test('P4-401K-3. typical Sarah year: employee + 20% SE employer rate under the cap', () => {
  // C2 (remediation 2026-06-10): self-employed employer rate = 0.25/1.25 = 20%.
  const max = computeMax401k(101816, 1363);
  assert.strictEqual(max.employeeMax, 24500);
  assert.strictEqual(max.employerMax, Math.round((101816 - 1363) * 0.20));
  assert.strictEqual(max.totalMax, max.employeeMax + max.employerMax);
});

// ════════════════════════════════════════════════════════════════════════
// P4-SSEST — estimateAnnualSSBenefits parity with projection.js
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== P4-SSEST: estimator parity with projection.js monthly loop ===');

/** Sum projection.js ssBenefit per projection-year bucket (+ SSDI back-pay). */
function yearlyBenefitsFromProjection(s) {
  // A1 (2026-06-10): the tax estimate works on GROSS SSA amounts (what lands
  // on the SSA-1099), so parity sums ssBenefitGross and adds the tax haircut
  // back to the engine's net back-pay deposit (gross-of-tax, net-of-fee).
  const { monthlyData, backPayActual, backPayTax } = runMonthlySimulation(s);
  const months = s.totalProjectionMonths || 72;
  const years = Math.ceil((months + 1) / 12);
  const yearly = new Array(years).fill(0);
  for (const row of monthlyData) yearly[Math.floor(row.month / 12)] += row.ssBenefitGross;
  if (backPayActual > 0) {
    const receiptMonth = (s.ssdiApprovalMonth ?? 7) + 2;
    const idx = Math.floor(receiptMonth / 12);
    if (idx >= 0 && idx < years) yearly[idx] += backPayActual + backPayTax;
  }
  return yearly;
}

function assertParity(s, label) {
  const expected = yearlyBenefitsFromProjection(s);
  const est = estimateAnnualSSBenefits(s);
  assert.strictEqual(est.length, expected.length,
    `${label}: estimator years ${est.length} != projection years ${expected.length}`);
  est.forEach((v, y) => {
    assert.strictEqual(v, expected[y], `${label}: year ${y} estimator ${v} != projection ${expected[y]}`);
  });
}

test('P4-SSEST-1. SSDI scenario (calendar-anchored kids step-down + back-pay year)', () => {
  const s = gatherStateWithOverrides({
    ssType: 'ssdi', ssdiDenied: false, ssdiApprovalMonth: 7,
    ssdiPersonal: 4214, ssdiFamilyTotal: 6321, ssdiBackPayMonths: 18,
    chadJob: false, chadConsulting: 0,
  });
  assertParity(s, 'SSDI');
});

test('P4-SSEST-2. SS retirement scenario (claim at 62, family window)', () => {
  const s = gatherStateWithOverrides({
    ssType: 'ss', ssClaimAge: 62, ssPIA: 4214,
    chadJob: false, chadConsulting: 0,
  });
  assertParity(s, 'SS@62');
});

test('P4-SSEST-3. post-job SS retirement branch (age-gated anchor)', () => {
  const s = gatherStateWithOverrides({
    ssType: 'ssdi', chadJob: true, chadJobStartMonth: 0, chadWorkMonths: 36,
    chadJobSalary: 150000, chadJobStockRefresh: 0, chadJobBonusPct: 0,
    postJobBenefit: 'ssRetirement', ssClaimAge: 62, ssPIA: 4214,
    ssdiBackPayMonths: 0,
  });
  const est = estimateAnnualSSBenefits(s);
  assert.ok(est.some(v => v > 0), 'post-job SS retirement benefits must appear in the estimate');
  assertParity(s, 'postJob-ssRetirement');
});

test('P4-SSEST-4. post-job SSDI branch (TWINS_AGE_OUT_MONTH step-down)', () => {
  const s = gatherStateWithOverrides({
    ssType: 'ssdi', chadJob: true, chadJobStartMonth: 0, chadWorkMonths: 24,
    chadJobSalary: 150000, chadJobStockRefresh: 0, chadJobBonusPct: 0,
    postJobBenefit: 'ssdi', ssdiPersonal: 4214, ssdiFamilyTotal: 6321,
    ssdiBackPayMonths: 0,
  });
  // Months 25..33 family, 34+ personal — exercises the calendar-anchored step-down.
  assert.ok(TWINS_AGE_OUT_MONTH > 25, 'test setup: step-down must fall inside the post-job window');
  const est = estimateAnnualSSBenefits(s);
  assert.ok(est.some(v => v > 0), 'post-job SSDI benefits must appear in the estimate');
  assertParity(s, 'postJob-ssdi');
});

test('P4-SSEST-5. horizon covers the final projection month (ceil((months+1)/12))', () => {
  const s = gatherStateWithOverrides({
    ssType: 'ssdi', ssdiDenied: false, ssdiApprovalMonth: 7,
    ssdiPersonal: 4214, ssdiFamilyTotal: 6321, ssdiBackPayMonths: 0,
    chadJob: false, chadConsulting: 0,
    expenseInflation: false, // A2 (2026-06-10): isolate the horizon check from SS COLA
  });
  const months = s.totalProjectionMonths || 72;
  const est = estimateAnnualSSBenefits(s);
  assert.strictEqual(est.length, Math.ceil((months + 1) / 12),
    'estimator length must match buildTaxSchedule horizon');
  // Month 72 (year index 6) pays the personal benefit — previously dropped.
  assert.strictEqual(est[6], 4214, `final partial year should hold month-72 benefit, got ${est[6]}`);
});

test('P4-SSEST-6. defaults mirror projection.js (ssFamilyTotal 7099 / ssPersonal 2933)', () => {
  // Bare state: projection.js falls back to 7099/2933 — the estimator must too.
  const est = estimateAnnualSSBenefits({ ssType: 'ss' });
  // ssStart defaults to 18, family window 18 months → year 1 (m12-23) = 6 family months.
  assert.strictEqual(est[1], 6 * 7099, `expected 6 × 7099 family months in year 1, got ${est[1]}`);
});

// ════════════════════════════════════════════════════════════════════════
// Summary
// ════════════════════════════════════════════════════════════════════════
console.log(`\n${'='.repeat(50)}`);
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'='.repeat(50)}\n`);

if (failed > 0) process.exit(1);
