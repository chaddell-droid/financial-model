/**
 * Transition boundary tests — the exact month before and after every cutoff
 * point in the financial model's projection engine.
 *
 * Run with: node src/model/__tests__/transitions.test.js
 */
import assert from 'node:assert';
import { runMonthlySimulation } from '../projection.js';
import { gatherStateWithOverrides } from '../../state/gatherState.js';
import { DAYS_PER_MONTH } from '../constants.js';

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

// ============================================================================
// 1. Sarah Practice End (sarahWorkMonths)
// ============================================================================
console.log('\n=== 1. Sarah Practice End ===');

{
  const s = gatherStateWithOverrides({
    sarahWorkMonths: 24, chadWorkMonths: 36,
    ssdiDenied: true, vanSold: false, retireDebt: true,
    lifestyleCutsApplied: false, milestones: [], chadJob: false,
    oneTimeExtras: 0, bcsYearsLeft: 0, starting401k: 0, homeEquity: 0,
    trustIncreaseMonth: 0,
  });
  const { monthlyData } = runMonthlySimulation(s);

  test('1.1 Sarah income > 0 at last working month (m=24, uses <=)', () => {
    assert.ok(monthlyData[24].sarahIncome > 0,
      `expected sarahIncome > 0 at month 24, got ${monthlyData[24].sarahIncome}`);
  });

  test('1.2 Sarah income === 0 at first month after (m=25)', () => {
    assert.strictEqual(monthlyData[25].sarahIncome, 0,
      `expected sarahIncome === 0 at month 25, got ${monthlyData[25].sarahIncome}`);
  });

  test('1.3 Sarah income formula verification at month 24', () => {
    const rate = Math.min(s.sarahRate * Math.pow(1 + s.sarahRateGrowth / 100, 24 / 12), s.sarahMaxRate);
    const clients = Math.min(s.sarahCurrentClients * Math.pow(1 + s.sarahClientGrowth / 100, 24 / 12), s.sarahMaxClients);
    const gross = Math.round(rate * clients * DAYS_PER_MONTH);
    const expected = Math.round(gross * (1 - (s.sarahTaxRate ?? 25) / 100));
    assert.strictEqual(monthlyData[24].sarahIncome, expected,
      `month 24 sarahIncome formula mismatch: expected ${expected}, got ${monthlyData[24].sarahIncome}`);
  });

  test('1.4 Trust income unaffected at boundary (m=24 vs m=25)', () => {
    // trustIncreaseMonth: 0 means trust is at trustIncomeFuture from month 0 onward
    assert.strictEqual(monthlyData[24].trustLLC, monthlyData[25].trustLLC,
      `trustLLC should be stable across Sarah boundary: month 24 = ${monthlyData[24].trustLLC}, month 25 = ${monthlyData[25].trustLLC}`);
  });
}

// ============================================================================
// 2. Chad Job Start (chadJobStartMonth)
// ============================================================================
console.log('\n=== 2. Chad Job Start ===');

{
  const s = gatherStateWithOverrides({
    chadJob: true, chadJobSalary: 100000, chadJobTaxRate: 25,
    chadJobStartMonth: 6, chadJobHealthSavings: 4200,
    chadJobNoFICA: false, chadJobPensionRate: 0, chadJobPensionContrib: 0,
    ssdiDenied: true, vanSold: false, retireDebt: true,
    lifestyleCutsApplied: false, milestones: [], oneTimeExtras: 0,
    bcsYearsLeft: 0, starting401k: 0, homeEquity: 0, trustIncreaseMonth: 0,
    expenseInflation: false,
  });
  const { monthlyData } = runMonthlySimulation(s);

  test('2.1 No job income before start (m=5)', () => {
    assert.strictEqual(monthlyData[5].chadJobIncome, 0,
      `expected chadJobIncome === 0 at month 5, got ${monthlyData[5].chadJobIncome}`);
  });

  test('2.2 Job income at start month (m=6) = round(100000 * 0.75 / 12) = 6250', () => {
    const expected = Math.round(100000 * 0.75 / 12);
    assert.strictEqual(monthlyData[6].chadJobIncome, expected,
      `expected chadJobIncome = ${expected} at month 6, got ${monthlyData[6].chadJobIncome}`);
  });

  test('2.3 Health savings reduce expenses starting at month 6', () => {
    const delta = monthlyData[5].expenses - monthlyData[6].expenses;
    assert.strictEqual(delta, 4200,
      `expense drop at job start should be 4200, got ${delta} (m5=${monthlyData[5].expenses}, m6=${monthlyData[6].expenses})`);
  });

  test('2.4 Job income steady after start (m=7 === m=6)', () => {
    assert.strictEqual(monthlyData[7].chadJobIncome, monthlyData[6].chadJobIncome,
      `chadJobIncome should be steady: month 6 = ${monthlyData[6].chadJobIncome}, month 7 = ${monthlyData[7].chadJobIncome}`);
  });
}

// ============================================================================
// 3. Chad Job/Consulting End (chadWorkMonths)
// ============================================================================
console.log('\n=== 3. Chad Job/Consulting End ===');

{
  const s = gatherStateWithOverrides({
    chadJob: true, chadJobSalary: 100000, chadJobTaxRate: 25,
    chadJobStartMonth: 0, chadWorkMonths: 36, sarahWorkMonths: 48,
    chadJobHealthSavings: 4200, chadJobNoFICA: false,
    chadJobPensionRate: 0, chadJobPensionContrib: 0,
    ssdiDenied: true, vanSold: false, retireDebt: true,
    lifestyleCutsApplied: false, milestones: [], oneTimeExtras: 0,
    bcsYearsLeft: 0, starting401k: 0, homeEquity: 0, trustIncreaseMonth: 0,
    expenseInflation: false,
  });
  const { monthlyData } = runMonthlySimulation(s);

  test('3.1 Job income > 0 at last working month (m=36, uses m <= chadRetirementMonth)', () => {
    assert.ok(monthlyData[36].chadJobIncome > 0,
      `expected chadJobIncome > 0 at month 36, got ${monthlyData[36].chadJobIncome}`);
  });

  test('3.2 Job income === 0 at first post-retirement month (m=37)', () => {
    assert.strictEqual(monthlyData[37].chadJobIncome, 0,
      `expected chadJobIncome === 0 at month 37, got ${monthlyData[37].chadJobIncome}`);
  });

  test('3.3 Health savings end at retirement: expenses increase by 4200', () => {
    const delta = monthlyData[37].expenses - monthlyData[36].expenses;
    assert.strictEqual(delta, 4200,
      `expense increase at retirement should be 4200 (health savings end), got ${delta}`);
  });

  test('3.4 Consulting also stops at retirement (m=37)', () => {
    // chadJob=true => consulting is always 0, but verify m > chadRetirementMonth => 0
    assert.strictEqual(monthlyData[37].consulting, 0,
      `consulting should be 0 at month 37, got ${monthlyData[37].consulting}`);
  });
}

// ============================================================================
// 4. SS/SSDI Start
// ============================================================================
console.log('\n=== 4. SS/SSDI Start ===');

{
  // Setup A: SSDI
  const sA = gatherStateWithOverrides({
    ssType: 'ssdi', ssdiApprovalMonth: 10, ssdiDenied: false,
    ssdiFamilyTotal: 6321, ssdiPersonal: 4214, kidsAgeOutMonths: 60,
    chadJob: false, chadConsulting: 0, vanSold: false, retireDebt: true,
    lifestyleCutsApplied: false, milestones: [], oneTimeExtras: 0,
    bcsYearsLeft: 0, starting401k: 0, homeEquity: 0, trustIncreaseMonth: 0,
  });
  const simA = runMonthlySimulation(sA);

  test('4.1 SSDI: ssBenefit === 0 before approval (m=9), === 6321 at approval (m=10)', () => {
    assert.strictEqual(simA.monthlyData[9].ssBenefit, 0,
      `expected ssBenefit === 0 at month 9, got ${simA.monthlyData[9].ssBenefit}`);
    assert.strictEqual(simA.monthlyData[10].ssBenefit, 6321,
      `expected ssBenefit === 6321 at month 10, got ${simA.monthlyData[10].ssBenefit}`);
  });

  test('4.2 SSDI: ssBenefitType null before, "ssdi" at approval', () => {
    assert.strictEqual(simA.monthlyData[9].ssBenefitType, null,
      `expected null at month 9, got ${simA.monthlyData[9].ssBenefitType}`);
    assert.strictEqual(simA.monthlyData[10].ssBenefitType, 'ssdi',
      `expected "ssdi" at month 10, got ${simA.monthlyData[10].ssBenefitType}`);
  });

  // Setup B: SS at 62
  const sB = gatherStateWithOverrides({
    ssType: 'ss', ssClaimAge: 62, ssPIA: 4214,
    chadJob: false, chadConsulting: 0, vanSold: false, retireDebt: true,
    lifestyleCutsApplied: false, milestones: [], oneTimeExtras: 0,
    bcsYearsLeft: 0, starting401k: 0, homeEquity: 0, trustIncreaseMonth: 0,
  });
  const simB = runMonthlySimulation(sB);

  test('4.3 SS at 62: ssBenefit === 0 before ssStartMonth, ssFamilyTotal at ssStartMonth', () => {
    const ssStart = sB.ssStartMonth; // 19
    assert.strictEqual(simB.monthlyData[ssStart - 1].ssBenefit, 0,
      `expected ssBenefit === 0 at month ${ssStart - 1}, got ${simB.monthlyData[ssStart - 1].ssBenefit}`);
    assert.strictEqual(simB.monthlyData[ssStart].ssBenefit, sB.ssFamilyTotal,
      `expected ssBenefit === ${sB.ssFamilyTotal} at month ${ssStart}, got ${simB.monthlyData[ssStart].ssBenefit}`);
  });

  test('4.4 SS at 62: ssBenefitType null before, "retirement" at ssStartMonth', () => {
    const ssStart = sB.ssStartMonth;
    assert.strictEqual(simB.monthlyData[ssStart - 1].ssBenefitType, null,
      `expected null at month ${ssStart - 1}`);
    assert.strictEqual(simB.monthlyData[ssStart].ssBenefitType, 'retirement',
      `expected "retirement" at month ${ssStart}`);
  });
}

// ============================================================================
// 5. Kids Age Out
// ============================================================================
console.log('\n=== 5. Kids Age Out ===');

{
  // SSDI path: kids age out at effectiveSsdiApproval + kidsAgeOutMonths
  // approval=10, kidsAgeOutMonths=20 => last family month: 29 (m < 10+20=30), first personal: 30
  const sA = gatherStateWithOverrides({
    ssType: 'ssdi', ssdiApprovalMonth: 10, ssdiDenied: false,
    ssdiFamilyTotal: 6321, ssdiPersonal: 4214, kidsAgeOutMonths: 20,
    chadJob: false, chadConsulting: 0, vanSold: false, retireDebt: true,
    lifestyleCutsApplied: false, milestones: [], oneTimeExtras: 0,
    bcsYearsLeft: 0, starting401k: 0, homeEquity: 0, trustIncreaseMonth: 0,
  });
  const simA = runMonthlySimulation(sA);

  test('5.1 SSDI: last family month (m=29) gets ssdiFamilyTotal', () => {
    assert.strictEqual(simA.monthlyData[29].ssBenefit, 6321,
      `expected 6321 at month 29, got ${simA.monthlyData[29].ssBenefit}`);
  });

  test('5.2 SSDI: first personal month (m=30) gets ssdiPersonal', () => {
    assert.strictEqual(simA.monthlyData[30].ssBenefit, 4214,
      `expected 4214 at month 30, got ${simA.monthlyData[30].ssBenefit}`);
  });

  // SS path: ssClaimAge=62 => ssStartMonth=19, ssKidsAgeOutMonths=max(0,34-19)=15
  // last family: 19+15-1=33 (m < 19+15=34), first personal: 34
  const sB = gatherStateWithOverrides({
    ssType: 'ss', ssClaimAge: 62, ssPIA: 4214,
    chadJob: false, chadConsulting: 0, vanSold: false, retireDebt: true,
    lifestyleCutsApplied: false, milestones: [], oneTimeExtras: 0,
    bcsYearsLeft: 0, starting401k: 0, homeEquity: 0, trustIncreaseMonth: 0,
  });
  const simB = runMonthlySimulation(sB);

  test('5.3 SS at 62: last family month (m=33) gets ssFamilyTotal', () => {
    assert.strictEqual(simB.monthlyData[33].ssBenefit, sB.ssFamilyTotal,
      `expected ${sB.ssFamilyTotal} at month 33, got ${simB.monthlyData[33].ssBenefit}`);
  });

  test('5.4 SS at 62: first personal month (m=34) gets ssPersonal', () => {
    assert.strictEqual(simB.monthlyData[34].ssBenefit, sB.ssPersonal,
      `expected ${sB.ssPersonal} at month 34, got ${simB.monthlyData[34].ssBenefit}`);
  });
}

// ============================================================================
// 6. Health Insurance Savings Window
// ============================================================================
console.log('\n=== 6. Health Insurance Savings Window ===');

{
  const s = gatherStateWithOverrides({
    chadJob: true, chadJobSalary: 100000, chadJobTaxRate: 25,
    chadJobStartMonth: 6, chadWorkMonths: 36, sarahWorkMonths: 48,
    chadJobHealthSavings: 4200, chadJobNoFICA: false,
    chadJobPensionRate: 0, chadJobPensionContrib: 0,
    ssdiDenied: true, vanSold: false, retireDebt: true,
    lifestyleCutsApplied: false, milestones: [], oneTimeExtras: 0,
    bcsYearsLeft: 0, starting401k: 0, homeEquity: 0,
    trustIncreaseMonth: 0, investmentReturn: 0,
    expenseInflation: false,
  });
  const { monthlyData } = runMonthlySimulation(s);

  // Baseline expenses = what month 0 has (no health savings before job start)
  const baseExpenses = monthlyData[0].expenses;

  test('6.1 No health savings before job start (m=5)', () => {
    assert.strictEqual(monthlyData[5].expenses, baseExpenses,
      `month 5 expenses should be baseline ${baseExpenses}, got ${monthlyData[5].expenses}`);
  });

  test('6.2 Health savings active at job start (m=6)', () => {
    assert.strictEqual(monthlyData[6].expenses, baseExpenses - 4200,
      `month 6 expenses should be ${baseExpenses - 4200}, got ${monthlyData[6].expenses}`);
  });

  test('6.3 Health savings active at last working month (m=36)', () => {
    assert.strictEqual(monthlyData[36].expenses, baseExpenses - 4200,
      `month 36 expenses should be ${baseExpenses - 4200}, got ${monthlyData[36].expenses}`);
  });

  test('6.4 Health savings end at retirement (m=37)', () => {
    assert.strictEqual(monthlyData[37].expenses, baseExpenses,
      `month 37 expenses should be baseline ${baseExpenses}, got ${monthlyData[37].expenses}`);
  });
}

// ============================================================================
// 7. Van Sale (vanSaleMonth)
// ============================================================================
console.log('\n=== 7. Van Sale ===');

{
  const s = gatherStateWithOverrides({
    vanSold: true, vanSaleMonth: 12, vanMonthlySavings: 2597,
    vanLoanBalance: 200000, vanSalePrice: 150000,
    ssdiDenied: true, chadJob: false, retireDebt: true,
    lifestyleCutsApplied: false, milestones: [], oneTimeExtras: 0,
    bcsYearsLeft: 0, starting401k: 0, homeEquity: 0,
    startingSavings: 1000000, investmentReturn: 0, trustIncreaseMonth: 0,
    expenseInflation: false,
  });
  const { monthlyData } = runMonthlySimulation(s);

  test('7.1 Van costs included before sale: expense delta m=11 vs m=12 is 2597', () => {
    // Month 11: m < 12, so van expenses included. Month 12: m >= 12, no van.
    const delta = monthlyData[11].expenses - monthlyData[12].expenses;
    assert.strictEqual(delta, 2597,
      `expense drop at van sale should be 2597, got ${delta} (m11=${monthlyData[11].expenses}, m12=${monthlyData[12].expenses})`);
  });

  test('7.2 No van costs at sale month (m=12)', () => {
    // After BCS=0, retireDebt=true, no cuts, no milestones, no oneTimeExtras, no chadJob:
    // expenses at m=12 should be just baseExpenses
    assert.strictEqual(monthlyData[12].expenses, s.baseExpenses,
      `month 12 expenses should be baseExpenses ${s.baseExpenses}, got ${monthlyData[12].expenses}`);
  });

  test('7.3 Van shortfall hits balance at sale month: 200000 - 150000 = 50000', () => {
    // balance[12] = balance[11] + investReturn(0) + (cashIncome[12] - expenses[12]) - 50000
    const expected = monthlyData[11].balance + monthlyData[12].investReturn
      + (monthlyData[12].cashIncome - monthlyData[12].expenses) - 50000;
    assert.strictEqual(monthlyData[12].balance, Math.round(expected),
      `balance at month 12 should include 50000 shortfall: expected ${Math.round(expected)}, got ${monthlyData[12].balance}`);
  });

  test('7.4 Expenses stable after sale (m=13 === m=12)', () => {
    assert.strictEqual(monthlyData[13].expenses, monthlyData[12].expenses,
      `expenses should be stable: month 12 = ${monthlyData[12].expenses}, month 13 = ${monthlyData[13].expenses}`);
  });
}

// ============================================================================
// 8. BCS Tuition End (bcsYearsLeft * 12)
// ============================================================================
console.log('\n=== 8. BCS Tuition End ===');

{
  const s = gatherStateWithOverrides({
    bcsYearsLeft: 2, bcsAnnualTotal: 43400, bcsParentsAnnual: 25000,
    ssdiDenied: true, chadJob: false, vanSold: false, retireDebt: true,
    lifestyleCutsApplied: false, milestones: [], oneTimeExtras: 0,
    starting401k: 0, homeEquity: 0, trustIncreaseMonth: 0, investmentReturn: 0,
    expenseInflation: false,
  });
  const { monthlyData } = runMonthlySimulation(s);

  // bcsFamilyMonthly = round(max(0, 43400 - 25000) / 12) = round(18400/12) = 1533
  const bcsFamilyMonthly = Math.round(Math.max(0, 43400 - 25000) / 12);

  test('8.1 BCS included at last tuition month (m=23, condition m < 24)', () => {
    // Expenses at month 23 should include BCS
    // With vanSold=false, expenses include vanMonthlySavings too
    const expectedWithBcs = s.baseExpenses + s.vanMonthlySavings + bcsFamilyMonthly;
    assert.strictEqual(monthlyData[23].expenses, expectedWithBcs,
      `month 23 expenses should include BCS: expected ${expectedWithBcs}, got ${monthlyData[23].expenses}`);
  });

  test('8.2 BCS excluded at first post-BCS month (m=24)', () => {
    const expectedNoBcs = s.baseExpenses + s.vanMonthlySavings;
    assert.strictEqual(monthlyData[24].expenses, expectedNoBcs,
      `month 24 expenses should exclude BCS: expected ${expectedNoBcs}, got ${monthlyData[24].expenses}`);
  });

  test('8.3 Expense delta at BCS boundary = bcsFamilyMonthly (1533)', () => {
    const delta = monthlyData[23].expenses - monthlyData[24].expenses;
    assert.strictEqual(delta, bcsFamilyMonthly,
      `expense delta should be ${bcsFamilyMonthly}, got ${delta}`);
  });

  test('8.4 gatherState computes bcsFamilyMonthly correctly', () => {
    assert.strictEqual(s.bcsFamilyMonthly, bcsFamilyMonthly,
      `bcsFamilyMonthly should be ${bcsFamilyMonthly}, got ${s.bcsFamilyMonthly}`);
  });
}

// ============================================================================
// 9. Trust Income Increase (trustIncreaseMonth)
// ============================================================================
console.log('\n=== 9. Trust Income Increase ===');

{
  const s = gatherStateWithOverrides({
    trustIncomeNow: 833, trustIncomeFuture: 2083, trustIncreaseMonth: 15,
    ssdiDenied: true, chadJob: false, vanSold: false, retireDebt: true,
    lifestyleCutsApplied: false, milestones: [], oneTimeExtras: 0,
    bcsYearsLeft: 0, starting401k: 0, homeEquity: 0, investmentReturn: 0,
  });
  const { monthlyData } = runMonthlySimulation(s);

  test('9.1 Trust income before increase (m=14) = trustIncomeNow (833)', () => {
    assert.strictEqual(monthlyData[14].trustLLC, 833,
      `month 14 trustLLC should be 833, got ${monthlyData[14].trustLLC}`);
  });

  test('9.2 Trust income at increase month (m=15) = trustIncomeFuture (2083)', () => {
    assert.strictEqual(monthlyData[15].trustLLC, 2083,
      `month 15 trustLLC should be 2083, got ${monthlyData[15].trustLLC}`);
  });

  test('9.3 Trust income stable after increase (m=16) = trustIncomeFuture (2083)', () => {
    assert.strictEqual(monthlyData[16].trustLLC, 2083,
      `month 16 trustLLC should be 2083, got ${monthlyData[16].trustLLC}`);
  });

  test('9.4 cashIncome delta at trust boundary equals trustLLC delta plus other component changes', () => {
    // Verify the trust component delta is exactly 1250
    const trustDelta = monthlyData[15].trustLLC - monthlyData[14].trustLLC;
    assert.strictEqual(trustDelta, 2083 - 833,
      `trustLLC delta should be ${2083 - 833}, got ${trustDelta}`);
    // cashIncome includes MSFT lump sums which swing wildly between months,
    // so instead of near(), verify cashIncome algebraically:
    // cashIncome = sarahIncome + msftLump + trustLLC + ssBenefit + consulting + chadJobIncome
    const m15 = monthlyData[15];
    const expectedCash = m15.sarahIncome + m15.msftLump + m15.trustLLC + m15.ssBenefit + m15.consulting + m15.chadJobIncome;
    assert.strictEqual(m15.cashIncome, expectedCash,
      `cashIncome at month 15 should equal sum of components: expected ${expectedCash}, got ${m15.cashIncome}`);
  });
}

// ============================================================================
// 10. One-Time Extras End (oneTimeMonths)
// ============================================================================
console.log('\n=== 10. One-Time Extras End ===');

{
  const overridesBase = {
    ssdiDenied: true, chadJob: false, vanSold: false, retireDebt: true,
    lifestyleCutsApplied: false, milestones: [], bcsYearsLeft: 0,
    starting401k: 0, homeEquity: 0, trustIncreaseMonth: 0, investmentReturn: 0,
    expenseInflation: false,
  };
  const sA = gatherStateWithOverrides({ ...overridesBase, oneTimeExtras: 3000, oneTimeMonths: 12 });
  const sB = gatherStateWithOverrides({ ...overridesBase, oneTimeExtras: 0, oneTimeMonths: 0 });
  const simA = runMonthlySimulation(sA);
  const simB = runMonthlySimulation(sB);

  test('10.1 Extras add to expenses within duration (m=11)', () => {
    const diff = simA.monthlyData[11].expenses - simB.monthlyData[11].expenses;
    assert.strictEqual(diff, 3000,
      `expenses should differ by 3000 at month 11, got ${diff}`);
  });

  test('10.2 Extras stop after duration (m=12)', () => {
    const diff = simA.monthlyData[12].expenses - simB.monthlyData[12].expenses;
    assert.strictEqual(diff, 0,
      `expenses should be equal at month 12, got diff ${diff}`);
  });

  test('10.3 Extras present from start (m=0)', () => {
    const diff = simA.monthlyData[0].expenses - simB.monthlyData[0].expenses;
    assert.strictEqual(diff, 3000,
      `expenses should differ by 3000 at month 0, got ${diff}`);
  });

  test('10.4 Control: no change in expenses over time without extras', () => {
    assert.strictEqual(simB.monthlyData[0].expenses, simB.monthlyData[12].expenses,
      `control expenses at m=0 (${simB.monthlyData[0].expenses}) should equal m=12 (${simB.monthlyData[12].expenses})`);
  });
}

// ============================================================================
// 11. Milestone Savings (milestone.month)
// ============================================================================
console.log('\n=== 11. Milestone Savings ===');

{
  const s = gatherStateWithOverrides({
    milestones: [
      { name: 'A', month: 18, savings: 2000 },
      { name: 'B', month: 30, savings: 1500 },
    ],
    ssdiDenied: true, chadJob: false, vanSold: false, retireDebt: true,
    lifestyleCutsApplied: false, oneTimeExtras: 0, bcsYearsLeft: 0,
    starting401k: 0, homeEquity: 0, trustIncreaseMonth: 0, investmentReturn: 0,
    expenseInflation: false,
  });
  const { monthlyData } = runMonthlySimulation(s);

  test('11.1 No milestone reduction before first milestone (m=17)', () => {
    // Expenses at m=17: baseExpenses + vanMonthlySavings (vanSold=false)
    const expectedBase = s.baseExpenses + s.vanMonthlySavings;
    assert.strictEqual(monthlyData[17].expenses, expectedBase,
      `month 17 should have no milestone reduction: expected ${expectedBase}, got ${monthlyData[17].expenses}`);
  });

  test('11.2 First milestone reduces expenses at m=18 by 2000', () => {
    const delta = monthlyData[17].expenses - monthlyData[18].expenses;
    assert.strictEqual(delta, 2000,
      `expense drop at milestone A should be 2000, got ${delta}`);
  });

  test('11.3 Between milestones, expenses stay reduced by first milestone only (m=29 === m=18)', () => {
    assert.strictEqual(monthlyData[29].expenses, monthlyData[18].expenses,
      `month 29 expenses (${monthlyData[29].expenses}) should equal month 18 (${monthlyData[18].expenses})`);
  });

  test('11.4 Second milestone adds additional reduction at m=30 by 1500', () => {
    const delta = monthlyData[29].expenses - monthlyData[30].expenses;
    assert.strictEqual(delta, 1500,
      `expense drop at milestone B should be 1500, got ${delta}`);
  });
}

// ============================================================================
// 12. SSDI Back Pay Lump Sum (ssdiApprovalMonth + 2)
// ============================================================================
console.log('\n=== 12. SSDI Back Pay Lump Sum ===');

{
  const s = gatherStateWithOverrides({
    ssType: 'ssdi', ssdiApprovalMonth: 8, ssdiDenied: false,
    ssdiBackPayMonths: 18, ssdiPersonal: 4152, ssdiFamilyTotal: 6228,
    kidsAgeOutMonths: 60, chadJob: false, chadConsulting: 0,
    vanSold: false, retireDebt: true, lifestyleCutsApplied: false,
    milestones: [], oneTimeExtras: 0, bcsYearsLeft: 0,
    starting401k: 0, homeEquity: 0,
    startingSavings: 500000, investmentReturn: 0, trustIncreaseMonth: 0,
  });
  const sim = runMonthlySimulation(s);
  const { monthlyData } = sim;

  // Back pay: gross = 18 * 4152 = 74736, fee = min(round(74736*0.25), 7500) = min(18684, 7500) = 7500
  // net = 74736 - 7500 = 67236. Appears at month 8 + 2 = 10.
  const backPayGross = 18 * 4152;
  const backPayFee = Math.min(Math.round(backPayGross * 0.25), 7500);
  const backPayExpected = backPayGross - backPayFee;

  test('12.1 Balance reconciliation at month 9 (no lump sum)', () => {
    // balance[9] = balance[8] + investReturn(0) + (cashIncome[9] - expenses[9])
    // No back pay at month 9. No 401k draws (starting401k=0).
    const expected = monthlyData[8].balance + monthlyData[9].investReturn
      + (monthlyData[9].cashIncome - monthlyData[9].expenses);
    assert.strictEqual(monthlyData[9].balance, Math.round(expected),
      `month 9 balance should reconcile without lump sum: expected ${Math.round(expected)}, got ${monthlyData[9].balance}`);
  });

  test('12.2 Balance at month 10 includes back pay lump sum', () => {
    // balance[10] = balance[9] + investReturn(0) + (cashIncome[10] - expenses[10]) + backPayActual
    const expected = monthlyData[9].balance + monthlyData[10].investReturn
      + (monthlyData[10].cashIncome - monthlyData[10].expenses) + sim.backPayActual;
    assert.strictEqual(monthlyData[10].balance, Math.round(expected),
      `month 10 balance should include lump sum: expected ${Math.round(expected)}, got ${monthlyData[10].balance}`);
  });

  test('12.3 backPayActual matches formula: 67236', () => {
    assert.strictEqual(sim.backPayActual, backPayExpected,
      `backPayActual should be ${backPayExpected}, got ${sim.backPayActual}`);
  });

  test('12.4 Balance reconciliation at month 11 (no additional lump)', () => {
    const expected = monthlyData[10].balance + monthlyData[11].investReturn
      + (monthlyData[11].cashIncome - monthlyData[11].expenses);
    assert.strictEqual(monthlyData[11].balance, Math.round(expected),
      `month 11 balance should reconcile without lump sum: expected ${Math.round(expected)}, got ${monthlyData[11].balance}`);
  });
}

// ============================================================================
// Summary
// ============================================================================
console.log(`\n${'='.repeat(50)}`);
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'='.repeat(50)}\n`);

if (failed > 0) process.exit(1);
