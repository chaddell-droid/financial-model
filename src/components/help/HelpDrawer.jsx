import React, { useState } from 'react';
import HelpPopover from './HelpPopover.jsx';

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
        background: '#0f172a',
        border: `1px solid ${open ? `${accent}55` : '#334155'}`,
        borderRadius: 10,
      }}
    >
      <button
        type="button"
        onClick={() => setOpen(current => !current)}
        aria-expanded={open}
        style={{
          width: '100%',
          background: 'transparent',
          border: 0,
          color: '#e2e8f0',
          padding: '10px 12px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span>
          <span style={{ display: 'block', fontSize: 12, fontWeight: 700 }}>{title}</span>
          <span style={{ display: 'block', fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
            {help.short}
          </span>
        </span>
        <span style={{ fontSize: 11, color: accent, fontWeight: 700 }}>
          {open ? 'Hide help' : 'Show help'}
        </span>
      </button>
      {open && (
        <div style={{ padding: '0 12px 12px' }}>
          <HelpPopover help={help} width={520} />
          {children && <div style={{ marginTop: 10 }}>{children}</div>}
        </div>
      )}
    </div>
  );
}
