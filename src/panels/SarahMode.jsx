import React from "react";
import { fmtFull } from "../model/formatters.js";
import { DAYS_PER_MONTH } from "../model/constants.js";
import Slider from "../components/Slider.jsx";
import SarahPracticeChart from "../charts/SarahPracticeChart.jsx";

const TEAL = "#2dd4bf";
const WARM_GREEN = "#4ade80";
const WARM_BG = "#0c1a2e";
const CARD_BG = "#132237";
const CARD_BORDER = "#1e3a5f";

const CUT_ITEMS = [
  { key: "cutOliver", label: "Oliver's activities" },
  { key: "cutVacation", label: "Vacation budget" },
  { key: "cutShopping", label: "Shopping" },
  { key: "cutMedical", label: "Medical expenses" },
  { key: "cutGym", label: "Gym membership" },
  { key: "cutAmazon", label: "Amazon spending" },
  { key: "cutSaaS", label: "Subscriptions" },
  { key: "cutEntertainment", label: "Entertainment" },
  { key: "cutGroceries", label: "Grocery savings" },
  { key: "cutPersonalCare", label: "Personal care" },
  { key: "cutSmallItems", label: "Small purchases" },
];

export default function SarahMode({
  ssType,
  sarahRate, sarahMaxRate, sarahRateGrowth,
  sarahCurrentClients, sarahMaxClients, sarahClientGrowth,
  lifestyleCutsApplied,
  cutOliver, cutVacation, cutShopping, cutMedical, cutGym,
  cutAmazon, cutSaaS, cutEntertainment, cutGroceries, cutPersonalCare, cutSmallItems,
  mcResults, goalResults, goals,
  monthlyDetail, savingsData, wealthData,
  onFieldChange, onExit,
}) {
  const cuts = { cutOliver, cutVacation, cutShopping, cutMedical, cutGym, cutAmazon, cutSaaS, cutEntertainment, cutGroceries, cutPersonalCare, cutSmallItems };
  const totalCutsMonthly = Object.values(cuts).reduce((s, v) => s + v, 0);
  const totalCutsAnnual = totalCutsMonthly * 12;

  // Sarah's current and projected income
  const currentMonthly = Math.round(sarahRate * sarahCurrentClients * DAYS_PER_MONTH);
  const year3Month = 36;
  const y3Rate = Math.min(sarahRate * Math.pow(1 + sarahRateGrowth / 100, year3Month / 12), sarahMaxRate);
  const y3Clients = Math.min(sarahCurrentClients * Math.pow(1 + sarahClientGrowth / 100, year3Month / 12), sarahMaxClients);
  const year3Monthly = Math.round(y3Rate * y3Clients * DAYS_PER_MONTH);

  // Per-client impact
  const perClientImpact = Math.round(sarahRate * DAYS_PER_MONTH);

  // Net worth computations
  const nowSavings = savingsData?.[0]?.balance || 0;
  const now401k = wealthData?.[0]?.balance401k || 0;
  const nowHome = wealthData?.[0]?.homeEquity || 0;
  const nowNetWorth = nowSavings + now401k + nowHome;
  const y6Savings = savingsData?.[72]?.balance || 0;
  const y6_401k = wealthData?.[72]?.balance401k || 0;
  const y6Home = wealthData?.[72]?.homeEquity || 0;
  const y6NetWorth = y6Savings + y6_401k + y6Home;
  const nwChange = y6NetWorth - nowNetWorth;
  const nwGrowing = nwChange >= 0;

  // Breakeven month from projection
  const breakevenMonth = monthlyDetail?.findIndex(d => d.netCashFlow >= 0);
  const breakevenText = breakevenMonth > 0
    ? `${Math.floor(breakevenMonth / 12)} years ${breakevenMonth % 12} months`
    : breakevenMonth === 0 ? "already there" : null;

  // MC solvency
  const solvencyPct = mcResults ? Math.round(mcResults.solvencyRate * 100) : null;
  const mcGoalRates = mcResults?.goalSuccessRates || null;

  // Solvency gauge color
  const gaugeColor = solvencyPct >= 80 ? WARM_GREEN : solvencyPct >= 60 ? "#fbbf24" : "#f87171";

  const cardStyle = {
    background: CARD_BG, borderRadius: 16, padding: "24px 20px",
    border: `1px solid ${CARD_BORDER}`, marginBottom: 20,
  };

  const headingStyle = (color) => ({
    fontSize: 18, fontWeight: 700, color, margin: "0 0 4px", letterSpacing: "-0.01em",
  });

  const subtextStyle = {
    fontSize: 14, color: "#8ba4c4", margin: "0 0 16px", lineHeight: 1.5,
  };

  const metricStyle = (color) => ({
    fontSize: 22, fontWeight: 700, color, fontFamily: "'JetBrains Mono', monospace",
  });

  return (
    <div style={{ background: WARM_BG, borderRadius: 20, padding: "28px 20px", marginBottom: 24, border: `1px solid ${CARD_BORDER}` }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 700, color: TEAL, margin: 0 }}>Sarah's View</h2>
          <p style={{ fontSize: 13, color: "#6b8db5", margin: "4px 0 0" }}>Your contributions and our path forward</p>
        </div>
        <button
          onClick={onExit}
          style={{
            background: "transparent", border: `1px solid ${TEAL}`, borderRadius: 8,
            color: TEAL, fontSize: 12, padding: "8px 16px", cursor: "pointer",
            fontFamily: "'Inter', sans-serif", whiteSpace: "nowrap",
          }}
        >
          {"\u2715"} Back to Full View
        </button>
      </div>

      {/* Card 0: Our Net Worth */}
      <div style={cardStyle}>
        <h3 style={headingStyle("#60a5fa")}>Our Net Worth</h3>
        <p style={subtextStyle}>
          Everything we've built together — savings, retirement, and our home.
        </p>

        {/* Big numbers: Now → Year 6 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 20, margin: "8px 0 20px" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 11, color: "#6b8db5", marginBottom: 4 }}>Today</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#60a5fa", fontFamily: "'JetBrains Mono', monospace" }}>
              {fmtFull(nowNetWorth)}
            </div>
          </div>
          <div style={{ fontSize: 24, color: nwGrowing ? WARM_GREEN : "#f87171" }}>{nwGrowing ? "\u2192" : "\u2192"}</div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 11, color: "#6b8db5", marginBottom: 4 }}>Year 6</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: nwGrowing ? WARM_GREEN : "#fbbf24", fontFamily: "'JetBrains Mono', monospace" }}>
              {fmtFull(y6NetWorth)}
            </div>
          </div>
        </div>

        {/* Mini bar chart showing components */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {[
            { label: "Today", savings: nowSavings, ret: now401k, home: nowHome, total: nowNetWorth },
            { label: "Year 6", savings: y6Savings, ret: y6_401k, home: y6Home, total: y6NetWorth },
          ].map((col, ci) => {
            const maxVal = Math.max(Math.abs(nowNetWorth), Math.abs(y6NetWorth)) || 1;
            return (
              <div key={ci} style={{ background: "#0c1a2e", borderRadius: 10, padding: "12px 14px", border: `1px solid ${CARD_BORDER}` }}>
                <div style={{ fontSize: 11, color: "#6b8db5", fontWeight: 600, marginBottom: 10 }}>{col.label}</div>
                {[
                  { name: "Savings", value: col.savings, color: "#60a5fa" },
                  { name: "401(k)", value: col.ret, color: WARM_GREEN },
                  { name: "Home equity", value: col.home, color: TEAL },
                ].map((item, i) => (
                  <div key={i} style={{ marginBottom: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                      <span style={{ fontSize: 11, color: "#8ba4c4" }}>{item.name}</span>
                      <span style={{ fontSize: 11, color: item.value >= 0 ? item.color : "#f87171", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
                        {fmtFull(item.value)}
                      </span>
                    </div>
                    <div style={{ height: 4, background: "#1e3a5f", borderRadius: 2 }}>
                      <div style={{
                        height: 4, borderRadius: 2,
                        background: item.value >= 0 ? item.color : "#f87171",
                        width: `${Math.max(0, Math.min(100, (Math.abs(item.value) / maxVal) * 100))}%`,
                        opacity: item.value < 0 ? 0.5 : 1,
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>

        {/* Narrative */}
        <div style={{ background: "#0c1a2e", borderRadius: 10, padding: "12px 16px", marginTop: 12, border: `1px solid ${CARD_BORDER}` }}>
          <p style={{ fontSize: 13, color: "#8ba4c4", margin: 0, lineHeight: 1.6 }}>
            {nwGrowing ? (
              <>Our net worth grows by <span style={{ color: WARM_GREEN, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>{fmtFull(nwChange)}</span> over 6 years.
              {" "}Even through this transition, our 401(k) and home equity keep building toward retirement.</>
            ) : y6Savings < 0 ? (
              <>Our savings face pressure during this transition, but our 401(k) ({fmtFull(y6_401k)}) and home equity ({fmtFull(y6Home)}) continue growing.
              {" "}The retirement foundation stays strong — this is a temporary bridge period.</>
            ) : (
              <>While our net worth shifts during this period, our long-term assets — 401(k) and home — continue building.
              {" "}We're navigating a transition, not losing ground.</>
            )}
          </p>
        </div>
      </div>

      {/* Card 1: Your Income Impact */}
      <div style={cardStyle}>
        <h3 style={headingStyle(TEAL)}>Your Income Impact</h3>
        <p style={subtextStyle}>
          Your practice is the engine of our plan. You're earning{" "}
          <span style={metricStyle(TEAL)}>{fmtFull(currentMonthly)}</span>
          <span style={{ color: "#8ba4c4" }}>/mo today, growing to </span>
          <span style={metricStyle(WARM_GREEN)}>{fmtFull(year3Monthly)}</span>
          <span style={{ color: "#8ba4c4" }}>/mo by Year 3.</span>
        </p>

        <SarahPracticeChart
          sarahRate={sarahRate} sarahMaxRate={sarahMaxRate} sarahRateGrowth={sarahRateGrowth}
          sarahCurrentClients={sarahCurrentClients} sarahMaxClients={sarahMaxClients} sarahClientGrowth={sarahClientGrowth}
        />

        <div style={{ background: "#0c1a2e", borderRadius: 10, padding: "14px 16px", marginTop: 12, border: `1px solid ${CARD_BORDER}` }}>
          <p style={{ fontSize: 13, color: "#8ba4c4", margin: 0, lineHeight: 1.6 }}>
            Every new client adds <span style={{ color: TEAL, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>{fmtFull(perClientImpact)}/mo</span> to our income.
            {breakevenText && <> At this pace, we reach cash flow breakeven in <span style={{ color: WARM_GREEN, fontWeight: 700 }}>{breakevenText}</span>.</>}
          </p>
        </div>

        <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Slider label="Your hourly rate" value={sarahRate} onChange={onFieldChange('sarahRate')} min={150} max={350} step={5} format={v => `$${v}`} color={TEAL} />
          <Slider label="Max rate target" value={sarahMaxRate} onChange={onFieldChange('sarahMaxRate')} min={150} max={400} step={5} format={v => `$${v}`} color={TEAL} />
          <Slider label="Current clients/day" value={sarahCurrentClients} onChange={onFieldChange('sarahCurrentClients')} min={1} max={6} step={0.25} format={v => v.toFixed(2)} color={TEAL} />
          <Slider label="Max clients target" value={sarahMaxClients} onChange={onFieldChange('sarahMaxClients')} min={1} max={8} step={0.25} format={v => v.toFixed(2)} color={TEAL} />
          <Slider label="Rate growth/year" value={sarahRateGrowth} onChange={onFieldChange('sarahRateGrowth')} min={0} max={20} step={1} format={v => `${v}%`} color={TEAL} />
          <Slider label="Client growth/year" value={sarahClientGrowth} onChange={onFieldChange('sarahClientGrowth')} min={0} max={30} step={1} format={v => `${v}%`} color={TEAL} />
        </div>
      </div>

      {/* Card 2: Your Savings Impact */}
      <div style={cardStyle}>
        <h3 style={headingStyle("#f0abfc")}>Your Savings Impact</h3>
        {lifestyleCutsApplied ? (
          <>
            <p style={subtextStyle}>
              The spending changes you're managing save our family{" "}
              <span style={metricStyle("#f0abfc")}>{fmtFull(totalCutsAnnual)}/year</span>.
              {" "}That's like earning an extra{" "}
              <span style={{ color: "#f0abfc", fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>{fmtFull(totalCutsMonthly)}/month</span>.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              {CUT_ITEMS.map(({ key, label }) => {
                const val = cuts[key];
                if (val <= 0) return null;
                return (
                  <div key={key} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    background: "#0c1a2e", borderRadius: 8, padding: "8px 12px",
                    border: `1px solid ${CARD_BORDER}`,
                  }}>
                    <span style={{ fontSize: 12, color: "#8ba4c4" }}>{label}</span>
                    <span style={{ fontSize: 12, color: "#f0abfc", fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>
                      {fmtFull(val)}/mo
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div style={{ background: "#0c1a2e", borderRadius: 10, padding: "16px", border: `1px solid ${CARD_BORDER}` }}>
            <p style={{ fontSize: 14, color: "#8ba4c4", margin: 0, lineHeight: 1.6 }}>
              When we're ready, spending adjustments can save up to{" "}
              <span style={{ color: "#f0abfc", fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>{fmtFull(totalCutsAnnual)}/year</span>
              {" "}({fmtFull(totalCutsMonthly)}/month). That's a powerful lever we can pull when the time is right.
            </p>
          </div>
        )}
      </div>

      {/* Card 3: We're Going To Be OK */}
      <div style={cardStyle}>
        <h3 style={headingStyle(WARM_GREEN)}>We're Going To Be OK</h3>

        {solvencyPct !== null ? (
          <>
            {/* Solvency arc gauge */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", margin: "8px 0 16px" }}>
              <svg viewBox="0 0 200 110" style={{ width: 220, height: "auto" }}>
                {/* Background arc */}
                <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="#1e3a5f" strokeWidth="12" strokeLinecap="round" />
                {/* Filled arc */}
                <path
                  d={describeArc(100, 100, 80, 180, 180 + (solvencyPct / 100) * 180)}
                  fill="none" stroke={gaugeColor} strokeWidth="12" strokeLinecap="round"
                />
                <text x="100" y="85" textAnchor="middle" fill={gaugeColor} fontSize="32" fontWeight="700" fontFamily="'JetBrains Mono', monospace">
                  {solvencyPct}%
                </text>
                <text x="100" y="102" textAnchor="middle" fill="#6b8db5" fontSize="11">
                  confidence
                </text>
              </svg>
            </div>

            <div style={{ background: "#0c1a2e", borderRadius: 10, padding: "14px 16px", marginBottom: 16, border: `1px solid ${CARD_BORDER}` }}>
              <p style={{ fontSize: 14, color: "#8ba4c4", margin: 0, lineHeight: 1.7 }}>
                {solvencyPct >= 80 ? (
                  <>With your practice growing and our spending discipline, <span style={{ color: WARM_GREEN, fontWeight: 700 }}>{solvencyPct}% of scenarios</span> show us staying financially stable through Year 6. We're on a strong path.</>
                ) : solvencyPct >= 60 ? (
                  <>With your practice growing and our spending discipline, <span style={{ color: "#fbbf24", fontWeight: 700 }}>{solvencyPct}% of scenarios</span> show us staying stable through Year 6. We're building momentum — every client you add improves this.</>
                ) : (
                  <>We're at <span style={{ color: "#f87171", fontWeight: 700 }}>{solvencyPct}%</span> right now, but this improves as your practice grows and our other income streams come online. Every step forward matters.</>
                )}
              </p>
            </div>
          </>
        ) : (
          <div style={{ background: "#0c1a2e", borderRadius: 10, padding: "14px 16px", marginBottom: 16, border: `1px solid ${CARD_BORDER}` }}>
            <p style={{ fontSize: 14, color: "#8ba4c4", margin: 0, lineHeight: 1.7 }}>
              {goalResults && goalResults.filter(g => g.achieved).length > 0 ? (
                <>Based on our current plan, we're already meeting {goalResults.filter(g => g.achieved).length} of our {goalResults.length} goals. Run Monte Carlo in the full view for confidence percentages.</>
              ) : (
                <>Our plan has multiple income streams working together — your practice, {ssType === 'ss' ? 'Social Security' : 'SSDI'}, MSFT vesting, and trust/LLC income. Run Monte Carlo in the full view to see confidence percentages.</>
              )}
            </p>
          </div>
        )}

        {/* Goal cards */}
        {goalResults && goalResults.length > 0 && (
          <div style={{ display: "grid", gap: 8 }}>
            {goalResults.map((g, i) => {
              const mcRate = mcGoalRates?.find(r => r.goalId === g.id);
              const mcPct = mcRate ? Math.round(mcRate.successRate * 100) : null;
              const statusColor = g.achieved ? WARM_GREEN : mcPct !== null ? (mcPct >= 70 ? "#fbbf24" : "#f87171") : "#64748b";
              const statusIcon = g.achieved ? "\u2705" : mcPct !== null ? (mcPct >= 70 ? "\uD83D\uDFE1" : "\uD83D\uDD34") : "\u2B55";
              return (
                <div key={g.id || i} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  background: "#0c1a2e", borderRadius: 10, padding: "12px 16px",
                  border: `1px solid ${CARD_BORDER}`,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 16 }}>{statusIcon}</span>
                    <span style={{ fontSize: 13, color: "#c8daf0", fontWeight: 500 }}>{g.name}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {mcPct !== null && (
                      <span style={{
                        fontSize: 13, fontWeight: 700, color: statusColor,
                        fontFamily: "'JetBrains Mono', monospace",
                      }}>
                        {mcPct}%
                      </span>
                    )}
                    {g.achieved && !mcPct && (
                      <span style={{ fontSize: 11, color: WARM_GREEN, fontWeight: 600 }}>On track</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Timeline */}
        <div style={{ marginTop: 20, background: "#0c1a2e", borderRadius: 10, padding: "14px 16px", border: `1px solid ${CARD_BORDER}` }}>
          <div style={{ fontSize: 11, color: "#6b8db5", marginBottom: 8, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Key milestones ahead
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 0, position: "relative", height: 32 }}>
            <div style={{ position: "absolute", top: 14, left: 0, right: 0, height: 2, background: "#1e3a5f", borderRadius: 1 }} />
            {[
              { label: "Now", month: 0, color: TEAL },
              { label: ssType === 'ss' ? "SS at 62" : "SSDI", month: ssType === 'ss' ? 18 : 7, color: "#fbbf24" },
              { label: "BCS ends", month: 36, color: "#f0abfc" },
              { label: "Year 6", month: 72, color: WARM_GREEN },
            ].map((evt, i) => (
              <div key={i} style={{
                position: "absolute", left: `${(evt.month / 72) * 100}%`, transform: "translateX(-50%)",
                display: "flex", flexDirection: "column", alignItems: "center",
              }}>
                <div style={{ fontSize: 9, color: evt.color, fontWeight: 600, marginBottom: 2, whiteSpace: "nowrap" }}>{evt.label}</div>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: evt.color, border: "2px solid #0c1a2e" }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// SVG arc helper
function describeArc(cx, cy, r, startAngle, endAngle) {
  const rad = (a) => (a * Math.PI) / 180;
  const x1 = cx + r * Math.cos(rad(startAngle));
  const y1 = cy + r * Math.sin(rad(startAngle));
  const x2 = cx + r * Math.cos(rad(endAngle));
  const y2 = cy + r * Math.sin(rad(endAngle));
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
}
