import React, { useRef, useState, memo } from 'react';
import useContainerWidth from '../hooks/useContainerWidth.js';
import { createScales, generateYTicks, COLORS } from './chartUtils.js';
import ChartYAxis from './ChartYAxis.jsx';
import SurfaceCard from '../components/ui/SurfaceCard.jsx';
import { fmtFull } from '../model/formatters.js';

const LINES = [
  { key: 'effectiveTaxRate', label: 'Effective Rate', color: COLORS.blue, dash: '' },
  { key: 'marginalRate', label: 'Marginal Rate', color: COLORS.amber, dash: '6,3' },
  { key: 'sarahEffectiveOnGross', label: "Sarah's Combined", color: COLORS.purple, dash: '' },
];

const fmtPct = (v) => (v * 100).toFixed(1) + '%';
const fmtPctAxis = (v) => (v * 100).toFixed(0) + '%';

function TaxRatesOverTimeChart({ schedule, selectedYear }) {
  const containerRef = useRef(null);
  const svgW = useContainerWidth(containerRef);
  const [hoverYear, setHoverYear] = useState(null);

  const svgH = 260;
  const padL = 54, padR = 20, padT = 20, padB = 34;

  const maxRate = Math.max(...schedule.flatMap(yr =>
    LINES.map(l => yr[l.key] || 0)
  ));
  const yMax = Math.min(Math.ceil(maxRate * 110) / 100, 1); // ceil to nearest 10%, cap at 100%
  const { xOf, yOf } = createScales(padL, padR, padT, padB, svgW, svgH, [0, schedule.length - 1], [0, yMax]);

  const tickStep = yMax > 0.4 ? 0.1 : yMax > 0.2 ? 0.05 : 0.02;
  const yTicks = generateYTicks(0, yMax, tickStep);

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left) / rect.width * svgW;
    const year = Math.round((mouseX - padL) / (svgW - padL - padR) * (schedule.length - 1));
    setHoverYear(Math.max(0, Math.min(schedule.length - 1, year)));
  };

  const yr0 = schedule[0];
  const yrN = schedule[schedule.length - 1];

  return (
    <SurfaceCard style={{ marginBottom: 0 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textSecondary, marginBottom: 8 }}>Tax Rates Over Time</div>

      {/* KPI strip — shows selected year detail when a year pill is active */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: 12 }}>
        {(() => {
          const sel = selectedYear != null && schedule[selectedYear] ? schedule[selectedYear] : null;
          const selLabel = sel ? `Y${selectedYear}` : null;
          return sel ? [
            { label: `${selLabel} Effective`, value: fmtPct(sel.effectiveTaxRate), color: COLORS.blue },
            { label: `${selLabel} Marginal`, value: fmtPct(sel.marginalRate), color: COLORS.amber },
            { label: `${selLabel} Sarah's Combined`, value: fmtPct(sel.sarahEffectiveOnGross), color: COLORS.purple },
          ] : [
            { label: 'Y0 Effective', value: fmtPct(yr0.effectiveTaxRate), color: COLORS.blue },
            { label: 'Y0 Marginal', value: fmtPct(yr0.marginalRate), color: COLORS.amber },
            { label: `Y${schedule.length - 1} Effective`, value: fmtPct(yrN.effectiveTaxRate), color: COLORS.blue },
          ];
        })().map((kpi, i) => (
          <div key={i} style={{ padding: '6px 10px', background: COLORS.bgDeep, borderRadius: 8, border: `1px solid ${COLORS.border}` }}>
            <div style={{ fontSize: 10, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{kpi.label}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: kpi.color, fontFamily: "'JetBrains Mono', monospace" }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 6, flexWrap: 'wrap' }}>
        {LINES.map(l => (
          <div key={l.key} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: COLORS.textMuted }}>
            <svg width="18" height="3"><line x1="0" y1="1.5" x2="18" y2="1.5" stroke={l.color} strokeWidth="2" strokeDasharray={l.dash} /></svg>
            {l.label}
          </div>
        ))}
      </div>

      <div ref={containerRef} style={{ position: 'relative' }}>
        <svg viewBox={`0 0 ${svgW} ${svgH}`} style={{ width: '100%', height: 'auto', display: 'block' }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverYear(null)}
        >
          <ChartYAxis ticks={yTicks} yOf={yOf} svgW={svgW} padL={padL} padR={padR} formatter={fmtPctAxis} />

          {/* X-axis labels */}
          {schedule.map((_, i) => (
            <text key={i} x={xOf(i)} y={svgH - 8} textAnchor="middle"
              fill={i === selectedYear ? COLORS.blue : COLORS.textMuted}
              fontWeight={i === selectedYear ? 700 : 400}
              fontSize="10" fontFamily="'JetBrains Mono', monospace">
              Y{i}
            </text>
          ))}

          {/* Selected year highlight band */}
          {selectedYear != null && selectedYear < schedule.length && (
            <rect
              x={xOf(selectedYear) - 14} y={padT}
              width={28} height={svgH - padT - padB}
              fill={COLORS.blue} opacity="0.08" rx="4"
            />
          )}

          {/* Lines */}
          {LINES.map(l => (
            <g key={l.key}>
              <polyline
                points={schedule.map((yr, i) => `${xOf(i)},${yOf(yr[l.key] || 0)}`).join(' ')}
                fill="none" stroke={l.color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"
                strokeDasharray={l.dash}
              />
              {schedule.map((yr, i) => (
                <circle key={i} cx={xOf(i)} cy={yOf(yr[l.key] || 0)}
                  r={i === selectedYear ? 5 : 3.5}
                  fill={l.color} stroke={i === selectedYear ? COLORS.textPrimary : COLORS.bgCard}
                  strokeWidth={i === selectedYear ? 2 : 1.5} />
              ))}
            </g>
          ))}

          {/* Hover crosshair */}
          {hoverYear !== null && (
            <line x1={xOf(hoverYear)} x2={xOf(hoverYear)} y1={padT} y2={svgH - padB}
              stroke={COLORS.textDim} strokeWidth="1" strokeDasharray="3,3" />
          )}
        </svg>

        {/* Tooltip */}
        {hoverYear !== null && schedule[hoverYear] && (
          <div style={{
            position: 'absolute',
            left: `${(xOf(hoverYear) / svgW) * 100}%`,
            top: 8,
            transform: 'translateX(-50%)',
            background: COLORS.bgDeep,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 8,
            padding: '8px 12px',
            fontSize: 11,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            zIndex: 10,
          }}>
            <div style={{ fontWeight: 700, color: COLORS.textPrimary, marginBottom: 4 }}>Year {hoverYear}</div>
            {LINES.map(l => (
              <div key={l.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                <span style={{ color: COLORS.textMuted }}>{l.label}</span>
                <span style={{ color: l.color, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>{fmtPct(schedule[hoverYear][l.key] || 0)}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginTop: 4, borderTop: `1px solid ${COLORS.border}`, paddingTop: 4 }}>
              <span style={{ color: COLORS.textMuted }}>AGI</span>
              <span style={{ color: COLORS.textSecondary, fontFamily: "'JetBrains Mono', monospace" }}>{fmtFull(schedule[hoverYear].fullTax.agi)}</span>
            </div>
          </div>
        )}
      </div>
    </SurfaceCard>
  );
}

export default memo(TaxRatesOverTimeChart);
