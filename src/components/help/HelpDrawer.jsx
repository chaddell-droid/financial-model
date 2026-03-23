import React, { useState } from 'react';
import HelpPopover from './HelpPopover.jsx';
import { UI_COLORS, UI_RADII, UI_SPACE, UI_TEXT } from '../../ui/tokens.js';

export default function HelpDrawer({
  help,
  title = 'How To Read This Section',
  accent = '#60a5fa',
  defaultOpen = false,
  children,
}) {
  const [open, setOpen] = useState(defaultOpen);

  if (!help) return null;

  return (
    <div
      style={{
        marginBottom: 12,
        background: UI_COLORS.surfaceMuted,
        border: `1px solid ${open ? `${accent}55` : UI_COLORS.border}`,
        borderRadius: UI_RADII.md,
      }}
    >
      <button
        type='button'
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        style={{
          width: '100%',
          background: 'transparent',
          border: 0,
          color: UI_COLORS.textStrong,
          padding: `${UI_SPACE.md}px ${UI_SPACE.lg}px`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: UI_SPACE.md,
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span>
          <span style={{ display: 'block', fontSize: UI_TEXT.caption, fontWeight: 700 }}>{title}</span>
          <span style={{ display: 'block', fontSize: UI_TEXT.micro, color: UI_COLORS.textMuted, marginTop: 4, lineHeight: 1.4 }}>
            {help.short}
          </span>
        </span>
        <span style={{ fontSize: UI_TEXT.micro, color: accent, fontWeight: 700 }}>
          {open ? 'Hide guide' : 'Show guide'}
        </span>
      </button>
      {open ? (
        <div style={{ padding: `0 ${UI_SPACE.lg}px ${UI_SPACE.lg}px` }}>
          <HelpPopover help={help} width={520} />
          {children ? <div style={{ marginTop: UI_SPACE.md }}>{children}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
