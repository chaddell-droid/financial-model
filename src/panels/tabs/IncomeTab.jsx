import React from "react";
import MsftVestingChart from '../../charts/MsftVestingChart.jsx';
import SarahPracticeChart from '../../charts/SarahPracticeChart.jsx';
import IncomeCompositionChart from '../../charts/IncomeCompositionChart.jsx';

export default function IncomeTab({
  vestEvents, totalRemainingVesting, msftGrowth, onMsftGrowthChange,
  sarahRate, sarahMaxRate, sarahRateGrowth,
  sarahCurrentClients, sarahMaxClients, sarahClientGrowth,
  data, investmentReturn,
}) {
  return (
    <>
      <MsftVestingChart
        vestEvents={vestEvents} totalRemainingVesting={totalRemainingVesting}
        msftGrowth={msftGrowth} onMsftGrowthChange={onMsftGrowthChange}
      />
      <SarahPracticeChart
        sarahRate={sarahRate} sarahMaxRate={sarahMaxRate} sarahRateGrowth={sarahRateGrowth}
        sarahCurrentClients={sarahCurrentClients} sarahMaxClients={sarahMaxClients} sarahClientGrowth={sarahClientGrowth}
      />
      <IncomeCompositionChart data={data} investmentReturn={investmentReturn} />
    </>
  );
}
