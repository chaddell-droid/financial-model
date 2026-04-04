import React, { memo, useState } from 'react';
import { fmt, fmtFull } from '../model/formatters.js';
import Slider from '../components/Slider.jsx';
import { buildLegendItems, formatModelTimeLabel, getSummaryTimeframeLabel } from './chartContract.js';
import { COLORS } from './chartUtils.js';
import { useChartTooltip } from './useChartTooltip.js';
import ChartYAxis from './ChartYAxis.jsx';
import ChartXAxis from './ChartXAxis.jsx';

function SavingsDrawdownChart({
  savingsData,
  savingsZeroMonth,
  savingsZeroLabel,
  compareProjection,
  compareName,
  data,
  startingSavings,
  investmentReturn,
  debtService,
  ssdiApprovalMonth,
  ssdiBackPayActual,
  retireDebt,
  presentMode,
  onFieldChange,
  baseExpenses,
  totalMonthlySpend,
  instanceId = 'default',
}) {
  const [savingsTooltip, setSavingsTooltip] = useState(null);
  const comparisonLegend = buildLegendItems(compareProjection ? [
    { id: 'current', label: 'Current settings', color: COLORS.green },
    { id: 'compare', label: `"${compareName}"`, color: COLORS.yellow, line: true, dash: true },
  ] : []);

  return (
        <div data-testid={`savings-drawdown-chart-${instanceId}`} data-chart-instance={instanceId} style={{
          background: COLORS.bgCard, borderRadius: 12, padding: "20px 16px",
          border: savingsZeroMonth ? `1px solid ${COLORS.red}33` : `1px solid ${COLORS.border}`, marginBottom: 24
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
            <h3 style={{ fontSize: 14, color: savingsZeroMonth ? COLORS.red : COLORS.green, margin: 0, fontWeight: 600 }}>
              Savings Balance Over Time
            </h3>
            {savingsZeroMonth && (
              <span style={{ fontSize: 12, color: COLORS.red, fontWeight: 600 }}>Depleted: {savingsZeroLabel}</span>
            )}
          </div>

          {/* Key numbers strip */}
          <div style={{
            display: "flex", gap: 2, marginBottom: 16, flexWrap: "wrap"
          }}>
            {(() => {
              const annualReturn = Math.round(startingSavings * (Math.pow(1 + investmentReturn / 100, 1) - 1));
              // Show current (Q1) for expenses/outflow — tracks the slider directly
              // Show breakeven quarter for income/net if one exists, otherwise last quarter
              const current = data[0];
              const steadyIdx = data.findIndex(d => d.netMonthly >= 0);
              const steady = steadyIdx >= 0 ? data[steadyIdx] : data[data.length - 1];
              const steadyLabel = steady.label || "Y6";
              return [
                { label: "Starting Savings", value: fmtFull(startingSavings), color: COLORS.textSecondary },
                { label: `${getSummaryTimeframeLabel('steady')} income`, value: fmtFull(steady.totalIncome), color: COLORS.green },
                { label: `${getSummaryTimeframeLabel('current')} expenses`, value: fmtFull(current.expenses), color: COLORS.red },
                { label: `${getSummaryTimeframeLabel('steady')} net`, value: (steady.netMonthly >= 0 ? "+" : "") + fmtFull(steady.netMonthly), color: steady.netMonthly >= 0 ? COLORS.green : COLORS.red },
                { label: `Annual Return (${investmentReturn}% on savings)`, value: fmtFull(annualReturn) + "/yr", sub: `${fmtFull(data[0].investReturnQtr)}/qtr · ${fmtFull(data[0].investReturn)}/mo`, color: COLORS.cyan },
              ];
            })().map((item, i) => (
              <div key={i} style={{
                flex: 1, minWidth: 100,
                background: COLORS.bgDeep, borderRadius: 6, padding: "6px 10px",
                border: `1px solid ${COLORS.bgCard}`
              }}>
                <div style={{ fontSize: 9, color: COLORS.textDim, marginBottom: 2 }}>{item.label}</div>
                <div style={{
                  fontSize: 14, fontWeight: 700, color: item.color,
                  fontFamily: "'JetBrains Mono', monospace"
                }}>
                  {item.value}
                </div>
                {item.sub && (
                  <div style={{ fontSize: 9, color: COLORS.borderLight, marginTop: 1, fontFamily: "'JetBrains Mono', monospace" }}>
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

            const maxMonth = savingsData[savingsData.length - 1]?.month || 72;
            const x = (m) => padL + (m / maxMonth) * plotW;
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
              <div data-testid={`savings-drawdown-hover-surface-${instanceId}`} style={{ position: "relative" }}
                onMouseLeave={() => setSavingsTooltip(null)}>
              <svg data-testid={`savings-drawdown-svg-${instanceId}`} viewBox={`0 0 ${svgW} ${svgH}`} style={{ width: "100%", height: "auto", display: "block" }}
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
                  <clipPath id={`sav-above-${instanceId}`}>
                    <rect x={padL} y={padT} width={plotW} height={zeroY - padT} />
                  </clipPath>
                  <clipPath id={`sav-below-${instanceId}`}>
                    <rect x={padL} y={zeroY} width={plotW} height={padT + plotH - zeroY} />
                  </clipPath>
                  <linearGradient id={`savingsGradGreen-${instanceId}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLORS.green} />
                    <stop offset="100%" stopColor="transparent" />
                  </linearGradient>
                  <linearGradient id={`savingsGradRed-${instanceId}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="transparent" />
                    <stop offset="100%" stopColor={COLORS.red} />
                  </linearGradient>
                </defs>

                {/* Grid lines and Y labels */}
                <ChartYAxis ticks={yTicks} yOf={y} svgW={svgW} padL={padL} padR={padR} />

                {/* Area fills — green above zero, red below */}
                <path d={areaPath} fill={`url(#savingsGradGreen-${instanceId})`} opacity="0.25" clipPath={`url(#sav-above-${instanceId})`} />
                <path d={areaPath} fill={`url(#savingsGradRed-${instanceId})`} opacity="0.25" clipPath={`url(#sav-below-${instanceId})`} />

                {/* Line — green above zero */}
                <path d={linePath} fill="none" stroke={COLORS.green} strokeWidth="2.5"
                  strokeLinejoin="round" strokeLinecap="round" clipPath={`url(#sav-above-${instanceId})`} />
                {/* Line — red below zero */}
                <path d={linePath} fill="none" stroke={COLORS.red} strokeWidth="2.5"
                  strokeLinejoin="round" strokeLinecap="round" clipPath={`url(#sav-below-${instanceId})`} />

                {/* Comparison line overlay */}
                {compSavings && (() => {
                  const compPoints = compSavings.map(d => `${x(d.month)},${y(d.balance)}`);
                  const compLinePath = `M ${compPoints.join(" L ")}`;
                  const compZeroMonth = compSavings.find(d => d.balance <= 0);
                  const compEnd = compSavings[compSavings.length - 1];
                  return (
                    <>
                      <path d={compLinePath} fill="none" stroke={COLORS.yellow} strokeWidth="2"
                        strokeLinejoin="round" strokeLinecap="round" strokeDasharray="8,4" opacity="0.8" />
                      {compZeroMonth && (
                        <>
                          <line x1={x(compZeroMonth.month)} x2={x(compZeroMonth.month)}
                            y1={padT} y2={padT + plotH}
                            stroke={COLORS.yellow} strokeWidth="1" strokeDasharray="3,3" opacity="0.5" />
                        </>
                      )}
                      {/* Comparison end-of-line label */}
                      <circle cx={x(compEnd.month)} cy={y(compEnd.balance)} r="3" fill={COLORS.yellow} />
                      <text x={x(compEnd.month) - 6} y={y(compEnd.balance) - 8} textAnchor="end"
                        fill={COLORS.yellow} fontSize="10" fontWeight="600" fontFamily="'JetBrains Mono', monospace">
                        {compareName}
                      </text>
                    </>
                  );
                })()}

                {/* Current line end-of-line label */}
                {(() => {
                  const curEnd = savingsData[savingsData.length - 1];
                  const curColor = curEnd.balance >= 0 ? COLORS.green : COLORS.red;
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
                    fill={savingsTooltip.balance >= 0 ? COLORS.green : COLORS.red}
                    stroke={COLORS.textPrimary} strokeWidth="2" />
                )}

                {/* X-axis labels */}
                <ChartXAxis data={savingsData} xOf={x} svgH={svgH} />

                {/* Zero crossing marker */}
                {savingsZeroMonth && (
                  <g>
                    <line x1={x(savingsZeroMonth.month)} x2={x(savingsZeroMonth.month)}
                      y1={padT} y2={padT + plotH}
                      stroke={COLORS.red} strokeWidth="1" strokeDasharray="4,3" />
                    <text x={x(savingsZeroMonth.month)} y={padT - 14} textAnchor="middle"
                      fill={COLORS.red} fontSize="10" fontWeight="700"
                      fontFamily="'JetBrains Mono', monospace">
                      Savings
                    </text>
                    <text x={x(savingsZeroMonth.month)} y={padT - 4} textAnchor="middle"
                      fill={COLORS.red} fontSize="10" fontWeight="700"
                      fontFamily="'JetBrains Mono', monospace">
                      Exhausted
                    </text>
                  </g>
                )}

                {/* SSDI back pay arrival marker */}
                {ssdiBackPayActual > 0 && (ssdiApprovalMonth + 2) <= maxMonth && (
                  <g>
                    <line x1={x(ssdiApprovalMonth + 2)} x2={x(ssdiApprovalMonth + 2)}
                      y1={padT} y2={padT + plotH}
                      stroke={COLORS.green} strokeWidth="1" strokeDasharray="4,3" />
                    <text x={x(ssdiApprovalMonth + 2)} y={padT + plotH + 14} textAnchor="middle"
                      fill={COLORS.green} fontSize="10" fontWeight="700"
                      fontFamily="'JetBrains Mono', monospace">
                      Back pay +{fmtFull(ssdiBackPayActual)}
                    </text>
                  </g>
                )}

              </svg>

              {/* Tooltip */}
              {savingsTooltip && (
                  <div
                    data-testid={`savings-drawdown-tooltip-${instanceId}`}
                    style={{
                    position: "absolute",
                    left: `${savingsTooltip.pctX}%`,
                    top: `${savingsTooltip.pctY}%`,
                  transform: "translate(-50%, -120%)",
                  background: COLORS.bgDeep,
                  border: `1px solid ${savingsTooltip.balance >= 0 ? COLORS.green : COLORS.red}`,
                  borderRadius: 6,
                  padding: "6px 10px",
                  pointerEvents: "none",
                  zIndex: 10,
                  whiteSpace: "nowrap",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.5)"
                  }}>
                  <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 2 }}>
                    {formatModelTimeLabel(savingsTooltip.month)}
                  </div>
                  <div style={{
                    fontSize: 14, fontWeight: 700,
                    color: savingsTooltip.balance >= 0 ? COLORS.green : COLORS.red,
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
            <Slider label="Starting savings" value={startingSavings} onChange={onFieldChange('startingSavings')} commitStrategy='release'
              min={50000} max={500000} step={10000} color={COLORS.blue} />
            <Slider label="Investment return (annual)" value={investmentReturn} onChange={onFieldChange('investmentReturn')} commitStrategy='release'
              min={0} max={50} format={(v) => v + "%"} color={COLORS.blue} />
          </div>
          <div style={{ marginTop: 4, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Slider label={totalMonthlySpend != null ? "Base living (set via total spend)" : "Base living expenses/mo"} value={baseExpenses} onChange={totalMonthlySpend != null ? () => {} : onFieldChange('baseExpenses')} commitStrategy='release' min={25000} max={55000} step={500} color={totalMonthlySpend != null ? COLORS.border : COLORS.red} />
            <Slider label="Debt service/mo (freed if retired)" value={debtService} onChange={onFieldChange('debtService')} commitStrategy='release' min={0} max={20000} step={100} color={retireDebt ? COLORS.border : COLORS.red} />
          </div>
          <div style={{ marginTop: 4, display: "flex", justifyContent: "space-between", fontSize: 11, padding: "0 2px" }}>
            <span style={{ color: COLORS.textDim }}>
              Total outflow (now): <span style={{ color: COLORS.red, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>{fmtFull(data[0].expenses)}/mo</span>
            </span>
            <span style={{ color: COLORS.textDim }}>
              Investment returns ({investmentReturn}%): <span style={{ color: COLORS.cyan, fontFamily: "'JetBrains Mono', monospace" }}>{fmtFull(Math.round(startingSavings * (Math.pow(1 + investmentReturn / 100, 1) - 1)))}/yr</span> on initial savings
            </span>
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: COLORS.textDim, fontStyle: "italic", lineHeight: 1.5 }}>
            Investment returns compound monthly while balance is positive — but only matter when the monthly deficit is small. At a {fmtFull(Math.abs(data[0].netCashFlow))}/mo burn rate, savings drain before returns can compound meaningfully. Toggle debt retirement and spending cuts to shrink the deficit — that's when returns become a powerful lever.
          </div>
          </>}
          {compareProjection && (
            <div style={{ marginTop: 6, display: "flex", gap: 16, fontSize: 11, alignItems: "center" }}>
              {comparisonLegend.map((item) => (
                <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: item.line ? 20 : 20, height: item.line ? 0 : 3, background: item.line ? undefined : item.color, borderRadius: item.line ? 0 : 1, borderTop: item.line ? `2px dashed ${item.color}` : undefined }} />
                  <span style={{ color: item.id === 'compare' ? item.color : COLORS.textMuted }}>{item.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
  );
}

export default memo(SavingsDrawdownChart);
