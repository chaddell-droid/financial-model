/**
 * CFP Advisor — tool definitions for the Anthropic tool-use API.
 *
 * Each TOOL has:
 *   - name (used by the model)
 *   - description (helps the model pick correctly)
 *   - input_schema (JSON Schema; Anthropic validates input)
 *   - handler(state, args) → JSON-serializable result (pure function)
 *
 * Handlers wrap already-tested engine functions. Errors return
 *   { ok: false, error: string }
 * instead of throwing — the agent loop forwards this to the model so it can
 * recover, and never crashes.
 *
 * Token-budget defense: results compact-by-default. Full data requires
 * explicit args (fields, startMonth/endMonth, everyNthMonth) enforced by
 * schemas + handler limits.
 */

import { gatherStateWithOverrides } from '../state/gatherState.js';
import { computeProjection, findOperationalBreakevenIndex } from '../model/projection.js';
import { evaluateAllGoals } from '../model/goalEvaluation.js';
import { computeTopMoves } from '../model/sensitivityAnalysis.js';
import { computeMoveCascade } from '../model/moveCascade.js';
import { runMonteCarlo } from '../model/monteCarlo.js';
import { buildTaxSchedule } from '../model/taxProjection.js';
import { vestSchedule, projectedPostRetirementVests } from '../model/chadLevels.js';
import { MODEL_KEYS } from '../state/initialState.js';
import { causalDelta } from './diffMonthly.js';

const MUTABLE_FIELDS = new Set(MODEL_KEYS);

// Round helpers — keep tool results compact and stable.
const r = (n) => (Number.isFinite(n) ? Math.round(n) : 0);
const r2 = (n) => (Number.isFinite(n) ? Math.round(n * 100) / 100 : 0);

// ─── Schemas ────────────────────────────────────────────────────────────────

const NO_ARGS = { type: 'object', properties: {}, additionalProperties: false };

const RUN_PROJECTION_SCHEMA = {
  type: 'object',
  properties: {
    everyNthMonth: { type: 'integer', minimum: 1, maximum: 12, description: 'Sample every Nth month for sparse output. Default 6 (twice yearly).' },
    fields: {
      type: 'array',
      items: { type: 'string', enum: ['balance', 'netMonthly', 'cashIncome', 'expenses', 'investReturn', 'sarahIncome', 'chadJobIncome', 'ssBenefit', 'trustLLC', 'msftLump', 'consulting'] },
      description: 'Which monthlyData fields to include in the sparse view. Defaults to ["balance","netMonthly"].',
    },
    startMonth: { type: 'integer', minimum: 0, description: 'Inclusive lower bound on months returned.' },
    endMonth: { type: 'integer', minimum: 0, description: 'Inclusive upper bound on months returned. If absent, full horizon.' },
  },
  additionalProperties: false,
};

const WHAT_IF_SCHEMA = {
  type: 'object',
  properties: {
    mutation: {
      type: 'object',
      description: 'Field-value pairs to override on the current state. Only MODEL_KEYS are accepted; unknown fields are rejected.',
      additionalProperties: true,
    },
    label: { type: 'string', description: 'Optional human label for this scenario.' },
    everyNthMonth: { type: 'integer', minimum: 1, maximum: 12 },
  },
  required: ['mutation'],
  additionalProperties: false,
};

const COMPARE_SCENARIOS_SCHEMA = {
  type: 'object',
  properties: {
    scenarios: {
      type: 'array',
      minItems: 1,
      maxItems: 4,
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          mutation: { type: 'object', additionalProperties: true },
        },
        required: ['label', 'mutation'],
        additionalProperties: false,
      },
    },
  },
  required: ['scenarios'],
  additionalProperties: false,
};

const MONTE_CARLO_SCHEMA = {
  type: 'object',
  properties: {
    runs: { type: 'integer', minimum: 50, maximum: 1000, description: 'Number of simulations. Default 250.' },
    seed: { type: 'integer', description: 'Optional RNG seed for reproducibility.' },
  },
  additionalProperties: false,
};

const TAX_BREAKDOWN_SCHEMA = {
  type: 'object',
  properties: {
    years: { type: 'integer', minimum: 1, maximum: 30, description: 'Cap on years returned.' },
  },
  additionalProperties: false,
};

const CAUSAL_DELTA_SCHEMA = {
  type: 'object',
  properties: {
    baselineMutation: { type: 'object', description: 'State overrides for baseline scenario. Empty = current state.', additionalProperties: true },
    candidateMutation: { type: 'object', description: 'State overrides for candidate scenario.', additionalProperties: true },
    atMonth: { type: 'integer', minimum: 0 },
    topN: { type: 'integer', minimum: 1, maximum: 25, description: 'Cap on contributors returned.' },
  },
  required: ['candidateMutation', 'atMonth'],
  additionalProperties: false,
};

const TOP_MOVES_SCHEMA = {
  type: 'object',
  properties: {
    topN: { type: 'integer', minimum: 1, maximum: 10 },
  },
  additionalProperties: false,
};

const MOVE_CASCADE_SCHEMA = {
  type: 'object',
  properties: {
    count: { type: 'integer', minimum: 1, maximum: 8, description: 'Number of cascade rungs to compute.' },
  },
  additionalProperties: false,
};

const VEST_SCHEDULE_SCHEMA = {
  type: 'object',
  properties: {
    includePostRetirement: { type: 'boolean', description: 'If true, include post-retirement windfall summary.' },
  },
  additionalProperties: false,
};

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Validate a mutation object: only MODEL_KEYS are allowed.
 */
function validateMutation(mutation) {
  if (!mutation || typeof mutation !== 'object') return { ok: false, error: 'mutation must be an object' };
  const unknown = Object.keys(mutation).filter((k) => !MUTABLE_FIELDS.has(k));
  if (unknown.length > 0) {
    return { ok: false, error: `Unknown fields: ${unknown.join(', ')}. Only MODEL_KEYS may be mutated.` };
  }
  return { ok: true };
}

/**
 * Build a sparse view of monthlyData honoring everyNthMonth/startMonth/endMonth/fields.
 */
function sparseMonthly(monthlyData, args = {}) {
  const N = Math.max(1, args.everyNthMonth ?? 6);
  const start = args.startMonth ?? 0;
  const end = args.endMonth ?? Infinity;
  const fields = Array.isArray(args.fields) && args.fields.length > 0 ? args.fields : ['balance', 'netMonthly'];
  return monthlyData
    .filter((d) => d.month >= start && d.month <= end && (d.month % N === 0 || d.month === monthlyData.length - 1))
    .map((d) => {
      const row = { month: d.month };
      for (const f of fields) row[f] = r(d[f] ?? 0);
      return row;
    });
}

/**
 * Compact household state summary suitable for inclusion in tool results
 * (used by getCurrentState).
 */
function summarizeState(state) {
  const balance0 = 0; // monthlyData[0].balance after first iteration; we expose startingSavings instead.
  return {
    schemaVersion: state.schemaVersion ?? null,
    horizonMonths: state.totalProjectionMonths ?? state.chadWorkMonths ?? 72,
    startingSavings: r(state.startingSavings),
    starting401k: r(state.starting401k),
    homeEquity: r(state.homeEquity),
    investmentReturn: r2(state.investmentReturn),
    sarah: {
      rate: r(state.sarahRate),
      maxRate: r(state.sarahMaxRate),
      currentClients: state.sarahCurrentClients,
      maxClients: state.sarahMaxClients,
      taxRate: r(state.sarahTaxRate),
      workMonths: state.sarahWorkMonths,
      currentAge: state.sarahCurrentAge,
      spousalEnabled: state.sarahSpousalEnabled,
      spousalClaimAge: state.sarahSpousalClaimAge,
    },
    chad: {
      currentAge: state.chadCurrentAge,
      workMonths: state.chadWorkMonths,
      retirementMonth: state.chadRetirementMonth,
      job: !!state.chadJob,
      jobSalary: r(state.chadJobSalary),
      jobStartMonth: state.chadJobStartMonth,
      jobBonusPct: r2(state.chadJobBonusPct),
      jobStockRefresh: r(state.chadJobStockRefresh),
      jobRefreshStartMonth: state.chadJobRefreshStartMonth,
      hireStock: [r(state.chadJobHireStockY1), r(state.chadJobHireStockY2), r(state.chadJobHireStockY3), r(state.chadJobHireStockY4)],
      signOnCash: r(state.chadJobSignOnCash),
      raisePct: r2(state.chadJobRaisePct),
      noFICA: !!state.chadJobNoFICA,
      taxRate: r(state.chadJobTaxRate),
      // Promotion ladder
      l64: state.chadL64Enabled ? { month: state.chadL64Month, salary: r(state.chadL64Salary), refresh: r(state.chadL64StockRefresh), bonusPct: r2(state.chadL64BonusPct) } : null,
      l65: state.chadL65Enabled ? { month: state.chadL65Month, salary: r(state.chadL65Salary), refresh: r(state.chadL65StockRefresh), bonusPct: r2(state.chadL65BonusPct) } : null,
      age65VestOverride: state.chadAge65VestOverride,
      // 401(k)
      k401: state.chadJob401kEnabled ? { deferral: r(state.chadJob401kDeferral), catchupRoth: r(state.chadJob401kCatchupRoth), match: r(state.chadJob401kMatch) } : null,
    },
    msft: { price: r2(state.msftPrice), growthPct: r2(state.msftGrowth) },
    socialSecurity: {
      type: state.ssType,
      ssdiPersonal: r(state.ssdiPersonal),
      ssdiFamilyTotal: r(state.ssdiFamilyTotal),
      ssdiApprovalMonth: state.ssdiApprovalMonth,
      ssdiDenied: !!state.ssdiDenied,
      ssClaimAge: state.ssClaimAge,
      ssPIA: r(state.ssPIA),
      kidsAgeOutMonths: state.kidsAgeOutMonths,
    },
    expenses: {
      monthlyTotal: r(state.totalMonthlySpend ?? state.baseExpenses),
      base: r(state.baseExpenses),
      debtService: r(state.debtService),
      van: { sold: !!state.vanSold, monthlySavings: r(state.vanMonthlySavings), saleMonth: state.vanSaleMonth },
      bcs: { annualTotal: r(state.bcsAnnualTotal), parentsAnnual: r(state.bcsParentsAnnual), yearsLeft: state.bcsYearsLeft },
      inflation: { enabled: !!state.expenseInflation, ratePct: r2(state.expenseInflationRate) },
    },
    debts: {
      cc: r(state.debtCC),
      personal: r(state.debtPersonal),
      irs: r(state.debtIRS),
      firstmark: r(state.debtFirstmark),
      retire: !!state.retireDebt,
    },
    cuts: {
      applied: !!state.lifestyleCutsApplied,
      override: state.cutsOverride,
    },
    trust: { now: r(state.trustIncomeNow), future: r(state.trustIncomeFuture), increaseMonth: state.trustIncreaseMonth },
    goals: Array.isArray(state.goals) ? state.goals.map((g) => ({ id: g.id, name: g.name, type: g.type, targetAmount: r(g.targetAmount), targetMonth: g.targetMonth })) : [],
  };
}

function summarizeProjection(proj) {
  const monthly = proj.monthlyData || [];
  if (monthly.length === 0) return null;
  const final = monthly[monthly.length - 1];
  const breakIdx = findOperationalBreakevenIndex(proj.data);
  const breakevenMonth = breakIdx >= 0 ? proj.data[breakIdx]?.month ?? null : null;
  // Lowest balance month
  let lowest = monthly[0];
  for (const d of monthly) if (d.balance < lowest.balance) lowest = d;
  // Highest balance month
  let highest = monthly[0];
  for (const d of monthly) if (d.balance > highest.balance) highest = d;
  // Total income / expense / invest return for the horizon
  const totalCashIncome = monthly.reduce((s, d) => s + (d.cashIncome || 0), 0);
  const totalExpenses = monthly.reduce((s, d) => s + (d.expenses || 0), 0);
  const totalInvestReturn = monthly.reduce((s, d) => s + (d.investReturn || 0), 0);
  return {
    horizonMonths: monthly.length,
    finalBalance: r(final.balance),
    finalNetWorth: r((final.balance || 0) + (final.balance401k || 0) + (final.homeEquity || 0)),
    breakevenMonth,
    breakevenLabel: breakIdx >= 0 ? proj.data[breakIdx]?.label ?? null : null,
    lowestMonth: { month: lowest.month, balance: r(lowest.balance) },
    highestMonth: { month: highest.month, balance: r(highest.balance) },
    totals: { cashIncome: r(totalCashIncome), expenses: r(totalExpenses), investReturn: r(totalInvestReturn) },
  };
}

// ─── TOOLS array ────────────────────────────────────────────────────────────

export const TOOLS = Object.freeze([
  {
    name: 'getCurrentState',
    description:
      'Return a compact summary of the household financial state — household ages, retirement timelines, income sources, debts, expenses, MSFT job/promotion ladder, 401(k), Social Security configuration, and goals. Use this when you need to know what the current plan looks like before answering. No arguments.',
    input_schema: NO_ARGS,
    handler: (state /*, args */) => ({ ok: true, state: summarizeState(state) }),
  },
  {
    name: 'runProjection',
    description:
      'Run the financial projection on the current state and return summary metrics (final balance, breakeven month, lowest/highest month, totals). Optionally include a sparse monthly view via everyNthMonth/fields/startMonth/endMonth. Use this for "where do we stand?" questions.',
    input_schema: RUN_PROJECTION_SCHEMA,
    handler: (state, args = {}) => {
      const proj = computeProjection(state);
      const summary = summarizeProjection(proj);
      const result = { ok: true, summary };
      if (args.everyNthMonth || args.fields || args.startMonth || args.endMonth) {
        result.monthlyData = sparseMonthly(proj.monthlyData, args);
      }
      return result;
    },
  },
  {
    name: 'whatIf',
    description:
      'Apply a state mutation and re-run the projection, returning deltas vs the current baseline. Use this for "what if we did X?" questions. Only MODEL_KEYS may be mutated; unknown fields error out. Returns finalBalanceDelta, breakevenDelta, and per-milestone balance deltas.',
    input_schema: WHAT_IF_SCHEMA,
    handler: (state, args = {}) => {
      const v = validateMutation(args.mutation);
      if (!v.ok) return v;
      const baseProj = computeProjection(state);
      const baseSummary = summarizeProjection(baseProj);
      const candState = gatherStateWithOverrides({ ...state, ...args.mutation });
      const candProj = computeProjection(candState);
      const candSummary = summarizeProjection(candProj);
      const milestones = [12, 24, 36, 60, 72, 96];
      const balanceAt = (data, m) => data.find((d) => d.month === m)?.balance ?? null;
      const milestoneDeltas = milestones.map((m) => ({
        month: m,
        baseline: r(balanceAt(baseProj.monthlyData, m) ?? 0),
        candidate: r(balanceAt(candProj.monthlyData, m) ?? 0),
        delta: r((balanceAt(candProj.monthlyData, m) ?? 0) - (balanceAt(baseProj.monthlyData, m) ?? 0)),
      })).filter((m) => m.baseline !== 0 || m.candidate !== 0);
      return {
        ok: true,
        label: args.label || null,
        baseline: baseSummary,
        candidate: candSummary,
        finalBalanceDelta: r(candSummary.finalBalance - baseSummary.finalBalance),
        finalNetWorthDelta: r(candSummary.finalNetWorth - baseSummary.finalNetWorth),
        breakevenDelta: candSummary.breakevenMonth !== null && baseSummary.breakevenMonth !== null
          ? candSummary.breakevenMonth - baseSummary.breakevenMonth
          : null,
        milestoneDeltas,
      };
    },
  },
  {
    name: 'evaluateGoals',
    description:
      'Run the projection and evaluate every defined goal (savings_floor, savings_target, income_target, net_worth_target, debt_free), returning per-goal achieved/progress/description. Use this when the user asks "are we on track?" or "which goals are we missing?"',
    input_schema: NO_ARGS,
    handler: (state /*, args */) => {
      const proj = computeProjection(state);
      const evals = evaluateAllGoals(state.goals || [], proj.monthlyData, {
        wealthData: proj.monthlyData,
        retireDebt: !!state.retireDebt,
      });
      return {
        ok: true,
        goals: evals.map((e) => ({
          id: e.id,
          name: e.name,
          type: e.type,
          targetAmount: r(e.targetAmount),
          targetMonth: e.targetMonth,
          achieved: e.achieved,
          progress: r2(e.progress),
          currentValue: r(e.currentValue),
          description: e.description,
        })),
      };
    },
  },
  {
    name: 'topMoves',
    description:
      'Compute the top single-lever moves ranked by goal-aware score. Each move is a one-click mutation (e.g., enable L64, sell van, take MSFT offer bundle) with predicted final-balance delta, breakeven delta, and goal-progress delta. Use this when the user asks "what should I do?" or "what helps the most?"',
    input_schema: TOP_MOVES_SCHEMA,
    handler: (state, args = {}) => {
      const moves = computeTopMoves(state, args.topN ?? 5);
      return {
        ok: true,
        moves: moves.map((m) => ({
          key: m.key,
          label: m.label,
          unit: m.unit,
          delta: m.delta,
          finalBalanceDelta: r(m.finalBalanceDelta),
          breakevenMonthDelta: m.breakevenMonthDelta,
          goalProgressDelta: r2(m.goalProgressDelta || 0),
          score: r(m.score),
        })),
      };
    },
  },
  {
    name: 'moveCascade',
    description:
      'Compute a greedy ordered cascade of next-best moves where each rung is conditioned on the previous rungs being applied. Returns standalone-vs-cumulative impact for each rung. Use for "if I take steps in sequence, what does the path look like?"',
    input_schema: MOVE_CASCADE_SCHEMA,
    handler: (state, args = {}) => {
      const cascade = computeMoveCascade(state, args.count ?? 5);
      return {
        ok: true,
        rungs: cascade.map((r) => ({
          id: r.id,
          label: r.label,
          monthlyImpact: r.monthlyImpact,
          cumulativeMonthlyImpact: r.cumulativeMonthlyImpact,
          standaloneFinalBalanceDelta: r.finalBalanceDelta,
          cumulativeFinalBalanceDelta: r.cumulativeFinalBalanceDelta,
          standaloneBreakevenDelta: r.breakevenMonthDelta,
          cumulativeBreakevenDelta: r.cumulativeBreakevenMonthDelta,
        })),
      };
    },
  },
  {
    name: 'monteCarloSummary',
    description:
      'Run a Monte Carlo simulation over investment-return / business-growth / MSFT-growth / SSDI-delay variability and return solvency rate, percentile bands, median trough, and goal success rates. Use when the user asks about risk, downside scenarios, "what could go wrong", or confidence bands.',
    input_schema: MONTE_CARLO_SCHEMA,
    handler: (state, args = {}) => {
      const N = args.runs ?? 250;
      const mcParams = {
        mcNumSims: N,
        mcInvestVol: state.mcInvestVol ?? 12,
        mcBizGrowthVol: state.mcBizGrowthVol ?? 5,
        mcMsftVol: state.mcMsftVol ?? 15,
        mcSsdiDelay: state.mcSsdiDelay ?? 6,
        mcSsdiDenialPct: state.mcSsdiDenialPct ?? 5,
        mcCutsDiscipline: state.mcCutsDiscipline ?? 25,
      };
      const goals = state.goals || [];
      const opts = args.seed != null ? { seed: args.seed } : {};
      const mc = runMonteCarlo(state, mcParams, goals, opts);
      // Drop the per-month bands beyond a sample to keep output compact.
      const sampleMonths = [0, 12, 24, 36, 48, 60, 72];
      const compactBands = mc.bands.map((b) => ({
        pct: b.pct,
        sampled: sampleMonths.filter((m) => m < b.series.length).map((m) => ({ month: m, value: r(b.series[m]) })),
        finalValue: r(b.series[b.series.length - 1]),
      }));
      return {
        ok: true,
        numSims: mc.numSims,
        solvencyRate: r2(mc.solvencyRate * 100) / 100,
        medianTrough: r(mc.medianTrough),
        medianFinal: r(mc.medianFinal),
        p10Final: r(mc.p10Final),
        p90Final: r(mc.p90Final),
        bands: compactBands,
        goalSuccessRates: mc.goalSuccessRates.map((g) => ({ goalId: g.goalId, successRate: r2(g.successRate * 100) / 100 })),
        params: mc.params,
      };
    },
  },
  {
    name: 'taxBreakdown',
    description:
      'Return the per-year tax schedule (federal, FICA, state) computed by the tax engine. Useful for understanding bracket transitions, total tax paid, and post-retirement tax position. Optional args.years caps the horizon returned.',
    input_schema: TAX_BREAKDOWN_SCHEMA,
    handler: (state, args = {}) => {
      const sched = buildTaxSchedule(state);
      const cap = args.years ?? sched.length;
      return {
        ok: true,
        years: sched.slice(0, cap).map((y) => ({
          year: y.year,
          chadW2: r(y.chadW2 ?? 0),
          sarahSchC: r(y.sarahSchC ?? 0),
          totalIncome: r(y.totalIncome ?? 0),
          fedTax: r(y.fedTax ?? 0),
          fica: r(y.fica ?? 0),
          stateTax: r(y.stateTax ?? 0),
          totalTax: r(y.totalTax ?? 0),
          effectiveRate: r2((y.effectiveRate ?? 0) * 100),
        })),
      };
    },
  },
  {
    name: 'vestSchedule',
    description:
      'Return the per-grant RSU vest schedule for Chad: each refresh grant with issue month, level, gross size, share count, vest year cells, and totals. Optionally include the post-retirement windfall summary (when age-65 rule applies).',
    input_schema: VEST_SCHEDULE_SCHEMA,
    handler: (state, args = {}) => {
      const sched = vestSchedule(state);
      const result = {
        ok: true,
        retirementMonth: sched.retMonth,
        grants: (sched.grants || []).map((g) => ({
          id: g.id,
          level: g.level,
          gross: r(g.gross),
          issueMonth: g.issueMonth,
          issueYear: g.issueYear,
          priceAtIssue: r2(g.priceAtIssue),
          sharesAtIssue: r(g.sharesAtIssue),
          cliff: !!g.cliff,
          postRetVested: !!g.postRetVested,
          postRetGross: r(g.postRetGross || 0),
          lastVestYear: g.lastVestYear,
        })),
        years: sched.years || [],
        yearTotals: (sched.yearTotals || []).map(r),
        postRetYearTotals: (sched.postRetYearTotals || []).map(r),
      };
      if (args.includePostRetirement) {
        const w = projectedPostRetirementVests(state);
        result.postRetirementWindfall = {
          eligibleGrants: w.eligibleGrants,
          forfeitedGrants: w.forfeitedGrants,
          grossWindfall: r(w.grossWindfall),
          firstVestMonth: w.firstVestMonth,
          lastVestMonth: w.lastVestMonth,
        };
      }
      return result;
    },
  },
  {
    name: 'causalDelta',
    description:
      'Compare two scenarios (each defined by an optional state mutation) at a specific month and attribute the balance difference to underlying components — income sources, expense buckets, investment return. Use to answer "why is X different from Y?" or "what is driving the dip at month N?"',
    input_schema: CAUSAL_DELTA_SCHEMA,
    handler: (state, args = {}) => {
      const baseMut = args.baselineMutation || {};
      const candMut = args.candidateMutation || {};
      const baseV = validateMutation(baseMut);
      if (!baseV.ok) return baseV;
      const candV = validateMutation(candMut);
      if (!candV.ok) return candV;
      const baseState = Object.keys(baseMut).length > 0 ? gatherStateWithOverrides({ ...state, ...baseMut }) : state;
      const candState = gatherStateWithOverrides({ ...state, ...candMut });
      const baseProj = computeProjection(baseState);
      const candProj = computeProjection(candState);
      return {
        ok: true,
        ...causalDelta(baseProj.monthlyData, candProj.monthlyData, args.atMonth, { topN: args.topN ?? 10 }),
      };
    },
  },
  {
    name: 'compareScenarios',
    description:
      'Run multiple scenarios side-by-side (up to 4) and return their projection summaries for direct comparison. Each scenario is a labeled state mutation. Use for "compare A vs B vs C" questions.',
    input_schema: COMPARE_SCENARIOS_SCHEMA,
    handler: (state, args) => {
      const out = [];
      for (const sc of args.scenarios) {
        const v = validateMutation(sc.mutation);
        if (!v.ok) return { ok: false, error: `Scenario "${sc.label}": ${v.error}` };
        const sState = Object.keys(sc.mutation).length > 0 ? gatherStateWithOverrides({ ...state, ...sc.mutation }) : state;
        const sProj = computeProjection(sState);
        const summary = summarizeProjection(sProj);
        const goals = evaluateAllGoals(sState.goals || [], sProj.monthlyData, {
          wealthData: sProj.monthlyData,
          retireDebt: !!sState.retireDebt,
        });
        out.push({
          label: sc.label,
          summary,
          goalsAchieved: goals.filter((g) => g.achieved).length,
          goalsTotal: goals.length,
        });
      }
      return { ok: true, scenarios: out };
    },
  },
]);

export const TOOL_NAMES = TOOLS.map((t) => t.name);

/**
 * Look up and execute a tool by name. Wraps in try/catch so the agent loop
 * never crashes — errors come back as { ok: false, error } that the model
 * can read and react to.
 */
export function runTool(name, state, args = {}) {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return { ok: false, error: `Unknown tool: ${name}` };
  try {
    return tool.handler(state, args);
  } catch (err) {
    return { ok: false, error: `Tool ${name} threw: ${err && err.message ? err.message : String(err)}` };
  }
}

/**
 * Return the JSON-serializable tool descriptors for the Anthropic API
 * (name + description + input_schema only).
 */
export function toolsForAnthropic() {
  return TOOLS.map(({ name, description, input_schema }) => ({ name, description, input_schema }));
}
