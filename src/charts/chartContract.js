import { TIMEFRAME_LABELS } from '../content/uiGlossary.js';

export function formatModelTimeLabel(month) {
  if (month <= 0) return TIMEFRAME_LABELS.modelStart;
  if (month % 12 === 0) return `Y${month / 12}`;
  return `M${month}`;
}

export function getSummaryTimeframeLabel(frame) {
  const labels = {
    today: TIMEFRAME_LABELS.today,
    current: TIMEFRAME_LABELS.currentAssumptions,
    steady: TIMEFRAME_LABELS.steadyState,
    horizon: TIMEFRAME_LABELS.sixYearHorizon,
  };
  return labels[frame] || frame;
}

export function buildLegendItems(items) {
  return items
    .filter(Boolean)
    .map((item, index) => ({
      id: item.id || `legend-${index}`,
      emphasis: 'secondary',
      ...item,
    }));
}

export const CHART_PRESENTATION = {
  minAnnotationFont: 12,
  requirePersistentSummary: true,
  hoverMustBeSupplemental: true,
  maxPrimaryAnnotations: 4,
};
