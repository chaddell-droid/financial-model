import { useState } from 'react';
import { fmt, fmtFull } from '../model/formatters.js';
import { buildIncomeSources } from '../charts/chartUtils.js';
import { buildLegendItems, getSummaryTimeframeLabel } from './chartContract.js';

/**
 * Monthly income composition vs expenses chart.
 * Uses monthlyDetail (raw monthly projection data) for consistent granularity
 * with other Plan-tab charts. MSFT uses smoothed vesting to avoid lump spikes.
 */
export default function IncomeCompositionChart({ monthlyDetail, investmentReturn, ssType, ssBenefitPersonal, vanSold, vanSaleMonth, vanMonthlySavings, bcsYearsLeft, milestones, chadJob, chadJobStartMonth, chadJobHealthSavings }) {
  const [incomeTooltip, setIncomeTooltip] = useState(null);

  // Map monthly data fields to chart sources
  // Monthly data uses 'msftSmoothed' (averaged over vest period) instead of quarterly 'msftVesting'
  const MONTHLY_SOURCES_MAP = { msftVesting: 'msftSmoothed' };
  const getVal = (d, key) => d[MONTHLY_SOURCES_MAP[key] || key] || 0;

  const data = monthlyDetail;
  const stackH = 300;
  const maxIncome = Math.max(...data.map(d =>
    d.sarahIncome + d.msftSmoothed + (d.ssBenefit || 0) + (d.trustLLC || 0) + (d.chadJobIncome || 0) + d.consulting + (d.investReturn || 0)));
  const maxExpense = Math.max(...data.map(d => d.expenses));
  const stackMax = Math.max(maxIncome, maxExpense) * 1.1 || 1;
  const stackYPad = 60;
  const currentMonth = data[0];
  const steadyIdx = data.findIndex((row) => row.netMonthly >= 0);
  const steadyMonth = steadyIdx >= 0 ? data[steadyIdx] : data[data.length - 1];

  // Compute totalIncome for KPI display (monthly data doesn't have it pre-computed)
  const computeTotal = (d) => d.sarahIncome + d.msftSmoothed + (d.ssBenefit || 0) + (d.trustLLC || 0) + (d.chadJobIncome || 0) + d.consulting + (d.investReturn || 0);

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

  // X-axis: show labels every 6 months for readability
  const formatMonthLabel = (m) => {
    if (m === 0) return 'Now';
    if (m < 12) return `M${m}`;
    const yr = Math.floor(m / 12);
    const mo = m % 12;
    return mo === 0 ? `Y${yr}` : `Y${yr}.${Math.round(mo / 12 * 10)}`;
  };

  return (
    <div data-testid="income-composition-chart" style={{
      background: "#1e293b", borderRadius: 12, padding: "20px 16px",
      border: "1px solid #334155", marginBottom: 24
    }}>
      <h3 style={{ fontSize: 14, color: "#94a3b8", margin: "0 0 4px", fontWeight: 600 }}>Income Composition vs Expenses</h3>
      <p style={{ fontSize: 10, color: "#475569", margin: "0 0 12px" }}>Monthly income sources stacked against expenses — hover for detail.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8, marginBottom: 12 }}>
        {[
          { label: `${getSummaryTimeframeLabel('current')} income`, value: fmtFull(computeTotal(currentMonth)), color: '#4ade80' },
          { label: `${getSummaryTimeframeLabel('steady')} income`, value: fmtFull(computeTotal(steadyMonth)), color: '#60a5fa' },
          { label: `${getSummaryTimeframeLabel('current')} expenses`, value: fmtFull(currentMonth.expenses), color: '#f87171' },
        ].map((item) => (
          <div key={item.label} style={{ background: '#0f172a', borderRadius: 6, padding: '8px 10px', border: '1px solid #334155' }}>
            <div style={{ fontSize: 10, color: '#64748b', marginBottom: 2 }}>{item.label}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: item.color, fontFamily: "'JetBrains Mono', monospace" }}>{item.value}</div>
          </div>
        ))}
      </div>
      {/* Expense event annotations — positioned ABOVE the chart in a dedicated row */}
      {(() => {
        const n = data.length;
        const expenseEvents = [];
        if (chadJob && (chadJobHealthSavings || 0) > 0) {
          expenseEvents.push({ month: chadJobStartMonth ?? 0, label: 'Health ins. saved', savings: chadJobHealthSavings });
        }
        if (vanSold) expenseEvents.push({ month: vanSaleMonth ?? 6, label: 'Van sold', savings: data[0]?.expenses > 0 ? (vanMonthlySavings || 2597) : 0 });
        if (bcsYearsLeft) {
          const bcsEndMonth = bcsYearsLeft * 12;
          const bcsIdx = data.findIndex(d => d.month >= bcsEndMonth);
          const bcsDrop = bcsIdx > 0 ? Math.max(0, data[bcsIdx - 1].expenses - data[bcsIdx].expenses) : 0;
          const milestonesAtSameMonth = (milestones || []).filter(ms => ms.savings > 0 && ms.month === bcsEndMonth);
          const milestoneSavings = milestonesAtSameMonth.reduce((s, ms) => s + ms.savings, 0);
          const bcsSavings = Math.max(0, bcsDrop - milestoneSavings);
          if (bcsSavings > 0) expenseEvents.push({ month: bcsEndMonth, label: 'BCS ends', savings: bcsSavings });
        }
        if (milestones) {
          for (const ms of milestones) {
            if (ms.savings > 0) expenseEvents.push({ month: ms.month, label: ms.name, savings: ms.savings });
          }
        }
        const markers = expenseEvents.filter(ev => ev.savings > 0).map(ev => {
          const idx = data.findIndex(d => d.month >= ev.month);
          if (idx < 0) return null;
          const pctX = ((idx + 0.5) / n) * 100;
          return { ...ev, idx, pctX };
        }).filter(Boolean);

        // Stagger into rows to prevent horizontal overlap (pills ~120px wide → ~16% of chart)
        const rows = [];
        for (const m of markers) {
          let placed = false;
          for (const row of rows) {
            const last = row[row.length - 1];
            if (m.pctX - last.pctX > 16) { row.push(m); placed = true; break; }
          }
          if (!placed) rows.push([m]);
        }

        if (markers.length === 0) return null;
        return (
          <div style={{ paddingLeft: stackYPad, marginBottom: 6 }}>
            {rows.map((row, ri) => (
              <div key={ri} style={{ position: 'relative', height: 28, marginBottom: 2 }}>
                {row.map((m, mi) => (
                  <div key={mi} style={{
                    position: 'absolute',
                    left: `${m.pctX}%`,
                    transform: 'translateX(-50%)',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: 4,
                    padding: '2px 8px',
                    whiteSpace: 'nowrap',
                    display: 'flex',
                    gap: 6,
                    alignItems: 'center',
                  }}>
                    <span style={{ fontSize: 9, fontWeight: 600, color: '#f87171', lineHeight: 1.3 }}>{m.label}</span>
                    <span style={{ fontSize: 9, fontWeight: 700, color: '#4ade80', fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.3 }}>-{fmtFull(m.savings)}/mo</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        );
      })()}
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

        {/* Stacked bars — monthly, thin, no gap */}
        <div style={{ display: "flex", alignItems: "flex-end", height: stackH, gap: 0, position: "relative" }}>
          {data.map((d, i) => {
            const vals = sources.map(s => getVal(d, s.key));
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
                  // Build expense breakdown for tooltip
                  const expenseReductions = [];
                  if (chadJob && (chadJobHealthSavings || 0) > 0 && d.month >= (chadJobStartMonth ?? 0)) {
                    expenseReductions.push({ label: 'Health ins. savings', amount: -(chadJobHealthSavings || 0) });
                  }
                  if (vanSold && d.month >= (vanSaleMonth ?? 6)) {
                    expenseReductions.push({ label: 'Van sold', amount: -(vanMonthlySavings || 0) });
                  }
                  setIncomeTooltip({ pctX, label: formatMonthLabel(d.month), sources: tooltipSources, total, expenses: d.expenses, expenseReductions, net: d.netMonthly });
                }}>
                {/* Stacked segments */}
                <div style={{ width: "100%", display: "flex", flexDirection: "column-reverse" }}>
                  {sources.map((s, si) => {
                    const segH = (vals[si] / stackMax) * stackH;
                    return segH > 0 ? (
                      <div key={si} style={{
                        height: segH,
                        background: s.color,
                        opacity: incomeTooltip?.label === formatMonthLabel(d.month) ? 0.9 : 0.7,
                        borderRadius: (si === sources.length - 1 || vals.slice(si + 1).every(v => v === 0)) ? "2px 2px 0 0" : 0,
                        transition: "opacity 0.15s ease"
                      }} />
                    ) : null;
                  })}
                </div>

                {/* Month label — show every 12 months for clean spacing */}
                {(d.month % 12 === 0) && (
                  <div style={{
                    position: "absolute", bottom: -22, fontSize: 9, color: "#64748b",
                    whiteSpace: "nowrap",
                  }}>
                    {formatMonthLabel(d.month)}
                  </div>
                )}
              </div>
            );
          })}

          {/* Expense line only — annotations are above the chart now */}
          {(() => {
            const n = data.length;
            return (
              <svg viewBox={`0 0 ${n * 100} ${stackH}`} preserveAspectRatio="none"
                style={{ position: "absolute", top: 0, left: 0, width: "100%", height: stackH, pointerEvents: "none", zIndex: 3 }}>
                <path d={`M ${data.map((d, i) => `${i * 100 + 50},${stackH - (d.expenses / stackMax) * stackH}`).join(' L ')}`}
                  fill="none" stroke="#f87171" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
              </svg>
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
              {incomeTooltip.expenseReductions && incomeTooltip.expenseReductions.length > 0 && (
                incomeTooltip.expenseReductions.map((r, ri) => (
                  <div key={ri} style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginTop: 1, marginLeft: 13 }}>
                    <span style={{ color: "#64748b" }}>{r.label}</span>
                    <span style={{ color: "#4ade80", fontFamily: "'JetBrains Mono', monospace" }}>{fmtFull(r.amount)}/mo</span>
                  </div>
                ))
              )}
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
