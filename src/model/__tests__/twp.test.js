/**
 * P8 (remediation 2026-06-10, improvement b-1): Trial Work Period / EPE module.
 *
 * When Chad takes a W-2 job on the SSDI path, SSA does NOT instantly forfeit
 * the benefit. Reality (modeled here, gated by twpEnabled, default true):
 *   - 9 TWP service months (2026 threshold $1,210/mo gross, wage-indexed):
 *     FULL SSDI + paycheck, any earnings level.
 *   - 3-month grace period (cessation month + 2): still paid while over SGA.
 *   - 36-month EPE from TWP completion: benefit suspended in over-SGA months,
 *     payable again in any non-SGA month (e.g. the job ends).
 *   - After the EPE, the first over-SGA month terminates entitlement;
 *     expedited reinstatement (EXR) within 60 months restores the benefit
 *     once work stops.
 * Back pay is received (the claim was approved) — no longer zeroed by chadJob.
 *
 * Run with: node src/model/__tests__/twp.test.js
 */
import assert from 'node:assert';
import { runMonthlySimulation, applyInterimSsTax } from '../projection.js';
import { gatherStateWithOverrides } from '../../state/gatherState.js';
import { buildTwpSchedule, isTwpActive, TWP_SERVICE_MONTHS, TWP_GRACE_MONTHS, EPE_MONTHS, EXR_WINDOW_MONTHS } from '../twp.js';
import { SSA_LIMITS } from '../constants.js';
import { INITIAL_STATE, MODEL_KEYS } from '../../state/initialState.js';
import { validateAndSanitize } from '../../state/schemaValidation.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  PASS  ${name}`); }
  catch (err) { failed++; console.log(`  FAIL  ${name}\n        ${err.message}`); }
}

console.log('\n=== TWP / EPE module (P8, improvement b-1) ===');

// Baseline TWP scenario: job from month 0 at $80k (well over SGA), SSDI
// approved month 7 with 18 months back pay. expenseInflation off isolates
// the phase machinery from SS COLA (locked separately in ssCola.test.js).
function buildState(overrides) {
  return gatherStateWithOverrides({
    expenseInflation: false,
    ssType: 'ssdi',
    chadJob: true,
    chadJobStartMonth: 0,
    chadJobSalary: 80000,
    ssdiApprovalMonth: 7,
    ssdiBackPayMonths: 18,
    ssdiPersonal: 4214,
    ssdiFamilyTotal: 6321,
    chadWorkMonths: 72,
    ...overrides,
  });
}

// Expected net benefits under the A1 interim haircut (flat tax mode).
const FAMILY_NET = applyInterimSsTax(6321, 4214);   // family total, kids' share untaxed
const PERSONAL_NET = applyInterimSsTax(4214, 4214); // personal only (post kids)

// --- Statutory table ---

test('TWP-0: 2026 TWP service-month threshold is $1,210 (ssa.gov, verified 2026-06-10)', () => {
  assert.strictEqual(SSA_LIMITS[2026].twpServiceMonthly, 1210);
});

test('TWP-0b: module constants match SSA durations (9 TWP / 3 grace / 36 EPE / 60 EXR)', () => {
  assert.strictEqual(TWP_SERVICE_MONTHS, 9);
  assert.strictEqual(TWP_GRACE_MONTHS, 3);
  assert.strictEqual(EPE_MONTHS, 36);
  assert.strictEqual(EXR_WINDOW_MONTHS, 60);
});

// --- Activation gating ---

test('TWP-1: isTwpActive — default state (no job) is inactive; job+ssdi is active', () => {
  assert.strictEqual(isTwpActive(gatherStateWithOverrides({})), false);
  assert.strictEqual(isTwpActive(buildState({})), true);
  assert.strictEqual(isTwpActive(buildState({ twpEnabled: false })), false);
  assert.strictEqual(isTwpActive(buildState({ ssType: 'ss' })), false);
  assert.strictEqual(isTwpActive(buildState({ ssdiDenied: true })), false);
});

test('TWP-2: twpEnabled=false keeps the legacy forfeiture (no SSDI, no back pay)', () => {
  const s = buildState({ twpEnabled: false });
  const { monthlyData, backPayActual } = runMonthlySimulation(s);
  assert.strictEqual(backPayActual, 0, 'back pay must stay zeroed when TWP is off');
  for (let m = 0; m <= 72; m++) {
    assert.strictEqual(monthlyData[m].ssBenefit, 0, `month ${m}: expected 0 with TWP off`);
  }
});

// --- Phase boundaries (transition tests) ---

test('TWP-3: no benefit before approval (months 0-6)', () => {
  const { monthlyData } = runMonthlySimulation(buildState({}));
  for (let m = 0; m < 7; m++) {
    assert.strictEqual(monthlyData[m].ssBenefit, 0, `month ${m}`);
    assert.strictEqual(monthlyData[m].twpPhase ?? null, null, `month ${m} phase`);
  }
});

test('TWP-4: months 7-15 are the 9 TWP service months — full family SSDI + paycheck', () => {
  const { monthlyData } = runMonthlySimulation(buildState({}));
  for (let m = 7; m <= 15; m++) {
    assert.strictEqual(monthlyData[m].ssBenefit, FAMILY_NET, `month ${m} benefit`);
    assert.strictEqual(monthlyData[m].twpPhase, 'twp', `month ${m} phase`);
    assert.ok(monthlyData[m].chadJobIncome > 0, `month ${m}: paycheck flows alongside SSDI`);
    assert.strictEqual(monthlyData[m].ssBenefitType, 'ssdi', `month ${m} label`);
  }
});

test('TWP-5: months 16-18 are the 3-month grace period — still paid while over SGA', () => {
  const { monthlyData } = runMonthlySimulation(buildState({}));
  for (let m = 16; m <= 18; m++) {
    assert.strictEqual(monthlyData[m].ssBenefit, FAMILY_NET, `month ${m} benefit`);
    assert.strictEqual(monthlyData[m].twpPhase, 'grace', `month ${m} phase`);
  }
});

test('TWP-6: month 19 onward (over SGA, grace exhausted) — benefit suspended', () => {
  const { monthlyData } = runMonthlySimulation(buildState({}));
  for (let m = 19; m <= 72; m++) {
    assert.strictEqual(monthlyData[m].ssBenefit, 0, `month ${m} benefit`);
    assert.strictEqual(monthlyData[m].twpPhase, 'suspended', `month ${m} phase`);
  }
});

test('TWP-7: back pay is received at approval+2 (claim approved — job does not zero it)', () => {
  const s = buildState({});
  const { monthlyData, backPayActual } = runMonthlySimulation(s);
  // Same back pay as the no-job SSDI baseline.
  const noJob = runMonthlySimulation(buildState({ chadJob: false }));
  assert.strictEqual(backPayActual, noJob.backPayActual);
  assert.ok(backPayActual > 0, 'back pay must be positive');
  const delta = monthlyData[9].balance - monthlyData[8].balance - monthlyData[9].investReturn
    - (monthlyData[9].cashIncome - monthlyData[9].expenses);
  assert.strictEqual(delta, backPayActual, 'back pay lands in the month-9 balance');
});

test('TWP-8: job ends DURING the EPE — benefit resumes the month after retirement', () => {
  // Retirement at month 36; EPE runs months 16..51 (completion 15 + 36).
  const { monthlyData } = runMonthlySimulation(buildState({ chadWorkMonths: 36 }));
  for (let m = 19; m <= 36; m++) {
    assert.strictEqual(monthlyData[m].ssBenefit, 0, `month ${m}: suspended while working`);
  }
  for (let m = 37; m <= 51; m++) {
    // Months 37..39 are still inside the kids' window (family total);
    // months 40+ pay the personal rate.
    const expected = m < 40 ? FAMILY_NET : PERSONAL_NET;
    assert.strictEqual(monthlyData[m].ssBenefit, expected, `month ${m}: EPE resume`);
    assert.strictEqual(monthlyData[m].twpPhase, 'epe', `month ${m} phase`);
  }
  // Past the EPE with no SGA work and no termination: entitlement simply continues.
  for (let m = 52; m <= 72; m++) {
    assert.strictEqual(monthlyData[m].ssBenefit, PERSONAL_NET, `month ${m}: continues post-EPE (never terminated)`);
    assert.strictEqual(monthlyData[m].twpPhase ?? null, null, `month ${m}: ordinary SSDI again`);
  }
});

test('TWP-9: job ends AFTER the EPE — terminated at first post-EPE SGA month, EXR reinstates', () => {
  // Work through month 60. EPE ends at 51; month 52 over SGA → terminated.
  const { monthlyData } = runMonthlySimulation(buildState({ chadWorkMonths: 60 }));
  for (let m = 52; m <= 60; m++) {
    assert.strictEqual(monthlyData[m].ssBenefit, 0, `month ${m}: terminated while still working`);
    assert.strictEqual(monthlyData[m].twpPhase, 'suspended', `month ${m} phase`);
  }
  for (let m = 61; m <= 72; m++) {
    assert.strictEqual(monthlyData[m].ssBenefit, PERSONAL_NET, `month ${m}: EXR reinstatement`);
    assert.strictEqual(monthlyData[m].twpPhase, 'reinstated', `month ${m} phase`);
    assert.strictEqual(monthlyData[m].ssBenefitType, 'ssdi', `month ${m} label`);
  }
});

test('TWP-10: postJobBenefit fallback is suppressed while the TWP module owns the path', () => {
  // Without the guard, postJobBenefit='ssdi' would double-trigger after
  // retirement on top of the EXR reinstatement.
  const { monthlyData } = runMonthlySimulation(buildState({ chadWorkMonths: 60, postJobBenefit: 'ssdi' }));
  for (let m = 61; m <= 72; m++) {
    assert.strictEqual(monthlyData[m].ssBenefit, PERSONAL_NET, `month ${m}: exactly one benefit stream`);
  }
});

// --- Earnings-level edges ---

test('TWP-11: wages under the TWP threshold never consume service months — SSDI continues', () => {
  // $12,000/yr = $1,000/mo < $1,210 TWP threshold: no service months, full benefit.
  const { monthlyData } = runMonthlySimulation(buildState({ chadJobSalary: 12000 }));
  for (let m = 7; m < 40; m++) {
    assert.strictEqual(monthlyData[m].ssBenefit, FAMILY_NET, `month ${m}`);
    assert.strictEqual(monthlyData[m].twpPhase ?? null, null, `month ${m}: no TWP consumption`);
  }
  for (let m = 40; m <= 72; m++) {
    assert.strictEqual(monthlyData[m].ssBenefit, PERSONAL_NET, `month ${m}: personal after kids age out`);
  }
});

test('TWP-12: wages between TWP threshold and SGA — TWP consumed but never suspended', () => {
  // $18,000/yr = $1,500/mo: >= $1,210 (service months) but < $1,690 SGA.
  const { monthlyData } = runMonthlySimulation(buildState({ chadJobSalary: 18000 }));
  for (let m = 7; m <= 15; m++) {
    assert.strictEqual(monthlyData[m].twpPhase, 'twp', `month ${m}`);
  }
  // Never over SGA → no cessation, benefit payable through the whole horizon.
  for (let m = 7; m <= 72; m++) {
    const expected = m < 40 ? FAMILY_NET : PERSONAL_NET;
    assert.strictEqual(monthlyData[m].ssBenefit, expected, `month ${m}: payable throughout`);
  }
});

// --- Non-TWP paths unchanged ---

test('TWP-13: SS-retirement path (ssType=ss) is untouched by the module', () => {
  const ss = gatherStateWithOverrides({ ssType: 'ss', chadJob: true, chadJobStartMonth: 0, chadJobSalary: 80000, expenseInflation: false });
  const { monthlyData } = runMonthlySimulation(ss);
  for (const row of monthlyData) {
    assert.strictEqual(row.twpPhase ?? null, null, `month ${row.month}: no TWP phase on the SS path`);
  }
});

test('TWP-14: no-job SSDI baseline is byte-identical with the module present', () => {
  const base = runMonthlySimulation(buildState({ chadJob: false }));
  for (const row of base.monthlyData) {
    assert.strictEqual(row.twpPhase ?? null, null, `month ${row.month}`);
  }
  // Months >= 7: ordinary SSDI amounts.
  assert.strictEqual(base.monthlyData[8].ssBenefit, FAMILY_NET);
  assert.strictEqual(base.monthlyData[45].ssBenefit, PERSONAL_NET);
});

// --- buildTwpSchedule unit edges ---

test('TWP-15: schedule honors a delayed job start (TWP counts only working months)', () => {
  // Job starts month 12, approval month 7: months 7..11 ordinary SSDI
  // (payable, no phase), TWP service months are 12..20.
  const s = buildState({ chadJobStartMonth: 12 });
  const sched = buildTwpSchedule(s, 72);
  for (let m = 7; m < 12; m++) {
    assert.strictEqual(sched[m].payable, true, `month ${m}`);
    assert.strictEqual(sched[m].phase, null, `month ${m}`);
  }
  for (let m = 12; m <= 20; m++) {
    assert.strictEqual(sched[m].phase, 'twp', `month ${m}`);
    assert.strictEqual(sched[m].payable, true, `month ${m}`);
  }
  assert.strictEqual(sched[21].phase, 'grace');
  assert.strictEqual(sched[24].phase, 'suspended');
});

// --- New Field Checklist (default / override / edge) ---

test('TWP-16: twpEnabled defaults to true and is in MODEL_KEYS', () => {
  assert.strictEqual(INITIAL_STATE.twpEnabled, true);
  assert.ok(MODEL_KEYS.includes('twpEnabled'), 'twpEnabled must be persisted via MODEL_KEYS');
});

test('TWP-17: schema validation coerces twpEnabled and fills the default', () => {
  const sane = validateAndSanitize({ ...INITIAL_STATE, twpEnabled: 'garbage' });
  assert.strictEqual(typeof sane.twpEnabled, 'boolean');
  const missing = validateAndSanitize((() => { const c = { ...INITIAL_STATE }; delete c.twpEnabled; return c; })());
  assert.strictEqual(missing.twpEnabled, true, 'missing field fills the default (true)');
});

test('TWP-18: gatherState passes twpEnabled through (override false survives)', () => {
  const s = gatherStateWithOverrides({ twpEnabled: false });
  assert.strictEqual(s.twpEnabled, false);
  const d = gatherStateWithOverrides({});
  assert.strictEqual(d.twpEnabled, true);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
