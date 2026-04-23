import React, { memo } from 'react';
import { fmt } from '../model/formatters.js';
import { buildIncomeSources, COLORS } from './chartUtils.js';
import { buildLegendItems } from './chartContract.js';

/**
 * Compact income-vs-expenses stacked bar chart for Overview tab.
 * Matches IncomeCompositionChart source grouping and colors, but no tooltips,
 * no annotations, no sliders — pure read-only summary.
 */
function MiniIncomeExpenseChart({ monthlyDetail, ssType, onTabChange }) {
  const data = monthlyDetail;
  const n = data.length;
  const chartH = 160;
  const yPad = 40;

  const getVal = (d, key) => key === 'msftVesting' ? (d.msftSmoothed || 0) : (d[key] || 0);
  const sources = buildIncomeSources(ssType);

  const maxIncome = Math.max(...data.map(d =>
    d.sarahIncome + d.msftSmoothed + (d.ssBenefit || 0) + (d.trustLLC || 0) +
    (d.chadJobIncome || 0) + d.consulting + (d.investReturn || 0)));
  const maxExpense = Math.max(...data.map(d => d.expenses));
  const stackMax = Math.max(maxIncome, maxExpense) * 1.1 || 1;

  const legendItems = buildLegendItems([
    ...sources.map(s => ({ id: s.key, label: s.label, color: s.color })),
    { id: 'expenses', label: 'Expenses', color: '#f87171', line: true },
  ]);

  const formatMonthLabel = (m) => {
    if (m === 0) return 'Now';
    const yr = Math.floor(m / 12);
    return `Y${yr}`;
  };

  // Y-axis ticks
  const tickCount = 4;
  const yTicks = [];
  for (let i = 0; i <= tickCount; i++) {
    yTicks.push({
      val: stackMax - (i * stackMax / tickCount),
      yPos: (i / tickCount) * chartH,
    });
  }

  return (
    <div style={{
      background: COLORS.bgCard, borderRadius: 12, padding: '16px 12px 12px',
      border: `1px solid ${COLORS.border}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <h3 style={{ fontSize: 13, color: COLORS.textSecondary, margin: 0, fontWeight: 600 }}>
          Income vs Expenses
        </h3>
        {onTabChange && (
          <button onClick={() => onTabChange('income')} style={{
            background: 'none', border: 'none', color: COLORS.textDim,
            fontSize: 10, cursor: 'pointer', padding: 0, textDecoration: 'underline',
          }}>
            Details →
          </button>
        )}
      </div>

      <div style={{ position: 'relative', paddingLeft: yPad }}>
        {/* Y-axis labels + grid lines */}
        {yTicks.map((t, i) => (
          <React.Fragment key={i}>
            <div style={{
              position: 'absolute', left: 0, top: t.yPos - 7,
              width: yPad - 6, textAlign: 'right',
            }}>
              <span style={{ fontSize: 9, color: COLORS.textDim, fontFamily: "'JetBrains Mono', monospace" }}>
                {fmt(t.val)}
              </span>
            </div>
            <div style={{
              position: 'absolute', left: yPad, right: 0, top: t.yPos,
              height: 1, background: '#1e293b80', zIndex: 0,
            }} />
          </React.Fragment>
        ))}

        {/* Stacked bars */}
        <div style={{ display: 'flex', alignItems: 'flex-end', height: chartH, gap: 0, position: 'relative' }}>
          {data.map((d, i) => {
            const vals = sources.map(s => getVal(d, s.key));
            return (
              <div key={i} style={{
                flex: 1, height: '100%', position: 'relative',
                display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center',
              }}>
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column-reverse' }}>
                  {sources.map((s, si) => {
                    const segH = (vals[si] / stackMax) * chartH;
                    return segH > 0 ? (
                      <div key={si} style={{
                        height: segH,
                        background: s.color,
                        opacity: 0.7,
                        borderRadius: (si === sources.length - 1 || vals.slice(si + 1).every(v => v === 0)) ? '2px 2px 0 0' : 0,
                      }} />
                    ) : null;
                  })}
                </div>
                {d.month % 12 === 0 && (
                  <div style={{ position: 'absolute', bottom: -16, fontSize: 8, color: COLORS.textDim, whiteSpace: 'nowrap' }}>
                    {formatMonthLabel(d.month)}
                  </div>
                )}
              </div>
            );
          })}

          {/* Expense line */}
          <svg viewBox={`0 0 ${n * 100} ${chartH}`} preserveAspectRatio="none"
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: chartH, pointerEvents: 'none', zIndex: 3 }}>
            <path d={`M ${data.map((d, i) => `${i * 100 + 50},${chartH - (d.expenses / stackMax) * chartH}`).join(' L ')}`}
              fill="none" stroke="#0f172a" strokeWidth="5" strokeLinejoin="round" strokeLinecap="round" />
            <path d={`M ${data.map((d, i) => `${i * 100 + 50},${chartH - (d.expenses / stackMax) * chartH}`).join(' L ')}`}
              fill="none" stroke="#f87171" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
          </svg>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'center', flexWrap: 'wrap' }}>
        {legendItems.map((item) => (
          <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{
              width: item.line ? 12 : 8, height: item.line ? 2 : 8,
              borderRadius: item.line ? 0 : 2,
              background: item.line ? undefined : item.color,
              borderTop: item.line ? `2px solid ${item.color}` : undefined,
              opacity: item.line ? 1 : 0.7,
            }} />
            <span style={{ fontSize: 10, color: COLORS.textMuted }}>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default memo(MiniIncomeExpenseChart);
