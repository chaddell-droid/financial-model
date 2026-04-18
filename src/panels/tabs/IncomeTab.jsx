import React from "react";
import MsftVestingChart from '../../charts/MsftVestingChart.jsx';
import SarahPracticeChart from '../../charts/SarahPracticeChart.jsx';
import IncomeCompositionChart from '../../charts/IncomeCompositionChart.jsx';

export default function IncomeTab({
  vestEvents, totalRemainingVesting, msftPrice, msftGrowth, onMsftGrowthChange, onMsftPriceChange,
  sarahRate, sarahMaxRate, sarahRateGrowth,
  sarahCurrentClients, sarahMaxClients, sarahClientGrowth,
  sarahTaxRate, sarahWorkYears, sarahCurrentGross, sarahCurrentNet, sarahCeilingGross, sarahCeiling,
  onFieldChange,
  data, investmentReturn, ssType, ssBenefitPersonal,
  vanSold, vanSaleMonth, vanMonthlySavings, bcsYearsLeft, milestones,
}) {
  return (
    <>
      <MsftVestingChart
        vestEvents={vestEvents} totalRemainingVesting={totalRemainingVesting}
        msftPrice={msftPrice} msftGrowth={msftGrowth} onMsftGrowthChange={onMsftGrowthChange} onMsftPriceChange={onMsftPriceChange}
      />
      <SarahPracticeChart
        sarahRate={sarahRate} sarahMaxRate={sarahMaxRate} sarahRateGrowth={sarahRateGrowth}
        sarahCurrentClients={sarahCurrentClients} sarahMaxClients={sarahMaxClients} sarahClientGrowth={sarahClientGrowth}
        sarahTaxRate={sarahTaxRate} sarahCurrentGross={sarahCurrentGross} sarahCurrentNet={sarahCurrentNet}
        sarahCeilingGross={sarahCeilingGross} sarahCeiling={sarahCeiling}
        sarahWorkYears={sarahWorkYears}
        onFieldChange={onFieldChange}
      />
      <IncomeCompositionChart data={data} investmentReturn={investmentReturn} ssType={ssType}
        ssBenefitPersonal={ssBenefitPersonal}
        vanSold={vanSold} vanSaleMonth={vanSaleMonth} vanMonthlySavings={vanMonthlySavings}
        bcsYearsLeft={bcsYearsLeft} milestones={milestones} />
    </>
  );
}
