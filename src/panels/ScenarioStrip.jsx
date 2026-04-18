import React, { memo, useState } from 'react';
import Toggle from '../components/Toggle.jsx';
import Slider from '../components/Slider.jsx';
import SurfaceCard from '../components/ui/SurfaceCard.jsx';
import { fmtFull } from '../model/formatters.js';
import { buildPrimaryLeversModel } from '../model/scenarioLevers.js';
import { UI_COLORS, UI_RADII, UI_SPACE, UI_TEXT } from '../ui/tokens.js';
import { useRenderMetric } from '../testing/perfMetrics.js';

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

function SummaryMetric({ label, value, accent = UI_COLORS.textStrong, testId, children, expanded, onToggle }) {
  const hasDetail = !!children;
  return (
    <SurfaceCard
      padding='sm'
      data-testid={testId}
      style={{
        display: 'grid',
        gap: 6,
        minHeight: 84,
        background: UI_COLORS.surfaceMuted,
        cursor: hasDetail ? 'pointer' : 'default',
        transition: 'border-color 0.15s ease',
        borderColor: expanded ? `${accent}44` : undefined,
      }}
      onClick={hasDetail ? onToggle : undefined}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: UI_TEXT.micro, color: UI_COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
          {label}
        </div>
        {hasDetail && (
          <div style={{ fontSize: 10, color: UI_COLORS.textMuted, opacity: 0.6 }}>
            {expanded ? '▲' : '▼'}
          </div>
        )}
      </div>
      <div style={{ fontSize: 22, color: accent, fontWeight: 800, lineHeight: 1.1, fontFamily: "'JetBrains Mono', monospace" }}>
        {value}
      </div>
      {expanded && children && (
        <div style={{ borderTop: `1px solid ${UI_COLORS.border}`, paddingTop: 8, marginTop: 2 }}
          onClick={(e) => e.stopPropagation()}>
          {children}
        </div>
      )}
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
  totalMonthlySpend,
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
  useRenderMetric('ScenarioStrip');
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [cardsExpanded, setCardsExpanded] = useState(false);
  const set = onFieldChange;
  const commitStrategy = 'release';

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
            accent={UI_COLORS.destructive}
            testId='primary-levers-monthly-outflow'
            expanded={cardsExpanded}
            onToggle={() => setCardsExpanded(!cardsExpanded)}
          >
            {(() => {
              // Waterfall: start from what the user entered, show each lever's impact, arrive at outflow
              const outflow = model.summary.monthlyOutflow;
              const startLabel = totalMonthlySpend != null ? 'Base Monthly Spend' : 'Pre-lever expenses';
              const startAmount = totalMonthlySpend != null ? totalMonthlySpend : (outflow + model.summary.monthlySavings);
              const rows = [{ label: startLabel, value: fmtFull(startAmount), color: UI_COLORS.textDim, bold: true }];
              // Show each active lever as a deduction
              for (const lever of model.recurringLevers) {
                if (lever.monthlyImpact > 0) {
                  rows.push({ label: lever.label, value: `-${fmtFull(lever.monthlyImpact)}`, color: UI_COLORS.positive });
                }
              }
              // If there's a residual difference (e.g., van not yet sold at month 0, health savings, etc.)
              const accounted = model.recurringLevers.reduce((s, l) => s + Math.max(0, l.monthlyImpact), 0);
              const residual = startAmount - accounted - outflow;
              if (Math.abs(residual) > 1) {
                // Positive residual = additional savings not from levers (health ins, milestones)
                // Negative residual = additional costs (van still paying pre-sale, one-time extras)
                rows.push({
                  label: residual > 0 ? 'Other savings (health ins, etc.)' : 'Timing adjustments (van pre-sale, etc.)',
                  value: residual > 0 ? `-${fmtFull(residual)}` : `+${fmtFull(Math.abs(residual))}`,
                  color: residual > 0 ? UI_COLORS.positive : UI_COLORS.caution,
                  small: true,
                });
              }
              rows.push({ label: 'Current outflow', value: `${fmtFull(outflow)}`, color: UI_COLORS.destructive, bold: true, divider: true });
              return rows.map((row, i) => (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between', fontSize: row.small ? 10 : 11,
                  marginTop: row.divider ? 6 : i === 0 ? 0 : 3,
                  paddingTop: row.divider ? 4 : 0,
                  borderTop: row.divider ? `1px solid ${UI_COLORS.border}` : undefined,
                  color: row.color, fontWeight: row.bold ? 600 : 400,
                  fontStyle: row.small ? 'italic' : undefined,
                }}>
                  <span>{row.label}</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{row.value}</span>
                </div>
              ));
            })()}
          </SummaryMetric>
          <SummaryMetric
            label='Savings unlocked'
            value={`${fmtFull(model.summary.monthlySavings)}/mo`}
            accent={UI_COLORS.positive}
            testId='primary-levers-monthly-savings'
            expanded={cardsExpanded}
            onToggle={() => setCardsExpanded(!cardsExpanded)}
          >
            {model.recurringLevers.map((lever) => (
              <div key={lever.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                fontSize: 11, marginTop: 3, color: lever.active ? UI_COLORS.positive : UI_COLORS.textMuted,
              }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 9 }}>{lever.active ? '✓' : '○'}</span>
                  {lever.label}
                </span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10 }}>
                  {lever.active
                    ? `+${fmtFull(lever.monthlyImpact)}/mo`
                    : lever.availableMonthlyImpact > 0
                      ? `+${fmtFull(lever.availableMonthlyImpact)} avail`
                      : '$0'}
                </span>
              </div>
            ))}
            {(() => {
              const totalAvailable = model.recurringLevers.reduce((s, l) => s + Math.max(0, l.availableMonthlyImpact), 0);
              return totalAvailable > model.summary.monthlySavings ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginTop: 6, paddingTop: 4,
                  borderTop: `1px solid ${UI_COLORS.border}`, color: UI_COLORS.textDim, fontWeight: 600 }}>
                  <span>If all activated</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", color: UI_COLORS.positive }}>
                    +{fmtFull(totalAvailable)}/mo
                  </span>
                </div>
              ) : null;
            })()}
          </SummaryMetric>
          <SummaryMetric
            label='One-time ask'
            value={fmtFull(model.summary.oneTimeAsk)}
            accent={UI_COLORS.caution}
            testId='primary-levers-one-time-ask'
            expanded={cardsExpanded}
            onToggle={() => setCardsExpanded(!cardsExpanded)}
          >
            {(() => {
              const activeItems = model.consequenceItems.filter(i => i.active && i.amount > 0);
              const inactiveItems = model.consequenceItems.filter(i => !i.active && i.kind === 'one_time');
              return (
                <>
                  {activeItems.length > 0 ? activeItems.map((item) => (
                    <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginTop: 3, color: UI_COLORS.caution }}>
                      <span>{item.label}</span>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{formatConsequenceValue(item)}</span>
                    </div>
                  )) : (
                    <div style={{ fontSize: 11, color: UI_COLORS.textMuted, marginTop: 3 }}>No one-time costs active.</div>
                  )}
                  {inactiveItems.length > 0 && (
                    <>
                      <div style={{ fontSize: 10, color: UI_COLORS.textMuted, marginTop: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Available if toggled
                      </div>
                      {inactiveItems.map((item) => {
                        const cost = item.id === 'debt_retirement' ? debtTotal
                          : item.id === 'mold_remediation' ? moldCost
                          : item.id === 'roof' ? roofCost
                          : item.id === 'house_projects' ? otherProjects : 0;
                        return cost > 0 ? (
                          <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginTop: 2, color: UI_COLORS.textMuted }}>
                            <span>{item.label}</span>
                            <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{fmtFull(cost)}</span>
                          </div>
                        ) : null;
                      })}
                    </>
                  )}
                </>
              );
            })()}
          </SummaryMetric>
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
          <div style={{ display: 'grid', gap: UI_SPACE.md }}>
            <SectionHeading
              eyebrow='Major Monthly Levers'
              title='Plan adjustments'
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
                      <div style={{ paddingLeft: 58 }}>
                        <Slider
                          label='Monthly debt service'
                          value={debtService}
                          onChange={set('debtService')}
                          commitStrategy={commitStrategy}
                          testId='scenario-debt-service'
                          min={0}
                          max={20000}
                          step={100}
                          color={retireDebt ? UI_COLORS.positive : UI_COLORS.destructive}
                          format={(value) => `${fmtFull(value)}/mo`}
                        />
                      </div>
                    </LeverRow>
                  );
                }

                if (lever.id === 'spending_cuts') {
                  return (
                    <LeverRow key={lever.id} lever={lever} testId='primary-levers-lever-spending_cuts'>
                      <Toggle
                        label='Lifestyle + spending cuts'
                        description='Additional monthly reductions from your current spend level.'
                        checked={lifestyleCutsApplied}
                        onChange={set('lifestyleCutsApplied')}
                        color={UI_COLORS.positive}
                        testId='scenario-lifestyle-cuts'
                      />
                      <div style={{ paddingLeft: 58 }}>
                        <Slider
                          label='Monthly cut amount'
                          value={cutsOverride ?? 0}
                          onChange={set('cutsOverride')}
                          commitStrategy={commitStrategy}
                          testId='scenario-total-cuts'
                          min={0}
                          max={20000}
                          step={100}
                          color={lifestyleCutsApplied ? UI_COLORS.positive : UI_COLORS.muted}
                          format={(value) => `${fmtFull(value)}/mo`}
                        />
                      </div>
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
                commitStrategy={commitStrategy}
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

        </div>
      </div>
    </SurfaceCard>
  );
};

export default memo(ScenarioStrip);
