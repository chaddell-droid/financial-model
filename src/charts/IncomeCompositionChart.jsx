import { useState } from 'react';
import { fmt, fmtFull } from '../model/formatters.js';
import { INCOME_SOURCES } from '../charts/chartUtils.js';

export default function IncomeCompositionChart({ data, investmentReturn }) {
  const [incomeTooltip, setIncomeTooltip] = useState(null);

  const stackH = 300;
  const maxIncome = Math.max(...data.map(d => d.sarahIncome + d.msftVesting + d.ssdi + d.llcMonthly + d.consulting + (d.trust || 0) + (d.investReturn || 0)));
  const maxExpense = Math.max(...data.map(d => d.expenses));
  const stackMax = Math.max(maxIncome, maxExpense) * 1.1 || 1;
  const stackYPad = 60;

  // Build display sources with dynamic invest returns label
  const sources = INCOME_SOURCES.map(s =>
    s.key === 'investReturn'
      ? { ...s, label: `${s.label} (${investmentReturn}%/yr)` }
      : s
  );

  return (
    <div style={{
      background: "#1e293b", borderRadius: 12, padding: "20px 16px",
      border: "1px solid #334155", marginBottom: 24
    }}>
      <h3 style={{ fontSize: 14, color: "#94a3b8", margin: "0 0 4px", fontWeight: 600 }}>Income Composition vs Expenses</h3>
      <p style={{ fontSize: 10, color: "#475569", margin: "0 0 12px" }}>All values are monthly rates at each quarter — hover for breakdown</p>
      <div style={{ position: "relative", height: stackH + 40, paddingLeft: stackYPad }}
        onMouseLeave={() => setIncomeTooltip(null)}>
        {/* Y-axis labels */}
        {(() => {
          const ticks = [];
          const tickCount = 6;
          for (let i = 0; i <= tickCount; i++) {
            const val = stackMax - (i * stackMax / tickCount);
            const yPos = (i / tickCount) * stackH;
            ticks.push(
              <div key={`sl-${i}`} style={{ position: "absolute", left: 0, top: yPos - 7, width: stackYPad - 8, textAlign: "right" }}>
                <span style={{ fontSize: 10, color: "#64748b", fontFamily: "'JetBrains Mono', monospace" }}>
                  {fmt(val)}
                </span>
              </div>
            );
            ticks.push(
              <div key={`sg-${i}`} style={{
                position: "absolute", left: stackYPad, right: 0, top: yPos,
                height: 1, background: "#1e293b80", zIndex: 0
              }} />
            );
          }
          return ticks;
        })()}

        {/* Stacked bars */}
        <div style={{ display: "flex", alignItems: "flex-end", height: stackH, gap: 2, position: "relative" }}>
          {data.map((d, i) => {
            const vals = sources.map(s => d[s.key] || 0);
            const total = vals.reduce((a, b) => a + b, 0);
            const n = data.length;
            const pctX = ((i + 0.5) / n) * 100;

            return (
              <div key={i} style={{ flex: 1, height: "100%", position: "relative", display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", cursor: "default" }}
                onMouseEnter={() => setIncomeTooltip({
                  pctX,
                  label: d.label,
                  sources: sources.map((s, si) => ({ label: s.label, color: s.color, value: vals[si] })).filter(s => s.value > 0),
                  total,
                  expenses: d.expenses,
                  net: d.netMonthly
                })}>
                {/* Stacked segments */}
                <div style={{ width: "75%", display: "flex", flexDirection: "column-reverse" }}>
                  {sources.map((s, si) => {
                    const segH = (vals[si] / stackMax) * stackH;
                    return segH > 0 ? (
                      <div key={si} style={{
                        height: segH,
                        background: s.color,
                        opacity: incomeTooltip?.label === d.label ? 0.9 : 0.7,
                        borderRadius: si === sources.length - 1 ? "3px 3px 0 0" :
                          (si === sources.length - 1 || vals.slice(si + 1).every(v => v === 0)) ? "3px 3px 0 0" : 0,
                        transition: "height 0.3s ease, opacity 0.15s ease"
                      }} />
                    ) : null;
                  })}
                </div>

                {/* Quarter label */}
                <div style={{
                  position: "absolute", bottom: -24, fontSize: 9, color: "#64748b",
                  whiteSpace: "nowrap", transform: "rotate(-35deg)", transformOrigin: "top left"
                }}>
                  {d.label}
                </div>
              </div>
            );
          })}

          {/* Expense line */}
          <div style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: stackH - (data[0].expenses / stackMax) * stackH,
            height: 2,
            background: "#f87171",
            zIndex: 3,
            pointerEvents: "none"
          }} />
        </div>

        {/* Tooltip */}
        {incomeTooltip && (
          <div style={{
            position: "absolute",
            left: `${incomeTooltip.pctX}%`,
            top: 10,
            transform: "translateX(-50%)",
            background: "#0f172a",
            border: "1px solid #475569",
            borderRadius: 8,
            padding: "10px 14px",
            pointerEvents: "none",
            zIndex: 10,
            whiteSpace: "nowrap",
            boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
            minWidth: 180
          }}>
            <div style={{ fontSize: 12, color: "#f8fafc", fontWeight: 700, marginBottom: 6, borderBottom: "1px solid #334155", paddingBottom: 4 }}>
              {incomeTooltip.label}
            </div>
            {incomeTooltip.sources.map((s, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, fontSize: 11, marginTop: 3 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: s.color, flexShrink: 0 }} />
                  <span style={{ color: "#94a3b8" }}>{s.label}</span>
                </div>
                <span style={{ color: s.color, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{fmtFull(s.value)}</span>
              </div>
            ))}
            <div style={{ borderTop: "1px solid #334155", marginTop: 6, paddingTop: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginTop: 2 }}>
                <span style={{ color: "#94a3b8" }}>Total income</span>
                <span style={{ color: "#e2e8f0", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{fmtFull(incomeTooltip.total)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginTop: 2 }}>
                <span style={{ color: "#94a3b8" }}>Expenses</span>
                <span style={{ color: "#f87171", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{fmtFull(incomeTooltip.expenses)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 4, paddingTop: 4, borderTop: "1px solid #334155" }}>
                <span style={{ color: incomeTooltip.net >= 0 ? "#4ade80" : "#f87171", fontWeight: 700 }}>
                  {incomeTooltip.net >= 0 ? "Surplus" : "Deficit"}
                </span>
                <span style={{ color: incomeTooltip.net >= 0 ? "#4ade80" : "#f87171", fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>
                  {incomeTooltip.net >= 0 ? "+" : ""}{fmtFull(incomeTooltip.net)}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 14, marginTop: 32, justifyContent: "center", flexWrap: "wrap" }}>
        {sources.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 12, height: 12, borderRadius: 2, background: s.color, opacity: 0.7 }} />
            <span style={{ fontSize: 11, color: "#94a3b8" }}>{s.label}</span>
          </div>
        ))}
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{ width: 16, height: 2, background: "#f87171" }} />
          <span style={{ fontSize: 11, color: "#94a3b8" }}>Expenses</span>
        </div>
      </div>
    </div>
  );
}
