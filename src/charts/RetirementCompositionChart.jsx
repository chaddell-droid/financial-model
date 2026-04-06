import { useState, memo, useRef } from 'react';
import { fmt, fmtFull } from '../model/formatters.js';
import { buildLegendItems } from './chartContract.js';
import useContainerWidth from '../hooks/useContainerWidth.js';

const LAYERS = [
  { key: 'ssIncome', label: 'Social Security', color: '#34d399' },
  { key: 'trustIncome', label: 'Trust LLC', color: '#a78bfa' },
  { key: 'poolDraw', label: 'Pool Draw', color: '#60a5fa' },
];

function RetirementCompositionChart({ yearlyData, chadPassesAge, inheritanceChadAge, inhDuringCouple, hasInheritance }) {
  const [tooltip, setTooltip] = useState(null);
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const svgW = useContainerWidth(containerRef);

  if (!yearlyData || yearlyData.length === 0) return null;

  const enriched = yearlyData.map(d => ({
    ...d,
    trustIncome: Math.max(0, (d.guaranteedIncome || 0) - (d.ssIncome || 0)),
  }));

  const n = enriched.length;
  const svgH = 260;
  const padL = 48, padR = 8, padT = 12, padB = 28;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;

  // Dynamic scale
  const maxIncome = Math.max(...enriched.map(d => (d.poolDraw || 0) + (d.ssIncome || 0) + d.trustIncome));
  const maxTarget = Math.max(...enriched.map(d => d.totalTarget || 0));
  const yMax = Math.max(maxIncome, maxTarget) * 1.1 || 1;

  const xOf = (i) => padL + (i / (n - 1)) * plotW;
  const yOf = (v) => padT + plotH - (v / yMax) * plotH;

  // Build stacked area paths (bottom-up: SS, Trust, Pool Draw)
  const layerKeys = ['ssIncome', 'trustIncome', 'poolDraw'];
  const cumulative = enriched.map(() => 0);
  const areaPaths = layerKeys.map((key, li) => {
    const prevCum = [...cumulative];
    enriched.forEach((d, i) => { cumulative[i] += (d[key] || 0); });

    // Top edge left-to-right, bottom edge right-to-left
    const topPoints = enriched.map((_, i) => `${xOf(i)},${yOf(cumulative[i])}`).join(' L ');
    const bottomPoints = [...enriched].map((_, i) => `${xOf(n - 1 - i)},${yOf(prevCum[n - 1 - i])}`).join(' L ');

    return {
      key,
      color: LAYERS[li].color,
      d: `M ${topPoints} L ${bottomPoints} Z`,
    };
  });

  // Spending target line
  const targetPath = enriched.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xOf(i)},${yOf(d.totalTarget || 0)}`).join(' ');

  // Y-axis ticks
  const tickStep = yMax > 30000 ? 10000 : yMax > 15000 ? 5000 : yMax > 5000 ? 2000 : 1000;
  const yTicks = [];
  for (let v = 0; v <= yMax; v += tickStep) yTicks.push(v);

  // Mouse interaction
  const handleMouseMove = (e) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left) / rect.width * svgW;
    const idx = Math.round(((mouseX - padL) / plotW) * (n - 1));
    if (idx < 0 || idx >= n) { setTooltip(null); return; }
    const d = enriched[idx];
    const total = (d.poolDraw || 0) + (d.ssIncome || 0) + d.trustIncome;
    setTooltip({ idx, x: xOf(idx), data: d, trustIncome: d.trustIncome, total });
  };

  const legendItems = buildLegendItems([
    ...LAYERS.map(l => ({ id: l.key, label: l.label, color: l.color })),
    { id: 'target', label: 'Spending Target', color: '#f87171', line: true },
  ]);

  return (
    <div ref={containerRef} data-testid="retirement-composition-chart" style={{
      background: "#1e293b", borderRadius: 12, padding: "16px 12px 12px",
      border: "1px solid #334155", marginBottom: 16,
    }}>
      <div style={{ fontSize: 13, color: "#94a3b8", fontWeight: 600, marginBottom: 2 }}>
        Retirement Income vs Spending
      </div>
      <div style={{ fontSize: 10, color: "#475569", marginBottom: 8 }}>
        Stacked income sources vs spending target — {n} year horizon
      </div>

      <div style={{ position: 'relative' }}>
        <svg ref={svgRef} viewBox={`0 0 ${svgW} ${svgH}`}
          style={{ width: '100%', height: 'auto', display: 'block' }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setTooltip(null)}>

          {/* Y-axis grid + labels */}
          {yTicks.map(v => (
            <g key={v}>
              <line x1={padL} x2={svgW - padR} y1={yOf(v)} y2={yOf(v)}
                stroke="#334155" strokeWidth={0.5} opacity={0.4} />
              <text x={padL - 5} y={yOf(v) + 3.5} textAnchor="end"
                fill="#64748b" fontSize={9} fontFamily="'JetBrains Mono', monospace">
                {fmt(v)}
              </text>
            </g>
          ))}

          {/* Stacked area fills */}
          {areaPaths.map(area => (
            <path key={area.key} d={area.d} fill={area.color} opacity={0.55} />
          ))}

          {/* Stacked area top edges for definition */}
          {(() => {
            const cum = enriched.map(() => 0);
            return layerKeys.map((key, li) => {
              enriched.forEach((d, i) => { cum[i] += (d[key] || 0); });
              const linePath = enriched.map((_, i) => `${i === 0 ? 'M' : 'L'} ${xOf(i)},${yOf(cum[i])}`).join(' ');
              return <path key={`line-${key}`} d={linePath} fill="none" stroke={LAYERS[li].color} strokeWidth={1.2} opacity={0.7} />;
            });
          })()}

          {/* Spending target line */}
          <path d={targetPath} fill="none" stroke="#f87171" strokeWidth={2.5}
            strokeLinejoin="round" strokeLinecap="round" />

          {/* Phase boundary: Chad passes */}
          {chadPassesAge && chadPassesAge - 67 > 0 && chadPassesAge - 67 < n && (
            <>
              <line x1={xOf(chadPassesAge - 67)} y1={padT}
                x2={xOf(chadPassesAge - 67)} y2={padT + plotH}
                stroke="#fbbf24" strokeWidth={1} strokeDasharray="4,3" opacity={0.5} />
              <text x={xOf(chadPassesAge - 67)} y={padT - 2} textAnchor="middle"
                fill="#fbbf24" fontSize={8} fontWeight={600}>Survivor</text>
            </>
          )}

          {/* Phase boundary: Inheritance */}
          {inhDuringCouple && inheritanceChadAge && inheritanceChadAge - 67 > 0 && inheritanceChadAge - 67 < n && (
            <>
              <line x1={xOf(inheritanceChadAge - 67)} y1={padT}
                x2={xOf(inheritanceChadAge - 67)} y2={padT + plotH}
                stroke="#34d399" strokeWidth={1} strokeDasharray="4,3" opacity={0.5} />
              <text x={xOf(inheritanceChadAge - 67)} y={padT - 2} textAnchor="middle"
                fill="#34d399" fontSize={8} fontWeight={600}>Inheritance</text>
            </>
          )}

          {/* X-axis labels */}
          {enriched.map((d, i) => {
            const step = n > 25 ? 5 : n > 15 ? 3 : 2;
            return (i % step === 0 || i === n - 1) ? (
              <text key={i} x={xOf(i)} y={svgH - 6} textAnchor="middle"
                fill="#64748b" fontSize={9} fontFamily="'JetBrains Mono', monospace">
                {d.age}
              </text>
            ) : null;
          })}

          {/* Hover crosshair */}
          {tooltip && (
            <line x1={tooltip.x} y1={padT} x2={tooltip.x} y2={padT + plotH}
              stroke="#94a3b8" strokeWidth={0.8} opacity={0.5} />
          )}
        </svg>

        {/* Tooltip */}
        {tooltip && tooltip.data && (() => {
          const d = tooltip.data;
          const pct = (tooltip.x / svgW) * 100;
          const flipLeft = pct > 65;
          return (
            <div style={{
              position: "absolute",
              left: flipLeft ? undefined : `${pct}%`,
              right: flipLeft ? `${100 - pct}%` : undefined,
              top: 8,
              marginLeft: flipLeft ? undefined : 12,
              marginRight: flipLeft ? 12 : undefined,
              background: "#0f172aee",
              border: "1px solid #475569",
              borderRadius: 8,
              padding: "8px 12px",
              pointerEvents: "none",
              zIndex: 10,
              whiteSpace: "nowrap",
              boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
              minWidth: 170,
              fontSize: 11,
            }}>
              <div style={{ fontSize: 11, color: "#f8fafc", fontWeight: 700, marginBottom: 4, borderBottom: "1px solid #334155", paddingBottom: 3 }}>
                Chad {d.age} / Sarah {d.sarahAge}
                {d.phase === 'survivor' ? ' (survivor)' : ''}
                {d.isInheritanceYear ? ' — Inheritance' : ''}
              </div>
              {[
                { label: 'Pool Draw', color: '#60a5fa', value: d.poolDraw || 0 },
                { label: 'Social Security', color: '#34d399', value: d.ssIncome || 0, detail: d.ssLabel },
                { label: 'Trust', color: '#a78bfa', value: tooltip.trustIncome },
              ].filter(s => s.value > 0).map((s, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 2 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <div style={{ width: 7, height: 7, borderRadius: 2, background: s.color }} />
                    <span style={{ color: "#94a3b8" }}>{s.label}</span>
                  </div>
                  <span style={{ color: s.color, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{fmtFull(s.value)}</span>
                </div>
              ))}
              <div style={{ borderTop: "1px solid #334155", marginTop: 4, paddingTop: 3 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 1 }}>
                  <span style={{ color: "#94a3b8" }}>Target</span>
                  <span style={{ color: "#f87171", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{fmtFull(d.totalTarget)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 1 }}>
                  <span style={{ color: "#94a3b8" }}>Pool</span>
                  <span style={{ color: "#e2e8f0", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{fmtFull(d.pool)}</span>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 12, marginTop: 8, justifyContent: "center", flexWrap: "wrap" }}>
        {legendItems.map(item => (
          <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: item.line ? 14 : 10, height: item.line ? 2 : 10, borderRadius: item.line ? 0 : 2, background: item.line ? undefined : item.color, borderTop: item.line ? `2px solid ${item.color}` : undefined, opacity: item.line ? 1 : 0.55 }} />
            <span style={{ fontSize: 10, color: "#94a3b8" }}>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default memo(RetirementCompositionChart);
