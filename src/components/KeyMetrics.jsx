import React from 'react';
import SurfaceCard from './ui/SurfaceCard.jsx';
import { buildOverviewStatusModel } from '../model/overviewStory.js';
import { fmtFull } from '../model/formatters.js';
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
  totalMonthlySpend,
  oneTimeExtras,
  oneTimeMonths,
  totalCurrentIncome,
  totalCurrentExpenses,
  retirementSpendingTargets,
  onFieldChange,
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

  const baseSpend = totalMonthlySpend ?? totalCurrentExpenses;
  const extrasActive = (oneTimeExtras || 0) > 0 && (oneTimeMonths || 0) > 0;
  const displaySpend = baseSpend + (extrasActive ? oneTimeExtras : 0);
  const savingsBurn = displaySpend - totalCurrentIncome;

  return (
    <SurfaceCard
      data-testid='overview-status-strip'
      tone='featured'
      padding='md'
      style={{ marginBottom: UI_SPACE.lg }}
    >
      {/* Primary: Total Spend + Savings Burn */}
      <div
        style={{
          display: 'flex',
          gap: UI_SPACE.xl,
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          marginBottom: UI_SPACE.md,
          paddingBottom: UI_SPACE.md,
          borderBottom: `1px solid ${UI_COLORS.border}`,
        }}
      >
        <div style={{ flex: '1 1 220px', minWidth: 180 }}>
          <div style={{
            fontSize: UI_TEXT.micro, color: UI_COLORS.textMuted,
            textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4,
          }}>
            Base Monthly Spend
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 13, color: UI_COLORS.textDim }}>$</span>
            <input
              type="number"
              value={totalMonthlySpend ?? ''}
              placeholder={String(Math.round(totalCurrentExpenses))}
              onChange={(e) => {
                const v = e.target.value;
                onFieldChange('totalMonthlySpend')(v === '' ? null : Math.round(Number(v)));
              }}
              data-testid="key-metrics-total-spend"
              aria-label="Base monthly spend"
              style={{
                width: 110,
                background: 'transparent',
                border: 'none',
                borderBottom: `2px solid ${totalMonthlySpend != null ? UI_COLORS.primary : UI_COLORS.border}`,
                color: totalMonthlySpend != null ? UI_COLORS.textStrong : UI_COLORS.textDim,
                padding: '2px 0',
                fontSize: UI_TEXT.hero,
                fontWeight: 700,
                fontFamily: "'JetBrains Mono', monospace",
                outline: 'none',
              }}
            />
            {totalMonthlySpend != null && (
              <button
                onClick={() => onFieldChange('totalMonthlySpend')(null)}
                aria-label="Clear base spend override"
                style={{
                  background: 'transparent', border: 'none',
                  color: UI_COLORS.textDim, fontSize: 12, cursor: 'pointer', padding: '2px 4px',
                }}
              >✕</button>
            )}
          </div>
          <div style={{ fontSize: UI_TEXT.micro, color: UI_COLORS.textDim, marginTop: 4 }}>
            Recurring (bank statements)
          </div>
        </div>

        <div style={{ flex: '1 1 180px', minWidth: 150 }}>
          <div style={{
            fontSize: UI_TEXT.micro, color: UI_COLORS.textMuted,
            textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4,
          }}>
            One-Time Extras
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 13, color: UI_COLORS.textDim }}>$</span>
            <input
              type="number"
              value={oneTimeExtras || ''}
              placeholder="0"
              onChange={(e) => {
                const v = e.target.value;
                onFieldChange('oneTimeExtras')(v === '' ? 0 : Math.max(0, Math.round(Number(v))));
              }}
              data-testid="key-metrics-one-time-extras"
              aria-label="One-time extras per month"
              style={{
                width: 80,
                background: 'transparent',
                border: 'none',
                borderBottom: `2px solid ${extrasActive ? UI_COLORS.caution : UI_COLORS.border}`,
                color: extrasActive ? UI_COLORS.caution : UI_COLORS.textDim,
                padding: '2px 0',
                fontSize: UI_TEXT.hero,
                fontWeight: 700,
                fontFamily: "'JetBrains Mono', monospace",
                outline: 'none',
              }}
            />
            <span style={{ fontSize: 12, color: UI_COLORS.textDim }}>for</span>
            <input
              type="number"
              value={oneTimeMonths || ''}
              placeholder="0"
              onChange={(e) => {
                const v = e.target.value;
                onFieldChange('oneTimeMonths')(v === '' ? 0 : Math.min(72, Math.max(0, Math.round(Number(v)))));
              }}
              data-testid="key-metrics-one-time-months"
              aria-label="Duration in months"
              style={{
                width: 36,
                background: 'transparent',
                border: 'none',
                borderBottom: `2px solid ${extrasActive ? UI_COLORS.caution : UI_COLORS.border}`,
                color: extrasActive ? UI_COLORS.caution : UI_COLORS.textDim,
                padding: '2px 0',
                fontSize: UI_TEXT.hero,
                fontWeight: 700,
                fontFamily: "'JetBrains Mono', monospace",
                outline: 'none',
                textAlign: 'center',
              }}
            />
            <span style={{ fontSize: 12, color: UI_COLORS.textDim }}>mo</span>
          </div>
          <div style={{ fontSize: UI_TEXT.micro, color: extrasActive ? UI_COLORS.caution : UI_COLORS.textDim, marginTop: 4 }}>
            {extrasActive ? `Total: ${fmtFull(displaySpend)}/mo for ${oneTimeMonths}mo` : 'Medical, travel, loan payoffs, etc.'}
          </div>
        </div>

        <div style={{ flex: '1 1 180px', minWidth: 150 }}>
          <div style={{
            fontSize: UI_TEXT.micro, color: UI_COLORS.textMuted,
            textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4,
          }}>
            Total Income
          </div>
          <div style={{
            fontSize: UI_TEXT.hero, fontWeight: 700,
            fontFamily: "'JetBrains Mono', monospace",
            color: UI_COLORS.positive,
          }}>
            {fmtFull(totalCurrentIncome)}
          </div>
          <div style={{ fontSize: UI_TEXT.micro, color: UI_COLORS.textDim, marginTop: 4 }}>
            Current monthly income
          </div>
        </div>

        <div style={{ flex: '1 1 180px', minWidth: 150 }}>
          <div style={{
            fontSize: UI_TEXT.micro, color: UI_COLORS.textMuted,
            textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4,
          }}>
            Monthly Savings Burn
          </div>
          <div style={{
            fontSize: UI_TEXT.hero, fontWeight: 700,
            fontFamily: "'JetBrains Mono', monospace",
            color: savingsBurn <= 0 ? UI_COLORS.positive : UI_COLORS.destructive,
          }}>
            {fmtFull(Math.abs(savingsBurn))}/mo
          </div>
          <div style={{ fontSize: UI_TEXT.micro, color: UI_COLORS.textDim, marginTop: 4 }}>
            {savingsBurn > 0 ? 'Drawing from savings' : 'Adding to savings'}
          </div>
        </div>

        {retirementSpendingTargets && retirementSpendingTargets.preInheritance > 0 && (
          <div style={{ flex: '1 1 180px', minWidth: 150 }}>
            <div style={{
              fontSize: UI_TEXT.micro, color: UI_COLORS.textMuted,
              textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4,
            }}>
              {retirementSpendingTargets.inhDuringCouple
                ? `Pre-Inheritance Target (67-${retirementSpendingTargets.inheritanceChadAge})`
                : 'Retirement Spending Target'}
            </div>
            <div style={{
              fontSize: UI_TEXT.hero, fontWeight: 700,
              fontFamily: "'JetBrains Mono', monospace",
              color: UI_COLORS.primary,
            }}>
              {fmtFull(retirementSpendingTargets.preInheritance)}/mo
            </div>
            <div style={{ fontSize: UI_TEXT.micro, color: UI_COLORS.textDim, marginTop: 4 }}>
              Historical safe (10th pct)
            </div>
          </div>
        )}
      </div>

      {/* Secondary: Status items */}
      <div
        data-testid='overview-status-items'
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: UI_SPACE.sm,
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
    </SurfaceCard>
  );
}
