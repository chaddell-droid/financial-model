/**
 * Chart registry — catalog of all charts available for the right rail.
 * Each entry maps an ID to display metadata. Component resolution and
 * prop wiring happen in FinancialModel.jsx (keeps this file dependency-free).
 */
export const CHART_REGISTRY = [
  { id: 'savings', label: 'Savings Balance', description: 'Savings balance over time with comparison overlays', color: '#4ade80' },
  { id: 'networth', label: 'Net Worth', description: 'Total net worth projection (savings + 401k + home)', color: '#94a3b8' },
  { id: 'retirement', label: 'Retirement Income', description: 'Retirement spending and income analysis', color: '#60a5fa' },
  { id: 'bridge', label: 'Monthly Gap Path', description: 'Monthly cash flow bridge with milestones', color: '#fbbf24' },
  { id: 'income', label: 'Income vs Expenses', description: 'Stacked income composition against expenses', color: '#22d3ee' },
  { id: 'montecarlo', label: 'Monte Carlo', description: 'Probabilistic solvency analysis', color: '#a78bfa' },
  { id: 'sequence', label: 'Sequence of Returns', description: 'Bad-early vs good-early return scenarios', color: '#f87171' },
];

/** Look up a chart's metadata by ID. */
export function getChartMeta(id) {
  return CHART_REGISTRY.find(c => c.id === id) || null;
}

/** Get charts NOT in the given list (available to add). */
export function getAvailableCharts(currentIds) {
  const set = new Set(currentIds);
  return CHART_REGISTRY.filter(c => !set.has(c.id));
}
