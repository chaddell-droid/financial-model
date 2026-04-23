import React, { memo, useCallback, useState } from 'react';
import { fmt } from '../model/formatters.js';

const CAPITAL_TOTAL_MAX = 120000;

/**
 * CapitalItemsPanel — renders the capitalItems array with add/remove.
 * Design: each row has a toggle, name, amount, horizontal bar (scaled), and a hover × remove.
 * A dashed "+ Add capital item" row at the bottom opens an inline form.
 *
 * Props:
 *  - capitalItems: array of { id, name, description, cost, include, likelihood }
 *  - onChange: (nextArray) => void
 */
function CapitalItemsPanel({ capitalItems = [], onChange }) {
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [cost, setCost] = useState(15000);
  const [prob, setProb] = useState(50);

  const updateItem = useCallback((id, patch) => {
    onChange?.(capitalItems.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, [capitalItems, onChange]);

  const removeItem = useCallback((id) => {
    onChange?.(capitalItems.filter((it) => it.id !== id));
  }, [capitalItems, onChange]);

  const resetForm = () => {
    setFormOpen(false);
    setName('');
    setDesc('');
    setCost(15000);
    setProb(50);
  };

  const addItem = useCallback(() => {
    const clean = name.trim() || 'Capital item';
    const item = {
      id: `cap-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      name: clean,
      description: desc.trim(),
      cost: Math.max(0, Math.min(5_000_000, Number(cost) || 0)),
      include: true,
      likelihood: Math.max(0, Math.min(100, Number(prob) || 100)),
    };
    onChange?.([...capitalItems, item]);
    resetForm();
  }, [capitalItems, onChange, name, desc, cost, prob]);

  return (
    <div data-testid="plan-capital-items">
      {capitalItems.map((it) => {
        const pct = Math.min(100, Math.round(((it.cost || 0) / CAPITAL_TOTAL_MAX) * 100));
        return (
          <div
            key={it.id}
            className="plan-capital-row"
            style={{
              display: 'grid',
              gridTemplateColumns: 'auto 1fr auto auto',
              gap: 10,
              alignItems: 'center',
              padding: '8px 0',
              borderBottom: '1px dashed var(--plan-line)',
            }}
          >
            <SmallToggle checked={!!it.include} onChange={(v) => updateItem(it.id, { include: v })} color="warn" />
            <div>
              <div style={{ fontSize: 12, color: 'var(--plan-ink)', fontWeight: 500 }}>{it.name}</div>
              {it.description && (
                <div style={{ fontSize: 11, color: 'var(--plan-ink-dim)', marginTop: 1 }}>
                  {it.description}
                  {typeof it.likelihood === 'number' && it.likelihood !== 100 ? ` · ${it.likelihood}% likelihood` : ''}
                </div>
              )}
            </div>
            <div
              className="plan-mono"
              style={{
                fontSize: 12,
                color: it.include ? 'var(--plan-warn)' : 'var(--plan-ink-faint)',
                fontWeight: 600,
                textAlign: 'right',
              }}
            >
              {fmt(it.cost || 0)}
            </div>
            <button
              type="button"
              className="plan-cap-remove"
              onClick={() => removeItem(it.id)}
              aria-label={`Remove ${it.name}`}
              title="Remove"
            >×</button>
            <div style={{
              gridColumn: '1 / -1',
              height: 3,
              borderRadius: 2,
              background: 'var(--plan-panel-3)',
              position: 'relative',
              overflow: 'hidden',
              marginTop: 2,
            }}>
              <span style={{
                position: 'absolute',
                left: 0, top: 0,
                height: '100%',
                width: `${pct}%`,
                background: 'var(--plan-warn)',
                borderRadius: 2,
              }} />
            </div>
          </div>
        );
      })}

      {!formOpen ? (
        <button
          type="button"
          className="plan-add-row amber"
          style={{ marginTop: 8 }}
          onClick={() => setFormOpen(true)}
          data-testid="plan-add-capital"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M7 3v8M3 7h8" />
          </svg>
          <span>Add capital item</span>
        </button>
      ) : (
        <div style={{
          border: '1px solid var(--plan-warn)',
          borderRadius: 7,
          padding: 12,
          background: 'rgba(240,179,74,0.05)',
          marginTop: 8,
        }} data-testid="plan-add-capital-form">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center', marginBottom: 10 }}>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. HVAC replacement"
              autoFocus
              style={inputStyle}
              data-testid="plan-add-capital-name"
            />
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" onClick={resetForm} style={btnStyle}>Cancel</button>
              <button
                type="button"
                onClick={addItem}
                style={{ ...btnStyle, color: 'var(--plan-warn)', borderColor: 'rgba(240,179,74,0.5)', background: 'rgba(240,179,74,0.1)' }}
                data-testid="plan-add-capital-save"
              >Add item</button>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
            <label style={fieldStyle}>
              <span style={labelStyle}>
                <span>Cost</span>
                <span className="plan-mono" style={{ color: 'var(--plan-warn)', fontWeight: 600 }}>
                  {fmt(cost)}
                </span>
              </span>
              <input
                type="range"
                className="plan-slider warn"
                min={1000}
                max={100000}
                step={500}
                value={cost}
                onChange={(e) => setCost(parseInt(e.target.value, 10))}
              />
            </label>
            <label style={fieldStyle}>
              <span style={labelStyle}>
                <span>Likelihood</span>
                <span className="plan-mono" style={{ color: 'var(--plan-warn)', fontWeight: 600 }}>
                  {prob}%
                </span>
              </span>
              <input
                type="range"
                className="plan-slider warn"
                min={0}
                max={100}
                step={5}
                value={prob}
                onChange={(e) => setProb(parseInt(e.target.value, 10))}
              />
            </label>
            <label style={{ ...fieldStyle, gridColumn: '1 / -1' }}>
              <span style={labelStyle}><span>Short description</span></span>
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
      )}
    </div>
  );
}

function SmallToggle({ checked, onChange, color }) {
  const isOn = !!checked;
  const bg = isOn
    ? (color === 'warn' ? 'rgba(240,179,74,0.18)' : 'rgba(34,211,122,0.18)')
    : 'var(--plan-panel-3)';
  const border = isOn
    ? (color === 'warn' ? 'rgba(240,179,74,0.5)' : 'rgba(34,211,122,0.5)')
    : 'var(--plan-line-2)';
  const knob = isOn ? (color === 'warn' ? 'var(--plan-warn)' : 'var(--plan-accent)') : 'var(--plan-ink-dim)';
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onChange?.(!isOn); }}
      aria-pressed={isOn}
      style={{
        position: 'relative',
        width: 28,
        height: 16,
        background: bg,
        borderRadius: 999,
        border: `1px solid ${border}`,
        cursor: 'pointer',
        padding: 0,
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 1,
          left: 1,
          width: 12,
          height: 12,
          borderRadius: '50%',
          background: knob,
          transform: isOn ? 'translateX(12px)' : 'translateX(0)',
          transition: 'transform .15s',
        }}
      />
    </button>
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
const btnStyle = {
  padding: '6px 10px',
  fontSize: 11.5,
  background: 'transparent',
  border: '1px solid var(--plan-line-2)',
  color: 'var(--plan-ink-dim)',
  borderRadius: 6,
  cursor: 'pointer',
  fontFamily: 'inherit',
};
const fieldStyle = { display: 'flex', flexDirection: 'column', gap: 4 };
const labelStyle = { fontSize: 11, color: 'var(--plan-ink-dim)', display: 'flex', justifyContent: 'space-between' };

export default memo(CapitalItemsPanel);
