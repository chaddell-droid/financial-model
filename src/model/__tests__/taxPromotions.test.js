/**
 * Tax engine tests for MSFT promotion ladder + age-65 vest continuation.
 *
 * Validates that taxProjection.js mirrors projection.js's level-aware salary,
 * bonus, and refresh-grant logic, and continues to accumulate W-2 stock comp
 * after retirement when the age-65 rule applies.
 *
 * Run with:
 *   node src/model/__tests__/taxPromotions.test.js
 */
import assert from 'node:assert';
import { buildTaxSchedule } from '../taxProjection.js';
import { gatherStateWithOverrides } from '../../state/gatherState.js';

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

// Helper — minimal scenario with Chad employed for at least 5 years so we can
// observe both promotion years and post-retirement vest years.
// Note: gatherState forces chadRetirementMonth = chadWorkMonths and
// totalProjectionMonths = max(chadWorkMonths, sarahWorkMonths). So to see post-
// retirement years we need sarahWorkMonths > chadWorkMonths.
function taxBase(overrides = {}) {
  return gatherStateWithOverrides({
    taxMode: 'engine',
    chadJob: true, chadJobSalary: 200000, chadJobStartMonth: 0,
    chadJobRaisePct: 0, chadJobBonusPct: 0,
    chadJobNoFICA: false, chadJobPensionContrib: 0,
    chadWorkMonths: 60, sarahWorkMonths: 96,
    // A4 (2026-06-10): legacy MSFT vests now flow into W-2/FICA; zero the
    // MSFT price so these tests keep isolating the NEW-JOB comp ladder.
    msftPrice: 0,
    ...overrides,
  });
}

console.log('\n=== Tax engine — promotion ladder + age-65 vests ===');

test('T1. Year-0 W-2 wages reflect L64 promotion mid-year', () => {
  // L64 fires at month 6 → 6 mo at $200K + 6 mo at $300K → annual ~$250K.
  // Without promotion: $200K. Difference ≈ $50K. Set chadL64BonusPct=0
  // explicitly to isolate the salary effect (L64 default bonus is 15%).
  const baseline = taxBase({ chadL64Enabled: false });
  const promoted = taxBase({
    chadL64Enabled: true, chadL64Month: 6, chadL64Salary: 300000, chadL64BonusPct: 0,
  });
  const baseSched = buildTaxSchedule(baseline);
  const promoSched = buildTaxSchedule(promoted);
  const diff = promoSched[0].chadW2 - baseSched[0].chadW2;
  if (diff < 48000 || diff > 52000) {
    throw new Error(`T1 expected ~$50K W-2 lift from L64 mid-year promotion, got $${diff}`);
  }
});

test('T2. Eligible age (65+ at retirement): refresh vests continue post-retirement', () => {
  // Retire at m=60. Year 6 (months 72-83) is fully post-retirement with refresh
  // grants 2, 3, 4 still inside their 60-month vest windows. Eligible should
  // show stock W-2 in Y6; ineligible should show $0.
  const eligible = taxBase({
    chadCurrentAge: 60, // age 65 at retirement (m=60 → 5 yrs)
    chadJobStockRefresh: 100000, chadJobRefreshStartMonth: 12,
    chadAge65VestOverride: 'auto',
  });
  const ineligible = taxBase({
    chadCurrentAge: 55, // age 60 at retirement
    chadJobStockRefresh: 100000, chadJobRefreshStartMonth: 12,
    chadAge65VestOverride: 'auto',
  });
  const schedEligible = buildTaxSchedule(eligible);
  const schedIneligible = buildTaxSchedule(ineligible);
  if (!(schedEligible[6].chadW2 > 0)) {
    throw new Error(`T2 eligible Y6 W-2 should be > 0, got $${schedEligible[6].chadW2}`);
  }
  if (schedIneligible[6].chadW2 !== 0) {
    throw new Error(`T2 ineligible Y6 W-2 should be 0, got $${schedIneligible[6].chadW2}`);
  }
});

test('T3. Override=off zeros post-retirement W-2 even when age-eligible', () => {
  const overrideOff = taxBase({
    chadCurrentAge: 70, // age 75 at retirement (very eligible)
    chadJobStockRefresh: 100000, chadJobRefreshStartMonth: 12,
    chadAge65VestOverride: 'off',
  });
  const sched = buildTaxSchedule(overrideOff);
  if (sched[6].chadW2 !== 0) {
    throw new Error(`T3 override='off' Y6 W-2 should be 0, got $${sched[6].chadW2}`);
  }
});

test('T4. RSU grant size in W-2 reflects level at issuance, not at vest', () => {
  // L64 fires at month 24 with refresh $100K. Grant 1 issued m=12 (L63, $50K).
  // First vest of grant 1 = m=14 (L63 era). After L64 promotion (m=24), grant 1
  // KEEPS $50K size. Year 1 W-2 stock should reflect grant 1's L63 size.
  const s = taxBase({
    chadJobStockRefresh: 50000, chadJobRefreshStartMonth: 12,
    chadL64Enabled: true, chadL64Month: 24, chadL64Salary: 240000, chadL64StockRefresh: 100000,
  });
  const sched = buildTaxSchedule(s);
  // Year 0: vests at m=2, 5, 8, 11 — none yet (first grant issued m=12).
  // Year 1 (m=12-23): vests at m=14, 17, 20, 23 — all from grant 1 ($50K) at L63.
  // Y1 stock contribution ≈ 4 × 5% × $50K = $10K.
  // Year 2 (m=24-35): grant 1 still vesting at $50K + grant 2 just issued at L64 ($100K).
  // Vests m=26 (grant1+grant2), 29, 32, 35: 4 × (5% × $50K + 5% × $100K) = $30K.
  // The KEY check: Y1 W-2 should not exceed grant1-only stock (no grant 2 yet).
  // Grant 2 is issued m=24, so its first vest is in Y2.
  const y1W2 = sched[1].chadW2;
  // Salary for Y1: still L63 ($200K) for all 12 months → $200K.
  // Add 4 vests of $2500 each = $10K.
  // Total ~$210K. (Plus zero bonus, zero hire stock, zero sign-on.)
  if (y1W2 < 200000 || y1W2 > 220000) {
    throw new Error(`T4 Y1 W-2 should be ~$210K (L63 salary + grant 1 vests at L63 size), got $${y1W2}`);
  }
});

test('T5. 1-year cliff applied to post-retirement vest aggregation', () => {
  // Retire at m=60. Grants at m=12, 24, 36, 48. Grant 4 (m=48) is within 12mo of
  // retirement (60-48=12, not > 12) → FORFEIT. Grants 1-3 continue.
  // Pre-cliff total post-ret would be 4 grants worth; with cliff, 3 grants.
  const eligible = taxBase({
    chadCurrentAge: 60, // age 65 at retirement
    chadJobStockRefresh: 100000, chadJobRefreshStartMonth: 12,
    chadAge65VestOverride: 'auto',
  });
  const sched = buildTaxSchedule(eligible);
  // Y6 (m=72-83): all post-retirement vest months. Grants 1-3 still vesting at
  // those months (all clear cliff). Grant 4 forfeited.
  // Y6 vests for grant 1 (firstVest m=14, lasts to m=71): grant 1 fully vested by Y6.
  // Y6 vests for grant 2 (firstVest m=26, lasts m=83): vests at m=74, 77, 80, 83.
  // Y6 vests for grant 3 (firstVest m=38, lasts m=95): vests at m=74, 77, 80, 83.
  // Total Y6 vests = 4 quarters × 2 grants × 5% × $100K = $40K. Without cliff (grant 4 included)
  // would be much higher. Test asserts cliff is applied: Y6 W-2 should not include grant 4.
  // We don't know exactly grant 4 contribution at Y6 (grant 4 firstVest m=50, lasts m=107),
  // but it would have added 4 vests in Y6 = +$20K.
  // With cliff: Y6 ≤ $50K (gen rounding). Without cliff: Y6 ≥ $60K.
  if (sched[6].chadW2 > 50000) {
    throw new Error(`T5 Y6 W-2 should reflect cliff (≤$50K), got $${sched[6].chadW2}`);
  }
  if (sched[6].chadW2 === 0) {
    throw new Error(`T5 Y6 W-2 should be > 0 (eligible grants still vest), got $0`);
  }
});

console.log(`\n${'='.repeat(50)}`);
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'='.repeat(50)}\n`);

if (failed > 0) process.exit(1);
