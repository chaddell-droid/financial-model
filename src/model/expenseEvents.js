/**
 * deriveExpenseChangeEvents — engine-derived annotations for the expense line.
 *
 * Replaces the IncomeCompositionChart's four hand-coded heuristics (chadJob
 * health, van sold, BCS-end neighbor-subtraction, milestones) with a diff of
 * the engine's per-month expenseBreakdown, so EVERY discrete change in the
 * expense line (college start/end, debt payoffs, Medicare relief, one-time
 * extras windows, mortgage payoff, …) carries a marker derived from the same
 * numbers that drew the line.
 *
 * Drift exclusion: components that legitimately compound (baseLiving at CPI
 * ~0.25%/mo, healthPremium at medical trend ~0.53%/mo) must NOT fire on
 * smooth growth. A component delta is an event only if
 *   |Δ| >= max(thresholdDollars, |prev| × driftAllowancePctMonthly)
 * with defaults $150 and 1.5%/mo (comfortably above 6.5%/yr ≈ 0.53%/mo).
 *
 * Parity: the engine guarantees Σ expenseBreakdown == expenses every month
 * (see projection tests 34k–34m), so component deltas decompose the expense
 * line's month-over-month moves exactly — the annotations can never lie.
 */

/** Display labels for every expenseBreakdown key emitted by projection.js.
 *  Kept in sync with the tooltip's "Expense math" section. */
export const EXPENSE_COMPONENT_LABELS = {
  baseLiving: 'Base living',
  healthPremium: 'Health premium',
  medicareRelief: "Medicare (Chad's share)",
  mortgagePI: 'Mortgage P&I',
  debtService: 'Debt service',
  van: 'Van (loan + fuel)',
  lifestyleCuts: 'Lifestyle cuts',
  bcs: 'BCS tuition',
  milestones: 'Milestones',
  college: 'College (twins)',
  healthInsurance: 'Health ins. (employer)',
  oneTimeExtras: 'One-time extras',
  clampAdjustment: 'Floor at $0 (cuts exceed expenses)',
  // Retirement budget cap (2026-06-12): the cut applied when the bottom-up
  // stack exceeds Chad's top-line retirement budget.
  retirementBudget: 'Retirement budget cap',
};

export const DEFAULT_EVENT_THRESHOLD_DOLLARS = 150;
export const DEFAULT_DRIFT_ALLOWANCE_PCT_MONTHLY = 0.015;

/** Resolve the display label for one breakdown key. The aggregate
 *  'milestones' key resolves to the NAME(s) of the milestone(s) firing at
 *  this exact month (the engine applies each milestone from ms.month on). */
function labelForComponent(key, eventMonth, milestones) {
  if (key === 'milestones' && Array.isArray(milestones)) {
    const names = milestones
      .filter((ms) => ms && ms.month === eventMonth && (ms.savings || 0) !== 0)
      .map((ms) => ms.name)
      .filter(Boolean);
    if (names.length > 0) return names.join(' + ');
  }
  return EXPENSE_COMPONENT_LABELS[key] || key;
}

/**
 * Diff every expenseBreakdown component between consecutive monthlyData rows.
 *
 * @param {Array<{month:number, expenseBreakdown?:Object}>} monthlyData
 *   Engine rows (projection.monthlyData). Missing breakdowns are treated as {}.
 * @param {Object} [opts]
 * @param {number} [opts.thresholdDollars=150] absolute event floor
 * @param {number} [opts.driftAllowancePctMonthly=0.015] per-month compounding allowance
 * @param {Array<{name:string, month:number, savings:number}>} [opts.milestones]
 *   for resolving the aggregate 'milestones' key to milestone names
 * @returns {Array<{month:number, netDelta:number, items:Array<{key:string,label:string,delta:number}>}>}
 *   one merged event per firing month, items sorted by |delta| desc
 */
export function deriveExpenseChangeEvents(monthlyData, opts = {}) {
  const {
    thresholdDollars = DEFAULT_EVENT_THRESHOLD_DOLLARS,
    driftAllowancePctMonthly = DEFAULT_DRIFT_ALLOWANCE_PCT_MONTHLY,
    milestones = [],
  } = opts;

  const events = [];
  if (!Array.isArray(monthlyData) || monthlyData.length < 2) return events;

  for (let i = 1; i < monthlyData.length; i++) {
    const prev = monthlyData[i - 1].expenseBreakdown || {};
    const curr = monthlyData[i].expenseBreakdown || {};
    const month = monthlyData[i].month;
    const keys = new Set([...Object.keys(prev), ...Object.keys(curr)]);
    const items = [];
    for (const key of keys) {
      const p = prev[key] || 0;
      const c = curr[key] || 0;
      const delta = c - p;
      if (delta === 0) continue;
      const floor = Math.max(thresholdDollars, Math.abs(p) * driftAllowancePctMonthly);
      if (Math.abs(delta) >= floor) {
        items.push({ key, label: labelForComponent(key, month, milestones), delta });
      }
    }
    if (items.length > 0) {
      items.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
      events.push({
        month,
        netDelta: items.reduce((sum, it) => sum + it.delta, 0),
        items,
      });
    }
  }
  return events;
}
