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
  // Full gathered state factory (stableGatherState from FinancialModel).
  // The schedule feeds buildTaxSchedule the COMPLETE model state — a
  // hand-built subset here previously omitted all of Chad's stock/bonus/
  // pension/401k comp and hardcoded chadRetirementMonth=72 (remediation
  // 2026-06-09 D1 partial-state bug).
  gatherState,
}) {
  const [selectedYear, setSelectedYear] = useState(0);

  // gatherState identity changes whenever model state changes, so it is the
  // only data dependency needed here.
  const schedule = useMemo(() => {
    try { return buildTaxSchedule(gatherState()); }
    catch { return []; }
  }, [gatherState]);

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
