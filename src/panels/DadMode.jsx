import React from 'react';
import { fmt, fmtFull } from '../model/formatters.js';
import Slider from '../components/Slider.jsx';
import Toggle from '../components/Toggle.jsx';
import ActionButton from '../components/ui/ActionButton.jsx';
import SurfaceCard from '../components/ui/SurfaceCard.jsx';
import { METRIC_LABELS, TIMEFRAME_LABELS } from '../content/uiGlossary.js';
import { UI_ACTION_VARIANTS, UI_COLORS, UI_SPACE, UI_TEXT } from '../ui/tokens.js';
import { useRenderMetric } from '../testing/perfMetrics.js';

export default function DadMode({
  // Dad-mode specific state
  dadMode, dadStep, dadDebtPct, dadBcsParents, dadMold, dadRoof, dadProjects,
  dadMcResult, dadBaselineBalance, dadProjection,
  // Financial state values referenced by the panel
  data, savingsData,
  debtTotal, debtService, debtCC, debtPersonal, debtIRS,
  bcsAnnualTotal, bcsYearsLeft,
  vanSold, vanMonthlySavings,
  lifestyleCutsApplied, lifestyleCuts, cutInHalf, extraCuts,
  cutOliver, cutVacation, cutShopping, cutMedical, cutGym,
  cutAmazon, cutSaaS, cutEntertainment, cutGroceries, cutPersonalCare, cutSmallItems,
  bcsFamilyMonthly, retireDebt,
  moldCost, roofCost, otherProjects,
  startingSavings,
  sarahMaxRate, sarahMaxClients,
  ssdiFamilyTotal, ssdiBackPayActual,
  chadConsulting,
  savingsZeroMonth,
  // Callbacks
  onFieldChange,
  onEnterDadMode,
  onExitDadMode,
}) {
  useRenderMetric('DadMode');
  const commitStrategy = 'release';
  const set = onFieldChange;

  // ── Local computations ──
  const familyCommitSavings = (vanSold ? vanMonthlySavings : 0) + (lifestyleCuts + cutInHalf + extraCuts);
  const currentGap = data[0].netCashFlow;
  const gapAfterCommit = currentGap + familyCommitSavings;
  const dadDebtAmount = Math.round(debtTotal * dadDebtPct / 100);
  const dadDebtMonthly = dadDebtPct > 0 ? Math.round(debtService * dadDebtPct / 100) : 0;
  const dadBcsFamilyMo = Math.round(Math.max(0, bcsAnnualTotal - dadBcsParents) / 12);
  const statusQuoBcsMo = Math.round(Math.max(0, bcsAnnualTotal - 25000) / 12);
  const dadBcsSavings = statusQuoBcsMo - dadBcsFamilyMo;
  const oneTime = dadDebtAmount + (dadMold ? moldCost : 0) + (dadRoof ? roofCost : 0) + (dadProjects ? otherProjects : 0);
  const ongoingAnnual = dadBcsParents > 25000 ? (dadBcsParents - 25000) : 0;

  // Interest cost: credit cards ~22% avg, personal loans ~18%, IRS ~8%
  const annualInterestBurned = Math.round(debtCC * 0.22 + debtPersonal * 0.18 + debtIRS * 0.08);
  const monthlyInterestBurned = Math.round(annualInterestBurned / 12);

  // Dad's solvency result
  const solv = dadMcResult;

  // Savings lines for chart
  const dadSavings = dadProjection?.savingsData || [];
  const baseSavings = dadBaselineBalance || [];

  // Chart computation
  const months = 72;
  const svgW = 700; const svgH = 200;
  const padL = 55; const padR = 80; const padT = 15; const padB = 25;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;
  // Lock Y-axis to baseline range so the green line visibly rises when dad helps
  const baseVals = baseSavings.map(d => d.balance);
  const dadVals = dadSavings.map(d => d.balance);
  const minB = Math.min(...baseVals, ...dadVals, -50000) * 1.1;
  // Max: always show at least baseline max, but grow if dad's projection exceeds it
  const maxB = Math.max(Math.max(...baseVals, 200000) * 1.5, ...dadVals) * 1.05;
  const chartRange = (maxB - minB) || 1;
  const xOf = (m) => padL + (m / months) * plotW;
  const yOf = (v) => padT + ((maxB - v) / chartRange) * plotH;

  const makePath = (pathData) => pathData.filter(d => d.month <= months).map((d, i) => `${i === 0 ? "M" : "L"} ${xOf(d.month).toFixed(1)},${yOf(d.balance).toFixed(1)}`).join(" ");
  const dadPath = makePath(dadSavings);
  const basePath = makePath(baseSavings);
  const dadFinal = dadSavings.find(d => d.month === months)?.balance || 0;
  const baseFinal = baseSavings.find(d => d.month === months)?.balance || 0;

  return (
    <div data-testid='dad-mode-root' style={{ maxWidth: 960, margin: '0 auto 24px', display: 'grid', gap: UI_SPACE.lg }}>
      <SurfaceCard
        data-testid='dad-mode-hero'
        tone='featured'
        padding='lg'
        style={{ borderColor: UI_COLORS.modeDad, background: 'rgba(245, 158, 11, 0.06)' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: UI_SPACE.lg, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: UI_TEXT.micro, color: UI_COLORS.modeDad, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
              Perspective
            </div>
            <h2 style={{ fontSize: 24, fontWeight: 700, color: UI_COLORS.textStrong, margin: 0 }}>Dad Mode</h2>
            <p style={{ fontSize: UI_TEXT.body, color: UI_COLORS.textMuted, margin: '8px 0 0', maxWidth: 760, lineHeight: 1.6 }}>
              Support-focused view of the shared family plan. This keeps the focus on the current gap, the changes already underway, and which support levers move the outcome most.
            </p>
          </div>
          <ActionButton
            data-testid='dad-mode-exit'
            onClick={() => set('dadMode')(false)}
            variant={UI_ACTION_VARIANTS.secondary}
            accent={UI_COLORS.modeDad}
          >
            Back to planner
          </ActionButton>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: UI_SPACE.md, marginTop: UI_SPACE.lg }}>
          <div>
            <div style={{ fontSize: UI_TEXT.micro, color: UI_COLORS.textDim, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
              {METRIC_LABELS.currentMonthlyGap}
            </div>
            <div style={{ fontSize: 24, color: data[0].netCashFlow >= 0 ? UI_COLORS.positive : UI_COLORS.destructive, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
              {fmtFull(data[0].netCashFlow)}/mo
            </div>
          </div>
          <div>
            <div style={{ fontSize: UI_TEXT.micro, color: UI_COLORS.textDim, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
              Family changes underway
            </div>
            <div style={{ fontSize: 24, color: UI_COLORS.positive, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
              +{fmtFull(familyCommitSavings)}/mo
            </div>
          </div>
          <div>
            <div style={{ fontSize: UI_TEXT.micro, color: UI_COLORS.textDim, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
              Reserve at {TIMEFRAME_LABELS.modelStart}
            </div>
            <div style={{ fontSize: 24, color: UI_COLORS.info, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
              {fmtFull(startingSavings)}
            </div>
          </div>
        </div>
      </SurfaceCard>

      {/* ACT 1 */}
      {dadStep >= 1 && (
        <SurfaceCard style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: UI_COLORS.textDim, marginBottom: 8 }}>
            Chad & Sarah · 3 kids at home · Kirkland, WA
          </div>
          <h3 style={{ fontSize: UI_TEXT.heading, color: UI_COLORS.textStrong, margin: '0 0 6px', fontWeight: 700 }}>
            What the plan is facing now
          </h3>
          <div style={{ fontSize: 13, color: UI_COLORS.textMuted, marginBottom: 16 }}>
            Right now, our family spends more than we earn every month.
          </div>
          <div style={{
            fontSize: 48, fontWeight: 700, color: UI_COLORS.destructive,
            fontFamily: "'JetBrains Mono', monospace", marginBottom: 4
          }}>
            {fmtFull(currentGap)}<span style={{ fontSize: 20 }}>/mo</span>
          </div>
          <div style={{ fontSize: 12, color: UI_COLORS.textDim, marginBottom: 20 }}>{METRIC_LABELS.currentMonthlyGap.toLowerCase()}</div>

          {/* Income vs Expense bar */}
          <div style={{ maxWidth: 500, margin: "0 auto 16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>
              <span>Income: {fmtFull(data[0].totalIncome - data[0].investReturn)}</span>
              <span>Expenses: {fmtFull(data[0].expenses)}</span>
            </div>
            <div style={{ height: 20, borderRadius: 10, background: "#0f172a", overflow: "hidden", position: "relative" }}>
              <div style={{
                height: "100%", width: `${Math.min(100, ((data[0].totalIncome - data[0].investReturn) / data[0].expenses) * 100)}%`,
                background: "linear-gradient(90deg, #4ade80, #22c55e)", borderRadius: 10
              }} />
              <div style={{
                position: "absolute", right: 0, top: 0, bottom: 0,
                width: `${100 - Math.min(100, ((data[0].totalIncome - data[0].investReturn) / data[0].expenses) * 100)}%`,
                background: "#f8717133", borderRadius: "0 10px 10px 0"
              }} />
            </div>
          </div>

          {/* Where the money goes */}
          {(() => {
            const totalExp = data[0].expenses;
            const cutsOn = lifestyleCutsApplied;
            const buckets = [
              { label: "Housing", amount: 6075 + 1229 + 782 + 608, sub: "Mortgage, utilities, rental prop, property tax", color: "#94a3b8" },
              { label: "Debt payments", amount: retireDebt ? 0 : debtService, sub: "10 CCs, personal loans, IRS", color: "#f87171" },
              { label: "Healthcare", amount: cutsOn ? (5158 - cutMedical) : 5158, sub: "Insurance premiums + out-of-pocket", color: "#60a5fa" },
              { label: "Sarah's practice", amount: 1981 + 652 + (cutsOn ? (1114 - cutSaaS) : 1114) + 450, sub: "Payroll, tools, comms, office costs", color: "#38bdf8" },
              { label: "Family support", amount: cutsOn ? (5832 - cutOliver) : 5832, sub: "Oliver — sober living, transfers", color: "#fb923c" },
              { label: "Kids", amount: bcsFamilyMonthly + 1033, sub: "BCS tuition (family share), sports, activities", color: "#c084fc" },
              { label: "Van", amount: vanSold ? 0 : vanMonthlySavings, sub: "Loan payment, insurance, fuel", color: "#f59e0b" },
              { label: "Vacation", amount: cutsOn ? (2040 - cutVacation) : 2040, sub: "Annual vacation fund", color: "#4ade80" },
              { label: "Food + dining", amount: (cutsOn ? (1901 - cutGroceries) : 1901) + (cutsOn ? 190 : 380), sub: "Groceries, dining out, coffee", color: "#4ade80" },
              { label: "Shopping", amount: cutsOn ? (2746 - cutShopping) : 2746, sub: "Clothing, Amazon, Nordstrom, etc", color: "#e879f9" },
              { label: "Auto + transport", amount: 1350, sub: "Gas, maintenance, insurance, registration (non-van)", color: "#64748b" },
              { label: "Insurance", amount: 900, sub: "Auto, home, life, umbrella", color: "#64748b" },
              { label: "Household", amount: (cutsOn ? (563 - cutAmazon) : 563) + 800, sub: "Amazon, supplies, maintenance, repairs", color: "#4ade80" },
              { label: "Gym + fitness", amount: cutsOn ? (655 - cutGym) : 655, sub: "Two memberships", color: "#fb923c" },
              { label: "Entertainment", amount: cutsOn ? (500 - cutEntertainment) : 500, sub: "Activities, events, streaming", color: "#4ade80" },
              { label: "Tech + comms", amount: (cutsOn ? 370 : 705) + 350, sub: "Internet, phones, subs, cloud, personal", color: "#64748b" },
              { label: "Personal care", amount: cutsOn ? (1166 - cutPersonalCare) : 1166, sub: "Nails, salon, spa, cleaning service", color: "#475569" },
            ].filter(b => b.amount > 0);
            const bucketTotal = buckets.reduce((s, b) => s + b.amount, 0);
            const remainder = totalExp - bucketTotal;
            if (Math.abs(remainder) > 200) {
              buckets.push({ label: "Other recurring", amount: Math.max(remainder, 0), sub: "Storage, pet, lawn, misc", color: "#334155" });
            } else if (remainder !== 0) {
              buckets[buckets.length - 1].amount += remainder;
            }

            return (
              <div style={{ maxWidth: 520, margin: "0 auto 16px", textAlign: "left" }}>
                <div style={{ fontSize: 10, color: "#475569", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6, textAlign: "center" }}>
                  Where {fmtFull(totalExp)}/month goes
                </div>
                {/* Stacked horizontal bar */}
                <div style={{ display: "flex", height: 14, borderRadius: 6, overflow: "hidden", marginBottom: 8 }}>
                  {buckets.map((b, i) => (
                    <div key={i} style={{
                      width: `${(b.amount / totalExp) * 100}%`,
                      background: b.color, opacity: 0.7,
                      borderRight: i < buckets.length - 1 ? "1px solid #0f172a" : "none"
                    }} />
                  ))}
                </div>
                {/* Legend in 2 columns */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3px 16px" }}>
                  {buckets.map((b, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 4 }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 4, minWidth: 0 }}>
                        <div style={{ width: 5, height: 5, borderRadius: 1, background: b.color, opacity: 0.7, flexShrink: 0, marginTop: 3 }} />
                        <div>
                          <span style={{ fontSize: 9, color: "#94a3b8" }}>{b.label}</span>
                          {b.sub && <div style={{ fontSize: 7, color: "#64748b", lineHeight: 1.2 }}>{b.sub}</div>}
                        </div>
                      </div>
                      <span style={{ fontSize: 9, color: "#e2e8f0", fontFamily: "'JetBrains Mono', monospace", flexShrink: 0 }}>
                        {fmtFull(b.amount)}
                      </span>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 9, color: "#334155", textAlign: "center", marginTop: 4 }}>
                  Kirkland, WA · Family of 5 · 3 kids in school
                </div>
              </div>
            );
          })()}

          <div style={{ fontSize: 12, color: UI_COLORS.textDim }}>
            Savings: {fmtFull(startingSavings)} — at this rate, gone in ~{savingsZeroMonth ? Math.round(savingsZeroMonth.month) : "60+"} months
          </div>

          {dadStep === 1 && (
            <div style={{ marginTop: 24 }}>
              <ActionButton
                data-testid='dad-mode-next-act-1'
                onClick={() => set('dadStep')(2)}
                variant={UI_ACTION_VARIANTS.secondary}
                accent={UI_COLORS.modeDad}
              >
                See what the family is already doing
              </ActionButton>
            </div>
          )}
        </SurfaceCard>
      )}

      {/* ACT 2 */}
      {dadStep >= 2 && (
        <SurfaceCard>
          <h3 style={{ fontSize: 15, color: UI_COLORS.textStrong, margin: "0 0 4px", fontWeight: 700 }}>
            What the family is already doing
          </h3>
          <p style={{ fontSize: 11, color: UI_COLORS.textDim, margin: "0 0 16px" }}>
            These changes are already part of the plan and reduce the gap before any outside support.
          </p>

          {[
            { label: "Selling the van", detail: `Frees ${fmtFull(vanMonthlySavings)}/month in loan + insurance`, value: vanMonthlySavings, icon: "\uD83D\uDE90" },
            { label: "Cutting lifestyle spending", detail: `Oliver's support, vacation fund, gym, dining, subscriptions`, value: lifestyleCuts + cutInHalf + extraCuts, icon: "\u2702\uFE0F" },
            { label: "Sarah growing her practice", detail: `$200/hr × 3.75 → $${sarahMaxRate}/hr × ${sarahMaxClients} clients/day`, value: null, icon: "\uD83D\uDCC8" },
            { label: "SSDI approved (expected Oct '26)", detail: `${fmtFull(ssdiFamilyTotal)}/month + ${fmtFull(ssdiBackPayActual)} back pay`, value: ssdiFamilyTotal, icon: "\uD83C\uDFE5" },
            ...(chadConsulting > 0 ? [{ label: "Chad consulting (under SGA)", detail: `${fmtFull(chadConsulting)}/month after SSDI`, value: chadConsulting, icon: "\uD83D\uDCBB" }] : []),
          ].map((item, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 12, padding: "10px 12px",
              background: "#0f172a", borderRadius: 8, marginBottom: 6,
              border: "1px solid #334155"
            }}>
              <span style={{ fontSize: 20 }}>{item.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: "#e2e8f0", fontWeight: 600 }}>{item.label}</div>
                <div style={{ fontSize: 11, color: "#64748b" }}>{item.detail}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <span style={{ fontSize: 14, color: "#4ade80", fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
                  ✓ {item.value ? `+${fmtFull(item.value)}` : "Growing"}
                </span>
              </div>
            </div>
          ))}

          <div style={{ textAlign: "center", marginTop: 16, fontSize: 13, color: "#94a3b8" }}>
            Total self-help: <span style={{ color: "#4ade80", fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>+{fmtFull(familyCommitSavings)}/month</span> in expense reductions alone
          </div>

          <div style={{ textAlign: "center", marginTop: 8, fontSize: 13, color: "#94a3b8" }}>
            But even with all of this, the gap persists — especially when MSFT vesting ends in 2028.
          </div>

          {dadStep === 2 && (
            <div style={{ textAlign: "center" }}>
              <ActionButton
                data-testid='dad-mode-next-act-2'
                onClick={() => set('dadStep')(3)}
                variant={UI_ACTION_VARIANTS.primary}
                style={{ marginTop: 16 }}
              >
                See where support changes the outcome
              </ActionButton>
            </div>
          )}
        </SurfaceCard>
      )}

      {/* ACT 3 */}
      {dadStep >= 3 && (
        <SurfaceCard
          tone={solv && solv.solvency >= 0.9 ? 'success' : 'default'}
          padding='lg'
          style={{
            borderColor: solv && solv.solvency >= 0.9 ? 'rgba(74, 222, 128, 0.22)' : undefined,
          }}
        >
          <h3 style={{ fontSize: 15, color: UI_COLORS.textStrong, margin: "0 0 16px", fontWeight: 700 }}>
            Where support changes the outcome
          </h3>

          {/* Dad's 3 levers */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
            {/* Debt */}
            <div style={{ background: "#0f172a", borderRadius: 8, padding: "14px 14px", border: "1px solid #1e293b" }}>
              <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Debt Freedom</div>
              <Slider label="Pay off debt" value={dadDebtPct} onChange={set('dadDebtPct')} commitStrategy={commitStrategy} min={0} max={100} step={5} format={(v) => v === 0 ? "None" : v === 100 ? `All (${fmtFull(debtTotal)})` : `${v}% (${fmtFull(Math.round(debtTotal * v / 100))})`} color="#4ade80" testId="dad-pay-off-debt" />
              {dadDebtPct > 0 && (
                <div style={{ fontSize: 11, marginTop: 6 }}>
                  <div style={{ color: "#4ade80" }}>Frees {fmtFull(dadDebtMonthly)}/month</div>
                  <div style={{ color: "#f87171", marginTop: 2 }}>
                    Currently burning {fmtFull(monthlyInterestBurned)}/mo in interest
                  </div>
                  <div style={{ color: "#fbbf24", fontSize: 10, marginTop: 2 }}>
                    Pays for itself in {Math.round(dadDebtAmount / (dadDebtMonthly + monthlyInterestBurned * (dadDebtPct / 100)))} months
                  </div>
                </div>
              )}
            </div>

            {/* BCS */}
            <div style={{ background: "#0f172a", borderRadius: 8, padding: "14px 14px", border: "1px solid #1e293b" }}>
              <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>School Tuition</div>
              <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 6 }}>BCS — {bcsYearsLeft} years remaining</div>
              <Slider
                label=""
                hideHeader
                value={dadBcsParents}
                onChange={set('dadBcsParents')}
                commitStrategy={commitStrategy}
                min={0}
                max={bcsAnnualTotal}
                step={1000}
                testId="dad-bcs-parents"
                ariaLabel="Dad BCS contribution"
                color="#c084fc"
              />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#475569", marginTop: 4 }}>
                <span>$0</span><span>$25K</span><span>{fmtFull(bcsAnnualTotal)}</span>
              </div>
              <div style={{ fontSize: 12, color: "#c084fc", fontWeight: 600, marginTop: 6, fontFamily: "'JetBrains Mono', monospace" }}>
                Your contribution: {fmtFull(dadBcsParents)}/yr
              </div>
              <div style={{ fontSize: 11, color: "#64748b" }}>
                Our share: {dadBcsFamilyMo > 0 ? `${fmtFull(dadBcsFamilyMo)}/mo` : "Fully covered"}
              </div>
            </div>

            {/* House */}
            <div style={{ background: "#0f172a", borderRadius: 8, padding: "14px 14px", border: "1px solid #1e293b" }}>
              <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Home Safety</div>
              <Toggle testId='dad-mold-toggle' label={`Mold remediation (${fmtFull(moldCost)})`} checked={dadMold} onChange={set('dadMold')} color="#fbbf24" />
              <div style={{ fontSize: 10, color: "#475569", marginLeft: 54, marginTop: -4, marginBottom: 4 }}>Chad's health — MCAS triggered by mold</div>
              <Toggle testId='dad-roof-toggle' label={`Roof replacement (${fmtFull(roofCost)})`} checked={dadRoof} onChange={set('dadRoof')} color="#fbbf24" />
              <Toggle testId='dad-projects-toggle' label={`House projects (${fmtFull(otherProjects)})`} checked={dadProjects} onChange={set('dadProjects')} color="#fbbf24" />
            </div>
          </div>

          {/* THE RESULT — live updating */}
          <div style={{
            background: "#0f172a", borderRadius: 10, padding: "20px 24px",
            border: `1px solid ${solv && solv.solvency >= 0.9 ? "#4ade8033" : "#334155"}`,
            textAlign: "center"
          }}>
            {/* Solvency gauge */}
            {solv && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6 }}>
                  Probability your daughter's family stays solvent through 2033
                </div>
                <div style={{
                  fontSize: 56, fontWeight: 700,
                  color: solv.solvency >= 0.9 ? "#4ade80" : solv.solvency >= 0.7 ? "#fbbf24" : "#f87171",
                  fontFamily: "'JetBrains Mono', monospace",
                  lineHeight: 1
                }}>
                  {(solv.solvency * 100).toFixed(0)}%
                </div>
                <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>
                  {solv.solvency >= 0.95 ? "Strong — plan is resilient to most setbacks" :
                   solv.solvency >= 0.80 ? "Good — some risk remains in adverse scenarios" :
                   solv.solvency >= 0.50 ? "Marginal — vulnerable to multiple setbacks" :
                   "High risk — significant chance of running out of savings"}
                </div>
              </div>
            )}

            {/* Savings trajectory chart */}
            <svg viewBox={`0 0 ${svgW} ${svgH}`} style={{ width: "100%", height: "auto" }}>
              {/* Zero line */}
              {minB < 0 && <line x1={padL} x2={svgW - padR} y1={yOf(0)} y2={yOf(0)} stroke="#f8717133" strokeWidth="1" />}

              {/* Year labels */}
              {[0, 12, 24, 36, 48, 60, 72].map(m => (
                <text key={m} x={xOf(m)} y={svgH - 4} textAnchor="middle" fill="#475569" fontSize="9" fontFamily="'JetBrains Mono', monospace">
                  {m === 0 ? "M0" : `Y${m/12}`}
                </text>
              ))}

              {/* Without support line */}
              <path d={basePath} fill="none" stroke="#f87171" strokeWidth="2" strokeDasharray="6,4" opacity="0.6" />

              {/* With support line */}
              <path d={dadPath} fill="none" stroke="#4ade80" strokeWidth="3" strokeLinejoin="round" />

              {/* Endpoint labels */}
              <text x={svgW - padR + 6} y={yOf(baseFinal)} fill="#f87171" fontSize="10" fontWeight="600" fontFamily="'JetBrains Mono', monospace" dominantBaseline="middle">
                {fmt(baseFinal)}
              </text>
              <text x={svgW - padR + 6} y={yOf(baseFinal) + 12} fill="#f87171" fontSize="8" dominantBaseline="middle">
                Without help
              </text>
              <text x={svgW - padR + 6} y={yOf(dadFinal)} fill="#4ade80" fontSize="10" fontWeight="700" fontFamily="'JetBrains Mono', monospace" dominantBaseline="middle">
                {fmt(dadFinal)}
              </text>
              <text x={svgW - padR + 6} y={yOf(dadFinal) + 12} fill="#4ade80" fontSize="8" dominantBaseline="middle">
                With your help
              </text>
            </svg>

            <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 8, fontSize: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <div style={{ width: 16, height: 3, background: "#4ade80", borderRadius: 2 }} />
                <span style={{ color: "#94a3b8" }}>With your support</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <div style={{ width: 16, height: 0, borderTop: "2px dashed #f87171" }} />
                <span style={{ color: "#94a3b8" }}>Without support</span>
              </div>
            </div>
          </div>

          {/* The Ask Summary */}
          <div style={{
            marginTop: 16, padding: "16px 20px",
            background: "#0f172a", borderRadius: 8, border: "1px solid #334155"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
              <span style={{ fontSize: 13, color: "#94a3b8" }}>Your total support:</span>
              <span style={{ fontSize: 22, fontWeight: 700, color: "#fbbf24", fontFamily: "'JetBrains Mono', monospace" }}>
                {fmtFull(oneTime)}
              </span>
            </div>
            <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.8 }}>
              {dadDebtPct > 0 && <div>Debt payoff: <span style={{ color: "#e2e8f0" }}>{fmtFull(dadDebtAmount)}</span> — eliminates {fmtFull(dadDebtMonthly)}/mo in payments</div>}
              {dadMold && <div>Mold remediation: <span style={{ color: "#e2e8f0" }}>{fmtFull(moldCost)}</span> — critical for Chad's health</div>}
              {dadRoof && <div>Roof replacement: <span style={{ color: "#e2e8f0" }}>{fmtFull(roofCost)}</span></div>}
              {dadProjects && <div>House projects: <span style={{ color: "#e2e8f0" }}>{fmtFull(otherProjects)}</span></div>}
              {ongoingAnnual > 0 && <div>BCS tuition increase: <span style={{ color: "#c084fc" }}>+{fmtFull(ongoingAnnual)}/yr × {bcsYearsLeft} yrs</span> above current $25K</div>}
              {oneTime === 0 && !ongoingAnnual && <div style={{ fontStyle: "italic" }}>Move the sliders above to explore options</div>}
            </div>
            {oneTime > 0 && (
              <div style={{ marginTop: 8, fontSize: 11, color: "#475569", fontStyle: "italic" }}>
                Every dollar goes to debt elimination or essential home safety. Current savings ($200K) remains untouched as the family emergency reserve.
              </div>
            )}
          </div>
        </SurfaceCard>
      )}
    </div>
  );
}
