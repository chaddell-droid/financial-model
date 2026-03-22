import React from "react";
import { DAYS_PER_MONTH, SGA_LIMIT } from '../model/constants.js';
import { getVestingMonthly } from '../model/vesting.js';
import { fmtFull } from '../model/formatters.js';

const BridgeChart = ({
  monthlyDetail, data,
  sarahCurrentNet, sarahRate, sarahMaxRate, sarahRateGrowth,
  sarahCurrentClients, sarahMaxClients, sarahClientGrowth,
  retireDebt, vanSold, lifestyleCutsApplied,
  ssType, ssdiApprovalMonth, ssdiDenied, ssdiFamilyTotal, chadConsulting,
  ssFamilyTotal, ssStartMonth,
  trustIncomeNow, trustIncomeFuture, trustIncreaseMonth,
  milestones, bcsYearsLeft, bcsFamilyMonthly,
  baseExpenses, debtService, vanMonthlySavings,
  lifestyleCuts, cutInHalf, extraCuts,
  startingSavings, investmentReturn, msftGrowth,
  chadJob, chadJobSalary, chadJobTaxRate, chadJobStartMonth, chadJobHealthSavings,
}) => {
  const months = 60;
  const svgW = 800;
  const svgH = 280;
  const padL = 60;
  const padR = 16;
  const padT = 30;
  const padB = 28;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;

  const pts = monthlyDetail.filter(d => d.month <= months);
  const trendNet = (row) => Math.round(row.netMonthlySmoothed ?? row.netMonthly);

  const allNet = pts.map(trendNet);
  const maxNet = Math.max(...allNet, 1000) * 1.15;
  const minNet = Math.min(...allNet, -1000) * 1.15;
  const range = (maxNet - minNet) || 1;

  const xOf = (m) => padL + (m / months) * plotW;
  const yOf = (v) => padT + ((maxNet - v) / range) * plotH;
  const zeroY = yOf(0);

  const steppedPath = pts.map((p, i) => {
    const x = xOf(p.month);
    const y = yOf(trendNet(p));
    if (i === 0) return `M ${x},${y}`;
    return `H ${x} V ${y}`;
  }).join(" ");

  // Chad Job computed values (needed by both event markers and waterfall)
  const effectiveStartMonth = chadJobStartMonth ?? 3;
  const chadJobMonthlyNet = chadJob ? Math.round((chadJobSalary || 80000) * (1 - (chadJobTaxRate || 25) / 100) / 12) : 0;
  const chadJobHealthVal = chadJob ? (chadJobHealthSavings || 4200) : 0;
  const jobImmediate = chadJob && effectiveStartMonth === 0;

  // Build event markers
  const events = [];
  if (retireDebt) events.push({ m: 0, label: "Debt retired", color: "#4ade80" });
  if (vanSold) events.push({ m: 0, label: "Van sold", color: "#4ade80" });
  const useSS = ssType === 'ss';
  if (lifestyleCutsApplied) events.push({ m: 0.5, label: "Cuts applied", color: "#4ade80" });
  if (chadJob) {
    if (effectiveStartMonth > 0) events.push({ m: effectiveStartMonth, label: "Job starts", color: "#22c55e" });
  } else if (useSS) {
    events.push({ m: ssStartMonth, label: `SS +${fmtFull(ssFamilyTotal)}`, color: "#4ade80" });
  } else {
    events.push({ m: ssdiApprovalMonth, label: `SSDI +${fmtFull(ssdiFamilyTotal)}`, color: "#4ade80" });
  }
  if (trustIncomeFuture > trustIncomeNow) {
    events.push({ m: trustIncreaseMonth, label: `Trust/LLC +${fmtFull(trustIncomeFuture - trustIncomeNow)}`, color: "#a78bfa" });
  }
  events.push({ m: 18, label: "MSFT cliff", color: "#f59e0b" });
  events.push({ m: 30, label: "MSFT ends", color: "#f87171" });
  for (const ms of milestones) {
    if (ms.savings > 0 && ms.month <= months) {
      events.push({ m: ms.month, label: ms.name, color: "#94a3b8" });
    }
  }
  if (bcsYearsLeft * 12 <= months) {
    events.push({ m: bcsYearsLeft * 12, label: "BCS ends", color: "#94a3b8" });
  }
  events.sort((a, b) => a.m - b.m);
  for (let i = 1; i < events.length; i++) {
    if (events[i].m <= events[i-1].m + 0.5) events[i].m = events[i-1].m + 1.5;
  }
  events.forEach((ev, i) => { ev.above = i % 2 === 0; });

  const crossMonth = pts.find(p => trendNet(p) >= 0);
  const finalNet = trendNet(pts[pts.length - 1] || { netMonthly: 0 });

  // === MINI WATERFALL DATA ===
  // "Today" bar uses RAW values — no toggles
  const currentMsft = data[0].msftVesting;

  const rawIncome = sarahCurrentNet + currentMsft + trustIncomeNow + (jobImmediate ? chadJobMonthlyNet : 0);
  const rawExpenses = baseExpenses + debtService + vanMonthlySavings + bcsFamilyMonthly - (jobImmediate ? chadJobHealthVal : 0);
  const todayGap = rawIncome - rawExpenses;

  const wfSteps = [{ name: "Today", value: todayGap, isStart: true }];
  let running = todayGap;
  const monthlyReturn = startingSavings > 0 ? Math.round(startingSavings * (Math.pow(1 + investmentReturn / 100, 1/12) - 1)) : 0;
  const ssLever = useSS
    ? { name: "SS (62)", value: ssFamilyTotal, color: "#4ade80" }
    : { name: "SSDI", value: ssdiFamilyTotal, color: "#4ade80" };
  const ssActive = useSS ? true : !ssdiDenied;
  const wfLevers = [
    ...(monthlyReturn > 0 ? [{ name: `Returns (${investmentReturn}%)`, value: monthlyReturn, color: "#22d3ee" }] : []),
    ...(retireDebt ? [{ name: "Retire debt", value: debtService, color: "#4ade80" }] : []),
    ...(vanSold ? [{ name: "Van sold", value: vanMonthlySavings, color: "#4ade80" }] : []),
    ...(lifestyleCutsApplied ? [{ name: "Spending cuts", value: lifestyleCuts + cutInHalf + extraCuts, color: "#4ade80" }] : []),
    ...(bcsYearsLeft * 12 <= months && bcsFamilyMonthly > 0 ? [{ name: "BCS ends", value: bcsFamilyMonthly, color: "#4ade80" }] : []),
    // Chad's Job levers (mutually exclusive with SS/SSDI)
    ...(chadJob && !jobImmediate ? [{ name: "Chad's Job", value: chadJobMonthlyNet, color: "#22c55e" }] : []),
    ...(chadJob && !jobImmediate && chadJobHealthVal > 0 ? [{ name: "Health ins.", value: chadJobHealthVal, color: "#22c55e" }] : []),
    // SS/SSDI + Consulting — only when NOT employed
    ...(!chadJob && ssActive ? [ssLever] : []),
    ...(!chadJob && chadConsulting > 0 && ssActive ? [{ name: "Consulting", value: useSS ? chadConsulting : Math.min(chadConsulting, SGA_LIMIT), color: "#38bdf8" }] : []),
  ];
  const sarahY3Rate = Math.min(sarahRate * Math.pow(1 + sarahRateGrowth / 100, 3), sarahMaxRate);
  const sarahY3Clients = Math.min(sarahCurrentClients * Math.pow(1 + sarahClientGrowth / 100, 3), sarahMaxClients);
  const sarahGrowth = Math.round(sarahY3Rate * sarahY3Clients * DAYS_PER_MONTH) - sarahCurrentNet;
  if (sarahGrowth > 0) wfLevers.push({ name: "Sarah (Y3)", value: sarahGrowth, color: "#60a5fa" });
  const trustSteady = Math.max(trustIncomeNow, trustIncomeFuture);
  if (trustIncomeFuture > trustIncomeNow) wfLevers.push({ name: "Trust/LLC increase", value: trustIncomeFuture - trustIncomeNow, color: "#c084fc" });
  for (const ms of (milestones || [])) {
    if (ms.savings > 0) wfLevers.push({ name: ms.name, value: ms.savings, color: "#94a3b8" });
  }

  const postCliffMsft = getVestingMonthly(18, msftGrowth);
  const cliffLoss = currentMsft - postCliffMsft;
  const endLoss = postCliffMsft;
  const wfNeg = [
    ...(cliffLoss > 0 ? [{ name: "MSFT cliff", value: -cliffLoss, color: "#f59e0b" }] : []),
    ...(endLoss > 0 ? [{ name: "MSFT ends", value: -endLoss, color: "#f87171" }] : []),
  ];

  for (const l of wfLevers) { running += l.value; wfSteps.push({ ...l, running }); }
  for (const l of wfNeg) { running += l.value; wfSteps.push({ ...l, running }); }
  wfSteps.push({ name: "Steady\nState", value: running, isEnd: true });

  const wfMax = Math.max(...wfSteps.map(s => s.running || s.value), 0) * 1.1;
  const wfMin = Math.min(...wfSteps.map(s => s.running || s.value), 0) * 1.1;
  const wfRange = (wfMax - wfMin) || 1;
  const wfH = 220;
  const wfTopPad = 24;
  const wfLabelH = 36;
  const wfPlotH = wfH - wfTopPad - wfLabelH;
  const wfToY = (v) => wfTopPad + ((wfMax - v) / wfRange) * wfPlotH;
  const wfZeroY = wfToY(0);

  return (
    <div style={{
      background: "#1e293b", borderRadius: 12, padding: "20px 16px",
      border: "1px solid #334155", marginBottom: 24
    }}>
      <h3 style={{ fontSize: 14, color: "#94a3b8", margin: "0 0 2px", fontWeight: 600 }}>Bridge to Sustainability</h3>
      <p style={{ fontSize: 11, color: "#475569", margin: "0 0 12px" }}>
        Smoothed monthly cash flow over time — does the plan reach breakeven before MSFT vesting ends?
        {crossMonth && <span style={{ color: "#4ade80", fontWeight: 600 }}> → Breakeven at month {crossMonth.month}</span>}
        {!crossMonth && <span style={{ color: "#f87171", fontWeight: 600 }}> → Not yet breakeven by month {months}</span>}
      </p>

      {/* STEPPED LINE CHART */}
      <svg viewBox={`0 0 ${svgW} ${svgH}`} style={{ width: "100%", height: "auto" }}>
        {/* Y-axis grid */}
        {(() => {
          const step = range > 30000 ? 10000 : range > 15000 ? 5000 : 2500;
          const ticks = [];
          for (let v = Math.ceil(minNet / step) * step; v <= maxNet; v += step) {
            ticks.push(v);
          }
          return ticks.map(v => (
            <g key={v}>
              <line x1={padL} x2={svgW - padR} y1={yOf(v)} y2={yOf(v)} stroke="#1e293b" strokeWidth="1" />
              <text x={padL - 6} y={yOf(v) + 3} textAnchor="end" fill="#475569" fontSize="10" fontFamily="'JetBrains Mono', monospace">
                {v >= 1000 || v <= -1000 ? `$${Math.round(v/1000)}K` : `$${v}`}
              </text>
            </g>
          ));
        })()}

        {/* Zero line */}
        <line x1={padL} x2={svgW - padR} y1={zeroY} y2={zeroY} stroke="#475569" strokeWidth="1.5" />
        <text x={padL - 6} y={zeroY + 3} textAnchor="end" fill="#64748b" fontSize="10" fontWeight="700" fontFamily="'JetBrains Mono', monospace">$0</text>

        {/* X-axis labels */}
        {[0, 12, 24, 36, 48, 60].map(m => (
          <text key={m} x={xOf(m)} y={svgH - 4} textAnchor="middle" fill="#475569" fontSize="10" fontFamily="'JetBrains Mono', monospace">
            {m === 0 ? "M0" : `Y${m/12}`}
          </text>
        ))}

        {/* Positive area fill (green) */}
        <clipPath id="bridgeAbove">
          <rect x={padL} y={padT} width={plotW} height={zeroY - padT} />
        </clipPath>
        <path d={`${steppedPath} H ${xOf(months)} V ${zeroY} H ${xOf(0)} Z`}
          fill="#4ade8015" clipPath="url(#bridgeAbove)" />

        {/* Negative area fill (red) */}
        <clipPath id="bridgeBelow">
          <rect x={padL} y={zeroY} width={plotW} height={padT + plotH - zeroY} />
        </clipPath>
        <path d={`${steppedPath} H ${xOf(months)} V ${zeroY} H ${xOf(0)} Z`}
          fill="#f8717115" clipPath="url(#bridgeBelow)" />

        {/* Stepped line */}
        <path d={steppedPath} fill="none" stroke="#e2e8f0" strokeWidth="2" strokeLinejoin="round" />

        {/* Event markers */}
        {events.map((ev, i) => {
          const x = xOf(ev.m);
          const pt = pts.find(p => p.month >= ev.m) || pts[0];
          const lineY = yOf(trendNet(pt));
          const labelAbove = ev.above;
          const labelY = labelAbove ? Math.min(lineY - 8, zeroY - 20) : Math.max(lineY + 14, zeroY + 16);
          return (
            <g key={i}>
              <line x1={x} x2={x} y1={padT} y2={padT + plotH} stroke={ev.color} strokeWidth="1" strokeDasharray="3,3" opacity="0.3" />
              <circle cx={x} cy={lineY} r="3" fill={ev.color} stroke="#0f172a" strokeWidth="1" />
              <text x={x} y={labelY} textAnchor="middle" fill={ev.color} fontSize="9" fontWeight="600" fontFamily="'JetBrains Mono', monospace">
                {ev.label}
              </text>
            </g>
          );
        })}

        {/* Crossover marker */}
        {crossMonth && (
          <g>
            <circle cx={xOf(crossMonth.month)} cy={zeroY} r="5" fill="none" stroke="#4ade80" strokeWidth="2" />
            <text x={xOf(crossMonth.month)} y={zeroY - 10} textAnchor="middle" fill="#4ade80" fontSize="10" fontWeight="700" fontFamily="'JetBrains Mono', monospace">
              Breakeven
            </text>
          </g>
        )}

        {/* Endpoint label */}
        <text
          x={svgW - padR - 4}
          y={yOf(finalNet)}
          textAnchor="end"
          fill={finalNet >= 0 ? "#4ade80" : "#f87171"}
          fontSize="10"
          fontWeight="700"
          fontFamily="'JetBrains Mono', monospace"
          dominantBaseline="middle"
        >
          {fmtFull(finalNet)}/mo
        </text>
      </svg>

      {/* MINI WATERFALL */}
      <div style={{ marginTop: 12, borderTop: "1px solid #334155", paddingTop: 12 }}>
        <div style={{ fontSize: 10, color: "#475569", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Lever summary — total monthly impact of each action
        </div>
        <div style={{ position: "relative", height: wfH }}>
          <div style={{
            position: "absolute", left: 0, right: 0, top: wfZeroY, height: 1,
            background: "#475569", zIndex: 1
          }} />
          <div style={{ display: "flex", gap: 2, height: wfH - wfLabelH, paddingTop: wfTopPad }}>
            {wfSteps.map((s, i) => {
              const prev = i === 0 ? 0 : (s.isEnd ? 0 : wfSteps[i-1].running || wfSteps[i-1].value);
              const curr = s.running || s.value;
              let barTop, barBot;
              if (s.isStart || s.isEnd) {
                barTop = s.value >= 0 ? wfToY(s.value) : wfZeroY;
                barBot = s.value >= 0 ? wfZeroY : wfToY(s.value);
              } else {
                barTop = wfToY(Math.max(prev, curr));
                barBot = wfToY(Math.min(prev, curr));
              }
              const barH = Math.max(barBot - barTop, 2);
              let barColor;
              if (s.isStart) barColor = s.value >= 0 ? "#4ade80" : "#f87171";
              else if (s.isEnd) barColor = curr >= 0 ? "#4ade80" : "#f87171";
              else barColor = s.color || "#4ade80";

              return (
                <div key={i} style={{ flex: 1, position: "relative", height: "100%" }}>
                  <div style={{
                    position: "absolute", top: barTop - wfTopPad, height: barH,
                    left: "8%", right: "8%",
                    background: barColor, opacity: (s.isStart || s.isEnd) ? 0.9 : 0.65,
                    borderRadius: 2,
                    border: (s.isStart || s.isEnd) ? "1px solid rgba(255,255,255,0.15)" : "none",
                    zIndex: 2
                  }} />
                  <div style={{
                    position: "absolute",
                    top: (s.value < 0 && !s.isStart && !s.isEnd) ? barBot - wfTopPad + 2 : barTop - wfTopPad - 16,
                    left: 0, right: 0, textAlign: "center",
                    fontSize: 10, fontWeight: 700, color: barColor,
                    fontFamily: "'JetBrains Mono', monospace",
                    whiteSpace: "nowrap", zIndex: 3
                  }}>
                    {(s.isStart || s.isEnd) ? fmtFull(s.value) : ((s.value >= 0 ? "+" : "") + fmtFull(s.value))}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 2, height: wfLabelH, alignItems: "flex-start", paddingTop: 4 }}>
            {wfSteps.map((s, i) => (
              <div key={i} style={{
                flex: 1, textAlign: "center", fontSize: 10,
                color: (s.isStart || s.isEnd) ? "#e2e8f0" : (s.value < 0 ? s.color : "#94a3b8"),
                fontWeight: (s.isStart || s.isEnd) ? 700 : 400,
                lineHeight: 1.3, whiteSpace: "pre-line"
              }}>
                {s.name}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BridgeChart;
