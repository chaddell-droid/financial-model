import React, { memo, useCallback } from 'react';
import CapitalItemsPanel from '../CapitalItemsPanel.jsx';
import VanSaleBlock from '../VanSaleBlock.jsx';
import TrustLLCBlock from '../TrustLLCBlock.jsx';
import { fmt } from '../../model/formatters.js';
import { computeOneTimeTotal } from '../../state/gatherState.js';

/**
 * CapitalAssumeColumn — Plan tab Assumptions Row, right column (amber).
 * New array-based capital items panel + compact net-worth inputs + summary.
 */
function CapitalAssumeColumn({ capitalItems = [], capitalFundingSource = 'advance', onFieldChange, incomeControlsProps = {}, expenseControlsProps = {} }) {
  // Expected (likelihood-weighted) total — same shared helper as the
  // advance-ask metric and the engine's savings-funding deduction (D6b/D4).
  const reserved = computeOneTimeTotal(capitalItems);
  const setCapital = useCallback((next) => onFieldChange?.('capitalItems')(next), [onFieldChange]);
  const effectiveFunding = capitalFundingSource === 'savings' ? 'savings' : 'advance';

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
          Expected: {fmt(reserved)}
        </span>
      </div>
      <div className="plan-assume-inner">
        <div>
          <SectionTitle color="warn">Advance items</SectionTitle>
          <CapitalItemsPanel capitalItems={capitalItems} onChange={setCapital} />
        </div>

        <div data-testid="plan-capital-funding-source">
          <SectionTitle color="warn">Funding source</SectionTitle>
          <div style={{ display: 'flex', gap: 6 }}>
            {[
              { val: 'advance', label: "Dad's advance" },
              { val: 'savings', label: 'Pay from savings' },
            ].map((o) => {
              const selected = effectiveFunding === o.val;
              return (
                <button
                  key={o.val}
                  type="button"
                  onClick={() => onFieldChange?.('capitalFundingSource')(o.val)}
                  data-testid={`plan-capital-funding-${o.val}`}
                  aria-pressed={selected}
                  style={{
                    flex: 1,
                    padding: '6px 10px',
                    fontSize: 11.5,
                    fontWeight: 600,
                    fontFamily: 'inherit',
                    borderRadius: 6,
                    cursor: 'pointer',
                    border: selected ? '1px solid rgba(240,179,74,0.5)' : '1px solid var(--plan-line-2)',
                    background: selected ? 'rgba(240,179,74,0.1)' : 'transparent',
                    color: selected ? 'var(--plan-warn)' : 'var(--plan-ink-dim)',
                  }}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--plan-ink-faint)', marginTop: 6, lineHeight: 1.5 }}>
            {effectiveFunding === 'advance'
              ? 'One-time items (and the debt payoff, if retired) are covered by the advance — they never draw down savings. The expected total above is the ask.'
              : 'The expected total above — plus the one-time debt payoff when "Retire all debt" is on — is deducted from savings at month 0 of the projection.'}
          </div>
        </div>

        <TrustLLCBlock
          trustIncomeNow={incomeControlsProps.trustIncomeNow}
          trustIncomeFuture={incomeControlsProps.trustIncomeFuture}
          trustIncreaseMonth={incomeControlsProps.trustIncreaseMonth}
          onFieldChange={incomeControlsProps.onFieldChange || onFieldChange}
        />

        <VanSaleBlock
          vanSold={incomeControlsProps.vanSold}
          vanMonthlySavings={incomeControlsProps.vanMonthlySavings}
          vanSalePrice={incomeControlsProps.vanSalePrice}
          vanLoanBalance={incomeControlsProps.vanLoanBalance}
          vanSaleMonth={incomeControlsProps.vanSaleMonth}
          onFieldChange={incomeControlsProps.onFieldChange || onFieldChange}
        />

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
            <span style={{ color: 'var(--plan-ink-dim)' }}>Expected (active × likelihood)</span>
            <span className="plan-mono" style={{ color: 'var(--plan-ink)', textAlign: 'right', fontWeight: 500 }}>{fmt(reserved)}</span>
            <span style={{ color: 'var(--plan-ink-dim)' }}>Funding source</span>
            <span className="plan-mono" style={{ color: 'var(--plan-ink)', textAlign: 'right', fontWeight: 500 }}>
              {effectiveFunding === 'savings' ? 'Savings' : 'Advance'}
            </span>
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
