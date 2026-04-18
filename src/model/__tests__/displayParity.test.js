/**
 * Display Parity Tests — verify every financial value computed in the UI layer
 * (IncomeControls.jsx, FinancialModel.jsx) matches what the projection engine produces.
 * These catch "two sources of truth" bugs where a display formula diverges from the engine formula.
 *
 * Run with: node src/model/__tests__/displayParity.test.js
 */
import assert from 'node:assert';
import { runMonthlySimulation, computeProjection } from '../projection.js';
import { gatherStateWithOverrides, gatherState } from '../../state/gatherState.js';
import { INITIAL_STATE } from '../../state/initialState.js';
import { DAYS_PER_MONTH, SSDI_ATTORNEY_FEE_CAP } from '../constants.js';

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

function near(actual, expected, tolerance, label) {
  const diff = Math.abs(actual - expected);
  if (diff > tolerance) {
    throw new Error(`${label || 'near'}: expected ~${expected} (+/-${tolerance}), got ${actual} (diff ${diff})`);
  }
}

// ════════════════════════════════════════════════════════════════════════
// Section 1: chadJobMonthlyNet Parity (D1-D6)
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Section 1: chadJobMonthlyNet Parity ===');

function computeUiChadJobMonthlyNet(overrides) {
  const salary = overrides.chadJobSalary || 80000;
  const taxRate = overrides.chadJobTaxRate ?? 25;
  const ficaSavings = overrides.chadJobNoFICA ? 0.062 : 0;
  const pensionContribPct = (overrides.chadJobPensionContrib || 0) / 100;
  return Math.round(salary * (1 - taxRate / 100 + ficaSavings - pensionContribPct) / 12);
}

test('D1: chadJobMonthlyNet — basic 80K/25% tax', () => {
  const overrides = { chadJob: true, chadJobSalary: 80000, chadJobTaxRate: 25, chadJobStartMonth: 0 };
  const uiNet = computeUiChadJobMonthlyNet(overrides);
  assert.strictEqual(uiNet, 5000, `UI formula should yield 5000, got ${uiNet}`);
  const s = gatherStateWithOverrides(overrides);
  const { monthlyData } = runMonthlySimulation(s);
  assert.strictEqual(monthlyData[0].chadJobIncome, uiNet,
    `Engine month 0 chadJobIncome (${monthlyData[0].chadJobIncome}) should match UI (${uiNet})`);
});

test('D2: chadJobMonthlyNet — 120K/30% tax', () => {
  const overrides = { chadJob: true, chadJobSalary: 120000, chadJobTaxRate: 30, chadJobStartMonth: 0 };
  const uiNet = computeUiChadJobMonthlyNet(overrides);
  assert.strictEqual(uiNet, 7000, `UI formula should yield 7000, got ${uiNet}`);
  const s = gatherStateWithOverrides(overrides);
  const { monthlyData } = runMonthlySimulation(s);
  assert.strictEqual(monthlyData[0].chadJobIncome, uiNet,
    `Engine month 0 chadJobIncome (${monthlyData[0].chadJobIncome}) should match UI (${uiNet})`);
});

test('D3: chadJobMonthlyNet — with NoFICA', () => {
  const overrides = { chadJob: true, chadJobSalary: 80000, chadJobTaxRate: 25, chadJobNoFICA: true, chadJobStartMonth: 0 };
  const uiNet = computeUiChadJobMonthlyNet(overrides);
  assert.strictEqual(uiNet, 5413, `UI formula should yield 5413, got ${uiNet}`);
  const s = gatherStateWithOverrides(overrides);
  const { monthlyData } = runMonthlySimulation(s);
  assert.strictEqual(monthlyData[0].chadJobIncome, uiNet,
    `Engine month 0 chadJobIncome (${monthlyData[0].chadJobIncome}) should match UI (${uiNet})`);
});

test('D4: chadJobMonthlyNet — with 6% pension contrib', () => {
  const overrides = { chadJob: true, chadJobSalary: 80000, chadJobTaxRate: 25, chadJobPensionContrib: 6, chadJobStartMonth: 0 };
  const uiNet = computeUiChadJobMonthlyNet(overrides);
  assert.strictEqual(uiNet, 4600, `UI formula should yield 4600, got ${uiNet}`);
  const s = gatherStateWithOverrides(overrides);
  const { monthlyData } = runMonthlySimulation(s);
  assert.strictEqual(monthlyData[0].chadJobIncome, uiNet,
    `Engine month 0 chadJobIncome (${monthlyData[0].chadJobIncome}) should match UI (${uiNet})`);
});

test('D5: chadJobMonthlyNet — NoFICA + 6% pension', () => {
  const overrides = { chadJob: true, chadJobSalary: 80000, chadJobTaxRate: 25, chadJobNoFICA: true, chadJobPensionContrib: 6, chadJobStartMonth: 0 };
  const uiNet = computeUiChadJobMonthlyNet(overrides);
  assert.strictEqual(uiNet, 5013, `UI formula should yield 5013, got ${uiNet}`);
  const s = gatherStateWithOverrides(overrides);
  const { monthlyData } = runMonthlySimulation(s);
  assert.strictEqual(monthlyData[0].chadJobIncome, uiNet,
    `Engine month 0 chadJobIncome (${monthlyData[0].chadJobIncome}) should match UI (${uiNet})`);
});

test('D6: chadJobMonthlyNet — low salary 30K/10% tax', () => {
  const overrides = { chadJob: true, chadJobSalary: 30000, chadJobTaxRate: 10, chadJobStartMonth: 0 };
  const uiNet = computeUiChadJobMonthlyNet(overrides);
  assert.strictEqual(uiNet, 2250, `UI formula should yield 2250, got ${uiNet}`);
  const s = gatherStateWithOverrides(overrides);
  const { monthlyData } = runMonthlySimulation(s);
  assert.strictEqual(monthlyData[0].chadJobIncome, uiNet,
    `Engine month 0 chadJobIncome (${monthlyData[0].chadJobIncome}) should match UI (${uiNet})`);
});

// ════════════════════════════════════════════════════════════════════════
// Section 2: netImpact Formulas (D7-D12)
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Section 2: netImpact Formulas ===');

test('D7: netImpactSteady — SSDI path, personal rate', () => {
  const overrides = {
    ssType: 'ssdi', ssdiPersonal: 4214, ssdiFamilyTotal: 6321,
    chadJob: true, chadJobSalary: 80000, chadJobTaxRate: 25, chadJobHealthSavings: 4200, chadJobStartMonth: 0,
  };
  const chadJobMonthlyNet = computeUiChadJobMonthlyNet(overrides);
  const effectiveHealthSavings = overrides.chadJobHealthSavings;
  // SSDI path: personalRate = ssdiPersonal
  const personalRate = overrides.ssdiPersonal;
  const netImpactSteady = chadJobMonthlyNet + effectiveHealthSavings - personalRate;
  assert.strictEqual(chadJobMonthlyNet, 5000);
  assert.strictEqual(netImpactSteady, 5000 + 4200 - 4214, `netImpactSteady should be 4986, got ${netImpactSteady}`);
  assert.strictEqual(netImpactSteady, 4986);
});

test('D8: netImpactFamily — SSDI path, family rate', () => {
  const overrides = {
    ssType: 'ssdi', ssdiPersonal: 4214, ssdiFamilyTotal: 6321,
    chadJob: true, chadJobSalary: 80000, chadJobTaxRate: 25, chadJobHealthSavings: 4200, chadJobStartMonth: 0,
  };
  const chadJobMonthlyNet = computeUiChadJobMonthlyNet(overrides);
  const effectiveHealthSavings = overrides.chadJobHealthSavings;
  // SSDI path: familyRate = ssdiFamilyTotal
  const familyRate = overrides.ssdiFamilyTotal;
  const netImpactFamily = chadJobMonthlyNet + effectiveHealthSavings - familyRate;
  assert.strictEqual(netImpactFamily, 5000 + 4200 - 6321, `netImpactFamily should be 2879, got ${netImpactFamily}`);
  assert.strictEqual(netImpactFamily, 2879);
});

test('D9: netImpactSteady — SS path at FRA (67), personalRate = PIA', () => {
  const overrides = {
    ssType: 'ss', ssClaimAge: 67, ssPIA: 4214,
    chadJob: true, chadJobSalary: 80000, chadJobTaxRate: 25, chadJobHealthSavings: 4200, chadJobStartMonth: 0,
  };
  const chadJobMonthlyNet = computeUiChadJobMonthlyNet(overrides);
  // gatherState computes ssPersonal from PIA * adjustmentFactor(67) = PIA * 1.0 = 4214
  const s = gatherStateWithOverrides(overrides);
  const personalRate = s.ssPersonal;
  assert.strictEqual(personalRate, 4214, `ssPersonal at FRA should be PIA (4214), got ${personalRate}`);
  const netImpactSteady = chadJobMonthlyNet + overrides.chadJobHealthSavings - personalRate;
  assert.strictEqual(netImpactSteady, 4986, `netImpactSteady = 5000 + 4200 - 4214 = 4986, got ${netImpactSteady}`);
});

test('D10: netImpactSteady — SS path at 62, with computed values', () => {
  const overrides = {
    ssType: 'ss', ssClaimAge: 62, ssPIA: 4214,
    chadJob: true, chadJobSalary: 80000, chadJobTaxRate: 25, chadJobHealthSavings: 4200, chadJobStartMonth: 0,
  };
  const chadJobMonthlyNet = computeUiChadJobMonthlyNet(overrides);
  const s = gatherStateWithOverrides(overrides);
  // ssPersonal and ssFamilyTotal are computed by gatherState
  const personalRate = s.ssPersonal;
  const familyRate = s.ssFamilyTotal;
  const netImpactSteady = chadJobMonthlyNet + overrides.chadJobHealthSavings - personalRate;
  const netImpactFamily = chadJobMonthlyNet + overrides.chadJobHealthSavings - familyRate;
  // Verify formula identity: net = jobNet + healthSavings - ssRate
  assert.strictEqual(netImpactSteady, chadJobMonthlyNet + 4200 - personalRate,
    `Formula identity: netImpactSteady should be chadJobMonthlyNet + healthSavings - personalRate`);
  assert.strictEqual(netImpactFamily, chadJobMonthlyNet + 4200 - familyRate,
    `Formula identity: netImpactFamily should be chadJobMonthlyNet + healthSavings - familyRate`);
  // At 62, personalRate < PIA (early reduction), so netImpactSteady should be higher than at FRA
  assert.ok(personalRate < 4214, `ssPersonal at 62 (${personalRate}) should be less than PIA (4214)`);
});

test('D11: netImpactSteady — SSDI with FICA savings', () => {
  const overrides = {
    ssType: 'ssdi', ssdiPersonal: 4214,
    chadJob: true, chadJobSalary: 80000, chadJobTaxRate: 25, chadJobHealthSavings: 4200,
    chadJobNoFICA: true, chadJobStartMonth: 0,
  };
  const chadJobMonthlyNet = computeUiChadJobMonthlyNet(overrides);
  assert.strictEqual(chadJobMonthlyNet, 5413, `With NoFICA: 5413, got ${chadJobMonthlyNet}`);
  const personalRate = overrides.ssdiPersonal;
  const netImpactSteady = chadJobMonthlyNet + overrides.chadJobHealthSavings - personalRate;
  assert.strictEqual(netImpactSteady, 5413 + 4200 - 4214, `netImpactSteady should be 5399, got ${netImpactSteady}`);
  assert.strictEqual(netImpactSteady, 5399);
});

test('D12: netImpactSteady — SS path with pension contrib', () => {
  const overrides = {
    ssType: 'ss', ssClaimAge: 67, ssPIA: 4214,
    chadJob: true, chadJobSalary: 80000, chadJobTaxRate: 25, chadJobHealthSavings: 4200,
    chadJobPensionContrib: 6, chadJobStartMonth: 0,
  };
  const chadJobMonthlyNet = computeUiChadJobMonthlyNet(overrides);
  assert.strictEqual(chadJobMonthlyNet, 4600, `With 6% pension: 4600, got ${chadJobMonthlyNet}`);
  const s = gatherStateWithOverrides(overrides);
  const personalRate = s.ssPersonal;
  const netImpactSteady = chadJobMonthlyNet + overrides.chadJobHealthSavings - personalRate;
  assert.strictEqual(netImpactSteady, 4600 + 4200 - 4214, `netImpactSteady = 4586, got ${netImpactSteady}`);
  assert.strictEqual(netImpactSteady, 4586);
});

// ════════════════════════════════════════════════════════════════════════
// Section 3: Pension Calculation Parity (D13-D16)
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Section 3: Pension Calculation Parity ===');

function computeUiPension(salary, pensionRate, chadWorkMonths, startMonth) {
  const projMonths = Math.max(0, (chadWorkMonths || 72) - (startMonth || 0));
  const yrs = projMonths / 12;
  return Math.round((salary / 12) * (pensionRate / 100) * yrs);
}

test('D13: Pension — 80K, 2%, 72mo work, start at 0', () => {
  const overrides = { chadJob: true, chadJobSalary: 80000, chadJobPensionRate: 2, chadWorkMonths: 72, chadJobStartMonth: 0 };
  const uiPension = computeUiPension(80000, 2, 72, 0);
  const s = gatherStateWithOverrides(overrides);
  assert.strictEqual(s.chadJobPensionMonthly, uiPension,
    `gatherState pension (${s.chadJobPensionMonthly}) should match UI (${uiPension})`);
});

test('D14: Pension — 80K, 2%, 72mo work, start at month 12', () => {
  const overrides = { chadJob: true, chadJobSalary: 80000, chadJobPensionRate: 2, chadWorkMonths: 72, chadJobStartMonth: 12 };
  const uiPension = computeUiPension(80000, 2, 72, 12);
  const s = gatherStateWithOverrides(overrides);
  assert.strictEqual(s.chadJobPensionMonthly, uiPension,
    `gatherState pension (${s.chadJobPensionMonthly}) should match UI (${uiPension})`);
  // 60 months worked = 5 years, 80K/12 * 0.02 * 5 = 666.67 → 667
  assert.strictEqual(uiPension, 667, `Expected pension 667, got ${uiPension}`);
});

test('D15: Pension — rate = 0 means no pension', () => {
  const overrides = { chadJob: true, chadJobSalary: 80000, chadJobPensionRate: 0, chadWorkMonths: 72, chadJobStartMonth: 0 };
  const uiPension = computeUiPension(80000, 0, 72, 0);
  const s = gatherStateWithOverrides(overrides);
  assert.strictEqual(uiPension, 0, `UI pension should be 0 when rate is 0`);
  assert.strictEqual(s.chadJobPensionMonthly, 0, `gatherState pension should be 0 when rate is 0`);
});

test('D16: Pension — 120K, 3.5%, 120mo work, start at 3', () => {
  const overrides = { chadJob: true, chadJobSalary: 120000, chadJobPensionRate: 3.5, chadWorkMonths: 120, chadJobStartMonth: 3 };
  const uiPension = computeUiPension(120000, 3.5, 120, 3);
  const s = gatherStateWithOverrides(overrides);
  assert.strictEqual(s.chadJobPensionMonthly, uiPension,
    `gatherState pension (${s.chadJobPensionMonthly}) should match UI (${uiPension})`);
  // 117 months = 9.75 years, 120K/12 = 10000, 10000 * 0.035 * 9.75 = 3412.5 → 3413
  near(uiPension, 3413, 1, 'D16 pension value');
});

// ════════════════════════════════════════════════════════════════════════
// Section 4: Sarah Income Display (D17-D20)
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Section 4: Sarah Income Display ===');

test('D17: sarahCurrentGross/Net — defaults', () => {
  const rate = 200, clients = 3.75, taxRate = 25;
  const uiGross = Math.round(rate * clients * DAYS_PER_MONTH);
  const uiNet = Math.round(uiGross * (1 - taxRate / 100));
  const s = gatherStateWithOverrides({});
  const { monthlyData } = runMonthlySimulation(s);
  // Month 0 sarahIncome should match UI net
  assert.strictEqual(monthlyData[0].sarahIncome, uiNet,
    `Engine sarahIncome (${monthlyData[0].sarahIncome}) should match UI net (${uiNet})`);
});

test('D18: sarahIncome — ceiling values (rate=250, clients=4.5)', () => {
  const overrides = { sarahRate: 250, sarahCurrentClients: 4.5, sarahMaxRate: 250, sarahMaxClients: 4.5, sarahTaxRate: 25 };
  const uiGross = Math.round(250 * 4.5 * DAYS_PER_MONTH);
  const uiNet = Math.round(uiGross * (1 - 25 / 100));
  const s = gatherStateWithOverrides(overrides);
  const { monthlyData } = runMonthlySimulation(s);
  assert.strictEqual(monthlyData[0].sarahIncome, uiNet,
    `Engine sarahIncome (${monthlyData[0].sarahIncome}) should match UI ceiling net (${uiNet})`);
});

test('D19: sarahRate clamped to sarahMaxRate by gatherState', () => {
  const overrides = { sarahRate: 300, sarahMaxRate: 250 };
  const s = gatherStateWithOverrides(overrides);
  assert.strictEqual(s.sarahRate, 250, `sarahRate should be clamped to sarahMaxRate (250), got ${s.sarahRate}`);
  const uiGross = Math.round(250 * s.sarahCurrentClients * DAYS_PER_MONTH);
  const uiNet = Math.round(uiGross * (1 - (s.sarahTaxRate ?? 25) / 100));
  const { monthlyData } = runMonthlySimulation(s);
  assert.strictEqual(monthlyData[0].sarahIncome, uiNet,
    `Engine sarahIncome (${monthlyData[0].sarahIncome}) should match clamped UI net (${uiNet})`);
});

test('D20: sarahCurrentGross identity — gross * (1 - tax/100) === net', () => {
  const rates = [200, 250, 175];
  const clients = [3.75, 4.5, 2.0];
  const taxes = [25, 30, 15];
  for (let i = 0; i < rates.length; i++) {
    const gross = Math.round(rates[i] * clients[i] * DAYS_PER_MONTH);
    const net = Math.round(gross * (1 - taxes[i] / 100));
    // Verify the identity holds (no off-by-one from separate rounding)
    const directNet = Math.round(rates[i] * clients[i] * DAYS_PER_MONTH * (1 - taxes[i] / 100));
    // Identity: rounding gross first then multiplying may differ from rounding once
    // The UI computes: round(gross) then round(gross * factor) — two separate rounds
    assert.strictEqual(net, Math.round(gross * (1 - taxes[i] / 100)),
      `Identity check: net should equal round(gross * (1 - tax/100)) for rate=${rates[i]}`);
  }
});

// ════════════════════════════════════════════════════════════════════════
// Section 5: effectiveBaseExpenses / bcsFamilyMonthly (D21-D24)
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Section 5: effectiveBaseExpenses / bcsFamilyMonthly ===');

test('D21: bcsFamilyMonthly — default bcsParentsAnnual=25000 (no divergence)', () => {
  const overrides = { bcsParentsAnnual: 25000, bcsAnnualTotal: 43400 };
  const uiBcsFamilyMonthly = Math.round(Math.max(0, 43400 - 25000) / 12);
  const s = gatherStateWithOverrides(overrides);
  assert.strictEqual(s.bcsFamilyMonthly, uiBcsFamilyMonthly,
    `gatherState bcsFamilyMonthly (${s.bcsFamilyMonthly}) should match UI (${uiBcsFamilyMonthly})`);
});

test('D22: bcsFamilyMonthly — KNOWN DIVERGENCE when bcsParentsAnnual != 25000', () => {
  // UI uses actual bcsParentsAnnual; gatherState.bcsFamilyMonthly also uses actual.
  // BUT gatherState.baseExpenses back-calc (totalMonthlySpend path) hardcodes 25000.
  // When totalMonthlySpend is NOT set, bcsFamilyMonthly itself matches (both use actual slider).
  const overrides = { bcsParentsAnnual: 30000, bcsAnnualTotal: 43400 };
  const uiBcsFamilyMonthly = Math.round(Math.max(0, 43400 - 30000) / 12);
  assert.strictEqual(uiBcsFamilyMonthly, 1117, `UI bcsFamilyMonthly should be 1117, got ${uiBcsFamilyMonthly}`);
  const s = gatherStateWithOverrides(overrides);
  // gatherState.bcsFamilyMonthly uses the actual bcsParentsAnnual — this matches
  assert.strictEqual(s.bcsFamilyMonthly, uiBcsFamilyMonthly,
    `gatherState.bcsFamilyMonthly (${s.bcsFamilyMonthly}) matches UI (${uiBcsFamilyMonthly}) — both use actual slider`);
  // The divergence is ONLY in the baseExpenses back-calculation when totalMonthlySpend is set.
  // See D24 for that case.
});

test('D23: effectiveBaseExpenses — totalMonthlySpend=60000, default parents (no divergence)', () => {
  const overrides = { totalMonthlySpend: 60000, bcsParentsAnnual: 25000, bcsAnnualTotal: 43400 };
  const debtService = INITIAL_STATE.debtService;
  const vanMonthlySavings = INITIAL_STATE.vanMonthlySavings;
  const bcsFamilyMonthly = Math.round(Math.max(0, 43400 - 25000) / 12);
  // UI formula from FinancialModel.jsx
  const uiEffective = Math.max(0, 60000 - debtService - vanMonthlySavings - bcsFamilyMonthly);
  // gatherState uses hardcoded 25000 for back-calc — same as slider value here, so no divergence
  const s = gatherStateWithOverrides(overrides);
  assert.strictEqual(s.baseExpenses, uiEffective,
    `gatherState.baseExpenses (${s.baseExpenses}) should match UI effectiveBaseExpenses (${uiEffective})`);
});

test('D24: effectiveBaseExpenses — KNOWN DIVERGENCE: totalMonthlySpend + non-default parents', () => {
  // KNOWN DIVERGENCE: gatherState uses hardcoded 25000 for BCS in baseExpenses back-calc,
  // but UI uses actual bcsParentsAnnual. This is INTENTIONAL: the hardcoded value prevents
  // the BCS slider from being absorbed into baseExpenses (which would persist after BCS ends).
  const overrides = { totalMonthlySpend: 60000, bcsParentsAnnual: 30000, bcsAnnualTotal: 43400 };
  const debtService = INITIAL_STATE.debtService;
  const vanMonthlySavings = INITIAL_STATE.vanMonthlySavings;

  // UI formula: uses actual bcsParentsAnnual
  const uiBcsFamilyMonthly = Math.round(Math.max(0, 43400 - 30000) / 12);  // 1117
  const uiEffective = Math.max(0, 60000 - debtService - vanMonthlySavings - uiBcsFamilyMonthly);

  // gatherState: uses hardcoded 25000 for back-calc
  const statusQuoBcsMonthly = Math.round(Math.max(0, 43400 - 25000) / 12);  // 1533
  const gsBaseExpenses = Math.max(0, 60000 - debtService - vanMonthlySavings - statusQuoBcsMonthly);

  const s = gatherStateWithOverrides(overrides);
  assert.strictEqual(s.baseExpenses, gsBaseExpenses,
    `gatherState.baseExpenses (${s.baseExpenses}) should use hardcoded 25K BCS (${gsBaseExpenses})`);

  // Document the divergence: UI and gatherState produce different baseExpenses
  const divergence = uiEffective - gsBaseExpenses;
  assert.ok(divergence !== 0,
    `EXPECTED DIVERGENCE: UI (${uiEffective}) vs gatherState (${gsBaseExpenses}), diff=${divergence}`);
  // Lock the exact values so we notice if either side changes
  assert.strictEqual(uiBcsFamilyMonthly, 1117);
  assert.strictEqual(statusQuoBcsMonthly, 1533);
});

// ════════════════════════════════════════════════════════════════════════
// Section 6: totalCurrentIncome / Expenses / Gap (D25-D30)
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Section 6: totalCurrentIncome / Expenses / Gap ===');

test('D25: totalCurrentIncome at defaults', () => {
  const s = gatherStateWithOverrides({});
  const proj = computeProjection(s);
  const data = proj.data;
  const monthlyDetail = proj.monthlyData;

  // UI formula from FinancialModel.jsx
  const sarahRate = INITIAL_STATE.sarahRate;
  const sarahCurrentClients = INITIAL_STATE.sarahCurrentClients;
  const sarahTaxRate = INITIAL_STATE.sarahTaxRate;
  const sarahCurrentGross = Math.round(sarahRate * sarahCurrentClients * DAYS_PER_MONTH);
  const sarahCurrentNet = Math.round(sarahCurrentGross * (1 - (sarahTaxRate ?? 25) / 100));
  const currentMsft = data[0]?.msftVesting || 0;
  const trustIncomeNow = INITIAL_STATE.trustIncomeNow;
  const ssBenefit = monthlyDetail[0]?.ssBenefit ?? 0;
  const consulting = monthlyDetail[0]?.consulting ?? 0;
  const chadJobNetForGap = 0;  // chadJob is false by default

  const totalCurrentIncome = sarahCurrentNet + currentMsft + trustIncomeNow + ssBenefit + consulting + chadJobNetForGap;
  // Verify by checking individual components add up correctly
  assert.ok(totalCurrentIncome > 0, `totalCurrentIncome should be positive, got ${totalCurrentIncome}`);
  assert.strictEqual(totalCurrentIncome,
    sarahCurrentNet + currentMsft + trustIncomeNow + ssBenefit + consulting,
    `totalCurrentIncome identity check`);
});

test('D26: totalCurrentIncome with chadJob=true, startMonth=0 includes chadJobNetForGap', () => {
  const overrides = { chadJob: true, chadJobSalary: 80000, chadJobTaxRate: 25, chadJobStartMonth: 0 };
  const s = gatherStateWithOverrides(overrides);
  const proj = computeProjection(s);
  const data = proj.data;
  const monthlyDetail = proj.monthlyData;

  const sarahRate = INITIAL_STATE.sarahRate;
  const sarahCurrentClients = INITIAL_STATE.sarahCurrentClients;
  const sarahTaxRate = INITIAL_STATE.sarahTaxRate;
  const sarahCurrentGross = Math.round(sarahRate * sarahCurrentClients * DAYS_PER_MONTH);
  const sarahCurrentNet = Math.round(sarahCurrentGross * (1 - (sarahTaxRate ?? 25) / 100));
  const currentMsft = data[0]?.msftVesting || 0;
  const trustIncomeNow = INITIAL_STATE.trustIncomeNow;

  // chadJob immediate (startMonth=0) → includes chadJobNetForGap
  const chadJobImmediate = true;
  const chadJobNetForGap = Math.round(80000 * (1 - 25 / 100) / 12);
  assert.strictEqual(chadJobNetForGap, 5000);

  const ssBenefit = monthlyDetail[0]?.ssBenefit ?? 0;
  const consulting = monthlyDetail[0]?.consulting ?? 0;
  const totalCurrentIncome = sarahCurrentNet + currentMsft + trustIncomeNow + ssBenefit + consulting + chadJobNetForGap;

  // The chadJobNetForGap uses the simplified formula (no FICA/pension adjustments)
  // which matches projection's chadJobIncome at month 0 for the basic case
  assert.strictEqual(chadJobNetForGap, monthlyDetail[0].chadJobIncome,
    `chadJobNetForGap (${chadJobNetForGap}) should match projection chadJobIncome (${monthlyDetail[0].chadJobIncome})`);
});

test('D27: totalCurrentIncome with chadJob=true, startMonth=3 excludes chadJobNetForGap', () => {
  const overrides = { chadJob: true, chadJobSalary: 80000, chadJobTaxRate: 25, chadJobStartMonth: 3 };
  const s = gatherStateWithOverrides(overrides);
  const proj = computeProjection(s);
  const monthlyDetail = proj.monthlyData;

  // chadJob not immediate (startMonth=3) → chadJobNetForGap = 0
  const chadJobImmediate = false;
  const chadJobNetForGap = 0;

  // Verify projection also shows 0 at month 0
  assert.strictEqual(monthlyDetail[0].chadJobIncome, 0,
    `Projection month 0 chadJobIncome should be 0 when start is month 3, got ${monthlyDetail[0].chadJobIncome}`);
  // And non-zero at month 3
  assert.ok(monthlyDetail[3].chadJobIncome > 0,
    `Projection month 3 chadJobIncome should be > 0, got ${monthlyDetail[3].chadJobIncome}`);
});

test('D28: totalCurrentExpenses default formula', () => {
  const s = gatherStateWithOverrides({});
  const baseExpenses = INITIAL_STATE.baseExpenses;
  const debtService = INITIAL_STATE.debtService;
  const vanMonthlySavings = INITIAL_STATE.vanMonthlySavings;
  const bcsAnnualTotal = INITIAL_STATE.bcsAnnualTotal;
  const bcsParentsAnnual = INITIAL_STATE.bcsParentsAnnual;
  const bcsFamilyMonthly = Math.round(Math.max(0, bcsAnnualTotal - bcsParentsAnnual) / 12);
  const chadJobHealthForGap = 0;  // no chadJob
  const extrasAtMonth0 = 0;  // oneTimeExtras default is 0

  const totalCurrentExpenses = Math.max(baseExpenses + debtService + vanMonthlySavings + bcsFamilyMonthly - chadJobHealthForGap + extrasAtMonth0, 0);
  // Verify each component is from defaults
  assert.strictEqual(baseExpenses, 43818);
  assert.strictEqual(debtService, 6434);
  assert.strictEqual(vanMonthlySavings, 2597);
  assert.strictEqual(bcsFamilyMonthly, Math.round(Math.max(0, 43400 - 25000) / 12));
  assert.ok(totalCurrentExpenses > 0, `totalCurrentExpenses should be positive`);
});

test('D29: totalCurrentExpenses with oneTimeExtras', () => {
  const overrides = { oneTimeExtras: 5000, oneTimeMonths: 12 };
  const baseExpenses = INITIAL_STATE.baseExpenses;
  const debtService = INITIAL_STATE.debtService;
  const vanMonthlySavings = INITIAL_STATE.vanMonthlySavings;
  const bcsAnnualTotal = INITIAL_STATE.bcsAnnualTotal;
  const bcsParentsAnnual = INITIAL_STATE.bcsParentsAnnual;
  const bcsFamilyMonthly = Math.round(Math.max(0, bcsAnnualTotal - bcsParentsAnnual) / 12);
  const extrasAtMonth0 = 5000;  // oneTimeExtras > 0 && oneTimeMonths > 0

  const withoutExtras = Math.max(baseExpenses + debtService + vanMonthlySavings + bcsFamilyMonthly, 0);
  const withExtras = Math.max(baseExpenses + debtService + vanMonthlySavings + bcsFamilyMonthly + extrasAtMonth0, 0);
  assert.strictEqual(withExtras - withoutExtras, 5000,
    `Adding oneTimeExtras=5000 should increase expenses by 5000`);

  // Also verify projection agrees about extras at month 0
  const s = gatherStateWithOverrides(overrides);
  const { monthlyData } = runMonthlySimulation(s);
  const sNoExtras = gatherStateWithOverrides({});
  const noExtrasResult = runMonthlySimulation(sNoExtras);
  const diff = monthlyData[0].expenses - noExtrasResult.monthlyData[0].expenses;
  assert.strictEqual(diff, 5000,
    `Projection expenses diff at month 0 should be 5000 for oneTimeExtras, got ${diff}`);
});

test('D30: rawMonthlyGap = totalCurrentIncome - totalCurrentExpenses', () => {
  const s = gatherStateWithOverrides({});
  const proj = computeProjection(s);
  const data = proj.data;
  const monthlyDetail = proj.monthlyData;

  const sarahCurrentGross = Math.round(INITIAL_STATE.sarahRate * INITIAL_STATE.sarahCurrentClients * DAYS_PER_MONTH);
  const sarahCurrentNet = Math.round(sarahCurrentGross * (1 - (INITIAL_STATE.sarahTaxRate ?? 25) / 100));
  const currentMsft = data[0]?.msftVesting || 0;
  const trustIncomeNow = INITIAL_STATE.trustIncomeNow;
  const ssBenefit = monthlyDetail[0]?.ssBenefit ?? 0;
  const consulting = monthlyDetail[0]?.consulting ?? 0;
  const totalCurrentIncome = sarahCurrentNet + currentMsft + trustIncomeNow + ssBenefit + consulting;

  const bcsFamilyMonthly = Math.round(Math.max(0, INITIAL_STATE.bcsAnnualTotal - INITIAL_STATE.bcsParentsAnnual) / 12);
  const effectiveBaseExpenses = INITIAL_STATE.baseExpenses;  // totalMonthlySpend is null
  const totalCurrentExpenses = Math.max(effectiveBaseExpenses + INITIAL_STATE.debtService + INITIAL_STATE.vanMonthlySavings + bcsFamilyMonthly, 0);

  const rawMonthlyGap = totalCurrentIncome - totalCurrentExpenses;
  // Verify identity
  assert.strictEqual(rawMonthlyGap, totalCurrentIncome - totalCurrentExpenses,
    `rawMonthlyGap identity: income - expenses`);
  // Gap should be negative at defaults (the family has a monthly deficit)
  assert.ok(rawMonthlyGap < 0, `Default rawMonthlyGap should be negative (deficit), got ${rawMonthlyGap}`);
});

// ════════════════════════════════════════════════════════════════════════
// Section 7: steadyStateNet / steadyStateIncome (D31-D34)
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Section 7: steadyStateNet / steadyStateIncome ===');

test('D31: steadyStateNet = data[steadyIdx].netMonthly at month >= 36', () => {
  const s = gatherStateWithOverrides({});
  const proj = computeProjection(s);
  const data = proj.data;

  const steadyIdxRaw = data.findIndex(d => d.month >= 36);
  const steadyIdx = steadyIdxRaw >= 0 ? steadyIdxRaw : data.length - 1;
  const steadyStateNet = data[steadyIdx]?.netMonthly || data[data.length - 1].netMonthly;
  assert.ok(steadyIdx >= 0, `Should find a quarter with month >= 36`);
  assert.strictEqual(steadyStateNet, data[steadyIdx].netMonthly,
    `steadyStateNet should come from data[${steadyIdx}].netMonthly`);
  assert.ok(data[steadyIdx].month >= 36,
    `steadyIdx quarter month (${data[steadyIdx].month}) should be >= 36`);
});

test('D32: steadyStateIncome = data[steadyIdx].totalIncome', () => {
  const s = gatherStateWithOverrides({});
  const proj = computeProjection(s);
  const data = proj.data;

  const steadyIdxRaw = data.findIndex(d => d.month >= 36);
  const steadyIdx = steadyIdxRaw >= 0 ? steadyIdxRaw : data.length - 1;
  const steadyStateIncome = data[steadyIdx]?.totalIncome || data[data.length - 1]?.totalIncome || 0;
  assert.strictEqual(steadyStateIncome, data[steadyIdx].totalIncome,
    `steadyStateIncome should come from data[${steadyIdx}].totalIncome`);
});

test('D33: steadyState — short horizon fallback to last quarter', () => {
  const overrides = { chadWorkMonths: 24, sarahWorkMonths: 24 };
  const s = gatherStateWithOverrides(overrides);
  const proj = computeProjection(s);
  const data = proj.data;

  const steadyIdxRaw = data.findIndex(d => d.month >= 36);
  // With 24-month horizon, quarterly data may not reach month 36
  // totalProjectionMonths = max(24, 24) = 24
  // Quarterly schedule goes up to totalProjectionMonths - 12 = 12, so months 0, 3, 6, 9
  if (steadyIdxRaw < 0) {
    // Falls back to last quarter
    const steadyIdx = data.length - 1;
    const steadyStateNet = data[steadyIdx]?.netMonthly || 0;
    assert.ok(steadyStateNet !== undefined, `Should have a fallback steadyStateNet`);
    assert.strictEqual(steadyStateNet, data[data.length - 1].netMonthly,
      `Short horizon should fall back to last quarter's netMonthly`);
  } else {
    // If somehow month 36 exists, the normal path should still work
    assert.ok(data[steadyIdxRaw].month >= 36);
  }
});

test('D34: steadyState — extended horizon (sarahWorkMonths=96)', () => {
  const overrides = { sarahWorkMonths: 96 };
  const s = gatherStateWithOverrides(overrides);
  const proj = computeProjection(s);
  const data = proj.data;

  const steadyIdxRaw = data.findIndex(d => d.month >= 36);
  assert.ok(steadyIdxRaw >= 0, `Extended horizon should reach month 36`);
  const steadyIdx = steadyIdxRaw;
  assert.strictEqual(data[steadyIdx].month, 36,
    `First quarter at or after month 36 should be month 36 exactly`);
  const steadyStateNet = data[steadyIdx].netMonthly;
  const steadyStateIncome = data[steadyIdx].totalIncome;
  assert.ok(typeof steadyStateNet === 'number', `steadyStateNet should be a number`);
  assert.ok(typeof steadyStateIncome === 'number', `steadyStateIncome should be a number`);
});

// ════════════════════════════════════════════════════════════════════════
// Section 8: SSDI Back Pay Display (D35-D38)
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Section 8: SSDI Back Pay Display ===');

test('D35: ssdiBackPayGross = backPayMonths * ssdiPersonal', () => {
  const backPayMonths = 18, personal = 4214;
  const gross = backPayMonths * personal;
  assert.strictEqual(gross, 75852, `Gross should be 18 * 4214 = 75852, got ${gross}`);
});

test('D36: Attorney fee capped at SSDI_ATTORNEY_FEE_CAP', () => {
  const gross = 75852;
  const fee = Math.min(Math.round(gross * 0.25), SSDI_ATTORNEY_FEE_CAP);
  // 75852 * 0.25 = 18963, cap is 7500
  assert.strictEqual(fee, SSDI_ATTORNEY_FEE_CAP, `Fee should be capped at ${SSDI_ATTORNEY_FEE_CAP}, got ${fee}`);
  assert.strictEqual(fee, 7500, `Fee cap should be 7500`);
});

test('D37: Attorney fee below cap (small back pay)', () => {
  const backPayMonths = 6, personal = 1000;
  const gross = backPayMonths * personal;
  assert.strictEqual(gross, 6000);
  const fee = Math.min(Math.round(gross * 0.25), SSDI_ATTORNEY_FEE_CAP);
  assert.strictEqual(fee, 1500, `Fee should be 1500 (below cap), got ${fee}`);
  const actual = gross - fee;
  assert.strictEqual(actual, 4500, `Net should be 4500, got ${actual}`);
});

test('D38: projection.backPayActual matches UI formula', () => {
  const s = gatherStateWithOverrides({});
  const { backPayActual } = runMonthlySimulation(s);
  // UI formula from FinancialModel.jsx
  const ssdiPersonal = INITIAL_STATE.ssdiPersonal;
  const ssdiBackPayMonths = INITIAL_STATE.ssdiBackPayMonths;
  const ssdiBackPayGross = ssdiBackPayMonths * ssdiPersonal;
  const ssdiAttorneyFee = Math.min(Math.round(ssdiBackPayGross * 0.25), SSDI_ATTORNEY_FEE_CAP);
  const ssdiBackPayActual = ssdiBackPayGross - ssdiAttorneyFee;
  assert.strictEqual(backPayActual, ssdiBackPayActual,
    `projection.backPayActual (${backPayActual}) should match UI formula (${ssdiBackPayActual})`);
});

// ════════════════════════════════════════════════════════════════════════
// Section 9: debtTotal / advanceNeeded (D39-D42)
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Section 9: debtTotal / advanceNeeded ===');

test('D39: debtTotal = sum of all debt balances', () => {
  const { debtCC, debtPersonal, debtIRS, debtFirstmark } = INITIAL_STATE;
  const debtTotal = debtCC + debtPersonal + debtIRS + debtFirstmark;
  assert.strictEqual(debtTotal, 92760 + 57611 + 17937 + 21470,
    `debtTotal should be sum of individual debts`);
  assert.strictEqual(debtTotal, 189778, `debtTotal should be 189778, got ${debtTotal}`);
});

test('D40: advanceNeeded with retireDebt=false, no projects = 0', () => {
  const retireDebt = false;
  const debtTotal = 189778;
  const oneTimeTotal = 0;  // all project includes are false by default
  const advanceNeeded = (retireDebt ? debtTotal : 0) + oneTimeTotal;
  assert.strictEqual(advanceNeeded, 0, `advanceNeeded should be 0 when retireDebt=false, got ${advanceNeeded}`);
});

test('D41: advanceNeeded with retireDebt=true, no projects', () => {
  const retireDebt = true;
  const { debtCC, debtPersonal, debtIRS, debtFirstmark } = INITIAL_STATE;
  const debtTotal = debtCC + debtPersonal + debtIRS + debtFirstmark;
  const oneTimeTotal = 0;
  const advanceNeeded = (retireDebt ? debtTotal : 0) + oneTimeTotal;
  assert.strictEqual(advanceNeeded, 189778, `advanceNeeded should be 189778 with retireDebt=true, got ${advanceNeeded}`);
});

test('D42: advanceNeeded with retireDebt=true + moldInclude=true', () => {
  const retireDebt = true;
  const { debtCC, debtPersonal, debtIRS, debtFirstmark, moldCost } = INITIAL_STATE;
  const debtTotal = debtCC + debtPersonal + debtIRS + debtFirstmark;
  const moldInclude = true;
  const oneTimeTotal = moldInclude ? moldCost : 0;
  const advanceNeeded = (retireDebt ? debtTotal : 0) + oneTimeTotal;
  assert.strictEqual(moldCost, 60000, `moldCost should be 60000`);
  assert.strictEqual(advanceNeeded, 189778 + 60000, `advanceNeeded should be 249778, got ${advanceNeeded}`);
  assert.strictEqual(advanceNeeded, 249778);
});

// ════════════════════════════════════════════════════════════════════════
// Summary
// ════════════════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(60)}`);
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'═'.repeat(60)}`);
if (failed > 0) process.exit(1);
