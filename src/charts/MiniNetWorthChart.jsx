import React, { memo, useRef } from 'react';
import { fmt } from '../model/formatters.js';
import { createScales, generateYTicks, autoTickStep, COLORS } from './chartUtils.js';
import { buildLegendItems } from './chartContract.js';
import ChartYAxis from './ChartYAxis.jsx';
import ChartXAxis from './ChartXAxis.jsx';
import useContainerWidth from '../hooks/useContainerWidth.js';

function MiniNetWorthChart({ savingsData, wealthData, onTabChange }) {
  const containerRef = useRef(null);
  const svgW = useContainerWidth(containerRef);

  const endSavings = savingsData[savingsData.length - 1]?.balance || 0;
  const end401k = wealthData[wealthData.length - 1]?.balance401k || 0;
  const endHome = wealthData[wealthData.length - 1]?.homeEquity || 0;
  const endNetWorth = endSavings + end401k + endHome;

  const svgH = 180;
  const padL = 50, padR = 60, padT = 12, padB = 24;

  const primaryTotals = wealthData.map((w, i) => {
    const sav = savingsData[i]?.balance || 0;
    return sav + w.balance401k + w.homeEquity;
  });
  const maxVal = Math.max(...primaryTotals) * 1.05;
  const minVal = Math.min(0, ...savingsData.map(d => d.balance));

  const maxMonth = savingsData[savingsData.length - 1]?.month || 72;
  const { xOf, yOf } = createScales(padL, padR, padT, padB, svgW, svgH, [0, maxMonth], [minVal, maxVal]);

  const yRange = maxVal - minVal;
  const tickStep = autoTickStep(yRange);
  const yTicks = generateYTicks(minVal, maxVal, tickStep);

  const savPath = savingsData.map(d => `${xOf(d.month)},${yOf(d.balance)}`).join(' L ');
  const k401Path = wealthData.map(d => `${xOf(d.month)},${yOf(d.balance401k)}`).join(' L ');
  const homePath = wealthData.map(d => `${xOf(d.month)},${yOf(d.homeEquity)}`).join(' L ');
  const totalPath = wealthData.map((w, i) => {
    const sav = savingsData[i]?.balance || 0;
    return `${xOf(w.month)},${yOf(sav + w.balance401k + w.homeEquity)}`;
  }).join(' L ');

  const lines = [
    { path: `M ${savPath}`, color: COLORS.green, label: 'Savings', endVal: endSavings },
    { path: `M ${k401Path}`, color: COLORS.blue, label: '401k', endVal: end401k },
    { path: `M ${homePath}`, color: COLORS.amber, label: 'Home', endVal: endHome },
    { path: `M ${totalPath}`, color: COLORS.textSecondary, label: 'Total', endVal: endNetWorth, dashed: true },
  ];

  const legendItems = buildLegendItems([
    { id: 'savings', label: 'Savings', color: COLORS.green },
    { id: '401k', label: '401k', color: COLORS.blue },
    { id: 'home', label: 'Home', color: COLORS.amber },
    { id: 'total', label: 'Total', color: COLORS.textSecondary, line: true, dash: true },
  ]);

  return (
    <div ref={containerRef} style={{
      background: COLORS.bgCard, borderRadius: 12, padding: '16px 12px 12px',
      border: `1px solid ${COLORS.border}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <h3 style={{ fontSize: 13, color: COLORS.textSecondary, margin: 0, fontWeight: 600 }}>
          Net Worth
        </h3>
        {onTabChange && (
          <button onClick={() => onTabChange('risk')} style={{
            background: 'none', border: 'none', color: COLORS.textDim,
            fontSize: 10, cursor: 'pointer', padding: 0, textDecoration: 'underline',
          }}>
            Details →
          </button>
        )}
      </div>

      <svg viewBox={`0 0 ${svgW} ${svgH}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        <ChartYAxis ticks={yTicks} yOf={yOf} svgW={svgW} padL={padL} padR={padR} />
        {lines.map((l, i) => (
          <path key={i} d={l.path} fill="none" stroke={l.color} strokeWidth={l.dashed ? 1.5 : 2}
            strokeLinejoin="round" strokeLinecap="round"
            strokeDasharray={l.dashed ? '6,4' : undefined}
            opacity={l.dashed ? 0.7 : 1} />
        ))}
        {lines.map((l, i) => (
          <text key={`lbl-${i}`} x={svgW - padR + 4} y={yOf(l.endVal) + 3}
            fill={l.color} fontSize="9" fontWeight="600"
            fontFamily="'JetBrains Mono', monospace">
            {fmt(l.endVal)}
          </text>
        ))}
        <ChartXAxis data={savingsData} xOf={(m) => xOf(m)} svgH={svgH} />
      </svg>

      <div style={{ marginTop: 6, display: 'flex', gap: 12, fontSize: 10, justifyContent: 'center' }}>
        {legendItems.map((item) => (
          <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{
              width: 14, height: item.line ? 0 : 3,
              background: item.line ? undefined : item.color,
              borderTop: item.line ? `2px ${item.dash ? 'dashed' : 'solid'} ${item.color}` : undefined,
              borderRadius: 1,
            }} />
            <span style={{ color: COLORS.textMuted }}>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default memo(MiniNetWorthChart);
