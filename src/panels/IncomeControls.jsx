import React from "react";
import Slider from '../components/Slider.jsx';
import Toggle from '../components/Toggle.jsx';
import { fmtFull } from '../model/formatters.js';
import { SGA_LIMIT } from '../model/constants.js';

const IncomeControls = ({
  sarahRate, sarahMaxRate, sarahRateGrowth,
  sarahCurrentClients, sarahMaxClients, sarahClientGrowth,
  sarahCurrentNet, sarahCeiling,
  ssdiDenied,
  ssdiFamilyTotal, ssdiPersonal, kidsAgeOutMonths,
  ssdiApprovalMonth, ssdiBackPayMonths, ssdiBackPayGross, ssdiAttorneyFee, ssdiBackPayActual,
  chadConsulting,
  trustIncomeNow, trustIncomeFuture, trustIncreaseMonth,
  vanSold, vanMonthlySavings,
  llcAnnual, llcMultiplier, llcDelayMonths, llcImproves,
  onFieldChange,
}) => {
  const set = onFieldChange;
  const sgaLimit = SGA_LIMIT;

  return (
          <div style={{
            background: "#1e293b", borderRadius: 12, padding: 20,
            border: "1px solid #334155"
          }}>
            <h3 style={{ fontSize: 14, color: "#60a5fa", margin: "0 0 12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Income Assumptions
            </h3>
            <div style={{ padding: "10px 12px", background: "#0f172a", borderRadius: 8, border: "1px solid #334155", marginBottom: 12 }}>
              <h4 style={{ fontSize: 11, color: "#60a5fa", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Sarah's Business — Rate</h4>
              <Slider label="Current hourly rate" value={sarahRate} onChange={set('sarahRate')} min={150} max={300} step={10} format={(v) => "$" + v + "/hr"} />
              <Slider label="Rate growth/yr" value={sarahRateGrowth} onChange={set('sarahRateGrowth')} min={0} max={20} format={(v) => v + "%"} />
              <Slider label="Max hourly rate (ceiling)" value={sarahMaxRate} onChange={set('sarahMaxRate')} min={200} max={400} step={10} format={(v) => "$" + v + "/hr"} color="#94a3b8" />
            </div>
            <div style={{ padding: "10px 12px", background: "#0f172a", borderRadius: 8, border: "1px solid #334155", marginBottom: 12 }}>
              <h4 style={{ fontSize: 11, color: "#60a5fa", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Sarah's Business — Clients</h4>
              <Slider label="Current clients/day" value={sarahCurrentClients} onChange={set('sarahCurrentClients')} min={1} max={5} step={0.1} format={(v) => v.toFixed(1)} />
              <Slider label="Client growth/yr" value={sarahClientGrowth} onChange={set('sarahClientGrowth')} min={0} max={30} format={(v) => v + "%"} />
              <Slider label="Max clients/day (ceiling)" value={sarahMaxClients} onChange={set('sarahMaxClients')} min={3} max={7} step={0.5} format={(v) => v.toFixed(1)} color="#94a3b8" />
            </div>
            <div style={{ padding: "8px 12px", background: "#0f172a", borderRadius: 8, border: "1px solid #334155", marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ color: "#64748b" }}>Current net/mo:</span>
                <span style={{ color: "#60a5fa", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{fmtFull(sarahCurrentNet)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 2 }}>
                <span style={{ color: "#64748b" }}>Ceiling:</span>
                <span style={{ color: "#94a3b8", fontFamily: "'JetBrains Mono', monospace" }}>{fmtFull(sarahCeiling)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 2 }}>
                <span style={{ color: "#64748b" }}>Capacity used:</span>
                <span style={{ color: sarahCurrentNet / sarahCeiling > 0.8 ? "#fbbf24" : "#4ade80", fontFamily: "'JetBrains Mono', monospace" }}>{Math.round(sarahCurrentNet / sarahCeiling * 100)}%</span>
              </div>
            </div>
            <div style={{ marginBottom: 8 }}>
              <Toggle label="SSDI Denied (model worst case)" checked={ssdiDenied} onChange={set('ssdiDenied')} color="#f87171" />
              {ssdiDenied && (
                <div style={{ fontSize: 10, color: "#f87171", marginLeft: 54, marginTop: -2, marginBottom: 4, fontStyle: "italic" }}>
                  All SSDI income zeroed. Back pay zeroed. Consulting disabled.
                </div>
              )}
            </div>
            <div style={{ opacity: ssdiDenied ? 0.3 : 1, pointerEvents: ssdiDenied ? 'none' : 'auto' }}>
              <Slider label="SSDI family total/mo" value={ssdiFamilyTotal} onChange={set('ssdiFamilyTotal')} min={4000} max={7000} step={100} />
              <Slider label="SSDI personal (post kids)" value={ssdiPersonal} onChange={set('ssdiPersonal')} min={3000} max={4500} step={50} />
              <Slider label="Kids age out (months)" value={kidsAgeOutMonths} onChange={set('kidsAgeOutMonths')} min={24} max={48} />
            </div>

            <div style={{ marginTop: 12, padding: "10px 12px", background: "#0f172a", borderRadius: 8, border: "1px solid #334155" }}>
              <h4 style={{ fontSize: 11, color: "#38bdf8", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Chad Consulting (Post-SSDI)</h4>
              <Slider label="Monthly consulting income" value={chadConsulting} onChange={set('chadConsulting')} min={0} max={sgaLimit} step={100} color="#38bdf8" />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginTop: 4 }}>
                <span style={{ color: "#64748b" }}>SGA limit (2026):</span>
                <span style={{ color: "#94a3b8", fontFamily: "'JetBrains Mono', monospace" }}>{fmtFull(sgaLimit)}/mo</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginTop: 2 }}>
                <span style={{ color: "#64748b" }}>Annual:</span>
                <span style={{ color: "#38bdf8", fontFamily: "'JetBrains Mono', monospace" }}>{fmtFull(chadConsulting * 12)}/yr</span>
              </div>
              {chadConsulting > 0 && (
                <div style={{ fontSize: 10, color: "#475569", marginTop: 4, fontStyle: "italic" }}>
                  Starts after SSDI approval. Stay under SGA to protect benefits.
                </div>
              )}
            </div>

            <div style={{ marginTop: 12, padding: "10px 12px", background: "#0f172a", borderRadius: 8, border: "1px solid #334155" }}>
              <h4 style={{ fontSize: 11, color: "#a78bfa", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Trust Income (Guaranteed)</h4>
              <Slider label="Current monthly" value={trustIncomeNow} onChange={set('trustIncomeNow')} min={0} max={3000} step={50} color="#a78bfa" />
              <Slider label="After increase" value={trustIncomeFuture} onChange={set('trustIncomeFuture')} min={0} max={5000} step={50} color="#a78bfa" />
              <Slider label="Increase at month" value={trustIncreaseMonth} onChange={set('trustIncreaseMonth')} min={3} max={24} format={(v) => v + " mo"} color="#a78bfa" />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginTop: 4, color: "#64748b" }}>
                <span>Annual: {fmtFull(trustIncomeNow * 12)} → {fmtFull(trustIncomeFuture * 12)}</span>
              </div>
            </div>

            <div style={{ marginTop: 12, padding: "10px 12px", background: "#0f172a", borderRadius: 8, border: "1px solid #334155" }}>
              <h4 style={{ fontSize: 11, color: "#94a3b8", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Van Sale</h4>
              <Toggle label={`Van sold (saves ${fmtFull(vanMonthlySavings)}/mo)`} checked={vanSold} onChange={set('vanSold')} color="#4ade80" />
              {!vanSold && (
                <Slider label="Van monthly cost" value={vanMonthlySavings} onChange={set('vanMonthlySavings')} min={1500} max={4000} step={50} color="#f87171" />
              )}
            </div>

            <div style={{ marginTop: 12, padding: "10px 12px", background: "#0f172a", borderRadius: 8, border: "1px solid #334155" }}>
              <h4 style={{ fontSize: 11, color: "#c084fc", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Farm LLC Income</h4>
              <Slider label="Current annual ($10K/yr)" value={llcAnnual} onChange={set('llcAnnual')} min={5000} max={20000} step={500} color="#c084fc" />
              <div style={{ opacity: llcImproves ? 1 : 0.4 }}>
                <Slider label="Post-1031 multiplier" value={llcMultiplier} onChange={set('llcMultiplier')} min={1.5} max={3.5} step={0.1} format={(v) => v.toFixed(1) + "x"} color={llcImproves ? "#c084fc" : "#334155"} />
                <Slider label="1031 exchange completes" value={llcDelayMonths} onChange={set('llcDelayMonths')} min={6} max={36} format={(v) => v + " mo"} color={llcImproves ? "#c084fc" : "#334155"} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 6, paddingTop: 6, borderTop: "1px solid #334155" }}>
                <span style={{ color: "#64748b" }}>Current monthly:</span>
                <span style={{ color: "#c084fc", fontFamily: "'JetBrains Mono', monospace" }}>{fmtFull(Math.round(llcAnnual / 12))}</span>
              </div>
              {llcImproves && (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 2 }}>
                    <span style={{ color: "#64748b" }}>Post-1031 monthly:</span>
                    <span style={{ color: "#4ade80", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{fmtFull(Math.round(llcAnnual * llcMultiplier / 12))}</span>
                  </div>
                  <div style={{ fontSize: 10, color: "#64748b", marginTop: 4, fontStyle: "italic" }}>
                    Improvement kicks in at month {llcDelayMonths} ({Math.round(llcDelayMonths / 12 * 10) / 10} yrs)
                  </div>
                </>
              )}
              {!llcImproves && (
                <div style={{ fontSize: 10, color: "#475569", marginTop: 4, fontStyle: "italic" }}>
                  Enable "Farm LLC income increases" toggle to model post-1031 increase
                </div>
              )}
            </div>

            <div style={{ marginTop: 12, padding: "10px 12px", background: "#0f172a", borderRadius: 8, border: "1px solid #334155" }}>
              <h4 style={{ fontSize: 11, color: "#4ade80", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>SSDI Back Pay (Lump Sum)</h4>
              <Slider label="Back pay months" value={ssdiBackPayMonths} onChange={set('ssdiBackPayMonths')} min={6} max={24} color="#4ade80" format={(v) => v + " mo"} />
              <Slider label="SSDI approval (months out)" value={ssdiApprovalMonth} onChange={set('ssdiApprovalMonth')} min={3} max={18} color="#4ade80" format={(v) => v + " mo"} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 6 }}>
                <span style={{ color: "#64748b" }}>Gross ({ssdiBackPayMonths} × {fmtFull(ssdiPersonal)}):</span>
                <span style={{ color: "#94a3b8", fontFamily: "'JetBrains Mono', monospace" }}>{fmtFull(ssdiBackPayGross)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 2 }}>
                <span style={{ color: "#64748b" }}>Attorney fee (25% cap):</span>
                <span style={{ color: "#f87171", fontFamily: "'JetBrains Mono', monospace" }}>-{fmtFull(ssdiAttorneyFee)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginTop: 4, paddingTop: 4, borderTop: "1px solid #334155", fontWeight: 700 }}>
                <span style={{ color: "#4ade80" }}>Net lump sum:</span>
                <span style={{ color: "#4ade80", fontFamily: "'JetBrains Mono', monospace" }}>{fmtFull(ssdiBackPayActual)}</span>
              </div>
            </div>
          </div>
  );
};

export default IncomeControls;
