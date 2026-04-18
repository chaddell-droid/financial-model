import { useState } from 'react';
import { fmt, fmtFull } from '../model/formatters.js';
import { buildIncomeSources } from '../charts/chartUtils.js';
import { buildLegendItems, getSummaryTimeframeLabel } from './chartContract.js';

export default function IncomeCompositionChart({ data, investmentReturn, ssType, ssBenefitPersonal, vanSold, vanSaleMonth, vanMonthlySavings, bcsYearsLeft, milestones }) {
  const [incomeTooltip, setIncomeTooltip] = useState(null);

  const stackH = 300;
  const maxIncome = Math.max(...data.map(d => d.sarahIncome + d.msftVesting + (d.ssBenefit || 0) + (d.trustLLC || 0) + (d.chadJobIncome || 0) + d.consulting + (d.investReturn || 0)));
  const maxExpense = Math.max(...data.map(d => d.expenses));
  const stackMax = Math.max(maxIncome, maxExpense) * 1.1 || 1;
  const stackYPad = 60;
  const currentQuarter = data[0];
  const steadyIdx = data.findIndex((row) => row.netMonthly >= 0);
  const steadyQuarter = steadyIdx >= 0 ? data[steadyIdx] : data[data.length - 1];

  // Build display sources with ssType-aware SS label and dynamic invest returns label
  const sources = buildIncomeSources(ssType).map(s =>
    s.key === 'investReturn'
      ? { ...s, label: `${s.label} (${investmentReturn}%/yr)` }
      : s
  );
  const legendItems = buildLegendItems([
    ...sources.map((source) => ({ id: source.key, label: source.label, color: source.color })),
    { id: 'expenses', label: 'Expenses', color: '#f87171', line: true },
  ]);

  return (
    <div data-testid="income-composition-chart" style={{
      background: "#1e293b", borderRadius: 12, padding: "20px 16px",
      border: "1px solid #334155", marginBottom: 24
    }}>
      <h3 style={{ fontSize: 14, color: "#94a3b8", margin: "0 0 4px", fontWeight: 600 }}>Income Composition vs Expenses</h3>
      <p style={{ fontSize: 10, color: "#475569", margin: "0 0 12px" }}>All values are monthly rates at each quarter — hover adds detail, but the current and steady-state picture stays visible.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8, marginBottom: 12 }}>
        {[
          { label: `${getSummaryTimeframeLabel('current')} income`, value: fmtFull(currentQuarter.totalIncome), color: '#4ade80' },
          { label: `${getSummaryTimeframeLabel('steady')} income`, value: fmtFull(steadyQuarter.totalIncome), color: '#60a5fa' },
          { label: `${getSummaryTimeframeLabel('current')} expenses`, value: fmtFull(currentQuarter.expenses), color: '#f87171' },
        ].map((item) => (
          <div key={item.label} style={{ background: '#0f172a', borderRadius: 6, padding: '8px 10px', border: '1px solid #334155' }}>
            <div style={{ fontSize: 10, color: '#64748b', marginBottom: 2 }}>{item.label}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: item.color, fontFamily: "'JetBrains Mono', monospace" }}>{item.value}</div>
          </div>
        ))}
      </div>
      <div data-testid="income-composition-hover-surface" style={{ position: "relative", height: stackH + 40, paddingLeft: stackYPad }}
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
                onMouseEnter={() => {
                  // Build tooltip sources, expanding SS benefit into personal + kids when family benefits are active
                  const tooltipSources = [];
                  for (let si = 0; si < sources.length; si++) {
                    const s = sources[si];
                    const val = vals[si];
                    if (val <= 0) continue;
                    if (s.key === 'ssBenefit' && ssBenefitPersonal > 0 && val > ssBenefitPersonal) {
                      tooltipSources.push({ label: `${s.label} (personal)`, color: s.color, value: ssBenefitPersonal });
                      tooltipSources.push({ label: `${s.label} (kids)`, color: s.color, value: val - ssBenefitPersonal, indent: true });
                    } else {
                      tooltipSources.push({ label: s.label, color: s.color, value: val });
                    }
                  }
                  setIncomeTooltip({ pctX, label: d.label, sources: tooltipSources, total, expenses: d.expenses, net: d.netMonthly });
                }}>
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

          {/* Expense line — follows actual expenses at each quarter */}
          {(() => {
            const n = data.length;

            // Build expense events with their KNOWN savings amounts (not derived from data drops)
            const expenseEvents = [];
            if (vanSold) expenseEvents.push({ month: vanSaleMonth ?? 6, label: 'Van sold', savings: data[0]?.expenses > 0 ? (vanMonthlySavings || 2597) : 0 });
            if (bcsYearsLeft) {
              // BCS family monthly contribution — approximate from expense difference or use known value
              const bcsIdx = data.findIndex(d => d.month >= bcsYearsLeft * 12);
              const bcsDrop = bcsIdx > 0 ? Math.max(0, data[bcsIdx - 1].expenses - data[bcsIdx].expenses) : 0;
              // If milestones also fire at same quarter, we need to subtract milestone savings
              const milestonesAtSameMonth = (milestones || []).filter(ms => ms.savings > 0 && ms.month === bcsYearsLeft * 12);
              const milestoneSavings = milestonesAtSameMonth.reduce((s, ms) => s + ms.savings, 0);
              const bcsSavings = Math.max(0, bcsDrop - milestoneSavings);
              if (bcsSavings > 0) expenseEvents.push({ month: bcsYearsLeft * 12, label: 'BCS ends', savings: bcsSavings });
            }
            if (milestones) {
              for (const ms of milestones) {
                if (ms.savings > 0) expenseEvents.push({ month: ms.month, label: ms.name, savings: ms.savings });
              }
            }

            const markers = expenseEvents.map(ev => {
              if (ev.savings <= 0) return null;
              const idx = data.findIndex(d => d.month >= ev.month);
              if (idx < 0) return null;
              const pctX = ((idx + 0.5) / n) * 100;
              // Y position at the new expense level after this event
              const expenseY = (1 - data[idx].expenses / stackMax) * stackH;
              return { idx, ...ev, pctX, midY: expenseY - 10 };
            }).filter(Boolean);

            // Separate overlapping markers vertically
            for (let i = 1; i < markers.length; i++) {
              if (Math.abs(markers[i].pctX - markers[i - 1].pctX) < 5) {
                markers[i].midY = markers[i - 1].midY + 28;
              }
            }

            return (
              <>
                {/* Expense path */}
                <svg viewBox={`0 0 ${n * 100} ${stackH}`} preserveAspectRatio="none"
                  style={{ position: "absolute", top: 0, left: 0, width: "100%", height: stackH, pointerEvents: "none", zIndex: 3 }}>
                  <path d={`M ${data.map((d, i) => `${i * 100 + 50},${stackH - (d.expenses / stackMax) * stackH}`).join(' L ')}`}
                    fill="none" stroke="#f87171" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
                </svg>
                {/* Event callout pills — positioned at the expense drop point */}
                {markers.map((m, i) => (
                  <div key={i} style={{
                    position: 'absolute',
                    left: `calc(${m.pctX}% + 6px)`,
                    top: m.midY - 10,
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: 4,
                    padding: '2px 6px',
                    pointerEvents: 'none',
                    zIndex: 6,
                    whiteSpace: 'nowrap',
                  }}>
                    <div style={{ fontSize: 9, fontWeight: 600, color: '#f87171', lineHeight: 1.3 }}>{m.label}</div>
                    <div style={{ fontSize: 9, fontWeight: 700, color: '#4ade80', fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.3 }}>-{fmtFull(m.savings)}/mo</div>
                  </div>
                ))}
              </>
            );
          })()}
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
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, fontSize: s.indent ? 10 : 11, marginTop: 3, marginLeft: s.indent ? 13 : 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  {!s.indent && <div style={{ width: 8, height: 8, borderRadius: 2, background: s.color, flexShrink: 0 }} />}
                  {s.indent && <div style={{ width: 6, height: 6, borderRadius: 1, background: s.color, flexShrink: 0 }} />}
                  <span style={{ color: "#94a3b8" }}>{s.label}</span>
                </div>
                <span style={{ color: s.color, fontFamily: "'JetBrains Mono', monospace", fontWeight: s.indent ? 400 : 600 }}>{fmtFull(s.value)}</span>
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
        {legendItems.map((item) => (
          <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: item.line ? 16 : 12, height: item.line ? 2 : 12, borderRadius: item.line ? 0 : 2, background: item.line ? undefined : item.color, borderTop: item.line ? `2px solid ${item.color}` : undefined, opacity: item.line ? 1 : 0.7 }} />
            <span style={{ fontSize: 11, color: "#94a3b8" }}>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
