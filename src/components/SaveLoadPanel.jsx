import React from "react";

export default function SaveLoadPanel({
  showSaveLoad,
  savedScenarios,
  scenarioName,
  onScenarioNameChange,
  onSave,
  onLoad,
  onCompare,
  compareName,
  onClearCompare,
  onDelete,
  storageStatus,
  storageAvailable
}) {
  if (!showSaveLoad) return null;

  return (
    <div style={{
      background: "#1e293b", borderRadius: 12, padding: "16px 20px",
      border: "1px solid #60a5fa33", marginBottom: 24
    }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
        <input
          type="text"
          value={scenarioName}
          onChange={(e) => onScenarioNameChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSave(scenarioName)}
          placeholder="Name this scenario..."
          style={{
            flex: 1, background: "#0f172a", border: "1px solid #334155", borderRadius: 6,
            color: "#e2e8f0", padding: "8px 12px", fontSize: 13,
            fontFamily: "'Inter', sans-serif", outline: "none"
          }}
        />
        <button
          onClick={() => onSave(scenarioName)}
          disabled={!scenarioName.trim()}
          style={{
            background: scenarioName.trim() ? "#60a5fa" : "#334155", border: "none", borderRadius: 6,
            color: scenarioName.trim() ? "#0f172a" : "#64748b", fontSize: 12, padding: "8px 16px",
            cursor: scenarioName.trim() ? "pointer" : "not-allowed",
            fontWeight: 700, fontFamily: "'Inter', sans-serif", whiteSpace: "nowrap",
            transition: "all 0.2s"
          }}
        >
          Save Current
        </button>
        {storageStatus === "saved" && (
          <span style={{ fontSize: 11, color: "#4ade80", whiteSpace: "nowrap" }}>Saved!</span>
        )}
        {storageStatus === "no-storage" && (
          <span style={{ fontSize: 11, color: "#f87171", whiteSpace: "nowrap" }}>Storage unavailable</span>
        )}
        {storageStatus.startsWith("error") && (
          <span style={{ fontSize: 11, color: "#f87171", whiteSpace: "nowrap" }}>{storageStatus}</span>
        )}
        {storageStatus === "set-returned-null" && (
          <span style={{ fontSize: 11, color: "#f87171", whiteSpace: "nowrap" }}>Save failed (null)</span>
        )}
      </div>
      {savedScenarios.length === 0 ? (
        <div style={{ fontSize: 12, color: "#475569", fontStyle: "italic" }}>No saved scenarios yet. Adjust settings and save to compare later.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {savedScenarios.map((s, i) => (
            <div key={i} style={{
              padding: "8px 12px", background: "#0f172a", borderRadius: 6, border: "1px solid #334155"
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 13, color: "#e2e8f0", fontWeight: 600 }}>{s.name}</div>
                  <div style={{ fontSize: 10, color: "#475569" }}>
                    {new Date(s.savedAt).toLocaleDateString()} {new Date(s.savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button onClick={() => onLoad(s)}
                    style={{ background: "transparent", border: "1px solid #4ade80", borderRadius: 4, color: "#4ade80", fontSize: 11, padding: "4px 10px", cursor: "pointer", fontFamily: "'Inter', sans-serif" }}>
                    Load
                  </button>
                  <button onClick={() => onSave(s.name)}
                    style={{ background: "transparent", border: "1px solid #60a5fa", borderRadius: 4, color: "#60a5fa", fontSize: 11, padding: "4px 10px", cursor: "pointer", fontFamily: "'Inter', sans-serif" }}>
                    Update
                  </button>
                  <button onClick={() => onCompare(s.name, s.state)}
                    style={{ background: compareName === s.name ? "#fbbf2420" : "transparent", border: "1px solid #fbbf24", borderRadius: 4, color: "#fbbf24", fontSize: 11, padding: "4px 10px", cursor: "pointer", fontFamily: "'Inter', sans-serif" }}>
                    {compareName === s.name ? "Comparing" : "Compare"}
                  </button>
                  <button onClick={() => onDelete(s.name)}
                    style={{ background: "transparent", border: "1px solid #475569", borderRadius: 4, color: "#64748b", fontSize: 11, padding: "4px 8px", cursor: "pointer", fontFamily: "'Inter', sans-serif" }}>
                    {"\u2715"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <div style={{ marginTop: 8, fontSize: 10, color: "#334155" }}>
        Storage: {storageAvailable ? "available" : "unavailable"} | Status: {storageStatus || "idle"} | Scenarios in memory: {savedScenarios.length}
      </div>
    </div>
  );
}
