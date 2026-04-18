import React, { useRef, useState, memo } from 'react';
import useContainerWidth from '../hooks/useContainerWidth.js';
import { COLORS } from './chartUtils.js';
import SurfaceCard from '../components/ui/SurfaceCard.jsx';
import { fmtFull } from '../model/formatters.js';

// Step types: 'total' (absolute), 'add' (increases running total), 'sub' (decreases), 'tax' (new category), 'credit' (reduces tax)
function buildSteps(yr) {
  const ft = yr.fullTax;
  // Back-derive capital gains/loss contribution from the engine's totalIncome
  const capAdj = ft.totalIncome - yr.schCNet - yr.chadW2;
  const steps = [];

  // Income section
  steps.push({ label: 'Sarah Gross Revenue', value: yr.annualSarahGross, type: 'total', section: 'income' });
  if (yr.annualSarahGross - yr.schCNet > 0) {
    steps.push({ label: 'Business Expenses', value: -(yr.annualSarahGross - yr.schCNet), type: 'sub', section: 'income' });
  }
  steps.push({ label: 'Schedule C Net', value: yr.schCNet, type: 'total', section: 'income' });
  if (yr.chadW2 > 0) {
    steps.push({ label: 'Chad W-2 Wages', value: yr.chadW2, type: 'add', section: 'income' });
  }
  if (capAdj !== 0) {
    steps.push({ label: capAdj > 0 ? 'Capital Gains' : 'Capital Loss Deduction', value: capAdj, type: capAdj > 0 ? 'add' : 'sub', section: 'income' });
  }
  steps.push({ label: 'Total Income', value: ft.totalIncome, type: 'total', section: 'income' });

  // Above-the-line deductions
  if (ft.halfSeTax > 0) steps.push({ label: 'Half SE Deduction', value: -ft.halfSeTax, type: 'sub', section: 'agi' });
  if (ft.solo401kContribution > 0) steps.push({ label: 'Solo 401(k)', value: -ft.solo401kContribution, type: 'sub', section: 'agi' });
  steps.push({ label: 'AGI', value: ft.agi, type: 'total', section: 'agi' });

  // Below-the-line deductions
  const dedLabel = ft.usingItemized ? 'Itemized Deductions' : 'Standard Deduction';
  steps.push({ label: dedLabel, value: -ft.deductionUsed, type: 'sub', section: 'deductions' });
  if (ft.qbi > 0) steps.push({ label: 'QBI Deduction', value: -ft.qbi, type: 'sub', section: 'deductions' });
  steps.push({ label: 'Taxable Income', value: ft.taxableIncome, type: 'total', section: 'deductions' });

  // Taxes
  steps.push({ label: 'Federal Income Tax', value: ft.fedTax, type: 'tax', section: 'tax' });
  if (ft.totalCredits > 0) steps.push({ label: 'Tax Credits', value: -ft.totalCredits, type: 'credit', section: 'tax' });
  steps.push({ label: 'SE Tax (SS + Medicare)', value: ft.seTax, type: 'tax', section: 'tax' });
  if (ft.addlMedicareOwed > 0) steps.push({ label: 'Additional Medicare', value: ft.addlMedicareOwed, type: 'tax', section: 'tax' });
  steps.push({ label: 'TOTAL TAX', value: ft.totalTax, type: 'result', section: 'tax' });

  return steps;
}

const TYPE_COLORS = {
  total: COLORS.textDim,
  add: COLORS.green,
  sub: COLORS.blue,
  tax: COLORS.red,
  credit: COLORS.green,
  result: COLORS.amber,
};

function TaxWaterfallChart({ schedule, selectedYear }) {
  const containerRef = useRef(null);
  const svgW = useContainerWidth(containerRef);
  const [hoverIdx, setHoverIdx] = useState(null);

  const yr = schedule[selectedYear];
  if (!yr) return null;

  const steps = buildSteps(yr);

  const rowH = 26;
  const gap = 3;
  const labelW = Math.min(170, svgW * 0.28);
  const valueW = 80;
  const barAreaL = labelW + 10;
  const barAreaR = svgW - valueW - 10;
  const barAreaW = barAreaR - barAreaL;
  const svgH = steps.length * (rowH + gap) + 30;

  // Scale bars relative to max absolute value
  const maxVal = Math.max(...steps.map(s => Math.abs(s.value)));
  const barScale = (v) => Math.max(2, (Math.abs(v) / maxVal) * barAreaW * 0.85);

  const fmtPct = (v) => (v * 100).toFixed(1) + '%';

  return (
    <SurfaceCard tone="featured" style={{ marginBottom: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textSecondary }}>
          Income → Tax Waterfall — Year {selectedYear}
        </div>
        <div style={{ fontSize: 11, color: COLORS.textDim }}>
          Marginal rate: <span style={{ color: COLORS.amber, fontWeight: 600 }}>{fmtPct(yr.marginalRate)}</span>
        </div>
      </div>

      <div ref={containerRef}>
        <svg viewBox={`0 0 ${svgW} ${svgH}`} style={{ width: '100%', height: 'auto', display: 'block' }}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const mouseY = (e.clientY - rect.top) / rect.height * svgH;
            const idx = Math.floor((mouseY - 10) / (rowH + gap));
            setHoverIdx(idx >= 0 && idx < steps.length ? idx : null);
          }}
          onMouseLeave={() => setHoverIdx(null)}
        >
          {steps.map((step, i) => {
            const y = 10 + i * (rowH + gap);
            const color = TYPE_COLORS[step.type];
            const bw = barScale(step.value);
            const isNeg = step.value < 0;
            const isTotal = step.type === 'total' || step.type === 'result';
            const barX = isNeg ? barAreaL + barAreaW * 0.45 - bw : barAreaL + barAreaW * 0.45;
            const isHovered = hoverIdx === i;

            // Section divider
            const prevSection = i > 0 ? steps[i - 1].section : null;
            const showDivider = prevSection && prevSection !== step.section;

            return (
              <g key={i}>
                {showDivider && (
                  <line x1={barAreaL} x2={barAreaR} y1={y - gap / 2} y2={y - gap / 2}
                    stroke={COLORS.border} strokeWidth="0.5" strokeDasharray="4,4" />
                )}

                {/* Hover highlight */}
                {isHovered && (
                  <rect x={0} y={y - 1} width={svgW} height={rowH + 2} fill={COLORS.textDim} opacity={0.08} rx={3} />
                )}

                {/* Label */}
                <text x={labelW} y={y + rowH / 2 + 4} textAnchor="end"
                  fill={isTotal ? COLORS.textSecondary : COLORS.textMuted}
                  fontSize="11" fontWeight={isTotal ? 700 : 400}
                  fontFamily="'JetBrains Mono', monospace">
                  {step.label}
                </text>

                {/* Bar */}
                <rect x={barX} y={y + 3} width={bw} height={rowH - 6}
                  fill={color} rx={3} opacity={isTotal ? 0.7 : 0.85} />

                {/* Value */}
                <text x={svgW - 8} y={y + rowH / 2 + 4} textAnchor="end"
                  fill={isTotal ? COLORS.textSecondary : color}
                  fontSize="11" fontWeight={isTotal ? 700 : 600}
                  fontFamily="'JetBrains Mono', monospace">
                  {step.value < 0 ? '-' : ''}{fmtFull(Math.abs(step.value))}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Itemized deduction detail (if using itemized) */}
      {yr.fullTax.usingItemized && (
        <div style={{ marginTop: 8, padding: '8px 10px', background: COLORS.bgDeep, borderRadius: 8, border: `1px solid ${COLORS.border}`, fontSize: 11 }}>
          <div style={{ fontWeight: 600, color: COLORS.textMuted, marginBottom: 4, textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.04em' }}>Itemized Breakdown</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '2px 12px' }}>
            {[
              ['SALT (capped)', yr.fullTax.saltDeductible],
              ['Mortgage Interest', yr.fullTax.mortgageInt || 0],
              ['Charitable', yr.fullTax.charitable || 0],
              ['Medical (above floor)', yr.fullTax.medicalDeductible],
            ].filter(([, v]) => v > 0).map(([label, val]) => (
              <React.Fragment key={label}>
                <span style={{ color: COLORS.textDim }}>{label}</span>
                <span style={{ color: COLORS.textSecondary, fontFamily: "'JetBrains Mono', monospace", textAlign: 'right' }}>{fmtFull(val)}</span>
              </React.Fragment>
            ))}
            <span style={{ color: COLORS.textMuted, fontWeight: 600, borderTop: `1px solid ${COLORS.border}`, paddingTop: 2 }}>Total Itemized</span>
            <span style={{ color: COLORS.textSecondary, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", textAlign: 'right', borderTop: `1px solid ${COLORS.border}`, paddingTop: 2 }}>{fmtFull(yr.fullTax.itemized)}</span>
          </div>
        </div>
      )}
    </SurfaceCard>
  );
}

export default memo(TaxWaterfallChart);
