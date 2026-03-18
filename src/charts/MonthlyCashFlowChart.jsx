import { useState } from 'react';
import { fmt, fmtFull } from '../model/formatters.js';

export default function MonthlyCashFlowChart({
  data,
  chartH = 380,
  netRange,
  minNet,
  maxNet,
  maxVesting,
  highlightIdx,
  highlightLabel,
  ssType,
  ssdiApprovalMonth,
  ssdiFamilyTotal,
  msftGrowth,
}) {
  const [msftTooltip, setMsftTooltip] = useState(null);

  const yAxisPadding = 60;

  return (
    <div style={{
      background: "#1e293b", borderRadius: 12, padding: "20px 16px",
      border: "1px solid #334155", marginBottom: 24
    }}>
      <h3 style={{ fontSize: 14, color: "#94a3b8", margin: "0 0 16px", fontWeight: 600 }}>Monthly Cash Flow Over Time</h3>
      <div style={{ position: "relative", height: chartH + 50, paddingLeft: yAxisPadding }}>
        {/* Y-axis labels and grid lines */}
        {(() => {
          const tickCount = 8;
          const ticks = [];
          for (let i = 0; i <= tickCount; i++) {
            const val = netRange - (i * 2 * netRange / tickCount);
            const yPos = (i / tickCount) * chartH;
            ticks.push(
              <div key={`label-${i}`} style={{ position: "absolute", left: 0, top: yPos - 7, width: yAxisPadding - 8, textAlign: "right" }}>
                <span style={{ fontSize: 10, color: "#64748b", fontFamily: "'JetBrains Mono', monospace" }}>
                  {fmt(val)}
                </span>
              </div>
            );
            ticks.push(
              <div key={`line-${i}`} style={{
                position: "absolute", left: yAxisPadding, right: 0, top: yPos,
                height: 1,
                background: Math.abs(val) < netRange * 0.02 ? "#475569" : "#1e293b80",
                zIndex: 1
              }} />
            );
          }
          return ticks;
        })()}

        {/* Bars + MSFT vesting overlay */}
        <div style={{ display: "flex", alignItems: "center", height: chartH, gap: 2, paddingLeft: 0, position: "relative" }}
          onMouseLeave={() => setMsftTooltip(null)}>
          {/* SVG overlay for MSFT vesting area + line */}
          <svg viewBox={`0 0 ${data.length * 100} ${chartH}`} preserveAspectRatio="none" style={{ position: "absolute", top: 0, left: 0, width: "100%", height: chartH, pointerEvents: "none", zIndex: 4 }}>
            {(() => {
              const n = data.length;
              const colW = 100;
              const zeroY = chartH / 2;
              // MSFT line scale: fit to top half of chart, independent of bar scale
              const msftScale = maxVesting > 0 ? (chartH / 2 - 20) / maxVesting : 1;

              const points = data.map((d, i) => {
                const xPos = i * colW + colW / 2;
                const vestH = d.msftVesting * msftScale;
                const yPos = zeroY - vestH;
                return { x: xPos, y: yPos };
              });

              const areaTop = points.map(p => `${p.x},${p.y}`).join(" L ");
              const areaPath = `M ${points[0].x},${zeroY} L ${areaTop} L ${points[n-1].x},${zeroY} Z`;
              const linePath = `M ${points.map(p => `${p.x},${p.y}`).join(" L ")}`;

              const ssdiIdx = data.findIndex(d => d.ssdi > 0);
              const ssdiX = ssdiIdx >= 0 ? ssdiIdx * colW + colW / 2 : null;

              return (
                <>
                  <path d={linePath} fill="none" stroke="#f59e0b" strokeWidth="3" strokeLinejoin="round" strokeDasharray="8,4" opacity="0.7" />
                  {points.map((p, i) => (
                    data[i].msftVesting > 0 && <circle key={i} cx={p.x} cy={p.y} r="4" fill="#f59e0b" opacity="0.5" />
                  ))}
                  {ssdiX !== null && (
                    <line x1={ssdiX} x2={ssdiX} y1={26} y2={chartH} stroke="#4ade80" strokeWidth="2" strokeDasharray="6,4" opacity="0.6" />
                  )}
                </>
              );
            })()}
          </svg>

          {/* Invisible hover zones for MSFT tooltip */}
          {data.map((d, i) => {
            const n = data.length;
            const pctLeft = (i / n) * 100;
            const pctWidth = (1 / n) * 100;
            const msftScale = maxVesting > 0 ? (chartH / 2 - 20) / maxVesting : 1;
            const vestH = d.msftVesting * msftScale;
            const yPct = ((chartH / 2 - vestH) / chartH) * 100;
            return d.msftVesting > 0 ? (
              <div key={`msft-hover-${i}`}
                style={{ position: "absolute", left: `${pctLeft}%`, width: `${pctWidth}%`, top: 0, height: chartH, zIndex: 5, cursor: "default" }}
                onMouseEnter={() => setMsftTooltip({ pctX: pctLeft + pctWidth / 2, pctY: yPct, value: d.msftVesting, label: d.label })}
                onMouseLeave={() => setMsftTooltip(null)}
              />
            ) : null;
          })}

          {/* SSDI starts HTML label */}
          {(() => {
            const ssdiIdx = data.findIndex(d => d.ssdi > 0);
            if (ssdiIdx < 0) return null;
            const pctX = ((ssdiIdx + 0.5) / data.length) * 100;
            return (
              <div style={{
                position: "absolute",
                left: `${pctX}%`,
                top: 2,
                transform: "translateX(-50%)",
                zIndex: 6,
                whiteSpace: "nowrap",
                pointerEvents: "none"
              }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: "#4ade80", fontFamily: "'JetBrains Mono', monospace" }}>
                  {ssType === 'ss' ? 'SS starts' : 'SSDI starts'}
                </span>
              </div>
            );
          })()}

          {/* MSFT tooltip */}
          {msftTooltip && (
            <div style={{
              position: "absolute",
              left: `${msftTooltip.pctX}%`,
              top: `${msftTooltip.pctY}%`,
              transform: "translate(-50%, -120%)",
              background: "#0f172a",
              border: "1px solid #f59e0b",
              borderRadius: 6,
              padding: "6px 10px",
              pointerEvents: "none",
              zIndex: 10,
              whiteSpace: "nowrap",
              boxShadow: "0 4px 12px rgba(0,0,0,0.5)"
            }}>
              <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 2 }}>{msftTooltip.label}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#f59e0b", fontFamily: "'JetBrains Mono', monospace" }}>
                MSFT: {fmtFull(msftTooltip.value)}/mo
              </div>
            </div>
          )}

          {data.map((d, i) => {
            const barH = Math.abs(d.netMonthly) / netRange * (chartH / 2 - 10);
            const isPos = d.netMonthly >= 0;
            const isHighlight = i === highlightIdx;
            return (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", height: "100%", position: "relative" }}>
                {isHighlight && (
                  <div style={{
                    position: "absolute", top: 0, bottom: 0, width: "100%",
                    background: isPos ? "rgba(74, 222, 128, 0.08)" : "rgba(251, 191, 36, 0.08)",
                    border: `1px solid ${isPos ? "rgba(74, 222, 128, 0.3)" : "rgba(251, 191, 36, 0.3)"}`,
                    borderRadius: 4,
                    zIndex: 0
                  }} />
                )}
                <div style={{
                  position: "absolute",
                  top: isPos ? (chartH / 2 - barH) : chartH / 2,
                  height: Math.max(barH, 2),
                  width: "70%",
                  background: isPos
                    ? "linear-gradient(180deg, #4ade80, #22c55e)"
                    : isHighlight
                      ? "linear-gradient(180deg, #fbbf24, #f59e0b)"
                      : "linear-gradient(180deg, #ef4444, #f87171)",
                  borderRadius: isPos ? "3px 3px 0 0" : "0 0 3px 3px",
                  transition: "all 0.3s ease",
                  zIndex: 2
                }} />
                <div style={{
                  position: "absolute",
                  top: isPos ? (chartH / 2 - barH - 16) : (chartH / 2 + barH + 4),
                  fontSize: 9,
                  color: isPos ? "#4ade80" : (isHighlight ? "#fbbf24" : "#f87171"),
                  fontFamily: "'JetBrains Mono', monospace",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  zIndex: 3
                }}>
                  {fmt(d.netMonthly)}
                </div>
                <div style={{
                  position: "absolute", bottom: -24, fontSize: 9,
                  color: isHighlight ? (isPos ? "#4ade80" : "#fbbf24") : "#64748b",
                  fontWeight: isHighlight ? 700 : 400,
                  whiteSpace: "nowrap", transform: "rotate(-35deg)", transformOrigin: "top left"
                }}>
                  {d.label}
                </div>
                {isHighlight && (
                  <div style={{
                    position: "absolute",
                    top: isPos ? (chartH / 2 - barH - 28) : (chartH / 2 + barH + 18),
                    fontSize: 8,
                    color: isPos ? "#4ade80" : "#fbbf24",
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                    zIndex: 3
                  }}>
                    {highlightLabel}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 16, marginTop: 32, justifyContent: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 12, height: 12, borderRadius: 2, background: "#4ade80" }} />
          <span style={{ fontSize: 11, color: "#94a3b8" }}>Surplus</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 12, height: 12, borderRadius: 2, background: "#f87171" }} />
          <span style={{ fontSize: 11, color: "#94a3b8" }}>Deficit</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 16, height: 2, background: "#f59e0b", borderTop: "2px dashed #f59e0b" }} />
          <span style={{ fontSize: 11, color: "#94a3b8" }}>MSFT vesting income</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 16, height: 2, background: "#4ade80", borderTop: "2px dashed #4ade80" }} />
          <span style={{ fontSize: 11, color: "#94a3b8" }}>{ssType === 'ss' ? 'SS starts' : 'SSDI starts'}</span>
        </div>
      </div>
    </div>
  );
}
