/**
 * Tests for causalDelta — attribution of balance differences to components.
 *
 * Run with: node src/advisor/__tests__/diffMonthly.test.js
 */
import assert from 'node:assert';
import { causalDelta } from '../diffMonthly.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${err.message}`);
  }
}

console.log('\n=== causalDelta — basic attribution ===');

test('Identical inputs return zero balance delta and zero contributors', () => {
  const a = [{ month: 12, balance: 50000, sarahIncome: 5000, expenses: 4000, cashIncome: 5000, investReturn: 100, netMonthly: 1100 }];
  const b = [{ month: 12, balance: 50000, sarahIncome: 5000, expenses: 4000, cashIncome: 5000, investReturn: 100, netMonthly: 1100 }];
  const result = causalDelta(a, b, 12);
  assert.strictEqual(result.balanceDelta, 0);
  assert.strictEqual(result.contributors.length, 0);
});

test('Income increase shows up as positive contributor', () => {
  const a = [{ month: 12, balance: 50000, sarahIncome: 5000, expenses: 4000 }];
  const b = [{ month: 12, balance: 53000, sarahIncome: 8000, expenses: 4000 }];
  const result = causalDelta(a, b, 12);
  assert.strictEqual(result.balanceDelta, 3000);
  const sarah = result.contributors.find((c) => c.component === 'sarahIncome');
  assert.ok(sarah, 'sarahIncome contributor should exist');
  assert.strictEqual(sarah.delta, 3000);
});

test('Expense increase shows up as negative contributor (sign-inverted)', () => {
  // expense.delta is sign-flipped so positive = good for balance.
  const a = [{ month: 12, balance: 50000, sarahIncome: 5000, expenses: 4000, expenseBreakdown: { baseLiving: 4000 } }];
  const b = [{ month: 12, balance: 47000, sarahIncome: 5000, expenses: 7000, expenseBreakdown: { baseLiving: 7000 } }];
  const result = causalDelta(a, b, 12);
  assert.strictEqual(result.balanceDelta, -3000);
  const exp = result.contributors.find((c) => c.component === 'expense.baseLiving');
  assert.ok(exp, 'expense.baseLiving contributor should exist');
  assert.strictEqual(exp.delta, -3000); // raised expenses → negative effect on balance
});

test('Multiple deltas: contributors sorted by absolute magnitude', () => {
  const a = [{
    month: 12, balance: 50000,
    sarahIncome: 5000, chadJobIncome: 3000, expenses: 4000,
    chadJobSalaryNet: 3000,
    expenseBreakdown: { baseLiving: 4000 },
  }];
  const b = [{
    month: 12, balance: 60000,
    sarahIncome: 6000, chadJobIncome: 11000, expenses: 5000,
    chadJobSalaryNet: 11000,
    expenseBreakdown: { baseLiving: 5000 },
  }];
  const result = causalDelta(a, b, 12);
  // chadJob.Salary delta = +8000, sarahIncome delta = +1000, expense.baseLiving delta = -1000
  assert.ok(result.contributors.length >= 3);
  // First contributor should be the largest magnitude
  assert.strictEqual(result.contributors[0].component, 'chadJob.Salary');
  assert.strictEqual(result.contributors[0].delta, 8000);
  // Sort ordering: |8000| > |1000| ≥ |-1000|
  for (let i = 1; i < result.contributors.length; i++) {
    assert.ok(Math.abs(result.contributors[i - 1].delta) >= Math.abs(result.contributors[i].delta),
      `contributors must be sorted by absolute magnitude descending`);
  }
});

test('topN cap respected', () => {
  const a = [{
    month: 12, balance: 0,
    sarahIncome: 0, msftLump: 0, trustLLC: 0, ssBenefit: 0, consulting: 0, chadJobIncome: 0, customLeverMonthly: 0, investReturn: 0,
  }];
  const b = [{
    month: 12, balance: 100,
    sarahIncome: 10, msftLump: 10, trustLLC: 10, ssBenefit: 10, consulting: 10, chadJobIncome: 10, customLeverMonthly: 10, investReturn: 10,
  }];
  const result = causalDelta(a, b, 12, { topN: 3 });
  assert.strictEqual(result.contributors.length, 3);
});

test('atMonth not present in either array returns zero delta with empty contributors', () => {
  const a = [{ month: 0, balance: 100 }];
  const b = [{ month: 0, balance: 200 }];
  const result = causalDelta(a, b, 99);
  assert.strictEqual(result.balanceDelta, 0);
  assert.strictEqual(result.contributors.length, 0);
});

test('pctOfMagnitude sums to ~100%', () => {
  const a = [{ month: 12, balance: 0, sarahIncome: 1000, chadJobIncome: 1000, expenses: 0, chadJobSalaryNet: 1000 }];
  const b = [{ month: 12, balance: 4000, sarahIncome: 3000, chadJobIncome: 5000, expenses: 0, chadJobSalaryNet: 5000 }];
  const result = causalDelta(a, b, 12);
  const totalPct = result.contributors.reduce((s, c) => s + c.pctOfMagnitude, 0);
  // Allow small rounding error
  assert.ok(Math.abs(totalPct - 100) < 1, `expected ~100%, got ${totalPct}`);
});

console.log(`\n${'='.repeat(60)}`);
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'='.repeat(60)}\n`);

if (failed > 0) process.exit(1);
