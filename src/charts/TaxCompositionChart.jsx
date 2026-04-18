import React, { useRef, useState, memo } from 'react';
import useContainerWidth from '../hooks/useContainerWidth.js';
import { createScales, generateYTicks, autoTickStep, COLORS } from './chartUtils.js';
import ChartYAxis from './ChartYAxis.jsx';
import SurfaceCard from '../components/ui/SurfaceCard.jsx';
import { fmt, fmtFull } from '../model/formatters.js';

const SEGMENTS = [
  { key: 'fedNet', label: 'Federal Income Tax', color: COLORS.blue },
  { key: 'ss', label: 'Social Security', color: COLORS.amber },
  { key: 'med', label: 'Medicare', color: COLORS.green },
  { key: 'addlMed', label: 'Additional Medicare', color: COLORS.red },
];

function TaxCompositionChart({ schedule }) {
  const containerRef = useRef(null);
  const svgW = useContainerWidth(containerRef);
  const [hoverYear, setHoverYear] = useState(null);

  const svgH = 300;
  const padL = 54, padR = 20, padT = 20, padB = 34;

  // Build per-year segment data
  const yearData = schedule.map(yr => {
    const ft = yr.fullTax;
    return {
      fedNet: Math.max(0, ft.fedTax - ft.totalCredits),
      ss: ft.ssTax,
      med: ft.medTax,
      addlMed: ft.addlMedicareOwed,
      total: yr.annualTotalTax,
      effectiveRate: yr.effectiveTaxRate,
    };
  });

  const maxTotal = Math.max(...yearData.map(d => d.total));
  const yMax = maxTotal * 1.1;
  const tickStep = autoTickStep(yMax);
  const yTicks = generateYTicks(0, yMax, tickStep);
  const { xOf, yOf } = createScales(padL, padR, padT, padB, svgW, svgH, [-0.5, schedule.length - 0.5], [0, yMax]);

  const barW = Math.min(50, (svgW - padL - padR) / schedule.length * 0.65);

  const fmtPct = (v) => (v * 100).toFixed(1) + '%';

  return (
    <SurfaceCard style={{ marginBottom: 0 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textSecondary, marginBottom: 8 }}>Tax Composition by Year</div>

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: 12 }}>
        {[
          { label: 'Y0 Total Tax', value: fmtFull(yearData[0].total), color: COLORS.red },
          { label: `Y${schedule.length - 1} Total Tax`, value: fmtFull(yearData[yearData.length - 1].total), color: COLORS.red },
          { label: 'Growth', value: fmtFull(yearData[yearData.length - 1].total - yearData[0].total), color: COLORS.amber },
        ].map((kpi, i) => (
          <div key={i} style={{ padding: '6px 10px', background: COLORS.bgDeep, borderRadius: 8, border: `1px solid ${COLORS.border}` }}>
            <div style={{ fontSize: 10, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{kpi.label}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: kpi.color, fontFamily: "'JetBrains Mono', monospace" }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 6, flexWrap: 'wrap' }}>
        {SEGMENTS.map(s => (
          <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: COLORS.textMuted }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: s.color }} />
            {s.label}
          </div>
        ))}
      </div>

      <div ref={containerRef} style={{ position: 'relative' }}>
        <svg viewBox={`0 0 ${svgW} ${svgH}`} style={{ width: '100%', height: 'auto', display: 'block' }}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const mouseX = (e.clientX - rect.left) / rect.width * svgW;
            const year = Math.round((mouseX - padL) / (svgW - padL - padR) * (schedule.length - 1));
            setHoverYear(Math.max(0, Math.min(schedule.length - 1, year)));
          }}
          onMouseLeave={() => setHoverYear(null)}
        >
          <ChartYAxis ticks={yTicks} yOf={yOf} svgW={svgW} padL={padL} padR={padR} />

          {/* X-axis labels */}
          {schedule.map((_, i) => (
            <text key={i} x={xOf(i)} y={svgH - 8} textAnchor="middle" fill={COLORS.textMuted} fontSize="10" fontFamily="'JetBrains Mono', monospace">
              Y{i}
            </text>
          ))}

          {/* Stacked bars */}
          {yearData.map((yr, i) => {
            const cx = xOf(i);
            let runningY = yOf(0);
            return (
              <g key={i}>
                {SEGMENTS.map(seg => {
                  const val = yr[seg.key];
                  if (val <= 0) return null;
                  const barH = yOf(0) - yOf(val);
                  const y = runningY - barH;
                  runningY = y;
                  return (
                    <rect key={seg.key} x={cx - barW / 2} y={y} width={barW} height={barH}
                      fill={seg.color} rx={2}
                      opacity={hoverYear !== null && hoverYear !== i ? 0.3 : 1}
                    />
                  );
                })}
              </g>
            );
          })}

          {/* Hover crosshair */}
          {hoverYear !== null && (
            <line x1={xOf(hoverYear)} x2={xOf(hoverYear)} y1={padT} y2={svgH - padB}
              stroke={COLORS.textDim} strokeWidth="1" strokeDasharray="3,3" />
          )}
        </svg>

        {/* Tooltip */}
        {hoverYear !== null && yearData[hoverYear] && (
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
            {SEGMENTS.map(s => {
              const val = yearData[hoverYear][s.key];
              if (val <= 0) return null;
              const pct = yearData[hoverYear].total > 0 ? (val / yearData[hoverYear].total * 100).toFixed(1) : '0';
              return (
                <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 1 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: s.color, flexShrink: 0 }} />
                  <span style={{ color: COLORS.textMuted, flex: 1 }}>{s.label}</span>
                  <span style={{ color: s.color, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>{fmtFull(val)}</span>
                  <span style={{ color: COLORS.textDim, fontSize: 10 }}>{pct}%</span>
                </div>
              );
            })}
            <div style={{ borderTop: `1px solid ${COLORS.border}`, marginTop: 4, paddingTop: 4, display: 'flex', justifyContent: 'space-between', gap: 16 }}>
              <span style={{ color: COLORS.textMuted, fontWeight: 600 }}>Total Tax</span>
              <span style={{ color: COLORS.red, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>{fmtFull(yearData[hoverYear].total)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
              <span style={{ color: COLORS.textMuted }}>Effective Rate</span>
              <span style={{ color: COLORS.textSecondary, fontFamily: "'JetBrains Mono', monospace" }}>{fmtPct(yearData[hoverYear].effectiveRate)}</span>
            </div>
          </div>
        )}
      </div>
    </SurfaceCard>
  );
}

export default memo(TaxCompositionChart);
