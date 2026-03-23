import React, { useState } from 'react';
import Toggle from '../components/Toggle.jsx';
import Slider from '../components/Slider.jsx';
import SurfaceCard from '../components/ui/SurfaceCard.jsx';
import { fmtFull } from '../model/formatters.js';
import { buildPrimaryLeversModel } from '../model/scenarioLevers.js';
import { UI_COLORS, UI_RADII, UI_SPACE, UI_TEXT } from '../ui/tokens.js';

function formatSignedAmount(amount, suffix = '') {
  if (amount === 0) return `$0${suffix}`;
  return `${amount > 0 ? '+' : '-'}${fmtFull(Math.abs(amount))}${suffix}`;
}

function formatLeverNarrative(lever) {
  if (lever.monthlyImpact > 0) {
    return `Active now: saves ${fmtFull(lever.monthlyImpact)}/mo`;
  }
  if (lever.monthlyImpact < 0) {
    return `Active now: adds ${fmtFull(Math.abs(lever.monthlyImpact))}/mo`;
  }
  if (lever.availableMonthlyImpact > 0) {
    return `Available: saves up to ${fmtFull(lever.availableMonthlyImpact)}/mo`;
  }
  return 'No monthly change';
}

function getLeverValueLabel(lever) {
  if (lever.monthlyImpact > 0) return `+${fmtFull(lever.monthlyImpact)}`;
  if (lever.monthlyImpact < 0) return `-${fmtFull(Math.abs(lever.monthlyImpact))}`;
  if (lever.availableMonthlyImpact > 0) return `Up to ${fmtFull(lever.availableMonthlyImpact)}`;
  return '$0';
}

function getBcsDeltaCopy(monthlyDeltaFromStatusQuo, totalDeltaOverRemainingYears, bcsYearsLeft) {
  if (monthlyDeltaFromStatusQuo > 0) {
    return {
      headline: `Saves ${fmtFull(monthlyDeltaFromStatusQuo)}/mo vs status quo`,
      detail: `${formatSignedAmount(totalDeltaOverRemainingYears)} over ${bcsYearsLeft} years`,
      color: '#c084fc',
    };
  }
  if (monthlyDeltaFromStatusQuo < 0) {
    return {
      headline: `Adds ${fmtFull(Math.abs(monthlyDeltaFromStatusQuo))}/mo vs status quo`,
      detail: `${formatSignedAmount(totalDeltaOverRemainingYears)} over ${bcsYearsLeft} years`,
      color: UI_COLORS.destructive,
    };
  }
  return {
    headline: 'Matches the $25K status quo',
    detail: 'No multi-year change from the current family plan',
    color: UI_COLORS.textMuted,
  };
}

function formatConsequenceValue(item) {
  if (item.id === 'bcs_support_delta') {
    return `${formatSignedAmount(item.signedAmount)} over remaining years`;
  }
  return fmtFull(item.amount);
}

function SectionHeading({ eyebrow, title, subtitle }) {
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      {eyebrow ? (
        <div style={{
          fontSize: UI_TEXT.micro,
          color: UI_COLORS.textMuted,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          fontWeight: 700,
        }}>
          {eyebrow}
        </div>
      ) : null}
      <div style={{ fontSize: UI_TEXT.title, color: UI_COLORS.textStrong, fontWeight: 700 }}>
        {title}
      </div>
      {subtitle ? (
        <div style={{ fontSize: UI_TEXT.caption, color: UI_COLORS.textMuted, lineHeight: 1.5 }}>
          {subtitle}
        </div>
      ) : null}
    </div>
  );
}

function SummaryMetric({ label, value, accent = UI_COLORS.textStrong, testId }) {
  return (
    <SurfaceCard
      padding='sm'
      data-testid={testId}
      style={{
        display: 'grid',
        gap: 6,
        minHeight: 84,
        background: UI_COLORS.surfaceMuted,
      }}
    >
      <div style={{ fontSize: UI_TEXT.micro, color: UI_COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, color: accent, fontWeight: 800, lineHeight: 1.1, fontFamily: "'JetBrains Mono', monospace" }}>
        {value}
      </div>
    </SurfaceCard>
  );
}

function ConsequenceGroup({ title, testId, items, emptyText }) {
  const activeItems = items.filter((item) => item.active && (item.amount > 0 || item.signedAmount !== 0));

  return (
    <div data-testid={testId} style={{ display: 'grid', gap: UI_SPACE.sm }}>
      <div style={{ fontSize: UI_TEXT.micro, color: UI_COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
        {title}
      </div>
      {activeItems.length === 0 ? (
        <SurfaceCard padding='sm' style={{ background: UI_COLORS.surfaceMuted }}>
          <div style={{ fontSize: UI_TEXT.caption, color: UI_COLORS.textMuted, lineHeight: 1.5 }}>
            {emptyText}
          </div>
        </SurfaceCard>
      ) : (
        activeItems.map((item) => (
          <SurfaceCard
            key={item.id}
            padding='sm'
            style={{
              background: UI_COLORS.surfaceMuted,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              gap: UI_SPACE.md,
            }}
          >
            <div style={{ fontSize: UI_TEXT.caption, color: UI_COLORS.textBody, lineHeight: 1.4 }}>
              {item.label}
            </div>
            <div style={{
              fontSize: UI_TEXT.label,
              color: item.id === 'bcs_support_delta'
                ? (item.signedAmount >= 0 ? '#c084fc' : UI_COLORS.destructive)
                : UI_COLORS.caution,
              fontWeight: 700,
              fontFamily: "'JetBrains Mono', monospace",
              whiteSpace: 'nowrap',
            }}>
              {formatConsequenceValue(item)}
            </div>
          </SurfaceCard>
        ))
      )}
    </div>
  );
}

function LeverRow({
  lever,
  children,
  testId,
}) {
  return (
    <SurfaceCard
      padding='sm'
      data-testid={testId}
      data-rank={lever.rank}
      data-impact={lever.monthlyImpact}
      style={{
        display: 'grid',
        gap: UI_SPACE.sm,
        background: UI_COLORS.surfaceMuted,
      }}
    >
      <div style={{ display: 'flex', gap: UI_SPACE.md, alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: UI_SPACE.md, minWidth: 0 }}>
          <div style={{
            minWidth: 28,
            height: 28,
            borderRadius: 999,
            background: lever.monthlyImpact > 0 ? 'rgba(74, 222, 128, 0.16)' : 'rgba(148, 163, 184, 0.1)',
            border: `1px solid ${lever.monthlyImpact > 0 ? 'rgba(74, 222, 128, 0.28)' : 'rgba(148, 163, 184, 0.2)'}`,
            color: lever.monthlyImpact > 0 ? UI_COLORS.positive : UI_COLORS.textMuted,
            display: 'grid',
            placeItems: 'center',
            fontSize: UI_TEXT.caption,
            fontWeight: 800,
            flexShrink: 0,
          }}>
            {lever.rank}
          </div>
          <div style={{ display: 'grid', gap: 4 }}>
            <div style={{ fontSize: UI_TEXT.body, color: UI_COLORS.textStrong, fontWeight: 700, lineHeight: 1.35 }}>
              {lever.label}
            </div>
            <div style={{ fontSize: UI_TEXT.micro, color: UI_COLORS.textMuted, lineHeight: 1.45 }}>
              {formatLeverNarrative(lever)}
              {lever.oneTimeImpact ? ` | One-time ask: ${fmtFull(lever.oneTimeImpact)}` : ''}
            </div>
          </div>
        </div>
        <div style={{
          fontSize: lever.monthlyImpact === 0 ? UI_TEXT.caption : UI_TEXT.label,
          color: lever.monthlyImpact > 0 ? UI_COLORS.positive : (lever.availableMonthlyImpact > 0 ? UI_COLORS.textBody : UI_COLORS.textMuted),
          fontWeight: 700,
          fontFamily: "'JetBrains Mono', monospace",
          whiteSpace: 'nowrap',
        }}>
          {getLeverValueLabel(lever)}
        </div>
      </div>
      {children}
    </SurfaceCard>
  );
}

const ScenarioStrip = ({
  retireDebt,
  lifestyleCutsApplied,
  cutsOverride,
  lifestyleCuts,
  cutInHalf,
  extraCuts,
  debtTotal,
  debtService,
  baseExpenses,
  currentExpenses,
  vanSold,
  vanMonthlySavings,
  bcsAnnualTotal,
  bcsParentsAnnual,
  bcsYearsLeft,
  bcsFamilyMonthly,
  moldCost,
  moldInclude,
  roofCost,
  roofInclude,
  otherProjects,
  otherInclude,
  advanceNeeded,
  onFieldChange,
  layoutBucket = 'desktop',
}) => {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const set = onFieldChange;

  const model = buildPrimaryLeversModel({
    retireDebt,
    lifestyleCutsApplied,
    cutsOverride,
    lifestyleCuts,
    cutInHalf,
    extraCuts,
    debtTotal,
    debtService,
    baseExpenses,
    currentExpenses,
    vanSold,
    vanMonthlySavings,
    bcsAnnualTotal,
    bcsParentsAnnual,
    bcsYearsLeft,
    bcsFamilyMonthly,
    moldCost,
    moldInclude,
    roofCost,
    roofInclude,
    otherProjects,
    otherInclude,
    advanceNeeded,
  });

  const recurringLevers = model.recurringLevers.filter((lever) => lever.id !== 'bcs_support');
  const bcsLever = model.recurringLevers.find((lever) => lever.id === 'bcs_support');
  const changedHere = model.consequenceItems.filter((item) => item.group === 'changed_here');
  const otherAssumptions = model.consequenceItems.filter((item) => item.group === 'other_assumptions');
  const bcsDeltaCopy = getBcsDeltaCopy(model.bcs.monthlyDeltaFromStatusQuo, model.bcs.totalDeltaOverRemainingYears, bcsYearsLeft);
  const topLeverCopy = model.summary.topLeverId
    ? `${model.summary.topLeverLabel} is currently the biggest active monthly lever at ${fmtFull(model.summary.topLeverSavings)}/mo.`
    : model.summary.availableLeverId
      ? `Largest available lever: ${model.summary.availableLeverLabel} at ${fmtFull(model.summary.availableLeverSavings)}/mo.`
      : 'No monthly levers are active yet.';

  const rootLayout = layoutBucket === 'desktop' ? 'desktop' : (layoutBucket === 'compact' ? 'compact' : 'stacked');
  const desktop = rootLayout === 'desktop';

  return (
    <SurfaceCard
      tone='compare'
      padding='lg'
      data-testid='scenario-strip'
      data-layout={rootLayout}
      data-order='controls-first'
      style={{
        display: 'grid',
        gap: UI_SPACE.lg,
        marginBottom: UI_SPACE.xl,
      }}
    >
      <div style={{ display: 'grid', gap: UI_SPACE.sm }}>
        <SectionHeading
          eyebrow='Decision Console'
          title='Primary Levers'
          subtitle='Start with the levers that change the monthly plan most, then review what that does to the one-time ask.'
        />
        <div
          data-testid='primary-levers-summary'
          style={{
            display: 'grid',
            gap: UI_SPACE.md,
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          }}
        >
          <SummaryMetric
            label='Current monthly outflow'
            value={`${fmtFull(model.summary.monthlyOutflow)}/mo`}
            accent= {UI_COLORS.destructive}
            testId='primary-levers-monthly-outflow'
          />
          <SummaryMetric
            label='Savings unlocked'
            value={`${fmtFull(model.summary.monthlySavings)}/mo`}
            accent={UI_COLORS.positive}
            testId='primary-levers-monthly-savings'
          />
          <SummaryMetric
            label='One-time ask'
            value={fmtFull(model.summary.oneTimeAsk)}
            accent={UI_COLORS.caution}
            testId='primary-levers-one-time-ask'
          />
        </div>
        <div style={{ fontSize: UI_TEXT.caption, color: UI_COLORS.textMuted, lineHeight: 1.5 }}>
          {topLeverCopy}
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gap: UI_SPACE.lg,
          gridTemplateColumns: desktop ? 'minmax(0, 1.7fr) minmax(300px, 0.95fr)' : '1fr',
          alignItems: 'start',
        }}
      >
        <div
          data-testid='primary-levers-controls-section'
          style={{ display: 'grid', gap: UI_SPACE.lg }}
        >
          <SurfaceCard
            padding='sm'
            data-testid='primary-levers-controls'
            style={{ display: 'grid', gap: UI_SPACE.md, background: UI_COLORS.surfaceMuted }}
          >
            <SectionHeading
              eyebrow='Base Expenses'
              title='Monthly baseline'
              subtitle='Adjust the fixed monthly baseline before layering in discretionary levers.'
            />
            <Slider
              label='Base living expenses'
              value={baseExpenses}
              onChange={set('baseExpenses')}
              testId='scenario-base-expenses'
              min={25000}
              max={55000}
              step={500}
              color={UI_COLORS.destructive}
              format={(value) => fmtFull(value)}
              helperText='This is the starting monthly living load before debt, the van, or BCS tuition are added.'
            />
          </SurfaceCard>

          <div style={{ display: 'grid', gap: UI_SPACE.md }}>
            <SectionHeading
              eyebrow='Major Monthly Levers'
              title='Ranked by impact'
              subtitle='These are ordered by current monthly effect. BCS stays separate because it needs a dedicated support slider.'
            />
            <div
              data-testid='primary-levers-ranked-levers'
              style={{ display: 'grid', gap: UI_SPACE.md }}
            >
              {recurringLevers.map((lever) => {
                if (lever.id === 'retire_debt') {
                  return (
                    <LeverRow key={lever.id} lever={lever} testId='primary-levers-lever-retire_debt'>
                      <Toggle
                        label={`Retire all debt (${fmtFull(debtTotal)} balance)`}
                        description={`Removes ${fmtFull(debtService)}/mo from the plan.`}
                        checked={retireDebt}
                        onChange={set('retireDebt')}
                        color={UI_COLORS.positive}
                        testId='scenario-retire-debt'
                      />
                    </LeverRow>
                  );
                }

                if (lever.id === 'spending_cuts') {
                  const detailTotal = lifestyleCuts + cutInHalf + extraCuts;
                  const cutsValue = cutsOverride != null ? cutsOverride : detailTotal;

                  return (
                    <LeverRow key={lever.id} lever={lever} testId='primary-levers-lever-spending_cuts'>
                      <Toggle
                        label='Lifestyle + spending cuts'
                        description={`Detail total is ${fmtFull(detailTotal)}/mo. You can override that total below without changing the itemized assumptions.`}
                        checked={lifestyleCutsApplied}
                        onChange={set('lifestyleCutsApplied')}
                        color={UI_COLORS.positive}
                        testId='scenario-lifestyle-cuts'
                      />
                      {lifestyleCutsApplied ? (
                        <div style={{ paddingLeft: 58 }}>
                          <Slider
                            label='Total cuts'
                            value={cutsValue}
                            onChange={(value) => set('cutsOverride')(value)}
                            testId='scenario-total-cuts'
                            min={0}
                            max={25000}
                            step={500}
                            color={UI_COLORS.positive}
                            format={(value) => `${fmtFull(value)}/mo`}
                            helperText='Use the override when you want to model a different total without changing the underlying detail assumptions.'
                          />
                          {cutsOverride != null && cutsOverride !== detailTotal ? (
                            <button
                              type='button'
                              data-testid='scenario-reset-cuts-override'
                              onClick={() => set('cutsOverride')(null)}
                              style={{
                                border: 'none',
                                background: 'transparent',
                                color: UI_COLORS.positive,
                                fontSize: UI_TEXT.micro,
                                padding: 0,
                                cursor: 'pointer',
                                textDecoration: 'underline',
                              }}
                            >
                              Reset to detail total ({fmtFull(detailTotal)}/mo)
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </LeverRow>
                  );
                }

                return (
                  <LeverRow key={lever.id} lever={lever} testId='primary-levers-lever-sell_van'>
                    <Toggle
                      label='Sell the van'
                      description={`Removes ${fmtFull(vanMonthlySavings)}/mo from the monthly plan.`}
                      checked={vanSold}
                      onChange={set('vanSold')}
                      color={UI_COLORS.positive}
                      testId='scenario-van-sold'
                    />
                  </LeverRow>
                );
              })}
            </div>
          </div>

          <SurfaceCard
            padding='sm'
            data-testid='primary-levers-bcs-section'
            style={{ display: 'grid', gap: UI_SPACE.md, background: UI_COLORS.surfaceMuted }}
          >
            <SectionHeading
              eyebrow='School Contribution'
              title='BCS support'
              subtitle='Keep this as a continuous slider. The monthly comparison is always measured against the fixed $25K status quo contribution.'
            />
            <div
              data-testid='primary-levers-lever-bcs_support'
              data-rank={bcsLever?.rank ?? ''}
              data-impact={bcsLever?.monthlyImpact ?? 0}
              style={{
                display: 'grid',
                gap: UI_SPACE.sm,
                padding: UI_SPACE.md,
                border: `1px solid ${UI_COLORS.border}`,
                borderRadius: UI_RADII.md,
                background: 'rgba(192, 132, 252, 0.08)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: UI_SPACE.md, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <div style={{ display: 'grid', gap: 4 }}>
                  <div style={{ fontSize: UI_TEXT.body, color: UI_COLORS.textStrong, fontWeight: 700 }}>
                    Parents contribute {fmtFull(bcsParentsAnnual)}/yr
                  </div>
                  <div style={{ fontSize: UI_TEXT.caption, color: UI_COLORS.textMuted, lineHeight: 1.5 }}>
                    We owe {model.bcs.monthlyFamilyShare > 0 ? `${fmtFull(model.bcs.monthlyFamilyShare)}/mo` : '$0/mo'}
                  </div>
                </div>
                <div style={{ textAlign: desktop ? 'right' : 'left' }}>
                  <div style={{ fontSize: UI_TEXT.label, color: bcsDeltaCopy.color, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
                    {bcsDeltaCopy.headline}
                  </div>
                  <div style={{ fontSize: UI_TEXT.micro, color: UI_COLORS.textMuted }}>
                    {bcsDeltaCopy.detail}
                  </div>
                </div>
              </div>
              <Slider
                label="BCS tuition parents' contribution"
                value={bcsParentsAnnual}
                onChange={set('bcsParentsAnnual')}
                min={0}
                max={bcsAnnualTotal}
                step={1000}
                color='#c084fc'
                testId='scenario-bcs-parents-annual'
                helperText='Click the marker labels or drag the slider to model any support level from $0 to full coverage.'
                format={(value) => `${fmtFull(value)}/yr`}
              />
              <div style={{
                position: 'relative',
                minHeight: 34,
                padding: '0 6px',
              }}>
                {model.bcs.tickMarks.map((tick) => {
                  const pct = bcsAnnualTotal > 0 ? (tick.value / bcsAnnualTotal) * 100 : 0;
                  const active = Math.abs(bcsParentsAnnual - tick.value) < 500;
                  return (
                    <button
                      key={tick.value}
                      type='button'
                      onClick={() => set('bcsParentsAnnual')(tick.value)}
                      style={{
                        position: 'absolute',
                        left: `${pct}%`,
                        transform: 'translateX(-50%)',
                        border: 'none',
                        background: 'transparent',
                        cursor: 'pointer',
                        display: 'grid',
                        justifyItems: 'center',
                        padding: 0,
                      }}
                    >
                      <div style={{ width: 2, height: 8, background: active ? '#c084fc' : '#475569' }} />
                      <div style={{ fontSize: UI_TEXT.micro, color: active ? '#c084fc' : UI_COLORS.textMuted, fontWeight: active ? 700 : 500, whiteSpace: 'nowrap' }}>
                        {tick.label}
                      </div>
                      <div style={{ fontSize: 10, color: active ? '#c084fc' : '#64748b', whiteSpace: 'nowrap' }}>
                        {tick.sub}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </SurfaceCard>

          <SurfaceCard padding='sm' style={{ display: 'grid', gap: UI_SPACE.md, background: UI_COLORS.surfaceMuted }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: UI_SPACE.md, alignItems: 'center', flexWrap: 'wrap' }}>
              <SectionHeading
                eyebrow='Advanced Detail'
                title='Monthly spending breakdown'
                subtitle='Open the full accounting view when you need to verify how the current outflow is assembled.'
              />
              <button
                type='button'
                data-testid='primary-levers-breakdown-toggle'
                onClick={() => setShowBreakdown((open) => !open)}
                style={{
                  border: `1px solid ${UI_COLORS.borderStrong}`,
                  background: 'transparent',
                  borderRadius: UI_RADII.sm,
                  color: UI_COLORS.textBody,
                  fontSize: UI_TEXT.caption,
                  fontWeight: 600,
                  padding: '8px 12px',
                  cursor: 'pointer',
                }}
              >
                {showBreakdown ? 'Hide breakdown' : 'Show breakdown'}
              </button>
            </div>
            {showBreakdown ? (
              <div data-testid='primary-levers-breakdown'>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: UI_TEXT.caption, fontFamily: "'JetBrains Mono', monospace" }}>
                  <tbody>
                    {model.breakdown.map((row) => (
                      <tr key={row.id}>
                        <td style={{ padding: '6px 0', color: row.kind === 'total' ? UI_COLORS.destructive : UI_COLORS.textBody, fontWeight: row.kind === 'total' || row.kind === 'subtotal' ? 700 : 500 }}>
                          {row.label}
                        </td>
                        <td style={{ padding: '6px 0', textAlign: 'right', color: row.kind === 'total' ? UI_COLORS.destructive : UI_COLORS.textMuted, fontWeight: row.kind === 'total' || row.kind === 'subtotal' ? 700 : 500 }}>
                          {row.id === 'spending_cuts' && row.amount > 0 ? `-${fmtFull(row.amount)}` : fmtFull(row.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </SurfaceCard>
        </div>

        <div
          data-testid='primary-levers-consequence-rail'
          style={{ display: 'grid', gap: UI_SPACE.md }}
        >
          <SectionHeading
            eyebrow='Consequence Summary'
            title='What this changes'
            subtitle='Separate the one-time effects changed in this card from other assumptions that still shape the total ask.'
          />
          <ConsequenceGroup
            title='Changed in this card'
            testId='primary-levers-consequence-changed-here'
            items={changedHere}
            emptyText='No one-time changes are active from the controls in this card.'
          />
          <ConsequenceGroup
            title='Other one-time assumptions'
            testId='primary-levers-consequence-other-assumptions'
            items={otherAssumptions}
            emptyText='No other one-time assumptions are active right now.'
          />
        </div>
      </div>
    </SurfaceCard>
  );
};

export default ScenarioStrip;
