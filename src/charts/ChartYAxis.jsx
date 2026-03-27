import React from 'react';
import { COLORS } from './chartUtils.js';
import { fmt } from '../model/formatters.js';

/**
 * Shared Y-axis component for SVG charts.
 * Renders grid lines (bold at zero) and tick labels.
 * Must be placed inside an <svg> parent.
 */
export default function ChartYAxis({ ticks, yOf, svgW, padL, padR, formatter = fmt }) {
  return ticks.map((v, i) => (
    <g key={i}>
      <line
        x1={padL} x2={svgW - padR}
        y1={yOf(v)} y2={yOf(v)}
        stroke={v === 0 ? COLORS.borderLight : COLORS.bgCard}
        strokeWidth={v === 0 ? 1.5 : 0.5}
      />
      <text
        x={padL - 6} y={yOf(v) + 3}
        textAnchor="end"
        fill={COLORS.textDim}
        fontSize="10"
        fontFamily="'JetBrains Mono', monospace"
      >
        {formatter(v)}
      </text>
    </g>
  ));
}
