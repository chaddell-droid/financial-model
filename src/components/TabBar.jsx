import React from 'react';
import { UI_COLORS, UI_RADII, UI_SPACE, UI_TEXT } from '../ui/tokens.js';

const TABS = [
  { id: 'overview', label: 'Overview', icon: '📊' },
  { id: 'plan', label: 'Plan', icon: '📝' },
  { id: 'track', label: 'Track', icon: '📋' },
  { id: 'income', label: 'Income', icon: '💰' },
  { id: 'risk', label: 'Risk', icon: '🛡️' },
  { id: 'details', label: 'Details', icon: '🔍' },
];

const ACCENT_COLORS = {
  overview: UI_COLORS.primary,
  plan: UI_COLORS.positive,
  track: UI_COLORS.info,
  income: UI_COLORS.modeDad,
  risk: UI_COLORS.caution,
  details: UI_COLORS.textMuted,
};

export default function TabBar({ activeTab, onChange, compact = false }) {
  return (
    <div
      data-testid='tab-bar'
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
        gap: UI_SPACE.xs,
        marginBottom: 20,
        padding: UI_SPACE.xs,
        background: UI_COLORS.surfaceMuted,
        borderRadius: UI_RADII.md,
        border: `1px solid ${UI_COLORS.border}`,
        position: 'sticky',
        top: 0,
        zIndex: 20,
      }}
    >
      {TABS.map((tab) => {
        const active = activeTab === tab.id;
        const color = ACCENT_COLORS[tab.id];

        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            data-testid={`tab-${tab.id}`}
            aria-label={`Open ${tab.label} tab`}
            style={{
              minWidth: 0,
              padding: compact ? '8px 6px' : '10px 8px',
              borderRadius: UI_RADII.sm,
              cursor: 'pointer',
              border: 'none',
              background: active ? UI_COLORS.surface : 'transparent',
              color: active ? color : UI_COLORS.textMuted,
              fontSize: compact ? UI_TEXT.micro : UI_TEXT.caption,
              fontWeight: active ? 700 : 600,
              transition: 'background 0.15s ease, color 0.15s ease',
              borderBottom: active ? `2px solid ${color}` : '2px solid transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: compact ? 4 : 6,
            }}
          >
            <span style={{ fontSize: compact ? 12 : 14 }} aria-hidden='true'>
              {tab.icon}
            </span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
