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
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 9, color: UI_COLORS.textMuted, marginBottom: 1 }}>{label}</div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: UI_COLORS.textStrong, fontFamily: "'JetBrains Mono', monospace" }}>
          {fmtFull(current)}{suffix}
        </span>
        <span style={{ fontSize: 10, fontWeight: 600, color: deltaColor, fontFamily: "'JetBrains Mono', monospace" }}>
          {delta > 0 ? '+' : ''}{fmtFull(delta)}
        </span>
      </div>
    </div>
  );
}

export default function ComparisonBanner({ comparisons, compareProjections, compareColors, onRemoveComparison, onClearAll, projection }) {
  if (!comparisons || comparisons.length === 0) return null;

  return (
    <SurfaceCard
      data-testid='comparison-banner'
      tone='compare'
      padding='md'
      style={{ marginBottom: 16 }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: UI_SPACE.md, marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: UI_SPACE.sm, flexWrap: 'wrap' }}>
          <span style={{ fontSize: UI_TEXT.label, color: UI_COLORS.caution, fontWeight: 700 }}>
            Comparing {comparisons.length} scenario{comparisons.length > 1 ? 's' : ''}
          </span>
          <span style={{ fontSize: UI_TEXT.micro, color: UI_COLORS.textMuted }}>
            Dashed lines = comparison scenarios
          </span>
        </div>
        <ActionButton
          onClick={onClearAll}
          data-testid='comparison-banner-clear'
          variant={UI_ACTION_VARIANTS.secondary}
          accent={UI_COLORS.caution}
          size='sm'
        >
          Clear all
        </ActionButton>
      </div>

      {/* One delta row per comparison */}
      <div style={{ display: 'grid', gap: 8 }}>
        {comparisons.map((comp, ci) => {
          const color = (compareColors || [])[ci] || '#fbbf24';
          const cp = (compareProjections || [])[ci];
          const compProj = cp?.projection;

          // Compute deltas if both projections available
          let deltas = null;
          if (projection && compProj) {
            const curMD = projection.monthlyData;
            const compMD = compProj.monthlyData;
            const curData = projection.data;
            const compData = compProj.data;
            const curFinalBal = curMD[curMD.length - 1]?.balance || 0;
            const compFinalBal = compMD[compMD.length - 1]?.balance || 0;
            const curSteadyIdx = curData.findIndex(d => d.month >= 36);
            const compSteadyIdx = compData.findIndex(d => d.month >= 36);
            const curSteadyIncome = (curSteadyIdx >= 0 ? curData[curSteadyIdx] : curData[curData.length - 1])?.totalIncome || 0;
            const compSteadyIncome = (compSteadyIdx >= 0 ? compData[compSteadyIdx] : compData[compData.length - 1])?.totalIncome || 0;
            const curGap = curMD[0]?.netCashFlow || 0;
            const compGap = compMD[0]?.netCashFlow || 0;
            const curExp = curMD[0]?.expenses || 0;
            const compExp = compMD[0]?.expenses || 0;
            deltas = { curFinalBal, compFinalBal, curSteadyIncome, compSteadyIncome, curGap, compGap, curExp, compExp };
          }

          return (
            <div key={comp.name} style={{
              background: UI_COLORS.surfaceMuted, borderRadius: 6, padding: '8px 10px',
              border: `1px solid ${color}33`,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: deltas ? 6 : 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 16, height: 3, background: color, borderRadius: 2 }} />
                  <span style={{ fontSize: UI_TEXT.caption, color, fontWeight: 700 }}>
                    {comp.name}
                  </span>
                </div>
                <button
                  onClick={() => onRemoveComparison(comp.name)}
                  style={{ background: 'none', border: 'none', color: UI_COLORS.textDim, fontSize: 12, cursor: 'pointer', padding: '2px 6px' }}
                  aria-label={`Remove comparison ${comp.name}`}
                >✕</button>
              </div>
              {deltas && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                  <DeltaCard label="Final balance" current={deltas.curFinalBal} compare={deltas.compFinalBal} />
                  <DeltaCard label="Steady income" current={deltas.curSteadyIncome} compare={deltas.compSteadyIncome} suffix="/mo" />
                  <DeltaCard label="Monthly gap" current={deltas.curGap} compare={deltas.compGap} suffix="/mo" />
                  <DeltaCard label="Expenses" current={deltas.curExp} compare={deltas.compExp} suffix="/mo" lowerIsBetter />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </SurfaceCard>
  );
}
