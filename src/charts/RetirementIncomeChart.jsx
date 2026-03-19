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
  const [poolFloor, setPoolFloor] = useState(0);
  const [chadPassesAge, setChadPassesAge] = useState(82);

  // Chad is 60, Sarah is 46 (14 years younger)
  const ageDiff = 14;

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

  // Chad's SS at retirement
  const ssFRA = 4213;
  const chadSS = (ssType === 'ss' && !chadJob)
    ? (ssPersonal || 2933)
    : ssFRA;

  // Sarah's own SS (estimated ~$1,900/mo at her FRA 67, ~$1,330 at 62)
  const sarahOwnSS = 1900;
  // Survivor benefit — she gets the larger of her own or Chad's record
  const survivorSS = 4186; // from SS statement

  // Trust/LLC continues for both phases
  const trustMonthly = trustIncomeFuture || 0;

  // Total monthly retirement income (Chad alive)
  const totalMonthly = monthlyWithdrawal + chadSS + trustMonthly;

  // Simulation: two phases
  // Phase 1: Chad alive (age 67 to chadPassesAge)
  // Phase 2: Sarah survivor (chadPassesAge to Sarah age 90)
  // Sarah age 90 = Chad age (90 + ageDiff) = 109
  const sarahTargetAge = 90;
  const endChadAge = chadPassesAge;
  const endAge = sarahTargetAge + ageDiff; // on Chad's age scale
  const years = endAge - 67;

  const monthlyReturnRate = Math.pow(1 + retirementReturn / 100, 1/12) - 1;
  const fixedMonthlySpend = monthlyWithdrawal;
  const yearlyData = [];
  let pool = totalPool;

  for (let y = 0; y <= years; y++) {
    const chadAge = 67 + y;
    const sarahAge = chadAge - ageDiff;
    const chadAlive = chadAge < endChadAge;
    const isSurvivorPhase = !chadAlive;

    // SS income for this year
    let ssIncome;
    if (chadAlive) {
      // Sarah can claim spousal at 62 (50% of Chad's PIA ≈ $2,107)
      const sarahSpousal = sarahAge >= 62 ? Math.min(Math.round(ssFRA * 0.5), sarahOwnSS) : 0;
      ssIncome = chadSS + sarahSpousal;
    } else {
      // Survivor: Sarah gets the larger of survivor benefit or her own
      const sarahBenefit = sarahAge >= 67 ? Math.max(survivorSS, sarahOwnSS) :
        sarahAge >= 60 ? Math.round(survivorSS * 0.715) : 0; // reduced survivor at 60
      ssIncome = sarahBenefit;
    }

    const effectiveWithdrawal = pool > poolFloor ? fixedMonthlySpend : 0;
    yearlyData.push({
      age: chadAge, sarahAge, pool: Math.round(pool),
      monthly: effectiveWithdrawal + ssIncome + trustMonthly,
      ssIncome, phase: chadAlive ? 'chad' : 'survivor',
    });

    for (let m = 0; m < 12; m++) {
      if (pool > poolFloor) {
        pool += pool * monthlyReturnRate;
        pool -= fixedMonthlySpend;
        if (pool < poolFloor) pool = poolFloor;
      }
    }
  }

  // Optimal withdrawal to keep pool above floor through Sarah age 90
  const optimalRate = (() => {
    if (totalPool <= poolFloor) return 0;
    const totalYears = years;
    let lo = 0.1, hi = 30;
    for (let iter = 0; iter < 50; iter++) {
      const mid = (lo + hi) / 2;
      const testSpend = Math.round(totalPool * (mid / 100) / 12);
      let p = totalPool;
      let survived = true;
      for (let y = 0; y < totalYears; y++) {
        for (let m = 0; m < 12; m++) {
          if (p > poolFloor) {
            p += p * monthlyReturnRate;
            p -= testSpend;
            if (p < poolFloor) { survived = false; break; }
          }
        }
        if (!survived) break;
      }
      if (survived) lo = mid; else hi = mid;
    }
    return Math.round(lo * 10) / 10;
  })();
  const optimalMonthly = Math.round(totalPool * (optimalRate / 100) / 12);

  // Chart
  const svgW = 800, svgH = 340;
  const padL = 70, padR = 20, padT = 20, padB = 40;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;

  const maxPool = Math.max(...yearlyData.map(d => d.pool), totalPool) * 1.05;
  const poolRange = maxPool || 1;

  const x = (i) => padL + (i / years) * plotW;
  const yPool = (v) => padT + (1 - v / poolRange) * plotH;

  const poolPts = yearlyData.map((d, i) => `${x(i)},${yPool(d.pool)}`);
  const poolLine = `M ${poolPts.join(' L ')}`;
  const poolArea = `M ${x(0)},${yPool(0)} L ${poolPts.join(' L ')} L ${x(years)},${yPool(0)} Z`;

  // Survivor phase shading
  const survivorStartIdx = yearlyData.findIndex(d => d.phase === 'survivor');

  // Aim for ~5 ticks max for readability
  const targetTicks = 5;
  const rawStep = poolRange / targetTicks;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const poolTickStep = Math.ceil(rawStep / magnitude) * magnitude;
  const yTicks = [];
  for (let v = 0; v <= maxPool; v += poolTickStep) yTicks.push(v);

  const depleteAge = yearlyData.find(d => d.pool <= poolFloor);
  const poolSurvives = !depleteAge;

  // Income summary for survivor phase
  const survivorStart = yearlyData.find(d => d.phase === 'survivor');
  const survivorMonthly = survivorStart ? survivorStart.monthly : 0;

  const incomeCards = [
    { label: 'Investment Pool (age 67)', value: fmtFull(totalPool), color: '#e2e8f0', sub: `Savings ${fmtFull(endSavings)} + 401k ${fmtFull(end401k)} + Home ${fmtFull(homeSaleNet)}` },
    { label: `${withdrawalRate}% Withdrawal`, value: fmtFull(monthlyWithdrawal) + '/mo', color: '#60a5fa' },
    { label: "Chad's SS", value: fmtFull(chadSS) + '/mo', color: '#4ade80' },
    { label: `Sarah survivor SS`, value: fmtFull(survivorSS) + '/mo', color: '#f59e0b', sub: `After Chad (at ${chadPassesAge})` },
    { label: 'Trust/LLC', value: fmtFull(trustMonthly) + '/mo', color: '#c084fc' },
  ];

  return (
    <div style={{
      background: '#1e293b', borderRadius: 12, padding: '20px 16px',
      border: '1px solid #334155', marginBottom: 24,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h3 style={{ fontSize: 14, color: '#e2e8f0', margin: 0, fontWeight: 600 }}>
          Retirement + Survivor Income
        </h3>
        <span style={{ fontSize: 11, color: poolSurvives ? '#4ade80' : '#f87171', fontWeight: 600 }}>
          {poolSurvives
            ? `Pool ${poolFloor > 0 ? '> ' + fmtFull(poolFloor) : 'lasts'} to Sarah age ${sarahTargetAge}`
            : `Pool hits ${poolFloor > 0 ? fmtFull(poolFloor) : '$0'} at Chad ${depleteAge.age} (Sarah ${depleteAge.sarahAge})`
          }
        </span>
      </div>
      <div style={{ fontSize: 10, color: '#64748b', marginBottom: 12, fontStyle: 'italic' }}>
        House sold at 67 · {withdrawalRate}% withdrawal · {retirementReturn}% returns · Chad passes at {chadPassesAge} · Sarah survivor to {sarahTargetAge}
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
            <line x1={padL} x2={svgW - padR} y1={yPool(v)} y2={yPool(v)}
              stroke={v === 0 ? '#475569' : '#1e293b'} strokeWidth={v === 0 ? 1 : 0.5} />
            <text x={padL - 8} y={yPool(v) + 4} textAnchor="end"
              fill="#94a3b8" fontSize="12" fontFamily="'JetBrains Mono', monospace">
              {v >= 1000000 ? `$${(v/1000000).toFixed(1)}M` : v >= 1000 ? `$${(v/1000).toFixed(0)}K` : `$${v}`}
            </text>
          </g>
        ))}

        {/* Survivor phase background */}
        {survivorStartIdx >= 0 && (
          <rect x={x(survivorStartIdx)} y={padT} width={x(years) - x(survivorStartIdx)} height={plotH}
            fill="#f59e0b" opacity="0.04" />
        )}

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

        {/* Pool floor line */}
        {poolFloor > 0 && (
          <line x1={padL} x2={svgW - padR} y1={yPool(poolFloor)} y2={yPool(poolFloor)}
            stroke="#f59e0b" strokeWidth="1" strokeDasharray="6,3" opacity="0.6" />
        )}

        {/* Chad passes marker */}
        {survivorStartIdx >= 0 && (
          <g>
            <line x1={x(survivorStartIdx)} x2={x(survivorStartIdx)}
              y1={padT} y2={padT + plotH}
              stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="4,3" />
            <text x={x(survivorStartIdx)} y={padT - 4} textAnchor="middle"
              fill="#f59e0b" fontSize="9" fontWeight="700" fontFamily="'JetBrains Mono', monospace">
              Chad {chadPassesAge} / Sarah {chadPassesAge - ageDiff}
            </text>
          </g>
        )}

        {/* Depletion marker */}
        {depleteAge && (
          <g>
            <line x1={x(depleteAge.age - 67)} x2={x(depleteAge.age - 67)}
              y1={padT} y2={padT + plotH}
              stroke="#f87171" strokeWidth="1" strokeDasharray="4,3" />
            <text x={x(depleteAge.age - 67)} y={padT + 12} textAnchor="middle"
              fill="#f87171" fontSize="9" fontWeight="700" fontFamily="'JetBrains Mono', monospace">
              Depleted
            </text>
          </g>
        )}

        {/* X-axis labels — show both Chad and Sarah ages */}
        {yearlyData.filter((_, i) => i % 5 === 0).map((d, i) => (
          <g key={i}>
            <text x={x(d.age - 67)} y={svgH - 20} textAnchor="middle"
              fill="#94a3b8" fontSize="11" fontFamily="'JetBrains Mono', monospace">
              C:{d.age}
            </text>
            <text x={x(d.age - 67)} y={svgH - 8} textAnchor="middle"
              fill="#f59e0b" fontSize="11" fontFamily="'JetBrains Mono', monospace" opacity="0.7">
              S:{d.sarahAge}
            </text>
          </g>
        ))}
      </svg>

      {/* Legend */}
      <div style={{ marginTop: 8, display: 'flex', gap: 14, fontSize: 11, flexWrap: 'wrap' }}>
        {[
          { label: 'Investment Pool', color: '#60a5fa' },
          { label: `Survivor phase (Sarah)`, color: '#f59e0b' },
          ...(depleteAge ? [{ label: `Depleted at Chad ${depleteAge.age}`, color: '#f87171' }] : [{ label: 'Pool lasts', color: '#4ade80' }]),
        ].map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 12, height: 12, borderRadius: 2, background: item.color, opacity: 0.4 }} />
            <span style={{ color: '#94a3b8' }}>{item.label}</span>
          </div>
        ))}
      </div>

      {/* Optimal withdrawal */}
      <div style={{
        marginTop: 12, padding: '10px 14px', background: '#0f172a', borderRadius: 8,
        border: '1px solid #334155',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 10, color: '#64748b', marginBottom: 2 }}>
              Optimal withdrawal to Sarah age {sarahTargetAge}{poolFloor > 0 ? ` (keeping ${fmtFull(poolFloor)})` : ''}
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#4ade80', fontFamily: "'JetBrains Mono', monospace" }}>
              {optimalRate}% = {fmtFull(optimalMonthly)}/mo
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, color: '#64748b', marginBottom: 2 }}>Survivor monthly (Sarah)</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#f59e0b', fontFamily: "'JetBrains Mono', monospace" }}>
              {fmtFull((pool > poolFloor ? optimalMonthly : 0) + survivorSS + trustMonthly)}/mo
            </div>
          </div>
        </div>
      </div>

      {/* Sliders */}
      <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Slider label="Investment return" value={retirementReturn} onChange={setRetirementReturn}
          min={0} max={30} step={0.5} format={(v) => v + '%'} color="#60a5fa" />
        <Slider label="Withdrawal rate" value={withdrawalRate} onChange={setWithdrawalRate}
          min={4} max={15} step={0.5} format={(v) => v + '%'} color="#f59e0b" />
        <Slider label="Chad passes at" value={chadPassesAge} onChange={setChadPassesAge}
          min={67} max={95} step={1} format={(v) => v + ''} color="#f59e0b" />
        <Slider label="Pool floor (reserve)" value={poolFloor} onChange={setPoolFloor}
          min={0} max={Math.min(totalPool, 500000)} step={25000} color="#f59e0b" />
      </div>
    </div>
  );
}
