import React, { memo } from "react";
import BridgeChart from '../../charts/BridgeChart.jsx';
import MiniNetWorthChart from '../../charts/MiniNetWorthChart.jsx';
import MiniIncomeExpenseChart from '../../charts/MiniIncomeExpenseChart.jsx';
import RecommendationCascade from '../RecommendationCascade.jsx';
import GoalStatusStrip from '../GoalStatusStrip.jsx';
import SurfaceCard from '../../components/ui/SurfaceCard.jsx';
import { UI_COLORS, UI_SPACE, UI_TEXT } from '../../ui/tokens.js';
import { fmtFull } from '../../model/formatters.js';

function HeroCard({ label, value, sub, tone }) {
  const color = tone === 'positive' ? UI_COLORS.positive
    : tone === 'destructive' ? UI_COLORS.destructive
    : tone === 'caution' ? UI_COLORS.caution
    : UI_COLORS.textMuted;

  return (
    <SurfaceCard padding="md" style={{ textAlign: 'center', minWidth: 0 }}>
      <div style={{
        fontSize: UI_TEXT.caption,
        color: UI_COLORS.textMuted,
        marginBottom: UI_SPACE.xs,
        fontWeight: 500,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 24,
        fontWeight: 700,
        color,
        lineHeight: 1.1,
      }}>
        {value}
      </div>
      {sub && (
        <div style={{
          fontSize: UI_TEXT.micro,
          color: UI_COLORS.textDim,
          marginTop: UI_SPACE.xs,
        }}>
          {sub}
        </div>
      )}
    </SurfaceCard>
  );
}

function HeroDashboard({ rawMonthlyGap, savingsZeroLabel, savingsZeroMonth, mcResults, onTabChange }) {
  const gapTone = rawMonthlyGap >= 0 ? 'positive' : 'destructive';
  const gapValue = fmtFull(rawMonthlyGap);
  const gapSub = rawMonthlyGap >= 0 ? 'Monthly surplus' : 'Monthly shortfall';

  const runwayMonths = savingsZeroMonth ? savingsZeroMonth.month : null;
  const runwayTone = runwayMonths == null ? 'positive'
    : runwayMonths < 24 ? 'destructive'
    : 'caution';
  const runwayValue = savingsZeroLabel;
  const runwaySub = runwayMonths == null ? 'No zero crossing' : 'Until savings depleted';

  const solvencyRate = mcResults?.solvencyRate ?? null;
  const solvencyPct = solvencyRate != null ? Math.round(solvencyRate * 100) : null;
  const successTone = solvencyPct == null ? 'muted'
    : solvencyPct >= 70 ? 'positive'
    : solvencyPct >= 40 ? 'caution'
    : 'destructive';

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: UI_SPACE.md,
      marginBottom: UI_SPACE.md,
    }}>
      <HeroCard label="Monthly Gap" value={gapValue} sub={gapSub} tone={gapTone} />
      <HeroCard label="Savings Runway" value={runwayValue} sub={runwaySub} tone={runwayTone} />
      {solvencyPct != null ? (
        <HeroCard
          label="Success Probability"
          value={`${solvencyPct}%`}
          sub="Monte Carlo solvency"
          tone={successTone}
        />
      ) : (
        <SurfaceCard padding="md" style={{ textAlign: 'center', minWidth: 0 }}>
          <div style={{
            fontSize: UI_TEXT.caption,
            color: UI_COLORS.textMuted,
            marginBottom: UI_SPACE.xs,
            fontWeight: 500,
          }}>
            Success Probability
          </div>
          <div style={{
            fontSize: 24,
            fontWeight: 700,
            color: UI_COLORS.textMuted,
            lineHeight: 1.1,
          }}>
            &mdash;
          </div>
          <div style={{ marginTop: UI_SPACE.xs }}>
            <button
              onClick={() => onTabChange('risk')}
              style={{
                background: 'none',
                border: 'none',
                color: UI_COLORS.primary,
                fontSize: UI_TEXT.micro,
                cursor: 'pointer',
                padding: 0,
                textDecoration: 'underline',
              }}
            >
              Run Monte Carlo
            </button>
          </div>
        </SurfaceCard>
      )}
    </div>
  );
}

function OverviewTab({
  bridgeProps, rawMonthlyGap, savingsZeroLabel, savingsZeroMonth, mcResults, onTabChange,
  savingsData, wealthData, monthlyDetail, ssType,
  goals, goalResults, gatherState,
  previewProps = {},
  presentMode = false,
}) {
  return (
    <>
      {/* Section 1: Health Strip */}
      <HeroDashboard
        rawMonthlyGap={rawMonthlyGap}
        savingsZeroLabel={savingsZeroLabel}
        savingsZeroMonth={savingsZeroMonth}
        mcResults={mcResults}
        onTabChange={onTabChange}
      />

      {/* Section 2: Financial Snapshot — 2 mini-charts */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
        gap: UI_SPACE.md,
        marginBottom: UI_SPACE.md,
      }}>
        <MiniNetWorthChart
          savingsData={savingsData}
          wealthData={wealthData}
          onTabChange={onTabChange}
        />
        <MiniIncomeExpenseChart
          monthlyDetail={monthlyDetail}
          ssType={ssType}
          onTabChange={onTabChange}
        />
      </div>

      {/* Section 3: Action Row — Top Moves + Goals */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: UI_SPACE.md,
        marginBottom: UI_SPACE.md,
      }}>
        <SurfaceCard padding="md" style={{ display: 'flex', flexDirection: 'column', gap: UI_SPACE.sm, height: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: UI_TEXT.body, fontWeight: 600, color: UI_COLORS.textStrong }}>
              Top 3 Moves
            </span>
            {onTabChange && (
              <button onClick={() => onTabChange('plan')} style={{
                background: 'none', border: 'none', color: UI_COLORS.textDim,
                fontSize: 10, cursor: 'pointer', padding: 0, textDecoration: 'underline',
              }}>
                Details →
              </button>
            )}
          </div>
          <RecommendationCascade
            gatherState={gatherState}
            previewMoves={previewProps.previewMoves}
            applyPreviewMove={previewProps.applyPreviewMove}
            removePreviewMove={previewProps.removePreviewMove}
            clearPreview={previewProps.clearPreview}
            commitPreview={previewProps.commitPreview}
            saveFromPreview={previewProps.saveFromPreview}
            count={3}
            presentMode={presentMode}
          />
        </SurfaceCard>
        <GoalStatusStrip goals={goals} goalResults={goalResults} onTabChange={onTabChange} />
      </div>

      {/* Section 4: Bridge Story */}
      <BridgeChart {...bridgeProps} variant='overview' />
    </>
  );
}

export default memo(OverviewTab);
