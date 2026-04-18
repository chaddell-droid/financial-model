import React from "react";
import MsftVestingChart from '../../charts/MsftVestingChart.jsx';
import SarahPracticeChart from '../../charts/SarahPracticeChart.jsx';
import IncomeCompositionChart from '../../charts/IncomeCompositionChart.jsx';

export default function IncomeTab({
  vestEvents, totalRemainingVesting, msftPrice, msftGrowth, onMsftGrowthChange, onMsftPriceChange,
  sarahRate, sarahMaxRate, sarahRateGrowth,
  sarahCurrentClients, sarahMaxClients, sarahClientGrowth,
  sarahTaxRate, sarahWorkMonths, sarahCurrentGross, sarahCurrentNet, sarahCeilingGross, sarahCeiling,
  onFieldChange,
  monthlyDetail, investmentReturn, ssType, ssBenefitPersonal,
  chadJob, chadJobStartMonth, chadJobHealthSavings,
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
        sarahWorkMonths={sarahWorkMonths}
        onFieldChange={onFieldChange}
      />
      <IncomeCompositionChart monthlyDetail={monthlyDetail} investmentReturn={investmentReturn} ssType={ssType}
        ssBenefitPersonal={ssBenefitPersonal}
        chadJob={chadJob} chadJobStartMonth={chadJobStartMonth} chadJobHealthSavings={chadJobHealthSavings}
        vanSold={vanSold} vanSaleMonth={vanSaleMonth} vanMonthlySavings={vanMonthlySavings}
        bcsYearsLeft={bcsYearsLeft} milestones={milestones} />
    </>
  );
}
