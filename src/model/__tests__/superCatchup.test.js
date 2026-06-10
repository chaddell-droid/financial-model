/**
 * C7 (remediation 2026-06-10, item 3.6) — SECURE 2.0 §109 super catch-up age gate.
 *
 * The $11,250 super catch-up is allowed ONLY in calendar years in which the
 * participant ATTAINS age 60–63; from the year attaining 64 the regular
 * age-50+ catch-up limit applies. Chad (FRA Oct 2032 → born 1965) attains
 * 63 in 2028, so months through Dec 2028 (m=33) allow the full $11,250 and
 * Jan 2029 (m=34) onward clamps to the regular limit from the Phase-0
 * statutory table (getTaxParamsForYear — indexed for future years).
 *
 * Run with: node src/model/__tests__/superCatchup.test.js
 */
import assert from 'node:assert';
import { runMonthlySimulation } from '../projection.js';
import { gatherStateWithOverrides } from '../../state/gatherState.js';
import { getTaxParamsForYear, K401_SUPER_CATCHUP_LIMIT, TAX_PARAMS, TAX_PARAMS_BASE_YEAR } from '../taxConstants.js';
import { buildLeverCandidates } from '../sensitivityAnalysis.js';

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

const CATCHUP_STATE = {
  chadJob: true, chadJobSalary: 120000, chadJobTaxRate: 25, chadJobStartMonth: 0,
  chadJob401kEnabled: true, chadJob401kDeferral: 0, chadJob401kCatchupRoth: 11250,
  chadJobRaisePct: 0, chadJobBonusPct: 0, chadWorkMonths: 60,
};

console.log('\n=== C7: super catch-up age gate (years attaining 60-63) ===');

test('SC1: full $11,250 super catch-up flows through Dec 2028 (m=33, year attaining 63)', () => {
  const s = gatherStateWithOverrides(CATCHUP_STATE);
  const { monthlyData } = runMonthlyWrapped(s);
  for (const m of [0, 12, 24, 33]) {
    assert.strictEqual(monthlyData[m].chadJob401kContribGross, Math.round(11250 / 12),
      `m=${m} (2026-2028) should contribute $938/mo, got ${monthlyData[m].chadJob401kContribGross}`);
  }
});

test('SC2: from Jan 2029 (m=34, year attaining 64) the catch-up clamps to the regular limit', () => {
  const s = gatherStateWithOverrides(CATCHUP_STATE);
  const { monthlyData } = runMonthlyWrapped(s);
  const cap2029 = getTaxParamsForYear(2029).k401CatchupLimit;
  assert.ok(cap2029 < 11250, `2029 regular catch-up limit (${cap2029}) must be below 11250`);
  assert.strictEqual(monthlyData[34].chadJob401kContribGross, Math.round(cap2029 / 12),
    `m=34 (Jan 2029) should clamp to ${Math.round(cap2029 / 12)}/mo, got ${monthlyData[34].chadJob401kContribGross}`);
  // The clamp persists for later years (2030 cap from the table).
  const cap2030 = getTaxParamsForYear(2030).k401CatchupLimit;
  assert.strictEqual(monthlyData[50].chadJob401kContribGross, Math.round(cap2030 / 12),
    `m=50 (2030) should clamp to ${Math.round(cap2030 / 12)}/mo, got ${monthlyData[50].chadJob401kContribGross}`);
});

test('SC3: take-home rises at the clamp boundary by the disallowed (post-tax Roth) slice', () => {
  const s = gatherStateWithOverrides(CATCHUP_STATE);
  const { monthlyData } = runMonthlyWrapped(s);
  const cap2029 = getTaxParamsForYear(2029).k401CatchupLimit;
  const expectedRise = (11250 - cap2029) / 12; // Roth is post-tax: dollar-for-dollar
  const rise = monthlyData[34].chadJobSalaryNet - monthlyData[33].chadJobSalaryNet;
  assert.ok(Math.abs(rise - expectedRise) <= 1,
    `salary net should rise ~${expectedRise.toFixed(0)} at m=34, got ${rise}`);
});

test('SC4: a request at/below the regular limit is never clamped (edge case)', () => {
  const s = gatherStateWithOverrides({ ...CATCHUP_STATE, chadJob401kCatchupRoth: 6000 });
  const { monthlyData } = runMonthlyWrapped(s);
  for (const m of [0, 33, 34, 50]) {
    assert.strictEqual(monthlyData[m].chadJob401kContribGross, 500,
      `m=${m}: $6,000/yr request should pass through at $500/mo, got ${monthlyData[m].chadJob401kContribGross}`);
  }
});

test('SC5: sensitivityAnalysis auto-fill uses the statutory table value, not a literal', () => {
  assert.strictEqual(K401_SUPER_CATCHUP_LIMIT, TAX_PARAMS[TAX_PARAMS_BASE_YEAR].k401SuperCatchupLimit,
    'flat constant must derive from the Phase-0 table');
  const cands = buildLeverCandidates(gatherStateWithOverrides({ chadJob: false }));
  const msft = cands.find((c) => c.id === 'take_msft_offer');
  assert.ok(msft, 'take_msft_offer candidate should exist when chadJob=false');
  assert.strictEqual(msft.mutation.chadJob401kCatchupRoth, K401_SUPER_CATCHUP_LIMIT,
    'auto-fill should equal the table-derived super catch-up limit');
});

/** Helper: keep savings high so no 401k drawdown interferes with contrib rows. */
function runMonthlyWrapped(s) {
  return runMonthlySimulation({ ...s, startingSavings: 5_000_000 });
}

console.log('----------------------------------------------------------------');
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log('================================================================');
if (failed > 0) process.exit(1);
