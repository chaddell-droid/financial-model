import React, { useState, useCallback } from "react";
import { getMsftPrice } from '../model/vesting.js';
import { fmtFull } from '../model/formatters.js';
import Slider from '../components/Slider.jsx';

function MsftVestingChart({ vestEvents, totalRemainingVesting, msftPrice, msftGrowth, onMsftGrowthChange, onMsftPriceChange }) {
  const [fetching, setFetching] = useState(false);

  const handleRefreshPrice = useCallback(async () => {
    setFetching(true);
    try {
      // Try Yahoo Finance chart API (CORS-friendly, no key needed)
      const res = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/MSFT?range=1d&interval=1d');
      const data = await res.json();
      const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (price && price > 0) {
        onMsftPriceChange(Math.round(price * 100) / 100);
        setFetching(false);
        return;
      }
    } catch (e) { /* Yahoo failed, try fallback */ }
    try {
      // Fallback: Google Finance page scrape via allorigins proxy
      const res = await fetch('https://api.allorigins.win/raw?url=' + encodeURIComponent('https://www.google.com/finance/quote/MSFT:NASDAQ'));
      const html = await res.text();
      const match = html.match(/data-last-price="([0-9.]+)"/);
      if (match) {
        const price = parseFloat(match[1]);
        if (price > 0) onMsftPriceChange(Math.round(price * 100) / 100);
      }
    } catch (e) { /* all fetches failed */ }
    setFetching(false);
  }, [onMsftPriceChange]);

  return (
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
          <div style={{ fontSize: 9, color: "#94a3b8", fontFamily: "'JetBrains Mono', monospace" }}>
            ${Math.round(v.price)}
          </div>
        </div>
      ))}
      <div style={{ flex: 1, textAlign: "center", fontSize: 10, color: "#ef4444", fontWeight: 700 }}>Done</div>
    </div>
    <div style={{ marginTop: 8, fontSize: 11, color: "#64748b", fontStyle: "italic" }}>
      Each bar = one quarterly vest (net after 20% tax). Nothing arrives between vests.
    </div>
    <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <Slider label="MSFT current price" value={msftPrice} onChange={onMsftPriceChange} commitStrategy='release'
            min={200} max={600} step={1} format={(v) => "$" + v} color="#f59e0b" />
          <button onClick={handleRefreshPrice} disabled={fetching}
            title="Fetch current MSFT price"
            style={{
              background: 'transparent', border: '1px solid #334155', borderRadius: 4,
              color: fetching ? '#64748b' : '#f59e0b', fontSize: 10, padding: '2px 6px',
              cursor: fetching ? 'wait' : 'pointer', whiteSpace: 'nowrap', marginTop: 12,
            }}>
            {fetching ? '...' : '↻ Live'}
          </button>
        </div>
      </div>
      <Slider label="MSFT annual price growth" value={msftGrowth} onChange={onMsftGrowthChange} commitStrategy='release'
        min={-30} max={30} format={(v) => (v >= 0 ? "+" : "") + v + "%"} color="#f59e0b" />
    </div>
    {msftGrowth !== 0 && (
      <div style={{ marginTop: 4, fontSize: 11, color: "#64748b", textAlign: "right" }}>
        Y5 price: <span data-testid="msft-vesting-y5-price" style={{ color: "#f59e0b", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>${Math.round(getMsftPrice(60, msftGrowth, msftPrice))}</span>
      </div>
    )}
  </div>
  );
}

export default MsftVestingChart;
