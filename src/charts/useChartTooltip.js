import { useState, useCallback } from 'react';

/**
 * Pure core of the shared tooltip hook (exported for node tests).
 *
 * Finds the data point whose x-coordinate is closest to `mouseX` and returns
 * the next tooltip state. Returns `prev` UNCHANGED (same reference) when the
 * nearest point hasn't moved — the prev-index bail-out (remediation 6.4) that
 * lets React skip the state update (and the re-render) for the vast majority
 * of mousemove events.
 */
export function computeTooltipState(prev, { data, xAccessor, yAccessor, svgW, svgH }, mouseX) {
  if (!data || data.length === 0) return null;

  let closestIdx = 0;
  let closestDist = Infinity;
  for (let i = 0; i < data.length; i++) {
    const dist = Math.abs(xAccessor(data[i]) - mouseX);
    if (dist < closestDist) {
      closestDist = dist;
      closestIdx = i;
    }
  }

  const dp = data[closestIdx];
  // Bail out only when BOTH the index and the underlying data point are
  // unchanged — if `data` was rebuilt, dataPoint identity differs and the
  // tooltip must refresh even at the same index.
  if (prev && prev.index === closestIdx && prev.dataPoint === dp) return prev;

  const pctX = (xAccessor(dp) / svgW) * 100;
  const pctY = yAccessor ? (yAccessor(dp) / svgH) * 100 : 50;

  return { index: closestIdx, pctX, pctY, dataPoint: dp };
}

/**
 * Shared tooltip hook for SVG charts.
 *
 * Handles closest-point detection and percentage-based positioning.
 * The caller provides data, x-accessor (maps dataPoint → SVG x coordinate),
 * optional y-accessor, and SVG dimensions.
 *
 * Returns: { tooltip, setTooltip, onMouseMove, onMouseLeave }
 *   tooltip: { index, pctX, pctY, dataPoint } | null
 *   onMouseMove: attach to <svg> onMouseMove
 *   onMouseLeave: attach to container onMouseLeave
 */
export function useChartTooltip({ data, xAccessor, yAccessor, svgW, svgH }) {
  const [tooltip, setTooltip] = useState(null);

  const onMouseMove = useCallback((e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left) / rect.width * svgW;
    setTooltip((prev) => computeTooltipState(prev, { data, xAccessor, yAccessor, svgW, svgH }, mouseX));
  }, [data, xAccessor, yAccessor, svgW, svgH]);

  const onMouseLeave = useCallback(() => setTooltip(null), []);

  return { tooltip, setTooltip, onMouseMove, onMouseLeave };
}
