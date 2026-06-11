/**
 * Save/load round-trip tests: every MODEL_KEY must survive a full
 * gatherState → JSON.stringify → JSON.parse → migrate → validateAndSanitize cycle.
 *
 * Built after the user reported "save scenario, reload, very different numbers"
 * and asked for an exhaustive audit. The strategy: for every persistent field,
 * use a non-default value so any silent fallback to INITIAL_STATE shows up as
 * a test failure.
 *
 * Run with: node src/state/__tests__/saveLoadRoundtrip.test.js
 */
import assert from 'node:assert';
import fs from 'node:fs';
import { INITIAL_STATE, MODEL_KEYS } from '../initialState.js';
import { gatherState } from '../gatherState.js';
import { validateAndSanitize, migrate } from '../schemaValidation.js';

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

function roundTrip(stateOverrides) {
  const fullState = { ...INITIAL_STATE, ...stateOverrides };
  const gathered = gatherState(fullState);
  const serialized = JSON.parse(JSON.stringify(gathered));
  const migrated = migrate(serialized);
  return validateAndSanitize(migrated);
}

console.log('\n=== Save/load round-trip — comprehensive MODEL_KEYS audit ===');

/**
 * Non-default values for EVERY MODEL_KEY. Each entry must differ from
 * INITIAL_STATE so any silent fallback shows up as a mismatch on round-trip.
 *
 * If a new MODEL_KEY is added without a corresponding entry here, the
 * "Every MODEL_KEY has a non-default test value" test fails.
 */
const NON_DEFAULT_VALUES = {
  // Sarah's business
  sarahRate: 230,
  sarahMaxRate: 280,
  sarahRateGrowth: 7,
  sarahCurrentClients: 4.0,
  sarahMaxClients: 5.0,
  sarahClientGrowth: 12,
  sarahTaxRate: 28,
  // Work timelines
  chadWorkMonths: 84,
  sarahWorkMonths: 96,
  // MSFT
  msftPrice: 425.50,
  msftGrowth: 8.5,
  // Social Security — SSDI side
  ssType: 'ss',                    // flipped from default 'ssdi'
  ssdiApprovalMonth: 9,
  ssdiDenied: true,                // flipped
  ssdiPersonal: 4500,
  ssdiFamilyTotal: 6750,
  kidsAgeOutMonths: 42,
  chadConsulting: 2500,
  ssdiBackPayMonths: 24,
  ssColaRate: 3.2,                 // A2 (2026-06-10): non-default COLA

  // Social Security — retirement side
  ssClaimAge: 70,
  ssPIA: 4500,
  ssFamilyTotal: 6750,
  ssPersonal: 5400,
  ssStartMonth: 96,
  ssKidsAgeOutMonths: 24,
  // Post-job benefit selector (flipped from default 'ssRetirement')
  postJobBenefit: 'ssdi',
  // P8 (2026-06-10): TWP/EPE module toggle (flipped from default true)
  twpEnabled: false,
  // Sarah's spousal + own-record benefit
  sarahSpousalEnabled: false,      // flipped
  sarahCurrentAge: 60,
  sarahSpousalClaimAge: 70,
  sarahOwnSS: 2400,
  // Chad's job — basics
  chadJob: true,                   // flipped
  chadJobSalary: 195000,
  chadJobTaxRate: 32,
  chadJobStartMonth: 4,
  chadJobHealthSavings: 5500,
  chadJobNoFICA: true,             // flipped
  chadJobPensionRate: 1.5,
  chadJobPensionContrib: 4.5,
  chadJobRaisePct: 4,
  chadJobBonusPct: 18,
  chadJobBonusMonth: 7,
  chadJobBonusProrateFirst: false, // flipped
  chadJobStockRefresh: 60000,
  chadJobRefreshStartMonth: 8,
  chadJobHireStockTotal: 250000, // 2026-06-10: one total grant field
  chadJobSignOnCash: 80000,
  chadJob401kEnabled: true,        // flipped
  chadJob401kDeferral: 23500,
  chadJob401kCatchupRoth: 7500,
  chadJob401kMatch: 11750,
  chadCurrentAge: 62,
  // MSFT promotion ladder
  chadL64Enabled: true,
  chadL64Month: 18,
  chadL64Salary: 235000,
  chadL64StockRefresh: 90000,
  chadL64BonusPct: 22,
  chadL65Enabled: true,
  chadL65Month: 48,
  chadL65Salary: 295000,
  chadL65StockRefresh: 130000,
  chadL65BonusPct: 28,
  chadAge65VestOverride: 'on',     // flipped from 'auto'
  // Expenses
  totalMonthlySpend: 60000,        // non-null
  oneTimeExtras: 5000,
  oneTimeMonths: 12,
  baseExpenses: 50000,
  debtService: 7500,
  // Per-debt amortization + mortgage P&I split (6.3 — remediation 2026-06-10, D5)
  debts: [{ id: 'debt-rt', name: 'Round-trip CC', balance: 9000, apr: 22.9, payment: 450 }],
  mortgagePI: 4800,
  mortgageBalance: 520000,
  mortgageRate: 5.75,
  expenseInflation: false,         // flipped
  expenseInflationRate: 4,
  // Tax drag on the taxable return (6.5 — remediation 2026-06-10, b-11)
  taxableReturnDragPct: 20,
  // Emergency-fund floor + two-bucket returns (6.6 — remediation 2026-06-10, b-15)
  cashFloorAmount: 60000,
  cashYieldPct: 5,
  // Healthcare cost path (6.4 — remediation 2026-06-10, D6)
  healthPremiumMonthly: 3600,
  medicalTrendRate: 8,
  ssdiEntitlementMonth: -12,       // non-null (nullable field)
  // BCS tuition
  bcsAnnualTotal: 50000,
  bcsParentsAnnual: 27500,
  bcsYearsLeft: 4,
  // Twins' college (6.2 — remediation 2026-06-10, D4)
  collegeCostPerKidMonthly: 3500,
  collegeStartMonth: 45,
  collegeMonths: 36,
  college529Balance: 80000,
  // Spending cuts
  lifestyleCutsApplied: true,      // flipped
  cutsOverride: 1500,              // non-null
  cutOliver: 200,
  cutVacation: 300,
  cutShopping: 100,
  cutMedical: 50,
  cutGym: 75,
  cutAmazon: 80,
  cutSaaS: 60,
  cutEntertainment: 40,
  cutGroceries: 150,
  cutPersonalCare: 30,
  cutSmallItems: 25,
  // Trust + van + retirement debt + savings
  trustIncomeNow: 1000,
  trustIncomeFuture: 2500,
  trustIncreaseMonth: 12,
  vanSold: true,                   // flipped
  vanMonthlySavings: 2700,
  vanSalePrice: 160000,
  vanLoanBalance: 195000,
  vanSaleMonth: 18,
  retireDebt: true,                // flipped
  startingSavings: 250000,
  investmentReturn: 12,
  // Capital projects (legacy scalars)
  moldCost: 65000,
  moldInclude: true,               // flipped
  roofCost: 45000,
  roofInclude: true,               // flipped
  otherProjects: 50000,
  otherInclude: true,              // flipped
  // Debts
  debtCC: 95000,
  debtPersonal: 60000,
  debtIRS: 18500,
  debtFirstmark: 22000,
  // Net worth
  starting401k: 500000,
  return401k: 12,
  homeEquity: 750000,
  homeAppreciation: 5,
  deficit401kTaxRate: 30,          // remediation 2026-06-09 D7 — 401(k) deficit-draw gross-up
  retirement401kTaxRate: 18,       // A5 — remediation 2026-06-10 item 3.1 (D3) — retirement 401(k) haircut
  // B3 (2026-06-10 retirement review): persisted Retirement + Survivor assumptions
  retChadPassesAge: 88,
  retEquityAllocation: 75,
  retWithdrawalRate: 5.5,          // nullable — non-null = user dragged the slider
  retPoolFloor: 100000,
  retBequestTarget: 250000,
  retInheritanceAmount: 750000,
  retInheritanceSarahAge: 68,
  retPwaStrategy: 'fixed_percentile',
  retKeepHouse: true,              // Item 7 (2026-06-10 batch 2): keep-the-house lever
  retImputedRentSaved: 3500,
  retSurvivorTaxDragPct: 12,       // Item 8 (2026-06-10 batch 2): survivor tax drag

  // Sequence of returns
  seqBadY1: -15,
  seqBadY2: -8,
  // Tax engine controls (remediation 2026-06-09 D1 — Tax tab wiring)
  taxMode: 'engine',               // flipped from 'flat'
  taxInflationAdjust: true,        // flipped
  taxInflationRate: 3,
  taxSchCExpenseRatio: 30,
  taxPropertyTax: 9000,
  taxSalesTax: 3500,
  taxPersonalPropTax: 1200,
  taxMortgageInt: 18000,
  taxCharitable: 6000,
  taxMedical: 8000,
  taxW2Withholding: 25000,
  taxCtcChildren: 1,
  taxOdcDependents: 1,
  taxCapGainLoss: 5000,
  taxSolo401k: 12000,
  // Monte Carlo settings (remediation phase 5 — now MODEL_KEYS so they persist)
  mcNumSims: 1000,
  mcInvestVol: 18,
  mcBizGrowthVol: 8,
  mcMsftVol: 20,
  mcSsdiDelay: 9,
  mcSsdiDenialPct: 10,
  mcCutsDiscipline: 40,
  mcBlockBootstrap: true,          // item 4.2 (2026-06-10, D7): flipped from default false
  // Arrays — set values that differ from INITIAL_STATE
  capitalItems: [
    { id: 'test-1', name: 'Test capital item', description: 'audit', cost: 50000, include: true, likelihood: 80 },
  ],
  // Capital funding source (remediation 2026-06-09 D4 — enum, default 'advance')
  capitalFundingSource: 'savings',
  customLevers: [
    { id: 'lv-test', name: 'Test lever', description: 'audit', maxImpact: 5000, currentValue: 2500, active: true },
  ],
  leverConstraintsOverride: { sarahRate: { min: 100, max: 300 } },
  milestones: [{ name: 'Custom milestone', month: 24, savings: 5000 }],
  goals: [
    { id: 'g-test', name: 'Custom goal', type: 'savings_target', targetAmount: 100000, targetMonth: 60, color: '#abcdef' },
  ],
};

test('Every MODEL_KEY has a non-default test value', () => {
  const missing = MODEL_KEYS.filter(k => !(k in NON_DEFAULT_VALUES));
  if (missing.length > 0) {
    throw new Error(
      `MODEL_KEYS not exercised by this test: ${missing.join(', ')}\n` +
      `        Add a non-default value to NON_DEFAULT_VALUES so save/load coverage stays complete.`
    );
  }
});

test('Every MODEL_KEY survives a full round-trip identically (or via documented transformation)', () => {
  // gatherState recomputes some derived fields (ssPersonal, ssStartMonth, etc.
  // when ssType='ss'; ssFamilyTotal capped at 1.5×PIA), and ssRate is clamped
  // to sarahMaxRate. Allow those, but flag anything else.
  const result = roundTrip(NON_DEFAULT_VALUES);
  const drift = [];

  // Fields that gatherState legitimately recomputes when ssType='ss'.
  const SS_COMPUTED_KEYS = new Set(['ssPersonal', 'ssStartMonth', 'ssKidsAgeOutMonths', 'ssFamilyTotal']);
  // baseExpenses is back-calculated from totalMonthlySpend when totalMonthlySpend != null
  // (gatherState lines 65-68). Document this divergence; verify separately below.
  const RECOMPUTED_FROM_TOTAL_SPEND = new Set(['baseExpenses']);

  for (const key of MODEL_KEYS) {
    if (SS_COMPUTED_KEYS.has(key)) continue; // recomputed in gatherState
    if (RECOMPUTED_FROM_TOTAL_SPEND.has(key)) continue;
    const expected = NON_DEFAULT_VALUES[key];
    const actual = result[key];
    if (Array.isArray(expected) || (typeof expected === 'object' && expected !== null)) {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        drift.push(`${key}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      }
    } else if (actual !== expected) {
      drift.push(`${key}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
  }
  if (drift.length > 0) {
    throw new Error(`Fields lost or mutated on round-trip:\n        ${drift.join('\n        ')}`);
  }
});

test('baseExpenses is back-calculated from totalMonthlySpend (documented behavior)', () => {
  // When totalMonthlySpend is set, gatherState replaces baseExpenses with
  // totalMonthlySpend - debtService - vanMonthlySavings - statusQuoBcsMonthly.
  // Verify the formula round-trips correctly.
  const result = roundTrip({
    totalMonthlySpend: 60000, debtService: 7500, vanMonthlySavings: 2700,
    bcsAnnualTotal: 50000, baseExpenses: 99999, // baseExpenses input is intentionally ignored
  });
  const expectedStatusQuoBcs = Math.round(Math.max(0, 50000 - 25000) / 12); // 2083
  const expectedBase = 60000 - 7500 - 2700 - expectedStatusQuoBcs;
  assert.strictEqual(result.baseExpenses, expectedBase);
});

test('baseExpenses is preserved when totalMonthlySpend is null', () => {
  const result = roundTrip({ totalMonthlySpend: null, baseExpenses: 50000 });
  assert.strictEqual(result.baseExpenses, 50000);
});

test('Recomputed SS fields stay self-consistent on round-trip when ssType=ss', () => {
  const result = roundTrip({ ssType: 'ss', ssClaimAge: 67, ssPIA: 4500 });
  // ssPersonal = ssPIA × adjustment(67); 67 is FRA so factor ~1.0
  if (!(result.ssPersonal >= 4400 && result.ssPersonal <= 4500)) {
    throw new Error(`Expected ssPersonal ~4500 at FRA, got ${result.ssPersonal}`);
  }
  // ssStartMonth = (67-62)*12 + offset
  if (result.ssStartMonth < 60 || result.ssStartMonth > 100) {
    throw new Error(`ssStartMonth out of expected range: ${result.ssStartMonth}`);
  }
});

test('null totalMonthlySpend and null cutsOverride survive round-trip', () => {
  const result = roundTrip({ totalMonthlySpend: null, cutsOverride: null });
  assert.strictEqual(result.totalMonthlySpend, null);
  assert.strictEqual(result.cutsOverride, null);
});

test('All four boolean toggles in MSFT promotion ladder + age-65 round-trip', () => {
  const flags = {
    chadL64Enabled: true,
    chadL65Enabled: true,
    chadJob401kEnabled: true,
    chadJob: true,
    chadJobNoFICA: true,
    chadJobBonusProrateFirst: false,
    sarahSpousalEnabled: false,
    expenseInflation: false,
    lifestyleCutsApplied: true,
    vanSold: true,
    retireDebt: true,
    moldInclude: true,
    roofInclude: true,
    otherInclude: true,
    ssdiDenied: true,
  };
  const result = roundTrip(flags);
  for (const [k, v] of Object.entries(flags)) {
    if (result[k] !== v) {
      throw new Error(`Boolean ${k}: expected ${v}, got ${result[k]}`);
    }
  }
});

test('chadAge65VestOverride enum survives all three values; invalid resets to default', () => {
  for (const v of ['auto', 'on', 'off']) {
    assert.strictEqual(roundTrip({ chadAge65VestOverride: v }).chadAge65VestOverride, v);
  }
  assert.strictEqual(roundTrip({ chadAge65VestOverride: 'invalid' }).chadAge65VestOverride, 'auto');
});

test('ssType enum round-trips both values', () => {
  assert.strictEqual(roundTrip({ ssType: 'ssdi' }).ssType, 'ssdi');
  assert.strictEqual(roundTrip({ ssType: 'ss' }).ssType, 'ss');
});

test('sarahOwnSS: default, override, and explicit-zero round-trip (finding 2026-06-09 2.3)', () => {
  assert.strictEqual(roundTrip({}).sarahOwnSS, 1900, 'default from INITIAL_STATE');
  assert.strictEqual(roundTrip({ sarahOwnSS: 2400 }).sarahOwnSS, 2400, 'override survives');
  assert.strictEqual(roundTrip({ sarahOwnSS: 0 }).sarahOwnSS, 0, 'explicit 0 (no own benefit) survives');
});

test('Schema RANGE clamping: sarahOwnSS clamps to [0, 10000]', () => {
  assert.strictEqual(roundTrip({ sarahOwnSS: -50 }).sarahOwnSS, 0);
  assert.strictEqual(roundTrip({ sarahOwnSS: 25000 }).sarahOwnSS, 10000);
});

test('deficit401kTaxRate: default, override, and explicit-zero round-trip (remediation 2026-06-09 D7)', () => {
  assert.strictEqual(roundTrip({}).deficit401kTaxRate, 25, 'default from INITIAL_STATE');
  assert.strictEqual(roundTrip({ deficit401kTaxRate: 40 }).deficit401kTaxRate, 40, 'override survives');
  assert.strictEqual(roundTrip({ deficit401kTaxRate: 0 }).deficit401kTaxRate, 0, 'explicit 0 (no gross-up) survives');
});

test('Schema RANGE clamping: deficit401kTaxRate clamps to [0, 60]', () => {
  assert.strictEqual(roundTrip({ deficit401kTaxRate: -10 }).deficit401kTaxRate, 0);
  assert.strictEqual(roundTrip({ deficit401kTaxRate: 95 }).deficit401kTaxRate, 60);
});

// ── B3 (2026-06-10 retirement review): persisted Retirement + Survivor assumptions ──

test('B3: retirement assumptions default to the old hook defaults exactly', () => {
  const r = roundTrip({});
  assert.strictEqual(r.retChadPassesAge, 82);
  assert.strictEqual(r.retEquityAllocation, 60);
  assert.strictEqual(r.retWithdrawalRate, null, 'null = pristine (auto-sync to optimal)');
  assert.strictEqual(r.retPoolFloor, 0);
  assert.strictEqual(r.retBequestTarget, 0);
  assert.strictEqual(r.retInheritanceAmount, 1000000);
  assert.strictEqual(r.retInheritanceSarahAge, 60);
  assert.strictEqual(r.retPwaStrategy, 'sticky_median');
});

test('B3: overrides round-trip; retWithdrawalRate keeps an explicit number', () => {
  const r = roundTrip({
    retChadPassesAge: 90, retEquityAllocation: 80, retWithdrawalRate: 3.2,
    retPoolFloor: 200000, retBequestTarget: 500000,
    retInheritanceAmount: 0, retInheritanceSarahAge: 72,
    retPwaStrategy: 'sticky_quartile_nudge',
  });
  assert.strictEqual(r.retChadPassesAge, 90);
  assert.strictEqual(r.retEquityAllocation, 80);
  assert.strictEqual(r.retWithdrawalRate, 3.2);
  assert.strictEqual(r.retPoolFloor, 200000);
  assert.strictEqual(r.retBequestTarget, 500000);
  assert.strictEqual(r.retInheritanceAmount, 0, 'explicit 0 (no inheritance) preserved');
  assert.strictEqual(r.retInheritanceSarahAge, 72);
  assert.strictEqual(r.retPwaStrategy, 'sticky_quartile_nudge');
});

test('Item 7: keepHouse toggle + imputed rent round-trip (default, override, clamp)', () => {
  const d = roundTrip({});
  assert.strictEqual(d.retKeepHouse, false, 'default: house sold at the seam (old behavior)');
  assert.strictEqual(d.retImputedRentSaved, 0);
  const r = roundTrip({ retKeepHouse: true, retImputedRentSaved: 3500 });
  assert.strictEqual(r.retKeepHouse, true);
  assert.strictEqual(r.retImputedRentSaved, 3500);
  assert.strictEqual(roundTrip({ retImputedRentSaved: 999999 }).retImputedRentSaved, 20000, 'corruption guard');
  assert.strictEqual(roundTrip({ retKeepHouse: 'yes' }).retKeepHouse, true, 'boolean coercion');
});

test('Item 8: survivorTaxDragPct round-trip (default 7, override, clamp)', () => {
  assert.strictEqual(roundTrip({}).retSurvivorTaxDragPct, 7, 'default: MFJ->single step-up');
  assert.strictEqual(roundTrip({ retSurvivorTaxDragPct: 0 }).retSurvivorTaxDragPct, 0, 'explicit 0 (no drag)');
  assert.strictEqual(roundTrip({ retSurvivorTaxDragPct: 12.5 }).retSurvivorTaxDragPct, 12.5);
  assert.strictEqual(roundTrip({ retSurvivorTaxDragPct: 80 }).retSurvivorTaxDragPct, 30, 'clamped to 30');
});

test('B3: edges — range clamps, nullable clamp, bad enum reverts to default', () => {
  assert.strictEqual(roundTrip({ retChadPassesAge: 50 }).retChadPassesAge, 67, 'clamped to slider min');
  assert.strictEqual(roundTrip({ retChadPassesAge: 120 }).retChadPassesAge, 95, 'clamped to slider max');
  assert.strictEqual(roundTrip({ retWithdrawalRate: -5 }).retWithdrawalRate, 0, 'nullable branch clamps non-null values');
  assert.strictEqual(roundTrip({ retWithdrawalRate: 400 }).retWithdrawalRate, 100, 'corruption guard');
  assert.strictEqual(roundTrip({ retInheritanceSarahAge: 40 }).retInheritanceSarahAge, 55);
  assert.strictEqual(roundTrip({ retPwaStrategy: 'yolo' }).retPwaStrategy, 'sticky_median', 'invalid enum reverts');
});

test('retirement401kTaxRate: default, override, and explicit-zero round-trip (A5 — remediation 2026-06-10 item 3.1, D3)', () => {
  assert.strictEqual(roundTrip({}).retirement401kTaxRate, 13, 'default from INITIAL_STATE (D3: 13% effective MFJ)');
  assert.strictEqual(roundTrip({ retirement401kTaxRate: 22 }).retirement401kTaxRate, 22, 'override survives');
  assert.strictEqual(roundTrip({ retirement401kTaxRate: 0 }).retirement401kTaxRate, 0, 'explicit 0 (no haircut) survives');
});

test('Schema RANGE clamping: retirement401kTaxRate clamps to [0, 60]', () => {
  assert.strictEqual(roundTrip({ retirement401kTaxRate: -10 }).retirement401kTaxRate, 0);
  assert.strictEqual(roundTrip({ retirement401kTaxRate: 95 }).retirement401kTaxRate, 60);
});

test('Schema RANGE clamping: chadL64Month=200 clamps to 120 (matches UI slider)', () => {
  assert.strictEqual(roundTrip({ chadL64Month: 200 }).chadL64Month, 120);
});

test('Schema RANGE clamping: chadL65BonusPct=80 clamps to 50 (matches UI slider)', () => {
  assert.strictEqual(roundTrip({ chadL65BonusPct: 80 }).chadL65BonusPct, 50);
});

test('msftPrice + msftGrowth float round-trip preserves decimals', () => {
  const result = roundTrip({ msftPrice: 412.37, msftGrowth: 12.5 });
  assert.strictEqual(result.msftPrice, 412.37);
  assert.strictEqual(result.msftGrowth, 12.5);
});

test('Hire stock total round-trips', () => {
  const result = roundTrip({ chadJobHireStockTotal: 270000 });
  assert.strictEqual(result.chadJobHireStockTotal, 270000);
});

test('Legacy hire stock Y1-Y4 migrate to chadJobHireStockTotal on load (v8 → v9)', () => {
  // DATA PROTECTION (2026-06-10 hire-stock change): saved scenarios and
  // Chad's live localStorage predating v9 carry chadJobHireStockY1..Y4.
  // The 8→9 migration must fold them into the new total — losing a saved
  // scenario's hire-stock value is unacceptable.
  const legacySaved = {
    schemaVersion: 8,
    chadJob: true,
    chadJobHireStockY1: 40000, chadJobHireStockY2: 80000,
    chadJobHireStockY3: 120000, chadJobHireStockY4: 30000,
  };
  const restored = validateAndSanitize(migrate(legacySaved));
  assert.strictEqual(restored.chadJobHireStockTotal, 270000,
    'legacy Y1+Y2+Y3+Y4 must migrate into the total');
  // An already-migrated payload with the new field set must NOT be clobbered
  // by stale legacy keys left in an old JSON export.
  const mixed = validateAndSanitize(migrate({
    schemaVersion: 8, chadJobHireStockTotal: 95000, chadJobHireStockY1: 40000,
  }));
  assert.strictEqual(mixed.chadJobHireStockTotal, 95000);
});

test('401(k) fields all round-trip (including disabled state)', () => {
  const enabled = roundTrip({ chadJob401kEnabled: true, chadJob401kDeferral: 24500, chadJob401kCatchupRoth: 11250, chadJob401kMatch: 12000 });
  assert.strictEqual(enabled.chadJob401kEnabled, true);
  assert.strictEqual(enabled.chadJob401kDeferral, 24500);
  assert.strictEqual(enabled.chadJob401kCatchupRoth, 11250);
  assert.strictEqual(enabled.chadJob401kMatch, 12000);
  // Even when disabled, slider values should preserve so toggling back on restores them.
  const disabled = roundTrip({ chadJob401kEnabled: false, chadJob401kDeferral: 24500, chadJob401kCatchupRoth: 11250, chadJob401kMatch: 12000 });
  assert.strictEqual(disabled.chadJob401kEnabled, false);
  assert.strictEqual(disabled.chadJob401kDeferral, 24500);
  assert.strictEqual(disabled.chadJob401kCatchupRoth, 11250);
  assert.strictEqual(disabled.chadJob401kMatch, 12000);
});

test('capitalItems array round-trips with all fields', () => {
  const items = [
    { id: 'a', name: 'Item A', description: 'd1', cost: 12000, include: true, likelihood: 75 },
    { id: 'b', name: 'Item B', description: 'd2', cost: 20000, include: false, likelihood: 50 },
  ];
  const result = roundTrip({ capitalItems: items });
  assert.deepStrictEqual(result.capitalItems, items);
});

test('customLevers array round-trips with all fields', () => {
  const levers = [
    { id: 'lv-1', name: 'Lever 1', description: 'desc', maxImpact: 10000, currentValue: 5000, active: true },
  ];
  const result = roundTrip({ customLevers: levers });
  assert.deepStrictEqual(result.customLevers, levers);
});

test('milestones array round-trips with all fields', () => {
  const ms = [
    { name: 'm1', month: 12, savings: 5000 },
    { name: 'm2', month: 36, savings: 25000 },
  ];
  const result = roundTrip({ milestones: ms });
  assert.deepStrictEqual(result.milestones, ms);
});

test('goals array round-trips with all fields', () => {
  const gs = [
    { id: 'g1', name: 'G1', type: 'savings_target', targetAmount: 100000, targetMonth: 48, color: '#ff0000' },
    { id: 'g2', name: 'G2', type: 'income_target', targetAmount: 5000, targetMonth: 24, color: '#00ff00' },
  ];
  const result = roundTrip({ goals: gs });
  assert.deepStrictEqual(result.goals, gs);
});

test('leverConstraintsOverride round-trips an actual override', () => {
  const override = { sarahRate: { min: 100, max: 300 }, chadJobSalary: { max: 250000 } };
  const result = roundTrip({ leverConstraintsOverride: override });
  assert.deepStrictEqual(result.leverConstraintsOverride, override);
});

test('leverConstraintsOverride null round-trips as null', () => {
  assert.strictEqual(roundTrip({ leverConstraintsOverride: null }).leverConstraintsOverride, null);
});

test('Cuts: all 11 individual cut sliders round-trip', () => {
  const cuts = {
    cutOliver: 100, cutVacation: 200, cutShopping: 150, cutMedical: 50, cutGym: 75,
    cutAmazon: 80, cutSaaS: 60, cutEntertainment: 40, cutGroceries: 90,
    cutPersonalCare: 30, cutSmallItems: 25,
  };
  const result = roundTrip({ ...cuts, cutsOverride: null }); // null → individual cuts apply
  for (const [k, v] of Object.entries(cuts)) {
    assert.strictEqual(result[k], v, `Cut ${k} expected ${v}, got ${result[k]}`);
  }
});

// ════════════════════════════════════════════════════════════════════════
// Goal types — GoalPanel ↔ schemaValidation parity (remediation 1.2).
// VALID_GOAL_TYPES was missing 'debt_free', so the sanitizer silently
// DELETED every Debt Free goal on save/load. These tests derive the type
// list from GoalPanel's source so the two can never drift apart again.
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Goal types — GoalPanel ↔ schemaValidation parity ===');

function readGoalPanelTypes() {
  const source = fs.readFileSync(new URL('../../panels/GoalPanel.jsx', import.meta.url), 'utf8');
  const block = source.match(/const GOAL_TYPES = \[([\s\S]*?)\];/);
  assert.ok(block, 'GOAL_TYPES array must exist in GoalPanel.jsx');
  const types = [...block[1].matchAll(/value:\s*'([a-z_]+)'/g)].map(m => m[1]);
  assert.ok(types.length >= 5, `expected at least 5 goal types in GoalPanel, found ${types.length}`);
  return types;
}

test('a goal of EVERY type GoalPanel offers survives migrate + validateAndSanitize', () => {
  const types = readGoalPanelTypes();
  const goals = types.map((type, i) => ({
    id: `g-${type}`,
    name: `Goal ${type}`,
    type,
    targetAmount: 1000 * (i + 1),
    targetMonth: 12 * (i + 1),
    color: '#4ade80',
  }));
  const result = roundTrip({ goals });
  assert.deepStrictEqual(
    result.goals.map(g => g.type), types,
    `every GoalPanel goal type must survive the round-trip; survivors: [${result.goals.map(g => g.type).join(', ')}]`
  );
  assert.deepStrictEqual(result.goals, goals, 'all goal fields must round-trip unchanged');
});

test('debt_free goal survives round-trip with all fields intact', () => {
  const goal = { id: 'df-1', name: 'Debt free by Y6', type: 'debt_free', targetAmount: 0, targetMonth: 72, color: '#f87171' };
  const result = roundTrip({ goals: [goal] });
  assert.deepStrictEqual(result.goals, [goal]);
});

test('unknown goal type is still dropped by the sanitizer', () => {
  const result = roundTrip({ goals: [
    { id: 'ok', name: 'Keep', type: 'debt_free', targetAmount: 0, targetMonth: 72, color: '#f87171' },
    { id: 'bad', name: 'Drop', type: 'win_lottery', targetAmount: 1, targetMonth: 12, color: '#ffffff' },
  ] });
  assert.strictEqual(result.goals.length, 1, 'invalid goal type must be dropped');
  assert.strictEqual(result.goals[0].id, 'ok');
});

// ════════════════════════════════════════════════════════════════════════
// Monte Carlo settings — MODEL_KEYS membership + persistence (remediation
// phase 5). The seven mc* fields had RANGE constraints that never executed
// because the fields were missing from MODEL_KEYS, so MC settings silently
// reset to defaults on every save/load.
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Monte Carlo settings — MODEL_KEYS + round-trip ===');

const MC_FIELDS = ['mcNumSims', 'mcInvestVol', 'mcBizGrowthVol', 'mcMsftVol', 'mcSsdiDelay', 'mcSsdiDenialPct', 'mcCutsDiscipline', 'mcBlockBootstrap'];

test('all eight mc* fields are MODEL_KEYS', () => {
  const missing = MC_FIELDS.filter(k => !MODEL_KEYS.includes(k));
  assert.deepStrictEqual(missing, [], `mc* fields missing from MODEL_KEYS: ${missing.join(', ')}`);
});

test('mc* defaults survive round-trip (default behavior)', () => {
  const result = roundTrip({});
  for (const k of MC_FIELDS) {
    assert.strictEqual(result[k], INITIAL_STATE[k], `${k} default mismatch`);
  }
});

test('mc* overrides survive round-trip (override behavior)', () => {
  const overrides = {
    mcNumSims: 2000, mcInvestVol: 25, mcBizGrowthVol: 10,
    mcMsftVol: 30, mcSsdiDelay: 12, mcSsdiDenialPct: 20, mcCutsDiscipline: 60,
    mcBlockBootstrap: true,
  };
  const result = roundTrip(overrides);
  for (const [k, v] of Object.entries(overrides)) {
    assert.strictEqual(result[k], v, `${k} expected ${v}, got ${result[k]}`);
  }
});

test('mcBlockBootstrap is coerced to a boolean by the schema sanitizer (edge: corrupted save)', () => {
  // item 4.2 (2026-06-10, D7): a corrupted scenario with a truthy/falsy
  // non-boolean must come back as a clean boolean, never leak a string into
  // the MC engine.
  assert.strictEqual(roundTrip({ mcBlockBootstrap: 'yes' }).mcBlockBootstrap, true);
  assert.strictEqual(roundTrip({ mcBlockBootstrap: 0 }).mcBlockBootstrap, false);
});

test('mc* RANGE constraints execute (edge clamping)', () => {
  assert.strictEqual(roundTrip({ mcNumSims: 50000 }).mcNumSims, 10000, 'mcNumSims max');
  assert.strictEqual(roundTrip({ mcNumSims: 1 }).mcNumSims, 10, 'mcNumSims min');
  assert.strictEqual(roundTrip({ mcInvestVol: -5 }).mcInvestVol, 0, 'mcInvestVol min');
  assert.strictEqual(roundTrip({ mcInvestVol: 250 }).mcInvestVol, 100, 'mcInvestVol max');
  assert.strictEqual(roundTrip({ mcSsdiDelay: 999 }).mcSsdiDelay, 120, 'mcSsdiDelay max');
  assert.strictEqual(roundTrip({ mcSsdiDenialPct: 150 }).mcSsdiDenialPct, 100, 'mcSsdiDenialPct max');
  assert.strictEqual(roundTrip({ mcCutsDiscipline: -10 }).mcCutsDiscipline, 0, 'mcCutsDiscipline min');
});

test('mcResults and mcRunning stay OUT of MODEL_KEYS (UI-only, never persisted)', () => {
  assert.ok(!MODEL_KEYS.includes('mcResults'));
  assert.ok(!MODEL_KEYS.includes('mcRunning'));
});

test('Schema version is bumped to CURRENT after migration', () => {
  const result = roundTrip({});
  if (typeof result.schemaVersion !== 'number' || result.schemaVersion < 1) {
    throw new Error(`Schema version not set: ${result.schemaVersion}`);
  }
});

console.log(`\n${'='.repeat(60)}`);
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'='.repeat(60)}\n`);

if (failed > 0) process.exit(1);
