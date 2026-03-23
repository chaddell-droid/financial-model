import React, { useEffect, useRef, useState } from 'react';
import HelpPopover from './HelpPopover.jsx';

const SIZE_MAP = {
  sm: 18,
  md: 20,
  lg: 24,
};

export default function HelpTip({ help, accent = '#60a5fa', align = 'left', size = 'md' }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const buttonSize = SIZE_MAP[size] || SIZE_MAP.md;

  useEffect(() => {
    if (!open) return undefined;

    function handlePointerDown(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  if (!help) return null;

  return (
    <span ref={rootRef} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <button
        type='button'
        aria-label={`Explain ${help.title}`}
        title={help.title}
        onClick={() => setOpen((current) => !current)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: buttonSize,
          height: buttonSize,
          borderRadius: 999,
          border: `1px solid ${open ? accent : `${accent}66`}`,
          background: open ? `${accent}26` : '#0f172a',
          color: accent,
          fontSize: buttonSize <= 18 ? 10 : 11,
          fontWeight: 700,
          lineHeight: 1,
          cursor: 'pointer',
          padding: 0,
          boxShadow: open ? `0 0 0 2px ${accent}22` : 'none',
        }}
      >
        ?
      </button>
      {open ? (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: align === 'right' ? 'auto' : 0,
            right: align === 'right' ? 0 : 'auto',
            zIndex: 30,
          }}
        >
          <HelpPopover help={help} />
        </div>
      ) : null}
    </span>
  );
}
