import React, { useMemo, useState, memo } from 'react';
import { COLORS } from './chartUtils.js';
import { buildTaxSchedule } from '../model/taxProjection.js';
import TaxRatesOverTimeChart from './TaxRatesOverTimeChart.jsx';
import TaxCompositionChart from './TaxCompositionChart.jsx';
import TaxWaterfallChart from './TaxWaterfallChart.jsx';
import TaxAttributionChart from './TaxAttributionChart.jsx';
import DeductionImpactChart from './DeductionImpactChart.jsx';

function YearPill({ year, selected, onClick }) {
  return (
    <button
      onClick={() => onClick(year)}
      style={{
        padding: '5px 12px',
        borderRadius: 16,
        border: `1px solid ${selected ? COLORS.cyan : COLORS.border}`,
        background: selected ? COLORS.cyan + '22' : COLORS.bgDeep,
        color: selected ? COLORS.cyan : COLORS.textMuted,
        fontSize: 12,
        fontWeight: selected ? 700 : 500,
        cursor: 'pointer',
        transition: 'all 0.15s ease',
      }}
    >
      Y{year}
    </button>
  );
}

function TaxVisualization({
  taxMode, taxInflationAdjust, taxInflationRate, taxSchCExpenseRatio,
  taxPropertyTax, taxSalesTax, taxPersonalPropTax, taxMortgageInt,
  taxCharitable, taxMedical, taxW2Withholding, taxCtcChildren,
  taxOdcDependents, taxCapGainLoss, taxSolo401k,
  sarahRate, sarahMaxRate, sarahRateGrowth,
  sarahCurrentClients, sarahMaxClients, sarahClientGrowth,
  sarahWorkMonths,
  chadJob, chadJobSalary, chadJobStartMonth,
}) {
  const [selectedYear, setSelectedYear] = useState(0);

  const schedule = useMemo(() => {
    const s = {
      sarahRate, sarahMaxRate, sarahRateGrowth,
      sarahCurrentClients, sarahMaxClients, sarahClientGrowth,
      sarahWorkMonths,
      totalProjectionMonths: sarahWorkMonths || 72,
      chadRetirementMonth: 72, // tax viz doesn't track Chad's work duration independently yet
      chadJob, chadJobSalary: chadJobSalary || 0, chadJobStartMonth: chadJobStartMonth ?? 3,
      taxMode, taxInflationAdjust, taxInflationRate, taxSchCExpenseRatio,
      taxPropertyTax, taxSalesTax, taxPersonalPropTax, taxMortgageInt,
      taxCharitable, taxMedical, taxW2Withholding, taxCtcChildren,
      taxOdcDependents, taxCapGainLoss, taxSolo401k,
    };
    try { return buildTaxSchedule(s); }
    catch { return []; }
  }, [
    sarahRate, sarahMaxRate, sarahRateGrowth,
    sarahCurrentClients, sarahMaxClients, sarahClientGrowth, sarahWorkMonths,
    chadJob, chadJobSalary, chadJobStartMonth,
    taxMode, taxInflationAdjust, taxInflationRate, taxSchCExpenseRatio,
    taxPropertyTax, taxSalesTax, taxPersonalPropTax, taxMortgageInt,
    taxCharitable, taxMedical, taxW2Withholding, taxCtcChildren,
    taxOdcDependents, taxCapGainLoss, taxSolo401k,
  ]);

  if (!schedule.length) return null;

  // Clamp selectedYear if schedule shrinks
  const safeYear = Math.min(selectedYear, schedule.length - 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginRight: 4 }}>
          Detail Year
        </span>
        {schedule.map((_, i) => (
          <YearPill key={i} year={i} selected={safeYear === i} onClick={setSelectedYear} />
        ))}
      </div>

      <TaxRatesOverTimeChart schedule={schedule} selectedYear={safeYear} />
      <TaxCompositionChart schedule={schedule} />
      <TaxWaterfallChart schedule={schedule} selectedYear={safeYear} />
      <TaxAttributionChart schedule={schedule} />
      <DeductionImpactChart schedule={schedule} selectedYear={safeYear} />
    </div>
  );
}

export default memo(TaxVisualization);
