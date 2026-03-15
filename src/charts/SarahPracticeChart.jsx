import React from "react";
import { fmtFull } from "../model/formatters.js";
import { DAYS_PER_MONTH } from "../model/constants.js";

export default function SarahPracticeChart({
  sarahRate,
  sarahMaxRate,
  sarahRateGrowth,
  sarahCurrentClients,
  sarahMaxClients,
  sarahClientGrowth,
}) {
  const months = 60;
  const chartW = 800;
  const chartH = 240;
  const padL = 55;
  const padR = 20;
  const padT = 20;
  const padB = 30;
  const plotW = chartW - padL - padR;
  const plotH = chartH - padT - padB;

  // Compute monthly data points
  const pts = [];
  for (let m = 0; m <= months; m++) {
    const rate = Math.min(sarahRate * Math.pow(1 + sarahRateGrowth / 100, m / 12), sarahMaxRate);
    const clients = Math.min(sarahCurrentClients * Math.pow(1 + sarahClientGrowth / 100, m / 12), sarahMaxClients);
    const gross = Math.round(rate * clients * DAYS_PER_MONTH);
    pts.push({ m, rate: Math.round(rate), clients: +clients.toFixed(2), gross });
  }

  const maxGross = Math.max(...pts.map(p => p.gross)) * 1.1;
  const minGross = Math.min(...pts.map(p => p.gross)) * 0.9;
  const grossRange = maxGross - minGross || 1;

  const xOf = (m) => padL + (m / months) * plotW;
  const yOf = (val) => padT + ((maxGross - val) / grossRange) * plotH;

  // Income line path
  const linePath = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${xOf(p.m).toFixed(1)},${yOf(p.gross).toFixed(1)}`).join(" ");
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

  return (
    <div style={{
      background: "#1e293b", borderRadius: 12, padding: "20px 16px",
      border: "1px solid #334155", marginBottom: 24
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
        <h3 style={{ fontSize: 14, color: "#60a5fa", margin: 0, fontWeight: 600 }}>Sarah's Practice Growth</h3>
        <div style={{ fontSize: 11, color: "#64748b" }}>
          <span style={{ color: "#60a5fa", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{fmtFull(currentGross)}</span>
          <span> → </span>
          <span style={{ color: "#4ade80", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{fmtFull(targetGross)}</span>
          <span>/mo</span>
        </div>
      </div>
      <p style={{ fontSize: 11, color: "#475569", margin: "0 0 12px" }}>
        ${sarahRate}/hr × {sarahCurrentClients.toFixed(1)} clients → ${sarahMaxRate}/hr × {sarahMaxClients.toFixed(1)} clients
        {" "}| Rate +{sarahRateGrowth}%/yr, Clients +{sarahClientGrowth}%/yr
      </p>

      <svg viewBox={`0 0 ${chartW} ${chartH}`} style={{ width: "100%", height: "auto" }}>
        {/* Grid lines */}
        {yTicks.map(v => (
          <g key={v}>
            <line x1={padL} x2={chartW - padR} y1={yOf(v)} y2={yOf(v)}
              stroke="#1e293b" strokeWidth="1" />
            <text x={padL - 6} y={yOf(v) + 3} textAnchor="end"
              fill="#475569" fontSize="9" fontFamily="'JetBrains Mono', monospace">
              {v >= 1000 ? `$${Math.round(v/1000)}K` : `$${v}`}
            </text>
          </g>
        ))}

        {/* Year markers on X axis */}
        {[0, 12, 24, 36, 48, 60].map(m => (
          <text key={m} x={xOf(m)} y={chartH - 4} textAnchor="middle"
            fill="#475569" fontSize="9" fontFamily="'JetBrains Mono', monospace">
            {m === 0 ? "Now" : m === 60 ? "'31" : `'${26 + Math.floor((2+m)/12)}`}
          </text>
        ))}

        {/* Target line */}
        <line x1={padL} x2={chartW - padR} y1={targetY} y2={targetY}
          stroke="#4ade80" strokeWidth="1" strokeDasharray="6,4" opacity="0.5" />
        <text x={chartW - padR - 2} y={targetY - 5} textAnchor="end"
          fill="#4ade80" fontSize="9" opacity="0.7" fontFamily="'JetBrains Mono', monospace">
          Target: {fmtFull(targetGross)}
        </text>

        {/* Current line */}
        <line x1={padL} x2={chartW - padR} y1={currentY} y2={currentY}
          stroke="#64748b" strokeWidth="1" strokeDasharray="4,4" opacity="0.3" />
        <text x={padL + 4} y={currentY - 5}
          fill="#64748b" fontSize="9" fontFamily="'JetBrains Mono', monospace">
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

        {/* Income line */}
        <path d={linePath} fill="none" stroke="#60a5fa" strokeWidth="2.5" strokeLinejoin="round" />

        {/* Target reached marker */}
        {targetMonth > 0 && targetMonth < months && (
          <g>
            <line x1={xOf(targetMonth)} x2={xOf(targetMonth)}
              y1={padT} y2={padT + plotH}
              stroke="#4ade80" strokeWidth="1" strokeDasharray="4,3" opacity="0.4" />
            <circle cx={xOf(targetMonth)} cy={yOf(pts[targetMonth].gross)}
              r="4" fill="#4ade80" stroke="#0f172a" strokeWidth="1.5" />
            <text x={xOf(targetMonth) + 6} y={yOf(pts[targetMonth].gross) - 6}
              fill="#4ade80" fontSize="9" fontWeight="700" fontFamily="'JetBrains Mono', monospace">
              Target hit ~{Math.floor(targetMonth / 12)}y{targetMonth % 12}m
            </text>
          </g>
        )}

        {/* Data callouts at key points */}
        {[0, 12, 24, 36].filter(m => m <= months).map(m => {
          const p = pts[m];
          return (
            <g key={`dot-${m}`}>
              <circle cx={xOf(m)} cy={yOf(p.gross)} r="3" fill="#60a5fa" stroke="#0f172a" strokeWidth="1" />
              {m > 0 && (
                <text x={xOf(m)} y={yOf(p.gross) + 14} textAnchor="middle"
                  fill="#94a3b8" fontSize="8" fontFamily="'JetBrains Mono', monospace">
                  ${p.rate} × {p.clients}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Stats row */}
      <div style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
        {[
          { label: "Today", rate: pts[0].rate, clients: pts[0].clients, gross: pts[0].gross },
          { label: "Year 1", rate: pts[12]?.rate, clients: pts[12]?.clients, gross: pts[12]?.gross },
          { label: "Year 2", rate: pts[24]?.rate, clients: pts[24]?.clients, gross: pts[24]?.gross },
          { label: "Year 3", rate: pts[36]?.rate, clients: pts[36]?.clients, gross: pts[36]?.gross },
        ].map((s, i) => (
          <div key={i} style={{
            flex: 1, minWidth: 100, background: "#0f172a", borderRadius: 6, padding: "6px 8px",
            border: i === 0 ? "1px solid #60a5fa33" : "1px solid #1e293b"
          }}>
            <div style={{ fontSize: 9, color: "#64748b", marginBottom: 2 }}>{s.label}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#60a5fa", fontFamily: "'JetBrains Mono', monospace" }}>
              {fmtFull(s.gross)}
            </div>
            <div style={{ fontSize: 9, color: "#475569" }}>
              ${s.rate}/hr × {s.clients}/day
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
