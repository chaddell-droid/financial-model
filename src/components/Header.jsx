import React from "react";

export default function Header({ presentMode, onTogglePresentMode, onEnterDadMode, onEnterSarahMode, showSaveLoad, onToggleSaveLoad, savedScenarios, onReset, onExportJSON }) {
  return (
    <div style={{ marginBottom: 28, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
      <div>
        <h1 style={{ fontSize: presentMode ? 28 : 22, fontWeight: 700, color: "#f8fafc", margin: 0, letterSpacing: "-0.02em" }}>
          Financial Planning Model
        </h1>
        <p style={{ fontSize: presentMode ? 15 : 13, color: "#64748b", margin: "4px 0 0" }}>
          {presentMode ? "Family financial sustainability plan — 5-year projection" : "Interactive scenario planner — adjust assumptions below"}
        </p>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button
          onClick={onTogglePresentMode}
          style={{
            background: presentMode ? "#4ade80" : "transparent",
            border: `1px solid ${presentMode ? "#4ade80" : "#475569"}`, borderRadius: 8,
            color: presentMode ? "#0f172a" : "#94a3b8", fontSize: 12, padding: "8px 14px", cursor: "pointer",
            transition: "all 0.2s", fontFamily: "'Inter', sans-serif", whiteSpace: "nowrap",
            fontWeight: presentMode ? 700 : 400
          }}
        >
          {presentMode ? "\u2715 Exit Presentation" : "\u25B6 Present"}
        </button>
        {!presentMode && <button
          onClick={onEnterSarahMode}
          style={{
            background: "transparent", border: "1px solid #2dd4bf", borderRadius: 8,
            color: "#2dd4bf", fontSize: 12, padding: "8px 14px", cursor: "pointer",
            transition: "all 0.2s", fontFamily: "'Inter', sans-serif", whiteSpace: "nowrap"
          }}
        >
          {"\uD83C\uDF1F"} Sarah's View
        </button>}
        {!presentMode && <button
          onClick={onEnterDadMode}
          style={{
            background: "transparent", border: "1px solid #c084fc", borderRadius: 8,
            color: "#c084fc", fontSize: 12, padding: "8px 14px", cursor: "pointer",
            transition: "all 0.2s", fontFamily: "'Inter', sans-serif", whiteSpace: "nowrap"
          }}
        >
          {"\uD83D\uDC68\u200D\uD83D\uDC67"} Dad Mode
        </button>}
        {!presentMode && <button
          onClick={onToggleSaveLoad}
          style={{
            background: showSaveLoad ? "#1e293b" : "transparent", border: "1px solid #475569", borderRadius: 8,
            color: showSaveLoad ? "#60a5fa" : "#94a3b8", fontSize: 12, padding: "8px 14px", cursor: "pointer",
            transition: "all 0.2s", fontFamily: "'Inter', sans-serif", whiteSpace: "nowrap"
          }}
          onMouseEnter={(e) => { e.target.style.borderColor = "#60a5fa"; e.target.style.color = "#60a5fa"; }}
          onMouseLeave={(e) => { e.target.style.borderColor = "#475569"; e.target.style.color = showSaveLoad ? "#60a5fa" : "#94a3b8"; }}
        >
          {showSaveLoad ? "Hide Scenarios" : `Saved (${savedScenarios.length})`}
        </button>}
        {!presentMode && <button
          onClick={onReset}
          style={{
            background: "transparent", border: "1px solid #475569", borderRadius: 8,
            color: "#94a3b8", fontSize: 12, padding: "8px 14px", cursor: "pointer",
            transition: "all 0.2s", fontFamily: "'Inter', sans-serif", whiteSpace: "nowrap"
          }}
          onMouseEnter={(e) => { e.target.style.borderColor = "#f87171"; e.target.style.color = "#f87171"; }}
          onMouseLeave={(e) => { e.target.style.borderColor = "#475569"; e.target.style.color = "#94a3b8"; }}
        >
          {"\u21BA"} Reset All
        </button>}
        {!presentMode && onExportJSON && <button
          onClick={onExportJSON}
          style={{
            background: "transparent", border: "1px solid #475569", borderRadius: 8,
            color: "#94a3b8", fontSize: 12, padding: "8px 14px", cursor: "pointer",
            transition: "all 0.2s", fontFamily: "'Inter', sans-serif", whiteSpace: "nowrap"
          }}
          onMouseEnter={(e) => { e.target.style.borderColor = "#60a5fa"; e.target.style.color = "#60a5fa"; }}
          onMouseLeave={(e) => { e.target.style.borderColor = "#475569"; e.target.style.color = "#94a3b8"; }}
        >
          {"\u2193"} Export JSON
        </button>}
      </div>
    </div>
  );
}
