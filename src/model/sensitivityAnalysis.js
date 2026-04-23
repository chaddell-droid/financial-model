import { computeProjection, findOperationalBreakevenIndex } from './projection.js';
import { gatherState } from '../state/gatherState.js';

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

  // 5. Custom levers — each INACTIVE one becomes a candidate at its max impact
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

    // Score: dollars + months-earlier-breakeven weighted by BREAKEVEN_MULTIPLIER
    const score = finalBalanceDelta + (-breakevenMonthDelta) * BREAKEVEN_MULTIPLIER;

    // Include only genuine improvements on at least one axis
    if (finalBalanceDelta <= 0 && breakevenMonthDelta >= 0) continue;

    results.push({
      key: cand.id,
      label: cand.label,
      unit: cand.unit,
      delta: cand.monthlyImpact, // "+$X/mo" for UI
      baseValue: 0,
      testValue: cand.monthlyImpact,
      finalBalanceDelta,
      breakevenMonthDelta,
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
