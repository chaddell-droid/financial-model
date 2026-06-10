/**
 * retirementParams tests — run with:
 *   node src/model/__tests__/retirementParams.test.js
 *
 * Covers remediation plan 2026-06-09 items:
 *   2.3 — retirement context derives ageDiff + sarahOwnSS from state (parity
 *         with gatherState instead of hardcoded ageDiff=14 / sarahOwnSS=1900)
 *   2.5a — two-phase band schedule scales by the user's slider
 *   2.5b — withdrawal slider auto-sync only while pristine (dirty flag)
 */

import assert from 'node:assert';
import fs from 'node:fs';
import {
  deriveRetirementParams,
  computeOptimalRates,
  withdrawalScaleFactor,
  buildTwoPhaseSchedule,
  shouldAutoSyncWithdrawalRate,
  computeRetirementPool,
  deterministicTrajectory,
  geometricMeanMonthly,
  SARAH_TARGET_AGE,
  SURVIVOR_SPEND_RATIO,
  PERS_JS50_FACTOR,
} from '../retirementParams.js';
import { getPensionAtMonth } from '../retirementIncome.js';
import { getNumCohorts, getCohortLabel } from '../historicalReturns.js';
import { simulatePath } from '../ernWithdrawal.js';
import { ssRecalculatedBenefit } from '../constants.js';
import { INITIAL_STATE } from '../../state/initialState.js';
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

function eq(actual, expected, label) {
  assert.strictEqual(actual, expected, label ? `${label}: expected ${expected}, got ${actual}` : undefined);
}

/** Build derive() inputs from a gatherState result — the same field names. */
function paramsFromGathered(s) {
  return deriveRetirementParams({
    chadCurrentAge: s.chadCurrentAge,
    sarahCurrentAge: s.sarahCurrentAge,
    sarahOwnSS: s.sarahOwnSS,
    ssType: s.ssType,
    ssPIA: s.ssPIA,
    ssClaimAge: s.ssClaimAge,
    ssMonthsWithheld: 0,
    trustIncomeFuture: s.trustIncomeFuture,
    chadJobPensionMonthly: s.chadJobPensionMonthly,
  });
}

// ════════════════════════════════════════════════════════════════════════
// Section 1: ageDiff parity with gatherState (finding 2.3)
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== ageDiff derives from state (no hardcoded 14) ===');

test('A1: default state — ageDiff is chadCurrentAge - sarahCurrentAge = 2 (not the hardcoded 14)', () => {
  const s = gatherStateWithOverrides();
  const p = paramsFromGathered(s);
  eq(p.ageDiff, s.chadCurrentAge - s.sarahCurrentAge, 'parity with gatherState ages');
  eq(p.ageDiff, 2, 'default state ages 61/59');
  eq(p.endAge, SARAH_TARGET_AGE + 2, 'Chad age when Sarah hits target');
  eq(p.years, 25, 'horizon years from Chad 67 to Sarah 90');
  eq(p.horizonMonths, 300, 'horizon months');
});

test('A2: override ages — ageDiff tracks state (75/61 reproduces the old 14-year world)', () => {
  const s = gatherStateWithOverrides({ chadCurrentAge: 75, sarahCurrentAge: 61 });
  const p = paramsFromGathered(s);
  eq(p.ageDiff, 14);
  eq(p.endAge, 104);
  eq(p.years, 37);
  eq(p.horizonMonths, 444, 'matches the previously hardcoded horizon');
});

test('A3: Sarah older than Chad — negative ageDiff shortens the horizon, never below 1 year', () => {
  const p1 = deriveRetirementParams({ chadCurrentAge: 60, sarahCurrentAge: 70 });
  eq(p1.ageDiff, -10);
  eq(p1.years, 13, '90 - 10 - 67');
  eq(p1.horizonMonths, 156);

  const p2 = deriveRetirementParams({ chadCurrentAge: 18, sarahCurrentAge: 100 });
  eq(p2.years, 1, 'clamped to a minimum 1-year horizon');
  eq(p2.horizonMonths, 12);
});

test('A4: missing ages fall back to the INITIAL_STATE defaults (61/59)', () => {
  const p = deriveRetirementParams({});
  eq(p.ageDiff, INITIAL_STATE.chadCurrentAge - INITIAL_STATE.sarahCurrentAge);
  eq(p.ageDiff, 2);
});

// ════════════════════════════════════════════════════════════════════════
// Section 2: sarahOwnSS is a state field (finding 2.3, New Field Checklist)
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== sarahOwnSS from state (no hardcoded 1900) ===');

test('B1: default — sarahOwnSS flows from INITIAL_STATE through gatherState (1900)', () => {
  const s = gatherStateWithOverrides();
  eq(s.sarahOwnSS, 1900, 'gatherState passes the field through');
  eq(paramsFromGathered(s).sarahOwnSS, 1900);
  eq(INITIAL_STATE.sarahOwnSS, 1900, 'initialState default');
});

test('B2: override — a saved scenario value reaches the derived params', () => {
  const s = gatherStateWithOverrides({ sarahOwnSS: 2400 });
  eq(s.sarahOwnSS, 2400);
  eq(paramsFromGathered(s).sarahOwnSS, 2400);
});

test('B3: edge — explicit 0 (no own benefit) is respected, only null/undefined fall back', () => {
  eq(deriveRetirementParams({ sarahOwnSS: 0 }).sarahOwnSS, 0, 'explicit 0 kept');
  eq(deriveRetirementParams({ sarahOwnSS: null }).sarahOwnSS, 1900, 'null falls back');
  eq(deriveRetirementParams({}).sarahOwnSS, 1900, 'missing falls back');
});

// A7 (remediation 2026-06-10, item 1.5): sarahSpousalClaimAge wired through
// deriveRetirementParams into the retirement sim's spousal gate/reduction.
test('B4: default — sarahSpousalClaimAge falls back to 67 (D9)', () => {
  eq(deriveRetirementParams({}).sarahSpousalClaimAge, 67, 'missing falls back to FRA');
  eq(deriveRetirementParams({ sarahSpousalClaimAge: null }).sarahSpousalClaimAge, 67, 'null falls back');
});

test('B5: override — state value flows through (and gatherState passes it)', () => {
  eq(deriveRetirementParams({ sarahSpousalClaimAge: 63 }).sarahSpousalClaimAge, 63);
  const s = gatherStateWithOverrides({ sarahSpousalClaimAge: 64 });
  eq(s.sarahSpousalClaimAge, 64);
  eq(deriveRetirementParams({ sarahSpousalClaimAge: s.sarahSpousalClaimAge }).sarahSpousalClaimAge, 64);
});

test('B6: edge — clamped to the SSA-valid 62–70 window', () => {
  eq(deriveRetirementParams({ sarahSpousalClaimAge: 50 }).sarahSpousalClaimAge, 62, 'below 62 clamps up');
  eq(deriveRetirementParams({ sarahSpousalClaimAge: 80 }).sarahSpousalClaimAge, 70, 'above 70 clamps down');
});

// ════════════════════════════════════════════════════════════════════════
// Section 3: SS / income derivations match the hook's documented formulas
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Chad SS / survivor SS / starting income parity ===');

test('C1: SSDI path — chadSS equals the PIA (ssFRA)', () => {
  const p = deriveRetirementParams({ ssType: 'ssdi', ssPIA: 4214 });
  eq(p.ssFRA, 4214);
  eq(p.chadSS, 4214);
  eq(p.claimedEarly, false);
  eq(p.survivorSS, 4214, 'survivor gets his full benefit');
});

test('C2: SS path — chadSS uses the earnings-test recalculated benefit', () => {
  const p = deriveRetirementParams({ ssType: 'ss', ssPIA: 4214, ssClaimAge: 62, ssMonthsWithheld: 10 });
  eq(p.chadSS, ssRecalculatedBenefit(4214, 62, 10));
});

test('C3: early SS claim — survivor benefit floors at 82.5% of PIA', () => {
  const p = deriveRetirementParams({ ssType: 'ss', ssPIA: 4214, ssClaimAge: 62 });
  eq(p.claimedEarly, true);
  eq(p.survivorSS, Math.max(p.chadSS, Math.round(4214 * 0.825)));
});

test('C4: startingCoupleIncome = chadSS + trust + J&S-reduced pension; survivor ratio constant exported', () => {
  // C14 (remediation 2026-06-10, item 3.7): the retirement engine models a
  // 50% survivor continuance, so the member benefit carries the PERS joint-
  // and-survivor option factor (~0.95): 800 × 0.95 = 760 (was 800 when the
  // model paid 100% alive AND a free 50% survivor benefit).
  const p = deriveRetirementParams({
    ssType: 'ssdi', ssPIA: 4214, trustIncomeFuture: 2083, chadJobPensionMonthly: 800,
  });
  eq(p.pensionMonthly, 760, 'J&S 50% option factor applied to the single-life accrual');
  eq(p.startingCoupleIncome, 4214 + 2083 + 760);
  eq(p.survivorSpendRatio, SURVIVOR_SPEND_RATIO);
  eq(SURVIVOR_SPEND_RATIO, 0.6);
});

test('C4b: C14 — J&S factor edge cases (zero pension stays zero; factor exported)', () => {
  eq(PERS_JS50_FACTOR, 0.95, 'documented ~0.95 J&S 50% option factor');
  const none = deriveRetirementParams({ ssType: 'ssdi', ssPIA: 4214, chadJobPensionMonthly: 0 });
  eq(none.pensionMonthly, 0, 'no pension → no reduction artifacts');
  const p = deriveRetirementParams({ ssType: 'ssdi', ssPIA: 4214, chadJobPensionMonthly: 1000 });
  eq(p.pensionMonthly, 950, '1000 × 0.95 = 950');
});

test('C4c: C14 — survivor receives 50% of the J&S-REDUCED benefit via getPensionAtMonth', () => {
  // The engine passes the reduced pensionMonthly into the retirement context;
  // getPensionAtMonth pays it in full while Chad is alive and 50% to the
  // survivor — i.e. survivor = 0.5 × 0.95 × single-life, per PERS Option 3.
  const p = deriveRetirementParams({ ssType: 'ssdi', ssPIA: 4214, chadJobPensionMonthly: 800 });
  eq(getPensionAtMonth(0, p.pensionMonthly, true), 760, 'member: 0.95 × 800');
  eq(getPensionAtMonth(0, p.pensionMonthly, false), 380, 'survivor: 0.5 × 0.95 × 800');
});

// ════════════════════════════════════════════════════════════════════════
// Section 4: two-phase band schedule scales by the user's slider (finding 2.5a)
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Two-phase schedule honors the withdrawal slider ===');

test('D1: factor = userConsumption / optimalConsumption', () => {
  eq(withdrawalScaleFactor(5000, 10000), 0.5);
  eq(withdrawalScaleFactor(12000, 10000), 1.2);
  eq(withdrawalScaleFactor(10000, 10000), 1, 'slider at optimal leaves cohort schedules untouched');
});

test('D2: factor guards — unknown/zero optimal and bad inputs fall back to 1', () => {
  eq(withdrawalScaleFactor(5000, 0), 1);
  eq(withdrawalScaleFactor(5000, -100), 1);
  eq(withdrawalScaleFactor(NaN, 10000), 1);
  eq(withdrawalScaleFactor(5000, NaN), 1);
  eq(withdrawalScaleFactor(-1, 10000), 1);
});

test('D3: schedule applies the factor to BOTH phases (the old code scaled neither)', () => {
  const schedule = buildTwoPhaseSchedule(12, 6, 8000, 5000, 0.5);
  eq(schedule.length, 12);
  eq(schedule[0], 4000, 'pre-inheritance scaled');
  eq(schedule[5], 4000, 'last pre-inheritance month scaled');
  eq(schedule[6], 2500, 'post-inheritance scaled');
  eq(schedule[11], 2500, 'tail scaled');
});

test('D4: schedule at factor 1 reproduces the raw cohort rates (band default unchanged)', () => {
  const schedule = buildTwoPhaseSchedule(4, 2, 8000, 5000);
  eq(schedule[0], 8000);
  eq(schedule[1], 8000);
  eq(schedule[2], 5000);
  eq(schedule[3], 5000);
});

// ════════════════════════════════════════════════════════════════════════
// Section 5: slider auto-sync only while pristine (finding 2.5b)
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Withdrawal slider dirty flag ===');

test('E1: pristine + historical mode + positive optimal → auto-sync', () => {
  eq(shouldAutoSyncWithdrawalRate({ isPwaMode: false, dirty: false, optimalRate: 4.2 }), true);
});

test('E2: manually-set slider (dirty) is never clobbered', () => {
  eq(shouldAutoSyncWithdrawalRate({ isPwaMode: false, dirty: true, optimalRate: 4.2 }), false);
});

test('E3: PWA mode never auto-syncs', () => {
  eq(shouldAutoSyncWithdrawalRate({ isPwaMode: true, dirty: false, optimalRate: 4.2 }), false);
});

test('E4: zero/empty optimal rate never auto-syncs (empty-pool fallback)', () => {
  eq(shouldAutoSyncWithdrawalRate({ isPwaMode: false, dirty: false, optimalRate: 0 }), false);
});

// ════════════════════════════════════════════════════════════════════════
// Section 6: computeOptimalRates — the hook's optimal-rate math, extracted
// (Phase 9). These replace the deleted source-text pseudo-test in
// __snapshots__.test.js that merely grepped the hook for 'optimalRate: 0'.
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== computeOptimalRates (pure extraction of the hook memo) ===');

// Shared synthetic fixture: real cohort count for a 300-month horizon, with
// SWR(c) = 5000 + c so the sorted order, percentile index, and worst cohort
// are all known exactly.
const HORIZON = 300;
const N_COHORTS = getNumCohorts(HORIZON);
const SYNTH_SWRS = Float64Array.from({ length: N_COHORTS }, (_, c) => 5000 + c);
// C15 (2026-06-10 item 4.3): interpolated percentile position (N−1)·0.10 —
// replaces the old nearest-rank index floor(N·0.10).
const P10_POS = (N_COHORTS - 1) * 0.10;
const POOL = 1_000_000;

test('F1: empty-pool fallback keeps every optimal-rate field numeric (replaces the source-grep test)', () => {
  for (const totalPool of [0, -1, NaN]) {
    const r = computeOptimalRates({
      cohortSWRs: SYNTH_SWRS, cohortPreSwrs: null, totalPool,
      horizonMonths: HORIZON, startingCoupleIncome: 4214,
    });
    for (const field of ['optimalRate', 'optimalMonthly', 'optimalPreRate', 'optimalPreMonthly', 'numCohorts', 'optimalConsumption', 'sliderMax']) {
      assert.ok(Number.isFinite(r[field]), `pool=${totalPool}: ${field} must be a finite number, got ${r[field]}`);
    }
    eq(r.optimalRate, 0); eq(r.optimalMonthly, 0);
    eq(r.optimalPreRate, 0); eq(r.optimalPreMonthly, 0);
    eq(r.numCohorts, 0); eq(r.sliderMax, 30);
    eq(r.worstCohort.year, 0); eq(r.cohortRange, '');
  }
});

test('F2: no cohorts (horizon beyond data) or empty SWR array -> same numeric fallback', () => {
  const tooLong = computeOptimalRates({
    cohortSWRs: SYNTH_SWRS, cohortPreSwrs: null, totalPool: POOL,
    horizonMonths: 10_000_000, startingCoupleIncome: 0,
  });
  eq(tooLong.numCohorts, 0); eq(tooLong.optimalRate, 0); eq(tooLong.sliderMax, 30);

  const noSwrs = computeOptimalRates({
    cohortSWRs: new Float64Array(0), cohortPreSwrs: null, totalPool: POOL,
    horizonMonths: HORIZON, startingCoupleIncome: 0,
  });
  eq(noSwrs.numCohorts, 0); eq(noSwrs.optimalMonthly, 0);
});

test('F3: 10th-percentile extraction, rate conversion, worst cohort, slider max', () => {
  const income = 3000;
  const r = computeOptimalRates({
    cohortSWRs: SYNTH_SWRS, cohortPreSwrs: null, totalPool: POOL,
    horizonMonths: HORIZON, startingCoupleIncome: income,
  });
  eq(r.numCohorts, N_COHORTS);
  // SWRs are already sorted ascending by construction. C15 (remediation
  // 2026-06-10 item 4.3): the extraction now uses the shared INTERPOLATED
  // percentile at position (N−1)·0.10 — with SWR(c)=5000+c that is exactly
  // 5000 + (N−1)·0.10 — not the old nearest-rank floor(N·0.10).
  const expectedConsumption = 5000 + P10_POS;
  eq(r.optimalConsumption, expectedConsumption, 'interpolated 10th percentile of sorted SWRs');
  const expectedDraw = expectedConsumption - income;
  eq(r.optimalMonthly, Math.round(expectedDraw));
  eq(r.optimalRate, Math.round(expectedDraw * 12 / POOL * 1000) / 10, 'annualized % of pool');
  // Worst cohort is index 0 (lowest SWR = 5000)
  eq(r.worstCohort.year, getCohortLabel(0).year);
  eq(r.cohortRange, `${getCohortLabel(0).year}–${getCohortLabel(N_COHORTS - 1).year}`);
  eq(r.sliderMax, Math.max(30, Math.ceil(r.optimalRate / 5) * 5 + 5));
  // No pre-inheritance schedule -> pre fields mirror the base fields
  eq(r.optimalPreRate, r.optimalRate);
  eq(r.optimalPreMonthly, r.optimalMonthly);
});

test('F4: guaranteed income above the percentile consumption clamps the draw at 0', () => {
  const r = computeOptimalRates({
    cohortSWRs: SYNTH_SWRS, cohortPreSwrs: null, totalPool: POOL,
    horizonMonths: HORIZON, startingCoupleIncome: 1_000_000,
  });
  eq(r.optimalRate, 0); eq(r.optimalMonthly, 0);
  eq(r.sliderMax, 30, 'slider max floors at 30');
});

test('F5: pre-inheritance SWRs produce their own (higher) pre-phase rate', () => {
  const preSwrs = Float64Array.from(SYNTH_SWRS, (v) => v * 1.2);
  const r = computeOptimalRates({
    cohortSWRs: SYNTH_SWRS, cohortPreSwrs: preSwrs, totalPool: POOL,
    horizonMonths: HORIZON, startingCoupleIncome: 0,
  });
  const expectedPreDraw = (5000 + P10_POS) * 1.2;
  eq(r.optimalPreMonthly, Math.round(expectedPreDraw));
  eq(r.optimalPreRate, Math.round(expectedPreDraw * 12 / POOL * 1000) / 10);
  assert.ok(r.optimalPreMonthly > r.optimalMonthly, 'pre-inheritance phase can spend more');
});

test('F6: SS configuration — pool draw backfills the gap left by the smaller early-claim benefit', () => {
  // Same household, same pool, same cohort SWRs — only the benefit type differs.
  const ssdi = deriveRetirementParams({ ssType: 'ssdi', ssPIA: 4214 });
  const ss = deriveRetirementParams({ ssType: 'ss', ssPIA: 4214, ssClaimAge: 62, ssMonthsWithheld: 0 });
  assert.ok(ss.startingCoupleIncome < ssdi.startingCoupleIncome,
    'early SS claim pays less than SSDI (which converts at full PIA)');

  const args = { cohortSWRs: SYNTH_SWRS, cohortPreSwrs: null, totalPool: POOL, horizonMonths: HORIZON };
  const rSsdi = computeOptimalRates({ ...args, startingCoupleIncome: ssdi.startingCoupleIncome });
  const rSs = computeOptimalRates({ ...args, startingCoupleIncome: ss.startingCoupleIncome });

  eq(rSs.optimalConsumption, rSsdi.optimalConsumption, 'sustainable consumption is benefit-independent');
  eq(rSs.optimalMonthly - rSsdi.optimalMonthly,
    ssdi.startingCoupleIncome - ss.startingCoupleIncome,
    'the pool draw differs by exactly the income gap');
  assert.ok(rSs.optimalRate > rSsdi.optimalRate, 'smaller benefit -> larger pool-draw rate');
});

// ════════════════════════════════════════════════════════════════════════
// Section 7: wiring guards — the hook and prop chain actually use all of this
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Wiring guards (hook + prop chain) ===');

const hookSource = fs.readFileSync(new URL('../../hooks/useRetirementSimulation.js', import.meta.url), 'utf8');
const appSource = fs.readFileSync(new URL('../../FinancialModel.jsx', import.meta.url), 'utf8');
const chartSource = fs.readFileSync(new URL('../../charts/RetirementIncomeChart.jsx', import.meta.url), 'utf8');

test('W1: hook derives its params via deriveRetirementParams (no hardcoded ageDiff/sarahOwnSS)', () => {
  assert.ok(hookSource.includes('deriveRetirementParams'), 'hook should call deriveRetirementParams');
  assert.ok(!/ageDiff\s*=\s*14/.test(hookSource), 'hardcoded ageDiff = 14 must be gone');
  assert.ok(!/sarahOwnSS\s*=\s*1900/.test(hookSource), 'hardcoded sarahOwnSS = 1900 must be gone');
});

test('W2: hook two-phase band path uses the slider scale factor', () => {
  assert.ok(hookSource.includes('withdrawalScaleFactor'), 'hook should compute the slider factor');
  assert.ok(hookSource.includes('buildTwoPhaseSchedule'), 'hook should build scaled two-phase schedules');
});

test('W3: hook gates the sync effect on the dirty flag and marks manual slider writes dirty', () => {
  assert.ok(hookSource.includes('shouldAutoSyncWithdrawalRate'), 'sync effect should use the pristine predicate');
  assert.ok(hookSource.includes('setWithdrawalRateDirty(true)'), 'manual setter should mark the slider dirty');
});

test('W4: FinancialModel passes chadCurrentAge/sarahCurrentAge/sarahOwnSS into the retirement rail props', () => {
  for (const field of ['chadCurrentAge', 'sarahCurrentAge', 'sarahOwnSS']) {
    assert.ok(
      new RegExp(`retirementRailProps[\\s\\S]{0,600}${field}`).test(appSource),
      `retirementRailProps should include ${field}`
    );
  }
});

test('W5: RetirementIncomeChart forwards the state fields into useRetirementSimulation', () => {
  const callMatch = chartSource.match(/useRetirementSimulation\(\{[\s\S]*?\}\)/);
  assert.ok(callMatch, 'chart should call useRetirementSimulation with a props object');
  for (const field of ['chadCurrentAge', 'sarahCurrentAge', 'sarahOwnSS']) {
    assert.ok(callMatch[0].includes(field), `hook call should pass ${field}`);
  }
});

// ════════════════════════════════════════════════════════════════════════
// Section 8: tax-aware retirement pool (A5 — remediation 2026-06-10 item 3.1)
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== computeRetirementPool — 401(k) tax haircut (A5) ===');

test('P1: default retirement401kTaxRate=13 haircuts the 401(k) leg before pooling', () => {
  const r = computeRetirementPool({ endSavings: 500_000, end401k: 1_000_000, homeEquity: 700_000 });
  eq(r.end401k, 1_000_000, 'gross 401k preserved for display');
  eq(r.end401kAfterTax, 870_000, '13% effective haircut (D3 default)');
  eq(r.homeSaleNet, 658_000, 'home: 6% cost factor, untaxed (§121)');
  eq(r.totalPool, 500_000 + 870_000 + 658_000, 'pool sums the AFTER-TAX 401k leg');
});

test('P2: REGRESSION — totalPool < endSavings + end401k + homeSaleNet whenever end401k > 0', () => {
  for (const rate of [undefined, 5, 13, 25, 40]) {
    for (const end401k of [1, 50_000, 478_000, 1_100_000]) {
      const r = computeRetirementPool({
        endSavings: 200_000, end401k, homeEquity: 700_000, retirement401kTaxRate: rate,
      });
      assert.ok(
        r.totalPool < r.endSavings + r.end401k + r.homeSaleNet,
        `rate=${rate} end401k=${end401k}: pool ${r.totalPool} must be < gross sum ${r.endSavings + r.end401k + r.homeSaleNet}`
      );
    }
  }
});

test('P3: override rate=0 spends the 401(k) at face value (edge)', () => {
  const r = computeRetirementPool({ endSavings: 100_000, end401k: 400_000, homeEquity: 0, retirement401kTaxRate: 0 });
  eq(r.end401kAfterTax, 400_000, 'no haircut at 0%');
  eq(r.totalPool, 500_000);
});

test('P4: rate is clamped to [0, 100] and the pool never goes negative', () => {
  const neg = computeRetirementPool({ endSavings: 0, end401k: 100_000, homeEquity: 0, retirement401kTaxRate: -20 });
  eq(neg.end401kAfterTax, 100_000, 'negative rate clamps to 0%');
  const over = computeRetirementPool({ endSavings: 0, end401k: 100_000, homeEquity: 0, retirement401kTaxRate: 250 });
  eq(over.end401kAfterTax, 0, 'rate above 100 clamps to 100%');
  const deficit = computeRetirementPool({ endSavings: -2_000_000, end401k: 100_000, homeEquity: 0 });
  eq(deficit.totalPool, 0, 'pool floors at 0');
});

test('P5: wiring — hook pools via computeRetirementPool with retirement401kTaxRate from props', () => {
  assert.ok(hookSource.includes('computeRetirementPool'), 'hook should call computeRetirementPool');
  assert.ok(hookSource.includes('retirement401kTaxRate'), 'hook should receive retirement401kTaxRate');
  assert.ok(!/totalPool = Math\.max\(0, endSavings \+ end401k \+ homeSaleNet\)/.test(hookSource),
    'the untaxed inline pool sum must be gone');
});

test('P6: wiring — FinancialModel and the chart forward retirement401kTaxRate', () => {
  assert.ok(new RegExp('retirementRailProps[\\s\\S]{0,900}retirement401kTaxRate').test(appSource),
    'retirementRailProps should include retirement401kTaxRate');
  const callMatch = chartSource.match(/useRetirementSimulation\(\{[\s\S]*?\}\)/);
  assert.ok(callMatch && callMatch[0].includes('retirement401kTaxRate'), 'hook call should pass retirement401kTaxRate');
});

// ════════════════════════════════════════════════════════════════════════
// Section 9: real-vs-nominal seam (B8 — remediation 2026-06-10 item 3.2)
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== computeRetirementPool — deflate nominal pool to today\'s dollars (B8) ===');

const B8_BALANCES = { endSavings: 500_000, end401k: 1_000_000, homeEquity: 700_000 };

test('Q1: 3% inflation over 72 months deflates the pool by (1.03)^6', () => {
  const nominal = computeRetirementPool({ ...B8_BALANCES, expenseInflation: false });
  const real = computeRetirementPool({
    ...B8_BALANCES, expenseInflation: true, expenseInflationRate: 3, monthsToRetirement: 72,
  });
  const expectedDeflator = Math.pow(1.03, 6);
  assert.ok(Math.abs(real.deflator - expectedDeflator) < 1e-12, `deflator ${real.deflator} vs ${expectedDeflator}`);
  assert.ok(real.totalPool < nominal.totalPool, 'today\'s-dollar pool must be smaller than the nominal pool');
  // Each leg deflates by the same factor (within $1 rounding), so the ratio holds.
  const ratio = nominal.totalPool / real.totalPool;
  assert.ok(Math.abs(ratio - expectedDeflator) < 0.001, `pool ratio ${ratio} should track deflator ${expectedDeflator}`);
});

test('Q2: deflation OFF when expenseInflation is off, months=0, or rate=0', () => {
  const nominal = computeRetirementPool({ ...B8_BALANCES, expenseInflation: false, expenseInflationRate: 3, monthsToRetirement: 72 });
  const m0 = computeRetirementPool({ ...B8_BALANCES, expenseInflation: true, expenseInflationRate: 3, monthsToRetirement: 0 });
  const r0 = computeRetirementPool({ ...B8_BALANCES, expenseInflation: true, expenseInflationRate: 0, monthsToRetirement: 72 });
  for (const r of [nominal, m0, r0]) {
    eq(r.deflator, 1, 'deflator must be 1');
    eq(r.totalPool, nominal.totalPool, 'pool unchanged');
  }
});

test('Q3: defaults mirror initialState (expenseInflation on, 3%/yr) when fields omitted', () => {
  const r = computeRetirementPool({ ...B8_BALANCES, monthsToRetirement: 72 });
  assert.ok(Math.abs(r.deflator - Math.pow(1.03, 6)) < 1e-12,
    'omitted toggle/rate behave like INITIAL_STATE (expenseInflation: true, expenseInflationRate: 3)');
  eq(INITIAL_STATE.expenseInflation, true, 'initialState default toggle');
  eq(INITIAL_STATE.expenseInflationRate, 3, 'initialState default rate');
});

test('Q4: wiring — hook passes the inflation fields + monthsToRetirement; rail props forward them', () => {
  assert.ok(hookSource.includes('expenseInflation'), 'hook should receive expenseInflation');
  assert.ok(hookSource.includes('expenseInflationRate'), 'hook should receive expenseInflationRate');
  assert.ok(hookSource.includes('monthsToRetirement'), 'hook should pass monthsToRetirement to the pool seam');
  assert.ok(new RegExp('retirementRailProps[\\s\\S]{0,1200}expenseInflation').test(appSource),
    'retirementRailProps should include expenseInflation');
  const callMatch = chartSource.match(/useRetirementSimulation\(\{[\s\S]*?\}\)/);
  assert.ok(callMatch && callMatch[0].includes('expenseInflation'), 'hook call should pass expenseInflation');
  assert.ok(callMatch && callMatch[0].includes('expenseInflationRate'), 'hook call should pass expenseInflationRate');
});

// ════════════════════════════════════════════════════════════════════════
// Section 10: deterministic line floor semantics + geometric mean
// (B9 + B10 — remediation 2026-06-10 items 3.3/3.4)
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== deterministicTrajectory (B9) + geometricMeanMonthly (B10) ===');

test('R1: PARITY — deterministicTrajectory matches simulatePath on a constant-return cohort', () => {
  const T = 120; // 10 years
  const r = 0.004;
  const blended = new Float64Array(T).fill(r);
  const scaling = new Float64Array(T).fill(1);
  for (let t = 60; t < T; t++) scaling[t] = 0.6; // survivor phase
  const flows = new Float64Array(T).fill(3000); // guaranteed income every month
  flows[36] += 250_000; // lump-sum inheritance via the single carrier
  const pool = 400_000;
  const floor = 100_000;
  const w = 9_000; // heavy draw — pool hits the floor before the lump sum
  const expected = simulatePath(blended, 0, T, w, flows, scaling, pool, floor).yearlyPools;
  const actual = deterministicTrajectory({
    avgMonthly: r, totalPool: pool, years: 10, baseMonthlyConsumption: w,
    scaling, supplementalFlows: flows, poolFloor: floor,
  });
  assert.deepStrictEqual(actual, expected, 'yearly pools must be identical to simulatePath semantics');
});

test('R2: at the floor, guaranteed income keeps crediting — no pinning, no rescue special case', () => {
  const T = 48;
  const scaling = new Float64Array(T).fill(1);
  const flows = new Float64Array(T).fill(0);
  for (let t = 24; t < T; t++) flows[t] = 5_000; // income starts in year 3 (> spend)
  const pools = deterministicTrajectory({
    avgMonthly: 0, totalPool: 50_000, years: 4, baseMonthlyConsumption: 4_000,
    scaling, supplementalFlows: flows, poolFloor: 0,
  });
  eq(pools[1], 2_000, 'year 1: 50k - 48k drawn');
  eq(pools[2], 0, 'year 2: clamped at the floor');
  assert.ok(pools[3] > pools[2], 'year 3: income > spend lifts the pool OFF the floor');
  eq(pools[3], 12_000, 'floor is a clamp only: 12 x (5k - 4k) credited');
});

test('R3: geometricMeanMonthly compounds below the arithmetic mean (volatility drag)', () => {
  const volatile = new Float64Array(240);
  for (let i = 0; i < volatile.length; i++) volatile[i] = (i % 2 === 0) ? 0.10 : -0.10;
  const g = geometricMeanMonthly(volatile);
  const expected = Math.sqrt(1.10 * 0.90) - 1;
  assert.ok(Math.abs(g - expected) < 1e-12, `alternating +/-10%: ${g} vs ${expected}`);
  assert.ok(g < 0, 'geometric mean is negative while the arithmetic mean is exactly 0');

  const constant = new Float64Array(100).fill(0.005);
  assert.ok(Math.abs(geometricMeanMonthly(constant) - 0.005) < 1e-12, 'constant series: geometric == arithmetic');
  eq(geometricMeanMonthly(new Float64Array(0)), 0, 'empty series -> 0');
});

test('R4: wiring — hook uses the geometric mean + shared trajectory; rescueFlows special case is gone', () => {
  assert.ok(hookSource.includes('geometricMeanMonthly'), 'hook should derive avgMonthly geometrically');
  assert.ok(hookSource.includes('deterministicTrajectory'), 'hook should use the extracted trajectory');
  assert.ok(!hookSource.includes('rescueFlows'), 'the rescueFlows special case must be deleted from the hook');
});

// ════════════════════════════════════════════════════════════════════════
// Summary
// ════════════════════════════════════════════════════════════════════════
console.log(`\n${'='.repeat(50)}`);
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'='.repeat(50)}\n`);

if (failed > 0) process.exit(1);
