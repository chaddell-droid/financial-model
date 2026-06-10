/**
 * Kids-age-out display parity tests (remediation 2026-06-09 D6a).
 *
 * Since FIX #8 the SSDI benefit path is CALENDAR-ANCHORED to
 * TWINS_AGE_OUT_MONTH — the legacy `kidsAgeOutMonths` slider had zero effect
 * on the monthly benefit across its whole 24–48 range. The slider is replaced
 * by a read-only calendar-derived display; these tests lock:
 *   1. engine invariance of ssBenefit across the old slider range,
 *   2. the family-rate window derivation the UI now displays
 *      (max(0, TWINS_AGE_OUT_MONTH − approvalMonth)),
 *   3. the calendar label for TWINS_AGE_OUT_MONTH,
 *   4. that kidsAgeOutMonths is STILL consumed by auxiliary back-pay
 *      (so the field must be kept even though the slider is gone).
 *
 * Run: node src/model/__tests__/kidsAgeOutDisplay.test.js
 */

import assert from 'node:assert';
import { gatherStateWithOverrides } from '../../state/gatherState.js';
import { runMonthlySimulation, SS_INTERIM_TAX_HAIRCUT } from '../projection.js';
import { TWINS_AGE_OUT_MONTH, SS_CHILD_BENEFIT_END_MONTH, SSDI_ATTORNEY_FEE_CAP } from '../constants.js';
import { getMonthLabel } from '../checkIn.js';

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

console.log('\n=== D6a — kids-age-out: engine invariance + display derivation ===');

test('ssBenefit series is identical across the old slider range 24/36/48 (zero engine effect)', () => {
  // ssdiBackPayMonths: 0 isolates the BENEFIT path (kidsAgeOutMonths still
  // legitimately bounds auxiliary back-pay months — tested separately below).
  const series = [24, 36, 48].map((months) => {
    const s = gatherStateWithOverrides({ kidsAgeOutMonths: months, ssdiBackPayMonths: 0 });
    return runMonthlySimulation(s).monthlyData.map((d) => d.ssBenefit);
  });
  assert.deepStrictEqual(series[0], series[1], '24 vs 36 must match');
  assert.deepStrictEqual(series[1], series[2], '36 vs 48 must match');
});

test('family-rate window equals max(0, SS_CHILD_BENEFIT_END_MONTH − approvalMonth) — UI derivation parity', () => {
  // B4 (2026-06-10): the SS/SSDI child-benefit window is anchored to the
  // student-rule end month (HS graduation), not the 18th birthday.
  for (const approval of [0, 7, 20, 45]) {
    // A2 (2026-06-10): expenseInflation off so ssBenefit === the flat family
    // rate is an exact filter (COLA behavior is locked in ssCola.test.js).
    const s = gatherStateWithOverrides({ ssdiApprovalMonth: approval, ssdiBackPayMonths: 0, expenseInflation: false });
    const { monthlyData } = runMonthlySimulation(s);
    // Family rate (6321) is distinct from the personal rate (4214) in the
    // default state, so counting family-total months is unambiguous.
    assert.notStrictEqual(s.ssdiFamilyTotal, s.ssdiPersonal);
    // A1 (2026-06-10): filter on the GROSS row field — net cash carries the
    // interim taxability haircut (locked in ssTaxHaircut.test.js).
    const familyMonths = monthlyData.filter((d) => d.ssBenefitGross === s.ssdiFamilyTotal).length;
    const expected = Math.max(0, SS_CHILD_BENEFIT_END_MONTH - approval);
    assert.strictEqual(familyMonths, expected,
      `approval ${approval}: family-rate months ${familyMonths} ≠ derived ${expected}`);
  }
});

test('child-benefit end constants: student rule m=40 (July 2029); CTC anchor stays m=34 (January 2029)', () => {
  assert.strictEqual(TWINS_AGE_OUT_MONTH, 34);
  assert.strictEqual(getMonthLabel(TWINS_AGE_OUT_MONTH), 'January 2029');
  // B4: SS/SSDI child benefits run through HS graduation (June 2029, m=39).
  assert.strictEqual(SS_CHILD_BENEFIT_END_MONTH, 40);
  assert.strictEqual(getMonthLabel(SS_CHILD_BENEFIT_END_MONTH), 'July 2029');
});

test('kidsAgeOutMonths still bounds auxiliary back-pay (field must be kept)', () => {
  const base = { ssdiBackPayMonths: 18, ssdiApprovalMonth: 7 };
  const withAux = runMonthlySimulation(gatherStateWithOverrides({ ...base, kidsAgeOutMonths: 36 }));
  const noAux = runMonthlySimulation(gatherStateWithOverrides({ ...base, kidsAgeOutMonths: 0 }));
  // Exact mirror of projection.js back-pay math (defaults: personal 4214, family 6321).
  // A1 (2026-06-10): adult back pay also carries the interim 18.7% tax haircut.
  const adultGross = 18 * 4214;
  const fee = Math.min(Math.round(adultGross * 0.25), SSDI_ATTORNEY_FEE_CAP);
  const tax = Math.round(adultGross * SS_INTERIM_TAX_HAIRCUT);
  assert.strictEqual(noAux.backPayActual, adultGross - fee - tax);
  assert.strictEqual(withAux.backPayActual, adultGross + 18 * (6321 - 4214) - fee - tax);
  assert.ok(withAux.backPayActual > noAux.backPayActual, 'aux back-pay must respond to the field');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
