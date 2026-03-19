import React from "react";
import GoalPanel from '../GoalPanel.jsx';
import BridgeChart from '../../charts/BridgeChart.jsx';
import SavingsDrawdownChart from '../../charts/SavingsDrawdownChart.jsx';

export default function OverviewTab({
  goals, goalResults, mcGoalResults, mcRunning, presentMode, onGoalsChange,
  bridgeProps, savingsDrawdownProps,
}) {
  return (
    <>
      <GoalPanel
        goals={goals} goalResults={goalResults} mcGoalResults={mcGoalResults}
        mcRunning={mcRunning} presentMode={presentMode} onGoalsChange={onGoalsChange}
      />
      <SavingsDrawdownChart {...savingsDrawdownProps} />
      <BridgeChart {...bridgeProps} />
    </>
  );
}
