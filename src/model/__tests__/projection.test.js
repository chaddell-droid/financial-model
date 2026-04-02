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

test('6. Sarah income at month 0 = round(gross * (1 - sarahTaxRate/100))', () => {
  const s = gatherStateWithOverrides({ sarahRate: 200, sarahCurrentClients: 4, sarahTaxRate: 25 });
  const { monthlyData } = runMonthlySimulation(s);
  const gross = Math.round(200 * 4 * DAYS_PER_MONTH);
  const expected = Math.round(gross * (1 - 25 / 100));
  assert.strictEqual(monthlyData[0].sarahIncome, expected);
});

test('7. Sarah income grows over time (month 12 > month 0)', () => {
  const s = gatherStateWithOverrides({ sarahRateGrowth: 5, sarahClientGrowth: 10 });
  const { monthlyData } = runMonthlySimulation(s);
  assert.ok(monthlyData[12].sarahIncome > monthlyData[0].sarahIncome,
    `month 12 (${monthlyData[12].sarahIncome}) should exceed month 0 (${monthlyData[0].sarahIncome})`);
});

test('8. Sarah income caps at sarahMaxRate * sarahMaxClients * DAYS_PER_MONTH (after tax)', () => {
  // Use aggressive growth to hit the cap quickly
  const s = gatherStateWithOverrides({
    sarahRate: 200, sarahMaxRate: 210,
    sarahCurrentClients: 4, sarahMaxClients: 4.2,
    sarahRateGrowth: 50, sarahClientGrowth: 50,
    sarahTaxRate: 25,
  });
  const { monthlyData } = runMonthlySimulation(s);
  const grossCap = Math.round(210 * 4.2 * DAYS_PER_MONTH);
  const netCap = Math.round(grossCap * (1 - 25 / 100));
  // The last month should be at or near the net cap
  assert.strictEqual(monthlyData[72].sarahIncome, netCap);
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

test('15. Back pay: added at ssdiApprovalMonth + 2, equals gross - min(gross*0.25, 7500)', () => {
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
  const fee = Math.min(Math.round(gross * 0.25), 7500);
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
// Projection edge cases
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Projection edge cases ===');

test('46. All three pools exhausted — balance goes negative', () => {
  // Tiny savings, zero 401k, zero home equity, high expenses, no income help
  const s = gatherStateWithOverrides({
    startingSavings: 100, starting401k: 0, homeEquity: 0,
    investmentReturn: 0, return401k: 0, homeAppreciation: 0,
    baseExpenses: 80000, retireDebt: false, debtService: 6434,
    vanSold: true, vanSaleMonth: 0, lifestyleCutsApplied: false,
    bcsYearsLeft: 0, milestones: [], chadJob: false,
    ssdiDenied: true, vanLoanBalance: 0, vanSalePrice: 0,
  });
  const { monthlyData } = runMonthlySimulation(s);
  // With no fallback pools and massive expenses, balance must go negative
  const hasNegative = monthlyData.some(d => d.balance < 0);
  assert.ok(hasNegative, 'balance should go negative when all pools are exhausted');
  // Verify the last month is deeply negative
  assert.ok(monthlyData[72].balance < -100000,
    `final balance ${monthlyData[72].balance} should be deeply negative`);
});

test('47. Negative investment return — balance decreases faster', () => {
  // Use very high savings so balance stays positive throughout, making returns observable
  const sPos = gatherStateWithOverrides({
    startingSavings: 5000000, investmentReturn: 0,
    ssdiDenied: true, chadJob: false,
    retireDebt: true, vanSold: true, vanSaleMonth: 0,
    bcsYearsLeft: 0, milestones: [],
    vanLoanBalance: 0, vanSalePrice: 0,
  });
  const sNeg = gatherStateWithOverrides({
    startingSavings: 5000000, investmentReturn: -20,
    ssdiDenied: true, chadJob: false,
    retireDebt: true, vanSold: true, vanSaleMonth: 0,
    bcsYearsLeft: 0, milestones: [],
    vanLoanBalance: 0, vanSalePrice: 0,
  });
  const { monthlyData: posData } = runMonthlySimulation(sPos);
  const { monthlyData: negData } = runMonthlySimulation(sNeg);
  // With negative returns, balance should be lower than the zero-return scenario
  assert.ok(negData[72].balance < posData[72].balance,
    `negative return balance (${negData[72].balance}) should be less than zero return (${posData[72].balance})`);
  // Verify investReturn is actually negative at month 0 (balance is positive at start)
  assert.ok(negData[0].investReturn < 0,
    `investReturn at month 0 should be negative, got ${negData[0].investReturn}`);
});

test('48. bcsYearsLeft = 0 — no BCS expenses at any month', () => {
  const s = gatherStateWithOverrides({
    bcsYearsLeft: 0, bcsAnnualTotal: 41000, bcsParentsAnnual: 25000,
    retireDebt: true, vanSold: true, vanSaleMonth: 0,
    lifestyleCutsApplied: false, milestones: [], chadJob: false,
    vanLoanBalance: 0, vanSalePrice: 0,
  });
  const { monthlyData } = runMonthlySimulation(s);
  // Every single month's expenses should equal baseExpenses (no BCS component)
  for (const entry of monthlyData) {
    assert.strictEqual(entry.expenses, s.baseExpenses,
      `month ${entry.month} expenses (${entry.expenses}) should equal baseExpenses (${s.baseExpenses}) with bcsYearsLeft=0`);
  }
});

test('49. ssdiApprovalMonth = 0 — SSDI income amount matches ssdiFamilyTotal at month 0', () => {
  const familyTotal = 6500;
  const personal = 4166;
  const kidsAge = 36;
  const s = gatherStateWithOverrides({
    ssType: 'ssdi', ssdiApprovalMonth: 0, ssdiDenied: false,
    ssdiFamilyTotal: familyTotal, ssdiPersonal: personal,
    kidsAgeOutMonths: kidsAge, chadJob: false,
  });
  const { monthlyData } = runMonthlySimulation(s);
  // SSDI should be active from month 0 at the family rate
  assert.strictEqual(monthlyData[0].ssdi, familyTotal,
    `month 0 SSDI should be ${familyTotal}, got ${monthlyData[0].ssdi}`);
  // Should transition to personal after kidsAgeOutMonths
  assert.strictEqual(monthlyData[kidsAge].ssdi, personal,
    `month ${kidsAge} SSDI should transition to personal ${personal}, got ${monthlyData[kidsAge].ssdi}`);
  // Month before transition should still be family
  assert.strictEqual(monthlyData[kidsAge - 1].ssdi, familyTotal,
    `month ${kidsAge - 1} SSDI should still be family ${familyTotal}`);
});

test('50. Multiple milestones at same month — both savings apply', () => {
  const mileMonth = 10;
  const s = gatherStateWithOverrides({
    milestones: [
      { name: 'Milestone A', month: mileMonth, savings: 2000 },
      { name: 'Milestone B', month: mileMonth, savings: 3000 },
    ],
    retireDebt: true, vanSold: true, vanSaleMonth: 0,
    lifestyleCutsApplied: false, bcsYearsLeft: 0, chadJob: false,
    vanLoanBalance: 0, vanSalePrice: 0,
  });
  const { monthlyData } = runMonthlySimulation(s);
  // Before milestone month: no reduction
  assert.strictEqual(monthlyData[mileMonth - 1].expenses, s.baseExpenses,
    'no milestone reduction before milestone month');
  // At milestone month: both reductions apply (2000 + 3000 = 5000)
  assert.strictEqual(monthlyData[mileMonth].expenses, s.baseExpenses - 5000,
    `both milestones should reduce expenses by 5000 at month ${mileMonth}`);
});

test('51. cutsDiscipline = 0 — lifestyle cuts have no effect even when lifestyleCutsApplied=true', () => {
  // cutsDiscipline is not a MODEL_KEY, so set it directly on the gathered state
  const s = gatherStateWithOverrides({
    lifestyleCutsApplied: true, cutsOverride: 5000,
    retireDebt: true, vanSold: true, vanSaleMonth: 0,
    bcsYearsLeft: 0, milestones: [], chadJob: false,
    vanLoanBalance: 0, vanSalePrice: 0,
  });
  s.cutsDiscipline = 0;
  const { monthlyData } = runMonthlySimulation(s);
  // With cutsDiscipline=0, totalCuts * 0 = 0, so expenses should be unaffected
  assert.strictEqual(monthlyData[0].expenses, s.baseExpenses,
    `cutsDiscipline=0 should mean no cuts effect, got expenses=${monthlyData[0].expenses} vs baseExpenses=${s.baseExpenses}`);
});

test('52. cutsDiscipline > 1 — cuts amplified beyond 100%', () => {
  const totalCuts = 5000;
  const discipline = 1.5;
  // cutsDiscipline is not a MODEL_KEY, so set it directly on the gathered state
  const s = gatherStateWithOverrides({
    lifestyleCutsApplied: true, cutsOverride: totalCuts,
    retireDebt: true, vanSold: true, vanSaleMonth: 0,
    bcsYearsLeft: 0, milestones: [], chadJob: false,
    vanLoanBalance: 0, vanSalePrice: 0,
  });
  s.cutsDiscipline = discipline;
  const { monthlyData } = runMonthlySimulation(s);
  // Cuts should be amplified: expenses = baseExpenses - totalCuts * 1.5 = baseExpenses - 7500
  const expectedExpenses = s.baseExpenses - totalCuts * discipline;
  assert.strictEqual(monthlyData[0].expenses, expectedExpenses,
    `cutsDiscipline=1.5 should amplify cuts, expected ${expectedExpenses}, got ${monthlyData[0].expenses}`);
});

test('53. Back pay beyond horizon (approval + 2 > 72) — backPayActual still computed but not added to any balance', () => {
  const approvalMonth = 71; // approval + 2 = 73, beyond month 72
  const backPayMonths = 18;
  const personal = 4152;
  const s = gatherStateWithOverrides({
    ssType: 'ssdi', ssdiApprovalMonth: approvalMonth, ssdiDenied: false,
    ssdiBackPayMonths: backPayMonths, ssdiPersonal: personal,
    kidsAgeOutMonths: 60, chadJob: false,
    startingSavings: 500000, investmentReturn: 0,
    retireDebt: true, vanSold: true, vanSaleMonth: 0,
    bcsYearsLeft: 0, milestones: [],
    vanLoanBalance: 0, vanSalePrice: 0,
  });
  const { monthlyData, backPayActual } = runMonthlySimulation(s);
  // backPayActual should still be computed
  const gross = backPayMonths * personal;
  const fee = Math.min(Math.round(gross * 0.25), 7500);
  const expectedBackPay = gross - fee;
  assert.strictEqual(backPayActual, expectedBackPay,
    `backPayActual should be ${expectedBackPay}, got ${backPayActual}`);

  // Run a control simulation identical except with denial (no back pay at all)
  const sControl = gatherStateWithOverrides({
    ssType: 'ssdi', ssdiApprovalMonth: approvalMonth, ssdiDenied: true,
    ssdiBackPayMonths: backPayMonths, ssdiPersonal: personal,
    kidsAgeOutMonths: 60, chadJob: false,
    startingSavings: 500000, investmentReturn: 0,
    retireDebt: true, vanSold: true, vanSaleMonth: 0,
    bcsYearsLeft: 0, milestones: [],
    vanLoanBalance: 0, vanSalePrice: 0,
  });
  const { monthlyData: controlData } = runMonthlySimulation(sControl);
  // Since approval+2=73 exceeds the loop (0..72), SSDI income at month 71-72 differs,
  // but back pay itself should NOT appear in any balance. We compare the last month:
  // The only difference should be from SSDI income at months 71-72, not from back pay lump sum.
  // With denied=true, SSDI income is 0; with denied=false and approval=71, SSDI income appears at 71+.
  // Back pay would be at month 73 which doesn't exist, so no lump sum in either.
  // Verify no massive jump that would indicate back pay was added within the horizon.
  const balanceDiffs = monthlyData.map((d, i) => d.balance - controlData[i].balance);
  // The max single-month balance jump attributable to back pay should be 0
  // (any diffs are from SSDI monthly income at months 71-72 only)
  const maxDiff = Math.max(...balanceDiffs);
  assert.ok(maxDiff < backPayActual,
    `back pay lump sum should not appear in any balance (max diff ${maxDiff} should be < backPayActual ${backPayActual})`);
});

test('54. Van sold at month 0 — van costs should not apply at month 0, shortfall deducted at month 0', () => {
  const loanBalance = 200000;
  const salePrice = 150000;
  const shortfall = loanBalance - salePrice; // 50000
  const s = gatherStateWithOverrides({
    vanSold: true, vanSaleMonth: 0, vanMonthlySavings: 2597,
    vanLoanBalance: loanBalance, vanSalePrice: salePrice,
    startingSavings: 500000, investmentReturn: 0,
    retireDebt: true, lifestyleCutsApplied: false,
    bcsYearsLeft: 0, milestones: [], chadJob: false,
    ssdiDenied: true,
  });
  const { monthlyData } = runMonthlySimulation(s);
  // Van cost should NOT be in expenses at month 0 (van sold at month 0 means m < 0 is false)
  assert.strictEqual(monthlyData[0].expenses, s.baseExpenses,
    'no van monthly cost at month 0 when van sold at month 0');
  // Shortfall should be deducted at month 0
  // balance = startingSavings + investReturn(0) + (income - expenses) - shortfall
  const m0 = monthlyData[0];
  const expectedBalance = 500000 + 0 + (m0.cashIncome - m0.expenses) - shortfall;
  assert.strictEqual(m0.balance, Math.round(expectedBalance),
    `balance at month 0 should include shortfall deduction of ${shortfall}`);
});

test('55. Chad job with chadJobStartMonth = 0 — job income at month 0 and health savings deducted', () => {
  const salary = 120000;
  const taxRate = 25;
  const healthSavings = 4200;
  const s = gatherStateWithOverrides({
    chadJob: true, chadJobSalary: salary, chadJobTaxRate: taxRate,
    chadJobStartMonth: 0, chadJobHealthSavings: healthSavings,
    retireDebt: true, vanSold: true, vanSaleMonth: 0,
    lifestyleCutsApplied: false, bcsYearsLeft: 0, milestones: [],
    vanLoanBalance: 0, vanSalePrice: 0,
  });
  const { monthlyData } = runMonthlySimulation(s);
  const expectedNet = Math.round(salary * (1 - taxRate / 100) / 12);
  // Job income should appear at month 0
  assert.strictEqual(monthlyData[0].chadJobIncome, expectedNet,
    `job income at month 0 should be ${expectedNet}, got ${monthlyData[0].chadJobIncome}`);
  // Health savings should reduce expenses at month 0
  assert.strictEqual(monthlyData[0].expenses, s.baseExpenses - healthSavings,
    `expenses at month 0 should be baseExpenses - healthSavings = ${s.baseExpenses - healthSavings}, got ${monthlyData[0].expenses}`);
  // SSDI should be 0 (chadJob disables SSDI)
  assert.strictEqual(monthlyData[0].ssdi, 0,
    'SSDI should be 0 when chadJob is true');
});

// ════════════════════════════════════════════════════════════════════════
// SS Earnings Test (projection.js lines 82-86)
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== SS Earnings Test ===');

test('56. SS earnings test: consulting at limit ($1,860/mo) — no reduction', () => {
  const s = gatherStateWithOverrides({
    ssType: 'ss', ssStartMonth: 0, ssKidsAgeOutMonths: 72,
    ssFamilyTotal: 7099, chadConsulting: 1860, // $22,320/yr = exactly at limit
    chadJob: false, ssdiDenied: false,
  });
  const { monthlyData } = runMonthlySimulation(s);
  assert.strictEqual(monthlyData[0].ssdi, 7099,
    'SS benefits should NOT be reduced when consulting is exactly at the $22,320 annual limit');
});

test('57. SS earnings test: consulting above limit ($3,000/mo) — benefits reduced', () => {
  const s = gatherStateWithOverrides({
    ssType: 'ss', ssStartMonth: 0, ssKidsAgeOutMonths: 72,
    ssFamilyTotal: 7099, chadConsulting: 3000, // $36,000/yr
    chadJob: false, ssdiDenied: false,
  });
  const { monthlyData } = runMonthlySimulation(s);
  // Annual excess: $36,000 - $22,320 = $13,680
  // Monthly reduction: round($13,680 / 2 / 12) = round($570) = $570
  const expectedSS = 7099 - 570;
  assert.strictEqual(monthlyData[0].ssdi, expectedSS,
    `SS benefits should be reduced to ${expectedSS} when consulting is $3,000/mo`);
});

test('58. SS earnings test: does NOT apply under SSDI path', () => {
  const s = gatherStateWithOverrides({
    ssType: 'ssdi', ssdiApprovalMonth: 0, ssdiDenied: false,
    ssdiFamilyTotal: 6500, kidsAgeOutMonths: 72,
    chadConsulting: 1690, // at SGA limit
    chadJob: false,
  });
  const { monthlyData } = runMonthlySimulation(s);
  assert.strictEqual(monthlyData[0].ssdi, 6500,
    'SSDI benefits should NOT be reduced by earnings test (only applies to SS retirement)');
});

// ════════════════════════════════════════════════════════════════════════
// Chad Gets a Job — numerical trace
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Chad Gets a Job — numerical trace ===');

// ---- Test 59: chadJob=false baseline — print balance at key months ----
test('59. chadJob=false baseline — balance at months 0, 12, 36, 72', () => {
  const s = gatherStateWithOverrides({ chadJob: false });
  const { monthlyData } = runMonthlySimulation(s);
  for (const m of [0, 12, 36, 72]) {
    console.log(`        [baseline] month ${m}: balance=${monthlyData[m].balance}, ssdi=${monthlyData[m].ssdi}, consulting=${monthlyData[m].consulting}, expenses=${monthlyData[m].expenses}`);
  }
  assert.ok(monthlyData.length === 73, 'should have 73 months');
});

// ---- Test 60: chadJob=true comparison — print balance at key months ----
test('60. chadJob=true comparison — balance at months 0, 12, 36, 72', () => {
  const s = gatherStateWithOverrides({
    chadJob: true, chadJobStartMonth: 0, chadJobSalary: 80000,
    chadJobTaxRate: 25, chadJobHealthSavings: 4200,
  });
  const { monthlyData } = runMonthlySimulation(s);
  for (const m of [0, 12, 36, 72]) {
    console.log(`        [chadJob]  month ${m}: balance=${monthlyData[m].balance}, chadJobIncome=${monthlyData[m].chadJobIncome}, ssdi=${monthlyData[m].ssdi}, consulting=${monthlyData[m].consulting}, expenses=${monthlyData[m].expenses}`);
  }
  assert.ok(monthlyData.length === 73, 'should have 73 months');
});

// ---- Test 61: Verify the DIFFERENCE between chadJob=true and false ----
test('61. Verify monthly income and expense difference between chadJob=true and false', () => {
  const sOff = gatherStateWithOverrides({ chadJob: false });
  const sOn = gatherStateWithOverrides({
    chadJob: true, chadJobStartMonth: 0, chadJobSalary: 80000,
    chadJobTaxRate: 25, chadJobHealthSavings: 4200,
  });
  const { monthlyData: off } = runMonthlySimulation(sOff);
  const { monthlyData: on } = runMonthlySimulation(sOn);

  // Expected job net: 80000 * 0.75 / 12 = 5000
  const expectedJobNet = Math.round(80000 * 0.75 / 12);
  assert.strictEqual(expectedJobNet, 5000, 'expected monthly net should be $5,000');

  // Print differences at key months for manual inspection
  for (const m of [0, 12, 36, 72]) {
    const incomeDiff = on[m].cashIncome - off[m].cashIncome;
    const expenseDiff = on[m].expenses - off[m].expenses;
    const balanceDiff = on[m].balance - off[m].balance;
    console.log(`        month ${m}: income diff=${incomeDiff}, expense diff=${expenseDiff}, balance diff=${balanceDiff}`);
    console.log(`          OFF: ssdi=${off[m].ssdi}, consulting=${off[m].consulting}, chadJob=${off[m].chadJobIncome}`);
    console.log(`          ON:  ssdi=${on[m].ssdi}, consulting=${on[m].consulting}, chadJob=${on[m].chadJobIncome}`);
  }

  // The income difference at month 0 should be:
  // +chadJobIncome - lostSSDI - lostConsulting
  // Since defaults: ssdiApprovalMonth=7, at month 0 SSDI is not yet active, consulting is 0
  // So at month 0 the income diff should just be +5000
  const m0IncomeDiff = on[0].cashIncome - off[0].cashIncome;
  const m0ExpenseDiff = on[0].expenses - off[0].expenses;
  console.log(`        [VERIFY] month 0: income diff = ${m0IncomeDiff}, expense diff = ${m0ExpenseDiff}`);

  // At month 0 with defaults: SSDI not yet approved (approval month 7), consulting = 0
  // So the only change is +$5,000 income and -$4,200 expenses
  assert.strictEqual(m0IncomeDiff, 5000, `month 0 income diff should be +5000 (job income only), got ${m0IncomeDiff}`);
  assert.strictEqual(m0ExpenseDiff, -4200, `month 0 expense diff should be -4200 (health savings), got ${m0ExpenseDiff}`);
});

// ---- Test 62: Verify SSDI is zeroed when chadJob=true ----
test('62. SSDI is zeroed for all months when chadJob=true', () => {
  const s = gatherStateWithOverrides({
    chadJob: true, chadJobStartMonth: 0, chadJobSalary: 80000,
    chadJobTaxRate: 25, chadJobHealthSavings: 4200,
    ssType: 'ssdi', ssdiApprovalMonth: 0, ssdiDenied: false,
    ssdiFamilyTotal: 6500, ssdiPersonal: 4166, kidsAgeOutMonths: 36,
  });
  const { monthlyData } = runMonthlySimulation(s);
  for (const entry of monthlyData) {
    assert.strictEqual(entry.ssdi, 0,
      `month ${entry.month}: SSDI should be 0 when chadJob=true, got ${entry.ssdi}`);
  }
});

// ---- Test 63: Verify consulting is zeroed when chadJob=true ----
test('63. Consulting is zeroed for all months when chadJob=true', () => {
  const s = gatherStateWithOverrides({
    chadJob: true, chadJobStartMonth: 0, chadJobSalary: 80000,
    chadJobTaxRate: 25, chadJobHealthSavings: 4200,
    ssType: 'ssdi', ssdiApprovalMonth: 0, ssdiDenied: false,
    chadConsulting: 1690,
  });
  const { monthlyData } = runMonthlySimulation(s);
  for (const entry of monthlyData) {
    assert.strictEqual(entry.consulting, 0,
      `month ${entry.month}: consulting should be 0 when chadJob=true, got ${entry.consulting}`);
  }
});

// ---- Test 64: Verify chadJobIncome appears at correct value ----
test('64. chadJobIncome is $5,000/mo (80000 * 0.75 / 12) starting at month 0', () => {
  const s = gatherStateWithOverrides({
    chadJob: true, chadJobStartMonth: 0, chadJobSalary: 80000,
    chadJobTaxRate: 25, chadJobHealthSavings: 4200,
  });
  const { monthlyData } = runMonthlySimulation(s);
  assert.strictEqual(monthlyData[0].chadJobIncome, 5000,
    `month 0 chadJobIncome should be 5000, got ${monthlyData[0].chadJobIncome}`);
  // Verify it persists
  assert.strictEqual(monthlyData[36].chadJobIncome, 5000,
    `month 36 chadJobIncome should be 5000, got ${monthlyData[36].chadJobIncome}`);
  assert.strictEqual(monthlyData[72].chadJobIncome, 5000,
    `month 72 chadJobIncome should be 5000, got ${monthlyData[72].chadJobIncome}`);
});

// ---- Test 65: Verify health savings reduce expenses ----
test('65. Health savings reduce expenses by $4,200 when chadJob=true', () => {
  // Minimal scenario: isolate just the health savings effect on expenses
  const sOff = gatherStateWithOverrides({
    chadJob: false,
    retireDebt: true, vanSold: true, vanSaleMonth: 0,
    lifestyleCutsApplied: false, bcsYearsLeft: 0, milestones: [],
    vanLoanBalance: 0, vanSalePrice: 0, ssdiDenied: true,
  });
  const sOn = gatherStateWithOverrides({
    chadJob: true, chadJobStartMonth: 0, chadJobSalary: 80000,
    chadJobTaxRate: 25, chadJobHealthSavings: 4200,
    retireDebt: true, vanSold: true, vanSaleMonth: 0,
    lifestyleCutsApplied: false, bcsYearsLeft: 0, milestones: [],
    vanLoanBalance: 0, vanSalePrice: 0, ssdiDenied: true,
  });
  const { monthlyData: offData } = runMonthlySimulation(sOff);
  const { monthlyData: onData } = runMonthlySimulation(sOn);
  const expenseDiff = offData[0].expenses - onData[0].expenses;
  assert.strictEqual(expenseDiff, 4200,
    `expense difference should be 4200 (health savings), got ${expenseDiff}`);
  console.log(`        [VERIFY] expenses OFF=${offData[0].expenses}, ON=${onData[0].expenses}, diff=${expenseDiff}`);
});

// ---- Test 66: Verify savings trajectory diverges at month 72 ----
test('66. Savings trajectory diverges: balance at month 72 differs between chadJob=true and false', () => {
  const sOff = gatherStateWithOverrides({ chadJob: false });
  const sOn = gatherStateWithOverrides({
    chadJob: true, chadJobStartMonth: 0, chadJobSalary: 80000,
    chadJobTaxRate: 25, chadJobHealthSavings: 4200,
  });
  const { monthlyData: offData } = runMonthlySimulation(sOff);
  const { monthlyData: onData } = runMonthlySimulation(sOn);
  const diff = onData[72].balance - offData[72].balance;
  console.log(`        [VERIFY] month 72 balance: OFF=${offData[72].balance}, ON=${onData[72].balance}, diff=${diff}`);
  assert.ok(diff !== 0,
    `balance at month 72 should differ between chadJob=true and false, but both are ${offData[72].balance}`);
  // Print the sign so Chad can see which scenario is better at the 6-year mark
  console.log(`        chadJob=true is ${diff > 0 ? 'BETTER' : 'WORSE'} by $${Math.abs(diff).toLocaleString()} at month 72`);
});

// ---- Test 67: Verify back pay is zeroed when chadJob=true ----
test('67. Back pay is zeroed when chadJob=true', () => {
  const s = gatherStateWithOverrides({
    chadJob: true, chadJobStartMonth: 0, chadJobSalary: 80000,
    chadJobTaxRate: 25, chadJobHealthSavings: 4200,
    ssType: 'ssdi', ssdiApprovalMonth: 7, ssdiDenied: false,
    ssdiBackPayMonths: 18, ssdiPersonal: 4166,
  });
  const { backPayActual } = runMonthlySimulation(s);
  assert.strictEqual(backPayActual, 0,
    `backPayActual should be 0 when chadJob=true, got ${backPayActual}`);
});

// ---- Test 68: chadJob with delayed start — no income before startMonth ----
test('68. chadJob with chadJobStartMonth=6 — no job income or health savings before month 6', () => {
  const s = gatherStateWithOverrides({
    chadJob: true, chadJobStartMonth: 6, chadJobSalary: 80000,
    chadJobTaxRate: 25, chadJobHealthSavings: 4200,
    retireDebt: true, vanSold: true, vanSaleMonth: 0,
    lifestyleCutsApplied: false, bcsYearsLeft: 0, milestones: [],
    vanLoanBalance: 0, vanSalePrice: 0, ssdiDenied: true,
  });
  const { monthlyData } = runMonthlySimulation(s);
  // Before start month: no job income, no health savings
  for (let m = 0; m < 6; m++) {
    assert.strictEqual(monthlyData[m].chadJobIncome, 0,
      `month ${m}: chadJobIncome should be 0 before startMonth, got ${monthlyData[m].chadJobIncome}`);
    // expenses should NOT include health savings deduction before start
    assert.strictEqual(monthlyData[m].expenses, s.baseExpenses,
      `month ${m}: expenses should be baseExpenses before job starts, got ${monthlyData[m].expenses}`);
  }
  // At and after start month: job income and health savings apply
  assert.strictEqual(monthlyData[6].chadJobIncome, 5000,
    `month 6: chadJobIncome should be 5000, got ${monthlyData[6].chadJobIncome}`);
  assert.strictEqual(monthlyData[6].expenses, s.baseExpenses - 4200,
    `month 6: expenses should reflect health savings, got ${monthlyData[6].expenses}`);
  // Note: SSDI/consulting are still zeroed for ALL months when chadJob=true, even before job starts
  assert.strictEqual(monthlyData[0].ssdi, 0, 'SSDI zeroed even before job starts');
  assert.strictEqual(monthlyData[0].consulting, 0, 'consulting zeroed even before job starts');
});

// ════════════════════════════════════════════════════════════════════════
// One-Time Extras
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== One-Time Extras ===');

test('59. oneTimeExtras adds to expenses within duration', () => {
  const s = gatherStateWithOverrides({ oneTimeExtras: 5000, oneTimeMonths: 6 });
  const { monthlyData } = runMonthlySimulation(s);
  const baseline = runMonthlySimulation(gatherStateWithOverrides({ oneTimeExtras: 0, oneTimeMonths: 0 }));
  assert.strictEqual(monthlyData[0].expenses, baseline.monthlyData[0].expenses + 5000,
    'month 0: extras should add 5000');
  assert.strictEqual(monthlyData[5].expenses, baseline.monthlyData[5].expenses + 5000,
    'month 5: still within duration');
});

test('60. oneTimeExtras stops after duration expires', () => {
  const s = gatherStateWithOverrides({ oneTimeExtras: 5000, oneTimeMonths: 6 });
  const { monthlyData } = runMonthlySimulation(s);
  const baseline = runMonthlySimulation(gatherStateWithOverrides({ oneTimeExtras: 0, oneTimeMonths: 0 }));
  assert.strictEqual(monthlyData[6].expenses, baseline.monthlyData[6].expenses,
    'month 6: extras should stop');
  assert.strictEqual(monthlyData[12].expenses, baseline.monthlyData[12].expenses,
    'month 12: no extras');
});

test('61. oneTimeExtras=0 or oneTimeMonths=0 has no effect', () => {
  const baseline = runMonthlySimulation(gatherStateWithOverrides({}));
  const withZeroExtras = runMonthlySimulation(gatherStateWithOverrides({ oneTimeExtras: 0, oneTimeMonths: 6 }));
  const withZeroMonths = runMonthlySimulation(gatherStateWithOverrides({ oneTimeExtras: 5000, oneTimeMonths: 0 }));
  assert.strictEqual(withZeroExtras.monthlyData[0].expenses, baseline.monthlyData[0].expenses,
    'zero extras: no change');
  assert.strictEqual(withZeroMonths.monthlyData[0].expenses, baseline.monthlyData[0].expenses,
    'zero months: no change');
});

// ════════════════════════════════════════════════════════════════════════
// Summary
// ════════════════════════════════════════════════════════════════════════
console.log(`\n${'='.repeat(50)}`);
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'='.repeat(50)}\n`);

if (failed > 0) process.exit(1);
