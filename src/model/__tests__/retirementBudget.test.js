/**
 * Retirement budget cap (2026-06-12).
 *
 * Chad asked: "when Sarah and I decide to retire, I'd like to set the
 * top-line expense max — the budget for our retirement." The engine keeps
 * computing the bottom-up expense stack, then caps it:
 *
 *   - retirementBudgetMonthly (null = off): $/mo in TODAY's dollars,
 *     trended at CPI when expenseInflation is on (same nominal frame as
 *     baseLiving — a nominal cap would silently become austerity).
 *   - retirementBudgetStartMonth (null = auto): explicit start month, or
 *     max(chadRetirementMonth, sarahRetirementMonth) — "when both retired".
 *   - Cap, not target: months already under budget are untouched.
 *   - Contractual floor: the cut can never push expenses below
 *     mortgagePI + debtService + van + bcs + college + oneTimeExtras —
 *     the row flags retirementBudgetFloored when the floor binds.
 *   - The cut lands as expenseBreakdown.retirementBudget (negative), so
 *     Σ breakdown == expenses still holds and the chart annotations /
 *     DataTable / advisor diff pick it up automatically.
 *
 * Run: node src/model/__tests__/retirementBudget.test.js
 */

import assert from 'node:assert';
import { INITIAL_STATE, MODEL_KEYS } from '../../state/initialState.js';
import { gatherStateWithOverrides } from '../../state/gatherState.js';
import { validateAndSanitize } from '../../state/schemaValidation.js';
import { runMonthlySimulation } from '../projection.js';
import { deriveExpenseChangeEvents } from '../expenseEvents.js';

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

function simulate(overrides = {}) {
  const s = gatherStateWithOverrides(overrides);
  return { s, monthlyData: runMonthlySimulation(s).monthlyData };
}

/** Mirror of the engine's budget inflation (today's $ → nominal at month m). */
function budgetNominal(budget, m, rate = 3) {
  return Math.round(budget * Math.pow(1 + rate / 100, m / 12));
}

/** Contractual lines the cap must not cut below (computed from the row itself). */
function contractualSum(row) {
  const b = row.expenseBreakdown || {};
  return (b.mortgagePI || 0) + (b.debtService || 0) + (b.van || 0)
    + (b.bcs || 0) + (b.college || 0) + (b.oneTimeExtras || 0);
}

console.log('\n=== Retirement budget — fields (New Field Checklist) ===');

test('defaults: both fields null (feature off) and in MODEL_KEYS', () => {
  assert.strictEqual(INITIAL_STATE.retirementBudgetMonthly, null);
  assert.strictEqual(INITIAL_STATE.retirementBudgetStartMonth, null);
  for (const k of ['retirementBudgetMonthly', 'retirementBudgetStartMonth']) {
    assert.ok(MODEL_KEYS.includes(k), `${k} must be a model key`);
  }
});

test('schema RANGE clamps both fields; null survives the nullable branch', () => {
  const r = validateAndSanitize({
    ...INITIAL_STATE,
    retirementBudgetMonthly: -50,
    retirementBudgetStartMonth: 9999,
  });
  assert.strictEqual(r.retirementBudgetMonthly, 0, 'budget floored at 0');
  assert.strictEqual(r.retirementBudgetStartMonth, 360, 'start month capped at 360');
  const big = validateAndSanitize({ ...INITIAL_STATE, retirementBudgetMonthly: 9_999_999 });
  assert.strictEqual(big.retirementBudgetMonthly, 200000, 'budget capped at 200k corruption guard');
  const nulls = validateAndSanitize({ ...INITIAL_STATE });
  assert.strictEqual(nulls.retirementBudgetMonthly, null, 'null budget stays null');
  assert.strictEqual(nulls.retirementBudgetStartMonth, null, 'null start stays null');
});

test('gatherState passes both fields through (default and override)', () => {
  const d = gatherStateWithOverrides({});
  assert.strictEqual(d.retirementBudgetMonthly, null);
  assert.strictEqual(d.retirementBudgetStartMonth, null);
  const o = gatherStateWithOverrides({ retirementBudgetMonthly: 18000, retirementBudgetStartMonth: 50 });
  assert.strictEqual(o.retirementBudgetMonthly, 18000);
  assert.strictEqual(o.retirementBudgetStartMonth, 50);
});

console.log('\n=== Retirement budget — engine ===');

test('null budget is a PERFECT no-op: expenses series and breakdowns byte-identical to baseline', () => {
  const base = simulate({}).monthlyData;
  const explicit = simulate({ retirementBudgetMonthly: null, retirementBudgetStartMonth: null }).monthlyData;
  assert.strictEqual(base.length, explicit.length);
  for (let i = 0; i < base.length; i++) {
    assert.strictEqual(explicit[i].expenses, base[i].expenses, `m=${i} expenses diverged`);
    assert.deepStrictEqual(explicit[i].expenseBreakdown, base[i].expenseBreakdown, `m=${i} breakdown diverged`);
    assert.ok(!('retirementBudget' in base[i].expenseBreakdown), `m=${i}: no budget key when off`);
  }
});

test('non-binding budget (way above bottom-up) leaves every month untouched — cap, not target', () => {
  const base = simulate({}).monthlyData;
  const capped = simulate({ retirementBudgetMonthly: 150000, retirementBudgetStartMonth: 0 }).monthlyData;
  for (let i = 0; i < base.length; i++) {
    assert.strictEqual(capped[i].expenses, base[i].expenses, `m=${i} expenses must not move`);
    assert.ok(!('retirementBudget' in capped[i].expenseBreakdown), `m=${i}: no key when cap doesn't bind`);
    assert.strictEqual(capped[i].retirementBudgetFloored, false, `m=${i}: floor flag stays false`);
  }
});

test('binding cap: from the start month, expenses == CPI-trended budget (transition boundary exact)', () => {
  const BUDGET = 20000;
  const START = 48;
  const base = simulate({}).monthlyData;
  const { monthlyData } = simulate({ retirementBudgetMonthly: BUDGET, retirementBudgetStartMonth: START });
  // m = start-1: untouched
  assert.strictEqual(monthlyData[START - 1].expenses, base[START - 1].expenses, 'month 47 uncapped');
  assert.ok(!('retirementBudget' in monthlyData[START - 1].expenseBreakdown), 'no key at month 47');
  // m >= start: capped to the trended budget (contractual floor is below it here)
  for (let m = START; m < monthlyData.length; m++) {
    const row = monthlyData[m];
    const expected = budgetNominal(BUDGET, m);
    assert.ok(contractualSum(row) <= expected, `m=${m}: precondition — floor below budget`);
    assert.strictEqual(row.expenses, expected,
      `m=${m}: expenses ${row.expenses} != trended budget ${expected}`);
    const cut = row.expenseBreakdown.retirementBudget;
    assert.ok(cut < 0, `m=${m}: cut must be a negative breakdown line`);
    assert.strictEqual(base[m].expenses + cut, row.expenses,
      `m=${m}: bottom-up + cut must equal capped expenses`);
    assert.strictEqual(row.retirementBudgetFloored, false, `m=${m}: floor not binding`);
  }
});

test('auto start month = max(chad, sarah) retirement — "when we are both retired"', () => {
  const { monthlyData } = simulate({
    chadWorkMonths: 48, sarahWorkMonths: 60,
    retirementBudgetMonthly: 10000, // auto start → month 60
  });
  assert.ok(!('retirementBudget' in monthlyData[59].expenseBreakdown), 'month 59: Sarah still working — uncapped');
  assert.ok('retirementBudget' in monthlyData[60].expenseBreakdown, 'month 60: both retired — capped');
});

test('explicit start month overrides the auto derivation', () => {
  const { monthlyData } = simulate({
    chadWorkMonths: 72, sarahWorkMonths: 72,
    retirementBudgetMonthly: 20000, retirementBudgetStartMonth: 24,
  });
  assert.ok(!('retirementBudget' in monthlyData[23].expenseBreakdown), 'month 23 uncapped');
  assert.ok('retirementBudget' in monthlyData[24].expenseBreakdown, 'month 24 capped (override, not month 72)');
});

test('nominal mode: expenseInflation off → flat budget, exact dollars', () => {
  const { monthlyData } = simulate({
    expenseInflation: false,
    retirementBudgetMonthly: 20000, retirementBudgetStartMonth: 48,
  });
  for (let m = 48; m < monthlyData.length; m++) {
    assert.strictEqual(monthlyData[m].expenses, 20000, `m=${m}: flat $20,000 cap`);
  }
});

test('contractual floor: budget below contracted lines → expenses floor at the contractual sum, flagged', () => {
  // Month 44: BCS done (m41), college active (+5,666), flat debt 6,434, van 2,597.
  const { monthlyData } = simulate({ retirementBudgetMonthly: 5000, retirementBudgetStartMonth: 44 });
  const row = monthlyData[44];
  const floor = contractualSum(row);
  assert.ok(floor > budgetNominal(5000, 44), 'precondition: floor above the trended budget');
  assert.strictEqual(row.expenses, floor,
    `expenses ${row.expenses} must floor at contractual ${floor}, not the budget`);
  assert.strictEqual(row.retirementBudgetFloored, true, 'floor flag must be set');
  // baseLiving/healthPremium got fully cut, but contracts survive
  const sum = Object.values(row.expenseBreakdown).reduce((a, v) => a + v, 0);
  assert.strictEqual(sum, row.expenses, 'Σ breakdown == expenses while floored');
});

test('Σ expenseBreakdown == expenses EVERY month with the cap active (binding + floored runs)', () => {
  for (const overrides of [
    { retirementBudgetMonthly: 20000, retirementBudgetStartMonth: 48 },
    { retirementBudgetMonthly: 5000, retirementBudgetStartMonth: 40 },
    { retirementBudgetMonthly: 12000 }, // auto start
  ]) {
    const { monthlyData } = simulate(overrides);
    for (const d of monthlyData) {
      const sum = Object.values(d.expenseBreakdown).reduce((a, v) => a + v, 0);
      assert.strictEqual(sum, d.expenses,
        `m=${d.month} (${JSON.stringify(overrides)}): Σ breakdown ${sum} != expenses ${d.expenses}`);
    }
  }
});

console.log('\n=== Retirement budget — chart annotation integration ===');

test('the budget start month fires a green expense-change marker labeled "Retirement budget cap"', () => {
  const { s, monthlyData } = simulate({ retirementBudgetMonthly: 20000, retirementBudgetStartMonth: 48 });
  const events = deriveExpenseChangeEvents(monthlyData, { milestones: s.milestones });
  const ev = events.find((e) => e.month === 48);
  assert.ok(ev, 'expected an annotation event at the budget start month');
  const item = ev.items.find((it) => it.key === 'retirementBudget');
  assert.ok(item, 'event must carry the retirementBudget item');
  assert.strictEqual(item.label, 'Retirement budget cap');
  assert.ok(item.delta < 0, 'the cut is a decrease');
  assert.ok(ev.netDelta < 0, 'net decrease → green marker');
});

console.log(`\n${'='.repeat(50)}`);
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'='.repeat(50)}\n`);
process.exit(failed > 0 ? 1 : 0);
