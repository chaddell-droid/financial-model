import React from 'react';
import { fmt, fmtFull } from '../model/formatters.js';
import Slider from '../components/Slider.jsx';

export default function SequenceOfReturnsChart({
  seqBadY1, seqBadY2, onParamChange,
  startingSavings, investmentReturn, ssType, ssdiApprovalMonth, ssdiDenied, ssdiBackPayActual,
  ssStartMonth,
  monthlyDetail, presentMode
}) {
  if (presentMode) return null;

  const set = onParamChange;
  const annualReturn = investmentReturn;

  // Auto-compute recovery years to maintain same 6-year average
  const targetSum = annualReturn * 6;
  const earlySum = seqBadY1 + seqBadY2;
  const remainingSum = targetSum - earlySum;
  const baseRecovery = remainingSum / 4;
  const spread = [seqBadY1, seqBadY2, Math.round(baseRecovery - 3), Math.round(baseRecovery), Math.round(baseRecovery + 1), Math.round(baseRecovery + 2)];
  const currentSum = spread.reduce((a, b) => a + b, 0);
  spread[5] += (targetSum - currentSum);

  const badEarly = spread;
  const goodEarly = [...spread].reverse();
  const steady = Array(6).fill(annualReturn);

  const scenarios = [
    { name: "Steady returns", schedule: steady, color: "#94a3b8", dash: "6,4" },
    { name: "Bad luck early", schedule: badEarly, color: "#f87171", dash: "" },
    { name: "Good luck early", schedule: goodEarly, color: "#4ade80", dash: "" },
  ];

  // Zoom to 0-30 months — the vulnerability window through MSFT end
  const months = 30;
  const scenarioData = scenarios.map(sc => {
    let bal = startingSavings;
    const pts = [];
    for (let m = 0; m <= months; m++) {
      const yr = Math.min(Math.floor(m / 12), 5);
      const mRate = Math.pow(1 + sc.schedule[yr] / 100, 1/12) - 1;
      const md = monthlyDetail[m];
      if (!md) { pts.push(Math.round(bal)); continue; }
      const investRet = bal > 0 ? bal * mRate : 0;
      const cashFlow = md.cashIncome - md.expenses;
      bal += investRet + cashFlow;
      const useSS = ssType === 'ss';
      const effApproval = useSS ? 999 : (ssdiDenied ? 999 : ssdiApprovalMonth);
      if (!useSS && m === effApproval + 2) bal += ssdiBackPayActual;
      pts.push(Math.round(bal));
    }
    return { ...sc, pts };
  });

  // Key stats
  const cliffMonth = 18;
  const msftEndMonth = 30;
  const balAtCliff = scenarioData.map(s => s.pts[cliffMonth] || 0);
  const balAtEnd = scenarioData.map(s => s.pts[msftEndMonth] || s.pts[s.pts.length - 1]);
  const cliffGap = balAtCliff[2] - balAtCliff[1]; // good minus bad at cliff

  // Chart dimensions
  const seqW = 700, seqH = 220;
  const spl = 55, spr = 90, spt = 15, spb = 25;
  const spw = seqW - spl - spr, sph = seqH - spt - spb;
  const allPts = scenarioData.flatMap(s => s.pts);
  const seqMax = Math.max(...allPts, 100000) * 1.1;
  const seqMin = Math.min(...allPts, -20000) * 1.1;
  const seqRange = (seqMax - seqMin) || 1;
  const seqX = (m) => spl + (m / months) * spw;
  const seqY = (v) => spt + ((seqMax - v) / seqRange) * sph;
  const seqZeroY = seqY(0);
  const makePath = (pts) => pts.slice(0, months + 1).map((v, m) => `${m === 0 ? "M" : "L"} ${seqX(m).toFixed(1)},${seqY(v).toFixed(1)}`).join(" ");
  const zeroMonths = scenarioData.map(s => { const idx = s.pts.findIndex(v => v <= 0); return (idx >= 0 && idx <= months) ? idx : null; });

  // Y-axis ticks
  const yTicks = (() => {
    const step = seqRange > 500000 ? 100000 : seqRange > 200000 ? 50000 : 25000;
    const ticks = [];
    for (let v = Math.ceil(seqMin / step) * step; v <= seqMax; v += step) ticks.push(v);
    return ticks;
  })();

  return (
    <div style={{ marginTop: 16, padding: "14px 16px", background: "#1e293b", borderRadius: 12, border: "1px solid #334155", marginBottom: 24 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#e2e8f0", marginBottom: 2 }}>
        Sequence-of-Returns Risk — The Vulnerability Window
      </div>
      <div style={{ fontSize: 10, color: "#475569", marginBottom: 10 }}>
        Months 0–30: the critical drawdown period before the plan reaches sustainability. Same average returns, different timing.
      </div>

      {/* Controls */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <div style={{ flex: 1, background: "#0f172a", borderRadius: 6, padding: "6px 10px", border: "1px solid #334155" }}>
          <Slider label="Bad year 1 return" value={seqBadY1} onChange={set('seqBadY1')} min={-40} max={10} step={1} format={v => (v >= 0 ? "+" : "") + v + "%"} color="#f87171" />
        </div>
        <div style={{ flex: 1, background: "#0f172a", borderRadius: 6, padding: "6px 10px", border: "1px solid #334155" }}>
          <Slider label="Bad year 2 return" value={seqBadY2} onChange={set('seqBadY2')} min={-40} max={10} step={1} format={v => (v >= 0 ? "+" : "") + v + "%"} color="#f87171" />
        </div>
        <div style={{ flex: 1, background: "#0f172a", borderRadius: 6, padding: "6px 10px", border: "1px solid #334155", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ fontSize: 10, color: "#64748b", marginBottom: 2 }}>Recovery years (auto)</div>
          <div style={{ fontSize: 11, color: "#4ade80", fontFamily: "'JetBrains Mono', monospace" }}>
            {spread.slice(2).map(v => (v >= 0 ? "+" : "") + v + "%").join(", ")}
          </div>
          <div style={{ fontSize: 9, color: "#475569", marginTop: 2 }}>
            6yr avg: {Math.round(spread.reduce((a, b) => a + b, 0) / 6 * 10) / 10}% = base {annualReturn}%
          </div>
        </div>
      </div>

      {/* Balance at cliff stats */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {scenarios.map((sc, i) => (
          <div key={i} style={{ flex: 1, minWidth: 130, background: "#0f172a", borderRadius: 6, padding: "6px 10px", border: "1px solid #334155" }}>
            <div style={{ fontSize: 9, color: "#475569" }}>Balance at MSFT cliff (M18)</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: sc.color, fontFamily: "'JetBrains Mono', monospace" }}>
              {fmtFull(balAtCliff[i])}
            </div>
            <div style={{ fontSize: 9, color: "#475569" }}>
              At MSFT end (M30): {fmtFull(balAtEnd[i])}
            </div>
          </div>
        ))}
        <div style={{ flex: 1, minWidth: 130, background: "#0f172a", borderRadius: 6, padding: "6px 10px", border: "1px solid #fbbf2433" }}>
          <div style={{ fontSize: 9, color: "#475569" }}>Gap at cliff (good vs bad)</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#fbbf24", fontFamily: "'JetBrains Mono', monospace" }}>
            {fmtFull(cliffGap)}
          </div>
          <div style={{ fontSize: 9, color: "#475569" }}>
            Same avg return, {fmtFull(cliffGap)} different outcome
          </div>
        </div>
      </div>

      <svg viewBox={`0 0 ${seqW} ${seqH}`} style={{ width: "100%", height: "auto" }}>
        {/* Vulnerability shading */}
        {(() => {
          const useSS = ssType === 'ss';
          const deficitEnd = useSS ? (ssStartMonth || 18) : (ssdiDenied ? months : ssdiApprovalMonth);
          const deficitLabel = useSS ? 'PRE-SS DEFICIT' : 'PRE-SSDI DEFICIT';
          return (
            <>
              <rect x={seqX(0)} y={spt} width={seqX(deficitEnd) - seqX(0)} height={sph} fill="#f8717108" />
              <text x={seqX(deficitEnd / 2)} y={spt + 10} textAnchor="middle" fill="#f87171" fontSize="9" opacity="0.75">
                {deficitLabel}
              </text>
            </>
          );
        })()}

        {/* MSFT cliff marker */}
        <line x1={seqX(cliffMonth)} x2={seqX(cliffMonth)} y1={spt} y2={spt + sph} stroke="#f59e0b" strokeWidth="1" strokeDasharray="4,3" opacity="0.4" />
        <text x={seqX(cliffMonth)} y={spt + sph + 10} textAnchor="middle" fill="#f59e0b" fontSize="9">MSFT cliff</text>

        {/* MSFT end marker */}
        <line x1={seqX(msftEndMonth)} x2={seqX(msftEndMonth)} y1={spt} y2={spt + sph} stroke="#f87171" strokeWidth="1" strokeDasharray="4,3" opacity="0.4" />
        <text x={seqX(msftEndMonth)} y={spt + sph + 10} textAnchor="middle" fill="#f87171" fontSize="9">MSFT ends</text>

        {seqMin < 0 && <line x1={spl} x2={seqW - spr} y1={seqZeroY} y2={seqZeroY} stroke="#f8717133" strokeWidth="1" />}

        {/* Y-axis labels */}
        {yTicks.map(v => (
          <g key={v}>
            <line x1={spl} x2={seqW - spr} y1={seqY(v)} y2={seqY(v)} stroke="#1e293b" strokeWidth="0.5" />
            <text x={spl - 5} y={seqY(v) + 3} textAnchor="end" fill="#475569" fontSize="9" fontFamily="'JetBrains Mono', monospace">
            {fmt(v)}
          </text>
        </g>
      ))}

        {/* X-axis labels */}
        {[0, 6, 12, 18, 24, 30].map(m => (
          <text key={m} x={seqX(m)} y={seqH - 4} textAnchor="middle" fill="#475569" fontSize="9" fontFamily="'JetBrains Mono', monospace">
            {m === 0 ? "M0" : `M${m}`}
          </text>
        ))}

        {/* Scenario lines */}
        {scenarioData.map((s, i) => (
          <path key={i} d={makePath(s.pts)} fill="none" stroke={s.color}
            strokeWidth={i === 0 ? "1.5" : "2.5"} strokeDasharray={s.dash}
            strokeLinejoin="round" opacity={i === 0 ? 0.5 : 0.9} />
        ))}

        {/* Gap annotation at cliff */}
        {cliffGap > 0 && (() => {
          const goodY = seqY(balAtCliff[2]);
          const badY = seqY(balAtCliff[1]);
          const midY = (goodY + badY) / 2;
          const cx = seqX(cliffMonth);
          return (
            <g>
              <line x1={cx + 3} x2={cx + 3} y1={goodY} y2={badY} stroke="#fbbf24" strokeWidth="2" />
              <line x1={cx + 1} x2={cx + 5} y1={goodY} y2={goodY} stroke="#fbbf24" strokeWidth="1.5" />
              <line x1={cx + 1} x2={cx + 5} y1={badY} y2={badY} stroke="#fbbf24" strokeWidth="1.5" />
              <text x={cx + 8} y={midY + 4} fill="#fbbf24" fontSize="10" fontWeight="700" fontFamily="'JetBrains Mono', monospace">
                {fmtFull(cliffGap)} gap
              </text>
            </g>
          );
        })()}

        {/* Zero-crossing markers */}
        {zeroMonths.map((zm, i) => zm !== null ? (
          <g key={`z${i}`}>
            <circle cx={seqX(zm)} cy={seqZeroY} r="4" fill="none" stroke={scenarioData[i].color} strokeWidth="2" />
            <text x={seqX(zm)} y={seqZeroY + 14} textAnchor="middle" fill={scenarioData[i].color} fontSize="9" fontWeight="600">
              M{zm}
            </text>
          </g>
        ) : null)}

        {/* Endpoint labels */}
        {scenarioData.map((s, i) => {
          const final = s.pts[months];
          return (
            <text key={`e${i}`} x={seqX(months) + 4} y={seqY(final) + (i * 13 - 13)}
              fill={s.color} fontSize="10" fontWeight="600"
              fontFamily="'JetBrains Mono', monospace" dominantBaseline="middle">
              {fmtFull(final)}
            </text>
          );
        })}
      </svg>

      {/* Legend */}
      <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 6, flexWrap: "wrap" }}>
        {scenarioData.map((s, i) => {
          const avg = Math.round(s.schedule.reduce((a, b) => a + b, 0) / s.schedule.length * 10) / 10;
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 16, height: i === 0 ? 0 : 3, borderTop: i === 0 ? `2px dashed ${s.color}` : `3px solid ${s.color}` }} />
              <span style={{ fontSize: 10, color: s.color }}>{s.name} (avg {avg}%)</span>
            </div>
          );
        })}
      </div>

      {/* Narrative */}
      <div style={{ marginTop: 10, fontSize: 11, color: "#94a3b8", lineHeight: 1.6 }}>
        With {seqBadY1}% and {seqBadY2}% returns in years 1–2, <strong style={{ color: "#f87171" }}>bad early returns</strong> drain
        the savings buffer faster — arriving at the MSFT cliff with {fmtFull(cliffGap)} less than
        <strong style={{ color: "#4ade80" }}> good early returns</strong> ({goodEarly[0]}% and {goodEarly[1]}% in years 1–2), despite identical average performance.
        {" "}<span style={{ color: "#fbbf24" }}>The inheritance advance directly reduces the monthly deficit
        during this window, preserving more of the savings buffer regardless of market conditions.
        Every dollar of deficit reduction during months 0–18 compounds forward.</span>
      </div>
    </div>
  );
}
