import React, { useState } from 'react';
import { fmt, fmtFull } from '../model/formatters.js';
import { createScales, generateYTicks, autoTickStep } from './chartUtils.js';
import Slider from '../components/Slider.jsx';

export default function NetWorthChart({
  savingsData, wealthData,
  starting401k, return401k, homeEquity, homeAppreciation,
  presentMode, onFieldChange,
}) {
  const [tooltip, setTooltip] = useState(null);

  const startingSavings = savingsData[0]?.balance || 0;
  const endSavings = savingsData[savingsData.length - 1]?.balance || 0;
  const end401k = wealthData[wealthData.length - 1]?.balance401k || 0;
  const endHome = wealthData[wealthData.length - 1]?.homeEquity || 0;
  const startNetWorth = startingSavings + (starting401k || 0) + (homeEquity || 0);
  const endNetWorth = endSavings + end401k + endHome;

  const svgW = 800, svgH = 340;
  const padL = 60, padR = 80, padT = 20, padB = 30;

  // Compute total net worth at each month for scaling
  const maxVal = Math.max(...wealthData.map((w, i) => {
    const sav = savingsData[i]?.balance || 0;
    return sav + w.balance401k + w.homeEquity;
  }));
  const minVal = Math.min(0, ...savingsData.map(d => d.balance));
  const yMax = maxVal * 1.05;
  const yMin = Math.min(minVal, 0);

  const { xOf, yOf } = createScales(padL, padR, padT, padB, svgW, svgH, [0, 72], [yMin, yMax]);

  const yRange = yMax - yMin;
  const tickStep = autoTickStep(yRange);
  const yTicks = generateYTicks(yMin, yMax, tickStep);

  // Build paths
  const savPath = savingsData.map(d => `${xOf(d.month)},${yOf(d.balance)}`).join(' L ');
  const k401Path = wealthData.map(d => `${xOf(d.month)},${yOf(d.balance401k)}`).join(' L ');
  const homePath = wealthData.map(d => `${xOf(d.month)},${yOf(d.homeEquity)}`).join(' L ');
  const totalPath = wealthData.map((w, i) => {
    const sav = savingsData[i]?.balance || 0;
    return `${xOf(w.month)},${yOf(sav + w.balance401k + w.homeEquity)}`;
  }).join(' L ');

  const lines = [
    { path: `M ${savPath}`, color: '#4ade80', label: 'Savings', endVal: endSavings },
    { path: `M ${k401Path}`, color: '#60a5fa', label: '401k', endVal: end401k },
    { path: `M ${homePath}`, color: '#f59e0b', label: 'Home', endVal: endHome },
    { path: `M ${totalPath}`, color: '#e2e8f0', label: 'Total', endVal: endNetWorth, dashed: true },
  ];

  const k401Change = end401k - (starting401k || 0);
  const homeChange = endHome - (homeEquity || 0);
  const keyCards = [
    { label: 'Starting Net Worth', value: fmtFull(startNetWorth), color: '#e2e8f0' },
    { label: '6-Year Net Worth', value: fmtFull(endNetWorth), color: endNetWorth >= startNetWorth ? '#4ade80' : '#f87171' },
    { label: '401k Growth', value: (k401Change >= 0 ? '+' : '') + fmtFull(k401Change), color: k401Change >= 0 ? '#60a5fa' : '#f87171' },
    { label: 'Home Appreciation', value: (homeChange >= 0 ? '+' : '') + fmtFull(homeChange), color: '#f59e0b' },
  ];

  return (
    <div style={{
      background: '#1e293b', borderRadius: 12, padding: '20px 16px',
      border: '1px solid #334155', marginBottom: 24,
    }}>
      <h3 style={{ fontSize: 14, color: '#e2e8f0', margin: 0, marginBottom: 8, fontWeight: 600 }}>
        Net Worth Projection
      </h3>

      {/* Key numbers strip */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 16, flexWrap: 'wrap' }}>
        {keyCards.map((item, i) => (
          <div key={i} style={{
            flex: 1, minWidth: 100,
            background: '#0f172a', borderRadius: 6, padding: '6px 10px',
            border: '1px solid #1e293b',
          }}>
            <div style={{ fontSize: 9, color: '#64748b', marginBottom: 2 }}>{item.label}</div>
            <div style={{
              fontSize: 14, fontWeight: 700, color: item.color,
              fontFamily: "'JetBrains Mono', monospace",
            }}>
              {item.value}
            </div>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div style={{ position: 'relative' }} onMouseLeave={() => setTooltip(null)}>
        <svg viewBox={`0 0 ${svgW} ${svgH}`} style={{ width: '100%', height: 'auto', display: 'block' }}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const mouseX = (e.clientX - rect.left) / rect.width * svgW;
            let closestIdx = 0;
            let closestDist = Infinity;
            for (let i = 0; i < wealthData.length; i++) {
              const dist = Math.abs(xOf(wealthData[i].month) - mouseX);
              if (dist < closestDist) { closestDist = dist; closestIdx = i; }
            }
            const w = wealthData[closestIdx];
            const sav = savingsData[closestIdx]?.balance || 0;
            const total = sav + w.balance401k + w.homeEquity;
            const pctX = (xOf(w.month) / svgW) * 100;
            const pctY = (yOf(total) / svgH) * 100;
            setTooltip({ pctX, pctY, month: w.month, savings: sav, bal401k: w.balance401k, home: w.homeEquity, total });
          }}>

          {/* Grid lines */}
          {yTicks.map((v, i) => (
            <g key={i}>
              <line x1={padL} x2={svgW - padR} y1={yOf(v)} y2={yOf(v)}
                stroke={v === 0 ? '#475569' : '#1e293b'} strokeWidth={v === 0 ? 1.5 : 0.5} />
              <text x={padL - 6} y={yOf(v) + 3} textAnchor="end"
                fill="#64748b" fontSize="10" fontFamily="'JetBrains Mono', monospace">
                {fmt(v)}
              </text>
            </g>
          ))}

          {/* Lines */}
          {lines.map((l, i) => (
            <path key={i} d={l.path} fill="none" stroke={l.color} strokeWidth={l.dashed ? 2 : 2.5}
              strokeLinejoin="round" strokeLinecap="round"
              strokeDasharray={l.dashed ? '6,4' : undefined}
              opacity={l.dashed ? 0.7 : 1} />
          ))}

          {/* Savings depleted marker */}
          {(() => {
            const savZeroIdx = savingsData.findIndex((d, i) => i > 0 && d.balance <= 0);
            if (savZeroIdx < 0) return null;
            const m = savingsData[savZeroIdx].month;
            return (
              <g>
                <line x1={xOf(m)} x2={xOf(m)} y1={padT} y2={svgH - padB}
                  stroke="#4ade80" strokeWidth="1" strokeDasharray="4,3" opacity="0.6" />
                <text x={xOf(m) + 4} y={padT + 12}
                  fill="#4ade80" fontSize="10" fontWeight="600" fontFamily="'JetBrains Mono', monospace">
                  Savings depleted
                </text>
                <text x={xOf(m) + 4} y={padT + 22}
                  fill="#4ade80" fontSize="10" fontWeight="600" fontFamily="'JetBrains Mono', monospace">
                  → 401k drawdown
                </text>
              </g>
            );
          })()}

          {/* 401k depleted marker */}
          {(() => {
            const k401ZeroIdx = wealthData.findIndex((w, i) => i > 0 && w.balance401k <= 0);
            if (k401ZeroIdx < 0) return null;
            const m = wealthData[k401ZeroIdx].month;
            return (
              <g>
                <line x1={xOf(m)} x2={xOf(m)} y1={padT} y2={svgH - padB}
                  stroke="#f87171" strokeWidth="1" strokeDasharray="4,3" opacity="0.6" />
                <text x={xOf(m) + 4} y={padT + 36}
                  fill="#f87171" fontSize="10" fontWeight="600" fontFamily="'JetBrains Mono', monospace">
                  401k depleted
                </text>
                <text x={xOf(m) + 4} y={padT + 46}
                  fill="#f87171" fontSize="10" fontWeight="600" fontFamily="'JetBrains Mono', monospace">
                  → home equity (HELOC)
                </text>
              </g>
            );
          })()}

          {/* Home equity depleted marker */}
          {(() => {
            const homeZeroIdx = wealthData.findIndex((w, i) => i > 0 && w.homeEquity <= 0);
            if (homeZeroIdx < 0) return null;
            const m = wealthData[homeZeroIdx].month;
            return (
              <g>
                <line x1={xOf(m)} x2={xOf(m)} y1={padT} y2={svgH - padB}
                  stroke="#f87171" strokeWidth="1.5" strokeDasharray="4,3" />
                <text x={xOf(m) + 4} y={padT + 60}
                  fill="#f87171" fontSize="10" fontWeight="700" fontFamily="'JetBrains Mono', monospace">
                  Home equity depleted
                </text>
              </g>
            );
          })()}

          {/* Endpoint labels */}
          {lines.map((l, i) => (
            <text key={i} x={svgW - padR + 6} y={yOf(l.endVal) + 4}
              fill={l.color} fontSize="10" fontWeight="600"
              fontFamily="'JetBrains Mono', monospace">
              {fmt(l.endVal)}
            </text>
          ))}

          {/* Hover dot */}
          {tooltip && (
            <circle cx={xOf(tooltip.month)} cy={yOf(tooltip.total)} r="5"
              fill="#e2e8f0" stroke="#f8fafc" strokeWidth="2" />
          )}

          {/* X-axis labels */}
          {savingsData.filter(d => d.month % 12 === 0).map((d, i) => (
            <text key={i} x={xOf(d.month)} y={svgH - 5} textAnchor="middle"
              fill="#64748b" fontSize="10" fontFamily="'JetBrains Mono', monospace">
              {d.month === 0 ? 'M0' : `Y${d.month / 12}`}
            </text>
          ))}
        </svg>

        {/* Tooltip */}
        {tooltip && (
          <div style={{
            position: 'absolute',
            left: `${tooltip.pctX}%`,
            top: `${tooltip.pctY}%`,
            transform: 'translate(-50%, -120%)',
            background: '#0f172a',
            border: '1px solid #475569',
            borderRadius: 6,
            padding: '8px 12px',
            pointerEvents: 'none',
            zIndex: 10,
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
          }}>
            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>
              Month {tooltip.month} ({tooltip.month < 12 ? `${tooltip.month}mo` : `Y${(tooltip.month / 12).toFixed(1)}`})
            </div>
            {[
              { label: 'Savings', value: tooltip.savings, color: '#4ade80' },
              { label: '401k', value: tooltip.bal401k, color: '#60a5fa' },
              { label: 'Home', value: tooltip.home, color: '#f59e0b' },
              { label: 'Total', value: tooltip.total, color: '#e2e8f0' },
            ].map((row, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, fontSize: 12 }}>
                <span style={{ color: row.color }}>{row.label}</span>
                <span style={{ fontWeight: 700, color: row.color, fontFamily: "'JetBrains Mono', monospace" }}>
                  {fmtFull(row.value)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Legend */}
      <div style={{ marginTop: 8, display: 'flex', gap: 16, fontSize: 11 }}>
        {[
          { label: 'Liquid Savings', color: '#4ade80' },
          { label: '401k', color: '#60a5fa' },
          { label: 'Home Equity', color: '#f59e0b' },
          { label: 'Total Net Worth', color: '#e2e8f0', dashed: true },
        ].map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{
              width: 20, height: item.dashed ? 0 : 3,
              background: item.dashed ? undefined : item.color,
              borderTop: item.dashed ? `2px dashed ${item.color}` : undefined,
              borderRadius: 1,
            }} />
            <span style={{ color: '#94a3b8' }}>{item.label}</span>
          </div>
        ))}
      </div>

      {/* Sliders */}
      {!presentMode && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6, fontWeight: 600 }}>401k</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Slider label="Starting 401k balance" value={starting401k} onChange={onFieldChange('starting401k')}
              min={0} max={1000000} step={10000} color="#60a5fa" />
            <Slider label="Annual return" value={return401k} onChange={onFieldChange('return401k')}
              min={0} max={40} format={(v) => v + '%'} color="#60a5fa" />
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6, marginTop: 8, fontWeight: 600 }}>Home Equity</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Slider label="Home equity" value={homeEquity} onChange={onFieldChange('homeEquity')}
              min={200000} max={2000000} step={25000} color="#f59e0b" />
            <Slider label="Annual appreciation" value={homeAppreciation} onChange={onFieldChange('homeAppreciation')}
              min={0} max={10} step={0.5} format={(v) => v + '%'} color="#f59e0b" />
          </div>
        </div>
      )}
    </div>
  );
}
