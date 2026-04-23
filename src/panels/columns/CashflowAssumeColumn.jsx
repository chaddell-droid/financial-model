import React, { memo } from 'react';
import ExpenseControls from '../ExpenseControls.jsx';
import VanSaleBlock from '../VanSaleBlock.jsx';
import TrustLLCBlock from '../TrustLLCBlock.jsx';
import { fmt } from '../../model/formatters.js';

/**
 * CashflowAssumeColumn — Plan tab Assumptions Row, middle column (magenta).
 * Wraps ExpenseControls (which covers base spend, inflation, BCS, milestones,
 * and for now still includes the legacy capital sliders — CapitalAssumeColumn
 * uses the new capitalItems array side-by-side).
 */
function CashflowAssumeColumn({ incomeControlsProps, ...props }) {
  const base = props.totalMonthlySpend ?? props.baseExpenses ?? 0;
  const vp = incomeControlsProps || {};
  return (
    <div className="plan-assume-col" data-testid="plan-cashflow-column">
      <div className="plan-assume-head">
        <span className="plan-pill magenta">◆ Cashflow &amp; spend</span>
        <span style={{ fontFamily: 'var(--ui-font-mono)', fontSize: 12, color: 'var(--plan-magenta)', fontWeight: 600 }}>
          Base: {fmt(base)}/mo
        </span>
      </div>
      <div className="plan-assume-inner">
        <ExpenseControls {...props} hideCapital />
        <TrustLLCBlock
          trustIncomeNow={vp.trustIncomeNow}
          trustIncomeFuture={vp.trustIncomeFuture}
          trustIncreaseMonth={vp.trustIncreaseMonth}
          onFieldChange={vp.onFieldChange || props.onFieldChange}
        />
        <VanSaleBlock
          vanSold={vp.vanSold}
          vanMonthlySavings={vp.vanMonthlySavings}
          vanSalePrice={vp.vanSalePrice}
          vanLoanBalance={vp.vanLoanBalance}
          vanSaleMonth={vp.vanSaleMonth}
          onFieldChange={vp.onFieldChange || props.onFieldChange}
        />
      </div>
    </div>
  );
}

export default memo(CashflowAssumeColumn);
