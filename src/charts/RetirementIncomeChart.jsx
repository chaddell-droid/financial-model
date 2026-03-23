import React, { useState, useMemo, useEffect } from 'react';
import { fmtFull } from '../model/formatters.js';
import Slider from '../components/Slider.jsx';
import HelpDrawer from '../components/help/HelpDrawer.jsx';
import HelpTip from '../components/help/HelpTip.jsx';
import ActionButton from '../components/ui/ActionButton.jsx';
import SurfaceCard from '../components/ui/SurfaceCard.jsx';
import PwaDistributionChart from './PwaDistributionChart.jsx';
import { HELP } from '../content/help/registry.js';
import { getBlendedReturns, getNumCohorts, getCohortLabel } from '../model/historicalReturns.js';
import { simulatePath, computeSWR } from '../model/ernWithdrawal.js';
import {
  buildRetirementContext,
  buildScalingAndRescueFlows,
  buildSupplementalFlows,
  deriveCurrentWithdrawalView,
  getRetirementIncomePlan,
  getRetirementPhaseSummary,
  sliceRetirementContext,
} from '../model/retirementIncome.js';
import { buildPwaDistribution } from '../model/pwaDistribution.js';
import { selectPwaWithdrawal, simulateAdaptivePwaStrategy } from '../model/pwaStrategies.js';

const PWA_STRATEGY_OPTIONS = [
  { value: 'fixed_percentile', label: 'Fixed Percentile' },
  { value: 'sticky_median', label: 'Sticky Median' },
  { value: 'sticky_quartile_nudge', label: 'Sticky Quartile Nudge' },
];

function getPwaStrategyLabel(strategy) {
  return PWA_STRATEGY_OPTIONS.find(option => option.value === strategy)?.label || 'Adaptive PWA';
}

function formatCohortLabel({ year, month }) {
  if (!year || !month) return 'n/a';
  return `${year}-${String(month).padStart(2, '0')}`;
}

function LabelWithHelp({ label, help, accent = '#60a5fa', align = 'left' }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <span>{label}</span>
      <HelpTip help={help} accent={accent} align={align} />
    </span>
  );
}

function HelpChip({ label, help, accent = '#60a5fa' }) {
  return (
    <div
      style={{
        background: '#02061766',
        border: `1px solid ${accent}33`,
        borderRadius: 8,
        padding: '8px 10px',
      }}
    >
      <div style={{ fontSize: 11, color: '#e2e8f0', fontWeight: 600, lineHeight: 1.35 }}>
        <LabelWithHelp label={label} help={help} accent={accent} />
      </div>
      <div style={{ fontSize: 10, color: '#94a3b8', lineHeight: 1.45, marginTop: 4 }}>
        {help.short}
      </div>
    </div>
  );
}

function ModeIdentityBanner({
  testId,
  accent,
  title,
  summary,
  primaryLabel,
  primaryValue,
  secondaryLabel,
  secondaryValue,
  bullets,
}) {
  return (
    <SurfaceCard
      data-testid={testId}
      tone="featured"
      padding="sm"
      style={{
        background: '#0f172a',
        borderColor: `${accent}55`,
        marginBottom: 16,
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(240px, 1fr)', gap: 12, alignItems: 'start' }}>
        <div>
          <div style={{ fontSize: 11, color: accent, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>
            Mode identity
          </div>
          <div style={{ fontSize: 16, color: '#e2e8f0', fontWeight: 700, marginBottom: 4 }}>
            {title}
          </div>
          <div style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.5 }}>
            {summary}
          </div>
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ background: '#02061766', border: '1px solid #1e293b', borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 4, fontWeight: 700 }}>
              {primaryLabel}
            </div>
            <div style={{ fontSize: 15, color: accent, fontWeight: 700, lineHeight: 1.35 }}>
              {primaryValue}
            </div>
          </div>
          <div style={{ background: '#02061766', border: '1px solid #1e293b', borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 4, fontWeight: 700 }}>
              {secondaryLabel}
            </div>
            <div style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 600, lineHeight: 1.45 }}>
              {secondaryValue}
            </div>
          </div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8, marginTop: 12 }}>
        {bullets.map((bullet) => (
          <div key={bullet} style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.45 }}>
            {bullet}
          </div>
        ))}
      </div>
    </SurfaceCard>
  );
}

function ControlSection({ title, subtitle, children, testId }) {
  return (
    <div data-testid={testId}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline', marginBottom: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 700 }}>
          {title}
        </div>
        {subtitle ? (
          <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.4 }}>
            {subtitle}
          </div>
        ) : null}
      </div>
      {children}
    </div>
  );
}

export default function RetirementIncomeChart({
  savingsData, wealthData,
  ssType, ssPersonal,
  chadJob,
  trustIncomeFuture,
}) {
  const [retirementMode, setRetirementMode] = useState('historical_safe');
  const [pwaStrategy, setPwaStrategy] = useState('sticky_median');
  const [pwaPercentile, setPwaPercentile] = useState(50);
  const [pwaToleranceLow, setPwaToleranceLow] = useState(25);
  const [pwaToleranceHigh, setPwaToleranceHigh] = useState(75);
  const [bequestTarget, setBequestTarget] = useState(0);
  const [equityAllocation, setEquityAllocation] = useState(60);
  const [withdrawalRate, setWithdrawalRate] = useState(4);
  const [poolFloor, setPoolFloor] = useState(0);
  const [chadPassesAge, setChadPassesAge] = useState(82);
  const [inheritanceAmount, setInheritanceAmount] = useState(1000000);
  const [inheritanceSarahAge, setInheritanceSarahAge] = useState(60);
  const [maxDepletionMonths, setMaxDepletionMonths] = useState(24);
  const [tooltip, setTooltip] = useState(null);
  const [showPwaIntro, setShowPwaIntro] = useState(false);
  const [pwaIntroReady, setPwaIntroReady] = useState(false);
  const isPwaMode = retirementMode === 'adaptive_pwa';

  // Chad is 60, Sarah is 46 (14 years younger)
  const ageDiff = 14;
  const sarahTargetAge = 90;
  const endAge = sarahTargetAge + ageDiff; // 104
  const years = endAge - 67; // 37
  const horizonMonths = years * 12; // 444
  const survivorSpendRatio = 0.6;

  // Assets at month 72 (approximately age 67)
  const endIdx = Math.min(72, savingsData.length - 1);
  const endSavings = savingsData[endIdx]?.balance || 0;
  const end401k = wealthData[endIdx]?.balance401k || 0;
  const endHome = wealthData[endIdx]?.homeEquity || 0;
  const homeSaleNet = Math.round(endHome * 0.94);
  const totalPool = Math.max(0, endSavings + end401k + homeSaleNet);

  const monthlyWithdrawal = Math.round(totalPool * (withdrawalRate / 100) / 12);

  // Chad's SS
  const ssFRA = 4213;
  const chadSS = (ssType === 'ss' && !chadJob) ? (ssPersonal || 2933) : ssFRA;
  const sarahOwnSS = 1900;
  const survivorSS = 4186;
  const trustMonthly = trustIncomeFuture || 0;
  const startingCoupleIncome = chadSS + trustMonthly;
  const baseMonthlyConsumption = monthlyWithdrawal + startingCoupleIncome;
  const normalizedPwaToleranceLow = Math.min(pwaToleranceLow, pwaToleranceHigh);
  const normalizedPwaToleranceHigh = Math.max(pwaToleranceLow, pwaToleranceHigh);

  // Inheritance
  const inheritanceChadAge = inheritanceSarahAge + ageDiff;
  const inheritanceYear = inheritanceChadAge - 67;
  const inheritanceMonth = inheritanceYear * 12;
  const hasInheritance = inheritanceAmount > 0;
  const inhDuringCouple = hasInheritance && inheritanceChadAge < chadPassesAge;

  function formatRange(startValue, endValue, suffix = '') {
    if (startValue === endValue) return `${fmtFull(startValue)}${suffix}`;
    return `${fmtFull(startValue)} -> ${fmtFull(endValue)}${suffix}`;
  }

  // Blended historical returns (memoized on equity allocation)
  const blendedReturns = useMemo(
    () => getBlendedReturns(equityAllocation / 100),
    [equityAllocation]
  );

  const retirementContext = useMemo(() => {
    return buildRetirementContext({
      horizonMonths,
      chadPassesAge,
      ageDiff,
      survivorSpendRatio,
      chadSS,
      ssFRA,
      sarahOwnSS,
      survivorSS,
      trustMonthly,
    });
  }, [horizonMonths, chadPassesAge, ageDiff, survivorSpendRatio, chadSS, ssFRA, sarahOwnSS, survivorSS, trustMonthly]);

  // Build rescue flows and scaling arrays (shared by all cohorts)
  // rescueFlows: only inheritance (one-time lump sum once the pool is empty)
  // scaling: 1.0 for couple months, survivorRatio for survivor months
  const { rescueFlows, scaling } = useMemo(() => {
    return buildScalingAndRescueFlows({
      horizonMonths,
      chadPassesAge,
      survivorSpendRatio,
      hasInheritance,
      inheritanceMonth,
      inheritanceAmount,
    });
  }, [horizonMonths, chadPassesAge, survivorSpendRatio, hasInheritance, inheritanceMonth, inheritanceAmount]);

  // Supplemental flows used by the simulator while the pool is active.
  const simulationSupplementalFlows = useMemo(() => {
    return buildSupplementalFlows({
      horizonMonths,
      chadPassesAge,
      ageDiff,
      chadSS,
      ssFRA,
      sarahOwnSS,
      survivorSS,
      trustMonthly,
      hasInheritance,
      inheritanceMonth,
      inheritanceAmount,
    });
  }, [horizonMonths, chadPassesAge, ageDiff, chadSS, ssFRA, sarahOwnSS, survivorSS, trustMonthly, hasInheritance, inheritanceMonth, inheritanceAmount]);

  // Closed-form cohort math excludes inheritance. Inheritance is state-dependent in the
  // simulator: it can arrive as ordinary capital while solvent or rescue the pool once it
  // has already hit the reserve. Excluding it from the closed form is conservative and
  // avoids overstating cohort SWRs.
  const formulaSupplementalFlows = useMemo(() => {
    return buildSupplementalFlows({
      horizonMonths,
      chadPassesAge,
      ageDiff,
      chadSS,
      ssFRA,
      sarahOwnSS,
      survivorSS,
      trustMonthly,
      hasInheritance: false,
      inheritanceMonth,
      inheritanceAmount,
    });
  }, [horizonMonths, chadPassesAge, ageDiff, chadSS, ssFRA, sarahOwnSS, survivorSS, trustMonthly, inheritanceMonth, inheritanceAmount]);

  const pwaStartContext = useMemo(
    () => sliceRetirementContext(retirementContext, 0),
    [retirementContext]
  );

  const pwaCurrentDistribution = useMemo(() => {
    if (totalPool <= 0) return { sampleCount: 0, samples: [], sortedSampleValues: new Float64Array(0) };
    return buildPwaDistribution({
      blendedReturns,
      decisionMonth: 0,
      horizonMonths,
      totalPool,
      bequestTarget,
      supplementalFlows: retirementContext.supplementalFlows,
      scaling: retirementContext.scaling,
    });
  }, [blendedReturns, horizonMonths, totalPool, bequestTarget, retirementContext]);

  const pwaCurrentSelection = useMemo(() => {
    return selectPwaWithdrawal(pwaCurrentDistribution, {
      strategy: pwaStrategy,
      basePercentile: pwaPercentile,
      lowerTolerancePercentile: normalizedPwaToleranceLow,
      upperTolerancePercentile: normalizedPwaToleranceHigh,
    });
  }, [pwaCurrentDistribution, pwaStrategy, pwaPercentile, normalizedPwaToleranceLow, normalizedPwaToleranceHigh]);

  const pwaCurrentView = useMemo(() => {
    return deriveCurrentWithdrawalView(
      Math.round(pwaCurrentSelection.selectedWithdrawal || 0),
      Math.round(pwaStartContext.currentGuaranteedIncome || 0),
    );
  }, [pwaCurrentSelection, pwaStartContext]);

  const pwaReferenceSimulation = useMemo(() => {
    if (totalPool <= 0 || pwaCurrentDistribution.sampleCount <= 0) return null;

    const referenceIndex = Math.max(
      0,
      Math.min(
        pwaCurrentDistribution.samples.length - 1,
        Math.round((pwaCurrentDistribution.samples.length - 1) * (pwaCurrentSelection.selectedPercentile || 0) / 100)
      )
    );
    const referenceSample = pwaCurrentDistribution.samples[referenceIndex];
    const simulation = simulateAdaptivePwaStrategy({
      blendedReturns,
      cohortStart: referenceSample.cohortStart,
      horizonMonths,
      totalPool,
      bequestTarget,
      supplementalFlows: retirementContext.supplementalFlows,
      scaling: retirementContext.scaling,
      retirementContext,
      strategyConfig: {
        strategy: pwaStrategy,
        basePercentile: pwaPercentile,
        lowerTolerancePercentile: normalizedPwaToleranceLow,
        upperTolerancePercentile: normalizedPwaToleranceHigh,
      },
    });

    return {
      ...simulation,
      referenceSample,
      decisionPreview: simulation.yearlyDecisions.slice(0, 8),
    };
  }, [
    blendedReturns,
    horizonMonths,
    totalPool,
    bequestTarget,
    retirementContext,
    pwaCurrentDistribution,
    pwaCurrentSelection,
    pwaStrategy,
    pwaPercentile,
    normalizedPwaToleranceLow,
    normalizedPwaToleranceHigh,
  ]);

  // Closed-form SWR for each historical cohort (independent of withdrawal slider)
  const cohortSWRs = useMemo(() => {
    const numCohorts = getNumCohorts(horizonMonths);
    if (numCohorts <= 0 || totalPool <= 0) return new Float64Array(0);
    const swrs = new Float64Array(numCohorts);
    for (let c = 0; c < numCohorts; c++) {
      swrs[c] = computeSWR(blendedReturns, c, horizonMonths,
        formulaSupplementalFlows, scaling, poolFloor, totalPool);
    }
    return swrs;
  }, [blendedReturns, horizonMonths, formulaSupplementalFlows, scaling, poolFloor, totalPool]);

  // Optimal rates (independent of withdrawal slider — closed-form from cohortSWRs)
  const optimalRates = useMemo(() => {
    const empty = {
      optimalRate: 0, optimalMonthly: 0, optimalPreRate: 0, optimalPreMonthly: 0,
      safeRate: 0, safeMonthly: 0,
      numCohorts: 0, worstCohort: { year: 0 }, cohortRange: '',
      optimalConsumption: 0, sliderMax: 30,
    };
    if (totalPool <= 0) return empty;

    const numCohorts = getNumCohorts(horizonMonths);
    if (numCohorts <= 0 || cohortSWRs.length === 0) return empty;

    // Two-tier rate computation: ERN max >= safe rate.
    const initialIncome = startingCoupleIncome;
    const targetSurvival = 0.90;

    // Helper: binary search for max pool draw rate at given survival constraint
    function findMaxRate(hi, checkFn) {
      let lo = 0;
      for (let iter = 0; iter < 30; iter++) {
        const mid = (lo + hi) / 2;
        const testPoolDraw = Math.round(totalPool * (mid / 100) / 12);
        const testConsumption = testPoolDraw + initialIncome;
        let survived = 0;
        for (let c = 0; c < numCohorts; c++) {
          const sim = simulatePath(blendedReturns, c, horizonMonths, testConsumption, simulationSupplementalFlows, scaling, totalPool, poolFloor, rescueFlows);
          if (checkFn(sim)) survived++;
        }
        if (survived / numCohorts >= targetSurvival) lo = mid; else hi = mid;
      }
      return Math.round(lo * 10) / 10;
    }

    function findMaxPreInheritanceRate(postConsumption) {
      if (!hasInheritance || inheritanceMonth <= 0 || inheritanceMonth >= horizonMonths) {
        return { rate: optimalRate, monthly: optimalMonthly };
      }

      const hi = Math.max(80, optimalRate + 10);
      let lo = 0;
      let hiRate = hi;
      for (let iter = 0; iter < 30; iter++) {
        const mid = (lo + hiRate) / 2;
        const prePoolDraw = Math.round(totalPool * (mid / 100) / 12);
        const preConsumption = prePoolDraw + initialIncome;
        const scheduledConsumption = new Float64Array(horizonMonths);
        for (let t = 0; t < horizonMonths; t++) {
          scheduledConsumption[t] = t < inheritanceMonth ? preConsumption : postConsumption;
        }

        let survived = 0;
        for (let c = 0; c < numCohorts; c++) {
          const sim = simulatePath(
            blendedReturns,
            c,
            horizonMonths,
            scheduledConsumption,
            simulationSupplementalFlows,
            scaling,
            totalPool,
            poolFloor,
            rescueFlows
          );
          if (sim.finalPool >= poolFloor && sim.maxConsecutiveDepleted <= maxDepletionMonths) survived++;
        }

        if (survived / numCohorts >= targetSurvival) lo = mid; else hiRate = mid;
      }

      return {
        rate: Math.round(lo * 10) / 10,
        monthly: Math.round(totalPool * (lo / 100) / 12),
      };
    }

    // ERN max rate: the pool can reach the reserve, but not stay there too long.
    const optimalRate = findMaxRate(80, (sim) => sim.finalPool >= poolFloor && sim.maxConsecutiveDepleted <= maxDepletionMonths);
    const optimalMonthly = Math.round(totalPool * (optimalRate / 100) / 12);
    const optimalConsumption = optimalMonthly + initialIncome;

    // Safe rate: the reserve is never touched.
    const safeRate = findMaxRate(optimalRate + 1, (sim) => sim.finalPool >= poolFloor && !sim.everDepleted);
    const safeMonthly = Math.round(totalPool * (safeRate / 100) / 12);

    // Pre-inheritance optimal rate (simulation-based to match rescue semantics)
    let optimalPreRate = optimalRate, optimalPreMonthly = optimalMonthly;
    if (hasInheritance && inheritanceMonth > 0 && inheritanceMonth < horizonMonths) {
      const preInheritance = findMaxPreInheritanceRate(optimalConsumption);
      optimalPreRate = preInheritance.rate;
      optimalPreMonthly = preInheritance.monthly;
    }

    // Worst historical cohort (lowest formula SWR)
    let worstIdx = 0;
    let worstSWR = Infinity;
    for (let c = 0; c < numCohorts; c++) {
      if (cohortSWRs[c] < worstSWR) { worstSWR = cohortSWRs[c]; worstIdx = c; }
    }
    const worstLabel = getCohortLabel(worstIdx);

    const firstLabel = getCohortLabel(0);
    const lastLabel = getCohortLabel(numCohorts - 1);
    const cohortRange = `${firstLabel.year}\u2013${lastLabel.year}`;

    const sliderMax = Math.max(30, Math.ceil(optimalRate / 5) * 5 + 5);

    return {
      optimalRate, optimalMonthly, optimalPreRate, optimalPreMonthly,
      safeRate, safeMonthly,
      numCohorts, worstCohort: { year: worstLabel.year }, cohortRange,
      optimalConsumption, sliderMax,
    };
  }, [cohortSWRs, totalPool, horizonMonths, startingCoupleIncome,
    hasInheritance, inheritanceMonth, blendedReturns, simulationSupplementalFlows, scaling, poolFloor, rescueFlows, maxDepletionMonths]);

  // Sync withdrawal slider to SAFE rate (pool never depletes) — chart default
  useEffect(() => {
    if (!isPwaMode && optimalRates.safeRate > 0) {
      setWithdrawalRate(optimalRates.safeRate);
    }
  }, [isPwaMode, optimalRates.safeRate]);

  useEffect(() => {
    if (!isPwaMode) return;

    try {
      const seenIntro = window.localStorage.getItem('fs_help_seen_adaptive_pwa_intro') === '1';
      setShowPwaIntro(!seenIntro);
    } catch (error) {
      setShowPwaIntro(false);
    }
    setPwaIntroReady(true);
  }, [isPwaMode]);

  // Bands and finish-above-reserve rate at the user's slider rate
  const bandResult = useMemo(() => {
    const emptyBands = [10, 25, 50, 75, 90].map(p => ({ pct: p, series: Array(years + 1).fill(0) }));
    if (totalPool <= 0) return { finishAboveReserveRate: 0, bands: emptyBands };

    const numCohorts = getNumCohorts(horizonMonths);
    if (numCohorts <= 0) return { finishAboveReserveRate: 0, bands: emptyBands };

    const allYearlyPools = new Array(numCohorts);
    let survivedCount = 0;

    const userConsumption = baseMonthlyConsumption;

    for (let c = 0; c < numCohorts; c++) {
      const sim = simulatePath(blendedReturns, c, horizonMonths, userConsumption, simulationSupplementalFlows, scaling, totalPool, poolFloor, rescueFlows);
      allYearlyPools[c] = sim.yearlyPools;
      if (sim.finalPool >= poolFloor) survivedCount++;
    }

    const percentiles = [10, 25, 50, 75, 90];
    const temp = new Float64Array(numCohorts);
    const bandSeries = percentiles.map(() => []);

    for (let y = 0; y <= years; y++) {
      for (let c = 0; c < numCohorts; c++) temp[c] = allYearlyPools[c][y];
      temp.sort();
      for (let p = 0; p < percentiles.length; p++) {
        const idx = Math.floor(numCohorts * percentiles[p] / 100);
        bandSeries[p].push(temp[Math.min(idx, numCohorts - 1)]);
      }
    }
    const bands = percentiles.map((p, i) => ({ pct: p, series: bandSeries[i] }));

    return { finishAboveReserveRate: survivedCount / numCohorts, bands };
  }, [blendedReturns, totalPool, baseMonthlyConsumption, poolFloor, simulationSupplementalFlows, scaling, horizonMonths, years, rescueFlows]);

  // Deterministic trajectory using average historical return.
  // Uses the same begin-of-month cash-flow ordering as simulatePath().
  const { deterministicPools, avgAnnualReal } = useMemo(() => {
    let sum = 0;
    for (let i = 0; i < blendedReturns.length; i++) sum += blendedReturns[i];
    const avgMonthly = sum / blendedReturns.length;
    const avgAnnualReal = Math.round((Math.pow(1 + avgMonthly, 12) - 1) * 1000) / 10;

    let pool = totalPool;
    const pools = [];

    for (let y = 0; y <= years; y++) {
      pools.push(Math.round(pool));
      if (y >= years) break;

      for (let m = 0; m < 12; m++) {
        const t = y * 12 + m;
        if (pool > poolFloor) {
          pool = (pool - baseMonthlyConsumption * scaling[t] + simulationSupplementalFlows[t]) * (1 + avgMonthly);
          if (pool < poolFloor) pool = poolFloor;
        } else if (rescueFlows[t] > 0) {
          pool += rescueFlows[t]; // only inheritance rescues depleted pool
        }
      }
    }

    return { deterministicPools: pools, avgAnnualReal };
  }, [blendedReturns, totalPool, baseMonthlyConsumption, poolFloor, scaling, simulationSupplementalFlows, rescueFlows, years]);

  const incomePlanConfig = {
    chadPassesAge,
    ageDiff,
    baseMonthlyConsumption,
    survivorSpendRatio,
    trustMonthly,
    chadSS,
    ssFRA,
    sarahOwnSS,
    survivorSS,
  };

  // Build yearlyData for tooltip and income display
  const yearlyData = deterministicPools.map((pool, y) => {
    const chadAge = 67 + y;
    const incomePlan = getRetirementIncomePlan(chadAge, pool > poolFloor, incomePlanConfig);
    const isPostInh = hasInheritance && y >= inheritanceYear;
    const isInheritanceYear = hasInheritance && y === inheritanceYear;
    const phase = !incomePlan.chadAlive ? 'survivor' : (isPostInh ? 'postInheritance' : 'chad');
    return {
      age: chadAge,
      pool,
      phase, isInheritanceYear,
      ...incomePlan,
    };
  });

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

  const coupleSummary = getRetirementPhaseSummary(67, inhDuringCouple ? inheritanceChadAge : chadPassesAge, incomePlanConfig);
  const postInheritanceSummary = inhDuringCouple ? getRetirementPhaseSummary(inheritanceChadAge, chadPassesAge, incomePlanConfig) : null;
  const survivorSummary = getRetirementPhaseSummary(chadPassesAge, endAge + 1, incomePlanConfig);

  // Band paths for chart
  const bandPairs = [
    { lo: bandResult.bands[0], hi: bandResult.bands[4], color: '#60a5fa', opacity: 0.08 },
    { lo: bandResult.bands[1], hi: bandResult.bands[3], color: '#60a5fa', opacity: 0.12 },
  ];

  const fmtPool = (v) => v >= 1000000 ? `$${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `$${(v / 1000).toFixed(0)}K` : `$${v}`;

  // Shorthand for cohort results
  const endAboveReserveRate = bandResult.finishAboveReserveRate;
  const optRate = optimalRates.optimalRate;
  const optMonthly = optimalRates.optimalMonthly;
  const optPreRate = optimalRates.optimalPreRate;
  const optPreMonthly = optimalRates.optimalPreMonthly;
  const pwaConfidencePct = Math.round((pwaCurrentSelection.probabilityNoCut || 0) * 100);
  const pwaReferenceBequestMet = (pwaReferenceSimulation?.finalPool || 0) >= bequestTarget;
  const retirementTextStrong = '#e2e8f0';
  const retirementTextBody = '#cbd5e1';
  const retirementTextMuted = '#94a3b8';
  const sectionOverviewHelp = isPwaMode ? HELP.retirement_overview_pwa : HELP.retirement_overview_historical;
  const modeIdentity = isPwaMode
    ? {
        accent: '#60a5fa',
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
        accent: '#4ade80',
        title: 'Historical Safe',
        summary: 'Use this mode when you want a fixed starting pool draw tested across every historical retirement cohort with reserve and survivor constraints.',
        primaryLabel: 'Headline meaning',
        primaryValue: `${Math.round(endAboveReserveRate * 100)}% finish above reserve by Sarah ${sarahTargetAge}`,
        secondaryLabel: 'Safety backstop',
        secondaryValue: `${optimalRates.safeRate}% safe pool draw means the reserve is never touched in 90% of cohorts.`,
        bullets: [
          'Set the pool draw and survivor timing first. Then use reserve and inheritance assumptions to decide how much slack you want in bad historical starts.',
          'The two top-line rates answer different questions: finish above reserve versus reserve never touched. Keep them separate when comparing outcomes.',
          'Use the survivor spending cards to read how the same plan behaves before inheritance, after inheritance, and after Chad passes.',
        ],
      };

  function dismissPwaIntro() {
    setShowPwaIntro(false);
    try {
      window.localStorage.setItem('fs_help_seen_adaptive_pwa_intro', '1');
    } catch (error) {
      // Ignore storage failures; the intro will simply reappear next session.
    }
  }

  return (
    <div data-testid="retirement-income-chart" style={{
      background: '#1e293b', borderRadius: 12, padding: '20px 16px',
      border: '1px solid #334155', marginBottom: 24,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 15, color: retirementTextStrong, margin: 0, fontWeight: 600 }}>
            <span>Retirement + Survivor Income (today&apos;s dollars)</span>
            <HelpTip help={HELP.retirement_mode} accent="#60a5fa" />
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
                accent={mode.value === 'adaptive_pwa' ? '#60a5fa' : '#4ade80'}
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
                ? (pwaConfidencePct >= 70 ? '#4ade80' : pwaConfidencePct >= 50 ? '#f59e0b' : '#f87171')
                : (endAboveReserveRate >= 0.9 ? '#4ade80' : endAboveReserveRate >= 0.7 ? '#f59e0b' : '#f87171'),
              fontWeight: 600,
              textAlign: 'right',
            }}>
              {isPwaMode
                ? `${pwaConfidencePct}% won't need to cut later (${pwaCurrentDistribution.sampleCount.toLocaleString()} cohorts)`
                : `${Math.round(endAboveReserveRate * 100)}% finish above reserve by Sarah ${sarahTargetAge} (${optimalRates.numCohorts.toLocaleString()} cohorts, ${optimalRates.cohortRange})`}
            </span>
            <HelpTip
              help={isPwaMode ? HELP.probability_no_cut : HELP.finish_above_reserve}
              accent={isPwaMode ? '#60a5fa' : '#4ade80'}
              align="right"
            />
          </div>
          {!isPwaMode && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: retirementTextMuted }}>
              <span>90% safe uses reserve-never-touched</span>
              <HelpTip help={HELP.reserve_never_touched} accent="#4ade80" align="right" />
            </div>
          )}
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
            House sold at 67 · {withdrawalRate}% pool draw · {equityAllocation}/{100 - equityAllocation} portfolio · {avgAnnualReal}% avg real return · Chad passes at {chadPassesAge}
            {optimalRates.worstCohort.year > 0 && ` · Worst start: ${optimalRates.worstCohort.year}`}
          </>
        )}
      </div>

      <HelpDrawer
        key={retirementMode}
        help={sectionOverviewHelp}
        title={isPwaMode ? 'How To Read Adaptive PWA' : 'How To Read Historical Safe'}
        accent={isPwaMode ? '#60a5fa' : '#4ade80'}
        defaultOpen={isPwaMode}
        >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
          {isPwaMode ? (
            <>
              <HelpChip label="Spending target" help={HELP.spending_target} accent="#4ade80" />
              <HelpChip label="Pool draw" help={HELP.pool_draw} accent="#60a5fa" />
              <HelpChip label="Won't need to cut later" help={HELP.probability_no_cut} accent="#60a5fa" />
              <HelpChip label="Bequest target" help={HELP.bequest_target} accent="#4ade80" />
            </>
          ) : (
            <>
              <HelpChip label="Finish above reserve" help={HELP.finish_above_reserve} accent="#60a5fa" />
              <HelpChip label="Reserve never touched" help={HELP.reserve_never_touched} accent="#4ade80" />
              <HelpChip label="Pool draw" help={HELP.pool_draw} accent="#f59e0b" />
              <HelpChip label="Pool floor" help={HELP.reserve_floor} accent="#f59e0b" />
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
          background: '#0f172a',
          border: '1px solid #60a5fa55',
          borderRadius: 10,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#60a5fa', fontWeight: 700, marginBottom: 4 }}>
                <span>{HELP.adaptive_pwa_intro.title}</span>
                <HelpTip help={HELP.adaptive_pwa_intro} accent="#60a5fa" />
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
                background: '#1e293b',
                color: retirementTextStrong,
                border: '1px solid #334155',
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

      {/* Income phase summary */}
      {isPwaMode ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8, marginBottom: 16 }}>
          <div style={{ background: '#0f172a', borderRadius: 8, padding: '10px 12px', border: '1px solid #1e293b' }}>
            <div style={{ fontSize: 10, color: retirementTextBody, marginBottom: 4, fontWeight: 600 }}>Investment Pool (age 67)</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: retirementTextStrong, fontFamily: "'JetBrains Mono', monospace" }}>
              {fmtFull(totalPool)}
            </div>
            <div style={{ fontSize: 9, color: retirementTextBody, marginTop: 4, lineHeight: 1.4, fontFamily: "'JetBrains Mono', monospace" }}>
              Savings {fmtFull(endSavings)} + 401k {fmtFull(end401k)} + Home {fmtFull(homeSaleNet)}
            </div>
            {pwaReferenceSimulation && (
              <div style={{ fontSize: 9, color: retirementTextBody, marginTop: 4, lineHeight: 1.4, fontFamily: "'JetBrains Mono', monospace" }}>
                Reference realized cohort: {formatCohortLabel(pwaReferenceSimulation.referenceSample)}
              </div>
            )}
          </div>

          <div style={{ background: '#0f172a', borderRadius: 8, padding: '10px 12px', border: '1px solid #4ade8033' }}>
            <div style={{ fontSize: 10, color: '#4ade80', marginBottom: 4, fontWeight: 600 }}>
              <LabelWithHelp label="Current PWA Spending Target" help={HELP.spending_target} accent="#4ade80" />
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#4ade80', fontFamily: "'JetBrains Mono', monospace" }}>
              {fmtFull(Math.round(pwaCurrentView.totalSpendingTarget))}/mo
            </div>
            <div style={{ fontSize: 9, color: retirementTextBody, marginTop: 4, lineHeight: 1.4, fontFamily: "'JetBrains Mono', monospace" }}>
              Pool draw {fmtFull(Math.round(pwaCurrentView.currentPortfolioDraw))}/mo + SS {fmtFull(Math.round(pwaStartContext.currentSSIncome))}/mo + {fmtFull(trustMonthly)}/mo trust
            </div>
            {pwaCurrentView.outsideIncomeReinvested > 0 && (
              <div style={{ fontSize: 9, color: retirementTextBody, marginTop: 4, lineHeight: 1.4, fontFamily: "'JetBrains Mono', monospace" }}>
                Outside income reinvested: {fmtFull(Math.round(pwaCurrentView.outsideIncomeReinvested))}/mo
              </div>
            )}
          </div>

          <div style={{ background: '#0f172a', borderRadius: 8, padding: '10px 12px', border: '1px solid #60a5fa33' }}>
            <div style={{ fontSize: 10, color: '#60a5fa', marginBottom: 4, fontWeight: 600 }}>
              <LabelWithHelp label="Adaptive Confidence" help={HELP.probability_no_cut} accent="#60a5fa" />
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#60a5fa', fontFamily: "'JetBrains Mono', monospace" }}>
              {pwaConfidencePct}%
            </div>
            <div style={{ fontSize: 9, color: retirementTextBody, marginTop: 4, lineHeight: 1.4, fontFamily: "'JetBrains Mono', monospace" }}>
              Chance this starting target won't need to cut later while still ending at {fmtFull(bequestTarget)}
            </div>
            <div style={{ fontSize: 9, color: retirementTextBody, marginTop: 4, lineHeight: 1.4, fontFamily: "'JetBrains Mono', monospace" }}>
              Tolerance band {fmtFull(Math.round(pwaCurrentSelection.lowerToleranceWithdrawal || 0))} – {fmtFull(Math.round(pwaCurrentSelection.upperToleranceWithdrawal || 0))}/mo
            </div>
          </div>
        </div>
      ) : (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8, marginBottom: 16 }}>
        {/* Pool card */}
        <div style={{ background: '#0f172a', borderRadius: 8, padding: '10px 12px', border: '1px solid #1e293b' }}>
          <div style={{ fontSize: 10, color: retirementTextBody, marginBottom: 4, fontWeight: 600 }}>Investment Pool (age 67)</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: retirementTextStrong, fontFamily: "'JetBrains Mono', monospace" }}>
            {fmtFull(totalPool)}
          </div>
          <div style={{ fontSize: 9, color: retirementTextBody, marginTop: 4, lineHeight: 1.4, fontFamily: "'JetBrains Mono', monospace" }}>
            Savings {fmtFull(endSavings)} + 401k {fmtFull(end401k)} + Home {fmtFull(homeSaleNet)}
          </div>
          {chadPassesAge > 70 && bandResult.bands[0].series.length > (chadPassesAge - 67) && (
            <div style={{ fontSize: 9, color: retirementTextBody, marginTop: 4, lineHeight: 1.4, fontFamily: "'JetBrains Mono', monospace" }}>
              At {chadPassesAge}: {fmtPool(bandResult.bands[0].series[chadPassesAge - 67])} (worst) \u2013 {fmtPool(deterministicPools[chadPassesAge - 67])} (expected)
            </div>
          )}
        </div>

        {/* Pre-inheritance couple (or full couple if no inheritance during couple phase) */}
          <div style={{ background: '#0f172a', borderRadius: 8, padding: '10px 12px', border: '1px solid #60a5fa33' }}>
          <div style={{ fontSize: 10, color: '#60a5fa', marginBottom: 4, fontWeight: 600 }}>
            <LabelWithHelp
              label={inhDuringCouple ? `Pre-Inheritance Spending Target (67-${inheritanceChadAge})` : `Couple Spending Target (67-${chadPassesAge})`}
              help={HELP.spending_target}
              accent="#60a5fa"
            />
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#60a5fa', fontFamily: "'JetBrains Mono', monospace" }}>
            {fmtFull(coupleSummary.totalTarget)}/mo
          </div>
          <div style={{ fontSize: 9, color: retirementTextBody, marginTop: 4, lineHeight: 1.4, fontFamily: "'JetBrains Mono', monospace" }}>
            Pool draw {formatRange(coupleSummary.start.poolDraw, coupleSummary.end.poolDraw, '/mo')} + SS {formatRange(coupleSummary.start.ssIncome, coupleSummary.end.ssIncome, '/mo')} + {fmtFull(trustMonthly)}/mo trust
          </div>
          {(coupleSummary.start.savedToPool > 0 || coupleSummary.end.savedToPool > 0) && (
            <div style={{ fontSize: 9, color: retirementTextBody, marginTop: 4, lineHeight: 1.4, fontFamily: "'JetBrains Mono', monospace" }}>
              Outside income reinvested: {formatRange(coupleSummary.start.savedToPool, coupleSummary.end.savedToPool, '/mo')}
            </div>
          )}
        </div>

        {/* Post-inheritance couple (only when inheritance during couple phase) */}
        {inhDuringCouple && (
          <div style={{ background: '#0f172a', borderRadius: 8, padding: '10px 12px', border: '1px solid #4ade8033' }}>
            <div style={{ fontSize: 10, color: '#4ade80', marginBottom: 4, fontWeight: 600 }}>
              <LabelWithHelp
                label={`Post-Inheritance Spending Target (${inheritanceChadAge}-${chadPassesAge})`}
                help={HELP.spending_target}
                accent="#4ade80"
              />
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#4ade80', fontFamily: "'JetBrains Mono', monospace" }}>
              {fmtFull(postInheritanceSummary.totalTarget)}/mo
            </div>
            <div style={{ fontSize: 9, color: retirementTextBody, marginTop: 4, lineHeight: 1.4, fontFamily: "'JetBrains Mono', monospace" }}>
              Pool draw {formatRange(postInheritanceSummary.start.poolDraw, postInheritanceSummary.end.poolDraw, '/mo')} + SS {formatRange(postInheritanceSummary.start.ssIncome, postInheritanceSummary.end.ssIncome, '/mo')} + {fmtFull(trustMonthly)}/mo trust
            </div>
            {(postInheritanceSummary.start.savedToPool > 0 || postInheritanceSummary.end.savedToPool > 0) && (
              <div style={{ fontSize: 9, color: retirementTextBody, marginTop: 4, lineHeight: 1.4, fontFamily: "'JetBrains Mono', monospace" }}>
                Outside income reinvested: {formatRange(postInheritanceSummary.start.savedToPool, postInheritanceSummary.end.savedToPool, '/mo')}
              </div>
            )}
          </div>
        )}

        {/* Survivor */}
        <div style={{ background: '#0f172a', borderRadius: 8, padding: '10px 12px', border: '1px solid #f59e0b33' }}>
          <div style={{ fontSize: 10, color: '#f59e0b', marginBottom: 4, fontWeight: 600 }}>
            <LabelWithHelp
              label={`Sarah Survivor Spending Target (after ${chadPassesAge})`}
              help={HELP.spending_target}
              accent="#f59e0b"
            />
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#f59e0b', fontFamily: "'JetBrains Mono', monospace" }}>
            {fmtFull(survivorSummary.totalTarget)}/mo
          </div>
          <div style={{ fontSize: 9, color: retirementTextBody, marginTop: 4, lineHeight: 1.4, fontFamily: "'JetBrains Mono', monospace" }}>
            Pool draw {formatRange(survivorSummary.start.poolDraw, survivorSummary.end.poolDraw, '/mo')} + SS {formatRange(survivorSummary.start.ssIncome, survivorSummary.end.ssIncome, '/mo')} + {fmtFull(trustMonthly)}/mo trust
          </div>
          {(survivorSummary.start.savedToPool > 0 || survivorSummary.end.savedToPool > 0) && (
            <div style={{ fontSize: 9, color: retirementTextBody, marginTop: 4, lineHeight: 1.4, fontFamily: "'JetBrains Mono', monospace" }}>
              Outside income reinvested: {formatRange(survivorSummary.start.savedToPool, survivorSummary.end.savedToPool, '/mo')}
            </div>
          )}
        </div>
      </div>
      )}

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

          <div data-testid="retirement-decision-preview" style={{
            background: '#0f172a',
            borderRadius: 8,
            padding: '12px 14px',
            border: '1px solid #334155',
            marginBottom: 12,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
              <div>
                <div data-testid="retirement-decision-preview-title" style={{ fontSize: 11, color: retirementTextStrong, fontWeight: 700 }}>
                  <LabelWithHelp label="Adaptive decision preview" help={HELP.annual_decision_preview} accent="#60a5fa" />
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
                          borderBottom: '1px solid #334155',
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
                          <td style={{ padding: '7px 0', color: retirementTextBody, borderBottom: '1px solid #1e293b', fontFamily: "'JetBrains Mono', monospace" }}>
                            Y{idx}
                          </td>
                          <td style={{ padding: '7px 0', textAlign: 'right', color: retirementTextBody, borderBottom: '1px solid #1e293b', fontFamily: "'JetBrains Mono', monospace" }}>
                            {chadAge}/{sarahAge}
                          </td>
                          <td style={{ padding: '7px 0', textAlign: 'right', color: retirementTextStrong, borderBottom: '1px solid #1e293b', fontFamily: "'JetBrains Mono', monospace" }}>
                            {fmtFull(decision.beginningBalance)}
                          </td>
                          <td style={{ padding: '7px 0', textAlign: 'right', color: '#4ade80', borderBottom: '1px solid #1e293b', fontFamily: "'JetBrains Mono', monospace" }}>
                            {fmtFull(Math.round(decision.selectedTotalSpendingTarget))}
                          </td>
                          <td style={{ padding: '7px 0', textAlign: 'right', color: '#60a5fa', borderBottom: '1px solid #1e293b', fontFamily: "'JetBrains Mono', monospace" }}>
                            {fmtFull(Math.round(decision.currentPortfolioDraw))}
                          </td>
                          <td style={{ padding: '7px 0', color: decision.cutOccurred ? '#f59e0b' : retirementTextBody, borderBottom: '1px solid #1e293b', fontFamily: "'JetBrains Mono', monospace" }}>
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
          const d = yearlyData[closestIdx];
          const pctX = (xScale(closestIdx) / svgW) * 100;
          const histBands = bandResult.bands.map(b => b.series[closestIdx]);
          const pctY = (yPool(histBands[0]) / svgH) * 100;
          setTooltip({ pctX, pctY, ...d, p10: histBands[0], p25: histBands[1], p50: histBands[2], p75: histBands[3], p90: histBands[4] });
        }}>
        {/* Grid */}
        {yTicks.map((v, i) => (
          <g key={i}>
            <line x1={padL} x2={svgW - padR} y1={yPool(v)} y2={yPool(v)}
              stroke={v === 0 ? '#475569' : '#1e293b'} strokeWidth={v === 0 ? 1 : 0.5} />
            <text x={padL - 8} y={yPool(v) + 4} textAnchor="end"
              fill="#94a3b8" fontSize="12" fontFamily="'JetBrains Mono', monospace">
              {fmtPool(v)}
            </text>
          </g>
        ))}

        {/* Survivor phase background */}
        {survivorStartIdx >= 0 && (
          <rect x={xScale(survivorStartIdx)} y={padT} width={xScale(years) - xScale(survivorStartIdx)} height={plotH}
            fill="#f59e0b" opacity="0.04" />
        )}

        {/* Historical percentile bands */}
        {bandPairs.map((bp, bi) => {
          const topPts = bp.hi.series.map((v, i) => `${xScale(i)},${yPool(v)}`);
          const botPts = bp.lo.series.map((v, i) => `${xScale(i)},${yPool(v)}`).reverse();
          const bandPath = `M ${topPts.join(' L ')} L ${botPts.join(' L ')} Z`;
          return <path key={bi} d={bandPath} fill={bp.color} opacity={bp.opacity} />;
        })}

        {/* Expected case line (average return — secondary, dashed) */}
        <path d={poolLine} fill="none" stroke="#60a5fa" strokeWidth="1.5"
          strokeDasharray="6,4" opacity="0.7" strokeLinejoin="round" strokeLinecap="round" />

        {/* SWR plan line (10th percentile — worst surviving case, primary) */}
        {(() => {
          const swrPts = bandResult.bands[0].series.map((v, i) => `${xScale(i)},${yPool(v)}`);
          return <path d={`M ${swrPts.join(' L ')}`} fill="none" stroke="#f97316" strokeWidth="2.5"
            strokeLinejoin="round" strokeLinecap="round" />;
        })()}

        {/* Pool floor line */}
        {poolFloor > 0 && (
          <line x1={padL} x2={svgW - padR} y1={yPool(poolFloor)} y2={yPool(poolFloor)}
            stroke="#f59e0b" strokeWidth="1" strokeDasharray="6,3" opacity="0.6" />
        )}

        {/* Chad passes marker */}
        {survivorStartIdx >= 0 && (
          <g>
            <line x1={xScale(survivorStartIdx)} x2={xScale(survivorStartIdx)}
              y1={padT} y2={padT + plotH}
              stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="4,3" />
            <text x={xScale(survivorStartIdx)} y={padT - 4} textAnchor="middle"
              fill="#f59e0b" fontSize="10" fontWeight="700" fontFamily="'JetBrains Mono', monospace">
              Chad {chadPassesAge} / Sarah {chadPassesAge - ageDiff}
            </text>
          </g>
        )}

        {/* Inheritance marker */}
        {hasInheritance && inheritanceYear >= 0 && inheritanceYear <= years && (
          <g>
            <line x1={xScale(inheritanceYear)} x2={xScale(inheritanceYear)}
              y1={padT} y2={padT + plotH}
              stroke="#4ade80" strokeWidth="1.5" strokeDasharray="4,3" />
            <text x={xScale(inheritanceYear)} y={padT + plotH + 12} textAnchor="middle"
              fill="#4ade80" fontSize="10" fontWeight="700" fontFamily="'JetBrains Mono', monospace">
              +{fmtPool(inheritanceAmount)} inheritance
            </text>
          </g>
        )}

        {/* Start label */}
        <text x={padL + 4} y={yPool(totalPool) - 6}
          fill="#60a5fa" fontSize="11" fontWeight="600" fontFamily="'JetBrains Mono', monospace">
          {fmtPool(totalPool)}
        </text>

        {/* 10th percentile end label — shows where worst surviving cohort ends */}
        {(() => {
          const p10End = bandResult.bands[0].series[bandResult.bands[0].series.length - 1];
          const endX = xScale(years);
          const endY = yPool(p10End);
          return (
            <g>
              <circle cx={endX} cy={endY} r="3" fill="#f97316" opacity="0.8" />
              <text x={endX - 4} y={endY - 8} textAnchor="end"
                fill="#f97316" fontSize="10" fontWeight="600" opacity="0.95"
                fontFamily="'JetBrains Mono', monospace">
                Plan: {fmtPool(p10End)}
              </text>
            </g>
          );
        })()}

        {/* Hover dot */}
        {tooltip && (
          <circle cx={xScale(tooltip.age - 67)} cy={yPool(tooltip.p10)} r="5"
            fill="#f97316" stroke="#f8fafc" strokeWidth="2" />
        )}

        {/* X-axis labels */}
        {yearlyData.filter((_, i) => i % 5 === 0).map((d, i) => (
          <g key={i}>
            <text x={xScale(d.age - 67)} y={svgH - 20} textAnchor="middle"
              fill="#94a3b8" fontSize="11" fontFamily="'JetBrains Mono', monospace">
              C:{d.age}
            </text>
            <text x={xScale(d.age - 67)} y={svgH - 8} textAnchor="middle"
              fill="#f59e0b" fontSize="11" fontFamily="'JetBrains Mono', monospace" opacity="0.7">
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
          background: '#0f172a',
          border: '1px solid #475569',
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
          <div style={{ fontSize: 13, fontWeight: 700, color: '#f97316', fontFamily: "'JetBrains Mono', monospace" }}>
            Plan pool: {fmtFull(tooltip.p10)}
          </div>
          <div style={{ fontSize: 11, color: '#60a5fa', fontFamily: "'JetBrains Mono', monospace" }}>
            Average path pool: {fmtFull(tooltip.pool)}
          </div>
          <div style={{ borderTop: '1px solid #334155', marginTop: 4, paddingTop: 4 }}>
            {tooltip.p10 <= poolFloor ? (
              <>
                <div style={{ fontSize: 11, color: '#f97316', fontWeight: 600 }}>
                  Plan income after reserve hit: {fmtFull(tooltip.guaranteedIncome)}/mo
                </div>
                <div style={{ fontSize: 11, color: '#60a5fa' }}>
                  Average path income: {fmtFull(tooltip.monthly)}/mo
                </div>
              </>
            ) : (
              <div style={{ fontSize: 11, color: retirementTextStrong, fontWeight: 600 }}>
                Spending target: {fmtFull(tooltip.monthly)}/mo
              </div>
            )}
            <div style={{ fontSize: 11, color: retirementTextBody, lineHeight: 1.4, fontFamily: "'JetBrains Mono', monospace" }}>
              Pool draw {fmtFull(tooltip.poolDraw)} + SS {fmtFull(tooltip.ssIncome)} + trust {fmtFull(trustMonthly)}
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
          { label: '10th pct pool path', color: '#f97316', solid: true },
          { label: 'Average-return path', color: '#60a5fa', dashed: true },
          { label: '25-75th pct band', color: '#60a5fa', band: true, opacity: 0.12 },
          { label: '10-90th pct band', color: '#60a5fa', band: true, opacity: 0.08 },
          { label: 'Survivor phase', color: '#f59e0b', solid: true },
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

      {/* Dual optimal rates: Safe (pool never depletes) + ERN max (pool ends at target) */}
      <div style={{
        marginTop: 12, padding: '10px 14px', background: '#0f172a', borderRadius: 8,
        border: '1px solid #334155',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11, color: retirementTextMuted, marginBottom: 2, fontWeight: 600 }}>
              <LabelWithHelp label="Safe pool draw (reserve never touched in 90% of cohorts)" help={HELP.reserve_never_touched} accent="#4ade80" />
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#4ade80', fontFamily: "'JetBrains Mono', monospace" }}>
              {optimalRates.safeRate}% = {fmtFull(optimalRates.safeMonthly)}/mo
            </div>
            <div style={{ fontSize: 9, color: retirementTextBody, marginTop: 2, lineHeight: 1.35, fontFamily: "'JetBrains Mono', monospace" }}>
              Starting spend: {fmtFull(optimalRates.safeMonthly + startingCoupleIncome)}/mo with SS + trust
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: retirementTextMuted, marginBottom: 2, fontWeight: 600 }}>Sarah's target after Chad ({chadPassesAge})</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#f59e0b', fontFamily: "'JetBrains Mono', monospace" }}>
              {fmtFull(survivorSummary.totalTarget)}/mo
            </div>
            <div style={{ fontSize: 10, color: retirementTextBody, marginTop: 2, lineHeight: 1.35, fontFamily: "'JetBrains Mono', monospace" }}>
              Pool draw {formatRange(survivorSummary.start.poolDraw, survivorSummary.end.poolDraw, '/mo')} + SS {formatRange(survivorSummary.start.ssIncome, survivorSummary.end.ssIncome, '/mo')} + {fmtFull(trustMonthly)}/mo trust
            </div>
          </div>
        </div>
        {/* ERN max consumption */}
        <div style={{ borderTop: '1px solid #334155', marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11, color: retirementTextMuted, marginBottom: 2, fontWeight: 600 }}>
              <LabelWithHelp
                label={`ERN max pool draw (finish above reserve in 90% of cohorts, ${maxDepletionMonths > 0 ? `<=${maxDepletionMonths}mo reserve gap` : 'no reserve gap'})`}
                help={HELP.finish_above_reserve}
                accent="#60a5fa"
              />
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#60a5fa', fontFamily: "'JetBrains Mono', monospace" }}>
              {optRate}% = {fmtFull(optMonthly)}/mo from pool
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: retirementTextMuted, marginBottom: 2, fontWeight: 600 }}>Total consumption</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#60a5fa', fontFamily: "'JetBrains Mono', monospace" }}>
              {fmtFull(Math.round(optimalRates.optimalConsumption))}/mo
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
                min={0} max={100} step={5} format={(v) => `${v}/${100 - v}`} color="#60a5fa" />
              <Slider label={<LabelWithHelp label="Bequest target" help={HELP.bequest_target} accent="#4ade80" />} value={bequestTarget} onChange={setBequestTarget}
                testId="retirement-bequest-target"
                ariaLabel="Bequest target"
                min={0} max={Math.max(totalPool, 1000000)} step={25000} color="#4ade80" />

              <div data-testid="retirement-pwa-strategy-container" style={{ padding: '4px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: retirementTextBody, fontWeight: 600 }}>
                    <span>PWA strategy</span>
                    <HelpTip help={HELP.pwa_strategy} accent="#60a5fa" />
                  </span>
                  <span style={{ fontSize: 12, color: '#60a5fa', fontWeight: 700 }}>
                    {getPwaStrategyLabel(pwaStrategy)}
                  </span>
                </div>
                <select
                  value={pwaStrategy}
                  onChange={(e) => setPwaStrategy(e.target.value)}
                  data-testid="retirement-pwa-strategy"
                  aria-label="PWA strategy"
                  style={{ width: '100%', background: '#0f172a', color: retirementTextStrong, border: '1px solid #334155', borderRadius: 6, padding: '8px 10px', fontSize: 13 }}
                >
                  {PWA_STRATEGY_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>

              {pwaStrategy !== 'sticky_median' && (
                <Slider label={<LabelWithHelp label="Target percentile" help={HELP.pwa_target_percentile} accent="#4ade80" />} value={pwaPercentile} onChange={setPwaPercentile}
                  testId="retirement-pwa-target-percentile"
                  ariaLabel="Target percentile"
                  min={5} max={95} step={5} format={(v) => `${v}th`} color="#4ade80" />
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
                min={67} max={95} step={1} format={(v) => v + ''} color="#f59e0b" />
              {(pwaStrategy === 'sticky_median' || pwaStrategy === 'sticky_quartile_nudge') && (
                <>
                  <Slider label={<LabelWithHelp label="Tolerance low" help={HELP.pwa_tolerance_band} accent="#60a5fa" />} value={pwaToleranceLow} onChange={setPwaToleranceLow}
                    testId="retirement-pwa-tolerance-low"
                    ariaLabel="Tolerance low"
                    min={5} max={95} step={5} format={(v) => `${v}th`} color="#60a5fa" />
                  <Slider label={<LabelWithHelp label="Tolerance high" help={HELP.pwa_tolerance_band} accent="#60a5fa" />} value={pwaToleranceHigh} onChange={setPwaToleranceHigh}
                    testId="retirement-pwa-tolerance-high"
                    ariaLabel="Tolerance high"
                    min={5} max={95} step={5} format={(v) => `${v}th`} color="#60a5fa" />
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
                min={0} max={100} step={5} format={(v) => `${v}/${100 - v}`} color="#60a5fa" />

              {/* Withdrawal rate with optimal marker */}
              <div style={{ padding: "4px 0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: retirementTextBody, fontWeight: 600 }}>
                    <span>Pool draw rate</span>
                    <HelpTip help={HELP.pool_draw_rate} accent="#f59e0b" />
                  </span>
                  <span style={{ fontSize: 13, color: withdrawalRate > optimalRates.safeRate ? '#f87171' : '#f59e0b', fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>
                    {withdrawalRate}%
                    {withdrawalRate > optimalRates.safeRate && withdrawalRate <= optRate && <span style={{ fontSize: 11, color: '#f59e0b' }}> (reserve may be touched briefly)</span>}
                    {withdrawalRate > optRate && <span style={{ fontSize: 11, color: '#f87171' }}> (above ERN max)</span>}
                  </span>
                </div>
                <div style={{ position: 'relative' }}>
                  <input type="range" min={0} max={optimalRates.sliderMax} step={0.1} value={withdrawalRate}
                    data-testid="retirement-pool-draw-rate"
                    aria-label="Pool draw rate"
                    onChange={(e) => setWithdrawalRate(Number(e.target.value))}
                    style={{ width: "100%", accentColor: withdrawalRate > optRate ? '#f87171' : withdrawalRate > optimalRates.safeRate ? '#f59e0b' : '#4ade80', height: 6 }} />
                  {(() => {
                    const thumbHalf = 8;
                    const safePct = Math.min(optimalRates.safeRate, optimalRates.sliderMax) / optimalRates.sliderMax;
                    const ernPct = Math.min(optRate, optimalRates.sliderMax) / optimalRates.sliderMax;
                    return (
                      <div style={{ position: 'relative', height: 30, marginTop: 2 }}>
                        <div style={{
                          position: 'absolute',
                          left: `calc(${safePct * 100}% + ${(0.5 - safePct) * thumbHalf * 2}px)`,
                          top: 0,
                          transform: 'translateX(-50%)',
                          display: 'flex', flexDirection: 'column', alignItems: 'center',
                          pointerEvents: 'none',
                        }}>
                          <div style={{ width: 2, height: 6, background: '#4ade80', borderRadius: 1 }} />
                          <div style={{ fontSize: 9, color: '#4ade80', fontWeight: 700, whiteSpace: 'nowrap' }}>
                            {optimalRates.safeRate}% safe
                          </div>
                        </div>
                        {optRate > 0 && (
                          <div style={{
                            position: 'absolute',
                            left: `calc(${ernPct * 100}% + ${(0.5 - ernPct) * thumbHalf * 2}px)`,
                            top: 14,
                            transform: 'translateX(-50%)',
                            display: 'flex', flexDirection: 'column', alignItems: 'center',
                            pointerEvents: 'none',
                          }}>
                            <div style={{ width: 2, height: 6, background: '#60a5fa', borderRadius: 1 }} />
                            <div style={{ fontSize: 9, color: '#60a5fa', fontWeight: 700, whiteSpace: 'nowrap' }}>
                              {optRate}% ERN max
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
                min={67} max={95} step={1} format={(v) => v + ''} color="#f59e0b" />
            </div>
          </ControlSection>

          <ControlSection
            testId="retirement-advanced-assumptions"
            title="Advanced assumptions"
            subtitle="Reserve and inheritance settings decide how much path slack you want in the hardest historical starts."
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              <Slider label={<LabelWithHelp label="Pool floor (reserve)" help={HELP.reserve_floor} accent="#f59e0b" />} value={poolFloor} onChange={setPoolFloor}
                testId="retirement-pool-floor"
                ariaLabel="Pool floor reserve"
                min={0} max={Math.min(totalPool, 500000)} step={25000} color="#f59e0b" />
              <Slider label="Inheritance amount" value={inheritanceAmount} onChange={setInheritanceAmount}
                testId="retirement-inheritance-amount"
                min={0} max={2000000} step={50000} color="#4ade80" />
              <Slider label="Sarah's age at inheritance" value={inheritanceSarahAge} onChange={setInheritanceSarahAge}
                testId="retirement-inheritance-sarah-age"
                min={55} max={80} step={1} format={(v) => v + ''} color="#4ade80" />
              <Slider label={<LabelWithHelp label="Max depletion gap" help={HELP.max_depletion_gap} accent="#94a3b8" />} value={maxDepletionMonths} onChange={setMaxDepletionMonths}
                testId="retirement-max-depletion-gap"
                ariaLabel="Max depletion gap"
                min={0} max={120} step={6} format={(v) => v === 0 ? 'none' : v + ' mo'} color="#94a3b8" />
            </div>
          </ControlSection>
        </div>
      )}

      {/* Inheritance pre-withdrawal callout */}
      {!isPwaMode && hasInheritance && (optPreRate - optRate >= 0.5) && (
        <div style={{
          marginTop: 8, padding: '10px 14px', background: '#0f172a', borderRadius: 8,
          border: '1px solid #4ade8033',
        }}>
          <div style={{ fontSize: 11, color: '#4ade80', marginBottom: 4, fontWeight: 700 }}>
            Pre-Inheritance Pool Draw (before {fmtPool(inheritanceAmount)} at Sarah {inheritanceSarahAge})
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 11, color: retirementTextMuted, marginBottom: 2, fontWeight: 600 }}>
                Max pre-inheritance pool draw (90% finish above reserve)
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#4ade80', fontFamily: "'JetBrains Mono', monospace" }}>
                {optPreRate}% = {fmtFull(optPreMonthly)}/mo
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: retirementTextMuted, marginBottom: 2, fontWeight: 600 }}>
                vs uniform rate
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: optPreRate > optRate ? '#4ade80' : '#94a3b8', fontFamily: "'JetBrains Mono', monospace" }}>
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
          marginTop: 8, padding: '8px 12px', background: '#1e293b', borderRadius: 6,
          border: '1px solid #f8717133', fontSize: 12, color: '#f87171', lineHeight: 1.5,
        }}>
          At {withdrawalRate}% pool draw, fewer than 90% of historical cohorts finish above the reserve by Sarah age {sarahTargetAge}.
          The 90%-finish-above-reserve cap is <span style={{ fontWeight: 700, color: '#4ade80' }}>{optRate}%</span> ({fmtFull(optMonthly)}/mo from the pool).
        </div>
      )}
    </div>
  );
}
