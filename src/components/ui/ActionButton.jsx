import React from 'react';
import { UI_ACTION_VARIANTS, UI_COLORS, UI_RADII, UI_SPACE, UI_TEXT } from '../../ui/tokens.js';

const SIZE_STYLES = {
  sm: { fontSize: UI_TEXT.micro, padding: `${UI_SPACE.xs}px ${UI_SPACE.sm + 2}px` },
  md: { fontSize: UI_TEXT.caption, padding: `${UI_SPACE.sm}px ${UI_SPACE.lg}px` },
};

const VARIANT_STYLES = {
  [UI_ACTION_VARIANTS.primary]: {
    background: UI_COLORS.primary,
    borderColor: UI_COLORS.primary,
    color: UI_COLORS.page,
  },
  [UI_ACTION_VARIANTS.secondary]: {
    background: 'transparent',
    borderColor: UI_COLORS.borderStrong,
    color: UI_COLORS.textBody,
  },
  [UI_ACTION_VARIANTS.ghost]: {
    background: 'transparent',
    borderColor: 'transparent',
    color: UI_COLORS.textMuted,
  },
  [UI_ACTION_VARIANTS.destructive]: {
    background: 'transparent',
    borderColor: UI_COLORS.destructive,
    color: UI_COLORS.destructive,
  },
  [UI_ACTION_VARIANTS.chip]: {
    background: 'transparent',
    borderColor: UI_COLORS.borderStrong,
    color: UI_COLORS.textBody,
  },
};

export default function ActionButton({
  variant = UI_ACTION_VARIANTS.secondary,
  size = 'md',
  active = false,
  disabled = false,
  accent,
  style,
  children,
  ...props
}) {
  const base = VARIANT_STYLES[variant] || VARIANT_STYLES.secondary;
  const accentColor = accent || base.borderColor;

  return (
    <button
      {...props}
      disabled={disabled}
      style={{
        borderWidth: 1,
        borderStyle: 'solid',
        borderRadius: UI_RADII.sm,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontWeight: active ? 700 : 600,
        lineHeight: 1.2,
        transition: 'background 0.18s ease, border-color 0.18s ease, color 0.18s ease, opacity 0.18s ease',
        opacity: disabled ? 0.55 : 1,
        whiteSpace: 'nowrap',
        ...SIZE_STYLES[size],
        ...base,
        ...(accentColor ? {
          borderColor: accentColor,
          color: active && variant === UI_ACTION_VARIANTS.chip
            ? UI_COLORS.page
            : variant === UI_ACTION_VARIANTS.primary
              ? base.color
              : accentColor,
          background: active
            ? accentColor
            : base.background,
        } : {}),
        ...(active && !accentColor ? {
          background: UI_COLORS.surfaceMuted,
          borderColor: base.borderColor,
        } : {}),
        ...style,
      }}
    >
      {children}
    </button>
  );
}
