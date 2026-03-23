import React from 'react';
import ActionButton from './ui/ActionButton.jsx';
import SurfaceCard from './ui/SurfaceCard.jsx';
import { UI_ACTION_VARIANTS, UI_COLORS, UI_SPACE, UI_TEXT } from '../ui/tokens.js';

export default function ComparisonBanner({ compareState, compareName, onClearCompare }) {
  if (!compareState) return null;

  return (
    <SurfaceCard
      data-testid='comparison-banner'
      tone='compare'
      padding='md'
      style={{ marginBottom: 16 }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: UI_SPACE.md, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: UI_SPACE.sm, flexWrap: 'wrap' }}>
          <div style={{ width: 14, height: 3, background: UI_COLORS.compare, borderRadius: 2 }} />
          <span style={{ fontSize: UI_TEXT.label, color: UI_COLORS.caution, fontWeight: 700 }}>
            Comparing current settings with &quot;{compareName}&quot;
          </span>
          <span style={{ fontSize: UI_TEXT.micro, color: UI_COLORS.textMuted }}>
            Dashed line = comparison scenario, solid line = current plan
          </span>
        </div>

        <ActionButton
          onClick={onClearCompare}
          data-testid='comparison-banner-clear'
          variant={UI_ACTION_VARIANTS.secondary}
          accent={UI_COLORS.caution}
          size='sm'
        >
          Clear comparison
        </ActionButton>
      </div>
    </SurfaceCard>
  );
}
