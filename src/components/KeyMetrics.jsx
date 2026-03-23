import React from 'react';
import SurfaceCard from './ui/SurfaceCard.jsx';
import { buildOverviewStatusModel } from '../model/overviewStory.js';
import { UI_COLORS, UI_SPACE, UI_TEXT } from '../ui/tokens.js';

const ITEM_TEST_IDS = {
  current_gap: 'overview-status-current-gap',
  breakeven: 'overview-status-breakeven',
  best_projected_gap: 'overview-status-best-gap',
  runway: 'overview-status-runway',
};

function MetricValue({ value, color }) {
  return (
    <div
      style={{
        fontSize: 18,
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
  bestProjectedGap,
  bestProjectedLabel,
}) {
  const status = buildOverviewStatusModel({
    rawMonthlyGap,
    netMonthly,
    breakevenLabel,
    breakevenIdx,
    bestProjectedGap,
    bestProjectedLabel,
    savingsZeroLabel,
    savingsZeroMonth,
    advanceNeeded,
    steadyStateNet,
    steadyLabel,
    mcResults,
  });

  return (
    <SurfaceCard
      data-testid='overview-status-strip'
      tone='featured'
      padding='md'
      style={{ marginBottom: UI_SPACE.lg }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: UI_SPACE.lg,
          flexWrap: 'wrap',
          marginBottom: UI_SPACE.md,
        }}
      >
        <div style={{ minWidth: 220, flex: '1 1 260px' }}>
          <div
            data-testid='overview-primary-question'
            style={{
              fontSize: UI_TEXT.micro,
              color: UI_COLORS.textMuted,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: 4,
            }}
          >
            {status.question}
          </div>
          <div
            data-testid='overview-primary-answer'
            style={{
              fontSize: UI_TEXT.heading,
              fontWeight: 700,
              color: UI_COLORS.textStrong,
              lineHeight: 1.2,
            }}
          >
            {status.answer}
          </div>
        </div>

        <div
          data-testid='overview-status-items'
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: UI_SPACE.sm,
            flex: '3 1 640px',
          }}
        >
          {status.items.map((item) => {
            const color = item.tone === 'positive'
              ? UI_COLORS.positive
              : item.tone === 'destructive'
                ? UI_COLORS.destructive
                : item.tone === 'caution'
                  ? UI_COLORS.caution
                  : UI_COLORS.textStrong;

            return (
              <div
                key={item.id}
                data-testid={ITEM_TEST_IDS[item.id]}
                style={{
                  minWidth: 0,
                  paddingLeft: UI_SPACE.md,
                  borderLeft: `2px solid ${color}`,
                }}
              >
                <div style={{ fontSize: UI_TEXT.micro, color: UI_COLORS.textMuted, marginBottom: 4 }}>
                  {item.label}
                </div>
                <MetricValue value={item.valueLabel} color={color} />
                <div style={{ fontSize: UI_TEXT.micro, color: UI_COLORS.textDim, marginTop: 4, lineHeight: 1.35 }}>
                  {item.detail}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </SurfaceCard>
  );
}
