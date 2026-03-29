import React, { memo } from "react";
import Slider from '../components/Slider.jsx';
import Toggle from '../components/Toggle.jsx';
import { fmtFull } from '../model/formatters.js';
import { useRenderMetric } from '../testing/perfMetrics.js';
import { COLORS } from '../charts/chartUtils.js';

const CUT_ITEMS = [
  { key: 'cutOliver', label: 'Oliver support', was: 5832, max: 5832, sub: 'Sober living + transfers' },
  { key: 'cutVacation', label: 'Vacation + travel', was: 2040, max: 2040 },
  { key: 'cutMedical', label: 'Medical OOP', was: 4666, max: 4666, sub: 'Out-of-pocket (excl premiums)' },
  { key: 'cutShopping', label: 'Shopping + clothing', was: 2746, max: 2746 },
  { key: 'cutGroceries', label: 'Groceries', was: 1901, max: 1901, sub: 'Family of 5' },
  { key: 'cutPersonalCare', label: 'Personal care', was: 1166, max: 1166, sub: 'Salon, nails, cleaning' },
  { key: 'cutGym', label: 'Gym memberships', was: 655, max: 655 },
  { key: 'cutAmazon', label: 'Amazon + household', was: 563, max: 563 },
  { key: 'cutSaaS', label: 'AI / SaaS tools', was: 557, max: 557 },
  { key: 'cutEntertainment', label: 'Entertainment', was: 500, max: 500 },
  { key: 'cutSmallItems', label: 'Other small items', was: 2478, max: 2478, sub: 'Internet, dining, coffee, subs, cloud' },
];

const ExpenseControls = ({
  totalMonthlySpend, baseExpenses, debtService,
  debtCC, debtPersonal, debtIRS, debtFirstmark, debtTotal,
  retireDebt,
  lifestyleCutsApplied,
  cutOliver, cutVacation, cutShopping, cutMedical, cutGym, cutAmazon, cutSaaS,
  cutEntertainment, cutGroceries, cutPersonalCare, cutSmallItems,
  lifestyleCuts, cutInHalf, extraCuts,
  bcsAnnualTotal, bcsParentsAnnual, bcsYearsLeft, bcsFamilyMonthly,
  vanSold, vanMonthlySavings, vanSaleMonth,
  chadJob, chadJobStartMonth, chadJobHealthSavings,
  milestones,
  moldCost, moldInclude, roofCost, roofInclude, otherProjects, otherInclude,
  onFieldChange,
}) => {
  useRenderMetric('ExpenseControls');
  const set = onFieldChange;
  const totalCuts = lifestyleCuts + cutInHalf + extraCuts;
  const commitStrategy = 'release';

  const cutValues = { cutOliver, cutVacation, cutShopping, cutMedical, cutGym, cutAmazon, cutSaaS, cutEntertainment, cutGroceries, cutPersonalCare, cutSmallItems };

  return (
          <div data-testid="expense-controls" style={{
            background: COLORS.bgCard, borderRadius: 12, padding: 20,
            border: `1px solid ${COLORS.border}`
          }}>
            <h3 style={{ fontSize: 14, color: COLORS.red, margin: "0 0 12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Expense Assumptions
            </h3>
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
              {totalMonthlySpend != null && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginBottom: 4, color: COLORS.textDim }}>
                  <span>Base living (derived):</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    {fmtFull(Math.max(0, totalMonthlySpend - debtService - vanMonthlySavings - bcsFamilyMonthly))}
                  </span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, borderTop: `1px solid ${COLORS.border}`, paddingTop: 6 }}>
                <span style={{ color: COLORS.textMuted }}>Total monthly outflow:</span>
                <span style={{ color: COLORS.red, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
                  {fmtFull(Math.max(0, baseExpenses + (retireDebt ? 0 : debtService) + ((!vanSold || (vanSaleMonth ?? 12) > 0) ? vanMonthlySavings : 0) + (bcsYearsLeft > 0 ? bcsFamilyMonthly : 0) - (lifestyleCutsApplied ? totalCuts : 0) - (chadJob && (chadJobStartMonth ?? 0) <= 0 ? (chadJobHealthSavings || 0) : 0)))}
                </span>
              </div>
            </div>

            <div style={{ marginTop: 8, padding: "10px 12px", background: COLORS.bgDeep, borderRadius: 8, border: `1px solid ${COLORS.border}` }}>
              <h4 style={{ fontSize: 11, color: COLORS.red, margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Debt Service & Balances</h4>
              <Slider label="Total monthly debt payments" value={debtService} onChange={set('debtService')} commitStrategy={commitStrategy} min={0} max={20000} step={100} color={retireDebt ? COLORS.green : COLORS.red} helperText={retireDebt ? "Retired — not charged monthly" : "All minimum payments across all accounts"} />
              <div style={{ marginTop: 6, paddingTop: 6, borderTop: `1px solid ${COLORS.border}` }}>
                <div style={{ fontSize: 10, color: COLORS.textDim, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Balances (for advance calculation)</div>
                <Slider label="Credit cards (10 accts)" value={debtCC} onChange={set('debtCC')} commitStrategy={commitStrategy} min={0} max={150000} step={1000} color={retireDebt ? COLORS.green : COLORS.red} />
                <Slider label="Personal loans (Affirm/LC/AP)" value={debtPersonal} onChange={set('debtPersonal')} commitStrategy={commitStrategy} min={0} max={100000} step={1000} color={retireDebt ? COLORS.green : COLORS.red} />
                <Slider label="IRS back taxes" value={debtIRS} onChange={set('debtIRS')} commitStrategy={commitStrategy} min={0} max={30000} step={500} color={retireDebt ? COLORS.green : COLORS.red} />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginTop: 4, color: COLORS.textDim }}>
                  <span>Firstmark student loan (kept):</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{fmtFull(debtFirstmark)} @ $251/mo</span>
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 6, paddingTop: 6, borderTop: `1px solid ${COLORS.border}`, fontWeight: 700 }}>
                <span style={{ color: COLORS.textMuted }}>Total debt:</span>
                <span style={{ color: retireDebt ? COLORS.green : COLORS.red, fontFamily: "'JetBrains Mono', monospace" }}>{fmtFull(debtTotal)}</span>
              </div>
            </div>

            <div style={{ marginTop: 8, padding: "10px 12px", background: COLORS.bgDeep, borderRadius: 8, border: `1px solid ${COLORS.border}` }}>
              <h4 style={{ fontSize: 11, color: lifestyleCutsApplied ? COLORS.green : COLORS.red, margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Spending Cuts ({lifestyleCutsApplied ? "Applied" : "Not yet applied"})
              </h4>
              <div style={{ opacity: lifestyleCutsApplied ? 1 : 0.5 }}>
                {CUT_ITEMS.map(item => {
                  const val = cutValues[item.key];
                  const keep = item.was - val;
                  const pctCut = Math.round((val / item.was) * 100);
                  return (
                    <div key={item.key} style={{ marginBottom: 6 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                        <span style={{ fontSize: 11, color: COLORS.textMuted, flex: 1 }}>{item.label}</span>
                        <span style={{ fontSize: 9, color: COLORS.borderLight, fontFamily: "'JetBrains Mono', monospace" }}>was {fmtFull(item.was)}</span>
                      </div>
                      {/* Mini progress bar */}
                      <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", marginBottom: 2, background: COLORS.bgCard }}>
                        <div style={{ width: `${100 - pctCut}%`, background: COLORS.borderLight, transition: "width 0.2s" }} />
                        <div style={{ width: `${pctCut}%`, background: lifestyleCutsApplied ? COLORS.green : COLORS.border, transition: "width 0.2s" }} />
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, marginBottom: 1 }}>
                        <span style={{ color: COLORS.textDim }}>Keep: {fmtFull(keep)}</span>
                        <span style={{ color: lifestyleCutsApplied ? COLORS.green : COLORS.textDim }}>Cut: {fmtFull(val)}</span>
                      </div>
                      <Slider
                        label=""
                        hideHeader
                        value={val}
                        onChange={set(item.key)}
                        commitStrategy={commitStrategy}
                        min={0}
                        max={item.was}
                        step={50}
                        testId={`expense-cut-${item.key}`}
                        ariaLabel={`${item.label} cut amount`}
                        color={lifestyleCutsApplied ? COLORS.green : COLORS.border}
                      />
                      {item.sub && <div style={{ fontSize: 8, color: COLORS.borderLight, marginTop: 1 }}>{item.sub}</div>}
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 6, paddingTop: 6, borderTop: `1px solid ${COLORS.border}`, fontWeight: 700 }}>
                <span style={{ color: COLORS.textMuted }}>Total if applied:</span>
                <span style={{ color: lifestyleCutsApplied ? COLORS.green : COLORS.textDim, fontFamily: "'JetBrains Mono', monospace" }}>-{fmtFull(totalCuts)}/mo</span>
              </div>
            </div>

            <div style={{ marginTop: 8, padding: "10px 12px", background: COLORS.bgDeep, borderRadius: 8, border: `1px solid ${COLORS.border}` }}>
              <h4 style={{ fontSize: 11, color: COLORS.purple, margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>BCS Tuition</h4>
              <Slider label="Total annual tuition" value={bcsAnnualTotal} onChange={set('bcsAnnualTotal')} commitStrategy={commitStrategy} min={30000} max={50000} step={1000} color={COLORS.purple} />
              <Slider label="Parents pay annually" value={bcsParentsAnnual} onChange={set('bcsParentsAnnual')} commitStrategy={commitStrategy} min={0} max={bcsAnnualTotal} step={1000} color={COLORS.purple} />
              <Slider label="Years remaining" value={bcsYearsLeft} onChange={set('bcsYearsLeft')} commitStrategy={commitStrategy} min={1} max={5} format={(v) => v + " yrs"} color={COLORS.purple} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginTop: 4, color: COLORS.textDim }}>
                <span>Family share:</span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", color: bcsFamilyMonthly > 0 ? COLORS.red : COLORS.green }}>
                  {bcsFamilyMonthly > 0 ? fmtFull(bcsFamilyMonthly) + "/mo" : "Fully covered"}
                </span>
              </div>
            </div>

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
                      min={3} max={60} format={(v) => v + "mo"} color={COLORS.textMuted} />
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
              {milestones.length > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginTop: 6, paddingTop: 6, borderTop: `1px solid ${COLORS.border}` }}>
                  <span style={{ color: COLORS.textDim }}>Total reductions (all active):</span>
                  <span style={{ color: COLORS.green, fontFamily: "'JetBrains Mono', monospace" }}>-{fmtFull(milestones.reduce((s, m) => s + m.savings, 0))}/mo</span>
                </div>
              )}
            </div>

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
          </div>
  );
};

export default memo(ExpenseControls);
