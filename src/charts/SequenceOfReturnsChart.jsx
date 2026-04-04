import React from 'react';
import { fmt, fmtFull } from '../model/formatters.js';
import Slider from '../components/Slider.jsx';
import { buildLegendItems, formatModelTimeLabel } from './chartContract.js';

export default function SequenceOfReturnsChart({
  seqBadY1, seqBadY2, onParamChange,
  startingSavings, investmentReturn, ssType, ssdiApprovalMonth, ssdiDenied, ssdiBackPayActual,
  ssStartMonth,
  monthlyDetail, presentMode
}) {
  if (presentMode) return null;

  const set = onParamChange;
  const annualReturn = investmentReturn;

  // Derive horizon from projection data
  const months = (monthlyDetail.length > 1) ? monthlyDetail.length - 1 : 30;
  const years = Math.ceil(months / 12);

  // Auto-compute recovery years to maintain same N-year average
  const targetSum = annualReturn * years;
  const earlySum = seqBadY1 + seqBadY2;
  const remainingSum = targetSum - earlySum;
  const recoveryYears = Math.max(1, years - 2);
  const baseRecovery = remainingSum / recoveryYears;
  const spread = [seqBadY1, seqBadY2];
  for (let y = 0; y < recoveryYears; y++) {
    const offset = y - Math.floor(recoveryYears / 2);
    spread.push(Math.round(baseRecovery + offset));
  }
  const currentSum = spread.reduce((a, b) => a + b, 0);
  spread[spread.length - 1] += (targetSum - currentSum);

  const badEarly = spread;
  const goodEarly = [...spread].reverse();
  const steady = Array(years).fill(annualReturn);

  const scenarios = [
    { name: "Steady returns", schedule: steady, color: "#94a3b8", dash: "6,4" },
    { name: "Bad luck early", schedule: badEarly, color: "#f87171", dash: "" },
    { name: "Good luck early", schedule: goodEarly, color: "#4ade80", dash: "" },
  ];

  const scenarioData = scenarios.map(sc => {
    let bal = startingSavings;
    const pts = [];
    for (let m = 0; m <= months; m++) {
      const yr = Math.min(Math.floor(m / 12), years - 1);
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
  const legendItems = buildLegendItems(scenarioData.map((scenario) => ({
    id: scenario.name.toLowerCase().replace(/\s+/g, '-'),
    label: scenario.name,
    color: scenario.color,
    type: scenario.dash ? 'dashed' : 'line',
    detail: `avg ${Math.round(scenario.schedule.reduce((a, b) => a + b, 0) / scenario.schedule.length * 10) / 10}%`,
  })));

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
        What if bad returns arrive before the plan reaches stability?
      </div>
      <div style={{ fontSize: 10, color: "#475569", marginBottom: 10 }}>
        Months 0-30 are the vulnerable window. This keeps the same average {years}-year return and changes only the order that returns arrive.
      </div>

      <div data-testid="sequence-returns-summary" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8, marginBottom: 12 }}>
        <div style={{ background: "#0f172a", borderRadius: 6, padding: "8px 10px", border: "1px solid #334155" }}>
          <div style={{ fontSize: 9, color: "#64748b", marginBottom: 2 }}>Bad early path at M18</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#f87171", fontFamily: "'JetBrains Mono', monospace" }}>
            {fmtFull(balAtCliff[1])}
          </div>
        </div>
        <div style={{ background: "#0f172a", borderRadius: 6, padding: "8px 10px", border: "1px solid #fbbf2433" }}>
          <div style={{ fontSize: 9, color: "#64748b", marginBottom: 2 }}>Difference by the cliff</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#fbbf24", fontFamily: "'JetBrains Mono', monospace" }}>
            {fmtFull(cliffGap)}
          </div>
        </div>
        <div style={{ background: "#0f172a", borderRadius: 6, padding: "8px 10px", border: "1px solid #334155" }}>
          <div style={{ fontSize: 9, color: "#64748b", marginBottom: 2 }}>Good early path at M18</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#4ade80", fontFamily: "'JetBrains Mono', monospace" }}>
            {fmtFull(balAtCliff[2])}
          </div>
        </div>
      </div>

      {/* Controls */}
      <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700, marginBottom: 6 }}>
        Scenario setup
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <div style={{ flex: 1, background: "#0f172a", borderRadius: 6, padding: "6px 10px", border: "1px solid #334155" }}>
          <Slider label="Bad year 1 return" value={seqBadY1} onChange={set('seqBadY1')} commitStrategy='release' min={-40} max={10} step={1} format={v => (v >= 0 ? "+" : "") + v + "%"} color="#f87171" />
        </div>
        <div style={{ flex: 1, background: "#0f172a", borderRadius: 6, padding: "6px 10px", border: "1px solid #334155" }}>
          <Slider label="Bad year 2 return" value={seqBadY2} onChange={set('seqBadY2')} commitStrategy='release' min={-40} max={10} step={1} format={v => (v >= 0 ? "+" : "") + v + "%"} color="#f87171" />
        </div>
        <div style={{ flex: 1, background: "#0f172a", borderRadius: 6, padding: "6px 10px", border: "1px solid #334155", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ fontSize: 10, color: "#64748b", marginBottom: 2 }}>Recovery years (auto)</div>
          <div style={{ fontSize: 11, color: "#4ade80", fontFamily: "'JetBrains Mono', monospace" }}>
            {spread.slice(2).map(v => (v >= 0 ? "+" : "") + v + "%").join(", ")}
          </div>
          <div style={{ fontSize: 9, color: "#475569", marginTop: 2 }}>
            {years}yr avg: {Math.round(spread.reduce((a, b) => a + b, 0) / years * 10) / 10}% = base {annualReturn}%
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
        {Array.from({ length: Math.floor(months / 12) + 1 }, (_, i) => i * 12).map(m => (
          <text key={m} x={seqX(m)} y={seqH - 4} textAnchor="middle" fill="#475569" fontSize="9" fontFamily="'JetBrains Mono', monospace">
            {formatModelTimeLabel(m)}
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
        {zeroMonths.map((zm, i) => (zm !== null && i !== 0) ? (
          <g key={`z${i}`}>
            <circle cx={seqX(zm)} cy={seqZeroY} r="4" fill="none" stroke={scenarioData[i].color} strokeWidth="2" />
            <text x={seqX(zm)} y={seqZeroY + 14} textAnchor="middle" fill={scenarioData[i].color} fontSize="9" fontWeight="600">
              {formatModelTimeLabel(zm)}
            </text>
          </g>
        ) : null)}

        {/* Endpoint labels */}
        {scenarioData.map((s, i) => {
          if (i === 0) return null;
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
        {legendItems.map((item) => (
          <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 16, height: item.type === 'dashed' ? 0 : 3, borderTop: item.type === 'dashed' ? `2px dashed ${item.color}` : `3px solid ${item.color}` }} />
            <span style={{ fontSize: 10, color: item.color }}>{item.label} ({item.detail})</span>
          </div>
        ))}
      </div>

      {/* Narrative */}
      <div data-testid="sequence-returns-narrative" style={{ marginTop: 10, fontSize: 11, color: "#94a3b8", lineHeight: 1.6 }}>
        With {seqBadY1}% and {seqBadY2}% returns in years 1-2, <strong style={{ color: "#f87171" }}>bad early returns</strong> reach the MSFT cliff with {fmtFull(cliffGap)} less cash than
        <strong style={{ color: "#4ade80" }}> good early returns</strong> ({goodEarly[0]}% and {goodEarly[1]}% in years 1-2), even though the {years}-year average return is identical.
        {" "}<span style={{ color: "#fbbf24" }}>That difference is the sequence-risk cost of taking losses before the plan reaches stability. The inheritance advance reduces the deficit during this window and preserves more runway regardless of market direction.</span>
      </div>
    </div>
  );
}
