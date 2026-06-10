import React, { memo } from "react";
import Slider from '../components/Slider.jsx';
import Toggle from '../components/Toggle.jsx';
import { fmtFull } from '../model/formatters.js';
import { useRenderMetric } from '../testing/perfMetrics.js';
import { COLORS } from '../charts/chartUtils.js';
// Toggle still used for capital needs

const ExpenseControls = ({
  totalMonthlySpend, baseExpenses, debtService,
  debts, mortgagePI, mortgageBalance, mortgageRate, // 6.3 (2026-06-10, D5)
  expenseInflation, expenseInflationRate, ssColaRate,
  bcsAnnualTotal, bcsParentsAnnual, bcsYearsLeft, bcsFamilyMonthly,
  collegeCostPerKidMonthly, collegeStartMonth, collegeMonths, college529Balance,
  vanMonthlySavings,
  milestones,
  moldCost, moldInclude, roofCost, roofInclude, otherProjects, otherInclude,
  totalProjectionMonths,
  hideCapital = false,
  onFieldChange,
}) => {
  useRenderMetric('ExpenseControls');
  const set = onFieldChange;
  const commitStrategy = 'release';

  return (
          <div data-testid="expense-controls" style={{
            background: COLORS.bgCard, borderRadius: 12, padding: 20,
            border: `1px solid ${COLORS.border}`
          }}>
            <h3 style={{ fontSize: 14, color: COLORS.red, margin: "0 0 12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Expense Assumptions
            </h3>

            {/* Total monthly spend input */}
            <div style={{ marginBottom: 12, padding: "8px 10px", background: COLORS.bgDeep, borderRadius: 6, border: `1px solid ${COLORS.border}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, marginBottom: 6 }}>
                <span style={{ color: COLORS.textMuted }}>Actual total spend (all accounts):</span>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ color: COLORS.textDim, fontSize: 11 }}>$</span>
                  <input
                    type="number"
                    value={totalMonthlySpend ?? ''}
                    placeholder={String(Math.round(baseExpenses + debtService + bcsFamilyMonthly + vanMonthlySavings))}
                    onChange={(e) => {
                      const v = e.target.value;
                      set('totalMonthlySpend')(v === '' ? null : Math.round(Number(v)));
                    }}
                    data-testid="expense-total-monthly-spend"
                    aria-label="Total monthly spend from all accounts"
                    style={{
                      width: 80, background: COLORS.bgCard, border: `1px solid ${totalMonthlySpend != null ? COLORS.blue : COLORS.border}`,
                      borderRadius: 4, color: totalMonthlySpend != null ? COLORS.blue : COLORS.textDim,
                      padding: "3px 6px", fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
                      textAlign: "right", outline: "none",
                    }}
                  />
                  {totalMonthlySpend != null && (
                    <button
                      onClick={() => set('totalMonthlySpend')(null)}
                      aria-label="Clear total monthly spend"
                      style={{ background: "transparent", border: "none", color: COLORS.textDim, fontSize: 10, cursor: "pointer", padding: "2px 4px" }}
                    >✕</button>
                  )}
                </div>
              </div>
            </div>

            {/* Expense Inflation */}
            <div style={{ marginBottom: 8, padding: "10px 12px", background: COLORS.bgDeep, borderRadius: 8, border: `1px solid ${COLORS.border}` }}>
              <h4 style={{ fontSize: 11, color: COLORS.cyan, margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Expense Inflation</h4>
              <Toggle
                label="Apply annual inflation to base expenses"
                description="Base living expenses grow each year. Debt, van, and BCS are fixed contracts."
                checked={expenseInflation}
                onChange={set('expenseInflation')}
                color={COLORS.cyan}
                testId="expense-inflation-toggle"
              />
              {expenseInflation && (
                <>
                  <Slider label="Annual inflation rate" value={expenseInflationRate} onChange={set('expenseInflationRate')} commitStrategy={commitStrategy} min={0} max={10} step={0.5} color={COLORS.cyan} format={(v) => v + '%'} />
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginTop: 4, color: COLORS.textDim }}>
                    <span>Y1 base expenses:</span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", color: COLORS.cyan }}>
                      {fmtFull(Math.round(baseExpenses * (1 + expenseInflationRate / 100)))}/mo
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginTop: 2, color: COLORS.textDim }}>
                    <span>Y6 base expenses:</span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", color: COLORS.cyan }}>
                      {fmtFull(Math.round(baseExpenses * Math.pow(1 + expenseInflationRate / 100, 6)))}/mo
                    </span>
                  </div>
                  {/* A2 (2026-06-10): SS COLA — benefits are indexed by law, so while
                      expenses inflate the SS/SSDI/spousal streams get a COLA too. */}
                  <Slider label="SS/SSDI COLA rate" value={ssColaRate} onChange={set('ssColaRate')} commitStrategy={commitStrategy} min={0} max={4} step={0.1} color={COLORS.cyan} format={(v) => v + '%'} />
                  <div style={{ fontSize: 10, color: COLORS.textDim, marginTop: 2, fontStyle: "italic" }}>
                    Applied to all SS/SSDI benefit streams while inflation is on (benefits are indexed by law).
                  </div>
                </>
              )}
            </div>

            {/* Debts (6.3 — remediation 2026-06-10, improvement a-5, gate D5).
                List-editor follows the Expense Milestones pattern below. An
                empty list keeps the flat debtService exactly; entries replace
                it with real amortization (payments stop at payoff). */}
            <div style={{ marginTop: 8, padding: "10px 12px", background: COLORS.bgDeep, borderRadius: 8, border: `1px solid ${COLORS.border}` }} data-testid="expense-debts">
              <h4 style={{ fontSize: 11, color: COLORS.red, margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Debts (amortized)</h4>
              {(debts || []).length > 0 && (
                <div style={{ display: "flex", gap: 6, fontSize: 9, color: COLORS.textDim, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>
                  <span style={{ flex: 2 }}>Name</span>
                  <span style={{ flex: 1.4, textAlign: "right" }}>Balance</span>
                  <span style={{ flex: 0.9, textAlign: "right" }}>APR %</span>
                  <span style={{ flex: 1.2, textAlign: "right" }}>Payment/mo</span>
                  <span style={{ width: 24 }} />
                </div>
              )}
              {(debts || []).map((d, i) => {
                const upd = (patch) => { const u = [...debts]; u[i] = { ...u[i], ...patch }; set('debts')(u); };
                const numInput = (field, value, testId, ariaLabel, flexVal) => (
                  <input
                    type="number" value={value ?? 0}
                    data-testid={testId}
                    aria-label={ariaLabel}
                    onChange={(e) => upd({ [field]: e.target.value === '' ? 0 : Number(e.target.value) })}
                    style={{ flex: flexVal, minWidth: 0, background: COLORS.bgCard, border: `1px solid ${COLORS.border}`, borderRadius: 4, color: COLORS.textSecondary, padding: "4px 6px", fontSize: 11, fontFamily: "'JetBrains Mono', monospace", textAlign: "right", outline: "none" }}
                  />
                );
                return (
                  <div key={d.id || i} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
                    <input
                      type="text" value={d.name}
                      data-testid={`expense-debt-name-${i}`}
                      aria-label={`Debt ${i + 1} name`}
                      onChange={(e) => upd({ name: e.target.value })}
                      style={{ flex: 2, minWidth: 0, background: COLORS.bgCard, border: `1px solid ${COLORS.border}`, borderRadius: 4, color: COLORS.textSecondary, padding: "4px 6px", fontSize: 11, fontFamily: "'Inter', sans-serif", outline: "none" }}
                    />
                    {numInput('balance', d.balance, `expense-debt-balance-${i}`, `Debt ${i + 1} balance`, 1.4)}
                    {numInput('apr', d.apr, `expense-debt-apr-${i}`, `Debt ${i + 1} APR`, 0.9)}
                    {numInput('payment', d.payment, `expense-debt-payment-${i}`, `Debt ${i + 1} monthly payment`, 1.2)}
                    <button
                      onClick={() => set('debts')(debts.filter((_, j) => j !== i))}
                      data-testid={`expense-debt-delete-${i}`}
                      aria-label={`Delete debt ${i + 1}`}
                      style={{ background: "transparent", border: `1px solid ${COLORS.border}`, borderRadius: 4, color: COLORS.textDim, fontSize: 10, padding: "2px 6px", cursor: "pointer" }}
                    >✕</button>
                  </div>
                );
              })}
              <button
                onClick={() => set('debts')([...(debts || []), { id: `debt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, name: "New debt", balance: 10000, apr: 10, payment: 500 }])}
                data-testid="expense-add-debt"
                aria-label="Add debt"
                style={{ background: "transparent", border: `1px dashed ${COLORS.border}`, borderRadius: 4, color: COLORS.textDim, fontSize: 11, padding: "4px 10px", cursor: "pointer", width: "100%", marginTop: 4, fontFamily: "'Inter', sans-serif" }}
              >+ Add debt</button>
              <div style={{ fontSize: 10, color: COLORS.textDim, marginTop: 6, fontStyle: "italic" }}>
                {(debts || []).some((d) => (d.balance || 0) > 0 && (d.payment || 0) > 0)
                  ? "Per-debt amortization active — the flat debt-service amount is ignored. Each payment stops automatically at payoff."
                  : <>Empty list = the flat {fmtFull(debtService)}/mo debt service runs for the <b>entire horizon</b> (phantom payments after real payoff). Add each real debt (balance, APR, payment) so payments stop at payoff. <b>Chad: enter the real numbers from the statements.</b></>}
              </div>
            </div>

            {/* Mortgage P&I split (6.3 — improvement b-12, gate D5). Carved out
                of the inflating base; principal credits home equity. */}
            <div style={{ marginTop: 8, padding: "10px 12px", background: COLORS.bgDeep, borderRadius: 8, border: `1px solid ${COLORS.border}` }} data-testid="expense-mortgage">
              <h4 style={{ fontSize: 11, color: COLORS.blue, margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Mortgage P&amp;I Split</h4>
              <Slider label="Monthly P&I (within base expenses)" value={mortgagePI} onChange={set('mortgagePI')} commitStrategy={commitStrategy} min={0} max={15000} step={50} color={mortgagePI > 0 ? COLORS.blue : COLORS.border} />
              {mortgagePI > 0 && (
                <>
                  <Slider label="Mortgage balance" value={mortgageBalance} onChange={set('mortgageBalance')} commitStrategy={commitStrategy} min={0} max={2000000} step={10000} color={COLORS.blue} />
                  <Slider label="Mortgage rate (APR)" value={mortgageRate} onChange={set('mortgageRate')} commitStrategy={commitStrategy} min={0} max={12} step={0.125} color={COLORS.blue} format={(v) => v + '%'} />
                </>
              )}
              <div style={{ fontSize: 10, color: COLORS.textDim, marginTop: 4, fontStyle: "italic" }}>
                {mortgagePI > 0
                  ? (mortgageBalance > 0
                    ? "P&I is excluded from expense inflation; the principal portion is credited to home equity each month and the payment stops at payoff."
                    : "P&I is excluded from expense inflation. Add the balance + rate so principal credits home equity and the payment stops at payoff.")
                  : <>At $0 the entire base inflates (pre-split behavior). Set your fixed P&amp;I so it stops inflating and principal counts as saving. <b>Chad: enter the real numbers later.</b></>}
              </div>
            </div>

            {/* BCS Tuition */}
            <div style={{ marginTop: 8, padding: "10px 12px", background: COLORS.bgDeep, borderRadius: 8, border: `1px solid ${COLORS.border}` }}>
              <h4 style={{ fontSize: 11, color: COLORS.purple, margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>BCS Tuition</h4>
              <Slider label="Total annual tuition" value={bcsAnnualTotal} onChange={set('bcsAnnualTotal')} commitStrategy={commitStrategy} min={30000} max={50000} step={1000} color={COLORS.purple} />
              <Slider label="Parents pay annually" value={bcsParentsAnnual} onChange={set('bcsParentsAnnual')} commitStrategy={commitStrategy} min={0} max={bcsAnnualTotal} step={1000} color={COLORS.purple} />
              <Slider label="Years remaining" value={bcsYearsLeft} onChange={set('bcsYearsLeft')} commitStrategy={commitStrategy} min={0.5} max={5} step={0.5} format={(v) => v + " yrs"} color={COLORS.purple} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginTop: 4, color: COLORS.textDim }}>
                <span>Family share:</span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", color: bcsFamilyMonthly > 0 ? COLORS.red : COLORS.green }}>
                  {bcsFamilyMonthly > 0 ? fmtFull(bcsFamilyMonthly) + "/mo" : "Fully covered"}
                </span>
              </div>
            </div>

            {/* Twins' College (6.2 — remediation 2026-06-10, D4). Tuition for
                BOTH twins; the "Twins to college" milestone below stays the
                separate household-savings side of the same event. */}
            <div style={{ marginTop: 8, padding: "10px 12px", background: COLORS.bgDeep, borderRadius: 8, border: `1px solid ${COLORS.border}` }}>
              <h4 style={{ fontSize: 11, color: COLORS.purple, margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Twins' College</h4>
              <Slider label="Cost per kid" value={collegeCostPerKidMonthly} onChange={set('collegeCostPerKidMonthly')} commitStrategy={commitStrategy} min={0} max={8000} step={50} color={COLORS.purple} format={(v) => fmtFull(v) + "/mo"} />
              <Slider label="Start month" value={collegeStartMonth} onChange={set('collegeStartMonth')} commitStrategy={commitStrategy} min={0} max={totalProjectionMonths || 144} format={(v) => v + "mo"} color={COLORS.purple} />
              <Slider label="Duration" value={collegeMonths} onChange={set('collegeMonths')} commitStrategy={commitStrategy} min={0} max={72} step={6} format={(v) => v + "mo"} color={COLORS.purple} />
              <Slider label="529 balance (draws first)" value={college529Balance} onChange={set('college529Balance')} commitStrategy={commitStrategy} min={0} max={500000} step={5000} color={COLORS.purple} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginTop: 4, color: COLORS.textDim }}>
                <span>Both twins:</span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", color: collegeCostPerKidMonthly > 0 && collegeMonths > 0 ? COLORS.red : COLORS.green }}>
                  {collegeCostPerKidMonthly > 0 && collegeMonths > 0
                    ? `${fmtFull(2 * collegeCostPerKidMonthly)}/mo × ${collegeMonths}mo`
                    : "Off"}
                </span>
              </div>
              <div style={{ fontSize: 10, color: COLORS.textDim, marginTop: 2, fontStyle: "italic" }}>
                529 covers tuition dollar-for-dollar until empty; the remainder hits monthly expenses.
              </div>
            </div>

            {/* Expense Milestones */}
            <div style={{ marginTop: 12, padding: "10px 12px", background: COLORS.bgDeep, borderRadius: 8, border: `1px solid ${COLORS.border}` }}>
              <h4 style={{ fontSize: 11, color: COLORS.textMuted, margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Expense Milestones</h4>
              {milestones.map((ms, i) => (
                <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
                  <input
                    type="text" value={ms.name}
                    data-testid={`expense-milestone-name-${i}`}
                    aria-label={`Milestone ${i + 1} name`}
                    onChange={(e) => { const u = [...milestones]; u[i] = {...u[i], name: e.target.value}; set('milestones')(u); }}
                    style={{ flex: 2, background: COLORS.bgCard, border: `1px solid ${COLORS.border}`, borderRadius: 4, color: COLORS.textSecondary, padding: "4px 6px", fontSize: 11, fontFamily: "'Inter', sans-serif", outline: "none" }}
                  />
                  <div style={{ flex: 1 }}>
                    <Slider label="" value={ms.month} onChange={(v) => { const u = [...milestones]; u[i] = {...u[i], month: v}; set('milestones')(u); }}
                      commitStrategy={commitStrategy}
                      testId={`expense-milestone-month-${i}`}
                      ariaLabel={`Milestone ${i + 1} month`}
                      min={3} max={totalProjectionMonths || 144} format={(v) => v + "mo"} color={COLORS.textMuted} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <Slider label="" value={ms.savings} onChange={(v) => { const u = [...milestones]; u[i] = {...u[i], savings: v}; set('milestones')(u); }}
                      commitStrategy={commitStrategy}
                      testId={`expense-milestone-savings-${i}`}
                      ariaLabel={`Milestone ${i + 1} savings`}
                      min={0} max={5000} step={100} color={COLORS.green} />
                  </div>
                  <span style={{ fontSize: 10, color: COLORS.green, fontFamily: "'JetBrains Mono', monospace", whiteSpace: "nowrap", minWidth: 55, textAlign: "right" }}>
                    -{fmtFull(ms.savings)}
                  </span>
                  <button
                    onClick={() => set('milestones')(milestones.filter((_, j) => j !== i))}
                    data-testid={`expense-milestone-delete-${i}`}
                    aria-label={`Delete milestone ${i + 1}`}
                    style={{ background: "transparent", border: `1px solid ${COLORS.border}`, borderRadius: 4, color: COLORS.textDim, fontSize: 10, padding: "2px 6px", cursor: "pointer" }}
                  >✕</button>
                </div>
              ))}
              <button
                onClick={() => set('milestones')([...milestones, { name: "New event", month: 24, savings: 500 }])}
                data-testid="expense-add-milestone"
                aria-label="Add milestone"
                style={{ background: "transparent", border: `1px dashed ${COLORS.border}`, borderRadius: 4, color: COLORS.textDim, fontSize: 11, padding: "4px 10px", cursor: "pointer", width: "100%", marginTop: 4, fontFamily: "'Inter', sans-serif" }}
              >+ Add milestone</button>
            </div>

            {/* Capital needs (legacy UI; hidden when hideCapital=true, e.g. in the Plan tab where CapitalItemsPanel is the new home) */}
            {!hideCapital && (
            <div style={{ marginTop: 12 }}>
              <h4 style={{ fontSize: 12, color: COLORS.yellow, margin: "0 0 8px", textTransform: "uppercase" }}>One-Time Capital Needs (Advance Items)</h4>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Toggle label="" checked={moldInclude} onChange={set('moldInclude')} color={COLORS.yellow} testId="expense-mold-include" ariaLabel="Include mold remediation" />
                <div style={{ flex: 1, opacity: moldInclude ? 1 : 0.4 }}>
                  <Slider label="Mold remediation" value={moldCost} onChange={set('moldCost')} commitStrategy={commitStrategy} min={20000} max={100000} step={5000} color={moldInclude ? COLORS.yellow : COLORS.border} />
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Toggle label="" checked={roofInclude} onChange={set('roofInclude')} color={COLORS.yellow} testId="expense-roof-include" ariaLabel="Include roof project" />
                <div style={{ flex: 1, opacity: roofInclude ? 1 : 0.4 }}>
                  <Slider label="Roof" value={roofCost} onChange={set('roofCost')} commitStrategy={commitStrategy} min={20000} max={60000} step={5000} color={roofInclude ? COLORS.yellow : COLORS.border} />
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Toggle label="" checked={otherInclude} onChange={set('otherInclude')} color={COLORS.yellow} testId="expense-other-projects-include" ariaLabel="Include house projects and toilets" />
                <div style={{ flex: 1, opacity: otherInclude ? 1 : 0.4 }}>
                  <Slider label="House projects + toilets" value={otherProjects} onChange={set('otherProjects')} commitStrategy={commitStrategy} min={10000} max={60000} step={5000} color={otherInclude ? COLORS.yellow : COLORS.border} />
                </div>
              </div>
            </div>
            )}
          </div>
  );
};

export default memo(ExpenseControls);
