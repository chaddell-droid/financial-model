import React from "react";
import ScenarioStrip from '../ScenarioStrip.jsx';
import BridgeChart from '../../charts/BridgeChart.jsx';
import MonthlyCashFlowChart from '../../charts/MonthlyCashFlowChart.jsx';
import IncomeControls from '../IncomeControls.jsx';
import ExpenseControls from '../ExpenseControls.jsx';

export default function PlanTab({
  scenarioStripProps, bridgeProps, cashFlowProps,
  incomeControlsProps, expenseControlsProps, presentMode,
}) {
  return (
    <>
      {!presentMode && <ScenarioStrip {...scenarioStripProps} />}
      <BridgeChart {...bridgeProps} />
      {!presentMode && (
        <MonthlyCashFlowChart {...cashFlowProps} />
      )}
      {!presentMode && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginBottom: 24 }}>
          <IncomeControls {...incomeControlsProps} />
          <ExpenseControls {...expenseControlsProps} />
        </div>
      )}
    </>
  );
}
