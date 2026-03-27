import { useState, useCallback } from 'react';

/**
 * Shared tooltip hook for SVG charts.
 *
 * Handles closest-point detection and percentage-based positioning.
 * The caller provides data, x-accessor (maps dataPoint → SVG x coordinate),
 * optional y-accessor, and SVG dimensions.
 *
 * Returns: { tooltip, onMouseMove, onMouseLeave }
 *   tooltip: { index, pctX, pctY, dataPoint } | null
 *   onMouseMove: attach to <svg> onMouseMove
 *   onMouseLeave: attach to container onMouseLeave
 */
export function useChartTooltip({ data, xAccessor, yAccessor, svgW, svgH }) {
  const [tooltip, setTooltip] = useState(null);

  const onMouseMove = useCallback((e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left) / rect.width * svgW;

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
    const pctX = (xAccessor(dp) / svgW) * 100;
    const pctY = yAccessor ? (yAccessor(dp) / svgH) * 100 : 50;

    setTooltip({ index: closestIdx, pctX, pctY, dataPoint: dp });
  }, [data, xAccessor, yAccessor, svgW, svgH]);

  const onMouseLeave = useCallback(() => setTooltip(null), []);

  return { tooltip, onMouseMove, onMouseLeave };
}
