import React from "react";

const TABS = [
  { id: "overview", label: "Overview", icon: "\u{1F4CA}" },
  { id: "plan", label: "Plan", icon: "\u{1F4DD}" },
  { id: "income", label: "Income", icon: "\u{1F4B0}" },
  { id: "risk", label: "Risk", icon: "\u{1F6E1}\uFE0F" },
  { id: "details", label: "Details", icon: "\u{1F50D}" },
];

const accentColors = {
  overview: "#60a5fa",
  plan: "#4ade80",
  income: "#c084fc",
  risk: "#f59e0b",
  details: "#94a3b8",
};

export default function TabBar({ activeTab, onChange }) {
  return (
    <div data-testid="tab-bar" style={{
      display: "flex", gap: 4, marginBottom: 20, padding: "4px",
      background: "#0f172a", borderRadius: 12, border: "1px solid #1e293b",
      position: "sticky", top: 0, zIndex: 20,
    }}>
      {TABS.map(tab => {
        const active = activeTab === tab.id;
        const color = accentColors[tab.id];
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            data-testid={`tab-${tab.id}`}
            aria-label={`Open ${tab.label} tab`}
            style={{
              flex: 1, padding: "10px 8px", borderRadius: 10, cursor: "pointer",
              border: "none",
              background: active ? "#1e293b" : "transparent",
              color: active ? color : "#64748b",
              fontSize: 12, fontWeight: active ? 700 : 500,
              fontFamily: "'Inter', sans-serif",
              transition: "all 0.15s",
              borderBottom: active ? `2px solid ${color}` : "2px solid transparent",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}
          >
            <span style={{ fontSize: 14 }}>{tab.icon}</span>
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
