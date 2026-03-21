import { buildPwaDistribution, getPwaSummary } from './pwaDistribution.js';
import { deriveCurrentWithdrawalView, sliceRetirementContext } from './retirementIncome.js';

function normalizeStrategyConfig(strategyConfig = {}) {
  return {
    strategy: strategyConfig.strategy || 'fixed_percentile',
    previousWithdrawal: Number.isFinite(strategyConfig.previousWithdrawal) ? strategyConfig.previousWithdrawal : null,
    basePercentile: Number.isFinite(strategyConfig.basePercentile) ? strategyConfig.basePercentile : 50,
    lowerTolerancePercentile: Number.isFinite(strategyConfig.lowerTolerancePercentile) ? strategyConfig.lowerTolerancePercentile : 25,
    upperTolerancePercentile: Number.isFinite(strategyConfig.upperTolerancePercentile) ? strategyConfig.upperTolerancePercentile : 75,
  };
}

function getSortedSampleValues(distribution) {
  if (ArrayBuffer.isView(distribution)) return Float64Array.from(distribution).sort();
  if (distribution?.sortedSampleValues && ArrayBuffer.isView(distribution.sortedSampleValues)) {
    return distribution.sortedSampleValues;
  }
  if (Array.isArray(distribution)) return Float64Array.from(distribution).sort();
  if (Array.isArray(distribution?.samples)) {
    return Float64Array.from(distribution.samples, sample => sample.totalSpendingTarget).sort();
  }
  return new Float64Array(0);
}

function lowerBound(sortedValues, value) {
  let lo = 0;
  let hi = sortedValues.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (sortedValues[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function upperBound(sortedValues, value) {
  let lo = 0;
  let hi = sortedValues.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (sortedValues[mid] <= value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function getPercentileRank(sortedValues, value) {
  if (sortedValues.length === 0) return 0;
  if (sortedValues.length === 1) return 50;
  if (value <= sortedValues[0]) return 0;
  if (value >= sortedValues[sortedValues.length - 1]) return 100;

  const lowerIndex = lowerBound(sortedValues, value);
  const upperIndex = upperBound(sortedValues, value);

  if (lowerIndex < upperIndex) {
    const midpoint = (lowerIndex + upperIndex - 1) / 2;
    return midpoint / (sortedValues.length - 1) * 100;
  }

  const prevIndex = lowerIndex - 1;
  const nextIndex = lowerIndex;
  const prevValue = sortedValues[prevIndex];
  const nextValue = sortedValues[nextIndex];
  const weight = nextValue === prevValue ? 0 : (value - prevValue) / (nextValue - prevValue);
  return ((prevIndex + weight) / (sortedValues.length - 1)) * 100;
}

function getProbabilityNoCut(sortedValues, value) {
  if (sortedValues.length === 0) return 0;
  return (sortedValues.length - lowerBound(sortedValues, value)) / sortedValues.length;
}

function buildFallbackContext(horizonMonths, supplementalFlows, scaling) {
  const effectiveHorizon = Math.min(horizonMonths, supplementalFlows.length, scaling.length);
  const chadAges = new Float64Array(effectiveHorizon);
  const sarahAges = new Float64Array(effectiveHorizon);
  const phases = new Array(effectiveHorizon);
  const ssLabels = new Array(effectiveHorizon);
  const zeros = new Float64Array(effectiveHorizon);

  for (let t = 0; t < effectiveHorizon; t++) {
    chadAges[t] = 67 + t / 12;
    sarahAges[t] = 67 + t / 12;
    phases[t] = 'couple';
    ssLabels[t] = 'none';
  }

  return {
    horizonMonths: effectiveHorizon,
    supplementalFlows: ArrayBuffer.isView(supplementalFlows)
      ? supplementalFlows
      : Float64Array.from(supplementalFlows),
    scaling: ArrayBuffer.isView(scaling)
      ? scaling
      : Float64Array.from(scaling),
    guaranteedIncome: ArrayBuffer.isView(supplementalFlows)
      ? supplementalFlows
      : Float64Array.from(supplementalFlows),
    ssIncome: zeros,
    trustIncome: zeros,
    chadAges,
    sarahAges,
    phases,
    ssLabels,
  };
}

function truncateRetirementContext(context, horizonMonths) {
  return {
    ...context,
    horizonMonths,
    supplementalFlows: context.supplementalFlows.subarray(0, horizonMonths),
    scaling: context.scaling.subarray(0, horizonMonths),
    guaranteedIncome: context.guaranteedIncome.subarray(0, horizonMonths),
    ssIncome: context.ssIncome.subarray(0, horizonMonths),
    trustIncome: context.trustIncome.subarray(0, horizonMonths),
    chadAges: context.chadAges.subarray(0, horizonMonths),
    sarahAges: context.sarahAges.subarray(0, horizonMonths),
    phases: context.phases.slice(0, horizonMonths),
    ssLabels: context.ssLabels.slice(0, horizonMonths),
  };
}

function simulatePwaMonths({
  blendedReturns,
  start,
  months,
  totalSpendingTarget,
  supplementalFlows,
  scaling,
  initialPool,
}) {
  let pool = initialPool;
  const monthlyPools = new Array(months + 1);
  monthlyPools[0] = Math.round(pool);

  for (let t = 0; t < months; t++) {
    pool = (pool - totalSpendingTarget * scaling[t] + supplementalFlows[t]) * (1 + blendedReturns[start + t]);
    if (pool < 0) pool = 0;
    monthlyPools[t + 1] = Math.round(pool);
  }

  return { finalPool: Math.round(pool), monthlyPools };
}

export function selectPwaWithdrawal(distribution, strategyConfig = {}) {
  const sortedSampleValues = getSortedSampleValues(distribution);
  const config = normalizeStrategyConfig(strategyConfig);
  const summary = getPwaSummary(sortedSampleValues, {
    selectedPercentile: config.basePercentile,
    lowerTolerancePercentile: config.lowerTolerancePercentile,
    upperTolerancePercentile: config.upperTolerancePercentile,
  });
  const lowerBand = summary.lowerToleranceWithdrawal;
  const upperBand = summary.upperToleranceWithdrawal;
  const hasPrevious = Number.isFinite(config.previousWithdrawal);
  const withinBand = hasPrevious
    && config.previousWithdrawal >= lowerBand
    && config.previousWithdrawal <= upperBand;

  let selectedWithdrawal = summary.selectedWithdrawal;
  let selectedPercentile = summary.selectedPercentile;
  let reason = 'fixed_percentile';

  switch (config.strategy) {
    case 'sticky_median':
      if (withinBand) {
        selectedWithdrawal = config.previousWithdrawal;
        selectedPercentile = getPercentileRank(sortedSampleValues, selectedWithdrawal);
        reason = 'keep_within_band';
      } else {
        selectedWithdrawal = summary.median;
        selectedPercentile = 50;
        reason = hasPrevious ? 'recenter_to_median' : 'initial_median';
      }
      break;
    case 'sticky_quartile_nudge':
      if (!hasPrevious) {
        selectedWithdrawal = summary.selectedWithdrawal;
        selectedPercentile = summary.selectedPercentile;
        reason = 'initial_percentile';
      } else if (withinBand) {
        selectedWithdrawal = config.previousWithdrawal;
        selectedPercentile = getPercentileRank(sortedSampleValues, selectedWithdrawal);
        reason = 'keep_within_band';
      } else if (config.previousWithdrawal < lowerBand) {
        selectedWithdrawal = lowerBand;
        selectedPercentile = summary.lowerTolerancePercentile;
        reason = 'nudge_to_lower_band';
      } else {
        selectedWithdrawal = upperBand;
        selectedPercentile = summary.upperTolerancePercentile;
        reason = 'nudge_to_upper_band';
      }
      break;
    case 'fixed_percentile':
    default:
      selectedWithdrawal = summary.selectedWithdrawal;
      selectedPercentile = summary.selectedPercentile;
      reason = 'fixed_percentile';
      break;
  }

  return {
    strategy: config.strategy,
    reason,
    selectedWithdrawal,
    selectedPercentile,
    lowerTolerancePercentile: summary.lowerTolerancePercentile,
    upperTolerancePercentile: summary.upperTolerancePercentile,
    lowerToleranceWithdrawal: summary.lowerToleranceWithdrawal,
    medianWithdrawal: summary.median,
    upperToleranceWithdrawal: summary.upperToleranceWithdrawal,
    minWithdrawal: summary.min,
    maxWithdrawal: summary.max,
    previousWithdrawal: config.previousWithdrawal,
    previousWithinBand: withinBand,
    probabilityNoCut: getProbabilityNoCut(sortedSampleValues, selectedWithdrawal),
    cutOccurred: hasPrevious && selectedWithdrawal < config.previousWithdrawal,
  };
}

export function simulateAdaptivePwaStrategy({
  blendedReturns,
  cohortStart,
  horizonMonths,
  totalPool,
  bequestTarget,
  supplementalFlows,
  scaling,
  strategyConfig,
  retirementContext,
}) {
  const context = retirementContext || buildFallbackContext(horizonMonths, supplementalFlows, scaling);
  const effectiveHorizon = Math.min(
    horizonMonths,
    context.horizonMonths,
    context.supplementalFlows.length,
    context.scaling.length,
  );
  const scopedContext = context.horizonMonths === effectiveHorizon
    ? context
    : truncateRetirementContext(context, effectiveHorizon);

  if (cohortStart < 0 || cohortStart + effectiveHorizon > blendedReturns.length) {
    throw new Error('simulateAdaptivePwaStrategy requires a realized cohort that fits the remaining blended return history');
  }

  const config = normalizeStrategyConfig(strategyConfig);
  const monthlySchedule = new Float64Array(effectiveHorizon);
  const monthlyPools = new Array(effectiveHorizon + 1);
  const yearlyDecisions = [];
  let currentPool = totalPool;
  let currentMonth = 0;
  let previousWithdrawal = config.previousWithdrawal;

  monthlyPools[0] = Math.round(currentPool);

  while (currentMonth < effectiveHorizon) {
    const remainingContext = sliceRetirementContext(scopedContext, currentMonth);
    const decisionDistribution = buildPwaDistribution({
      blendedReturns,
      decisionMonth: currentMonth,
      horizonMonths: effectiveHorizon,
      totalPool: currentPool,
      bequestTarget,
      supplementalFlows: scopedContext.supplementalFlows,
      scaling: scopedContext.scaling,
    });
    const selection = selectPwaWithdrawal(decisionDistribution, {
      ...config,
      previousWithdrawal,
    });
    const currentView = deriveCurrentWithdrawalView(
      selection.selectedWithdrawal,
      remainingContext.currentGuaranteedIncome,
    );
    const decisionMonths = Math.min(12, remainingContext.remainingMonths);
    const yearSupplementalFlows = remainingContext.supplementalFlows.subarray(0, decisionMonths);
    const yearScaling = remainingContext.scaling.subarray(0, decisionMonths);
    const yearSimulation = simulatePwaMonths({
      blendedReturns,
      start: cohortStart + currentMonth,
      months: decisionMonths,
      totalSpendingTarget: selection.selectedWithdrawal,
      supplementalFlows: yearSupplementalFlows,
      scaling: yearScaling,
      initialPool: currentPool,
    });

    for (let t = 0; t < decisionMonths; t++) {
      monthlySchedule[currentMonth + t] = selection.selectedWithdrawal;
      monthlyPools[currentMonth + t + 1] = yearSimulation.monthlyPools[t + 1];
    }

    yearlyDecisions.push({
      yearIndex: yearlyDecisions.length,
      decisionMonth: currentMonth,
      monthsSimulated: decisionMonths,
      beginningBalance: Math.round(currentPool),
      endingBalance: yearSimulation.finalPool,
      selectedTotalSpendingTarget: selection.selectedWithdrawal,
      currentPortfolioDraw: currentView.currentPortfolioDraw,
      currentGuaranteedIncome: currentView.currentGuaranteedIncome,
      currentTotalIncome: currentView.currentTotalIncome,
      outsideIncomeReinvested: currentView.outsideIncomeReinvested,
      selectedPercentile: selection.selectedPercentile,
      probabilityNoCut: selection.probabilityNoCut,
      lowerToleranceWithdrawal: selection.lowerToleranceWithdrawal,
      medianWithdrawal: selection.medianWithdrawal,
      upperToleranceWithdrawal: selection.upperToleranceWithdrawal,
      reason: selection.reason,
      cutOccurred: selection.cutOccurred,
      currentPhase: remainingContext.currentPhase,
    });

    currentPool = yearSimulation.finalPool;
    previousWithdrawal = selection.selectedWithdrawal;
    currentMonth += decisionMonths;
  }

  return {
    strategy: config.strategy,
    basePercentile: config.basePercentile,
    lowerTolerancePercentile: config.lowerTolerancePercentile,
    upperTolerancePercentile: config.upperTolerancePercentile,
    cohortStart,
    horizonMonths: effectiveHorizon,
    monthlySchedule,
    monthlyPools,
    yearlyDecisions,
    cutCount: yearlyDecisions.filter(decision => decision.cutOccurred).length,
    finalPool: Math.round(currentPool),
  };
}
