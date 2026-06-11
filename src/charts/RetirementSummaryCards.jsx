// Income phase summary cards for the retirement surface — extracted verbatim
// from src/charts/RetirementIncomeChart.jsx (Phase 7 file-size split).
// PWA mode shows pool / current spending target / adaptive confidence;
// historical mode shows pool / couple / post-inheritance / survivor targets.
import React, { memo } from 'react';
import { fmtFull } from '../model/formatters.js';
import { HELP } from '../content/help/registry.js';
import { COLORS } from './chartUtils.js';
import { LabelWithHelp, formatCohortLabel, formatRange, fmtPool } from './RetirementChartPrimitives.jsx';

const retirementTextStrong = COLORS.textSecondary;
const retirementTextBody = COLORS.textSoft;

function RetirementSummaryCards({
  isPwaMode,
  totalPool, endSavings, end401kAfterTax, homeSaleNet,
  pwaReferenceSimulation, pwaCurrentView, pwaStartContext, pwaCurrentSelection,
  pwaConfidencePct, bequestTarget,
  trustMonthly, pensionMonthly, imputedRentMonthly = 0, keepHouse = false,
  chadPassesAge, bandResult, deterministicPools,
  inhDuringCouple, inheritanceChadAge,
  coupleSummary, postInheritanceSummary, survivorSummary,
}) {
  return isPwaMode ? (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8, marginBottom: 16 }}>
      <div style={{ background: COLORS.bgDeep, borderRadius: 8, padding: '10px 12px', border: `1px solid ${COLORS.bgCard}` }}>
        <div style={{ fontSize: 10, color: retirementTextBody, marginBottom: 4, fontWeight: 600 }}>Investment Pool (age 67)</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: retirementTextStrong, fontFamily: "'JetBrains Mono', monospace" }}>
          {fmtFull(totalPool)}
        </div>
        <div style={{ fontSize: 9, color: retirementTextBody, marginTop: 4, lineHeight: 1.4, fontFamily: "'JetBrains Mono', monospace" }}>
          Savings {fmtFull(endSavings)} + 401k {fmtFull(end401kAfterTax)} after tax + {keepHouse ? 'Home kept (not pooled)' : `Home ${fmtFull(homeSaleNet)}`}
        </div>
        {pwaReferenceSimulation && (
          <div style={{ fontSize: 9, color: retirementTextBody, marginTop: 4, lineHeight: 1.4, fontFamily: "'JetBrains Mono', monospace" }}>
            Reference realized cohort: {formatCohortLabel(pwaReferenceSimulation.referenceSample)}
          </div>
        )}
      </div>

      <div style={{ background: COLORS.bgDeep, borderRadius: 8, padding: '10px 12px', border: `1px solid ${COLORS.green}33` }}>
        <div style={{ fontSize: 10, color: COLORS.green, marginBottom: 4, fontWeight: 600 }}>
          <LabelWithHelp label="Current PWA Spending Target" help={HELP.spending_target} accent={COLORS.green} />
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.green, fontFamily: "'JetBrains Mono', monospace" }}>
          {fmtFull(Math.round(pwaCurrentView.totalSpendingTarget))}/mo
        </div>
        <div style={{ fontSize: 9, color: retirementTextBody, marginTop: 4, lineHeight: 1.4, fontFamily: "'JetBrains Mono', monospace" }}>
          Pool draw {fmtFull(Math.round(pwaCurrentView.currentPortfolioDraw))}/mo + SS {fmtFull(Math.round(pwaStartContext.currentSSIncome))}/mo + {fmtFull(trustMonthly)}/mo trust{pensionMonthly > 0 ? ` + ${fmtFull(pensionMonthly)}/mo pension` : ''}{imputedRentMonthly > 0 ? ` + ${fmtFull(imputedRentMonthly)}/mo rent saved` : ''}
        </div>
        {pwaCurrentView.outsideIncomeReinvested > 0 && (
          <div style={{ fontSize: 9, color: retirementTextBody, marginTop: 4, lineHeight: 1.4, fontFamily: "'JetBrains Mono', monospace" }}>
            Outside income reinvested: {fmtFull(Math.round(pwaCurrentView.outsideIncomeReinvested))}/mo
          </div>
        )}
      </div>

      <div style={{ background: COLORS.bgDeep, borderRadius: 8, padding: '10px 12px', border: `1px solid ${COLORS.blue}33` }}>
        <div style={{ fontSize: 10, color: COLORS.blue, marginBottom: 4, fontWeight: 600 }}>
          <LabelWithHelp label="Adaptive Confidence" help={HELP.probability_no_cut} accent={COLORS.blue} />
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.blue, fontFamily: "'JetBrains Mono', monospace" }}>
          {pwaConfidencePct}%
        </div>
        <div style={{ fontSize: 9, color: retirementTextBody, marginTop: 4, lineHeight: 1.4, fontFamily: "'JetBrains Mono', monospace" }}>
          Share of historical cohorts that could sustain this starting target for the whole horizon while still ending at {fmtFull(bequestTarget)}
        </div>
        <div style={{ fontSize: 9, color: retirementTextBody, marginTop: 4, lineHeight: 1.4, fontFamily: "'JetBrains Mono', monospace" }}>
          Tolerance band {fmtFull(Math.round(pwaCurrentSelection.lowerToleranceWithdrawal || 0))} – {fmtFull(Math.round(pwaCurrentSelection.upperToleranceWithdrawal || 0))}/mo
        </div>
      </div>
    </div>
  ) : (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8, marginBottom: 16 }}>
      {/* Pool card */}
      <div style={{ background: COLORS.bgDeep, borderRadius: 8, padding: '10px 12px', border: `1px solid ${COLORS.bgCard}` }}>
        <div style={{ fontSize: 10, color: retirementTextBody, marginBottom: 4, fontWeight: 600 }}>Investment Pool (age 67)</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: retirementTextStrong, fontFamily: "'JetBrains Mono', monospace" }}>
          {fmtFull(totalPool)}
        </div>
        <div style={{ fontSize: 9, color: retirementTextBody, marginTop: 4, lineHeight: 1.4, fontFamily: "'JetBrains Mono', monospace" }}>
          Savings {fmtFull(endSavings)} + 401k {fmtFull(end401kAfterTax)} after tax + {keepHouse ? 'Home kept (not pooled)' : `Home ${fmtFull(homeSaleNet)}`}
        </div>
        {chadPassesAge > 70 && bandResult.bands[0].series.length > (chadPassesAge - 67) && (
          <div style={{ fontSize: 9, color: retirementTextBody, marginTop: 4, lineHeight: 1.4, fontFamily: "'JetBrains Mono', monospace" }}>
            At {chadPassesAge}: {fmtPool(bandResult.bands[0].series[chadPassesAge - 67])} (worst) – {fmtPool(deterministicPools[chadPassesAge - 67])} (expected)
          </div>
        )}
      </div>

      {/* Pre-inheritance couple (or full couple if no inheritance during couple phase) */}
        <div style={{ background: COLORS.bgDeep, borderRadius: 8, padding: '10px 12px', border: `1px solid ${COLORS.blue}33` }}>
        <div style={{ fontSize: 10, color: COLORS.blue, marginBottom: 4, fontWeight: 600 }}>
          <LabelWithHelp
            label={inhDuringCouple ? `Pre-Inheritance Spending Target (67-${inheritanceChadAge})` : `Couple Spending Target (67-${chadPassesAge})`}
            help={HELP.spending_target}
            accent={COLORS.blue}
          />
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.blue, fontFamily: "'JetBrains Mono', monospace" }}>
          {fmtFull(coupleSummary.totalTarget)}/mo
        </div>
        <div style={{ fontSize: 9, color: retirementTextBody, marginTop: 4, lineHeight: 1.4, fontFamily: "'JetBrains Mono', monospace" }}>
          Pool draw {formatRange(coupleSummary.start.poolDraw, coupleSummary.end.poolDraw, '/mo')} + SS {formatRange(coupleSummary.start.ssIncome, coupleSummary.end.ssIncome, '/mo')} + {fmtFull(trustMonthly)}/mo trust{pensionMonthly > 0 ? ` + ${fmtFull(pensionMonthly)}/mo pension` : ''}{imputedRentMonthly > 0 ? ` + ${fmtFull(imputedRentMonthly)}/mo rent saved` : ''}
        </div>
        {(coupleSummary.start.savedToPool > 0 || coupleSummary.end.savedToPool > 0) && (
          <div style={{ fontSize: 9, color: retirementTextBody, marginTop: 4, lineHeight: 1.4, fontFamily: "'JetBrains Mono', monospace" }}>
            Outside income reinvested: {formatRange(coupleSummary.start.savedToPool, coupleSummary.end.savedToPool, '/mo')}
          </div>
        )}
      </div>

      {/* Post-inheritance couple (only when inheritance during couple phase) */}
      {inhDuringCouple && (
        <div style={{ background: COLORS.bgDeep, borderRadius: 8, padding: '10px 12px', border: `1px solid ${COLORS.green}33` }}>
          <div style={{ fontSize: 10, color: COLORS.green, marginBottom: 4, fontWeight: 600 }}>
            <LabelWithHelp
              label={`Post-Inheritance Spending Target (${inheritanceChadAge}-${chadPassesAge})`}
              help={HELP.spending_target}
              accent={COLORS.green}
            />
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.green, fontFamily: "'JetBrains Mono', monospace" }}>
            {fmtFull(postInheritanceSummary.totalTarget)}/mo
          </div>
          <div style={{ fontSize: 9, color: retirementTextBody, marginTop: 4, lineHeight: 1.4, fontFamily: "'JetBrains Mono', monospace" }}>
            Pool draw {formatRange(postInheritanceSummary.start.poolDraw, postInheritanceSummary.end.poolDraw, '/mo')} + SS {formatRange(postInheritanceSummary.start.ssIncome, postInheritanceSummary.end.ssIncome, '/mo')} + {fmtFull(trustMonthly)}/mo trust{pensionMonthly > 0 ? ` + ${fmtFull(pensionMonthly)}/mo pension` : ''}{imputedRentMonthly > 0 ? ` + ${fmtFull(imputedRentMonthly)}/mo rent saved` : ''}
          </div>
          {(postInheritanceSummary.start.savedToPool > 0 || postInheritanceSummary.end.savedToPool > 0) && (
            <div style={{ fontSize: 9, color: retirementTextBody, marginTop: 4, lineHeight: 1.4, fontFamily: "'JetBrains Mono', monospace" }}>
              Outside income reinvested: {formatRange(postInheritanceSummary.start.savedToPool, postInheritanceSummary.end.savedToPool, '/mo')}
            </div>
          )}
        </div>
      )}

      {/* Survivor */}
      <div style={{ background: COLORS.bgDeep, borderRadius: 8, padding: '10px 12px', border: `1px solid ${COLORS.amber}33` }}>
        <div style={{ fontSize: 10, color: COLORS.amber, marginBottom: 4, fontWeight: 600 }}>
          <LabelWithHelp
            label={`Sarah Survivor Spending Target (after ${chadPassesAge})`}
            help={HELP.spending_target}
            accent={COLORS.amber}
          />
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.amber, fontFamily: "'JetBrains Mono', monospace" }}>
          {fmtFull(survivorSummary.totalTarget)}/mo
        </div>
        <div style={{ fontSize: 9, color: retirementTextBody, marginTop: 4, lineHeight: 1.4, fontFamily: "'JetBrains Mono', monospace" }}>
          Pool draw {formatRange(survivorSummary.start.poolDraw, survivorSummary.end.poolDraw, '/mo')} + SS {formatRange(survivorSummary.start.ssIncome, survivorSummary.end.ssIncome, '/mo')} + {fmtFull(trustMonthly)}/mo trust{pensionMonthly > 0 ? ` + ${fmtFull(pensionMonthly)}/mo pension` : ''}{imputedRentMonthly > 0 ? ` + ${fmtFull(imputedRentMonthly)}/mo rent saved` : ''}
        </div>
        {(survivorSummary.start.savedToPool > 0 || survivorSummary.end.savedToPool > 0) && (
          <div style={{ fontSize: 9, color: retirementTextBody, marginTop: 4, lineHeight: 1.4, fontFamily: "'JetBrains Mono', monospace" }}>
            Outside income reinvested: {formatRange(survivorSummary.start.savedToPool, survivorSummary.end.savedToPool, '/mo')}
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(RetirementSummaryCards);
