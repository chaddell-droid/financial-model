// Shared primitives for the retirement surface — extracted verbatim from
// src/charts/RetirementIncomeChart.jsx (Phase 7 file-size split). Used by
// RetirementIncomeChart, RetirementSummaryCards, and
// RetirementDecisionPreview.
import React, { useState } from 'react';
import { fmtFull } from '../model/formatters.js';
import HelpTip from '../components/help/HelpTip.jsx';
import SurfaceCard from '../components/ui/SurfaceCard.jsx';
import { COLORS } from './chartUtils.js';

export const PWA_STRATEGY_OPTIONS = [
  { value: 'fixed_percentile', label: 'Fixed Percentile' },
  { value: 'sticky_median', label: 'Sticky Median' },
  { value: 'sticky_quartile_nudge', label: 'Sticky Quartile Nudge' },
];

export function getPwaStrategyLabel(strategy) {
  return PWA_STRATEGY_OPTIONS.find(option => option.value === strategy)?.label || 'Adaptive PWA';
}

export function formatCohortLabel({ year, month }) {
  if (!year || !month) return 'n/a';
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function formatRange(startValue, endValue, suffix = '') {
  if (startValue === endValue) return `${fmtFull(startValue)}${suffix}`;
  return `${fmtFull(startValue)} -> ${fmtFull(endValue)}${suffix}`;
}

export const fmtPool = (v) => v >= 1000000 ? `$${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `$${(v / 1000).toFixed(0)}K` : `$${v}`;

export function LabelWithHelp({ label, help, accent = COLORS.blue, align = 'left' }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <span>{label}</span>
      <HelpTip help={help} accent={accent} align={align} />
    </span>
  );
}

export function HelpChip({ label, help, accent = COLORS.blue }) {
  return (
    <div
      style={{
        background: `${COLORS.bgInk}66`,
        border: `1px solid ${accent}33`,
        borderRadius: 8,
        padding: '8px 10px',
      }}
    >
      <div style={{ fontSize: 11, color: COLORS.textSecondary, fontWeight: 600, lineHeight: 1.35 }}>
        <LabelWithHelp label={label} help={help} accent={accent} />
      </div>
      <div style={{ fontSize: 10, color: COLORS.textMuted, lineHeight: 1.45, marginTop: 4 }}>
        {help.short}
      </div>
    </div>
  );
}

export function ModeIdentityBanner({
  testId,
  accent,
  title,
  summary,
  primaryLabel,
  primaryValue,
  secondaryLabel,
  secondaryValue,
  bullets,
}) {
  const [collapsed, setCollapsed] = useState(true);
  return (
    <SurfaceCard
      data-testid={testId}
      tone="featured"
      padding="sm"
      style={{
        background: COLORS.bgDeep,
        borderColor: `${accent}55`,
        marginBottom: 16,
      }}
    >
      <div
        onClick={() => setCollapsed(!collapsed)}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}
      >
        <div style={{ fontSize: 11, color: accent, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          Mode identity — {title}
        </div>
        <span style={{ fontSize: 10, color: COLORS.textDim }}>{collapsed ? '▶' : '▼'}</span>
      </div>
      {!collapsed && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(240px, 1fr)', gap: 12, alignItems: 'start', marginTop: 8 }}>
            <div>
              <div style={{ fontSize: 13, color: COLORS.textSoft, lineHeight: 1.5 }}>
                {summary}
              </div>
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ background: `${COLORS.bgInk}66`, border: `1px solid ${COLORS.bgCard}`, borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ fontSize: 10, color: COLORS.textMuted, marginBottom: 4, fontWeight: 700 }}>
                  {primaryLabel}
                </div>
                <div style={{ fontSize: 15, color: accent, fontWeight: 700, lineHeight: 1.35 }}>
                  {primaryValue}
                </div>
              </div>
              <div style={{ background: `${COLORS.bgInk}66`, border: `1px solid ${COLORS.bgCard}`, borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ fontSize: 10, color: COLORS.textMuted, marginBottom: 4, fontWeight: 700 }}>
                  {secondaryLabel}
                </div>
                <div style={{ fontSize: 13, color: COLORS.textSecondary, fontWeight: 600, lineHeight: 1.45 }}>
                  {secondaryValue}
                </div>
              </div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8, marginTop: 12 }}>
            {bullets.map((bullet) => (
              <div key={bullet} style={{ fontSize: 12, color: COLORS.textSoft, lineHeight: 1.45 }}>
                {bullet}
              </div>
            ))}
          </div>
        </>
      )}
    </SurfaceCard>
  );
}

export function ControlSection({ title, subtitle, children, testId }) {
  return (
    <div data-testid={testId}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline', marginBottom: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, color: COLORS.textSecondary, fontWeight: 700 }}>
          {title}
        </div>
        {subtitle ? (
          <div style={{ fontSize: 11, color: COLORS.textMuted, lineHeight: 1.4 }}>
            {subtitle}
          </div>
        ) : null}
      </div>
      {children}
    </div>
  );
}
