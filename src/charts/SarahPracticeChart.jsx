import React, { useMemo, useRef } from "react";
import { fmt, fmtFull } from "../model/formatters.js";
import { DAYS_PER_MONTH } from "../model/constants.js";
import { useChartTooltip } from './useChartTooltip.js';
import { formatModelTimeLabel } from './chartContract.js';
import { COLORS } from './chartUtils.js';
import ChartXAxis from './ChartXAxis.jsx';
import ChartYAxis from './ChartYAxis.jsx';
import Slider from '../components/Slider.jsx';

export default function SarahPracticeChart({
  sarahRate,
  sarahMaxRate,
  sarahRateGrowth,
  sarahCurrentClients,
  sarahMaxClients,
  sarahClientGrowth,
  sarahTaxRate,
  sarahCurrentGross,
  sarahCurrentNet,
  sarahCeilingGross,
  sarahCeiling,
  sarahWorkMonths,
  // FIX M-Sarah: Optional monthlyDetail pulls Sarah's NET income directly from the
  // engine row (engine applies sarah's tax + work-month boundary). When provided,
  // the chart uses engine values; otherwise it falls back to the inline formula
  // (which matches engine for the active-work window). This maintains display
  // parity once IncomeTab.jsx is updated to pass monthlyDetail to this chart.
  monthlyDetail,
  onFieldChange,
}) {
  const set = onFieldChange;
  const commitStrategy = 'release';
  const svgRef = useRef(null);

  const months = sarahWorkMonths || 72;
  const chartW = 800;
  const chartH = 240;
  const padL = 55;
  const padR = 20;
  const padT = 20;
  const padB = 30;
  const plotW = chartW - padL - padR;
  const plotH = chartH - padT - padB;

  // Compute monthly data points — memoized on the inputs that shape them
  // (remediation 6.4/6.7) so the tooltip hook's prev-point bail-out holds.
  // FIX M-Sarah: Net income pulled from engine row (monthlyDetail[m].sarahIncome)
  // when available; otherwise computed inline. Gross/rate/clients are still
  // derived locally because the engine doesn't expose those component fields.
  const pts = useMemo(() => {
    const out = [];
    for (let m = 0; m <= months; m++) {
      const rate = Math.min(sarahRate * Math.pow(1 + sarahRateGrowth / 100, m / 12), sarahMaxRate);
      const clients = Math.min(sarahCurrentClients * Math.pow(1 + sarahClientGrowth / 100, m / 12), sarahMaxClients);
      const gross = Math.round(rate * clients * DAYS_PER_MONTH);
      const year = Math.floor(m / 12);
      const mo = m % 12;
      const label = m === 0 ? 'Now' : `Y${year}${mo > 0 ? `M${mo}` : ''}`;
      const calYear = 26 + Math.floor((2 + m) / 12);
      const calMonth = (2 + m) % 12;
      const dateLabel = `${['Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb'][calMonth]} '${calYear}`;
      const inlineNet = Math.round(gross * (1 - (sarahTaxRate ?? 25) / 100));
      const net = monthlyDetail && monthlyDetail[m] ? (monthlyDetail[m].sarahIncome ?? inlineNet) : inlineNet;
      out.push({ m, rate: Math.round(rate), clients: +clients.toFixed(2), gross, net, label, dateLabel });
    }
    return out;
  }, [months, sarahRate, sarahRateGrowth, sarahMaxRate, sarahCurrentClients, sarahClientGrowth, sarahMaxClients, sarahTaxRate, monthlyDetail]);

  const maxGross = Math.max(...pts.map(p => p.gross)) * 1.1;
  const minGross = Math.min(...pts.map(p => p.gross)) * 0.9;
  const grossRange = maxGross - minGross || 1;

  const xOf = (m) => padL + (m / months) * plotW;
  const yOf = (val) => padT + ((maxGross - val) / grossRange) * plotH;

  // Income line paths
  const linePath = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${xOf(p.m).toFixed(1)},${yOf(p.gross).toFixed(1)}`).join(" ");
  const netLinePath = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${xOf(p.m).toFixed(1)},${yOf(p.net).toFixed(1)}`).join(" ");
  // Area fill
  const areaPath = `${linePath} L ${xOf(months)},${yOf(minGross)} L ${xOf(0)},${yOf(minGross)} Z`;

  // Target income line
  const targetGross = Math.round(sarahMaxRate * sarahMaxClients * DAYS_PER_MONTH);
  const targetY = yOf(targetGross);
  const currentGross = pts[0].gross;
  const currentY = yOf(currentGross);

  // Find when target is reached
  const targetMonth = pts.findIndex(p => p.gross >= targetGross * 0.99);

  // Y-axis ticks
  const yTicks = [];
  const tickStep = grossRange > 20000 ? 5000 : grossRange > 10000 ? 2500 : 1000;
  for (let v = Math.ceil(minGross / tickStep) * tickStep; v <= maxGross; v += tickStep) {
    yTicks.push(v);
  }

  // Mouse interaction — shared tooltip hook (remediation 6.4): nearest-point
  // detection with a prev-index bail-out so unchanged hovers skip the state set.
  const { tooltip, onMouseMove, onMouseLeave } = useChartTooltip({
    data: pts,
    xAccessor: (p) => xOf(p.m),
    svgW: chartW,
    svgH: chartH,
  });

  // Growth from current
  const growthPct = (gross) => currentGross > 0 ? Math.round(((gross - currentGross) / currentGross) * 100) : 0;

  return (
    <div data-testid="sarah-practice-chart" style={{
      background: COLORS.bgCard, borderRadius: 12, padding: "20px 16px",
      border: `1px solid ${COLORS.border}`, marginBottom: 24
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
        <h3 style={{ fontSize: 14, color: COLORS.blue, margin: 0, fontWeight: 600 }}>Sarah's Practice Growth</h3>
        <div data-testid="sarah-practice-summary" style={{ fontSize: 11, color: COLORS.textDim, display: "flex", alignItems: "center", gap: 12 }}>
          <span>
            <span style={{ color: COLORS.blue, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{fmtFull(currentGross)}</span>
            <span> → </span>
            <span style={{ color: COLORS.green, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{fmtFull(targetGross)}</span>
            <span>/mo</span>
          </span>
          <span style={{ display: "flex", gap: 8, fontSize: 10 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <span style={{ width: 12, height: 2, background: COLORS.blue, display: "inline-block" }} />
              <span style={{ color: COLORS.textDim }}>Gross</span>
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <span style={{ width: 12, height: 0, display: "inline-block", borderTop: `2px dashed ${COLORS.emerald}` }} />
              <span style={{ color: COLORS.textDim }}>Net</span>
            </span>
          </span>
        </div>
      </div>
      <p data-testid="sarah-practice-subtitle" style={{ fontSize: 11, color: COLORS.borderLight, margin: "0 0 12px" }}>
        ${sarahRate}/hr × {sarahCurrentClients.toFixed(1)} clients → ${sarahMaxRate}/hr × {sarahMaxClients.toFixed(1)} clients
        {" "}| Rate +{sarahRateGrowth}%/yr, Clients +{sarahClientGrowth}%/yr
      </p>

      <div style={{ position: 'relative' }}>
        <svg ref={svgRef} viewBox={`0 0 ${chartW} ${chartH}`} style={{ width: "100%", height: "auto", display: 'block' }}
          onMouseMove={onMouseMove}
          onMouseLeave={onMouseLeave}>
          {/* Y-axis grid + labels (shared component) */}
          <ChartYAxis ticks={yTicks} yOf={yOf} svgW={chartW} padL={padL} padR={padR} formatter={fmt} />

          {/* X-axis labels (shared component, model-time convention) */}
          <ChartXAxis data={pts} xOf={xOf} svgH={chartH} monthAccessor={(p) => p.m}
            filterFn={(p) => p.m % 12 === 0} labelFn={(p) => formatModelTimeLabel(p.m)} />

          {/* Target line */}
          <line x1={padL} x2={chartW - padR} y1={targetY} y2={targetY}
            stroke={COLORS.green} strokeWidth="1" strokeDasharray="6,4" opacity="0.5" />
          <text x={chartW - padR - 2} y={targetY - 5} textAnchor="end"
            fill={COLORS.green} fontSize="10" opacity="0.8" fontFamily="'JetBrains Mono', monospace">
            Target: {fmtFull(targetGross)}
          </text>

          {/* Current line */}
          <line x1={padL} x2={chartW - padR} y1={currentY} y2={currentY}
            stroke={COLORS.textDim} strokeWidth="1" strokeDasharray="4,4" opacity="0.3" />
          <text x={padL + 4} y={currentY - 5}
            fill={COLORS.textDim} fontSize="10" fontFamily="'JetBrains Mono', monospace">
            Today: {fmtFull(currentGross)}
          </text>

          {/* Area fill */}
          <path d={areaPath} fill="url(#sarahGrad)" />

          {/* Gradient def */}
          <defs>
            <linearGradient id="sarahGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COLORS.blue} stopOpacity="0.3" />
              <stop offset="100%" stopColor={COLORS.blue} stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Gross income line */}
          <path d={linePath} fill="none" stroke={COLORS.blue} strokeWidth="2.5" strokeLinejoin="round" />
          {/* Net income line */}
          <path d={netLinePath} fill="none" stroke={COLORS.emerald} strokeWidth="2" strokeLinejoin="round" strokeDasharray="6,3" />

          {/* Target reached marker */}
          {targetMonth > 0 && targetMonth < months && (
            <g>
              <line x1={xOf(targetMonth)} x2={xOf(targetMonth)}
                y1={padT} y2={padT + plotH}
                stroke={COLORS.green} strokeWidth="1" strokeDasharray="4,3" opacity="0.4" />
              <circle cx={xOf(targetMonth)} cy={yOf(pts[targetMonth].gross)}
                r="4" fill={COLORS.green} stroke={COLORS.bgDeep} strokeWidth="1.5" />
              <text x={xOf(targetMonth) + 6} y={yOf(pts[targetMonth].gross) - 6}
                fill={COLORS.green} fontSize="10" fontWeight="700" fontFamily="'JetBrains Mono', monospace">
                Target hit ~{Math.floor(targetMonth / 12)}y{targetMonth % 12}m ({Math.floor((months - targetMonth) / 12)}y{(months - targetMonth) % 12}m at ceiling)
              </text>
            </g>
          )}

          {/* Hover crosshair + dot */}
          {tooltip && (
            <>
              <line x1={xOf(tooltip.dataPoint.m)} y1={padT} x2={xOf(tooltip.dataPoint.m)} y2={padT + plotH}
                stroke={COLORS.textMuted} strokeWidth={0.8} opacity={0.5} />
              <circle cx={xOf(tooltip.dataPoint.m)} cy={yOf(tooltip.dataPoint.gross)} r="5"
                fill={COLORS.blue} stroke={COLORS.bgDeep} strokeWidth="2" />
            </>
          )}
        </svg>

        {/* Tooltip */}
        {tooltip && (() => {
          const p = tooltip.dataPoint;
          const flipLeft = tooltip.pctX > 65;
          const growth = growthPct(p.gross);
          return (
            <div style={{
              position: "absolute",
              left: flipLeft ? undefined : `${tooltip.pctX}%`,
              right: flipLeft ? `${100 - tooltip.pctX}%` : undefined,
              top: 8,
              marginLeft: flipLeft ? undefined : 12,
              marginRight: flipLeft ? 12 : undefined,
              background: `${COLORS.bgDeep}ee`,
              border: `1px solid ${COLORS.borderLight}`,
              borderRadius: 8,
              padding: "8px 12px",
              pointerEvents: "none",
              zIndex: 10,
              whiteSpace: "nowrap",
              boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
              minWidth: 170,
              fontSize: 11,
            }}>
              <div style={{ fontSize: 11, color: COLORS.textPrimary, fontWeight: 700, marginBottom: 4, borderBottom: `1px solid ${COLORS.border}`, paddingBottom: 3 }}>
                {p.dateLabel} ({p.label})
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 2 }}>
                <span style={{ color: COLORS.textMuted }}>Gross income</span>
                <span style={{ color: COLORS.blue, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{fmtFull(p.gross)}/mo</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 2 }}>
                <span style={{ color: COLORS.textMuted }}>Net after tax</span>
                <span style={{ color: COLORS.emerald, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{fmtFull(p.net)}/mo</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 2 }}>
                <span style={{ color: COLORS.textMuted }}>Hourly rate</span>
                <span style={{ color: COLORS.textSecondary, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>${p.rate}/hr</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 2 }}>
                <span style={{ color: COLORS.textMuted }}>Clients/day</span>
                <span style={{ color: COLORS.textSecondary, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{p.clients}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 2 }}>
                <span style={{ color: COLORS.textMuted }}>Daily gross</span>
                <span style={{ color: COLORS.textSecondary, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>${Math.round(p.rate * p.clients)}</span>
              </div>
              {p.m > 0 && (
                <div style={{ borderTop: `1px solid ${COLORS.border}`, marginTop: 4, paddingTop: 3, display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: COLORS.textMuted }}>Growth</span>
                  <span style={{ color: growth >= 0 ? COLORS.green : COLORS.red, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
                    {growth >= 0 ? "+" : ""}{growth}%
                  </span>
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* Stats row */}
      <div style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
        {(() => {
          const totalYears = Math.round(months / 12);
          // Adaptive milestones: evenly spaced across the horizon
          const milestoneMonths = totalYears <= 3
            ? [0, 12, 24, 36].filter(m => m <= months)
            : [0, Math.round(months / 3), Math.round(2 * months / 3), months];
          return milestoneMonths.map((m, i) => {
            const p = pts[m];
            if (!p) return null;
            const label = m === 0 ? "Today" : `Year ${Math.round(m / 12)}`;
            // Annual: sum 12 months centered on this point
            const yearStart = Math.max(0, m === 0 ? 0 : m);
            const yearEnd = Math.min(pts.length - 1, yearStart + 11);
            const annualGross = pts.slice(yearStart, yearEnd + 1).reduce((s, pt) => s + pt.gross, 0);
            const annualNet = pts.slice(yearStart, yearEnd + 1).reduce((s, pt) => s + pt.net, 0);
            const monthsInYear = yearEnd - yearStart + 1;
            // Annualize if partial year
            const annualGrossScaled = monthsInYear < 12 ? Math.round(annualGross * 12 / monthsInYear) : annualGross;
            const annualNetScaled = monthsInYear < 12 ? Math.round(annualNet * 12 / monthsInYear) : annualNet;
            return (
              <div key={i} data-testid={`sarah-practice-stat-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`} style={{
                flex: 1, minWidth: 110, background: COLORS.bgDeep, borderRadius: 6, padding: "6px 8px",
                border: i === 0 ? `1px solid ${COLORS.blue}33` : `1px solid ${COLORS.bgCard}`
              }}>
                <div style={{ fontSize: 10, color: COLORS.textDim, marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.blue, fontFamily: "'JetBrains Mono', monospace" }}>
                  {fmtFull(p.gross)}
                </div>
                <div style={{ fontSize: 10, color: COLORS.borderLight }}>
                  ${p.rate}/hr × {p.clients}/day
                </div>
                <div style={{ fontSize: 10, color: COLORS.borderLight, marginTop: 2, borderTop: `1px solid ${COLORS.bgCard}`, paddingTop: 2 }}>
                  <span style={{ color: COLORS.blue }}>{fmt(annualGrossScaled)}</span>
                  <span style={{ color: COLORS.border }}> / </span>
                  <span style={{ color: COLORS.emerald }}>{fmt(annualNetScaled)}</span>
                  <span style={{ color: COLORS.borderLight }}>/yr</span>
                </div>
              </div>
            );
          });
        })()}
      </div>

      {/* Sliders */}
      {set && (
        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ padding: "10px 12px", background: COLORS.bgDeep, borderRadius: 8, border: `1px solid ${COLORS.border}` }}>
            <div style={{ fontSize: 11, color: COLORS.blue, marginBottom: 6, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Rate</div>
            <Slider label="Current hourly rate" value={sarahRate} onChange={set('sarahRate')} commitStrategy={commitStrategy} min={150} max={300} step={10} format={(v) => "$" + v + "/hr"} />
            <Slider label="Rate growth/yr" value={sarahRateGrowth} onChange={set('sarahRateGrowth')} commitStrategy={commitStrategy} min={0} max={20} format={(v) => v + "%"} />
            <Slider label="Max rate (ceiling)" value={sarahMaxRate} onChange={set('sarahMaxRate')} commitStrategy={commitStrategy} min={200} max={400} step={10} format={(v) => "$" + v + "/hr"} color={COLORS.textDim} />
          </div>
          <div style={{ padding: "10px 12px", background: COLORS.bgDeep, borderRadius: 8, border: `1px solid ${COLORS.border}` }}>
            <div style={{ fontSize: 11, color: COLORS.blue, marginBottom: 6, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Clients</div>
            <Slider label="Current clients/day" value={sarahCurrentClients} onChange={set('sarahCurrentClients')} commitStrategy={commitStrategy} min={1} max={5} step={0.1} format={(v) => v.toFixed(1)} />
            <Slider label="Client growth/yr" value={sarahClientGrowth} onChange={set('sarahClientGrowth')} commitStrategy={commitStrategy} min={0} max={30} format={(v) => v + "%"} />
            <Slider label="Max clients/day (ceiling)" value={sarahMaxClients} onChange={set('sarahMaxClients')} commitStrategy={commitStrategy} min={3} max={7} step={0.5} format={(v) => v.toFixed(1)} color={COLORS.textDim} />
          </div>
          <div style={{ padding: "10px 12px", background: COLORS.bgDeep, borderRadius: 8, border: `1px solid ${COLORS.border}` }}>
            <div style={{ fontSize: 11, color: COLORS.blue, marginBottom: 6, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Tax</div>
            <Slider label="Effective tax rate (SE + federal)" value={sarahTaxRate} onChange={set('sarahTaxRate')} commitStrategy={commitStrategy} min={15} max={40} color={COLORS.blue} format={(v) => v + "%"} />
          </div>
          <div style={{ padding: "10px 12px", background: COLORS.bgDeep, borderRadius: 8, border: `1px solid ${COLORS.border}` }}>
            <div style={{ fontSize: 11, color: COLORS.blue, marginBottom: 6, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Working Duration</div>
            <Slider label="Sarah works for" value={sarahWorkMonths || 72} onChange={set('sarahWorkMonths')} commitStrategy='release' min={36} max={144} step={3} color={COLORS.purpleLight} format={(v) => { const y = Math.floor(v / 12); const m = v % 12; return m === 0 ? `${y} yr` : `${y}y ${m}m`; }} />
          </div>
          <div style={{ padding: "8px 12px", background: COLORS.bgDeep, borderRadius: 8, border: `1px solid ${COLORS.border}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
              <span style={{ color: COLORS.textDim }}>Current gross:</span>
              <span style={{ color: COLORS.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>{fmtFull(sarahCurrentGross)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 2 }}>
              <span style={{ color: COLORS.blue, fontWeight: 600 }}>After tax ({sarahTaxRate}%):</span>
              <span style={{ color: COLORS.blue, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{fmtFull(sarahCurrentNet)}/mo</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 4, paddingTop: 4, borderTop: `1px solid ${COLORS.border}` }}>
              <span style={{ color: COLORS.textDim }}>Net ceiling ({sarahTaxRate}%):</span>
              <span style={{ color: COLORS.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>{fmtFull(sarahCeiling)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 2 }}>
              <span style={{ color: COLORS.textDim }}>Capacity used:</span>
              <span style={{ color: sarahCurrentGross / sarahCeilingGross > 0.8 ? COLORS.yellow : COLORS.green, fontFamily: "'JetBrains Mono', monospace" }}>{Math.round(sarahCurrentGross / sarahCeilingGross * 100)}%</span>
            </div>
            <div style={{ borderTop: `1px solid ${COLORS.border}`, marginTop: 4, paddingTop: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ color: COLORS.textDim }}>Total gross ({Math.round((sarahWorkMonths || 72) / 12)}yr):</span>
                <span style={{ color: COLORS.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>{fmt(pts.reduce((s, p) => s + p.gross, 0))}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 2 }}>
                <span style={{ color: COLORS.emerald, fontWeight: 600 }}>Total net ({Math.round((sarahWorkMonths || 72) / 12)}yr):</span>
                <span style={{ color: COLORS.emerald, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{fmt(pts.reduce((s, p) => s + p.net, 0))}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
