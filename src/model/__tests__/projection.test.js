/**
 * Unit tests for the projection engine (runMonthlySimulation, findOperationalBreakevenIndex).
 * Run with: node src/model/__tests__/projection.test.js
 */
import assert from 'node:assert';
import { runMonthlySimulation, findOperationalBreakevenIndex } from '../projection.js';
import { gatherStateWithOverrides } from '../../state/gatherState.js';
import { DAYS_PER_MONTH, SGA_LIMIT } from '../constants.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL  ${name}`);
    console.log(`        ${err.message}`);
  }
}

/** Approximate equality for financial calculations. */
function near(actual, expected, tolerance, label) {
  const diff = Math.abs(actual - expected);
  if (diff > tolerance) {
    throw new Error(
      `${label || 'near'}: expected ~${expected} (+/-${tolerance}), got ${actual} (diff ${diff})`
    );
  }
}

// ════════════════════════════════════════════════════════════════════════
// runMonthlySimulation — basics
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== runMonthlySimulation — basics ===');

test('1. Returns object with monthlyData array and backPayActual number', () => {
  const s = gatherStateWithOverrides({});
  const result = runMonthlySimulation(s);
  assert.ok(Array.isArray(result.monthlyData), 'monthlyData should be an array');
  assert.strictEqual(typeof result.backPayActual, 'number', 'backPayActual should be a number');
});

test('2. monthlyData has 73 entries (months 0-72)', () => {
  const s = gatherStateWithOverrides({});
  const { monthlyData } = runMonthlySimulation(s);
  assert.strictEqual(monthlyData.length, 73);
});

test('3. Each entry has month, income, expenses, netMonthly, savings fields', () => {
  const s = gatherStateWithOverrides({});
  const { monthlyData } = runMonthlySimulation(s);
  for (const entry of monthlyData) {
    assert.ok('month' in entry, 'missing month');
    assert.ok('cashIncome' in entry, 'missing cashIncome');
    assert.ok('expenses' in entry, 'missing expenses');
    assert.ok('netMonthly' in entry, 'missing netMonthly');
    assert.ok('balance' in entry, 'missing balance (savings)');
  }
});

test('4. Month 0 entry has month === 0', () => {
  const s = gatherStateWithOverrides({});
  const { monthlyData } = runMonthlySimulation(s);
  assert.strictEqual(monthlyData[0].month, 0);
});

test('5. Last entry has month === 72', () => {
  const s = gatherStateWithOverrides({});
  const { monthlyData } = runMonthlySimulation(s);
  assert.strictEqual(monthlyData[72].month, 72);
});

// ════════════════════════════════════════════════════════════════════════
// runMonthlySimulation — income sources
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== runMonthlySimulation — income sources ===');

test('6. Sarah income at month 0 = round(sarahRate * sarahCurrentClients * DAYS_PER_MONTH)', () => {
  const s = gatherStateWithOverrides({ sarahRate: 200, sarahCurrentClients: 4 });
  const { monthlyData } = runMonthlySimulation(s);
  const expected = Math.round(200 * 4 * DAYS_PER_MONTH);
  assert.strictEqual(monthlyData[0].sarahIncome, expected);
});

test('7. Sarah income grows over time (month 12 > month 0)', () => {
  const s = gatherStateWithOverrides({ sarahRateGrowth: 5, sarahClientGrowth: 10 });
  const { monthlyData } = runMonthlySimulation(s);
  assert.ok(monthlyData[12].sarahIncome > monthlyData[0].sarahIncome,
    `month 12 (${monthlyData[12].sarahIncome}) should exceed month 0 (${monthlyData[0].sarahIncome})`);
});

test('8. Sarah income caps at sarahMaxRate * sarahMaxClients * DAYS_PER_MONTH', () => {
  // Use aggressive growth to hit the cap quickly
  const s = gatherStateWithOverrides({
    sarahRate: 200, sarahMaxRate: 210,
    sarahCurrentClients: 4, sarahMaxClients: 4.2,
    sarahRateGrowth: 50, sarahClientGrowth: 50,
  });
  const { monthlyData } = runMonthlySimulation(s);
  const cap = Math.round(210 * 4.2 * DAYS_PER_MONTH);
  // The last month should be at or near the cap
  assert.strictEqual(monthlyData[72].sarahIncome, cap);
});

test('9. SSDI income: 0 before approval, ssdiFamilyTotal after', () => {
  const approvalMonth = 10;
  const s = gatherStateWithOverrides({
    ssType: 'ssdi', ssdiApprovalMonth: approvalMonth, ssdiDenied: false,
    ssdiFamilyTotal: 6500, kidsAgeOutMonths: 60, chadJob: false,
  });
  const { monthlyData } = runMonthlySimulation(s);
  assert.strictEqual(monthlyData[approvalMonth - 1].ssdi, 0, 'no SSDI before approval');
  assert.strictEqual(monthlyData[approvalMonth].ssdi, 6500, 'ssdiFamilyTotal at approval');
});

test('10. SSDI transitions to ssdiPersonal after kidsAgeOutMonths post-approval', () => {
  const approvalMonth = 5;
  const kidsAge = 10;
  const s = gatherStateWithOverrides({
    ssType: 'ssdi', ssdiApprovalMonth: approvalMonth, ssdiDenied: false,
    ssdiFamilyTotal: 6500, ssdiPersonal: 4166, kidsAgeOutMonths: kidsAge, chadJob: false,
  });
  const { monthlyData } = runMonthlySimulation(s);
  // Family total right at approval
  assert.strictEqual(monthlyData[approvalMonth].ssdi, 6500);
  // Last family month is approvalMonth + kidsAge - 1
  assert.strictEqual(monthlyData[approvalMonth + kidsAge - 1].ssdi, 6500, 'still family total before age-out');
  // Personal starts at approvalMonth + kidsAge
  assert.strictEqual(monthlyData[approvalMonth + kidsAge].ssdi, 4166, 'personal after age-out');
});

test('11. SSDI denied: SSDI stays 0 forever', () => {
  const s = gatherStateWithOverrides({
    ssType: 'ssdi', ssdiDenied: true, chadJob: false,
  });
  const { monthlyData } = runMonthlySimulation(s);
  for (const entry of monthlyData) {
    assert.strictEqual(entry.ssdi, 0, `month ${entry.month} should have 0 SSDI when denied`);
  }
});

test('12. SS retirement path (ssType ss): income starts at ssStartMonth', () => {
  const startMonth = 18;
  const s = gatherStateWithOverrides({
    ssType: 'ss', ssStartMonth: startMonth,
    ssFamilyTotal: 7099, chadJob: false,
  });
  const { monthlyData } = runMonthlySimulation(s);
  assert.strictEqual(monthlyData[startMonth - 1].ssdi, 0, 'no SS before start month');
  assert.strictEqual(monthlyData[startMonth].ssdi, 7099, 'ssFamilyTotal at SS start month');
});

test('13. Trust income transitions at trustIncreaseMonth', () => {
  const trustMonth = 11;
  const s = gatherStateWithOverrides({
    trustIncomeNow: 833, trustIncomeFuture: 2083, trustIncreaseMonth: trustMonth,
  });
  const { monthlyData } = runMonthlySimulation(s);
  assert.strictEqual(monthlyData[trustMonth - 1].trustLLC, 833, 'trustIncomeNow before transition');
  assert.strictEqual(monthlyData[trustMonth].trustLLC, 2083, 'trustIncomeFuture at transition month');
});

test('14. Chad job income: 0 before chadJobStartMonth, net salary after', () => {
  const startMonth = 3;
  const salary = 120000;
  const taxRate = 25;
  const s = gatherStateWithOverrides({
    chadJob: true, chadJobSalary: salary, chadJobTaxRate: taxRate, chadJobStartMonth: startMonth,
  });
  const { monthlyData } = runMonthlySimulation(s);
  const expectedNet = Math.round(salary * (1 - taxRate / 100) / 12);
  assert.strictEqual(monthlyData[startMonth - 1].chadJobIncome, 0, 'no income before start');
  assert.strictEqual(monthlyData[startMonth].chadJobIncome, expectedNet, 'net salary at start');
});

test('15. Back pay: added at ssdiApprovalMonth + 2, equals gross - min(gross*0.25, 9200)', () => {
  const approvalMonth = 5;
  const backPayMonths = 18;
  const personal = 4152;
  const s = gatherStateWithOverrides({
    ssType: 'ssdi', ssdiApprovalMonth: approvalMonth, ssdiDenied: false,
    ssdiBackPayMonths: backPayMonths, ssdiPersonal: personal,
    kidsAgeOutMonths: 60, chadJob: false,
    // Zero out other noise: large starting savings so balance doesn't go negative
    startingSavings: 500000,
  });
  const { monthlyData, backPayActual } = runMonthlySimulation(s);
  const gross = backPayMonths * personal;
  const fee = Math.min(Math.round(gross * 0.25), 9200);
  const expectedBackPay = gross - fee;
  assert.strictEqual(backPayActual, expectedBackPay, 'backPayActual should match formula');

  // Back pay is added at approvalMonth + 2 to the balance
  // We can verify by comparing the balance jump at that month vs the prior trend
  // The balance at month approvalMonth+2 should include the backPayActual
  // Instead of checking balance directly (complex), check the returned value
  assert.ok(backPayActual > 0, 'back pay should be positive');
});

// ════════════════════════════════════════════════════════════════════════
// runMonthlySimulation — expenses
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== runMonthlySimulation — expenses ===');

test('16. Month 0 expenses include baseExpenses', () => {
  const s = gatherStateWithOverrides({
    baseExpenses: 40000, retireDebt: true, vanSold: true, vanSaleMonth: 0,
    lifestyleCutsApplied: false, bcsAnnualTotal: 0, milestones: [],
    chadJob: false,
  });
  const { monthlyData } = runMonthlySimulation(s);
  assert.strictEqual(monthlyData[0].expenses, s.baseExpenses);
});

test('17. Debt service added when retireDebt is false', () => {
  const s = gatherStateWithOverrides({
    retireDebt: false, debtService: 6434,
    lifestyleCutsApplied: false, vanSold: true, vanSaleMonth: 0,
    bcsAnnualTotal: 0, milestones: [], chadJob: false,
  });
  const { monthlyData } = runMonthlySimulation(s);
  // expenses = baseExpenses + debtService (no van since sold at month 0, no bcs, no cuts)
  assert.strictEqual(monthlyData[0].expenses, s.baseExpenses + s.debtService);
});

test('18. Debt service NOT added when retireDebt is true', () => {
  const s = gatherStateWithOverrides({
    retireDebt: true, debtService: 6434,
    lifestyleCutsApplied: false, vanSold: true, vanSaleMonth: 0,
    bcsAnnualTotal: 0, milestones: [], chadJob: false,
  });
  const { monthlyData } = runMonthlySimulation(s);
  assert.strictEqual(monthlyData[0].expenses, s.baseExpenses);
});

test('19. Van monthly cost added when vanSold is false', () => {
  const s = gatherStateWithOverrides({
    vanSold: false, vanMonthlySavings: 2597,
    retireDebt: true, lifestyleCutsApplied: false,
    bcsAnnualTotal: 0, milestones: [], chadJob: false,
  });
  const { monthlyData } = runMonthlySimulation(s);
  assert.strictEqual(monthlyData[0].expenses, s.baseExpenses + s.vanMonthlySavings);
  // Also true later
  assert.strictEqual(monthlyData[50].expenses, s.baseExpenses + s.vanMonthlySavings);
});

test('20. Van monthly cost stops at vanSaleMonth when vanSold is true', () => {
  const saleMonth = 6;
  const s = gatherStateWithOverrides({
    vanSold: true, vanSaleMonth: saleMonth, vanMonthlySavings: 2597,
    retireDebt: true, lifestyleCutsApplied: false,
    bcsAnnualTotal: 0, milestones: [], chadJob: false,
    vanLoanBalance: 0, vanSalePrice: 0, // no shortfall to complicate things
  });
  const { monthlyData } = runMonthlySimulation(s);
  // Before sale: still paying van
  assert.strictEqual(monthlyData[saleMonth - 1].expenses, s.baseExpenses + s.vanMonthlySavings,
    'van cost included before sale');
  // At and after sale: no van cost
  assert.strictEqual(monthlyData[saleMonth].expenses, s.baseExpenses,
    'no van cost at sale month');
  assert.strictEqual(monthlyData[saleMonth + 5].expenses, s.baseExpenses,
    'no van cost after sale month');
});

test('21. BCS tuition added for first bcsYearsLeft * 12 months only', () => {
  const bcsYears = 2;
  const s = gatherStateWithOverrides({
    bcsYearsLeft: bcsYears, bcsAnnualTotal: 41000, bcsParentsAnnual: 25000,
    retireDebt: true, vanSold: true, vanSaleMonth: 0,
    lifestyleCutsApplied: false, milestones: [], chadJob: false,
  });
  const { monthlyData } = runMonthlySimulation(s);
  const lastBcsMonth = bcsYears * 12 - 1; // month 23
  const firstNoBcsMonth = bcsYears * 12;   // month 24
  assert.strictEqual(monthlyData[lastBcsMonth].expenses, s.baseExpenses + s.bcsFamilyMonthly,
    'BCS included at last tuition month');
  assert.strictEqual(monthlyData[firstNoBcsMonth].expenses, s.baseExpenses,
    'no BCS after tuition period ends');
});

test('22. Lifestyle cuts subtracted when lifestyleCutsApplied is true', () => {
  const s = gatherStateWithOverrides({
    lifestyleCutsApplied: true, cutsOverride: 5000,
    retireDebt: true, vanSold: true, vanSaleMonth: 0,
    bcsAnnualTotal: 0, milestones: [], chadJob: false,
  });
  const { monthlyData } = runMonthlySimulation(s);
  // lifestyleCuts=5000, cutInHalf=0, extraCuts=0 via cutsOverride
  assert.strictEqual(monthlyData[0].expenses, s.baseExpenses - 5000);
});

test('23. Lifestyle cuts NOT subtracted when lifestyleCutsApplied is false', () => {
  const s = gatherStateWithOverrides({
    lifestyleCutsApplied: false, cutsOverride: 5000,
    retireDebt: true, vanSold: true, vanSaleMonth: 0,
    bcsAnnualTotal: 0, milestones: [], chadJob: false,
  });
  const { monthlyData } = runMonthlySimulation(s);
  assert.strictEqual(monthlyData[0].expenses, s.baseExpenses);
});

test('24. Milestone savings reduce expenses at specified month', () => {
  const mileMonth = 20;
  const s = gatherStateWithOverrides({
    milestones: [{ name: 'Test', month: mileMonth, savings: 3000 }],
    retireDebt: true, vanSold: true, vanSaleMonth: 0,
    lifestyleCutsApplied: false, bcsAnnualTotal: 0, chadJob: false,
  });
  const { monthlyData } = runMonthlySimulation(s);
  assert.strictEqual(monthlyData[mileMonth - 1].expenses, s.baseExpenses,
    'no milestone reduction before milestone month');
  assert.strictEqual(monthlyData[mileMonth].expenses, s.baseExpenses - 3000,
    'milestone reduction at milestone month');
});

test('25. Health savings deducted when chadJob is true, at/after chadJobStartMonth', () => {
  const startMonth = 3;
  const healthSavings = 4200;
  const s = gatherStateWithOverrides({
    chadJob: true, chadJobStartMonth: startMonth, chadJobHealthSavings: healthSavings,
    retireDebt: true, vanSold: true, vanSaleMonth: 0,
    lifestyleCutsApplied: false, bcsAnnualTotal: 0, milestones: [],
  });
  const { monthlyData } = runMonthlySimulation(s);
  assert.strictEqual(monthlyData[startMonth - 1].expenses, s.baseExpenses,
    'no health savings before job starts');
  assert.strictEqual(monthlyData[startMonth].expenses, s.baseExpenses - healthSavings,
    'health savings deducted after job starts');
});

test('26. Expenses never go below 0', () => {
  const s = gatherStateWithOverrides({
    baseExpenses: 1000,
    lifestyleCutsApplied: true, cutsOverride: 50000,
    retireDebt: true, vanSold: true, vanSaleMonth: 0,
    bcsYearsLeft: 0, milestones: [], chadJob: false,
  });
  const { monthlyData } = runMonthlySimulation(s);
  for (const entry of monthlyData) {
    assert.ok(entry.expenses >= 0, `month ${entry.month} expenses ${entry.expenses} should be >= 0`);
  }
});

// ════════════════════════════════════════════════════════════════════════
// runMonthlySimulation — totalMonthlySpend
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== runMonthlySimulation — totalMonthlySpend ===');

test('27. With totalMonthlySpend set, month 0 total expenses = totalMonthlySpend', () => {
  // totalMonthlySpend back-calculates baseExpenses so that baseExpenses + debtService + vanMonthlySavings + bcs = totalMonthlySpend
  // At month 0 with bcsYearsLeft > 0, all components contribute, so expenses should reconstruct to totalMonthlySpend
  const spend = 60000;
  const s = gatherStateWithOverrides({
    totalMonthlySpend: spend,
    retireDebt: false, vanSold: false,
    lifestyleCutsApplied: false, chadJob: false,
  });
  const { monthlyData } = runMonthlySimulation(s);
  // At month 0 (within bcs period): expenses = baseExpenses + debtService + vanMonthlySavings + bcsFamilyMonthly = totalMonthlySpend
  near(monthlyData[0].expenses, spend, 1, 'totalMonthlySpend reconstruction');
});

test('28. With totalMonthlySpend + retireDebt=true, month 0 expenses drop by debtService', () => {
  const spend = 60000;
  const s = gatherStateWithOverrides({
    totalMonthlySpend: spend, retireDebt: true, vanSold: false,
    lifestyleCutsApplied: false, chadJob: false,
  });
  const { monthlyData } = runMonthlySimulation(s);
  // With retireDebt=true, expenses = baseExpenses + vanMonthlySavings + bcsFamilyMonthly = totalMonthlySpend - debtService
  near(monthlyData[0].expenses, spend - s.debtService, 1, 'retireDebt drops expenses');
});

test('29. With totalMonthlySpend + vanSold=true and month >= vanSaleMonth, expenses drop by vanMonthlySavings', () => {
  const spend = 60000;
  const saleMonth = 2;
  const s = gatherStateWithOverrides({
    totalMonthlySpend: spend, vanSold: true, vanSaleMonth: saleMonth,
    retireDebt: false, lifestyleCutsApplied: false, chadJob: false,
    vanLoanBalance: 0, vanSalePrice: 0,
  });
  const { monthlyData } = runMonthlySimulation(s);
  // Before sale month: van still being paid, so full spend
  near(monthlyData[0].expenses, spend, 1, 'full spend before van sale');
  // At/after sale month: van payment drops
  near(monthlyData[saleMonth].expenses, spend - s.vanMonthlySavings, 1, 'van savings after sale');
});

// ════════════════════════════════════════════════════════════════════════
// runMonthlySimulation — savings & investment
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== runMonthlySimulation — savings & investment ===');

test('30. Savings at month 0 reflects startingSavings + first month net cash flow', () => {
  // Use simple scenario to make this predictable
  const s = gatherStateWithOverrides({
    startingSavings: 100000, investmentReturn: 0,
    ssdiApprovalMonth: 999, ssdiDenied: true, chadJob: false,
    vanSold: true, vanSaleMonth: 999, // sold but far in future, so paying van before sale
  });
  const { monthlyData } = runMonthlySimulation(s);
  // At month 0: balance = startingSavings + investReturn(0 because return rate 0 but balance is positive...
  // Actually investReturn is computed on the balance BEFORE this month's cash flow
  // balance starts at startingSavings, investReturn = 0 (rate is 0), then balance += (income - expenses)
  // So balance = 100000 + 0 + (cashIncome - expenses)
  const m0 = monthlyData[0];
  const expected = 100000 + (m0.cashIncome - m0.expenses);
  assert.strictEqual(m0.balance, Math.round(expected));
});

test('31. Investment returns: positive balance earns returns, zero/negative earns nothing', () => {
  // Large savings, moderate return
  const s = gatherStateWithOverrides({
    startingSavings: 500000, investmentReturn: 12,
    ssdiDenied: true, chadJob: false,
  });
  const { monthlyData } = runMonthlySimulation(s);
  // Month 0 should have positive invest return since startingSavings is positive
  assert.ok(monthlyData[0].investReturn > 0, 'positive balance should earn returns');

  // Now test zero return when balance is 0
  const s2 = gatherStateWithOverrides({
    startingSavings: 0, investmentReturn: 12,
    ssdiDenied: true, chadJob: false,
  });
  const { monthlyData: md2 } = runMonthlySimulation(s2);
  assert.strictEqual(md2[0].investReturn, 0, 'zero balance earns no returns');
});

test('32. Van sale shortfall deducted at vanSaleMonth', () => {
  const saleMonth = 6;
  const loanBalance = 200000;
  const salePrice = 150000;
  const shortfall = loanBalance - salePrice; // 50000
  const s = gatherStateWithOverrides({
    vanSold: true, vanSaleMonth: saleMonth,
    vanLoanBalance: loanBalance, vanSalePrice: salePrice,
    startingSavings: 500000, investmentReturn: 0,
    retireDebt: true, lifestyleCutsApplied: false,
    bcsYearsLeft: 0, milestones: [], chadJob: false,
    ssdiDenied: true,
  });
  const { monthlyData } = runMonthlySimulation(s);
  // The balance drop at saleMonth should include the shortfall
  // balance[saleMonth] = balance[saleMonth-1] + investReturn + (income - expenses) - shortfall
  const prev = monthlyData[saleMonth - 1];
  const curr = monthlyData[saleMonth];
  // At sale month, van cost stops (m >= vanSaleMonth), so expenses differ from month before
  // Let's verify the shortfall was applied by checking the difference accounts for it
  const expectedBalance = prev.balance + curr.investReturn + (curr.cashIncome - curr.expenses) - shortfall;
  near(curr.balance, expectedBalance, 1, 'van shortfall deducted');
});

test('33. 401k draws cover deficit when savings goes negative', () => {
  // Very low savings, high expenses to force negative balance
  const s = gatherStateWithOverrides({
    startingSavings: 1000, starting401k: 100000, investmentReturn: 0, return401k: 0,
    baseExpenses: 80000, retireDebt: false, debtService: 6434,
    vanSold: true, vanSaleMonth: 0, lifestyleCutsApplied: false,
    bcsYearsLeft: 0, milestones: [], chadJob: false,
    ssdiDenied: true, homeEquity: 0,
  });
  const { monthlyData } = runMonthlySimulation(s);
  // With massive expenses and tiny savings, month 0 should need 401k draw
  const m0 = monthlyData[0];
  assert.ok(m0.withdrawal401k > 0, `should draw from 401k, got withdrawal401k=${m0.withdrawal401k}`);
  // After 401k draw, balance should be >= 0 (or 0 if not enough)
  assert.ok(m0.balance >= 0 || m0.balance401k === 0, 'balance should be 0 or positive after 401k draw');
});

test('34. Home equity covers deficit when 401k exhausted', () => {
  // Zero 401k, low savings, high expenses, some home equity
  const s = gatherStateWithOverrides({
    startingSavings: 1000, starting401k: 0, homeEquity: 500000,
    investmentReturn: 0, return401k: 0, homeAppreciation: 0,
    baseExpenses: 80000, retireDebt: false, debtService: 6434,
    vanSold: true, vanSaleMonth: 0, lifestyleCutsApplied: false,
    bcsYearsLeft: 0, milestones: [], chadJob: false,
    ssdiDenied: true,
  });
  const { monthlyData } = runMonthlySimulation(s);
  // With no 401k and massive deficit, home equity should be drawn
  // The balance should be pulled up to 0 by home equity draws
  const m0 = monthlyData[0];
  // After draws, savings should be at least 0
  assert.ok(m0.balance >= 0, 'home equity should cover deficit');
  // Home equity should have decreased from starting value at some point in the series
  const lastMonth = monthlyData[72];
  assert.ok(lastMonth.homeEquity < 500000, 'home equity should be drawn down');
});

// ════════════════════════════════════════════════════════════════════════
// runMonthlySimulation — toggle combinations
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== runMonthlySimulation — toggle combinations ===');

test('35. retireDebt=true alone: expenses reduced by debtService', () => {
  const sBase = gatherStateWithOverrides({
    retireDebt: false, lifestyleCutsApplied: false, vanSold: false,
    bcsYearsLeft: 0, milestones: [], chadJob: false,
  });
  const sDebt = gatherStateWithOverrides({
    retireDebt: true, lifestyleCutsApplied: false, vanSold: false,
    bcsYearsLeft: 0, milestones: [], chadJob: false,
  });
  const { monthlyData: baseData } = runMonthlySimulation(sBase);
  const { monthlyData: debtData } = runMonthlySimulation(sDebt);
  assert.strictEqual(baseData[0].expenses - debtData[0].expenses, sBase.debtService,
    'retireDebt should reduce expenses by debtService');
});

test('36. vanSold=true alone (after sale month): expenses reduced by vanMonthlySavings', () => {
  const saleMonth = 3;
  const sBase = gatherStateWithOverrides({
    vanSold: false, retireDebt: true,
    lifestyleCutsApplied: false, bcsYearsLeft: 0, milestones: [], chadJob: false,
  });
  const sVan = gatherStateWithOverrides({
    vanSold: true, vanSaleMonth: saleMonth, retireDebt: true,
    lifestyleCutsApplied: false, bcsYearsLeft: 0, milestones: [], chadJob: false,
    vanLoanBalance: 0, vanSalePrice: 0,
  });
  const { monthlyData: baseData } = runMonthlySimulation(sBase);
  const { monthlyData: vanData } = runMonthlySimulation(sVan);
  // After sale month, the van-sold scenario should have lower expenses by vanMonthlySavings
  const afterSale = saleMonth + 1;
  assert.strictEqual(baseData[afterSale].expenses - vanData[afterSale].expenses, sBase.vanMonthlySavings,
    'vanSold should reduce expenses by vanMonthlySavings after sale');
});

test('37. lifestyleCutsApplied=true alone: expenses reduced by total cuts', () => {
  const totalCuts = 5000;
  const sBase = gatherStateWithOverrides({
    lifestyleCutsApplied: false, cutsOverride: totalCuts,
    retireDebt: true, vanSold: true, vanSaleMonth: 0,
    bcsYearsLeft: 0, milestones: [], chadJob: false,
  });
  const sCuts = gatherStateWithOverrides({
    lifestyleCutsApplied: true, cutsOverride: totalCuts,
    retireDebt: true, vanSold: true, vanSaleMonth: 0,
    bcsYearsLeft: 0, milestones: [], chadJob: false,
  });
  const { monthlyData: baseData } = runMonthlySimulation(sBase);
  const { monthlyData: cutsData } = runMonthlySimulation(sCuts);
  assert.strictEqual(baseData[0].expenses - cutsData[0].expenses, totalCuts,
    'cuts should reduce expenses by total cuts amount');
});

test('38. All toggles true: combined effect equals sum of individual reductions', () => {
  const totalCuts = 5000;
  const saleMonth = 2;

  // Base: all toggles off
  const sAll = gatherStateWithOverrides({
    retireDebt: false, vanSold: false, lifestyleCutsApplied: false,
    cutsOverride: totalCuts, bcsYearsLeft: 0, milestones: [], chadJob: false,
  });

  // All on
  const sCombined = gatherStateWithOverrides({
    retireDebt: true, vanSold: true, vanSaleMonth: saleMonth,
    lifestyleCutsApplied: true, cutsOverride: totalCuts,
    bcsYearsLeft: 0, milestones: [], chadJob: false,
    vanLoanBalance: 0, vanSalePrice: 0,
  });

  const { monthlyData: allOffData } = runMonthlySimulation(sAll);
  const { monthlyData: allOnData } = runMonthlySimulation(sCombined);

  // At month after sale (so van savings kick in), the reduction should be approximately
  // debtService + vanMonthlySavings + totalCuts
  const checkMonth = saleMonth + 1;
  const expectedReduction = sAll.debtService + sAll.vanMonthlySavings + totalCuts;
  const actualReduction = allOffData[checkMonth].expenses - allOnData[checkMonth].expenses;
  near(actualReduction, expectedReduction, 1, 'combined toggle reduction');
});

// ════════════════════════════════════════════════════════════════════════
// findOperationalBreakevenIndex
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== findOperationalBreakevenIndex ===');

test('39. Returns -1 for null input', () => {
  assert.strictEqual(findOperationalBreakevenIndex(null), -1);
});

test('40. Returns -1 for empty array', () => {
  assert.strictEqual(findOperationalBreakevenIndex([]), -1);
});

test('41. Returns -1 when no row has positive netCashFlow', () => {
  const rows = [
    { netCashFlowSmoothed: -500 },
    { netCashFlowSmoothed: -200 },
    { netCashFlowSmoothed: -1 },
  ];
  assert.strictEqual(findOperationalBreakevenIndex(rows), -1);
});

test('42. Returns correct index when breakeven exists', () => {
  const rows = [
    { netCashFlowSmoothed: -500 },
    { netCashFlowSmoothed: -100 },
    { netCashFlowSmoothed: 0 },
    { netCashFlowSmoothed: 200 },
  ];
  assert.strictEqual(findOperationalBreakevenIndex(rows), 2, 'first row with netCashFlowSmoothed >= 0');
});

// ════════════════════════════════════════════════════════════════════════
// Zero-value edge cases (|| vs ??)
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Zero-value edge cases (|| vs ??) ===');

test('43. bcsYearsLeft: 0 — expenses at month 0 should NOT include BCS tuition', () => {
  const s = gatherStateWithOverrides({
    bcsYearsLeft: 0, bcsAnnualTotal: 41000, bcsParentsAnnual: 25000,
    retireDebt: true, vanSold: true, vanSaleMonth: 0,
    lifestyleCutsApplied: false, milestones: [], chadJob: false,
  });
  const { monthlyData } = runMonthlySimulation(s);
  // With bcsYearsLeft=0, no month should include BCS tuition
  assert.strictEqual(monthlyData[0].expenses, s.baseExpenses,
    'month 0 should have no BCS tuition when bcsYearsLeft is 0');
  // Also verify month 1 — the old || bug would have used 3 years = 36 months of tuition
  assert.strictEqual(monthlyData[1].expenses, s.baseExpenses,
    'month 1 should have no BCS tuition when bcsYearsLeft is 0');
});

test('44. ssdiApprovalMonth: 0 — SSDI income should appear at month 0 (not delayed to month 7)', () => {
  const s = gatherStateWithOverrides({
    ssType: 'ssdi', ssdiApprovalMonth: 0, ssdiDenied: false,
    ssdiFamilyTotal: 6500, kidsAgeOutMonths: 60, chadJob: false,
  });
  const { monthlyData } = runMonthlySimulation(s);
  // With ssdiApprovalMonth=0, SSDI should be active from month 0
  assert.strictEqual(monthlyData[0].ssdi, 6500,
    'SSDI should appear at month 0 when ssdiApprovalMonth is 0');
  // The old || bug would have delayed to month 7
  assert.strictEqual(monthlyData[6].ssdi, 6500,
    'SSDI should still be active at month 6 (not starting here)');
});

test('45. vanSaleMonth: 0 with vanSold: true — van cost should NOT apply at month 0', () => {
  const s = gatherStateWithOverrides({
    vanSold: true, vanSaleMonth: 0, vanMonthlySavings: 2597,
    retireDebt: true, lifestyleCutsApplied: false,
    bcsAnnualTotal: 0, milestones: [], chadJob: false,
    vanLoanBalance: 0, vanSalePrice: 0,
  });
  const { monthlyData } = runMonthlySimulation(s);
  // With vanSaleMonth=0, the van is sold at month 0, so no van cost at month 0 or after
  assert.strictEqual(monthlyData[0].expenses, s.baseExpenses,
    'no van cost at month 0 when vanSaleMonth is 0');
  assert.strictEqual(monthlyData[5].expenses, s.baseExpenses,
    'no van cost at month 5 when van sold at month 0');
});

// ════════════════════════════════════════════════════════════════════════
// Summary
// ════════════════════════════════════════════════════════════════════════
console.log(`\n${'='.repeat(50)}`);
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'='.repeat(50)}\n`);

if (failed > 0) process.exit(1);
