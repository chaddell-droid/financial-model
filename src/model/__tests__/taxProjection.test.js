/**
 * Tax projection (buildTaxSchedule) tests.
 *
 * Run with:
 *   node src/model/__tests__/taxProjection.test.js
 *
 * Ported from vitest to the project's plain-node assert harness
 * (remediation plan 2026-06-09, Phase 0.3). Assertion bodies are unchanged;
 * the describe/it/expect shim below provides vitest-compatible semantics on
 * top of node:assert.
 */
import assert from 'node:assert';
import { buildTaxSchedule, inflateBrackets, getTaxInputs } from '../taxProjection.js';
import { BRACKETS_MFJ_2025, SS_WAGE_BASE } from '../taxConstants.js';
import { gatherStateWithOverrides } from '../../state/gatherState.js';
import { getVestingGrossMonthly, getVestingMonthly } from '../vesting.js';

// A4 (remediation 2026-06-10): legacy MSFT vests are W-2 wages in the vest
// year regardless of employment. Sum the per-month gross for projection year y.
function yearLegacyVestGross(y, s = {}) {
  let total = 0;
  for (let m = y * 12; m <= y * 12 + 11; m++) {
    total += getVestingGrossMonthly(m, s.msftGrowth || 0, s.msftPrice);
  }
  return total;
}

// ── Minimal vitest-compatible harness (plain node) ──────────────────────
let passed = 0;
let failed = 0;
const suiteStack = [];

function describe(name, fn) {
  suiteStack.push(name);
  console.log(`\n=== ${suiteStack.join(' › ')} ===`);
  try {
    fn();
  } catch (err) {
    failed++;
    console.log(`  FAIL  (suite-level setup threw)`);
    console.log(`        ${err.message}`);
  } finally {
    suiteStack.pop();
  }
}
describe.skip = (name) => {
  console.log(`\n  SKIP  suite "${name}"`);
};

function it(name, fn) {
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
it.skip = (name) => {
  console.log(`  SKIP  ${name}`);
};

function expect(actual) {
  return {
    toBe(expected) {
      assert.strictEqual(actual, expected);
    },
    toBeCloseTo(expected, precision = 2) {
      const tolerance = 0.5 * Math.pow(10, -precision);
      assert.ok(
        Math.abs(actual - expected) < tolerance,
        `expected ${actual} to be close to ${expected} (precision ${precision})`
      );
    },
    toBeGreaterThan(e) {
      assert.ok(actual > e, `expected ${actual} > ${e}`);
    },
    toBeGreaterThanOrEqual(e) {
      assert.ok(actual >= e, `expected ${actual} >= ${e}`);
    },
    toBeLessThan(e) {
      assert.ok(actual < e, `expected ${actual} < ${e}`);
    },
    toBeLessThanOrEqual(e) {
      assert.ok(actual <= e, `expected ${actual} <= ${e}`);
    },
    toBeDefined() {
      assert.notStrictEqual(actual, undefined, 'expected value to be defined');
    },
    toHaveProperty(key) {
      assert.ok(
        actual != null && key in actual,
        `expected object to have property "${key}"`
      );
    },
  };
}
// ─────────────────────────────────────────────────────────────────────────

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
    // FIX #3: Brackets updated to 2026 (Rev. Proc. 2025-32). First MFJ
    // bracket cap is now $24,800 (was $23,850 in 2025).
    const inflated = inflateBrackets(BRACKETS_MFJ_2025, 1.10);
    expect(inflated[0][0]).toBe(Math.round(24800 * 1.10));
    expect(inflated[0][1]).toBe(0.10); // rate unchanged
    // Infinity stays Infinity
    expect(inflated[6][0]).toBe(Infinity);
    expect(inflated[6][1]).toBe(0.37);
  });

  it('factor of 1 returns same thresholds', () => {
    // FIX #3: 2026 thresholds (10% MFJ = $24,800; 22% MFJ = $211,400).
    const inflated = inflateBrackets(BRACKETS_MFJ_2025, 1.0);
    expect(inflated[0][0]).toBe(24800);
    expect(inflated[2][0]).toBe(211400);
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

  it('Chad unemployed: W-2 = legacy vests only; zero once vesting ends (A4)', () => {
    // A4 (remediation 2026-06-10): post-separation MSFT RSU vests are W-2
    // wages in the vest year even with no job — they MUST appear in chadW2.
    const s = makeState({ chadJob: false });
    const schedule = buildTaxSchedule(s);
    expect(schedule[0].chadW2).toBe(yearLegacyVestGross(0, s));
    expect(schedule[0].chadW2).toBeGreaterThan(0);
    expect(schedule[0].chadMonthlyTax).toBeGreaterThan(0);
    // Legacy vesting ends month 29 (Aug '28) → years 3+ carry no W-2.
    expect(schedule[3].chadW2).toBe(0);
    expect(schedule[3].chadMonthlyTax).toBe(0);
    expect(schedule[3].chadMonthlyNet).toBe(0);
  });

  it('Chad has non-zero tax when employed', () => {
    const s = makeState({ chadJob: true, chadJobSalary: 80000, chadJobStartMonth: 0 });
    const schedule = buildTaxSchedule(s);
    expect(schedule[0].chadMonthlyTax).toBeGreaterThan(0);
    expect(schedule[0].chadMonthlyNet).toBeGreaterThan(0);
    // A4: salary plus this year's legacy MSFT vest gross.
    expect(schedule[0].chadW2).toBe(80000 + yearLegacyVestGross(0, s));
  });

  it('Chad W-2 is pro-rated when starting mid-year', () => {
    // Starts month 6 → in year 0 (months 0-11), employed months 6-11 = 6 months
    const s = makeState({ chadJob: true, chadJobSalary: 120000, chadJobStartMonth: 6 });
    const schedule = buildTaxSchedule(s);
    // A4: legacy vests stack on top of the pro-rated salary (discrete events,
    // never annualized).
    expect(schedule[0].chadW2).toBe(60000 + yearLegacyVestGross(0, s)); // 120K * 6/12 + vests
    expect(schedule[1].chadW2).toBe(120000 + yearLegacyVestGross(1, s)); // Full year + vests
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
    // Last full year should have higher tax than year 3 (income grows).
    // A4: years 0-2 carry legacy MSFT vests, which inflate Sarah's MARGINAL
    // attribution (her Sch C stacks on top of vest W-2 income), so year 0 is
    // no longer a clean low-water mark — compare vest-free years instead.
    expect(schedule[5].annualSarahTax).toBeGreaterThan(schedule[3].annualSarahTax);
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
    // Phase 4 (2026-06-09): 2 children × $2,200 = $4,400 credit (no phase-out
    // at this income level).
    expect(noCredits[0].annualTotalTax - credits[0].annualTotalTax).toBeGreaterThanOrEqual(4399);
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

  // chadW2OnlyTax powers the W-2 Net Diagnostic's "Tax breakdown" — FICA + federal
  // must all be on the SAME year-0 gross so they reconcile and sum.
  it('chadW2OnlyTax exposes a year-0 FICA breakdown that reconciles with the engine', () => {
    const s = makeState({ chadJob: true, chadJobSalary: 300000 });
    const e = buildTaxSchedule(s)[0].chadW2OnlyTax;
    expect(e).toBeDefined();
    const base = e.ficaBase;
    expect(base).toBeGreaterThan(0);
    approx(e.ficaSS, Math.min(base, SS_WAGE_BASE) * 0.062, 1);        // SS capped at wage base
    approx(e.ficaMedicare, base * 0.0145, 1);                         // Medicare uncapped
    approx(e.ficaAddlMedicare, Math.max(0, base - 250000) * 0.009, 1);// Addl Medicare over $250k
    approx(e.ficaTotal, e.ficaSS + e.ficaMedicare + e.ficaAddlMedicare, 1);
    expect(e.fedTax).toBeGreaterThanOrEqual(0);
  });

  // ── A4 REGRESSION (remediation 2026-06-10): legacy MSFT vests ($307.6k
  // gross through Aug 2028) are W-2 + FICA wages in the vest year regardless
  // of employment, and must flow into the tax engine.
  it('A4: gross vest helper is the pre-haircut twin of getVestingMonthly', () => {
    // getVestingMonthly nets 20% withholding; the gross helper must not.
    for (const m of [0, 5, 12, 29]) {
      const gross = getVestingGrossMonthly(m, 0, undefined);
      const net = getVestingMonthly(m, 0, undefined);
      expect(gross).toBeGreaterThan(0);
      approx(net, gross * 0.8, 2);
    }
    expect(getVestingGrossMonthly(30, 0, undefined)).toBe(0); // window ends month 29
  });

  it('A4: legacy vests total ≈ $307.6k gross at 0% growth (audit figure)', () => {
    let total = 0;
    for (let m = 0; m <= 29; m++) total += getVestingGrossMonthly(m, 0, undefined);
    approx(total, 307601, 60); // 749 shares × $410.68 ≈ $307.6k (rounding per month)
  });

  it('A4: SSDI-path (chadJob=false) chadW2Gross AND FICA base carry the vests', () => {
    const s = makeState({ chadJob: false });
    const schedule = buildTaxSchedule(s);
    const vests0 = yearLegacyVestGross(0, s);
    expect(schedule[0].chadW2Gross).toBe(vests0);
    expect(schedule[0].chadW2OnlyTax.ficaBase).toBe(vests0); // Box 3/5 includes vests
    expect(schedule[0].chadW2OnlyTax.ficaSS).toBeGreaterThan(0);
  });

  it('A4: 2026 displayed household tax jumps to the corrected ~$93k (defaults)', () => {
    // Audit A4: default (SSDI-path) 2026 displayed tax was ~$50,050 with the
    // vests missing; the audit estimated ~$85-90k corrected — but that figure
    // was A4 in ISOLATION on the pre-A3 engine, where adding the vest FICA
    // base would also have (wrongly) zeroed Sarah's ~$11.7k SE SS tax via the
    // shared-wage-base bug. With A3 landed first (per-individual SE), the
    // combined figure was ~$104k. C6 (item 2.8) then removed ~$11.1k of
    // phantom tax (kids' SS aux + kids' back pay are the KIDS' income,
    // Pub 915), landing at ~$92.8k: vest W-2 + FICA taxed, ADULT-only SS
    // taxability, AND Sarah's full SE tax.
    const s = gatherStateWithOverrides({ taxMode: 'engine' });
    const schedule = buildTaxSchedule(s);
    expect(schedule[0].annualTotalTax).toBeGreaterThan(85000);
    expect(schedule[0].annualTotalTax).toBeLessThan(100000);
  });

  it('chadW2OnlyTax suppresses the SS portion under a non-FICA employer', () => {
    const s = makeState({ chadJob: true, chadJobSalary: 300000, chadJobNoFICA: true });
    const e = buildTaxSchedule(s)[0].chadW2OnlyTax;
    expect(e.ficaSS).toBe(0);
    approx(e.ficaMedicare, e.ficaBase * 0.0145, 1); // Medicare still applies
  });
});

// ============================================================
// Summary
// ============================================================
console.log(`\n${'='.repeat(50)}`);
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'='.repeat(50)}\n`);

if (failed > 0) process.exit(1);
