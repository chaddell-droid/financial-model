import React from "react";
import Slider from '../components/Slider.jsx';
import Toggle from '../components/Toggle.jsx';
import { fmtFull } from '../model/formatters.js';
import { SGA_LIMIT } from '../model/constants.js';

const IncomeControls = ({
  sarahRate, sarahMaxRate, sarahRateGrowth,
  sarahCurrentClients, sarahMaxClients, sarahClientGrowth,
  sarahCurrentNet, sarahCeiling,
  ssType,
  ssdiDenied,
  ssdiFamilyTotal, ssdiPersonal, kidsAgeOutMonths,
  ssdiApprovalMonth, ssdiBackPayMonths, ssdiBackPayGross, ssdiAttorneyFee, ssdiBackPayActual,
  ssFamilyTotal, ssPersonal, ssStartMonth, ssKidsAgeOutMonths,
  chadConsulting,
  chadJob, chadJobSalary, chadJobTaxRate, chadJobStartMonth, chadJobHealthSavings,
  trustIncomeNow, trustIncomeFuture, trustIncreaseMonth,
  vanSold, vanMonthlySavings,
  onFieldChange,
}) => {
  const set = onFieldChange;
  const sgaLimit = SGA_LIMIT;
  const chadJobMonthlyNet = Math.round(chadJobSalary * (1 - chadJobTaxRate / 100) / 12);
  const ssEarningsLimit = 22320;
  const ssExcess = Math.max(0, chadJobSalary - ssEarningsLimit);
  const ssMonthlyReduction = Math.round(ssExcess / 2 / 12);

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
            {/* SS Type Selector */}
            <div style={{ marginBottom: 12, padding: "10px 12px", background: "#0f172a", borderRadius: 8, border: "1px solid #334155" }}>
              <h4 style={{ fontSize: 11, color: "#60a5fa", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Social Security Type</h4>
              <div style={{ display: "flex", gap: 8 }}>
                {[
                  { value: 'ssdi', label: 'SSDI (Disability)' },
                  { value: 'ss', label: 'SS at 62 (Retirement)' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => set('ssType')(opt.value)}
                    style={{
                      flex: 1, padding: "8px 12px", borderRadius: 6, cursor: "pointer",
                      fontSize: 12, fontWeight: 600, fontFamily: "'Inter', sans-serif",
                      border: ssType === opt.value ? "1px solid #60a5fa" : "1px solid #334155",
                      background: ssType === opt.value ? "#1e3a5f" : "#0f172a",
                      color: ssType === opt.value ? "#60a5fa" : "#64748b",
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 10, color: "#475569", marginTop: 6, fontStyle: "italic" }}>
                SSDI and SS retirement cannot be received at the same time.
              </div>
            </div>

            {/* Chad Gets a Job */}
            <div style={{ marginBottom: 12, padding: "10px 12px", background: "#0f172a", borderRadius: 8, border: `1px solid ${chadJob ? "#22c55e33" : "#334155"}` }}>
              <h4 style={{ fontSize: 11, color: "#22c55e", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Chad Gets a Job</h4>
              <Toggle label="Chad employed (W-2 income)" checked={chadJob} onChange={set('chadJob')} color="#22c55e" />
              {chadJob && (
                <>
                  <Slider label="Gross annual salary" value={chadJobSalary} onChange={set('chadJobSalary')} min={30000} max={150000} step={5000} color="#22c55e" format={(v) => "$" + (v/1000).toFixed(0) + "K"} />
                  <Slider label="Effective tax rate" value={chadJobTaxRate} onChange={set('chadJobTaxRate')} min={10} max={40} color="#22c55e" format={(v) => v + "%"} />
                  <Slider label="Start month" value={chadJobStartMonth} onChange={set('chadJobStartMonth')} min={0} max={24} color="#22c55e" format={(v) => v === 0 ? "Now" : v + " mo"} />
                  <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid #334155" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                      <span style={{ color: "#64748b" }}>Monthly gross:</span>
                      <span style={{ color: "#94a3b8", fontFamily: "'JetBrains Mono', monospace" }}>{fmtFull(Math.round(chadJobSalary / 12))}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 2 }}>
                      <span style={{ color: "#64748b" }}>Monthly after tax:</span>
                      <span style={{ color: "#22c55e", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{fmtFull(chadJobMonthlyNet)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 2 }}>
                      <span style={{ color: "#64748b" }}>Health insurance saved:</span>
                      <span style={{ color: "#4ade80", fontFamily: "'JetBrains Mono', monospace" }}>+{fmtFull(chadJobHealthSavings)}/mo</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginTop: 4, paddingTop: 4, borderTop: "1px solid #334155", fontWeight: 700 }}>
                      <span style={{ color: "#22c55e" }}>Total monthly impact:</span>
                      <span style={{ color: "#22c55e", fontFamily: "'JetBrains Mono', monospace" }}>+{fmtFull(chadJobMonthlyNet + chadJobHealthSavings)}</span>
                    </div>
                  </div>
                  {ssType === 'ss' && (
                    <div style={{ marginTop: 8, padding: "8px 10px", background: "#1e293b", borderRadius: 6, border: "1px solid #f59e0b33" }}>
                      <div style={{ fontSize: 10, color: "#f59e0b", fontWeight: 600, marginBottom: 4 }}>SS EARNINGS TEST</div>
                      <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.5 }}>
                        Before age 67, SS is reduced by $1 per $2 earned above {fmtFull(ssEarningsLimit)}/yr.
                        At {fmtFull(chadJobSalary)}/yr salary, SS reduced by <span style={{ color: "#f59e0b", fontWeight: 600 }}>{fmtFull(ssMonthlyReduction)}/mo</span>.
                        {ssMonthlyReduction >= ssPersonal
                          ? <span style={{ color: "#f87171" }}> SS benefit fully offset while working.</span>
                          : <span> Effective SS: <span style={{ fontWeight: 600, color: "#4ade80" }}>{fmtFull(Math.max(0, ssPersonal - ssMonthlyReduction))}/mo</span> (personal).</span>
                        }
                      </div>
                    </div>
                  )}
                  {ssType === 'ssdi' && (
                    <div style={{ marginTop: 8, padding: "8px 10px", background: "#1e293b", borderRadius: 6, border: "1px solid #f8717133" }}>
                      <div style={{ fontSize: 10, color: "#f87171", fontWeight: 600, marginBottom: 4 }}>SSDI DISQUALIFIED</div>
                      <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.5 }}>
                        Full-time employment exceeds the SGA limit ({fmtFull(sgaLimit)}/mo). SSDI benefits are zeroed while Chad is employed. Consulting income is also replaced by job income.
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {ssType === 'ssdi' && (
              <>
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
              </>
            )}

            {ssType === 'ss' && (
              <div style={{ padding: "10px 12px", background: "#0f172a", borderRadius: 8, border: "1px solid #334155", marginBottom: 12 }}>
                <h4 style={{ fontSize: 11, color: "#4ade80", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>SS Retirement at 62</h4>
                <Slider label="Family total/mo (you + twins)" value={ssFamilyTotal} onChange={set('ssFamilyTotal')} min={4000} max={9000} step={50} color="#4ade80" />
                <Slider label="Personal/mo (after twins age out)" value={ssPersonal} onChange={set('ssPersonal')} min={1500} max={4000} step={50} color="#4ade80" />
                <Slider label="Twins age out (months after SS)" value={ssKidsAgeOutMonths} onChange={set('ssKidsAgeOutMonths')} min={6} max={36} color="#4ade80" format={(v) => v + " mo"} />
                <Slider label="SS starts (months out)" value={ssStartMonth} onChange={set('ssStartMonth')} min={1} max={36} color="#4ade80" format={(v) => v + " mo"} />
                <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid #334155" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                    <span style={{ color: "#64748b" }}>Stage 1 (twins eligible):</span>
                    <span style={{ color: "#4ade80", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{fmtFull(ssFamilyTotal)}/mo</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 2 }}>
                    <span style={{ color: "#64748b" }}>Stage 2 (you only):</span>
                    <span style={{ color: "#94a3b8", fontFamily: "'JetBrains Mono', monospace" }}>{fmtFull(ssPersonal)}/mo</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginTop: 4, color: "#64748b" }}>
                    <span>Twins: $2,083 each (50% of PIA)</span>
                  </div>
                </div>
                <div style={{ fontSize: 10, color: "#475569", marginTop: 6, fontStyle: "italic" }}>
                  SS retirement begins at age 62 and continues for life. Twins eligible as minor children until 18. No back pay. No SGA earnings limit.
                </div>

                <div style={{ marginTop: 12 }}>
                  <h4 style={{ fontSize: 11, color: "#38bdf8", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Chad Consulting (Post-SS)</h4>
                  <Slider label="Monthly consulting income" value={chadConsulting} onChange={set('chadConsulting')} min={0} max={5000} step={100} color="#38bdf8" />
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginTop: 2 }}>
                    <span style={{ color: "#64748b" }}>Annual:</span>
                    <span style={{ color: "#38bdf8", fontFamily: "'JetBrains Mono', monospace" }}>{fmtFull(chadConsulting * 12)}/yr</span>
                  </div>
                  <div style={{ fontSize: 10, color: "#475569", marginTop: 4, fontStyle: "italic" }}>
                    No SGA limit with SS retirement. Earnings are unrestricted.
                  </div>
                </div>
              </div>
            )}

            <div style={{ marginTop: 12, padding: "10px 12px", background: "#0f172a", borderRadius: 8, border: "1px solid #334155" }}>
              <h4 style={{ fontSize: 11, color: "#c084fc", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Trust / LLC Income</h4>
              <Slider label="Current monthly" value={trustIncomeNow} onChange={set('trustIncomeNow')} min={0} max={3000} step={50} color="#c084fc" />
              <Slider label="After increase" value={trustIncomeFuture} onChange={set('trustIncomeFuture')} min={0} max={5000} step={50} color="#c084fc" />
              <Slider label="Increase at month" value={trustIncreaseMonth} onChange={set('trustIncreaseMonth')} min={3} max={24} format={(v) => v + " mo"} color="#c084fc" />
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

            {ssType === 'ssdi' && (
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
            )}
          </div>
  );
};

export default IncomeControls;
