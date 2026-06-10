import React from 'react';
import { COLORS } from './chartUtils.js';

/**
 * Shared friendly empty state for charts (remediation 2026-06-09, Phase 7).
 * Rendered when a chart has no data — charts must never throw or silently
 * vanish on empty input.
 */
export default function ChartEmptyState({ message = 'No data available yet.', testId }) {
  return (
    <div
      data-testid={testId}
      style={{
        background: COLORS.bgCard,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 12,
        padding: 20,
        color: COLORS.textDim,
        fontSize: 12,
        textAlign: 'center',
        marginBottom: 16,
      }}
    >
      {message}
    </div>
  );
}
