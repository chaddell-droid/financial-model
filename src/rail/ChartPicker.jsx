import React from 'react';
import { getAvailableCharts } from './chartRegistry.js';
import { UI_COLORS, UI_TEXT, UI_SPACE, UI_RADII } from '../ui/tokens.js';

/**
 * Panel showing available charts that can be added to the rail.
 * Filters out charts already in the current tab's config.
 */
export default function ChartPicker({ currentIds, onAdd, onClose }) {
  const available = getAvailableCharts(currentIds);

  return (
    <div data-testid="chart-picker" style={{
      background: '#0f172a', borderRadius: UI_RADII.sm,
      border: `1px solid ${UI_COLORS.border}`, padding: UI_SPACE.md,
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: UI_SPACE.sm,
      }}>
        <span style={{ fontSize: UI_TEXT.caption, color: UI_COLORS.textStrong, fontWeight: 600 }}>
          Add a chart
        </span>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: UI_COLORS.textDim, fontSize: 12, cursor: 'pointer', padding: '2px 4px' }}
          aria-label="Close chart picker"
        >✕</button>
      </div>

      {available.length === 0 ? (
        <div style={{ fontSize: UI_TEXT.caption, color: UI_COLORS.textDim, fontStyle: 'italic' }}>
          All available charts are already in the rail.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: UI_SPACE.xs }}>
          {available.map((chart) => (
            <button
              key={chart.id}
              data-testid={`chart-picker-add-${chart.id}`}
              onClick={() => onAdd(chart.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: UI_SPACE.sm,
                padding: `${UI_SPACE.xs}px ${UI_SPACE.sm}px`,
                background: 'transparent', border: `1px solid ${UI_COLORS.border}`,
                borderRadius: UI_RADII.sm, cursor: 'pointer', width: '100%',
                textAlign: 'left',
              }}
            >
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: chart.color, flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: UI_TEXT.caption, color: UI_COLORS.textStrong, fontWeight: 600 }}>{chart.label}</div>
                <div style={{ fontSize: 10, color: UI_COLORS.textDim, lineHeight: 1.3 }}>{chart.description}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
