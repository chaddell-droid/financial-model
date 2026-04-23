import React, { memo, useCallback } from 'react';
import CapitalItemsPanel from '../CapitalItemsPanel.jsx';
import { fmt } from '../../model/formatters.js';

/**
 * CapitalAssumeColumn — Plan tab Assumptions Row, right column (amber).
 * New array-based capital items panel + compact net-worth inputs + summary.
 */
function CapitalAssumeColumn({ capitalItems = [], onFieldChange, incomeControlsProps = {}, expenseControlsProps = {} }) {
  const reserved = capitalItems.reduce(
    (sum, it) => sum + (it.include ? Math.max(0, Number(it.cost) || 0) : 0),
    0
  );
  const setCapital = useCallback((next) => onFieldChange?.('capitalItems')(next), [onFieldChange]);

  // Shared NW inputs passed in via expenseControlsProps / incomeControlsProps
  const starting401k = expenseControlsProps.starting401k ?? incomeControlsProps.starting401k;
  const return401k = expenseControlsProps.return401k ?? incomeControlsProps.return401k;
  const homeEquity = expenseControlsProps.homeEquity ?? incomeControlsProps.homeEquity;
  const homeAppreciation = expenseControlsProps.homeAppreciation ?? incomeControlsProps.homeAppreciation;

  return (
    <div className="plan-assume-col" data-testid="plan-capital-column">
      <div className="plan-assume-head">
        <span className="plan-pill amber">◆ One-time capital needs</span>
        <span style={{ fontFamily: 'var(--ui-font-mono)', fontSize: 12, color: 'var(--plan-warn)', fontWeight: 600 }}>
          Reserved: {fmt(reserved)}
        </span>
      </div>
      <div className="plan-assume-inner">
        <div>
          <SectionTitle color="warn">Advance items</SectionTitle>
          <CapitalItemsPanel capitalItems={capitalItems} onChange={setCapital} />
        </div>

        <div>
          <SectionTitle color="warn">Net worth inputs</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
            <NwField
              label="Starting 401k"
              value={starting401k}
              min={0}
              max={2_000_000}
              step={5000}
              onChange={(v) => onFieldChange?.('starting401k')(v)}
              format="$"
            />
            <NwField
              label="Annual return (401k)"
              value={return401k}
              min={-10}
              max={25}
              step={0.5}
              onChange={(v) => onFieldChange?.('return401k')(v)}
              format="%"
            />
            <NwField
              label="Home equity"
              value={homeEquity}
              min={0}
              max={3_000_000}
              step={5000}
              onChange={(v) => onFieldChange?.('homeEquity')(v)}
              format="$"
            />
            <NwField
              label="Annual appreciation"
              value={homeAppreciation}
              min={-5}
              max={15}
              step={0.5}
              onChange={(v) => onFieldChange?.('homeAppreciation')(v)}
              format="%"
            />
          </div>
        </div>

        <div>
          <SectionTitle color="warn">Summary</SectionTitle>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto',
            gap: '4px 12px',
            fontSize: 11.5,
            padding: '8px 10px',
            background: 'var(--plan-panel-2)',
            border: '1px solid var(--plan-line)',
            borderRadius: 5,
          }}>
            <span style={{ color: 'var(--plan-ink-dim)' }}>Reserved (active items)</span>
            <span className="plan-mono" style={{ color: 'var(--plan-ink)', textAlign: 'right', fontWeight: 500 }}>{fmt(reserved)}</span>
            <span style={{ color: 'var(--plan-ink-dim)' }}>Active items</span>
            <span className="plan-mono" style={{ color: 'var(--plan-ink)', textAlign: 'right', fontWeight: 500 }}>
              {capitalItems.filter((it) => it.include).length} / {capitalItems.length}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ color = 'warn', children }) {
  const c = color === 'cyan' ? 'var(--plan-cyan)'
    : color === 'magenta' ? 'var(--plan-magenta)'
    : 'var(--plan-warn)';
  return (
    <div style={{
      fontSize: 10.5,
      textTransform: 'uppercase',
      letterSpacing: '.1em',
      fontWeight: 600,
      color: c,
      marginBottom: 10,
    }}>{children}</div>
  );
}

function NwField({ label, value, min, max, step, onChange, format }) {
  const display = value == null ? '—'
    : format === '%' ? `${value}%`
    : `${fmt(value)}`;
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ fontSize: 11, color: 'var(--plan-ink-dim)', display: 'flex', justifyContent: 'space-between' }}>
        <span>{label}</span>
        <span className="plan-mono" style={{ color: 'var(--plan-warn)', fontWeight: 600 }}>{display}</span>
      </div>
      <input
        type="range"
        className="plan-slider warn"
        min={min}
        max={max}
        step={step}
        value={Number.isFinite(value) ? value : min}
        onChange={(e) => onChange?.(format === '%' ? parseFloat(e.target.value) : parseInt(e.target.value, 10))}
      />
    </label>
  );
}

export default memo(CapitalAssumeColumn);
