/**
 * 6.2 (remediation 2026-06-10, improvement a-3, gate D4): college costs /
 * 529 for the twins.
 *
 * The audit found the "Twins to college" milestone REDUCES expenses
 * $3,000/mo with zero tuition modeled — the sign of the event was wrong.
 * The milestone stays (household running costs genuinely drop when the twins
 * move out) but the engine now carries the tuition itself:
 *   - collegeCostPerKidMonthly (default 2833 = $34k/kid/yr, D4)
 *   - collegeStartMonth (default 39 = Sept 2029)
 *   - collegeMonths (default 48)
 *   - college529Balance (default 0) — drawn down FIRST; only the uncovered
 *     remainder lands in monthly expenses (expenseBreakdown.college).
 *
 * Run: node src/model/__tests__/college.test.js
 */

import assert from 'node:assert';
import { INITIAL_STATE, MODEL_KEYS } from '../../state/initialState.js';
import { gatherStateWithOverrides } from '../../state/gatherState.js';
import { validateAndSanitize } from '../../state/schemaValidation.js';
import { runMonthlySimulation } from '../projection.js';

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

console.log('\n=== 6.2 — fields (New Field Checklist) ===');

test('defaults: 2833/kid/mo, start 39, 48 months, $0 in the 529', () => {
  assert.strictEqual(INITIAL_STATE.collegeCostPerKidMonthly, 2833);
  assert.strictEqual(INITIAL_STATE.collegeStartMonth, 39);
  assert.strictEqual(INITIAL_STATE.collegeMonths, 48);
  assert.strictEqual(INITIAL_STATE.college529Balance, 0);
  for (const k of ['collegeCostPerKidMonthly', 'collegeStartMonth', 'collegeMonths', 'college529Balance']) {
    assert.ok(MODEL_KEYS.includes(k), `${k} must be a model key`);
  }
});

test('gatherState passes the fields through (default and override)', () => {
  const d = gatherStateWithOverrides({});
  assert.strictEqual(d.collegeCostPerKidMonthly, 2833);
  assert.strictEqual(d.collegeStartMonth, 39);
  const o = gatherStateWithOverrides({ collegeCostPerKidMonthly: 4000, college529Balance: 120000 });
  assert.strictEqual(o.collegeCostPerKidMonthly, 4000);
  assert.strictEqual(o.college529Balance, 120000);
});

test('schema RANGE clamps all four fields', () => {
  const r = validateAndSanitize({
    ...INITIAL_STATE,
    collegeCostPerKidMonthly: -5,
    collegeStartMonth: 9999,
    collegeMonths: -1,
    college529Balance: -100,
  });
  assert.strictEqual(r.collegeCostPerKidMonthly, 0, 'cost floored at 0');
  assert.ok(r.collegeStartMonth <= 240, `start month clamped (got ${r.collegeStartMonth})`);
  assert.strictEqual(r.collegeMonths, 0, 'duration floored at 0');
  assert.strictEqual(r.college529Balance, 0, '529 floored at 0');
});

console.log('\n=== 6.2 — expense engine ===');

test('college expense line appears for both twins during the window', () => {
  const s = gatherStateWithOverrides({});
  const { monthlyData } = runMonthlySimulation(s);
  const combined = 2 * 2833;
  assert.strictEqual(monthlyData[38].expenseBreakdown.college ?? 0, 0, 'no college before start');
  assert.strictEqual(monthlyData[39].expenseBreakdown.college, combined, 'both twins from Sept 2029');
  assert.strictEqual(monthlyData[72].expenseBreakdown.college, combined, 'still inside the 48-month window at m=72');
  // Expenses actually rise by the college amount vs a no-college counterfactual.
  const noCollege = runMonthlySimulation(gatherStateWithOverrides({ collegeMonths: 0 })).monthlyData;
  assert.strictEqual(monthlyData[39].expenses - noCollege[39].expenses, combined,
    'college adds to total expenses');
});

test('window edges: collegeMonths bounds the expense, collegeMonths=0 disables it', () => {
  const s = gatherStateWithOverrides({ collegeStartMonth: 10, collegeMonths: 12 });
  const { monthlyData } = runMonthlySimulation(s);
  assert.strictEqual(monthlyData[9].expenseBreakdown.college ?? 0, 0);
  assert.ok(monthlyData[10].expenseBreakdown.college > 0);
  assert.ok(monthlyData[21].expenseBreakdown.college > 0, 'last month of the window');
  assert.strictEqual(monthlyData[22].expenseBreakdown.college ?? 0, 0, 'window closed');
  const off = runMonthlySimulation(gatherStateWithOverrides({ collegeMonths: 0 })).monthlyData;
  assert.ok(off.every(d => (d.expenseBreakdown.college ?? 0) === 0), 'collegeMonths=0 → never');
});

test('529 draws down first: covered months add NOTHING to expenses', () => {
  const combined = 2 * 2833;
  // 3 months fully covered + a partial 4th month.
  const s = gatherStateWithOverrides({ college529Balance: 3 * combined + 1000 });
  const { monthlyData } = runMonthlySimulation(s);
  for (const m of [39, 40, 41]) {
    assert.strictEqual(monthlyData[m].expenseBreakdown.college ?? 0, 0, `m=${m} fully 529-funded`);
    assert.strictEqual(monthlyData[m].college529Draw, combined, `m=${m} draw`);
  }
  assert.strictEqual(monthlyData[42].college529Draw, 1000, 'partial draw exhausts the 529');
  assert.strictEqual(monthlyData[42].expenseBreakdown.college, combined - 1000, 'remainder out of pocket');
  assert.strictEqual(monthlyData[42].college529Balance, 0, '529 empty');
  assert.strictEqual(monthlyData[43].expenseBreakdown.college, combined, 'fully out of pocket after');
});

test('a 529 covering the whole window means college never hits cashflow', () => {
  const s = gatherStateWithOverrides({ college529Balance: 5_000_000 });
  const withBig = runMonthlySimulation(s).monthlyData;
  const off = runMonthlySimulation(gatherStateWithOverrides({ collegeMonths: 0 })).monthlyData;
  assert.ok(withBig.every(d => (d.expenseBreakdown.college ?? 0) === 0));
  assert.strictEqual(withBig[72].balance, off[72].balance, 'savings path identical to no-college');
});

console.log('\n=== 6.2 — "Twins to college" sign fix ===');

test('combined picture: twins leaving for college INCREASES net expenses', () => {
  // The default milestone still saves $3,000/mo from m=36, but from m=39 the
  // tuition ($5,666/mo) dominates: the combined event is a net +$2,666/mo
  // expense increase — the audit found the prior model had the SIGN wrong
  // (a $3,000/mo reduction with zero tuition).
  const s = gatherStateWithOverrides({});
  const { monthlyData } = runMonthlySimulation(s);
  const d = monthlyData[40];
  const milestoneSide = d.expenseBreakdown.milestones ?? 0; // −3000
  const collegeSide = d.expenseBreakdown.college ?? 0;      // +5666
  assert.strictEqual(milestoneSide, -3000, 'milestone stays separate (household savings)');
  assert.strictEqual(collegeSide, 5666, 'tuition line present');
  assert.ok(milestoneSide + collegeSide > 0,
    `combined twins-to-college effect must be a net expense increase (got ${milestoneSide + collegeSide})`);
});

test('breakdown still sums to total expenses in college months', () => {
  const s = gatherStateWithOverrides({ college529Balance: 20000 });
  const { monthlyData } = runMonthlySimulation(s);
  for (const d of monthlyData) {
    const sum = Object.values(d.expenseBreakdown).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - d.expenses) <= 1, `m=${d.month}: breakdown ${sum} != expenses ${d.expenses}`);
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
