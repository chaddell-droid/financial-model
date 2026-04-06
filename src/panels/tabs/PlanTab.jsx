import React, { memo, useMemo } from "react";
import IncomeControls from '../IncomeControls.jsx';
import ExpenseControls from '../ExpenseControls.jsx';
import ScenarioStrip from '../ScenarioStrip.jsx';
import TopMovesPanel from '../TopMovesPanel.jsx';
import { useRenderMetric } from '../../testing/perfMetrics.js';

function PlanTab({
  incomeControlsProps, expenseControlsProps,
  scenarioStripProps,
  shellWidthBucket = 'desktop', presentMode,
  gatherState,
}) {
  useRenderMetric('PlanTab');
  const stackedControls = shellWidthBucket !== 'desktop';

  return (
    <div data-testid='plan-workspace'>
      {!presentMode && (
        <div data-testid='plan-primary-levers-section'>
          <ScenarioStrip {...scenarioStripProps} />
        </div>
      )}
      {!presentMode && (
        <div
          data-testid='plan-detailed-controls'
          style={{
            display: 'grid',
            gridTemplateColumns: stackedControls ? '1fr' : 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 16,
          }}
        >
          <IncomeControls {...incomeControlsProps} />
          <ExpenseControls {...expenseControlsProps} />
        </div>
      )}
      {!presentMode && (
        <TopMovesPanel gatherState={gatherState} />
      )}
    </div>
  );
}

export default memo(PlanTab);
