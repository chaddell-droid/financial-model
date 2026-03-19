import React, { useState } from 'react';
import { fmt, fmtFull } from '../model/formatters.js';
import Slider from '../components/Slider.jsx';

export default function SavingsDrawdownChart({
  savingsData,
  savingsZeroMonth,
  savingsZeroLabel,
  compareProjection,
  compareName,
  data,
  startingSavings,
  investmentReturn,
  debtCC,
  debtPersonal,
  debtIRS,
  debtFirstmark,
  debtService,
  ssdiApprovalMonth,
  ssdiBackPayActual,
  milestones,
  retireDebt,
  presentMode,
  onFieldChange,
  baseExpenses,
}) {
  const [savingsTooltip, setSavingsTooltip] = useState(null);

  return (
        <div style={{
          background: "#1e293b", borderRadius: 12, padding: "20px 16px",
          border: savingsZeroMonth ? "1px solid #f8717133" : "1px solid #334155", marginBottom: 24
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
            <h3 style={{ fontSize: 14, color: savingsZeroMonth ? "#f87171" : "#4ade80", margin: 0, fontWeight: 600 }}>
              Savings Balance Over Time
            </h3>
            {savingsZeroMonth && (
              <span style={{ fontSize: 12, color: "#f87171", fontWeight: 600 }}>Depleted: {savingsZeroLabel}</span>
            )}
          </div>

          {/* Key numbers strip */}
          <div style={{
            display: "flex", gap: 2, marginBottom: 16, flexWrap: "wrap"
          }}>
            {(() => {
              const annualReturn = Math.round(startingSavings * (Math.pow(1 + investmentReturn / 100, 1) - 1));
              // Use first positive-net quarter as "steady state", or last quarter if none
              const steadyIdx = data.findIndex(d => d.netMonthly >= 0);
              const steady = steadyIdx >= 0 ? data[steadyIdx] : data[data.length - 1];
              const steadyLabel = steady.label || "Y6";
              return [
                { label: "Starting Savings", value: fmtFull(startingSavings), color: "#e2e8f0" },
                { label: `Monthly Income (${steadyLabel})`, value: fmtFull(steady.totalIncome), color: "#4ade80" },
                { label: `Monthly Expenses (${steadyLabel})`, value: fmtFull(steady.expenses), color: "#f87171" },
                { label: `Monthly Net (${steadyLabel})`, value: (steady.netMonthly >= 0 ? "+" : "") + fmtFull(steady.netMonthly), color: steady.netMonthly >= 0 ? "#4ade80" : "#f87171" },
                { label: `Annual Return (${investmentReturn}% on savings)`, value: fmtFull(annualReturn) + "/yr", sub: `${fmtFull(data[0].investReturnQtr)}/qtr · ${fmtFull(data[0].investReturn)}/mo`, color: "#22d3ee" },
              ];
            })().map((item, i) => (
              <div key={i} style={{
                flex: 1, minWidth: 100,
                background: "#0f172a", borderRadius: 6, padding: "6px 10px",
                border: "1px solid #1e293b"
              }}>
                <div style={{ fontSize: 9, color: "#64748b", marginBottom: 2 }}>{item.label}</div>
                <div style={{
                  fontSize: 14, fontWeight: 700, color: item.color,
                  fontFamily: "'JetBrains Mono', monospace"
                }}>
                  {item.value}
                </div>
                {item.sub && (
                  <div style={{ fontSize: 9, color: "#475569", marginTop: 1, fontFamily: "'JetBrains Mono', monospace" }}>
                    {item.sub}
                  </div>
                )}
              </div>
            ))}
          </div>
          {(() => {
            const svgH = 340;
            const svgW = 800;
            const padL = 60;
            const padR = 20;
            const padT = 20;
            const padB = 30;
            const plotW = svgW - padL - padR;
            const plotH = svgH - padT - padB;

            const compSavings = compareProjection ? compareProjection.savingsData : null;
            const dataMax = Math.max(startingSavings, ...savingsData.map(d => d.balance), ...(compSavings || []).map(d => d.balance));
            const dataMin = Math.min(0, ...savingsData.map(d => d.balance), ...(compSavings || []).map(d => d.balance));
            // Lock range to at least -startingSavings to startingSavings*1.5 so small changes don't rescale
            const maxBal = Math.max(dataMax, startingSavings * 1.5);
            const minBal = Math.min(dataMin, -startingSavings);
            const range = maxBal - minBal || 1;

            const x = (m) => padL + (m / 72) * plotW;
            const y = (b) => padT + (1 - (b - minBal) / range) * plotH;

            // Build SVG path
            const pathPoints = savingsData.map(d => `${x(d.month)},${y(d.balance)}`);
            const linePath = `M ${pathPoints.join(" L ")}`;

            // Area fill path (down to zero line or bottom)
            const zeroY = y(0);
            const areaPath = `M ${x(savingsData[0].month)},${zeroY} L ${pathPoints.join(" L ")} L ${x(savingsData[savingsData.length-1].month)},${zeroY} Z`;

            // Y-axis ticks
            const yTicks = [];
            const tickStep = range < 300000 ? 50000 : 100000;
            for (let v = Math.floor(minBal / tickStep) * tickStep; v <= maxBal; v += tickStep) {
              yTicks.push(v);
            }

            return (
              <div style={{ position: "relative" }}
                onMouseLeave={() => setSavingsTooltip(null)}>
              <svg viewBox={`0 0 ${svgW} ${svgH}`} style={{ width: "100%", height: "auto", display: "block" }}
                onMouseMove={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const mouseX = (e.clientX - rect.left) / rect.width * svgW;
                  let closest = savingsData[0];
                  let closestDist = Infinity;
                  for (const d of savingsData) {
                    const dist = Math.abs(x(d.month) - mouseX);
                    if (dist < closestDist) { closestDist = dist; closest = d; }
                  }
                  const pctX = (x(closest.month) / svgW) * 100;
                  const pctY = (y(closest.balance) / svgH) * 100;
                  setSavingsTooltip({ pctX, pctY, balance: closest.balance, month: closest.month });
                }}>
                {/* Clip regions for above/below zero */}
                <defs>
                  <clipPath id="savAboveZero">
                    <rect x={padL} y={padT} width={plotW} height={zeroY - padT} />
                  </clipPath>
                  <clipPath id="savBelowZero">
                    <rect x={padL} y={zeroY} width={plotW} height={padT + plotH - zeroY} />
                  </clipPath>
                  <linearGradient id="savingsGradGreen" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4ade80" />
                    <stop offset="100%" stopColor="transparent" />
                  </linearGradient>
                  <linearGradient id="savingsGradRed" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="transparent" />
                    <stop offset="100%" stopColor="#f87171" />
                  </linearGradient>
                </defs>

                {/* Grid lines and Y labels */}
                {yTicks.map((v, i) => (
                  <g key={i}>
                    <line x1={padL} x2={svgW - padR} y1={y(v)} y2={y(v)}
                      stroke={v === 0 ? "#475569" : "#1e293b"} strokeWidth={v === 0 ? 1.5 : 0.5} />
                    <text x={padL - 6} y={y(v) + 3} textAnchor="end"
                      fill="#64748b" fontSize="10" fontFamily="'JetBrains Mono', monospace">
                      {fmt(v)}
                    </text>
                  </g>
                ))}

                {/* Area fills — green above zero, red below */}
                <path d={areaPath} fill="url(#savingsGradGreen)" opacity="0.25" clipPath="url(#savAboveZero)" />
                <path d={areaPath} fill="url(#savingsGradRed)" opacity="0.25" clipPath="url(#savBelowZero)" />

                {/* Line — green above zero */}
                <path d={linePath} fill="none" stroke="#4ade80" strokeWidth="2.5"
                  strokeLinejoin="round" strokeLinecap="round" clipPath="url(#savAboveZero)" />
                {/* Line — red below zero */}
                <path d={linePath} fill="none" stroke="#f87171" strokeWidth="2.5"
                  strokeLinejoin="round" strokeLinecap="round" clipPath="url(#savBelowZero)" />

                {/* Comparison line overlay */}
                {compSavings && (() => {
                  const compPoints = compSavings.map(d => `${x(d.month)},${y(d.balance)}`);
                  const compLinePath = `M ${compPoints.join(" L ")}`;
                  const compZeroMonth = compSavings.find(d => d.balance <= 0);
                  const compEnd = compSavings[compSavings.length - 1];
                  return (
                    <>
                      <path d={compLinePath} fill="none" stroke="#fbbf24" strokeWidth="2"
                        strokeLinejoin="round" strokeLinecap="round" strokeDasharray="8,4" opacity="0.8" />
                      {compZeroMonth && (
                        <>
                          <line x1={x(compZeroMonth.month)} x2={x(compZeroMonth.month)}
                            y1={padT} y2={padT + plotH}
                            stroke="#fbbf24" strokeWidth="1" strokeDasharray="3,3" opacity="0.5" />
                        </>
                      )}
                      {/* Comparison end-of-line label */}
                      <circle cx={x(compEnd.month)} cy={y(compEnd.balance)} r="3" fill="#fbbf24" />
                      <text x={x(compEnd.month) - 6} y={y(compEnd.balance) - 8} textAnchor="end"
                        fill="#fbbf24" fontSize="10" fontWeight="600" fontFamily="'JetBrains Mono', monospace">
                        {compareName}
                      </text>
                    </>
                  );
                })()}

                {/* Current line end-of-line label */}
                {(() => {
                  const curEnd = savingsData[savingsData.length - 1];
                  const curColor = curEnd.balance >= 0 ? "#4ade80" : "#f87171";
                  return compSavings ? (
                    <>
                      <circle cx={x(curEnd.month)} cy={y(curEnd.balance)} r="3" fill={curColor} />
                      <text x={x(curEnd.month) - 6} y={y(curEnd.balance) + 14} textAnchor="end"
                        fill={curColor} fontSize="10" fontWeight="600" fontFamily="'JetBrains Mono', monospace">
                        Current
                      </text>
                    </>
                  ) : null;
                })()}

                {/* Hover highlight dot */}
                {savingsTooltip && (
                  <circle cx={x(savingsTooltip.month)} cy={y(savingsTooltip.balance)} r="5"
                    fill={savingsTooltip.balance >= 0 ? "#4ade80" : "#f87171"}
                    stroke="#f8fafc" strokeWidth="2" />
                )}

                {/* X-axis labels */}
                {savingsData.filter(d => d.month % 12 === 0).map((d, i) => (
                  <text key={i} x={x(d.month)} y={svgH - 5} textAnchor="middle"
                    fill="#64748b" fontSize="10" fontFamily="'JetBrains Mono', monospace">
                    {d.month === 0 ? "Now" : `Y${d.month / 12}`}
                  </text>
                ))}

                {/* Zero crossing marker */}
                {savingsZeroMonth && (
                  <g>
                    <line x1={x(savingsZeroMonth.month)} x2={x(savingsZeroMonth.month)}
                      y1={padT} y2={padT + plotH}
                      stroke="#f87171" strokeWidth="1" strokeDasharray="4,3" />
                    <text x={x(savingsZeroMonth.month)} y={padT - 14} textAnchor="middle"
                      fill="#f87171" fontSize="10" fontWeight="700"
                      fontFamily="'JetBrains Mono', monospace">
                      Savings
                    </text>
                    <text x={x(savingsZeroMonth.month)} y={padT - 4} textAnchor="middle"
                      fill="#f87171" fontSize="10" fontWeight="700"
                      fontFamily="'JetBrains Mono', monospace">
                      Exhausted
                    </text>
                  </g>
                )}

                {/* SSDI back pay arrival marker */}
                {ssdiBackPayActual > 0 && (ssdiApprovalMonth + 2) <= 72 && (
                  <g>
                    <line x1={x(ssdiApprovalMonth + 2)} x2={x(ssdiApprovalMonth + 2)}
                      y1={padT} y2={padT + plotH}
                      stroke="#4ade80" strokeWidth="1" strokeDasharray="4,3" />
                    <text x={x(ssdiApprovalMonth + 2)} y={padT + plotH + 14} textAnchor="middle"
                      fill="#4ade80" fontSize="9" fontWeight="700"
                      fontFamily="'JetBrains Mono', monospace">
                      Back pay +{fmtFull(ssdiBackPayActual)}
                    </text>
                  </g>
                )}

              </svg>

              {/* Tooltip */}
              {savingsTooltip && (
                <div style={{
                  position: "absolute",
                  left: `${savingsTooltip.pctX}%`,
                  top: `${savingsTooltip.pctY}%`,
                  transform: "translate(-50%, -120%)",
                  background: "#0f172a",
                  border: `1px solid ${savingsTooltip.balance >= 0 ? "#4ade80" : "#f87171"}`,
                  borderRadius: 6,
                  padding: "6px 10px",
                  pointerEvents: "none",
                  zIndex: 10,
                  whiteSpace: "nowrap",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.5)"
                }}>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 2 }}>
                    Month {savingsTooltip.month} ({savingsTooltip.month < 12 ? `${savingsTooltip.month}mo` : `Y${(savingsTooltip.month / 12).toFixed(1)}`})
                  </div>
                  <div style={{
                    fontSize: 14, fontWeight: 700,
                    color: savingsTooltip.balance >= 0 ? "#4ade80" : "#f87171",
                    fontFamily: "'JetBrains Mono', monospace"
                  }}>
                    {fmtFull(savingsTooltip.balance)}
                  </div>
                </div>
              )}
              </div>
            );
          })()}
          {!presentMode && <>
          <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Slider label="Starting savings" value={startingSavings} onChange={onFieldChange('startingSavings')}
              min={50000} max={500000} step={10000} color="#60a5fa" />
            <Slider label="Investment return (annual)" value={investmentReturn} onChange={onFieldChange('investmentReturn')}
              min={0} max={50} format={(v) => v + "%"} color="#60a5fa" />
          </div>
          <div style={{ marginTop: 4, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Slider label="Base living expenses/mo" value={baseExpenses} onChange={onFieldChange('baseExpenses')} min={25000} max={55000} step={500} color="#f87171" />
            <Slider label="Debt service/mo (freed if retired)" value={debtService} onChange={onFieldChange('debtService')} min={3000} max={12000} step={100} color={retireDebt ? "#334155" : "#f87171"} />
          </div>
          <div style={{ marginTop: 4, display: "flex", justifyContent: "space-between", fontSize: 11, padding: "0 2px" }}>
            <span style={{ color: "#64748b" }}>
              Total outflow: <span style={{ color: "#f87171", fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>{fmtFull((data.findIndex(d => d.netMonthly >= 0) >= 0 ? data[data.findIndex(d => d.netMonthly >= 0)] : data[data.length - 1]).expenses)}/mo</span>
            </span>
            <span style={{ color: "#64748b" }}>
              Investment returns ({investmentReturn}%): <span style={{ color: "#22d3ee", fontFamily: "'JetBrains Mono', monospace" }}>{fmtFull(Math.round(startingSavings * (Math.pow(1 + investmentReturn / 100, 1) - 1)))}/yr</span> on initial savings
            </span>
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: "#64748b", fontStyle: "italic", lineHeight: 1.5 }}>
            Investment returns compound monthly while balance is positive — but only matter when the monthly deficit is small. At a {fmtFull(Math.abs(data[0].netCashFlow))}/mo burn rate, savings drain before returns can compound meaningfully. Toggle debt retirement and spending cuts to shrink the deficit — that's when returns become a powerful lever.
          </div>
          </>}
          {compareProjection && (
            <div style={{ marginTop: 6, display: "flex", gap: 16, fontSize: 11, alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 20, height: 3, background: "#4ade80", borderRadius: 1 }} />
                <span style={{ color: "#94a3b8" }}>Current settings</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 20, height: 0, borderTop: "2px dashed #fbbf24" }} />
                <span style={{ color: "#fbbf24" }}>"{compareName}"</span>
              </div>
            </div>
          )}
        </div>
  );
}
