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
  EMPTY_OPTIMAL_RATES,
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
import { getPensionAtMonth, getRetirementSSInfo, buildRetirementContext } from '../retirementIncome.js';
import { getNumCohorts, getCohortLabel } from '../historicalReturns.js';
import { simulatePath, computeSWR } from '../ernWithdrawal.js';
import { getPwaSummary } from '../pwaDistribution.js';
import { selectPwaWithdrawal } from '../pwaStrategies.js';
function require_ern() { return { computeSWR, simulatePath }; }
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

test('C3: early SS claim — survivor base is the PIA, RIB-LIM is a separate CAP (A1)', () => {
  // A1 (2026-06-10 retirement review): the widow(er)'s limit (RIB-LIM) is a
  // CAP applied AFTER the widow's claim-age reduction — never folded into the
  // reduction base. Base = PIA (no DRCs when claimed early); cap =
  // max(82.5% of PIA, the deceased's actual reduced benefit).
  const p = deriveRetirementParams({ ssType: 'ss', ssPIA: 4214, ssClaimAge: 62 });
  eq(p.claimedEarly, true);
  eq(p.survivorSS, 4214, 'reduction base = PIA when Chad claimed early');
  eq(p.survivorCap, Math.max(p.chadSS, Math.round(4214 * 0.825)), 'RIB-LIM cap');
});

// ── A1 (2026-06-10 retirement review): RIB-LIM ordering ──────────────────
// SSA rule: widow(er) benefit = min(widowFactor(claimAge) × base, cap) where
// base = PIA + DRCs and, when the worker claimed early, cap =
// max(82.5% × PIA, worker's actual reduced benefit). The pre-fix code baked
// the 82.5% floor into the BASE and then applied the factor — paying a
// widow-at-60 0.715 × 0.825 × PIA = 59% of PIA instead of 71.5%.

test('A1-1: widow at 60 after Chad claims 62 (PIA $4,214) pays $3,013 — not $2,486', () => {
  const p = deriveRetirementParams({
    chadCurrentAge: 61, sarahCurrentAge: 59,
    ssType: 'ss', ssPIA: 4214, ssClaimAge: 62, sarahOwnSS: 0,
  });
  eq(p.chadSS, 2950, 'claimed at 62 → 70% of PIA');
  const widow60 = getRetirementSSInfo(62, false, {
    ageDiff: 2, chadSS: p.chadSS, ssFRA: 4214, sarahOwnSS: 0,
    survivorSS: p.survivorSS, survivorCap: p.survivorCap, survivorClaimAge: 60,
  });
  // min(0.715 × 4214, max(0.825 × 4214, 2950)) = min(3013, 3477) = 3013.
  eq(widow60.amount, 3013, 'factor applies to the PIA; cap does not bind at 60');
  eq(widow60.label, 'Sarah survivor (reduced)');
});

test('A1-2: widow at FRA after Chad claims 62 — RIB-LIM cap binds at 82.5% of PIA', () => {
  const p = deriveRetirementParams({ ssType: 'ss', ssPIA: 4214, ssClaimAge: 62, sarahOwnSS: 0 });
  const widowFRA = getRetirementSSInfo(69, false, {
    ageDiff: 2, chadSS: p.chadSS, ssFRA: 4214, sarahOwnSS: 0,
    survivorSS: p.survivorSS, survivorCap: p.survivorCap, survivorClaimAge: 67,
  });
  // min(1.0 × 4214, max(3477, 2950)) = 3477 — same as the pre-fix value.
  eq(widowFRA.amount, Math.round(4214 * 0.825), 'cap binds: 82.5% of PIA');
});

test('A1-3: Chad claims 66 — cap is HIS benefit when it exceeds 82.5% of PIA', () => {
  const p = deriveRetirementParams({ ssType: 'ss', ssPIA: 4214, ssClaimAge: 66, sarahOwnSS: 0 });
  eq(p.chadSS, ssRecalculatedBenefit(4214, 66, 0), 'claimed 12 months early');
  eq(p.survivorCap, p.chadSS, 'cap = max(82.5% PIA, chadSS) = chadSS here');
  const widowFRA = getRetirementSSInfo(69, false, {
    ageDiff: 2, chadSS: p.chadSS, ssFRA: 4214, sarahOwnSS: 0,
    survivorSS: p.survivorSS, survivorCap: p.survivorCap, survivorClaimAge: 67,
  });
  eq(widowFRA.amount, p.chadSS, 'widow at FRA gets at least what Chad was receiving');
  const widow60 = getRetirementSSInfo(62, false, {
    ageDiff: 2, chadSS: p.chadSS, ssFRA: 4214, sarahOwnSS: 0,
    survivorSS: p.survivorSS, survivorCap: p.survivorCap, survivorClaimAge: 60,
  });
  eq(widow60.amount, 3013, 'factor × PIA still under the higher cap');
});

test('A1-4: Chad claimed at/after FRA — no cap; factor applies to his full benefit', () => {
  const p = deriveRetirementParams({ ssType: 'ss', ssPIA: 4214, ssClaimAge: 67, sarahOwnSS: 0 });
  eq(p.claimedEarly, false);
  eq(p.survivorSS, p.chadSS, 'base = his benefit (incl. DRCs)');
  eq(p.survivorCap, Infinity, 'no RIB-LIM when claimed at/after FRA');
  const widow60 = getRetirementSSInfo(62, false, {
    ageDiff: 2, chadSS: p.chadSS, ssFRA: 4214, sarahOwnSS: 0,
    survivorSS: p.survivorSS, survivorCap: p.survivorCap, survivorClaimAge: 60,
  });
  eq(widow60.amount, Math.round(p.chadSS * 0.715), '71.5% of his benefit');
});

test('A1-5: SSDI path unchanged — base = PIA, no cap (default scenario regression)', () => {
  const p = deriveRetirementParams({ ssType: 'ssdi', ssPIA: 4214 });
  eq(p.survivorSS, 4214);
  eq(p.survivorCap, Infinity);
});

// ── A2 (2026-06-10 retirement review): delayed claiming gates the benefit ──
// The couple branch paid chadSS unconditionally from t=0 (age 67), so a
// claim age of 68–70 paid the DRC-inflated benefit 1–3 years before SSA
// would. Years 67→claim must be pool-financed.

test('A2-1: ssClaimAge=70 → $0 Chad SS at 67-69, $5,225 (124% PIA) from 70', () => {
  const p = deriveRetirementParams({
    chadCurrentAge: 61, sarahCurrentAge: 59,
    ssType: 'ss', ssPIA: 4214, ssClaimAge: 70, sarahOwnSS: 0,
  });
  eq(p.chadSS, 5225, 'DRC benefit: round(4214 × 1.24)');
  eq(p.chadSSStartAge, 70, 'benefit starts at the claim age');
  for (const age of [67, 68, 69]) {
    const info = getRetirementSSInfo(age, true, {
      ageDiff: 2, chadSS: p.chadSS, ssFRA: 4214, sarahOwnSS: 0,
      survivorSS: p.survivorSS, survivorCap: p.survivorCap,
      sarahSpousalClaimAge: 67, chadSSStartAge: p.chadSSStartAge,
    });
    eq(info.amount, 0, `age ${age}: nothing payable before the age-70 claim`);
  }
  // sarahSpousalClaimAge 70 keeps her spousal out of frame at chadAge 70
  // (sarahAge 68) so the assertion isolates Chad's benefit.
  const at70 = getRetirementSSInfo(70, true, {
    ageDiff: 2, chadSS: p.chadSS, ssFRA: 4214, sarahOwnSS: 0,
    survivorSS: p.survivorSS, survivorCap: p.survivorCap,
    sarahSpousalClaimAge: 70, chadSSStartAge: p.chadSSStartAge,
  });
  eq(at70.amount, 5225, 'full DRC benefit from 70');
  eq(at70.label, 'Chad only');
});

test('A2-2: buildRetirementContext — ssIncome is 0 for months 0-35, paid from month 36 (claim 70)', () => {
  const p = deriveRetirementParams({
    chadCurrentAge: 61, sarahCurrentAge: 59,
    ssType: 'ss', ssPIA: 4214, ssClaimAge: 70, sarahOwnSS: 0,
  });
  const ctx = buildRetirementContext({
    horizonMonths: 60, chadPassesAge: 95, ageDiff: 2, survivorSpendRatio: 0.6,
    chadSS: p.chadSS, ssFRA: 4214, sarahOwnSS: 0,
    survivorSS: p.survivorSS, survivorCap: p.survivorCap,
    sarahSpousalClaimAge: 70, chadSSStartAge: p.chadSSStartAge,
    trustMonthly: 0, pensionMonthly: 0,
  });
  eq(ctx.ssIncome[0], 0, 'month 0 (age 67): not yet claimed');
  eq(ctx.ssIncome[35], 0, 'month 35 (age 69.92): not yet claimed');
  eq(ctx.ssIncome[36], 5225, 'month 36 (age 70): claim starts');
});

test('A2-3: startingCoupleIncome excludes Chad SS when the claim is after 67', () => {
  const late = deriveRetirementParams({
    ssType: 'ss', ssPIA: 4214, ssClaimAge: 70, sarahOwnSS: 0,
    trustIncomeFuture: 2083, chadJobPensionMonthly: 800,
  });
  eq(late.startingCoupleIncome, 2083 + 760, 'trust + pension only at the seam');
  const fra = deriveRetirementParams({
    ssType: 'ss', ssPIA: 4214, ssClaimAge: 67, sarahOwnSS: 0,
    trustIncomeFuture: 2083, chadJobPensionMonthly: 800,
  });
  eq(fra.startingCoupleIncome, fra.chadSS + 2083 + 760, 'claim ≤ 67: in payment at the seam');
  const ssdi = deriveRetirementParams({ ssType: 'ssdi', ssPIA: 4214, trustIncomeFuture: 2083 });
  eq(ssdi.startingCoupleIncome, 4214 + 2083, 'SSDI converts at FRA — in payment');
});

test('A2-4: spousal requires the worker to be entitled — nothing before Chad files', () => {
  // Chad claims at 70; Sarah elected spousal at 62 (her own benefit 0). The
  // spousal benefit is payable only once Chad is entitled — and the reduction
  // is measured at her age when it BEGINS (68 here → no reduction), not at
  // her earlier election age.
  const p = deriveRetirementParams({
    chadCurrentAge: 61, sarahCurrentAge: 59,
    ssType: 'ss', ssPIA: 4214, ssClaimAge: 70, sarahOwnSS: 0, sarahSpousalClaimAge: 62,
  });
  const before = getRetirementSSInfo(69, true, {
    ageDiff: 2, chadSS: p.chadSS, ssFRA: 4214, sarahOwnSS: 0,
    survivorSS: p.survivorSS, survivorCap: p.survivorCap,
    sarahSpousalClaimAge: 62, chadSSStartAge: p.chadSSStartAge,
  });
  eq(before.amount, 0, 'no spousal while Chad is unentitled');
  const after = getRetirementSSInfo(70, true, {
    ageDiff: 2, chadSS: p.chadSS, ssFRA: 4214, sarahOwnSS: 0,
    survivorSS: p.survivorSS, survivorCap: p.survivorCap,
    sarahSpousalClaimAge: 62, chadSSStartAge: p.chadSSStartAge,
  });
  eq(after.amount, 5225 + Math.round(4214 * 0.5),
    'spousal begins with his entitlement at her age 68 → unreduced ceiling');
});

// ── Item 7 (2026-06-10 batch 2): keep-the-house toggle + imputed rent ──────
// retKeepHouse excludes the home-sale proceeds from the retirement pool (the
// old model ALWAYS liquidated at the seam with no lever); retImputedRentSaved
// credits the avoided rent as guaranteed income in BOTH phases (the survivor
// keeps living there).

test('K1: keepHouse excludes homeSaleNet from the pool; default (false) unchanged', () => {
  const sold = computeRetirementPool({ endSavings: 500_000, end401k: 0, homeEquity: 700_000 });
  eq(sold.homeSaleNet, Math.round(700_000 * 0.94), 'default: sale net of 6% costs');
  eq(sold.totalPool, 500_000 + Math.round(700_000 * 0.94));
  const kept = computeRetirementPool({ endSavings: 500_000, end401k: 0, homeEquity: 700_000, keepHouse: true });
  eq(kept.homeSaleNet, 0, 'kept: no sale proceeds');
  eq(kept.totalPool, 500_000, 'pool excludes the house');
});

test('K2: imputed rent joins startingCoupleIncome ONLY when the house is kept', () => {
  const sold = deriveRetirementParams({ ssType: 'ssdi', ssPIA: 4214, trustIncomeFuture: 2000, retKeepHouse: false, retImputedRentSaved: 3000 });
  eq(sold.imputedRentMonthly, 0, 'selling: no imputed rent');
  eq(sold.startingCoupleIncome, 4214 + 2000);
  const kept = deriveRetirementParams({ ssType: 'ssdi', ssPIA: 4214, trustIncomeFuture: 2000, retKeepHouse: true, retImputedRentSaved: 3000 });
  eq(kept.imputedRentMonthly, 3000);
  eq(kept.startingCoupleIncome, 4214 + 2000 + 3000);
});

test('K3: imputed rent flows through guaranteed income in couple AND survivor phases', () => {
  const ctx = buildRetirementContext({
    horizonMonths: 240, chadPassesAge: 74, ageDiff: 2, survivorSpendRatio: 0.6,
    chadSS: 4214, ssFRA: 4214, sarahOwnSS: 0, survivorSS: 4214, survivorCap: Infinity,
    chadSSStartAge: 67, sarahSpousalClaimAge: 67,
    trustMonthly: 2000, pensionMonthly: 0, imputedRentMonthly: 3000,
  });
  const noRent = buildRetirementContext({
    horizonMonths: 240, chadPassesAge: 74, ageDiff: 2, survivorSpendRatio: 0.6,
    chadSS: 4214, ssFRA: 4214, sarahOwnSS: 0, survivorSS: 4214, survivorCap: Infinity,
    chadSSStartAge: 67, sarahSpousalClaimAge: 67,
    trustMonthly: 2000, pensionMonthly: 0,
  });
  eq(ctx.guaranteedIncome[0] - noRent.guaranteedIncome[0], 3000, 'couple phase credits the rent');
  eq(ctx.guaranteedIncome[120] - noRent.guaranteedIncome[120], 3000, 'survivor phase keeps the rent (house persists)');
  eq(ctx.imputedRentIncome[0], 3000, 'exposed as its own component (not folded into trust)');
});

// ── Item 8 (2026-06-10 batch 2): survivor-phase tax drag ───────────────────
// After Chad passes, Sarah files SINGLE - the same real income lands in
// higher brackets, so each NET dollar of survivor spending financed from the
// pool costs 1/(1-drag) gross. Implemented as a uniform gross-up of the
// survivor-phase pool-dynamics carriers (scaling AND supplementalFlows), so
// the closed-form SWR <-> simulatePath round-trip is preserved by
// construction. Engine-level default is 0 (direct callers unchanged); the
// state default (7%) flows through deriveRetirementParams.

test('TD1: deriveRetirementParams - survivorTaxDragPct defaults to 7, clamps 0-30, keeps explicit 0', () => {
  eq(deriveRetirementParams({}).survivorTaxDragPct, 7, 'state default');
  eq(deriveRetirementParams({ retSurvivorTaxDragPct: 0 }).survivorTaxDragPct, 0, 'explicit 0 respected');
  eq(deriveRetirementParams({ retSurvivorTaxDragPct: 50 }).survivorTaxDragPct, 30, 'clamped to 30');
  eq(deriveRetirementParams({ retSurvivorTaxDragPct: -5 }).survivorTaxDragPct, 0, 'clamped to 0');
});

test('TD2: drag grosses up survivor-phase scaling + flows; displayed income stays NET', () => {
  const base = {
    horizonMonths: 240, chadPassesAge: 74, ageDiff: 2, survivorSpendRatio: 0.6,
    chadSS: 4214, ssFRA: 4214, sarahOwnSS: 0, survivorSS: 4214, survivorCap: Infinity,
    chadSSStartAge: 67, sarahSpousalClaimAge: 67,
    trustMonthly: 2000, pensionMonthly: 0,
  };
  const dragged = buildRetirementContext({ ...base, survivorTaxDragPct: 10 });
  const flat = buildRetirementContext(base);
  // Couple phase (t=0): untouched.
  eq(dragged.scaling[0], 1, 'couple scaling unchanged');
  eq(dragged.supplementalFlows[0], flat.supplementalFlows[0], 'couple flows unchanged');
  // Survivor phase (t=120): scaling and flows grossed up by 1/(1-0.10).
  assert.ok(Math.abs(dragged.scaling[120] - 0.6 / 0.9) < 1e-12, 'survivor scaling = ratio/(1-d)');
  assert.ok(Math.abs(dragged.supplementalFlows[120] - flat.supplementalFlows[120] / 0.9) < 1e-9,
    'survivor flows grossed up symmetrically (documented approximation)');
  eq(dragged.guaranteedIncome[120], flat.guaranteedIncome[120], 'DISPLAYED income stays net');
  // Engine default 0 = identity (direct callers / old snapshots unchanged).
  eq(flat.scaling[120], 0.6);
});

test('TD3: closed-form SWR round-trips through simulatePath WITH the drag applied', () => {
  const ctx = buildRetirementContext({
    horizonMonths: 120, chadPassesAge: 72, ageDiff: 2, survivorSpendRatio: 0.6,
    chadSS: 3000, ssFRA: 4214, sarahOwnSS: 0, survivorSS: 4214, survivorCap: Infinity,
    chadSSStartAge: 67, sarahSpousalClaimAge: 67,
    trustMonthly: 1000, pensionMonthly: 0, survivorTaxDragPct: 15,
  });
  const blended = new Float64Array(600).fill(0.003);
  const { computeSWR: swr, simulatePath: sim } = require_ern();
  const w = swr(blended, 0, 120, ctx.supplementalFlows, ctx.scaling, 50000, 800000);
  const path = sim(blended, 0, 120, w, ctx.supplementalFlows, ctx.scaling, 800000, 0);
  assert.ok(Math.abs(path.finalPool - 50000) < 2, `round-trip hits targetFV, got ${path.finalPool}`);
});

// ── Item 9 (2026-06-10 batch 2): survivor-spend ratio + horizon sliders ────
// SURVIVOR_SPEND_RATIO (0.6) and SARAH_TARGET_AGE (90) were constants; both
// are judgment calls Chad wants to flex. State fields with the old constants
// as defaults; the exported constants remain the fallback values.

test('TS1: retSurvivorSpendRatio - default 60%, clamps 40-100, drives the scaling', () => {
  eq(deriveRetirementParams({}).survivorSpendRatio, 0.6, 'default = old constant');
  eq(deriveRetirementParams({ retSurvivorSpendRatio: 75 }).survivorSpendRatio, 0.75);
  eq(deriveRetirementParams({ retSurvivorSpendRatio: 10 }).survivorSpendRatio, 0.4, 'clamped to 40%');
  eq(deriveRetirementParams({ retSurvivorSpendRatio: 150 }).survivorSpendRatio, 1, 'clamped to 100%');
});

test('TS2: retSarahTargetAge - default 90, clamps 80-100, drives the horizon', () => {
  const d = deriveRetirementParams({ chadCurrentAge: 61, sarahCurrentAge: 59 });
  eq(d.sarahTargetAge, 90, 'default = old constant');
  eq(d.years, 25, '90 + 2 - 67');
  const long = deriveRetirementParams({ chadCurrentAge: 61, sarahCurrentAge: 59, retSarahTargetAge: 95 });
  eq(long.sarahTargetAge, 95);
  eq(long.years, 30, '95 + 2 - 67');
  eq(long.horizonMonths, 360);
  eq(deriveRetirementParams({ retSarahTargetAge: 70 }).sarahTargetAge, 80, 'clamped to 80');
  eq(deriveRetirementParams({ retSarahTargetAge: 120 }).sarahTargetAge, 100, 'clamped to 100');
});

// ── Item 10 (2026-06-10 batch 2, PWA review finding 1): band semantics ─────
// Pre-fix, inheritance-mode bands ran EACH cohort at its own closed-form
// schedule (scaled), so (a) the percentiles answered a different question
// than the no-inheritance bands, and (b) bad cohorts with NEGATIVE SWRs
// quietly DEPOSITED money, propping up exactly the low percentiles the
// chart highlights. Now: one shared user pre/post schedule, clamped at 0.

test('BT1: buildTwoPhaseSchedule clamps negative spending at 0 (no phantom deposits)', () => {
  const sched = buildTwoPhaseSchedule(6, 3, -2000, 5000, 1);
  for (let t = 0; t < 3; t++) eq(sched[t], 0, `pre month ${t} clamped`);
  for (let t = 3; t < 6; t++) eq(sched[t], 5000, `post month ${t}`);
  const negFactor = buildTwoPhaseSchedule(4, 2, 1000, -500, 2);
  eq(negFactor[0], 2000);
  eq(negFactor[3], 0, 'negative post rate clamped');
});

test('BT2: computeOptimalRates exposes optimalPreConsumption (uniform band schedule input)', () => {
  const empty = computeOptimalRates({ cohortSWRs: new Float64Array(0), cohortPreSwrs: null, totalPool: 0, horizonMonths: 300, startingCoupleIncome: 0 });
  eq(empty.optimalPreConsumption, 0, 'empty fallback stays numeric');
  assert.ok('optimalPreConsumption' in EMPTY_OPTIMAL_RATES, 'EMPTY shape includes the field');
});


// ── Item 11 (2026-06-10 batch 2, PWA review findings 4/6/7): hardening ─────

test('H1: PWA selection values clamp at 0 (tiny pool / long horizon never shows negative $/mo)', () => {
  const allNegative = Float64Array.from([-4000, -3000, -2000, -1000]);
  const summary = getPwaSummary(allNegative, { selectedPercentile: 50, lowerTolerancePercentile: 25, upperTolerancePercentile: 75 });
  eq(summary.selectedWithdrawal, 0, 'selected clamped');
  eq(summary.lowerToleranceWithdrawal, 0, 'lower band clamped');
  eq(summary.median, 0, 'median clamped');
  eq(summary.upperToleranceWithdrawal, 0, 'upper band clamped');
  eq(summary.min, -4000, 'raw distribution min preserved for display');
});

test('H2: selectPwaWithdrawal normalizes an inverted tolerance band internally', () => {
  const dist = Float64Array.from([1000, 2000, 3000, 4000, 5000]);
  const inverted = selectPwaWithdrawal(dist, {
    strategy: 'sticky_median', previousWithdrawal: 3000,
    basePercentile: 50, lowerTolerancePercentile: 75, upperTolerancePercentile: 25,
  });
  assert.ok(inverted.lowerTolerancePercentile <= inverted.upperTolerancePercentile,
    'band normalized lo<=hi');
  eq(inverted.reason, 'keep_within_band', 'previous 3000 sits inside the normalized 25-75 band');
});

test('H4: sliderMax caps at 100% (tiny pool + big income no longer explodes the slider)', () => {
  const r = computeOptimalRates({
    cohortSWRs: Float64Array.from([20000, 21000, 22000, 23000]),
    cohortPreSwrs: null, totalPool: 10000, horizonMonths: 24, startingCoupleIncome: 0,
  });
  assert.ok(r.optimalRate > 100, `precondition: optimal rate is huge (${r.optimalRate}%)`);
  eq(r.sliderMax, 100, 'capped');
});

// ── Item 14 / B1 (2026-06-10 batch 2): derived retirement start age ────────
// The engine hardcoded t=0 = Chad-67, but the pool is taken at the END of
// the variable-length accumulation (max of chadWorkMonths/sarahWorkMonths +
// the vest tail). With sarahWorkMonths 96 the seam is Chad ~69 — every age
// label, the survivor start month, the SS gates and the Sarah-90 horizon
// were shifted. retirementStartAge = round(chadCurrentAge + endIdx/12) now
// anchors everything; default 67 keeps direct callers identical.

test('B1-1: deriveRetirementParams — horizon anchors at retirementStartAge (default 67)', () => {
  const d = deriveRetirementParams({ chadCurrentAge: 61, sarahCurrentAge: 59 });
  eq(d.retirementStartAge, 67, 'default anchor');
  eq(d.years, 25, '90 + 2 - 67');
  const late = deriveRetirementParams({ chadCurrentAge: 61, sarahCurrentAge: 59, retirementStartAge: 69 });
  eq(late.retirementStartAge, 69);
  eq(late.years, 23, '90 + 2 - 69: a later seam shortens the sim horizon');
  eq(late.horizonMonths, 276);
});

test('B1-2: buildRetirementContext — ages, survivor start, and SS gates anchor at the seam age', () => {
  const base = {
    horizonMonths: 120, chadPassesAge: 74, ageDiff: 2, survivorSpendRatio: 0.6,
    chadSS: 5225, ssFRA: 4214, sarahOwnSS: 0, survivorSS: 5225, survivorCap: Infinity,
    chadSSStartAge: 70, sarahSpousalClaimAge: 70,
    trustMonthly: 0, pensionMonthly: 0,
  };
  const ctx69 = buildRetirementContext({ ...base, retirementStartAge: 69 });
  eq(ctx69.chadAges[0], 69, 't=0 is the seam age, not 67');
  eq(ctx69.sarahAges[0], 67);
  eq(ctx69.survivorStartMonth, (74 - 69) * 12, 'survivor phase anchored at the seam');
  eq(ctx69.phases[59], 'couple');
  eq(ctx69.phases[60], 'survivor');
  // A2 interplay: claim-70 starts at month (70-69)*12 = 12, not 36.
  eq(ctx69.ssIncome[11], 0, 'age 69.9: not yet claimed');
  eq(ctx69.ssIncome[12], 5225, 'age 70: claim starts — measured from the seam age');
  // Default stays bit-identical to the old literal-67 behavior.
  const ctx67 = buildRetirementContext(base);
  eq(ctx67.chadAges[0], 67);
  eq(ctx67.survivorStartMonth, (74 - 67) * 12);
  eq(ctx67.ssIncome[35], 0);
  eq(ctx67.ssIncome[36], 5225);
});

// ── A3 (2026-06-10 retirement review): sarahSpousalEnabled reaches this engine ──
// The "Model Sarah's spousal benefit" toggle gated the ACCUMULATION engine
// (projection.js / gatherState) but the retirement sim kept paying her
// spousal top-up regardless — a cross-engine display-parity gap.

test('A3-1: spousal toggle off (own benefit 0) → Chad-only SS in retirement income', () => {
  const p = deriveRetirementParams({
    ssType: 'ssdi', ssPIA: 4214, sarahOwnSS: 0, sarahSpousalEnabled: false,
  });
  eq(p.sarahSpousalEnabled, false, 'flag flows through the derived params');
  const info = getRetirementSSInfo(81, true, {
    ageDiff: 14, chadSS: p.chadSS, ssFRA: 4214, sarahOwnSS: 0,
    survivorSS: p.survivorSS, survivorCap: p.survivorCap,
    chadSSStartAge: p.chadSSStartAge, sarahSpousalClaimAge: 67,
    sarahSpousalEnabled: p.sarahSpousalEnabled,
  });
  eq(info.amount, 4214, 'Chad only — no spousal top-up');
  eq(info.label, 'Chad only');
});

test('A3-2: spousal toggle off — Sarah\'s OWN record still pays from her claim age', () => {
  const info = getRetirementSSInfo(81, true, {
    ageDiff: 14, chadSS: 4214, ssFRA: 4214, sarahOwnSS: 1900,
    survivorSS: 4214, survivorCap: Infinity,
    chadSSStartAge: 67, sarahSpousalClaimAge: 67,
    sarahSpousalEnabled: false,
  });
  eq(info.amount, 4214 + 1900, 'own record unaffected by the spousal toggle');
  eq(info.label, 'Chad + Sarah own record');
});

test('A3-3: toggle absent/true → spousal top-up unchanged (back-compat default)', () => {
  const base = {
    ageDiff: 14, chadSS: 4214, ssFRA: 4214, sarahOwnSS: 0,
    survivorSS: 4214, survivorCap: Infinity,
    chadSSStartAge: 67, sarahSpousalClaimAge: 67,
  };
  const absent = getRetirementSSInfo(81, true, base);
  eq(absent.amount, 4214 + Math.round(4214 * 0.5), 'absent flag pays spousal');
  const on = getRetirementSSInfo(81, true, { ...base, sarahSpousalEnabled: true });
  eq(on.amount, 4214 + Math.round(4214 * 0.5), 'explicit true pays spousal');
  const off = deriveRetirementParams({});
  eq(off.sarahSpousalEnabled, true, 'derived default is enabled (matches gatherState !== false)');
});

test('A3-4: survivor benefits are NOT gated by the spousal toggle (different SSA benefit)', () => {
  const info = getRetirementSSInfo(82, false, {
    ageDiff: 14, chadSS: 4214, ssFRA: 4214, sarahOwnSS: 0,
    survivorSS: 4214, survivorCap: Infinity, survivorClaimAge: 67,
    sarahSpousalEnabled: false,
  });
  eq(info.amount, 4214, 'widow benefit unaffected');
});

test('A4: one consistent ssClaimAge fallback (62 — the state default)', () => {
  // Pre-fix, chadSS fell back to claimed-at-62 (70% PIA) while claimedEarly
  // fell back to 67 (false) — skipping the RIB-LIM cap entirely.
  const p = deriveRetirementParams({ ssType: 'ss', ssPIA: 4214 });
  eq(p.claimAge, 62, 'single fallback');
  eq(p.chadSS, 2950, 'benefit computed at the same fallback age');
  eq(p.claimedEarly, true, 'claimed-early flag agrees with the benefit math');
  eq(p.survivorCap, Math.max(2950, Math.round(4214 * 0.825)), 'RIB-LIM cap present');
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

test('W3: pool-draw auto-sync is gated on the pristine predicate; dirtiness = non-null state (B3)', () => {
  // B3 (2026-06-10 retirement review): the dirty flag is now structural -
  // retWithdrawalRate is a nullable MODEL_KEY (null = pristine -> derive the
  // optimal rate; number = manual value sticks). The old setState-based sync
  // effect would have clobbered a freshly LOADED scenario's saved rate.
  assert.ok(hookSource.includes('shouldAutoSyncWithdrawalRate'), 'derivation should use the pristine predicate');
  assert.ok(/withdrawalRateDirty\s*=\s*retWithdrawalRate\s*!=\s*null/.test(hookSource),
    'dirtiness must derive from the nullable persisted field');
  assert.ok(!hookSource.includes('setWithdrawalRateDirty'), 'the local dirty useState must be gone');
});

test('W8: B3 - chart assumptions are state-backed (no local useState; reducer-written)', () => {
  const fields = ['retChadPassesAge', 'retEquityAllocation', 'retWithdrawalRate', 'retPoolFloor',
    'retBequestTarget', 'retInheritanceAmount', 'retInheritanceSarahAge', 'retPwaStrategy'];
  for (const f of fields) {
    assert.ok(new RegExp(`retirementRailProps[\\s\\S]{0,2500}${f}`).test(appSource),
      `retirementRailProps should include ${f}`);
    assert.ok(hookSource.includes(f), `hook should consume ${f}`);
  }
  assert.ok(/retirementRailProps[\s\S]{0,2500}onFieldChange:\s*set/.test(appSource),
    'rail props should carry the reducer writer');
  for (const gone of ["useState(82)", "useState(1000000)", "useState(4)", "useState('sticky_median')"]) {
    assert.ok(!hookSource.includes(gone), `local ${gone} must be gone from the hook`);
  }
  // INITIAL_STATE defaults mirror the old hook defaults exactly.
  assert.strictEqual(INITIAL_STATE.retChadPassesAge, 82);
  assert.strictEqual(INITIAL_STATE.retEquityAllocation, 60);
  assert.strictEqual(INITIAL_STATE.retWithdrawalRate, null);
  assert.strictEqual(INITIAL_STATE.retPoolFloor, 0);
  assert.strictEqual(INITIAL_STATE.retBequestTarget, 0);
  assert.strictEqual(INITIAL_STATE.retInheritanceAmount, 1000000);
  assert.strictEqual(INITIAL_STATE.retInheritanceSarahAge, 60);
  assert.strictEqual(INITIAL_STATE.retPwaStrategy, 'sticky_median');
});

test('BT3: hook bands simulate ONE shared user schedule, not per-cohort closed forms', () => {
  assert.ok(!hookSource.includes('cohortPreSwrs[c], cohortSWRs[c]'),
    'per-cohort schedules must be gone from the band loop');
  assert.ok(hookSource.includes('optimalPreConsumption'),
    'shared schedule derives from the optimal pre-consumption x the slider factor');
});


test('W4: FinancialModel passes chadCurrentAge/sarahCurrentAge/sarahOwnSS/sarahSpousalEnabled into the retirement rail props', () => {
  for (const field of ['chadCurrentAge', 'sarahCurrentAge', 'sarahOwnSS', 'sarahSpousalEnabled']) {
    assert.ok(
      new RegExp(`retirementRailProps[\\s\\S]{0,600}${field}`).test(appSource),
      `retirementRailProps should include ${field}`
    );
  }
});

test('W5: RetirementIncomeChart forwards the state fields into useRetirementSimulation', () => {
  const callMatch = chartSource.match(/useRetirementSimulation\(\{[\s\S]*?\}\)/);
  assert.ok(callMatch, 'chart should call useRetirementSimulation with a props object');
  for (const field of ['chadCurrentAge', 'sarahCurrentAge', 'sarahOwnSS', 'sarahSpousalEnabled']) {
    assert.ok(callMatch[0].includes(field), `hook call should pass ${field}`);
  }
});

test('W6: B2 — pre-retirement inheritance renders a visible "not modeled" warning chip', () => {
  // 2026-06-10 retirement review B2: since ageDiff became state-derived (2,
  // not the old hardcoded 14), the DEFAULT $1M inheritance at Sarah-60 lands
  // BEFORE the retirement seam (inheritanceYear < 0) and is silently excluded
  // from every flow — with no marker and no callout. The chart must surface
  // an explicit warning instead of letting the sliders silently do nothing.
  assert.ok(chartSource.includes('inheritance lands before retirement'),
    'chart should render the pre-retirement inheritance warning copy');
  assert.ok(chartSource.includes('retirement-inheritance-before-seam'),
    'warning chip should carry a testId');
  assert.ok(/hasInheritance\s*&&\s*inheritanceYear\s*<\s*0/.test(chartSource),
    'chip must be gated on an inheritance that lands before the seam');
});


test('W7: D1 — sarahOwnSS is editable from IncomeControls and flows through the prop bundle', () => {
  const incomeControlsSource = fs.readFileSync(new URL('../../panels/IncomeControls.jsx', import.meta.url), 'utf8');
  const bundlesSource = fs.readFileSync(new URL('../../hooks/useChartPropBundles.js', import.meta.url), 'utf8');
  assert.ok(incomeControlsSource.includes("set('sarahOwnSS')"),
    'IncomeControls should bind a slider to sarahOwnSS');
  assert.ok(/incomeControlsProps[\s\S]{0,900}sarahOwnSS/.test(bundlesSource),
    'incomeControlsProps should pass sarahOwnSS');
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
