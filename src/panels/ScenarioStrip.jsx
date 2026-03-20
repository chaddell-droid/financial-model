import React from "react";
import Toggle from '../components/Toggle.jsx';
import Slider from '../components/Slider.jsx';
import { fmtFull } from '../model/formatters.js';

const ScenarioStrip = ({
  retireDebt, lifestyleCutsApplied, cutsOverride,
  lifestyleCuts, cutInHalf, extraCuts,
  debtTotal, debtService,
  baseExpenses, currentExpenses,
  vanSold, vanMonthlySavings,
  bcsAnnualTotal, bcsParentsAnnual, bcsYearsLeft, bcsFamilyMonthly,
  moldCost, moldInclude, roofCost, roofInclude, otherProjects, otherInclude,
  advanceNeeded,
  onFieldChange,
}) => {
  const set = onFieldChange;

  return (
        <div style={{
          background: "#1e293b", borderRadius: 12, padding: "16px 20px",
          border: "1px solid #fbbf2433", marginBottom: 24,
          display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20
        }}>
          <div>
            <h3 style={{ fontSize: 13, color: "#fbbf24", margin: "0 0 10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Scenarios
            </h3>

            {/* Total spending control with breakdown */}
            {(() => {
              const vanCost = vanSold ? 0 : (vanMonthlySavings || 0);
              const debtCost = retireDebt ? 0 : debtService;
              const detailCuts = lifestyleCuts + cutInHalf + extraCuts;
              const effectiveCuts = cutsOverride != null ? cutsOverride : detailCuts;
              const cutsSavings = lifestyleCutsApplied ? effectiveCuts : 0;
              const netLiving = baseExpenses - cutsSavings;
              return (
                <div style={{ marginBottom: 10, padding: '8px 12px', background: '#0f172a', borderRadius: 8, border: '1px solid #1e293b' }}>
                  <div style={{ marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>Monthly spending breakdown</span>
                  </div>
                  <table style={{ width: '100%', marginBottom: 6, fontSize: 10, borderCollapse: 'collapse', fontFamily: "'JetBrains Mono', monospace" }}>
                    <tbody>
                      {cutsSavings > 0 ? (
                        <>
                          <tr>
                            <td style={{ color: '#64748b', paddingLeft: 16, lineHeight: 1.8 }}>Base living</td>
                            <td style={{ color: '#94a3b8', textAlign: 'right', lineHeight: 1.8 }}>{fmtFull(baseExpenses)}</td>
                          </tr>
                          <tr>
                            <td style={{ color: '#4ade80', paddingLeft: 16, lineHeight: 1.8 }}>Spending cuts</td>
                            <td style={{ color: '#4ade80', textAlign: 'right', lineHeight: 1.8 }}>-{fmtFull(cutsSavings)}</td>
                          </tr>
                          <tr>
                            <td colSpan={2} style={{ borderBottom: '1px dashed #334155', paddingBottom: 2 }} />
                          </tr>
                          <tr>
                            <td style={{ color: '#e2e8f0', fontWeight: 600, lineHeight: 1.8 }}>Net living</td>
                            <td style={{ color: '#e2e8f0', fontWeight: 600, textAlign: 'right', lineHeight: 1.8 }}>{fmtFull(netLiving)}</td>
                          </tr>
                        </>
                      ) : (
                        <tr>
                          <td style={{ color: '#e2e8f0', fontWeight: 600, lineHeight: 1.8 }}>Living expenses</td>
                          <td style={{ color: '#e2e8f0', fontWeight: 600, textAlign: 'right', lineHeight: 1.8 }}>{fmtFull(netLiving)}</td>
                        </tr>
                      )}
                      {debtCost > 0 && (
                        <tr>
                          <td style={{ color: '#94a3b8', lineHeight: 1.8 }}>Debt service</td>
                          <td style={{ color: '#94a3b8', textAlign: 'right', lineHeight: 1.8 }}>{fmtFull(debtCost)}</td>
                        </tr>
                      )}
                      {vanCost > 0 && (
                        <tr>
                          <td style={{ color: '#94a3b8', lineHeight: 1.8 }}>Van</td>
                          <td style={{ color: '#94a3b8', textAlign: 'right', lineHeight: 1.8 }}>{fmtFull(vanCost)}</td>
                        </tr>
                      )}
                      {bcsFamilyMonthly > 0 && (
                        <tr>
                          <td style={{ color: '#94a3b8', lineHeight: 1.8 }}>BCS tuition</td>
                          <td style={{ color: '#94a3b8', textAlign: 'right', lineHeight: 1.8 }}>{fmtFull(bcsFamilyMonthly)}</td>
                        </tr>
                      )}
                      <tr>
                        <td colSpan={2} style={{ borderBottom: '1px solid #475569', paddingBottom: 2 }} />
                      </tr>
                      <tr>
                        <td style={{ color: '#f87171', fontWeight: 700, lineHeight: 2, fontSize: 11 }}>Total</td>
                        <td style={{ color: '#f87171', fontWeight: 700, textAlign: 'right', lineHeight: 2, fontSize: 11 }}>{fmtFull(currentExpenses)}/mo</td>
                      </tr>
                    </tbody>
                  </table>
                  <Slider label="Base living expenses" value={baseExpenses} onChange={set('baseExpenses')}
                    min={25000} max={55000} step={500} color="#f87171"
                    format={(v) => fmtFull(v)} />
                </div>
              );
            })()}

            <Toggle label={`Retire all debt (${fmtFull(debtTotal)} → saves ${fmtFull(debtService)}/mo)`} checked={retireDebt} onChange={set('retireDebt')} color="#4ade80" />
            <Toggle label="Lifestyle + spending cuts" checked={lifestyleCutsApplied} onChange={set('lifestyleCutsApplied')} color="#4ade80" />
            {lifestyleCutsApplied && (
              <div style={{ marginLeft: 54, marginTop: -2, marginBottom: 6 }}>
                <Slider label="Total cuts" value={cutsOverride != null ? cutsOverride : (lifestyleCuts + cutInHalf + extraCuts)}
                  onChange={(v) => set('cutsOverride')(v)}
                  min={0} max={25000} step={500} color="#4ade80"
                  format={(v) => fmtFull(v) + '/mo'} />
                {cutsOverride != null && cutsOverride !== (lifestyleCuts + cutInHalf + extraCuts) && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#64748b', marginTop: 2 }}>
                    <span>Detail total: {fmtFull(lifestyleCuts + cutInHalf + extraCuts)}/mo</span>
                    <span style={{ color: '#4ade80', cursor: 'pointer', textDecoration: 'underline' }}
                      onClick={() => set('cutsOverride')(null)}>
                      Reset to detail
                    </span>
                  </div>
                )}
              </div>
            )}
            <div style={{ margin: "8px 0 2px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: "#94a3b8" }}>BCS tuition — parents' contribution</span>
                <span style={{ fontSize: 11, color: "#c084fc", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
                  We owe {bcsFamilyMonthly > 0 ? fmtFull(bcsFamilyMonthly) + "/mo" : "$0/mo"}
                </span>
              </div>
              <div style={{ position: "relative", padding: "0 2px" }}>
                <input type="range" min={0} max={bcsAnnualTotal} step={1000} value={bcsParentsAnnual}
                  onChange={(e) => set('bcsParentsAnnual')(Number(e.target.value))}
                  style={{ width: "100%", accentColor: "#c084fc", cursor: "pointer" }} />
                {/* Tick marks */}
                <div style={{ position: "relative", height: 18, marginTop: -2 }}>
                  {[
                    { value: 0, label: "$0", sub: "We pay all" },
                    { value: 25000, label: "$25K", sub: "Status quo" },
                    { value: bcsAnnualTotal, label: fmtFull(bcsAnnualTotal), sub: "Fully covered" },
                  ].map(tick => {
                    const pct = (tick.value / bcsAnnualTotal) * 100;
                    const isActive = Math.abs(bcsParentsAnnual - tick.value) < 500;
                    return (
                      <div key={tick.value} style={{
                        position: "absolute", left: `${pct}%`, transform: "translateX(-50%)",
                        textAlign: "center", cursor: "pointer"
                      }} onClick={() => set('bcsParentsAnnual')(tick.value)}>
                        <div style={{ width: 2, height: 6, background: isActive ? "#c084fc" : "#475569", margin: "0 auto 2px" }} />
                        <div style={{ fontSize: 9, fontWeight: isActive ? 700 : 400, color: isActive ? "#c084fc" : "#64748b", whiteSpace: "nowrap" }}>
                          {tick.label}
                        </div>
                        <div style={{ fontSize: 8, color: isActive ? "#c084fc88" : "#47556988", whiteSpace: "nowrap" }}>
                          {tick.sub}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
          <div style={{ padding: "0 0 0 12px", borderLeft: "1px solid #334155" }}>
            <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Inheritance Advance Ask</div>
            <div style={{ fontSize: 12, color: "#e2e8f0", lineHeight: 1.7 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Debt retirement:</span>
                <span style={{ color: retireDebt ? "#4ade80" : "#475569", fontFamily: "'JetBrains Mono', monospace" }}>
                  {retireDebt ? fmtFull(debtTotal) : "\u2014"}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Mold remediation:</span>
                <span style={{ color: moldInclude ? "#fbbf24" : "#475569", fontFamily: "'JetBrains Mono', monospace" }}>
                  {moldInclude ? fmtFull(moldCost) : "\u2014"}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Roof:</span>
                <span style={{ color: roofInclude ? "#fbbf24" : "#475569", fontFamily: "'JetBrains Mono', monospace" }}>
                  {roofInclude ? fmtFull(roofCost) : "\u2014"}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>House projects + toilets:</span>
                <span style={{ color: otherInclude ? "#fbbf24" : "#475569", fontFamily: "'JetBrains Mono', monospace" }}>
                  {otherInclude ? fmtFull(otherProjects) : "\u2014"}
                </span>
              </div>
              {bcsParentsAnnual > 25000 && (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>BCS increase ({bcsYearsLeft} yrs):</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", color: "#c084fc" }}>{fmtFull((bcsParentsAnnual - 25000) * bcsYearsLeft)} add'l</span>
                </div>
              )}
              <div style={{ borderTop: "1px solid #334155", marginTop: 6, paddingTop: 6, display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
                <span>One-time advance:</span>
                <span style={{ color: "#fbbf24", fontFamily: "'JetBrains Mono', monospace", fontSize: 14 }}>{fmtFull(advanceNeeded)}</span>
              </div>
            </div>
          </div>
        </div>
  );
};

export default ScenarioStrip;
