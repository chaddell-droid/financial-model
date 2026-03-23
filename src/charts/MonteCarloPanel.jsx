import React, { useState, useMemo } from 'react';
import { fmt, fmtFull } from '../model/formatters.js';
import { computeProjection } from '../model/projection.js';
import Slider from '../components/Slider.jsx';
import { buildLegendItems, formatModelTimeLabel } from './chartContract.js';

export default function MonteCarloPanel({
  mcResults,
  mcRunning,
  mcNumSims,
  mcInvestVol,
  mcBizGrowthVol,
  mcMsftVol,
  mcSsdiDelay,
  mcSsdiDenialPct,
  mcCutsDiscipline,
  onParamChange,
  onRun,
  savingsData,
  presentMode,
  gatherState,
  mcParams,
}) {
  const [mcTooltip, setMcTooltip] = useState(null);

  if (presentMode) return null;

  // Compute sensitivity tornado when results exist
  const tornado = useMemo(() => {
    if (!mcResults || !gatherState) return null;
    const base = gatherState();
    const baseProj = computeProjection(base);
    const baseFinalBal = baseProj.savingsData.find(d => d.month === 72)?.balance || 0;
    const disciplineSigma = (mcCutsDiscipline || 0) / 100;
    const baseDiscipline = base.cutsDiscipline ?? 1;

    const sensVars = [
      { name: "Investment return", upState: { ...base, investmentReturn: base.investmentReturn + mcInvestVol }, downState: { ...base, investmentReturn: Math.max(0, base.investmentReturn - mcInvestVol) } },
      { name: "Sarah client growth", upState: { ...base, sarahClientGrowth: base.sarahClientGrowth + mcBizGrowthVol }, downState: { ...base, sarahClientGrowth: Math.max(0, base.sarahClientGrowth - mcBizGrowthVol) } },
      { name: "Sarah rate growth", upState: { ...base, sarahRateGrowth: base.sarahRateGrowth + mcBizGrowthVol * 0.5 }, downState: { ...base, sarahRateGrowth: Math.max(0, base.sarahRateGrowth - mcBizGrowthVol * 0.5) } },
      { name: "MSFT price", upState: { ...base, msftGrowth: base.msftGrowth + mcMsftVol }, downState: { ...base, msftGrowth: base.msftGrowth - mcMsftVol } },
      ...(base.ssType !== 'ss' ? [
        { name: "SSDI timing", upState: { ...base, ssdiApprovalMonth: base.ssdiApprovalMonth }, downState: { ...base, ssdiApprovalMonth: base.ssdiApprovalMonth + mcSsdiDelay } },
        { name: "SSDI denied", upState: { ...base }, downState: { ...base, ssdiDenied: true } },
      ] : []),
      ...(base.lifestyleCutsApplied ? [{
        name: "Spending discipline",
        upState: { ...base, cutsDiscipline: Math.min(1, baseDiscipline + disciplineSigma) },
        downState: { ...base, cutsDiscipline: Math.max(0, baseDiscipline - disciplineSigma) }
      }] : []),
    ];

    return sensVars.map(sv => {
      const upFinal = computeProjection(sv.upState).savingsData.find(d => d.month === 72)?.balance || 0;
      const downFinal = computeProjection(sv.downState).savingsData.find(d => d.month === 72)?.balance || 0;
      return {
        name: sv.name,
        upside: upFinal - baseFinalBal,
        downside: downFinal - baseFinalBal,
        spread: Math.abs(upFinal - downFinal),
      };
    }).sort((a, b) => b.spread - a.spread);
  }, [mcResults, gatherState, mcInvestVol, mcBizGrowthVol, mcMsftVol, mcSsdiDelay, mcCutsDiscipline]);

  return (
        <div data-testid="monte-carlo-panel" style={{
          background: "#1e293b", borderRadius: 12, padding: "20px 16px",
          border: "1px solid #334155", marginBottom: 24
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div>
              <h3 style={{ fontSize: 15, color: "#f8fafc", margin: "0 0 2px", fontWeight: 700 }}>Will the plan stay solvent through the 6-year outlook?</h3>
              <p style={{ fontSize: 11, color: "#64748b", margin: 0 }}>
                {mcResults
                  ? `${mcResults.numSims} randomized paths answering the solvency question`
                  : 'Stress-test the plan against uncertainty before relying on the base-case path'}
              </p>
            </div>
            <button onClick={onRun} disabled={mcRunning} data-testid="monte-carlo-run" aria-label={mcResults ? "Re-run Monte Carlo simulation" : "Run Monte Carlo simulation"} style={{
              background: mcRunning ? "#334155" : "#4ade80", color: "#0f172a",
              border: "none", borderRadius: 6, padding: "8px 16px",
              fontSize: 12, fontWeight: 700, cursor: mcRunning ? "wait" : "pointer"
            }}>
              {mcRunning ? "Running..." : mcResults ? "Re-run Simulation" : "Run Simulation"}
            </button>
          </div>

          {/* Uncertainty controls */}
          <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700, marginBottom: 6 }}>
            Stress assumptions
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
            <div style={{ background: "#0f172a", borderRadius: 6, padding: "8px 10px", border: "1px solid #1e293b" }}>
              <Slider label="Investment volatility" value={mcInvestVol} onChange={onParamChange('mcInvestVol')} min={0} max={30} step={1} format={(v) => v + "% \u03C3"} color="#22d3ee" />
            </div>
            <div style={{ background: "#0f172a", borderRadius: 6, padding: "8px 10px", border: "1px solid #1e293b" }}>
              <Slider label="Business growth uncertainty" value={mcBizGrowthVol} onChange={onParamChange('mcBizGrowthVol')} min={0} max={15} step={1} format={(v) => v + "% \u03C3"} color="#60a5fa" />
            </div>
            <div style={{ background: "#0f172a", borderRadius: 6, padding: "8px 10px", border: "1px solid #1e293b" }}>
              <Slider label="MSFT price uncertainty" value={mcMsftVol} onChange={onParamChange('mcMsftVol')} min={0} max={30} step={1} format={(v) => v + "% \u03C3"} color="#f59e0b" />
            </div>
            <div style={{ background: "#0f172a", borderRadius: 6, padding: "8px 10px", border: "1px solid #1e293b" }}>
              <Slider label="SSDI max delay" value={mcSsdiDelay} onChange={onParamChange('mcSsdiDelay')} min={0} max={18} step={1} format={(v) => v + " mo"} color="#4ade80" />
            </div>
            <div style={{ background: "#0f172a", borderRadius: 6, padding: "8px 10px", border: "1px solid #1e293b" }}>
              <Slider label="SSDI denial rate" value={mcSsdiDenialPct} onChange={onParamChange('mcSsdiDenialPct')} min={0} max={50} step={1} format={(v) => v + "%"} color="#f87171" />
            </div>
            <div style={{ background: "#0f172a", borderRadius: 6, padding: "8px 10px", border: "1px solid #1e293b" }}>
              <Slider label="Spending discipline uncertainty" value={mcCutsDiscipline} onChange={onParamChange('mcCutsDiscipline')} min={0} max={50} step={5} format={(v) => v + "% \u03C3"} color="#f87171" />
            </div>
            <div style={{ background: "#0f172a", borderRadius: 6, padding: "8px 10px", border: "1px solid #1e293b" }}>
              <Slider label="Number of simulations" value={mcNumSims} onChange={onParamChange('mcNumSims')} min={100} max={1000} step={100} format={(v) => v.toString()} color="#94a3b8" />
            </div>
          </div>

          {/* Results */}
          {mcResults && (() => {
            const { bands, solvencyRate, medianTrough, medianFinal, p10Final, p90Final } = mcResults;
            const months = bands[0].series.length - 1;
            const svgW = 800;
            const svgH = 260;
            const padL = 60;
            const padR = 20;
            const padT = 20;
            const padB = 30;
            const plotW = svgW - padL - padR;
            const plotH = svgH - padT - padB;

            const allVals = bands.flatMap(b => b.series);
            const maxBal = Math.max(...allVals, 0) * 1.1;
            const minBal = Math.min(...allVals, 0) * 1.1;
            const range = (maxBal - minBal) || 1;

            const xOf = (m) => padL + (m / months) * plotW;
            const yOf = (v) => padT + ((maxBal - v) / range) * plotH;
            const zeroY = yOf(0);

            const bandColors = [
              { lo: 0, hi: 4, fill: "#22d3ee", opacity: 0.08 },
              { lo: 1, hi: 3, fill: "#22d3ee", opacity: 0.12 },
            ];
            const medianIdx = 2;

            const bandPaths = bandColors.map(({ lo, hi, fill, opacity }) => {
              const upper = bands[hi].series;
              const lower = bands[lo].series;
              const d = upper.map((v, m) => `${m === 0 ? "M" : "L"} ${xOf(m).toFixed(1)},${yOf(v).toFixed(1)}`).join(" ")
                + [...lower].reverse().map((v, i) => `L ${xOf(months - i).toFixed(1)},${yOf(v).toFixed(1)}`).join(" ") + " Z";
              return { d, fill, opacity };
            });

            const medianPath = bands[medianIdx].series.map((v, m) => `${m === 0 ? "M" : "L"} ${xOf(m).toFixed(1)},${yOf(v).toFixed(1)}`).join(" ");
            const detPath = savingsData.filter(d => d.month <= months).map(d => `${d.month === 0 ? "M" : "L"} ${xOf(d.month).toFixed(1)},${yOf(d.balance).toFixed(1)}`).join(" ");
            const legendItems = buildLegendItems([
              { id: 'mc-p50', label: 'Typical path (P50)', color: '#22d3ee', type: 'line' },
              { id: 'mc-mid-band', label: 'Likely middle range (P25-P75)', color: '#22d3ee', type: 'band', opacity: 0.12 },
              { id: 'mc-wide-band', label: 'Wide range (P10-P90)', color: '#22d3ee', type: 'band', opacity: 0.06 },
              { id: 'mc-base', label: 'Deterministic base case', color: '#94a3b8', type: 'dashed' },
            ]);

            const solvColor = solvencyRate >= 0.95 ? "#4ade80" : solvencyRate >= 0.80 ? "#fbbf24" : "#f87171";
            const solvEmoji = solvencyRate >= 0.95 ? "\uD83D\uDFE2" : solvencyRate >= 0.80 ? "\uD83D\uDFE1" : "\uD83D\uDD34";

            // Tooltip handler
            const handleMouseMove = (e) => {
              const svgEl = e.currentTarget;
              const rect = svgEl.getBoundingClientRect();
              const relX = (e.clientX - rect.left) / rect.width * svgW;
              const m = Math.round(((relX - padL) / plotW) * months);
              if (m < 0 || m > months) { setMcTooltip(null); return; }
              const detVal = savingsData.find(d => d.month === m)?.balance;
              setMcTooltip({
                month: m,
                pctX: ((relX - padL) / plotW) * 100,
                p10: bands[0].series[m],
                p25: bands[1].series[m],
                p50: bands[2].series[m],
                p75: bands[3].series[m],
                p90: bands[4].series[m],
                det: detVal,
              });
            };

            return (
              <div>
                {/* Stats row */}
                <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700, marginBottom: 6 }}>
                  Primary answers
                </div>
                <div style={{ display: "flex", gap: 2, marginBottom: 12, flexWrap: "wrap" }}>
                  {[
                    { label: "Chance of staying solvent", value: `${(solvencyRate * 100).toFixed(1)}%`, sub: `${solvEmoji} ${Math.round(solvencyRate * mcResults.numSims)}/${mcResults.numSims} paths never dip below zero`, color: solvColor },
                    { label: "Typical lowest point", value: fmtFull(medianTrough), sub: "Median trough across paths", color: medianTrough >= 0 ? "#4ade80" : "#f87171" },
                    { label: "Typical finish", value: fmtFull(medianFinal), sub: "Median balance at Y6", color: medianFinal >= 0 ? "#4ade80" : "#f87171" },
                    { label: "Bad-luck finish", value: fmtFull(p10Final), sub: "10th percentile ending balance", color: p10Final >= 0 ? "#fbbf24" : "#f87171" },
                    { label: "Good-luck finish", value: fmtFull(p90Final), sub: "90th percentile ending balance", color: "#4ade80" },
                  ].map((item, i) => (
                    <div key={i} style={{
                      flex: 1, minWidth: 110,
                      background: "#0f172a", borderRadius: 6, padding: "6px 10px",
                      border: i === 0 ? `1px solid ${solvColor}33` : "1px solid #1e293b"
                    }}>
                      <div style={{ fontSize: 9, color: "#64748b", marginBottom: 2 }}>{item.label}</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: item.color, fontFamily: "'JetBrains Mono', monospace" }}>
                        {item.value}
                      </div>
                      {item.sub && <div style={{ fontSize: 9, color: "#475569", marginTop: 1 }}>{item.sub}</div>}
                    </div>
                  ))}
                </div>

                {/* Fan chart with tooltip */}
                <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700, marginBottom: 6 }}>
                  Range of outcomes
                </div>
                <div data-testid="monte-carlo-fan-chart-hover-surface" style={{ position: "relative" }}>
                  <svg data-testid="monte-carlo-fan-chart" viewBox={`0 0 ${svgW} ${svgH}`} style={{ width: "100%", height: "auto" }}
                    onMouseMove={handleMouseMove}
                    onMouseLeave={() => setMcTooltip(null)}
                  >
                    {/* Y-axis */}
                    {(() => {
                      const ticks = [];
                      const step = range > 2000000 ? 500000 : range > 1000000 ? 250000 : range > 500000 ? 100000 : 50000;
                      for (let v = Math.ceil(minBal / step) * step; v <= maxBal; v += step) {
                        ticks.push(v);
                      }
                      return ticks.map(v => (
                        <g key={v}>
                          <line x1={padL} x2={svgW - padR} y1={yOf(v)} y2={yOf(v)} stroke="#1e293b" strokeWidth="1" />
                          <text x={padL - 6} y={yOf(v) + 3} textAnchor="end" fill="#475569" fontSize="9" fontFamily="'JetBrains Mono', monospace">
                            {v >= 1000000 || v <= -1000000 ? `$${(v/1000000).toFixed(1)}M` : v >= 1000 || v <= -1000 ? `$${Math.round(v/1000)}K` : `$${v}`}
                          </text>
                        </g>
                      ));
                    })()}

                    {/* Zero line */}
                    {minBal < 0 && (
                      <line x1={padL} x2={svgW - padR} y1={zeroY} y2={zeroY} stroke="#f8717155" strokeWidth="1.5" />
                    )}

                    {/* X-axis labels */}
                    {[0, 12, 24, 36, 48, 60, 72].map(m => (
                      <text key={m} x={xOf(m)} y={svgH - 4} textAnchor="middle" fill="#475569" fontSize="9" fontFamily="'JetBrains Mono', monospace">
                        {m === 0 ? "M0" : `Y${m/12}`}
                      </text>
                    ))}

                    {/* Band fills */}
                    {bandPaths.map((bp, i) => (
                      <path key={i} d={bp.d} fill={bp.fill} opacity={bp.opacity} />
                    ))}

                    {/* P10 and P90 edge lines */}
                    <path d={bands[0].series.map((v, m) => `${m === 0 ? "M" : "L"} ${xOf(m).toFixed(1)},${yOf(v).toFixed(1)}`).join(" ")}
                      fill="none" stroke="#22d3ee" strokeWidth="0.5" opacity="0.3" />
                    <path d={bands[4].series.map((v, m) => `${m === 0 ? "M" : "L"} ${xOf(m).toFixed(1)},${yOf(v).toFixed(1)}`).join(" ")}
                      fill="none" stroke="#22d3ee" strokeWidth="0.5" opacity="0.3" />

                    {/* Deterministic base case (dashed) */}
                    <path d={detPath} fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="6,4" opacity="0.5" />

                    {/* Median line (bold) */}
                    <path d={medianPath} fill="none" stroke="#22d3ee" strokeWidth="2.5" strokeLinejoin="round" />

                    {/* Tooltip vertical line */}
                    {mcTooltip && (
                      <line x1={xOf(mcTooltip.month)} x2={xOf(mcTooltip.month)}
                        y1={padT} y2={svgH - padB}
                        stroke="#e2e8f0" strokeWidth="1" opacity="0.3" />
                    )}

                    {/* Endpoint labels */}
                    <text x={xOf(months) + 4} y={yOf(bands[medianIdx].series[months]) + 4} fill="#22d3ee" fontSize="9" fontWeight="700" fontFamily="'JetBrains Mono', monospace">
                      P50: {fmt(bands[medianIdx].series[months])}
                    </text>
                    <text x={xOf(months) + 4} y={yOf(bands[0].series[months]) + 4} fill="#475569" fontSize="8" fontFamily="'JetBrains Mono', monospace">
                      P10: {fmt(bands[0].series[months])}
                    </text>
                    <text x={xOf(months) + 4} y={yOf(bands[4].series[months]) + 4} fill="#475569" fontSize="8" fontFamily="'JetBrains Mono', monospace">
                      P90: {fmt(bands[4].series[months])}
                    </text>
                  </svg>

                  {/* Tooltip card */}
                  {mcTooltip && (
                    <div style={{
                      position: "absolute",
                      left: `${Math.min(Math.max(mcTooltip.pctX, 10), 75)}%`,
                      top: 8,
                      background: "#0f172a", border: "1px solid #334155", borderRadius: 8,
                      padding: "8px 12px", fontSize: 10, color: "#e2e8f0",
                      fontFamily: "'JetBrains Mono', monospace",
                      pointerEvents: "none", zIndex: 10,
                      boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
                      minWidth: 130,
                    }}>
                      <div style={{ fontWeight: 700, marginBottom: 4, color: "#94a3b8" }}>
                        {formatModelTimeLabel(mcTooltip.month)}
                      </div>
                      <div style={{ color: "#475569" }}>P90: <span style={{ color: "#4ade80" }}>{fmt(mcTooltip.p90)}</span></div>
                      <div style={{ color: "#475569" }}>P75: <span style={{ color: "#22d3ee" }}>{fmt(mcTooltip.p75)}</span></div>
                      <div style={{ color: "#22d3ee", fontWeight: 700 }}>P50: {fmt(mcTooltip.p50)}</div>
                      <div style={{ color: "#475569" }}>P25: <span style={{ color: "#f59e0b" }}>{fmt(mcTooltip.p25)}</span></div>
                      <div style={{ color: "#475569" }}>P10: <span style={{ color: "#f87171" }}>{fmt(mcTooltip.p10)}</span></div>
                      {mcTooltip.det != null && (
                        <div style={{ borderTop: "1px solid #334155", marginTop: 3, paddingTop: 3, color: "#94a3b8" }}>
                          Det: {fmt(mcTooltip.det)}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Legend */}
                <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 8, flexWrap: "wrap" }}>
                  {legendItems.map((item) => (
                    <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      {item.type === 'band' ? (
                        <div style={{ width: 20, height: 8, background: item.color, opacity: item.opacity, borderRadius: 2 }} />
                      ) : item.type === 'dashed' ? (
                        <div style={{ width: 20, height: 0, borderTop: `2px dashed ${item.color}` }} />
                      ) : (
                        <div style={{ width: 20, height: 3, background: item.color, borderRadius: 2 }} />
                      )}
                      <span style={{ fontSize: 10, color: "#94a3b8" }}>{item.label}</span>
                    </div>
                  ))}
                </div>

                {/* Sensitivity Tornado Chart */}
                {tornado && tornado.length > 0 && (() => {
                  const maxSpread = Math.max(...tornado.map(t => Math.max(Math.abs(t.upside), Math.abs(t.downside))));
                  const tornadoW = 700;
                  const barH = 22;
                  const labelW = 140;
                  const centerX = labelW + (tornadoW - labelW) / 2;
                  const halfW = (tornadoW - labelW) / 2 - 20;

                  return (
                      <div style={{ marginTop: 16, borderTop: "1px solid #334155", paddingTop: 12 }}>
                        <div style={{ fontSize: 12, color: "#f8fafc", fontWeight: 700, marginBottom: 8 }}>
                          Which assumption moves the result most?
                        </div>
                        <div style={{ fontSize: 10, color: "#475569", marginBottom: 8 }}>
                          Approximate change in the year-6 balance from a one-sigma move in each assumption
                        </div>
                      <svg viewBox={`0 0 ${tornadoW} ${tornado.length * (barH + 4) + 20}`} style={{ width: "100%", height: "auto" }}>
                        {/* Center line */}
                        <line x1={centerX} x2={centerX} y1={0} y2={tornado.length * (barH + 4)} stroke="#475569" strokeWidth="1" />

                        {tornado.map((t, i) => {
                          const y = i * (barH + 4) + 2;
                          const downW = maxSpread > 0 ? (Math.abs(t.downside) / maxSpread) * halfW : 0;
                          const upW = maxSpread > 0 ? (Math.abs(t.upside) / maxSpread) * halfW : 0;

                          return (
                            <g key={i}>
                              {/* Label */}
                              <text x={labelW - 6} y={y + barH / 2 + 4} textAnchor="end" fill="#94a3b8" fontSize="10">
                                {t.name}
                              </text>
                              {/* Downside bar (left of center, red) */}
                              {t.downside < 0 && (
                                <rect x={centerX - downW} y={y} width={downW} height={barH} rx="2" fill="#f87171" opacity="0.6" />
                              )}
                              {t.downside >= 0 && (
                                <rect x={centerX} y={y} width={downW} height={barH} rx="2" fill="#4ade80" opacity="0.3" />
                              )}
                              {/* Upside bar (right of center, green) */}
                              {t.upside >= 0 && (
                                <rect x={centerX} y={y} width={upW} height={barH} rx="2" fill="#4ade80" opacity="0.6" />
                              )}
                              {t.upside < 0 && (
                                <rect x={centerX - upW} y={y} width={upW} height={barH} rx="2" fill="#f87171" opacity="0.3" />
                              )}
                              {/* Value labels */}
                              <text x={centerX - downW - 4} y={y + barH / 2 + 4} textAnchor="end" fill={t.downside < 0 ? "#f87171" : "#4ade80"} fontSize="9" fontFamily="'JetBrains Mono', monospace">
                                {fmt(t.downside)}
                              </text>
                              <text x={centerX + upW + 4} y={y + barH / 2 + 4} textAnchor="start" fill={t.upside >= 0 ? "#4ade80" : "#f87171"} fontSize="9" fontFamily="'JetBrains Mono', monospace">
                                {fmt(t.upside)}
                              </text>
                            </g>
                          );
                        })}
                      </svg>
                    </div>
                  );
                })()}
              </div>
            );
          })()}

          {!mcResults && (
            <div style={{ textAlign: "center", padding: "24px 0", color: "#475569", fontSize: 12 }}>
              Adjust uncertainty parameters above, then click <strong style={{ color: "#4ade80" }}>Run Simulation</strong> to see probabilistic outcomes.
            </div>
          )}
        </div>
  );
}
