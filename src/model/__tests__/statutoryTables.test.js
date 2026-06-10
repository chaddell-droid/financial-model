// Phase-0 remediation (2026-06-10): per-year locks on the statutory parameter
// tables. These tests pin published statutory values so an accidental edit (or a
// stale-year regression like B3) fails loudly. Sources noted inline.
import assert from 'node:assert';
import {
  SSA_LIMITS, SSA_LIMITS_BASE_YEAR, getSsaLimitsForYear,
  SGA_LIMIT, SS_EARNINGS_LIMIT_ANNUAL, SS_EARNINGS_LIMIT_FRA_YEAR, SSDI_ATTORNEY_FEE_CAP,
  FAMILY_MAX_BEND_POINTS, familyMaxForPIA,
} from '../constants.js';
import {
  TAX_PARAMS, TAX_PARAMS_BASE_YEAR, getTaxParamsForYear,
  BRACKETS_MFJ_2026, STD_DED, SS_WAGE_BASE, QBI_PHASE_OUT, QBI_PHASE_OUT_RANGE, QBI_PHASE_OUT_WARNING,
  CTC_AMOUNT, CTC_PHASEOUT_THRESHOLD_MFJ, SOLO_401K_EMPLOYEE_LIMIT, SOLO_401K_TOTAL_LIMIT,
  ADDL_MEDICARE_THRESHOLD, ADDL_MEDICARE_W2_THRESHOLD,
  SS_PROVISIONAL_THRESHOLD_1, SS_PROVISIONAL_THRESHOLD_2,
  SALT_CAP, SALT_MAGI_THRESHOLD, getSaltCapForYear, getSaltThresholdForYear,
} from '../taxConstants.js';
import { computeItemizedDeductions } from '../taxEngine.js';

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

console.log('\n=== Statutory tables (Phase 0) ===');

// ── 0.2 SSA limits table (B3) ──────────────────────────────────────────────

test('SSA-1. 2026 SSA limits lock (ssa.gov/oact/cola/rtea.html)', () => {
  const l = getSsaLimitsForYear(2026);
  assert.strictEqual(l.earningsTestAnnual, 24480, '2026 lower exempt amount');
  assert.strictEqual(l.earningsTestFraYearAnnual, 65160, '2026 FRA-year exempt amount');
  assert.strictEqual(l.sgaMonthly, 1690, '2026 SGA non-blind');
  assert.strictEqual(l.attorneyFeeCap, 9200, 'fee-agreement cap (Nov 2024, unchanged)');
});

test('SSA-2. legacy convenience constants derive from the table (no duplicates)', () => {
  const base = SSA_LIMITS[SSA_LIMITS_BASE_YEAR];
  assert.strictEqual(SS_EARNINGS_LIMIT_ANNUAL, base.earningsTestAnnual);
  assert.strictEqual(SS_EARNINGS_LIMIT_FRA_YEAR, base.earningsTestFraYearAnnual);
  assert.strictEqual(SGA_LIMIT, base.sgaMonthly);
  assert.strictEqual(SSDI_ATTORNEY_FEE_CAP, base.attorneyFeeCap);
});

test('SSA-3. years at/before the base year clamp to the base table', () => {
  assert.deepStrictEqual(getSsaLimitsForYear(2024), SSA_LIMITS[2026]);
  assert.deepStrictEqual(getSsaLimitsForYear(2026), SSA_LIMITS[2026]);
  assert.deepStrictEqual(getSsaLimitsForYear(NaN), SSA_LIMITS[2026], 'non-finite input falls back to base');
});

test('SSA-4. future years index by the assumed wage rate with SSA rounding', () => {
  const y2027 = getSsaLimitsForYear(2027);
  // 24480 × 1.025 = 25092 → nearest $120 multiple = 25080
  assert.strictEqual(y2027.earningsTestAnnual, 25080);
  assert.strictEqual(y2027.earningsTestAnnual % 120, 0, 'annual exempt amount is a $120 multiple (monthly $10 rounding)');
  assert.strictEqual(y2027.earningsTestFraYearAnnual % 120, 0);
  assert.strictEqual(y2027.sgaMonthly % 10, 0, 'SGA rounds to $10');
  assert.strictEqual(y2027.attorneyFeeCap, 9200, 'fee cap is pinned, NOT auto-indexed');
  // Monotonic growth for the indexed amounts
  const y2030 = getSsaLimitsForYear(2030);
  assert.ok(y2030.earningsTestAnnual > y2027.earningsTestAnnual, 'indexed amounts grow');
  assert.ok(y2030.earningsTestFraYearAnnual > y2027.earningsTestFraYearAnnual);
  // Cache returns the identical object on repeat calls
  assert.strictEqual(getSsaLimitsForYear(2030), y2030);
});

// ── 0.3 familyMaxForPIA bend-point helper (b-13) ───────────────────────────

test('FMAX-1. 2026 family-max bend points lock (ssa.gov/oact/cola/familymax.html)', () => {
  assert.deepStrictEqual(FAMILY_MAX_BEND_POINTS, [1643, 2371, 3093]);
});

test('FMAX-2. PIA at/below the first bend point → 150% of PIA', () => {
  assert.strictEqual(familyMaxForPIA(1000), 1500);
  assert.strictEqual(familyMaxForPIA(1643), Math.floor(1.5 * 1643 * 10) / 10);
});

test('FMAX-3. household PIA $4,214 → $7,373.80 (audit B5 worked example ≈$7,374)', () => {
  // 1.50×1643 + 2.72×(2371−1643) + 1.34×(3093−2371) + 1.75×(4214−3093)
  // = 2464.50 + 1980.16 + 967.48 + 1961.75 = 7373.89 → dime-floored 7373.8
  assert.strictEqual(familyMaxForPIA(4214), 7373.8);
});

test('FMAX-4. mid-band and edge cases', () => {
  // PIA exactly at 2nd bend point: 1.5×1643 + 2.72×728 = 4444.66 → 4444.6
  assert.strictEqual(familyMaxForPIA(2371), 4444.6);
  // PIA exactly at 3rd bend point: + 1.34×722 = 5412.14 → 5412.1
  assert.strictEqual(familyMaxForPIA(3093), 5412.1);
  // Invalid inputs
  assert.strictEqual(familyMaxForPIA(0), 0);
  assert.strictEqual(familyMaxForPIA(-100), 0);
  assert.strictEqual(familyMaxForPIA(NaN), 0);
  // Monotonic
  assert.ok(familyMaxForPIA(5000) > familyMaxForPIA(4214));
});

// ── 0.1 Year-indexed tax parameter table (improvement a-4) ─────────────────

test('TAX-1. 2026 tax params lock (Rev. Proc. 2025-32 / Notice 2025-67 / SSA)', () => {
  const p = getTaxParamsForYear(2026);
  assert.deepStrictEqual(p.bracketsMfj, [
    [24800, 0.10], [100800, 0.12], [211400, 0.22], [403550, 0.24],
    [512450, 0.32], [768700, 0.35], [Infinity, 0.37],
  ]);
  assert.strictEqual(p.stdDeductionMfj, 32200);
  assert.strictEqual(p.ssWageBase, 184500);
  assert.strictEqual(p.qbiPhaseOutStart, 403500);
  assert.strictEqual(p.qbiPhaseOutRange, 150000);
  assert.strictEqual(p.ctcAmount, 2200);
  assert.strictEqual(p.solo401kEmployeeLimit, 24500);
  assert.strictEqual(p.solo401kTotalLimit, 72000);
  assert.strictEqual(p.k401CatchupLimit, 8000);
  assert.strictEqual(p.k401SuperCatchupLimit, 11250);
});

test('TAX-2. legally frozen thresholds are pinned in EVERY projected year', () => {
  for (const y of [2026, 2030, 2040]) {
    const p = getTaxParamsForYear(y);
    assert.strictEqual(p.addlMedicareThreshold, 250000, `addl-Medicare MFJ frozen (${y})`);
    assert.strictEqual(p.addlMedicareW2Threshold, 200000, `addl-Medicare W-2 withholding frozen (${y})`);
    assert.strictEqual(p.ssProvisionalThreshold1, 32000, `provisional tier 1 frozen (${y})`);
    assert.strictEqual(p.ssProvisionalThreshold2, 44000, `provisional tier 2 frozen (${y})`);
    assert.strictEqual(p.ctcPhaseoutThresholdMfj, 400000, `CTC phaseout threshold frozen (${y})`);
    assert.strictEqual(p.qbiPhaseOutRange, 150000, `QBI phase-in width is statutory (${y})`);
  }
});

test('TAX-3. projected years index the indexed amounts and keep bracket rates', () => {
  const p27 = getTaxParamsForYear(2027);
  assert.ok(p27.stdDeductionMfj > 32200, 'std deduction indexes up');
  assert.strictEqual(p27.stdDeductionMfj % 100, 0, 'std deduction rounds to $100');
  assert.ok(p27.ssWageBase > 184500, 'wage base indexes up');
  assert.strictEqual(p27.ssWageBase % 300, 0, 'wage base rounds to $300 (SSA rule)');
  assert.strictEqual(p27.bracketsMfj.length, 7);
  assert.deepStrictEqual(p27.bracketsMfj.map(b => b[1]), BRACKETS_MFJ_2026.map(b => b[1]), 'rates unchanged');
  assert.strictEqual(p27.bracketsMfj[6][0], Infinity, 'top bracket stays unbounded');
  assert.ok(p27.bracketsMfj[0][0] > 24800 && p27.bracketsMfj[0][0] % 50 === 0, 'thresholds index, $50 rounding');
  // Clamping + caching
  assert.strictEqual(getTaxParamsForYear(2020), TAX_PARAMS[TAX_PARAMS_BASE_YEAR], 'past years clamp to base');
  assert.strictEqual(getTaxParamsForYear(2027), p27, 'projected years are cached (identity)');
});

test('TAX-4. flat constants derive from the base-year table (no duplicates)', () => {
  const base = TAX_PARAMS[TAX_PARAMS_BASE_YEAR];
  assert.strictEqual(BRACKETS_MFJ_2026, base.bracketsMfj);
  assert.strictEqual(STD_DED, base.stdDeductionMfj);
  assert.strictEqual(SS_WAGE_BASE, base.ssWageBase);
  assert.strictEqual(QBI_PHASE_OUT, base.qbiPhaseOutStart);
  assert.strictEqual(QBI_PHASE_OUT_RANGE, base.qbiPhaseOutRange);
  assert.strictEqual(QBI_PHASE_OUT_WARNING, base.qbiPhaseOutStart - 30000);
  assert.strictEqual(CTC_AMOUNT, base.ctcAmount);
  assert.strictEqual(CTC_PHASEOUT_THRESHOLD_MFJ, base.ctcPhaseoutThresholdMfj);
  assert.strictEqual(SOLO_401K_EMPLOYEE_LIMIT, base.solo401kEmployeeLimit);
  assert.strictEqual(SOLO_401K_TOTAL_LIMIT, base.solo401kTotalLimit);
  assert.strictEqual(ADDL_MEDICARE_THRESHOLD, base.addlMedicareThreshold);
  assert.strictEqual(ADDL_MEDICARE_W2_THRESHOLD, base.addlMedicareW2Threshold);
  assert.strictEqual(SS_PROVISIONAL_THRESHOLD_1, base.ssProvisionalThreshold1);
  assert.strictEqual(SS_PROVISIONAL_THRESHOLD_2, base.ssProvisionalThreshold2);
  assert.strictEqual(SALT_CAP, getSaltCapForYear(TAX_PARAMS_BASE_YEAR));
  assert.strictEqual(SALT_MAGI_THRESHOLD, getSaltThresholdForYear(TAX_PARAMS_BASE_YEAR));
});

// ── 0.5 SALT phase-down threshold schedule (C8) ────────────────────────────

test('SALT-1. threshold schedule lock: $500k (2025) +1%/yr through 2029', () => {
  assert.strictEqual(getSaltThresholdForYear(2024), 500000);
  assert.strictEqual(getSaltThresholdForYear(2025), 500000);
  assert.strictEqual(getSaltThresholdForYear(2026), 505000);
  assert.strictEqual(getSaltThresholdForYear(2027), 510050);
  assert.strictEqual(getSaltThresholdForYear(2028), 515151);
  assert.strictEqual(getSaltThresholdForYear(2029), 520302);
  // 2030+: cap reverts to the $10k floor so the phase-down can never bind.
  assert.strictEqual(getSaltThresholdForYear(2030), 520302);
  assert.strictEqual(getSaltCapForYear(2030), 10000);
});

test('SALT-2. phase-down uses the year threshold: MAGI $510k in 2026 vs frozen $500k', () => {
  const inputs = {
    agi: 510000, propertyTax: 35000, salesTax: 15000, personalPropTax: 0,
    mortgageInt: 0, charitable: 0, totalMedicalInput: 0,
    saltCap: getSaltCapForYear(2026),
  };
  // 2026 threshold $505,000: reduction = (510000−505000)×0.30 = 1500 → cap 38,900
  const withSchedule = computeItemizedDeductions({ ...inputs, saltThreshold: getSaltThresholdForYear(2026) });
  assert.strictEqual(withSchedule.saltDeductible, 40400 - 1500);
  // Frozen $500,000 (the C8 bug): reduction = 3000 → cap 37,400 — must differ
  const frozen = computeItemizedDeductions({ ...inputs, saltThreshold: 500000 });
  assert.strictEqual(frozen.saltDeductible, 40400 - 3000);
  // Default (no saltThreshold passed) is the 2026 base-year schedule value
  const dflt = computeItemizedDeductions({ ...inputs });
  assert.strictEqual(dflt.saltDeductible, withSchedule.saltDeductible);
});

console.log(`\n${'='.repeat(50)}`);
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'='.repeat(50)}\n`);

if (failed > 0) process.exit(1);
