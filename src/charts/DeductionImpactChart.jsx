import React, { useRef, useState, memo } from 'react';
import useContainerWidth from '../hooks/useContainerWidth.js';
import { COLORS } from './chartUtils.js';
import SurfaceCard from '../components/ui/SurfaceCard.jsx';
import { fmtFull } from '../model/formatters.js';

function buildItems(yr) {
  const ft = yr.fullTax;
  const mr = ft.marginalRate;
  return [
    { label: 'SALT Deduction', amount: ft.saltDeductible, savings: ft.saltDeductible * mr },
    { label: 'Mortgage Interest', amount: ft.mortgageInt || 0, savings: (ft.mortgageInt || 0) * mr },
    { label: 'Charitable', amount: ft.charitable || 0, savings: (ft.charitable || 0) * mr },
    { label: 'Medical (above floor)', amount: ft.medicalDeductible, savings: ft.medicalDeductible * mr },
    { label: 'Half SE Deduction', amount: ft.halfSeTax, savings: ft.halfSeTax * mr },
    { label: 'Solo 401(k)', amount: ft.solo401kContribution, savings: ft.solo401kContribution * mr },
    { label: 'QBI Deduction', amount: ft.qbi, savings: ft.qbi * mr },
  ].filter(d => d.amount > 0);
}

const fmtPct = (v) => (v * 100).toFixed(1) + '%';

function DeductionImpactChart({ schedule, selectedYear }) {
  const containerRef = useRef(null);
  const svgW = useContainerWidth(containerRef);
  const [hoverIdx, setHoverIdx] = useState(null);

  const yr = schedule[selectedYear];
  if (!yr) return null;

  const items = buildItems(yr);
  if (!items.length) return null;

  const rowH = 32;
  const gap = 4;
  const labelW = Math.min(155, svgW * 0.26);
  const barAreaL = labelW + 8;
  const barAreaR = svgW - 12;
  const barAreaW = barAreaR - barAreaL;
  const svgH = items.length * (rowH + gap) + 30;

  const maxAmount = Math.max(...items.map(d => d.amount));
  const barScale = (v) => Math.max(2, (v / maxAmount) * barAreaW * 0.85);

  const totalSavings = items.reduce((sum, d) => sum + d.savings, 0);

  return (
    <SurfaceCard style={{ marginBottom: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textSecondary }}>
          Deduction Tax Savings — Year {selectedYear}
        </div>
        <div style={{ fontSize: 11, color: COLORS.textDim }}>
          at <span style={{ color: COLORS.amber, fontWeight: 600 }}>{fmtPct(yr.marginalRate)}</span> marginal rate
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 6, flexWrap: 'wrap' }}>
        {[
          { label: 'Deduction Amount', color: COLORS.cyan, opacity: 0.35 },
          { label: 'Tax Savings', color: COLORS.green, opacity: 1 },
        ].map(l => (
          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: COLORS.textMuted }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: l.color, opacity: l.opacity }} />
            {l.label}
          </div>
        ))}
      </div>

      <div ref={containerRef}>
        <svg viewBox={`0 0 ${svgW} ${svgH}`} style={{ width: '100%', height: 'auto', display: 'block' }}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const mouseY = (e.clientY - rect.top) / rect.height * svgH;
            const idx = Math.floor((mouseY - 8) / (rowH + gap));
            setHoverIdx(idx >= 0 && idx < items.length ? idx : null);
          }}
          onMouseLeave={() => setHoverIdx(null)}
        >
          {items.map((item, i) => {
            const y = 8 + i * (rowH + gap);
            const amtW = barScale(item.amount);
            const savW = barScale(item.savings);
            const isHovered = hoverIdx === i;

            return (
              <g key={i}>
                {isHovered && (
                  <rect x={0} y={y - 1} width={svgW} height={rowH + 2} fill={COLORS.textDim} opacity={0.08} rx={3} />
                )}

                {/* Label */}
                <text x={labelW} y={y + rowH * 0.38} textAnchor="end"
                  fill={COLORS.textMuted} fontSize="11" fontFamily="'JetBrains Mono', monospace">
                  {item.label}
                </text>

                {/* Deduction amount bar (lighter) */}
                <rect x={barAreaL} y={y + 2} width={amtW} height={(rowH - 6) / 2}
                  fill={COLORS.cyan} opacity={0.35} rx={2} />

                {/* Tax savings bar (solid) */}
                <rect x={barAreaL} y={y + rowH / 2} width={savW} height={(rowH - 6) / 2}
                  fill={COLORS.green} opacity={0.85} rx={2} />

                {/* Values */}
                <text x={barAreaL + amtW + 6} y={y + (rowH - 6) / 4 + 5}
                  fill={COLORS.textMuted} fontSize="11" fontFamily="'JetBrains Mono', monospace">
                  {fmtFull(item.amount)}
                </text>
                <text x={barAreaL + savW + 6} y={y + rowH / 2 + (rowH - 6) / 4 + 3}
                  fill={COLORS.green} fontSize="10" fontWeight="600" fontFamily="'JetBrains Mono', monospace">
                  {fmtFull(Math.round(item.savings))} saved
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Total savings footer */}
      <div style={{ marginTop: 6, padding: '6px 10px', background: COLORS.bgDeep, borderRadius: 8, border: `1px solid ${COLORS.border}`, display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
        <span style={{ color: COLORS.textMuted, fontWeight: 600 }}>Total deduction tax savings</span>
        <span style={{ color: COLORS.green, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>{fmtFull(Math.round(totalSavings))}</span>
      </div>
    </SurfaceCard>
  );
}

export default memo(DeductionImpactChart);
