/**
 * Tests for the postJobBenefit feature — controls what (if anything) Chad
 * receives after his W-2 job ends. Replaces the prior bug where the engine
 * paid the FRA SS amount immediately at retirement regardless of Chad's age.
 *
 * Run with: node src/model/__tests__/postJobBenefit.test.js
 */
import assert from 'node:assert';
import { runMonthlySimulation, SS_INTERIM_TAX_HAIRCUT } from '../projection.js';
import { gatherStateWithOverrides } from '../../state/gatherState.js';
import { SS_START_OFFSET, ssAdjustmentFactor } from '../constants.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  PASS  ${name}`); }
  catch (err) { failed++; console.log(`  FAIL  ${name}\n        ${err.message}`); }
}

console.log('\n=== postJobBenefit feature ===');

function buildState(overrides) {
  return gatherStateWithOverrides({
    // A2 (2026-06-10): expenseInflation off — isolates post-job benefit gating
    // from SS COLA (COLA behavior is locked separately in ssCola.test.js).
    expenseInflation: false,
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
  // Chad retires at month 24. Claim age 67 → calendar anchor month
  // (67 − 62) × 12 + SS_START_OFFSET = 79, past the default 72-month horizon.
  // So EVERY post-retirement month in the projection must have ZERO ssBenefit.
  // (Remediation 2.4: gate is calendar-anchored, same as the pre-job path.)
  const s = buildState({});                 // postJobBenefit undefined → 'ssRetirement' default
  const { monthlyData } = runMonthlySimulation(s);
  for (let m = 25; m < monthlyData.length; m++) {
    assert.strictEqual(monthlyData[m].ssBenefit, 0,
      `Expected 0 at month ${m} (claim-age anchor is month 79, beyond horizon), got ${monthlyData[m].ssBenefit}`);
  }
});

test('PJB-2: ssRetirement pays once the calendar reaches the claim-age anchor', () => {
  // Remediation 2.4: the gate is calendar-anchored — claim age 62 → anchor
  // month (62 − 62) × 12 + SS_START_OFFSET = 19. Chad retires at month 12,
  // so months 13..18 are a gap and month 19 starts paying.
  const anchor = (62 - 62) * 12 + SS_START_OFFSET;
  const s = buildState({ ssClaimAge: 62, chadWorkMonths: 12 });
  const { monthlyData } = runMonthlySimulation(s);
  // Month 11 (during work) — no ssBenefit (suppressed during chadJob)
  assert.strictEqual(monthlyData[11].ssBenefit, 0, `During-work month must be 0`);
  // Months just after retirement but before the anchor — still 0
  assert.strictEqual(monthlyData[13].ssBenefit, 0,
    `Just after retirement (month 13, before anchor ${anchor}) must be 0, got ${monthlyData[13].ssBenefit}`);
  assert.strictEqual(monthlyData[anchor - 1].ssBenefit, 0,
    `Month ${anchor - 1} (one before anchor) must be 0, got ${monthlyData[anchor - 1].ssBenefit}`);
  // Anchor month — pays PIA × early-claim adjustment: round(4214 × 0.70) = 2950
  const expected = Math.round(4214 * ssAdjustmentFactor(62));
  // A1 (2026-06-10): gross — net cash carries the interim taxability haircut.
  assert.strictEqual(monthlyData[anchor].ssBenefitGross, expected,
    `At anchor month ${anchor} must pay PIA × adjustment = ${expected}, got ${monthlyData[anchor].ssBenefitGross}`);
  assert.strictEqual(monthlyData[anchor].ssBenefitType, 'retirement',
    `Label must be 'retirement' (not 'ssdi' like the prior bug), got ${monthlyData[anchor].ssBenefitType}`);
});

test('PJB-3: ssdi mode pays SSDI immediately after job ends', () => {
  const s = buildState({ postJobBenefit: 'ssdi' });        // Retire at month 24, age 57
  const { monthlyData } = runMonthlySimulation(s);
  // Month 25 (just retired) — should pay SSDI family (kids still under TWINS_AGE_OUT_MONTH)
  // Note: TWINS_AGE_OUT_MONTH default is 36 (3 yrs from now), so at m=25 still under
  assert.strictEqual(monthlyData[25].ssBenefitGross, 6321,
    `Month 25 ssdi family must be 6321 (kids still home), got ${monthlyData[25].ssBenefitGross}`); // A1: gross
  assert.strictEqual(monthlyData[25].ssBenefitType, 'ssdi',
    `Label must be 'ssdi', got ${monthlyData[25].ssBenefitType}`);
  // After TWINS_AGE_OUT_MONTH (~36) — drops to personal
  if (monthlyData.length > 40) {
    assert.strictEqual(monthlyData[40].ssBenefitGross, 4214,
      `After twins age out, ssdi must drop to personal 4214, got ${monthlyData[40].ssBenefitGross}`);
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
  // Claim age 62 → calendar anchor month 19; Chad retires at month 24, already
  // past the anchor, so the benefit pays immediately after the job ends.
  const s = buildState({ postJobBenefit: 'ssRetirement', ssClaimAge: 62, chadWorkMonths: 24 });
  const { monthlyData } = runMonthlySimulation(s);
  // Find the first month where ssBenefit > 0 post-retirement
  let firstPay = null;
  for (let m = 25; m < monthlyData.length; m++) {
    if (monthlyData[m].ssBenefit > 0) { firstPay = m; break; }
  }
  assert.ok(firstPay !== null, `Should pay post-retirement (already past the claim-age anchor)`);
  assert.strictEqual(firstPay, 25,
    `Already past the anchor (19) → pays the first month after retirement (25), got ${firstPay}`);
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

// ────────────────────────────────────────────────────────────────────────
// Remediation 2.4 (2026-06-09 audit): the post-job ssRetirement age gate must
// be anchored to the SAME calendar math as the pre-job SS path
// (gatherState.js: ssStartMonth = (claimAge − 62) × 12 + SS_START_OFFSET).
// The pre-fix gate ((chadCurrentAge × 12 + m) >= claimAge × 12) treated Chad
// as exactly chadCurrentAge years old at month 0 and fired ~7 months early.
// ────────────────────────────────────────────────────────────────────────

test('PJB-8 (2.4): pre-job and post-job paths start SS benefits in the SAME month for the same claim age', () => {
  for (const claimAge of [62, 65, 67, 70]) {
    const anchor = (claimAge - 62) * 12 + SS_START_OFFSET;

    // Pre-job path: ssType='ss', no job — benefits start at gatherState's ssStartMonth.
    const pre = gatherStateWithOverrides({
      ssType: 'ss', ssClaimAge: claimAge, ssPIA: 4214,
      chadJob: false, chadConsulting: 0,
      chadWorkMonths: 132, sarahWorkMonths: 132,
      expenseInflation: false, // A2: isolate the start-month parity from SS COLA
    });
    assert.strictEqual(pre.ssStartMonth, anchor,
      `gatherState ssStartMonth for claim age ${claimAge} must be ${anchor}, got ${pre.ssStartMonth}`);
    const preData = runMonthlySimulation(pre).monthlyData;
    const preFirst = preData.findIndex(d => d.ssBenefit > 0);

    // Post-job path: Chad's job ends at month 12, postJobBenefit='ssRetirement'.
    const post = gatherStateWithOverrides({
      chadJob: true, chadJobStartMonth: 0, chadJobSalary: 180000, chadWorkMonths: 12,
      ssType: 'ssdi', postJobBenefit: 'ssRetirement',
      ssClaimAge: claimAge, ssPIA: 4214,
      sarahWorkMonths: 132,
      expenseInflation: false, // A2: isolate the start-month parity from SS COLA
    });
    const postData = runMonthlySimulation(post).monthlyData;
    const postFirst = postData.findIndex(d => d.ssBenefit > 0);

    assert.strictEqual(preFirst, anchor,
      `Pre-job path (claim ${claimAge}) must start at calendar month ${anchor}, got ${preFirst}`);
    assert.strictEqual(postFirst, anchor,
      `Post-job path (claim ${claimAge}) must start at calendar month ${anchor}, got ${postFirst} (pre-fix bug: fired ~7 months early)`);
    // Personal amounts agree too: both pay round(PIA × ssAdjustmentFactor(claimAge)).
    // A1 (2026-06-10): ssBenefitPersonal is net of the interim taxability
    // haircut — parity between pre/post paths is what matters here, so compare
    // the NET fields to each other and to the net of the expected gross.
    const expectedPersonal = Math.round(Math.round(4214 * ssAdjustmentFactor(claimAge)) * (1 - SS_INTERIM_TAX_HAIRCUT));
    assert.strictEqual(preData[preFirst].ssBenefitPersonal, expectedPersonal,
      `Pre-job personal (net) at claim ${claimAge} must be ${expectedPersonal}`);
    assert.strictEqual(postData[postFirst].ssBenefitPersonal, expectedPersonal,
      `Post-job personal (net) at claim ${claimAge} must be ${expectedPersonal}`);
  }
});

test('PJB-9 (2.4): post-job gate does NOT depend on chadCurrentAge (calendar anchor only)', () => {
  // The calendar anchor is the single source of truth; a hypothetical
  // chadCurrentAge must not shift the start month (the pre-job path already
  // ignores it). Claim age 62 → anchor month 19.
  const anchor = (62 - 62) * 12 + SS_START_OFFSET;
  for (const age of [55, 61, 65]) {
    const s = gatherStateWithOverrides({
      chadJob: true, chadJobStartMonth: 0, chadJobSalary: 180000, chadWorkMonths: 12,
      ssType: 'ssdi', postJobBenefit: 'ssRetirement',
      ssClaimAge: 62, ssPIA: 4214, chadCurrentAge: age,
      sarahWorkMonths: 96,
    });
    const { monthlyData } = runMonthlySimulation(s);
    const first = monthlyData.findIndex(d => d.ssBenefit > 0);
    assert.strictEqual(first, anchor,
      `chadCurrentAge=${age} must not move the start month (expected ${anchor}, got ${first})`);
    assert.strictEqual(monthlyData[first].ssBenefitType, 'retirement',
      `Post-job benefit must label as 'retirement'`);
  }
});

console.log(`\n${'═'.repeat(60)}`);
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'═'.repeat(60)}`);
if (failed > 0) process.exit(1);
