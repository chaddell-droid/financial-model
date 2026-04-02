import React, { memo } from "react";
import Slider from '../components/Slider.jsx';
import Toggle from '../components/Toggle.jsx';
import { fmtFull } from '../model/formatters.js';
import { useRenderMetric } from '../testing/perfMetrics.js';
import { COLORS } from '../charts/chartUtils.js';

const ExpenseControls = ({
  spendSchedule, oneTimeExpenses,
  baseExpenses, debtService,
  bcsAnnualTotal, bcsParentsAnnual, bcsYearsLeft, bcsFamilyMonthly,
  vanMonthlySavings,
  milestones,
  moldCost, moldInclude, roofCost, roofInclude, otherProjects, otherInclude,
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

            {/* Spend Schedule */}
            <div style={{ marginBottom: 12, padding: "10px 12px", background: COLORS.bgDeep, borderRadius: 8, border: `1px solid ${COLORS.border}` }}>
              <h4 style={{ fontSize: 11, color: COLORS.blue, margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Spend Schedule</h4>
              {spendSchedule.length === 0 && (
                <div style={{ fontSize: 11, color: COLORS.textDim, marginBottom: 6 }}>
                  Using base expenses directly ({fmtFull(baseExpenses)}/mo)
                </div>
              )}
              {spendSchedule.map((entry, i) => (
                <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
                  <div style={{ flex: 1 }}>
                    <Slider label="" value={entry.month} onChange={(v) => {
                      const u = [...spendSchedule]; u[i] = { ...u[i], month: v }; set('spendSchedule')(u);
                    }} commitStrategy={commitStrategy}
                      testId={`spend-schedule-month-${i}`}
                      ariaLabel={`Spend level ${i + 1} start month`}
                      min={0} max={72} format={(v) => `M${v}+`} color={COLORS.blue} />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ color: COLORS.textDim, fontSize: 11 }}>$</span>
                    <input
                      type="number"
                      value={entry.amount}
                      data-testid={`spend-schedule-amount-${i}`}
                      aria-label={`Spend level ${i + 1} amount`}
                      onChange={(e) => {
                        const v = Math.max(0, Math.round(Number(e.target.value) || 0));
                        const u = [...spendSchedule]; u[i] = { ...u[i], amount: v }; set('spendSchedule')(u);
                      }}
                      style={{
                        width: 80, background: COLORS.bgCard, border: `1px solid ${COLORS.blue}`,
                        borderRadius: 4, color: COLORS.blue,
                        padding: "3px 6px", fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
                        textAlign: "right", outline: "none",
                      }}
                    />
                  </div>
                  <button
                    onClick={() => set('spendSchedule')(spendSchedule.filter((_, j) => j !== i))}
                    data-testid={`spend-schedule-delete-${i}`}
                    aria-label={`Delete spend level ${i + 1}`}
                    style={{ background: "transparent", border: `1px solid ${COLORS.border}`, borderRadius: 4, color: COLORS.textDim, fontSize: 10, padding: "2px 6px", cursor: "pointer" }}
                  >✕</button>
                </div>
              ))}
              <button
                onClick={() => set('spendSchedule')([...spendSchedule, { month: spendSchedule.length > 0 ? (spendSchedule[spendSchedule.length - 1].month + 12) : 0, amount: 0 }])}
                data-testid="spend-schedule-add"
                aria-label="Add spend level"
                style={{ background: "transparent", border: `1px dashed ${COLORS.border}`, borderRadius: 4, color: COLORS.textDim, fontSize: 11, padding: "4px 10px", cursor: "pointer", width: "100%", marginTop: 4, fontFamily: "'Inter', sans-serif" }}
              >+ Add spend level</button>
            </div>

            {/* BCS Tuition */}
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
            </div>

            {/* One-Time Expenses */}
            <div style={{ marginTop: 12, padding: "10px 12px", background: COLORS.bgDeep, borderRadius: 8, border: `1px solid ${COLORS.border}` }}>
              <h4 style={{ fontSize: 11, color: COLORS.orange || '#f97316', margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>One-Time Expenses</h4>
              {oneTimeExpenses.map((evt, i) => (
                <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
                  <input
                    type="text" value={evt.name}
                    data-testid={`onetime-name-${i}`}
                    aria-label={`One-time expense ${i + 1} name`}
                    onChange={(e) => { const u = [...oneTimeExpenses]; u[i] = {...u[i], name: e.target.value}; set('oneTimeExpenses')(u); }}
                    style={{ flex: 2, background: COLORS.bgCard, border: `1px solid ${COLORS.border}`, borderRadius: 4, color: COLORS.textSecondary, padding: "4px 6px", fontSize: 11, fontFamily: "'Inter', sans-serif", outline: "none" }}
                  />
                  <div style={{ flex: 1 }}>
                    <Slider label="" value={evt.month} onChange={(v) => {
                      const u = [...oneTimeExpenses]; u[i] = {...u[i], month: v}; set('oneTimeExpenses')(u);
                    }} commitStrategy={commitStrategy}
                      testId={`onetime-month-${i}`}
                      ariaLabel={`One-time expense ${i + 1} month`}
                      min={0} max={72} format={(v) => `M${v}`} color={COLORS.orange || '#f97316'} />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ color: COLORS.textDim, fontSize: 11 }}>$</span>
                    <input
                      type="number"
                      value={evt.amount}
                      data-testid={`onetime-amount-${i}`}
                      aria-label={`One-time expense ${i + 1} amount`}
                      onChange={(e) => {
                        const v = Math.max(0, Math.round(Number(e.target.value) || 0));
                        const u = [...oneTimeExpenses]; u[i] = {...u[i], amount: v}; set('oneTimeExpenses')(u);
                      }}
                      style={{
                        width: 80, background: COLORS.bgCard, border: `1px solid ${COLORS.orange || '#f97316'}`,
                        borderRadius: 4, color: COLORS.orange || '#f97316',
                        padding: "3px 6px", fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
                        textAlign: "right", outline: "none",
                      }}
                    />
                  </div>
                  <button
                    onClick={() => set('oneTimeExpenses')(oneTimeExpenses.filter((_, j) => j !== i))}
                    data-testid={`onetime-delete-${i}`}
                    aria-label={`Delete one-time expense ${i + 1}`}
                    style={{ background: "transparent", border: `1px solid ${COLORS.border}`, borderRadius: 4, color: COLORS.textDim, fontSize: 10, padding: "2px 6px", cursor: "pointer" }}
                  >✕</button>
                </div>
              ))}
              {oneTimeExpenses.length > 0 && (
                <div style={{ display: "flex", justifyContent: "flex-end", fontSize: 11, marginBottom: 4, color: COLORS.textDim }}>
                  <span>Total: </span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", color: COLORS.orange || '#f97316', marginLeft: 4 }}>
                    {fmtFull(oneTimeExpenses.reduce((sum, e) => sum + (e.amount || 0), 0))}
                  </span>
                </div>
              )}
              <button
                onClick={() => set('oneTimeExpenses')([...oneTimeExpenses, { name: "New expense", month: 0, amount: 0 }])}
                data-testid="onetime-add"
                aria-label="Add one-time expense"
                style={{ background: "transparent", border: `1px dashed ${COLORS.border}`, borderRadius: 4, color: COLORS.textDim, fontSize: 11, padding: "4px 10px", cursor: "pointer", width: "100%", marginTop: 4, fontFamily: "'Inter', sans-serif" }}
              >+ Add one-time expense</button>
            </div>

            {/* Capital needs */}
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
