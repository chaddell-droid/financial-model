import { useState, memo } from 'react';
import { fmt, fmtFull } from '../model/formatters.js';
import { buildLegendItems } from './chartContract.js';

const SOURCES = [
  { key: 'poolDraw', label: 'Pool Draw', color: '#60a5fa' },
  { key: 'ssIncome', label: 'Social Security', color: '#34d399' },
  { key: 'trustIncome', label: 'Trust LLC', color: '#a78bfa' },
];

function RetirementCompositionChart({ yearlyData, chadPassesAge, inheritanceChadAge, inhDuringCouple, hasInheritance }) {
  const [tooltip, setTooltip] = useState(null);

  if (!yearlyData || yearlyData.length === 0) return null;

  const stackH = 300;
  const stackYPad = 60;

  // Derive trust income from guaranteedIncome - ssIncome for each year
  const enriched = yearlyData.map(d => ({
    ...d,
    trustIncome: Math.max(0, (d.guaranteedIncome || 0) - (d.ssIncome || 0)),
  }));

  const maxIncome = Math.max(...enriched.map(d => (d.poolDraw || 0) + (d.ssIncome || 0) + d.trustIncome));
  const maxExpense = Math.max(...enriched.map(d => d.totalTarget || 0));
  const stackMax = Math.max(maxIncome, maxExpense) * 1.1 || 1;

  // Summary metrics
  const startYear = enriched[0];
  const survivorIdx = enriched.findIndex(d => !d.chadAlive);
  const survivorYear = survivorIdx >= 0 ? enriched[survivorIdx] : enriched[enriched.length - 1];

  const legendItems = buildLegendItems([
    ...SOURCES.map(s => ({ id: s.key, label: s.label, color: s.color })),
    { id: 'target', label: 'Spending Target', color: '#f87171', line: true },
  ]);

  return (
    <div data-testid="retirement-composition-chart" style={{
      background: "#1e293b", borderRadius: 12, padding: "20px 16px",
      border: "1px solid #334155", marginBottom: 24
    }}>
      <h3 style={{ fontSize: 14, color: "#94a3b8", margin: "0 0 4px", fontWeight: 600 }}>
        Retirement Income vs Spending
      </h3>
      <p style={{ fontSize: 10, color: "#475569", margin: "0 0 12px" }}>
        Income sources stacked vs spending target across the full {enriched.length}-year retirement horizon. Hover for detail.
      </p>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8, marginBottom: 12 }}>
        {[
          { label: `Age ${startYear.age} income`, value: fmtFull((startYear.poolDraw || 0) + (startYear.ssIncome || 0) + startYear.trustIncome), color: '#4ade80' },
          { label: `Age ${startYear.age} target`, value: fmtFull(startYear.totalTarget), color: '#f87171' },
          { label: `Survivor (${survivorYear.age}+) target`, value: fmtFull(survivorYear.totalTarget), color: '#fbbf24' },
        ].map(item => (
          <div key={item.label} style={{ background: '#0f172a', borderRadius: 6, padding: '8px 10px', border: '1px solid #334155' }}>
            <div style={{ fontSize: 10, color: '#64748b', marginBottom: 2 }}>{item.label}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: item.color, fontFamily: "'JetBrains Mono', monospace" }}>{item.value}</div>
          </div>
        ))}
      </div>

      {/* Chart area */}
      <div data-testid="retirement-composition-hover-surface"
        style={{ position: "relative", height: stackH + 40, paddingLeft: stackYPad }}
        onMouseLeave={() => setTooltip(null)}>

        {/* Y-axis labels + grid lines */}
        {(() => {
          const ticks = [];
          const tickCount = 6;
          for (let i = 0; i <= tickCount; i++) {
            const val = stackMax - (i * stackMax / tickCount);
            const yPos = (i / tickCount) * stackH;
            ticks.push(
              <div key={`rl-${i}`} style={{ position: "absolute", left: 0, top: yPos - 7, width: stackYPad - 8, textAlign: "right" }}>
                <span style={{ fontSize: 10, color: "#64748b", fontFamily: "'JetBrains Mono', monospace" }}>
                  {fmt(val)}
                </span>
              </div>
            );
            ticks.push(
              <div key={`rg-${i}`} style={{
                position: "absolute", left: stackYPad, right: 0, top: yPos,
                height: 1, background: "#1e293b80", zIndex: 0
              }} />
            );
          }
          return ticks;
        })()}

        {/* Stacked bars */}
        <div style={{ display: "flex", alignItems: "flex-end", height: stackH, gap: 0, position: "relative" }}>
          {enriched.map((d, i) => {
            const vals = [d.poolDraw || 0, d.ssIncome || 0, d.trustIncome];
            const total = vals.reduce((a, b) => a + b, 0);
            const n = enriched.length;
            const pctX = ((i + 0.5) / n) * 100;
            const isPhaseStart = i === 0
              || (inhDuringCouple && d.age === inheritanceChadAge)
              || d.age === chadPassesAge;

            return (
              <div key={i} style={{
                flex: 1, height: "100%", position: "relative",
                display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center",
                cursor: "default",
                background: d.phase === 'survivor' ? '#f9731608' : d.phase === 'postInheritance' ? '#34d39908' : 'transparent',
                borderLeft: isPhaseStart && i > 0 ? '1px dashed #64748b44' : 'none',
              }}
                onMouseEnter={() => setTooltip({
                  pctX,
                  data: d,
                  trustIncome: d.trustIncome,
                  total,
                })}>
                {/* Stacked segments */}
                <div style={{ width: "80%", display: "flex", flexDirection: "column-reverse" }}>
                  {SOURCES.map((s, si) => {
                    const segH = (vals[si] / stackMax) * stackH;
                    return segH > 0 ? (
                      <div key={si} style={{
                        height: segH,
                        background: s.color,
                        opacity: tooltip?.data?.age === d.age ? 0.9 : 0.7,
                        borderRadius: si === SOURCES.length - 1 ? "3px 3px 0 0" :
                          (vals.slice(si + 1).every(v => v === 0)) ? "3px 3px 0 0" : 0,
                        transition: "height 0.3s ease, opacity 0.15s ease"
                      }} />
                    ) : null;
                  })}
                </div>

                {/* Age label (every 5 years) */}
                {d.age % 5 === 0 && (
                  <div style={{
                    position: "absolute", bottom: -20, fontSize: 9, color: "#64748b",
                    whiteSpace: "nowrap",
                  }}>
                    {d.age}
                  </div>
                )}
              </div>
            );
          })}

          {/* Spending target line */}
          <svg viewBox={`0 0 ${enriched.length * 100} ${stackH}`} preserveAspectRatio="none"
            style={{ position: "absolute", top: 0, left: 0, width: "100%", height: stackH, pointerEvents: "none", zIndex: 3 }}>
            <path d={`M ${enriched.map((d, i) =>
              `${i * 100 + 50},${stackH - ((d.totalTarget || 0) / stackMax) * stackH}`
            ).join(' L ')}`}
              fill="none" stroke="#f87171" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
          </svg>

          {/* Phase labels */}
          {chadPassesAge && (() => {
            const idx = chadPassesAge - 67;
            if (idx <= 0 || idx >= enriched.length) return null;
            const pctX = ((idx + 0.5) / enriched.length) * 100;
            return (
              <div style={{
                position: 'absolute', left: `${pctX}%`, top: -2, transform: 'translateX(-50%)',
                background: '#0f172a', border: '1px solid #334155', borderRadius: 4,
                padding: '1px 5px', pointerEvents: 'none', zIndex: 6, whiteSpace: 'nowrap',
              }}>
                <div style={{ fontSize: 8, fontWeight: 600, color: '#fbbf24' }}>Sarah survivor</div>
              </div>
            );
          })()}
          {inhDuringCouple && inheritanceChadAge && (() => {
            const idx = inheritanceChadAge - 67;
            if (idx <= 0 || idx >= enriched.length) return null;
            const pctX = ((idx + 0.5) / enriched.length) * 100;
            return (
              <div style={{
                position: 'absolute', left: `${pctX}%`, top: 14, transform: 'translateX(-50%)',
                background: '#0f172a', border: '1px solid #334155', borderRadius: 4,
                padding: '1px 5px', pointerEvents: 'none', zIndex: 6, whiteSpace: 'nowrap',
              }}>
                <div style={{ fontSize: 8, fontWeight: 600, color: '#34d399' }}>Inheritance</div>
              </div>
            );
          })()}
        </div>

        {/* Tooltip */}
        {tooltip && tooltip.data && (
          <div style={{
            position: "absolute",
            left: `${tooltip.pctX}%`,
            top: 10,
            transform: "translateX(-50%)",
            background: "#0f172a",
            border: "1px solid #475569",
            borderRadius: 8,
            padding: "10px 14px",
            pointerEvents: "none",
            zIndex: 10,
            whiteSpace: "nowrap",
            boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
            minWidth: 200,
          }}>
            <div style={{ fontSize: 12, color: "#f8fafc", fontWeight: 700, marginBottom: 6, borderBottom: "1px solid #334155", paddingBottom: 4 }}>
              Chad {tooltip.data.age} / Sarah {tooltip.data.sarahAge}
              {tooltip.data.phase === 'survivor' ? ' (survivor)' : ''}
              {tooltip.data.isInheritanceYear ? ' — Inheritance' : ''}
            </div>
            {[
              { label: 'Pool Draw', color: SOURCES[0].color, value: tooltip.data.poolDraw || 0 },
              { label: 'Social Security', color: SOURCES[1].color, value: tooltip.data.ssIncome || 0, detail: tooltip.data.ssLabel },
              { label: 'Trust LLC', color: SOURCES[2].color, value: tooltip.trustIncome },
            ].filter(s => s.value > 0).map((s, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, fontSize: 11, marginTop: 3 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: s.color, flexShrink: 0 }} />
                  <span style={{ color: "#94a3b8" }}>{s.label}{s.detail ? ` (${s.detail})` : ''}</span>
                </div>
                <span style={{ color: s.color, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{fmtFull(s.value)}</span>
              </div>
            ))}
            <div style={{ borderTop: "1px solid #334155", marginTop: 6, paddingTop: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginTop: 2 }}>
                <span style={{ color: "#94a3b8" }}>Total income</span>
                <span style={{ color: "#e2e8f0", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{fmtFull(tooltip.total)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginTop: 2 }}>
                <span style={{ color: "#94a3b8" }}>Spending target</span>
                <span style={{ color: "#f87171", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{fmtFull(tooltip.data.totalTarget)}</span>
              </div>
              {tooltip.data.savedToPool > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginTop: 2 }}>
                  <span style={{ color: "#94a3b8" }}>Reinvested to pool</span>
                  <span style={{ color: "#4ade80", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>+{fmtFull(tooltip.data.savedToPool)}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginTop: 4, paddingTop: 4, borderTop: "1px solid #334155" }}>
                <span style={{ color: "#94a3b8" }}>Pool balance</span>
                <span style={{ color: "#e2e8f0", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{fmtFull(tooltip.data.pool)}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 14, marginTop: 32, justifyContent: "center", flexWrap: "wrap" }}>
        {legendItems.map(item => (
          <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: item.line ? 16 : 12, height: item.line ? 2 : 12, borderRadius: item.line ? 0 : 2, background: item.line ? undefined : item.color, borderTop: item.line ? `2px solid ${item.color}` : undefined, opacity: item.line ? 1 : 0.7 }} />
            <span style={{ fontSize: 11, color: "#94a3b8" }}>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default memo(RetirementCompositionChart);
