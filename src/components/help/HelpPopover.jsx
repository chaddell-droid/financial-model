import React from 'react';
import { UI_COLORS, UI_RADII, UI_SPACE, UI_TEXT } from '../../ui/tokens.js';

export default function HelpPopover({ help, width = 320 }) {
  if (!help) return null;

  const resolvedWidth = typeof width === 'number' ? `${width}px` : width;

  return (
    <div
      style={{
        width: resolvedWidth,
        maxWidth: '92vw',
        background: UI_COLORS.surfaceMuted,
        border: `1px solid ${UI_COLORS.border}`,
        borderRadius: UI_RADII.md,
        padding: `${UI_SPACE.md}px ${UI_SPACE.lg}px`,
        boxShadow: '0 10px 28px rgba(2, 6, 23, 0.45)',
      }}
    >
      <div style={{ fontSize: UI_TEXT.caption, fontWeight: 700, color: UI_COLORS.textStrong, marginBottom: 6 }}>
        {help.title}
      </div>
      {help.short ? (
        <div style={{ fontSize: UI_TEXT.caption, color: UI_COLORS.textBody, lineHeight: 1.5, marginBottom: help.body?.length ? 8 : 0 }}>
          {help.short}
        </div>
      ) : null}
      {help.body?.map((paragraph, index) => (
        <div
          key={index}
          style={{ fontSize: UI_TEXT.caption, color: UI_COLORS.textBody, lineHeight: 1.5, marginTop: index === 0 ? 0 : 8 }}
        >
          {paragraph}
        </div>
      ))}
      {help.footer ? (
        <div style={{ fontSize: UI_TEXT.micro, color: UI_COLORS.textMuted, lineHeight: 1.45, marginTop: 10, borderTop: `1px solid ${UI_COLORS.border}`, paddingTop: 10 }}>
          {help.footer}
        </div>
      ) : null}
    </div>
  );
}
