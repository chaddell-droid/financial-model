import React, { memo } from 'react';
import IncomeAssumeColumn from './IncomeAssumeColumn.jsx';
import CashflowAssumeColumn from './CashflowAssumeColumn.jsx';
import CapitalAssumeColumn from './CapitalAssumeColumn.jsx';

/**
 * AssumptionsGrid — Plan tab Row 2.
 * Horizontal 3-column layout: Income (cyan) · Cashflow & spend (magenta) · Capital (amber).
 */
function AssumptionsGrid({ incomeControlsProps, expenseControlsProps, capitalItems, onFieldChange }) {
  return (
    <div data-testid="plan-assumptions-grid">
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '4px 4px 10px' }}>
        <div>
          <div className="plan-sub">Model assumptions</div>
          <div style={{ fontSize: 14, fontWeight: 600, marginTop: 3, color: 'var(--plan-ink)' }}>
            Income · Expenses · Capital needs
          </div>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--plan-ink-faint)' }}>
          Changes recompute projections above
        </div>
      </div>

      <div className="plan-assume-grid">
        <IncomeAssumeColumn {...(incomeControlsProps || {})} />
        <CashflowAssumeColumn
          {...(expenseControlsProps || {})}
          incomeControlsProps={incomeControlsProps}
        />
        <CapitalAssumeColumn
          capitalItems={capitalItems}
          onFieldChange={onFieldChange}
          incomeControlsProps={incomeControlsProps}
          expenseControlsProps={expenseControlsProps}
        />
      </div>
    </div>
  );
}

export default memo(AssumptionsGrid);
