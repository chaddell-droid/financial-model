import React, { memo } from 'react';
import ExpenseControls from '../ExpenseControls.jsx';
import StockCompBlock from '../blocks/StockCompBlock.jsx';
import { fmt } from '../../model/formatters.js';

/**
 * CashflowAssumeColumn — Plan tab Assumptions Row, middle column (magenta).
 * Wraps ExpenseControls (which covers base spend, inflation, BCS, milestones)
 * and now also hosts Chad's Stock Compensation + 401(k) blocks (moved from the
 * Income column to balance column heights).
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
        <StockCompBlock
          chadJob={vp.chadJob}
          chadJobStockRefresh={vp.chadJobStockRefresh}
          chadJobRefreshStartMonth={vp.chadJobRefreshStartMonth}
          chadJobHireStockTotal={vp.chadJobHireStockTotal}
          chadJob401kEnabled={vp.chadJob401kEnabled}
          chadJob401kDeferral={vp.chadJob401kDeferral}
          chadJob401kCatchupRoth={vp.chadJob401kCatchupRoth}
          chadJob401kMatch={vp.chadJob401kMatch}
          chadJobTaxRate={vp.chadJobTaxRate}
          chadJobNoFICA={vp.chadJobNoFICA}
          msftGrowth={vp.msftGrowth}
          onFieldChange={vp.onFieldChange || props.onFieldChange}
        />
      </div>
    </div>
  );
}

export default memo(CashflowAssumeColumn);
