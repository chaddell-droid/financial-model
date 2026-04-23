import React, { memo } from 'react';
import Slider from '../components/Slider.jsx';
import Toggle from '../components/Toggle.jsx';
import { fmtFull } from '../model/formatters.js';
import { COLORS } from '../charts/chartUtils.js';

/**
 * VanSaleBlock — self-contained Van Sale controls (toggle + sliders + shortfall preview).
 * Extracted from IncomeControls so it can live in the Plan tab's Cashflow column
 * (design places Van as a cashflow adjustment, not an income source).
 */
function VanSaleBlock({
  vanSold, vanMonthlySavings, vanSalePrice, vanLoanBalance, vanSaleMonth,
  onFieldChange,
}) {
  const set = onFieldChange;
  const commitStrategy = 'release';
  const effectiveSalePrice = vanSalePrice ?? 25000;
  const effectiveLoanBalance = vanLoanBalance ?? 200000;
  const vanShortfall = Math.max(0, effectiveLoanBalance - effectiveSalePrice);

  return (
    <div
      style={{
        marginTop: 12,
        padding: '10px 12px',
        background: COLORS.bgDeep,
        borderRadius: 8,
        border: `1px solid ${vanSold ? `${COLORS.green}33` : COLORS.border}`,
      }}
      data-testid="van-sale-block"
    >
      <h4 style={{
        fontSize: 11,
        color: COLORS.textMuted,
        margin: '0 0 8px',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}>Van Sale</h4>
      <Toggle
        label="Sell the van"
        checked={vanSold}
        onChange={set('vanSold')}
        color={COLORS.green}
        testId="cashflow-van-sold"
      />
      <Slider
        label="Monthly cost (loan + insurance + fuel)"
        value={vanMonthlySavings}
        onChange={set('vanMonthlySavings')}
        commitStrategy={commitStrategy}
        min={1500}
        max={4000}
        step={50}
        color={vanSold ? COLORS.green : COLORS.red}
      />
      {vanSold && (
        <>
          <Slider
            label="Expected sale price"
            value={effectiveSalePrice}
            onChange={set('vanSalePrice')}
            commitStrategy={commitStrategy}
            min={0}
            max={effectiveLoanBalance}
            step={1000}
            color={COLORS.blue}
          />
          <Slider
            label="Loan balance owed"
            value={effectiveLoanBalance}
            onChange={set('vanLoanBalance')}
            commitStrategy={commitStrategy}
            min={100000}
            max={300000}
            step={5000}
            color={COLORS.red}
          />
          <Slider
            label="Sell at month"
            value={vanSaleMonth ?? 6}
            onChange={set('vanSaleMonth')}
            commitStrategy={commitStrategy}
            min={1}
            max={48}
            format={(v) => v + ' mo'}
            color={COLORS.textMuted}
          />
          <div style={{ marginTop: 6, paddingTop: 6, borderTop: `1px solid ${COLORS.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: COLORS.textDim }}>Shortfall (owe - sale):</span>
              <span style={{
                color: vanShortfall > 0 ? COLORS.red : COLORS.green,
                fontFamily: "'JetBrains Mono', monospace",
                fontWeight: 600,
              }}>
                {vanShortfall > 0 ? `-${fmtFull(vanShortfall)}` : '$0'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 2 }}>
              <span style={{ color: COLORS.textDim }}>Monthly savings after sale:</span>
              <span style={{
                color: COLORS.green,
                fontFamily: "'JetBrains Mono', monospace",
                fontWeight: 600,
              }}>+{fmtFull(vanMonthlySavings)}/mo</span>
            </div>
            <div style={{ fontSize: 10, color: COLORS.borderLight, marginTop: 4, fontStyle: 'italic' }}>
              One-time {fmtFull(vanShortfall)} hit to savings at month {vanSaleMonth ?? 6},
              then {fmtFull(vanMonthlySavings)}/mo freed up.
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default memo(VanSaleBlock);
