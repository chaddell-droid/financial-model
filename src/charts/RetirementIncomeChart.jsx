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
  const [tooltip, setTooltip] = useState(null);

  // Chad is 60, Sarah is 46 (14 years younger)
  const ageDiff = 14;

  // Assets at month 72 (approximately age 67)
  const endIdx = Math.min(72, savingsData.length - 1);
  const endSavings = savingsData[endIdx]?.balance || 0; // can be negative (represents debt)
  const end401k = wealthData[endIdx]?.balance401k || 0;
  const endHome = wealthData[endIdx]?.homeEquity || 0;

  // Sell the house at 67 — net proceeds after ~6% selling costs
  const homeSaleNet = Math.round(endHome * 0.94);

  // Total investment pool = savings + 401k + home sale proceeds
  // Negative savings (debt) reduces the pool — must be paid from home proceeds
  const totalPool = Math.max(0, endSavings + end401k + homeSaleNet);

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

  // Two-phase withdrawal: Chad alive needs more (2 people), survivor needs less (1 person)
  // Assume survivor phase needs ~60% of the couple withdrawal (single person household)
  const survivorSpendRatio = 0.6;
  const coupleMonthlySpend = monthlyWithdrawal;
  const survivorMonthlySpend = Math.round(monthlyWithdrawal * survivorSpendRatio);

  const yearlyData = [];
  let pool = totalPool;

  for (let y = 0; y <= years; y++) {
    const chadAge = 67 + y;
    const sarahAge = chadAge - ageDiff;
    const chadAlive = chadAge < endChadAge;

    // SS income for this year
    let ssIncome;
    if (chadAlive) {
      const sarahSpousal = sarahAge >= 62 ? Math.min(Math.round(ssFRA * 0.5), sarahOwnSS) : 0;
      ssIncome = chadSS + sarahSpousal;
    } else {
      const sarahBenefit = sarahAge >= 67 ? Math.max(survivorSS, sarahOwnSS) :
        sarahAge >= 60 ? Math.round(survivorSS * 0.715) : 0;
      ssIncome = sarahBenefit;
    }

    // Withdrawal depends on phase
    const phaseSpend = chadAlive ? coupleMonthlySpend : survivorMonthlySpend;
    const effectiveWithdrawal = pool > poolFloor ? phaseSpend : 0;
    yearlyData.push({
      age: chadAge, sarahAge, pool: Math.round(pool),
      monthly: effectiveWithdrawal + ssIncome + trustMonthly,
      ssIncome, phase: chadAlive ? 'chad' : 'survivor',
    });

    for (let m = 0; m < 12; m++) {
      if (pool > poolFloor) {
        pool += pool * monthlyReturnRate;
        pool -= phaseSpend;
        if (pool < poolFloor) pool = poolFloor;
      }
    }
  }

  // Optimal withdrawal: binary search accounting for phase-dependent spending
  const optimalRate = (() => {
    if (totalPool <= poolFloor) return 0;
    let lo = 0.1, hi = 30;
    for (let iter = 0; iter < 50; iter++) {
      const mid = (lo + hi) / 2;
      const testCouple = Math.round(totalPool * (mid / 100) / 12);
      const testSurvivor = Math.round(testCouple * survivorSpendRatio);
      let p = totalPool;
      let survived = true;
      for (let y = 0; y < years; y++) {
        const chadAge = 67 + y;
        const spend = chadAge < endChadAge ? testCouple : testSurvivor;
        for (let m = 0; m < 12; m++) {
          if (p > poolFloor) {
            p += p * monthlyReturnRate;
            p -= spend;
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

  // Income summaries for both phases
  const phase1SS = chadSS;
  const phase1Total = coupleMonthlySpend + phase1SS + trustMonthly;
  const phase2SS = survivorSS;
  const phase2Spend = survivorMonthlySpend;
  const phase2Total = phase2Spend + phase2SS + trustMonthly;

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

      {/* Pool + Two-phase income summary */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
        {/* Pool */}
        <div style={{ background: '#0f172a', borderRadius: 8, padding: '10px 12px', border: '1px solid #1e293b' }}>
          <div style={{ fontSize: 9, color: '#64748b', marginBottom: 4 }}>Investment Pool (age 67)</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#e2e8f0', fontFamily: "'JetBrains Mono', monospace" }}>
            {fmtFull(totalPool)}
          </div>
          <div style={{ fontSize: 8, color: '#475569', marginTop: 2, fontFamily: "'JetBrains Mono', monospace" }}>
            Savings {fmtFull(endSavings)} + 401k {fmtFull(end401k)} + Home {fmtFull(homeSaleNet)}
          </div>
        </div>

        {/* Phase 1: Chad + Sarah */}
        <div style={{ background: '#0f172a', borderRadius: 8, padding: '10px 12px', border: '1px solid #60a5fa33' }}>
          <div style={{ fontSize: 9, color: '#60a5fa', marginBottom: 4 }}>Retirement Income (67–{chadPassesAge})</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#60a5fa', fontFamily: "'JetBrains Mono', monospace" }}>
            {fmtFull(phase1Total)}/mo
          </div>
          <div style={{ fontSize: 8, color: '#475569', marginTop: 2, fontFamily: "'JetBrains Mono', monospace" }}>
            {fmtFull(coupleMonthlySpend)} withdraw + {fmtFull(phase1SS)} SS + {fmtFull(trustMonthly)} trust
          </div>
        </div>

        {/* Phase 2: Sarah survivor */}
        <div style={{ background: '#0f172a', borderRadius: 8, padding: '10px 12px', border: '1px solid #f59e0b33' }}>
          <div style={{ fontSize: 9, color: '#f59e0b', marginBottom: 4 }}>Sarah Survivor (after {chadPassesAge})</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#f59e0b', fontFamily: "'JetBrains Mono', monospace" }}>
            {fmtFull(phase2Total)}/mo
          </div>
          <div style={{ fontSize: 8, color: '#475569', marginTop: 2, fontFamily: "'JetBrains Mono', monospace" }}>
            {fmtFull(phase2Spend)} withdraw + {fmtFull(phase2SS)} SS + {fmtFull(trustMonthly)} trust
          </div>
        </div>
      </div>

      {/* Chart */}
      <div style={{ position: 'relative' }} onMouseLeave={() => setTooltip(null)}>
      <svg viewBox={`0 0 ${svgW} ${svgH}`} style={{ width: '100%', height: 'auto', display: 'block' }}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const mouseX = (e.clientX - rect.left) / rect.width * svgW;
          let closestIdx = 0;
          let closestDist = Infinity;
          for (let i = 0; i < yearlyData.length; i++) {
            const dist = Math.abs(x(i) - mouseX);
            if (dist < closestDist) { closestDist = dist; closestIdx = i; }
          }
          const d = yearlyData[closestIdx];
          const pctX = (x(closestIdx) / svgW) * 100;
          const pctY = (yPool(d.pool) / svgH) * 100;
          setTooltip({ pctX, pctY, ...d });
        }}>
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

        {/* Start label */}
        <text x={padL + 4} y={yPool(totalPool) - 6}
          fill="#60a5fa" fontSize="11" fontWeight="600" fontFamily="'JetBrains Mono', monospace">
          {totalPool >= 1000000 ? `$${(totalPool/1000000).toFixed(1)}M` : `$${(totalPool/1000).toFixed(0)}K`}
        </text>

        {/* End label */}
        {(() => {
          const endPool = yearlyData[yearlyData.length - 1]?.pool || 0;
          return endPool > 0 ? (
            <text x={x(years) - 4} y={yPool(endPool) - 6} textAnchor="end"
              fill={endPool > totalPool ? '#4ade80' : '#60a5fa'} fontSize="11" fontWeight="600" fontFamily="'JetBrains Mono', monospace">
              {endPool >= 1000000 ? `$${(endPool/1000000).toFixed(1)}M` : `$${(endPool/1000).toFixed(0)}K`}
            </text>
          ) : null;
        })()}

        {/* Pool value at Chad passes */}
        {survivorStartIdx >= 0 && yearlyData[survivorStartIdx]?.pool > 0 && (
          <text x={x(survivorStartIdx) + 4} y={yPool(yearlyData[survivorStartIdx].pool) - 6}
            fill="#f59e0b" fontSize="10" fontWeight="600" fontFamily="'JetBrains Mono', monospace">
            {yearlyData[survivorStartIdx].pool >= 1000000
              ? `$${(yearlyData[survivorStartIdx].pool/1000000).toFixed(1)}M`
              : `$${(yearlyData[survivorStartIdx].pool/1000).toFixed(0)}K`}
          </text>
        )}

        {/* Hover dot */}
        {tooltip && (
          <circle cx={x(tooltip.age - 67)} cy={yPool(tooltip.pool)} r="5"
            fill="#60a5fa" stroke="#f8fafc" strokeWidth="2" />
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

      {/* Hover tooltip */}
      {tooltip && (
        <div style={{
          position: 'absolute',
          left: `${tooltip.pctX}%`,
          top: `${Math.min(tooltip.pctY, 65)}%`,
          transform: 'translate(-50%, -120%)',
          background: '#0f172a',
          border: '1px solid #475569',
          borderRadius: 6,
          padding: '8px 12px',
          pointerEvents: 'none',
          zIndex: 10,
          whiteSpace: 'nowrap',
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
        }}>
          <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>
            Chad {tooltip.age} / Sarah {tooltip.sarahAge} {tooltip.phase === 'survivor' ? '(survivor)' : ''}
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#60a5fa', fontFamily: "'JetBrains Mono', monospace" }}>
            Pool: {fmtFull(tooltip.pool)}
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
            Income: {fmtFull(tooltip.monthly)}/mo (SS: {fmtFull(tooltip.ssIncome)})
          </div>
        </div>
      )}
      </div>

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
            <div style={{ fontSize: 10, color: '#64748b', marginBottom: 2 }}>Sarah's income after Chad ({chadPassesAge})</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#f59e0b', fontFamily: "'JetBrains Mono', monospace" }}>
              {fmtFull(Math.round(optimalMonthly * survivorSpendRatio) + survivorSS + trustMonthly)}/mo
            </div>
            <div style={{ fontSize: 9, color: '#475569', marginTop: 1, fontFamily: "'JetBrains Mono', monospace" }}>
              {fmtFull(Math.round(optimalMonthly * survivorSpendRatio))} withdraw + {fmtFull(survivorSS)} SS + {fmtFull(trustMonthly)} trust
            </div>
          </div>
        </div>
      </div>

      {/* Sliders */}
      <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Slider label="Investment return" value={retirementReturn} onChange={setRetirementReturn}
          min={0} max={30} step={0.5} format={(v) => v + '%'} color="#60a5fa" />
        <Slider label="Withdrawal rate" value={withdrawalRate} onChange={setWithdrawalRate}
          min={4} max={25} step={0.5} format={(v) => v + '%'} color="#f59e0b" />
        <Slider label="Chad passes at" value={chadPassesAge} onChange={setChadPassesAge}
          min={67} max={95} step={1} format={(v) => v + ''} color="#f59e0b" />
        <Slider label="Pool floor (reserve)" value={poolFloor} onChange={setPoolFloor}
          min={0} max={Math.min(totalPool, 500000)} step={25000} color="#f59e0b" />
      </div>
    </div>
  );
}
