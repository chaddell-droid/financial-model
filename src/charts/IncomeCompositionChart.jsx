import { useState } from 'react';
import { fmt, fmtFull } from '../model/formatters.js';
import { buildIncomeSources } from '../charts/chartUtils.js';
import { buildLegendItems, getSummaryTimeframeLabel } from './chartContract.js';

/**
 * Monthly income composition vs expenses chart.
 * Uses monthlyDetail (raw monthly projection data) for consistent granularity
 * with other Plan-tab charts. MSFT uses smoothed vesting to avoid lump spikes.
 *
 * Annotations: dashed vertical lines through chart with labels ABOVE the chart area,
 * matching the SavingsDrawdownChart visual pattern.
 */
export default function IncomeCompositionChart({ monthlyDetail, investmentReturn, ssType, ssBenefitPersonal, vanSold, vanSaleMonth, vanMonthlySavings, bcsYearsLeft, milestones, chadJob, chadJobStartMonth, chadJobHealthSavings, compareProjections, compareColors }) {
  const [incomeTooltip, setIncomeTooltip] = useState(null);

  // Map monthly field names: chart sources use 'msftVesting' key but monthly data has 'msftSmoothed'
  const getVal = (d, key) => key === 'msftVesting' ? (d.msftSmoothed || 0) : (d[key] || 0);

  const data = monthlyDetail;
  const n = data.length;
  const stackH = 300;
  const maxIncome = Math.max(...data.map(d =>
    d.sarahIncome + d.msftSmoothed + (d.ssBenefit || 0) + (d.trustLLC || 0) + (d.chadJobIncome || 0) + d.consulting + (d.investReturn || 0)));
  const maxExpense = Math.max(...data.map(d => d.expenses));
  const stackMax = Math.max(maxIncome, maxExpense) * 1.1 || 1;
  const stackYPad = 60;

  // Build display sources with ssType-aware SS label
  const sources = buildIncomeSources(ssType).map(s =>
    s.key === 'investReturn' ? { ...s, label: `${s.label} (${investmentReturn}%/yr)` } : s
  );
  const legendItems = buildLegendItems([
    ...sources.map((source) => ({ id: source.key, label: source.label, color: source.color })),
    { id: 'expenses', label: 'Expenses', color: '#f1f5f9', line: true },
    ...((compareProjections || []).map((cp, ci) => ({ id: `compare-${ci}`, label: `"${cp.name}" expenses`, color: (compareColors || [])[ci] || '#fbbf24', line: true, dash: true }))),
  ]);

  // Compute totalIncome (smoothed) for a month — consistent with what bars show
  const computeTotal = (d) => d.sarahIncome + d.msftSmoothed + (d.ssBenefit || 0) + (d.trustLLC || 0) + (d.chadJobIncome || 0) + d.consulting + (d.investReturn || 0);

  // KPI data
  const currentMonth = data[0];
  const steadyIdx = data.findIndex((row) => row.netMonthlySmoothed >= 0);
  const steadyMonth = steadyIdx >= 0 ? data[steadyIdx] : data[data.length - 1];

  // X-axis label
  const formatMonthLabel = (m) => {
    if (m === 0) return 'Now';
    const yr = Math.floor(m / 12);
    const mo = m % 12;
    return mo === 0 ? `Y${yr}` : `Y${yr}.${Math.round(mo / 12 * 10)}`;
  };

  // --- Build expense event annotations ---
  const expenseEvents = [];
  if (chadJob && (chadJobHealthSavings || 0) > 0) {
    expenseEvents.push({ month: chadJobStartMonth ?? 0, label: 'Health ins. saved', savings: chadJobHealthSavings });
  }
  if (vanSold) {
    expenseEvents.push({ month: vanSaleMonth ?? 6, label: 'Van sold', savings: vanMonthlySavings || 2597 });
  }
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

  // Stagger annotation rows to prevent horizontal overlap
  const usedSlots = [];
  for (const m of markers) {
    let row = 0;
    for (const slot of usedSlots) {
      if (Math.abs(m.pctX - slot.pctX) < 14) row = Math.max(row, slot.row + 1);
    }
    usedSlots.push({ pctX: m.pctX, row });
    m.row = row;
  }
  const maxAnnotationRow = markers.length > 0 ? Math.max(...markers.map(m => m.row)) : -1;
  const annotationRowH = (maxAnnotationRow + 1) * 16 + (markers.length > 0 ? 4 : 0);

  return (
    <div data-testid="income-composition-chart" style={{
      background: "#1e293b", borderRadius: 12, padding: "20px 16px",
      border: "1px solid #334155", marginBottom: 24
    }}>
      <h3 style={{ fontSize: 14, color: "#94a3b8", margin: "0 0 4px", fontWeight: 600 }}>Income Composition vs Expenses</h3>
      <p style={{ fontSize: 10, color: "#475569", margin: "0 0 12px" }}>Monthly income sources stacked against expenses — hover for detail.</p>

      {/* KPI strip */}
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

      {/* Chart area: annotation labels above → bars + expense line → X-axis labels below */}
      <div data-testid="income-composition-hover-surface"
        style={{ position: "relative", paddingLeft: stackYPad }}
        onMouseLeave={() => setIncomeTooltip(null)}>

        {/* Annotation labels ABOVE the chart */}
        {markers.length > 0 && (
          <div style={{ position: 'relative', height: annotationRowH, marginBottom: 2 }}>
            {markers.map((m, i) => (
              <div key={`label-${i}`} style={{
                position: 'absolute',
                left: `${m.pctX}%`,
                top: m.row * 16,
                transform: 'translateX(-50%)',
                fontSize: 9,
                fontWeight: 600,
                fontFamily: "'JetBrains Mono', monospace",
                color: '#4ade80',
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
              }}>
                {m.label} -{fmtFull(m.savings)}
              </div>
            ))}
          </div>
        )}

        {/* Y-axis labels (positioned relative to bar area) */}
        {(() => {
          const ticks = [];
          const tickCount = 6;
          for (let i = 0; i <= tickCount; i++) {
            const val = stackMax - (i * stackMax / tickCount);
            const yPos = annotationRowH + (i / tickCount) * stackH;
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

        {/* Stacked bars + expense line + dashed annotation lines */}
        <div style={{ display: "flex", alignItems: "flex-end", height: stackH, gap: 1, position: "relative" }}>
          {data.map((d, i) => {
            const vals = sources.map(s => getVal(d, s.key));
            const total = vals.reduce((a, b) => a + b, 0);
            const pctX = ((i + 0.5) / n) * 100;
            // Consistent net: total income (smoothed) minus expenses
            const smoothedNet = total - d.expenses;

            return (
              <div key={i} style={{ flex: 1, height: "100%", position: "relative", display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", cursor: "default" }}
                onMouseEnter={() => {
                  const tooltipSources = [];
                  for (let si = 0; si < sources.length; si++) {
                    const s = sources[si];
                    const val = vals[si];
                    if (val <= 0) continue;
                    if (s.key === 'ssBenefit' && ssBenefitPersonal > 0 && val > ssBenefitPersonal) {
                      tooltipSources.push({ label: `${s.label} (personal)`, color: s.color, value: ssBenefitPersonal });
                      tooltipSources.push({ label: `${s.label} (kids)`, color: s.color, value: val - ssBenefitPersonal, indent: true });
                    } else if (s.key === 'chadJobIncome' && (
                      (d.chadJobBonusNet || 0) > 0 || (d.chadJobStockRefreshNet || 0) > 0 || (d.chadJobStockHireNet || 0) > 0 || (d.chadJobSignOnNet || 0) > 0
                    )) {
                      // Break out Chad's Job into salary + bonus + stock + sign-on components when any are nonzero
                      if ((d.chadJobSalaryNet || 0) > 0) {
                        tooltipSources.push({ label: `${s.label} (salary)`, color: s.color, value: d.chadJobSalaryNet });
                      }
                      if ((d.chadJobBonusNet || 0) > 0) {
                        tooltipSources.push({ label: `${s.label} (bonus)`, color: s.color, value: d.chadJobBonusNet, indent: true });
                      }
                      if ((d.chadJobStockRefreshNet || 0) > 0) {
                        tooltipSources.push({ label: `${s.label} (stock refresh)`, color: s.color, value: d.chadJobStockRefreshNet, indent: true });
                      }
                      if ((d.chadJobStockHireNet || 0) > 0) {
                        tooltipSources.push({ label: `${s.label} (hire stock)`, color: s.color, value: d.chadJobStockHireNet, indent: true });
                      }
                      if ((d.chadJobSignOnNet || 0) > 0) {
                        tooltipSources.push({ label: `${s.label} (sign-on cash)`, color: s.color, value: d.chadJobSignOnNet, indent: true });
                      }
                    } else {
                      tooltipSources.push({ label: s.label, color: s.color, value: val });
                    }
                  }
                  // Build expense components list from d.expenseBreakdown (emitted by projection).
                  // Label + sort: positive additions first (biggest to smallest), then negative reductions.
                  const EXPENSE_LABELS = {
                    baseLiving: 'Base living',
                    debtService: 'Debt service',
                    van: 'Van (loan + fuel)',
                    bcs: 'BCS tuition',
                    oneTimeExtras: 'One-time extras',
                    lifestyleCuts: 'Lifestyle cuts',
                    milestones: 'Milestones',
                    healthInsurance: 'Health ins. (employer)',
                  };
                  const expenseComponents = [];
                  if (d.expenseBreakdown) {
                    const entries = Object.entries(d.expenseBreakdown);
                    const additions = entries.filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
                    const reductions = entries.filter(([, v]) => v < 0).sort((a, b) => a[1] - b[1]);
                    for (const [k, v] of [...additions, ...reductions]) {
                      expenseComponents.push({ key: k, label: EXPENSE_LABELS[k] || k, amount: v });
                    }
                  }
                  // Use smoothedNet (total - expenses) for consistency with bar heights
                  setIncomeTooltip({ pctX, label: formatMonthLabel(d.month), sources: tooltipSources, total, expenses: d.expenses, expenseComponents, net: smoothedNet });
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

                {/* Month label — every 12 months */}
                {(d.month % 12 === 0) && (
                  <div style={{ position: "absolute", bottom: -22, fontSize: 9, color: "#64748b", whiteSpace: "nowrap" }}>
                    {formatMonthLabel(d.month)}
                  </div>
                )}
              </div>
            );
          })}

          {/* Expense line — dark halo + bright slate-white stroke for a neutral
              anchor that cuts across any income-family hue without collision. */}
          <svg viewBox={`0 0 ${n * 100} ${stackH}`} preserveAspectRatio="none"
            style={{ position: "absolute", top: 0, left: 0, width: "100%", height: stackH, pointerEvents: "none", zIndex: 3 }}>
            <path d={`M ${data.map((d, i) => `${i * 100 + 50},${stackH - (d.expenses / stackMax) * stackH}`).join(' L ')}`}
              fill="none" stroke="#0f172a" strokeWidth="6" strokeLinejoin="round" strokeLinecap="round" opacity="0.9" />
            <path d={`M ${data.map((d, i) => `${i * 100 + 50},${stackH - (d.expenses / stackMax) * stackH}`).join(' L ')}`}
              fill="none" stroke="#f1f5f9" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
          </svg>

          {/* Comparison expense lines — one per active comparison, each with distinct color */}
          {compareProjections && compareProjections.map((cp, ci) => {
            const compData = cp.projection.monthlyData;
            if (!compData || compData.length === 0) return null;
            const color = (compareColors || [])[ci] || '#fbbf24';
            const compPath = compData.slice(0, n).map((cd, i) =>
              `${i * 100 + 50},${stackH - (cd.expenses / stackMax) * stackH}`
            );
            return (
              <svg key={`comp-${ci}`} viewBox={`0 0 ${n * 100} ${stackH}`} preserveAspectRatio="none"
                style={{ position: "absolute", top: 0, left: 0, width: "100%", height: stackH, pointerEvents: "none", zIndex: 4 + ci }}>
                <path d={`M ${compPath.join(' L ')}`}
                  fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"
                  strokeDasharray="8,4" opacity="0.8" />
              </svg>
            );
          })}

          {/* Dashed vertical annotation lines through the chart */}
          {markers.map((m, i) => (
            <div key={`vline-${i}`} style={{
              position: 'absolute',
              left: `${m.pctX}%`,
              top: 0,
              width: 0,
              height: stackH,
              borderLeft: '1px dashed #4ade80',
              opacity: 0.4,
              pointerEvents: 'none',
              zIndex: 2,
            }} />
          ))}
        </div>

        {/* Tooltip */}
        {incomeTooltip && (
          <div style={{
            position: "absolute",
            left: `${incomeTooltip.pctX}%`,
            top: annotationRowH + 10,
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
              {incomeTooltip.expenseComponents && incomeTooltip.expenseComponents.length > 0 && (
                <div style={{ marginTop: 4 }}>
                  <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 2 }}>
                    Expense math
                  </div>
                  {incomeTooltip.expenseComponents.map((c, ci) => (
                    <div key={ci} style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, marginTop: 1, marginLeft: 8 }}>
                      <span style={{ color: "#94a3b8" }}>{c.label}</span>
                      <span style={{ color: c.amount < 0 ? "#4ade80" : "#e2e8f0", fontFamily: "'JetBrains Mono', monospace" }}>
                        {c.amount >= 0 ? "+" : ""}{fmtFull(c.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginTop: 4, paddingTop: 3, borderTop: "1px dashed #334155" }}>
                <span style={{ color: "#f87171", fontWeight: 600 }}>Total expenses</span>
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
            <div style={{
              width: item.line ? 16 : 12, height: item.line ? 2 : 12,
              borderRadius: item.line ? 0 : 2,
              background: item.line ? undefined : item.color,
              borderTop: item.line ? `2px ${item.dash ? 'dashed' : 'solid'} ${item.color}` : undefined,
              opacity: item.line ? 1 : 0.7,
            }} />
            <span style={{ fontSize: 11, color: "#94a3b8" }}>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
