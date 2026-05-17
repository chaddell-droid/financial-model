/**
 * Tests for the postJobBenefit feature — controls what (if anything) Chad
 * receives after his W-2 job ends. Replaces the prior bug where the engine
 * paid the FRA SS amount immediately at retirement regardless of Chad's age.
 *
 * Run with: node src/model/__tests__/postJobBenefit.test.js
 */
import assert from 'node:assert';
import { runMonthlySimulation } from '../projection.js';
import { gatherStateWithOverrides } from '../../state/gatherState.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  PASS  ${name}`); }
  catch (err) { failed++; console.log(`  FAIL  ${name}\n        ${err.message}`); }
}

console.log('\n=== postJobBenefit feature ===');

function buildState(overrides) {
  return gatherStateWithOverrides({
    chadJob: true,
    chadJobStartMonth: 0,
    chadJobSalary: 180000,
    chadCurrentAge: 55,
    chadWorkMonths: 24,                 // Chad retires 2 years from now (at age 57)
    ssClaimAge: 67,                     // Standard FRA
    ssPIA: 4214,
    ssdiPersonal: 4214,
    ssdiFamilyTotal: 6321,
    ssType: 'ssdi',                     // Default state path that triggered the original bug
    ...overrides,
  });
}

test('PJB-1: default is ssRetirement, age-gates correctly (no payout before claim age)', () => {
  // Chad retires at month 24 (age 57). Claim age 67 = age 67. Gap is ~10 years (120 months).
  // So months 25..143 (age 57..67) should have ZERO ssBenefit. Month 144+ should pay.
  const s = buildState({});                 // postJobBenefit undefined → 'ssRetirement' default
  const { monthlyData } = runMonthlySimulation(s);
  // Just after retirement at month 30 — should NOT pay
  assert.strictEqual(monthlyData[30].ssBenefit, 0,
    `Expected 0 at month 30 (age 57.5, well below claim age 67), got ${monthlyData[30].ssBenefit}`);
  // Sample at age 65 (month 120) — still below claim age 67, must be 0
  if (monthlyData.length > 120) {
    assert.strictEqual(monthlyData[120].ssBenefit, 0,
      `Expected 0 at month 120 (age 65), got ${monthlyData[120].ssBenefit}`);
  }
});

test('PJB-2: ssRetirement pays once Chad reaches claim age', () => {
  // Need horizon long enough to reach age 67. Set chadWorkMonths and let projection extend.
  const s = buildState({ chadCurrentAge: 65, chadWorkMonths: 12 });   // Retires at age 66, claim age 67
  const { monthlyData } = runMonthlySimulation(s);
  // Month 11 (during work) — no ssBenefit (suppressed during chadJob)
  assert.strictEqual(monthlyData[11].ssBenefit, 0, `During-work month must be 0`);
  // Month 13 (after retirement at month 12, age ~66) — should still be 0 (below claim age 67)
  assert.strictEqual(monthlyData[13].ssBenefit, 0,
    `Just after retirement at age 66 must be 0 (claim age is 67), got ${monthlyData[13].ssBenefit}`);
  // Month 24 (age 67) — should pay
  assert.strictEqual(monthlyData[24].ssBenefit, 4214,
    `At age 67 (claim age) must pay PIA × adjustment = 4214, got ${monthlyData[24].ssBenefit}`);
  assert.strictEqual(monthlyData[24].ssBenefitType, 'retirement',
    `Label must be 'retirement' (not 'ssdi' like the prior bug), got ${monthlyData[24].ssBenefitType}`);
});

test('PJB-3: ssdi mode pays SSDI immediately after job ends', () => {
  const s = buildState({ postJobBenefit: 'ssdi' });        // Retire at month 24, age 57
  const { monthlyData } = runMonthlySimulation(s);
  // Month 25 (just retired) — should pay SSDI family (kids still under TWINS_AGE_OUT_MONTH)
  // Note: TWINS_AGE_OUT_MONTH default is 36 (3 yrs from now), so at m=25 still under
  assert.strictEqual(monthlyData[25].ssBenefit, 6321,
    `Month 25 ssdi family must be 6321 (kids still home), got ${monthlyData[25].ssBenefit}`);
  assert.strictEqual(monthlyData[25].ssBenefitType, 'ssdi',
    `Label must be 'ssdi', got ${monthlyData[25].ssBenefitType}`);
  // After TWINS_AGE_OUT_MONTH (~36) — drops to personal
  if (monthlyData.length > 40) {
    assert.strictEqual(monthlyData[40].ssBenefit, 4214,
      `After twins age out, ssdi must drop to personal 4214, got ${monthlyData[40].ssBenefit}`);
  }
});

test('PJB-4: none mode pays zero post-retirement', () => {
  const s = buildState({ postJobBenefit: 'none' });
  const { monthlyData } = runMonthlySimulation(s);
  assert.strictEqual(monthlyData[25].ssBenefit, 0, `none mode month 25 must be 0`);
  assert.strictEqual(monthlyData[25].ssBenefitType, null, `none mode month 25 type must be null`);
  if (monthlyData.length > 60) {
    assert.strictEqual(monthlyData[60].ssBenefit, 0, `none mode month 60 must still be 0`);
  }
});

test('PJB-5: ssBenefitType is "retirement" for ssRetirement post-job (fixes prior mislabel)', () => {
  // Prior bug: useSS=false made the post-job fallback label as 'ssdi' even though the math used PIA.
  // Now postJobBenefit explicitly chose 'ssRetirement' so the label MUST be 'retirement'.
  const s = buildState({ postJobBenefit: 'ssRetirement', chadCurrentAge: 67, chadWorkMonths: 12 });
  // Chad starts at 67, works 1 year, retires at 68 — already past claim age 67, so pays immediately
  const { monthlyData } = runMonthlySimulation(s);
  // Find the first month where ssBenefit > 0 post-retirement
  let firstPay = null;
  for (let m = 13; m < monthlyData.length; m++) {
    if (monthlyData[m].ssBenefit > 0) { firstPay = m; break; }
  }
  assert.ok(firstPay !== null, `Should pay post-retirement at age 68+`);
  assert.strictEqual(monthlyData[firstPay].ssBenefitType, 'retirement',
    `Post-job ssRetirement must label as 'retirement', got '${monthlyData[firstPay].ssBenefitType}'`);
});

test('PJB-6: chadJob=false bypasses postJobBenefit entirely (legacy SSDI flow runs)', () => {
  // When chadJob is off, the pre-job SSDI branch (line 322) handles everything.
  // postJobBenefit should be a no-op.
  const s = buildState({ chadJob: false, ssType: 'ssdi', postJobBenefit: 'none' });
  const { monthlyData } = runMonthlySimulation(s);
  // SSDI is approved at month 7 by default, so by month 12 it should be flowing
  assert.ok(monthlyData[12].ssBenefit > 0,
    `chadJob=false + ssType=ssdi should still pay SSDI regardless of postJobBenefit='none'`);
});

test('PJB-7: pre-bug behavior (postJobBenefit defaults to ssRetirement) — Chad retires young, NO immediate pay', () => {
  // The original user complaint: with Chad job + only 2 yrs work, the system paid SSDI immediately.
  // After the fix, default postJobBenefit='ssRetirement' age-gates by claim age.
  const s = buildState({});  // 55 yo, works 24 mo, default postJobBenefit
  const { monthlyData } = runMonthlySimulation(s);
  // Months 25..48 (age 57..59, well below 67) — must all be 0
  for (let m = 25; m <= Math.min(48, monthlyData.length - 1); m++) {
    assert.strictEqual(monthlyData[m].ssBenefit, 0,
      `Bug regression: month ${m} (Chad age ${(55 + m/12).toFixed(1)}) must be 0, got ${monthlyData[m].ssBenefit}`);
  }
});

console.log(`\n${'═'.repeat(60)}`);
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'═'.repeat(60)}`);
if (failed > 0) process.exit(1);
