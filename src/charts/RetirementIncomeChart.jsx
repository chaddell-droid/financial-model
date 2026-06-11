import React, { memo, useState, useEffect } from 'react';
import { fmtFull } from '../model/formatters.js';
import RetirementCompositionChart from './RetirementCompositionChart.jsx';
import Slider from '../components/Slider.jsx';
import Toggle from '../components/Toggle.jsx';
import HelpDrawer from '../components/help/HelpDrawer.jsx';
import HelpTip from '../components/help/HelpTip.jsx';
import ActionButton from '../components/ui/ActionButton.jsx';
import PwaDistributionChart from './PwaDistributionChart.jsx';
import { HELP } from '../content/help/registry.js';
import { useRetirementSimulation } from '../hooks/useRetirementSimulation.js';
import { useRenderMetric } from '../testing/perfMetrics.js';
import { COLORS } from './chartUtils.js';
import ChartYAxis from './ChartYAxis.jsx';
// Shared retirement-surface primitives + extracted sections (Phase 7 file split).
import {
  PWA_STRATEGY_OPTIONS, getPwaStrategyLabel, formatRange, fmtPool,
  LabelWithHelp, HelpChip, ModeIdentityBanner, ControlSection,
} from './RetirementChartPrimitives.jsx';
import RetirementSummaryCards from './RetirementSummaryCards.jsx';
import RetirementDecisionPreview from './RetirementDecisionPreview.jsx';

function RetirementIncomeChart({
  savingsData, wealthData,
  ssType, ssPersonal, ssPIA, ssClaimAge,
  chadJob,
  trustIncomeFuture,
  ssMonthsWithheld,
  chadJobPensionMonthly,
  chadCurrentAge,
  sarahCurrentAge,
  sarahSpousalClaimAge,
  sarahSpousalEnabled,
  sarahOwnSS,
  retirement401kTaxRate,
  expenseInflation,
  expenseInflationRate,
  // B3 (2026-06-10 retirement review): persisted chart assumptions + writer
  retChadPassesAge, retEquityAllocation, retWithdrawalRate, retPoolFloor,
  retBequestTarget, retInheritanceAmount, retInheritanceSarahAge, retPwaStrategy,
  retKeepHouse, retImputedRentSaved, retSurvivorTaxDragPct,
  onFieldChange,
  onSpendingTargets,
}) {
  useRenderMetric('RetirementIncomeChart');

  const {
    retirementMode, setRetirementMode, isPwaMode, commitStrategy,
    pwaStrategy, setPwaStrategy,
    pwaPercentile, setPwaPercentile,
    pwaToleranceLow, setPwaToleranceLow,
    pwaToleranceHigh, setPwaToleranceHigh,
    bequestTarget, setBequestTarget,
    equityAllocation, setEquityAllocation,
    withdrawalRate, setWithdrawalRate,
    poolFloor, setPoolFloor,
    chadPassesAge, setChadPassesAge,
    inheritanceAmount, setInheritanceAmount,
    inheritanceSarahAge, setInheritanceSarahAge,
    showPwaIntro, pwaIntroReady, dismissPwaIntro,
    ageDiff, sarahTargetAge, years,
    endSavings, end401k, end401kAfterTax, homeSaleNet, totalPool,
    trustMonthly, pensionMonthly, imputedRentMonthly, startingCoupleIncome,
    keepHouse, setKeepHouse, imputedRentSaved, setImputedRentSaved,
    survivorTaxDragPct, setSurvivorTaxDrag,
    normalizedPwaToleranceLow, normalizedPwaToleranceHigh,
    hasInheritance, inheritanceChadAge, inheritanceYear, inhDuringCouple,
    pwaCurrentDistribution, pwaCurrentSelection, pwaCurrentView,
    pwaStartContext, pwaReferenceSimulation,
    optimalRates, bandResult,
    deterministicPools, avgAnnualReal,
    yearlyData,
    coupleSummary, postInheritanceSummary, survivorSummary,
  } = useRetirementSimulation({ savingsData, wealthData, ssType, ssPersonal, ssPIA, ssClaimAge, chadJob, trustIncomeFuture, ssMonthsWithheld, chadJobPensionMonthly, chadCurrentAge, sarahCurrentAge, sarahSpousalClaimAge, sarahSpousalEnabled, sarahOwnSS, retirement401kTaxRate, expenseInflation, expenseInflationRate, retChadPassesAge, retEquityAllocation, retWithdrawalRate, retPoolFloor, retBequestTarget, retInheritanceAmount, retInheritanceSarahAge, retPwaStrategy, retKeepHouse, retImputedRentSaved, retSurvivorTaxDragPct, onFieldChange });

  // Report spending targets to parent
  useEffect(() => {
    if (onSpendingTargets && coupleSummary) {
      onSpendingTargets({
        preInheritance: coupleSummary.totalTarget,
        postInheritance: postInheritanceSummary?.totalTarget || null,
        inhDuringCouple,
        inheritanceChadAge,
      });
    }
  }, [onSpendingTargets, coupleSummary, postInheritanceSummary, inhDuringCouple, inheritanceChadAge]);

  const [tooltip, setTooltip] = useState(null);

  // Chart dimensions
  const svgW = 800, svgH = 340;
  const padL = 70, padR = 20, padT = 20, padB = 40;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;

  // Scale: use sqrt to compress large post-inheritance values while keeping
  // pre-inheritance pool visible. A linear scale makes $215K look like zero
  // when the chart goes to $4M+.
  const allBandValues = bandResult.bands.flatMap(b => b.series);
  const rawMax = Math.max(...allBandValues, totalPool, ...deterministicPools) * 1.05;
  const poolRange = rawMax || 1;
  const sqrtMax = Math.sqrt(poolRange);

  const xScale = (i) => padL + (i / years) * plotW;
  const yPool = (v) => padT + (1 - Math.sqrt(Math.max(0, v)) / sqrtMax) * plotH;

  const poolPts = deterministicPools.map((p, i) => `${xScale(i)},${yPool(p)}`);
  const poolLine = `M ${poolPts.join(' L ')}`;

  const survivorStartIdx = yearlyData.findIndex(d => d.phase === 'survivor');

  // Y-axis ticks — placed at nice round values that look good on sqrt scale
  const yTicks = [];
  const tickCandidates = [0, 50000, 100000, 250000, 500000, 1000000, 2000000, 3000000, 5000000, 10000000];
  for (const v of tickCandidates) {
    if (v <= poolRange) yTicks.push(v);
  }

  // Band paths for chart
  const bandPairs = [
    { lo: bandResult.bands[0], hi: bandResult.bands[4], color: COLORS.blue, opacity: 0.08 },
    { lo: bandResult.bands[1], hi: bandResult.bands[3], color: COLORS.blue, opacity: 0.12 },
  ];

  // Shorthand for cohort results
  const endAboveReserveRate = bandResult.finishAboveReserveRate;
  const optRate = optimalRates.optimalRate;
  const optMonthly = optimalRates.optimalMonthly;
  const optPreRate = optimalRates.optimalPreRate;
  const optPreMonthly = optimalRates.optimalPreMonthly;
  const pwaConfidencePct = Math.round((pwaCurrentSelection.probabilityNoCut || 0) * 100);
  const pwaReferenceBequestMet = (pwaReferenceSimulation?.finalPool || 0) >= bequestTarget;
  const retirementTextStrong = COLORS.textSecondary;
  const retirementTextBody = COLORS.textSoft;
  const retirementTextMuted = COLORS.textMuted;
  const sectionOverviewHelp = isPwaMode ? HELP.retirement_overview_pwa : HELP.retirement_overview_historical;
  const modeIdentity = isPwaMode
    ? {
        accent: COLORS.blue,
        title: 'Adaptive PWA',
        summary: 'Use this mode when you want a spending target that can re-solve each year from the remaining pool, remaining horizon, and bequest goal.',
        primaryLabel: 'Headline meaning',
        primaryValue: `${pwaConfidencePct}% won't need to cut later`,
        secondaryLabel: 'Planning constraint',
        secondaryValue: `Stay near ${fmtFull(Math.round(pwaCurrentSelection.selectedWithdrawal || 0))}/mo while still ending near ${fmtFull(bequestTarget)}.`,
        bullets: [
          'Start by choosing the bequest target and strategy. The app then recommends a current total spending target, not just a raw pool draw.',
          'Use tolerance controls only after the target framework feels right. They decide when the model recenters versus staying sticky.',
          'Compare this mode against Historical Safe by framework, not by headline percentage. The top metric here is future-cut risk, not reserve survival.',
        ],
      }
    : {
        accent: COLORS.green,
        title: 'Historical Safe',
        summary: 'Use this mode when you want a fixed starting pool draw tested across every historical retirement cohort with reserve and survivor constraints.',
        primaryLabel: 'Headline meaning',
        primaryValue: `${Math.round(endAboveReserveRate * 100)}% finish above reserve by Sarah ${sarahTargetAge}`,
        secondaryLabel: 'Planning constraint',
        secondaryValue: `${optimalRates.optimalRate}% optimal pool draw leaves 90% of historical cohorts above reserve at Sarah ${sarahTargetAge}.`,
        bullets: [
          'Set the pool draw and survivor timing first. Then use reserve and inheritance assumptions to decide how much slack you want in bad historical starts.',
          'The optimal rate is the closed-form ERN result: the exact spending where 90% of historical cohorts end above your reserve target.',
          'Use the survivor spending cards to read how the same plan behaves before inheritance, after inheritance, and after Chad passes.',
        ],
      };

  return (
    <div data-testid="retirement-income-chart" style={{
      background: COLORS.bgCard, borderRadius: 12, padding: '20px 16px',
      border: `1px solid ${COLORS.border}`, marginBottom: 24,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 15, color: retirementTextStrong, margin: 0, fontWeight: 600 }}>
            <span>Retirement + Survivor Income (today&apos;s dollars)</span>
            <HelpTip help={HELP.retirement_mode} accent={COLORS.blue} />
          </h3>
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            {[
              { value: 'historical_safe', label: 'Historical Safe' },
              { value: 'adaptive_pwa', label: 'Adaptive PWA' },
            ].map(mode => (
              <ActionButton
                key={mode.value}
                type="button"
                onClick={() => setRetirementMode(mode.value)}
                data-testid={`retirement-mode-${mode.value}`}
                aria-label={`Switch retirement mode to ${mode.label}`}
                variant="chip"
                size="sm"
                active={retirementMode === mode.value}
                accent={mode.value === 'adaptive_pwa' ? COLORS.blue : COLORS.green}
                style={{ borderRadius: 999 }}
              >
                {mode.label}
              </ActionButton>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              fontSize: 12,
              color: isPwaMode
                ? (pwaConfidencePct >= 70 ? COLORS.green : pwaConfidencePct >= 50 ? COLORS.amber : COLORS.red)
                : (endAboveReserveRate >= 0.9 ? COLORS.green : endAboveReserveRate >= 0.7 ? COLORS.amber : COLORS.red),
              fontWeight: 600,
              textAlign: 'right',
            }}>
              {isPwaMode
                ? `${pwaConfidencePct}% won't need to cut later (${pwaCurrentDistribution.sampleCount.toLocaleString()} cohorts)`
                : `${Math.round(endAboveReserveRate * 100)}% finish above reserve by Sarah ${sarahTargetAge} (${optimalRates.numCohorts.toLocaleString()} cohorts, ${optimalRates.cohortRange})`}
            </span>
            <HelpTip
              help={isPwaMode ? HELP.probability_no_cut : HELP.finish_above_reserve}
              accent={isPwaMode ? COLORS.blue : COLORS.green}
              align="right"
            />
          </div>
        </div>
      </div>

      {/* Subtitle */}
      <div style={{ fontSize: 11, color: retirementTextMuted, marginBottom: 12, fontStyle: 'italic', lineHeight: 1.45 }}>
        {isPwaMode ? (
          <>
            Adaptive PWA · {getPwaStrategyLabel(pwaStrategy)} · {equityAllocation}/{100 - equityAllocation} portfolio · Chad passes at {chadPassesAge} · Bequest target {fmtFull(bequestTarget)}
            {pwaStrategy !== 'sticky_median' && ` · ${pwaPercentile}th pct target`}
            {(pwaStrategy === 'sticky_median' || pwaStrategy === 'sticky_quartile_nudge') && ` · ${normalizedPwaToleranceLow}–${normalizedPwaToleranceHigh} tolerance`}
          </>
        ) : (
          <>
            {keepHouse ? `House kept (rent saved ${fmtFull(imputedRentSaved)}/mo)` : 'House sold at 67'} · {withdrawalRate}% pool draw · {equityAllocation}/{100 - equityAllocation} portfolio · {avgAnnualReal}% avg real return · Chad passes at {chadPassesAge}
            {optimalRates.worstCohort.year > 0 && ` · Worst start: ${optimalRates.worstCohort.year}`}
          </>
        )}
      </div>

      <HelpDrawer
        key={retirementMode}
        help={sectionOverviewHelp}
        title={isPwaMode ? 'How To Read Adaptive PWA' : 'How To Read Historical Safe'}
        accent={isPwaMode ? COLORS.blue : COLORS.green}
        defaultOpen={isPwaMode}
        >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
          {isPwaMode ? (
            <>
              <HelpChip label="Spending target" help={HELP.spending_target} accent={COLORS.green} />
              <HelpChip label="Pool draw" help={HELP.pool_draw} accent={COLORS.blue} />
              <HelpChip label="Won't need to cut later" help={HELP.probability_no_cut} accent={COLORS.blue} />
              <HelpChip label="Bequest target" help={HELP.bequest_target} accent={COLORS.green} />
            </>
          ) : (
            <>
              <HelpChip label="Finish above reserve" help={HELP.finish_above_reserve} accent={COLORS.blue} />
              <HelpChip label="Pool draw" help={HELP.pool_draw} accent={COLORS.amber} />
              <HelpChip label="Pool floor" help={HELP.reserve_floor} accent={COLORS.amber} />
            </>
          )}
        </div>
      </HelpDrawer>

      <ModeIdentityBanner
        testId="retirement-mode-identity"
        accent={modeIdentity.accent}
        title={modeIdentity.title}
        summary={modeIdentity.summary}
        primaryLabel={modeIdentity.primaryLabel}
        primaryValue={modeIdentity.primaryValue}
        secondaryLabel={modeIdentity.secondaryLabel}
        secondaryValue={modeIdentity.secondaryValue}
        bullets={modeIdentity.bullets}
      />

      {isPwaMode && pwaIntroReady && showPwaIntro && (
        <div data-testid="retirement-adaptive-pwa-intro" style={{
          marginBottom: 12,
          padding: '12px 14px',
          background: COLORS.bgDeep,
          border: `1px solid ${COLORS.blue}55`,
          borderRadius: 10,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, color: COLORS.blue, fontWeight: 700, marginBottom: 4 }}>
                <span>{HELP.adaptive_pwa_intro.title}</span>
                <HelpTip help={HELP.adaptive_pwa_intro} accent={COLORS.blue} />
              </div>
              <div style={{ fontSize: 11, color: retirementTextBody, lineHeight: 1.5 }}>
                {HELP.adaptive_pwa_intro.body[0]}
              </div>
              <div style={{ fontSize: 11, color: retirementTextBody, lineHeight: 1.5, marginTop: 4 }}>
                {HELP.adaptive_pwa_intro.body[1]}
              </div>
            </div>
            <button
              type="button"
              onClick={dismissPwaIntro}
              data-testid="retirement-adaptive-pwa-intro-dismiss"
              aria-label="Dismiss Adaptive PWA introduction"
              style={{
                background: COLORS.bgCard,
                color: retirementTextStrong,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 999,
                padding: '6px 10px',
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Income phase summary (extracted to RetirementSummaryCards.jsx) */}
      <RetirementSummaryCards
        isPwaMode={isPwaMode}
        totalPool={totalPool} endSavings={endSavings} end401kAfterTax={end401kAfterTax} homeSaleNet={homeSaleNet}
        pwaReferenceSimulation={pwaReferenceSimulation}
        pwaCurrentView={pwaCurrentView} pwaStartContext={pwaStartContext} pwaCurrentSelection={pwaCurrentSelection}
        pwaConfidencePct={pwaConfidencePct}
        bequestTarget={bequestTarget}
        trustMonthly={trustMonthly} pensionMonthly={pensionMonthly} imputedRentMonthly={imputedRentMonthly} keepHouse={keepHouse}
        chadPassesAge={chadPassesAge}
        bandResult={bandResult} deterministicPools={deterministicPools}
        inhDuringCouple={inhDuringCouple} inheritanceChadAge={inheritanceChadAge}
        coupleSummary={coupleSummary} postInheritanceSummary={postInheritanceSummary} survivorSummary={survivorSummary}
      />

      <RetirementCompositionChart
        yearlyData={yearlyData}
        chadPassesAge={chadPassesAge}
        inheritanceChadAge={inheritanceChadAge}
        inhDuringCouple={inhDuringCouple}
        hasInheritance={hasInheritance}
      />

      {isPwaMode && (
        <>
          <PwaDistributionChart
            samples={pwaCurrentDistribution.samples}
            selectedWithdrawal={pwaCurrentSelection.selectedWithdrawal}
            basePercentile={pwaCurrentSelection.selectedPercentile}
            lowerTolerancePercentile={normalizedPwaToleranceLow}
            upperTolerancePercentile={normalizedPwaToleranceHigh}
            bequestTarget={bequestTarget}
            testIdPrefix="retirement-pwa-distribution"
          />

          {/* Extracted to RetirementDecisionPreview.jsx */}
          <RetirementDecisionPreview
            testId="retirement-decision-preview"
            pwaReferenceSimulation={pwaReferenceSimulation}
            pwaReferenceBequestMet={pwaReferenceBequestMet}
            bequestTarget={bequestTarget}
            ageDiff={ageDiff}
          />
        </>
      )}

      {!isPwaMode && (
      <>
      {/* Chart */}
      <div data-testid="retirement-main-chart-hover-surface" style={{ position: 'relative' }} onMouseLeave={() => setTooltip(null)}>
      <svg data-testid="retirement-main-chart" viewBox={`0 0 ${svgW} ${svgH}`} style={{ width: '100%', height: 'auto', display: 'block' }}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const mouseX = (e.clientX - rect.left) / rect.width * svgW;
          let closestIdx = 0;
          let closestDist = Infinity;
          for (let i = 0; i < yearlyData.length; i++) {
            const dist = Math.abs(xScale(i) - mouseX);
            if (dist < closestDist) { closestDist = dist; closestIdx = i; }
          }
          // Functional bail-out (remediation 6.4): unchanged nearest point →
          // return the SAME state object so React skips the re-render.
          setTooltip(prev => {
            if (prev && prev.idx === closestIdx) return prev;
            const d = yearlyData[closestIdx];
            const pctX = (xScale(closestIdx) / svgW) * 100;
            const histBands = bandResult.bands.map(b => b.series[closestIdx]);
            const pctY = (yPool(histBands[0]) / svgH) * 100;
            return { idx: closestIdx, pctX, pctY, ...d, p10: histBands[0], p25: histBands[1], p50: histBands[2], p75: histBands[3], p90: histBands[4] };
          });
        }}>
        {/* Y-axis grid + labels (shared component, sqrt scale via yPool) */}
        <ChartYAxis ticks={yTicks} yOf={yPool} svgW={svgW} padL={padL} padR={padR} formatter={fmtPool} />

        {/* Survivor phase background */}
        {survivorStartIdx >= 0 && (
          <rect x={xScale(survivorStartIdx)} y={padT} width={xScale(years) - xScale(survivorStartIdx)} height={plotH}
            fill={COLORS.amber} opacity="0.04" />
        )}

        {/* Historical percentile bands */}
        {bandPairs.map((bp, bi) => {
          const topPts = bp.hi.series.map((v, i) => `${xScale(i)},${yPool(v)}`);
          const botPts = bp.lo.series.map((v, i) => `${xScale(i)},${yPool(v)}`).reverse();
          const bandPath = `M ${topPts.join(' L ')} L ${botPts.join(' L ')} Z`;
          return <path key={bi} d={bandPath} fill={bp.color} opacity={bp.opacity} />;
        })}

        {/* Expected case line (average return — secondary, dashed) */}
        <path d={poolLine} fill="none" stroke={COLORS.blue} strokeWidth="1.5"
          strokeDasharray="6,4" opacity="0.7" strokeLinejoin="round" strokeLinecap="round" />

        {/* SWR plan line (10th percentile — worst surviving case, primary) */}
        {(() => {
          const swrPts = bandResult.bands[0].series.map((v, i) => `${xScale(i)},${yPool(v)}`);
          return <path d={`M ${swrPts.join(' L ')}`} fill="none" stroke={COLORS.orange} strokeWidth="2.5"
            strokeLinejoin="round" strokeLinecap="round" />;
        })()}

        {/* Pool floor line */}
        {poolFloor > 0 && (
          <line x1={padL} x2={svgW - padR} y1={yPool(poolFloor)} y2={yPool(poolFloor)}
            stroke={COLORS.amber} strokeWidth="1" strokeDasharray="6,3" opacity="0.6" />
        )}

        {/* Chad passes marker */}
        {survivorStartIdx >= 0 && (
          <g>
            <line x1={xScale(survivorStartIdx)} x2={xScale(survivorStartIdx)}
              y1={padT} y2={padT + plotH}
              stroke={COLORS.amber} strokeWidth="1.5" strokeDasharray="4,3" />
            <text x={xScale(survivorStartIdx)} y={padT - 4} textAnchor="middle"
              fill={COLORS.amber} fontSize="10" fontWeight="700" fontFamily="'JetBrains Mono', monospace">
              Chad {chadPassesAge} / Sarah {chadPassesAge - ageDiff}
            </text>
          </g>
        )}

        {/* Inheritance marker */}
        {hasInheritance && inheritanceYear >= 0 && inheritanceYear <= years && (
          <g>
            <line x1={xScale(inheritanceYear)} x2={xScale(inheritanceYear)}
              y1={padT} y2={padT + plotH}
              stroke={COLORS.green} strokeWidth="1.5" strokeDasharray="4,3" />
            <text x={xScale(inheritanceYear)} y={padT + plotH + 12} textAnchor="middle"
              fill={COLORS.green} fontSize="10" fontWeight="700" fontFamily="'JetBrains Mono', monospace">
              +{fmtPool(inheritanceAmount)} inheritance
            </text>
          </g>
        )}

        {/* Start label */}
        <text x={padL + 4} y={yPool(totalPool) - 6}
          fill={COLORS.blue} fontSize="11" fontWeight="600" fontFamily="'JetBrains Mono', monospace">
          {fmtPool(totalPool)}
        </text>

        {/* 10th percentile end label — shows where worst surviving cohort ends */}
        {(() => {
          const p10End = bandResult.bands[0].series[bandResult.bands[0].series.length - 1];
          const endX = xScale(years);
          const endY = yPool(p10End);
          return (
            <g>
              <circle cx={endX} cy={endY} r="3" fill={COLORS.orange} opacity="0.8" />
              <text x={endX - 4} y={endY - 8} textAnchor="end"
                fill={COLORS.orange} fontSize="10" fontWeight="600" opacity="0.95"
                fontFamily="'JetBrains Mono', monospace">
                Plan: {fmtPool(p10End)}
              </text>
            </g>
          );
        })()}

        {/* Hover dot */}
        {tooltip && (
          <circle cx={xScale(tooltip.age - 67)} cy={yPool(tooltip.p10)} r="5"
            fill={COLORS.orange} stroke={COLORS.textPrimary} strokeWidth="2" />
        )}

        {/* X-axis labels — manual two-row Chad/Sarah age ladder (the shared
            single-row ChartXAxis can't express this), aligned to the shared
            convention: 10px JetBrains Mono, COLORS.textDim primary row. */}
        {yearlyData.filter((_, i) => i % 5 === 0).map((d, i) => (
          <g key={i}>
            <text x={xScale(d.age - 67)} y={svgH - 18} textAnchor="middle"
              fill={COLORS.textDim} fontSize="10" fontFamily="'JetBrains Mono', monospace">
              C:{d.age}
            </text>
            <text x={xScale(d.age - 67)} y={svgH - 6} textAnchor="middle"
              fill={COLORS.amber} fontSize="10" fontFamily="'JetBrains Mono', monospace" opacity="0.7">
              S:{d.sarahAge}
            </text>
          </g>
        ))}
      </svg>

      {/* Hover tooltip */}
      {tooltip && (
          <div style={{
          position: 'absolute',
          left: `${tooltip.pctX}%`,
          top: `${Math.min(tooltip.pctY, 55)}%`,
          transform: 'translate(-50%, -120%)',
          background: COLORS.bgDeep,
          border: `1px solid ${COLORS.borderLight}`,
          borderRadius: 6,
          padding: '8px 12px',
          pointerEvents: 'none',
          zIndex: 10,
          whiteSpace: 'nowrap',
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
        }}>
          <div style={{ fontSize: 12, color: retirementTextBody, marginBottom: 4 }}>
            Chad {tooltip.age} / Sarah {tooltip.sarahAge} {tooltip.phase === 'survivor' ? '(survivor)' : tooltip.phase === 'postInheritance' ? '(post-inheritance)' : ''}
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.orange, fontFamily: "'JetBrains Mono', monospace" }}>
            Plan pool: {fmtFull(tooltip.p10)}
          </div>
          <div style={{ fontSize: 11, color: COLORS.blue, fontFamily: "'JetBrains Mono', monospace" }}>
            Average path pool: {fmtFull(tooltip.pool)}
          </div>
          <div style={{ borderTop: `1px solid ${COLORS.border}`, marginTop: 4, paddingTop: 4 }}>
            {tooltip.p10 <= poolFloor ? (
              <>
                <div style={{ fontSize: 11, color: COLORS.orange, fontWeight: 600 }}>
                  Plan income after reserve hit: {fmtFull(tooltip.guaranteedIncome)}/mo
                </div>
                <div style={{ fontSize: 11, color: COLORS.blue }}>
                  Average path income: {fmtFull(tooltip.monthly)}/mo
                </div>
              </>
            ) : (
              <div style={{ fontSize: 11, color: retirementTextStrong, fontWeight: 600 }}>
                Spending target: {fmtFull(tooltip.monthly)}/mo
              </div>
            )}
            <div style={{ fontSize: 11, color: retirementTextBody, lineHeight: 1.4, fontFamily: "'JetBrains Mono', monospace" }}>
              Pool draw {fmtFull(tooltip.poolDraw)} + SS {fmtFull(tooltip.ssIncome)} + trust {fmtFull(trustMonthly)}{pensionMonthly > 0 ? ` + pension ${fmtFull(tooltip.pensionIncome || 0)}` : ''}{imputedRentMonthly > 0 ? ` + rent saved ${fmtFull(imputedRentMonthly)}` : ''}
            </div>
            {tooltip.savedToPool > 0 && (
              <div style={{ fontSize: 11, color: retirementTextBody, lineHeight: 1.4, fontFamily: "'JetBrains Mono', monospace" }}>
                Outside income reinvested: {fmtFull(tooltip.savedToPool)}/mo
              </div>
            )}
          </div>
        </div>
      )}
      </div>

      {/* Legend */}
      <div style={{ marginTop: 8, display: 'flex', gap: 14, fontSize: 12, flexWrap: 'wrap' }}>
        {[
          { label: '10th pct pool path', color: COLORS.orange, solid: true },
          { label: 'Average-return path', color: COLORS.blue, dashed: true },
          { label: '25-75th pct band', color: COLORS.blue, band: true, opacity: 0.12 },
          { label: '10-90th pct band', color: COLORS.blue, band: true, opacity: 0.08 },
          { label: 'Survivor phase', color: COLORS.amber, solid: true },
        ].map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            {item.band ? (
              <div style={{ width: 12, height: 12, borderRadius: 2, background: item.color, opacity: item.opacity }} />
            ) : item.dashed ? (
              <div style={{ width: 16, height: 0, borderTop: `2px dashed ${item.color}`, opacity: 0.5 }} />
            ) : (
              <div style={{ width: 12, height: 3, background: item.color, borderRadius: 1 }} />
            )}
            <span style={{ color: retirementTextBody }}>{item.label}</span>
          </div>
        ))}
      </div>

      {/* Optimal rate (closed-form ERN, 90% survival) */}
      <div style={{
        marginTop: 12, padding: '10px 14px', background: COLORS.bgDeep, borderRadius: 8,
        border: `1px solid ${COLORS.border}`,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11, color: retirementTextMuted, marginBottom: 2, fontWeight: 600 }}>
              <LabelWithHelp label="Optimal pool draw (90% finish above reserve)" help={HELP.finish_above_reserve} accent={COLORS.green} />
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.green, fontFamily: "'JetBrains Mono', monospace" }}>
              {optRate}% = {fmtFull(optMonthly)}/mo from pool
            </div>
            <div style={{ fontSize: 9, color: retirementTextBody, marginTop: 2, lineHeight: 1.35, fontFamily: "'JetBrains Mono', monospace" }}>
              Total consumption: {fmtFull(Math.round(optimalRates.optimalConsumption))}/mo with SS + trust
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: retirementTextMuted, marginBottom: 2, fontWeight: 600 }}>Sarah's target after Chad ({chadPassesAge})</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.amber, fontFamily: "'JetBrains Mono', monospace" }}>
              {fmtFull(survivorSummary.totalTarget)}/mo
            </div>
            <div style={{ fontSize: 10, color: retirementTextBody, marginTop: 2, lineHeight: 1.35, fontFamily: "'JetBrains Mono', monospace" }}>
              Pool draw {formatRange(survivorSummary.start.poolDraw, survivorSummary.end.poolDraw, '/mo')} + SS {formatRange(survivorSummary.start.ssIncome, survivorSummary.end.ssIncome, '/mo')} + {fmtFull(trustMonthly)}/mo trust{pensionMonthly > 0 ? ` + ${fmtFull(pensionMonthly)}/mo pension` : ''}{imputedRentMonthly > 0 ? ` + ${fmtFull(imputedRentMonthly)}/mo rent saved` : ''}
            </div>
          </div>
        </div>
        {/* Rate vs history comparison */}
        <div style={{ fontSize: 11, color: retirementTextMuted, marginTop: 6, fontStyle: 'italic', lineHeight: 1.4 }}>
          Your {withdrawalRate}% pool draw finished above the reserve in {Math.round(endAboveReserveRate * 100)}% of historical cohorts
        </div>
      </div>
      </>
      )}

      {/* Sliders */}
      {isPwaMode ? (
        <div style={{ marginTop: 12, display: 'grid', gap: 14 }}>
          <ControlSection
            testId="retirement-primary-decisions"
            title="Primary decisions"
            subtitle="Set the mix, target framework, and bequest goal first."
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              <Slider label="Equity allocation" value={equityAllocation} onChange={setEquityAllocation}
                testId="retirement-equity-allocation"
                commitStrategy={commitStrategy}
                min={0} max={100} step={5} format={(v) => `${v}/${100 - v}`} color={COLORS.blue} />
              <Slider label={<LabelWithHelp label="Bequest target" help={HELP.bequest_target} accent={COLORS.green} />} value={bequestTarget} onChange={setBequestTarget}
                testId="retirement-bequest-target"
                ariaLabel="Bequest target"
                commitStrategy={commitStrategy}
                min={0} max={Math.max(totalPool, 1000000)} step={25000} color={COLORS.green} />

              <div data-testid="retirement-pwa-strategy-container" style={{ padding: '4px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: retirementTextBody, fontWeight: 600 }}>
                    <span>PWA strategy</span>
                    <HelpTip help={HELP.pwa_strategy} accent={COLORS.blue} />
                  </span>
                  <span style={{ fontSize: 12, color: COLORS.blue, fontWeight: 700 }}>
                    {getPwaStrategyLabel(pwaStrategy)}
                  </span>
                </div>
                <select
                  value={pwaStrategy}
                  onChange={(e) => setPwaStrategy(e.target.value)}
                  data-testid="retirement-pwa-strategy"
                  aria-label="PWA strategy"
                  style={{ width: '100%', background: COLORS.bgDeep, color: retirementTextStrong, border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: '8px 10px', fontSize: 13 }}
                >
                  {PWA_STRATEGY_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>

              {pwaStrategy !== 'sticky_median' && (
                <Slider label={<LabelWithHelp label="Target percentile" help={HELP.pwa_target_percentile} accent={COLORS.green} />} value={pwaPercentile} onChange={setPwaPercentile}
                  testId="retirement-pwa-target-percentile"
                  ariaLabel="Target percentile"
                  commitStrategy={commitStrategy}
                  min={5} max={95} step={5} format={(v) => `${v}th`} color={COLORS.green} />
              )}
            </div>
          </ControlSection>

          <ControlSection
            testId="retirement-advanced-assumptions"
            title="Advanced assumptions"
            subtitle="Refine life-event timing and stickiness after the target framework is set."
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              <Slider label="Chad passes at" value={chadPassesAge} onChange={setChadPassesAge}
                testId="retirement-chad-passes-age"
                commitStrategy={commitStrategy}
                min={67} max={95} step={1} format={(v) => v + ''} color={COLORS.amber} />
              {/* Item 7 (2026-06-10 batch 2): keep-the-house lever (shared state) */}
              <div>
                <Toggle label="Keep the house (don't sell at retirement)" checked={keepHouse} onChange={setKeepHouse}
                  color={COLORS.teal} testId="retirement-keep-house-pwa" />
                {keepHouse && (
                  <Slider label="Imputed rent saved" value={imputedRentSaved} onChange={setImputedRentSaved}
                    testId="retirement-imputed-rent-pwa"
                    commitStrategy={commitStrategy}
                    min={0} max={10000} step={100} color={COLORS.teal}
                    format={(v) => v === 0 ? 'None' : fmtFull(v) + '/mo'} />
                )}
              </div>
              {/* Item 8 (2026-06-10 batch 2): survivor-phase tax drag */}
              <div>
                <Slider label="Survivor tax drag (single-filer step-up)" value={survivorTaxDragPct} onChange={setSurvivorTaxDrag}
                  testId="retirement-survivor-tax-drag-pwa"
                  commitStrategy={commitStrategy}
                  min={0} max={30} step={0.5} color={COLORS.amber}
                  format={(v) => v + '%'} />
                <div style={{ fontSize: 10, color: COLORS.textDim, marginTop: 2, lineHeight: 1.4 }}>
                  After Chad passes, Sarah files single - the same real income lands in higher brackets. Each net dollar of survivor spending drawn from the pool costs 1/(1-drag) gross.
                </div>
              </div>
              {(pwaStrategy === 'sticky_median' || pwaStrategy === 'sticky_quartile_nudge') && (
                <>
                  <Slider label={<LabelWithHelp label="Tolerance low" help={HELP.pwa_tolerance_band} accent={COLORS.blue} />} value={pwaToleranceLow} onChange={setPwaToleranceLow}
                    testId="retirement-pwa-tolerance-low"
                    ariaLabel="Tolerance low"
                    commitStrategy={commitStrategy}
                    min={5} max={95} step={5} format={(v) => `${v}th`} color={COLORS.blue} />
                  <Slider label={<LabelWithHelp label="Tolerance high" help={HELP.pwa_tolerance_band} accent={COLORS.blue} />} value={pwaToleranceHigh} onChange={setPwaToleranceHigh}
                    testId="retirement-pwa-tolerance-high"
                    ariaLabel="Tolerance high"
                    commitStrategy={commitStrategy}
                    min={5} max={95} step={5} format={(v) => `${v}th`} color={COLORS.blue} />
                </>
              )}
            </div>
          </ControlSection>
        </div>
      ) : (
        <div style={{ marginTop: 12, display: 'grid', gap: 14 }}>
          <ControlSection
            testId="retirement-primary-decisions"
            title="Primary decisions"
            subtitle="Set the fixed draw, portfolio mix, and survivor timing before tuning reserve slack."
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              <Slider label="Equity allocation" value={equityAllocation} onChange={setEquityAllocation}
                testId="retirement-equity-allocation"
                commitStrategy={commitStrategy}
                min={0} max={100} step={5} format={(v) => `${v}/${100 - v}`} color={COLORS.blue} />

              {/* Withdrawal rate with optimal marker */}
              <div style={{ padding: "4px 0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: retirementTextBody, fontWeight: 600 }}>
                    <span>Pool draw rate</span>
                    <HelpTip help={HELP.pool_draw_rate} accent={COLORS.amber} />
                  </span>
                  <span style={{ fontSize: 13, color: withdrawalRate > optRate ? COLORS.red : COLORS.green, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>
                    {withdrawalRate}%
                    {withdrawalRate > optRate && <span style={{ fontSize: 11, color: COLORS.red }}> (above optimal)</span>}
                  </span>
                </div>
                <div style={{ position: 'relative' }}>
                  <Slider label=""
                    hideHeader
                    value={withdrawalRate}
                    onChange={setWithdrawalRate}
                    testId="retirement-pool-draw-rate"
                    ariaLabel="Pool draw rate"
                    commitStrategy={commitStrategy}
                    min={0}
                    max={optimalRates.sliderMax}
                    step={0.1}
                    color={withdrawalRate > optRate ? COLORS.red : COLORS.green}
                  />
                  {(() => {
                    const thumbHalf = 8;
                    const optPct = Math.min(optRate, optimalRates.sliderMax) / optimalRates.sliderMax;
                    return (
                      <div style={{ position: 'relative', height: 22, marginTop: 2 }}>
                        {optRate > 0 && (
                          <div style={{
                            position: 'absolute',
                            left: `calc(${optPct * 100}% + ${(0.5 - optPct) * thumbHalf * 2}px)`,
                            top: 0,
                            transform: 'translateX(-50%)',
                            display: 'flex', flexDirection: 'column', alignItems: 'center',
                            pointerEvents: 'none',
                          }}>
                            <div style={{ width: 2, height: 6, background: COLORS.green, borderRadius: 1 }} />
                            <div style={{ fontSize: 9, color: COLORS.green, fontWeight: 700, whiteSpace: 'nowrap' }}>
                              {optRate}% optimal
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>

              <Slider label="Chad passes at" value={chadPassesAge} onChange={setChadPassesAge}
                testId="retirement-chad-passes-age"
                commitStrategy={commitStrategy}
                min={67} max={95} step={1} format={(v) => v + ''} color={COLORS.amber} />
            </div>
          </ControlSection>

          <ControlSection
            testId="retirement-advanced-assumptions"
            title="Advanced assumptions"
            subtitle="Reserve and inheritance settings decide how much path slack you want in the hardest historical starts."
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              <Slider label={<LabelWithHelp label="Pool floor (reserve)" help={HELP.reserve_floor} accent={COLORS.amber} />} value={poolFloor} onChange={setPoolFloor}
                testId="retirement-pool-floor"
                ariaLabel="Pool floor reserve"
                commitStrategy={commitStrategy}
                min={0} max={Math.min(totalPool, 500000)} step={25000} color={COLORS.amber} />
              <Slider label="Inheritance amount" value={inheritanceAmount} onChange={setInheritanceAmount}
                testId="retirement-inheritance-amount"
                commitStrategy={commitStrategy}
                min={0} max={2000000} step={50000} color={COLORS.green} />
              <Slider label="Sarah's age at inheritance" value={inheritanceSarahAge} onChange={setInheritanceSarahAge}
                testId="retirement-inheritance-sarah-age"
                commitStrategy={commitStrategy}
                min={55} max={80} step={1} format={(v) => v + ''} color={COLORS.green} />
              {/* Item 7 (2026-06-10 batch 2): keep-the-house lever */}
              <div>
                <Toggle label="Keep the house (don't sell at retirement)" checked={keepHouse} onChange={setKeepHouse}
                  color={COLORS.teal} testId="retirement-keep-house" />
                {keepHouse && (
                  <Slider label="Imputed rent saved" value={imputedRentSaved} onChange={setImputedRentSaved}
                    testId="retirement-imputed-rent"
                    commitStrategy={commitStrategy}
                    min={0} max={10000} step={100} color={COLORS.teal}
                    format={(v) => v === 0 ? 'None' : fmtFull(v) + '/mo'} />
                )}
              </div>
              {/* Item 8 (2026-06-10 batch 2): survivor-phase tax drag */}
              <div>
                <Slider label="Survivor tax drag (single-filer step-up)" value={survivorTaxDragPct} onChange={setSurvivorTaxDrag}
                  testId="retirement-survivor-tax-drag"
                  commitStrategy={commitStrategy}
                  min={0} max={30} step={0.5} color={COLORS.amber}
                  format={(v) => v + '%'} />
                <div style={{ fontSize: 10, color: COLORS.textDim, marginTop: 2, lineHeight: 1.4 }}>
                  After Chad passes, Sarah files single - the same real income lands in higher brackets. Each net dollar of survivor spending drawn from the pool costs 1/(1-drag) gross.
                </div>
              </div>
            </div>
          </ControlSection>
        </div>
      )}

      {/* B2 (2026-06-10 retirement review): an inheritance dated BEFORE the
          retirement seam (Sarah {inheritanceSarahAge} ⇒ Chad < 67) is excluded
          from every flow — the sliders would otherwise silently do nothing.
          Since ageDiff became state-derived (2, not the old hardcoded 14), the
          default Sarah-60 setting lands pre-retirement, so this warning is
          load-bearing for the default configuration. */}
      {hasInheritance && inheritanceYear < 0 && (
        <div data-testid="retirement-inheritance-before-seam" style={{
          marginTop: 8, padding: '8px 12px', background: COLORS.bgCard, borderRadius: 6,
          border: `1px solid ${COLORS.amber}55`, fontSize: 12, color: COLORS.amber, lineHeight: 1.5,
        }}>
          {fmtPool(inheritanceAmount)} inheritance lands before retirement (Sarah {inheritanceSarahAge} = Chad {inheritanceChadAge}, before the age-67 seam) — <span style={{ fontWeight: 700 }}>not modeled</span>. This chart starts at retirement; move Sarah&apos;s inheritance age to {67 - ageDiff}+ to include it here.
        </div>
      )}

      {/* Inheritance pre-withdrawal callout */}
      {!isPwaMode && hasInheritance && (optPreRate - optRate >= 0.5) && (
        <div style={{
          marginTop: 8, padding: '10px 14px', background: COLORS.bgDeep, borderRadius: 8,
          border: `1px solid ${COLORS.green}33`,
        }}>
          <div style={{ fontSize: 11, color: COLORS.green, marginBottom: 4, fontWeight: 700 }}>
            Pre-Inheritance Pool Draw (before {fmtPool(inheritanceAmount)} at Sarah {inheritanceSarahAge})
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 11, color: retirementTextMuted, marginBottom: 2, fontWeight: 600 }}>
                Max pre-inheritance pool draw (90% finish above reserve)
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.green, fontFamily: "'JetBrains Mono', monospace" }}>
                {optPreRate}% = {fmtFull(optPreMonthly)}/mo
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: retirementTextMuted, marginBottom: 2, fontWeight: 600 }}>
                vs uniform rate
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: optPreRate > optRate ? COLORS.green : COLORS.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>
                {optPreRate >= optRate ? '+' : ''}{(optPreRate - optRate).toFixed(1)}% ({fmtFull(Math.abs(optPreMonthly - optMonthly))}/mo {optPreRate >= optRate ? 'more' : 'less'})
              </div>
            </div>
          </div>
          <div style={{ fontSize: 11, color: retirementTextMuted, marginTop: 4, fontStyle: 'italic', lineHeight: 1.45 }}>
            Draw {fmtFull(optPreMonthly)}/mo from the pool before inheritance, then {optRate}% after. Compared with {fmtFull(optMonthly)}/mo from the pool throughout.
          </div>
        </div>
      )}

      {/* Over-withdrawal warning */}
      {!isPwaMode && withdrawalRate > optRate && !hasInheritance && (
        <div style={{
          marginTop: 8, padding: '8px 12px', background: COLORS.bgCard, borderRadius: 6,
          border: `1px solid ${COLORS.red}33`, fontSize: 12, color: COLORS.red, lineHeight: 1.5,
        }}>
          At {withdrawalRate}% pool draw, fewer than 90% of historical cohorts finish above the reserve by Sarah age {sarahTargetAge}.
          The 90%-finish-above-reserve cap is <span style={{ fontWeight: 700, color: COLORS.green }}>{optRate}%</span> ({fmtFull(optMonthly)}/mo from the pool).
        </div>
      )}
    </div>
  );
}

export default memo(RetirementIncomeChart);
