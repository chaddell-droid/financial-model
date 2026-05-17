import { computeProjection, findOperationalBreakevenIndex } from './projection.js';
import { gatherState } from '../state/gatherState.js';
import { evaluateAllGoals } from './goalEvaluation.js';

/**
 * "Your Top 3 Moves" / Sensitivity analysis.
 *
 * Two tiers:
 *  • Tier 1 — computeTopMoves(state): ranks inactive Primary Levers (built-in +
 *    customLevers) by how much ACTIVATING them would improve the plan. Each
 *    result is an actionable click on the Decision Console.
 *  • Tier 2 — computeSensitivities(state): small parameter sweep for awareness
 *    (investment return, inflation, MSFT growth). Context, not actions.
 *
 * Impact metrics:
 *  • finalBalanceDelta — ending-horizon savings change (baseline vs. test)
 *  • breakevenMonthDelta — signed months; negative = earlier breakeven (good),
 *    positive = later (bad). Uses findOperationalBreakevenIndex.
 *
 * Score: finalBalanceDelta + (months-earlier-breakeven) × $5,000/month.
 * Filter: return only candidates that improve on at least one axis.
 */

export const BREAKEVEN_MULTIPLIER = 5000; // $5k/month weighted to equal 1 quarter earlier breakeven
const HORIZON_SENTINEL_MONTHS = 72; // cap used when a scenario never breaks even

// Each unit of normalized goal-progress improvement is worth this much
// "score" — calibrated so a single goal flipping from missed (progress=0)
// to met (progress=1) outweighs a $250K final-balance bump on its own.
export const GOAL_PROGRESS_MULTIPLIER = 250000;

/**
 * Compute the goal-aware score boost for a state vs baseline.
 * Returns 0 when state.goals is missing or empty (engine falls back to the
 * hardcoded composite score in that case).
 *
 * Goal evaluation reads monthly balance, cash flow, net worth, and retireDebt
 * — see goalEvaluation.js for the per-goal-type metric.
 */
export function computeGoalProgressDelta(baseGoalsEval, testProj, testState) {
  if (!Array.isArray(baseGoalsEval) || baseGoalsEval.length === 0) return 0;
  const testEval = evaluateAllGoals(
    testState.goals || [],
    testProj.monthlyData,
    { wealthData: testProj.monthlyData, retireDebt: !!testState.retireDebt },
  );
  let totalDelta = 0;
  for (let i = 0; i < testEval.length; i++) {
    const before = baseGoalsEval[i]?.progress ?? 0;
    const after = testEval[i]?.progress ?? 0;
    totalDelta += (after - before);
  }
  return totalDelta;
}

// ─── Tier 2: parameter-sensitivity sweeps ───
// Kept intentionally small — these are awareness items, not action items.
const SENSITIVITY_SWEEPS = [
  { key: 'investmentReturn', label: 'Boost investment return', unit: '%', delta: 3 },
  { key: 'expenseInflationRate', label: 'Lower inflation rate', unit: '%', delta: -1 },
  { key: 'msftGrowth', label: 'MSFT price growth', unit: '%', delta: 5 },
];

/**
 * Build the list of lever-activation candidates from the baseline state.
 * Only returns INACTIVE levers — already-active levers are excluded.
 */
export function buildLeverCandidates(state) {
  const candidates = [];

  // 1. Retire all debt
  if (!state.retireDebt) {
    candidates.push({
      id: 'retire_debt',
      label: 'Retire all debt',
      unit: '$/mo',
      monthlyImpact: state.debtService || 0,
      mutation: { retireDebt: true },
    });
  }

  // 2. Apply spending cuts — projection uses existing cuts values when toggled on
  if (!state.lifestyleCutsApplied) {
    const override = state.cutsOverride;
    const individual = (state.cutOliver || 0) + (state.cutVacation || 0) + (state.cutGym || 0)
                     + (state.cutMedical || 0) + (state.cutShopping || 0) + (state.cutSaaS || 0)
                     + (state.cutAmazon || 0) + (state.cutEntertainment || 0) + (state.cutGroceries || 0)
                     + (state.cutPersonalCare || 0) + (state.cutSmallItems || 0);
    const effectiveCuts = override != null ? override : (individual > 0 ? individual : 800);
    candidates.push({
      id: 'spending_cuts',
      label: 'Apply lifestyle + spending cuts',
      unit: '$/mo',
      monthlyImpact: effectiveCuts,
      mutation: override != null
        ? { lifestyleCutsApplied: true }
        : { lifestyleCutsApplied: true, cutsOverride: effectiveCuts },
    });
  }

  // 3. Sell the van
  if (!state.vanSold) {
    candidates.push({
      id: 'sell_van',
      label: 'Sell the van',
      unit: '$/mo',
      monthlyImpact: state.vanMonthlySavings || 0,
      mutation: { vanSold: true, vanSaleMonth: state.vanSaleMonth ?? 12 },
    });
  }

  // 4. BCS fully covered by external source — propose only if there's room above
  //    current contribution. Semantics: bcsParentsAnnual = contribution from
  //    grandparents / financial aid. Family share = (total − parents) / 12.
  //    So raising bcsParentsAnnual to the full tuition REDUCES family share to $0.
  const bcsTotal = state.bcsAnnualTotal || 0;
  const bcsExternal = state.bcsParentsAnnual || 0;
  if (bcsTotal > 0 && bcsExternal < bcsTotal) {
    const currentFamilyMonthly = state.bcsFamilyMonthly || Math.round((bcsTotal - bcsExternal) / 12);
    candidates.push({
      id: 'bcs_fully_covered',
      label: 'BCS fully covered (external)',
      unit: '$/mo',
      monthlyImpact: currentFamilyMonthly,
      mutation: { bcsParentsAnnual: bcsTotal },
    });
  }

  // 5a. "Take the MSFT offer" — composite move that turns on chadJob, the L64
  // and L65 promotion ladder, and 401(k) max-out + match in a single click.
  // Each MSFT-typical value is filled in ONLY when the corresponding state
  // field is currently 0 or false, so any custom values the user has tuned
  // are preserved.
  if (!state.chadJob) {
    const orDefault = (current, fallback) => (current && current > 0) ? current : fallback;
    const msftBundle = {
      chadJob: true,
      // L63 baseline — typical MSFT offer for an experienced senior IC
      chadJobSalary: orDefault(state.chadJobSalary, 165000),
      chadJobTaxRate: orDefault(state.chadJobTaxRate, 32),
      chadJobStartMonth: state.chadJobStartMonth ?? 3,
      chadJobHealthSavings: orDefault(state.chadJobHealthSavings, 4200),
      chadJobNoFICA: false,
      chadJobBonusPct: orDefault(state.chadJobBonusPct, 15),
      chadJobBonusMonth: state.chadJobBonusMonth ?? 8,
      chadJobBonusProrateFirst: state.chadJobBonusProrateFirst !== false,
      chadJobStockRefresh: orDefault(state.chadJobStockRefresh, 60000),
      chadJobRaisePct: orDefault(state.chadJobRaisePct, 3.5),
      chadJobRefreshStartMonth: state.chadJobRefreshStartMonth ?? 12,
      chadJobHireStockY1: orDefault(state.chadJobHireStockY1, 30000),
      chadJobHireStockY2: orDefault(state.chadJobHireStockY2, 30000),
      chadJobHireStockY3: orDefault(state.chadJobHireStockY3, 30000),
      chadJobHireStockY4: orDefault(state.chadJobHireStockY4, 30000),
      chadJobSignOnCash: orDefault(state.chadJobSignOnCash, 50000),
      // L64 ladder
      chadL64Enabled: true,
      chadL64Month: state.chadL64Month ?? 24,
      chadL64Salary: orDefault(state.chadL64Salary, 220000),
      chadL64StockRefresh: orDefault(state.chadL64StockRefresh, 100000),
      chadL64BonusPct: orDefault(state.chadL64BonusPct, 15),
      // L65 ladder
      chadL65Enabled: true,
      chadL65Month: state.chadL65Month ?? 60,
      chadL65Salary: orDefault(state.chadL65Salary, 280000),
      chadL65StockRefresh: orDefault(state.chadL65StockRefresh, 150000),
      chadL65BonusPct: orDefault(state.chadL65BonusPct, 20),
      // 401(k) max-out + employer match (super catch-up for ages 60-63)
      chadJob401kEnabled: true,
      chadJob401kDeferral: orDefault(state.chadJob401kDeferral, 24500),
      chadJob401kCatchupRoth: orDefault(state.chadJob401kCatchupRoth, 11250),
      chadJob401kMatch: orDefault(state.chadJob401kMatch, 12250),
      // Force age-65 vest continuation ON since Chad will retire at 65+ under
      // the typical 6-yr horizon — locks in post-retirement RSU windfall.
      chadAge65VestOverride: 'on',
    };
    // Approximate steady-state monthly impact for the panel — mirrors the
    // w2* hoisted block in IncomeControls.jsx (which itself mirrors
    // projection.js's msftMultIssueToVest formula). Includes hire stock
    // (Y1-Y4) and applies msftGrowth to both hire stock and refresh.
    // Engine score is computed separately via computeProjection (line 305+),
    // so this is purely the "+$X/mo" display chip.
    const w2Growth = (state.msftGrowth || 0) / 100;
    const salaryNetAnnual = msftBundle.chadJobSalary * (1 - msftBundle.chadJobTaxRate / 100);
    const bonusGrossAnnual = msftBundle.chadJobSalary * (msftBundle.chadJobBonusPct / 100);
    const bonusNetAnnual = bonusGrossAnnual * (1 - msftBundle.chadJobTaxRate / 100);
    // Refresh steady-state: average of grants issued at month 0 and vesting
    // over years 0.5..4.5 (matches IncomeControls w2RefreshSteadyMult).
    const refreshSteadyMult = w2Growth === 0 ? 1
      : [0.5, 1.5, 2.5, 3.5, 4.5].reduce((acc, t) => acc + Math.pow(1 + w2Growth, t), 0) / 5;
    const refreshNetAnnual = (msftBundle.chadJobStockRefresh || 0)
      * (1 - msftBundle.chadJobTaxRate / 100) * refreshSteadyMult;
    // Hire stock: each tranche grown by (1+g)^n then averaged over 4-yr vest.
    const hireGrownTotal = (msftBundle.chadJobHireStockY1 || 0) * Math.pow(1 + w2Growth, 1)
                         + (msftBundle.chadJobHireStockY2 || 0) * Math.pow(1 + w2Growth, 2)
                         + (msftBundle.chadJobHireStockY3 || 0) * Math.pow(1 + w2Growth, 3)
                         + (msftBundle.chadJobHireStockY4 || 0) * Math.pow(1 + w2Growth, 4);
    const hireNetAvgAnnual = hireGrownTotal * (1 - msftBundle.chadJobTaxRate / 100) / 4;
    // 401(k) match is employer contribution — counted as steady-state benefit,
    // not taxed at withdrawal here (rough proxy for the panel chip).
    const matchAnnual = msftBundle.chadJob401kMatch || 0;
    const netAnnual = salaryNetAnnual + bonusNetAnnual + refreshNetAnnual + hireNetAvgAnnual + matchAnnual;
    const netMonthly = Math.round(netAnnual / 12);
    candidates.push({
      id: 'take_msft_offer',
      label: 'Take the MSFT offer (L63 → L64 → L65 + 401(k) max & match)',
      unit: '$/mo net',
      monthlyImpact: netMonthly,
      mutation: msftBundle,
    });
  }

  // 5. Enable Chad's L64 promotion. Gated on chadJob — meaningless if Chad isn't employed.
  if (state.chadJob && !state.chadL64Enabled && (state.chadL64Salary || 0) > 0) {
    candidates.push({
      id: 'enable_l64',
      label: 'Promote to L64',
      unit: '$/yr lift',
      monthlyImpact: Math.round(((state.chadL64Salary || 0) - (state.chadJobSalary || 0)) / 12),
      mutation: { chadL64Enabled: true },
    });
  }

  // 6. Enable Chad's L65 promotion. Requires L64 also enabled (ladder convention).
  if (state.chadJob && !state.chadL65Enabled && (state.chadL65Salary || 0) > 0) {
    candidates.push({
      id: 'enable_l65',
      label: 'Promote to L65',
      unit: '$/yr lift',
      monthlyImpact: Math.round(((state.chadL65Salary || 0) - (state.chadJobSalary || 0)) / 12),
      mutation: { chadL65Enabled: true },
    });
  }

  // 7. Enable 401(k) — captures employer match ("free money") and tax-deferred savings.
  //    Only suggested when Chad is employed and 401k is currently off.
  if (state.chadJob && !state.chadJob401kEnabled) {
    const matchAnnual = state.chadJob401kMatch || 0;
    candidates.push({
      id: 'enable_401k',
      label: '401(k) — capture employer match',
      unit: '$/yr match',
      monthlyImpact: Math.round(matchAnnual / 12),
      mutation: { chadJob401kEnabled: true },
    });
  }

  // 8. Force age-65 RSU vest continuation ON (override 'auto' or 'off' → 'on').
  //    Only meaningful when Chad has refresh grants and the override isn't already on.
  if (state.chadJob && state.chadAge65VestOverride !== 'on'
      && ((state.chadJobStockRefresh || 0) > 0
          || (state.chadL64Enabled && (state.chadL64StockRefresh || 0) > 0)
          || (state.chadL65Enabled && (state.chadL65StockRefresh || 0) > 0))) {
    candidates.push({
      id: 'age65_vest_on',
      label: 'Force age-65 RSU vest continuation',
      unit: 'rule override',
      monthlyImpact: 0, // post-retirement windfall, not steady-state monthly
      mutation: { chadAge65VestOverride: 'on' },
    });
  }

  // 9. Custom levers — each INACTIVE one becomes a candidate at its max impact
  const customLevers = Array.isArray(state.customLevers) ? state.customLevers : [];
  for (const lv of customLevers) {
    if (lv.active) continue;
    const max = Math.max(0, Number(lv.maxImpact) || 0);
    if (max <= 0) continue;
    candidates.push({
      id: `custom:${lv.id}`,
      label: `Activate ${lv.name || 'custom lever'}`,
      unit: '$/mo',
      monthlyImpact: max,
      mutation: {
        customLevers: customLevers.map((x) => (x.id === lv.id
          ? { ...x, active: true, currentValue: max }
          : x)),
      },
    });
  }

  return candidates;
}

/**
 * Compute the breakeven-month delta between baseline and test projections.
 * Returns signed months: negative = earlier breakeven (good), positive = later.
 * Uses findOperationalBreakevenIndex on the quarterly data from computeProjection.
 */
export function computeBreakevenMonthDelta(baseData, testData) {
  const baseIdx = findOperationalBreakevenIndex(baseData);
  const testIdx = findOperationalBreakevenIndex(testData);
  const baseMonth = baseIdx >= 0 ? baseData[baseIdx]?.month ?? null : null;
  const testMonth = testIdx >= 0 ? testData[testIdx]?.month ?? null : null;

  if (baseMonth == null && testMonth == null) return 0;
  if (baseMonth == null && testMonth != null) return -HORIZON_SENTINEL_MONTHS; // went from never → now
  if (baseMonth != null && testMonth == null) return HORIZON_SENTINEL_MONTHS;  // lost breakeven
  return testMonth - baseMonth;
}

/**
 * Tier 1 — ranks INACTIVE Primary Levers by simulated impact.
 * Returns array of { key, label, unit, delta, finalBalanceDelta, breakevenMonthDelta, score, ... }
 */
export function computeTopMoves(baseState, topN = 3) {
  const baseProj = computeProjection(baseState);
  const baseMonthly = baseProj.monthlyData;
  const baseQuarterly = baseProj.data;
  const baseFinalBalance = baseMonthly[baseMonthly.length - 1].balance;
  // Pre-evaluate baseline goals so we can score goal-progress deltas per candidate.
  const baseGoals = Array.isArray(baseState.goals) ? baseState.goals : [];
  const baseGoalsEval = baseGoals.length > 0
    ? evaluateAllGoals(baseGoals, baseMonthly, { wealthData: baseMonthly, retireDebt: !!baseState.retireDebt })
    : [];

  const candidates = buildLeverCandidates(baseState);
  const results = [];

  for (const cand of candidates) {
    // Re-run gatherState so derived fields (bcsFamilyMonthly, lifestyleCuts,
    // ssPersonal, etc.) re-derive from the mutated upstream inputs. Without
    // this, a mutation that sets `bcsParentsAnnual: 0` would leave the stale
    // `bcsFamilyMonthly` in place and the projection would charge the old share.
    const testState = gatherState({ ...baseState, ...cand.mutation });
    const testProj = computeProjection(testState);
    const testMonthly = testProj.monthlyData;
    const testFinalBalance = testMonthly[testMonthly.length - 1].balance;

    const finalBalanceDelta = testFinalBalance - baseFinalBalance;
    const breakevenMonthDelta = computeBreakevenMonthDelta(baseQuarterly, testProj.data);
    const goalProgressDelta = computeGoalProgressDelta(baseGoalsEval, testProj, testState);

    // Score: dollars + months-earlier-breakeven weighted + goal-progress weighted.
    // When the user has goals defined, goal-progress moves dominate; otherwise
    // the engine falls back to the original composite.
    const score = finalBalanceDelta
      + (-breakevenMonthDelta) * BREAKEVEN_MULTIPLIER
      + goalProgressDelta * GOAL_PROGRESS_MULTIPLIER;

    // Include only genuine improvements on at least one axis (incl. goal progress)
    if (finalBalanceDelta <= 0 && breakevenMonthDelta >= 0 && goalProgressDelta <= 0) continue;

    results.push({
      key: cand.id,
      label: cand.label,
      unit: cand.unit,
      delta: cand.monthlyImpact, // "+$X/mo" for UI
      baseValue: 0,
      testValue: cand.monthlyImpact,
      finalBalanceDelta,
      breakevenMonthDelta,
      goalProgressDelta,
      // `runwayDelta` kept as 0 for UI back-compat; the panel now reads breakevenMonthDelta
      runwayDelta: 0,
      score,
      kind: 'lever',
    });
  }

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}

/**
 * Build income-pathway candidates — things Chad could PURSUE (not click), with
 * feasibility caps so we don't propose impossible nudges.
 */
function buildIncomePathwayCandidates(state) {
  const candidates = [];

  // 1. Sarah raises her hourly rate (respect sarahMaxRate cap)
  const sarahRate = state.sarahRate || 0;
  const sarahMaxRate = state.sarahMaxRate || 0;
  if (sarahRate < sarahMaxRate) {
    const bumpTarget = Math.min(sarahRate + 15, sarahMaxRate);
    const bump = bumpTarget - sarahRate;
    if (bump > 0) {
      candidates.push({
        id: 'sarah_rate',
        label: `Sarah raises her rate to $${bumpTarget}/hr`,
        unit: '$/hr',
        pursuit: bump,
        mutation: { sarahRate: bumpTarget },
      });
    }
  }

  // 2. Sarah adds clients (respect sarahMaxClients cap)
  const sarahCurClients = state.sarahCurrentClients || 0;
  const sarahMaxClients = state.sarahMaxClients || 0;
  if (sarahCurClients < sarahMaxClients) {
    const bumpTarget = Math.min(sarahCurClients + 1, sarahMaxClients);
    const bump = bumpTarget - sarahCurClients;
    if (bump > 0.01) {
      candidates.push({
        id: 'sarah_clients',
        label: `Sarah adds ${bump.toFixed(bump === Math.floor(bump) ? 0 : 1)} client`,
        unit: 'clients',
        pursuit: bump,
        mutation: { sarahCurrentClients: bumpTarget },
      });
    }
  }

  // 3. Chad takes a W-2 job (only if not already employed)
  if (!state.chadJob) {
    candidates.push({
      id: 'chad_w2_job',
      label: 'Chad takes a W-2 job ($120K)',
      unit: 'pathway',
      pursuit: 120000,
      mutation: {
        chadJob: true,
        chadJobSalary: 120000,
        chadJobStartMonth: 3,
        chadJobHealthSavings: 4200,
        chadJobTaxRate: 25,
        chadJobNoFICA: false,
        chadJobPensionRate: 0,
        chadJobPensionContrib: 0,
      },
    });
  }

  // 4. Consulting scales up $1,000/mo (SSDI-SGA cap handled by projection)
  const currentConsulting = state.chadConsulting || 0;
  candidates.push({
    id: 'consulting_scale',
    label: `Scale consulting by $1,000/mo`,
    unit: '$/mo',
    pursuit: 1000,
    mutation: { chadConsulting: currentConsulting + 1000 },
  });

  return candidates;
}

/**
 * Tier 3 — income pathways: counterfactual income expansions (Sarah's rate,
 * Chad's W-2, consulting growth). These are things Chad can PURSUE, not click.
 * Feasibility-capped against existing state limits (sarahMaxRate, sarahMaxClients).
 */
export function computeIncomePathways(baseState, topN = 3) {
  const baseProj = computeProjection(baseState);
  const baseFinalBalance = baseProj.monthlyData[baseProj.monthlyData.length - 1].balance;

  const candidates = buildIncomePathwayCandidates(baseState);
  const results = [];

  for (const cand of candidates) {
    const testState = gatherState({ ...baseState, ...cand.mutation });
    const testProj = computeProjection(testState);
    const testFinalBalance = testProj.monthlyData[testProj.monthlyData.length - 1].balance;
    const finalBalanceDelta = testFinalBalance - baseFinalBalance;

    if (finalBalanceDelta <= 0) continue;

    results.push({
      key: cand.id,
      label: cand.label,
      unit: cand.unit,
      delta: cand.pursuit,
      finalBalanceDelta,
      kind: 'pathway',
    });
  }

  return results
    .sort((a, b) => b.finalBalanceDelta - a.finalBalanceDelta)
    .slice(0, topN);
}

/**
 * Tier 2 — parameter-sensitivity awareness items.
 * Returns array of { key, label, unit, delta, finalBalanceDelta, baseValue, testValue }
 * sorted by ABSOLUTE impact (either direction matters for awareness).
 */
export function computeSensitivities(baseState, topN = 2) {
  const baseProj = computeProjection(baseState);
  const baseFinalBalance = baseProj.monthlyData[baseProj.monthlyData.length - 1].balance;

  const results = [];
  for (const sweep of SENSITIVITY_SWEEPS) {
    const baseValue = baseState[sweep.key];
    if (baseValue === undefined) continue;

    // Re-gather so derivations (e.g. inflation effect on baseExpenses) are fresh.
    const testState = gatherState({ ...baseState, [sweep.key]: baseValue + sweep.delta });
    const testProj = computeProjection(testState);
    const testFinalBalance = testProj.monthlyData[testProj.monthlyData.length - 1].balance;
    const finalBalanceDelta = testFinalBalance - baseFinalBalance;

    results.push({
      key: sweep.key,
      label: sweep.label,
      unit: sweep.unit,
      delta: sweep.delta,
      baseValue,
      testValue: baseValue + sweep.delta,
      finalBalanceDelta,
      kind: 'sensitivity',
    });
  }

  // Sort by absolute impact (awareness — magnitude matters either direction)
  return results
    .sort((a, b) => Math.abs(b.finalBalanceDelta) - Math.abs(a.finalBalanceDelta))
    .slice(0, topN);
}
