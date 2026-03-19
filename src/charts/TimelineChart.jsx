import React from "react";
import { fmtFull } from "../model/formatters.js";
import { getVestingMonthly } from "../model/vesting.js";

export default function TimelineChart({
  retireDebt,
  debtService,
  ssType,
  ssdiApprovalMonth,
  ssdiFamilyTotal,
  ssdiPersonal,
  ssdiBackPayActual,
  ssFamilyTotal, ssPersonal, ssStartMonth, ssKidsAgeOutMonths,
  chadConsulting,
  milestones,
  bcsYearsLeft,
  bcsFamilyMonthly,
  trustIncomeNow,
  trustIncomeFuture,
  trustIncreaseMonth,
  vanSold,
  vanMonthlySavings,
  kidsAgeOutMonths,
  msftGrowth,
  currentMsftVesting,
}) {
  const totalMonths = 60;
  const padL = 60; // px padding left for cards
  const padR = 60; // px padding right for cards
  const pct = (m) => (m / totalMonths) * 100;
  const cardW = 100;

  // Positive events (above)
  const above = [];
  if (retireDebt) {
    above.push({ m: 1, label: "Debt retired", detail: `+${fmtFull(debtService)}/mo freed` });
  }
  const useSS = ssType === 'ss';
  if (useSS) {
    above.push({ m: ssStartMonth, label: "SS at 62 starts", detail: `+${fmtFull(ssFamilyTotal)}/mo (family)` });
    if (chadConsulting > 0) {
      above.push({ m: ssStartMonth + 1, label: "Consulting starts", detail: `+${fmtFull(chadConsulting)}/mo` });
    }
  } else {
    above.push({ m: ssdiApprovalMonth, label: "SSDI approved", detail: `+${fmtFull(ssdiFamilyTotal)}/mo` });
    above.push({ m: ssdiApprovalMonth + 2, label: "SSDI back pay", detail: `+${fmtFull(ssdiBackPayActual)} lump` });
    if (chadConsulting > 0) {
      above.push({ m: ssdiApprovalMonth + 1, label: "Consulting starts", detail: `+${fmtFull(chadConsulting)}/mo` });
    }
  }
  for (const ms of milestones) {
    if (ms.savings > 0 && ms.month <= totalMonths) {
      above.push({ m: ms.month, label: ms.name, detail: `+${fmtFull(ms.savings)}/mo saved` });
    }
  }
  above.push({ m: bcsYearsLeft * 12 + 3, label: "BCS graduates", detail: `+${fmtFull(bcsFamilyMonthly)}/mo saved` });
  if (trustIncomeFuture > trustIncomeNow) {
    above.push({ m: trustIncreaseMonth, label: "Trust/LLC increases", detail: `${fmtFull(trustIncomeNow)} → ${fmtFull(trustIncomeFuture)}/mo` });
  }
  if (vanSold) {
    above.push({ m: 1.5, label: "Van sold", detail: `+${fmtFull(vanMonthlySavings)}/mo freed` });
  }
  above.sort((a, b) => a.m - b.m);

  // Negative events (below)
  const below = [];
  below.push({ m: 0, label: "MSFT today", detail: `${fmtFull(currentMsftVesting)}/mo (134 sh)`, color: "#f59e0b" });
  below.push({ m: 6, label: "MSFT drops", detail: `→ ${fmtFull(getVestingMonthly(6, msftGrowth))}/mo (88 sh)`, color: "#f59e0b" });
  below.push({ m: 18, label: "MSFT cliff", detail: `→ ${fmtFull(getVestingMonthly(18, msftGrowth))}/mo (32 sh)`, color: "#f87171" });
  below.push({ m: 30, label: "MSFT ends", detail: "$0/mo — final vest", color: "#f87171" });
  if (useSS && ssStartMonth + ssKidsAgeOutMonths < totalMonths) {
    below.push({ m: ssStartMonth + ssKidsAgeOutMonths, label: "Twins turn 18", detail: `SS → ${fmtFull(ssPersonal)}/mo`, color: "#f87171" });
  }
  if (!useSS && ssdiApprovalMonth + kidsAgeOutMonths < totalMonths) {
    below.push({ m: ssdiApprovalMonth + kidsAgeOutMonths, label: "Kids turn 18", detail: `SSDI → ${fmtFull(ssdiPersonal)}/mo`, color: "#f87171" });
  }
  below.sort((a, b) => a.m - b.m);

  // Deduplicate across both sets — no two diamonds on the same spot
  const allEvents = [...above.map(e => ({...e, side: "a"})), ...below.map(e => ({...e, side: "b"}))];
  allEvents.sort((a, b) => a.m - b.m);
  for (let i = 1; i < allEvents.length; i++) {
    if (allEvents[i].m <= allEvents[i-1].m + 0.8) {
      allEvents[i].m = allEvents[i-1].m + 1.5;
    }
  }
  // Write back
  const aboveFinal = allEvents.filter(e => e.side === "a");
  const belowFinal = allEvents.filter(e => e.side === "b");

  // Stagger: push cards to different heights when close horizontally
  const cardH = 38; // approximate card height
  const stagger = (items) => {
    const positioned = [];
    for (let i = 0; i < items.length; i++) {
      let tier = 0;
      for (let j = positioned.length - 1; j >= 0; j--) {
        const prev = positioned[j];
        const dist = Math.abs(pct(items[i].m) - pct(prev.m));
        if (dist < 12) {
          tier = Math.max(tier, prev.tier + 1);
        }
      }
      positioned.push({ ...items[i], tier });
    }
    return positioned;
  };

  const abovePos = stagger(aboveFinal);
  const belowPos = stagger(belowFinal);

  const maxAboveTier = Math.max(0, ...abovePos.map(e => e.tier));
  const maxBelowTier = Math.max(0, ...belowPos.map(e => e.tier));

  const stemBase = 16;
  const tierStep = cardH + 8;
  const aboveSpace = stemBase + (maxAboveTier + 1) * tierStep + 10;
  const belowSpace = stemBase + (maxBelowTier + 1) * tierStep + 20; // extra for year labels
  const lineY = aboveSpace;
  const totalH = aboveSpace + belowSpace;

  // Card horizontal offset: clamp so card stays in view
  const getCardLeft = (leftPct) => {
    // Default: center card on the stem
    return -cardW / 2;
  };

  return (
    <div style={{
      background: "#1e293b", borderRadius: 12, padding: "24px 20px 16px",
      border: "1px solid #334155", marginBottom: 24
    }}>
      <h3 style={{ fontSize: 15, color: "#f8fafc", margin: "0 0 2px", fontWeight: 700 }}>5-Year Timeline</h3>
      <p style={{ fontSize: 11, color: "#64748b", margin: "0 0 12px" }}>
        <span style={{ color: "#4ade80" }}>Above</span> = income &amp; improvements &nbsp;&nbsp;
        <span style={{ color: "#f87171" }}>Below</span> = declining &amp; losses
      </p>

      <div style={{ position: "relative", height: totalH, margin: `0 ${padR}px 0 ${padL}px` }}>
        {/* Main line */}
        <div style={{
          position: "absolute", left: 0, right: 0, top: lineY,
          height: 2, background: "#334155"
        }} />

        {/* Year ticks + labels */}
        {[0, 12, 24, 36, 48, 60].map(m => (
          <div key={m} style={{
            position: "absolute", left: `${pct(m)}%`, top: lineY - 3,
            transform: "translateX(-1px)"
          }}>
            <div style={{ width: 2, height: 8, background: "#475569" }} />
            <div style={{
              position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)",
              fontSize: 9, color: "#64748b", whiteSpace: "nowrap",
              fontFamily: "'JetBrains Mono', monospace"
            }}>
              {m === 0 ? "Now" : m === 60 ? "'31" : `'${26 + Math.floor((2 + m) / 12)}`}
            </div>
          </div>
        ))}

        {/* Above events */}
        {abovePos.map((ev, i) => {
          const left = pct(ev.m);
          const stemH = stemBase + ev.tier * tierStep;
          const cardOffset = getCardLeft(left);
          return (
            <div key={`a${i}`} style={{ position: "absolute", left: `${left}%`, top: lineY, zIndex: 2 + ev.tier }}>
              <div style={{
                position: "absolute", left: -5, top: -5,
                width: 10, height: 10, background: "#4ade80",
                transform: "rotate(45deg)", borderRadius: 2,
                boxShadow: "0 0 6px #4ade8044", zIndex: 5
              }} />
              <div style={{
                position: "absolute", left: 0, width: 1,
                bottom: 4, height: stemH,
                background: "#4ade8033"
              }} />
              <div style={{
                position: "absolute", left: cardOffset, width: cardW,
                bottom: stemH + 4,
                background: "#0f172a",
                border: "1px solid #4ade8025",
                borderRadius: 5, padding: "4px 7px"
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#4ade80", lineHeight: 1.2, marginBottom: 1 }}>{ev.label}</div>
                <div style={{ fontSize: 9, color: "#94a3b8", lineHeight: 1.2 }}>{ev.detail}</div>
              </div>
            </div>
          );
        })}

        {/* Below events */}
        {belowPos.map((ev, i) => {
          const left = pct(ev.m);
          const c = ev.color || "#f87171";
          const stemH = stemBase + ev.tier * tierStep;
          const cardOffset = getCardLeft(left);
          return (
            <div key={`b${i}`} style={{ position: "absolute", left: `${left}%`, top: lineY, zIndex: 2 + ev.tier }}>
              <div style={{
                position: "absolute", left: -5, top: -5,
                width: 10, height: 10, background: c,
                transform: "rotate(45deg)", borderRadius: 2,
                boxShadow: `0 0 6px ${c}44`, zIndex: 5
              }} />
              <div style={{
                position: "absolute", left: 0, width: 1,
                top: 4, height: stemH,
                background: `${c}33`
              }} />
              <div style={{
                position: "absolute", left: cardOffset, width: cardW,
                top: stemH + 4,
                background: "#0f172a",
                border: `1px solid ${c}25`,
                borderRadius: 5, padding: "4px 7px"
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: c, lineHeight: 1.2, marginBottom: 1 }}>{ev.label}</div>
                <div style={{ fontSize: 9, color: "#94a3b8", lineHeight: 1.2 }}>{ev.detail}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
