/**
 * useRetirementSimulation — extracts all retirement simulation state, deferred
 * values, and memoised computation from RetirementIncomeChart so the component
 * is purely presentational and the orchestration logic is independently testable.
 */
import { useState, useMemo, useEffect, useCallback, useDeferredValue } from 'react';
import { getBlendedReturns, getNumCohorts } from '../model/historicalReturns.js';
import { simulatePath, computeSWR, computePreInhSWR } from '../model/ernWithdrawal.js';
import {
  deriveRetirementParams,
  computeRetirementPool,
  computeOptimalRates,
  withdrawalScaleFactor,
  buildTwoPhaseSchedule,
  shouldAutoSyncWithdrawalRate,
  deterministicTrajectory,
  geometricMeanMonthly,
} from '../model/retirementParams.js';
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
import { interpolatedPercentile } from '../model/percentile.js';
import { selectPwaWithdrawal, simulateAdaptivePwaStrategy } from '../model/pwaStrategies.js';

export function useRetirementSimulation({
  savingsData, wealthData, ssType, ssPersonal, ssPIA, ssClaimAge, chadJob, trustIncomeFuture, ssMonthsWithheld, chadJobPensionMonthly,
  chadCurrentAge, sarahCurrentAge, sarahOwnSS: sarahOwnSSFromState,
  sarahSpousalClaimAge: sarahSpousalClaimAgeFromState,
  sarahSpousalEnabled: sarahSpousalEnabledFromState,
  retirement401kTaxRate,
  expenseInflation, expenseInflationRate,
}) {
  // ── State ────────────────────────────────────────────────────────────
  const [retirementMode, setRetirementMode] = useState('historical_safe');
  const [pwaStrategy, setPwaStrategy] = useState('sticky_median');
  const [pwaPercentile, setPwaPercentile] = useState(50);
  const [pwaToleranceLow, setPwaToleranceLow] = useState(25);
  const [pwaToleranceHigh, setPwaToleranceHigh] = useState(75);
  const [bequestTarget, setBequestTarget] = useState(0);
  const [equityAllocation, setEquityAllocation] = useState(60);
  const [withdrawalRate, setWithdrawalRate] = useState(4);
  // Dirty flag: true once the user manually moves the pool-draw slider, which
  // disarms the optimal-rate auto-sync effect (finding 2026-06-09 2.5b).
  const [withdrawalRateDirty, setWithdrawalRateDirty] = useState(false);
  const [poolFloor, setPoolFloor] = useState(0);
  const [chadPassesAge, setChadPassesAge] = useState(82);
  const [inheritanceAmount, setInheritanceAmount] = useState(1000000);
  const [inheritanceSarahAge, setInheritanceSarahAge] = useState(60);
  const [showPwaIntro, setShowPwaIntro] = useState(false);
  const [pwaIntroReady, setPwaIntroReady] = useState(false);
  const isPwaMode = retirementMode === 'adaptive_pwa';
  const commitStrategy = 'release';

  // ── Deferred slider values ───────────────────────────────────────────
  // Slider thumbs + labels use the immediate value; expensive computations
  // use deferred so the UI stays responsive during drag.
  const dChadPassesAge = useDeferredValue(chadPassesAge);
  const dEquityAllocation = useDeferredValue(equityAllocation);
  const dPoolFloor = useDeferredValue(poolFloor);
  const dInheritanceAmount = useDeferredValue(inheritanceAmount);
  const dInheritanceSarahAge = useDeferredValue(inheritanceSarahAge);
  const dWithdrawalRate = useDeferredValue(withdrawalRate);
  const dBequestTarget = useDeferredValue(bequestTarget);
  const dPwaPercentile = useDeferredValue(pwaPercentile);
  const dPwaToleranceLow = useDeferredValue(pwaToleranceLow);
  const dPwaToleranceHigh = useDeferredValue(pwaToleranceHigh);

  // ── Derived simulation parameters (state-backed — finding 2026-06-09 2.3) ──
  // ageDiff, horizon, and SS amounts all derive from the same state fields the
  // rest of the app uses (chadCurrentAge/sarahCurrentAge/sarahOwnSS/ssPIA/...),
  // via a pure function so node tests can verify parity with gatherState.
  const {
    ageDiff, sarahTargetAge, endAge, years, horizonMonths, survivorSpendRatio,
    ssFRA, chadSS, chadSSStartAge, sarahOwnSS, survivorSS, survivorCap, sarahSpousalClaimAge, sarahSpousalEnabled, trustMonthly, pensionMonthly, startingCoupleIncome,
  } = deriveRetirementParams({
    chadCurrentAge, sarahCurrentAge, sarahOwnSS: sarahOwnSSFromState,
    ssType, ssPIA, ssClaimAge, ssMonthsWithheld,
    trustIncomeFuture, chadJobPensionMonthly,
    sarahSpousalClaimAge: sarahSpousalClaimAgeFromState,
    sarahSpousalEnabled: sarahSpousalEnabledFromState,
  });

  // Assets at end of variable-length projection (age 67+ depending on chadWorkMonths/sarahWorkMonths).
  // The 401(k) leg is pre-tax — computeRetirementPool haircuts it by
  // retirement401kTaxRate before pooling (A5 — remediation 2026-06-10 item 3.1)
  // — and the whole nominal pool is deflated to today's dollars at this
  // accumulation→retirement seam when expense inflation is on (B8, item 3.2):
  // the retirement engine below runs on REAL (Shiller) returns + flat
  // 2026-dollar flows, so it must start from a today's-dollar pool.
  const endIdx = savingsData.length - 1;
  const { endSavings, end401k, end401kAfterTax, homeSaleNet, totalPool } = computeRetirementPool({
    endSavings: savingsData[endIdx]?.balance || 0,
    end401k: wealthData[endIdx]?.balance401k || 0,
    homeEquity: wealthData[endIdx]?.homeEquity || 0,
    retirement401kTaxRate,
    expenseInflation, expenseInflationRate,
    monthsToRetirement: Math.max(0, endIdx),
  });

  const monthlyWithdrawal = Math.round(totalPool * (dWithdrawalRate / 100) / 12);
  const baseMonthlyConsumption = monthlyWithdrawal + startingCoupleIncome;
  const normalizedPwaToleranceLow = Math.min(dPwaToleranceLow, dPwaToleranceHigh);
  const normalizedPwaToleranceHigh = Math.max(dPwaToleranceLow, dPwaToleranceHigh);

  // Inheritance — use deferred values for computation, immediate for display
  const inheritanceChadAge = dInheritanceSarahAge + ageDiff;
  const inheritanceYear = inheritanceChadAge - 67;
  const inheritanceMonth = inheritanceYear * 12;
  const hasInheritance = dInheritanceAmount > 0;
  // The lump sum only participates when it lands inside the simulated horizon.
  // ageDiff is state-derived now, so an inheritance age BEFORE retirement
  // (negative inheritanceMonth) is possible; the flow builders already ignore
  // out-of-bounds months, and phase labels/summaries must agree with them.
  const inhWithinHorizon = hasInheritance && inheritanceMonth >= 0 && inheritanceMonth < horizonMonths;
  const inhDuringCouple = inhWithinHorizon && inheritanceChadAge < dChadPassesAge;

  // ── Memoised computations ────────────────────────────────────────────

  // Blended historical returns (memoized on equity allocation)
  const blendedReturns = useMemo(
    () => getBlendedReturns(dEquityAllocation / 100),
    [dEquityAllocation]
  );

  const retirementContext = useMemo(() => {
    return buildRetirementContext({
      horizonMonths,
      chadPassesAge: dChadPassesAge,
      ageDiff,
      survivorSpendRatio,
      chadSS,
      ssFRA,
      sarahOwnSS,
      survivorSS,
      survivorCap,
      chadSSStartAge,
      sarahSpousalClaimAge,
      sarahSpousalEnabled,
      trustMonthly,
      pensionMonthly,
    });
  }, [horizonMonths, dChadPassesAge, ageDiff, survivorSpendRatio, chadSS, chadSSStartAge, ssFRA, sarahOwnSS, survivorSS, survivorCap, sarahSpousalClaimAge, sarahSpousalEnabled, trustMonthly, pensionMonthly]);

  // Only `scaling` is consumed here: the inheritance "rescue" carrier is
  // legacy — every cash event flows through simulationSupplementalFlows
  // (single carrier, finding 2026-06-09 2.1; hook parity B9, item 3.3).
  const { scaling } = useMemo(() => {
    return buildScalingAndRescueFlows({
      horizonMonths,
      chadPassesAge: dChadPassesAge,
      survivorSpendRatio,
      hasInheritance,
      inheritanceMonth,
      inheritanceAmount: dInheritanceAmount,
    });
  }, [horizonMonths, dChadPassesAge, survivorSpendRatio, hasInheritance, inheritanceMonth, dInheritanceAmount]);

  const simulationSupplementalFlows = useMemo(() => {
    return buildSupplementalFlows({
      horizonMonths,
      chadPassesAge: dChadPassesAge,
      ageDiff,
      chadSS,
      ssFRA,
      sarahOwnSS,
      survivorSS,
      survivorCap,
      chadSSStartAge,
      sarahSpousalClaimAge,
      sarahSpousalEnabled,
      trustMonthly,
      pensionMonthly,
      hasInheritance,
      inheritanceMonth,
      inheritanceAmount: dInheritanceAmount,
    });
  }, [horizonMonths, dChadPassesAge, ageDiff, chadSS, chadSSStartAge, ssFRA, sarahOwnSS, survivorSS, survivorCap, sarahSpousalClaimAge, sarahSpousalEnabled, trustMonthly, pensionMonthly, hasInheritance, inheritanceMonth, dInheritanceAmount]);

  // Closed-form cohort math includes inheritance as a future cash event (like
  // SS/trust). Since the inheritance double-count fix (finding 2026-06-09 2.1)
  // routed everything through a single carrier, the formula path uses the
  // EXACT same flows as the simulation path — alias it instead of building
  // (and memoizing) an identical second array (remediation 6.7).
  const formulaSupplementalFlows = simulationSupplementalFlows;

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
      bequestTarget: dBequestTarget,
      supplementalFlows: simulationSupplementalFlows,
      scaling: retirementContext.scaling,
    });
  }, [blendedReturns, horizonMonths, totalPool, dBequestTarget, simulationSupplementalFlows, retirementContext]);

  const pwaCurrentSelection = useMemo(() => {
    return selectPwaWithdrawal(pwaCurrentDistribution, {
      strategy: pwaStrategy,
      basePercentile: dPwaPercentile,
      lowerTolerancePercentile: normalizedPwaToleranceLow,
      upperTolerancePercentile: normalizedPwaToleranceHigh,
    });
  }, [pwaCurrentDistribution, pwaStrategy, dPwaPercentile, normalizedPwaToleranceLow, normalizedPwaToleranceHigh]);

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
      bequestTarget: dBequestTarget,
      supplementalFlows: simulationSupplementalFlows,
      scaling: retirementContext.scaling,
      retirementContext,
      strategyConfig: {
        strategy: pwaStrategy,
        basePercentile: dPwaPercentile,
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
    dBequestTarget,
    retirementContext,
    simulationSupplementalFlows,
    pwaCurrentDistribution,
    pwaCurrentSelection,
    pwaStrategy,
    dPwaPercentile,
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
        formulaSupplementalFlows, scaling, dPoolFloor, totalPool);
    }
    return swrs;
  }, [blendedReturns, horizonMonths, formulaSupplementalFlows, scaling, dPoolFloor, totalPool]);

  // Per-cohort pre-inheritance SWRs (used for two-phase band simulation)
  const cohortPreSwrs = useMemo(() => {
    if (!hasInheritance || inheritanceMonth <= 0 || inheritanceMonth >= horizonMonths) return null;
    const numCohorts = getNumCohorts(horizonMonths);
    if (numCohorts <= 0 || totalPool <= 0 || cohortSWRs.length === 0) return null;
    const preSwrs = new Float64Array(numCohorts);
    for (let c = 0; c < numCohorts; c++) {
      preSwrs[c] = computePreInhSWR(blendedReturns, c, horizonMonths,
        formulaSupplementalFlows, scaling, dPoolFloor, totalPool,
        cohortSWRs[c], inheritanceMonth);
    }
    return preSwrs;
  }, [hasInheritance, inheritanceMonth, horizonMonths, totalPool, blendedReturns, formulaSupplementalFlows, scaling, dPoolFloor, cohortSWRs]);

  // Optimal rates — closed-form percentile extraction from cohortSWRs (no
  // binary search). Pure math lives in retirementParams.computeOptimalRates
  // (remediation Phase 9) where node tests cover it directly.
  const optimalRates = useMemo(
    () => computeOptimalRates({ cohortSWRs, cohortPreSwrs, totalPool, horizonMonths, startingCoupleIncome }),
    [cohortSWRs, cohortPreSwrs, totalPool, horizonMonths, startingCoupleIncome]
  );

  // Bands and finish-above-reserve rate at the user's slider rate
  const bandResult = useMemo(() => {
    const emptyBands = [10, 25, 50, 75, 90].map(p => ({ pct: p, series: Array(years + 1).fill(0) }));
    if (totalPool <= 0) return { finishAboveReserveRate: 0, bands: emptyBands };

    const numCohorts = getNumCohorts(horizonMonths);
    if (numCohorts <= 0) return { finishAboveReserveRate: 0, bands: emptyBands };

    const pf = dPoolFloor;
    const allYearlyPools = new Array(numCohorts);
    const userConsumption = baseMonthlyConsumption;
    const useTwoPhase = cohortPreSwrs && cohortPreSwrs.length === numCohorts
      && inheritanceMonth > 0 && inheritanceMonth < horizonMonths;

    // Formula-based survival: cohort survives if its closed-form SWR >= user's consumption
    let survivedCount = 0;
    for (let c = 0; c < numCohorts; c++) {
      if (cohortSWRs.length > c && cohortSWRs[c] >= userConsumption) survivedCount++;
    }

    // Simulation for chart band rendering — per-cohort two-phase withdrawal when
    // inheritance active. Each cohort's closed-form schedule is scaled by the
    // USER's slider (factor = userConsumption / optimalConsumption) so the bands
    // actually respond to the pool-draw slider (finding 2026-06-09 2.5a) —
    // previously every cohort ran at its own full SWR regardless of the slider.
    // Inheritance arrives via simulationSupplementalFlows ONLY (single carrier,
    // finding 2026-06-09 2.1) — simulatePath no longer takes a rescue array.
    const sliderFactor = withdrawalScaleFactor(userConsumption, optimalRates.optimalConsumption);
    for (let c = 0; c < numCohorts; c++) {
      let withdrawal = userConsumption;
      if (useTwoPhase) {
        withdrawal = buildTwoPhaseSchedule(horizonMonths, inheritanceMonth, cohortPreSwrs[c], cohortSWRs[c], sliderFactor);
      }
      const sim = simulatePath(blendedReturns, c, horizonMonths, withdrawal, simulationSupplementalFlows, scaling, totalPool, pf);
      allYearlyPools[c] = sim.yearlyPools;
    }

    const percentiles = [10, 25, 50, 75, 90];
    const temp = new Float64Array(numCohorts);
    const bandSeries = percentiles.map(() => []);

    // C15 (remediation 2026-06-10, item 4.3): shared interpolated percentile —
    // same quantile definition as the MC bands and the PWA distribution.
    for (let y = 0; y <= years; y++) {
      for (let c = 0; c < numCohorts; c++) temp[c] = allYearlyPools[c][y];
      temp.sort();
      for (let p = 0; p < percentiles.length; p++) {
        bandSeries[p].push(interpolatedPercentile(temp, percentiles[p], { sorted: true }));
      }
    }
    const bands = percentiles.map((p, i) => ({ pct: p, series: bandSeries[i] }));

    return { finishAboveReserveRate: survivedCount / numCohorts, bands };
  }, [blendedReturns, totalPool, baseMonthlyConsumption, dPoolFloor, simulationSupplementalFlows, scaling, horizonMonths, years, cohortSWRs, cohortPreSwrs, inheritanceMonth, optimalRates.optimalConsumption]);

  // Deterministic trajectory at the GEOMETRIC mean historical return (B10,
  // item 3.4 — the arithmetic mean ignored volatility drag and ran ~0.4pp/yr
  // hot at 60/40). Floor semantics match simulatePath exactly (B9, item 3.3):
  // supplementalFlows credit every month; the floor is a clamp only.
  const { deterministicPools, avgAnnualReal } = useMemo(() => {
    const avgMonthly = geometricMeanMonthly(blendedReturns);
    const avgAnnualReal = Math.round((Math.pow(1 + avgMonthly, 12) - 1) * 1000) / 10;
    const pools = deterministicTrajectory({
      avgMonthly, totalPool, years, baseMonthlyConsumption,
      scaling, supplementalFlows: simulationSupplementalFlows, poolFloor: dPoolFloor,
    });
    return { deterministicPools: pools, avgAnnualReal };
  }, [blendedReturns, totalPool, baseMonthlyConsumption, dPoolFloor, scaling, simulationSupplementalFlows, years]);

  // ── Derived display data ─────────────────────────────────────────────

  const incomePlanConfig = {
    chadPassesAge: dChadPassesAge,
    ageDiff,
    baseMonthlyConsumption,
    survivorSpendRatio,
    trustMonthly,
    chadSS,
    ssFRA,
    sarahOwnSS,
    survivorSS,
    survivorCap,
    chadSSStartAge,
    sarahSpousalClaimAge,
    sarahSpousalEnabled,
    pensionMonthly,
  };

  const yearlyData = deterministicPools.map((pool, y) => {
    const chadAge = 67 + y;
    const incomePlan = getRetirementIncomePlan(chadAge, pool > dPoolFloor, incomePlanConfig);
    const isPostInh = inhWithinHorizon && y >= inheritanceYear;
    const isInheritanceYear = inhWithinHorizon && y === inheritanceYear;
    const phase = !incomePlan.chadAlive ? 'survivor' : (isPostInh ? 'postInheritance' : 'chad');
    return {
      age: chadAge,
      pool,
      phase, isInheritanceYear,
      ...incomePlan,
    };
  });

  const coupleSummary = getRetirementPhaseSummary(67, inhDuringCouple ? inheritanceChadAge : dChadPassesAge, incomePlanConfig);
  const postInheritanceSummary = inhDuringCouple ? getRetirementPhaseSummary(inheritanceChadAge, dChadPassesAge, incomePlanConfig) : null;
  const survivorSummary = getRetirementPhaseSummary(dChadPassesAge, endAge + 1, incomePlanConfig);

  // ── Effects ──────────────────────────────────────────────────────────

  // Sync withdrawal slider to optimal rate (90% survival) — chart default.
  // Only while the slider is PRISTINE: once the user drags it, the manual
  // value sticks instead of being clobbered on every optimal-rate change
  // (finding 2026-06-09 2.5b).
  useEffect(() => {
    if (shouldAutoSyncWithdrawalRate({ isPwaMode, dirty: withdrawalRateDirty, optimalRate: optimalRates.optimalRate })) {
      setWithdrawalRate(optimalRates.optimalRate);
    }
  }, [isPwaMode, withdrawalRateDirty, optimalRates.optimalRate]);

  // Manual slider setter — marks the slider dirty so auto-sync stops clobbering it.
  const setWithdrawalRateManual = useCallback((value) => {
    setWithdrawalRateDirty(true);
    setWithdrawalRate(value);
  }, []);

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

  function dismissPwaIntro() {
    setShowPwaIntro(false);
    try {
      window.localStorage.setItem('fs_help_seen_adaptive_pwa_intro', '1');
    } catch (error) {
      // Ignore storage failures; the intro will simply reappear next session.
    }
  }

  // ── Public API ───────────────────────────────────────────────────────
  return {
    // State + setters
    retirementMode, setRetirementMode, isPwaMode, commitStrategy,
    pwaStrategy, setPwaStrategy,
    pwaPercentile, setPwaPercentile,
    pwaToleranceLow, setPwaToleranceLow,
    pwaToleranceHigh, setPwaToleranceHigh,
    bequestTarget, setBequestTarget,
    equityAllocation, setEquityAllocation,
    // The exposed setter is the dirty-marking one — only user interactions
    // (the slider) call it; the auto-sync effect uses the raw setter internally.
    withdrawalRate, setWithdrawalRate: setWithdrawalRateManual,
    poolFloor, setPoolFloor,
    chadPassesAge, setChadPassesAge,
    inheritanceAmount, setInheritanceAmount,
    inheritanceSarahAge, setInheritanceSarahAge,
    showPwaIntro, pwaIntroReady, dismissPwaIntro,

    // Constants
    ageDiff, sarahTargetAge, years, survivorSpendRatio,
    endSavings, end401k, end401kAfterTax, homeSaleNet, totalPool,
    trustMonthly, pensionMonthly, startingCoupleIncome,
    normalizedPwaToleranceLow, normalizedPwaToleranceHigh,
    hasInheritance, inheritanceChadAge, inheritanceYear, inhDuringCouple,

    // Computed results
    pwaCurrentDistribution, pwaCurrentSelection, pwaCurrentView,
    pwaStartContext, pwaReferenceSimulation,
    optimalRates, bandResult,
    deterministicPools, avgAnnualReal,
    yearlyData,
    coupleSummary, postInheritanceSummary, survivorSummary,
  };
}
