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
import { runMonthlySimulation } from '../projection.js';
import { TWINS_AGE_OUT_MONTH, SSDI_ATTORNEY_FEE_CAP } from '../constants.js';
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

test('family-rate window equals max(0, TWINS_AGE_OUT_MONTH − approvalMonth) — UI derivation parity', () => {
  for (const approval of [0, 7, 20, 40]) {
    const s = gatherStateWithOverrides({ ssdiApprovalMonth: approval, ssdiBackPayMonths: 0 });
    const { monthlyData } = runMonthlySimulation(s);
    // Family rate (6321) is distinct from the personal rate (4214) in the
    // default state, so counting family-total months is unambiguous.
    assert.notStrictEqual(s.ssdiFamilyTotal, s.ssdiPersonal);
    const familyMonths = monthlyData.filter((d) => d.ssBenefit === s.ssdiFamilyTotal).length;
    const expected = Math.max(0, TWINS_AGE_OUT_MONTH - approval);
    assert.strictEqual(familyMonths, expected,
      `approval ${approval}: family-rate months ${familyMonths} ≠ derived ${expected}`);
  }
});

test('TWINS_AGE_OUT_MONTH calendar label is January 2029 (read-only display copy)', () => {
  assert.strictEqual(TWINS_AGE_OUT_MONTH, 34);
  assert.strictEqual(getMonthLabel(TWINS_AGE_OUT_MONTH), 'January 2029');
});

test('kidsAgeOutMonths still bounds auxiliary back-pay (field must be kept)', () => {
  const base = { ssdiBackPayMonths: 18, ssdiApprovalMonth: 7 };
  const withAux = runMonthlySimulation(gatherStateWithOverrides({ ...base, kidsAgeOutMonths: 36 }));
  const noAux = runMonthlySimulation(gatherStateWithOverrides({ ...base, kidsAgeOutMonths: 0 }));
  // Exact mirror of projection.js back-pay math (defaults: personal 4214, family 6321).
  const adultGross = 18 * 4214;
  const fee = Math.min(Math.round(adultGross * 0.25), SSDI_ATTORNEY_FEE_CAP);
  assert.strictEqual(noAux.backPayActual, adultGross - fee);
  assert.strictEqual(withAux.backPayActual, adultGross + 18 * (6321 - 4214) - fee);
  assert.ok(withAux.backPayActual > noAux.backPayActual, 'aux back-pay must respond to the field');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
