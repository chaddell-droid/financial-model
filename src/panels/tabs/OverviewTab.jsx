import React, { memo } from "react";
import BridgeChart from '../../charts/BridgeChart.jsx';
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
        fontSize: 28,
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
  // Monthly Gap: positive means surplus, negative means deficit
  const gapTone = rawMonthlyGap >= 0 ? 'positive' : 'destructive';
  const gapValue = fmtFull(rawMonthlyGap);
  const gapSub = rawMonthlyGap >= 0 ? 'Monthly surplus' : 'Monthly shortfall';

  // Savings Runway
  const runwayMonths = savingsZeroMonth ? savingsZeroMonth.month : null;
  const runwayTone = runwayMonths == null ? 'positive'
    : runwayMonths < 24 ? 'destructive'
    : 'caution';
  const runwayValue = savingsZeroLabel;
  const runwaySub = runwayMonths == null ? 'No zero crossing' : 'Until savings depleted';

  // Success Probability (solvencyRate is 0-1)
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
      marginBottom: UI_SPACE.lg,
    }}>
      <HeroCard
        label="Monthly Gap"
        value={gapValue}
        sub={gapSub}
        tone={gapTone}
      />
      <HeroCard
        label="Savings Runway"
        value={runwayValue}
        sub={runwaySub}
        tone={runwayTone}
      />
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
            fontSize: 28,
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

function OverviewTab({ bridgeProps, rawMonthlyGap, savingsZeroLabel, savingsZeroMonth, mcResults, onTabChange }) {
  return (
    <>
      <HeroDashboard
        rawMonthlyGap={rawMonthlyGap}
        savingsZeroLabel={savingsZeroLabel}
        savingsZeroMonth={savingsZeroMonth}
        mcResults={mcResults}
        onTabChange={onTabChange}
      />
      <BridgeChart {...bridgeProps} variant='overview' />
    </>
  );
}

export default memo(OverviewTab);
