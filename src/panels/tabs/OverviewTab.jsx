import React from "react";
import GoalPanel from '../GoalPanel.jsx';
import BridgeChart from '../../charts/BridgeChart.jsx';

export default function OverviewTab({
  goals, goalResults, mcGoalResults, mcRunning, presentMode, onGoalsChange,
  bridgeProps,
}) {
  return (
    <>
      <GoalPanel
        goals={goals} goalResults={goalResults} mcGoalResults={mcGoalResults}
        mcRunning={mcRunning} presentMode={presentMode} onGoalsChange={onGoalsChange}
      />
      <BridgeChart {...bridgeProps} />
    </>
  );
}
