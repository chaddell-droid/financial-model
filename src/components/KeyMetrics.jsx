import React from "react";
import { fmt, fmtFull } from "../model/formatters.js";

export default function KeyMetrics({
  netMonthly,
  breakevenLabel,
  breakevenIdx,
  savingsZeroLabel,
  savingsZeroMonth,
  advanceNeeded,
  mcResults,
  rawMonthlyGap,
  steadyStateNet,
  steadyLabel,
}) {
  // Gap Journey — 4-card progression
  const journeyCards = [
    { label: "Today (raw)", value: rawMonthlyGap, color: "#f87171", sublabel: "No toggles, no plan" },
    { label: "Now (with plan)", value: netMonthly, color: netMonthly >= 0 ? "#4ade80" : "#94a3b8", sublabel: "Current assumptions" },
    { label: `Steady state (${steadyLabel || "Y3"})`, value: steadyStateNet, color: steadyStateNet >= 0 ? "#4ade80" : "#94a3b8", sublabel: "Post-ramp target" },
    { label: "Total swing", value: steadyStateNet - rawMonthlyGap, color: (steadyStateNet - rawMonthlyGap) > 0 ? "#4ade80" : "#f87171", sublabel: "Raw → steady" },
  ];

  const metrics = [
    { label: "Current Monthly Gap", value: netMonthly, color: netMonthly >= 0 ? "#4ade80" : "#f87171" },
    { label: "Cash Flow Breakeven", value: breakevenLabel, isText: true, color: breakevenIdx >= 0 ? "#4ade80" : "#fbbf24", sublabel: "When income \u2265 expenses", smallText: breakevenIdx < 0 },
    { label: "Savings Runway", value: savingsZeroLabel, isText: true, color: savingsZeroMonth ? "#f87171" : "#4ade80", sublabel: savingsZeroMonth ? "Until savings depleted" : "Savings survive 6+ yrs" },
    { label: "Advance Ask", value: advanceNeeded, color: "#fbbf24", isPositive: true },
    ...(mcResults ? [{ label: "MC Solvency", value: `${(mcResults.solvencyRate * 100).toFixed(1)}%`, isText: true, color: mcResults.solvencyRate >= 0.95 ? "#4ade80" : mcResults.solvencyRate >= 0.80 ? "#fbbf24" : "#f87171", sublabel: `${mcResults.numSims} simulations` }] : []),
  ];

  return (
    <>
      {/* Gap Journey — financial trajectory */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "stretch" }}>
        {journeyCards.map((card, i) => (
          <React.Fragment key={i}>
            <div style={{
              flex: 1, background: "#1e293b", borderRadius: 10, padding: "12px 14px",
              border: "1px solid #334155", textAlign: "center"
            }}>
              <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{card.label}</div>
              <div style={{
                fontSize: 20, fontWeight: 700, color: card.color,
                fontFamily: "'JetBrains Mono', monospace"
              }}>
                {fmtFull(card.value)}
              </div>
              <div style={{ fontSize: 9, color: "#475569", marginTop: 2 }}>{card.sublabel}</div>
            </div>
            {i < journeyCards.length - 1 && (
              <div style={{ display: "flex", alignItems: "center", color: "#475569", fontSize: 18 }}>{"\u2192"}</div>
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Core metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 24 }}>
        {metrics.map((m, i) => (
          <div key={i} style={{
            background: "#1e293b", borderRadius: 10, padding: "14px 16px",
            border: "1px solid #334155"
          }}>
            <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{m.label}</div>
            <div style={{
              fontSize: m.smallText ? 15 : 22, fontWeight: 700, color: m.color,
              fontFamily: "'JetBrains Mono', monospace"
            }}>
              {m.isText ? m.value : (m.isPositive ? fmtFull(m.value) : fmtFull(m.value))}
            </div>
            {m.sublabel && (
              <div style={{ fontSize: 10, color: "#475569", marginTop: 2 }}>{m.sublabel}</div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
