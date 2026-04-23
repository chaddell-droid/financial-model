import React, { useState, useCallback } from 'react';

/**
 * Inline "+ Add a new lever" row for the Plan tab Decision Console.
 * Click to expand a form; Cancel collapses; Save dispatches onAdd({ id, name, description, maxImpact, currentValue, active }).
 */
export default function AddLeverInline({ onAdd, accent = 'accent' }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [max, setMax] = useState(1500);

  const reset = useCallback(() => {
    setName('');
    setDesc('');
    setMax(1500);
    setOpen(false);
  }, []);

  const onSave = useCallback(() => {
    const clean = name.trim() || 'Custom lever';
    const cleanDesc = desc.trim() || 'Custom user-defined lever';
    const cleanMax = Math.max(0, Math.min(50000, Number(max) || 0));
    const lever = {
      id: `lv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      name: clean,
      description: cleanDesc,
      maxImpact: cleanMax,
      currentValue: cleanMax,
      active: true,
    };
    onAdd?.(lever);
    reset();
  }, [name, desc, max, onAdd, reset]);

  if (!open) {
    return (
      <button
        type="button"
        className={`plan-add-row${accent === 'amber' ? ' amber' : ''}`}
        onClick={() => setOpen(true)}
        data-testid="plan-add-lever"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M7 3v8M3 7h8" />
        </svg>
        <span>Add a new lever</span>
      </button>
    );
  }

  return (
    <div
      style={{
        border: '1px solid var(--plan-accent)',
        borderRadius: 7,
        padding: 12,
        background: 'rgba(34,211,122,0.04)',
      }}
      data-testid="plan-add-lever-form"
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Rental income offset"
          autoFocus
          style={inputStyle}
          data-testid="plan-add-lever-name"
        />
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" onClick={reset} style={btnCancelStyle}>Cancel</button>
          <button type="button" onClick={onSave} style={btnSaveStyle} data-testid="plan-add-lever-save">
            Add lever
          </button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
        <label style={fieldStyle}>
          <span style={labelStyle}>
            <span>Max monthly impact</span>
            <span className="plan-mono" style={{ color: 'var(--plan-ink)', fontWeight: 600 }}>
              ${Number(max).toLocaleString()}
            </span>
          </span>
          <input
            type="range"
            className="plan-slider"
            min={0}
            max={5000}
            step={100}
            value={max}
            onChange={(e) => setMax(parseInt(e.target.value, 10))}
          />
        </label>
        <label style={fieldStyle}>
          <span style={labelStyle}>
            <span>Short description</span>
          </span>
          <input
            type="text"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Optional..."
            style={{ ...inputStyle, fontSize: 12, padding: '5px 9px' }}
          />
        </label>
      </div>
    </div>
  );
}

const inputStyle = {
  background: 'var(--plan-panel)',
  border: '1px solid var(--plan-line-2)',
  borderRadius: 5,
  padding: '8px 10px',
  color: 'var(--plan-ink)',
  font: 'inherit',
  fontSize: 13,
  outline: 'none',
  width: '100%',
};

const btnCancelStyle = {
  padding: '6px 10px',
  fontSize: 11.5,
  background: 'transparent',
  border: '1px solid var(--plan-line-2)',
  color: 'var(--plan-ink-dim)',
  borderRadius: 6,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const btnSaveStyle = {
  ...btnCancelStyle,
  borderColor: 'rgba(34,211,122,0.4)',
  color: 'var(--plan-accent)',
  background: 'rgba(34,211,122,0.08)',
};

const fieldStyle = { display: 'flex', flexDirection: 'column', gap: 4 };
const labelStyle = { fontSize: 11, color: 'var(--plan-ink-dim)', display: 'flex', justifyContent: 'space-between' };
