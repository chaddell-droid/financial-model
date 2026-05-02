import React, { useState, useRef } from "react";
import { fmt, fmtFull } from "../model/formatters.js";
import { DAYS_PER_MONTH } from "../model/constants.js";
import Slider from '../components/Slider.jsx';

export default function SarahPracticeChart({
  sarahRate,
  sarahMaxRate,
  sarahRateGrowth,
  sarahCurrentClients,
  sarahMaxClients,
  sarahClientGrowth,
  sarahTaxRate,
  sarahCurrentGross,
  sarahCurrentNet,
  sarahCeilingGross,
  sarahCeiling,
  sarahWorkMonths,
  // FIX M-Sarah: Optional monthlyDetail pulls Sarah's NET income directly from the
  // engine row (engine applies sarah's tax + work-month boundary). When provided,
  // the chart uses engine values; otherwise it falls back to the inline formula
  // (which matches engine for the active-work window). This maintains display
  // parity once IncomeTab.jsx is updated to pass monthlyDetail to this chart.
  monthlyDetail,
  onFieldChange,
}) {
  const set = onFieldChange;
  const commitStrategy = 'release';
  const [tooltip, setTooltip] = useState(null);
  const svgRef = useRef(null);

  const months = sarahWorkMonths || 72;
  const chartW = 800;
  const chartH = 240;
  const padL = 55;
  const padR = 20;
  const padT = 20;
  const padB = 30;
  const plotW = chartW - padL - padR;
  const plotH = chartH - padT - padB;

  // Compute monthly data points
  // FIX M-Sarah: Net income pulled from engine row (monthlyDetail[m].sarahIncome)
  // when available; otherwise computed inline. Gross/rate/clients are still
  // derived locally because the engine doesn't expose those component fields.
  const pts = [];
  for (let m = 0; m <= months; m++) {
    const rate = Math.min(sarahRate * Math.pow(1 + sarahRateGrowth / 100, m / 12), sarahMaxRate);
    const clients = Math.min(sarahCurrentClients * Math.pow(1 + sarahClientGrowth / 100, m / 12), sarahMaxClients);
    const gross = Math.round(rate * clients * DAYS_PER_MONTH);
    const year = Math.floor(m / 12);
    const mo = m % 12;
    const label = m === 0 ? 'Now' : `Y${year}${mo > 0 ? `M${mo}` : ''}`;
    const calYear = 26 + Math.floor((2 + m) / 12);
    const calMonth = (2 + m) % 12;
    const dateLabel = `${['Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb'][calMonth]} '${calYear}`;
    const inlineNet = Math.round(gross * (1 - (sarahTaxRate ?? 25) / 100));
    const net = monthlyDetail && monthlyDetail[m] ? (monthlyDetail[m].sarahIncome ?? inlineNet) : inlineNet;
    pts.push({ m, rate: Math.round(rate), clients: +clients.toFixed(2), gross, net, label, dateLabel });
  }

  const maxGross = Math.max(...pts.map(p => p.gross)) * 1.1;
  const minGross = Math.min(...pts.map(p => p.gross)) * 0.9;
  const grossRange = maxGross - minGross || 1;

  const xOf = (m) => padL + (m / months) * plotW;
  const yOf = (val) => padT + ((maxGross - val) / grossRange) * plotH;

  // Income line paths
  const linePath = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${xOf(p.m).toFixed(1)},${yOf(p.gross).toFixed(1)}`).join(" ");
  const netLinePath = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${xOf(p.m).toFixed(1)},${yOf(p.net).toFixed(1)}`).join(" ");
  // Area fill
  const areaPath = `${linePath} L ${xOf(months)},${yOf(minGross)} L ${xOf(0)},${yOf(minGross)} Z`;

  // Target income line
  const targetGross = Math.round(sarahMaxRate * sarahMaxClients * DAYS_PER_MONTH);
  const targetY = yOf(targetGross);
  const currentGross = pts[0].gross;
  const currentY = yOf(currentGross);

  // Find when target is reached
  const targetMonth = pts.findIndex(p => p.gross >= targetGross * 0.99);

  // Y-axis ticks
  const yTicks = [];
  const tickStep = grossRange > 20000 ? 5000 : grossRange > 10000 ? 2500 : 1000;
  for (let v = Math.ceil(minGross / tickStep) * tickStep; v <= maxGross; v += tickStep) {
    yTicks.push(v);
  }

  // Mouse interaction
  const handleMouseMove = (e) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left) / rect.width * chartW;
    const idx = Math.round(((mouseX - padL) / plotW) * months);
    if (idx < 0 || idx > months) { setTooltip(null); return; }
    const p = pts[idx];
    if (!p) { setTooltip(null); return; }
    const pctX = ((xOf(p.m)) / chartW) * 100;
    setTooltip({ idx, x: xOf(p.m), pctX, ...p });
  };

  // Growth from current
  const growthPct = (gross) => currentGross > 0 ? Math.round(((gross - currentGross) / currentGross) * 100) : 0;

  return (
    <div data-testid="sarah-practice-chart" style={{
      background: "#1e293b", borderRadius: 12, padding: "20px 16px",
      border: "1px solid #334155", marginBottom: 24
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
        <h3 style={{ fontSize: 14, color: "#60a5fa", margin: 0, fontWeight: 600 }}>Sarah's Practice Growth</h3>
        <div data-testid="sarah-practice-summary" style={{ fontSize: 11, color: "#64748b", display: "flex", alignItems: "center", gap: 12 }}>
          <span>
            <span style={{ color: "#60a5fa", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{fmtFull(currentGross)}</span>
            <span> → </span>
            <span style={{ color: "#4ade80", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{fmtFull(targetGross)}</span>
            <span>/mo</span>
          </span>
          <span style={{ display: "flex", gap: 8, fontSize: 10 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <span style={{ width: 12, height: 2, background: "#60a5fa", display: "inline-block" }} />
              <span style={{ color: "#64748b" }}>Gross</span>
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <span style={{ width: 12, height: 0, display: "inline-block", borderTop: "2px dashed #34d399" }} />
              <span style={{ color: "#64748b" }}>Net</span>
            </span>
          </span>
        </div>
      </div>
      <p data-testid="sarah-practice-subtitle" style={{ fontSize: 11, color: "#475569", margin: "0 0 12px" }}>
        ${sarahRate}/hr × {sarahCurrentClients.toFixed(1)} clients → ${sarahMaxRate}/hr × {sarahMaxClients.toFixed(1)} clients
        {" "}| Rate +{sarahRateGrowth}%/yr, Clients +{sarahClientGrowth}%/yr
      </p>

      <div style={{ position: 'relative' }}>
        <svg ref={svgRef} viewBox={`0 0 ${chartW} ${chartH}`} style={{ width: "100%", height: "auto", display: 'block' }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setTooltip(null)}>
          {/* Grid lines */}
          {yTicks.map(v => (
            <g key={v}>
              <line x1={padL} x2={chartW - padR} y1={yOf(v)} y2={yOf(v)}
                stroke="#334155" strokeWidth="0.5" opacity="0.4" />
              <text x={padL - 6} y={yOf(v) + 3} textAnchor="end"
                fill="#475569" fontSize="10" fontFamily="'JetBrains Mono', monospace">
                {v >= 1000 ? `$${Math.round(v/1000)}K` : `$${v}`}
              </text>
            </g>
          ))}

          {/* Year markers on X axis */}
          {Array.from({ length: Math.floor(months / 12) + 1 }, (_, i) => i * 12).map(m => (
            <text key={m} x={xOf(m)} y={chartH - 4} textAnchor="middle"
              fill="#475569" fontSize="10" fontFamily="'JetBrains Mono', monospace">
              {m === 0 ? "Now" : `'${26 + Math.floor((2+m)/12)}`}
            </text>
          ))}

          {/* Target line */}
          <line x1={padL} x2={chartW - padR} y1={targetY} y2={targetY}
            stroke="#4ade80" strokeWidth="1" strokeDasharray="6,4" opacity="0.5" />
          <text x={chartW - padR - 2} y={targetY - 5} textAnchor="end"
            fill="#4ade80" fontSize="10" opacity="0.8" fontFamily="'JetBrains Mono', monospace">
            Target: {fmtFull(targetGross)}
          </text>

          {/* Current line */}
          <line x1={padL} x2={chartW - padR} y1={currentY} y2={currentY}
            stroke="#64748b" strokeWidth="1" strokeDasharray="4,4" opacity="0.3" />
          <text x={padL + 4} y={currentY - 5}
            fill="#64748b" fontSize="10" fontFamily="'JetBrains Mono', monospace">
            Today: {fmtFull(currentGross)}
          </text>

          {/* Area fill */}
          <path d={areaPath} fill="url(#sarahGrad)" />

          {/* Gradient def */}
          <defs>
            <linearGradient id="sarahGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#60a5fa" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Gross income line */}
          <path d={linePath} fill="none" stroke="#60a5fa" strokeWidth="2.5" strokeLinejoin="round" />
          {/* Net income line */}
          <path d={netLinePath} fill="none" stroke="#34d399" strokeWidth="2" strokeLinejoin="round" strokeDasharray="6,3" />

          {/* Target reached marker */}
          {targetMonth > 0 && targetMonth < months && (
            <g>
              <line x1={xOf(targetMonth)} x2={xOf(targetMonth)}
                y1={padT} y2={padT + plotH}
                stroke="#4ade80" strokeWidth="1" strokeDasharray="4,3" opacity="0.4" />
              <circle cx={xOf(targetMonth)} cy={yOf(pts[targetMonth].gross)}
                r="4" fill="#4ade80" stroke="#0f172a" strokeWidth="1.5" />
              <text x={xOf(targetMonth) + 6} y={yOf(pts[targetMonth].gross) - 6}
                fill="#4ade80" fontSize="10" fontWeight="700" fontFamily="'JetBrains Mono', monospace">
                Target hit ~{Math.floor(targetMonth / 12)}y{targetMonth % 12}m ({Math.floor((months - targetMonth) / 12)}y{(months - targetMonth) % 12}m at ceiling)
              </text>
            </g>
          )}

          {/* Hover crosshair + dot */}
          {tooltip && (
            <>
              <line x1={tooltip.x} y1={padT} x2={tooltip.x} y2={padT + plotH}
                stroke="#94a3b8" strokeWidth={0.8} opacity={0.5} />
              <circle cx={tooltip.x} cy={yOf(tooltip.gross)} r="5"
                fill="#60a5fa" stroke="#0f172a" strokeWidth="2" />
            </>
          )}
        </svg>

        {/* Tooltip */}
        {tooltip && (() => {
          const flipLeft = tooltip.pctX > 65;
          const growth = growthPct(tooltip.gross);
          return (
            <div style={{
              position: "absolute",
              left: flipLeft ? undefined : `${tooltip.pctX}%`,
              right: flipLeft ? `${100 - tooltip.pctX}%` : undefined,
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
                {tooltip.dateLabel} ({tooltip.label})
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 2 }}>
                <span style={{ color: "#94a3b8" }}>Gross income</span>
                <span style={{ color: "#60a5fa", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{fmtFull(tooltip.gross)}/mo</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 2 }}>
                <span style={{ color: "#94a3b8" }}>Net after tax</span>
                <span style={{ color: "#34d399", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{fmtFull(tooltip.net)}/mo</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 2 }}>
                <span style={{ color: "#94a3b8" }}>Hourly rate</span>
                <span style={{ color: "#e2e8f0", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>${tooltip.rate}/hr</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 2 }}>
                <span style={{ color: "#94a3b8" }}>Clients/day</span>
                <span style={{ color: "#e2e8f0", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{tooltip.clients}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 2 }}>
                <span style={{ color: "#94a3b8" }}>Daily gross</span>
                <span style={{ color: "#e2e8f0", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>${Math.round(tooltip.rate * tooltip.clients)}</span>
              </div>
              {tooltip.m > 0 && (
                <div style={{ borderTop: "1px solid #334155", marginTop: 4, paddingTop: 3, display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#94a3b8" }}>Growth</span>
                  <span style={{ color: growth >= 0 ? "#4ade80" : "#f87171", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
                    {growth >= 0 ? "+" : ""}{growth}%
                  </span>
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* Stats row */}
      <div style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
        {(() => {
          const totalYears = Math.round(months / 12);
          // Adaptive milestones: evenly spaced across the horizon
          const milestoneMonths = totalYears <= 3
            ? [0, 12, 24, 36].filter(m => m <= months)
            : [0, Math.round(months / 3), Math.round(2 * months / 3), months];
          return milestoneMonths.map((m, i) => {
            const p = pts[m];
            if (!p) return null;
            const label = m === 0 ? "Today" : `Year ${Math.round(m / 12)}`;
            // Annual: sum 12 months centered on this point
            const yearStart = Math.max(0, m === 0 ? 0 : m);
            const yearEnd = Math.min(pts.length - 1, yearStart + 11);
            const annualGross = pts.slice(yearStart, yearEnd + 1).reduce((s, pt) => s + pt.gross, 0);
            const annualNet = pts.slice(yearStart, yearEnd + 1).reduce((s, pt) => s + pt.net, 0);
            const monthsInYear = yearEnd - yearStart + 1;
            // Annualize if partial year
            const annualGrossScaled = monthsInYear < 12 ? Math.round(annualGross * 12 / monthsInYear) : annualGross;
            const annualNetScaled = monthsInYear < 12 ? Math.round(annualNet * 12 / monthsInYear) : annualNet;
            return (
              <div key={i} data-testid={`sarah-practice-stat-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`} style={{
                flex: 1, minWidth: 110, background: "#0f172a", borderRadius: 6, padding: "6px 8px",
                border: i === 0 ? "1px solid #60a5fa33" : "1px solid #1e293b"
              }}>
                <div style={{ fontSize: 10, color: "#64748b", marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#60a5fa", fontFamily: "'JetBrains Mono', monospace" }}>
                  {fmtFull(p.gross)}
                </div>
                <div style={{ fontSize: 10, color: "#475569" }}>
                  ${p.rate}/hr × {p.clients}/day
                </div>
                <div style={{ fontSize: 10, color: "#475569", marginTop: 2, borderTop: "1px solid #1e293b", paddingTop: 2 }}>
                  <span style={{ color: "#60a5fa" }}>{fmt(annualGrossScaled)}</span>
                  <span style={{ color: "#334155" }}> / </span>
                  <span style={{ color: "#34d399" }}>{fmt(annualNetScaled)}</span>
                  <span style={{ color: "#475569" }}>/yr</span>
                </div>
              </div>
            );
          });
        })()}
      </div>

      {/* Sliders */}
      {set && (
        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ padding: "10px 12px", background: "#0f172a", borderRadius: 8, border: "1px solid #334155" }}>
            <div style={{ fontSize: 11, color: "#60a5fa", marginBottom: 6, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Rate</div>
            <Slider label="Current hourly rate" value={sarahRate} onChange={set('sarahRate')} commitStrategy={commitStrategy} min={150} max={300} step={10} format={(v) => "$" + v + "/hr"} />
            <Slider label="Rate growth/yr" value={sarahRateGrowth} onChange={set('sarahRateGrowth')} commitStrategy={commitStrategy} min={0} max={20} format={(v) => v + "%"} />
            <Slider label="Max rate (ceiling)" value={sarahMaxRate} onChange={set('sarahMaxRate')} commitStrategy={commitStrategy} min={200} max={400} step={10} format={(v) => "$" + v + "/hr"} color="#64748b" />
          </div>
          <div style={{ padding: "10px 12px", background: "#0f172a", borderRadius: 8, border: "1px solid #334155" }}>
            <div style={{ fontSize: 11, color: "#60a5fa", marginBottom: 6, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Clients</div>
            <Slider label="Current clients/day" value={sarahCurrentClients} onChange={set('sarahCurrentClients')} commitStrategy={commitStrategy} min={1} max={5} step={0.1} format={(v) => v.toFixed(1)} />
            <Slider label="Client growth/yr" value={sarahClientGrowth} onChange={set('sarahClientGrowth')} commitStrategy={commitStrategy} min={0} max={30} format={(v) => v + "%"} />
            <Slider label="Max clients/day (ceiling)" value={sarahMaxClients} onChange={set('sarahMaxClients')} commitStrategy={commitStrategy} min={3} max={7} step={0.5} format={(v) => v.toFixed(1)} color="#64748b" />
          </div>
          <div style={{ padding: "10px 12px", background: "#0f172a", borderRadius: 8, border: "1px solid #334155" }}>
            <div style={{ fontSize: 11, color: "#60a5fa", marginBottom: 6, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Tax</div>
            <Slider label="Effective tax rate (SE + federal)" value={sarahTaxRate} onChange={set('sarahTaxRate')} commitStrategy={commitStrategy} min={15} max={40} color="#60a5fa" format={(v) => v + "%"} />
          </div>
          <div style={{ padding: "10px 12px", background: "#0f172a", borderRadius: 8, border: "1px solid #334155" }}>
            <div style={{ fontSize: 11, color: "#60a5fa", marginBottom: 6, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Working Duration</div>
            <Slider label="Sarah works for" value={sarahWorkMonths || 72} onChange={set('sarahWorkMonths')} commitStrategy='release' min={36} max={144} step={3} color="#a78bfa" format={(v) => { const y = Math.floor(v / 12); const m = v % 12; return m === 0 ? `${y} yr` : `${y}y ${m}m`; }} />
          </div>
          <div style={{ padding: "8px 12px", background: "#0f172a", borderRadius: 8, border: "1px solid #334155" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
              <span style={{ color: "#64748b" }}>Current gross:</span>
              <span style={{ color: "#94a3b8", fontFamily: "'JetBrains Mono', monospace" }}>{fmtFull(sarahCurrentGross)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 2 }}>
              <span style={{ color: "#60a5fa", fontWeight: 600 }}>After tax ({sarahTaxRate}%):</span>
              <span style={{ color: "#60a5fa", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{fmtFull(sarahCurrentNet)}/mo</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 4, paddingTop: 4, borderTop: "1px solid #334155" }}>
              <span style={{ color: "#64748b" }}>Net ceiling ({sarahTaxRate}%):</span>
              <span style={{ color: "#94a3b8", fontFamily: "'JetBrains Mono', monospace" }}>{fmtFull(sarahCeiling)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 2 }}>
              <span style={{ color: "#64748b" }}>Capacity used:</span>
              <span style={{ color: sarahCurrentGross / sarahCeilingGross > 0.8 ? "#eab308" : "#4ade80", fontFamily: "'JetBrains Mono', monospace" }}>{Math.round(sarahCurrentGross / sarahCeilingGross * 100)}%</span>
            </div>
            <div style={{ borderTop: "1px solid #334155", marginTop: 4, paddingTop: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ color: "#64748b" }}>Total gross ({Math.round((sarahWorkMonths || 72) / 12)}yr):</span>
                <span style={{ color: "#94a3b8", fontFamily: "'JetBrains Mono', monospace" }}>{fmt(pts.reduce((s, p) => s + p.gross, 0))}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 2 }}>
                <span style={{ color: "#34d399", fontWeight: 600 }}>Total net ({Math.round((sarahWorkMonths || 72) / 12)}yr):</span>
                <span style={{ color: "#34d399", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{fmt(pts.reduce((s, p) => s + p.net, 0))}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
