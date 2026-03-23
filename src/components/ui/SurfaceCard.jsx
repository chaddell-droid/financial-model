import React from 'react';
import { UI_COLORS, UI_RADII, UI_SPACE } from '../../ui/tokens.js';

const TONE_STYLES = {
  default: {
    background: UI_COLORS.surface,
    borderColor: UI_COLORS.border,
  },
  featured: {
    background: UI_COLORS.surface,
    borderColor: UI_COLORS.borderStrong,
  },
  compare: {
    background: 'rgba(251, 191, 36, 0.08)',
    borderColor: 'rgba(251, 191, 36, 0.2)',
  },
  success: {
    background: 'rgba(74, 222, 128, 0.08)',
    borderColor: 'rgba(74, 222, 128, 0.18)',
  },
};

const PADDING_STYLES = {
  sm: UI_SPACE.md,
  md: UI_SPACE.lg,
  lg: UI_SPACE.xl,
};

export default function SurfaceCard({
  tone = 'default',
  padding = 'md',
  style,
  children,
  ...props
}) {
  const toneStyle = TONE_STYLES[tone] || TONE_STYLES.default;

  return (
    <div
      {...props}
      style={{
        background: toneStyle.background,
        border: `1px solid ${toneStyle.borderColor}`,
        borderRadius: UI_RADII.md,
        padding: PADDING_STYLES[padding] || PADDING_STYLES.md,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
