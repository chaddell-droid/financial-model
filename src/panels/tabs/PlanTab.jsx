import React, { memo } from 'react';
import WorkspaceSplit from '../../components/WorkspaceSplit.jsx';
import DecisionConsole from '../DecisionConsole.jsx';
import ChartStackPanel from '../ChartStackPanel.jsx';
import IncomeChartPanel from '../IncomeChartPanel.jsx';
import AssumptionsGrid from '../columns/AssumptionsGrid.jsx';
import { useRenderMetric } from '../../testing/perfMetrics.js';

/**
 * PlanTab — redesigned Plan tab (design handoff: Family Financial Plan).
 *
 * Layout:
 *   Row 1 — Decision Console (left, resizable) + stacked Savings + NetWorth (right) via WorkspaceSplit
 *   Row 2 — 3-column Model Assumptions grid (Income / Cashflow & Spend / Capital)
 *
 * Props:
 *   scenarioStripProps — lever state + BCS inputs (fed into DecisionConsole)
 *   incomeControlsProps / expenseControlsProps — passed into the assumption columns
 *   savingsChartProps / netWorthChartProps — feed the right-pane chart stack
 *   capitalItems, customLevers — array state for new Plan features
 *   onFieldChange — top-level setter
 *   gatherState — passthrough for TopMovesPanel inside Decision Console
 *   presentMode — when true, hide the editable assumptions grid
 */
function PlanTab({
  scenarioStripProps,
  incomeControlsProps,
  expenseControlsProps,
  savingsChartProps,
  netWorthChartProps,
  incomeChartProps,
  capitalItems = [],
  customLevers = [],
  onFieldChange,
  gatherState,
  presentMode = false,
}) {
  useRenderMetric('PlanTab');

  return (
    <div className="plan-workspace" data-testid="plan-workspace">
      <div data-testid="plan-primary-levers-section" style={{ marginBottom: 14 }}>
        <WorkspaceSplit
          left={
            <DecisionConsole
              scenarioStripProps={scenarioStripProps}
              customLevers={customLevers}
              onFieldChange={onFieldChange}
              gatherState={gatherState}
            />
          }
          right={
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
              <ChartStackPanel
                savingsChartProps={savingsChartProps}
                netWorthChartProps={netWorthChartProps}
              />
              {incomeChartProps && <IncomeChartPanel incomeChartProps={incomeChartProps} />}
            </div>
          }
        />
      </div>

      {!presentMode && (
        <div data-testid="plan-detailed-controls">
          <AssumptionsGrid
            incomeControlsProps={incomeControlsProps}
            expenseControlsProps={expenseControlsProps}
            capitalItems={capitalItems}
            onFieldChange={onFieldChange}
          />
        </div>
      )}
    </div>
  );
}

export default memo(PlanTab);
