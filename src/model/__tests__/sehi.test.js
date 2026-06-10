/**
 * 6.1 (remediation 2026-06-10, improvement a-2): self-employed health
 * insurance deduction (IRC §162(l)).
 *
 * The family pays the private premium (chadJobHealthSavings $/mo — the SAME
 * field the engine uses as the employer-coverage expense offset, one source
 * of truth) in every month WITHOUT employer coverage. Those premiums are
 * deductible above the line against Sarah's Sch C:
 *   sehi = min(premiums, schCNet − ½SE tax − solo 401(k))
 * and the deduction also comes OUT of the QBI base (§199A(c)(4)(C)) and out
 * of the provisional-income "other AGI" (it is an above-the-line deduction).
 * Months WITH employer coverage (chadJob active, m >= chadJobStartMonth) are
 * disallowed — §162(l)(2)(B) bars the deduction for months the taxpayer is
 * eligible for an employer-subsidized plan.
 *
 * Run: node src/model/__tests__/sehi.test.js
 */

import assert from 'node:assert';
import { calculateTax, computeSelfEmploymentTax } from '../taxEngine.js';
import { buildTaxSchedule } from '../taxProjection.js';
import { gatherStateWithOverrides } from '../../state/gatherState.js';

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

console.log('\n=== 6.1 — SEHI in calculateTax ===');

test('default: no sehiPremiums input → sehi 0, AGI unchanged vs legacy', () => {
  const r = calculateTax({ schCNet: 150000 });
  assert.strictEqual(r.sehi, 0, 'sehi defaults to 0');
  const { halfSeTax } = computeSelfEmploymentTax(150000);
  assert.strictEqual(r.agi, 150000 - halfSeTax, 'AGI without SEHI = schC − ½SE');
});

test('premiums below the earned-income cap deduct in full (above the line)', () => {
  const base = calculateTax({ schCNet: 150000 });
  const r = calculateTax({ schCNet: 150000, sehiPremiums: 50400 });
  assert.strictEqual(r.sehi, 50400, 'full premiums deductible');
  assert.strictEqual(r.agi, base.agi - 50400, 'AGI drops by the full SEHI');
  assert.ok(r.totalTax < base.totalTax, 'tax falls when SEHI applies');
});

test('SEHI is capped at schCNet − ½SE − solo401k (§162(l)(2)(A))', () => {
  const schCNet = 40000;
  const { halfSeTax } = computeSelfEmploymentTax(schCNet);
  const solo401k = 10000;
  const cap = schCNet - halfSeTax - solo401k;
  const r = calculateTax({ schCNet, solo401kContribution: solo401k, sehiPremiums: 50400 });
  assert.strictEqual(r.sehi, Math.max(0, Math.round(cap)), `sehi capped at ${cap}`);
});

test('SEHI never goes negative when schCNet is 0 (W-2-only counterfactual)', () => {
  const r = calculateTax({ w2Wages: 200000, schCNet: 0, sehiPremiums: 50400 });
  assert.strictEqual(r.sehi, 0, 'no SE earned income → no SEHI');
});

test('SEHI comes out of the QBI base (§199A(c)(4)(C))', () => {
  // Add W-2 wages so the §199A(a)(2) overall cap (20% of taxable income)
  // does not bind, and keep total taxable income below the phase-out band —
  // then QBI = 20% × the SEHI-reduced base exactly.
  const schCNet = 150000;
  const { halfSeTax } = computeSelfEmploymentTax(schCNet);
  const r = calculateTax({ w2Wages: 100000, schCNet, sehiPremiums: 50400 });
  const expectedQbiBase = schCNet - halfSeTax - 50400;
  const expectedQbi = expectedQbiBase * 0.2;
  assert.ok(Math.abs(r.qbi - expectedQbi) < 1.5,
    `QBI ${r.qbi} should be 20% of SEHI-reduced base ${expectedQbiBase} (= ${expectedQbi})`);
});

test('SEHI reduces provisional-income other AGI (SS taxability)', () => {
  // Pick income low enough that provisional sits between the tiers, so the
  // taxable SS amount is sensitive to otherAGI.
  const base = calculateTax({ schCNet: 40000, ssBenefitAnnual: 30000 });
  const r = calculateTax({ schCNet: 40000, ssBenefitAnnual: 30000, sehiPremiums: 20000 });
  assert.ok(r.ssTaxableIncome < base.ssTaxableIncome,
    `taxable SS should fall when SEHI reduces other AGI (${r.ssTaxableIncome} vs ${base.ssTaxableIncome})`);
});

console.log('\n=== 6.1 — SEHI in buildTaxSchedule (coverage months) ===');

test('default household (no job): 12 months of premiums deduct every full year', () => {
  const s = gatherStateWithOverrides({});
  const sched = buildTaxSchedule(s);
  const y0 = sched[0];
  // Premium = chadJobHealthSavings ($4,200/mo default) × 12 = $50,400/yr.
  assert.strictEqual(y0.sehiPremiums, 50400, 'year-0 eligible premiums');
  assert.strictEqual(y0.fullTax.sehi, 50400, 'fully deductible (cap not binding at default Sch C)');
});

test('chadJob from month 0: SEHI zeroed in every covered year', () => {
  const s = gatherStateWithOverrides({ chadJob: true, chadJobStartMonth: 0, chadJobSalary: 150000 });
  const sched = buildTaxSchedule(s);
  for (let y = 0; y < sched.length; y++) {
    assert.strictEqual(sched[y].sehiPremiums, 0, `year ${y}: employer coverage → no eligible premiums`);
    assert.strictEqual(sched[y].fullTax.sehi, 0, `year ${y}: sehi 0`);
  }
});

test('mid-year job start: only pre-coverage months carry premiums', () => {
  // Job starts projection month 6 → year 0 has 6 non-coverage months (m=0..5).
  const s = gatherStateWithOverrides({ chadJob: true, chadJobStartMonth: 6, chadJobSalary: 150000 });
  const sched = buildTaxSchedule(s);
  assert.strictEqual(sched[0].sehiPremiums, 6 * 4200, 'year 0: 6 uncovered months');
  assert.strictEqual(sched[1].sehiPremiums, 0, 'year 1: fully covered');
});

test('premium derives from chadJobHealthSavings (one source of truth)', () => {
  const s = gatherStateWithOverrides({ chadJobHealthSavings: 3000 });
  const sched = buildTaxSchedule(s);
  assert.strictEqual(sched[0].sehiPremiums, 36000, '12 × $3,000');
});

test('SEHI lowers the default household year-0 tax (~$11–12k of relief)', () => {
  const s = gatherStateWithOverrides({});
  const y0 = buildTaxSchedule(s)[0];
  // Pre-SEHI lock was annualTotalTax = 94,704 (see __snapshots__.test.js).
  const relief = 94704 - Math.round(y0.annualTotalTax);
  assert.ok(relief >= 9000 && relief <= 15000,
    `year-0 relief should be ~$11–12k, got ${relief} (annualTotalTax ${Math.round(y0.annualTotalTax)})`);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
