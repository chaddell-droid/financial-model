import React, { useRef, useState, memo } from 'react';
import useContainerWidth from '../hooks/useContainerWidth.js';
import { createScales, generateYTicks, autoTickStep, COLORS } from './chartUtils.js';
import ChartYAxis from './ChartYAxis.jsx';
import SurfaceCard from '../components/ui/SurfaceCard.jsx';
import { fmt, fmtFull } from '../model/formatters.js';

const fmtPct = (v) => (v * 100).toFixed(1) + '%';

function TaxAttributionChart({ schedule }) {
  const containerRef = useRef(null);
  const svgW = useContainerWidth(containerRef);
  const [hoverYear, setHoverYear] = useState(null);

  const svgH = 280;
  const padL = 54, padR = 20, padT = 20, padB = 34;

  const maxTax = Math.max(...schedule.map(yr => yr.annualTotalTax));
  const yMax = maxTax * 1.1;
  const tickStep = autoTickStep(yMax);
  const yTicks = generateYTicks(0, yMax, tickStep);
  const { xOf, yOf } = createScales(padL, padR, padT, padB, svgW, svgH, [-0.5, schedule.length - 0.5], [0, yMax]);

  const groupW = Math.min(60, (svgW - padL - padR) / schedule.length * 0.7);
  const barW = groupW * 0.42;

  const yr0 = schedule[0];

  return (
    <SurfaceCard style={{ marginBottom: 0 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textSecondary, marginBottom: 8 }}>Tax Attribution: Sarah vs Chad</div>

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: 12 }}>
        {[
          { label: "Sarah's Monthly Set-Aside", value: fmtFull(Math.round(yr0.annualSarahTax / 12)), color: COLORS.amber },
          { label: "Sarah's Rate on Gross", value: fmtPct(yr0.sarahEffectiveOnGross), color: COLORS.purple },
          { label: "Chad's Y0 Tax", value: yr0.chadW2 > 0 ? fmtFull(yr0.annualChadTax) : '$0', color: COLORS.blue },
        ].map((kpi, i) => (
          <div key={i} style={{ padding: '6px 10px', background: COLORS.bgDeep, borderRadius: 8, border: `1px solid ${COLORS.border}` }}>
            <div style={{ fontSize: 10, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{kpi.label}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: kpi.color, fontFamily: "'JetBrains Mono', monospace" }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 6, flexWrap: 'wrap' }}>
        {[
          { label: "Sarah's Tax", color: COLORS.purple },
          { label: "Chad's Tax", color: COLORS.blue },
          { label: 'Total Tax', color: COLORS.red, dash: true },
        ].map(l => (
          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: COLORS.textMuted }}>
            {l.dash
              ? <svg width="18" height="3"><line x1="0" y1="1.5" x2="18" y2="1.5" stroke={l.color} strokeWidth="2" strokeDasharray="4,3" /></svg>
              : <div style={{ width: 10, height: 10, borderRadius: 2, background: l.color }} />
            }
            {l.label}
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

          {/* Grouped bars */}
          {schedule.map((yr, i) => {
            const cx = xOf(i);
            const sarahH = yOf(0) - yOf(yr.annualSarahTax);
            const chadH = yOf(0) - yOf(yr.annualChadTax);
            const dimmed = hoverYear !== null && hoverYear !== i;
            return (
              <g key={i} opacity={dimmed ? 0.3 : 1}>
                {/* Sarah bar (left) */}
                <rect x={cx - groupW / 2} y={yOf(yr.annualSarahTax)} width={barW} height={sarahH}
                  fill={COLORS.purple} rx={2} />
                {/* Chad bar (right) */}
                {yr.annualChadTax > 0 && (
                  <rect x={cx - groupW / 2 + barW + 2} y={yOf(yr.annualChadTax)} width={barW} height={chadH}
                    fill={COLORS.blue} rx={2} />
                )}
              </g>
            );
          })}

          {/* Total tax dashed line */}
          <polyline
            points={schedule.map((yr, i) => `${xOf(i)},${yOf(yr.annualTotalTax)}`).join(' ')}
            fill="none" stroke={COLORS.red} strokeWidth="2" strokeDasharray="6,3" strokeLinejoin="round"
          />
          {schedule.map((yr, i) => (
            <circle key={i} cx={xOf(i)} cy={yOf(yr.annualTotalTax)} r="3" fill={COLORS.red} stroke={COLORS.bgCard} strokeWidth="1.5" />
          ))}
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
            {[
              { label: "Sarah's Tax", val: schedule[hoverYear].annualSarahTax, color: COLORS.purple },
              { label: "Chad's Tax", val: schedule[hoverYear].annualChadTax, color: COLORS.blue },
            ].map(r => (
              <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                <span style={{ color: COLORS.textMuted }}>{r.label}</span>
                <span style={{ color: r.color, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>
                  {fmtFull(r.val)}
                  <span style={{ color: COLORS.textDim, fontSize: 10, marginLeft: 4 }}>
                    {schedule[hoverYear].annualTotalTax > 0 ? (r.val / schedule[hoverYear].annualTotalTax * 100).toFixed(0) + '%' : ''}
                  </span>
                </span>
              </div>
            ))}
            <div style={{ borderTop: `1px solid ${COLORS.border}`, marginTop: 4, paddingTop: 4, display: 'flex', justifyContent: 'space-between', gap: 16 }}>
              <span style={{ color: COLORS.textMuted }}>Monthly set-aside</span>
              <span style={{ color: COLORS.amber, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>{fmtFull(Math.round(schedule[hoverYear].annualSarahTax / 12))}/mo</span>
            </div>
          </div>
        )}
      </div>
    </SurfaceCard>
  );
}

export default memo(TaxAttributionChart);
