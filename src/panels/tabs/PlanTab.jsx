import React, { memo, useMemo } from "react";
import BridgeChart from '../../charts/BridgeChart.jsx';
import MonthlyCashFlowChart from '../../charts/MonthlyCashFlowChart.jsx';
import IncomeControls from '../IncomeControls.jsx';
import ExpenseControls from '../ExpenseControls.jsx';
import ScenarioStrip from '../ScenarioStrip.jsx';
import GoalPanel from '../GoalPanel.jsx';

function PlanTab({
  bridgeProps, cashFlowProps,
  incomeControlsProps, expenseControlsProps,
  scenarioStripProps, goalPanelProps,
  shellWidthBucket = 'desktop', presentMode,
}) {
  const stackedControls = shellWidthBucket !== 'desktop';
  const primaryLeversSection = useMemo(() => (
    !presentMode ? (
      <div data-testid='plan-primary-levers-section'>
        <ScenarioStrip {...scenarioStripProps} />
      </div>
    ) : null
  ), [presentMode, scenarioStripProps]);

  const detailedControlsSection = useMemo(() => (
    !presentMode ? (
      <div
        data-testid='plan-detailed-controls'
        style={{
          display: 'grid',
          gridTemplateColumns: stackedControls ? '1fr' : 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 16,
          marginBottom: 24,
        }}
      >
        <IncomeControls {...incomeControlsProps} />
        <ExpenseControls {...expenseControlsProps} />
      </div>
    ) : null
  ), [presentMode, stackedControls, incomeControlsProps, expenseControlsProps]);

  const firstChartSection = useMemo(() => (
    !presentMode ? (
      <div data-testid='plan-first-chart'>
        <MonthlyCashFlowChart {...cashFlowProps} />
      </div>
    ) : null
  ), [presentMode, cashFlowProps]);

  const bridgeFeedbackSection = useMemo(() => (
    <div data-testid='plan-bridge-feedback'>
      <BridgeChart {...bridgeProps} variant='plan' />
    </div>
  ), [bridgeProps]);

  const goalsSection = useMemo(() => (
    !presentMode ? (
      <div data-testid='plan-goals-section'>
        <GoalPanel {...goalPanelProps} />
      </div>
    ) : null
  ), [presentMode, goalPanelProps]);

  return (
    <div data-testid='plan-workspace'>
      {primaryLeversSection}
      {detailedControlsSection}
      {firstChartSection}
      {bridgeFeedbackSection}
      {goalsSection}
    </div>
  );
}

export default memo(PlanTab);
