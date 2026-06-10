/**
 * 6.4 (remediation 2026-06-10, improvement a-6, gate D6): healthcare cost path.
 *
 * `healthPremiumMonthly` (default $4,200/mo — the family's private premium)
 * is carved OUT of the inflating baseExpenses and re-added as its own
 * expense line that trends at `medicalTrendRate` (default 6.5%/yr, D6)
 * instead of general CPI. Single source with chadJobHealthSavings: while
 * employer coverage is active (chadJob && m >= chadJobStartMonth) the
 * premium line is ZEROED — the legacy flat chadJobHealthSavings subtraction
 * applies only when the carve is inactive (healthPremiumMonthly = 0).
 *
 * `ssdiEntitlementMonth` (nullable, months from projection start, negative =
 * already entitled): when set, chadMedicareMonth = min(entitlement + 24,
 * age-65 month) and from that month Medicare relieves Chad's per-capita
 * share (1/4 of the family premium, HEALTH_CHAD_MEDICARE_SHARE). null = no
 * Medicare modeled (D6: UI hint asks for the SSA award-letter date).
 *
 * Run: node src/model/__tests__/healthcare.test.js
 */

import assert from 'node:assert';
import { INITIAL_STATE } from '../../state/initialState.js';
import { gatherStateWithOverrides } from '../../state/gatherState.js';
import { validateAndSanitize } from '../../state/schemaValidation.js';
import { runMonthlySimulation, HEALTH_CHAD_MEDICARE_SHARE } from '../projection.js';

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

// Quiet baseline: SSDI denied (no benefit noise), no returns, no debt list,
// no van/BCS/college/milestone noise so the expense rows isolate the
// base + premium machinery.
function sim(overrides = {}) {
  return runMonthlySimulation(gatherStateWithOverrides({
    investmentReturn: 0,
    startingSavings: 5_000_000,
    starting401k: 0,
    homeEquity: 0,
    ssdiDenied: true,
    vanSold: false,
    vanMonthlySavings: 0,
    bcsAnnualTotal: 0,
    bcsParentsAnnual: 0,
    collegeCostPerKidMonthly: 0,
    milestones: [],
    debtService: 0,
    trustIncomeNow: 0,
    trustIncomeFuture: 0,
    sarahCurrentClients: 0,
    sarahMaxClients: 0,
    ...overrides,
  })).monthlyData;
}

// ── Engine: premium split + medical trend ──

test('month 0: premium is carved out of base and re-added — total unchanged, breakdown split', () => {
  const rows = sim({ expenseInflation: false });
  const r0 = rows[0];
  assert.strictEqual(r0.expenseBreakdown.healthPremium, 4200);
  assert.strictEqual(r0.expenseBreakdown.baseLiving, INITIAL_STATE.baseExpenses - 4200);
  // Total month-0 expenses are exactly what the un-split base produced.
  assert.strictEqual(r0.expenses, INITIAL_STATE.baseExpenses);
});

test('medical trend: premium grows at medicalTrendRate while base grows at expenseInflationRate', () => {
  const rows = sim({ expenseInflation: true, expenseInflationRate: 3, medicalTrendRate: 6.5 });
  const r12 = rows[12];
  assert.strictEqual(r12.expenseBreakdown.healthPremium, Math.round(4200 * 1.065));
  assert.strictEqual(r12.expenseBreakdown.baseLiving, Math.round((INITIAL_STATE.baseExpenses - 4200) * 1.03));
});

test('inflation off: premium stays flat (no medical trend)', () => {
  const rows = sim({ expenseInflation: false });
  assert.strictEqual(rows[36].expenseBreakdown.healthPremium, 4200);
});

test('custom premium + trend override flow through', () => {
  const rows = sim({ expenseInflation: true, healthPremiumMonthly: 2000, medicalTrendRate: 10 });
  assert.strictEqual(rows[0].expenseBreakdown.healthPremium, 2000);
  assert.strictEqual(rows[0].expenseBreakdown.baseLiving, INITIAL_STATE.baseExpenses - 2000);
  assert.strictEqual(rows[12].expenseBreakdown.healthPremium, Math.round(2000 * 1.10));
});

test('edge: premium larger than baseExpenses is clamped to the carvable base', () => {
  const rows = sim({ expenseInflation: false, baseExpenses: 3000, healthPremiumMonthly: 10000 });
  const r0 = rows[0];
  assert.strictEqual(r0.expenseBreakdown.baseLiving, 0);
  assert.strictEqual(r0.expenseBreakdown.healthPremium, 3000);
});

// ── Single source with chadJobHealthSavings ──

test('employer coverage zeroes the premium line (no healthInsurance subtraction)', () => {
  const rows = sim({ expenseInflation: false, chadJob: true, chadJobStartMonth: 6, chadJobSalary: 0, chadJobSignOnCash: 0 });
  // Before the job starts the premium is still paid.
  assert.strictEqual(rows[5].expenseBreakdown.healthPremium, 4200);
  // From the start month, the premium line is zeroed — single source.
  assert.strictEqual(rows[6].expenseBreakdown.healthPremium, undefined);
  assert.strictEqual(rows[6].expenseBreakdown.healthInsurance, undefined);
  assert.strictEqual(rows[5].expenses - rows[6].expenses, 4200);
});

test('chadJobHealthSavings is engine-inert while the carve is active (premium is the single source)', () => {
  const a = sim({ expenseInflation: false, chadJob: true, chadJobStartMonth: 0, chadJobSalary: 0, chadJobHealthSavings: 1234 });
  const b = sim({ expenseInflation: false, chadJob: true, chadJobStartMonth: 0, chadJobSalary: 0, chadJobHealthSavings: 4200 });
  assert.strictEqual(a[0].expenses, b[0].expenses);
});

test('legacy fallback: healthPremiumMonthly=0 restores the flat chadJobHealthSavings subtraction', () => {
  const rows = sim({ expenseInflation: false, healthPremiumMonthly: 0, chadJob: true, chadJobStartMonth: 0, chadJobSalary: 0, chadJobHealthSavings: 4200 });
  assert.strictEqual(rows[0].expenseBreakdown.healthPremium, undefined);
  assert.strictEqual(rows[0].expenseBreakdown.healthInsurance, -4200);
  assert.strictEqual(rows[0].expenseBreakdown.baseLiving, INITIAL_STATE.baseExpenses);
});

// ── Medicare via the SSDI 24-month rule (D6) ──

test('ssdiEntitlementMonth null (default): no Medicare relief ever', () => {
  const rows = sim({ expenseInflation: false });
  for (const r of rows) assert.strictEqual(r.expenseBreakdown.medicareRelief, undefined);
});

test('entitlement 18 months ago: Medicare at m=6 relieves Chad\'s share of the premium', () => {
  const rows = sim({ expenseInflation: false, ssdiEntitlementMonth: -18 });
  assert.strictEqual(rows[5].expenseBreakdown.medicareRelief, undefined);
  const relief = Math.round(4200 * HEALTH_CHAD_MEDICARE_SHARE);
  assert.strictEqual(rows[6].expenseBreakdown.medicareRelief, -relief);
  assert.strictEqual(rows[6].expenseBreakdown.healthPremium, 4200);
  assert.strictEqual(rows[5].expenses - rows[6].expenses, relief);
});

test('relief applies to the TRENDED premium (share of what is actually paid)', () => {
  const rows = sim({ expenseInflation: true, expenseInflationRate: 0, medicalTrendRate: 6.5, ssdiEntitlementMonth: -24 });
  const r12 = rows[12];
  const premium = Math.round(4200 * 1.065);
  assert.strictEqual(r12.expenseBreakdown.healthPremium, premium);
  assert.strictEqual(r12.expenseBreakdown.medicareRelief, -Math.round(premium * HEALTH_CHAD_MEDICARE_SHARE));
});

test('age-65 cap: a late entitlement still gets Medicare at the age-65 month', () => {
  // chadCurrentAge 61 → age-65 month = 48; entitlement at m=40 → 40+24=64 > 48.
  const rows = sim({ expenseInflation: false, ssdiEntitlementMonth: 40, chadCurrentAge: 61 });
  assert.strictEqual(rows[47].expenseBreakdown.medicareRelief, undefined);
  assert.strictEqual(rows[48].expenseBreakdown.medicareRelief, -Math.round(4200 * HEALTH_CHAD_MEDICARE_SHARE));
});

test('24-month arm: entitlement at m=0 → Medicare at m=24 (before age 65)', () => {
  const rows = sim({ expenseInflation: false, ssdiEntitlementMonth: 0, chadCurrentAge: 61 });
  assert.strictEqual(rows[23].expenseBreakdown.medicareRelief, undefined);
  assert.ok(rows[24].expenseBreakdown.medicareRelief < 0);
});

test('no double relief: employer coverage months carry no premium and no Medicare line', () => {
  const rows = sim({ expenseInflation: false, ssdiEntitlementMonth: -24, chadJob: true, chadJobStartMonth: 0, chadJobSalary: 0 });
  assert.strictEqual(rows[12].expenseBreakdown.healthPremium, undefined);
  assert.strictEqual(rows[12].expenseBreakdown.medicareRelief, undefined);
});

// ── New Field Checklist: defaults, clamps, nullable branch, passthrough ──

test('defaults: healthPremiumMonthly 4200, medicalTrendRate 6.5, ssdiEntitlementMonth null', () => {
  const d = validateAndSanitize({});
  assert.strictEqual(d.healthPremiumMonthly, 4200);
  assert.strictEqual(d.medicalTrendRate, 6.5);
  assert.strictEqual(d.ssdiEntitlementMonth, null);
});

test('range clamps: premium and trend are bounded', () => {
  const r = validateAndSanitize({ ...INITIAL_STATE, healthPremiumMonthly: -5, medicalTrendRate: 99 });
  assert.strictEqual(r.healthPremiumMonthly, 0);
  assert.strictEqual(r.medicalTrendRate, 15);
  const hi = validateAndSanitize({ ...INITIAL_STATE, healthPremiumMonthly: 999999 });
  assert.strictEqual(hi.healthPremiumMonthly, 20000);
});

test('nullable clamp branch: ssdiEntitlementMonth null preserved, numbers clamped to [-120, 120]', () => {
  assert.strictEqual(validateAndSanitize({ ...INITIAL_STATE, ssdiEntitlementMonth: null }).ssdiEntitlementMonth, null);
  assert.strictEqual(validateAndSanitize({ ...INITIAL_STATE, ssdiEntitlementMonth: -500 }).ssdiEntitlementMonth, -120);
  assert.strictEqual(validateAndSanitize({ ...INITIAL_STATE, ssdiEntitlementMonth: 500 }).ssdiEntitlementMonth, 120);
  assert.strictEqual(validateAndSanitize({ ...INITIAL_STATE, ssdiEntitlementMonth: -18 }).ssdiEntitlementMonth, -18);
});

test('gatherState passes all three fields through to the projection state', () => {
  const s = gatherStateWithOverrides({ healthPremiumMonthly: 3100, medicalTrendRate: 7, ssdiEntitlementMonth: -6 });
  assert.strictEqual(s.healthPremiumMonthly, 3100);
  assert.strictEqual(s.medicalTrendRate, 7);
  assert.strictEqual(s.ssdiEntitlementMonth, -6);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
