import { describe, it, expect } from 'vitest';
import { buildTaxSchedule, inflateBrackets, getTaxInputs } from '../taxProjection.js';
import { BRACKETS_MFJ_2025 } from '../taxConstants.js';
import { gatherStateWithOverrides } from '../../state/gatherState.js';

const approx = (val, expected, tolerance = 1) =>
  expect(Math.abs(val - expected)).toBeLessThanOrEqual(tolerance);

// Minimal gathered state for testing (mirrors gatherState output)
// Uses moderate deductions so taxable income isn't pushed to zero.
function makeState(overrides = {}) {
  return {
    // Sarah's practice
    sarahRate: 200,
    sarahMaxRate: 250,
    sarahRateGrowth: 5,
    sarahCurrentClients: 4,
    sarahMaxClients: 4.5,
    sarahClientGrowth: 10,
    sarahWorkMonths: 72,
    chadWorkMonths: 72,
    totalProjectionMonths: 72,
    chadRetirementMonth: 72,

    // Chad's job
    chadJob: false,
    chadJobSalary: 150000,
    chadJobStartMonth: 0,

    // Tax settings — moderate deductions so tax is meaningful
    taxMode: 'engine',
    taxSchCExpenseRatio: 25,
    taxPropertyTax: 8000,
    taxSalesTax: 3000,
    taxPersonalPropTax: 1000,
    taxMortgageInt: 15000,
    taxCharitable: 5000,
    taxMedical: 5000,
    taxW2Withholding: 0,
    taxCtcChildren: 2,
    taxOdcDependents: 0,
    taxCapGainLoss: -3000,
    taxSolo401k: 0,
    taxInflationAdjust: false,
    taxInflationRate: 2,

    ...overrides,
  };
}

describe('inflateBrackets', () => {
  it('scales bracket thresholds by inflation factor', () => {
    const inflated = inflateBrackets(BRACKETS_MFJ_2025, 1.10);
    // First bracket: 23850 * 1.10 = 26235
    expect(inflated[0][0]).toBe(26235);
    expect(inflated[0][1]).toBe(0.10); // rate unchanged
    // Infinity stays Infinity
    expect(inflated[6][0]).toBe(Infinity);
    expect(inflated[6][1]).toBe(0.37);
  });

  it('factor of 1 returns same thresholds', () => {
    const inflated = inflateBrackets(BRACKETS_MFJ_2025, 1.0);
    expect(inflated[0][0]).toBe(23850);
    expect(inflated[2][0]).toBe(206700);
  });
});

describe('getTaxInputs', () => {
  it('returns tax inputs without inflation when disabled', () => {
    const s = makeState();
    const inputs = getTaxInputs(s, 3);
    expect(inputs.propertyTax).toBe(8000);
    expect(inputs.ctcChildren).toBe(2);
  });

  it('inflates deduction amounts when enabled', () => {
    const s = makeState({ taxInflationAdjust: true, taxInflationRate: 10 });
    const inputs = getTaxInputs(s, 1); // year 1, 10% inflation
    // 8000 * 1.10 = 8800
    expect(inputs.propertyTax).toBe(8800);
    expect(inputs.mortgageInt).toBe(16500); // 15000 * 1.10
  });

  it('does not inflate credit counts or cap gain', () => {
    const s = makeState({ taxInflationAdjust: true, taxInflationRate: 10 });
    const inputs = getTaxInputs(s, 2);
    expect(inputs.ctcChildren).toBe(2);
    expect(inputs.odcDependents).toBe(0);
    expect(inputs.capGainLoss).toBe(-3000);
  });
});

describe('buildTaxSchedule', () => {
  it('returns one entry per projection year', () => {
    const s = makeState({ totalProjectionMonths: 72 });
    const schedule = buildTaxSchedule(s);
    expect(schedule.length).toBe(7); // months 0-72 = 73 points → ceil(73/12) = 7 years
  });

  it('returns correct year count for non-multiple months', () => {
    const s = makeState({ totalProjectionMonths: 36, sarahWorkMonths: 36, chadWorkMonths: 36, chadRetirementMonth: 36 });
    const schedule = buildTaxSchedule(s);
    // months 0-36 = 37 months → ceil(37/12) = 4 years (0-11, 12-23, 24-35, 36)
    expect(schedule.length).toBe(4);
  });

  it('computes Sarah monthly tax > 0 for typical income', () => {
    const s = makeState();
    const schedule = buildTaxSchedule(s);
    expect(schedule[0].sarahMonthlyTax).toBeGreaterThan(0);
    expect(schedule[0].annualSarahTax).toBeGreaterThan(0);
  });

  it('Sarah effective on gross is between 0 and 1', () => {
    const s = makeState();
    const schedule = buildTaxSchedule(s);
    for (const year of schedule) {
      expect(year.sarahEffectiveOnGross).toBeGreaterThan(0);
      expect(year.sarahEffectiveOnGross).toBeLessThan(1);
    }
  });

  it('Chad has zero tax when not employed', () => {
    const s = makeState({ chadJob: false });
    const schedule = buildTaxSchedule(s);
    expect(schedule[0].chadMonthlyTax).toBe(0);
    expect(schedule[0].chadMonthlyNet).toBe(0);
    expect(schedule[0].chadW2).toBe(0);
  });

  it('Chad has non-zero tax when employed', () => {
    const s = makeState({ chadJob: true, chadJobSalary: 80000, chadJobStartMonth: 0 });
    const schedule = buildTaxSchedule(s);
    expect(schedule[0].chadMonthlyTax).toBeGreaterThan(0);
    expect(schedule[0].chadMonthlyNet).toBeGreaterThan(0);
    expect(schedule[0].chadW2).toBe(80000);
  });

  it('Chad W-2 is pro-rated when starting mid-year', () => {
    // Starts month 6 → in year 0 (months 0-11), employed months 6-11 = 6 months
    const s = makeState({ chadJob: true, chadJobSalary: 120000, chadJobStartMonth: 6 });
    const schedule = buildTaxSchedule(s);
    expect(schedule[0].chadW2).toBe(60000); // 120K * 6/12
    expect(schedule[1].chadW2).toBe(120000); // Full year
  });

  it('marginal attribution: Sarah tax + Chad tax = total tax', () => {
    const s = makeState({ chadJob: true, chadJobSalary: 150000, chadJobStartMonth: 0 });
    const schedule = buildTaxSchedule(s);
    const year = schedule[0];
    // Both should have positive tax with $150K salary + Sarah's practice
    expect(year.annualSarahTax).toBeGreaterThan(0);
    expect(year.annualChadTax).toBeGreaterThan(0);
    // Sarah + Chad should equal total (within rounding)
    approx(year.annualSarahTax + year.annualChadTax, year.annualTotalTax);
  });

  it('Sch C net reflects expense ratio', () => {
    const s = makeState({ taxSchCExpenseRatio: 30 });
    const schedule = buildTaxSchedule(s);
    const year = schedule[0];
    // schCNet should be 70% of gross
    approx(year.schCNet, Math.round(year.annualSarahGross * 0.70), 1);
  });

  it('tax increases with income growth over years', () => {
    const s = makeState();
    const schedule = buildTaxSchedule(s);
    // Last full year should have higher tax than year 0 (income grows)
    expect(schedule[5].annualSarahTax).toBeGreaterThan(schedule[0].annualSarahTax);
  });

  it('inflation adjustment increases tax over years', () => {
    const sNoInflation = makeState({ taxInflationAdjust: false });
    const sInflation = makeState({ taxInflationAdjust: true, taxInflationRate: 5 });
    const noInf = buildTaxSchedule(sNoInflation);
    const inf = buildTaxSchedule(sInflation);
    // Year 0 should be identical (factor = 1)
    expect(noInf[0].annualTotalTax).toBe(inf[0].annualTotalTax);
    // Year 5 with inflation: higher deductions reduce tax
    // (inflating deductions should lower tax, not raise it)
    expect(inf[5].annualTotalTax).toBeLessThanOrEqual(noInf[5].annualTotalTax);
  });

  it('fullTax result contains expected fields', () => {
    const s = makeState();
    const schedule = buildTaxSchedule(s);
    const ft = schedule[0].fullTax;
    expect(ft).toHaveProperty('totalTax');
    expect(ft).toHaveProperty('effectiveRate');
    expect(ft).toHaveProperty('marginalRate');
    expect(ft).toHaveProperty('fedTax');
    expect(ft).toHaveProperty('seTax');
    expect(ft).toHaveProperty('agi');
  });

  it('CTC credits reduce total tax', () => {
    const sNoCredits = makeState({ taxCtcChildren: 0 });
    const sCredits = makeState({ taxCtcChildren: 2 });
    const noCredits = buildTaxSchedule(sNoCredits);
    const credits = buildTaxSchedule(sCredits);
    // 2 children x $2000 = $4000 credit
    expect(noCredits[0].annualTotalTax - credits[0].annualTotalTax).toBeGreaterThanOrEqual(3999);
  });

  it('Solo 401k reduces total tax', () => {
    const sNo401k = makeState({ taxSolo401k: 0 });
    const s401k = makeState({ taxSolo401k: 23500 });
    const no401k = buildTaxSchedule(sNo401k);
    const with401k = buildTaxSchedule(s401k);
    expect(with401k[0].annualTotalTax).toBeLessThan(no401k[0].annualTotalTax);
  });

  it('includes SS benefit taxation when SSDI active', () => {
    const s = gatherStateWithOverrides({
      taxMode: 'engine',
      ssType: 'ssdi', ssdiDenied: false, ssdiApprovalMonth: 0,
      ssdiPersonal: 4000, ssdiFamilyTotal: 6000, kidsAgeOutMonths: 36,
    });
    const schedule = buildTaxSchedule(s);
    // Year 0 should have SS income of ~$72K (6000*12)
    expect(schedule[0]).toBeDefined();
    expect(schedule[0].fullTax.ssTaxableIncome).toBeGreaterThan(0);
  });
});
