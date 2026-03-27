import React from 'react';
import { COLORS } from './chartUtils.js';
import { formatModelTimeLabel } from './chartContract.js';

/**
 * Shared X-axis label component for SVG charts.
 * Renders labels at filtered data points (default: every 12 months).
 * Must be placed inside an <svg> parent.
 */
export default function ChartXAxis({
  data,
  xOf,
  svgH,
  filterFn = (d) => d.month % 12 === 0,
  labelFn = (d) => formatModelTimeLabel(d.month),
  monthAccessor = (d) => d.month,
}) {
  return data.filter(filterFn).map((d, i) => (
    <text
      key={i}
      x={xOf(monthAccessor(d))}
      y={svgH - 5}
      textAnchor="middle"
      fill={COLORS.textDim}
      fontSize="10"
      fontFamily="'JetBrains Mono', monospace"
    >
      {labelFn(d)}
    </text>
  ));
}
