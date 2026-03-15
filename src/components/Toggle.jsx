import React from "react";

const Toggle = ({ label, checked, onChange, color = "#4ade80" }) => (
  <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "6px 0" }}>
    <div
      onClick={(e) => { e.preventDefault(); onChange(!checked); }}
      style={{
        width: 44, height: 24, borderRadius: 12, position: "relative",
        background: checked ? color : "#334155", transition: "background 0.2s",
        flexShrink: 0
      }}
    >
      <div style={{
        width: 20, height: 20, borderRadius: 10, background: "#fff",
        position: "absolute", top: 2, left: checked ? 22 : 2, transition: "left 0.2s",
        boxShadow: "0 1px 3px rgba(0,0,0,0.3)"
      }} />
    </div>
    <span style={{ fontSize: 14, color: "#e2e8f0", lineHeight: 1.3 }}>{label}</span>
  </label>
);

export default Toggle;
