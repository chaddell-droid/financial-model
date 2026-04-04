import { useState, memo } from 'react';
import { fmtFull } from '../model/formatters.js';
import { COLORS } from './chartUtils.js';
import SurfaceCard from '../components/ui/SurfaceCard.jsx';

const INCOME_LAYERS = [
  { key: 'poolDraw', label: 'Pool Draw', color: '#60a5fa' },
  { key: 'ssIncome', label: 'Social Security', color: '#34d399' },
  { key: 'trustIncome', label: 'Trust', color: '#a78bfa' },
];

const PHASE_COLORS = {
  chad: '#94a3b822',
  postInheritance: '#34d39922',
  survivor: '#f9731622',
};

function RetirementCompositionChart({ yearlyData, chadPassesAge, inheritanceChadAge, inhDuringCouple, hasInheritance }) {
  const [tooltip, setTooltip] = useState(null);

  if (!yearlyData || yearlyData.length === 0) return null;

  const svgW = 800, svgH = 320;
  const padL = 60, padR = 20, padT = 20, padB = 50;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;

  const years = yearlyData.length;
  const barW = Math.max(2, (plotW / years) - 1);

  // Find max for scale
  const maxVal = Math.max(
    ...yearlyData.map(d => d.totalTarget || 0),
    ...yearlyData.map(d => (d.poolDraw || 0) + (d.ssIncome || 0) + (d.guaranteedIncome - d.ssIncome || 0)),
    1
  ) * 1.1;

  const yScale = (v) => padT + plotH - (v / maxVal) * plotH;
  const xOf = (i) => padL + (i / years) * plotW;

  // Y-axis ticks
  const tickStep = maxVal > 20000 ? 5000 : maxVal > 10000 ? 2000 : 1000;
  const yTicks = [];
  for (let v = 0; v <= maxVal; v += tickStep) yTicks.push(v);

  const handleMouseMove = (e, i) => {
    const d = yearlyData[i];
    if (!d) return;
    const rect = e.currentTarget.closest('svg').getBoundingClientRect();
    setTooltip({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      data: d,
    });
  };

  return (
    <SurfaceCard data-testid="retirement-composition-chart" padding="sm" style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.textSecondary, marginBottom: 4 }}>
        Retirement Income vs Spending
      </div>
      <div style={{ fontSize: 11, color: COLORS.textDim, marginBottom: 12 }}>
        Income sources stacked vs spending target across the full retirement horizon
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 8, fontSize: 10 }}>
        {INCOME_LAYERS.map(l => (
          <span key={l.key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: l.color, display: 'inline-block' }} />
            <span style={{ color: COLORS.textMuted }}>{l.label}</span>
          </span>
        ))}
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 10, height: 2, background: '#f87171', display: 'inline-block' }} />
          <span style={{ color: COLORS.textMuted }}>Spending Target</span>
        </span>
      </div>

      <svg viewBox={`0 0 ${svgW} ${svgH}`} style={{ width: '100%', height: 'auto' }}
        onMouseLeave={() => setTooltip(null)}>

        {/* Phase backgrounds */}
        {yearlyData.map((d, i) => (
          <rect key={`phase-${i}`}
            x={xOf(i)} y={padT}
            width={barW + 1} height={plotH}
            fill={PHASE_COLORS[d.phase] || 'transparent'}
          />
        ))}

        {/* Y-axis grid + labels */}
        {yTicks.map(v => (
          <g key={v}>
            <line x1={padL} x2={svgW - padR} y1={yScale(v)} y2={yScale(v)}
              stroke={COLORS.border} strokeWidth={0.5} opacity={0.3} />
            <text x={padL - 6} y={yScale(v) + 4} textAnchor="end"
              fill={COLORS.textDim} fontSize={9} fontFamily="'JetBrains Mono', monospace">
              ${Math.round(v / 1000)}K
            </text>
          </g>
        ))}

        {/* Stacked income bars */}
        {yearlyData.map((d, i) => {
          const trustIncome = Math.max(0, (d.guaranteedIncome || 0) - (d.ssIncome || 0));
          const layers = [
            { key: 'poolDraw', value: d.poolDraw || 0, color: INCOME_LAYERS[0].color },
            { key: 'ssIncome', value: d.ssIncome || 0, color: INCOME_LAYERS[1].color },
            { key: 'trustIncome', value: trustIncome, color: INCOME_LAYERS[2].color },
          ];
          let cumulative = 0;
          return (
            <g key={`bar-${i}`}
              onMouseMove={(e) => handleMouseMove(e, i)}
              style={{ cursor: 'crosshair' }}>
              {layers.map(layer => {
                const y0 = yScale(cumulative + layer.value);
                const h = yScale(cumulative) - y0;
                cumulative += layer.value;
                if (layer.value <= 0) return null;
                return (
                  <rect key={layer.key}
                    x={xOf(i)} y={y0}
                    width={barW} height={Math.max(0, h)}
                    fill={layer.color} opacity={0.85}
                  />
                );
              })}
            </g>
          );
        })}

        {/* Spending target line */}
        <path
          d={yearlyData.map((d, i) =>
            `${i === 0 ? 'M' : 'L'}${xOf(i) + barW / 2},${yScale(d.totalTarget || 0)}`
          ).join(' ')}
          fill="none" stroke="#f87171" strokeWidth={2} opacity={0.9}
        />

        {/* Phase labels */}
        {chadPassesAge && (
          <line x1={xOf(chadPassesAge - 67)} y1={padT}
            x2={xOf(chadPassesAge - 67)} y2={padT + plotH}
            stroke={COLORS.textDim} strokeWidth={1} strokeDasharray="4,3" />
        )}
        {inhDuringCouple && inheritanceChadAge && (
          <line x1={xOf(inheritanceChadAge - 67)} y1={padT}
            x2={xOf(inheritanceChadAge - 67)} y2={padT + plotH}
            stroke="#34d399" strokeWidth={1} strokeDasharray="4,3" />
        )}

        {/* X-axis labels */}
        {yearlyData.map((d, i) => (
          i % 5 === 0 ? (
            <text key={`x-${i}`} x={xOf(i) + barW / 2} y={svgH - padB + 16}
              textAnchor="middle" fill={COLORS.textDim} fontSize={9}
              fontFamily="'JetBrains Mono', monospace">
              {d.age}
            </text>
          ) : null
        ))}
        <text x={padL + plotW / 2} y={svgH - 4} textAnchor="middle"
          fill={COLORS.textDim} fontSize={10}>
          Chad's Age
        </text>
      </svg>

      {/* Tooltip */}
      {tooltip && tooltip.data && (
        <div style={{
          position: 'absolute',
          left: Math.min(tooltip.x + 12, svgW - 180),
          top: tooltip.y - 10,
          background: '#0f172aee',
          border: `1px solid ${COLORS.border}`,
          borderRadius: 6,
          padding: '8px 10px',
          fontSize: 11,
          color: COLORS.textSecondary,
          pointerEvents: 'none',
          zIndex: 10,
          fontFamily: "'JetBrains Mono', monospace",
          lineHeight: 1.6,
          minWidth: 160,
        }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>
            Chad {tooltip.data.age} / Sarah {tooltip.data.sarahAge}
            {tooltip.data.phase === 'survivor' ? ' (survivor)' : ''}
            {tooltip.data.isInheritanceYear ? ' — Inheritance' : ''}
          </div>
          <div style={{ color: '#f87171' }}>Target: {fmtFull(tooltip.data.totalTarget)}/mo</div>
          <div style={{ color: INCOME_LAYERS[0].color }}>Pool draw: {fmtFull(tooltip.data.poolDraw)}/mo</div>
          <div style={{ color: INCOME_LAYERS[1].color }}>SS: {fmtFull(tooltip.data.ssIncome)}/mo ({tooltip.data.ssLabel})</div>
          <div style={{ color: INCOME_LAYERS[2].color }}>Trust: {fmtFull(Math.max(0, (tooltip.data.guaranteedIncome || 0) - (tooltip.data.ssIncome || 0)))}/mo</div>
          {tooltip.data.savedToPool > 0 && (
            <div style={{ color: COLORS.textDim, marginTop: 4 }}>
              +{fmtFull(tooltip.data.savedToPool)}/mo reinvested
            </div>
          )}
          <div style={{ color: COLORS.textDim, marginTop: 4 }}>Pool: {fmtFull(tooltip.data.pool)}</div>
        </div>
      )}
    </SurfaceCard>
  );
}

export default memo(RetirementCompositionChart);
