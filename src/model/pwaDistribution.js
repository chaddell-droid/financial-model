import { getCohortLabel, getNumCohorts } from './historicalReturns.js';
import { computeSWR } from './ernWithdrawal.js';

function clampPercentile(percentile) {
  if (!Number.isFinite(percentile)) return 50;
  return Math.max(0, Math.min(100, percentile));
}

function sliceNumericSeries(series, start, end) {
  if (ArrayBuffer.isView(series)) return series.subarray(start, end);
  return series.slice(start, end);
}

function getSampleValue(sample) {
  return typeof sample === 'number' ? sample : sample.totalSpendingTarget;
}

function toSortedSampleValues(samples) {
  const values = Array.from(samples, getSampleValue);
  values.sort((a, b) => a - b);
  return Float64Array.from(values);
}

export function getDistributionPercentile(sortedSamples, percentile) {
  const values = ArrayBuffer.isView(sortedSamples)
    ? sortedSamples
    : toSortedSampleValues(sortedSamples);

  if (values.length === 0) return 0;

  const p = clampPercentile(percentile) / 100;
  const position = (values.length - 1) * p;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);

  if (lowerIndex === upperIndex) return values[lowerIndex];

  const weight = position - lowerIndex;
  return values[lowerIndex] + (values[upperIndex] - values[lowerIndex]) * weight;
}

export function buildPwaDistribution({
  blendedReturns,
  decisionMonth,
  horizonMonths,
  totalPool,
  bequestTarget,
  supplementalFlows,
  scaling,
}) {
  const effectiveHorizon = Math.min(
    horizonMonths,
    supplementalFlows.length,
    scaling.length,
  );
  const currentMonth = Math.max(0, Math.min(effectiveHorizon, Math.floor(decisionMonth || 0)));
  const remainingMonths = Math.max(0, effectiveHorizon - currentMonth);
  const sampleCount = remainingMonths > 0 ? getNumCohorts(remainingMonths) : 0;

  if (sampleCount <= 0) {
    return {
      decisionMonth: currentMonth,
      remainingMonths,
      sampleCount: 0,
      samples: [],
      sortedSampleValues: new Float64Array(0),
      min: 0,
      median: 0,
      max: 0,
    };
  }

  const remainingSupplementalFlows = sliceNumericSeries(supplementalFlows, currentMonth, effectiveHorizon);
  const remainingScaling = sliceNumericSeries(scaling, currentMonth, effectiveHorizon);
  const samples = new Array(sampleCount);

  for (let cohortStart = 0; cohortStart < sampleCount; cohortStart++) {
    const label = getCohortLabel(cohortStart);
    samples[cohortStart] = {
      cohortStart,
      year: label.year,
      month: label.month,
      totalSpendingTarget: computeSWR(
        blendedReturns,
        cohortStart,
        remainingMonths,
        remainingSupplementalFlows,
        remainingScaling,
        bequestTarget,
        totalPool,
      ),
    };
  }

  samples.sort((a, b) => a.totalSpendingTarget - b.totalSpendingTarget);
  const sortedSampleValues = Float64Array.from(samples, sample => sample.totalSpendingTarget);

  return {
    decisionMonth: currentMonth,
    remainingMonths,
    sampleCount,
    samples,
    sortedSampleValues,
    min: sortedSampleValues[0],
    median: getDistributionPercentile(sortedSampleValues, 50),
    max: sortedSampleValues[sortedSampleValues.length - 1],
  };
}

export function getPwaSummary(samples, {
  selectedPercentile,
  lowerTolerancePercentile,
  upperTolerancePercentile,
}) {
  const sortedSampleValues = ArrayBuffer.isView(samples)
    ? samples
    : toSortedSampleValues(samples);

  if (sortedSampleValues.length === 0) {
    return {
      sampleCount: 0,
      selectedPercentile: clampPercentile(selectedPercentile),
      lowerTolerancePercentile: clampPercentile(lowerTolerancePercentile),
      upperTolerancePercentile: clampPercentile(upperTolerancePercentile),
      selectedWithdrawal: 0,
      lowerToleranceWithdrawal: 0,
      median: 0,
      upperToleranceWithdrawal: 0,
      min: 0,
      max: 0,
    };
  }

  const boundedSelectedPercentile = clampPercentile(selectedPercentile);
  const boundedLowerTolerance = clampPercentile(lowerTolerancePercentile);
  const boundedUpperTolerance = clampPercentile(upperTolerancePercentile);

  return {
    sampleCount: sortedSampleValues.length,
    selectedPercentile: boundedSelectedPercentile,
    lowerTolerancePercentile: boundedLowerTolerance,
    upperTolerancePercentile: boundedUpperTolerance,
    selectedWithdrawal: getDistributionPercentile(sortedSampleValues, boundedSelectedPercentile),
    lowerToleranceWithdrawal: getDistributionPercentile(sortedSampleValues, boundedLowerTolerance),
    median: getDistributionPercentile(sortedSampleValues, 50),
    upperToleranceWithdrawal: getDistributionPercentile(sortedSampleValues, boundedUpperTolerance),
    min: sortedSampleValues[0],
    max: sortedSampleValues[sortedSampleValues.length - 1],
  };
}
