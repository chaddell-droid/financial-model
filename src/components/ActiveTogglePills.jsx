import React from "react";
import { fmtFull } from "../model/formatters.js";

export default function ActiveTogglePills({ retireDebt, lifestyleCutsApplied, vanSold, debtService, totalCuts }) {
  const pills = [];
  if (retireDebt) pills.push({ label: `Debt Retired (saves ${fmtFull(debtService)}/mo)`, color: "#4ade80" });
  if (lifestyleCutsApplied) pills.push({ label: `Cuts Applied (${fmtFull(totalCuts)}/mo)`, color: "#4ade80" });
  if (vanSold) pills.push({ label: "Van Sold", color: "#4ade80" });

  if (pills.length === 0) return null;

  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
      {pills.map((p, i) => (
        <span key={i} style={{
          fontSize: 10, fontWeight: 600, color: p.color,
          background: "rgba(74, 222, 128, 0.08)",
          border: `1px solid ${p.color}33`,
          borderRadius: 6, padding: "3px 8px",
          letterSpacing: "0.02em",
        }}>
          {p.label}
        </span>
      ))}
    </div>
  );
}
