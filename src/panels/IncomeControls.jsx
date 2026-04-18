import React, { memo } from "react";
import Slider from '../components/Slider.jsx';
import Toggle from '../components/Toggle.jsx';
import { fmtFull } from '../model/formatters.js';
import { SGA_LIMIT, ssAdjustmentFactor, TWINS_AGE_OUT_MONTH, SS_FRA, SS_START_OFFSET } from '../model/constants.js';
import { COLORS } from '../charts/chartUtils.js';
import { useRenderMetric } from '../testing/perfMetrics.js';

const IncomeControls = ({
  ssType,
  ssdiDenied,
  ssdiFamilyTotal, ssdiPersonal, kidsAgeOutMonths,
  ssdiApprovalMonth, ssdiBackPayMonths, ssdiBackPayGross, ssdiAttorneyFee, ssdiBackPayActual,
  ssClaimAge, ssPIA,
  ssFamilyTotal, ssPersonal, ssStartMonth, ssKidsAgeOutMonths,
  chadConsulting,
  chadJob, chadJobSalary, chadJobTaxRate, chadJobStartMonth, chadJobHealthSavings,
  chadJobNoFICA, chadJobPensionRate, chadJobPensionContrib,
  sarahWorkYears,
  trustIncomeNow, trustIncomeFuture, trustIncreaseMonth,
  vanSold, vanMonthlySavings, vanSalePrice, vanLoanBalance, vanSaleMonth,
  onFieldChange,
}) => {
  useRenderMetric('IncomeControls');
  const set = onFieldChange;
  const commitStrategy = 'release';
  const sgaLimit = SGA_LIMIT;
  const effectiveSalary = chadJobSalary || 80000;
  const effectiveTaxRate = chadJobTaxRate ?? 25;
  const effectiveHealthSavings = chadJobHealthSavings ?? 4200;
  const chadJobMonthlyNet = Math.round(effectiveSalary * (1 - effectiveTaxRate / 100) / 12);
  const ssEarningsLimit = 22320;
  const ssExcess = Math.max(0, effectiveSalary - ssEarningsLimit);
  const ssMonthlyReduction = Math.round(ssExcess / 2 / 12);

  return (
          <div data-testid="income-controls" style={{
            background: COLORS.bgCard, borderRadius: 12, padding: 20,
            border: `1px solid ${COLORS.border}`
          }}>
            <h3 style={{ fontSize: 14, color: COLORS.blue, margin: "0 0 12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Income Assumptions
            </h3>
            {/* SS Type Selector */}
            <div style={{ marginBottom: 12, padding: "10px 12px", background: COLORS.bgDeep, borderRadius: 8, border: `1px solid ${COLORS.border}` }}>
              <h4 style={{ fontSize: 11, color: COLORS.blue, margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Social Security Type</h4>
              <div style={{ display: "flex", gap: 8 }}>
                {[
                  { value: 'ssdi', label: 'SSDI (Disability)' },
                  { value: 'ss', label: 'SS Retirement' },
                ].map(opt => {
                  const disabled = chadJob && opt.value === 'ssdi';
                  return (
                  <button
                    key={opt.value}
                    onClick={() => !disabled && set('ssType')(opt.value)}
                    data-testid={`income-ss-type-${opt.value}`}
                    aria-label={`Choose ${opt.label}`}
                    style={{
                      flex: 1, padding: "8px 12px", borderRadius: 6, cursor: disabled ? "not-allowed" : "pointer",
                      fontSize: 12, fontWeight: 600, fontFamily: "'Inter', sans-serif",
                      border: ssType === opt.value ? `1px solid ${COLORS.blue}` : `1px solid ${COLORS.border}`,
                      background: ssType === opt.value ? "#1e3a5f" : COLORS.bgDeep,
                      color: disabled ? COLORS.borderLight : ssType === opt.value ? COLORS.blue : COLORS.textDim,
                      opacity: disabled ? 0.4 : 1,
                    }}
                  >
                    {opt.label}
                  </button>
                  );
                })}
              </div>
              <div style={{ fontSize: 10, color: COLORS.borderLight, marginTop: 6, fontStyle: "italic" }}>
                {chadJob
                  ? "SSDI not available while employed (SGA rules). SS retirement can coexist with a job — earnings test applies."
                  : "SSDI and SS retirement cannot be received at the same time."
                }
              </div>
            </div>

            {/* Chad Gets a Job */}
            <div style={{ marginBottom: 12, padding: "10px 12px", background: COLORS.bgDeep, borderRadius: 8, border: `1px solid ${chadJob ? `${COLORS.greenDark}33` : COLORS.border}` }}>
              <h4 style={{ fontSize: 11, color: COLORS.greenDark, margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Chad Gets a Job</h4>
              <Toggle
                label="Chad employed (W-2 income)"
                description="Use this instead of the SSDI/SS plus consulting path."
                checked={chadJob}
                onChange={set('chadJob')}
                color={COLORS.greenDark}
                testId="income-chad-job"
              />
              {chadJob && (
                <>
                  <Slider label="Gross annual salary" value={chadJobSalary} onChange={set('chadJobSalary')} commitStrategy={commitStrategy} min={30000} max={150000} step={5000} color={COLORS.greenDark} format={(v) => "$" + (v/1000).toFixed(0) + "K"} />
                  <Slider label="Effective tax rate" value={chadJobTaxRate} onChange={set('chadJobTaxRate')} commitStrategy={commitStrategy} min={10} max={40} color={COLORS.greenDark} format={(v) => v + "%"} />
                  <Slider label="Start month" value={chadJobStartMonth} onChange={set('chadJobStartMonth')} commitStrategy={commitStrategy} min={0} max={24} color={COLORS.greenDark} format={(v) => v === 0 ? "Now" : v + " mo"} />

                  {/* Employer Retirement & Tax */}
                  <div style={{ marginTop: 8, padding: "8px 10px", background: COLORS.bgDeep, borderRadius: 6, border: `1px solid ${COLORS.border}` }}>
                    <div style={{ fontSize: 10, color: COLORS.amber, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>Employer Retirement & Tax</div>
                    <Toggle
                      label="No Social Security tax (non-SS employer)"
                      description={chadJobNoFICA ? `Saves $${Math.round(chadJobSalary * 0.062 / 12).toLocaleString()}/mo — lower your effective tax rate accordingly` : "Most employers withhold 6.2% for SS"}
                      checked={chadJobNoFICA}
                      onChange={set('chadJobNoFICA')}
                      color={COLORS.amber}
                      testId="income-no-fica"
                    />
                    <Slider label="Pension accrual rate (%/yr)" value={chadJobPensionRate} onChange={set('chadJobPensionRate')} commitStrategy={commitStrategy} min={0} max={5} step={0.5} color={COLORS.amber} format={(v) => v === 0 ? "None" : v + "%"} />
                    {chadJobPensionRate > 0 && (
                      <>
                        <Slider label="Employee pension contribution (%)" value={chadJobPensionContrib} onChange={set('chadJobPensionContrib')} commitStrategy={commitStrategy} min={0} max={15} step={0.1} color={COLORS.amber} format={(v) => v.toFixed(1) + "%"} />
                        {(() => {
                          const projMonths = Math.max(0, ((sarahWorkYears || 6) * 12) - (chadJobStartMonth || 0));
                          const yrs = projMonths / 12;
                          const pensionMo = Math.round((chadJobSalary / 12) * (chadJobPensionRate / 100) * yrs);
                          return (
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 4, paddingTop: 4, borderTop: `1px solid ${COLORS.border}` }}>
                              <span style={{ color: COLORS.textDim }}>Est. pension at retirement:</span>
                              <span style={{ color: COLORS.amber, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>+{fmtFull(pensionMo)}/mo</span>
                            </div>
                          );
                        })()}
                        <div style={{ fontSize: 10, color: COLORS.textDim, marginTop: 2 }}>
                          {chadJobPensionRate}% × {((((sarahWorkYears || 6) * 12) - (chadJobStartMonth || 0)) / 12).toFixed(1)} yrs, +3%/yr COLA
                        </div>
                      </>
                    )}
                  </div>

                  {(() => {
                    const isSSPath = ssType === 'ss';
                    const familyRate = isSSPath ? (ssFamilyTotal || 7099) : (ssdiFamilyTotal || 6500);
                    const personalRate = isSSPath ? (ssPersonal || 2933) : (ssdiPersonal || 4152);
                    const familyMonths = isSSPath ? (ssKidsAgeOutMonths || 18) : (kidsAgeOutMonths || 36);
                    const lostBackPayMonthly = !isSSPath && !ssdiDenied ? Math.round((ssdiBackPayActual || 0) / 72) : 0;
                    // Net impact uses personal (long-term) rate since family rate is temporary
                    const netImpactSteady = chadJobMonthlyNet + effectiveHealthSavings - personalRate;
                    const netColorSteady = netImpactSteady >= 0 ? COLORS.greenDark : COLORS.amber;
                    const netImpactFamily = chadJobMonthlyNet + effectiveHealthSavings - familyRate;
                    const netColorFamily = netImpactFamily >= 0 ? COLORS.greenDark : COLORS.red;
                    const label = isSSPath ? 'SS' : 'SSDI';
                    return (
                    <div style={{ marginTop: 6, paddingTop: 6, borderTop: `1px solid ${COLORS.border}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                        <span style={{ color: COLORS.textDim }}>Monthly after tax:</span>
                        <span style={{ color: COLORS.greenDark, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>+{fmtFull(chadJobMonthlyNet)}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 2 }}>
                        <span style={{ color: COLORS.textDim }}>Health insurance saved:</span>
                        <span style={{ color: COLORS.green, fontFamily: "'JetBrains Mono', monospace" }}>+{fmtFull(effectiveHealthSavings)}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 6, paddingTop: 4, borderTop: `1px solid ${COLORS.bgCard}` }}>
                        <span style={{ color: COLORS.textDim }}>Lost {label} ({familyMonths} mo w/ twins):</span>
                        <span style={{ color: COLORS.red, fontFamily: "'JetBrains Mono', monospace" }}>-{fmtFull(familyRate)}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 2 }}>
                        <span style={{ color: COLORS.textDim }}>Lost {label} (after twins age out):</span>
                        <span style={{ color: COLORS.red, fontFamily: "'JetBrains Mono', monospace" }}>-{fmtFull(personalRate)}</span>
                      </div>
                      {lostBackPayMonthly > 0 && (
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginTop: 2 }}>
                          <span style={{ color: COLORS.textDim }}>Lost SSDI back pay (net of fee, amortized over 6yr):</span>
                          <span style={{ color: COLORS.red, fontFamily: "'JetBrains Mono', monospace" }}>-{fmtFull(lostBackPayMonthly)}</span>
                        </div>
                      )}
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 4, paddingTop: 4, borderTop: `1px solid ${COLORS.border}`, fontWeight: 600 }}>
                        <span style={{ color: netColorFamily }}>Net vs {label} (first {familyMonths} mo):</span>
                        <span style={{ color: netColorFamily, fontFamily: "'JetBrains Mono', monospace" }}>{netImpactFamily >= 0 ? '+' : ''}{fmtFull(netImpactFamily)}/mo</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginTop: 2, fontWeight: 700 }}>
                        <span style={{ color: netColorSteady }}>Net vs {label} (steady state):</span>
                        <span style={{ color: netColorSteady, fontFamily: "'JetBrains Mono', monospace" }}>{netImpactSteady >= 0 ? '+' : ''}{fmtFull(netImpactSteady)}/mo</span>
                      </div>
                    </div>
                    );
                  })()}
                  <div style={{ marginTop: 8, fontSize: 10, color: COLORS.textDim, fontStyle: "italic", lineHeight: 1.5 }}>
                    {ssType === 'ss'
                      ? "SS retirement income can coexist with employment — earnings test reduces benefits based on salary. Consulting disabled while employed."
                      : "SSDI income and consulting are excluded while employed. Switch to SS Retirement to model claiming while working."
                    }
                  </div>
                </>
              )}
            </div>

            {ssType === 'ssdi' && !chadJob && (
              <>
                <div style={{ marginBottom: 8 }}>
                  <Toggle
                    label="SSDI Denied (model worst case)"
                    description="Zero the SSDI path and test the fallback case."
                    checked={ssdiDenied}
                    onChange={set('ssdiDenied')}
                    color={COLORS.red}
                    testId="income-ssdi-denied"
                  />
                  {ssdiDenied && (
                    <div style={{ fontSize: 10, color: COLORS.red, marginLeft: 54, marginTop: -2, marginBottom: 4, fontStyle: "italic" }}>
                      All SSDI income zeroed. Back pay zeroed. Consulting disabled.
                    </div>
                  )}
                </div>
                <div style={{ opacity: ssdiDenied ? 0.3 : 1, pointerEvents: ssdiDenied ? 'none' : 'auto' }}>
                  <Slider label="SSDI family total/mo" value={ssdiFamilyTotal} onChange={set('ssdiFamilyTotal')} commitStrategy={commitStrategy} min={4000} max={7000} step={100} />
                  <Slider label="SSDI personal (post kids)" value={ssdiPersonal} onChange={set('ssdiPersonal')} commitStrategy={commitStrategy} min={3000} max={4500} step={50} />
                  <Slider label="Kids age out (months)" value={kidsAgeOutMonths} onChange={set('kidsAgeOutMonths')} commitStrategy={commitStrategy} min={24} max={48} />
                </div>

                <div style={{ marginTop: 12, padding: "10px 12px", background: COLORS.bgDeep, borderRadius: 8, border: `1px solid ${COLORS.border}` }}>
                  <h4 style={{ fontSize: 11, color: COLORS.blueLight, margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Chad Consulting (Post-SSDI)</h4>
                  <Slider
                    label="Monthly consulting income"
                    value={chadConsulting}
                    onChange={set('chadConsulting')}
                    commitStrategy={commitStrategy}
                    min={0}
                    max={sgaLimit}
                    step={100}
                    color={COLORS.blueLight}
                    disabled={ssdiDenied}
                    disabledReason="Disabled while SSDI is denied."
                    helperText="Starts after SSDI approval. Stay under SGA to protect benefits."
                  />
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginTop: 4 }}>
                    <span style={{ color: COLORS.textDim }}>SGA limit (2026):</span>
                    <span style={{ color: COLORS.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>{fmtFull(sgaLimit)}/mo</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginTop: 2 }}>
                    <span style={{ color: COLORS.textDim }}>Annual:</span>
                    <span style={{ color: COLORS.blueLight, fontFamily: "'JetBrains Mono', monospace" }}>{fmtFull(chadConsulting * 12)}/yr</span>
                  </div>
                </div>
              </>
            )}

            {ssType === 'ss' && (() => {
              const pia = ssPIA || 4214;
              const age = ssClaimAge || 67;
              const factor = ssAdjustmentFactor(age);
              const computedPersonal = Math.round(pia * factor);
              const computedStartMonth = (age - 62) * 12 + SS_START_OFFSET;
              const computedKidsMonths = Math.max(0, TWINS_AGE_OUT_MONTH - computedStartMonth);
              const childBenefitEach = Math.round(pia * 0.5);
              const computedFamily = computedKidsMonths > 0 ? computedPersonal + 2 * childBenefitEach : computedPersonal;
              const projMonths = ((sarahWorkYears || 6) * 12);
              const beyondHorizon = computedStartMonth > projMonths;
              const ageLabel = age === SS_FRA ? `${age} (FRA)` : `${age}`;
              const atOrAfterFRA = age >= SS_FRA;
              return (
              <div style={{ padding: "10px 12px", background: COLORS.bgDeep, borderRadius: 8, border: `1px solid ${COLORS.border}`, marginBottom: 12 }}>
                <h4 style={{ fontSize: 11, color: COLORS.green, margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>SS Retirement</h4>
                <Slider
                  label="Claim SS at age"
                  value={age}
                  onChange={set('ssClaimAge')}
                  commitStrategy={commitStrategy}
                  min={62} max={70} step={1}
                  color={COLORS.green}
                  format={(v) => v === SS_FRA ? `${v} (FRA)` : `${v}`}
                />
                <Slider
                  label="Your PIA (benefit at FRA)"
                  value={pia}
                  onChange={set('ssPIA')}
                  commitStrategy={commitStrategy}
                  min={1000} max={5000} step={10}
                  color={COLORS.green}
                />

                <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${COLORS.border}` }}>
                  <div style={{ fontSize: 11, color: COLORS.textDim, marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.03em" }}>
                    Computed Benefits (age {ageLabel})
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                    <span style={{ color: COLORS.textDim }}>Your monthly benefit:</span>
                    <span style={{ color: COLORS.green, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{fmtFull(computedPersonal)}/mo</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginTop: 2 }}>
                    <span style={{ color: COLORS.textDim }}>Adjustment: {(factor * 100).toFixed(1)}% of PIA</span>
                    <span style={{ color: COLORS.textDim }}>{age < SS_FRA ? `(${SS_FRA - age}yr early)` : age > SS_FRA ? `(${age - SS_FRA}yr delayed)` : '(full benefit)'}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 4 }}>
                    <span style={{ color: COLORS.textDim }}>SS starts at month:</span>
                    <span style={{ color: COLORS.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>{computedStartMonth}</span>
                  </div>
                  {computedKidsMonths > 0 && (
                    <>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 6, paddingTop: 4, borderTop: `1px solid ${COLORS.bgCard}` }}>
                        <span style={{ color: COLORS.textDim }}>Family total (first {computedKidsMonths} mo):</span>
                        <span style={{ color: COLORS.green, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{fmtFull(computedFamily)}/mo</span>
                      </div>
                      <div style={{ fontSize: 11, color: COLORS.textDim, marginTop: 2 }}>
                        Twins: {fmtFull(childBenefitEach)} each (50% of PIA) while under 18
                      </div>
                    </>
                  )}
                  {computedKidsMonths === 0 && (
                    <div style={{ fontSize: 11, color: COLORS.textDim, marginTop: 4, fontStyle: "italic" }}>
                      Twins already 18 at claim age {age} — no family benefit.
                    </div>
                  )}
                </div>

                {beyondHorizon && (
                  <div style={{ marginTop: 8, padding: "6px 8px", background: `${COLORS.amber}15`, borderRadius: 6, border: `1px solid ${COLORS.amber}33`, fontSize: 11, color: COLORS.amber }}>
                    SS starts at month {computedStartMonth} but projection is {projMonths} months. Extend Sarah Work Years to see SS impact.
                  </div>
                )}

                <div style={{ fontSize: 10, color: COLORS.borderLight, marginTop: 8, fontStyle: "italic" }}>
                  {atOrAfterFRA
                    ? "Claiming at or after FRA — no earnings test applies. No back pay. No SGA limit."
                    : `Claiming ${SS_FRA - age}yr before FRA — earnings test applies until age ${SS_FRA}. Benefits reduced $1 for every $2 earned over $22,320/yr ($62,160/yr in FRA year).`
                  }
                </div>

                {chadJob && !atOrAfterFRA && (() => {
                  const salary = chadJobSalary || 80000;
                  const excess = Math.max(0, salary - 22320);
                  const monthlyReduction = Math.round(excess / 2 / 12);
                  const netSS = Math.max(0, computedPersonal - monthlyReduction);
                  return (
                  <div style={{ marginTop: 12, padding: "8px 10px", background: `${COLORS.amber}10`, borderRadius: 6, border: `1px solid ${COLORS.amber}33` }}>
                    <div style={{ fontSize: 11, color: COLORS.amber, fontWeight: 600, marginBottom: 4 }}>Earnings Test Impact (salary ${fmtFull(salary)}/yr)</div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                      <span style={{ color: COLORS.textDim }}>Gross SS benefit:</span>
                      <span style={{ color: COLORS.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>{fmtFull(computedPersonal)}/mo</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 2 }}>
                      <span style={{ color: COLORS.textDim }}>Earnings test reduction:</span>
                      <span style={{ color: COLORS.red, fontFamily: "'JetBrains Mono', monospace" }}>-{fmtFull(monthlyReduction)}/mo</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginTop: 4, paddingTop: 4, borderTop: `1px solid ${COLORS.border}`, fontWeight: 700 }}>
                      <span style={{ color: netSS > 0 ? COLORS.green : COLORS.red }}>Net SS after test:</span>
                      <span style={{ color: netSS > 0 ? COLORS.green : COLORS.red, fontFamily: "'JetBrains Mono', monospace" }}>{fmtFull(netSS)}/mo</span>
                    </div>
                    {netSS === 0 && (
                      <div style={{ fontSize: 10, color: COLORS.textDim, marginTop: 4, fontStyle: "italic" }}>
                        Benefits fully withheld — but SSA recalculates at FRA to credit withheld months.
                      </div>
                    )}
                  </div>
                  );
                })()}

                {!chadJob && (
                <div style={{ marginTop: 12 }}>
                  <h4 style={{ fontSize: 11, color: COLORS.blueLight, margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Chad Consulting (Post-SS)</h4>
                  <Slider label="Monthly consulting income" value={chadConsulting} onChange={set('chadConsulting')} commitStrategy={commitStrategy} min={0} max={5000} step={100} color={COLORS.blueLight} />
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginTop: 2 }}>
                    <span style={{ color: COLORS.textDim }}>Annual:</span>
                    <span style={{ color: COLORS.blueLight, fontFamily: "'JetBrains Mono', monospace" }}>{fmtFull(chadConsulting * 12)}/yr</span>
                  </div>
                  {!atOrAfterFRA && (
                    <div style={{ fontSize: 10, color: COLORS.borderLight, marginTop: 4, fontStyle: "italic" }}>
                      SS earnings test: benefits reduced $1 for every $2 earned over $22,320/yr before FRA.
                    </div>
                  )}
                </div>
                )}
              </div>
              );
            })()}

            <div style={{ marginTop: 12, padding: "10px 12px", background: COLORS.bgDeep, borderRadius: 8, border: `1px solid ${COLORS.border}` }}>
              <h4 style={{ fontSize: 11, color: COLORS.purple, margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Trust / LLC Income</h4>
              <Slider label="Current monthly" value={trustIncomeNow} onChange={set('trustIncomeNow')} commitStrategy={commitStrategy} min={0} max={3000} step={50} color={COLORS.purple} />
              <Slider label="After increase" value={trustIncomeFuture} onChange={set('trustIncomeFuture')} commitStrategy={commitStrategy} min={0} max={5000} step={50} color={COLORS.purple} />
              <Slider label="Increase at month" value={trustIncreaseMonth} onChange={set('trustIncreaseMonth')} commitStrategy={commitStrategy} min={3} max={24} format={(v) => v + " mo"} color={COLORS.purple} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginTop: 4, color: COLORS.textDim }}>
                <span>Annual: {fmtFull(trustIncomeNow * 12)} → {fmtFull(trustIncomeFuture * 12)}</span>
              </div>
            </div>

            {(() => {
              const effectiveSalePrice = vanSalePrice ?? 25000;
              const effectiveLoanBalance = vanLoanBalance ?? 200000;
              const vanShortfall = Math.max(0, effectiveLoanBalance - effectiveSalePrice);
              return (
            <div style={{ marginTop: 12, padding: "10px 12px", background: COLORS.bgDeep, borderRadius: 8, border: `1px solid ${vanSold ? `${COLORS.green}33` : COLORS.border}` }}>
              <h4 style={{ fontSize: 11, color: COLORS.textMuted, margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Van Sale</h4>
              <Toggle label="Sell the van" checked={vanSold} onChange={set('vanSold')} color={COLORS.green} testId="income-van-sold" />
              <Slider label="Monthly cost (loan + insurance + fuel)" value={vanMonthlySavings} onChange={set('vanMonthlySavings')} commitStrategy={commitStrategy} min={1500} max={4000} step={50} color={vanSold ? COLORS.green : COLORS.red} />
              {vanSold && (
                <>
                  <Slider label="Expected sale price" value={effectiveSalePrice} onChange={set('vanSalePrice')} commitStrategy={commitStrategy} min={0} max={effectiveLoanBalance} step={1000} color={COLORS.blue} />
                  <Slider label="Loan balance owed" value={effectiveLoanBalance} onChange={set('vanLoanBalance')} commitStrategy={commitStrategy} min={100000} max={300000} step={5000} color={COLORS.red} />
                  <Slider label="Sell at month" value={vanSaleMonth ?? 6} onChange={set('vanSaleMonth')} commitStrategy={commitStrategy} min={1} max={48} format={(v) => v + " mo"} color={COLORS.textMuted} />
                  <div style={{ marginTop: 6, paddingTop: 6, borderTop: `1px solid ${COLORS.border}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                      <span style={{ color: COLORS.textDim }}>Shortfall (owe - sale):</span>
                      <span style={{ color: vanShortfall > 0 ? COLORS.red : COLORS.green, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
                        {vanShortfall > 0 ? `-${fmtFull(vanShortfall)}` : "$0"}
                      </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 2 }}>
                      <span style={{ color: COLORS.textDim }}>Monthly savings after sale:</span>
                      <span style={{ color: COLORS.green, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>+{fmtFull(vanMonthlySavings)}/mo</span>
                    </div>
                    <div style={{ fontSize: 10, color: COLORS.borderLight, marginTop: 4, fontStyle: "italic" }}>
                      One-time {fmtFull(vanShortfall)} hit to savings at month {vanSaleMonth ?? 6}, then {fmtFull(vanMonthlySavings)}/mo freed up.
                    </div>
                  </div>
                </>
              )}
            </div>
              );
            })()}

            {ssType === 'ssdi' && !chadJob && (
            <div style={{ marginTop: 12, padding: "10px 12px", background: COLORS.bgDeep, borderRadius: 8, border: `1px solid ${COLORS.border}` }}>
              <h4 style={{ fontSize: 11, color: COLORS.green, margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>SSDI Back Pay (Lump Sum)</h4>
              <Slider label="Back pay months" value={ssdiBackPayMonths} onChange={set('ssdiBackPayMonths')} commitStrategy={commitStrategy} min={6} max={24} color={COLORS.green} format={(v) => v + " mo"} />
              <Slider label="SSDI approval (months out)" value={ssdiApprovalMonth} onChange={set('ssdiApprovalMonth')} commitStrategy={commitStrategy} min={3} max={18} color={COLORS.green} format={(v) => v + " mo"} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 6 }}>
                <span style={{ color: COLORS.textDim }}>Gross ({ssdiBackPayMonths} × {fmtFull(ssdiPersonal)}):</span>
                <span style={{ color: COLORS.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>{fmtFull(ssdiBackPayGross)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 2 }}>
                <span style={{ color: COLORS.textDim }}>Attorney fee (25% cap):</span>
                <span style={{ color: COLORS.red, fontFamily: "'JetBrains Mono', monospace" }}>-{fmtFull(ssdiAttorneyFee)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginTop: 4, paddingTop: 4, borderTop: `1px solid ${COLORS.border}`, fontWeight: 700 }}>
                <span style={{ color: COLORS.green }}>Net lump sum:</span>
                <span style={{ color: COLORS.green, fontFamily: "'JetBrains Mono', monospace" }}>{fmtFull(ssdiBackPayActual)}</span>
              </div>
            </div>
            )}
          </div>
  );
};

export default memo(IncomeControls);
