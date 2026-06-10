// Adaptive decision preview table — extracted verbatim from
// src/charts/RetirementIncomeChart.jsx (Phase 7 file-size split). One
// realized historical path, re-solving the full PWA distribution each year
// from the updated balance. Rendered only in Adaptive PWA mode.
import React, { memo } from 'react';
import { fmtFull } from '../model/formatters.js';
import { HELP } from '../content/help/registry.js';
import { COLORS } from './chartUtils.js';
import { LabelWithHelp, formatCohortLabel } from './RetirementChartPrimitives.jsx';

const retirementTextStrong = COLORS.textSecondary;
const retirementTextBody = COLORS.textSoft;
const retirementTextMuted = COLORS.textMuted;

function RetirementDecisionPreview({
  testId,
  pwaReferenceSimulation,
  pwaReferenceBequestMet,
  bequestTarget,
  ageDiff,
}) {
  return (
    <div data-testid={testId} style={{
      background: COLORS.bgDeep,
      borderRadius: 8,
      padding: '12px 14px',
      border: `1px solid ${COLORS.border}`,
      marginBottom: 12,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
        <div>
          <div data-testid="retirement-decision-preview-title" style={{ fontSize: 11, color: retirementTextStrong, fontWeight: 700 }}>
            <LabelWithHelp label="Adaptive decision preview" help={HELP.annual_decision_preview} accent={COLORS.blue} />
          </div>
          <div style={{ fontSize: 10, color: retirementTextMuted, marginTop: 2, lineHeight: 1.45 }}>
            One realized historical path, re-solving the full PWA distribution each year from the updated balance.
          </div>
        </div>
        {pwaReferenceSimulation && (
          <div style={{ fontSize: 10, color: retirementTextBody, lineHeight: 1.45, textAlign: 'right', fontFamily: "'JetBrains Mono', monospace" }}>
            Reference cohort {formatCohortLabel(pwaReferenceSimulation.referenceSample)} · final pool {fmtFull(pwaReferenceSimulation.finalPool)} {pwaReferenceBequestMet ? '>= ' : '< '}{fmtFull(bequestTarget)}
          </div>
        )}
      </div>

      {pwaReferenceSimulation ? (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr>
                {['Year', 'Ages', 'Start Pool', 'Spend Target', 'Pool Draw', 'Reason'].map(header => (
                  <th key={header} style={{
                    textAlign: header === 'Reason' ? 'left' : 'right',
                    color: retirementTextMuted,
                    fontWeight: 700,
                    padding: '0 0 6px',
                    borderBottom: `1px solid ${COLORS.border}`,
                    fontFamily: "'JetBrains Mono', monospace",
                  }}>
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pwaReferenceSimulation.decisionPreview.map((decision, idx) => {
                const chadAge = 67 + idx;
                const sarahAge = chadAge - ageDiff;
                return (
                  <tr key={decision.decisionMonth}>
                    <td style={{ padding: '7px 0', color: retirementTextBody, borderBottom: `1px solid ${COLORS.bgCard}`, fontFamily: "'JetBrains Mono', monospace" }}>
                      Y{idx}
                    </td>
                    <td style={{ padding: '7px 0', textAlign: 'right', color: retirementTextBody, borderBottom: `1px solid ${COLORS.bgCard}`, fontFamily: "'JetBrains Mono', monospace" }}>
                      {chadAge}/{sarahAge}
                    </td>
                    <td style={{ padding: '7px 0', textAlign: 'right', color: retirementTextStrong, borderBottom: `1px solid ${COLORS.bgCard}`, fontFamily: "'JetBrains Mono', monospace" }}>
                      {fmtFull(decision.beginningBalance)}
                    </td>
                    <td style={{ padding: '7px 0', textAlign: 'right', color: COLORS.green, borderBottom: `1px solid ${COLORS.bgCard}`, fontFamily: "'JetBrains Mono', monospace" }}>
                      {fmtFull(Math.round(decision.selectedTotalSpendingTarget))}
                    </td>
                    <td style={{ padding: '7px 0', textAlign: 'right', color: COLORS.blue, borderBottom: `1px solid ${COLORS.bgCard}`, fontFamily: "'JetBrains Mono', monospace" }}>
                      {fmtFull(Math.round(decision.currentPortfolioDraw))}
                    </td>
                    <td style={{ padding: '7px 0', color: decision.cutOccurred ? COLORS.amber : retirementTextBody, borderBottom: `1px solid ${COLORS.bgCard}`, fontFamily: "'JetBrains Mono', monospace" }}>
                      {decision.reason.replaceAll('_', ' ')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ fontSize: 11, color: retirementTextMuted, lineHeight: 1.45 }}>
          No adaptive preview available until the retirement pool is positive.
        </div>
      )}
    </div>
  );
}

export default memo(RetirementDecisionPreview);
