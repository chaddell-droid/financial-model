import React from 'react';
import { fmtFull } from '../model/formatters.js';
import SurfaceCard from './ui/SurfaceCard.jsx';
import { getSummaryTimeframeLabel } from '../charts/chartContract.js';
import { METRIC_LABELS, TIMEFRAME_LABELS } from '../content/uiGlossary.js';
import { UI_COLORS, UI_SPACE, UI_TEXT } from '../ui/tokens.js';

function MetricValue({ value, color, small }) {
  return (
    <div
      style={{
        fontSize: small ? 16 : 22,
        fontWeight: 700,
        color,
        fontFamily: "'JetBrains Mono', monospace",
      }}
    >
      {value}
    </div>
  );
}

export default function KeyMetrics({
  netMonthly,
  breakevenLabel,
  breakevenIdx,
  savingsZeroLabel,
  savingsZeroMonth,
  advanceNeeded,
  mcResults,
  rawMonthlyGap,
  steadyStateNet,
  steadyLabel,
}) {
  const summaryCards = [
    {
      label: TIMEFRAME_LABELS.today,
      value: rawMonthlyGap,
      color: UI_COLORS.destructive,
      sublabel: 'No plan toggles applied',
    },
    {
      label: TIMEFRAME_LABELS.currentAssumptions,
      value: netMonthly,
      color: netMonthly >= 0 ? UI_COLORS.positive : UI_COLORS.textMuted,
      sublabel: getSummaryTimeframeLabel('current'),
    },
    {
      label: `${TIMEFRAME_LABELS.steadyState} (${steadyLabel || 'Y3'})`,
      value: steadyStateNet,
      color: steadyStateNet >= 0 ? UI_COLORS.positive : UI_COLORS.textMuted,
      sublabel: getSummaryTimeframeLabel('steady'),
    },
    {
      label: METRIC_LABELS.totalSwing,
      value: steadyStateNet - rawMonthlyGap,
      color: steadyStateNet - rawMonthlyGap >= 0 ? UI_COLORS.positive : UI_COLORS.destructive,
      sublabel: `${TIMEFRAME_LABELS.today} → ${TIMEFRAME_LABELS.steadyState}`,
    },
  ];

  const metrics = [
    {
      label: METRIC_LABELS.currentMonthlyGap,
      value: fmtFull(netMonthly),
      color: netMonthly >= 0 ? UI_COLORS.positive : UI_COLORS.destructive,
    },
    {
      label: METRIC_LABELS.cashFlowBreakeven,
      value: breakevenLabel,
      isText: true,
      color: breakevenIdx >= 0 ? UI_COLORS.positive : UI_COLORS.caution,
      sublabel: 'When income covers expenses',
      smallText: breakevenIdx < 0,
    },
    {
      label: METRIC_LABELS.savingsRunway,
      value: savingsZeroLabel,
      isText: true,
      color: savingsZeroMonth ? UI_COLORS.destructive : UI_COLORS.positive,
      sublabel: savingsZeroMonth ? 'Until savings are depleted' : 'Savings stay positive through the horizon',
      smallText: true,
    },
    {
      label: METRIC_LABELS.advanceNeeded,
      value: fmtFull(advanceNeeded),
      color: UI_COLORS.caution,
    },
    ...(mcResults ? [{
      label: METRIC_LABELS.monteCarloSolvency,
      value: `${(mcResults.solvencyRate * 100).toFixed(1)}%`,
      isText: true,
      color: mcResults.solvencyRate >= 0.95
        ? UI_COLORS.positive
        : mcResults.solvencyRate >= 0.80
          ? UI_COLORS.caution
          : UI_COLORS.destructive,
      sublabel: `${mcResults.numSims} simulations`,
    }] : []),
  ];

  return (
    <div data-testid='key-metrics' style={{ display: 'grid', gap: UI_SPACE.lg, marginBottom: UI_SPACE.xl }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: UI_SPACE.sm,
          alignItems: 'stretch',
        }}
      >
        {summaryCards.map((card) => (
          <SurfaceCard key={card.label} tone='featured' padding='md'>
            <div style={{ fontSize: UI_TEXT.micro, color: UI_COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
              {card.label}
            </div>
            <MetricValue value={fmtFull(card.value)} color={card.color} />
            <div style={{ fontSize: UI_TEXT.micro, color: UI_COLORS.textDim, marginTop: 4 }}>
              {card.sublabel}
            </div>
          </SurfaceCard>
        ))}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: UI_SPACE.sm,
        }}
      >
        {metrics.map((metric) => (
          <SurfaceCard key={metric.label} tone='default' padding='md'>
            <div style={{ fontSize: UI_TEXT.micro, color: UI_COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
              {metric.label}
            </div>
            <MetricValue value={metric.value} color={metric.color} small={metric.smallText} />
            {metric.sublabel ? (
              <div style={{ fontSize: UI_TEXT.micro, color: UI_COLORS.textDim, marginTop: 4 }}>
                {metric.sublabel}
              </div>
            ) : null}
          </SurfaceCard>
        ))}
      </div>
    </div>
  );
}
