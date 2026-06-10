import React, { memo } from "react";
import Slider from '../components/Slider.jsx';
import Toggle from '../components/Toggle.jsx';
import { fmtFull } from '../model/formatters.js';
import { SGA_LIMIT, ssAdjustmentFactor, TWINS_AGE_OUT_MONTH, SS_FRA, SS_START_OFFSET } from '../model/constants.js';
import { getMonthLabel } from '../model/checkIn.js';
import { COLORS } from '../charts/chartUtils.js';
import { useRenderMetric } from '../testing/perfMetrics.js';
import { levelAtMonthsWorked, age65VestEligibility, projectedPostRetirementVests, vestSchedule, computeChadPensionMonthly } from '../model/chadLevels.js';
import { computeW2Diagnostic } from '../model/w2Diagnostic.js';
import { SS_WAGE_BASE } from '../model/taxConstants.js';

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
  chadJobRaisePct, chadJobBonusPct, chadJobBonusMonth, chadJobBonusProrateFirst,
  chadJobStockRefresh, chadJobRefreshStartMonth, chadJobHireStockY1, chadJobHireStockY2, chadJobHireStockY3, chadJobHireStockY4,
  chadJobSignOnCash,
  chadJob401kEnabled, chadJob401kDeferral, chadJob401kCatchupRoth, chadJob401kMatch,
  chadCurrentAge, chadL64Enabled, chadL64Month, chadL64Salary, chadL64StockRefresh, chadL64BonusPct,
  chadL65Enabled, chadL65Month, chadL65Salary, chadL65StockRefresh, chadL65BonusPct, chadAge65VestOverride,
  msftPrice, msftGrowth,
  chadWorkMonths,
  postJobBenefit,
  trustIncomeNow, trustIncomeFuture, trustIncreaseMonth,
  vanSold, vanMonthlySavings, vanSalePrice, vanLoanBalance, vanSaleMonth,
  hideVan = false,
  hideTrust = false,
  hideStockComp = false,
  onFieldChange,
  chadTaxBreakdown,
}) => {
  useRenderMetric('IncomeControls');
  const set = onFieldChange;
  const commitStrategy = 'release';
  const sgaLimit = SGA_LIMIT;
  const effectiveSalary = chadJobSalary || 80000;
  const effectiveTaxRate = chadJobTaxRate ?? 25;
  const effectiveHealthSavings = chadJobHealthSavings ?? 4200;
  // Match projection.js formula: tax rate is all-in, FICA adds 6.2% back, pension is deducted
  const ficaSavings = chadJobNoFICA ? 0.062 : 0;
  const pensionContribPct = (chadJobPensionContrib || 0) / 100;
  // === W-2 component calculations — used by BOTH the W-2 diagnostic AND the SSDI comparison.
  // Single source of truth: src/model/w2Diagnostic.js (also consumed by advisor
  // `getStockCompProjection` tool). Mirrors src/model/projection.js exactly. Any
  // drift here is a display-parity bug (per CLAUDE.md). Edit w2Diagnostic.js, not here.
  const _w2 = computeW2Diagnostic({
    chadJob, chadJobSalary, chadJobTaxRate, chadJobHealthSavings, chadJobNoFICA,
    chadJobBonusPct, chadJobStockRefresh, chadJobRefreshStartMonth,
    chadJobHireStockY1, chadJobHireStockY2, chadJobHireStockY3, chadJobHireStockY4,
    chadJob401kEnabled, chadJob401kDeferral, chadJob401kCatchupRoth,
    chadJobPensionContrib, chadJobSignOnCash, msftGrowth,
  });
  const w2SalaryMult = _w2.salaryMult;
  const w2BonusMult = _w2.bonusMult;
  const w2PensionCashflowMult = _w2.pensionCashflowMult;
  const w2RefreshSteadyMult = _w2.refreshSteadyMult;
  const w2MonthlyGross = _w2.monthlyGross;
  const w2TaxableMo = _w2.taxableMo;
  const w2PensionDeductionMo = _w2.pensionDeductionMo;
  const w2PensionCashflowMo = _w2.pensionCashflowMo;
  const w2SalaryNetMo = _w2.salaryNetMo;
  const w2AnnualSalaryNet = _w2.annualSalaryNet;
  const w2BonusGrossYr = _w2.bonusGrossYr;
  const w2BonusNetYr = _w2.bonusNetYr;
  const w2HireY1 = _w2.chadJobHireStockY1;
  const w2HireY2 = _w2.chadJobHireStockY2;
  const w2HireY3 = _w2.chadJobHireStockY3;
  const w2HireY4 = _w2.chadJobHireStockY4;
  const w2HireTotalAtHire = _w2.hireTotalAtHire;
  const w2HireGrownTotal = _w2.hireGrownTotal;
  const w2HireNetAvgYr = _w2.hireNetAvgYr;
  const w2RefreshNetYr = _w2.refreshNetYrSteady;
  // Real FICA breakdown (computed by the tax engine on the W-2 gross — traceable).
  const w2FicaBaseAnnual = _w2.ficaBaseAnnual;
  const w2FicaSS = _w2.ficaSocialSecurity;
  const w2FicaMedicare = _w2.ficaMedicare;
  const w2FicaAddlMedicare = _w2.ficaAddlMedicare;
  const w2FicaAllInTotal = _w2.ficaAllInTotal;
  const w2FicaEffectivePct = _w2.ficaEffectivePct;
  const w2TotalAvgYr = _w2.totalAvgYr;
  const w2TotalAvgMo = _w2.totalAvgMo;
  const w2TotalGrossYr = _w2.totalGrossYr;
  const w2BlendedTakeHomePct = _w2.blendedTakeHomePct;
  const w2SignOnGross = _w2.signOnGross;
  const w2SignOnNet = _w2.signOnNet;
  // chadJobMonthlyNet preserved for legacy display callers.
  const chadJobMonthlyNet = w2SalaryNetMo;
  const monthlyHealthSavings = _w2.monthlyHealthSavings;
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
                  <Slider label="Gross annual salary" value={chadJobSalary} onChange={set('chadJobSalary')} commitStrategy={commitStrategy} min={30000} max={250000} step={5000} color={COLORS.greenDark} format={(v) => "$" + (v/1000).toFixed(0) + "K"} />
                  <Slider label="Annual raise" value={chadJobRaisePct} onChange={set('chadJobRaisePct')} commitStrategy={commitStrategy} min={0} max={5} step={0.25} color={COLORS.greenDark} format={(v) => v === 0 ? "None" : v.toFixed(2) + "%/yr"} />
                  <Slider label="Annual bonus (lump-sum)" value={chadJobBonusPct} onChange={set('chadJobBonusPct')} commitStrategy={commitStrategy} min={0} max={30} step={1} color={COLORS.greenDark} format={(v) => v === 0 ? "None" : v + "% of salary"} />
                  {chadJobBonusPct > 0 && (
                    <>
                      <Slider label="Bonus paid in" value={chadJobBonusMonth} onChange={set('chadJobBonusMonth')} commitStrategy={commitStrategy} min={0} max={11} step={1} color={COLORS.greenDark} format={(v) => ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][v]} />
                      <Toggle
                        label="Prorate bonus in first year"
                        description={chadJobBonusProrateFirst ? "First-year bonus = (months worked / 12) × full bonus (typical)" : "No bonus until 1 full year of employment"}
                        checked={chadJobBonusProrateFirst}
                        onChange={set('chadJobBonusProrateFirst')}
                        color={COLORS.greenDark}
                      />
                    </>
                  )}
                  <Slider label="Sign-on bonus (cash)" value={chadJobSignOnCash} onChange={set('chadJobSignOnCash')} commitStrategy={commitStrategy} min={0} max={200000} step={5000} color={COLORS.greenDark} format={(v) => v === 0 ? "None" : "$" + (v/1000).toFixed(0) + "K total"} />
                  {chadJobSignOnCash > 0 && (
                    <div style={{ fontSize: 10, color: COLORS.textDim, marginTop: 2, marginBottom: 6 }}>
                      50% paid on hire date, 50% on 1-year anniversary. Taxed as W-2.
                    </div>
                  )}
                  <Slider label="Effective tax rate" value={chadJobTaxRate} onChange={set('chadJobTaxRate')} commitStrategy={commitStrategy} min={10} max={40} color={COLORS.greenDark} format={(v) => v + "%"} />
                  <Slider label="Start month" value={chadJobStartMonth} onChange={set('chadJobStartMonth')} commitStrategy={commitStrategy} min={0} max={24} color={COLORS.greenDark} format={(v) => v === 0 ? "Now" : v + " mo"} />
                  <Slider label="Chad works for" value={chadWorkMonths} onChange={set('chadWorkMonths')} commitStrategy={commitStrategy} min={12} max={144} step={3} color={COLORS.greenDark} format={(v) => { const y = Math.floor(v / 12); const m = v % 12; return m === 0 ? `${y} yr` : `${y}y ${m}m`; }} />

                  {/* After Chad's job ends — selects post-employment benefit source.
                      Defaults to SS Retirement (age-gated by ssClaimAge). Previously
                      the engine paid the FRA amount immediately regardless of age. */}
                  {(() => {
                    const effectivePostJobBenefit = postJobBenefit || 'ssRetirement';
                    const claimAge = ssClaimAge || 67;
                    // Same calendar anchor as the engine (projection.js post-job gate /
                    // gatherState ssStartMonth): months from baseline to Chad's first
                    // eligible month at the claim age. Remediation 2.4 display parity.
                    const ssAnchorStartMonth = (claimAge - 62) * 12 + SS_START_OFFSET;
                    const gapYears = effectivePostJobBenefit === 'ssRetirement'
                      ? Math.max(0, ssAnchorStartMonth - (chadWorkMonths || 0)) / 12
                      : 0;
                    const helperText = effectivePostJobBenefit === 'ssRetirement'
                      ? (gapYears > 0
                          ? `Pays once Chad reaches age ${claimAge} (${gapYears.toFixed(1)} yr gap after job ends).`
                          : `Pays immediately on retirement (already past claim age ${claimAge}).`)
                      : effectivePostJobBenefit === 'ssdi'
                        ? `SSDI personal/family pays the month after the job ends. Kids' auxiliary ages out ${getMonthLabel(TWINS_AGE_OUT_MONTH)} (m${TWINS_AGE_OUT_MONTH}).`
                        : `No income flows after the job ends — use this to model the gap explicitly.`;
                    const opt = (val, label) => ({ val, label, selected: effectivePostJobBenefit === val });
                    return (
                      <div data-testid="post-job-benefit-block" style={{ marginTop: 8, padding: "8px 10px", background: COLORS.bgDeep, borderRadius: 6, border: `1px solid ${COLORS.border}` }}>
                        <div style={{ fontSize: 10, color: COLORS.blueLight, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>
                          After Chad's job ends
                        </div>
                        <div style={{ display: "flex", gap: 6 }}>
                          {[opt('ssRetirement', 'SS Retirement'), opt('ssdi', 'SSDI'), opt('none', 'None')].map(o => (
                            <button
                              key={o.val}
                              onClick={() => set('postJobBenefit')(o.val)}
                              data-testid={`post-job-benefit-${o.val}`}
                              aria-label={`Post-job benefit: ${o.label}`}
                              style={{
                                flex: 1, padding: "6px 8px", borderRadius: 4, cursor: "pointer",
                                fontSize: 11, fontWeight: 600, fontFamily: "'Inter', sans-serif",
                                border: o.selected ? `1px solid ${COLORS.blue}` : `1px solid ${COLORS.border}`,
                                background: o.selected ? "#1e3a5f" : COLORS.bgCard,
                                color: o.selected ? COLORS.blue : COLORS.textDim,
                              }}
                            >
                              {o.label}
                            </button>
                          ))}
                        </div>
                        <div style={{ fontSize: 10, color: COLORS.textDim, marginTop: 6, fontStyle: "italic", lineHeight: 1.4 }}>
                          {helperText}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Employer Retirement & Tax */}
                  <div style={{ marginTop: 8, padding: "8px 10px", background: COLORS.bgDeep, borderRadius: 6, border: `1px solid ${COLORS.border}` }}>
                    <div style={{ fontSize: 10, color: COLORS.amber, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>Employer Retirement & Tax</div>
                    <Toggle
                      label="No Social Security tax (non-SS employer)"
                      description={chadJobNoFICA ? `Adds $${Math.round(chadJobSalary * 0.062 / 12).toLocaleString()}/mo to take-home (6.2% SS tax not withheld)` : "Most employers withhold 6.2% for SS"}
                      checked={chadJobNoFICA}
                      onChange={set('chadJobNoFICA')}
                      color={COLORS.amber}
                      testId="income-no-fica"
                    />
                    <Slider label="Pension accrual rate (%/yr)" value={chadJobPensionRate} onChange={set('chadJobPensionRate')} commitStrategy={commitStrategy} min={0} max={5} step={0.5} color={COLORS.amber} format={(v) => v === 0 ? "None" : v + "%"} />
                    {/* Contribution slider is ALWAYS shown when Chad has a job. Previously gated on
                        chadJobPensionRate > 0, which created a hidden-deduction bug: the cashflow calc
                        in projection.js reads chadJobPensionContrib unconditionally, so a non-zero
                        contribution from a prior pension scenario would silently keep deducting after
                        the accrual rate was zeroed and the slider disappeared. */}
                    <Slider label="Employee pension contribution (%)" value={chadJobPensionContrib} onChange={set('chadJobPensionContrib')} commitStrategy={commitStrategy} min={0} max={15} step={0.1} color={COLORS.amber} format={(v) => v === 0 ? "None" : v.toFixed(1) + "%"} />
                    {chadJobPensionRate > 0 && (
                      <>
                        {(() => {
                          // Shared helper — same value gatherState computes into
                          // s.chadJobPensionMonthly (remediation phase 5: inclusive
                          // paid-month count + final salary incl. promotions/raises).
                          const pensionMo = computeChadPensionMonthly({
                            chadJob, chadJobPensionRate, chadJobSalary, chadWorkMonths, chadJobStartMonth, chadJobRaisePct,
                            chadL64Enabled, chadL64Month, chadL64Salary, chadL64StockRefresh, chadL64BonusPct,
                            chadL65Enabled, chadL65Month, chadL65Salary, chadL65StockRefresh, chadL65BonusPct,
                          });
                          return (
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 4, paddingTop: 4, borderTop: `1px solid ${COLORS.border}` }}>
                              <span style={{ color: COLORS.textDim }}>Est. pension at retirement:</span>
                              <span style={{ color: COLORS.amber, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>+{fmtFull(pensionMo)}/mo</span>
                            </div>
                          );
                        })()}
                        <div style={{ fontSize: 10, color: COLORS.textDim, marginTop: 2 }}>
                          {chadJobPensionRate}% × {((Math.max(0, (chadWorkMonths || 72) - (chadJobStartMonth || 0)) + 1) / 12).toFixed(1)} yrs paid × final salary (incl. promotions/raises), flat in today's $ (COLA ≈ inflation)
                        </div>
                      </>
                    )}
                  </div>

                  {/* Promotion Schedule — MSFT L63 → L64 → L65 ladder.
                      Salary, bonus %, and refresh grant size step up at each promotion.
                      Annual raise % continues from the new base. */}
                  <div style={{ marginTop: 8, padding: "8px 10px", background: COLORS.bgDeep, borderRadius: 6, border: `1px solid ${COLORS.border}` }}>
                    <div style={{ fontSize: 10, color: COLORS.amber, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>Promotion Schedule</div>
                    <Toggle
                      label="Promote to L64"
                      description="Salary jumps to L64 base; raise % continues compounding from there."
                      checked={!!chadL64Enabled}
                      onChange={set('chadL64Enabled')}
                      color={COLORS.amber}
                      testId="income-l64-enabled"
                    />
                    {chadL64Enabled && (
                      <>
                        <Slider label="Months after hire" value={chadL64Month} onChange={set('chadL64Month')} commitStrategy={commitStrategy} min={0} max={120} step={3} color={COLORS.amber} format={(v) => v + " mo"} />
                        <Slider label="L64 base salary" value={chadL64Salary} onChange={set('chadL64Salary')} commitStrategy={commitStrategy} min={0} max={400000} step={5000} color={COLORS.amber} format={(v) => "$" + (v/1000).toFixed(0) + "K"} />
                        <Slider label="L64 stock refresh (annual grant)" value={chadL64StockRefresh} onChange={set('chadL64StockRefresh')} commitStrategy={commitStrategy} min={0} max={300000} step={5000} color={COLORS.amber} format={(v) => v === 0 ? "None" : "$" + (v/1000).toFixed(0) + "K/yr"} />
                        <Slider label="L64 bonus target" value={chadL64BonusPct} onChange={set('chadL64BonusPct')} commitStrategy={commitStrategy} min={0} max={40} step={1} color={COLORS.amber} format={(v) => v + "% of salary"} />
                      </>
                    )}
                    {chadL64Enabled && (!(chadL64Salary > 0)) && (
                      <div style={{ marginTop: 4, padding: "4px 6px", background: "#3a1a1a", borderRadius: 4, border: `1px solid ${COLORS.red}55`, color: COLORS.red, fontSize: 10 }}>
                        L64 enabled but salary is $0. Promotion will silently zero Chad's W-2 at month {chadL64Month}. Set L64 base salary above.
                      </div>
                    )}
                    <div style={{ marginTop: 6 }}>
                      <Toggle
                        label="Promote to L65"
                        description="Second-tier promotion. Stacks above L64 — new salary, refresh, and bonus."
                        checked={!!chadL65Enabled}
                        onChange={set('chadL65Enabled')}
                        color={COLORS.amber}
                        testId="income-l65-enabled"
                      />
                    </div>
                    {chadL65Enabled && (
                      <>
                        <Slider label="Months after hire" value={chadL65Month} onChange={set('chadL65Month')} commitStrategy={commitStrategy} min={0} max={180} step={3} color={COLORS.amber} format={(v) => v + " mo"} />
                        <Slider label="L65 base salary" value={chadL65Salary} onChange={set('chadL65Salary')} commitStrategy={commitStrategy} min={0} max={500000} step={5000} color={COLORS.amber} format={(v) => "$" + (v/1000).toFixed(0) + "K"} />
                        <Slider label="L65 stock refresh (annual grant)" value={chadL65StockRefresh} onChange={set('chadL65StockRefresh')} commitStrategy={commitStrategy} min={0} max={500000} step={5000} color={COLORS.amber} format={(v) => v === 0 ? "None" : "$" + (v/1000).toFixed(0) + "K/yr"} />
                        <Slider label="L65 bonus target" value={chadL65BonusPct} onChange={set('chadL65BonusPct')} commitStrategy={commitStrategy} min={0} max={50} step={1} color={COLORS.amber} format={(v) => v + "% of salary"} />
                      </>
                    )}
                    {chadL65Enabled && (!(chadL65Salary > 0)) && (
                      <div style={{ marginTop: 4, padding: "4px 6px", background: "#3a1a1a", borderRadius: 4, border: `1px solid ${COLORS.red}55`, color: COLORS.red, fontSize: 10 }}>
                        L65 enabled but salary is $0. Promotion will silently zero Chad's W-2 at month {chadL65Month}. Set L65 base salary above.
                      </div>
                    )}
                    {chadL64Enabled && chadL65Enabled && chadL65Month <= chadL64Month && (
                      <div style={{ marginTop: 6, padding: "4px 6px", background: "#3a2e1a", borderRadius: 4, border: `1px solid ${COLORS.amber}55`, color: COLORS.amber, fontSize: 10 }}>
                        Warning: L65 month ({chadL65Month}) ≤ L64 month ({chadL64Month}). L65 will fire first and L64 will never apply. Set L65 month above L64 month.
                      </div>
                    )}
                  </div>

                  {/* Post-retirement RSU vest continuation (MSFT age-65 rule).
                      Standalone section — always visible whenever Chad has a job,
                      independent of the Stock Compensation block (which is hidden
                      in some Plan-tab columns). */}
                  <div style={{ marginTop: 8, padding: "8px 10px", background: COLORS.bgDeep, borderRadius: 6, border: `1px solid ${COLORS.border}` }}>
                    <div style={{ fontSize: 10, color: COLORS.blue, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>Retirement Stock Benefit (Age 65+)</div>
                    <div style={{ fontSize: 10, color: COLORS.textDim, marginBottom: 6, lineHeight: 1.4 }}>
                      MSFT-style: when Chad is age 65+ at retirement, unvested refresh grants keep vesting on their original 5-yr schedule.
                    </div>
                    <Slider label="Chad's current age" value={chadCurrentAge} onChange={set('chadCurrentAge')} commitStrategy={commitStrategy} min={30} max={75} step={1} color={COLORS.blue} format={(v) => v + " yrs"} />
                    {(() => {
                      const retMonth = chadWorkMonths || 72;
                      const ageAtRetirement = (chadCurrentAge || 61) + retMonth / 12;
                      const eligibleAuto = ageAtRetirement >= 65;
                      const override = chadAge65VestOverride || 'auto';
                      const applies =
                        override === 'on' ? true :
                        override === 'off' ? false :
                        eligibleAuto;
                      const labelMap = { auto: 'Auto (by age)', on: 'Force on', off: 'Force off' };
                      return (
                        <>
                          <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                            {['auto', 'on', 'off'].map(opt => (
                              <button
                                key={opt}
                                onClick={() => set('chadAge65VestOverride')(opt)}
                                data-testid={`income-age65-${opt}`}
                                style={{
                                  flex: 1, padding: "6px 4px", borderRadius: 4, cursor: "pointer",
                                  fontSize: 11, fontWeight: 600, fontFamily: "'Inter', sans-serif",
                                  border: override === opt ? `1px solid ${COLORS.blue}` : `1px solid ${COLORS.border}`,
                                  background: override === opt ? "#1e3a5f" : COLORS.bgDeep,
                                  color: override === opt ? COLORS.blue : COLORS.textDim,
                                }}
                              >
                                {labelMap[opt]}
                              </button>
                            ))}
                          </div>
                          <div style={{ marginTop: 6, fontSize: 11, color: COLORS.textDim, lineHeight: 1.5 }}>
                            Age at retirement: <span style={{ color: applies ? COLORS.greenDark : COLORS.amber, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>{ageAtRetirement.toFixed(1)}</span>
                            {' '}·{' '}
                            Vest continues: <span style={{ color: applies ? COLORS.greenDark : COLORS.amber, fontWeight: 600 }}>{applies ? 'YES' : 'NO'}</span>
                            {override === 'auto' && (
                              <span style={{ color: COLORS.textDim, fontSize: 10 }}> ({eligibleAuto ? 'eligible by age' : 'too young at retirement'})</span>
                            )}
                            {override !== 'auto' && (
                              <span style={{ color: COLORS.textDim, fontSize: 10 }}> (manual override)</span>
                            )}
                          </div>
                          {applies && (() => {
                            // Build a synthetic state mirroring what the engine would see, then
                            // ask chadLevels.js for the analytic windfall (1-year cliff applied).
                            const synthState = {
                              chadJob: true,
                              chadJobStartMonth: chadJobStartMonth ?? 0,
                              chadRetirementMonth: retMonth,
                              chadJobRefreshStartMonth: chadJobRefreshStartMonth ?? 12,
                              chadJobStockRefresh: chadJobStockRefresh || 0,
                              chadJobSalary: chadJobSalary || 0,
                              chadJobBonusPct: 0,
                              chadCurrentAge: chadCurrentAge ?? 61,
                              chadAge65VestOverride: override,
                              chadL64Enabled, chadL64Month, chadL64Salary, chadL64StockRefresh, chadL64BonusPct,
                              chadL65Enabled, chadL65Month, chadL65Salary, chadL65StockRefresh, chadL65BonusPct,
                              msftPrice, msftGrowth,
                            };
                            const w = projectedPostRetirementVests(synthState);
                            const taxRateDec = effectiveTaxRate / 100;
                            // Post-retirement vests come from the FORMER employer's W-2, which
                            // ALWAYS withholds full FICA — the active-employment noFICA toggle does
                            // NOT carry over (mirrors projection.js:115 chadJobBonusNetMultPostRet).
                            // So NO 6.2% FICA add-back here, unlike the in-employment bonus mult.
                            const postRetNetMult = 1 - taxRateDec;
                            const netWindfall = Math.round(w.grossWindfall * postRetNetMult);
                            const hasGrants = w.grossWindfall > 0 || w.forfeitedGrants > 0;
                            return (
                              <div style={{ marginTop: 6, padding: "6px 8px", background: hasGrants ? "#1a3a2a" : "#3a2e1a", borderRadius: 4, border: `1px solid ${hasGrants ? COLORS.greenDark : COLORS.amber}55`, fontSize: 10, color: hasGrants ? COLORS.greenDark : COLORS.amber, lineHeight: 1.5 }}>
                                <div style={{ fontWeight: 600, marginBottom: 2 }}>Projected post-retirement RSU windfall</div>
                                {w.grossWindfall > 0 && (
                                  <div>
                                    {w.eligibleGrants} grant{w.eligibleGrants === 1 ? '' : 's'} continue vesting · gross <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>{fmtFull(Math.round(w.grossWindfall))}</span> · net ~<span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>{fmtFull(netWindfall)}</span> after tax.
                                  </div>
                                )}
                                {w.forfeitedGrants > 0 && (
                                  <div style={{ color: COLORS.amber, marginTop: 2 }}>
                                    {w.forfeitedGrants} grant{w.forfeitedGrants === 1 ? '' : 's'} forfeited (1-year cliff: issued within 12 months of retirement).
                                  </div>
                                )}
                                {!hasGrants && (
                                  <div>
                                    Eligibility met, but no refresh grants are configured. Set "Annual stock refresh" in Plan → Cashflow → Stock compensation, or set L64/L65 refresh grants above.
                                  </div>
                                )}
                                <div style={{ color: COLORS.textDim, marginTop: 3, fontStyle: "italic" }}>
                                  Computed analytically. Post-retirement vests are NOT run through the main savings simulation — that produced misleading crashes when both spouses retired together with no SS yet active. Treat this as a side windfall, not a runway extension.
                                </div>
                              </div>
                            );
                          })()}
                        </>
                      );
                    })()}
                  </div>

                  {/* Vest schedule matrix — year × grant table showing when each
                      RSU refresh grant vests and how much. Always visible when Chad
                      has a job and at least one grant is configured. */}
                  {(() => {
                    const synthState = {
                      chadJob: true,
                      chadJobStartMonth: chadJobStartMonth ?? 0,
                      chadRetirementMonth: chadWorkMonths || 72,
                      chadJobRefreshStartMonth: chadJobRefreshStartMonth ?? 12,
                      chadJobStockRefresh: chadJobStockRefresh || 0,
                      chadJobSalary: chadJobSalary || 0,
                      chadJobBonusPct: 0,
                      chadCurrentAge: chadCurrentAge ?? 61,
                      chadAge65VestOverride: chadAge65VestOverride || 'auto',
                      chadL64Enabled, chadL64Month, chadL64Salary, chadL64StockRefresh, chadL64BonusPct,
                      chadL65Enabled, chadL65Month, chadL65Salary, chadL65StockRefresh, chadL65BonusPct,
                      msftPrice, msftGrowth,
                    };
                    const sched = vestSchedule(synthState);
                    const activeGrants = sched.grants.filter(g => g.gross > 0);
                    if (activeGrants.length === 0) return null;
                    // Display NET dollars (after tax) — matches how user thinks of cashflow.
                    const taxRateDec = effectiveTaxRate / 100;
                    const ficaPctDec = chadJobNoFICA ? 0.062 : 0;
                    // In-employment vests use the active net mult (with FICA add-back when noFICA).
                    const netMult = 1 - taxRateDec + ficaPctDec;
                    // Post-retirement vests come from the FORMER employer's W-2 — full FICA always
                    // withheld, so NO add-back (mirrors projection.js:115 chadJobBonusNetMultPostRet).
                    const postRetNetMult = 1 - taxRateDec;
                    const fmtCell = (v) => v > 0 ? '$' + (v / 1000).toFixed(2) + 'K' : '—';
                    const fmtTotal = (v) => v > 0 ? '$' + (v / 1000).toFixed(2) + 'K' : '—';

                    // Per-grant post-retirement gross is computed per-vest in vestSchedule
                    // (vm > retMonth) so partial years are handled correctly. The Y? (post-ret)
                    // shading and (retire mid-yr) tag are driven by sched.postRetYearTotals,
                    // which keeps shading and subtotals consistent.
                    const postRetTotalsByGrant = activeGrants.map(g => (g.postRetGross || 0) * postRetNetMult);
                    const postRetGrandTotal = postRetTotalsByGrant.reduce((a, b) => a + b, 0);
                    const eligibleGrantCount = activeGrants.filter(g => g.postRetVested).length;

                    return (
                      <div style={{ marginTop: 8, padding: "8px 10px", background: COLORS.bgDeep, borderRadius: 6, border: `1px solid ${COLORS.border}` }}>
                        <div style={{ fontSize: 10, color: COLORS.blue, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>
                          Vest schedule by year (after-tax $)
                          <span style={{ color: COLORS.textDim, fontWeight: 400, textTransform: "none", letterSpacing: 0, marginLeft: 6 }}>
                            @ MSFT ${(msftPrice || 0).toFixed(2)} · {(msftGrowth || 0) >= 0 ? '+' : ''}{(msftGrowth || 0).toFixed(1)}%/yr growth
                          </span>
                        </div>
                        <div style={{ fontSize: 10, color: COLORS.textDim, marginBottom: 6, lineHeight: 1.4 }}>
                          Each grant vests 5%/qtr × 20 quarters = 5 years. Slider value = grant dollars at issue; shares = grant ÷ price-at-issue. Each vest's value scales with MSFT growth from issue → vest, so later grants buy fewer shares but each grant's vests grow within its 5-yr cycle. "(done)" = fully vested. <span style={{ color: COLORS.amber }}>★</span> = grant continues vesting post-retirement under age-65 rule. <span style={{ color: COLORS.greenDark }}>Green rows</span> are fully post-retirement; <span style={{ color: COLORS.amber }}>amber rows</span> straddle retirement and show "(post)" sub-amounts for the portion that lands after the last work month. The subtotal sums those post-retirement portions.
                        </div>
                        <div style={{ overflowX: "auto", marginTop: 4 }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}>
                            <thead>
                              <tr>
                                <th style={{ textAlign: "left", color: COLORS.textDim, padding: "4px 6px", borderBottom: `1px solid ${COLORS.border}`, whiteSpace: "nowrap" }}>Year</th>
                                {activeGrants.map(g => {
                                  const shares = Math.round(g.sharesAtIssue || 0);
                                  const issuePrice = g.priceAtIssue || (msftPrice || 0);
                                  return (
                                    <th key={g.id} style={{ textAlign: "right", color: COLORS.textDim, padding: "4px 6px", borderBottom: `1px solid ${COLORS.border}`, whiteSpace: "nowrap" }}>
                                      <div>
                                        #{g.id} ({g.level})
                                        {g.postRetVested && (
                                          <span title="Continues vesting post-retirement (cleared 1-yr cliff)" style={{ color: COLORS.amber, marginLeft: 3 }}>★</span>
                                        )}
                                        {g.cliff && (
                                          <span title="Forfeited at retirement (within 1-yr cliff)" style={{ color: COLORS.red, marginLeft: 3 }}>✕</span>
                                        )}
                                      </div>
                                      <div style={{ fontSize: 9, color: COLORS.textDim, fontWeight: 400 }} title={`$${(g.gross / 1000).toFixed(0)}K grant at issue ÷ $${issuePrice.toFixed(2)} (price at issue month ${g.issueMonth}) = ${shares} shares`}>
                                        {shares} sh @ ${issuePrice.toFixed(0)}
                                      </div>
                                    </th>
                                  );
                                })}
                                <th style={{ textAlign: "right", color: COLORS.blue, padding: "4px 6px", borderBottom: `1px solid ${COLORS.border}`, fontWeight: 700, whiteSpace: "nowrap" }}>Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {sched.years.map((yr, yi) => {
                                const rowTotalNet = sched.yearTotals[yi] * netMult;
                                const yearPostRetTotal = sched.postRetYearTotals[yi] || 0;
                                const yearTotal = sched.yearTotals[yi] || 0;
                                // Relative tolerance — yearTotal can reach $50K+ where 0.01 absolute is too tight under accumulated FP error.
                                const isFullyPostRet = yearPostRetTotal > 0 && yearTotal > 0 && Math.abs(yearPostRetTotal - yearTotal) <= 1e-6 * yearTotal;
                                const isStraddle = yearPostRetTotal > 0 && !isFullyPostRet;
                                const rowBg = isFullyPostRet ? '#1a2e1a' : isStraddle ? '#3a2e1a' : 'transparent';
                                const labelTag = isFullyPostRet
                                  ? <span style={{ color: COLORS.greenDark, fontWeight: 400, fontSize: 9 }}> (post-ret)</span>
                                  : isStraddle
                                    ? <span style={{ color: COLORS.amber, fontWeight: 400, fontSize: 9 }}> (retire mid-yr)</span>
                                    : null;
                                return (
                                  <tr key={yr} style={{ background: rowBg }}>
                                    <td style={{ color: COLORS.textSecondary, padding: "3px 6px", fontWeight: 600, whiteSpace: "nowrap" }}>
                                      Y{yr}{labelTag}
                                    </td>
                                    {activeGrants.map((g) => {
                                      const origIdx = sched.grants.indexOf(g);
                                      const gross = sched.cells[yi][origIdx] || 0;
                                      const net = gross * netMult;
                                      const postRetNet = (sched.postRetCells[yi][origIdx] || 0) * postRetNetMult;
                                      const isDone = g.lastVestYear > 0 && yr > g.lastVestYear;
                                      const showPostInline = isStraddle && postRetNet > 0 && postRetNet < net;
                                      return (
                                        <td key={g.id} style={{ textAlign: "right", padding: "3px 6px", color: net > 0 ? COLORS.greenDark : COLORS.textDim, whiteSpace: "nowrap" }}>
                                          {net > 0 ? (
                                            <>
                                              {fmtCell(net)}
                                              {showPostInline && (
                                                <span style={{ fontSize: 9, color: COLORS.amber, fontWeight: 400, marginLeft: 4 }} title={`${fmtCell(postRetNet)} of this cell vests after retirement (vest month > ${sched.retMonth})`}>
                                                  ({fmtCell(postRetNet)})
                                                </span>
                                              )}
                                            </>
                                          ) : isDone ? (
                                            <span style={{ color: COLORS.textDim, fontStyle: "italic" }}>{g.cliff ? '(forfeit)' : '(done)'}</span>
                                          ) : '—'}
                                        </td>
                                      );
                                    })}
                                    <td style={{ textAlign: "right", padding: "3px 6px", color: COLORS.blue, fontWeight: 700, whiteSpace: "nowrap" }}>
                                      {fmtTotal(rowTotalNet)}
                                      {isStraddle && yearPostRetTotal > 0 && (
                                        <span style={{ fontSize: 9, color: COLORS.amber, fontWeight: 400, marginLeft: 4 }}>
                                          ({fmtCell(yearPostRetTotal * postRetNetMult)})
                                        </span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                              {/* Post-retirement subtotal row — only if there are any post-retirement vests */}
                              {postRetGrandTotal > 0 && (
                                <tr style={{ background: '#1a3a2a', borderTop: `2px solid ${COLORS.greenDark}` }}>
                                  <td style={{ color: COLORS.greenDark, padding: "5px 6px", fontWeight: 700, fontSize: 10, whiteSpace: "nowrap" }}>
                                    Post-ret subtotal
                                  </td>
                                  {activeGrants.map((g, i) => {
                                    const v = postRetTotalsByGrant[i];
                                    return (
                                      <td key={g.id} style={{ textAlign: "right", padding: "5px 6px", color: v > 0 ? COLORS.greenDark : COLORS.textDim, fontWeight: 700, whiteSpace: "nowrap" }}>
                                        {fmtCell(v)}
                                      </td>
                                    );
                                  })}
                                  <td style={{ textAlign: "right", padding: "5px 6px", color: COLORS.greenDark, fontWeight: 700, fontSize: 11, whiteSpace: "nowrap" }}>
                                    {fmtTotal(postRetGrandTotal)}
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                        <div style={{ fontSize: 9, color: COLORS.textDim, fontStyle: "italic", marginTop: 6, lineHeight: 1.4 }}>
                          {activeGrants.length} active grant{activeGrants.length === 1 ? '' : 's'} ·
                          {' '}gross grant sizes: {activeGrants.map(g => `#${g.id} ${(g.gross/1000).toFixed(0)}K (${g.level})`).join(', ')}
                          {eligibleGrantCount > 0 && (
                            <span style={{ color: COLORS.greenDark }}>
                              {' '}· <span style={{ fontWeight: 600 }}>★ {eligibleGrantCount} grant{eligibleGrantCount === 1 ? '' : 's'}</span> continue post-retirement (≈{fmtTotal(postRetGrandTotal)} after-tax windfall)
                            </span>
                          )}
                          {sched.grants.some(g => g.cliff) && (
                            <span style={{ color: COLORS.red }}>
                              {' '}· <span style={{ fontWeight: 600 }}>✕ {sched.grants.filter(g => g.cliff && g.gross > 0).length} grant{sched.grants.filter(g => g.cliff && g.gross > 0).length === 1 ? '' : 's'}</span> forfeited (1-yr cliff)
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {!hideStockComp && (
                  <>
                  {/* Stock Compensation */}
                  <div style={{ marginTop: 8, padding: "8px 10px", background: COLORS.bgDeep, borderRadius: 6, border: `1px solid ${COLORS.border}` }}>
                    <div style={{ fontSize: 10, color: COLORS.blue, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>Stock Compensation</div>
                    <Slider label="Annual stock refresh (grant $)" value={chadJobStockRefresh} onChange={set('chadJobStockRefresh')} commitStrategy={commitStrategy} min={0} max={200000} step={5000} color={COLORS.blue} format={(v) => v === 0 ? "None" : "$" + (v/1000).toFixed(0) + "K/yr"} />
                    {chadJobStockRefresh > 0 && (
                      <>
                        <Slider label="First refresh grant — months after hire" value={chadJobRefreshStartMonth} onChange={set('chadJobRefreshStartMonth')} commitStrategy={commitStrategy} min={0} max={24} step={1} color={COLORS.blue} format={(v) => v === 0 ? "On hire" : v + " mo"} />
                        <div style={{ fontSize: 10, color: COLORS.textDim, marginTop: 2, marginBottom: 6 }}>
                          Each grant vests 5% per quarter (Feb / May / Aug / Nov, last day) for 5 yrs. MSFT default: 12 mo (after first review).
                        </div>
                      </>
                    )}
                    <div style={{ fontSize: 10, color: COLORS.blue, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginTop: 8, marginBottom: 4 }}>One-time hire stock — anniversary lump</div>
                    <Slider label="Year 1 vest" value={chadJobHireStockY1} onChange={set('chadJobHireStockY1')} commitStrategy={commitStrategy} min={0} max={200000} step={5000} color={COLORS.blue} format={(v) => v === 0 ? "—" : "$" + (v/1000).toFixed(0) + "K"} />
                    <Slider label="Year 2 vest" value={chadJobHireStockY2} onChange={set('chadJobHireStockY2')} commitStrategy={commitStrategy} min={0} max={200000} step={5000} color={COLORS.blue} format={(v) => v === 0 ? "—" : "$" + (v/1000).toFixed(0) + "K"} />
                    <Slider label="Year 3 vest" value={chadJobHireStockY3} onChange={set('chadJobHireStockY3')} commitStrategy={commitStrategy} min={0} max={200000} step={5000} color={COLORS.blue} format={(v) => v === 0 ? "—" : "$" + (v/1000).toFixed(0) + "K"} />
                    <Slider label="Year 4 vest" value={chadJobHireStockY4} onChange={set('chadJobHireStockY4')} commitStrategy={commitStrategy} min={0} max={200000} step={5000} color={COLORS.blue} format={(v) => v === 0 ? "—" : "$" + (v/1000).toFixed(0) + "K"} />
                    {(chadJobHireStockY1 + chadJobHireStockY2 + chadJobHireStockY3 + chadJobHireStockY4 > 0) && (
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 4, paddingTop: 4, borderTop: `1px solid ${COLORS.border}` }}>
                        <span style={{ color: COLORS.textDim }}>Total hire stock:</span>
                        <span style={{ color: COLORS.blue, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>{fmtFull(chadJobHireStockY1 + chadJobHireStockY2 + chadJobHireStockY3 + chadJobHireStockY4)}</span>
                      </div>
                    )}
                  </div>

                  {/* 401(k) Contributions */}
                  <div style={{ marginTop: 8, padding: "8px 10px", background: COLORS.bgDeep, borderRadius: 6, border: `1px solid ${COLORS.border}` }}>
                    <div style={{ fontSize: 10, color: COLORS.blue, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>401(k) Contributions</div>
                    <Toggle
                      label="Enable 401(k) contributions"
                      description={chadJob401kEnabled ? "Sliders below are active" : "Disabled — turn on to model deferral, Roth catch-up, and employer match"}
                      checked={!!chadJob401kEnabled}
                      onChange={set('chadJob401kEnabled')}
                      color={COLORS.blue}
                      testId="income-401k-enabled"
                    />
                    {chadJob401kEnabled && (
                      <>
                        <Slider label="Pre-tax deferral $/yr (IRS 2026: $24,500)" value={chadJob401kDeferral || 0} onChange={set('chadJob401kDeferral')} commitStrategy={commitStrategy} min={0} max={24500} step={500} color={COLORS.blue} format={(v) => v === 0 ? "None" : "$" + (v/1000).toFixed(1) + "K"} />
                        <Slider label="Roth catch-up $/yr (60-63 super: $11,250)" value={chadJob401kCatchupRoth || 0} onChange={set('chadJob401kCatchupRoth')} commitStrategy={commitStrategy} min={0} max={11250} step={250} color={COLORS.blue} format={(v) => v === 0 ? "None" : "$" + (v/1000).toFixed(2) + "K"} />
                        <Slider label="Employer match $/yr" value={chadJob401kMatch || 0} onChange={set('chadJob401kMatch')} commitStrategy={commitStrategy} min={0} max={50000} step={250} color={COLORS.blue} format={(v) => v === 0 ? "None" : "$" + (v/1000).toFixed(2) + "K"} />
                        {((chadJob401kDeferral || 0) + (chadJob401kCatchupRoth || 0) + (chadJob401kMatch || 0)) > 0 && (() => {
                          const annualContrib = (chadJob401kDeferral || 0) + (chadJob401kCatchupRoth || 0);
                          const annualToBalance = annualContrib + (chadJob401kMatch || 0);
                          const monthlyOutflow = Math.round(annualContrib / 12);
                          const monthlyToBalance = Math.round(annualToBalance / 12);
                          return (
                            <div style={{ fontSize: 10, color: COLORS.textDim, marginTop: 4, paddingTop: 4, borderTop: `1px solid ${COLORS.border}`, lineHeight: 1.5 }}>
                              Take-home reduced by <span style={{ color: COLORS.amber, fontWeight: 600 }}>${monthlyOutflow.toLocaleString()}/mo</span>; 401k grows by <span style={{ color: COLORS.greenDark, fontWeight: 600 }}>${monthlyToBalance.toLocaleString()}/mo</span> (incl. match).<br />
                              Pre-tax deferral lowers W-2 wages; Roth catch-up is post-tax (per SECURE 2.0 mandate for high earners).
                            </div>
                          );
                        })()}
                      </>
                    )}
                  </div>
                  </>
                  )}

                  {(() => {
                    const isSSPath = ssType === 'ss';
                    const familyRate = isSSPath ? (ssFamilyTotal || 7099) : (ssdiFamilyTotal || 6500);
                    const personalRate = isSSPath ? (ssPersonal || 2933) : (ssdiPersonal || 4152);
                    // `??` not `||` — ssKidsAgeOutMonths can be legitimately 0 (kids aged out
                    // before SS starts), and `|| 18` would falsely revert to 18 months.
                    // D6a (remediation 2026-06-09): the SSDI branch uses the SAME calendar
                    // derivation as the engine (FIX #8) — family rate flows from approval
                    // until TWINS_AGE_OUT_MONTH — instead of the legacy kidsAgeOutMonths
                    // field (which no longer affects the benefit path).
                    const familyMonths = isSSPath
                      ? (ssKidsAgeOutMonths ?? 18)
                      : Math.max(0, TWINS_AGE_OUT_MONTH - (ssdiApprovalMonth ?? 7));
                    const lostBackPayMonthly = !isSSPath && !ssdiDenied ? Math.round((ssdiBackPayActual || 0) / 72) : 0;
                    // Net impact uses total W-2 monthly net (salary + bonus + RSU + hire stock,
                    // all averaged with MSFT growth applied) plus the MONTHLY health benefit.
                    // Previously used salary-only `chadJobMonthlyNet` and annual `effectiveHealthSavings`
                    // as if it were monthly — both bugs systematically distorted the comparison.
                    const netImpactSteady = Math.round(w2TotalAvgMo + monthlyHealthSavings - personalRate);
                    const netColorSteady = netImpactSteady >= 0 ? COLORS.greenDark : COLORS.amber;
                    const netImpactFamily = Math.round(w2TotalAvgMo + monthlyHealthSavings - familyRate);
                    const netColorFamily = netImpactFamily >= 0 ? COLORS.greenDark : COLORS.red;
                    const label = isSSPath ? 'SS' : 'SSDI';
                    return (
                    <div style={{ marginTop: 6, paddingTop: 6, borderTop: `1px solid ${COLORS.border}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                        <span style={{ color: COLORS.textDim }}>Monthly after tax:</span>
                        <span style={{ color: COLORS.greenDark, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>+{fmtFull(chadJobMonthlyNet)}</span>
                      </div>
                      {/* W-2 net computation diagnostic — exposes every input feeding chadJobMonthlyNet.
                          All numeric values come from the hoisted w2* vars (top of component) so the
                          diagnostic display and the SSDI comparison always show the same numbers. */}
                      {(() => {
                        const annualGross = chadJobSalary || 0;
                        const monthlyGross = w2MonthlyGross;
                        const ficaPct = chadJobNoFICA ? 6.2 : 0;
                        const pensionPct = chadJobPensionContrib || 0;
                        const deferral = chadJob401kEnabled ? (chadJob401kDeferral || 0) : 0;
                        const catchup = chadJob401kEnabled ? (chadJob401kCatchupRoth || 0) : 0;
                        const match = chadJob401kEnabled ? (chadJob401kMatch || 0) : 0;
                        const salaryMult = w2SalaryMult;
                        const bonusMult = w2BonusMult;
                        const pensionCashflowMult = w2PensionCashflowMult;
                        const taxableSalaryMo = w2TaxableMo;
                        const afterTaxSalaryMo = w2TaxableMo * w2SalaryMult;
                        const pensionCashflowMo = w2PensionCashflowMo;
                        const salaryNetMo = w2SalaryNetMo;
                        const bonusNetYr = w2BonusNetYr;
                        const refreshNetYr = w2RefreshNetYr;
                        const refreshSteadyMult = w2RefreshSteadyMult;
                        const hireTotalAtHire = w2HireTotalAtHire;
                        const hireNetAvgYr = w2HireNetAvgYr;
                        const annualSalaryNet = w2AnnualSalaryNet;
                        const totalAvgMo = w2TotalAvgMo;
                        const totalAvgYr = w2TotalAvgYr;
                        const totalGrossYr = w2TotalGrossYr;
                        const blendedTakeHomePct = w2BlendedTakeHomePct;
                        const signOnGross = w2SignOnGross;
                        const signOnNet = w2SignOnNet;
                        // 401(k) economic value to the household (added to the 401k balance incl. match).
                        const k401AnnualToBalance = deferral + catchup + match;
                        const k401MonthlyToBalance = k401AnnualToBalance / 12;
                        const msftGrowthPct = (msftGrowth || 0);
                        const hiddenPension = pensionPct > 0 && (chadJobPensionRate || 0) === 0;
                        const rowStyle = { display: "flex", justifyContent: "space-between", marginTop: 1, fontSize: 10 };
                        const monoStyle = { fontFamily: "'JetBrains Mono', monospace" };
                        return (
                          <div data-testid="w2-diagnostic" style={{ marginTop: 6, padding: "6px 8px", background: COLORS.bgDeep, borderRadius: 6, border: `1px dashed ${COLORS.border}` }}>
                            <div style={{ color: COLORS.amber, fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>
                              W-2 Net Diagnostic
                            </div>
                            {hiddenPension && (
                              <div style={{ color: COLORS.amber, fontSize: 10, marginBottom: 4, padding: "4px 6px", background: "#3a2e1a", borderRadius: 4, border: `1px solid ${COLORS.amber}55` }}>
                                <div style={{ fontWeight: 600 }}>PENSION INCONSISTENCY</div>
                                <div style={{ marginTop: 2 }}>Contributing {pensionPct.toFixed(1)}% to a pension with 0% accrual rate — you're paying in but not earning benefits. This costs ~{fmtFull(Math.round(annualGross * pensionPct / 100 / 12))}/mo. Either set an accrual rate above, or zero the contribution.</div>
                                <button
                                  onClick={() => set('chadJobPensionContrib')(0)}
                                  style={{ marginTop: 4, padding: "3px 8px", fontSize: 10, fontWeight: 600, cursor: "pointer", background: COLORS.amber, color: "#000", border: "none", borderRadius: 3 }}
                                >
                                  Reset pension contribution to 0
                                </button>
                              </div>
                            )}
                            <div style={{ color: COLORS.textDim, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.04em", marginTop: 2 }}>Inputs (L63 baseline — see Promotion Schedule for L64/L65)</div>
                            <div style={rowStyle}><span>Annual gross salary</span><span style={monoStyle}>{fmtFull(annualGross)}</span></div>
                            <div style={rowStyle}><span>Monthly gross</span><span style={monoStyle}>{fmtFull(Math.round(monthlyGross))}</span></div>
                            <div style={rowStyle}><span>Tax rate (effective)</span><span style={monoStyle}>{effectiveTaxRate}%</span></div>
                            <div style={rowStyle}><span>FICA addback (no-FICA toggle)</span><span style={{ ...monoStyle, color: ficaPct > 0 ? COLORS.green : COLORS.textDim }}>+{ficaPct.toFixed(1)}%</span></div>
                            <div style={rowStyle}><span>Pension contribution</span><span style={{ ...monoStyle, color: pensionPct > 0 ? COLORS.amber : COLORS.textDim }}>−{pensionPct.toFixed(1)}%</span></div>
                            <div style={rowStyle}><span>401(k) pre-tax deferral</span><span style={{ ...monoStyle, color: deferral > 0 ? COLORS.amber : COLORS.textDim }}>{deferral > 0 ? `${fmtFull(deferral)}/yr` : '—'}</span></div>
                            <div style={rowStyle}><span>401(k) Roth catch-up</span><span style={{ ...monoStyle, color: catchup > 0 ? COLORS.amber : COLORS.textDim }}>{catchup > 0 ? `${fmtFull(catchup)}/yr` : '—'}</span></div>
                            <div style={rowStyle}><span>Employer match (to 401k bal, not cashflow)</span><span style={{ ...monoStyle, color: match > 0 ? COLORS.green : COLORS.textDim }}>{match > 0 ? `${fmtFull(match)}/yr` : '—'}</span></div>

                            <div style={{ color: COLORS.textDim, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.04em", marginTop: 6 }}>Multipliers</div>
                            <div style={rowStyle}><span>Salary net mult (1 − tax + fica)</span><span style={monoStyle}>{salaryMult.toFixed(4)}</span></div>
                            <div style={rowStyle}><span>Bonus / RSU / sign-on net mult (1 − tax + fica)</span><span style={monoStyle}>{bonusMult.toFixed(4)}</span></div>
                            {pensionPct > 0 && (
                              <div style={rowStyle}><span>Pension cashflow mult (1 − tax + FICA-on-pension)</span><span style={monoStyle}>{pensionCashflowMult.toFixed(4)}</span></div>
                            )}
                            <div style={{ fontSize: 9, color: COLORS.textDim, fontStyle: "italic", marginTop: 2, lineHeight: 1.4 }}>
                              The multiplier is a FLAT all-in effective rate (income tax + FICA folded into your {effectiveTaxRate}% assumption). The real, traceable split is below — same engine as the <span style={{ color: COLORS.blueLight, fontWeight: 600 }}>Tax tab</span>.
                            </div>

                            {/* Tax breakdown. FICA is on the STEADY-STATE comp shown above (exact —
                                FICA depends only on gross wages, and this is the comp the whole pane
                                describes). Federal income tax can't be a single steady-state number
                                (it depends on the year's full household return), so it is shown only
                                as a clearly-labeled per-year reference from the Tax tab — never mixed
                                into the FICA basis. */}
                            <div style={{ color: COLORS.textDim, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.04em", marginTop: 6 }}>FICA on this comp (exact)</div>
                            <div style={{ ...rowStyle, color: COLORS.textDim, fontSize: 9 }}><span>FICA base (gross W-2 wages)</span><span style={monoStyle}>{fmtFull(Math.round(w2FicaBaseAnnual))}/yr</span></div>
                            <div style={rowStyle}><span>FICA — Social Security {chadJobNoFICA ? '(none — non-FICA employer)' : `(6.2%, capped at ${fmtFull(SS_WAGE_BASE)} wages)`}</span><span style={{ ...monoStyle, color: w2FicaSS > 0 ? COLORS.textSecondary : COLORS.textDim }}>{fmtFull(Math.round(w2FicaSS))}/yr</span></div>
                            <div style={rowStyle}><span>FICA — Medicare (1.45%)</span><span style={monoStyle}>{fmtFull(Math.round(w2FicaMedicare))}/yr</span></div>
                            {w2FicaAddlMedicare > 0 && (
                              <div style={rowStyle}><span>Additional Medicare (0.9% over {fmtFull(250000)})</span><span style={monoStyle}>{fmtFull(Math.round(w2FicaAddlMedicare))}/yr</span></div>
                            )}
                            <div style={{ ...rowStyle, fontWeight: 600, paddingTop: 2, borderTop: `1px solid ${COLORS.border}` }}><span>FICA total</span><span style={monoStyle}>{fmtFull(Math.round(w2FicaAllInTotal))}/yr · {(w2FicaEffectivePct * 100).toFixed(1)}% of gross</span></div>
                            {chadTaxBreakdown ? (
                              <div style={{ fontSize: 9, color: COLORS.textDim, fontStyle: "italic", marginTop: 2, lineHeight: 1.4 }}>
                                Federal income tax varies by year on your full household return, so there's no single steady-state figure. For reference, the <span style={{ color: COLORS.blueLight, fontWeight: 600 }}>Tax tab</span> engine shows ≈{fmtFull(Math.round(chadTaxBreakdown.fedTax))}/yr federal in projection year {chadTaxBreakdown.year} (on that year's {fmtFull(Math.round(chadTaxBreakdown.ficaBase))} gross), an all-in ≈{(chadTaxBreakdown.effectivePct * 100).toFixed(1)}% vs your flat {effectiveTaxRate}% assumption. No state income tax is modeled.
                              </div>
                            ) : (
                              <div style={{ fontSize: 9, color: COLORS.textDim, fontStyle: "italic", marginTop: 2, lineHeight: 1.4 }}>
                                FICA is exact (depends only on gross wages). See the <span style={{ color: COLORS.blueLight, fontWeight: 600 }}>Tax tab</span> for precise per-year federal income tax. No state income tax is modeled.
                              </div>
                            )}

                            <div style={{ color: COLORS.textDim, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.04em", marginTop: 6 }}>Salary cashflow walk</div>
                            <div style={rowStyle}><span>Monthly gross</span><span style={monoStyle}>{fmtFull(Math.round(monthlyGross))}</span></div>
                            <div style={rowStyle}><span>− 401(k) deferral / 12</span><span style={monoStyle}>−{fmtFull(Math.round(deferral / 12))}</span></div>
                            <div style={rowStyle}><span>= Taxable salary</span><span style={monoStyle}>{fmtFull(Math.round(taxableSalaryMo))}</span></div>
                            <div style={rowStyle}><span>× salary mult</span><span style={monoStyle}>{fmtFull(Math.round(afterTaxSalaryMo))}</span></div>
                            {pensionPct > 0 && (
                              <div style={rowStyle}><span>− Pension × pension mult</span><span style={monoStyle}>−{fmtFull(Math.round(pensionCashflowMo))}</span></div>
                            )}
                            <div style={rowStyle}><span>− Roth catch-up / 12</span><span style={monoStyle}>−{fmtFull(Math.round(catchup / 12))}</span></div>
                            <div style={{ ...rowStyle, fontWeight: 600, color: COLORS.greenDark, paddingTop: 2, borderTop: `1px solid ${COLORS.border}` }}><span>= Salary net (cashflow)</span><span style={monoStyle}>{fmtFull(salaryNetMo)}/mo</span></div>

                            <div style={{ color: COLORS.textDim, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.04em", marginTop: 6 }}>Annual W-2 (steady state, all components)</div>
                            <div style={rowStyle}><span>Salary net (12 × monthly)</span><span style={monoStyle}>{fmtFull(annualSalaryNet)}/yr</span></div>
                            <div style={rowStyle}><span>Bonus net (paid Sept lump)</span><span style={monoStyle}>{fmtFull(Math.round(bonusNetYr))}/yr</span></div>
                            <div style={rowStyle}>
                              <span>RSU refresh net {msftGrowthPct !== 0 ? `(steady state · ×${refreshSteadyMult.toFixed(3)} for ${msftGrowthPct}% MSFT growth)` : '(steady state)'}</span>
                              <span style={monoStyle}>{fmtFull(Math.round(refreshNetYr))}/yr</span>
                            </div>
                            <div style={rowStyle}>
                              <span>Hire stock net {msftGrowthPct !== 0 ? `(avg over 4 yr · ${msftGrowthPct}% MSFT growth applied)` : '(avg over 4 yr)'}</span>
                              <span style={monoStyle}>{fmtFull(Math.round(hireNetAvgYr))}/yr</span>
                            </div>
                            <div style={{ ...rowStyle, fontWeight: 600, color: COLORS.greenDark, paddingTop: 2, borderTop: `1px solid ${COLORS.border}` }}><span>Avg total monthly W-2 net</span><span style={monoStyle}>{fmtFull(totalAvgMo)}/mo</span></div>
                            <div style={rowStyle}><span>Total annual W-2 net (take-home)</span><span style={monoStyle}>{fmtFull(Math.round(totalAvgYr))}/yr</span></div>

                            {/* Gross comp denominator + blended take-home %. */}
                            <div style={{ color: COLORS.textDim, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.04em", marginTop: 6 }}>Total comp (steady state, gross → net)</div>
                            <div style={rowStyle}><span>Total annual gross comp</span><span style={monoStyle}>{fmtFull(Math.round(totalGrossYr))}/yr</span></div>
                            <div style={rowStyle}><span>Total annual net comp</span><span style={{ ...monoStyle, color: COLORS.greenDark }}>{fmtFull(Math.round(totalAvgYr))}/yr</span></div>
                            <div style={rowStyle}><span>Blended take-home %</span><span style={monoStyle}>{(blendedTakeHomePct * 100).toFixed(1)}%</span></div>
                            <div style={{ ...rowStyle, color: COLORS.textDim, fontSize: 9 }}><span>↳ salary gross → net</span><span style={monoStyle}>{fmtFull(annualGross)} → {fmtFull(annualSalaryNet)}</span></div>
                            <div style={{ ...rowStyle, color: COLORS.textDim, fontSize: 9 }}><span>↳ bonus gross → net</span><span style={monoStyle}>{fmtFull(Math.round(w2BonusGrossYr))} → {fmtFull(Math.round(bonusNetYr))}</span></div>
                            <div style={{ ...rowStyle, color: COLORS.textDim, fontSize: 9 }}><span>↳ hire stock (grown) gross → net (avg/yr)</span><span style={monoStyle}>{fmtFull(Math.round(w2HireGrownTotal / 4))} → {fmtFull(Math.round(hireNetAvgYr))}</span></div>

                            {/* Economic value to household = cash net + 401(k) incl. match. */}
                            {k401AnnualToBalance > 0 && (
                              <>
                                <div style={{ color: COLORS.textDim, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.04em", marginTop: 6 }}>Economic value to household</div>
                                <div style={rowStyle}><span>Cash net</span><span style={monoStyle}>{fmtFull(totalAvgMo)}/mo</span></div>
                                <div style={rowStyle}><span>+ 401(k) incl. match (to balance)</span><span style={{ ...monoStyle, color: COLORS.green }}>+{fmtFull(Math.round(k401MonthlyToBalance))}/mo</span></div>
                                <div style={{ ...rowStyle, fontWeight: 600, color: COLORS.greenDark, paddingTop: 2, borderTop: `1px solid ${COLORS.border}` }}><span>= Total economic value</span><span style={monoStyle}>{fmtFull(Math.round(totalAvgMo + k401MonthlyToBalance))}/mo</span></div>
                              </>
                            )}

                            {/* Sign-on bonus — ONE-TIME, NOT in the steady-state average above. */}
                            {signOnGross > 0 && (
                              <>
                                <div style={{ color: COLORS.textDim, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.04em", marginTop: 6 }}>Sign-on bonus (one-time, not in average)</div>
                                <div style={rowStyle}><span>Sign-on gross (50% hire / 50% 1-yr)</span><span style={monoStyle}>{fmtFull(Math.round(signOnGross))}</span></div>
                                <div style={rowStyle}><span>Sign-on net (× bonus mult)</span><span style={{ ...monoStyle, color: COLORS.greenDark }}>{fmtFull(Math.round(signOnNet))}</span></div>
                              </>
                            )}
                            <div style={{ fontSize: 9, color: COLORS.textDim, fontStyle: "italic", marginTop: 3 }}>
                              "Monthly after tax" above shows salary only. Bonus, RSUs, and sign-on land in specific months — average above includes them (sign-on is one-time and excluded). RSU and hire-stock totals reflect projected MSFT growth from grant to vest (matches engine).
                            </div>
                            {/* Promotion projections — show monthly net at L64 and L65 if those toggles are on. */}
                            {(chadL64Enabled || chadL65Enabled) && (() => {
                              const projectLevel = (salary, refresh, bonusPctRaw, label, monthsFromHire) => {
                                const gross = salary || 0;
                                const monGross = gross / 12;
                                const taxableMo = Math.max(0, monGross - deferral / 12);
                                const pensionMo = monGross * pensionPct / 100 * pensionCashflowMult;
                                const salNet = Math.round(taxableMo * salaryMult - pensionMo - catchup / 12);
                                const bPct = (bonusPctRaw || 0) / 100;
                                const bonusYr = gross * bPct * bonusMult;
                                // Apply same steady-state MSFT growth mult to L64/L65 refresh as L63 (matches engine treatment).
                                const refreshYr = (refresh || 0) * bonusMult * refreshSteadyMult;
                                const totalMo = Math.round((salNet * 12 + bonusYr + refreshYr) / 12);
                                return (
                                  <div key={label} style={rowStyle}>
                                    <span>{label} (mo {monthsFromHire})</span>
                                    <span style={monoStyle}>{fmtFull(salNet)}/mo salary · {fmtFull(totalMo)}/mo total</span>
                                  </div>
                                );
                              };
                              return (
                                <>
                                  <div style={{ color: COLORS.textDim, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.04em", marginTop: 6 }}>After promotion (jump-and-hold, no raise compounding shown)</div>
                                  {chadL64Enabled && projectLevel(chadL64Salary, chadL64StockRefresh, chadL64BonusPct, 'L64', chadL64Month)}
                                  {chadL65Enabled && projectLevel(chadL65Salary, chadL65StockRefresh, chadL65BonusPct, 'L65', chadL65Month)}
                                </>
                              );
                            })()}
                          </div>
                        );
                      })()}
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 2 }}>
                        <span style={{ color: COLORS.textDim }}>Health insurance saved:</span>
                        <span style={{ color: COLORS.green, fontFamily: "'JetBrains Mono', monospace" }}>
                          +{fmtFull(Math.round(monthlyHealthSavings))}/mo
                          <span style={{ color: COLORS.textDim, fontSize: 10, marginLeft: 4 }}>(+{fmtFull(effectiveHealthSavings)}/yr)</span>
                        </span>
                      </div>
                      {familyMonths > 0 && (
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 6, paddingTop: 4, borderTop: `1px solid ${COLORS.bgCard}` }}>
                          <span style={{ color: COLORS.textDim }}>Lost {label} ({familyMonths} mo w/ twins):</span>
                          <span style={{ color: COLORS.red, fontFamily: "'JetBrains Mono', monospace" }}>-{fmtFull(familyRate)}/mo</span>
                        </div>
                      )}
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 2 }}>
                        <span style={{ color: COLORS.textDim }}>Lost {label} (after twins age out):</span>
                        <span style={{ color: COLORS.red, fontFamily: "'JetBrains Mono', monospace" }}>-{fmtFull(personalRate)}/mo</span>
                      </div>
                      {lostBackPayMonthly > 0 && (
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginTop: 2 }}>
                          <span style={{ color: COLORS.textDim }}>Lost SSDI back pay (net of fee, amortized over 6yr):</span>
                          <span style={{ color: COLORS.red, fontFamily: "'JetBrains Mono', monospace" }}>-{fmtFull(lostBackPayMonthly)}/mo</span>
                        </div>
                      )}
                      {familyMonths > 0 && (
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 4, paddingTop: 4, borderTop: `1px solid ${COLORS.border}`, fontWeight: 600 }}>
                          <span style={{ color: netColorFamily }}>Net vs {label} (first {familyMonths} mo):</span>
                          <span style={{ color: netColorFamily, fontFamily: "'JetBrains Mono', monospace" }}>{netImpactFamily >= 0 ? '+' : ''}{fmtFull(netImpactFamily)}/mo</span>
                        </div>
                      )}
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
                  {/* D6a (remediation 2026-06-09): kids age-out is CALENDAR-ANCHORED to the
                      twins' 18th birthday (TWINS_AGE_OUT_MONTH) since FIX #8 — the old slider
                      had zero engine effect across its whole range, so it's now a read-only
                      derived display. (The legacy kidsAgeOutMonths field still bounds
                      auxiliary back-pay months and is kept on state.) */}
                  {(() => {
                    const approval = ssdiApprovalMonth ?? 7;
                    const familyWindowMonths = Math.max(0, TWINS_AGE_OUT_MONTH - approval);
                    return (
                      <div data-testid="income-kids-age-out-display" style={{ marginTop: 6, paddingTop: 6, borderTop: `1px solid ${COLORS.border}` }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                          <span style={{ color: COLORS.textDim }}>Kids age out (calendar):</span>
                          <span style={{ color: COLORS.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>
                            {getMonthLabel(TWINS_AGE_OUT_MONTH)} (m{TWINS_AGE_OUT_MONTH})
                          </span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginTop: 2 }}>
                          <span style={{ color: COLORS.textDim }}>Family rate window (after approval m{approval}):</span>
                          <span style={{ color: COLORS.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>{familyWindowMonths} mo</span>
                        </div>
                        <div style={{ fontSize: 10, color: COLORS.borderLight, marginTop: 4, fontStyle: "italic" }}>
                          Anchored to the twins' 18th birthday — not adjustable. SSDI pays the family total until then, the personal rate after.
                        </div>
                      </div>
                    );
                  })()}
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
              const projMonths = (chadWorkMonths || 72);
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

            {!hideTrust && (
            <div style={{ marginTop: 12, padding: "10px 12px", background: COLORS.bgDeep, borderRadius: 8, border: `1px solid ${COLORS.border}` }}>
              <h4 style={{ fontSize: 11, color: COLORS.purple, margin: "0 0 8px", letterSpacing: "0.05em" }}>Trust / LLC Income</h4>
              <Slider label="Current monthly" value={trustIncomeNow} onChange={set('trustIncomeNow')} commitStrategy={commitStrategy} min={0} max={3000} step={50} color={COLORS.purple} />
              <Slider label="After increase" value={trustIncomeFuture} onChange={set('trustIncomeFuture')} commitStrategy={commitStrategy} min={0} max={5000} step={50} color={COLORS.purple} />
              <Slider label="Increase at month" value={trustIncreaseMonth} onChange={set('trustIncreaseMonth')} commitStrategy={commitStrategy} min={3} max={24} format={(v) => v + " mo"} color={COLORS.purple} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginTop: 4, color: COLORS.textDim }}>
                <span>Annual: {fmtFull(trustIncomeNow * 12)} → {fmtFull(trustIncomeFuture * 12)}</span>
              </div>
            </div>
            )}

            {!hideVan && (() => {
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

            {ssType === 'ssdi' && !chadJob && (() => {
              // Auxiliary (kids') back-pay mirror of FinancialModel.jsx / projection.js —
              // the displayed gross INCLUDES the kids' share, so the label math must too
              // (remediation phase 5: label said "months × personal" but showed adult + aux).
              const ssdiAuxBackPayMonths = Math.min(ssdiBackPayMonths, kidsAgeOutMonths || 0);
              const ssdiAuxMonthly = Math.max(0, (ssdiFamilyTotal || 0) - ssdiPersonal);
              const ssdiAuxBackPayGross = ssdiAuxBackPayMonths * ssdiAuxMonthly;
              return (
            <div style={{ marginTop: 12, padding: "10px 12px", background: COLORS.bgDeep, borderRadius: 8, border: `1px solid ${COLORS.border}` }}>
              <h4 style={{ fontSize: 11, color: COLORS.green, margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>SSDI Back Pay (Lump Sum)</h4>
              <Slider label="Back pay months" value={ssdiBackPayMonths} onChange={set('ssdiBackPayMonths')} commitStrategy={commitStrategy} min={6} max={48} color={COLORS.green} format={(v) => v + " mo"} />
              <Slider label="SSDI approval (months out)" value={ssdiApprovalMonth} onChange={set('ssdiApprovalMonth')} commitStrategy={commitStrategy} min={0} max={36} color={COLORS.green} format={(v) => v + " mo"} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 6 }}>
                <span style={{ color: COLORS.textDim }}>
                  Gross ({ssdiBackPayMonths} × {fmtFull(ssdiPersonal)}{ssdiAuxBackPayGross > 0 ? ` + ${ssdiAuxBackPayMonths} × ${fmtFull(ssdiAuxMonthly)} kids` : ''}):
                </span>
                <span style={{ color: COLORS.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>{fmtFull(ssdiBackPayGross)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 2 }}>
                <span style={{ color: COLORS.textDim }}>Attorney fee (25% of worker share, capped):</span>
                <span style={{ color: COLORS.red, fontFamily: "'JetBrains Mono', monospace" }}>-{fmtFull(ssdiAttorneyFee)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginTop: 4, paddingTop: 4, borderTop: `1px solid ${COLORS.border}`, fontWeight: 700 }}>
                <span style={{ color: COLORS.green }}>Net lump sum:</span>
                <span style={{ color: COLORS.green, fontFamily: "'JetBrains Mono', monospace" }}>{fmtFull(ssdiBackPayActual)}</span>
              </div>
            </div>
              );
            })()}
          </div>
  );
};

export default memo(IncomeControls);
