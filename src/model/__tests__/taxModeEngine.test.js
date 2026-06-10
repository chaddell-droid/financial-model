/**
 * P7 (remediation 2026-06-10, improvement a-1): taxMode='engine' wiring.
 *
 * In engine mode, per-year effective rates from buildTaxSchedule drive the
 * monthly simulation's tax treatment:
 *   - SS/SSDI/spousal adult share + back pay are haircut by the ENGINE's
 *     per-year SS-attributable rate (replacing — never stacking on — the
 *     P1a interim 18.7% haircut, which flat mode keeps).
 *   - Sarah's practice cash uses the engine's all-in effective rate on gross
 *     (Sch C expenses + her attributed tax incl. SE tax + QBI).
 *   - Chad's W-2 comp uses the engine's per-year effective rate on his
 *     Box-1 wages (brackets, FICA, credits — noFICA handled inside).
 *   - b-14: RSU vests (legacy MSFT + job grants) are withheld at the
 *     statutory 29.65% at vest and trued-up against the engine rate the
 *     following April (refund/owed lands in the savings balance).
 *   - b-9: RMDs on the pre-tax 401(k) from the calendar year Chad attains 75
 *     (Uniform Lifetime Table), taxed at retirement401kTaxRate.
 *
 * Flat mode must be byte-identical to pre-P7 output (parity tests below).
 *
 * Run: node src/model/__tests__/taxModeEngine.test.js
 */

import assert from 'node:assert';
import { INITIAL_STATE } from '../../state/initialState.js';
import { gatherStateWithOverrides } from '../../state/gatherState.js';
import { runMonthlySimulation, applyInterimSsTax, SS_INTERIM_TAX_HAIRCUT } from '../projection.js';
import { buildTaxSchedule } from '../taxProjection.js';
import { RSU_VEST_WITHHOLDING_RATE, rmdDivisorForAge } from '../taxConstants.js';
import { getVestingGrossLumpSum, getVestingLumpSum } from '../vesting.js';
import { DAYS_PER_MONTH } from '../constants.js';

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

console.log('\n=== P7 — taxMode=engine wiring (a-1 + b-14 + b-9) ===');

// ── Flat-mode parity ────────────────────────────────────────────────────────

test('default taxMode is flat (regression baseline)', () => {
  assert.strictEqual(INITIAL_STATE.taxMode, 'flat');
});

test('flat mode output is identical whether taxMode is explicit or defaulted', () => {
  const a = runMonthlySimulation(gatherStateWithOverrides({}));
  const b = runMonthlySimulation(gatherStateWithOverrides({ taxMode: 'flat' }));
  assert.deepStrictEqual(b.monthlyData, a.monthlyData);
  assert.strictEqual(b.backPayTax, a.backPayTax);
});

test('flat mode rows carry zero rsuTaxTrueUp and rmd401k (additive fields, no behavior)', () => {
  const { monthlyData } = runMonthlySimulation(gatherStateWithOverrides({ taxMode: 'flat' }));
  for (const row of monthlyData) {
    assert.strictEqual(row.rsuTaxTrueUp || 0, 0);
    assert.strictEqual(row.rmd401k || 0, 0);
  }
});

test('engine mode produces a different savings trajectory than flat mode', () => {
  const flat = runMonthlySimulation(gatherStateWithOverrides({ taxMode: 'flat' }));
  const eng = runMonthlySimulation(gatherStateWithOverrides({ taxMode: 'engine' }));
  const last = flat.monthlyData.length - 1;
  assert.notStrictEqual(eng.monthlyData[last].balance, flat.monthlyData[last].balance);
});

// ── Engine schedule decomposition ───────────────────────────────────────────

test('schedule exposes an engine block whose three-way split sums to the full tax', () => {
  const s = gatherStateWithOverrides({ taxMode: 'engine' });
  const sched = buildTaxSchedule(s);
  for (const yr of sched) {
    assert.ok(yr.engine, 'engine block missing');
    const { ssAnnualTax, chadCompAnnualTax, sarahEngineAnnualTax } = yr.engine;
    assert.ok(ssAnnualTax >= 0 && chadCompAnnualTax >= 0 && sarahEngineAnnualTax >= 0);
    // The split is exact whenever no component clamps at 0 (the default does not).
    assert.ok(
      Math.abs(ssAnnualTax + chadCompAnnualTax + sarahEngineAnnualTax - yr.fullTax.totalTax) <= 1,
      `split ${ssAnnualTax}+${chadCompAnnualTax}+${sarahEngineAnnualTax} != ${yr.fullTax.totalTax}`
    );
  }
});

test('engine rates are sane: ssEffRate within [0, 0.40], sarahEffRateOnGross > expense ratio', () => {
  const s = gatherStateWithOverrides({ taxMode: 'engine' });
  const sched = buildTaxSchedule(s);
  const expenseRatio = (s.taxSchCExpenseRatio ?? 25) / 100;
  for (const yr of sched) {
    assert.ok(yr.engine.ssEffRate >= 0 && yr.engine.ssEffRate <= 0.40, `ssEffRate ${yr.engine.ssEffRate}`);
    if (yr.annualSarahGross > 0) {
      assert.ok(yr.engine.sarahEffRateOnGross > expenseRatio, 'Sarah pays SOME tax beyond expenses');
      assert.ok(yr.engine.sarahEffRateOnGross < 0.95);
    }
  }
});

// ── SS taxability via the engine (supersedes the P1a interim haircut) ──────

test('engine mode nets SSDI adult share by the ENGINE year rate — no interim 18.7% stacking', () => {
  const s = gatherStateWithOverrides({ taxMode: 'engine' });
  const sched = buildTaxSchedule(s);
  const { monthlyData } = runMonthlySimulation(s);
  // m=8: SSDI active (approval=7), family benefit, projection YEAR 0 — whose
  // engine rate (~20.3%, back-pay year) is visibly distinct from the interim
  // 18.7%. (Year 1's rate is coincidentally ≈0.1870 at the defaults.)
  const m = 8;
  const cola = Math.pow(1 + (s.ssColaRate ?? 2.5) / 100, m / 12);
  const grossTotal = Math.round(Math.round((s.ssdiFamilyTotal || 6321)) * cola);
  const grossPersonal = Math.round(Math.round((s.ssdiPersonal || 4214)) * cola);
  const rate = sched[0].engine.ssEffRate;
  const expected = (grossTotal - grossPersonal) + Math.round(grossPersonal * (1 - rate));
  assert.strictEqual(monthlyData[m].ssBenefitGross, grossTotal);
  assert.strictEqual(monthlyData[m].ssBenefit, expected);
  // Explicit no-double-count guard: NOT the interim haircut, NOT both.
  assert.notStrictEqual(monthlyData[m].ssBenefit,
    applyInterimSsTax(grossTotal, grossPersonal, SS_INTERIM_TAX_HAIRCUT));
});

test('engine mode taxes back pay at the receipt-year engine rate', () => {
  const s = gatherStateWithOverrides({ taxMode: 'engine' });
  const sched = buildTaxSchedule(s);
  const { backPayTax } = runMonthlySimulation(s);
  const adultGross = (s.ssdiBackPayMonths || 0) * (s.ssdiPersonal || 4214);
  const receiptYear = Math.floor(((s.ssdiApprovalMonth ?? 7) + 2) / 12);
  assert.strictEqual(backPayTax, Math.round(adultGross * sched[receiptYear].engine.ssEffRate));
});

// ── Sarah via the engine ────────────────────────────────────────────────────

test('engine mode month-0 sarahIncome = gross × (1 − engine all-in rate on gross)', () => {
  const s = gatherStateWithOverrides({ taxMode: 'engine' });
  const sched = buildTaxSchedule(s);
  const { monthlyData } = runMonthlySimulation(s);
  const gross = Math.round(s.sarahRate * s.sarahCurrentClients * DAYS_PER_MONTH);
  assert.strictEqual(monthlyData[0].sarahIncome,
    Math.round(gross * (1 - sched[0].engine.sarahEffRateOnGross)));
});

// ── b-14: RSU withholding + April true-up ──────────────────────────────────

test('engine mode nets legacy MSFT vests at 1 − 29.65% statutory withholding', () => {
  const s = gatherStateWithOverrides({ taxMode: 'engine' });
  const { monthlyData } = runMonthlyVestProbe(s);
  assert.ok(monthlyData.found, 'no legacy vest month found in horizon');
  assert.strictEqual(monthlyData.engineLump,
    Math.round(monthlyData.grossLump * (1 - RSU_VEST_WITHHOLDING_RATE)));
});

function runMonthlyVestProbe(s) {
  const { monthlyData } = runMonthlySimulation(s);
  for (const row of monthlyData) {
    const grossLump = getVestingGrossLumpSum(row.month, s.msftGrowth || 0, s.msftPrice);
    if (grossLump > 0) {
      return { monthlyData: { found: true, engineLump: row.msftLump, grossLump } };
    }
  }
  return { monthlyData: { found: false } };
}

test('flat mode keeps the legacy 0.80 vest net factor exactly', () => {
  const s = gatherStateWithOverrides({ taxMode: 'flat' });
  const { monthlyData } = runMonthlySimulation(s);
  for (const row of monthlyData) {
    const flatLump = getVestingLumpSum(row.month, s.msftGrowth || 0, s.msftPrice);
    assert.strictEqual(row.msftLump, flatLump);
  }
});

test('April true-up reconciles prior-year vest withholding against the engine rate', () => {
  const s = gatherStateWithOverrides({ taxMode: 'engine' });
  const sched = buildTaxSchedule(s);
  const result = runMonthlySimulation(s);
  const vestGross = result.rsuVestGrossByYear;
  assert.ok(Array.isArray(vestGross), 'rsuVestGrossByYear missing from engine-mode result');
  assert.ok(vestGross[0] > 0, 'year-0 legacy vests should be tracked');
  const aprilRow = result.monthlyData[13]; // April of projection year 1 settles year 0
  const expected = Math.round(vestGross[0] * (RSU_VEST_WITHHOLDING_RATE - sched[0].engine.chadCompEffRate));
  assert.strictEqual(aprilRow.rsuTaxTrueUp, expected);
  // Withholding at 29.65% exceeds the true engine rate here → April REFUND.
  assert.ok(aprilRow.rsuTaxTrueUp > 0, 'expected a refund-direction true-up at default rates');
  // Non-April months carry no true-up.
  assert.strictEqual(result.monthlyData[12].rsuTaxTrueUp, 0);
  assert.strictEqual(result.monthlyData[14].rsuTaxTrueUp, 0);
});

// ── W-2 path via the engine ────────────────────────────────────────────────

test('engine mode W-2 salary nets at the engine effective rate', () => {
  const s = gatherStateWithOverrides({ taxMode: 'engine', chadJob: true });
  const sched = buildTaxSchedule(s);
  const { monthlyData } = runMonthlySimulation(s);
  // Defaults: no pension, no 401(k), no catch-up → net = (salary/12) × (1 − rate).
  const expected = Math.round((s.chadJobSalary / 12) * (1 - sched[0].engine.chadCompEffRate));
  assert.strictEqual(monthlyData[0].chadJobSalaryNet, expected);
});

test('engine mode job RSU vests are withheld at 29.65% (vs flat all-in rate)', () => {
  const overrides = { chadJob: true, chadJobStockRefresh: 60000, chadJobRefreshStartMonth: 0 };
  const flat = runMonthlySimulation(gatherStateWithOverrides({ ...overrides, taxMode: 'flat' }));
  const eng = runMonthlySimulation(gatherStateWithOverrides({ ...overrides, taxMode: 'engine' }));
  const flatMult = 1 - (gatherStateWithOverrides(overrides).chadJobTaxRate ?? 25) / 100;
  let checked = 0;
  for (let m = 0; m < flat.monthlyData.length; m++) {
    const f = flat.monthlyData[m].chadJobStockRefreshNet;
    if (f > 0) {
      const gross = f / flatMult;
      const e = eng.monthlyData[m].chadJobStockRefreshNet;
      assert.ok(Math.abs(e - gross * (1 - RSU_VEST_WITHHOLDING_RATE)) <= 2,
        `m=${m}: engine net ${e} != gross ${gross} × 0.7035`);
      checked++;
    }
  }
  assert.ok(checked > 0, 'no refresh vest months found');
});

// ── b-9: RMDs at 75 (engine mode only) ─────────────────────────────────────

test('Uniform Lifetime Table divisors: 24.6 at 75, decreasing, floor at 100+', () => {
  assert.strictEqual(rmdDivisorForAge(75), 24.6);
  assert.strictEqual(rmdDivisorForAge(74), null);
  assert.ok(rmdDivisorForAge(80) < rmdDivisorForAge(75));
  assert.ok(rmdDivisorForAge(105) > 0); // clamps to the 100+ tail, never null
});

test('engine mode takes RMDs from the calendar year Chad attains 75; flat mode never does', () => {
  // Solvent long horizon (big savings cushion) so deficit draws never empty
  // the 401(k) before Chad reaches the RMD age.
  const overrides = { sarahWorkMonths: 200, chadWorkMonths: 200, startingSavings: 5000000 };
  const eng = runMonthlySimulation(gatherStateWithOverrides({ ...overrides, taxMode: 'engine' }));
  const flat = runMonthlySimulation(gatherStateWithOverrides({ ...overrides, taxMode: 'flat' }));
  assert.ok(flat.monthlyData.every(r => (r.rmd401k || 0) === 0), 'flat mode must not RMD');
  const firstRmd = eng.monthlyData.find(r => (r.rmd401k || 0) > 0);
  assert.ok(firstRmd, 'no RMD found on a 200-month engine-mode horizon');
  // Chad (61 in 2026, FRA-anchored) attains 75 in calendar 2040 → m ∈ [166, 177].
  assert.ok(firstRmd.month >= 166 && firstRmd.month <= 177,
    `first RMD at m=${firstRmd.month}, expected the 2040 calendar year`);
  // Before the RMD year: untouched.
  assert.ok(eng.monthlyData.slice(0, 166).every(r => (r.rmd401k || 0) === 0));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
