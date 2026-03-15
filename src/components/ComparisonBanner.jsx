import React from "react";
import { fmtFull } from "../model/formatters.js";

export default function ComparisonBanner({ compareState, compareName, onClearCompare }) {
  if (!compareState) return null;

  return (
    <div style={{
      background: "#fbbf2410", borderRadius: 12, padding: "12px 20px",
      border: "1px solid #fbbf2433", marginBottom: 16,
      display: "flex", justifyContent: "space-between", alignItems: "center"
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 12, height: 3, background: "#fbbf24", borderRadius: 1 }} />
        <span style={{ fontSize: 13, color: "#fbbf24", fontWeight: 600 }}>
          Comparing current settings vs "{compareName}"
        </span>
        <span style={{ fontSize: 11, color: "#64748b" }}>
          {"\u2014"} dashed line = "{compareName}", solid line = current
        </span>
      </div>
      <button
        onClick={onClearCompare}
        style={{
          background: "transparent", border: "1px solid #fbbf24", borderRadius: 4,
          color: "#fbbf24", fontSize: 11, padding: "4px 10px", cursor: "pointer",
          fontFamily: "'Inter', sans-serif"
        }}
      >
        Clear comparison
      </button>
    </div>
  );
}
