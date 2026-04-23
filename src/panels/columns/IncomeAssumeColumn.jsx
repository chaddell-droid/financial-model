import React, { memo } from 'react';
import IncomeControls from '../IncomeControls.jsx';

/**
 * IncomeAssumeColumn — Plan tab Assumptions Row, left column (cyan).
 * Thin wrapper around IncomeControls that gives it the design's column shell.
 */
function IncomeAssumeColumn(props) {
  return (
    <div className="plan-assume-col" data-testid="plan-income-column">
      <div className="plan-assume-head">
        <span className="plan-pill cyan">◆ Income assumptions</span>
        <span style={{ fontFamily: 'var(--ui-font-mono)', fontSize: 12, color: 'var(--plan-ink)', fontWeight: 600 }}>
          {/* Placeholder total — IncomeControls has detailed breakdown inside */}
        </span>
      </div>
      <div className="plan-assume-inner">
        <div data-plan-nested="true" style={{ overflow: 'visible' }}>
          {/* Van Sale + Trust/LLC render in the Cashflow column per design — both are cashflow adjustments. */}
          <IncomeControls {...props} hideVan hideTrust />
        </div>
      </div>
    </div>
  );
}

export default memo(IncomeAssumeColumn);
