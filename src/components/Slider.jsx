import React from "react";
import { fmtFull } from '../model/formatters.js';

const Slider = ({ label, value, onChange, min, max, step = 1, format = fmtFull, color = "#60a5fa" }) => (
  <div style={{ padding: "4px 0" }}>
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
      <span style={{ fontSize: 13, color: "#94a3b8" }}>{label}</span>
      <span style={{ fontSize: 13, color, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>{format(value)}</span>
    </div>
    <input type="range" min={min} max={max} step={step} value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{ width: "100%", accentColor: color, height: 6 }} />
  </div>
);

export default Slider;
