/**
 * A8 (remediation 2026-06-10, plan item 1.6): earnings test on Sarah's
 * spousal benefit.
 *
 * Spousal was previously paid whenever Chad had claimed, with no check on
 * Sarah's own self-employment earnings — but SSA fully withholds a spousal
 * benefit under the claimant's FRA at her income level (~$190k+/yr at the
 * practice defaults). The same whole-check annualized test Chad gets (B1)
 * now applies to sarahSpousal against her net SE earnings while she is under
 * HER FRA, with the SSA recredit (ARF) applied at her FRA: fully-withheld
 * months are removed from her early-claim reduction.
 *
 * Run: node src/model/__tests__/sarahSpousalEarningsTest.test.js
 */

import assert from 'node:assert';
import { gatherStateWithOverrides } from '../../state/gatherState.js';
import { runMonthlySimulation } from '../projection.js';
import { ssSpousalFactorFromMonthsEarly } from '../constants.js';

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

console.log('\n=== A8 — earnings test on Sarah\'s spousal benefit ===');

// Shared fixture: Chad on SSDI from m=0 (so he has "claimed" and the kids'
// family-max window ends at m=40); Sarah (59) claims spousal at 64 → start
// m=(64−59)×12=60, her FRA at m=(67−59)×12=96. expenseInflation off isolates
// the test from A2 COLA. She works through sarahWorkMonths=72 at the default
// practice income (~$190k+/yr SE earnings).
const fixture = {
  expenseInflation: false,
  ssType: 'ssdi', ssdiApprovalMonth: 0, ssdiDenied: false,
  ssPIA: 4214,
  sarahSpousalEnabled: true, sarahSpousalClaimAge: 64, sarahCurrentAge: 59,
  sarahWorkMonths: 72,
  chadWorkMonths: 120, // extend horizon past her FRA (m=96)
};

test('default: spousal fully withheld while Sarah earns ~$190k+ under her FRA (A8)', () => {
  const s = gatherStateWithOverrides(fixture);
  // Claim 64 → 36 months early → factor 0.75 → round(2107 × 0.75) = 1580.
  assert.strictEqual(s.sarahSpousalAmount, 1580, 'claim-64 spousal base (A7 factor)');
  const { monthlyData } = runMonthlySimulation(s);
  // m=60..71: entitled, but her SE earnings vastly exceed the exempt amount →
  // SSA withholds the whole check (the old code paid ~$21,900 of phantom
  // spousal across this window at the audit's cited configs).
  for (const m of [60, 66, 71]) {
    assert.strictEqual(monthlyData[m].sarahSpousal, 0,
      `m=${m}: spousal must be fully withheld while she works pre-FRA`);
    assert.strictEqual(monthlyData[m].sarahSpousalGross, 0,
      `m=${m}: gross reflects the withheld check`);
  }
});

test('spousal flows at the reduced amount once she stops working (pre-FRA)', () => {
  const s = gatherStateWithOverrides(fixture);
  const { monthlyData } = runMonthlySimulation(s);
  // She works through m=72 (inclusive); from m=73 her SE earnings are 0 → no
  // withholding → the claim-64 reduced amount (1580) flows until her FRA.
  assert.strictEqual(monthlyData[72].sarahSpousal, 0, 'm=72: last working month still withheld');
  assert.strictEqual(monthlyData[73].sarahSpousalGross, 1580, 'm=73: reduced spousal flows');
  assert.strictEqual(monthlyData[95].sarahSpousalGross, 1580, 'm=95: still the claim-64 amount');
});

test('ARF recredit at her FRA: fully-withheld months reduce the early-claim penalty', () => {
  const s = gatherStateWithOverrides(fixture);
  const result = runMonthlySimulation(s);
  const { monthlyData, ssWithheldSummary } = result;
  // Working months m=60..72 (13 January-cycle whole checks) are fully
  // withheld → 13 ARF months.
  assert.strictEqual(ssWithheldSummary.sarahSpousalMonthsWithheld, 13,
    'counter counts only fully-withheld spousal months');
  // At her FRA (m=96) SSA recomputes: 36 months early − 13 withheld = 23 →
  // factor 1 − 23 × (25/36)% → round(2107 × 0.8402778) = 1770.
  const expected = Math.round(4214 * 0.5 * ssSpousalFactorFromMonthsEarly(36 - 13));
  assert.strictEqual(expected, 1770, 'hand-computed recredit lock');
  assert.strictEqual(monthlyData[96].sarahSpousalGross, expected,
    'post-FRA spousal is the ARF-recredited amount');
  assert.strictEqual(monthlyData[110].sarahSpousalGross, expected, 'permanent thereafter');
});

test('override: no SE earnings → no withholding at any pre-FRA month', () => {
  const s = gatherStateWithOverrides({ ...fixture, sarahCurrentClients: 0 });
  const { monthlyData, ssWithheldSummary } = runMonthlySimulation(s);
  assert.strictEqual(monthlyData[60].sarahSpousalGross, 1580, 'm=60: flows immediately');
  assert.strictEqual(ssWithheldSummary.sarahSpousalMonthsWithheld, 0, 'no ARF months');
  // No withheld months → recredit changes nothing at FRA.
  assert.strictEqual(monthlyData[96].sarahSpousalGross, 1580, 'FRA: claim-64 amount is permanent');
});

test('edge: at/after her FRA the test never applies even while she works', () => {
  // Claim at her FRA (67, m=96) while she works through m=120: exempt.
  const s = gatherStateWithOverrides({
    ...fixture,
    sarahSpousalClaimAge: 67,
    sarahWorkMonths: 120,
  });
  const { monthlyData } = runMonthlySimulation(s);
  assert.strictEqual(monthlyData[96].sarahSpousalGross, 2107,
    'm=96 (her FRA): full spousal despite ~$190k+ SE earnings');
});

test('edge: recredit never exceeds the FRA ceiling (months withheld >= months early)', () => {
  // Claim 66 (12 months early), working the whole pre-FRA window → at least
  // 12 fully-withheld months → effective months early clamps at 0 → factor 1.
  const s = gatherStateWithOverrides({
    ...fixture,
    sarahSpousalClaimAge: 66, // start m=84, FRA m=96
    sarahWorkMonths: 120,     // still working through her FRA
  });
  const { monthlyData, ssWithheldSummary } = runMonthlySimulation(s);
  assert.ok(ssWithheldSummary.sarahSpousalMonthsWithheld >= 12,
    `all 12 pre-FRA months withheld, got ${ssWithheldSummary.sarahSpousalMonthsWithheld}`);
  assert.strictEqual(monthlyData[96].sarahSpousalGross, 2107,
    'recredit clamps at the full FRA ceiling');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
