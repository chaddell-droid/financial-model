import React, { memo } from 'react';
import Slider from '../components/Slider.jsx';
import { fmtFull } from '../model/formatters.js';
import { COLORS } from '../charts/chartUtils.js';

/**
 * TrustLLCBlock — Trust/LLC income (now + future + increase month).
 * Lives in the Plan tab Cashflow column per design (cashflow adjustment, not income-col).
 */
function TrustLLCBlock({
  trustIncomeNow, trustIncomeFuture, trustIncreaseMonth,
  onFieldChange,
}) {
  const set = onFieldChange;
  const commitStrategy = 'release';

  return (
    <div
      style={{
        marginTop: 12,
        padding: '10px 12px',
        background: COLORS.bgDeep,
        borderRadius: 8,
        border: `1px solid ${COLORS.border}`,
      }}
      data-testid="trust-llc-block"
    >
      <h4 style={{
        fontSize: 11,
        color: COLORS.purple,
        margin: '0 0 8px',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}>Trust / LLC Income</h4>
      <Slider
        label="Current monthly"
        value={trustIncomeNow}
        onChange={set('trustIncomeNow')}
        commitStrategy={commitStrategy}
        min={0}
        max={3000}
        step={50}
        color={COLORS.purple}
      />
      <Slider
        label="After increase"
        value={trustIncomeFuture}
        onChange={set('trustIncomeFuture')}
        commitStrategy={commitStrategy}
        min={0}
        max={5000}
        step={50}
        color={COLORS.purple}
      />
      <Slider
        label="Increase at month"
        value={trustIncreaseMonth}
        onChange={set('trustIncreaseMonth')}
        commitStrategy={commitStrategy}
        min={3}
        max={24}
        format={(v) => v + ' mo'}
        color={COLORS.purple}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginTop: 4, color: COLORS.textDim }}>
        <span>Annual: {fmtFull(trustIncomeNow * 12)} → {fmtFull(trustIncomeFuture * 12)}</span>
      </div>
    </div>
  );
}

export default memo(TrustLLCBlock);
