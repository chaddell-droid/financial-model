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

  // SS income at 67 (FRA) — full benefit from SS statement: $4,213/mo
  // At FRA there's no earnings test, no reduction. SSDI auto-converts to this.
  // This is the FRA amount, not the reduced age-62 amount ($2,933).
  const ssFRA = 4213;
  const ssMonthly = ssFRA;

  // Trust/LLC continues
  const trustMonthly = trustIncomeFuture || 0;

  // Total monthly retirement income
  const totalMonthly = monthlyWithdrawal + ssMonthly + trustMonthly;

  // Project 25 years of retirement (age 67-92) showing pool depletion
  const years = 25;
  const monthlyReturnRate = Math.pow(1 + retirementReturn / 100, 1/12) - 1;
  const monthlySpend = monthlyWithdrawal; // withdraw this much each month
  const yearlyData = [];
  let pool = totalPool;
  for (let y = 0; y <= years; y++) {
    yearlyData.push({ age: 67 + y, pool: Math.round(pool), monthly: Math.round(pool * (withdrawalRate / 100) / 12) + ssMonthly + trustMonthly });
    // Simulate 12 months of returns minus withdrawals
    for (let m = 0; m < 12; m++) {
      pool += pool * monthlyReturnRate;
      pool -= monthlySpend;
    }
    if (pool < 0) pool = 0;
  }

  // Chart dimensions
  const svgW = 800, svgH = 340;
  const padL = 60, padR = 20, padT = 20, padB = 30;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;

  const maxMonthly = Math.max(...yearlyData.map(d => d.monthly));
  const minMonthly = 0;
  const range = maxMonthly - minMonthly || 1;

  const x = (i) => padL + (i / years) * plotW;
  const y = (v) => padT + (1 - (v - minMonthly) / range) * plotH;

  // Stacked areas: SS on bottom, Trust in middle, Withdrawals on top
  const ssLine = yearlyData.map((d, i) => `${x(i)},${y(ssMonthly + trustMonthly)}`).join(' L ');
  const trustLine = yearlyData.map((d, i) => `${x(i)},${y(trustMonthly)}`).join(' L ');
  const totalLine = yearlyData.map((d, i) => `${x(i)},${y(d.monthly)}`).join(' L ');
  const zeroLine = yearlyData.map((d, i) => `${x(i)},${y(0)}`).join(' L ');

  // Areas
  const withdrawalArea = `M ${totalLine} L ${x(years)},${y(ssMonthly + trustMonthly)} L ${ssLine.split(' L ').reverse().join(' L ')} Z`;
  const ssArea = ssMonthly > 0 ? `M ${ssLine} L ${x(years)},${y(trustMonthly)} L ${trustLine.split(' L ').reverse().join(' L ')} Z` : null;
  const trustArea = trustMonthly > 0 ? `M ${trustLine} L ${x(years)},${y(0)} L ${zeroLine.split(' L ').reverse().join(' L ')} Z` : null;

  // Y ticks
  const tickStep = range > 20000 ? 5000 : range > 10000 ? 2000 : 1000;
  const yTicks = [];
  for (let v = 0; v <= maxMonthly; v += tickStep) yTicks.push(v);

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
          {poolSurvives ? 'Pool survives to 92' : `Pool depleted at ${depleteAge.age}`}
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

      {/* Chart */}
      <svg viewBox={`0 0 ${svgW} ${svgH}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        {/* Grid */}
        {yTicks.map((v, i) => (
          <g key={i}>
            <line x1={padL} x2={svgW - padR} y1={y(v)} y2={y(v)}
              stroke="#1e293b" strokeWidth="0.5" />
            <text x={padL - 6} y={y(v) + 3} textAnchor="end"
              fill="#64748b" fontSize="10" fontFamily="'JetBrains Mono', monospace">
              {v >= 1000 ? `$${(v/1000).toFixed(0)}K` : `$${v}`}
            </text>
          </g>
        ))}

        {/* Stacked areas */}
        {trustArea && <path d={trustArea} fill="#c084fc" opacity="0.2" />}
        {ssArea && <path d={ssArea} fill="#4ade80" opacity="0.2" />}
        <path d={withdrawalArea} fill="#60a5fa" opacity="0.2" />

        {/* Total line */}
        <path d={`M ${totalLine}`} fill="none" stroke="#e2e8f0" strokeWidth="2"
          strokeLinejoin="round" strokeLinecap="round" />

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
          { label: `Withdrawals (${withdrawalRate}%)`, color: '#60a5fa' },
          ...(ssMonthly > 0 ? [{ label: 'SS at FRA', color: '#4ade80' }] : []),
          ...(trustMonthly > 0 ? [{ label: 'Trust/LLC', color: '#c084fc' }] : []),
        ].map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 12, height: 12, borderRadius: 2, background: item.color, opacity: 0.4 }} />
            <span style={{ color: '#94a3b8' }}>{item.label}</span>
          </div>
        ))}
      </div>

      {/* Sliders */}
      <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Slider label="Investment return" value={retirementReturn} onChange={setRetirementReturn}
          min={0} max={30} step={0.5} format={(v) => v + '%'} color="#60a5fa" />
        <Slider label="Withdrawal rate" value={withdrawalRate} onChange={setWithdrawalRate}
          min={4} max={15} step={0.5} format={(v) => v + '%'} color="#f59e0b" />
      </div>
    </div>
  );
}
