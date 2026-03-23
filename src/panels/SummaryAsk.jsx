import React from 'react';
import SurfaceCard from '../components/ui/SurfaceCard.jsx';
import { fmtFull } from '../model/formatters.js';
import { formatModelTimeLabel } from '../charts/chartContract.js';
import { UI_COLORS, UI_SPACE, UI_TEXT } from '../ui/tokens.js';

const SummaryAsk = ({
  totalRemainingVesting, data, startingSavings,
  savingsZeroMonth, savingsZeroLabel,
  ssdiApprovalMonth, ssdiBackPayActual, ssdiBackPayMonths,
  retireDebt, debtTotal, debtService,
  moldInclude, moldCost, roofInclude, roofCost, otherInclude, otherProjects,
  bcsParentsAnnual, bcsYearsLeft, bcsFamilyMonthly,
  advanceNeeded, breakevenIdx,
}) => {
  const breakevenRow = breakevenIdx >= 0 ? data[breakevenIdx] : null;
  const openingRow = data[0] || {};
  const bestRow = data[data.length - 1] || {};
  const requestItems = [
    retireDebt ? { label: 'Retire high-interest debt', value: debtTotal, detail: `frees ${fmtFull(debtService)}/month in required payments` } : null,
    moldInclude ? { label: 'Mold remediation', value: moldCost, detail: "reduces Chad's housing health risk" } : null,
    roofInclude ? { label: 'Roof replacement', value: roofCost, detail: 'addresses the near-term home safety backlog' } : null,
    otherInclude ? { label: 'House projects + toilets', value: otherProjects, detail: 'can be phased, but are already in the repair queue' } : null,
  ].filter(Boolean);

  return (
    <SurfaceCard
      data-testid='summary-ask'
      tone='featured'
      padding='lg'
      style={{
        marginTop: 24,
        background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.98), rgba(30, 41, 59, 0.95))',
        borderColor: 'rgba(251, 191, 36, 0.22)',
      }}
    >
      <div style={{ display: 'grid', gap: UI_SPACE.lg }}>
        <div>
          <div style={{ fontSize: UI_TEXT.micro, color: UI_COLORS.caution, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
            The Ask
          </div>
          <h3 style={{ fontSize: UI_TEXT.heading, color: UI_COLORS.textStrong, margin: 0, fontWeight: 700 }}>
            Decision summary
          </h3>
          <p style={{ fontSize: UI_TEXT.body, color: UI_COLORS.textMuted, lineHeight: 1.6, margin: '8px 0 0' }}>
            What is happening now, the next best lever, and what the advance request covers.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: UI_SPACE.md }}>
          <div data-testid='summary-ask-happening' style={{ display: 'grid', gap: UI_SPACE.sm }}>
            <div style={{ fontSize: UI_TEXT.caption, color: UI_COLORS.textStrong, fontWeight: 700 }}>
              What is happening
            </div>
            <div style={{ fontSize: UI_TEXT.caption, color: UI_COLORS.textBody, lineHeight: 1.7 }}>
              MSFT vesting still contributes about {fmtFull(openingRow.msftVesting || 0)}/month, but it steps down in late 2027 and ends by August 2028. The current operating position is {fmtFull(openingRow.netCashFlow || 0)}/month before investment returns.
              {savingsZeroMonth ? ` At the current burn rate, ${fmtFull(startingSavings)} in savings lasts about ${savingsZeroLabel}.` : ''}
            </div>
            <div style={{ fontSize: UI_TEXT.micro, color: UI_COLORS.textDim, lineHeight: 1.6 }}>
              SSDI approval is modeled about {ssdiApprovalMonth} months out, with {fmtFull(ssdiBackPayActual)} of back pay covering {ssdiBackPayMonths} retroactive months.
            </div>
          </div>

          <div data-testid='summary-ask-next-lever' style={{ display: 'grid', gap: UI_SPACE.sm }}>
            <div style={{ fontSize: UI_TEXT.caption, color: UI_COLORS.textStrong, fontWeight: 700 }}>
              The next best lever
            </div>
            <div style={{ fontSize: UI_TEXT.caption, color: UI_COLORS.textBody, lineHeight: 1.7 }}>
              The near-term job is to bridge the plan until SSDI activates and debt service is reduced. That pair of changes does more for monthly stability than any optional spending assumption.
            </div>
            <div style={{ fontSize: UI_TEXT.micro, color: UI_COLORS.textDim, lineHeight: 1.6 }}>
              {breakevenRow
                ? `With debt retired and SSDI active, operational cash flow improves from ${fmtFull(openingRow.netCashFlow || 0)} to about ${fmtFull(breakevenRow.netCashFlow || 0)}/month by ${formatModelTimeLabel(breakevenIdx)}.`
                : `Even after debt retirement and SSDI, the best projected operating level is ${fmtFull(bestRow.netCashFlow || 0)}/month, so the plan still stays short of cash flow breakeven before vesting ends.`}
            </div>
            {bcsParentsAnnual > 25000 ? (
              <div style={{ fontSize: UI_TEXT.micro, color: UI_COLORS.textDim, lineHeight: 1.6 }}>
                Extra parent support for BCS also matters: moving from $25K to {fmtFull(bcsParentsAnnual)}/yr shifts the family share to {bcsFamilyMonthly === 0 ? 'fully covered' : `${fmtFull(bcsFamilyMonthly)}/month`} for the next {bcsYearsLeft} years.
              </div>
            ) : null}
          </div>

          <div data-testid='summary-ask-advance' style={{ display: 'grid', gap: UI_SPACE.sm }}>
            <div style={{ fontSize: UI_TEXT.caption, color: UI_COLORS.textStrong, fontWeight: 700 }}>
              What the ask covers
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: UI_SPACE.sm, flexWrap: 'wrap' }}>
              <span style={{ fontSize: UI_TEXT.caption, color: UI_COLORS.textMuted }}>
                One-time advance request
              </span>
              <span style={{ color: UI_COLORS.caution, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", fontSize: UI_TEXT.heading }}>
                {fmtFull(advanceNeeded)}
              </span>
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              {requestItems.map((item) => (
                <div key={item.label} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: UI_SPACE.sm, alignItems: 'start', fontSize: UI_TEXT.micro }}>
                  <div>
                    <div style={{ color: UI_COLORS.textBody, fontWeight: 600 }}>{item.label}</div>
                    <div style={{ color: UI_COLORS.textDim, lineHeight: 1.5 }}>{item.detail}</div>
                  </div>
                  <div style={{ color: UI_COLORS.textStrong, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>
                    {fmtFull(item.value)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </SurfaceCard>
  );
};

export default SummaryAsk;
