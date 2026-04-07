/**
 * useRetirementSimulation — extracts all retirement simulation state, deferred
 * values, and memoised computation from RetirementIncomeChart so the component
 * is purely presentational and the orchestration logic is independently testable.
 */
import { useState, useMemo, useEffect, useDeferredValue } from 'react';
import { getBlendedReturns, getNumCohorts, getCohortLabel } from '../model/historicalReturns.js';
import { simulatePath, computeSWR, computePreInhSWR } from '../model/ernWithdrawal.js';
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

export function useRetirementSimulation({
  savingsData, wealthData, ssType, ssPersonal, ssPIA, ssClaimAge, chadJob, trustIncomeFuture,
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

  // ── Constants ────────────────────────────────────────────────────────
  // Chad is 60, Sarah is 46 (14 years younger)
  const ageDiff = 14;
  const sarahTargetAge = 90;
  const endAge = sarahTargetAge + ageDiff; // 104
  const years = endAge - 67; // 37
  const horizonMonths = years * 12; // 444
  const survivorSpendRatio = 0.6;

  // Assets at end of variable-length projection (age 67+ depending on sarahWorkYears)
  const endIdx = savingsData.length - 1;
  const endSavings = savingsData[endIdx]?.balance || 0;
  const end401k = wealthData[endIdx]?.balance401k || 0;
  const endHome = wealthData[endIdx]?.homeEquity || 0;
  const homeSaleNet = Math.round(endHome * 0.94);
  const totalPool = Math.max(0, endSavings + end401k + homeSaleNet);

  const monthlyWithdrawal = Math.round(totalPool * (dWithdrawalRate / 100) / 12);

  // Chad's SS — PIA from state replaces hardcoded value
  const ssFRA = ssPIA || 4214;
  const chadSS = (ssType === 'ss' && !chadJob) ? (ssPersonal || Math.round(ssFRA * 0.7)) : ssFRA;
  const sarahOwnSS = 1900;
  // Survivor benefit: if Chad claimed before FRA, Sarah gets max(his benefit, 82.5% PIA)
  // If Chad claimed at/after FRA (or SSDI which converts at FRA), Sarah gets his full benefit
  const claimAge = ssClaimAge || 67;
  const claimedEarly = ssType === 'ss' && !chadJob && claimAge < 67;
  const survivorSS = claimedEarly
    ? Math.max(chadSS, Math.round(ssFRA * 0.825))
    : chadSS;
  const trustMonthly = trustIncomeFuture || 0;
  const startingCoupleIncome = chadSS + trustMonthly;
  const baseMonthlyConsumption = monthlyWithdrawal + startingCoupleIncome;
  const normalizedPwaToleranceLow = Math.min(dPwaToleranceLow, dPwaToleranceHigh);
  const normalizedPwaToleranceHigh = Math.max(dPwaToleranceLow, dPwaToleranceHigh);

  // Inheritance — use deferred values for computation, immediate for display
  const inheritanceChadAge = dInheritanceSarahAge + ageDiff;
  const inheritanceYear = inheritanceChadAge - 67;
  const inheritanceMonth = inheritanceYear * 12;
  const hasInheritance = dInheritanceAmount > 0;
  const inhDuringCouple = hasInheritance && inheritanceChadAge < dChadPassesAge;

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
      trustMonthly,
    });
  }, [horizonMonths, dChadPassesAge, ageDiff, survivorSpendRatio, chadSS, ssFRA, sarahOwnSS, survivorSS, trustMonthly]);

  const { rescueFlows, scaling } = useMemo(() => {
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
      trustMonthly,
      hasInheritance,
      inheritanceMonth,
      inheritanceAmount: dInheritanceAmount,
    });
  }, [horizonMonths, dChadPassesAge, ageDiff, chadSS, ssFRA, sarahOwnSS, survivorSS, trustMonthly, hasInheritance, inheritanceMonth, dInheritanceAmount]);

  // Closed-form cohort math includes inheritance as a future cash event (like SS/trust).
  const formulaSupplementalFlows = useMemo(() => {
    return buildSupplementalFlows({
      horizonMonths,
      chadPassesAge: dChadPassesAge,
      ageDiff,
      chadSS,
      ssFRA,
      sarahOwnSS,
      survivorSS,
      trustMonthly,
      hasInheritance,
      inheritanceMonth,
      inheritanceAmount: dInheritanceAmount,
    });
  }, [horizonMonths, dChadPassesAge, ageDiff, chadSS, ssFRA, sarahOwnSS, survivorSS, trustMonthly, hasInheritance, inheritanceMonth, dInheritanceAmount]);

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

  // Optimal rates — closed-form percentile extraction from cohortSWRs (no binary search)
  const optimalRates = useMemo(() => {
    const empty = {
      optimalRate: 0, optimalMonthly: 0, optimalPreRate: 0, optimalPreMonthly: 0,
      numCohorts: 0, worstCohort: { year: 0 }, cohortRange: '',
      optimalConsumption: 0, sliderMax: 30,
    };
    if (totalPool <= 0) return empty;

    const numCohorts = getNumCohorts(horizonMonths);
    if (numCohorts <= 0 || cohortSWRs.length === 0) return empty;

    const initialIncome = startingCoupleIncome;

    // Sort cohort SWRs; 10th percentile = consumption at 90% survival
    const sorted = Float64Array.from(cohortSWRs).sort();
    const p10idx = Math.floor(numCohorts * 0.10);
    const optimalConsumption = Math.max(0, sorted[p10idx]);

    // Convert total consumption → pool withdrawal rate
    const optimalPoolDraw = Math.max(0, optimalConsumption - initialIncome);
    const optimalRate = totalPool > 0
      ? Math.round(optimalPoolDraw * 12 / totalPool * 1000) / 10 : 0;
    const optimalMonthly = Math.round(optimalPoolDraw);

    // Pre-inheritance rate via closed-form (if applicable)
    let optimalPreRate = optimalRate, optimalPreMonthly = optimalMonthly;
    if (cohortPreSwrs && cohortPreSwrs.length > 0) {
      const sortedPre = Float64Array.from(cohortPreSwrs).sort();
      const preConsumption = Math.max(0, sortedPre[p10idx]);
      const prePoolDraw = Math.max(0, preConsumption - initialIncome);
      optimalPreRate = totalPool > 0
        ? Math.round(prePoolDraw * 12 / totalPool * 1000) / 10 : 0;
      optimalPreMonthly = Math.round(prePoolDraw);
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
      numCohorts, worstCohort: { year: worstLabel.year }, cohortRange,
      optimalConsumption, sliderMax,
    };
  }, [cohortSWRs, cohortPreSwrs, totalPool, horizonMonths, startingCoupleIncome]);

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

    // Simulation for chart band rendering — per-cohort two-phase withdrawal when inheritance active
    for (let c = 0; c < numCohorts; c++) {
      let withdrawal = userConsumption;
      if (useTwoPhase) {
        // Build per-cohort schedule: pre-inh rate scaled to user's slider, post-inh at cohort's full SWR
        const schedule = new Float64Array(horizonMonths);
        const cohortPreRate = cohortPreSwrs[c];
        const cohortPostRate = cohortSWRs[c];
        for (let t = 0; t < horizonMonths; t++) {
          schedule[t] = t < inheritanceMonth ? cohortPreRate : cohortPostRate;
        }
        withdrawal = schedule;
      }
      const sim = simulatePath(blendedReturns, c, horizonMonths, withdrawal, simulationSupplementalFlows, scaling, totalPool, pf, rescueFlows);
      allYearlyPools[c] = sim.yearlyPools;
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
  }, [blendedReturns, totalPool, baseMonthlyConsumption, dPoolFloor, simulationSupplementalFlows, scaling, horizonMonths, years, rescueFlows, cohortSWRs, cohortPreSwrs, inheritanceMonth]);

  // Deterministic trajectory using average historical return.
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
        if (pool > dPoolFloor) {
          pool = (pool - baseMonthlyConsumption * scaling[t] + simulationSupplementalFlows[t]) * (1 + avgMonthly);
          if (pool < dPoolFloor) pool = dPoolFloor;
        } else if (rescueFlows[t] > 0) {
          pool += rescueFlows[t];
        }
      }
    }

    return { deterministicPools: pools, avgAnnualReal };
  }, [blendedReturns, totalPool, baseMonthlyConsumption, dPoolFloor, scaling, simulationSupplementalFlows, rescueFlows, years]);

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
  };

  const yearlyData = deterministicPools.map((pool, y) => {
    const chadAge = 67 + y;
    const incomePlan = getRetirementIncomePlan(chadAge, pool > dPoolFloor, incomePlanConfig);
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

  const coupleSummary = getRetirementPhaseSummary(67, inhDuringCouple ? inheritanceChadAge : dChadPassesAge, incomePlanConfig);
  const postInheritanceSummary = inhDuringCouple ? getRetirementPhaseSummary(inheritanceChadAge, dChadPassesAge, incomePlanConfig) : null;
  const survivorSummary = getRetirementPhaseSummary(dChadPassesAge, endAge + 1, incomePlanConfig);

  // ── Effects ──────────────────────────────────────────────────────────

  // Sync withdrawal slider to optimal rate (90% survival) — chart default
  useEffect(() => {
    if (!isPwaMode && optimalRates.optimalRate > 0) {
      setWithdrawalRate(optimalRates.optimalRate);
    }
  }, [isPwaMode, optimalRates.optimalRate]);

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
    withdrawalRate, setWithdrawalRate,
    poolFloor, setPoolFloor,
    chadPassesAge, setChadPassesAge,
    inheritanceAmount, setInheritanceAmount,
    inheritanceSarahAge, setInheritanceSarahAge,
    showPwaIntro, pwaIntroReady, dismissPwaIntro,

    // Constants
    ageDiff, sarahTargetAge, years, survivorSpendRatio,
    endSavings, end401k, homeSaleNet, totalPool,
    trustMonthly, startingCoupleIncome,
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
