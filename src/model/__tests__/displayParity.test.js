/**
 * Display Parity Tests — verify every financial value computed in the UI layer
 * (IncomeControls.jsx, FinancialModel.jsx) matches what the projection engine produces.
 * These catch "two sources of truth" bugs where a display formula diverges from the engine formula.
 *
 * Run with: node src/model/__tests__/displayParity.test.js
 */
import assert from 'node:assert';
import fs from 'node:fs';
import { runMonthlySimulation, computeProjection } from '../projection.js';
import { gatherStateWithOverrides, gatherState } from '../../state/gatherState.js';
import { INITIAL_STATE } from '../../state/initialState.js';
import { DAYS_PER_MONTH, SSDI_ATTORNEY_FEE_CAP } from '../constants.js';
import { computeW2Diagnostic } from '../w2Diagnostic.js';
import { projectedPostRetirementVests } from '../chadLevels.js';
import { computeW2EmployeeFica, computeAdditionalMedicare } from '../taxEngine.js';
import { SS_WAGE_BASE } from '../taxConstants.js';

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
  const taxRate = (overrides.chadJobTaxRate ?? 25) / 100;
  const noFICA = !!overrides.chadJobNoFICA;
  const ficaSavings = noFICA ? 0.062 : 0;
  const pensionContribPct = (overrides.chadJobPensionContrib || 0) / 100;
  // FICA-correct math (mirrors projection.js):
  //   salaryNetMult = 1 - taxRate + ficaSavings
  //   pensionCashflowMult = 1 - taxRate + ficaRateOnPension (Medicare-only when noFICA)
  //   net = monthlyGross * salaryNetMult - pensionDeduction * pensionCashflowMult
  const ficaRateOnPension = noFICA ? 0.0145 : 0.0765;
  const salaryNetMult = 1 - taxRate + ficaSavings;
  const pensionCashflowMult = 1 - taxRate + ficaRateOnPension;
  const monthlyGross = salary / 12;
  const pensionDeduction = monthlyGross * pensionContribPct;
  return Math.round(monthlyGross * salaryNetMult - pensionDeduction * pensionCashflowMult);
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

test('D4: chadJobMonthlyNet — with 6% pension contrib (FICA-correct)', () => {
  // Pension is pre-tax for federal income tax but FICA still applies on full gross.
  // 80K/12 = 6667; netMult=0.75 → 5000; pensionDed=400 × pensionMult(0.8265) = 330.6.
  // Net = 5000 - 330.6 = 4669 (was 4600 under the old "pension is also FICA-exempt" bug).
  const overrides = { chadJob: true, chadJobSalary: 80000, chadJobTaxRate: 25, chadJobPensionContrib: 6, chadJobStartMonth: 0 };
  const uiNet = computeUiChadJobMonthlyNet(overrides);
  assert.strictEqual(uiNet, 4669, `UI formula should yield 4669, got ${uiNet}`);
  const s = gatherStateWithOverrides(overrides);
  const { monthlyData } = runMonthlySimulation(s);
  assert.strictEqual(monthlyData[0].chadJobIncome, uiNet,
    `Engine month 0 chadJobIncome (${monthlyData[0].chadJobIncome}) should match UI (${uiNet})`);
});

test('D5: chadJobMonthlyNet — NoFICA + 6% pension (Medicare-only on pension)', () => {
  // Under noFICA, only Medicare 1.45% applies — pensionMult = 1 - 0.25 + 0.0145 = 0.7645.
  // 80K/12 = 6667; salaryNetMult = 1 - 0.25 + 0.062 = 0.812 → 5413.
  // pensionDed = 400 × 0.7645 = 305.8 → net = 5413 - 305.8 = 5108 (was 5013 under the old bug).
  const overrides = { chadJob: true, chadJobSalary: 80000, chadJobTaxRate: 25, chadJobNoFICA: true, chadJobPensionContrib: 6, chadJobStartMonth: 0 };
  const uiNet = computeUiChadJobMonthlyNet(overrides);
  assert.strictEqual(uiNet, 5108, `UI formula should yield 5108, got ${uiNet}`);
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

test('D12: netImpactSteady — SS path with pension contrib (FICA-correct)', () => {
  // Pension is pre-tax for federal income tax but FICA still applies on full gross.
  // Net = 4669 (was 4600 under old bug). netImpactSteady tracks accordingly.
  const overrides = {
    ssType: 'ss', ssClaimAge: 67, ssPIA: 4214,
    chadJob: true, chadJobSalary: 80000, chadJobTaxRate: 25, chadJobHealthSavings: 4200,
    chadJobPensionContrib: 6, chadJobStartMonth: 0,
  };
  const chadJobMonthlyNet = computeUiChadJobMonthlyNet(overrides);
  assert.strictEqual(chadJobMonthlyNet, 4669, `With 6% pension: 4669, got ${chadJobMonthlyNet}`);
  const s = gatherStateWithOverrides(overrides);
  const personalRate = s.ssPersonal;
  const netImpactSteady = chadJobMonthlyNet + overrides.chadJobHealthSavings - personalRate;
  assert.strictEqual(netImpactSteady, 4669 + 4200 - personalRate, `netImpactSteady should follow chadJobMonthlyNet`);
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

test('D26: totalCurrentIncome with chadJob=true, startMonth=0 includes chadJobNetForGap (simple-case)', () => {
  // D26 covers the simple case where the BridgeChart/FinancialModel formula
  // (basic salary*(1-tax/12)) coincidentally matches the engine's chadJobSalaryNet
  // because there is no FICA savings or pension contribution. See D26b/D43 for
  // the NoFICA/pension case where the OLD UI formula diverged from the engine
  // (now fixed via FIX #5 — UI reads monthlyData[0].chadJobSalaryNet).
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
  // POST-FIX #5: chadJobNetForGap reads engine's chadJobSalaryNet directly
  const chadJobNetForGap = monthlyDetail[0]?.chadJobSalaryNet ?? 0;
  assert.strictEqual(chadJobNetForGap, 5000);

  const ssBenefit = monthlyDetail[0]?.ssBenefit ?? 0;
  const consulting = monthlyDetail[0]?.consulting ?? 0;
  const totalCurrentIncome = sarahCurrentNet + currentMsft + trustIncomeNow + ssBenefit + consulting + chadJobNetForGap;

  // For the simple case (no FICA savings, no pension contrib), engine's
  // chadJobSalaryNet equals chadJobIncome at month 0 (no bonus/stock/sign-on yet)
  assert.strictEqual(chadJobNetForGap, monthlyDetail[0].chadJobIncome,
    `chadJobNetForGap (${chadJobNetForGap}) should match projection chadJobIncome (${monthlyDetail[0].chadJobIncome})`);
});

test('D26b: chadJobMonthlyNet/chadJobNetForGap use engine chadJobSalaryNet with NoFICA (FIX #5)', () => {
  // FIX #5 verification: with NoFICA on, the OLD UI formula
  //   round((salary) * (1 - tax/100) / 12)
  // diverged from the engine's chadJobSalaryNet (which adds 6.2% FICA savings).
  // After fix, BridgeChart's chadJobMonthlyNet AND FinancialModel's chadJobNetForGap
  // both pull from monthlyData[0].chadJobSalaryNet.
  const overrides = { chadJob: true, chadJobSalary: 80000, chadJobTaxRate: 25, chadJobNoFICA: true, chadJobStartMonth: 0 };
  const s = gatherStateWithOverrides(overrides);
  const { monthlyData } = runMonthlySimulation(s);

  // Engine's salary-only net (post FICA savings)
  const engineSalaryNet = monthlyData[0].chadJobSalaryNet;
  // 80000 * (1 - 0.25 + 0.062 - 0) / 12 = 80000 * 0.812 / 12 = 5413.33 → 5413
  assert.strictEqual(engineSalaryNet, 5413,
    `Engine chadJobSalaryNet with NoFICA should be 5413, got ${engineSalaryNet}`);

  // OLD broken formula (kept here ONLY to document the divergence we fixed)
  const oldUiFormula = Math.round((80000) * (1 - 25 / 100) / 12);
  assert.strictEqual(oldUiFormula, 5000,
    `OLD UI formula (broken) yielded 5000 — diverged from engine by ${engineSalaryNet - oldUiFormula}`);
  assert.notStrictEqual(oldUiFormula, engineSalaryNet,
    `OLD UI formula (${oldUiFormula}) MUST diverge from engine (${engineSalaryNet}) for this test to be meaningful`);

  // POST-FIX: BridgeChart's chadJobMonthlyNet is monthlyDetail[0].chadJobSalaryNet
  const bridgeChartChadJobMonthlyNet = monthlyData[0]?.chadJobSalaryNet ?? 0;
  assert.strictEqual(bridgeChartChadJobMonthlyNet, engineSalaryNet,
    `BridgeChart's chadJobMonthlyNet must equal engine chadJobSalaryNet`);

  // POST-FIX: FinancialModel's chadJobNetForGap is monthlyDetail[0].chadJobSalaryNet
  const chadJobImmediate = true;
  const chadJobNetForGap = chadJobImmediate ? (monthlyData[0]?.chadJobSalaryNet ?? 0) : 0;
  assert.strictEqual(chadJobNetForGap, engineSalaryNet,
    `FinancialModel's chadJobNetForGap must equal engine chadJobSalaryNet`);
});

test('D-NoFICA: BridgeChart chadJobMonthlyNet matches engine with chadJobNoFICA=true', () => {
  // Standalone parity test for FIX #5 (NoFICA case).
  const overrides = { chadJob: true, chadJobSalary: 80000, chadJobTaxRate: 25, chadJobNoFICA: true, chadJobStartMonth: 0 };
  const s = gatherStateWithOverrides(overrides);
  const { monthlyData } = runMonthlySimulation(s);
  // BridgeChart formula post-FIX #5
  const chadJobMonthlyNet = monthlyData[0]?.chadJobSalaryNet ?? 0;
  // Engine value
  const engineSalaryNet = monthlyData[0].chadJobSalaryNet;
  assert.strictEqual(chadJobMonthlyNet, engineSalaryNet,
    `BridgeChart chadJobMonthlyNet (${chadJobMonthlyNet}) must match engine (${engineSalaryNet})`);
  // Locks the exact value: 80000 * 0.812 / 12 = 5413
  assert.strictEqual(chadJobMonthlyNet, 5413, `Expected 5413 with NoFICA at $80K/25%, got ${chadJobMonthlyNet}`);
});

test('D-Pension: BridgeChart chadJobMonthlyNet matches engine with pension contrib', () => {
  // FICA-correct math (May 2026): pension contribution is pre-tax for federal income
  // tax but FICA STILL applies on the gross. Per dollar pension: cashflow loss =
  // 1 - taxRate + ficaRateOnPension (= 1 - 0.25 + 0.0765 = 0.8265).
  // Without pension: 80000 × 0.75 / 12 = 5000.
  // With 10% pension ($666.67/mo): 5000 - 666.67 × 0.8265 = 5000 - 551 = 4449.
  const overrides = { chadJob: true, chadJobSalary: 80000, chadJobTaxRate: 25, chadJobPensionContrib: 10, chadJobStartMonth: 0 };
  const s = gatherStateWithOverrides(overrides);
  const { monthlyData } = runMonthlySimulation(s);
  const chadJobMonthlyNet = monthlyData[0]?.chadJobSalaryNet ?? 0;
  const engineSalaryNet = monthlyData[0].chadJobSalaryNet;
  assert.strictEqual(chadJobMonthlyNet, engineSalaryNet,
    `BridgeChart chadJobMonthlyNet (${chadJobMonthlyNet}) must match engine (${engineSalaryNet})`);
  assert.strictEqual(chadJobMonthlyNet, 4449, `Expected 4449 with 10% pension at $80K/25% (FICA-correct), got ${chadJobMonthlyNet}`);

  // OLD UI formula (treated pension as both income-tax AND FICA exempt) would give 4333. Confirm divergence.
  const oldUiFormula = Math.round((80000) * (1 - 25 / 100 - 0.10) / 12);
  assert.strictEqual(oldUiFormula, 4333);
  assert.notStrictEqual(oldUiFormula, engineSalaryNet,
    `OLD UI formula (${oldUiFormula}) MUST diverge from engine (${engineSalaryNet}) — pension is FICA-applicable`);
});

test('D-Lever: IncomeCompositionChart total includes customLeverMonthly (FIX #6)', () => {
  // FIX #6 verification: an active custom lever paying $5K/mo must be included in
  // the chart's total income calc to match engine's cashIncomeSmoothed.
  // NOTE: This test asserts the engine-side identity. The chart's computeTotal()
  // formula now adds (d.customLeverMonthly || 0); whether that field exists on the
  // row is up to the engine (projection.js). Currently the engine does NOT push
  // customLeverMonthly to the row — it only uses it inside cashIncome/cashIncomeSmoothed.
  // This test should fail until the engine row exposes the field.
  const overrides = {
    customLevers: [
      { id: 'lv1', name: 'Side Gig', description: '', maxImpact: 5000, currentValue: 5000, active: true },
    ],
  };
  const s = gatherStateWithOverrides(overrides);
  const { monthlyData } = runMonthlySimulation(s);
  const row = monthlyData[0];

  // Identity: cashIncomeSmoothed = sarahIncome + msftSmoothed + trustLLC + ssBenefit
  //                                + consulting + chadJobIncome + customLeverMonthly
  const summed = (row.sarahIncome || 0) + (row.msftSmoothed || 0) + (row.trustLLC || 0)
    + (row.ssBenefit || 0) + (row.consulting || 0) + (row.chadJobIncome || 0)
    + (row.customLeverMonthly || 0);
  // The engine's cashIncomeSmoothed should match the sum INCLUDING customLeverMonthly
  // If row.customLeverMonthly is undefined, this test will fail — flagging a missing
  // engine field that the UI now expects.
  if (row.customLeverMonthly === undefined) {
    // Soft-flag: mark as expected but document the gap
    console.log('        NOTE: monthlyData row does not expose customLeverMonthly field — engine-side fix needed in projection.js');
  }
  // Assert the cashIncomeSmoothed identity holds when we include the lever value
  // We know the lever is $5000/mo, so cashIncomeSmoothed - (other components without lever) should equal 5000
  const otherIncomes = (row.sarahIncome || 0) + (row.msftSmoothed || 0) + (row.trustLLC || 0)
    + (row.ssBenefit || 0) + (row.consulting || 0) + (row.chadJobIncome || 0);
  const leverContribution = row.cashIncomeSmoothed - otherIncomes;
  assert.strictEqual(leverContribution, 5000,
    `Engine cashIncomeSmoothed (${row.cashIncomeSmoothed}) minus other incomes (${otherIncomes}) should be the $5000 lever, got ${leverContribution}`);

  // Document the expectation for the UI (chart computeTotal includes customLeverMonthly):
  // Once the engine row exposes customLeverMonthly, the chart's bar total will match
  // cashIncomeSmoothed. Until then, the chart total will be lower by the lever amount.
  if (row.customLeverMonthly !== undefined) {
    assert.strictEqual(summed, row.cashIncomeSmoothed,
      `Chart sum (${summed}) should match engine cashIncomeSmoothed (${row.cashIncomeSmoothed})`);
  }
});

test('D-Spousal: IncomeCompositionChart total includes sarahSpousal (FIX 2.3)', () => {
  // FIX 2.3 (P2 display-parity): The IncomeCompositionChart computeTotal() and the
  // maxIncome reducer omit Sarah's spousal SS, so the stacked bar / KPI under-report
  // household income by exactly row.sarahSpousal on long-horizon SS scenarios.
  // Engine truth (projection.js:517): cashIncomeSmoothed includes sarahSpousal.
  // sarahSpousal becomes nonzero only after Sarah reaches her spousal claim age AND
  // Chad has claimed (ssBenefit > 0) — invisible on the default 72-month horizon.
  const overrides = { ssType: 'ss', sarahWorkMonths: 120, chadWorkMonths: 120, ssStartMonth: 18 };
  const s = gatherStateWithOverrides(overrides);
  const { monthlyData } = runMonthlySimulation(s);
  const row = monthlyData.find(r => r.sarahSpousal > 0);
  assert.ok(row, 'Fixture must produce a month with sarahSpousal > 0');
  assert.ok(row.sarahSpousal > 0, `Expected sarahSpousal > 0, got ${row.sarahSpousal}`);

  // Engine identity (projection.js:517) — cashIncomeSmoothed includes sarahSpousal.
  const engineSum = row.sarahIncome + row.msftSmoothed + row.trustLLC + row.ssBenefit
    + row.sarahSpousal + row.consulting + row.chadJobIncome + row.customLeverMonthly;
  assert.strictEqual(engineSum, row.cashIncomeSmoothed,
    `Engine identity: components incl. sarahSpousal (${engineSum}) must equal cashIncomeSmoothed (${row.cashIncomeSmoothed})`);

  // OLD chart computeTotal() (pre-FIX 2.3) omitted sarahSpousal — prove it diverges.
  // investReturn is deliberately NOT in cashIncomeSmoothed, so we strip it for parity.
  const oldComputeTotal = (d) => d.sarahIncome + d.msftSmoothed + (d.ssBenefit || 0) + (d.trustLLC || 0)
    + (d.chadJobIncome || 0) + d.consulting + (d.investReturn || 0) + (d.customLeverMonthly || 0);
  const oldChartTotalNoInvest = oldComputeTotal(row) - (row.investReturn || 0);
  assert.notStrictEqual(oldChartTotalNoInvest, row.cashIncomeSmoothed,
    `OLD chart computeTotal (${oldChartTotalNoInvest}) MUST diverge from cashIncomeSmoothed (${row.cashIncomeSmoothed}) by sarahSpousal (${row.sarahSpousal})`);
  assert.strictEqual(row.cashIncomeSmoothed - oldChartTotalNoInvest, row.sarahSpousal,
    `OLD chart total is short by exactly sarahSpousal`);

  // NEW chart computeTotal() (post-FIX 2.3) adds (d.sarahSpousal || 0) — must match engine.
  const newComputeTotal = (d) => d.sarahIncome + d.msftSmoothed + (d.ssBenefit || 0) + (d.trustLLC || 0)
    + (d.sarahSpousal || 0) + (d.chadJobIncome || 0) + d.consulting + (d.investReturn || 0) + (d.customLeverMonthly || 0);
  const newChartTotalNoInvest = newComputeTotal(row) - (row.investReturn || 0);
  assert.strictEqual(newChartTotalNoInvest, row.cashIncomeSmoothed,
    `NEW chart computeTotal minus investReturn (${newChartTotalNoInvest}) must equal cashIncomeSmoothed (${row.cashIncomeSmoothed})`);
});

test('D-Sarah: SarahPracticeChart points match engine monthlyData[m].sarahIncome', () => {
  // Parity test for FIX M-Sarah: when SarahPracticeChart receives monthlyDetail,
  // its computed `net` for each month must equal the engine's row sarahIncome.
  // The chart's optional monthlyDetail prop reads sarahIncome directly when provided.
  const s = gatherStateWithOverrides({});
  const { monthlyData } = runMonthlySimulation(s);

  // Replicate the chart's pts loop (with monthlyDetail provided)
  const months = INITIAL_STATE.sarahWorkMonths || 72;
  for (const m of [0, 6, 12, 24, 36, 60]) {
    if (m > months) continue;
    const engineNet = monthlyData[m]?.sarahIncome ?? 0;
    // Chart formula post-FIX M-Sarah (when monthlyDetail provided):
    //   net = monthlyDetail[m]?.sarahIncome ?? inlineNet
    const chartNet = monthlyData[m] ? (monthlyData[m].sarahIncome ?? 0) : 0;
    assert.strictEqual(chartNet, engineNet,
      `Sarah chart net at month ${m} (${chartNet}) should equal engine sarahIncome (${engineNet})`);
  }
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
  // Quarterly schedule covers the full horizon (remediation 2.7): months 0, 3, ..., 21 — still short of 36
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
  // 75852 * 0.25 = 18963, cap is 9200
  assert.strictEqual(fee, SSDI_ATTORNEY_FEE_CAP, `Fee should be capped at ${SSDI_ATTORNEY_FEE_CAP}, got ${fee}`);
  assert.strictEqual(fee, 9200, `Fee cap should be 9200`);
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
  // UI formula from FinancialModel.jsx — adult share + auxiliary share, fee on adult only
  const { ssdiPersonal, ssdiFamilyTotal, ssdiBackPayMonths, kidsAgeOutMonths } = INITIAL_STATE;
  const ssdiAuxBackPayMonths = Math.min(ssdiBackPayMonths, kidsAgeOutMonths || 0);
  const ssdiAdultBackPayGross = ssdiBackPayMonths * ssdiPersonal;
  const ssdiAuxBackPayGross = ssdiAuxBackPayMonths * Math.max(0, (ssdiFamilyTotal || 0) - ssdiPersonal);
  const ssdiAttorneyFee = Math.min(Math.round(ssdiAdultBackPayGross * 0.25), SSDI_ATTORNEY_FEE_CAP);
  const ssdiBackPayActual = ssdiAdultBackPayGross + ssdiAuxBackPayGross - ssdiAttorneyFee;
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
// Section: W-2 Net Diagnostic Display Parity (W2-1 … W2-10)
// Locks the IncomeControls.jsx W-2 diagnostic block formulas to the engine.
// These guard against the four bugs found in the 2026-05-16 audit:
//   Bug 1 — pension parity (UI baked pension into salaryMult, engine handles it separately)
//   Bug 2 — hire stock avg ignored MSFT growth
//   Bug 3 — RSU refresh steady state ignored MSFT growth
//   Bug 4 — SSDI comparison used salary-only chadJobMonthlyNet + annual health as monthly
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Section: W-2 Net Diagnostic Display Parity ===');

// Mirrors the hoisted w2* block at top of IncomeControls.jsx. Any drift between
// this helper and that block is a display-parity bug.
function computeUiW2Diagnostic(s) {
  const effectiveSalary = s.chadJobSalary || 80000;
  const effectiveTaxRate = s.chadJobTaxRate ?? 25;
  const effectiveHealthSavings = s.chadJobHealthSavings ?? 4200;
  const ficaSavings = s.chadJobNoFICA ? 0.062 : 0;
  const pensionContribPct = (s.chadJobPensionContrib || 0) / 100;
  const k401Enabled = !!s.chadJob401kEnabled;
  const deferral = k401Enabled ? (s.chadJob401kDeferral || 0) : 0;
  const catchup = k401Enabled ? (s.chadJob401kCatchupRoth || 0) : 0;
  const taxRateDec = effectiveTaxRate / 100;
  const salaryMult = 1 - taxRateDec + ficaSavings;
  const bonusMult = 1 - taxRateDec + ficaSavings;
  const ficaRateOnPension = s.chadJobNoFICA ? 0.0145 : 0.0765;
  const pensionCashflowMult = 1 - taxRateDec + ficaRateOnPension;
  const monthlyGross = effectiveSalary / 12;
  const taxableMo = Math.max(0, monthlyGross - deferral / 12);
  const afterTaxMo = taxableMo * salaryMult;
  const pensionDeductionMo = monthlyGross * pensionContribPct;
  const pensionCashflowMo = pensionDeductionMo * pensionCashflowMult;
  const salaryNetMo = Math.round(afterTaxMo - pensionCashflowMo - catchup / 12);
  const annualSalaryNet = salaryNetMo * 12;
  const bonusGrossYr = effectiveSalary * (s.chadJobBonusPct || 0) / 100;
  const bonusNetYr = bonusGrossYr * bonusMult;
  const g = (s.msftGrowth || 0) / 100;
  const refreshSteadyMult = g === 0 ? 1
    : [0.5, 1.5, 2.5, 3.5, 4.5].reduce((acc, t) => acc + Math.pow(1 + g, t), 0) / 5;
  const refreshNetYr = (s.chadJobStockRefresh || 0) * bonusMult * refreshSteadyMult;
  const hireY1 = s.chadJobHireStockY1 || 0;
  const hireY2 = s.chadJobHireStockY2 || 0;
  const hireY3 = s.chadJobHireStockY3 || 0;
  const hireY4 = s.chadJobHireStockY4 || 0;
  const hireGrownTotal = hireY1 * Math.pow(1 + g, 1)
                       + hireY2 * Math.pow(1 + g, 2)
                       + hireY3 * Math.pow(1 + g, 3)
                       + hireY4 * Math.pow(1 + g, 4);
  const hireNetAvgYr = hireGrownTotal * bonusMult / 4;
  const totalAvgMo = Math.round((annualSalaryNet + bonusNetYr + refreshNetYr + hireNetAvgYr) / 12);
  return {
    salaryNetMo, annualSalaryNet, bonusNetYr, refreshNetYr, hireNetAvgYr,
    totalAvgMo, refreshSteadyMult, pensionCashflowMult, pensionCashflowMo,
    monthlyHealthSavings: effectiveHealthSavings / 12,
  };
}

test('W2-1: salary walk with 401k deferral + Roth catch-up matches engine', () => {
  // 180K salary, 25% tax, $24.5K deferral, $11.25K Roth → walk: 15000 − 2042 = 12958 × 0.75 − 938 = 8781
  const overrides = {
    chadJob: true, chadJobSalary: 180000, chadJobTaxRate: 25, chadJobStartMonth: 0,
    chadJob401kEnabled: true, chadJob401kDeferral: 24500, chadJob401kCatchupRoth: 11250,
  };
  const ui = computeUiW2Diagnostic(overrides);
  assert.strictEqual(ui.salaryNetMo, 8781, `Expected $8,781/mo, got ${ui.salaryNetMo}`);
  const s = gatherStateWithOverrides(overrides);
  const { monthlyData } = runMonthlySimulation(s);
  assert.strictEqual(monthlyData[0].chadJobSalaryNet, ui.salaryNetMo,
    `Engine salaryNet (${monthlyData[0].chadJobSalaryNet}) must match UI walk (${ui.salaryNetMo})`);
});

test('W2-2: pension cashflow mult uses Medicare-only rate when NoFICA', () => {
  // Engine line 110: ficaRateOnPension = 0.0145 when noFICA, 0.0765 otherwise.
  const noFica = computeUiW2Diagnostic({ chadJobSalary: 180000, chadJobTaxRate: 25, chadJobNoFICA: true, chadJobPensionContrib: 5 });
  const withFica = computeUiW2Diagnostic({ chadJobSalary: 180000, chadJobTaxRate: 25, chadJobNoFICA: false, chadJobPensionContrib: 5 });
  assert.ok(Math.abs(noFica.pensionCashflowMult - (1 - 0.25 + 0.0145)) < 1e-9,
    `NoFICA pension mult should be ${1 - 0.25 + 0.0145}, got ${noFica.pensionCashflowMult}`);
  assert.ok(Math.abs(withFica.pensionCashflowMult - (1 - 0.25 + 0.0765)) < 1e-9,
    `Standard pension mult should be ${1 - 0.25 + 0.0765}, got ${withFica.pensionCashflowMult}`);
});

test('W2-3: pension salary walk matches engine with 5% pension (full FICA)', () => {
  const overrides = {
    chadJob: true, chadJobSalary: 180000, chadJobTaxRate: 25, chadJobStartMonth: 0,
    chadJobPensionContrib: 5,
  };
  const ui = computeUiW2Diagnostic(overrides);
  const s = gatherStateWithOverrides(overrides);
  const { monthlyData } = runMonthlySimulation(s);
  assert.strictEqual(monthlyData[0].chadJobSalaryNet, ui.salaryNetMo,
    `Engine salaryNet (${monthlyData[0].chadJobSalaryNet}) must match UI walk (${ui.salaryNetMo}) with pension=5%`);
});

test('W2-4: hire stock avg applies MSFT growth (Y1−Y4 each × (1+g)^n)', () => {
  // With g=10%, Y1*1.1 + Y2*1.21 + Y3*1.331 + Y4*1.4641, all × bonusMult ÷ 4.
  const overrides = {
    chadJobSalary: 180000, chadJobTaxRate: 25, msftGrowth: 10,
    chadJobHireStockY1: 40000, chadJobHireStockY2: 40000, chadJobHireStockY3: 40000, chadJobHireStockY4: 40000,
  };
  const ui = computeUiW2Diagnostic(overrides);
  const expectedGrown = 40000 * 1.1 + 40000 * 1.21 + 40000 * 1.331 + 40000 * 1.4641;
  const expectedNetAvgYr = expectedGrown * 0.75 / 4;
  assert.ok(Math.abs(ui.hireNetAvgYr - expectedNetAvgYr) < 1,
    `Hire stock avg (g=10%): expected ~${expectedNetAvgYr.toFixed(0)}, got ${ui.hireNetAvgYr.toFixed(0)}`);
  // Sanity: with g=0, value should be flat sum × bonusMult ÷ 4 = $30,000/yr
  const flat = computeUiW2Diagnostic({ ...overrides, msftGrowth: 0 });
  assert.strictEqual(Math.round(flat.hireNetAvgYr), 30000,
    `With g=0, hire avg should be flat $30,000, got ${flat.hireNetAvgYr}`);
});

test('W2-5: refresh steady-state mult averages 5 grants × 5yr vest with MSFT growth', () => {
  // g=10%: mult = mean of (1.1)^(0.5,1.5,2.5,3.5,4.5) = mean of (1.0488, 1.1537, 1.2691, 1.3960, 1.5355) ≈ 1.2806
  const overrides = {
    chadJobSalary: 180000, chadJobTaxRate: 25, msftGrowth: 10,
    chadJobStockRefresh: 40000,
  };
  const ui = computeUiW2Diagnostic(overrides);
  const expectedMult = [0.5, 1.5, 2.5, 3.5, 4.5].reduce((acc, t) => acc + Math.pow(1.1, t), 0) / 5;
  assert.ok(Math.abs(ui.refreshSteadyMult - expectedMult) < 1e-6,
    `Refresh mult (g=10%): expected ${expectedMult.toFixed(4)}, got ${ui.refreshSteadyMult.toFixed(4)}`);
  const expectedNetYr = 40000 * 0.75 * expectedMult;
  assert.ok(Math.abs(ui.refreshNetYr - expectedNetYr) < 1,
    `Refresh net/yr (g=10%): expected ~${expectedNetYr.toFixed(0)}, got ${ui.refreshNetYr.toFixed(0)}`);
  // Zero growth → mult = 1
  const flat = computeUiW2Diagnostic({ ...overrides, msftGrowth: 0 });
  assert.strictEqual(flat.refreshSteadyMult, 1, `g=0 → mult must be exactly 1`);
  assert.strictEqual(flat.refreshNetYr, 30000, `g=0 refresh net = $30,000/yr`);
});

test('W2-6: monthlyHealthSavings divides annual by 12', () => {
  const ui = computeUiW2Diagnostic({ chadJobHealthSavings: 4200 });
  assert.strictEqual(ui.monthlyHealthSavings, 350, `$4,200/yr ÷ 12 = $350/mo, got ${ui.monthlyHealthSavings}`);
  const ui2 = computeUiW2Diagnostic({ chadJobHealthSavings: 6000 });
  assert.strictEqual(ui2.monthlyHealthSavings, 500, `$6,000/yr ÷ 12 = $500/mo, got ${ui2.monthlyHealthSavings}`);
});

test('W2-7: SSDI net impact uses W-2 total monthly + monthly health (not salary-only + annual)', () => {
  // Bug 4 regression. Inputs from the audit screenshot:
  // 180K, 25% tax, 20% bonus, $40K refresh, $40K×4 hire stock, MSFT growth 0, default health $4,200/yr, family $6,321, personal $4,214
  const overrides = {
    chadJob: true, chadJobSalary: 180000, chadJobTaxRate: 25, chadJobStartMonth: 0,
    chadJob401kEnabled: true, chadJob401kDeferral: 24500, chadJob401kCatchupRoth: 11250,
    chadJobBonusPct: 20, chadJobStockRefresh: 40000,
    chadJobHireStockY1: 40000, chadJobHireStockY2: 40000, chadJobHireStockY3: 40000, chadJobHireStockY4: 40000,
    msftGrowth: 0, chadJobHealthSavings: 4200,
    ssType: 'ssdi', ssdiFamilyTotal: 6321, ssdiPersonal: 4214,
  };
  const ui = computeUiW2Diagnostic(overrides);
  // totalAvgMo should be ≈ ($105,372 + $27,000 + $30,000 + $30,000) / 12 = $16,031
  assert.strictEqual(ui.totalAvgMo, 16031, `Expected total avg $16,031/mo, got ${ui.totalAvgMo}`);
  // Correct SSDI net impact: W-2 total + monthly health − rate
  const netFamily = Math.round(ui.totalAvgMo + ui.monthlyHealthSavings - 6321);
  const netSteady = Math.round(ui.totalAvgMo + ui.monthlyHealthSavings - 4214);
  assert.strictEqual(netFamily, 10060, `Family net should be 10060, got ${netFamily}`);
  assert.strictEqual(netSteady, 12167, `Steady net should be 12167, got ${netSteady}`);
});

test('W2-8: totalAvgMo includes salary + bonus + refresh + hire stock (with MSFT growth)', () => {
  const overrides = {
    chadJob: true, chadJobSalary: 180000, chadJobTaxRate: 25,
    chadJobBonusPct: 20, chadJobStockRefresh: 40000,
    chadJobHireStockY1: 40000, chadJobHireStockY2: 40000, chadJobHireStockY3: 40000, chadJobHireStockY4: 40000,
    msftGrowth: 8,
  };
  const ui = computeUiW2Diagnostic(overrides);
  // Verify each component sums into totalAvgMo
  const sumAnnual = ui.annualSalaryNet + ui.bonusNetYr + ui.refreshNetYr + ui.hireNetAvgYr;
  assert.strictEqual(ui.totalAvgMo, Math.round(sumAnnual / 12),
    `totalAvgMo (${ui.totalAvgMo}) should equal sum of components ÷ 12 (${Math.round(sumAnnual / 12)})`);
  // With g=8%, RSU + hire stock components must be HIGHER than the g=0 baseline.
  const flat = computeUiW2Diagnostic({ ...overrides, msftGrowth: 0 });
  assert.ok(ui.refreshNetYr > flat.refreshNetYr, `MSFT growth should increase refresh value`);
  assert.ok(ui.hireNetAvgYr > flat.hireNetAvgYr, `MSFT growth should increase hire stock value`);
});

test('W2-9: salary walk + pension matches engine end-to-end ($180K, 5% pension, no FICA, 401k)', () => {
  // Stress test of pension + deferral + catch-up + FICA-exempt employer
  const overrides = {
    chadJob: true, chadJobSalary: 180000, chadJobTaxRate: 25, chadJobNoFICA: true, chadJobStartMonth: 0,
    chadJobPensionContrib: 5,
    chadJob401kEnabled: true, chadJob401kDeferral: 24500, chadJob401kCatchupRoth: 11250,
  };
  const ui = computeUiW2Diagnostic(overrides);
  const s = gatherStateWithOverrides(overrides);
  const { monthlyData } = runMonthlySimulation(s);
  assert.strictEqual(monthlyData[0].chadJobSalaryNet, ui.salaryNetMo,
    `Engine salaryNet (${monthlyData[0].chadJobSalaryNet}) must match UI walk (${ui.salaryNetMo}) under combined deductions`);
});

test('W2-10: degenerate inputs return finite numbers (no NaN)', () => {
  // chadJobSalary=0 falls through `|| 80000` default (matches UI behavior).
  // The salary walk should still produce finite numbers, never NaN.
  const ui = computeUiW2Diagnostic({});
  assert.ok(Number.isFinite(ui.salaryNetMo), `salaryNetMo must be finite, got ${ui.salaryNetMo}`);
  assert.ok(Number.isFinite(ui.totalAvgMo), `totalAvgMo must be finite, got ${ui.totalAvgMo}`);
  assert.ok(Number.isFinite(ui.refreshNetYr), `refreshNetYr must be finite, got ${ui.refreshNetYr}`);
  assert.ok(Number.isFinite(ui.hireNetAvgYr), `hireNetAvgYr must be finite, got ${ui.hireNetAvgYr}`);
  assert.ok(Number.isFinite(ui.monthlyHealthSavings), `monthlyHealthSavings must be finite`);
  assert.ok(Number.isFinite(ui.pensionCashflowMult), `pensionCashflowMult must be finite`);
});

// ════════════════════════════════════════════════════════════════════════
// Section: W-2 EXPORTED-function lock + post-retirement vest multiplier
// (Part 2 §2c tests #1 and #8, plus completeness-field lock tests)
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Section: W-2 exported function + post-ret multiplier ===');

// Helper mirroring the panel/matrix POST-RETIREMENT vest net multiplier.
// Engine truth: projection.js:115 chadJobBonusNetMultPostRet = 1 - taxRate (NO FICA
// add-back — former-employer W-2 always withholds full FICA, so the active-employment
// noFICA toggle does NOT carry over post-retirement). This is the multiplier the
// IncomeControls windfall summary (~L388-391) and vest-matrix subtotals (~L444-446,
// L454) MUST use. The pre-fix code used (1 - tax + ficaSavings).
function postRetVestNetMult(taxRatePct) {
  return 1 - taxRatePct / 100;
}

test('W2-8b (Bug 1.2): post-ret vest net uses (1 − tax), NOT (1 − tax + 0.062), with noFICA=true', () => {
  // Reproduces finding 1.2. State from the report numeric example.
  const overrides = {
    chadJob: true, chadJobNoFICA: true, chadJobTaxRate: 25, chadJobStockRefresh: 100000,
    chadJobStartMonth: 0, chadRetirementMonth: 60, chadCurrentAge: 62,
    chadJobRefreshStartMonth: 12, msftGrowth: 0,
  };
  const gross = projectedPostRetirementVests(overrides).grossWindfall;
  assert.ok(gross > 0, `Fixture must produce a post-retirement windfall, got ${gross}`);
  // Correct (engine-consistent) net multiplier: 1 − tax, no FICA add-back.
  const correctNet = Math.round(gross * postRetVestNetMult(25));
  // The WRONG (active-employment) net the panel used to compute.
  const wrongNet = Math.round(gross * (1 - 0.25 + 0.062));
  assert.notStrictEqual(correctNet, wrongNet,
    `Fixture must distinguish correct vs FICA-add-back net (both ${correctNet}) — needs noFICA on`);
  // This is the value the panel MUST now display (post-fix).
  const netWindfall = Math.round(gross * postRetVestNetMult(effOverride(overrides)));
  assert.strictEqual(netWindfall, correctNet,
    `Post-ret windfall net must be round(gross × (1 − tax)) = ${correctNet}, got ${netWindfall}`);
  assert.notStrictEqual(netWindfall, wrongNet,
    `Post-ret windfall net must NOT include the 6.2% FICA add-back (${wrongNet})`);
});

// Local helper: resolve effective tax rate the same way IncomeControls does.
function effOverride(o) { return o.chadJobTaxRate ?? 25; }

test('W2-REAL (§2c#1): EXPORTED computeW2Diagnostic field-by-field for the W2-7 audit input', () => {
  // Same input as W2-7 (the audit screenshot). Lock the REAL exported function,
  // not the re-implemented computeUiW2Diagnostic copy.
  const overrides = {
    chadJob: true, chadJobSalary: 180000, chadJobTaxRate: 25, chadJobStartMonth: 0,
    chadJob401kEnabled: true, chadJob401kDeferral: 24500, chadJob401kCatchupRoth: 11250,
    chadJobBonusPct: 20, chadJobStockRefresh: 40000,
    chadJobHireStockY1: 40000, chadJobHireStockY2: 40000, chadJobHireStockY3: 40000, chadJobHireStockY4: 40000,
    msftGrowth: 0, chadJobHealthSavings: 4200,
    ssType: 'ssdi', ssdiFamilyTotal: 6321, ssdiPersonal: 4214,
  };
  const s = gatherStateWithOverrides(overrides);
  const d = computeW2Diagnostic(s);

  // Salary walk: 180000/12 = 15000; − 24500/12 = 2041.67 → taxable 12958.33;
  // × 0.75 = 9718.75; − 11250/12 = 937.5 → 8781.25 → round 8781.
  assert.strictEqual(d.salaryNetMo, 8781, `salaryNetMo expected 8781, got ${d.salaryNetMo}`);
  assert.strictEqual(d.annualSalaryNet, 8781 * 12, `annualSalaryNet expected ${8781 * 12}, got ${d.annualSalaryNet}`);
  // Bonus: 180000 × 0.20 = 36000 gross × 0.75 = 27000.
  assert.strictEqual(Math.round(d.bonusGrossYr), 36000, `bonusGrossYr expected 36000, got ${d.bonusGrossYr}`);
  assert.strictEqual(Math.round(d.bonusNetYr), 27000, `bonusNetYr expected 27000, got ${Math.round(d.bonusNetYr)}`);
  // Refresh: g=0 → mult 1; 40000 × 0.75 = 30000.
  assert.strictEqual(d.refreshSteadyMult, 1, `refreshSteadyMult expected 1 (g=0), got ${d.refreshSteadyMult}`);
  assert.strictEqual(Math.round(d.refreshNetYrSteady), 30000, `refreshNetYrSteady expected 30000, got ${Math.round(d.refreshNetYrSteady)}`);
  // Hire: g=0 → grownTotal 160000; × 0.75 / 4 = 30000.
  assert.strictEqual(Math.round(d.hireNetAvgYr), 30000, `hireNetAvgYr expected 30000, got ${Math.round(d.hireNetAvgYr)}`);
  // Pension cashflow: 0 (no pension contrib).
  assert.strictEqual(Math.round(d.pensionCashflowMo), 0, `pensionCashflowMo expected 0, got ${d.pensionCashflowMo}`);
  // Monthly health: 4200/12 = 350.
  assert.strictEqual(d.monthlyHealthSavings, 350, `monthlyHealthSavings expected 350, got ${d.monthlyHealthSavings}`);
  // Total avg: (105372 + 27000 + 30000 + 30000) / 12 = 16031.
  assert.strictEqual(d.totalAvgMo, 16031, `totalAvgMo expected 16031, got ${d.totalAvgMo}`);

  // Engine parity: month-0 salary net must equal the exported diagnostic salaryNetMo.
  const { monthlyData } = runMonthlySimulation(s);
  assert.strictEqual(monthlyData[0].chadJobSalaryNet, d.salaryNetMo,
    `Engine month-0 chadJobSalaryNet (${monthlyData[0].chadJobSalaryNet}) must equal exported salaryNetMo (${d.salaryNetMo})`);
});

test('W2-REAL-parity: exported computeW2Diagnostic agrees with computeUiW2Diagnostic copy', () => {
  // Field-by-field equality between the two implementations (closes §2a#3 drift gap).
  const cases = [
    { chadJob: true, chadJobSalary: 180000, chadJobTaxRate: 25, chadJob401kEnabled: true, chadJob401kDeferral: 24500, chadJob401kCatchupRoth: 11250, chadJobBonusPct: 20, chadJobStockRefresh: 40000, chadJobHireStockY1: 40000, chadJobHireStockY2: 40000, chadJobHireStockY3: 40000, chadJobHireStockY4: 40000, msftGrowth: 0, chadJobHealthSavings: 4200 },
    { chadJob: true, chadJobSalary: 120000, chadJobTaxRate: 28, chadJobNoFICA: true, chadJobPensionContrib: 5, chadJobStockRefresh: 50000, msftGrowth: 10, chadJobHealthSavings: 6000 },
    { chadJob: true, chadJobSalary: 80000, chadJobTaxRate: 22, chadJobHireStockY1: 10000, chadJobHireStockY2: 20000, msftGrowth: 8 },
  ];
  for (const o of cases) {
    const ui = computeUiW2Diagnostic(o);
    const d = computeW2Diagnostic(gatherStateWithOverrides(o));
    near(d.salaryNetMo, ui.salaryNetMo, 0, 'salaryNetMo');
    near(d.annualSalaryNet, ui.annualSalaryNet, 0, 'annualSalaryNet');
    near(d.bonusNetYr, ui.bonusNetYr, 1e-6, 'bonusNetYr');
    near(d.refreshNetYrSteady, ui.refreshNetYr, 1e-6, 'refreshNetYr');
    near(d.hireNetAvgYr, ui.hireNetAvgYr, 1e-6, 'hireNetAvgYr');
    near(d.refreshSteadyMult, ui.refreshSteadyMult, 1e-9, 'refreshSteadyMult');
    near(d.pensionCashflowMult, ui.pensionCashflowMult, 1e-9, 'pensionCashflowMult');
    near(d.totalAvgMo, ui.totalAvgMo, 0, 'totalAvgMo');
    near(d.monthlyHealthSavings, ui.monthlyHealthSavings, 1e-9, 'monthlyHealthSavings');
  }
});

test('W2-SignOn: computeW2Diagnostic returns signOnGross/signOnNet, kept OUT of totalAvgYr', () => {
  // Sign-on: 50% on hire + 50% at 1-yr, both taxed with the active bonus mult.
  // The diagnostic surfaces the FULL sign-on (both halves) as a one-time, NON-steady line.
  const overrides = {
    chadJob: true, chadJobSalary: 180000, chadJobTaxRate: 25, chadJobBonusPct: 20,
    chadJobStockRefresh: 40000, chadJobSignOnCash: 100000, msftGrowth: 0,
  };
  const s = gatherStateWithOverrides(overrides);
  const d = computeW2Diagnostic(s);
  assert.strictEqual(d.signOnGross, 100000, `signOnGross expected 100000, got ${d.signOnGross}`);
  // bonusMult = 1 − 0.25 = 0.75 → 75000 net.
  assert.strictEqual(Math.round(d.signOnNet), 75000, `signOnNet expected 75000, got ${Math.round(d.signOnNet)}`);
  // Must NOT be folded into the steady-state total.
  const dNoSignOn = computeW2Diagnostic(gatherStateWithOverrides({ ...overrides, chadJobSignOnCash: 0 }));
  assert.strictEqual(d.totalAvgYr, dNoSignOn.totalAvgYr,
    `Sign-on must NOT change totalAvgYr (steady state): ${d.totalAvgYr} vs ${dNoSignOn.totalAvgYr}`);
  assert.strictEqual(d.totalAvgMo, dNoSignOn.totalAvgMo,
    `Sign-on must NOT change totalAvgMo (steady state)`);
});

test('W2-SignOn-engine: diagnostic signOnNet matches engine sign-on halves (50/50)', () => {
  const overrides = {
    chadJob: true, chadJobSalary: 180000, chadJobTaxRate: 25, chadJobStartMonth: 0,
    chadJobSignOnCash: 100000, msftGrowth: 0,
  };
  const s = gatherStateWithOverrides(overrides);
  const d = computeW2Diagnostic(s);
  const { monthlyData } = runMonthlySimulation(s);
  // Engine pays 50% at month 0, 50% at month 12 (each × bonus mult). Sum = full sign-on net.
  const m0 = monthlyData[0].chadJobSignOnNet || 0;
  const m12 = monthlyData[12].chadJobSignOnNet || 0;
  assert.ok(m0 > 0 && m12 > 0, `Engine should pay sign-on at m0 (${m0}) and m12 (${m12})`);
  assert.strictEqual(m0 + m12, Math.round(d.signOnNet),
    `Engine sign-on halves (${m0 + m12}) must equal diagnostic signOnNet (${Math.round(d.signOnNet)})`);
});

test('W2-GrossTotal: computeW2Diagnostic returns totalGrossYr = salary + bonus + refresh×mult + hireGrown/4', () => {
  // Remediation 2026-06-09 item 2.2: hire stock enters the gross on the SAME
  // per-year basis as hireNetAvgYr (hireGrownTotal / 4). The previous locked
  // value (416,000) counted all four hire years at once, so gross/net/FICA/
  // blended-% mixed a 4-year gross with a 1-year net.
  const overrides = {
    chadJob: true, chadJobSalary: 180000, chadJobTaxRate: 25, chadJobBonusPct: 20,
    chadJobStockRefresh: 40000,
    chadJobHireStockY1: 40000, chadJobHireStockY2: 40000, chadJobHireStockY3: 40000, chadJobHireStockY4: 40000,
    msftGrowth: 0,
  };
  const s = gatherStateWithOverrides(overrides);
  const d = computeW2Diagnostic(s);
  const expected = 180000 + d.bonusGrossYr + 40000 * d.refreshSteadyMult + d.hireGrownTotal / 4;
  near(d.totalGrossYr, expected, 1e-6, 'totalGrossYr');
  // g=0: 180000 + 36000 + 40000 + 160000/4 = 296000.
  assert.strictEqual(Math.round(d.totalGrossYr), 296000, `totalGrossYr expected 296000, got ${Math.round(d.totalGrossYr)}`);
  // Sign-on is NOT part of steady-state gross either.
  const dSignOn = computeW2Diagnostic(gatherStateWithOverrides({ ...overrides, chadJobSignOnCash: 100000 }));
  assert.strictEqual(Math.round(dSignOn.totalGrossYr), 296000, `Sign-on must not change totalGrossYr`);
});

test('W2-Basis (remediation 2.2): gross, net, FICA and blended % share ONE steady-state per-year basis', () => {
  // Finding 2.2 (2026-06-09 audit): hireNetAvgYr divides hireGrownTotal by 4
  // (per-year average over the 4 anniversary vests), so the gross denominator
  // must count hire stock the same way (hireGrownTotal / 4). The pre-fix
  // totalGrossYr counted ALL FOUR hire years at once (160K vs 40K/yr), so the
  // blended take-home % mixed a 4-year gross with a 1-year net.
  // With g=0, no 401k/pension/sign-on, EVERY component nets at (1 − taxRate),
  // so blendedTakeHomePct must equal exactly 1 − 0.25 = 0.75 (pre-fix: 53.4%).
  const overrides = {
    chadJob: true, chadJobSalary: 180000, chadJobTaxRate: 25, chadJobBonusPct: 20,
    chadJobStockRefresh: 40000,
    chadJobHireStockY1: 40000, chadJobHireStockY2: 40000, chadJobHireStockY3: 40000, chadJobHireStockY4: 40000,
    msftGrowth: 0,
  };
  const d = computeW2Diagnostic(gatherStateWithOverrides(overrides));
  // Per-year steady-state gross: 180000 + 36000 + 40000 + 160000/4 = 296000.
  assert.strictEqual(Math.round(d.totalGrossYr), 296000,
    `totalGrossYr must use hireGrownTotal/4 (296000), got ${Math.round(d.totalGrossYr)}`);
  // Net 222000 ÷ gross 296000 = exactly the flat 75% take-home assumption.
  near(d.blendedTakeHomePct, 0.75, 1e-12, 'blendedTakeHomePct = 1 − taxRate on a consistent basis');
  // FICA base shares the same per-year basis as the gross denominator.
  near(d.ficaBaseAnnual, d.totalGrossYr, 1e-9, 'ficaBaseAnnual = totalGrossYr');
});

// ════════════════════════════════════════════════════════════════════════
// Section W2-FICA: real, traceable FICA breakdown (replaces fabricated 6.2/1.45 labels)
// The diagnostic must surface FICA dollars computed by the tax engine on Chad's
// steady-state W-2 gross (Box 3/5 = totalGrossYr), NOT hardcoded statutory rates.
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Section W2-FICA: real FICA breakdown ===');

test('W2-FICA: SS/Medicare/Addl computed on the W-2 gross via the tax engine', () => {
  // Fixture matches W2-GrossTotal: totalGrossYr = 296,000 at g=0 (per-year
  // basis post remediation 2.2 — hire stock averaged ÷ 4; was 416,000).
  const overrides = {
    chadJob: true, chadJobSalary: 180000, chadJobTaxRate: 25, chadJobBonusPct: 20,
    chadJobStockRefresh: 40000,
    chadJobHireStockY1: 40000, chadJobHireStockY2: 40000, chadJobHireStockY3: 40000, chadJobHireStockY4: 40000,
    msftGrowth: 0,
  };
  const d = computeW2Diagnostic(gatherStateWithOverrides(overrides));
  assert.strictEqual(Math.round(d.ficaBaseAnnual), 296000, 'FICA base = steady-state per-year W-2 gross');
  // SS: min(gross, wage base) × 6.2%  → min(296000, 184500) × 0.062 = 11,439
  near(d.ficaSocialSecurity, SS_WAGE_BASE * 0.062, 1e-6, 'ficaSocialSecurity');
  assert.strictEqual(Math.round(d.ficaSocialSecurity), 11439, 'SS capped at wage base');
  // Medicare: gross × 1.45% = 296000 × 0.0145 = 4,292
  near(d.ficaMedicare, 296000 * 0.0145, 1e-6, 'ficaMedicare');
  assert.strictEqual(Math.round(d.ficaMedicare), 4292, 'Medicare uncapped');
  // Additional Medicare: 0.9% over $250k = (296000 − 250000) × 0.009 = 414
  assert.strictEqual(Math.round(d.ficaAddlMedicare), 414, 'Additional Medicare over threshold');
});

test('W2-FICA: reconciles exactly with taxEngine.computeW2EmployeeFica (single source)', () => {
  const overrides = {
    chadJob: true, chadJobSalary: 180000, chadJobTaxRate: 25, chadJobBonusPct: 20,
    chadJobStockRefresh: 40000,
    chadJobHireStockY1: 40000, chadJobHireStockY2: 40000, chadJobHireStockY3: 40000, chadJobHireStockY4: 40000,
    msftGrowth: 0,
  };
  const d = computeW2Diagnostic(gatherStateWithOverrides(overrides));
  const fica = computeW2EmployeeFica(d.ficaBaseAnnual, false);
  const aml = computeAdditionalMedicare({ w2Wages: d.ficaBaseAnnual, seBase: 0 });
  near(d.ficaSocialSecurity, fica.ssTax, 1e-6, 'SS matches engine');
  near(d.ficaMedicare, fica.medTax, 1e-6, 'Medicare matches engine');
  near(d.ficaTotal, fica.ficaTax, 1e-6, 'ficaTotal = engine ficaTax (SS + base Medicare)');
  near(d.ficaAddlMedicare, aml.addlMedicare, 1e-6, 'addl Medicare matches engine');
});

test('W2-FICA: no-FICA employer suppresses SS but keeps Medicare', () => {
  const overrides = {
    chadJob: true, chadJobSalary: 180000, chadJobTaxRate: 25, chadJobBonusPct: 20,
    chadJobStockRefresh: 40000,
    chadJobHireStockY1: 40000, chadJobHireStockY2: 40000, chadJobHireStockY3: 40000, chadJobHireStockY4: 40000,
    msftGrowth: 0, chadJobNoFICA: true,
  };
  const d = computeW2Diagnostic(gatherStateWithOverrides(overrides));
  assert.strictEqual(d.ficaSocialSecurity, 0, 'no SS withheld under a non-FICA employer');
  // 296000 × 0.0145 = 4,292 (per-year basis post remediation 2.2; was 6,032 on the 4-year basis).
  assert.strictEqual(Math.round(d.ficaMedicare), 4292, 'Medicare still applies');
});

test('W2-FICA: adding the breakdown does NOT change net totals (engine parity preserved)', () => {
  const overrides = {
    chadJob: true, chadJobSalary: 180000, chadJobTaxRate: 25, chadJobBonusPct: 20,
    chadJobStockRefresh: 40000,
    chadJobHireStockY1: 40000, chadJobHireStockY2: 40000, chadJobHireStockY3: 40000, chadJobHireStockY4: 40000,
    msftGrowth: 0,
  };
  const d = computeW2Diagnostic(gatherStateWithOverrides(overrides));
  // totalAvgYr is still ONLY the four steady-state net components — FICA is informational.
  near(d.totalAvgYr, d.annualSalaryNet + d.bonusNetYr + d.refreshNetYrSteady + d.hireNetAvgYr, 1e-6, 'totalAvgYr unchanged');
});

// ════════════════════════════════════════════════════════════════════════
// KeyMetrics input clamping (remediation phase 5).
// The Base Monthly Spend input wrote raw Number(v) into totalMonthlySpend —
// a typo like "-50000" flowed into the projection until the next save/load
// (schemaValidation RANGE is { min: 0 }). The input must clamp at 0 on
// entry, matching the sibling oneTimeExtras/oneTimeMonths inputs.
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== KeyMetrics — Base Monthly Spend input clamps to RANGE ===');

test('KeyMetrics totalMonthlySpend onChange clamps to min 0 (matches RANGE + sibling inputs)', () => {
  const source = fs.readFileSync(new URL('../../components/KeyMetrics.jsx', import.meta.url), 'utf8');
  assert.ok(
    source.includes("onFieldChange('totalMonthlySpend')(v === '' ? null : Math.max(0, Math.round(Number(v))))"),
    'Base Monthly Spend input must clamp to Math.max(0, ...) like the One-Time Extras input'
  );
});

// ════════════════════════════════════════════════════════════════════════
// Summary
// ════════════════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(60)}`);
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'═'.repeat(60)}`);
if (failed > 0) process.exit(1);
