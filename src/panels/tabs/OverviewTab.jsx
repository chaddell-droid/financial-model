import React, { memo } from "react";
import BridgeChart from '../../charts/BridgeChart.jsx';

function OverviewTab({ bridgeProps }) {
  return <BridgeChart {...bridgeProps} variant='overview' />;
}

export default memo(OverviewTab);
