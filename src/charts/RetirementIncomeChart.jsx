import React, { useState } from 'react';
import { fmtFull } from '../model/formatters.js';
import Slider from '../components/Slider.jsx';

export default function RetirementIncomeChart({
  savingsData, wealthData,
  ssType, ssPersonal, ssdiPersonal,
  chadJob,
  trustIncomeFuture,
  investmentReturn,
}) {
  const [retirementReturn, setRetirementReturn] = useState(investmentReturn || 8);
  const [withdrawalRate, setWithdrawalRate] = useState(4);
  const [targetAge, setTargetAge] = useState(92);
  // Assets at month 72 (approximately age 67)
  const endIdx = Math.min(72, savingsData.length - 1);
  const endSavings = Math.max(0, savingsData[endIdx]?.balance || 0);
  const end401k = wealthData[endIdx]?.balance401k || 0;
  const endHome = wealthData[endIdx]?.homeEquity || 0;

  // Sell the house at 67 — net proceeds after ~6% selling costs
  const homeSaleNet = Math.round(endHome * 0.94);

  // Total investment pool = savings + 401k + home sale proceeds
  const totalPool = endSavings + end401k + homeSaleNet;

  // Monthly withdrawal using configured withdrawal rate
  const monthlyWithdrawal = Math.round(totalPool * (withdrawalRate / 100) / 12);

  // SS income in retirement depends on which path was taken:
  // - SS at 62: locked into reduced early rate for life
  // - SSDI: auto-converts to full FRA benefit ($4,213) at 67
  // - Chad works until 67: claims full FRA benefit at 67
  const ssFRA = 4213;
  const ssMonthly = (ssType === 'ss' && !chadJob)
    ? (ssPersonal || 2933)   // took early SS at 62 — locked in at reduced rate
    : ssFRA;                  // SSDI converts to FRA, or worked and claims at 67

  // Trust/LLC continues
  const trustMonthly = trustIncomeFuture || 0;

  // Total monthly retirement income
  const totalMonthly = monthlyWithdrawal + ssMonthly + trustMonthly;

  // Project 30 years of retirement (age 67-97) showing pool depletion
  // Fixed dollar withdrawal from initial pool (standard 4% rule).
  // Returns grow/shrink the pool; fixed spend depletes it if returns are low.
  const years = 30;
  const monthlyReturnRate = Math.pow(1 + retirementReturn / 100, 1/12) - 1;
  const fixedMonthlySpend = monthlyWithdrawal; // locked to initial pool amount
  const yearlyData = [];
  let pool = totalPool;
  for (let y = 0; y <= years; y++) {
    const effectiveWithdrawal = pool > 0 ? fixedMonthlySpend : 0;
    yearlyData.push({ age: 67 + y, pool: Math.round(pool), monthly: effectiveWithdrawal + ssMonthly + trustMonthly });
    for (let m = 0; m < 12; m++) {
      if (pool > 0) {
        pool += pool * monthlyReturnRate;
        pool -= fixedMonthlySpend;
        if (pool < 0) pool = 0;
      }
    }
  }

  // Calculate optimal withdrawal rate for target age via binary search
  const optimalRate = (() => {
    if (totalPool <= 0) return 0;
    const targetYears = targetAge - 67;
    let lo = 0.1, hi = 30;
    for (let iter = 0; iter < 50; iter++) {
      const mid = (lo + hi) / 2;
      const testSpend = Math.round(totalPool * (mid / 100) / 12);
      let p = totalPool;
      let survived = true;
      for (let y = 0; y < targetYears; y++) {
        for (let m = 0; m < 12; m++) {
          if (p > 0) {
            p += p * monthlyReturnRate;
            p -= testSpend;
            if (p < 0) { survived = false; break; }
          }
        }
        if (!survived) break;
      }
      if (survived) lo = mid; else hi = mid;
    }
    return Math.round(lo * 10) / 10;
  })();
  const optimalMonthly = Math.round(totalPool * (optimalRate / 100) / 12);

  // Chart: pool balance trajectory (the dramatic visual)
  const svgW = 800, svgH = 340;
  const padL = 60, padR = 20, padT = 20, padB = 30;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;

  const maxPool = Math.max(...yearlyData.map(d => d.pool), totalPool) * 1.05;
  const poolRange = maxPool || 1;

  const x = (i) => padL + (i / years) * plotW;
  const yPool = (v) => padT + (1 - v / poolRange) * plotH;

  // Pool balance line and area
  const poolPts = yearlyData.map((d, i) => `${x(i)},${yPool(d.pool)}`);
  const poolLine = `M ${poolPts.join(' L ')}`;
  const poolArea = `M ${x(0)},${yPool(0)} L ${poolPts.join(' L ')} L ${x(years)},${yPool(0)} Z`;

  // Y ticks for pool
  const poolTickStep = poolRange > 2000000 ? 500000 : poolRange > 1000000 ? 250000 : poolRange > 500000 ? 100000 : 50000;
  const yTicks = [];
  for (let v = 0; v <= maxPool; v += poolTickStep) yTicks.push(v);

  const incomeCards = [
    { label: 'Investment Pool (age 67)', value: fmtFull(totalPool), color: '#e2e8f0', sub: `Savings ${fmtFull(endSavings)} + 401k ${fmtFull(end401k)} + Home ${fmtFull(homeSaleNet)}` },
    { label: `${withdrawalRate}% Withdrawal`, value: fmtFull(monthlyWithdrawal) + '/mo', color: '#60a5fa' },
    { label: 'SS at FRA (67)', value: fmtFull(ssMonthly) + '/mo', color: '#4ade80' },
    { label: 'Trust/LLC', value: fmtFull(trustMonthly) + '/mo', color: '#c084fc' },
    { label: 'Total Retirement Income', value: fmtFull(totalMonthly) + '/mo', color: totalMonthly > 8000 ? '#4ade80' : totalMonthly > 5000 ? '#fbbf24' : '#f87171' },
  ];

  // Find age when pool depletes
  const depleteAge = yearlyData.find(d => d.pool <= 0);
  const poolSurvives = !depleteAge;

  return (
    <div style={{
      background: '#1e293b', borderRadius: 12, padding: '20px 16px',
      border: '1px solid #334155', marginBottom: 24,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h3 style={{ fontSize: 14, color: '#e2e8f0', margin: 0, fontWeight: 600 }}>
          Retirement Income (from age 67)
        </h3>
        <span style={{ fontSize: 11, color: poolSurvives ? '#4ade80' : '#f87171', fontWeight: 600 }}>
          {poolSurvives ? 'Pool survives to 97' : `Pool depleted at ${depleteAge.age}`}
        </span>
      </div>
      <div style={{ fontSize: 10, color: '#64748b', marginBottom: 12, fontStyle: 'italic' }}>
        Assumes house sold at 67, {withdrawalRate}% withdrawal rate, {retirementReturn}% returns on pool
      </div>

      {/* Key numbers */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 16, flexWrap: 'wrap' }}>
        {incomeCards.map((item, i) => (
          <div key={i} style={{
            flex: 1, minWidth: 90,
            background: '#0f172a', borderRadius: 6, padding: '6px 10px',
            border: '1px solid #1e293b',
          }}>
            <div style={{ fontSize: 9, color: '#64748b', marginBottom: 2 }}>{item.label}</div>
            <div style={{
              fontSize: i === 0 ? 12 : 14, fontWeight: 700, color: item.color,
              fontFamily: "'JetBrains Mono', monospace",
            }}>
              {item.value}
            </div>
            {item.sub && (
              <div style={{ fontSize: 8, color: '#475569', marginTop: 1, fontFamily: "'JetBrains Mono', monospace" }}>
                {item.sub}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Chart: Pool balance trajectory */}
      <svg viewBox={`0 0 ${svgW} ${svgH}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        {/* Grid */}
        {yTicks.map((v, i) => (
          <g key={i}>
            <line x1={padL} x2={svgW - padR} y1={yPool(v)} y2={yPool(v)}
              stroke={v === 0 ? '#475569' : '#1e293b'} strokeWidth={v === 0 ? 1 : 0.5} />
            <text x={padL - 6} y={yPool(v) + 3} textAnchor="end"
              fill="#64748b" fontSize="10" fontFamily="'JetBrains Mono', monospace">
              {v >= 1000000 ? `$${(v/1000000).toFixed(1)}M` : v >= 1000 ? `$${(v/1000).toFixed(0)}K` : `$${v}`}
            </text>
          </g>
        ))}

        {/* Pool area fill */}
        <defs>
          <linearGradient id="retPoolGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#60a5fa" />
            <stop offset="100%" stopColor="transparent" />
          </linearGradient>
        </defs>
        <path d={poolArea} fill="url(#retPoolGrad)" opacity="0.25" />

        {/* Pool balance line */}
        <path d={poolLine} fill="none" stroke="#60a5fa" strokeWidth="2.5"
          strokeLinejoin="round" strokeLinecap="round" />

        {/* Depletion marker */}
        {depleteAge && (
          <g>
            <line x1={x(depleteAge.age - 67)} x2={x(depleteAge.age - 67)}
              y1={padT} y2={padT + plotH}
              stroke="#f87171" strokeWidth="1" strokeDasharray="4,3" />
            <text x={x(depleteAge.age - 67)} y={padT - 4} textAnchor="middle"
              fill="#f87171" fontSize="10" fontWeight="700" fontFamily="'JetBrains Mono', monospace">
              Pool depleted ({depleteAge.age})
            </text>
          </g>
        )}

        {/* X-axis labels */}
        {yearlyData.filter((_, i) => i % 5 === 0).map((d, i) => (
          <text key={i} x={x(d.age - 67)} y={svgH - 5} textAnchor="middle"
            fill="#64748b" fontSize="10" fontFamily="'JetBrains Mono', monospace">
            {d.age}
          </text>
        ))}
      </svg>

      {/* Legend */}
      <div style={{ marginTop: 8, display: 'flex', gap: 14, fontSize: 11 }}>
        {[
          { label: 'Investment Pool', color: '#60a5fa' },
          ...(depleteAge ? [{ label: `Depleted at ${depleteAge.age}`, color: '#f87171' }] : [{ label: 'Pool survives', color: '#4ade80' }]),
        ].map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 12, height: 12, borderRadius: 2, background: item.color, opacity: 0.4 }} />
            <span style={{ color: '#94a3b8' }}>{item.label}</span>
          </div>
        ))}
      </div>

      {/* Optimal withdrawal callout */}
      <div style={{
        marginTop: 12, padding: '10px 14px', background: '#0f172a', borderRadius: 8,
        border: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          <div style={{ fontSize: 10, color: '#64748b', marginBottom: 2 }}>Optimal withdrawal to last to age {targetAge}</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#4ade80', fontFamily: "'JetBrains Mono', monospace" }}>
            {optimalRate}% = {fmtFull(optimalMonthly)}/mo
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 10, color: '#64748b', marginBottom: 2 }}>Total monthly w/ SS + Trust</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#e2e8f0', fontFamily: "'JetBrains Mono', monospace" }}>
            {fmtFull(optimalMonthly + ssMonthly + trustMonthly)}/mo
          </div>
        </div>
      </div>

      {/* Sliders */}
      <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <Slider label="Investment return" value={retirementReturn} onChange={setRetirementReturn}
          min={0} max={30} step={0.5} format={(v) => v + '%'} color="#60a5fa" />
        <Slider label="Withdrawal rate" value={withdrawalRate} onChange={setWithdrawalRate}
          min={4} max={15} step={0.5} format={(v) => v + '%'} color="#f59e0b" />
        <Slider label="Target age" value={targetAge} onChange={setTargetAge}
          min={77} max={100} step={1} format={(v) => v + ''} color="#4ade80" />
      </div>
    </div>
  );
}
