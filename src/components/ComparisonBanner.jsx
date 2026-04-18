import React from 'react';
import ActionButton from './ui/ActionButton.jsx';
import SurfaceCard from './ui/SurfaceCard.jsx';
import { fmtFull } from '../model/formatters.js';
import { UI_ACTION_VARIANTS, UI_COLORS, UI_SPACE, UI_TEXT } from '../ui/tokens.js';

function DeltaCard({ label, current, compare, suffix = '', lowerIsBetter = false }) {
  const delta = current - compare;
  const better = lowerIsBetter ? delta < 0 : delta > 0;
  const deltaColor = delta === 0 ? UI_COLORS.textMuted : better ? '#4ade80' : '#f87171';
  return (
    <div style={{
      background: UI_COLORS.surfaceMuted, borderRadius: 6, padding: '6px 10px',
      border: `1px solid ${UI_COLORS.border}`, minWidth: 130,
    }}>
      <div style={{ fontSize: 9, color: UI_COLORS.textMuted, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: UI_COLORS.textStrong, fontFamily: "'JetBrains Mono', monospace" }}>
          {fmtFull(current)}{suffix}
        </span>
        <span style={{ fontSize: 11, fontWeight: 600, color: deltaColor, fontFamily: "'JetBrains Mono', monospace" }}>
          {delta > 0 ? '+' : ''}{fmtFull(delta)}{suffix}
        </span>
      </div>
      <div style={{ fontSize: 9, color: '#fbbf24', marginTop: 1, fontFamily: "'JetBrains Mono', monospace" }}>
        was {fmtFull(compare)}{suffix}
      </div>
    </div>
  );
}

export default function ComparisonBanner({ compareState, compareName, onClearCompare, projection, compareProjection }) {
  if (!compareState) return null;

  // Compute delta metrics when both projections are available
  const deltas = (projection && compareProjection) ? (() => {
    const curMD = projection.monthlyData;
    const compMD = compareProjection.monthlyData;
    const curData = projection.data;
    const compData = compareProjection.data;

    // Final savings balance
    const curFinalBal = curMD[curMD.length - 1]?.balance || 0;
    const compFinalBal = compMD[compMD.length - 1]?.balance || 0;

    // Steady-state income (first quarter at month >= 36, or last)
    const curSteadyIdx = curData.findIndex(d => d.month >= 36);
    const compSteadyIdx = compData.findIndex(d => d.month >= 36);
    const curSteadyIncome = (curSteadyIdx >= 0 ? curData[curSteadyIdx] : curData[curData.length - 1])?.totalIncome || 0;
    const compSteadyIncome = (compSteadyIdx >= 0 ? compData[compSteadyIdx] : compData[compData.length - 1])?.totalIncome || 0;

    // Current monthly gap (month 0)
    const curGap = curMD[0]?.netCashFlow || 0;
    const compGap = compMD[0]?.netCashFlow || 0;

    // Current expenses (month 0)
    const curExp = curMD[0]?.expenses || 0;
    const compExp = compMD[0]?.expenses || 0;

    return { curFinalBal, compFinalBal, curSteadyIncome, compSteadyIncome, curGap, compGap, curExp, compExp };
  })() : null;

  return (
    <SurfaceCard
      data-testid='comparison-banner'
      tone='compare'
      padding='md'
      style={{ marginBottom: 16 }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: UI_SPACE.md, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: UI_SPACE.sm, flexWrap: 'wrap' }}>
          <div style={{ width: 14, height: 3, background: UI_COLORS.compare, borderRadius: 2 }} />
          <span style={{ fontSize: UI_TEXT.label, color: UI_COLORS.caution, fontWeight: 700 }}>
            Comparing current settings with &quot;{compareName}&quot;
          </span>
          <span style={{ fontSize: UI_TEXT.micro, color: UI_COLORS.textMuted }}>
            Dashed line = comparison scenario, solid line = current plan
          </span>
        </div>

        <ActionButton
          onClick={onClearCompare}
          data-testid='comparison-banner-clear'
          variant={UI_ACTION_VARIANTS.secondary}
          accent={UI_COLORS.caution}
          size='sm'
        >
          Clear comparison
        </ActionButton>
      </div>

      {/* Delta KPI strip */}
      {deltas && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginTop: 12 }}>
          <DeltaCard label="Final balance" current={deltas.curFinalBal} compare={deltas.compFinalBal} />
          <DeltaCard label="Steady income" current={deltas.curSteadyIncome} compare={deltas.compSteadyIncome} suffix="/mo" />
          <DeltaCard label="Monthly gap (now)" current={deltas.curGap} compare={deltas.compGap} suffix="/mo" />
          <DeltaCard label="Expenses (now)" current={deltas.curExp} compare={deltas.compExp} suffix="/mo" lowerIsBetter />
        </div>
      )}
    </SurfaceCard>
  );
}
