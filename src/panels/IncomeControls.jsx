import React, { memo } from "react";
import Slider from '../components/Slider.jsx';
import Toggle from '../components/Toggle.jsx';
import { fmtFull } from '../model/formatters.js';
import { SGA_LIMIT, ssAdjustmentFactor, TWINS_AGE_OUT_MONTH, SS_FRA, SS_START_OFFSET, SS_EARNINGS_LIMIT_ANNUAL, SS_EARNINGS_LIMIT_FRA_YEAR } from '../model/constants.js';
import { getMonthLabel } from '../model/checkIn.js';
import { COLORS } from '../charts/chartUtils.js';
import { useRenderMetric } from '../testing/perfMetrics.js';
import { computeChadPensionMonthly } from '../model/chadLevels.js';
import { computeW2Diagnostic } from '../model/w2Diagnostic.js';
import Age65VestBlock from './blocks/Age65VestBlock.jsx';
import VestScheduleMatrix from './blocks/VestScheduleMatrix.jsx';
import W2NetDiagnostic from './blocks/W2NetDiagnostic.jsx';

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
  // Only the values consumed directly by this component are aliased here;
  // the full diagnostic display lives in blocks/W2NetDiagnostic.jsx and
  // receives the whole _w2 object (Phase 7 file-size split).
  const w2TotalAvgMo = _w2.totalAvgMo;
  // chadJobMonthlyNet preserved for legacy display callers.
  const chadJobMonthlyNet = _w2.salaryNetMo;
  const monthlyHealthSavings = _w2.monthlyHealthSavings;
  // B3 (remediation 2026-06-10): statutory limit imported from the SSA limits table — no hardcoded duplicate.
  const ssEarningsLimit = SS_EARNINGS_LIMIT_ANNUAL;
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
                      in some Plan-tab columns). Extracted to blocks/Age65VestBlock.jsx. */}
                  <Age65VestBlock
                    chadCurrentAge={chadCurrentAge}
                    chadWorkMonths={chadWorkMonths}
                    chadAge65VestOverride={chadAge65VestOverride}
                    chadJobStartMonth={chadJobStartMonth}
                    chadJobRefreshStartMonth={chadJobRefreshStartMonth}
                    chadJobStockRefresh={chadJobStockRefresh}
                    chadJobSalary={chadJobSalary}
                    chadL64Enabled={chadL64Enabled} chadL64Month={chadL64Month} chadL64Salary={chadL64Salary} chadL64StockRefresh={chadL64StockRefresh} chadL64BonusPct={chadL64BonusPct}
                    chadL65Enabled={chadL65Enabled} chadL65Month={chadL65Month} chadL65Salary={chadL65Salary} chadL65StockRefresh={chadL65StockRefresh} chadL65BonusPct={chadL65BonusPct}
                    msftPrice={msftPrice} msftGrowth={msftGrowth}
                    effectiveTaxRate={effectiveTaxRate}
                    commitStrategy={commitStrategy}
                    onFieldChange={set}
                  />

                  {/* Vest schedule matrix — year × grant table showing when each
                      RSU refresh grant vests and how much. Always visible when Chad
                      has a job and at least one grant is configured. Extracted to
                      blocks/VestScheduleMatrix.jsx (renders null with no grants). */}
                  <VestScheduleMatrix
                    chadJobStartMonth={chadJobStartMonth}
                    chadWorkMonths={chadWorkMonths}
                    chadJobRefreshStartMonth={chadJobRefreshStartMonth}
                    chadJobStockRefresh={chadJobStockRefresh}
                    chadJobSalary={chadJobSalary}
                    chadCurrentAge={chadCurrentAge}
                    chadAge65VestOverride={chadAge65VestOverride}
                    chadL64Enabled={chadL64Enabled} chadL64Month={chadL64Month} chadL64Salary={chadL64Salary} chadL64StockRefresh={chadL64StockRefresh} chadL64BonusPct={chadL64BonusPct}
                    chadL65Enabled={chadL65Enabled} chadL65Month={chadL65Month} chadL65Salary={chadL65Salary} chadL65StockRefresh={chadL65StockRefresh} chadL65BonusPct={chadL65BonusPct}
                    msftPrice={msftPrice} msftGrowth={msftGrowth}
                    effectiveTaxRate={effectiveTaxRate}
                    chadJobNoFICA={chadJobNoFICA}
                  />

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
                    // chadJobHealthSavings is $/month (the family's real $4,200/mo private
                    // premium — confirmed 2026-06-10), matching the engine's monthly subtraction.
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
                          All numeric values come from the shared _w2 object (computeW2Diagnostic)
                          so the diagnostic display and the SSDI comparison always show the same
                          numbers. Extracted to blocks/W2NetDiagnostic.jsx (Phase 7 file split). */}
                      <W2NetDiagnostic
                        w2={_w2}
                        chadJobSalary={chadJobSalary}
                        chadJobNoFICA={chadJobNoFICA}
                        chadJobPensionRate={chadJobPensionRate}
                        chadJobPensionContrib={chadJobPensionContrib}
                        chadJob401kEnabled={chadJob401kEnabled}
                        chadJob401kDeferral={chadJob401kDeferral}
                        chadJob401kCatchupRoth={chadJob401kCatchupRoth}
                        chadJob401kMatch={chadJob401kMatch}
                        chadL64Enabled={chadL64Enabled} chadL64Month={chadL64Month} chadL64Salary={chadL64Salary} chadL64StockRefresh={chadL64StockRefresh} chadL64BonusPct={chadL64BonusPct}
                        chadL65Enabled={chadL65Enabled} chadL65Month={chadL65Month} chadL65Salary={chadL65Salary} chadL65StockRefresh={chadL65StockRefresh} chadL65BonusPct={chadL65BonusPct}
                        msftGrowth={msftGrowth}
                        effectiveTaxRate={effectiveTaxRate}
                        chadTaxBreakdown={chadTaxBreakdown}
                        onFieldChange={set}
                      />
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 2 }}>
                        <span style={{ color: COLORS.textDim }}>Health insurance saved:</span>
                        <span style={{ color: COLORS.green, fontFamily: "'JetBrains Mono', monospace" }}>
                          +{fmtFull(Math.round(monthlyHealthSavings))}/mo
                          <span style={{ color: COLORS.textDim, fontSize: 10, marginLeft: 4 }}>(+{fmtFull(Math.round(monthlyHealthSavings * 12))}/yr)</span>
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
                    : `Claiming ${SS_FRA - age}yr before FRA — earnings test applies until age ${SS_FRA}. Benefits reduced $1 for every $2 earned over $${SS_EARNINGS_LIMIT_ANNUAL.toLocaleString()}/yr ($${SS_EARNINGS_LIMIT_FRA_YEAR.toLocaleString()}/yr in FRA year).`
                  }
                </div>

                {chadJob && !atOrAfterFRA && (() => {
                  const salary = chadJobSalary || 80000;
                  const excess = Math.max(0, salary - SS_EARNINGS_LIMIT_ANNUAL);
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
                      SS earnings test: benefits reduced $1 for every $2 earned over ${SS_EARNINGS_LIMIT_ANNUAL.toLocaleString()}/yr before FRA.
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
