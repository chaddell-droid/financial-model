import React from "react";
import BridgeChart from '../../charts/BridgeChart.jsx';
import MonthlyCashFlowChart from '../../charts/MonthlyCashFlowChart.jsx';
import IncomeControls from '../IncomeControls.jsx';
import ExpenseControls from '../ExpenseControls.jsx';

export default function PlanTab({
  bridgeProps, cashFlowProps,
  incomeControlsProps, expenseControlsProps, presentMode,
}) {
  return (
    <>
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
