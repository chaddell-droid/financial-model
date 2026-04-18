import React from "react";
import { fmt, fmtFull } from '../model/formatters.js';

const DataTable = ({ data, presentMode }) => {
  if (presentMode) return null;

  return (
        <div style={{
          background: "#1e293b", borderRadius: 12, padding: 20,
          border: "1px solid #334155", overflowX: "auto"
        }}>
          <h3 style={{ fontSize: 14, color: "#94a3b8", margin: "0 0 12px", fontWeight: 600 }}>Detailed Projections</h3>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #334155" }}>
                {["Period", "Sarah", "MSFT", "Trust/LLC", "Chad Job", "SSDI", "Consult", "Invest/Q", "Total In", "Expenses", "Net/Mo"].map((h, i) => (
                  <th key={i} style={{ padding: "8px 6px", textAlign: i === 0 ? "left" : "right", color: "#64748b", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((d, i) => {
                const isPostVesting = d.msftVesting === 0 && d.month > 0;
                return (
                  <tr key={i} style={{
                    borderBottom: "1px solid #1e293b",
                    background: isPostVesting ? "rgba(245, 158, 11, 0.03)" : (i % 2 === 0 ? "transparent" : "rgba(15, 23, 42, 0.13)")
                  }}>
                    <td style={{ padding: "6px", color: "#94a3b8", fontWeight: 600 }}>{d.label}</td>
                    <td style={{ padding: "6px", textAlign: "right", color: "#60a5fa" }}>{fmt(d.sarahIncome)}</td>
                    <td style={{ padding: "6px", textAlign: "right", color: d.msftVesting > 0 ? (d.msftVesting < 6000 ? "#f87171" : "#f59e0b") : "#334155", fontWeight: d.msftVesting === 0 ? 400 : 600 }}>
                      {d.msftVesting > 0 ? fmt(d.msftVesting) : (d.month > 0 ? "\u2014" : fmt(d.msftVesting))}
                    </td>
                    <td style={{ padding: "6px", textAlign: "right", color: "#c084fc" }}>{fmt(d.trustLLC)}</td>
                    <td style={{ padding: "6px", textAlign: "right", color: d.chadJobIncome > 0 ? "#22c55e" : "#334155" }}>{d.chadJobIncome > 0 ? fmt(d.chadJobIncome) : "\u2014"}</td>
                    <td style={{ padding: "6px", textAlign: "right", color: d.ssBenefit > 0 ? "#fbbf24" : "#334155" }}>{d.ssBenefit > 0 ? fmt(d.ssBenefit) : "\u2014"}</td>
                    <td style={{ padding: "6px", textAlign: "right", color: d.consulting > 0 ? "#38bdf8" : "#334155" }}>{d.consulting > 0 ? fmt(d.consulting) : "\u2014"}</td>
                    <td style={{ padding: "6px", textAlign: "right", color: d.investReturnQtr > 0 ? "#22d3ee" : "#334155" }}>{d.investReturnQtr > 0 ? fmt(d.investReturnQtr) : "\u2014"}</td>
                    <td style={{ padding: "6px", textAlign: "right", color: "#e2e8f0", fontWeight: 600 }}>{fmt(d.totalIncome)}</td>
                    <td style={{ padding: "6px", textAlign: "right", color: "#f87171" }}>{fmt(d.expenses)}</td>
                    <td style={{
                      padding: "6px", textAlign: "right", fontWeight: 700,
                      color: d.netMonthly >= 0 ? "#4ade80" : "#f87171"
                    }}>{d.netMonthly >= 0 ? "+" : ""}{fmt(d.netMonthly)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
  );
};

export default DataTable;
