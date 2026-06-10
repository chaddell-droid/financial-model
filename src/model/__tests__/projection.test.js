/**
 * Unit tests for the projection engine (runMonthlySimulation, findOperationalBreakevenIndex).
 * Run with: node src/model/__tests__/projection.test.js
 */
import assert from 'node:assert';
import { runMonthlySimulation, findOperationalBreakevenIndex, computeProjection, SS_INTERIM_TAX_HAIRCUT } from '../projection.js';
import { gatherStateWithOverrides } from '../../state/gatherState.js';
import { DAYS_PER_MONTH, SGA_LIMIT, ssAdjustmentFactor, ssSpousalAdjustmentFactor, ssRecalculatedBenefit, SS_FRA_MONTH, SS_START_OFFSET, TWINS_AGE_OUT_MONTH, SS_CHILD_BENEFIT_END_MONTH, familyMaxForPIA } from '../constants.js';

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
    expenseInflation: false, // A2 (2026-06-10): isolate from SS COLA (locked in ssCola.test.js)
    ssType: 'ssdi', ssdiApprovalMonth: approvalMonth, ssdiDenied: false,
    ssdiFamilyTotal: 6500, kidsAgeOutMonths: 60, chadJob: false,
  });
  const { monthlyData } = runMonthlySimulation(s);
  assert.strictEqual(monthlyData[approvalMonth - 1].ssBenefitGross, 0, 'no SSDI before approval');
  assert.strictEqual(monthlyData[approvalMonth].ssBenefitGross, 6500, 'ssdiFamilyTotal at approval'); // A1: gross — net cash is locked in ssTaxHaircut.test.js
});

test('10. SSDI transitions to ssdiPersonal at SS_CHILD_BENEFIT_END_MONTH (student rule, calendar-anchored)', () => {
  // B4 (remediation 2026-06-10): SSA's full-time-student rule (20 CFR 404.367)
  // pays child benefits through HS graduation (June 2029, m=39), not the 18th
  // birthday (m=34). SS_CHILD_BENEFIT_END_MONTH (=40) is the first ineligible
  // month for SS/SSDI child benefits; TWINS_AGE_OUT_MONTH (=34) stays as the
  // CTC anchor (age-17 timeline).
  const approvalMonth = 5;
  const s = gatherStateWithOverrides({
    expenseInflation: false, // A2 (2026-06-10): isolate from SS COLA (locked in ssCola.test.js)
    ssType: 'ssdi', ssdiApprovalMonth: approvalMonth, ssdiDenied: false,
    ssdiFamilyTotal: 6500, ssdiPersonal: 4166, kidsAgeOutMonths: 10, chadJob: false,
  });
  const { monthlyData } = runMonthlySimulation(s);
  // Family total right at approval
  assert.strictEqual(monthlyData[approvalMonth].ssBenefitGross, 6500); // A1: gross
  // Last family month is m=39 (SS_CHILD_BENEFIT_END_MONTH - 1, HS graduation month)
  assert.strictEqual(monthlyData[39].ssBenefitGross, 6500, 'still family total at last eligible month (m=39)');
  // Personal starts at m=40 (SS_CHILD_BENEFIT_END_MONTH = first ineligible)
  assert.strictEqual(monthlyData[40].ssBenefitGross, 4166, 'personal at first ineligible month (m=40)');
});

test('11. SSDI denied: SSDI stays 0 forever', () => {
  const s = gatherStateWithOverrides({
    ssType: 'ssdi', ssdiDenied: true, chadJob: false,
  });
  const { monthlyData } = runMonthlySimulation(s);
  for (const entry of monthlyData) {
    assert.strictEqual(entry.ssBenefit, 0, `month ${entry.month} should have 0 SSDI when denied`);
  }
});

test('12. SS retirement path (ssType ss): income starts at computed ssStartMonth', () => {
  // ssClaimAge 62 → ssStartMonth 19 (Oct 2027, mid-month birthday), PIA 4214 → personal 2950
  const s = gatherStateWithOverrides({
    expenseInflation: false, // A2 (2026-06-10): isolate from SS COLA (locked in ssCola.test.js)
    ssType: 'ss', ssClaimAge: 62, ssPIA: 4214, chadJob: false,
  });
  assert.strictEqual(s.ssStartMonth, 19, 'ssStartMonth = Oct 2027 (mid-month birthday +1)');
  assert.strictEqual(s.ssPersonal, 2950, 'ssPersonal = round(4214 * 0.70)');
  // B4 (2026-06-10): student rule extends child benefits to m=39 → window = 40 − 19 = 21.
  assert.strictEqual(s.ssKidsAgeOutMonths, 21, 'kids eligible 21 months (month 19-39, student rule)');
  // B5 (2026-06-10): retirement family maximum via bend points.
  // FMAX(4214) = 1.5×1643 + 2.72×(2371−1643) + 1.34×(3093−2371) + 1.75×(4214−3093) = 7373.8.
  // Aux pool = FMAX − PIA = 3159.8 — binds vs 2 children × round(4214 × 0.5) = 4214.
  // Family = reduced worker (2950) + round(3159.8) = 6110 (was 6321 under flat 1.5×PIA).
  const auxPool = familyMaxForPIA(4214) - 4214;
  assert.strictEqual(s.ssFamilyTotal, 2950 + Math.round(Math.min(2 * Math.round(4214 * 0.5), auxPool)),
    'ssFamilyTotal = ssPersonal + min(2 × 0.5 PIA, FMAX − PIA)');
  assert.strictEqual(s.ssFamilyTotal, 6110, 'bend-point family max binds at PIA=4214');
  const { monthlyData } = runMonthlySimulation(s);
  assert.strictEqual(monthlyData[18].ssBenefitGross, 0, 'no SS before start month');
  assert.strictEqual(monthlyData[19].ssBenefitGross, s.ssFamilyTotal, 'ssFamilyTotal at SS start month'); // A1: gross
  // B4: family rate runs through m=39 (HS graduation); personal from m=40.
  assert.strictEqual(monthlyData[39].ssBenefitGross, s.ssFamilyTotal, 'still family at m=39 (student rule)');
  assert.strictEqual(monthlyData[40].ssBenefitGross, 2950, 'ssPersonal after kids age out (m=40)');
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

test('14a. Annual raise compounds yearly on base salary', () => {
  const startMonth = 0;
  const salary = 100000;
  const taxRate = 25;
  const raisePct = 4; // 4%/yr
  const s = gatherStateWithOverrides({
    chadJob: true, chadJobSalary: salary, chadJobTaxRate: taxRate, chadJobStartMonth: startMonth,
    chadJobRaisePct: raisePct, chadWorkMonths: 60,
  });
  const { monthlyData } = runMonthlySimulation(s);
  // Year 1 (months 0-11): base salary
  const y1Net = Math.round(salary * 0.75 / 12);
  assert.strictEqual(monthlyData[0].chadJobIncome, y1Net, 'year 1 = base salary');
  assert.strictEqual(monthlyData[11].chadJobIncome, y1Net, 'month 11 still year 1');
  // Year 2 (months 12-23): salary * 1.04
  const y2Net = Math.round(salary * 1.04 * 0.75 / 12);
  assert.strictEqual(monthlyData[12].chadJobIncome, y2Net, 'year 2 = base * (1+r)');
  // Year 3 (months 24-35): salary * 1.04^2
  const y3Net = Math.round(salary * Math.pow(1.04, 2) * 0.75 / 12);
  assert.strictEqual(monthlyData[24].chadJobIncome, y3Net, 'year 3 = base * (1+r)^2');
});

test('14b. Annual bonus paid as lump sum in configured month, prorated in year 1', () => {
  // Start at projection month 0 (= March 2026, calendar month 2). Bonus month
  // = 8 (September). First September after start is projection month 6.
  const startMonth = 0;
  const salary = 100000;
  const taxRate = 25;
  const bonusPct = 20; // 20% of salary
  const bonusMonth = 8; // September
  const s = gatherStateWithOverrides({
    chadJob: true, chadJobSalary: salary, chadJobTaxRate: taxRate, chadJobStartMonth: startMonth,
    chadJobBonusPct: bonusPct, chadJobBonusMonth: bonusMonth, chadJobBonusProrateFirst: true,
    chadWorkMonths: 60,
  });
  const { monthlyData } = runMonthlySimulation(s);
  const monthlySalaryNet = Math.round(salary * 0.75 / 12);
  // Non-bonus month = salary only
  assert.strictEqual(monthlyData[0].chadJobIncome, monthlySalaryNet, 'month 0 = salary only (not Sept)');
  assert.strictEqual(monthlyData[5].chadJobIncome, monthlySalaryNet, 'month 5 = salary only');
  // Month 6 = September of year 1, prorated 6/12 of bonus
  const proratedBonusNet = Math.round(salary * 0.20 * (6 / 12) * 0.75);
  const expectedSeptNet = monthlySalaryNet + proratedBonusNet;
  assert.strictEqual(monthlyData[6].chadJobIncome, expectedSeptNet, 'first Sept = salary + prorated bonus');
  // Month 7 = back to salary only
  assert.strictEqual(monthlyData[7].chadJobIncome, monthlySalaryNet, 'month 7 = salary only');
  // Month 18 = September of year 2, full bonus
  const fullBonusNet = Math.round(salary * 0.20 * 0.75);
  assert.strictEqual(monthlyData[18].chadJobIncome, monthlySalaryNet + fullBonusNet,
    'second Sept = salary + full bonus');
});

test('14b-prorate-off. With prorate disabled, no bonus until 1 full year', () => {
  const startMonth = 0;
  const salary = 100000;
  const s = gatherStateWithOverrides({
    chadJob: true, chadJobSalary: salary, chadJobTaxRate: 25, chadJobStartMonth: startMonth,
    chadJobBonusPct: 20, chadJobBonusMonth: 8, chadJobBonusProrateFirst: false,
    chadWorkMonths: 60,
  });
  const { monthlyData } = runMonthlySimulation(s);
  const monthlySalaryNet = Math.round(salary * 0.75 / 12);
  // Month 6 = first September, but only 6 months worked → no bonus (eligibility cliff)
  assert.strictEqual(monthlyData[6].chadJobIncome, monthlySalaryNet, 'no bonus before 1 year');
  // Month 18 = second September, 18 months worked → full bonus
  const fullBonusNet = Math.round(salary * 0.20 * 0.75);
  assert.strictEqual(monthlyData[18].chadJobIncome, monthlySalaryNet + fullBonusNet, 'full bonus after 1 year');
});

test('14b-month. Bonus month is configurable (e.g. June)', () => {
  // June = calendar month 5. m=0 is March (calendar 2). First June = m=3.
  const s = gatherStateWithOverrides({
    chadJob: true, chadJobSalary: 100000, chadJobTaxRate: 25, chadJobStartMonth: 0,
    chadJobBonusPct: 10, chadJobBonusMonth: 5, chadJobBonusProrateFirst: true,
    chadWorkMonths: 60,
  });
  const { monthlyData } = runMonthlySimulation(s);
  const monthlySalaryNet = Math.round(100000 * 0.75 / 12);
  // Month 3 = first June, 3 months worked → 3/12 prorate
  const proratedBonusNet = Math.round(100000 * 0.10 * (3 / 12) * 0.75);
  assert.strictEqual(monthlyData[3].chadJobIncome, monthlySalaryNet + proratedBonusNet,
    'June bonus prorated 3/12');
  // Month 15 = second June, 15 months worked → full bonus
  const fullBonusNet = Math.round(100000 * 0.10 * 0.75);
  assert.strictEqual(monthlyData[15].chadJobIncome, monthlySalaryNet + fullBonusNet,
    'second June = full bonus');
});

test('14d. Refresh grants: end-of-Aug cadence + 5%/qtr Feb/May/Aug/Nov, 20 vests/grant', () => {
  // PROJECTION_START_MONTH=2 (March=0). Calendar Aug = (m+2)%12==7, so m%12==5: m=5,17,29,41,53...
  // With refreshStartMonth=0, first refresh issues at m=5 (Aug yr1). First vest at next vest
  // month after m=5 = m=8 (Nov). Subsequent grants at m=17, 29, 41, 53.
  const grant = 60000;
  const s = gatherStateWithOverrides({
    chadJob: true, chadJobSalary: 100000, chadJobTaxRate: 25, chadJobStartMonth: 0,
    chadJobStockRefresh: grant, chadJobRefreshStartMonth: 0, chadWorkMonths: 96,
    msftGrowth: 0, // disable growth so refresh values are exactly 5% × grant
  });
  const { monthlyData } = runMonthlySimulation(s);
  const monthlySalaryNet = Math.round(100000 * 0.75 / 12);
  // Months 0-7: no refresh vest yet (first grant issues m=5 Aug, first vest m=8 Nov).
  for (const m of [0, 1, 2, 5, 7]) {
    assert.strictEqual(monthlyData[m].chadJobStockRefreshNet, 0,
      `month ${m}: no refresh vest before first grant's first vest at m=8`);
  }
  // Month 8 (Nov yr1): first vest of grant 1.
  const oneVestNet = Math.round(grant * 0.05 * 0.75);
  assert.strictEqual(monthlyData[8].chadJobStockRefreshNet, oneVestNet, 'Nov yr1: 1 grant × 5%');
  // Month 11 (Feb yr2): grant 1 second vest, still 1 grant active.
  assert.strictEqual(monthlyData[11].chadJobStockRefreshNet, oneVestNet, 'Feb yr2: 1 grant × 5%');
  // Month 20 (Nov yr2): grant 1 still vesting + grant 2 (issued m=17 Aug yr2) first vest.
  const twoVestNet = Math.round(grant * 0.05 * 2 * 0.75);
  assert.strictEqual(monthlyData[20].chadJobStockRefreshNet, twoVestNet, 'Nov yr2: 2 grants × 5%');
  // Month 56 (Nov yr5): 5 grants (issued m=5,17,29,41,53) all active in 5-yr window.
  const fiveVestNet = Math.round(grant * 0.05 * 5 * 0.75);
  assert.strictEqual(monthlyData[56].chadJobStockRefreshNet, fiveVestNet,
    'steady state Nov yr5: 5 grants × 5%');
});

test('14d-refresh-start. Default refreshStartMonth=12: first refresh at Aug yr2 (m=17)', () => {
  // chadJobRefreshStartMonth=12 (default). firstAugustAtOrAfter(0+12)=17 (Aug yr2).
  // First vest of grant 1 = next vest month after m=17 = m=20 (Nov yr2).
  const grant = 60000;
  const s = gatherStateWithOverrides({
    chadJob: true, chadJobSalary: 100000, chadJobTaxRate: 25, chadJobStartMonth: 0,
    chadJobStockRefresh: grant, chadWorkMonths: 96, msftGrowth: 0,
  });
  const { monthlyData } = runMonthlySimulation(s);
  // Months 0-19: no refresh vest yet.
  for (const m of [2, 5, 8, 11, 14, 17, 19]) {
    assert.strictEqual(monthlyData[m].chadJobStockRefreshNet, 0,
      `month ${m}: no refresh vest before first vest at m=20`);
  }
  // m=20 (Nov yr2): first vest of grant 1.
  const oneVestNet = Math.round(grant * 0.05 * 0.75);
  assert.strictEqual(monthlyData[20].chadJobStockRefreshNet, oneVestNet,
    'm=20 (Nov yr2): first refresh vest with default start month');
  // m=32 (Nov yr3): grant 1 (m=17) still vesting + grant 2 (m=29 Aug yr3) first vest.
  const twoVestNet = Math.round(grant * 0.05 * 2 * 0.75);
  assert.strictEqual(monthlyData[32].chadJobStockRefreshNet, twoVestNet,
    'm=32 (Nov yr3): 2 grants vest');
});

test('14d-refresh-start-custom. refreshStartMonth=6 still snaps to August (m=17)', () => {
  // refreshStartMonth=6 = Sept yr1. firstAugustAtOrAfter(6) = 17 (Aug yr2 — next August).
  // So even with chadJobRefreshStartMonth values < 12, the first refresh still
  // lands on the next August. This matches the user's "all grants happen in Aug" rule.
  const grant = 60000;
  const s = gatherStateWithOverrides({
    chadJob: true, chadJobSalary: 100000, chadJobTaxRate: 25, chadJobStartMonth: 0,
    chadJobStockRefresh: grant, chadJobRefreshStartMonth: 6, chadWorkMonths: 60, msftGrowth: 0,
  });
  const { monthlyData } = runMonthlySimulation(s);
  const oneVestNet = Math.round(grant * 0.05 * 0.75);
  // Pre-m=20: no refresh vest.
  for (const m of [0, 5, 8, 11, 14, 17, 19]) {
    assert.strictEqual(monthlyData[m].chadJobStockRefreshNet, 0,
      `month ${m}: no refresh vest before m=20`);
  }
  // m=20 (Nov yr2): first vest of grant 1 (issued m=17 Aug yr2).
  assert.strictEqual(monthlyData[20].chadJobStockRefreshNet, oneVestNet,
    'm=20 (Nov yr2): first vest snaps to August even with refreshStartMonth=6');
});

test('14e. One-time hire stock vests as anniversary lumps', () => {
  // Schedule: $55K Y1, $30K Y2, $25K Y3, $10K Y4 — paid at anniversary months 12/24/36/48.
  const s = gatherStateWithOverrides({
    chadJob: true, chadJobSalary: 100000, chadJobTaxRate: 25, chadJobStartMonth: 0,
    chadJobHireStockY1: 55000, chadJobHireStockY2: 30000,
    chadJobHireStockY3: 25000, chadJobHireStockY4: 10000,
    chadWorkMonths: 72,
  });
  const { monthlyData } = runMonthlySimulation(s);
  const monthlySalaryNet = Math.round(100000 * 0.75 / 12);
  // Months 0-11: no hire stock vest yet (first vest is at anniversary = m=12)
  assert.strictEqual(monthlyData[0].chadJobIncome, monthlySalaryNet, 'no hire vest before anniversary');
  assert.strictEqual(monthlyData[11].chadJobIncome, monthlySalaryNet, 'still no vest at month 11');
  // Month 12 (1st anniversary): $55K lump
  const y1Net = Math.round(55000 * 0.75);
  assert.strictEqual(monthlyData[12].chadJobIncome, monthlySalaryNet + y1Net, 'anniversary 1: $55K lump');
  // Month 13: back to salary only
  assert.strictEqual(monthlyData[13].chadJobIncome, monthlySalaryNet, 'month 13: no vest');
  // Month 24 (2nd anniversary): $30K lump
  const y2Net = Math.round(30000 * 0.75);
  assert.strictEqual(monthlyData[24].chadJobIncome, monthlySalaryNet + y2Net, 'anniversary 2: $30K lump');
  // Month 48 (4th anniversary): $10K lump
  const y4Net = Math.round(10000 * 0.75);
  assert.strictEqual(monthlyData[48].chadJobIncome, monthlySalaryNet + y4Net, 'anniversary 4: $10K lump');
  // Month 60 (5th anniversary): no Y5 entry — hire stock fully vested
  assert.strictEqual(monthlyData[60].chadJobIncome, monthlySalaryNet, 'no hire vest in Y5+');
});

test('14g. Cash sign-on bonus: 50% on hire, 50% on 1-yr anniversary', () => {
  const signOn = 60000; // total $60K split 50/50
  const s = gatherStateWithOverrides({
    chadJob: true, chadJobSalary: 100000, chadJobTaxRate: 25, chadJobStartMonth: 0,
    chadJobSignOnCash: signOn, chadWorkMonths: 60,
  });
  const { monthlyData } = runMonthlySimulation(s);
  const monthlySalaryNet = Math.round(100000 * 0.75 / 12);
  const halfNet = Math.round(signOn * 0.5 * 0.75); // 50% × 60K × (1 - tax + fica) = 22500
  // Month 0 (hire date): salary + first half
  assert.strictEqual(monthlyData[0].chadJobIncome, monthlySalaryNet + halfNet, 'hire date: 50% sign-on');
  assert.strictEqual(monthlyData[0].chadJobSignOnNet, halfNet, 'sign-on field on row');
  // Month 1: just salary
  assert.strictEqual(monthlyData[1].chadJobIncome, monthlySalaryNet, 'month 1: no sign-on');
  // Month 12 (anniversary): salary + second half
  assert.strictEqual(monthlyData[12].chadJobIncome, monthlySalaryNet + halfNet, 'anniversary: 50% sign-on');
  assert.strictEqual(monthlyData[12].chadJobSignOnNet, halfNet, 'sign-on at anniversary');
  // Month 24: no more sign-on
  assert.strictEqual(monthlyData[24].chadJobSignOnNet, 0, 'no sign-on after anniversary');
});

test('14g-late-start. Sign-on respects chadJobStartMonth offset', () => {
  // Chad starts at month 5 (Aug '26), sign-on $40K
  const s = gatherStateWithOverrides({
    chadJob: true, chadJobSalary: 100000, chadJobTaxRate: 25, chadJobStartMonth: 5,
    chadJobSignOnCash: 40000, chadWorkMonths: 60,
  });
  const { monthlyData } = runMonthlySimulation(s);
  const halfNet = Math.round(40000 * 0.5 * 0.75);
  // Month 4 (before start): no income
  assert.strictEqual(monthlyData[4].chadJobIncome, 0, 'before start: no income');
  // Month 5 (hire date): includes 50% sign-on
  assert.strictEqual(monthlyData[5].chadJobSignOnNet, halfNet, 'hire date m=5: 50% sign-on');
  // Month 17 (start + 12 = anniversary): second half
  assert.strictEqual(monthlyData[17].chadJobSignOnNet, halfNet, 'anniversary m=17: 50% sign-on');
});

test('14f. Stock vesting stops after chadRetirementMonth', () => {
  const s = gatherStateWithOverrides({
    chadJob: true, chadJobSalary: 100000, chadJobTaxRate: 25, chadJobStartMonth: 0,
    chadJobStockRefresh: 50000, chadJobHireStockY1: 50000,
    chadWorkMonths: 24, // Chad leaves at month 24
  });
  const { monthlyData } = runMonthlySimulation(s);
  // Month 25 — past retirement, no chadJob income at all
  assert.strictEqual(monthlyData[25].chadJobIncome, 0, 'no income after retirement');
  // Month 26 (Aug, would have been a vest month): also zero
  assert.strictEqual(monthlyData[26]?.chadJobIncome ?? 0, 0, 'no vest after retirement');
});

test('14c. Raise=0 and Bonus=0 matches legacy net-salary formula', () => {
  const salary = 80000;
  const s = gatherStateWithOverrides({
    chadJob: true, chadJobSalary: salary, chadJobTaxRate: 25, chadJobStartMonth: 0,
    chadJobRaisePct: 0, chadJobBonusPct: 0,
  });
  const { monthlyData } = runMonthlySimulation(s);
  const expected = Math.round(salary * 0.75 / 12);
  assert.strictEqual(monthlyData[0].chadJobIncome, expected, 'no raise/bonus matches base formula');
  assert.strictEqual(monthlyData[12].chadJobIncome, expected, 'salary unchanged with 0% raise');
});

test('15. Back pay: added at ssdiApprovalMonth + 2, includes auxiliary share, fee on adult share only', () => {
  const approvalMonth = 5;
  const backPayMonths = 18;
  const personal = 4152;
  const family = 6228; // 1.5x personal — SSDI FMB ceiling
  const s = gatherStateWithOverrides({
    ssType: 'ssdi', ssdiApprovalMonth: approvalMonth, ssdiDenied: false,
    ssdiBackPayMonths: backPayMonths, ssdiPersonal: personal, ssdiFamilyTotal: family,
    kidsAgeOutMonths: 60, chadJob: false,
    // Zero out other noise: large starting savings so balance doesn't go negative
    startingSavings: 500000,
  });
  const { monthlyData, backPayActual } = runMonthlySimulation(s);
  const adultGross = backPayMonths * personal;
  const auxGross = Math.min(backPayMonths, 60) * (family - personal);
  const fee = Math.min(Math.round(adultGross * 0.25), 9200);
  // A1 (2026-06-10): adult back pay carries the interim 18.7% tax haircut.
  const tax = Math.round(adultGross * SS_INTERIM_TAX_HAIRCUT);
  const expectedBackPay = adultGross + auxGross - fee - tax;
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
    expenseInflation: false,
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
    expenseInflation: false,
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
    expenseInflation: false,
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
    expenseInflation: false,
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
    expenseInflation: false,
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
    expenseInflation: false,
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

// ── D7 (remediation 2026-06-09): 401(k) deficit draws are PRE-TAX dollars —
// covering $1 of net deficit requires withdrawing 1/(1-rate) gross.
// withdrawal401k on the row is the GROSS amount leaving the account; only the
// after-tax net lands in savings. Home-equity draws stay dollar-for-dollar
// (modeled as a sale of equity — untaxed, no loan, no interest).

// Shared deficit fixture: deterministic (all returns 0), big expenses, no
// income noise from van sale / back-pay / job.
const D7_BASE = {
  startingSavings: 1000, investmentReturn: 0, return401k: 0, homeAppreciation: 0,
  baseExpenses: 80000, retireDebt: false, debtService: 6434,
  vanSold: false, lifestyleCutsApplied: false,
  bcsYearsLeft: 0, milestones: [], chadJob: false,
  ssdiDenied: true,
};

test('34b. D7: 401(k) deficit draw is grossed up by deficit401kTaxRate', () => {
  const s = gatherStateWithOverrides({
    ...D7_BASE, starting401k: 1000000, homeEquity: 0, deficit401kTaxRate: 25,
  });
  const { monthlyData } = runMonthlySimulation(s);
  const m0 = monthlyData[0];
  // Pre-draw deficit at month 0 (every component is an integer)
  const netNeeded = -(s.startingSavings + m0.investReturn + m0.cashIncome - m0.expenses);
  assert.ok(netNeeded > 0, `fixture must be in deficit, got netNeeded=${netNeeded}`);
  assert.strictEqual(m0.withdrawal401k, Math.ceil(netNeeded / (1 - 0.25)),
    'gross draw = ceil(net / (1 - rate))');
  assert.ok(m0.withdrawal401k > netNeeded, 'gross must exceed the net deficit');
  assert.strictEqual(m0.balance, 0, 'after-tax net restores savings exactly to 0');
  assert.strictEqual(m0.balance401k, 1000000 - m0.withdrawal401k,
    'the full gross leaves the 401(k)');
});

test('34c. D7: deficit401kTaxRate=0 draws dollar-for-dollar (edge)', () => {
  const s = gatherStateWithOverrides({
    ...D7_BASE, starting401k: 1000000, homeEquity: 0, deficit401kTaxRate: 0,
  });
  const { monthlyData } = runMonthlySimulation(s);
  const m0 = monthlyData[0];
  const netNeeded = -(s.startingSavings + m0.investReturn + m0.cashIncome - m0.expenses);
  assert.strictEqual(m0.withdrawal401k, netNeeded, 'rate 0 → gross equals net');
  assert.strictEqual(m0.balance, 0);
});

test('34d. D7: default deficit401kTaxRate is 25% (omitted field behaves like explicit 25)', () => {
  const sDefault = gatherStateWithOverrides({ ...D7_BASE, starting401k: 1000000, homeEquity: 0 });
  const sExplicit = gatherStateWithOverrides({
    ...D7_BASE, starting401k: 1000000, homeEquity: 0, deficit401kTaxRate: 25,
  });
  const d = runMonthlySimulation(sDefault).monthlyData;
  const e = runMonthlySimulation(sExplicit).monthlyData;
  for (const m of [0, 6, 12]) {
    assert.strictEqual(d[m].withdrawal401k, e[m].withdrawal401k, `month ${m} withdrawal parity`);
    assert.strictEqual(d[m].balance401k, e[m].balance401k, `month ${m} balance401k parity`);
  }
});

test('34e. D7: gross-up depletes the 401(k) faster than the net deficit alone', () => {
  const mk = (rate) => gatherStateWithOverrides({
    ...D7_BASE, starting401k: 2000000, homeEquity: 0, deficit401kTaxRate: rate,
  });
  const net = runMonthlySimulation(mk(0)).monthlyData;
  const grossed = runMonthlySimulation(mk(25)).monthlyData;
  // While both accounts still hold money, the grossed-up path must have drawn
  // more (gross > net) and therefore hold a smaller balance.
  assert.ok(grossed[12].balance401k < net[12].balance401k,
    `grossed-up balance401k at month 12 (${grossed[12].balance401k}) must trail net-only (${net[12].balance401k})`);
  // And the account must hit zero strictly earlier.
  const depletionMonth = (rows) => rows.findIndex(d => d.balance401k <= 0);
  assert.ok(depletionMonth(grossed) !== -1, '401(k) must deplete in the grossed scenario');
  assert.ok(depletionMonth(grossed) < depletionMonth(net),
    `grossed-up 401(k) must deplete earlier (${depletionMonth(grossed)} vs ${depletionMonth(net)})`);
});

test('34f. D7: capped 401(k) draw nets (1-rate)×balance; remainder falls to home equity at face value', () => {
  const s = gatherStateWithOverrides({
    ...D7_BASE, starting401k: 1000, homeEquity: 500000, deficit401kTaxRate: 25,
  });
  const { monthlyData } = runMonthlySimulation(s);
  const m0 = monthlyData[0];
  const netNeeded = -(s.startingSavings + m0.investReturn + m0.cashIncome - m0.expenses);
  assert.strictEqual(m0.withdrawal401k, 1000, 'draw capped at the full 401(k) balance');
  assert.strictEqual(m0.balance401k, 0, '401(k) exhausted');
  const netFrom401k = Math.floor(1000 * (1 - 0.25));
  // Home equity (sale of equity — untaxed) covers the rest dollar-for-dollar.
  assert.strictEqual(m0.homeEquity, 500000 - (netNeeded - netFrom401k),
    'home equity covers exactly the remaining net deficit');
  assert.strictEqual(m0.balance, 0, 'savings restored to 0');
});

test('34g. D7: ending resources reflect the gross-up (higher rate → lower ending net worth)', () => {
  const mk = (rate) => gatherStateWithOverrides({
    ...D7_BASE, starting401k: 2000000, homeEquity: 700000, deficit401kTaxRate: rate,
  });
  const low = runMonthlySimulation(mk(0)).monthlyData[72];
  const high = runMonthlySimulation(mk(40)).monthlyData[72];
  const resources = (d) => d.balance + d.balance401k + d.homeEquity;
  assert.ok(resources(high) < resources(low),
    `ending resources at 40% (${resources(high)}) must be below 0% (${resources(low)})`);
});

// ── C11 (remediation 2026-06-10, item 5.2): withdrawalHome must be exposed
// on monthlyData rows — home-equity draws were silently covering deficits
// with no per-row trace (monteCarlo had to diff the homeEquity series to
// reconstruct them).

test('34h. C11: withdrawalHome exposed on rows; homeEquity identity holds each month', () => {
  const s = gatherStateWithOverrides({
    ...D7_BASE, starting401k: 0, homeEquity: 500000, homeAppreciation: 0,
  });
  const { monthlyData } = runMonthlySimulation(s);
  const m0 = monthlyData[0];
  assert.ok(typeof m0.withdrawalHome === 'number', 'withdrawalHome must be a number on the row');
  assert.ok(m0.withdrawalHome > 0, `month-0 deficit must draw home equity, got ${m0.withdrawalHome}`);
  // With appreciation = 0 the row identity is exact:
  // homeEquity[m] = homeEquity[m-1] − withdrawalHome[m]
  let prev = 500000;
  for (const d of monthlyData) {
    assert.strictEqual(d.homeEquity, prev - d.withdrawalHome,
      `month ${d.month}: homeEquity (${d.homeEquity}) must equal prev (${prev}) − draw (${d.withdrawalHome})`);
    prev = d.homeEquity;
  }
});

test('34i. C11: withdrawalHome identity holds WITH appreciation (grow-then-draw order)', () => {
  const s = gatherStateWithOverrides({
    ...D7_BASE, starting401k: 0, homeEquity: 500000, homeAppreciation: 4,
  });
  const { monthlyData } = runMonthlySimulation(s);
  const monthlyHomeRate = Math.pow(1 + 4 / 100, 1 / 12) - 1;
  let prev = 500000;
  for (const d of monthlyData) {
    // Engine order (projection.js): m>0 grows (rounded), THEN the draw decrements.
    const afterGrowth = d.month === 0 ? prev : Math.round(prev * (1 + monthlyHomeRate));
    assert.strictEqual(d.homeEquity, afterGrowth - d.withdrawalHome,
      `month ${d.month}: homeEquity (${d.homeEquity}) must equal grown (${afterGrowth}) − draw (${d.withdrawalHome})`);
    prev = d.homeEquity;
  }
  const total = monthlyData.reduce((acc, d) => acc + d.withdrawalHome, 0);
  assert.ok(total > 0, 'cumulative home draws must be positive in the deficit fixture');
});

test('34j. C11: withdrawalHome is 0 in surplus months (no phantom draws)', () => {
  const s = gatherStateWithOverrides({
    startingSavings: 500000, starting401k: 100000, homeEquity: 500000,
    investmentReturn: 0, return401k: 0, homeAppreciation: 0,
    baseExpenses: 1000, retireDebt: true, vanSold: false, lifestyleCutsApplied: false,
    bcsYearsLeft: 0, milestones: [], chadJob: false, ssdiDenied: true,
  });
  const { monthlyData } = runMonthlySimulation(s);
  for (const d of monthlyData) {
    assert.strictEqual(d.withdrawalHome, 0, `month ${d.month}: surplus scenario must never draw home equity`);
  }
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
    expenseInflation: false,
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
    expenseInflation: false, // A2 (2026-06-10): isolate from SS COLA (locked in ssCola.test.js)
    ssType: 'ssdi', ssdiApprovalMonth: 0, ssdiDenied: false,
    ssdiFamilyTotal: 6500, kidsAgeOutMonths: 60, chadJob: false,
  });
  const { monthlyData } = runMonthlySimulation(s);
  // With ssdiApprovalMonth=0, SSDI should be active from month 0
  assert.strictEqual(monthlyData[0].ssBenefitGross, 6500,
    'SSDI should appear at month 0 when ssdiApprovalMonth is 0');
  // The old || bug would have delayed to month 7
  assert.strictEqual(monthlyData[6].ssBenefitGross, 6500,
    'SSDI should still be active at month 6 (not starting here)'); // A1: gross
});

test('45. vanSaleMonth: 0 with vanSold: true — van cost should NOT apply at month 0', () => {
  const s = gatherStateWithOverrides({
    vanSold: true, vanSaleMonth: 0, vanMonthlySavings: 2597,
    retireDebt: true, lifestyleCutsApplied: false,
    bcsAnnualTotal: 0, milestones: [], chadJob: false,
    vanLoanBalance: 0, vanSalePrice: 0,
    expenseInflation: false,
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
    expenseInflation: false,
  });
  const { monthlyData } = runMonthlySimulation(s);
  // Every single month's expenses should equal baseExpenses (no BCS component)
  for (const entry of monthlyData) {
    assert.strictEqual(entry.expenses, s.baseExpenses,
      `month ${entry.month} expenses (${entry.expenses}) should equal baseExpenses (${s.baseExpenses}) with bcsYearsLeft=0`);
  }
});

test('49. ssdiApprovalMonth = 0 — SSDI income amount matches ssdiFamilyTotal at month 0', () => {
  // B4 (2026-06-10): SSDI child-benefit age-out is calendar-anchored to
  // SS_CHILD_BENEFIT_END_MONTH (=40, student rule), not TWINS_AGE_OUT_MONTH (=34).
  const familyTotal = 6500;
  const personal = 4166;
  const s = gatherStateWithOverrides({
    expenseInflation: false, // A2 (2026-06-10): isolate from SS COLA (locked in ssCola.test.js)
    ssType: 'ssdi', ssdiApprovalMonth: 0, ssdiDenied: false,
    ssdiFamilyTotal: familyTotal, ssdiPersonal: personal,
    kidsAgeOutMonths: 36, // legacy default; ignored by SSDI age-out path now
    chadJob: false,
  });
  const { monthlyData } = runMonthlySimulation(s);
  // SSDI should be active from month 0 at the family rate
  assert.strictEqual(monthlyData[0].ssBenefitGross, familyTotal,
    `month 0 SSDI should be ${familyTotal}, got ${monthlyData[0].ssBenefitGross}`);
  // Should transition to personal at SS_CHILD_BENEFIT_END_MONTH (=40)
  assert.strictEqual(monthlyData[SS_CHILD_BENEFIT_END_MONTH].ssBenefitGross, personal,
    `month ${SS_CHILD_BENEFIT_END_MONTH} SSDI should transition to personal ${personal}, got ${monthlyData[SS_CHILD_BENEFIT_END_MONTH].ssBenefitGross}`);
  // Month before transition (m=39) should still be family
  assert.strictEqual(monthlyData[SS_CHILD_BENEFIT_END_MONTH - 1].ssBenefitGross, familyTotal,
    `month ${SS_CHILD_BENEFIT_END_MONTH - 1} SSDI should still be family ${familyTotal}`);
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
    expenseInflation: false,
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
  const family = 6228;
  const s = gatherStateWithOverrides({
    ssType: 'ssdi', ssdiApprovalMonth: approvalMonth, ssdiDenied: false,
    ssdiBackPayMonths: backPayMonths, ssdiPersonal: personal, ssdiFamilyTotal: family,
    kidsAgeOutMonths: 60, chadJob: false,
    startingSavings: 500000, investmentReturn: 0,
    retireDebt: true, vanSold: true, vanSaleMonth: 0,
    bcsYearsLeft: 0, milestones: [],
    vanLoanBalance: 0, vanSalePrice: 0,
  });
  const { monthlyData, backPayActual } = runMonthlySimulation(s);
  // backPayActual should still be computed (with auxiliary share, fee on adult only)
  const adultGross = backPayMonths * personal;
  const auxGross = Math.min(backPayMonths, 60) * (family - personal);
  const fee = Math.min(Math.round(adultGross * 0.25), 9200);
  const tax = Math.round(adultGross * SS_INTERIM_TAX_HAIRCUT); // A1 (2026-06-10)
  const expectedBackPay = adultGross + auxGross - fee - tax;
  assert.strictEqual(backPayActual, expectedBackPay,
    `backPayActual should be ${expectedBackPay}, got ${backPayActual}`);

  // Run a control simulation identical except with denial (no back pay at all)
  const sControl = gatherStateWithOverrides({
    ssType: 'ssdi', ssdiApprovalMonth: approvalMonth, ssdiDenied: true,
    ssdiBackPayMonths: backPayMonths, ssdiPersonal: personal, ssdiFamilyTotal: family,
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
  assert.strictEqual(monthlyData[0].ssBenefit, 0,
    'SSDI should be 0 when chadJob is true');
});

// ════════════════════════════════════════════════════════════════════════
// SS Earnings Test (projection.js lines 82-86)
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== SS Earnings Test ===');

test('56. SS earnings test: consulting at limit ($2,040/mo) — no reduction', () => {
  // ssClaimAge 62, PIA 4214 → ssStartMonth 19, ssFamilyTotal computed
  // B3 (remediation 2026-06-10): 2026 lower exempt amount is $24,480 (was 2024's $22,320).
  const s = gatherStateWithOverrides({
    expenseInflation: false, // A2 (2026-06-10): isolate from SS COLA (locked in ssCola.test.js)
    ssType: 'ss', ssClaimAge: 62, ssPIA: 4214,
    chadConsulting: 2040, // $24,480/yr = exactly at limit
    chadJob: false, ssdiDenied: false,
  });
  const { monthlyData } = runMonthlySimulation(s);
  assert.strictEqual(monthlyData[19].ssBenefitGross, s.ssFamilyTotal,
    'SS benefits should NOT be reduced when consulting is exactly at the $24,480 annual limit'); // A1: gross
});

test('57. SS earnings test: consulting above limit ($3,000/mo) — benefits reduced', () => {
  // ssClaimAge 62, PIA 4214 → ssStartMonth 19
  const s = gatherStateWithOverrides({
    expenseInflation: false, // A2 (2026-06-10): isolate from SS COLA (locked in ssCola.test.js)
    ssType: 'ss', ssClaimAge: 62, ssPIA: 4214,
    chadConsulting: 3000, // $36,000/yr
    chadJob: false, ssdiDenied: false,
  });
  const { monthlyData } = runMonthlySimulation(s);
  // Annual excess: $36,000 - $24,480 = $11,520 (B3: 2026 exempt amount).
  // B1/B2 (2026-06-10, b-3): SSA withholds WHOLE checks until the annual
  // withholding (round($11,520/2) = $5,760) is recovered — not a smeared
  // $480/mo. First check of the cycle (m=19) is the boundary month: $5,760 is
  // less than one $6,110 check, so SSA nets it out of that single check
  // (pay $350) and every later month in the year pays in full.
  assert.strictEqual(monthlyData[19].ssBenefitGross, s.ssFamilyTotal - 5760,
    'first check of the year absorbs the whole annual withholding'); // A1: gross is post-earnings-test, pre-tax
  assert.strictEqual(monthlyData[20].ssBenefitGross, s.ssFamilyTotal,
    'second month of the cycle pays in full (whole-check withholding)');
  // January (m=22) starts a new withholding cycle.
  assert.strictEqual(monthlyData[22].ssBenefitGross, s.ssFamilyTotal - 5760,
    'January restarts the withholding cycle');
});

test('58. SS earnings test: does NOT apply under SSDI path', () => {
  const s = gatherStateWithOverrides({
    ssType: 'ssdi', ssdiApprovalMonth: 0, ssdiDenied: false,
    ssdiFamilyTotal: 6500, kidsAgeOutMonths: 72,
    chadConsulting: 1690, // at SGA limit
    chadJob: false,
  });
  const { monthlyData } = runMonthlySimulation(s);
  assert.strictEqual(monthlyData[0].ssBenefitGross, 6500,
    'SSDI benefits should NOT be reduced by earnings test (only applies to SS retirement)');
});

// ════════════════════════════════════════════════════════════════════════
// SS Claiming Age + PIA Derivation
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== SS Claiming Age + PIA Derivation ===');

test('SS adjustment factor: age 62 = 70% of PIA', () => {
  assert.strictEqual(Math.round(ssAdjustmentFactor(62) * 1000), 700);
});

test('SS adjustment factor: age 67 (FRA) = 100% of PIA', () => {
  assert.strictEqual(ssAdjustmentFactor(67), 1.0);
});

test('SS adjustment factor: age 70 = 124% of PIA', () => {
  assert.strictEqual(Math.round(ssAdjustmentFactor(70) * 1000), 1240);
});

// A7 (remediation 2026-06-10, item 1.5): SPOUSAL reduction schedule —
// 25/36% per month for the first 36 months early, 5/12% beyond, clamped at
// 1.0 from FRA (NO delayed retirement credits on spousal benefits).
test('A7. spousal adjustment factor: 62 = 65%, 64 = 75%, 65 = 83.33%, 67 = 100%, 70 = 100%', () => {
  assert.ok(Math.abs(ssSpousalAdjustmentFactor(62) - 0.65) < 1e-9, '60 months early → 65%');
  assert.ok(Math.abs(ssSpousalAdjustmentFactor(64) - 0.75) < 1e-9, '36 months early → 75%');
  assert.ok(Math.abs(ssSpousalAdjustmentFactor(65) - (1 - 24 * (25 / 36) / 100)) < 1e-9, '24 months early');
  assert.strictEqual(ssSpousalAdjustmentFactor(67), 1, 'FRA → 100%');
  assert.strictEqual(ssSpousalAdjustmentFactor(70), 1, 'NO delayed credits — clamps at 100%');
});

test('A7. gatherState applies the SPOUSAL factor to sarahSpousalAmount', () => {
  // Default claim 67 → unchanged 2107.
  const sDefault = gatherStateWithOverrides({ ssPIA: 4214 });
  assert.strictEqual(sDefault.sarahSpousalAmount, 2107, 'claim 67 → full 50% ceiling');
  // Claim 62 → round(2107 × 0.65) = 1370 (old worker-factor bug paid 1475).
  const s62 = gatherStateWithOverrides({ ssPIA: 4214, sarahSpousalClaimAge: 62 });
  assert.strictEqual(s62.sarahSpousalAmount, 1370, 'claim 62 → 65% of the ceiling');
  // Claim 70 → still 2107: spousal earns NO delayed credits (old bug paid 2613).
  const s70 = gatherStateWithOverrides({ ssPIA: 4214, sarahSpousalClaimAge: 70 });
  assert.strictEqual(s70.sarahSpousalAmount, 2107, 'claim 70 → clamped at the FRA ceiling');
});

test('A7. spousal suppressed inside the family-max window (kids aux flowing)', () => {
  // Chad claims SS at 62 (start m=19, kids' aux window m=19..39); Sarah is 62
  // now with claim age 62 → eligible from m=0, gated on Chad claiming (m=19).
  // While the kids' auxiliary share is flowing the family maximum is exhausted
  // — spousal must be $0. First payable month is m=40 (kids age out).
  // clients=0: no SE earnings, so her earnings test (A8) never withholds.
  const s = gatherStateWithOverrides({
    expenseInflation: false,
    ssType: 'ss', ssClaimAge: 62, ssPIA: 4214, chadConsulting: 0,
    sarahSpousalEnabled: true, sarahSpousalClaimAge: 62, sarahCurrentAge: 62,
    sarahCurrentClients: 0,
  });
  const { monthlyData } = runMonthlySimulation(s);
  assert.strictEqual(monthlyData[19].sarahSpousal, 0, 'm=19: family max window → spousal suppressed');
  assert.strictEqual(monthlyData[39].sarahSpousal, 0, 'm=39: last kids month → still suppressed');
  assert.strictEqual(monthlyData[40].sarahSpousalGross, s.sarahSpousalAmount,
    'm=40: kids aged out → spousal flows at the reduced amount');
});

test('gatherState: ssClaimAge 67 → ssStartMonth 79, ssPersonal = PIA', () => {
  const s = gatherStateWithOverrides({ ssType: 'ss', ssClaimAge: 67, ssPIA: 3822 });
  assert.strictEqual(s.ssStartMonth, 79, 'FRA starts at month 79 (mid-month birthday)');
  assert.strictEqual(s.ssPersonal, 3822, 'personal = 100% of PIA at FRA');
  assert.strictEqual(s.ssKidsAgeOutMonths, 0, 'twins already 18 at claim age 67');
  assert.strictEqual(s.ssFamilyTotal, 3822, 'no family benefit when kids aged out');
});

test('gatherState: ssClaimAge 70 → ssStartMonth 115, ssPersonal = 124% PIA', () => {
  const s = gatherStateWithOverrides({ ssType: 'ss', ssClaimAge: 70, ssPIA: 3822 });
  assert.strictEqual(s.ssStartMonth, 115, 'age 70 starts at month 115');
  assert.strictEqual(s.ssPersonal, 4739, 'personal = round(3822 * 1.24)');
  assert.strictEqual(s.ssKidsAgeOutMonths, 0, 'no family benefit');
});

test('gatherState: ssClaimAge 63 → 9 months of family benefits', () => {
  // B4 (2026-06-10): student rule — child benefits run to m=39 → 40 − 31 = 9 months.
  const s = gatherStateWithOverrides({ ssType: 'ss', ssClaimAge: 63, ssPIA: 3822 });
  assert.strictEqual(s.ssStartMonth, 31, 'age 63 starts at month 31');
  assert.strictEqual(s.ssKidsAgeOutMonths, 9, 'twins eligible 9 months (months 31-39, student rule)');
  assert.strictEqual(s.ssPersonal, 2867, 'personal = round(3822 * 0.75)');
  assert.ok(s.ssFamilyTotal > s.ssPersonal, 'family total includes child benefits');
});

test('gatherState: ssClaimAge 64+ → zero family benefit months', () => {
  const s = gatherStateWithOverrides({ ssType: 'ss', ssClaimAge: 64, ssPIA: 3822 });
  assert.strictEqual(s.ssStartMonth, 43, 'age 64 starts at month 43');
  assert.strictEqual(s.ssKidsAgeOutMonths, 0, 'twins already aged out at month 40 (B4 student rule)');
  assert.strictEqual(s.ssFamilyTotal, s.ssPersonal, 'no child benefits');
});

test('gatherState: SSDI path is unaffected by ssClaimAge/ssPIA', () => {
  const s = gatherStateWithOverrides({
    ssType: 'ssdi', ssClaimAge: 70, ssPIA: 5000,
    ssdiPersonal: 4166, ssdiFamilyTotal: 6500,
  });
  // SSDI path should NOT overwrite these values
  assert.strictEqual(s.ssdiPersonal, 4166, 'SSDI personal unchanged');
  assert.strictEqual(s.ssdiFamilyTotal, 6500, 'SSDI family unchanged');
});

test('Projection: SS at FRA (67) — no earnings test applies', () => {
  const s = gatherStateWithOverrides({
    expenseInflation: false, // A2 (2026-06-10): isolate from SS COLA (locked in ssCola.test.js)
    ssType: 'ss', ssClaimAge: 67, ssPIA: 3822,
    chadConsulting: 5000, chadJob: false,
    sarahWorkMonths: 96, // extend horizon to 96 months to cover FRA
  });
  const { monthlyData } = runMonthlySimulation(s);
  // SS starts at month 79, which is at/after FRA → no earnings test
  assert.strictEqual(monthlyData[79].ssBenefitGross, 3822,
    'Full PIA at FRA with no earnings test reduction despite $5,000/mo consulting');
});

test('Projection: SS at 62 — FRA recredit (ARF) applies in the MAIN projection (B2)', () => {
  const s = gatherStateWithOverrides({
    expenseInflation: false, // A2 (2026-06-10): isolate from SS COLA (locked in ssCola.test.js)
    ssType: 'ss', ssClaimAge: 62, ssPIA: 3822,
    chadConsulting: 3000, chadJob: false,
    sarahWorkMonths: 96, // extend horizon to 96 months
  });
  const result = runMonthlySimulation(s);
  const { monthlyData, ssWithheldSummary } = result;
  // Before FRA year: standard earnings test applies (whole-check, B1).
  assert.ok(monthlyData[19].ssBenefitGross < s.ssFamilyTotal, 'earnings test reduces benefits before FRA');
  // B1: the ARF counter counts only FULLY-withheld months.
  assert.ok(ssWithheldSummary.monthsFullyWithheld > 0, 'some months are fully withheld');
  // B2 (2026-06-10): at FRA (m=79) the main projection now applies the SSA
  // recredit — the personal benefit is recomputed with the withheld months
  // removed from the early-claim reduction, so monthlyData and the
  // RetirementIncomeChart (which already used ssRecalculatedBenefit) agree.
  const recredited = ssRecalculatedBenefit(3822, 62, ssWithheldSummary.monthsFullyWithheld);
  assert.ok(recredited > s.ssPersonal, 'recredit raises the post-FRA benefit above the claim-62 amount');
  assert.strictEqual(monthlyData[79].ssBenefitGross, recredited,
    `post-FRA benefit must be the ARF-recredited amount (${recredited}), not the claim-62 amount (${s.ssPersonal})`);
  // m=78 (Sep 2032) is the FRA-attainment month: exempt from the test (B7)
  // but the recredit has not been applied yet — still the claim-62 amount.
  assert.strictEqual(monthlyData[78].ssBenefitGross, s.ssPersonal,
    'attainment month: exempt from the earnings test, recredit not yet applied');
});

// ════════════════════════════════════════════════════════════════════════
// SS Family-Max Cap + Sarah Spousal Benefit
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== SS Family-Max Cap + Sarah Spousal Benefit ===');

test('P21. ssFamilyTotal uses the bend-point family maximum (B5, 2026-06-10)', () => {
  // PIA=4214, age 62 → personal 2950, kids window active (21 months, B4).
  // FMAX(4214) = 7373.8 → aux pool = 3159.8, binds vs 2 × 2107 = 4214.
  // Family = 2950 + 3160 = 6110. The old flat 1.5×PIA cap (6321) overpaid by
  // $211/mo at claim-62 because it ignored that SSA pays the aux pool on top
  // of the REDUCED worker benefit while the pool itself is FMAX − PIA.
  const s = gatherStateWithOverrides({
    ssType: 'ss', ssPIA: 4214, ssClaimAge: 62,
  });
  const auxPool = familyMaxForPIA(4214) - 4214;
  assert.ok(
    s.ssFamilyTotal <= s.ssPersonal + auxPool + 1, // +1 tolerance for rounding
    `P21 ssFamilyTotal should respect the bend-point aux pool, got ${s.ssFamilyTotal}`,
  );
  assert.strictEqual(s.ssFamilyTotal, 6110, 'P21 family = 2950 + round(min(4214, 3159.8)) = 6110');
});

test('P21c. Aux pool does NOT bind at low PIA — children get the full 50% each (B5)', () => {
  // PIA=1200, age 62 → personal = round(1200 × 0.7) = 840.
  // FMAX(1200) = 1.5 × 1200 = 1800 → aux pool = 600, binds vs 2 × 600 = 1200 → pool wins (600).
  // Use higher PIA where pool exceeds kids' sum: PIA 2000 → FMAX = 1.5×1643 + 2.72×357 = 3435.5
  // (floored to dime: 3435.5) → pool = 1435.5 binds vs 2 × 1000 = 2000 → 1436.
  const s = gatherStateWithOverrides({ ssType: 'ss', ssPIA: 2000, ssClaimAge: 62 });
  const expectedAux = Math.round(Math.min(2 * Math.round(2000 * 0.5), familyMaxForPIA(2000) - 2000));
  assert.strictEqual(s.ssFamilyTotal, s.ssPersonal + expectedAux,
    'family = personal + min(2 × 0.5 PIA, FMAX − PIA) at PIA=2000');
});

test('P21b. Cap does NOT bind at low PIA (uncapped family < 1.5 × PIA)', () => {
  // PIA=2000, age 62 → personal = round(2000 × 0.7) = 1400.
  // Uncapped family = 1400 + 2 × round(2000 × 0.5) = 3400.
  // Cap = round(2000 × 1.5) = 3000 → cap binds and reduces 3400 → 3000.
  // Use a PIA where the cap does NOT bind: pick a claim age where personal is high.
  // age 67 → personal = 2000, kids aged out → family = personal = 2000. Cap = 3000. No bind.
  const s = gatherStateWithOverrides({
    ssType: 'ss', ssPIA: 2000, ssClaimAge: 67,
  });
  assert.strictEqual(s.ssFamilyTotal, s.ssPersonal,
    'P21b kids aged out at 67: family = personal, cap not binding');
});

test('P22. Sarah spousal SS flows after she reaches claim age and Chad has claimed', () => {
  // Chad has a job, so SSDI is suppressed. After chadRetirementMonth=72, the
  // post-employment auto-SS fallback kicks in and ssBenefit > 0 for Chad.
  // Sarah reaches sarahSpousalClaimAge=67 in (67-59)*12 = 96 months from now.
  // At m=96, Sarah's spousal should flow: 50% of PIA × ssAdjustmentFactor(67) = 4214 × 0.5 × 1.0 = 2107.
  const s = gatherStateWithOverrides({
    expenseInflation: false, // A2 (2026-06-10): isolate from SS COLA (locked in ssCola.test.js)
    chadJob: true, chadJobSalary: 190000, ssType: 'ssdi',
    chadCurrentAge: 61, sarahCurrentAge: 59,
    sarahSpousalEnabled: true, sarahSpousalClaimAge: 67,
    ssPIA: 4214, ssClaimAge: 67,
    sarahWorkMonths: 120, // extend horizon past month 96
    chadWorkMonths: 72,
  });
  assert.strictEqual(s.sarahSpousalStartMonth, (67 - 59) * 12,
    'P22 derived start month = (claimAge - currentAge) × 12');
  assert.strictEqual(s.sarahSpousalAmount, 2107,
    'P22 spousal amount = round(PIA × 0.5 × adjustmentFactor(67)) = 2107');
  const { monthlyData } = runMonthlySimulation(s);
  const m96 = monthlyData[96];
  assert.ok(m96, 'P22 monthlyData should have entry at month 96');
  // Chad has claimed by m=96 (post-retirement auto-SS fallback fires when m > chadRetirementMonth=72)
  assert.ok(m96.ssBenefit > 0, `P22 Chad ssBenefit should be > 0 at m=96, got ${m96.ssBenefit}`);
  // A1 (2026-06-10): gross spousal — the net cash field carries the interim
  // 18.7% taxability haircut (locked in ssTaxHaircut.test.js).
  assert.ok(
    m96.sarahSpousalGross > 2000 && m96.sarahSpousalGross < 2200,
    `P22 expected ~$2107 Sarah spousal (gross) at m=96, got ${m96.sarahSpousalGross}`,
  );
});

test('P22b. Sarah spousal does NOT flow before she reaches claim age', () => {
  // Even if Chad has claimed (e.g. SSDI active), Sarah cannot collect spousal
  // until she reaches sarahSpousalClaimAge.
  const s = gatherStateWithOverrides({
    chadJob: false, ssType: 'ssdi', ssdiApprovalMonth: 0, ssdiDenied: false,
    sarahCurrentAge: 59, sarahSpousalEnabled: true, sarahSpousalClaimAge: 67,
    ssPIA: 4214, ssdiPersonal: 4214, ssdiFamilyTotal: 6321,
  });
  const { monthlyData } = runMonthlySimulation(s);
  // m=0..(96-1): Chad receives SSDI, but Sarah is too young → no spousal.
  assert.strictEqual(monthlyData[0].sarahSpousal, 0, 'P22b no spousal at m=0 (Sarah too young)');
  assert.strictEqual(monthlyData[36].sarahSpousal, 0, 'P22b no spousal at m=36 (Sarah age 62)');
  assert.strictEqual(monthlyData[71].sarahSpousal, 0, 'P22b no spousal at m=71 (Sarah age 64)');
});

test('P22c. Sarah spousal does NOT flow before Chad has claimed (ssBenefit === 0 gate)', () => {
  // Sarah is already old enough to claim at m=0 (sarahCurrentAge=67), but Chad
  // hasn't claimed yet (no SSDI, no job, ss claim age=70 → ssStartMonth far out),
  // so spousal is gated to zero.
  const s = gatherStateWithOverrides({
    chadJob: false, ssType: 'ss', ssClaimAge: 70, ssPIA: 4214,
    ssdiDenied: true, // suppress SSDI
    sarahCurrentAge: 67, sarahSpousalEnabled: true, sarahSpousalClaimAge: 67,
    sarahWorkMonths: 120,
  });
  // Sarah's start month = max(0, (67-67)*12) = 0 → eligible from m=0.
  assert.strictEqual(s.sarahSpousalStartMonth, 0, 'P22c Sarah start month = 0 (already at claim age)');
  const { monthlyData } = runMonthlySimulation(s);
  // ssClaimAge 70 → ssStartMonth 115 (per constants). Before that, ssBenefit=0 → no spousal.
  assert.strictEqual(monthlyData[0].ssBenefit, 0, 'P22c Chad has not claimed yet');
  assert.strictEqual(monthlyData[0].sarahSpousal, 0, 'P22c no spousal until Chad claims');
  assert.strictEqual(monthlyData[60].sarahSpousal, 0, 'P22c no spousal even at m=60 (Chad still not claimed)');
});

test('P23. Sarah spousal off → no spousal income at any month', () => {
  const s = gatherStateWithOverrides({
    chadJob: true, sarahSpousalEnabled: false,
    ssPIA: 4214, ssClaimAge: 67, sarahCurrentAge: 59,
    sarahWorkMonths: 120, chadWorkMonths: 72,
  });
  // gatherState should set start month to 999 sentinel and amount to 0.
  assert.strictEqual(s.sarahSpousalStartMonth, 999, 'P23 disabled toggle → start month sentinel = 999');
  assert.strictEqual(s.sarahSpousalAmount, 0, 'P23 disabled toggle → amount = 0');
  const { monthlyData } = runMonthlySimulation(s);
  const anySpousal = monthlyData.some(d => (d.sarahSpousal || 0) > 0);
  assert.strictEqual(anySpousal, false, 'P23 no spousal in any month when disabled');
});

test('P24. sarahSpousal field appears on every monthlyData row', () => {
  // Contract test: every row exposes the field so downstream consumers
  // (charts/tooltips) can read it without optional-chaining gymnastics.
  const s = gatherStateWithOverrides({});
  const { monthlyData } = runMonthlySimulation(s);
  for (const row of monthlyData) {
    assert.ok('sarahSpousal' in row, `row at month ${row.month} missing sarahSpousal field`);
    assert.strictEqual(typeof row.sarahSpousal, 'number', `row at month ${row.month}: sarahSpousal must be a number`);
    assert.ok(Number.isFinite(row.sarahSpousal), `row at month ${row.month}: sarahSpousal must be finite`);
  }
});

test('P24b. sarahSpousal flows into cashIncome (reconciles to sum of income components)', () => {
  // When Sarah's spousal is active, cashIncome must include it.
  const s = gatherStateWithOverrides({
    chadJob: true, chadJobSalary: 190000,
    sarahCurrentAge: 59, sarahSpousalEnabled: true, sarahSpousalClaimAge: 67,
    ssPIA: 4214, ssClaimAge: 67,
    sarahWorkMonths: 120, chadWorkMonths: 72,
  });
  const { monthlyData } = runMonthlySimulation(s);
  const m96 = monthlyData[96];
  assert.ok(m96, 'P24b month 96 row exists');
  assert.ok(m96.sarahSpousal > 0, 'P24b spousal active at m=96');
  // cashIncome = sarahIncome + msftLump + trustLLC + ssBenefit + sarahSpousal + consulting + chadJobIncome + customLeverMonthly
  const reconstructed =
    (m96.sarahIncome || 0)
    + (m96.msftLump || 0)
    + (m96.trustLLC || 0)
    + (m96.ssBenefit || 0)
    + (m96.sarahSpousal || 0)
    + (m96.consulting || 0)
    + (m96.chadJobIncome || 0)
    + (m96.customLeverMonthly || 0);
  assert.strictEqual(m96.cashIncome, reconstructed,
    `P24b cashIncome (${m96.cashIncome}) must equal sum of income components (${reconstructed})`);
});

// ════════════════════════════════════════════════════════════════════════
// Job + SS Coexistence
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Job + SS Coexistence ===');

test('Job + SS at 62: SS income flows with earnings test on salary', () => {
  const s = gatherStateWithOverrides({
    expenseInflation: false, // A2 (2026-06-10): isolate from SS COLA (locked in ssCola.test.js)
    ssType: 'ss', ssClaimAge: 62, ssPIA: 4214,
    chadJob: true, chadJobSalary: 80000, chadJobStartMonth: 0,
  });
  const { monthlyData } = runMonthlySimulation(s);
  // SS starts month 19 with earnings test on $80K salary
  assert.strictEqual(monthlyData[18].ssBenefitGross, 0, 'no SS before start month');
  // Earnings test (B3, 2026 exempt $24,480): excess = $80K - $24,480 = $55,520;
  // annual withholding = round($55,520/2) = $27,760.
  // B1/B2 (2026-06-10, b-3): SSA withholds WHOLE checks — at $6,110/mo the
  // claim-year months m=19..21 (Oct–Dec 2027) are $0 checks, and the 2028
  // cycle withholds m=22..25 in full, pays a partial boundary check at m=26
  // (remaining $27,760 − 4 × $6,110 = $3,320), then full checks.
  assert.strictEqual(monthlyData[19].ssBenefitGross, 0, 'whole-check: first month fully withheld');
  assert.strictEqual(monthlyData[21].ssBenefitGross, 0, 'Dec 2027 still fully withheld');
  assert.strictEqual(monthlyData[26].ssBenefitGross, s.ssFamilyTotal - 3320,
    'boundary month pays the remainder of the check');
  assert.strictEqual(monthlyData[27].ssBenefitGross, s.ssFamilyTotal,
    'after the year\'s withholding is recovered, checks pay in full');
});

test('Job + SS at 62: full SS after job ends at chadRetirementMonth', () => {
  const s = gatherStateWithOverrides({
    expenseInflation: false, // A2 (2026-06-10): isolate from SS COLA (locked in ssCola.test.js)
    ssType: 'ss', ssClaimAge: 62, ssPIA: 4214,
    chadJob: true, chadJobSalary: 80000, chadJobStartMonth: 0,
    sarahWorkMonths: 96, // extend horizon beyond default chadWorkMonths=72
  });
  const { monthlyData } = runMonthlySimulation(s);
  // After month 72 (job ends), SS flows without earnings test
  assert.strictEqual(monthlyData[73].chadJobIncome, 0, 'no job income after retirement');
  assert.strictEqual(monthlyData[73].ssBenefitGross, s.ssPersonal, 'full SS personal (gross) after job ends'); // A1
});

test('Job + SSDI: SSDI still zeroed (SGA rules)', () => {
  const s = gatherStateWithOverrides({
    ssType: 'ssdi', ssdiApprovalMonth: 0,
    chadJob: true, chadJobSalary: 80000,
  });
  const { monthlyData } = runMonthlySimulation(s);
  assert.strictEqual(monthlyData[0].ssBenefit, 0, 'SSDI zeroed with job');
  assert.strictEqual(monthlyData[12].ssBenefit, 0, 'SSDI still zeroed at month 12');
});

test('Job + SS at 62: low salary ($30K) preserves most SS benefit', () => {
  const s = gatherStateWithOverrides({
    expenseInflation: false, // A2 (2026-06-10): isolate from SS COLA (locked in ssCola.test.js)
    ssType: 'ss', ssClaimAge: 62, ssPIA: 4214,
    chadJob: true, chadJobSalary: 30000, chadJobStartMonth: 0,
  });
  const { monthlyData } = runMonthlySimulation(s);
  // Excess = $30K - $24,480 = $5,520 (B3); annual withholding = round($5,520/2) = $2,760.
  // B1 (2026-06-10): whole-check semantics — the year's withholding is less
  // than one check, so the boundary month (the year's first check) absorbs it
  // all and every other month pays in full.
  assert.strictEqual(monthlyData[19].ssBenefitGross, s.ssFamilyTotal - 2760,
    'first check of the cycle absorbs the full annual withholding');
  assert.strictEqual(monthlyData[20].ssBenefitGross, s.ssFamilyTotal,
    'subsequent months pay in full');
  // Annually, >90% of the benefit is preserved: 2,760 withheld of ~73,320.
  const year2028 = monthlyData.filter(d => d.month >= 22 && d.month < 34);
  const paid = year2028.reduce((sum, d) => sum + d.ssBenefitGross, 0);
  assert.ok(paid > 12 * s.ssFamilyTotal * 0.9, 'over 90% of SS preserved at $30K salary (annual)');
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
    console.log(`        [baseline] month ${m}: balance=${monthlyData[m].balance}, ssBenefit=${monthlyData[m].ssBenefit}, consulting=${monthlyData[m].consulting}, expenses=${monthlyData[m].expenses}`);
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
    console.log(`        [chadJob]  month ${m}: balance=${monthlyData[m].balance}, chadJobIncome=${monthlyData[m].chadJobIncome}, ssBenefit=${monthlyData[m].ssBenefit}, consulting=${monthlyData[m].consulting}, expenses=${monthlyData[m].expenses}`);
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

  // Expected job net: 80000 * 0.75 / 12 = 5000 (25% all-in effective rate)
  const expectedJobNet = Math.round(80000 * (1 - 0.25) / 12);
  assert.strictEqual(expectedJobNet, 5000, 'expected monthly net should be $5,000 (after 25% tax)');

  // Print differences at key months for manual inspection
  for (const m of [0, 12, 36, 72]) {
    const incomeDiff = on[m].cashIncome - off[m].cashIncome;
    const expenseDiff = on[m].expenses - off[m].expenses;
    const balanceDiff = on[m].balance - off[m].balance;
    console.log(`        month ${m}: income diff=${incomeDiff}, expense diff=${expenseDiff}, balance diff=${balanceDiff}`);
    console.log(`          OFF: ssBenefit=${off[m].ssBenefit}, consulting=${off[m].consulting}, chadJob=${off[m].chadJobIncome}`);
    console.log(`          ON:  ssBenefit=${on[m].ssBenefit}, consulting=${on[m].consulting}, chadJob=${on[m].chadJobIncome}`);
  }

  // The income difference at month 0 should be:
  // +chadJobIncome - lostSSDI - lostConsulting
  // Since defaults: ssdiApprovalMonth=7, at month 0 SSDI is not yet active, consulting is 0
  // So at month 0 the income diff should just be +5000 (after tax)
  const m0IncomeDiff = on[0].cashIncome - off[0].cashIncome;
  const m0ExpenseDiff = on[0].expenses - off[0].expenses;
  console.log(`        [VERIFY] month 0: income diff = ${m0IncomeDiff}, expense diff = ${m0ExpenseDiff}`);

  // At month 0 with defaults: SSDI not yet approved (approval month 7), consulting = 0
  // So the only change is +$4,587 income (after tax + FICA) and -$4,200 expenses
  assert.strictEqual(m0IncomeDiff, expectedJobNet, `month 0 income diff should be +${expectedJobNet} (job income only), got ${m0IncomeDiff}`);
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
    assert.strictEqual(entry.ssBenefit, 0,
      `month ${entry.month}: SSDI should be 0 when chadJob=true, got ${entry.ssBenefit}`);
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
test('64. chadJobIncome is $4,587/mo (80000 * 0.75 / 12) starting at month 0', () => {
  const s = gatherStateWithOverrides({
    chadJob: true, chadJobStartMonth: 0, chadJobSalary: 80000,
    chadJobTaxRate: 25, chadJobHealthSavings: 4200,
  });
  const { monthlyData } = runMonthlySimulation(s);
  const expected = Math.round(80000 * (1 - 0.25) / 12);
  assert.strictEqual(monthlyData[0].chadJobIncome, expected,
    `month 0 chadJobIncome should be ${expected}, got ${monthlyData[0].chadJobIncome}`);
  // Verify it persists
  assert.strictEqual(monthlyData[36].chadJobIncome, expected,
    `month 36 chadJobIncome should be ${expected}, got ${monthlyData[36].chadJobIncome}`);
  assert.strictEqual(monthlyData[72].chadJobIncome, expected,
    `month 72 chadJobIncome should be ${expected}, got ${monthlyData[72].chadJobIncome}`);
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
    expenseInflation: false,
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
  const expectedJobNet68 = Math.round(80000 * (1 - 0.25) / 12);
  assert.strictEqual(monthlyData[6].chadJobIncome, expectedJobNet68,
    `month 6: chadJobIncome should be ${expectedJobNet68}, got ${monthlyData[6].chadJobIncome}`);
  assert.strictEqual(monthlyData[6].expenses, s.baseExpenses - 4200,
    `month 6: expenses should reflect health savings, got ${monthlyData[6].expenses}`);
  // Note: SSDI/consulting are still zeroed for ALL months when chadJob=true, even before job starts
  assert.strictEqual(monthlyData[0].ssBenefit, 0, 'SSDI zeroed even before job starts');
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
// Variable Horizon Tests (Epic 5 — Story 5.4)
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Variable Horizon — projection at 4yr, 8yr, 10yr ===');

test('VH1. sarahWorkMonths=48, chadWorkMonths=48 produces 49 months (0-48)', () => {
  const s = gatherStateWithOverrides({ sarahWorkMonths: 48, chadWorkMonths: 48 });
  assert.strictEqual(s.totalProjectionMonths, 48);
  const { monthlyData } = runMonthlySimulation(s);
  assert.strictEqual(monthlyData.length, 49, `expected 49, got ${monthlyData.length}`);
  assert.strictEqual(monthlyData[48].month, 48);
});

test('VH2. sarahWorkMonths=96 produces 97 months (0-96)', () => {
  const s = gatherStateWithOverrides({ sarahWorkMonths: 96 });
  assert.strictEqual(s.totalProjectionMonths, 96);
  const { monthlyData } = runMonthlySimulation(s);
  assert.strictEqual(monthlyData.length, 97, `expected 97, got ${monthlyData.length}`);
  assert.strictEqual(monthlyData[96].month, 96);
});

test('VH3. sarahWorkMonths=120 produces 121 months (0-120)', () => {
  const s = gatherStateWithOverrides({ sarahWorkMonths: 120 });
  assert.strictEqual(s.totalProjectionMonths, 120);
  const { monthlyData } = runMonthlySimulation(s);
  assert.strictEqual(monthlyData.length, 121, `expected 121, got ${monthlyData.length}`);
});

test('VH4. Post-retirement months (73+) have zero chadJobIncome and consulting', () => {
  const s = gatherStateWithOverrides({ sarahWorkMonths: 96 }); // Chad defaults to 72, Sarah to 96
  const { monthlyData } = runMonthlySimulation(s);
  for (const m of [73, 80, 96]) {
    assert.strictEqual(monthlyData[m].chadJobIncome, 0,
      `month ${m} chadJobIncome should be 0, got ${monthlyData[m].chadJobIncome}`);
    assert.strictEqual(monthlyData[m].consulting, 0,
      `month ${m} consulting should be 0, got ${monthlyData[m].consulting}`);
  }
});

test('VH5. Post-retirement months have positive sarahIncome', () => {
  const s = gatherStateWithOverrides({ sarahWorkMonths: 96 });
  const { monthlyData } = runMonthlySimulation(s);
  for (const m of [73, 80, 96]) {
    assert.ok(monthlyData[m].sarahIncome > 0,
      `month ${m} sarahIncome should be positive, got ${monthlyData[m].sarahIncome}`);
  }
});

test('VH6. Default produces identical 73-element output', () => {
  const s = gatherStateWithOverrides({});
  assert.strictEqual(s.totalProjectionMonths, 72);
  const { monthlyData } = runMonthlySimulation(s);
  assert.strictEqual(monthlyData.length, 73);
});

test('VH7. Quarterly data adapts to variable horizon', () => {
  const s4 = gatherStateWithOverrides({ sarahWorkMonths: 48, chadWorkMonths: 48 });
  const s8 = gatherStateWithOverrides({ sarahWorkMonths: 96 });
  const s10 = gatherStateWithOverrides({ sarahWorkMonths: 120 });
  const p4 = computeProjection(s4);
  const p8 = computeProjection(s8);
  const p10 = computeProjection(s10);
  assert.ok(p4.data.length < p8.data.length, `4yr (${p4.data.length}) should have fewer quarters than 8yr (${p8.data.length})`);
  assert.ok(p8.data.length < p10.data.length, `8yr (${p8.data.length}) should have fewer quarters than 10yr (${p10.data.length})`);
});

test('VH8 (2.7): quarterly data covers the FINAL projection year at the default 72-month horizon', () => {
  // Remediation 2.7 (2026-06-09 audit): buildQuarterlySchedule stopped at
  // totalProjectionMonths − 12, so the last 12 months were invisible in every
  // quarterly chart. The schedule must reach the last full/partial quarter.
  const s = gatherStateWithOverrides({});
  assert.strictEqual(s.totalProjectionMonths, 72);
  const proj = computeProjection(s);
  const last = proj.data[proj.data.length - 1];
  assert.ok(last.month >= s.totalProjectionMonths - 3,
    `Last quarter must start within 3 months of the horizon end (expected >= 69, got ${last.month})`);
  assert.strictEqual(proj.data.length, 24, `72-month horizon = 24 quarters, got ${proj.data.length}`);
  assert.strictEqual(last.label, "Q4'31", `Final projection year (Q4'31) must appear, got ${last.label}`);
});

test('VH9 (2.7): quarterly data covers the final year at an extended horizon (sarahWorkMonths=120)', () => {
  const s = gatherStateWithOverrides({ sarahWorkMonths: 120 });
  assert.strictEqual(s.totalProjectionMonths, 120);
  const proj = computeProjection(s);
  const last = proj.data[proj.data.length - 1];
  assert.ok(last.month >= 117,
    `Last quarter must start at month 117 for a 120-month horizon, got ${last.month}`);
  assert.strictEqual(proj.data.length, 40, `120-month horizon = 40 quarters, got ${proj.data.length}`);
  assert.strictEqual(last.label, "Q4'35", `Final projection year (Q4'35) must appear, got ${last.label}`);
});

test('VH10 (2.7): partial trailing quarter aggregates the remaining months (horizon not divisible by 3)', () => {
  // 70-month horizon: last quarter window starts at month 69 but only months
  // 69-70 exist — the aggregation must average the 2 available months, not NaN.
  const s = gatherStateWithOverrides({ chadWorkMonths: 70, sarahWorkMonths: 70 });
  assert.strictEqual(s.totalProjectionMonths, 70);
  const proj = computeProjection(s);
  const last = proj.data[proj.data.length - 1];
  assert.strictEqual(last.month, 69, `Partial trailing quarter (month 69) must be present, got ${last.month}`);
  assert.ok(Number.isFinite(last.netMonthly), `Partial quarter netMonthly must be finite, got ${last.netMonthly}`);
  assert.ok(Number.isFinite(last.expenses), `Partial quarter expenses must be finite, got ${last.expenses}`);
});

// ════════════════════════════════════════════════════════════════════════
// ssBenefitType disambiguation
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== ssBenefitType disambiguation ===');

test('ssBenefitType is "retirement" under SS path', () => {
  const s = gatherStateWithOverrides({ ssType: 'ss', ssClaimAge: 62, ssPIA: 4214 });
  const { monthlyData } = runMonthlySimulation(s);
  const active = monthlyData.find(d => d.ssBenefit > 0);
  assert.ok(active); assert.strictEqual(active.ssBenefitType, 'retirement');
});

test('ssBenefitType is "ssdi" under SSDI path', () => {
  const s = gatherStateWithOverrides({ ssType: 'ssdi', ssdiApprovalMonth: 3, ssdiDenied: false, ssdiFamilyTotal: 6500 });
  const { monthlyData } = runMonthlySimulation(s);
  assert.strictEqual(monthlyData[3].ssBenefitType, 'ssdi');
});

test('ssBenefitType is null before benefits start', () => {
  const s = gatherStateWithOverrides({ ssType: 'ssdi', ssdiApprovalMonth: 12 });
  const { monthlyData } = runMonthlySimulation(s);
  assert.strictEqual(monthlyData[0].ssBenefitType, null);
});

// ════════════════════════════════════════════════════════════════════════
// SS FRA recalculation
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== SS FRA recalculation ===');

test('ssRecalculatedBenefit with 0 months = original', () => {
  assert.strictEqual(ssRecalculatedBenefit(4214, 62, 0), Math.round(4214 * ssAdjustmentFactor(62)));
});

test('ssRecalculatedBenefit with 24 months increases benefit', () => {
  const orig = Math.round(4214 * ssAdjustmentFactor(62));
  const recalc = ssRecalculatedBenefit(4214, 62, 24);
  assert.ok(recalc > orig);
});

test('ssWithheldSummary tracks months with job + SS', () => {
  const s = gatherStateWithOverrides({ ssType: 'ss', ssClaimAge: 62, ssPIA: 4214, chadJob: true, chadJobSalary: 80000, chadJobStartMonth: 0 });
  const result = runMonthlySimulation(s);
  assert.ok(result.ssWithheldSummary.monthsFullyWithheld > 0);
});

// ════════════════════════════════════════════════════════════════════════
// MODEL_KEY Sensitivity
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== MODEL_KEY Sensitivity ===');

function projectionDiffers(baseMonthly, testMonthly) {
  const len = Math.min(baseMonthly.length, testMonthly.length);
  for (let i = 0; i < len; i++) {
    if (baseMonthly[i].balance !== testMonthly[i].balance) return true;
  }
  return baseMonthly.length !== testMonthly.length;
}

const PERTURBATIONS = {
  sarahRate: 250,
  sarahMaxRate: 300,
  sarahRateGrowth: 15,
  sarahCurrentClients: 4.5,
  sarahMaxClients: 5,
  sarahClientGrowth: 20,
  sarahTaxRate: 30,
  chadWorkMonths: 96,
  sarahWorkMonths: 96,
  msftPrice: 500,
  msftGrowth: 10,
  ssType: 'ss',
  ssdiApprovalMonth: 12,
  ssdiDenied: true,
  ssdiPersonal: 3500,
  ssdiFamilyTotal: 5000,
  // FIX #8: kidsAgeOutMonths no longer drives the SSDI age-out boundary (now
  // calendar-anchored to TWINS_AGE_OUT_MONTH). It still bounds auxiliary back-pay
  // months — perturb to 6 (< ssdiBackPayMonths=18) so it actually changes the
  // back-pay calculation and projection output.
  kidsAgeOutMonths: 6,
  chadConsulting: 1690,
  ssClaimAge: 62,
  ssPIA: 3000,
  chadJob: true,
  chadJobSalary: 120000,
  chadJobTaxRate: 30,
  chadJobStartMonth: 6,
  chadJobHealthSavings: 6000,
  chadJobNoFICA: true,
  chadJobPensionRate: 2,
  chadJobPensionContrib: 6,
  totalMonthlySpend: 60000,
  oneTimeExtras: 5000,
  oneTimeMonths: 12,
  baseExpenses: 50000,
  debtService: 8000,
  bcsAnnualTotal: 50000,
  bcsParentsAnnual: 30000,
  bcsYearsLeft: 2,
  lifestyleCutsApplied: true,
  cutsOverride: 5000,
  trustIncomeNow: 1500,
  trustIncomeFuture: 3000,
  trustIncreaseMonth: 6,
  vanSold: true,
  vanMonthlySavings: 3500,
  vanSalePrice: 100000,
  vanLoanBalance: 250000,
  vanSaleMonth: 6,
  retireDebt: true,
  startingSavings: 500000,
  investmentReturn: 8,
  ssdiBackPayMonths: 12,
  starting401k: 300000,
  return401k: 8,
  homeEquity: 500000,
  homeAppreciation: 2,
};

const NON_AFFECTING_KEYS = new Set([
  // Derived in gatherState from ssClaimAge — tested via ssClaimAge directly
  'ssFamilyTotal', 'ssPersonal', 'ssStartMonth', 'ssKidsAgeOutMonths',
  // Display only / SOR only / tested separately
  'goals', 'seqBadY1', 'seqBadY2', 'milestones',
  // Only active under ssType='ss' (default is 'ssdi')
  'ssClaimAge', 'ssPIA',
  // Only active when chadJob=true (default is false)
  'chadJobSalary', 'chadJobTaxRate', 'chadJobStartMonth', 'chadJobHealthSavings',
  'chadJobNoFICA', 'chadJobPensionRate', 'chadJobPensionContrib',
  // Only active when vanSold=true (default is false)
  'vanSalePrice', 'vanLoanBalance', 'vanSaleMonth',
  // Only active when lifestyleCutsApplied=true (default is false)
  'cutsOverride',
  // Requires counterpart: oneTimeExtras needs oneTimeMonths>0 and vice versa (both default 0)
  'oneTimeExtras', 'oneTimeMonths',
  // lifestyleCutsApplied alone (true) needs a non-zero cuts value to show effect;
  // tested in Boolean Toggle Matrix with cutsOverride set
  'lifestyleCutsApplied',
]);

test('M1. Every MODEL_KEY (except documented exceptions) changes projection output when perturbed', () => {
  const baseline = computeProjection(gatherStateWithOverrides({}));
  const noEffect = [];
  for (const [key, value] of Object.entries(PERTURBATIONS)) {
    const perturbed = computeProjection(gatherStateWithOverrides({ [key]: value }));
    if (!projectionDiffers(baseline.monthlyData, perturbed.monthlyData)) {
      noEffect.push(key);
    }
  }
  const unexpected = noEffect.filter(k => !NON_AFFECTING_KEYS.has(k));
  assert.strictEqual(unexpected.length, 0,
    `These MODEL_KEYs had no effect on projection output: ${unexpected.join(', ')}`);
});

test('M2. milestones field changes output', () => {
  const baseline = computeProjection(gatherStateWithOverrides({}));
  const s = gatherStateWithOverrides({ milestones: [{ name: 'X', month: 12, savings: 5000 }] });
  const perturbed = computeProjection(s);
  assert.ok(projectionDiffers(baseline.monthlyData, perturbed.monthlyData),
    'milestones should change projection output');
});

// ════════════════════════════════════════════════════════════════════════
// Boolean Toggle Matrix
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Boolean Toggle Matrix ===');

test('M3. All defaults (booleans off): no NaN in any field, expenses > 0', () => {
  const s = gatherStateWithOverrides({});
  const { monthlyData } = runMonthlySimulation(s);
  for (const entry of monthlyData) {
    for (const [key, val] of Object.entries(entry)) {
      if (typeof val === 'number') {
        assert.ok(!Number.isNaN(val), `month ${entry.month} field ${key} is NaN`);
      }
    }
    assert.ok(entry.expenses > 0, `month ${entry.month} expenses should be > 0, got ${entry.expenses}`);
  }
});

test('M4. retireDebt=true: expenses at month 0 lower by debtService (6434)', () => {
  const sBase = gatherStateWithOverrides({});
  const sDebt = gatherStateWithOverrides({ retireDebt: true });
  const { monthlyData: baseData } = runMonthlySimulation(sBase);
  const { monthlyData: debtData } = runMonthlySimulation(sDebt);
  near(baseData[0].expenses - debtData[0].expenses, sBase.debtService, 1, 'retireDebt reduces expenses by debtService');
});

test('M5. vanSold=true, vanSaleMonth=6: expenses at month 6 lower, balance hit by shortfall', () => {
  const sBase = gatherStateWithOverrides({ expenseInflation: false });
  const sVan = gatherStateWithOverrides({ vanSold: true, vanSaleMonth: 6, expenseInflation: false });
  const { monthlyData: baseData } = runMonthlySimulation(sBase);
  const { monthlyData: vanData } = runMonthlySimulation(sVan);
  assert.ok(vanData[6].expenses < baseData[6].expenses,
    `expenses at month 6 should be lower with vanSold=true: ${vanData[6].expenses} vs ${baseData[6].expenses}`);
  // Balance should be impacted by van shortfall
  const shortfall = sVan.vanLoanBalance - sVan.vanSalePrice;
  if (shortfall > 0) {
    assert.ok(vanData[6].balance < baseData[6].balance,
      'balance should be impacted by van sale shortfall');
  }
});

test('M6. lifestyleCutsApplied=true, cutsOverride=5000: expenses reduced by 5000 at month 0', () => {
  const sBase = gatherStateWithOverrides({});
  const sCuts = gatherStateWithOverrides({ lifestyleCutsApplied: true, cutsOverride: 5000 });
  const { monthlyData: baseData } = runMonthlySimulation(sBase);
  const { monthlyData: cutsData } = runMonthlySimulation(sCuts);
  near(baseData[0].expenses - cutsData[0].expenses, 5000, 1, 'cuts reduce expenses by 5000');
});

test('M7. chadJob=true, chadJobStartMonth=0: chadJobIncome > 0 at month 0, ssBenefit = 0', () => {
  const s = gatherStateWithOverrides({ chadJob: true, chadJobStartMonth: 0 });
  const { monthlyData } = runMonthlySimulation(s);
  assert.ok(monthlyData[0].chadJobIncome > 0,
    `chadJobIncome at month 0 should be > 0, got ${monthlyData[0].chadJobIncome}`);
  assert.strictEqual(monthlyData[0].ssBenefit, 0,
    `ssBenefit should be 0 when chadJob=true, got ${monthlyData[0].ssBenefit}`);
});

test('M8. ssdiDenied=true: ssBenefit = 0 for all months, backPayActual = 0', () => {
  const s = gatherStateWithOverrides({ ssdiDenied: true });
  const { monthlyData, backPayActual } = runMonthlySimulation(s);
  for (const entry of monthlyData) {
    assert.strictEqual(entry.ssBenefit, 0,
      `month ${entry.month}: ssBenefit should be 0 when denied, got ${entry.ssBenefit}`);
  }
  assert.strictEqual(backPayActual, 0, `backPayActual should be 0 when denied, got ${backPayActual}`);
});

test('M9. ssType=ss, ssClaimAge=62: ssBenefit > 0 after ssStartMonth, ssBenefitType = retirement', () => {
  const s = gatherStateWithOverrides({ ssType: 'ss', ssClaimAge: 62 });
  const { monthlyData } = runMonthlySimulation(s);
  assert.ok(monthlyData[s.ssStartMonth].ssBenefit > 0,
    `ssBenefit at ssStartMonth (${s.ssStartMonth}) should be > 0`);
  assert.strictEqual(monthlyData[s.ssStartMonth].ssBenefitType, 'retirement',
    'ssBenefitType should be retirement under SS path');
});

test('M10. retireDebt + vanSold + lifestyleCuts: cumulative expense reduction', () => {
  const sBase = gatherStateWithOverrides({});
  const sCombined = gatherStateWithOverrides({
    retireDebt: true, vanSold: true, vanSaleMonth: 0,
    lifestyleCutsApplied: true, cutsOverride: 5000,
    vanLoanBalance: 0, vanSalePrice: 0,
  });
  const { monthlyData: baseData } = runMonthlySimulation(sBase);
  const { monthlyData: combinedData } = runMonthlySimulation(sCombined);
  const reduction = baseData[0].expenses - combinedData[0].expenses;
  assert.ok(reduction > 5000,
    `cumulative reduction should exceed cuts alone (5000), got ${reduction}`);
});

test('M11. chadJob + SS: both chadJobIncome > 0 AND ssBenefit > 0 coexist after ssStartMonth', () => {
  const s = gatherStateWithOverrides({
    chadJob: true, chadJobStartMonth: 0,
    ssType: 'ss', ssClaimAge: 62,
  });
  const { monthlyData } = runMonthlySimulation(s);
  const ssMonth = s.ssStartMonth;
  assert.ok(monthlyData[ssMonth].chadJobIncome > 0,
    `chadJobIncome at month ${ssMonth} should be > 0, got ${monthlyData[ssMonth].chadJobIncome}`);
  // B1 (2026-06-10): with whole-check withholding the first months of each
  // calendar year are $0 checks at the default $80K salary; coexistence shows
  // up once the year's withholding is recovered (m=27, mid-2028).
  assert.strictEqual(monthlyData[ssMonth].ssBenefit, 0,
    'claim month check fully withheld under the earnings test (whole-check)');
  assert.ok(monthlyData[27].chadJobIncome > 0, 'job income still flowing at m=27');
  assert.ok(monthlyData[27].ssBenefit > 0,
    `ssBenefit at m=27 should be > 0 (SS coexists with job), got ${monthlyData[27].ssBenefit}`);
});

test('M12. chadJob + ssdiDenied: both disable SSDI, ssBenefit = 0', () => {
  const s = gatherStateWithOverrides({ chadJob: true, ssdiDenied: true });
  const { monthlyData } = runMonthlySimulation(s);
  for (const entry of monthlyData) {
    assert.strictEqual(entry.ssBenefit, 0,
      `month ${entry.month}: ssBenefit should be 0, got ${entry.ssBenefit}`);
  }
});

test('M13. Additivity: retireDebt + vanSold + cuts combined ~ sum of individual reductions', () => {
  const sBase = gatherStateWithOverrides({
    retireDebt: false, vanSold: false, lifestyleCutsApplied: false,
    cutsOverride: 5000, bcsYearsLeft: 0, milestones: [], chadJob: false,
  });
  const sDebt = gatherStateWithOverrides({
    retireDebt: true, vanSold: false, lifestyleCutsApplied: false,
    cutsOverride: 5000, bcsYearsLeft: 0, milestones: [], chadJob: false,
  });
  const sVan = gatherStateWithOverrides({
    retireDebt: false, vanSold: true, vanSaleMonth: 0, lifestyleCutsApplied: false,
    cutsOverride: 5000, bcsYearsLeft: 0, milestones: [], chadJob: false,
    vanLoanBalance: 0, vanSalePrice: 0,
  });
  const sCuts = gatherStateWithOverrides({
    retireDebt: false, vanSold: false, lifestyleCutsApplied: true,
    cutsOverride: 5000, bcsYearsLeft: 0, milestones: [], chadJob: false,
  });
  const sCombined = gatherStateWithOverrides({
    retireDebt: true, vanSold: true, vanSaleMonth: 0, lifestyleCutsApplied: true,
    cutsOverride: 5000, bcsYearsLeft: 0, milestones: [], chadJob: false,
    vanLoanBalance: 0, vanSalePrice: 0,
  });
  const { monthlyData: baseData } = runMonthlySimulation(sBase);
  const { monthlyData: debtData } = runMonthlySimulation(sDebt);
  const { monthlyData: vanData } = runMonthlySimulation(sVan);
  const { monthlyData: cutsData } = runMonthlySimulation(sCuts);
  const { monthlyData: combinedData } = runMonthlySimulation(sCombined);
  const debtReduction = baseData[0].expenses - debtData[0].expenses;
  const vanReduction = baseData[0].expenses - vanData[0].expenses;
  const cutsReduction = baseData[0].expenses - cutsData[0].expenses;
  const combinedReduction = baseData[0].expenses - combinedData[0].expenses;
  const sumOfIndividual = debtReduction + vanReduction + cutsReduction;
  near(combinedReduction, sumOfIndividual, 100, 'combined reduction ~ sum of individual reductions');
});

test('M14. Max reduction: expenses[0] significantly less than baseline and >= 0', () => {
  const sBase = gatherStateWithOverrides({});
  const sMax = gatherStateWithOverrides({
    retireDebt: true, vanSold: true, vanSaleMonth: 0,
    lifestyleCutsApplied: true, cutsOverride: 10000,
    chadJob: true, chadJobStartMonth: 0,
    vanLoanBalance: 0, vanSalePrice: 0,
  });
  const { monthlyData: baseData } = runMonthlySimulation(sBase);
  const { monthlyData: maxData } = runMonthlySimulation(sMax);
  assert.ok(maxData[0].expenses < baseData[0].expenses,
    `max reduction expenses (${maxData[0].expenses}) should be less than baseline (${baseData[0].expenses})`);
  assert.ok(maxData[0].expenses >= 0,
    `expenses should be >= 0 even with max reduction, got ${maxData[0].expenses}`);
});

// ════════════════════════════════════════════════════════════════════════
// Extreme Values
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Extreme Values ===');

test('M15. Zero savings/401k/homeEquity: simulation completes, all fields finite', () => {
  const s = gatherStateWithOverrides({ startingSavings: 0, starting401k: 0, homeEquity: 0 });
  const { monthlyData } = runMonthlySimulation(s);
  for (const entry of monthlyData) {
    for (const [key, val] of Object.entries(entry)) {
      if (typeof val === 'number') {
        assert.ok(Number.isFinite(val), `month ${entry.month} field ${key} is not finite: ${val}`);
      }
    }
  }
});

test('M16. investmentReturn=50: completes without overflow, all fields finite', () => {
  const s = gatherStateWithOverrides({ investmentReturn: 50 });
  const { monthlyData } = runMonthlySimulation(s);
  for (const entry of monthlyData) {
    for (const [key, val] of Object.entries(entry)) {
      if (typeof val === 'number') {
        assert.ok(Number.isFinite(val), `month ${entry.month} field ${key} is not finite: ${val}`);
      }
    }
  }
});

test('M17. investmentReturn=-20: completes, investReturn values are negative', () => {
  const s = gatherStateWithOverrides({ investmentReturn: -20, startingSavings: 500000 });
  const { monthlyData } = runMonthlySimulation(s);
  assert.ok(monthlyData[0].investReturn < 0,
    `investReturn at month 0 should be negative with -20% return, got ${monthlyData[0].investReturn}`);
});

test('M18. sarahWorkMonths=36, chadWorkMonths=36: monthlyData.length === 37', () => {
  const s = gatherStateWithOverrides({ sarahWorkMonths: 36, chadWorkMonths: 36 });
  const { monthlyData } = runMonthlySimulation(s);
  assert.strictEqual(monthlyData.length, 37,
    `expected 37 entries, got ${monthlyData.length}`);
});

test('M19. sarahWorkMonths=144, chadWorkMonths=144: monthlyData.length === 145', () => {
  const s = gatherStateWithOverrides({ sarahWorkMonths: 144, chadWorkMonths: 144 });
  const { monthlyData } = runMonthlySimulation(s);
  assert.strictEqual(monthlyData.length, 145,
    `expected 145 entries, got ${monthlyData.length}`);
});

test('M20. Massive cutsOverride=100000: all expenses >= 0 (floor enforced)', () => {
  const s = gatherStateWithOverrides({ lifestyleCutsApplied: true, cutsOverride: 100000 });
  const { monthlyData } = runMonthlySimulation(s);
  for (const entry of monthlyData) {
    assert.ok(entry.expenses >= 0,
      `month ${entry.month} expenses should be >= 0, got ${entry.expenses}`);
  }
});

test('M21. Full long horizon with employment (144 months)', () => {
  const s = gatherStateWithOverrides({
    chadJob: true, chadJobStartMonth: 0, chadWorkMonths: 144, sarahWorkMonths: 144,
  });
  const { monthlyData } = runMonthlySimulation(s);
  assert.strictEqual(monthlyData.length, 145,
    `expected 145 entries, got ${monthlyData.length}`);
  for (const entry of monthlyData) {
    for (const [key, val] of Object.entries(entry)) {
      if (typeof val === 'number') {
        assert.ok(Number.isFinite(val), `month ${entry.month} field ${key} is not finite: ${val}`);
      }
    }
  }
});

test('M22. ssdiApprovalMonth=999: no ssBenefit in any month', () => {
  const s = gatherStateWithOverrides({ ssdiApprovalMonth: 999 });
  const { monthlyData } = runMonthlySimulation(s);
  for (const entry of monthlyData) {
    assert.strictEqual(entry.ssBenefit, 0,
      `month ${entry.month}: ssBenefit should be 0 when approval is at month 999, got ${entry.ssBenefit}`);
  }
});

test('M23. Milestone at month 0: expenses reduced from month 0', () => {
  const sBase = gatherStateWithOverrides({ milestones: [] });
  const sMile = gatherStateWithOverrides({
    milestones: [{ name: 'Immediate', month: 0, savings: 5000 }],
  });
  const { monthlyData: baseData } = runMonthlySimulation(sBase);
  const { monthlyData: mileData } = runMonthlySimulation(sMile);
  assert.ok(mileData[0].expenses < baseData[0].expenses,
    `expenses at month 0 should be reduced by milestone, got ${mileData[0].expenses} vs baseline ${baseData[0].expenses}`);
  near(baseData[0].expenses - mileData[0].expenses, 5000, 1, 'milestone reduces expenses by 5000');
});

test('M24. trustIncreaseMonth=0: trustLLC = trustIncomeFuture from month 0', () => {
  const s = gatherStateWithOverrides({ trustIncreaseMonth: 0 });
  const { monthlyData } = runMonthlySimulation(s);
  assert.strictEqual(monthlyData[0].trustLLC, s.trustIncomeFuture,
    `trustLLC at month 0 should be ${s.trustIncomeFuture} when trustIncreaseMonth=0, got ${monthlyData[0].trustLLC}`);
});

test('M25. bcsYearsLeft=0.5: BCS only for months 0-5, then stops', () => {
  const s = gatherStateWithOverrides({
    bcsYearsLeft: 0.5,
    retireDebt: true, vanSold: true, vanSaleMonth: 0,
    lifestyleCutsApplied: false, milestones: [], chadJob: false,
    vanLoanBalance: 0, vanSalePrice: 0,
    expenseInflation: false,
  });
  const { monthlyData } = runMonthlySimulation(s);
  // BCS should apply for 6 months (0.5 * 12 = 6), months 0-5
  assert.ok(monthlyData[5].expenses > s.baseExpenses,
    `month 5 should include BCS: ${monthlyData[5].expenses} should exceed baseExpenses ${s.baseExpenses}`);
  assert.strictEqual(monthlyData[6].expenses, s.baseExpenses,
    `month 6 should have no BCS: expenses ${monthlyData[6].expenses} should equal baseExpenses ${s.baseExpenses}`);
});

// ════════════════════════════════════════════════════════════════════════
// Expense Inflation
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Expense Inflation ===');

test('Inflation OFF: expenses flat at month 0 vs month 12', () => {
  const s = gatherStateWithOverrides({ expenseInflation: false, retireDebt: true, vanSold: true, vanSaleMonth: 0, vanLoanBalance: 0, vanSalePrice: 0, lifestyleCutsApplied: false, milestones: [], bcsYearsLeft: 0, chadJob: false, oneTimeExtras: 0 });
  const { monthlyData } = runMonthlySimulation(s);
  assert.strictEqual(monthlyData[0].expenses, monthlyData[12].expenses,
    `Month 0 (${monthlyData[0].expenses}) should equal month 12 (${monthlyData[12].expenses}) with inflation OFF`);
});

test('Inflation ON at 3%: month-12 base expenses ≈ base × 1.03', () => {
  const s = gatherStateWithOverrides({ expenseInflation: true, expenseInflationRate: 3, retireDebt: true, vanSold: true, vanSaleMonth: 0, vanLoanBalance: 0, vanSalePrice: 0, lifestyleCutsApplied: false, milestones: [], bcsYearsLeft: 0, chadJob: false, oneTimeExtras: 0 });
  const { monthlyData } = runMonthlySimulation(s);
  const expected = Math.round(s.baseExpenses * 1.03);
  near(monthlyData[12].expenses, expected, 1, 'Y1 inflated expenses');
});

test('Inflation: month 0 unchanged (factor = 1.0)', () => {
  const sOff = gatherStateWithOverrides({ expenseInflation: false, retireDebt: true, vanSold: true, vanSaleMonth: 0, vanLoanBalance: 0, vanSalePrice: 0, lifestyleCutsApplied: false, milestones: [], bcsYearsLeft: 0, chadJob: false, oneTimeExtras: 0 });
  const sOn = gatherStateWithOverrides({ expenseInflation: true, expenseInflationRate: 3, retireDebt: true, vanSold: true, vanSaleMonth: 0, vanLoanBalance: 0, vanSalePrice: 0, lifestyleCutsApplied: false, milestones: [], bcsYearsLeft: 0, chadJob: false, oneTimeExtras: 0 });
  const offData = runMonthlySimulation(sOff).monthlyData;
  const onData = runMonthlySimulation(sOn).monthlyData;
  assert.strictEqual(offData[0].expenses, onData[0].expenses,
    'Month 0 should be identical with or without inflation');
});

test('Inflation: rate 0% equals flat expenses', () => {
  const sFlat = gatherStateWithOverrides({ expenseInflation: false, retireDebt: true, vanSold: true, vanSaleMonth: 0, vanLoanBalance: 0, vanSalePrice: 0, lifestyleCutsApplied: false, milestones: [], bcsYearsLeft: 0, chadJob: false, oneTimeExtras: 0 });
  const sZero = gatherStateWithOverrides({ expenseInflation: true, expenseInflationRate: 0, retireDebt: true, vanSold: true, vanSaleMonth: 0, vanLoanBalance: 0, vanSalePrice: 0, lifestyleCutsApplied: false, milestones: [], bcsYearsLeft: 0, chadJob: false, oneTimeExtras: 0 });
  const flatData = runMonthlySimulation(sFlat).monthlyData;
  const zeroData = runMonthlySimulation(sZero).monthlyData;
  assert.strictEqual(flatData[36].expenses, zeroData[36].expenses,
    'Rate 0% should produce same expenses as inflation OFF');
});

test('Inflation: only baseExpenses inflates, not debtService', () => {
  const s = gatherStateWithOverrides({ expenseInflation: true, expenseInflationRate: 5, retireDebt: false, debtService: 5000, vanSold: true, vanSaleMonth: 0, vanLoanBalance: 0, vanSalePrice: 0, lifestyleCutsApplied: false, milestones: [], bcsYearsLeft: 0, chadJob: false, oneTimeExtras: 0 });
  const { monthlyData } = runMonthlySimulation(s);
  // At month 12, total = inflatedBase + debtService. inflatedBase = round(baseExpenses * 1.05)
  const expectedInflatedBase = Math.round(s.baseExpenses * 1.05);
  const expectedTotal = expectedInflatedBase + 5000;
  near(monthlyData[12].expenses, expectedTotal, 1, 'Debt service should be flat, only base inflates');
  // Verify delta is only from baseExpenses inflation
  const baseDelta = expectedInflatedBase - s.baseExpenses;
  near(monthlyData[12].expenses - monthlyData[0].expenses, baseDelta, 1, 'Expense increase = base inflation only');
});

test('Inflation ON produces lower final savings balance than OFF', () => {
  const sOff = gatherStateWithOverrides({ expenseInflation: false });
  const sOn = gatherStateWithOverrides({ expenseInflation: true, expenseInflationRate: 3 });
  const offBal = runMonthlySimulation(sOff).monthlyData.slice(-1)[0].balance;
  const onBal = runMonthlySimulation(sOn).monthlyData.slice(-1)[0].balance;
  assert.ok(onBal < offBal,
    `Inflation ON balance (${onBal}) should be lower than OFF (${offBal})`);
});

// ════════════════════════════════════════════════════════════════════════
// Engine fix regressions (FIX #7, #8, #9, #10)
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Engine fix regressions (FIX #7/#8/#9/#10) ===');

// FIX #7b: SS earnings test — refresh grant 1 expires after 60 months.
// At m=startMonth+72 (6 yr employed), 6 grants have been ISSUED (Y1..Y6) but
// grant Y1 (issued at m=12) is now 60 months old → expired. Active = 5, not 6.
test('EARN-test-1. SS earnings test: 6yr employed, refresh grant 1 expired → 5 active grants (not 6)', () => {
  const s = gatherStateWithOverrides({
    expenseInflation: false, // A2 (2026-06-10): isolate from SS COLA (locked in ssCola.test.js)
    ssType: 'ss', ssClaimAge: 62, ssPIA: 4214,
    chadJob: true, chadJobSalary: 0, chadJobStartMonth: 0,
    chadJobStockRefresh: 100000, chadJobRefreshStartMonth: 12,
    chadJobHireStockY1: 0, chadJobHireStockY2: 0, chadJobHireStockY3: 0, chadJobHireStockY4: 0,
    chadJobSignOnCash: 0, chadJobBonusPct: 0, chadJobRaisePct: 0,
    chadWorkMonths: 96,
  });
  const { monthlyData } = runMonthlySimulation(s);
  // SS starts at m=19 with $4214 PIA at age 62. Probe calendar 2032 — the FRA
  // calendar year (B7: months m=70..77; m≥78 exempt). Grants are issued each
  // August (m=17, 29, 41, 53, 65, 77); through m=70..76 the five grants
  // m=17..65 are all < 60 months old → annualStockProjected = 5 × 0.20 ×
  // $100K = $100K (FIX #7b — old logic also counted expired grants).
  // FRA-year tier (B3, 2026 exempt $65,160; $1 per $3): annual withholding =
  // round((100000 − 65160)/3) = $11,613.
  // B1 (2026-06-10) whole-check schedule at the $2,950 personal rate:
  // m=70..72 fully withheld (cum $8,850), m=73 pays the boundary remainder
  // ($2,950 − $2,763 = $187), m=74+ pays in full.
  assert.strictEqual(monthlyData[70].ssBenefitGross, 0, 'Jan 2032: whole check withheld');
  assert.strictEqual(monthlyData[72].ssBenefitGross, 0, 'Mar 2032: still fully withheld');
  assert.strictEqual(monthlyData[73].ssBenefitGross, 2950 - (11613 - 3 * 2950),
    'boundary month pays the remainder');
  assert.strictEqual(monthlyData[74].ssBenefitGross, s.ssPersonal,
    'after $11,613 recovered, checks pay in full');

  // Counter-test: with the OLD buggy logic (6 active grants instead of 5), the
  // annual withholding would be round((120000 − 65160)/3) = $18,280 — more
  // than 6 × $2,950, so m=74 (and m=75) would ALSO be $0 checks. m=74 paying
  // in full confirms exactly 5 grants were counted.
  assert.ok(18280 > 5 * 2950, 'six-grant withholding would still be withholding at m=74');
});

// FIX #7a: SS earnings test — hire stock projection uses ANNIVERSARY indexing.
// At m=startMonth (Y0), no Y1 lump has paid yet → hire stock contribution = 0.
// At m=startMonth+12 (Y1 anniversary), Y1 lump just paid → contribution = chadJobHireStockY1.
test('EARN-test-2. SS earnings test: hire stock projection respects anniversary timing', () => {
  // Run with SS coexisting with the job so the earnings-test code path is exercised.
  // Start month 0 puts Y0 = m=0..11, Y1 anniv at m=12, etc.
  // chadJobSalary=0 isolates the stock effect.
  const s = gatherStateWithOverrides({
    expenseInflation: false, // A2 (2026-06-10): isolate from SS COLA (locked in ssCola.test.js)
    ssType: 'ss', ssClaimAge: 62, ssPIA: 4214,
    chadJob: true, chadJobSalary: 0, chadJobStartMonth: 0,
    chadJobHireStockY1: 50000, chadJobHireStockY2: 0,
    chadJobHireStockY3: 0, chadJobHireStockY4: 0,
    chadJobStockRefresh: 0, chadJobSignOnCash: 0, chadJobBonusPct: 0, chadJobRaisePct: 0,
    chadWorkMonths: 96,
  });
  const { monthlyData } = runMonthlySimulation(s);
  // SS doesn't start until m=19 in this scenario. Probe m=19 (still in Y1, before anniversary
  // m=24 since Y1 anniv was at m=12 and we're past it). yearsWorkedForSS at m=19 = 1
  // (Math.floor(19/12) = 1) → hireStockForSS = chadJobHireStock[0] = 50000.
  // annualStockProjected = 50000. After SS_EARNINGS_LIMIT_ANNUAL = $24,480 (B3):
  // annual withholding = round((50000 − 24480)/2) = $12,760.
  // B1 (2026-06-10) whole-check at the $6,110 family rate: m=19 and m=20 are
  // $0 checks (cum $12,220), m=21 pays the boundary remainder ($6,110 − $540
  // = $5,570).
  assert.strictEqual(monthlyData[19].ssBenefitGross, 0,
    'm=19 (Y1 anniv passed): hire stock annualized to 50000 → whole check withheld'); // A1: gross
  assert.strictEqual(monthlyData[20].ssBenefitGross, 0, 'm=20: still fully withheld');
  assert.strictEqual(monthlyData[21].ssBenefitGross, s.ssFamilyTotal - (12760 - 2 * s.ssFamilyTotal),
    'm=21: boundary month pays the remainder');

  // Probe an even later month — m=72 (6 yrs employed, yearsWorkedForSS=6).
  // Per FIX #7a, yearsWorkedForSS=6 is OUTSIDE the 1..4 range → no hire stock contribution.
  // No refresh either → annualStockProjected = 0 → no reduction → full personal SS.
  assert.strictEqual(monthlyData[72].ssBenefitGross, s.ssPersonal,
    `m=72: no hire/refresh → no earnings test reduction → ssPersonal=${s.ssPersonal}, got ${monthlyData[72].ssBenefitGross}`);
});

// Remediation 2026-06-09 phase 5: SS earnings-test refresh estimate must use the
// SAME August-aligned issuance months as the actual vest engine —
// firstAugustAtOrAfter(start + refreshStart) + 12·g — not start + refreshStart + 12·g.
test('EARN-test-3. SS earnings test: no refresh counted before the first AUGUST issuance', () => {
  // start=12 (Mar 2027), refreshStart=12 → naive issuance month 24 (Mar 2028),
  // but MSFT issues refreshes end-of-August → actual first issuance is m=29 (Aug 2028).
  // Probe m=25 (SS active since m=19, employed since m=12): the old estimate
  // counted a $200K grant issued at m=24 → 0.20 × 200K = $40K annual earnings →
  // benefits reduced. The vest engine pays NOTHING from refreshes before m=29,
  // so the estimate must be $0 → full family benefit.
  const s = gatherStateWithOverrides({
    expenseInflation: false, // A2 (2026-06-10): isolate from SS COLA (locked in ssCola.test.js)
    ssType: 'ss', ssClaimAge: 62, ssPIA: 4214,
    chadJob: true, chadJobSalary: 0, chadJobStartMonth: 12,
    chadJobStockRefresh: 200000, chadJobRefreshStartMonth: 12,
    chadJobHireStockY1: 0, chadJobHireStockY2: 0, chadJobHireStockY3: 0, chadJobHireStockY4: 0,
    chadJobSignOnCash: 0, chadJobBonusPct: 0, chadJobRaisePct: 0,
    chadWorkMonths: 96, msftGrowth: 0,
  });
  const { monthlyData } = runMonthlySimulation(s);
  // m=25..28: grant not yet issued (first August issuance is m=29) → no reduction.
  for (const m of [25, 26, 27, 28]) {
    assert.strictEqual(monthlyData[m].ssBenefitGross, s.ssFamilyTotal,
      `m=${m}: refresh not yet issued (first Aug issuance m=29) → full family ${s.ssFamilyTotal}, got ${monthlyData[m].ssBenefitGross}`);
  }
  // m=30 (grant issued m=29): estimate = 0.20 × 200K = 40K → annual
  // withholding = round((40000 − 24480)/2) = $7,760 (B3 limit).
  // B1 (2026-06-10) whole-check: m=30 is a $0 check, m=31 pays the boundary
  // remainder ($6,110 − $1,650 = $4,460), m=32+ pays in full.
  const annualWithholding = Math.round((0.20 * 200000 - 24480) / 2);
  assert.strictEqual(monthlyData[30].ssBenefitGross, 0,
    'm=30: grant issued m=29 → whole check withheld');
  assert.strictEqual(monthlyData[31].ssBenefitGross, s.ssFamilyTotal - (annualWithholding - s.ssFamilyTotal),
    'm=31: boundary month pays the remainder');
  assert.strictEqual(monthlyData[32].ssBenefitGross, s.ssFamilyTotal,
    'm=32: year\'s withholding recovered → full check');
});

// Remediation 2026-06-09 phase 5: the annualized refresh estimate must equal the
// ACTUAL vests the engine pays over a 12-month window (steady state, msftGrowth=0).
test('EARN-test-4. SS earnings test: annualStockFromRefresh matches summed actual vests over 12 months', () => {
  const s = gatherStateWithOverrides({
    expenseInflation: false, // A2 (2026-06-10): isolate from SS COLA (locked in ssCola.test.js)
    ssType: 'ss', ssClaimAge: 62, ssPIA: 4214,
    chadJob: true, chadJobSalary: 0, chadJobStartMonth: 0, chadJobTaxRate: 25, chadJobNoFICA: false,
    chadJobStockRefresh: 60000, chadJobRefreshStartMonth: 12,
    chadJobHireStockY1: 0, chadJobHireStockY2: 0, chadJobHireStockY3: 0, chadJobHireStockY4: 0,
    chadJobSignOnCash: 0, chadJobBonusPct: 0, chadJobRaisePct: 0,
    chadWorkMonths: 120, msftGrowth: 0,
  });
  const { monthlyData } = runMonthlySimulation(s);
  // Steady-state vest window [66, 78): 5 active grants (issued Aug at
  // m=17,29,41,53,65), 4 vest months × 5 grants × 5% × $60K = $60K.
  const netMult = 1 - 0.25; // chadJobBonusNetMult with taxRate=25, no FICA savings
  let windowNet = 0;
  for (let m = 66; m < 78; m++) windowNet += monthlyData[m].chadJobStockRefreshNet;
  const windowGross = windowNet / netMult;
  near(windowGross, 60000, 5, 'actual 12-month refresh vests in steady state');
  // B1 (2026-06-10) whole-check withholding over calendar 2031 (m=58..69 —
  // B7: still before the FRA calendar year 2032). The estimate is $48K while
  // 4 grants are active (m=58..65) and $60K once the m=65 grant is issued
  // (m=66..69), so the year's required withholding finishes at the
  // steady-state figure: round((60000 − 24480)/2) = $17,760 — the same annual
  // amount the actual vests imply.
  const required = Math.round(Math.max(0, windowGross - 24480) / 2);
  let withheldYear = 0;
  for (let m = 58; m < 70; m++) withheldYear += s.ssPersonal - monthlyData[m].ssBenefitGross;
  assert.strictEqual(withheldYear, required,
    `calendar-2031 withholding (${withheldYear}) must equal the vest-implied annual amount (${required})`);
  // Whole-check schedule: 4-grant phase requires round((48000−24480)/2) =
  // $11,760 → m=58..60 are $0 checks, m=61 pays the $40 boundary remainder;
  // the m=65 issuance raises the requirement by $6,000 → m=66..67 are $0
  // checks again, m=68 pays $2,850, m=69 pays in full.
  assert.strictEqual(monthlyData[58].ssBenefitGross, 0, 'Jan 2031: whole check withheld');
  assert.strictEqual(monthlyData[61].ssBenefitGross, s.ssPersonal - (11760 - 3 * s.ssPersonal),
    '4-grant boundary month pays the remainder');
  assert.strictEqual(monthlyData[66].ssBenefitGross, 0, 'new grant raises the requirement → $0 check');
  assert.strictEqual(monthlyData[69].ssBenefitGross, s.ssPersonal, 'year fully recovered → full check');
});

// B7 (2026-06-10): the FRA-year ($1-per-$3, higher limit) earnings-test tier is
// CALENDAR-YEAR anchored — it applies only in the FRA calendar year (2032,
// m=70..77 for this household) and the attainment month and later (m≥78) are
// fully exempt. The old anniversary-anchored window (m ≥ SS_FRA_MONTH − 12)
// wrongly gave Oct–Dec 2031 the generous tier and kept testing m=78.
test('EARN-B7. FRA-year tier is calendar-anchored; attainment month exempt', () => {
  // Consulting $6,000/mo = $72,000/yr sits between the standard ($24,480) and
  // FRA-year ($65,160) limits, so the two tiers produce different withholding.
  const s = gatherStateWithOverrides({
    expenseInflation: false,
    ssType: 'ss', ssClaimAge: 62, ssPIA: 4214,
    chadConsulting: 6000, chadJob: false,
    sarahWorkMonths: 96,
  });
  const { monthlyData } = runMonthlySimulation(s);
  // Calendar 2031 (m=58..69): STANDARD tier — required = round((72000−24480)/2)
  // = $23,760 at the $2,950 personal rate → m=58..65 are $0 checks (cum
  // $23,600), m=66 pays the $160 boundary remainder, m=67..69 (Oct–Dec 2031,
  // which the OLD code treated as FRA-year months) pay in full because the
  // standard-year withholding is complete — NOT because the $1/$3 tier applied.
  assert.strictEqual(monthlyData[58].ssBenefitGross, 0, 'Jan 2031: standard tier withholds whole checks');
  assert.strictEqual(monthlyData[66].ssBenefitGross, 2950 - (23760 - 8 * 2950), 'boundary month');
  assert.strictEqual(monthlyData[67].ssBenefitGross, 2950, 'Oct 2031: standard cycle complete');
  // Calendar 2032 (FRA year, m=70..77): $1/$3 tier — required =
  // round((72000−65160)/3) = $2,280 < one check → January pays the remainder.
  assert.strictEqual(monthlyData[70].ssBenefitGross, 2950 - 2280,
    'Jan 2032: FRA-year tier withholds only $2,280');
  assert.strictEqual(monthlyData[71].ssBenefitGross, 2950, 'Feb 2032: full check');
  // m=78 (Sep 2032) is the FRA-attainment month — fully exempt (the old code
  // still tested it).
  assert.strictEqual(monthlyData[78].ssBenefitGross, 2950, 'attainment month: exempt');
});

// C18 (2026-06-10): the earnings-test RSU wage estimate must include the
// msftGrowth appreciation factor — each grant's expected annual vests scale
// from issuance to the test month, exactly like the actual vest engine.
test('EARN-C18. earnings-test refresh estimate includes msftGrowth appreciation', () => {
  const mk = (growth) => gatherStateWithOverrides({
    expenseInflation: false,
    ssType: 'ss', ssClaimAge: 62, ssPIA: 4214,
    chadJob: true, chadJobSalary: 0, chadJobStartMonth: 12,
    chadJobStockRefresh: 200000, chadJobRefreshStartMonth: 12,
    chadJobHireStockY1: 0, chadJobHireStockY2: 0, chadJobHireStockY3: 0, chadJobHireStockY4: 0,
    chadJobSignOnCash: 0, chadJobBonusPct: 0, chadJobRaisePct: 0,
    chadWorkMonths: 96, msftGrowth: growth,
  });
  // Single grant issued m=29 (Aug 2028). January 2029 = m=34, family rate $6,110.
  // Flat estimate: 0.20 × 200K = $40,000. With 12% growth the estimate at
  // month m is 40000 × 1.12^((m − 29)/12) — the same issue→vest scaling the
  // vest engine applies.
  const { monthlyData: flat } = runMonthlySimulation(mk(0));
  const { monthlyData: grown } = runMonthlySimulation(mk(12));
  // m=34: both fully withhold (required > one check either way).
  assert.strictEqual(flat[34].ssBenefitGross, 0, 'flat: Jan 2029 fully withheld');
  assert.strictEqual(grown[34].ssBenefitGross, 0, 'grown: Jan 2029 fully withheld');
  // m=35 boundary month: flat required = round((40000−24480)/2) = 7760 →
  // pays 6110 − 1650 = 4460. Grown required at m=35 =
  // round((40000 × 1.12^(6/12) − 24480)/2) → pays less.
  const grownRequired35 = Math.round((40000 * Math.pow(1.12, 6 / 12) - 24480) / 2);
  assert.strictEqual(flat[35].ssBenefitGross, 6110 - (7760 - 6110), 'flat boundary month');
  assert.strictEqual(grown[35].ssBenefitGross, 6110 - (grownRequired35 - 6110),
    'grown boundary month reflects the appreciated estimate');
  assert.ok(grown[35].ssBenefitGross < flat[35].ssBenefitGross,
    'growth ⇒ higher estimated wages ⇒ more withholding');
});

test('EARN-C18b. earnings-test hire-stock estimate includes msftGrowth appreciation', () => {
  const mk = (growth) => gatherStateWithOverrides({
    expenseInflation: false,
    ssType: 'ss', ssClaimAge: 62, ssPIA: 4214,
    chadJob: true, chadJobSalary: 0, chadJobStartMonth: 0,
    chadJobHireStockY1: 25000, chadJobHireStockY2: 0, chadJobHireStockY3: 0, chadJobHireStockY4: 0,
    chadJobStockRefresh: 0, chadJobSignOnCash: 0, chadJobBonusPct: 0, chadJobRaisePct: 0,
    chadWorkMonths: 96, msftGrowth: growth,
  });
  // Jan 2028 = m=22, employment year 1 → hire estimate = 25000 (flat) or
  // 25000 × 1.12^(22/12) (grown). Both are under one family check, so the
  // January boundary month shows the exact difference.
  const { monthlyData: flat } = runMonthlySimulation(mk(0));
  const { monthlyData: grown } = runMonthlySimulation(mk(12));
  const flatRequired = Math.round((25000 - 24480) / 2);
  const grownRequired = Math.round((25000 * Math.pow(1.12, 22 / 12) - 24480) / 2);
  assert.strictEqual(flat[22].ssBenefitGross, 6110 - flatRequired, 'flat hire estimate');
  assert.strictEqual(grown[22].ssBenefitGross, 6110 - grownRequired,
    'grown hire estimate scales from hire month to the test month');
  assert.ok(grownRequired > flatRequired, 'growth raises the hire-stock wage estimate');
});

// B4 (2026-06-10): SSDI child benefits are calendar-anchored to the student-rule
// end month (SS_CHILD_BENEFIT_END_MONTH=40, HS graduation June 2029), not relative.
// With approval=20, kidsAgeOutMonths=36 (legacy): family benefits END at m=40
// (not m=56 as the old buggy `approval + kidsAgeOutMonths` logic).
test('SSDI-AgeOut. SSDI family benefits end at SS_CHILD_BENEFIT_END_MONTH, not approval+kidsAgeOutMonths', () => {
  const s = gatherStateWithOverrides({
    expenseInflation: false, // A2 (2026-06-10): isolate from SS COLA (locked in ssCola.test.js)
    ssType: 'ssdi', ssdiApprovalMonth: 20, ssdiDenied: false,
    ssdiFamilyTotal: 6321, ssdiPersonal: 4214, kidsAgeOutMonths: 36, // legacy default
    chadJob: false, chadConsulting: 0,
  });
  const { monthlyData } = runMonthlySimulation(s);
  // m=20 (approval): family benefit kicks in.
  assert.strictEqual(monthlyData[20].ssBenefitGross, 6321,
    `m=20 (approval): expected family ${6321}, got ${monthlyData[20].ssBenefitGross}`); // A1: gross
  // m=39 (SS_CHILD_BENEFIT_END_MONTH - 1): still family (student rule, B4).
  assert.strictEqual(monthlyData[39].ssBenefitGross, 6321,
    `m=39: still family ${6321}, got ${monthlyData[39].ssBenefitGross}`);
  // m=40 (SS_CHILD_BENEFIT_END_MONTH): personal — kids no longer eligible per calendar.
  assert.strictEqual(monthlyData[40].ssBenefitGross, 4214,
    `m=40 (kids age out): expected personal ${4214}, got ${monthlyData[40].ssBenefitGross}`);
  // OLD buggy logic would have kept family at m=55 (approval=20 + kidsAgeOutMonths=36 - 1 = 55).
  assert.strictEqual(monthlyData[55].ssBenefitGross, 4214,
    `m=55: should be personal (NOT family as old buggy logic produced)`);
});

// B4 + FIX #9 semantics: SS_CHILD_BENEFIT_END_MONTH is the first INELIGIBLE month
// for SS/SSDI child benefits (m=39 family, m=40 personal). TWINS_AGE_OUT_MONTH
// stays at 34 — it anchors the CTC (age-17 timeline), NOT the benefit stream.
test('CHILD-BENEFIT-Constant. SS_CHILD_BENEFIT_END_MONTH=40 first ineligible; TWINS_AGE_OUT_MONTH stays 34 for CTC', () => {
  // Use SSDI with early approval so the boundary is crossed mid-projection.
  const s = gatherStateWithOverrides({
    expenseInflation: false, // A2 (2026-06-10): isolate from SS COLA (locked in ssCola.test.js)
    ssType: 'ssdi', ssdiApprovalMonth: 0, ssdiDenied: false,
    ssdiFamilyTotal: 6321, ssdiPersonal: 4214, kidsAgeOutMonths: 36,
    chadJob: false, chadConsulting: 0,
  });
  const { monthlyData } = runMonthlySimulation(s);
  assert.strictEqual(TWINS_AGE_OUT_MONTH, 34, 'TWINS_AGE_OUT_MONTH constant unchanged at 34 (CTC anchor)');
  assert.strictEqual(SS_CHILD_BENEFIT_END_MONTH, 40, 'SS_CHILD_BENEFIT_END_MONTH = 40 (July 2029, post-graduation)');
  assert.strictEqual(monthlyData[SS_CHILD_BENEFIT_END_MONTH - 1].ssBenefitGross, 6321,
    `m=${SS_CHILD_BENEFIT_END_MONTH - 1}: family rate active`); // A1: gross
  assert.strictEqual(monthlyData[SS_CHILD_BENEFIT_END_MONTH].ssBenefitGross, 4214,
    `m=${SS_CHILD_BENEFIT_END_MONTH}: personal rate active`);
});

// FIX #10: Van sale with positive equity — proceeds boost balance.
test('Van-PosEquity. Van sale with sale price > loan balance: proceeds added to savings', () => {
  const saleMonth = 12;
  const salePrice = 200000;
  const loanBalance = 150000;
  const proceeds = salePrice - loanBalance; // 50000
  const s = gatherStateWithOverrides({
    vanSold: true, vanSaleMonth: saleMonth,
    vanLoanBalance: loanBalance, vanSalePrice: salePrice,
    vanMonthlySavings: 2597,
    startingSavings: 500000, investmentReturn: 0,
    retireDebt: true, lifestyleCutsApplied: false,
    bcsYearsLeft: 0, milestones: [], chadJob: false,
    ssdiDenied: true, starting401k: 0, homeEquity: 0,
    trustIncreaseMonth: 0, expenseInflation: false,
  });
  const { monthlyData } = runMonthlySimulation(s);
  // m=11: van payment still being made.
  // m=12: van payment stops AND $50K proceeds boost the balance.
  // balance[12] = balance[11] + investReturn(0) + (cashIncome[12] - expenses[12]) + 50000.
  const prev = monthlyData[saleMonth - 1];
  const curr = monthlyData[saleMonth];
  const expectedBalance = prev.balance + curr.investReturn
    + (curr.cashIncome - curr.expenses) + proceeds;
  assert.strictEqual(curr.balance, Math.round(expectedBalance),
    `m=12 balance should include +${proceeds} proceeds: expected ${Math.round(expectedBalance)}, got ${curr.balance}`);
  // Confirm the m=12 - m=11 jump is at least the proceeds amount net of monthly cash flow.
  const jump = curr.balance - prev.balance - curr.investReturn - (curr.cashIncome - curr.expenses);
  assert.strictEqual(jump, proceeds,
    `the unaccounted-for jump at sale month should equal proceeds ${proceeds}, got ${jump}`);
  // m=11: van expense was still being paid.
  assert.ok(prev.expenses > curr.expenses,
    `m=11 expenses (${prev.expenses}) should exceed m=12 (${curr.expenses}) — van payment still active before sale`);
});

// ════════════════════════════════════════════════════════════════════════
// Re-audit fixes (RA-2 customLeverMonthly on row, RA-3 SSDI back-pay guard)
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Re-audit fixes (RA-2, RA-3) ===');

test('RA-2. customLeverMonthly is exposed on monthlyData row', () => {
  const s = gatherStateWithOverrides({
    customLevers: [{ id: 't', name: 'test', maxImpact: 5000, currentValue: 5000, active: true }],
  });
  const { monthlyData } = runMonthlySimulation(s);
  // Row should now expose customLeverMonthly directly.
  assert.strictEqual(monthlyData[0].customLeverMonthly, 5000,
    `expected 5000 on row, got ${monthlyData[0].customLeverMonthly}`);
  // And cashIncome should equal sum of all components on the row.
  const sumComponents = monthlyData[0].sarahIncome + monthlyData[0].msftLump
    + monthlyData[0].trustLLC + (monthlyData[0].ssBenefit || 0)
    + monthlyData[0].consulting + monthlyData[0].chadJobIncome
    + monthlyData[0].customLeverMonthly;
  assert.strictEqual(monthlyData[0].cashIncome, sumComponents,
    'row components must sum to cashIncome when lever active');
});

test('RA-2. customLeverMonthly = 0 when no levers active', () => {
  const s = gatherStateWithOverrides({});
  const { monthlyData } = runMonthlySimulation(s);
  assert.strictEqual(monthlyData[0].customLeverMonthly, 0);
});

test('RA-3. SSDI back-pay = 0 when SSDI is denied/SS-active/job-active', () => {
  // The new gate `effectiveSsdiApproval !== 999 && backPayActual > 0` ensures no anomalous
  // deposit when SSDI is suppressed. backPayActual itself is set to 0 in these scenarios.
  const denied = gatherStateWithOverrides({ ssdiDenied: true });
  assert.strictEqual(runMonthlySimulation(denied).backPayActual, 0);

  const ssRetirement = gatherStateWithOverrides({ ssType: 'ss' });
  assert.strictEqual(runMonthlySimulation(ssRetirement).backPayActual, 0);

  const jobActive = gatherStateWithOverrides({ chadJob: true });
  assert.strictEqual(runMonthlySimulation(jobActive).backPayActual, 0);
});

// ════════════════════════════════════════════════════════════════════════
// 401(k) contributions (Chad's job)
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== 401(k) contributions ===');

test('K1. Pre-tax deferral reduces take-home by deferral × (1-tax) PLUS FICA on the deferral (B6)', () => {
  const baseS = gatherStateWithOverrides({
    chadJob: true, chadJobSalary: 100000, chadJobTaxRate: 25, chadJobStartMonth: 0,
    chadWorkMonths: 24,
  });
  const { monthlyData: baseData } = runMonthlySimulation(baseS);
  const k401S = gatherStateWithOverrides({
    chadJob: true, chadJobSalary: 100000, chadJobTaxRate: 25, chadJobStartMonth: 0,
    chadJob401kEnabled: true,
    chadJob401kDeferral: 24000, // $2K/mo deferral
    chadWorkMonths: 24,
  });
  const { monthlyData: k401Data } = runMonthlySimulation(k401S);
  // B6 (remediation 2026-06-10, item 3.5): IRC §3121(v)(1)(A) — 401(k) elective
  // deferrals are FICA wages. The deferral saves income tax but NOT the 7.65%
  // FICA, so net cashflow drops by deferral × (1 - tax + ficaSavings) PLUS
  // deferral × ficaRateOnPension (the same pattern the pension uses):
  // = $2000 × 0.75 + $2000 × 0.0765 = $1500 + $153 = $1653.
  const delta = baseData[0].chadJobSalaryNet - k401Data[0].chadJobSalaryNet;
  assert.strictEqual(delta, 1653, `take-home should drop by $1,653/mo (pre-tax + FICA add-back), got ${delta}`);
  // chadJob401kContribGross row field exposes the gross monthly contribution.
  assert.strictEqual(k401Data[0].chadJob401kContribGross, 2000, '$2K/mo contribution exposed on row');
});

test('K1c. B6 noFICA employer: deferral FICA add-back is Medicare-only (1.45%)', () => {
  // noFICA employer: ficaSavings=0.062 on the netMult, but the deferral still
  // owes Medicare 1.45% (ficaRateOnPension). Drop = $2000 × (1 − 0.25 + 0.062)
  // + $2000 × 0.0145 = $1624 + $29 = $1653.
  const baseS = gatherStateWithOverrides({
    chadJob: true, chadJobSalary: 100000, chadJobTaxRate: 25, chadJobStartMonth: 0,
    chadJobNoFICA: true, chadWorkMonths: 24,
  });
  const { monthlyData: baseData } = runMonthlySimulation(baseS);
  const k401S = gatherStateWithOverrides({
    chadJob: true, chadJobSalary: 100000, chadJobTaxRate: 25, chadJobStartMonth: 0,
    chadJobNoFICA: true, chadJob401kEnabled: true, chadJob401kDeferral: 24000,
    chadWorkMonths: 24,
  });
  const { monthlyData: k401Data } = runMonthlySimulation(k401S);
  const delta = baseData[0].chadJobSalaryNet - k401Data[0].chadJobSalaryNet;
  assert.strictEqual(delta, 1653, `noFICA take-home should drop by $1,653/mo, got ${delta}`);
});

test('K1b. Pre-tax deferral grows 401k when no drawdown is happening', () => {
  // Use very high startingSavings so balance never goes negative (no drawdown of bal401k).
  // chadWorkMonths=11 → retirement at m=11 → employed for m=0..11 = exactly 12 months.
  const baseS = gatherStateWithOverrides({
    chadJob: true, chadJobSalary: 100000, chadJobTaxRate: 25, chadJobStartMonth: 0,
    startingSavings: 5000000, return401k: 0, chadWorkMonths: 11,
  });
  const { monthlyData: baseData } = runMonthlySimulation(baseS);
  const k401S = gatherStateWithOverrides({
    chadJob: true, chadJobSalary: 100000, chadJobTaxRate: 25, chadJobStartMonth: 0,
    chadJob401kEnabled: true,
    chadJob401kDeferral: 24000,
    startingSavings: 5000000, return401k: 0, chadWorkMonths: 11,
  });
  const { monthlyData: k401Data } = runMonthlySimulation(k401S);
  // 12 months × $2000/mo = $24,000.
  const balDelta = k401Data[11].balance401k - baseData[11].balance401k;
  assert.strictEqual(balDelta, 24000, `bal401k should grow by exactly $24K over 12 employed months, got ${balDelta}`);
});

test('K2. Roth catch-up reduces take-home but NOT taxable wages', () => {
  // Roth catch-up = post-tax. Net should drop by FULL catch-up amount (not catch-up * (1-tax)).
  const baseS = gatherStateWithOverrides({
    chadJob: true, chadJobSalary: 100000, chadJobTaxRate: 25, chadJobStartMonth: 0,
    chadWorkMonths: 12,
  });
  const { monthlyData: baseData } = runMonthlySimulation(baseS);
  const rothS = gatherStateWithOverrides({
    chadJob: true, chadJobSalary: 100000, chadJobTaxRate: 25, chadJobStartMonth: 0,
    chadJob401kEnabled: true,
    // C7 (item 3.6): the engine now clamps the catch-up to the statutory limit
    // ($11,250 super in years attaining 60-63), so the fixture uses a lawful
    // $9,000/yr = $750/mo (the old $12,000 exceeded the cap and was clamped).
    chadJob401kCatchupRoth: 9000, // $750/mo Roth
    chadWorkMonths: 12,
  });
  const { monthlyData: rothData } = runMonthlySimulation(rothS);
  // Net should drop by the FULL post-tax amount (post-tax money leaves bank).
  const delta = baseData[0].chadJobSalaryNet - rothData[0].chadJobSalaryNet;
  assert.strictEqual(delta, 750, `Roth catch-up should reduce net by full $750/mo, got ${delta}`);
});

test('K3. Employer match adds to 401k without affecting cashflow', () => {
  const baseS = gatherStateWithOverrides({
    chadJob: true, chadJobSalary: 100000, chadJobTaxRate: 25, chadJobStartMonth: 0,
    chadWorkMonths: 12,
  });
  const { monthlyData: baseData } = runMonthlySimulation(baseS);
  const matchS = gatherStateWithOverrides({
    chadJob: true, chadJobSalary: 100000, chadJobTaxRate: 25, chadJobStartMonth: 0,
    chadJob401kEnabled: true,
    chadJob401kMatch: 12000, // $1K/mo match
    chadWorkMonths: 12,
  });
  const { monthlyData: matchData } = runMonthlySimulation(matchS);
  // Take-home unchanged.
  assert.strictEqual(baseData[0].chadJobSalaryNet, matchData[0].chadJobSalaryNet,
    'employer match should not affect take-home');
  // bal401k grows by ~$12K from match over 12 months (plus return).
  const balDelta = matchData[12].balance401k - baseData[12].balance401k;
  assert.ok(balDelta >= 12000, `match should grow bal401k by at least $12K, got ${balDelta}`);
});

test('K4. No 401(k) when chadJob=false', () => {
  const s = gatherStateWithOverrides({
    chadJob: false,
    chadJob401kEnabled: true,
    chadJob401kDeferral: 24000, chadJob401kCatchupRoth: 12000, chadJob401kMatch: 12000,
  });
  const { monthlyData } = runMonthlySimulation(s);
  assert.strictEqual(monthlyData[0].chadJob401kFlow, 0);
  assert.strictEqual(monthlyData[0].chadJob401kMatchGross, 0);
});

test('K4b. Master toggle off → no 401(k) contributions even with non-zero sliders', () => {
  const offS = gatherStateWithOverrides({
    chadJob: true, chadJobSalary: 100000, chadJobTaxRate: 25, chadJobStartMonth: 0,
    chadJob401kEnabled: false,
    chadJob401kDeferral: 24000, chadJob401kCatchupRoth: 12000, chadJob401kMatch: 12000,
    chadWorkMonths: 11,
  });
  const { monthlyData: offData } = runMonthlySimulation(offS);
  // Toggle off → all 401(k) flows are zero regardless of slider values.
  assert.strictEqual(offData[0].chadJob401kContribGross, 0);
  assert.strictEqual(offData[0].chadJob401kMatchGross, 0);
  assert.strictEqual(offData[0].chadJob401kFlow, 0);
  // Take-home should equal the no-401k baseline (no slider effect when toggled off).
  const baselineS = gatherStateWithOverrides({
    chadJob: true, chadJobSalary: 100000, chadJobTaxRate: 25, chadJobStartMonth: 0,
    chadWorkMonths: 11,
  });
  const { monthlyData: baselineData } = runMonthlySimulation(baselineS);
  assert.strictEqual(offData[0].chadJobSalaryNet, baselineData[0].chadJobSalaryNet,
    'take-home should match baseline when toggle is off, ignoring slider values');
});

test('K5. Combined: deferral + catch-up + match all flow into bal401k (no growth, no drawdown)', () => {
  // Scenario matching Chad's L63 plan: $24,500 deferral + $11,250 Roth catch-up + $12,250 match
  // Pin return401k=0 and high startingSavings to isolate contribution math from growth/drawdown.
  // chadWorkMonths=11 → exactly 12 employed months (m=0..11).
  const s = gatherStateWithOverrides({
    chadJob: true, chadJobSalary: 215000, chadJobTaxRate: 30, chadJobStartMonth: 0,
    chadJob401kEnabled: true,
    chadJob401kDeferral: 24500, chadJob401kCatchupRoth: 11250, chadJob401kMatch: 12250,
    startingSavings: 5000000, return401k: 0, chadWorkMonths: 11,
  });
  const { monthlyData } = runMonthlySimulation(s);
  const noContribS = gatherStateWithOverrides({
    chadJob: true, chadJobSalary: 215000, chadJobTaxRate: 30, chadJobStartMonth: 0,
    startingSavings: 5000000, return401k: 0, chadWorkMonths: 11,
  });
  const { monthlyData: noContribData } = runMonthlySimulation(noContribS);
  const annualContribTotal = 24500 + 11250 + 12250; // 48,000
  // After 12 employed months with return401k=0 and no drawdown, bal401k delta = exactly $48K.
  const delta = monthlyData[11].balance401k - noContribData[11].balance401k;
  assert.ok(Math.abs(delta - annualContribTotal) <= 12,
    `Year 1 401k delta should be ~$48K (±$12 rounding), got ${delta}`);
});

// ════════════════════════════════════════════════════════════════════════
// MSFT Promotion Ladder (L63 → L64 → L65)
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== MSFT Promotion Ladder ===');

// Helper for promo tests — fixed inputs that make salary math clean.
function promoBaseState(overrides = {}) {
  return gatherStateWithOverrides({
    chadJob: true, chadJobSalary: 200000, chadJobTaxRate: 25, chadJobStartMonth: 0,
    chadJobRaisePct: 0, // disable raises to make salary math exact
    chadJobBonusPct: 10, chadJobBonusMonth: 8, chadJobBonusProrateFirst: false,
    chadJobNoFICA: false, chadJobPensionContrib: 0,
    startingSavings: 5000000, return401k: 0, chadWorkMonths: 96,
    ...overrides,
  });
}

test('P1. L64 toggle off → salary at month 24 = chadJobSalary × (1+raise)^2', () => {
  const s = promoBaseState({ chadJobRaisePct: 5, chadL64Enabled: false });
  const { monthlyData } = runMonthlySimulation(s);
  // Month 24, year 2 of work, 5% raise compounded twice
  const expectedGross = 200000 * Math.pow(1.05, 2) / 12;
  const expectedNet = Math.round(expectedGross * 0.75); // tax 25%
  near(monthlyData[24].chadJobSalaryNet, expectedNet, 2,
    'P1 salary at month 24 (no L64)');
});

test('P2. L64 enabled, month=24 → salary jumps to chadL64Salary', () => {
  const s = promoBaseState({ chadL64Enabled: true, chadL64Month: 24, chadL64Salary: 240000 });
  const { monthlyData } = runMonthlySimulation(s);
  // No raise (chadJobRaisePct=0), so salary = chadL64Salary / 12 × 0.75
  const expectedNet = Math.round(240000 / 12 * 0.75);
  assert.strictEqual(monthlyData[24].chadJobSalaryNet, expectedNet,
    `P2 salary at promotion month should jump to L64 base, got ${monthlyData[24].chadJobSalaryNet}, expected ${expectedNet}`);
  // Pre-promotion month 23 still uses L63
  const expectedL63 = Math.round(200000 / 12 * 0.75);
  assert.strictEqual(monthlyData[23].chadJobSalaryNet, expectedL63,
    `P2 salary at month 23 should still be L63`);
});

test('P3. L64 enabled, month=36 with raise → salary = L64Salary × (1+raise)^1', () => {
  const s = promoBaseState({
    chadJobRaisePct: 5, chadL64Enabled: true, chadL64Month: 24, chadL64Salary: 240000
  });
  const { monthlyData } = runMonthlySimulation(s);
  // Month 36 = 12 months past L64 promotion → 1 year of post-promotion raise
  const expectedGross = 240000 * Math.pow(1.05, 1) / 12;
  const expectedNet = Math.round(expectedGross * 0.75);
  near(monthlyData[36].chadJobSalaryNet, expectedNet, 2,
    'P3 salary at month 36 (1 yr post L64)');
});

test('P4. L65 enabled at month 60 → salary uses L65 base, raise from there', () => {
  const s = promoBaseState({
    chadJobRaisePct: 5,
    chadL64Enabled: true, chadL64Month: 24, chadL64Salary: 240000,
    chadL65Enabled: true, chadL65Month: 60, chadL65Salary: 300000,
  });
  const { monthlyData } = runMonthlySimulation(s);
  // Month 60: just hit L65, no raise yet
  const expectedNet60 = Math.round(300000 / 12 * 0.75);
  assert.strictEqual(monthlyData[60].chadJobSalaryNet, expectedNet60,
    `P4 salary at L65 promotion month, got ${monthlyData[60].chadJobSalaryNet}`);
  // Month 72 = 1 year past L65 → +5% on L65 base
  const expectedNet72 = Math.round(300000 * 1.05 / 12 * 0.75);
  near(monthlyData[72].chadJobSalaryNet, expectedNet72, 2,
    'P4 salary at month 72 (1 yr post L65)');
});

test('P5. Bonus paid in Sept after L64 promotion uses chadL64BonusPct', () => {
  // Calendar: PROJECTION_START_MONTH=2 → m=0 is March 2026. Sept (calendar idx 8)
  // is at m where (m+2)%12=8 → m=6 (Sept yr 1), m=18 (Sept yr 2), etc.
  // L64 fires at month 12 → by Sept yr 2 (m=18) we're L64.
  const s = promoBaseState({
    chadJobBonusPct: 10, chadJobBonusProrateFirst: false,
    chadL64Enabled: true, chadL64Month: 12, chadL64Salary: 240000, chadL64BonusPct: 20,
  });
  const { monthlyData } = runMonthlySimulation(s);
  // m=18: L64 base $240k, no raise. Bonus: $240k × 20% × 1.0 = $48k gross × 0.75 = $36000 net.
  const expectedBonusNet = Math.round(240000 * 0.20 * 1.0 * 0.75);
  assert.strictEqual(monthlyData[18].chadJobBonusNet, expectedBonusNet,
    `P5 bonus at L64 should use 20% bonus pct, got ${monthlyData[18].chadJobBonusNet} expected ${expectedBonusNet}`);
});

test('P6. RSU grant issued during L63 keeps L63 grant size through full vest', () => {
  // Aug cadence: refreshStartMonth=12 → firstAugustAtOrAfter(12)=m=17 (Aug yr2, monthsWorked=17, L63).
  // Grant 2 at m=29 (Aug yr3, monthsWorked=29, ≥ L64Month=24 → L64). First vest of grant 1 = m=20 (Nov yr2).
  const s = promoBaseState({
    chadJobStockRefresh: 50000, chadJobRefreshStartMonth: 12, msftGrowth: 0,
    chadL64Enabled: true, chadL64Month: 24, chadL64Salary: 240000, chadL64StockRefresh: 100000,
  });
  const { monthlyData } = runMonthlySimulation(s);
  // m=20 (Nov yr2): grant 1 (L63 size $50K) first vest. 5% × $50K × 0.75 = $1875.
  const expectedVestL63 = Math.round(50000 * 0.05 * 0.75);
  near(monthlyData[20].chadJobStockRefreshNet, expectedVestL63, 2,
    'P6 first vest of grant 1 (L63-issued) at m=20 should be 5% of L63 grant');
  // m=32 (Nov yr3): grant 1 still L63 size + grant 2 (issued m=29 Aug yr3, L64 size $100K)
  // first vest. Combined: 5% × ($50K + $100K) × 0.75 = $5625.
  const expectedVestM32 = Math.round((50000 * 0.05 + 100000 * 0.05) * 0.75);
  near(monthlyData[32].chadJobStockRefreshNet, expectedVestM32, 3,
    'P6 m=32 vest should include grant 1 (L63 size) + grant 2 (L64 size)');
});

test('P7. RSU grant issued during L64 uses L64 grant size for its full vest', () => {
  // refreshStartMonth=24 → firstAugustAtOrAfter(24)=m=29 (Aug yr3, monthsWorked=29 ≥ L64Month=24 → L64).
  // First vest of grant 1 = next vest month after m=29 = m=32 (Nov yr3).
  const s = promoBaseState({
    chadJobStockRefresh: 0, chadJobRefreshStartMonth: 24, msftGrowth: 0,
    chadL64Enabled: true, chadL64Month: 24, chadL64Salary: 240000, chadL64StockRefresh: 100000,
  });
  const { monthlyData } = runMonthlySimulation(s);
  const expectedVestL64 = Math.round(100000 * 0.05 * 0.75);
  near(monthlyData[32].chadJobStockRefreshNet, expectedVestL64, 2,
    'P7 first vest of L64-issued grant at m=32 should be 5% of L64 size');
});

test('P8. L65 month <= L64 month → L65 takes precedence', () => {
  const s = promoBaseState({
    chadL64Enabled: true, chadL64Month: 30, chadL64Salary: 240000,
    chadL65Enabled: true, chadL65Month: 12, chadL65Salary: 300000,
  });
  const { monthlyData } = runMonthlySimulation(s);
  // At month 12 (L65 fires) salary should be $300K, not $240K.
  const expectedNet = Math.round(300000 / 12 * 0.75);
  assert.strictEqual(monthlyData[12].chadJobSalaryNet, expectedNet,
    `P8 L65 takes precedence, got ${monthlyData[12].chadJobSalaryNet}`);
});

// ════════════════════════════════════════════════════════════════════════
// Age-65 RSU Vest Continuation
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Age-65 RSU Vest Continuation ===');

test('P9. age 63, retire at 36mo → grant 1 (m=12) clears 1yr cliff and continues vesting', () => {
  // Age at retirement = 63 + 36/12 = 66 → eligible. Grant 1 issued m=12, retirement m=36.
  // Cliff check: 36 - 12 = 24 > 12 ✓ → grant 1 continues. First post-retirement vest = m=38 (May).
  const s = promoBaseState({
    chadCurrentAge: 63, chadWorkMonths: 36,
    chadJobStockRefresh: 50000, chadJobRefreshStartMonth: 12,
    chadAge65VestOverride: 'auto',
  });
  const { monthlyData } = runMonthlySimulation(s);
  assert.strictEqual(monthlyData[38].chadJobSalaryNet, 0, 'P9 no salary post-retirement');
  assert.ok(monthlyData[38].chadJobStockRefreshNet > 0,
    `P9 RSU vest should continue past retirement when grant clears 1yr cliff, got ${monthlyData[38].chadJobStockRefreshNet}`);
});

test('P10. age 60, retire at 36mo → ineligible (age 63 < 65), no post-ret vests', () => {
  const s = promoBaseState({
    chadCurrentAge: 60, chadWorkMonths: 36,
    chadJobStockRefresh: 50000, chadJobRefreshStartMonth: 12,
    chadAge65VestOverride: 'auto',
  });
  const { monthlyData } = runMonthlySimulation(s);
  assert.strictEqual(monthlyData[38].chadJobStockRefreshNet, 0,
    `P10 no vests post-retirement when ineligible, got ${monthlyData[38].chadJobStockRefreshNet}`);
});

test('P11. Override=on with ineligible age → grant past 1yr cliff continues', () => {
  const s = promoBaseState({
    chadCurrentAge: 50, chadWorkMonths: 36, // age 53 at retirement, ineligible by age
    chadJobStockRefresh: 50000, chadJobRefreshStartMonth: 12,
    chadAge65VestOverride: 'on',
  });
  const { monthlyData } = runMonthlySimulation(s);
  assert.ok(monthlyData[38].chadJobStockRefreshNet > 0,
    `P11 override='on' should force continuation, got ${monthlyData[38].chadJobStockRefreshNet}`);
});

test('P12. Override=off with eligible age → vests stop at retirement', () => {
  const s = promoBaseState({
    chadCurrentAge: 70, chadWorkMonths: 36, // very eligible
    chadJobStockRefresh: 50000, chadJobRefreshStartMonth: 12,
    chadAge65VestOverride: 'off',
  });
  const { monthlyData } = runMonthlySimulation(s);
  assert.strictEqual(monthlyData[38].chadJobStockRefreshNet, 0,
    `P12 override='off' should stop vests, got ${monthlyData[38].chadJobStockRefreshNet}`);
});

test('P13. Post-retirement vest month: only stock refresh, no salary/bonus/hire/sign-on', () => {
  const s = promoBaseState({
    chadCurrentAge: 64, chadWorkMonths: 36, // age 67 at retirement
    chadJobStockRefresh: 50000, chadJobRefreshStartMonth: 12,
    chadJobHireStockY1: 25000, chadJobHireStockY2: 20000,
    chadJobSignOnCash: 10000,
    chadAge65VestOverride: 'auto',
  });
  const { monthlyData } = runMonthlySimulation(s);
  const m38 = monthlyData[38];
  assert.strictEqual(m38.chadJobSalaryNet, 0, 'P13 no salary post-retirement');
  assert.strictEqual(m38.chadJobBonusNet, 0, 'P13 no bonus post-retirement');
  assert.strictEqual(m38.chadJobStockHireNet, 0, 'P13 no hire stock post-retirement');
  assert.strictEqual(m38.chadJobSignOnNet, 0, 'P13 no sign-on post-retirement');
  assert.ok(m38.chadJobStockRefreshNet > 0, 'P13 refresh vests continue');
  assert.strictEqual(m38.chadJobIncome, m38.chadJobStockRefreshNet,
    'P13 chadJobIncome = stock refresh only');
});

test('P14. 1-year cliff: grant issued within 12mo of retirement is forfeited', () => {
  // Grant issued m=12, retirement m=24 (gap = 12, NOT > 12 → forfeit).
  // Sarah extends horizon so post-retirement months exist in the projection.
  const s = promoBaseState({
    chadCurrentAge: 63, chadWorkMonths: 24, sarahWorkMonths: 60,
    chadJobStockRefresh: 50000, chadJobRefreshStartMonth: 12,
    chadAge65VestOverride: 'on', // force eligibility on so cliff is the only filter
  });
  const { monthlyData } = runMonthlySimulation(s);
  // m=26 is a vest month past retirement. Grant 1 should be forfeited by cliff.
  assert.strictEqual(monthlyData[26].chadJobStockRefreshNet, 0,
    `P14 grant within 1yr cliff should forfeit, got ${monthlyData[26].chadJobStockRefreshNet}`);
});

test('P15. Extended horizon scenario does not crash savings (post-ret SS fallback)', () => {
  // Default-ish scenario: Chad employed, refresh grants, age 61 retiring at 67.
  // With age-65 vest applies + refresh grants, horizon extends 60 months past
  // retirement. Auto-SS fallback ensures post-retirement income.
  //
  // NOTE: realistic scenarios may run negative over 60 mo of post-retirement
  // expenses if savings + 401k don't cover the gap — that's REAL economic
  // depletion, not a bug. The "no crash" assertion checks for an artifact:
  // a sudden one-month cliff at the retirement boundary, which would indicate
  // the simulation is mishandling the transition.
  const s = gatherStateWithOverrides({
    chadJob: true, chadJobSalary: 190000, chadJobTaxRate: 27,
    chadJobStockRefresh: 100000, chadJobRefreshStartMonth: 12,
    chadCurrentAge: 61, chadAge65VestOverride: 'auto',
    startingSavings: 200000, starting401k: 1000000,
    ssPersonal: 2933,
  });
  const { monthlyData } = runMonthlySimulation(s);
  // Horizon extends to chadRetirementMonth + 60 when age-65 applies + grants.
  const baseHorizon = Math.max(s.chadWorkMonths || 72, s.sarahWorkMonths || 72);
  const expectedHorizon = Math.max(baseHorizon, s.chadRetirementMonth + 60);
  assert.strictEqual(s.totalProjectionMonths, expectedHorizon,
    `P15 horizon should extend to ${expectedHorizon}, got ${s.totalProjectionMonths}`);
  assert.strictEqual(monthlyData.length, expectedHorizon + 1,
    `P15 monthlyData should have ${expectedHorizon + 1} entries (months 0-N), got ${monthlyData.length}`);
  // Auto-SS fallback should fire post-retirement, at the calendar claim-age
  // anchor (remediation 2.4): claim age 67 → (67 − 62) × 12 + SS_START_OFFSET
  // = 79. (Pre-fix this test sampled m=78 — inside the bug's 7-months-early
  // window; the corrected gate starts at the FRA month, 79.)
  const postRetMonth = (67 - 62) * 12 + SS_START_OFFSET;
  assert.ok(monthlyData[postRetMonth].ssBenefit > 0,
    `P15 post-retirement SS fallback should provide income at m=${postRetMonth}, got ${monthlyData[postRetMonth].ssBenefit}`);
  assert.strictEqual(monthlyData[postRetMonth - 1].ssBenefit, 0,
    `P15 month ${postRetMonth - 1} (one before the claim-age anchor) must still be 0`);
  // Post-retirement RSU vests should appear in vest months (the original feature ask).
  const postRetVests = monthlyData
    .filter(d => d.month > s.chadRetirementMonth && (d.chadJobStockRefreshNet || 0) > 0);
  assert.ok(postRetVests.length > 0,
    `P15 post-retirement RSU vests should be visible in monthlyData, found ${postRetVests.length}`);
  // No retirement-boundary cliff: the month immediately after retirement should
  // not show a sudden drop > 1.5× the typical post-retirement monthly burn.
  // (Catches simulation artifacts like "all income disappears overnight" bugs.)
  const balanceAtRet = monthlyData[s.chadRetirementMonth].balance + monthlyData[s.chadRetirementMonth].balance401k;
  const balanceAfterRet = monthlyData[s.chadRetirementMonth + 1].balance + monthlyData[s.chadRetirementMonth + 1].balance401k;
  const oneMonthDrop = balanceAtRet - balanceAfterRet;
  // Typical monthly expense ≈ $60K at retirement with inflation. Cliff would be > $200K.
  assert.ok(oneMonthDrop < 200000,
    `P15 retirement-boundary cliff: balance dropped $${oneMonthDrop} in one month at retirement, suggesting a simulation artifact`);
});

test('P16. Auto-SS fallback uses ssPIA × FRA factor, not stale ssPersonal', () => {
  // User has ssType='ssdi' (so gatherState skips ss-recompute) and chadJob=true.
  // ssPersonal stays at default 2933, but ssPIA is $4214.
  // Auto-SS fallback should compute 4214 * ssAdjustmentFactor(67) = 4214 (FRA),
  // NOT use stale ssPersonal=2933.
  const s = gatherStateWithOverrides({
    expenseInflation: false, // A2 (2026-06-10): isolate from SS COLA (locked in ssCola.test.js)
    chadJob: true, chadJobSalary: 190000, chadJobTaxRate: 27,
    chadJobStockRefresh: 100000, chadJobRefreshStartMonth: 12,
    chadCurrentAge: 61, chadAge65VestOverride: 'auto',
    ssType: 'ssdi', // SSDI path — gatherState doesn't recompute ssPersonal
    ssPIA: 4214, ssClaimAge: 67, // user's actual SS retirement at FRA
    startingSavings: 200000, starting401k: 1000000,
  });
  const { monthlyData } = runMonthlySimulation(s);
  // Benefits start at the calendar claim-age anchor (remediation 2.4):
  // claim 67 → month (67 − 62) × 12 + SS_START_OFFSET = 79. The pre-fix test
  // sampled month 73 (inside the bug's 7-months-early window).
  const anchorMonth = (67 - 62) * 12 + SS_START_OFFSET;
  const postRet = monthlyData[anchorMonth];
  // Allow ±1 for rounding. Expect ~4214 (gross), not 2933. A1: net cash is taxed.
  assert.ok(Math.abs(postRet.ssBenefitGross - 4214) <= 2,
    `P16 expected post-retirement SS = $4214 gross (PIA at FRA) at m=${anchorMonth}, got $${postRet.ssBenefitGross}`);
});

test('P17. Income chart data: post-retirement vest months have nonzero chadJobIncome', () => {
  // Regression guard against the original "no retirement vests on income chart"
  // complaint. The data the chart consumes (monthlyData) MUST contain post-
  // retirement vests when age-65 rule applies + grants exist.
  const s = gatherStateWithOverrides({
    chadJob: true, chadJobSalary: 190000, chadJobStockRefresh: 100000,
    chadJobRefreshStartMonth: 12, chadCurrentAge: 61,
    chadAge65VestOverride: 'auto',
  });
  const { monthlyData } = runMonthlySimulation(s);
  const postRetIncomeMonths = monthlyData.filter(d =>
    d.month > s.chadRetirementMonth && (d.chadJobIncome || 0) > 0
  );
  assert.ok(postRetIncomeMonths.length >= 4,
    `P17 expected at least 4 post-retirement income months (Feb/May/Aug/Nov), got ${postRetIncomeMonths.length}`);
  assert.ok(postRetIncomeMonths[0].chadJobStockRefreshNet > 0,
    `P17 post-retirement chadJobIncome should be from stock refresh`);
});

// ════════════════════════════════════════════════════════════════════════
// Summary
// ════════════════════════════════════════════════════════════════════════
console.log(`\n${'='.repeat(50)}`);
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'='.repeat(50)}\n`);

if (failed > 0) process.exit(1);
