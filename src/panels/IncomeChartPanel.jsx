import React, { memo } from 'react';
import IncomeCompositionChart from '../charts/IncomeCompositionChart.jsx';

/**
 * IncomeChartPanel — Plan tab wrapper for IncomeCompositionChart.
 * Provides the same plan-panel chrome as ChartStackPanel so it sits below the
 * Savings + NetWorth row as a single "income vs expenses" visual.
 */
function IncomeChartPanel({ incomeChartProps = {} }) {
  return (
    <div className="plan-panel" data-testid="plan-income-chart" style={{ alignSelf: 'stretch' }}>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--plan-magenta)' }}>
            Monthly Income vs Expenses
          </h3>
          <span className="plan-sub">Composition</span>
        </div>
        <div>
          <IncomeCompositionChart {...incomeChartProps} />
        </div>
      </div>
    </div>
  );
}

export default memo(IncomeChartPanel);
