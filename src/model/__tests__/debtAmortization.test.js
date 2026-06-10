/**
 * 6.3 (remediation 2026-06-10, improvements a-5 + b-12, gate D5):
 * per-debt amortization + mortgage P&I split.
 *
 * a-5 — debts array ({ id, name, balance, apr, payment }):
 *   Amortized monthly (interest = balance × apr/12, payment covers interest
 *   first, final payment capped at balance + interest); the payment drops to
 *   ZERO at payoff. DEFAULT behavior is flat-equivalent: with no per-debt
 *   entries the legacy flat `debtService` continues exactly as before
 *   (snapshot tests stay green in the default state — locked by the
 *   deep-equality test below). When a debt list is present it REPLACES the
 *   flat debtService everywhere (expense loop, totalMonthlySpend back-calc,
 *   retireDebt payoff total).
 *
 * b-12 — mortgage P&I split:
 *   `mortgagePI` is the fixed monthly P&I carved OUT of the inflating
 *   baseExpenses (a fixed-rate mortgage payment does not inflate). With
 *   mortgageBalance/mortgageRate set, the principal portion is credited to
 *   home equity each month and the payment drops to zero at payoff. With no
 *   balance info, the payment simply continues as a fixed (non-inflating)
 *   expense.
 *
 * Run: node src/model/__tests__/debtAmortization.test.js
 */

import assert from 'node:assert';
import { INITIAL_STATE } from '../../state/initialState.js';
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

const debt = (overrides = {}) => ({
  id: 'debt-test',
  name: 'Test debt',
  balance: 10000,
  apr: 0,
  payment: 1000,
  ...overrides,
});

// Quiet baseline: no investment returns, big savings (no 401k/home drawdowns).
function sim(overrides = {}) {
  return runMonthlySimulation(gatherStateWithOverrides({
    investmentReturn: 0,
    startingSavings: 2_000_000,
    ...overrides,
  })).monthlyData;
}

// ── Flat-equivalent default (the snapshot-preserving contract) ──────────────
console.log('\n=== 6.3 default — empty debt list == flat debtService, mortgage fields == no-op ===');

test('debts:[] + mortgage defaults produce BYTE-IDENTICAL monthlyData to the pre-6.3 state', () => {
  const before = runMonthlySimulation(gatherStateWithOverrides({})).monthlyData;
  const after = runMonthlySimulation(gatherStateWithOverrides({
    debts: [], mortgagePI: 0, mortgageBalance: 0, mortgageRate: 0,
  })).monthlyData;
  assert.deepStrictEqual(after, before);
});

test('default state still charges the flat debtService every month', () => {
  const rows = sim({});
  for (const r of rows) {
    assert.strictEqual(r.expenseBreakdown.debtService, INITIAL_STATE.debtService,
      `month ${r.month}: expected flat ${INITIAL_STATE.debtService}, got ${r.expenseBreakdown.debtService}`);
  }
});

test('a debt list whose payments sum to the flat debtService matches flat at month 0', () => {
  const flat = sim({});
  const list = sim({
    debts: [
      debt({ id: 'a', balance: 92760, apr: 0, payment: 3000 }),
      debt({ id: 'b', balance: 97018, apr: 0, payment: 3434 }),
    ],
  });
  assert.strictEqual(list[0].expenses, flat[0].expenses);
  assert.strictEqual(list[0].expenseBreakdown.debtService, INITIAL_STATE.debtService);
});

// ── a-5: amortization mechanics ─────────────────────────────────────────────
console.log('\n=== 6.3 a-5 — per-debt amortization ===');

test('zero-APR debt: 12 × $1,000 payments on $12,000, then the payment drops to 0', () => {
  // Inflation off so the month-12 expense delta isolates the debt payoff.
  const rows = sim({ expenseInflation: false, debts: [debt({ balance: 12000, payment: 1000 })] });
  for (let m = 0; m < 12; m++) {
    assert.strictEqual(rows[m].expenseBreakdown.debtService, 1000, `month ${m}`);
  }
  assert.strictEqual(rows[12].expenseBreakdown.debtService, undefined, 'month 12 should carry no debt payment');
  assert.strictEqual(rows[12].expenses, rows[11].expenses - 1000);
});

test('12% APR on $10,000 at $1,000/mo: 10 full payments + ~$590 final, then 0', () => {
  const rows = sim({ debts: [debt({ balance: 10000, apr: 12, payment: 1000 })] });
  for (let m = 0; m < 10; m++) {
    assert.strictEqual(rows[m].expenseBreakdown.debtService, 1000, `month ${m}`);
  }
  // Final month pays exactly the remaining balance + interest (≈ $589.85)
  assert.strictEqual(rows[10].expenseBreakdown.debtService, 590);
  assert.strictEqual(rows[11].expenseBreakdown.debtService, undefined);
});

test('rows expose the remaining total debt balance (debtBalance), declining to 0', () => {
  const rows = sim({ debts: [debt({ balance: 12000, payment: 1000 })] });
  assert.strictEqual(rows[0].debtBalance, 11000);
  assert.strictEqual(rows[5].debtBalance, 6000);
  assert.strictEqual(rows[11].debtBalance, 0);
  assert.strictEqual(rows[20].debtBalance, 0);
});

test('payment below interest: balance grows, payment never stops (no phantom payoff)', () => {
  // $10,000 at 24% APR ($200/mo interest), paying only $100/mo
  const rows = sim({ debts: [debt({ balance: 10000, apr: 24, payment: 100 })] });
  const last = rows[rows.length - 1];
  assert.strictEqual(last.expenseBreakdown.debtService, 100);
  assert.ok(last.debtBalance > 10000, `balance should grow under negative amortization, got ${last.debtBalance}`);
});

test('multiple debts amortize independently; total payment steps down per payoff', () => {
  const rows = sim({
    debts: [
      debt({ id: 'a', balance: 3000, payment: 1000 }),  // pays off after m2
      debt({ id: 'b', balance: 24000, payment: 2000 }), // pays off after m11
    ],
  });
  assert.strictEqual(rows[0].expenseBreakdown.debtService, 3000);
  assert.strictEqual(rows[3].expenseBreakdown.debtService, 2000);
  assert.strictEqual(rows[12].expenseBreakdown.debtService, undefined);
});

test('entries with zero balance or zero payment are inert (do not disable the flat fallback alone)', () => {
  // A list containing ONLY inert entries behaves like an empty list → flat debtService
  const rows = sim({ debts: [debt({ balance: 0 }), debt({ id: 'p0', payment: 0 })] });
  assert.strictEqual(rows[0].expenseBreakdown.debtService, INITIAL_STATE.debtService);
});

test('retireDebt: true zeroes per-debt payments (keeps its meaning)', () => {
  const rows = sim({ retireDebt: true, debts: [debt({ balance: 50000, payment: 2000 })] });
  assert.strictEqual(rows[0].expenseBreakdown.debtService, undefined);
  assert.strictEqual(rows[0].debtBalance, 0);
});

test('retireDebt + savings funding: month-0 payoff outlay = sum of LIST balances, not legacy fields', () => {
  const debts = [debt({ id: 'a', balance: 30000, payment: 1000 }), debt({ id: 'b', balance: 20000, payment: 800 })];
  const advance = sim({ retireDebt: true, capitalFundingSource: 'advance', debts });
  const savings = sim({ retireDebt: true, capitalFundingSource: 'savings', debts });
  assert.strictEqual(advance[0].balance - savings[0].balance, 50000);
});

test('totalMonthlySpend back-calc subtracts the LIST payments when a debt list is present', () => {
  const statusQuoBcsMonthly = Math.round(Math.max(0, INITIAL_STATE.bcsAnnualTotal - 25000) / 12);
  const sFlat = gatherStateWithOverrides({ totalMonthlySpend: 50000 });
  assert.strictEqual(sFlat.baseExpenses,
    50000 - INITIAL_STATE.debtService - INITIAL_STATE.vanMonthlySavings - statusQuoBcsMonthly);
  const sList = gatherStateWithOverrides({
    totalMonthlySpend: 50000,
    debts: [debt({ balance: 50000, payment: 2000 })],
  });
  assert.strictEqual(sList.baseExpenses,
    50000 - 2000 - INITIAL_STATE.vanMonthlySavings - statusQuoBcsMonthly);
});

// ── b-12: mortgage P&I split ────────────────────────────────────────────────
console.log('\n=== 6.3 b-12 — mortgage P&I split ===');

test('mortgagePI is carved out of the inflating base: month-0 total unchanged, year-1 base inflates on (base − PI)', () => {
  const flat = sim({});
  const rows = sim({ mortgagePI: 5000 }); // no balance info → fixed payment forever
  assert.strictEqual(rows[0].expenses, flat[0].expenses, 'month-0 total should not change');
  assert.strictEqual(rows[0].expenseBreakdown.mortgagePI, 5000);
  assert.strictEqual(rows[0].expenseBreakdown.baseLiving, INITIAL_STATE.baseExpenses - 5000);
  const rate = INITIAL_STATE.expenseInflationRate / 100;
  assert.strictEqual(rows[12].expenseBreakdown.baseLiving,
    Math.round((INITIAL_STATE.baseExpenses - 5000) * (1 + rate)));
  // The P&I itself does NOT inflate
  assert.strictEqual(rows[12].expenseBreakdown.mortgagePI, 5000);
});

test('no balance info: fixed payment continues forever, home equity untouched', () => {
  const flat = sim({ homeAppreciation: 0 });
  const rows = sim({ mortgagePI: 5000, homeAppreciation: 0 });
  const last = rows[rows.length - 1];
  assert.strictEqual(last.expenseBreakdown.mortgagePI, 5000);
  assert.strictEqual(last.homeEquity, flat[flat.length - 1].homeEquity);
});

test('principal portion is credited to home equity each month (appreciation 0 isolates it)', () => {
  // $600k at 6% APR → m0 interest $3,000, principal $2,000; m1 interest $2,990, principal $2,010
  const rows = sim({ mortgagePI: 5000, mortgageBalance: 600000, mortgageRate: 6, homeAppreciation: 0 });
  const e0 = INITIAL_STATE.homeEquity;
  assert.strictEqual(rows[0].homeEquity, e0 + 2000);
  assert.strictEqual(rows[1].homeEquity, e0 + 2000 + 2010);
  assert.strictEqual(rows[0].mortgageBalance, 598000);
  assert.strictEqual(rows[1].mortgageBalance, 595990);
});

test('mortgage payment drops to zero at payoff (final payment capped at balance + interest)', () => {
  const rows = sim({ mortgagePI: 5000, mortgageBalance: 9000, mortgageRate: 0, homeAppreciation: 0 });
  assert.strictEqual(rows[0].expenseBreakdown.mortgagePI, 5000);
  assert.strictEqual(rows[1].expenseBreakdown.mortgagePI, 4000);
  assert.strictEqual(rows[2].expenseBreakdown.mortgagePI, undefined);
  assert.strictEqual(rows[1].mortgageBalance, 0);
  // Both payments were pure principal → equity up by the full $9,000
  assert.strictEqual(rows[2].homeEquity, INITIAL_STATE.homeEquity + 9000);
});

test('mortgagePI larger than baseExpenses clamps the inflatable base at 0', () => {
  const rows = sim({ baseExpenses: 4000, totalMonthlySpend: null, mortgagePI: 5000 });
  assert.strictEqual(rows[0].expenseBreakdown.baseLiving, 0);
  assert.strictEqual(rows[0].expenseBreakdown.mortgagePI, 5000);
});

// ── Schema validation (New Field Checklist) ─────────────────────────────────
console.log('\n=== 6.3 schema — sanitization + ranges ===');

test('debts: non-array input → []', () => {
  const r = validateAndSanitize({ ...INITIAL_STATE, debts: 'oops' });
  assert.deepStrictEqual(r.debts, []);
});

test('debts: junk entries dropped, numeric fields coerced + clamped, ids backfilled', () => {
  const r = validateAndSanitize({
    ...INITIAL_STATE,
    debts: [
      { name: 'CC', balance: '9000', apr: 99, payment: -5 },
      null,
      'x',
      { id: 'keep', name: 7, balance: 99_999_999, apr: 22.9, payment: 450 },
    ],
  });
  assert.strictEqual(r.debts.length, 2);
  assert.strictEqual(r.debts[0].balance, 9000);
  assert.strictEqual(r.debts[0].apr, 50);          // clamped to RANGE max
  assert.strictEqual(r.debts[0].payment, 0);       // clamped to ≥ 0
  assert.ok(typeof r.debts[0].id === 'string' && r.debts[0].id.length > 0);
  assert.strictEqual(r.debts[1].id, 'keep');
  assert.strictEqual(r.debts[1].name, 'Untitled debt'); // non-string name replaced
  assert.strictEqual(r.debts[1].balance, 5_000_000);    // clamped
});

test('mortgage fields: defaults fill, ranges clamp', () => {
  const r = validateAndSanitize({ ...INITIAL_STATE, mortgagePI: -10, mortgageBalance: 99_999_999, mortgageRate: 99 });
  assert.strictEqual(r.mortgagePI, 0);
  assert.strictEqual(r.mortgageBalance, 5_000_000);
  assert.strictEqual(r.mortgageRate, 25);
  const d = validateAndSanitize({});
  assert.strictEqual(d.mortgagePI, 0);
  assert.strictEqual(d.mortgageBalance, 0);
  assert.strictEqual(d.mortgageRate, 0);
  assert.deepStrictEqual(d.debts, []);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
