/**
 * Causal delta — given two monthlyData arrays (e.g., baseline projection and a
 * perturbed projection), attribute the balance difference at a chosen month to
 * the underlying components.
 *
 * Components attributed:
 *   - cashIncome (sarahIncome, msftLump, trustLLC, ssBenefit, sarahSpousal,
 *     consulting, chadJobIncome, customLeverMonthly summed)
 *   - chadJobIncome breakdown (salary, bonus, refresh stock, hire stock, sign-on)
 *   - expenses (with expenseBreakdown when available)
 *   - investReturn
 *   - net effect (cashIncome - expenses + investReturn === netMonthly)
 *
 * Returns ranked contributors by absolute delta magnitude.
 */

const INCOME_COMPONENTS = [
  'sarahIncome',
  'msftLump',
  'trustLLC',
  'ssBenefit',
  'sarahSpousal',
  'consulting',
  'chadJobIncome',
  'customLeverMonthly',
  'investReturn',
];

const CHAD_JOB_BREAKDOWN = [
  'chadJobSalaryNet',
  'chadJobBonusNet',
  'chadJobStockRefreshNet',
  'chadJobStockHireNet',
  'chadJobSignOnNet',
];

/**
 * @param {Array} dataA - baseline monthlyData
 * @param {Array} dataB - candidate monthlyData
 * @param {number} atMonth - month index to compare
 * @param {object} [opts]
 * @param {number} [opts.topN=10] - cap on contributors returned
 * @returns {{ baseRow: object|null, candRow: object|null, balanceDelta: number, contributors: Array<{component: string, deltaA: number, deltaB: number, delta: number, pctOfMagnitude: number}> }}
 */
export function causalDelta(dataA, dataB, atMonth, opts = {}) {
  const topN = Math.max(1, Math.min(50, opts.topN ?? 10));
  const baseRow = Array.isArray(dataA) ? dataA.find((d) => d.month === atMonth) : null;
  const candRow = Array.isArray(dataB) ? dataB.find((d) => d.month === atMonth) : null;

  const balanceDelta = (candRow?.balance ?? 0) - (baseRow?.balance ?? 0);

  const contributors = [];

  // We only emit contributors whose values actually differ between scenarios.
  // Components where a === b have zero attribution, so they'd just dilute the ranking.
  const nontrivial = (a, b) => Math.abs((b ?? 0) - (a ?? 0)) >= 0.5;

  // Top-level income components (skip chadJobIncome here; we drill in via breakdown).
  for (const key of INCOME_COMPONENTS) {
    if (key === 'chadJobIncome') continue; // handled via breakdown below
    const a = baseRow?.[key] ?? 0;
    const b = candRow?.[key] ?? 0;
    if (!nontrivial(a, b)) continue;
    contributors.push({ component: key, deltaA: a, deltaB: b, delta: b - a });
  }

  // Chad-job breakdown (more useful than the lumped chadJobIncome).
  for (const key of CHAD_JOB_BREAKDOWN) {
    const a = baseRow?.[key] ?? 0;
    const b = candRow?.[key] ?? 0;
    if (!nontrivial(a, b)) continue;
    contributors.push({ component: `chadJob.${key.replace(/^chadJob/, '').replace(/Net$/, '')}`, deltaA: a, deltaB: b, delta: b - a });
  }

  // Expense breakdown
  const expBreakA = baseRow?.expenseBreakdown || {};
  const expBreakB = candRow?.expenseBreakdown || {};
  const expKeys = new Set([...Object.keys(expBreakA), ...Object.keys(expBreakB)]);
  for (const key of expKeys) {
    const a = expBreakA[key] || 0;
    const b = expBreakB[key] || 0;
    if (!nontrivial(a, b)) continue;
    // Expense items add to costs; a positive delta means more cost, which lowers balance.
    // We invert sign so "delta" here means "effect on net cashflow" (positive helps balance).
    contributors.push({ component: `expense.${key}`, deltaA: a, deltaB: b, delta: -(b - a) });
  }

  // Total expense (when breakdown is missing) — only if the total itself differs.
  if (expKeys.size === 0 && nontrivial(baseRow?.expenses, candRow?.expenses)) {
    contributors.push({
      component: 'expense.total',
      deltaA: baseRow?.expenses ?? 0,
      deltaB: candRow?.expenses ?? 0,
      delta: -((candRow?.expenses ?? 0) - (baseRow?.expenses ?? 0)),
    });
  }

  // Sort by absolute delta magnitude, then attribute % of total magnitude.
  contributors.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const totalMagnitude = contributors.reduce((s, c) => s + Math.abs(c.delta), 0) || 1;
  for (const c of contributors) {
    c.pctOfMagnitude = +(Math.abs(c.delta) / totalMagnitude * 100).toFixed(1);
  }

  return {
    atMonth,
    baseRow: baseRow ? slimRow(baseRow) : null,
    candRow: candRow ? slimRow(candRow) : null,
    balanceDelta,
    contributors: contributors.slice(0, topN),
  };
}

/**
 * Trim a monthly row to the fields useful for the advisor (drops nested
 * objects + verbose fields). Used for tool-result payload size control.
 */
function slimRow(row) {
  return {
    month: row.month,
    balance: Math.round(row.balance ?? 0),
    cashIncome: Math.round(row.cashIncome ?? 0),
    expenses: Math.round(row.expenses ?? 0),
    investReturn: Math.round(row.investReturn ?? 0),
    netMonthly: Math.round(row.netMonthly ?? 0),
  };
}
