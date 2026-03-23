import React, { useMemo, useState } from 'react';
import { fmtFull } from '../model/formatters.js';
import { getDistributionPercentile } from '../model/pwaDistribution.js';
import { buildLegendItems } from './chartContract.js';

function normalizeSampleValue(sample) {
  return typeof sample === 'number' ? sample : sample?.totalSpendingTarget ?? 0;
}

function getPercentileRank(sortedValues, value) {
  if (sortedValues.length <= 1) return 50;
  if (value <= sortedValues[0]) return 0;
  if (value >= sortedValues[sortedValues.length - 1]) return 100;

  for (let i = 1; i < sortedValues.length; i++) {
    if (value <= sortedValues[i]) {
      const lower = sortedValues[i - 1];
      const upper = sortedValues[i];
      const weight = upper === lower ? 0 : (value - lower) / (upper - lower);
      return (((i - 1) + weight) / (sortedValues.length - 1)) * 100;
    }
  }

  return 100;
}

export default function PwaDistributionChart({
  samples,
  selectedWithdrawal,
  basePercentile,
  lowerTolerancePercentile,
  upperTolerancePercentile,
  bequestTarget = 0,
  testIdPrefix = 'pwa-distribution',
}) {
  const [tooltip, setTooltip] = useState(null);

  const chart = useMemo(() => {
    const sortedValues = Array.from(samples || [], normalizeSampleValue)
      .filter(value => Number.isFinite(value))
      .sort((a, b) => a - b);

    if (sortedValues.length === 0) {
      return {
        sortedValues,
        bins: [],
        min: 0,
        max: 0,
        lowerWithdrawal: 0,
        medianWithdrawal: 0,
        upperWithdrawal: 0,
        selectedPercentileRank: 0,
        maxCount: 1,
      };
    }

    const min = sortedValues[0];
    const max = sortedValues[sortedValues.length - 1];
    const range = Math.max(1, max - min);
    const binCount = Math.min(18, Math.max(8, Math.round(Math.sqrt(sortedValues.length))));
    const binWidth = range / binCount;
    const bins = Array.from({ length: binCount }, (_, index) => ({
      index,
      start: min + index * binWidth,
      end: index === binCount - 1 ? max : min + (index + 1) * binWidth,
      count: 0,
    }));

    for (const value of sortedValues) {
      const index = Math.min(binCount - 1, Math.floor((value - min) / binWidth));
      bins[index].count++;
    }

    return {
      sortedValues,
      bins,
      min,
      max,
      lowerWithdrawal: getDistributionPercentile(sortedValues, lowerTolerancePercentile),
      medianWithdrawal: getDistributionPercentile(sortedValues, 50),
      upperWithdrawal: getDistributionPercentile(sortedValues, upperTolerancePercentile),
      selectedPercentileRank: getPercentileRank(sortedValues, selectedWithdrawal),
      maxCount: Math.max(1, ...bins.map(bin => bin.count)),
    };
  }, [samples, selectedWithdrawal, lowerTolerancePercentile, upperTolerancePercentile]);

  if (chart.sortedValues.length === 0) {
    return (
      <div data-testid={`${testIdPrefix}-empty`} style={{
        background: '#0f172a',
        borderRadius: 8,
        padding: '12px 14px',
        border: '1px solid #334155',
        color: '#94a3b8',
        fontSize: 11,
        lineHeight: 1.45,
      }}>
        No PWA distribution is available until the retirement pool is positive.
      </div>
    );
  }

  const svgW = 760;
  const svgH = 220;
  const padL = 48;
  const padR = 24;
  const padT = 18;
  const padB = 42;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;
  const valueRange = Math.max(1, chart.max - chart.min);
  const xScale = (value) => padL + ((value - chart.min) / valueRange) * plotW;
  const yScale = (count) => padT + (1 - count / chart.maxCount) * plotH;
  const markerDefs = [
    {
      label: `Selected (${Math.round(basePercentile)}th)`,
      shortLabel: 'Selected',
      value: selectedWithdrawal,
      color: '#4ade80',
      dash: null,
    },
    {
      label: 'Median',
      shortLabel: 'Median',
      value: chart.medianWithdrawal,
      color: '#60a5fa',
      dash: '5,4',
    },
    {
      label: `Band low (${Math.round(lowerTolerancePercentile)}th)`,
      shortLabel: 'Band low',
      value: chart.lowerWithdrawal,
      color: '#f59e0b',
      dash: '3,3',
    },
    {
      label: `Band high (${Math.round(upperTolerancePercentile)}th)`,
      shortLabel: 'Band high',
      value: chart.upperWithdrawal,
      color: '#f59e0b',
      dash: '3,3',
    },
  ];
  const legendItems = buildLegendItems(markerDefs.map((marker) => ({
    id: marker.shortLabel.toLowerCase().replace(/\s+/g, '-'),
    label: marker.shortLabel,
    color: marker.color,
    line: true,
    dash: marker.dash,
  })));

  return (
    <div
      data-testid={`${testIdPrefix}-container`}
      style={{
        background: '#0f172a',
        borderRadius: 8,
        padding: '12px 14px',
        border: '1px solid #334155',
        marginBottom: 12,
      }}
      onMouseLeave={() => setTooltip(null)}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 11, color: '#e2e8f0', fontWeight: 700 }}>
            Current PWA Distribution
          </div>
          <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2, lineHeight: 1.45 }}>
            Histogram of historical-cohort spending targets from the current balance and remaining horizon.
          </div>
        </div>
        <div style={{ textAlign: 'right', fontSize: 10, color: '#cbd5e1', lineHeight: 1.45, fontFamily: "'JetBrains Mono', monospace" }}>
          {chart.sortedValues.length.toLocaleString()} cohorts · {fmtFull(Math.round(chart.min))} to {fmtFull(Math.round(chart.max))}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
        {legendItems.map((item) => (
          <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 16, height: 0, borderTop: `2px ${item.dash ? 'dashed' : 'solid'} ${item.color}` }} />
            <span style={{ fontSize: 10, color: '#94a3b8' }}>{item.label}</span>
          </div>
        ))}
      </div>

      <div data-testid={`${testIdPrefix}-hover-surface`} style={{ position: 'relative' }}>
        <svg data-testid={`${testIdPrefix}-svg`} viewBox={`0 0 ${svgW} ${svgH}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
          {[0, Math.ceil(chart.maxCount / 2), chart.maxCount].map((count, idx) => (
            <g key={idx}>
              <line
                x1={padL}
                x2={svgW - padR}
                y1={yScale(count)}
                y2={yScale(count)}
                stroke={count === 0 ? '#475569' : '#1e293b'}
                strokeWidth={count === 0 ? 1 : 0.5}
              />
              <text
                x={padL - 8}
                y={yScale(count) + 4}
                textAnchor="end"
                fill="#94a3b8"
                fontSize="10"
                fontFamily="'JetBrains Mono', monospace"
              >
                {count}
              </text>
            </g>
          ))}

          {chart.bins.map((bin) => {
            const startX = xScale(bin.start);
            const endX = xScale(bin.end);
            const width = Math.max(2, endX - startX - 2);
            const y = yScale(bin.count);
            const height = padT + plotH - y;

            return (
              <rect
                key={bin.index}
                x={startX + 1}
                y={y}
                width={width}
                height={height}
                fill="#60a5fa"
                opacity="0.32"
                rx="2"
                onMouseEnter={() => setTooltip({
                  anchorX: ((startX + endX) / 2 / svgW) * 100,
                  anchorY: (y / svgH) * 100,
                  title: `${fmtFull(Math.round(bin.start))} - ${fmtFull(Math.round(bin.end))}`,
                  lines: [
                    `${bin.count} cohort${bin.count === 1 ? '' : 's'}`,
                    `Frequency ${(bin.count / chart.sortedValues.length * 100).toFixed(1)}%`,
                    `Bequest target ${fmtFull(bequestTarget)}`,
                  ],
                })}
              />
            );
          })}

          {markerDefs.map((marker, index) => {
            const x = xScale(marker.value);
            const labelY = padT + 12 + index * 14;
            return (
              <g
                key={marker.label}
                onMouseEnter={() => setTooltip({
                  anchorX: (x / svgW) * 100,
                  anchorY: 12,
                  title: marker.label,
                  lines: [
                    `${fmtFull(Math.round(marker.value))}/mo`,
                    marker.shortLabel === 'Selected'
                      ? `Percentile rank ${chart.selectedPercentileRank.toFixed(1)}`
                      : `${marker.label}`,
                    `Band ${fmtFull(Math.round(chart.lowerWithdrawal))} - ${fmtFull(Math.round(chart.upperWithdrawal))}`,
                    `Bequest target ${fmtFull(bequestTarget)}`,
                  ],
                })}
              >
                <line
                  x1={x}
                  x2={x}
                  y1={padT}
                  y2={padT + plotH}
                  stroke={marker.color}
                  strokeWidth={marker.shortLabel === 'Selected' ? 2.5 : 1.5}
                  strokeDasharray={marker.dash || undefined}
                />
                <text
                  x={x}
                  y={labelY}
                  textAnchor="middle"
                  fill={marker.color}
                  fontSize="10"
                  fontWeight="700"
                  fontFamily="'JetBrains Mono', monospace"
                >
                  {marker.shortLabel}
                </text>
              </g>
            );
          })}

          {[chart.min, chart.medianWithdrawal, chart.max].map((value, index) => (
            <g key={index}>
              <text
                x={xScale(value)}
                y={svgH - 16}
                textAnchor="middle"
                fill="#94a3b8"
                fontSize="10"
                fontFamily="'JetBrains Mono', monospace"
              >
                {fmtFull(Math.round(value))}
              </text>
            </g>
          ))}

          <text
            x={padL}
            y={svgH - 28}
            fill="#64748b"
            fontSize="10"
            fontFamily="'JetBrains Mono', monospace"
          >
            lower
          </text>
          <text
            x={xScale(chart.medianWithdrawal)}
            y={svgH - 28}
            textAnchor="middle"
            fill="#64748b"
            fontSize="10"
            fontFamily="'JetBrains Mono', monospace"
          >
            median
          </text>
          <text
            x={svgW - padR}
            y={svgH - 28}
            textAnchor="end"
            fill="#64748b"
            fontSize="10"
            fontFamily="'JetBrains Mono', monospace"
          >
            higher
          </text>
        </svg>

        {tooltip && (
          <div style={{
            position: 'absolute',
            left: `${Math.max(12, Math.min(tooltip.anchorX, 88))}%`,
            top: `${Math.max(8, Math.min(tooltip.anchorY, 58))}%`,
            transform: 'translate(-50%, -115%)',
            background: '#020617',
            border: '1px solid #475569',
            borderRadius: 6,
            padding: '8px 10px',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 12px rgba(0,0,0,0.45)',
            zIndex: 10,
          }}>
            <div style={{ fontSize: 11, color: '#e2e8f0', fontWeight: 700, marginBottom: 4 }}>
              {tooltip.title}
            </div>
            {tooltip.lines.map((line, index) => (
              <div
                key={index}
                style={{ fontSize: 10, color: '#cbd5e1', lineHeight: 1.4, fontFamily: "'JetBrains Mono', monospace" }}
              >
                {line}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
