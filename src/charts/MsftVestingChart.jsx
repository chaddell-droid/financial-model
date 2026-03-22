import React from "react";
import { MSFT_FLOOR_PRICE } from '../model/constants.js';
import { getMsftPrice } from '../model/vesting.js';
import { fmtFull } from '../model/formatters.js';
import Slider from '../components/Slider.jsx';

const MsftVestingChart = ({ vestEvents, totalRemainingVesting, msftGrowth, onMsftGrowthChange }) => (
  <div data-testid="msft-vesting-chart" style={{
    background: "#1e293b", borderRadius: 12, padding: "16px 20px",
    border: "1px solid #f59e0b33", marginBottom: 24
  }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
      <h3 style={{ fontSize: 14, color: "#f59e0b", margin: 0, fontWeight: 700 }}>MSFT Vesting Runway — Actual Quarterly Payouts</h3>
      <span data-testid="msft-vesting-total-remaining" style={{ fontSize: 12, color: "#94a3b8" }}>Total remaining: <span style={{ color: "#f59e0b", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{fmtFull(totalRemainingVesting)}</span></span>
    </div>
    <div style={{ display: "flex", gap: 3, height: 80, alignItems: "flex-end" }}>
      {vestEvents.map((v, i) => {
        const maxNet = Math.max(...vestEvents.map(ve => ve.net));
        const barH = (v.net / maxNet) * 60;
        const isLow = v.net < 15000;
        return (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            <div style={{
              fontSize: 10, color: isLow ? "#f87171" : "#f59e0b",
              fontFamily: "'JetBrains Mono', monospace", whiteSpace: "nowrap", fontWeight: 600
            }}>
              {fmtFull(v.net)}
            </div>
            <div style={{
              fontSize: 9, color: "#475569",
              fontFamily: "'JetBrains Mono', monospace", whiteSpace: "nowrap", marginBottom: 1
            }}>
              {v.shares}sh
            </div>
            <div style={{
              width: "85%", height: barH, borderRadius: "3px 3px 0 0",
              background: isLow
                ? "linear-gradient(180deg, #f87171, #dc2626)"
                : "linear-gradient(180deg, #fbbf24, #f59e0b)",
            }} />
          </div>
        );
      })}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 2 }}>
        <div style={{ fontSize: 10, color: "#475569", fontFamily: "'JetBrains Mono', monospace" }}>$0</div>
        <div style={{ width: "85%", height: 2, background: "#334155", borderRadius: 1 }} />
      </div>
    </div>
    <div style={{ display: "flex", gap: 3, marginTop: 4 }}>
      {vestEvents.map((v, i) => (
        <div key={i} style={{ flex: 1, textAlign: "center" }}>
          <div style={{ fontSize: 10, color: "#64748b" }}>{v.label}</div>
          <div style={{ fontSize: 9, color: v.price < MSFT_FLOOR_PRICE - 0.5 ? "#f87171" : v.price > MSFT_FLOOR_PRICE + 0.5 ? "#4ade80" : "#475569", fontFamily: "'JetBrains Mono', monospace" }}>
            ${Math.round(v.price)}
          </div>
        </div>
      ))}
      <div style={{ flex: 1, textAlign: "center", fontSize: 10, color: "#ef4444", fontWeight: 700 }}>Done</div>
    </div>
    <div style={{ marginTop: 8, fontSize: 11, color: "#64748b", fontStyle: "italic" }}>
      Each bar = one quarterly vest (net after 20% tax). Nothing arrives between vests.
    </div>
    <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 16 }}>
      <div style={{ flex: 1 }}>
        <Slider label="MSFT annual price growth" value={msftGrowth} onChange={onMsftGrowthChange}
          min={-30} max={30} format={(v) => (v >= 0 ? "+" : "") + v + "%"} color="#f59e0b" />
      </div>
      <div data-testid="msft-vesting-footer" style={{ fontSize: 11, color: "#64748b", whiteSpace: "nowrap", textAlign: "right" }}>
        Floor: <span style={{ color: "#94a3b8", fontFamily: "'JetBrains Mono', monospace" }}>${MSFT_FLOOR_PRICE}</span>
        {msftGrowth !== 0 && (
          <> → Y5: <span data-testid="msft-vesting-y5-price" style={{ color: "#f59e0b", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>${Math.round(getMsftPrice(60, msftGrowth))}</span></>
        )}
      </div>
    </div>
  </div>
);

export default MsftVestingChart;
