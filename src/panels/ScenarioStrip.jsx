import React from "react";
import Toggle from '../components/Toggle.jsx';
import Slider from '../components/Slider.jsx';
import { fmtFull } from '../model/formatters.js';

const ScenarioStrip = ({
  retireDebt, lifestyleCutsApplied,
  lifestyleCuts, cutInHalf, extraCuts,
  debtTotal, debtService,
  baseExpenses, currentExpenses,
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

            {/* Total spending control */}
            {(() => {
              const defaultBase = 43818;
              const delta = baseExpenses - defaultBase;
              const deltaColor = delta < 0 ? '#4ade80' : delta > 0 ? '#f87171' : '#64748b';
              return (
                <div style={{ marginBottom: 10, padding: '8px 12px', background: '#0f172a', borderRadius: 8, border: '1px solid #1e293b' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>Total monthly spending</span>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#f87171', fontFamily: "'JetBrains Mono', monospace" }}>
                        {fmtFull(currentExpenses)}/mo
                      </span>
                      {delta !== 0 && (
                        <span style={{ fontSize: 10, color: deltaColor, marginLeft: 6, fontFamily: "'JetBrains Mono', monospace" }}>
                          ({delta > 0 ? '+' : ''}{fmtFull(delta)} base)
                        </span>
                      )}
                    </div>
                  </div>
                  <Slider label="" value={baseExpenses} onChange={set('baseExpenses')}
                    min={25000} max={55000} step={500} color="#f87171"
                    format={(v) => fmtFull(v)} />
                </div>
              );
            })()}

            <Toggle label={`Retire all debt (${fmtFull(debtTotal)} → saves ${fmtFull(debtService)}/mo)`} checked={retireDebt} onChange={set('retireDebt')} color="#4ade80" />
            <Toggle label={`Lifestyle + spending cuts (saves ${fmtFull(lifestyleCuts + cutInHalf + extraCuts)}/mo)`} checked={lifestyleCutsApplied} onChange={set('lifestyleCutsApplied')} color="#4ade80" />
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
