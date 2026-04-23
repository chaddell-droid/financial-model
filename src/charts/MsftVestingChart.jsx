import React, { useState, useCallback, useMemo } from "react";
import { getMsftPrice } from '../model/vesting.js';
import { fmtFull } from '../model/formatters.js';
import Slider from '../components/Slider.jsx';

function MsftVestingChart({ vestEvents, totalRemainingVesting, msftPrice, msftGrowth, onMsftGrowthChange, onMsftPriceChange }) {
  const [fetching, setFetching] = useState(false);
  const [hoveredIdx, setHoveredIdx] = useState(null);

  // Precompute running totals so the tooltip can show "remaining after this vest".
  const runningRemaining = useMemo(() => {
    const totals = [];
    let remaining = vestEvents.reduce((s, v) => s + v.net, 0);
    for (const v of vestEvents) {
      totals.push(remaining);
      remaining -= v.net;
    }
    return totals;
  }, [vestEvents]);

  const handleRefreshPrice = useCallback(async () => {
    setFetching(true);
    // Use corsproxy.io to bypass CORS restrictions on Yahoo Finance
    const endpoints = [
      {
        url: 'https://corsproxy.io/?' + encodeURIComponent('https://query1.finance.yahoo.com/v8/finance/chart/MSFT?range=1d&interval=1d'),
        parse: (data) => data?.chart?.result?.[0]?.meta?.regularMarketPrice,
      },
      {
        url: 'https://corsproxy.io/?' + encodeURIComponent('https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=MSFT&apikey=TNLBGSM5GKK3GEAT&datatype=json'),
        parse: (data) => parseFloat(data?.['Global Quote']?.['05. price']),
      },
    ];
    for (const ep of endpoints) {
      try {
        const res = await fetch(ep.url);
        const data = await res.json();
        const price = ep.parse(data);
        if (price && price > 0) {
          onMsftPriceChange(Math.round(price * 100) / 100);
          setFetching(false);
          return;
        }
      } catch (e) { /* try next */ }
    }
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
    <div style={{ display: "flex", gap: 3, height: 80, alignItems: "flex-end", position: "relative" }}>
      {vestEvents.map((v, i) => {
        const maxNet = Math.max(...vestEvents.map(ve => ve.net));
        const barH = (v.net / maxNet) * 60;
        const isLow = v.net < 15000;
        const isHovered = hoveredIdx === i;
        return (
          <div
            key={i}
            style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, cursor: "default" }}
            onMouseEnter={() => setHoveredIdx(i)}
            onMouseLeave={() => setHoveredIdx(null)}
            data-testid={`msft-vest-bar-${i}`}
          >
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
              outline: isHovered ? "2px solid #fcd34d" : "none",
              outlineOffset: isHovered ? 1 : 0,
              transition: "outline 0.1s",
            }} />
          </div>
        );
      })}
      {hoveredIdx !== null && (() => {
        const v = vestEvents[hoveredIdx];
        const gross = v.gross ?? Math.round(v.shares * v.price);
        const withheld = gross - v.net;
        const taxRate = gross > 0 ? Math.round((withheld / gross) * 100) : 0;
        const remainingAfter = runningRemaining[hoveredIdx] - v.net;
        // Position tooltip above bar, nudging left/right near edges to stay in frame
        const pct = (hoveredIdx + 0.5) / (vestEvents.length + 1) * 100;
        const anchor = pct < 25 ? 'left' : pct > 75 ? 'right' : 'center';
        const anchorStyle = anchor === 'left'
          ? { left: `${pct}%`, transform: 'translateX(0)' }
          : anchor === 'right'
          ? { left: `${pct}%`, transform: 'translateX(-100%)' }
          : { left: `${pct}%`, transform: 'translateX(-50%)' };
        return (
          <div
            data-testid="msft-vest-tooltip"
            style={{
              position: "absolute",
              top: "100%",
              marginTop: 10,
              background: "#0f172a",
              border: "1px solid #f59e0b55",
              borderRadius: 8,
              padding: "10px 12px",
              minWidth: 200,
              fontSize: 11,
              color: "#e2e8f0",
              fontFamily: "'Inter', sans-serif",
              boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
              zIndex: 9999,
              pointerEvents: "none",
              ...anchorStyle,
            }}
          >
            <div style={{
              fontSize: 12,
              fontWeight: 700,
              color: "#f59e0b",
              marginBottom: 6,
              borderBottom: "1px dashed #334155",
              paddingBottom: 4,
            }}>
              {v.label} vest
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "2px 10px", fontFamily: "'JetBrains Mono', monospace" }}>
              <span style={{ color: "#94a3b8" }}>Shares vesting</span>
              <span style={{ color: "#e2e8f0", fontWeight: 600 }}>{v.shares}</span>
              <span style={{ color: "#94a3b8" }}>Share price</span>
              <span style={{ color: "#e2e8f0", fontWeight: 600 }}>${Math.round(v.price).toLocaleString()}</span>
              <span style={{ color: "#94a3b8" }}>Gross value</span>
              <span style={{ color: "#e2e8f0", fontWeight: 600 }}>{fmtFull(gross)}</span>
              <span style={{ color: "#94a3b8" }}>Tax withholding</span>
              <span style={{ color: "#f87171", fontWeight: 600 }}>−{fmtFull(withheld)} ({taxRate}%)</span>
              <span style={{
                color: "#e2e8f0",
                fontWeight: 600,
                borderTop: "1px dashed #334155",
                paddingTop: 4,
                marginTop: 2,
              }}>Net deposited</span>
              <span style={{
                color: "#4ade80",
                fontWeight: 700,
                borderTop: "1px dashed #334155",
                paddingTop: 4,
                marginTop: 2,
              }}>{fmtFull(v.net)}</span>
              <span style={{ color: "#64748b", fontSize: 10 }}>Remaining after</span>
              <span style={{ color: "#64748b", fontSize: 10, fontWeight: 500 }}>{fmtFull(Math.max(0, remainingAfter))}</span>
            </div>
          </div>
        );
      })()}
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
