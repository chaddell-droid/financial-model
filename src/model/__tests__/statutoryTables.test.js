// Phase-0 remediation (2026-06-10): per-year locks on the statutory parameter
// tables. These tests pin published statutory values so an accidental edit (or a
// stale-year regression like B3) fails loudly. Sources noted inline.
import assert from 'node:assert';
import {
  SSA_LIMITS, SSA_LIMITS_BASE_YEAR, getSsaLimitsForYear,
  SGA_LIMIT, SS_EARNINGS_LIMIT_ANNUAL, SS_EARNINGS_LIMIT_FRA_YEAR, SSDI_ATTORNEY_FEE_CAP,
  FAMILY_MAX_BEND_POINTS, familyMaxForPIA,
} from '../constants.js';

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

console.log(`\n${'='.repeat(50)}`);
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'='.repeat(50)}\n`);

if (failed > 0) process.exit(1);
