import React, { useState, useMemo } from 'react';
import { fmtFull } from '../model/formatters.js';
import Slider from '../components/Slider.jsx';

export default function RetirementIncomeChart({
  savingsData, wealthData,
  ssType, ssPersonal, ssdiPersonal,
  chadJob,
  trustIncomeFuture,
  investmentReturn,
}) {
  // Retirement portfolios are more conservative than growth phase
  const [retirementReturn, setRetirementReturn] = useState(7);
  const [retirementVol, setRetirementVol] = useState(10); // 60/40 portfolio ~10%, pure stocks ~15%
  const [withdrawalRate, setWithdrawalRate] = useState(4);
  const [poolFloor, setPoolFloor] = useState(0);
  const [chadPassesAge, setChadPassesAge] = useState(82);
  const [inheritanceAmount, setInheritanceAmount] = useState(0);
  const [inheritanceSarahAge, setInheritanceSarahAge] = useState(65);
  const [tooltip, setTooltip] = useState(null);

  // Chad is 60, Sarah is 46 (14 years younger)
  const ageDiff = 14;

  // Assets at month 72 (approximately age 67)
  const endIdx = Math.min(72, savingsData.length - 1);
  const endSavings = savingsData[endIdx]?.balance || 0;
  const end401k = wealthData[endIdx]?.balance401k || 0;
  const endHome = wealthData[endIdx]?.homeEquity || 0;
  const homeSaleNet = Math.round(endHome * 0.94);
  const totalPool = Math.max(0, endSavings + end401k + homeSaleNet);

  const monthlyWithdrawal = Math.round(totalPool * (withdrawalRate / 100) / 12);

  // Chad's SS
  const ssFRA = 4213;
  const chadSS = (ssType === 'ss' && !chadJob) ? (ssPersonal || 2933) : ssFRA;

  const sarahOwnSS = 1900;
  const survivorSS = 4186;
  const trustMonthly = trustIncomeFuture || 0;
  const totalMonthly = monthlyWithdrawal + chadSS + trustMonthly;

  const sarahTargetAge = 90;
  const endChadAge = chadPassesAge;
  const endAge = sarahTargetAge + ageDiff;
  const years = endAge - 67;

  const survivorSpendRatio = 0.6;
  const coupleMonthlySpend = monthlyWithdrawal;
  const survivorMonthlySpend = Math.round(monthlyWithdrawal * survivorSpendRatio);

  // Helper: compute SS income for a given year
  function getSSIncome(chadAge, chadAlive) {
    const sarahAge = chadAge - ageDiff;
    if (chadAlive) {
      const sarahSpousal = sarahAge >= 62 ? Math.min(Math.round(ssFRA * 0.5), sarahOwnSS) : 0;
      return chadSS + sarahSpousal;
    } else {
      return sarahAge >= 67 ? Math.max(survivorSS, sarahOwnSS) :
        sarahAge >= 60 ? Math.round(survivorSS * 0.715) : 0;
    }
  }

  // All calculations use REAL returns (nominal minus 3% inflation).
  // Pool values shown in today's dollars (purchasing power).
  // Withdrawals are fixed (no inflation adjustment needed in real terms).
  const annualInflation = 3;
  const realReturn = retirementReturn - annualInflation;

  // Inheritance: arrives at a specific year on Chad's age scale
  const inheritanceChadAge = inheritanceSarahAge + ageDiff;
  const inheritanceYear = inheritanceChadAge - 67; // year index in simulation
  const hasInheritance = inheritanceAmount > 0;

  // Helper: run one retirement simulation with a given return sequence (real returns)
  // Supports two-phase withdrawal (preRate/postRate for pre/post inheritance)
  // and inheritance injection at the specified year
  function runRetirementSim(monthlyReturns, coupleSpend, survivorSpend, floor, opts = {}) {
    const { preInhCouple, preInhSurvivor } = opts;
    let pool = totalPool;
    const yearPools = [];
    let monthIdx = 0;
    for (let y = 0; y <= years; y++) {
      // Inject inheritance at the right year
      if (hasInheritance && y === inheritanceYear) {
        pool += inheritanceAmount;
      }
      yearPools.push(Math.round(pool));
      const chadAge = 67 + y;
      // Pre-inheritance can use a different (higher) withdrawal rate
      const isPreInheritance = hasInheritance && y < inheritanceYear;
      let spend;
      if (chadAge < endChadAge) {
        spend = (isPreInheritance && preInhCouple != null) ? preInhCouple : coupleSpend;
      } else {
        spend = (isPreInheritance && preInhSurvivor != null) ? preInhSurvivor : survivorSpend;
      }
      for (let m = 0; m < 12; m++) {
        if (pool > floor) {
          pool += pool * monthlyReturns[monthIdx % monthlyReturns.length];
          pool -= spend;
          if (pool < floor) pool = floor;
        }
        monthIdx++;
      }
    }
    return yearPools;
  }

  // Deterministic baseline using real return rate
  const monthlyReturnRate = Math.pow(1 + realReturn / 100, 1/12) - 1;
  const deterministicReturns = Array(years * 12 + 12).fill(monthlyReturnRate);
  const deterministicPools = runRetirementSim(deterministicReturns, coupleMonthlySpend, survivorMonthlySpend, poolFloor);

  // Build deterministic yearlyData (for tooltip + income display)
  const yearlyData = deterministicPools.map((pool, y) => {
    const chadAge = 67 + y;
    const sarahAge = chadAge - ageDiff;
    const chadAlive = chadAge < endChadAge;
    const ssIncome = getSSIncome(chadAge, chadAlive);
    const phaseSpend = chadAlive ? coupleMonthlySpend : survivorMonthlySpend;
    const effectiveWithdrawal = pool > poolFloor ? phaseSpend : 0;
    const isInheritanceYear = hasInheritance && y === inheritanceYear;
    return {
      age: chadAge, sarahAge, pool,
      monthly: effectiveWithdrawal + ssIncome + trustMonthly,
      ssIncome, phase: chadAlive ? 'chad' : 'survivor',
      isInheritanceYear,
    };
  });

  // Monte Carlo simulation — 500 runs with randomized annual returns
  const mcResult = useMemo(() => {
    const N = 500;
    const totalMonths = years * 12 + 12;
    const annualVol = retirementVol; // S&P historical volatility ~15%
    const monthlyVol = annualVol / Math.sqrt(12) / 100;
    const monthlyMean = monthlyReturnRate;

    // Box-Muller normal random
    const randNorm = (mean, std) => {
      const u1 = Math.random() || 0.001;
      const u2 = Math.random();
      return mean + std * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    };

    const allPools = []; // [sim][year] = pool value
    let survivedCount = 0;

    for (let sim = 0; sim < N; sim++) {
      // Generate randomized monthly returns for this sim
      const monthlyReturns = [];
      for (let m = 0; m < totalMonths; m++) {
        monthlyReturns.push(randNorm(monthlyMean, monthlyVol));
      }
      const yearPools = runRetirementSim(monthlyReturns, coupleMonthlySpend, survivorMonthlySpend, poolFloor);
      allPools.push(yearPools);
      const endOk = yearPools[yearPools.length - 1] > poolFloor;
      const neverDepleted = !hasInheritance || yearPools.slice(0, inheritanceYear).every(p => p > poolFloor);
      if (endOk && neverDepleted) survivedCount++;
    }

    // Compute percentile bands at each year
    const percentiles = [10, 25, 50, 75, 90];
    const bands = percentiles.map(p => {
      const series = [];
      for (let y = 0; y <= years; y++) {
        const vals = allPools.map(sim => sim[y]).sort((a, b) => a - b);
        const idx = Math.floor(vals.length * p / 100);
        series.push(vals[Math.min(idx, vals.length - 1)]);
      }
      return { pct: p, series };
    });

    return { bands, survivalRate: survivedCount / N, numSims: N };
  }, [totalPool, retirementReturn, retirementVol, withdrawalRate, chadPassesAge, poolFloor, years, monthlyReturnRate, coupleMonthlySpend, survivorMonthlySpend, inheritanceAmount, inheritanceYear]);

  // Optimal withdrawal at 90% survival (MC-based)
  // When inheritance is set: finds the max PRE-inheritance rate while keeping
  // post-inheritance at the user's withdrawalRate. This lets you spend more
  // aggressively before the windfall arrives.
  const { optimalRate, optimalPreRate } = useMemo(() => {
    if (totalPool <= poolFloor) return { optimalRate: 0, optimalPreRate: 0 };
    const N = 200;
    const totalMonths = years * 12 + 12;
    const annualVol = retirementVol;
    const monthlyVol = annualVol / Math.sqrt(12) / 100;
    const monthlyMean = monthlyReturnRate;
    const targetSurvival = 0.90;

    const randNorm = (mean, std, rng) => {
      const u1 = rng() || 0.001;
      const u2 = rng();
      return mean + std * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    };
    const mulberry32 = (s) => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const rng = mulberry32(42);
    const allReturns = [];
    for (let sim = 0; sim < N; sim++) {
      const seq = [];
      for (let m = 0; m < totalMonths; m++) seq.push(randNorm(monthlyMean, monthlyVol, rng));
      allReturns.push(seq);
    }

    // Standard optimal rate (uniform withdrawal)
    let lo = 0.1, hi = 25;
    for (let iter = 0; iter < 40; iter++) {
      const mid = (lo + hi) / 2;
      const testCouple = Math.round(totalPool * (mid / 100) / 12);
      const testSurvivor = Math.round(testCouple * survivorSpendRatio);
      let survived = 0;
      for (let sim = 0; sim < N; sim++) {
        const yearPools = runRetirementSim(allReturns[sim], testCouple, testSurvivor, poolFloor);
        if (yearPools[yearPools.length - 1] > poolFloor) survived++;
      }
      if (survived / N >= targetSurvival) lo = mid; else hi = mid;
    }
    const baseOptimal = Math.round(lo * 10) / 10;

    // If inheritance is set, find the max pre-inheritance rate
    // Post-inheritance uses the user's withdrawalRate
    let preOptimal = baseOptimal;
    if (hasInheritance) {
      const postCouple = coupleMonthlySpend;
      const postSurvivor = survivorMonthlySpend;
      let loP = 0.1, hiP = 25;
      for (let iter = 0; iter < 40; iter++) {
        const mid = (loP + hiP) / 2;
        const preCouple = Math.round(totalPool * (mid / 100) / 12);
        const preSurvivor = Math.round(preCouple * survivorSpendRatio);
        let survived = 0;
        for (let sim = 0; sim < N; sim++) {
          const yearPools = runRetirementSim(allReturns[sim], postCouple, postSurvivor, poolFloor,
            { preInhCouple: preCouple, preInhSurvivor: preSurvivor });
          // Must survive to end AND pool must never hit floor before inheritance arrives
          const endOk = yearPools[yearPools.length - 1] > poolFloor;
          const preOk = yearPools.slice(0, inheritanceYear).every(p => p > poolFloor);
          if (endOk && preOk) survived++;
        }
        if (survived / N >= targetSurvival) loP = mid; else hiP = mid;
      }
      preOptimal = Math.round(loP * 10) / 10;
    }

    return { optimalRate: baseOptimal, optimalPreRate: preOptimal };
  }, [totalPool, retirementReturn, retirementVol, poolFloor, years, monthlyReturnRate, survivorSpendRatio, hasInheritance, inheritanceYear, inheritanceAmount, coupleMonthlySpend, survivorMonthlySpend, withdrawalRate]);

  const optimalMonthly = Math.round(totalPool * (optimalRate / 100) / 12);
  const optimalPreMonthly = Math.round(totalPool * (optimalPreRate / 100) / 12);

  // Chart
  const svgW = 800, svgH = 340;
  const padL = 70, padR = 20, padT = 20, padB = 40;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;

  // Scale to fit MC bands
  const allBandValues = mcResult.bands.flatMap(b => b.series);
  const maxPool = Math.max(...allBandValues, totalPool, ...deterministicPools) * 1.05;
  const poolRange = maxPool || 1;

  const x = (i) => padL + (i / years) * plotW;
  const yPool = (v) => padT + (1 - Math.max(0, v) / poolRange) * plotH;

  const poolPts = deterministicPools.map((p, i) => `${x(i)},${yPool(p)}`);
  const poolLine = `M ${poolPts.join(' L ')}`;

  const survivorStartIdx = yearlyData.findIndex(d => d.phase === 'survivor');

  const targetTicks = 5;
  const rawStep = poolRange / targetTicks;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const poolTickStep = Math.ceil(rawStep / magnitude) * magnitude;
  const yTicks = [];
  for (let v = 0; v <= maxPool; v += poolTickStep) yTicks.push(v);

  const depleteAge = yearlyData.find(d => d.pool <= poolFloor);
  const poolSurvives = !depleteAge;

  const phase1SS = chadSS;
  const phase1Total = coupleMonthlySpend + phase1SS + trustMonthly;
  const phase2SS = survivorSS;
  const phase2Spend = survivorMonthlySpend;
  const phase2Total = phase2Spend + phase2SS + trustMonthly;

  // MC band paths (filled regions between percentiles)
  const bandPairs = [
    { lo: mcResult.bands[0], hi: mcResult.bands[4], color: '#60a5fa', opacity: 0.08, label: '10-90th' },
    { lo: mcResult.bands[1], hi: mcResult.bands[3], color: '#60a5fa', opacity: 0.12, label: '25-75th' },
  ];

  const fmtPool = (v) => v >= 1000000 ? `$${(v/1000000).toFixed(1)}M` : v >= 1000 ? `$${(v/1000).toFixed(0)}K` : `$${v}`;

  return (
    <div style={{
      background: '#1e293b', borderRadius: 12, padding: '20px 16px',
      border: '1px solid #334155', marginBottom: 24,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h3 style={{ fontSize: 14, color: '#e2e8f0', margin: 0, fontWeight: 600 }}>
          Retirement + Survivor Income (today's dollars)
        </h3>
        <span style={{ fontSize: 11, color: mcResult.survivalRate >= 0.9 ? '#4ade80' : mcResult.survivalRate >= 0.7 ? '#f59e0b' : '#f87171', fontWeight: 600 }}>
          {Math.round(mcResult.survivalRate * 100)}% survival to Sarah {sarahTargetAge} ({mcResult.numSims} sims)
        </span>
      </div>
      <div style={{ fontSize: 10, color: '#64748b', marginBottom: 12, fontStyle: 'italic' }}>
        House sold at 67 · {withdrawalRate}% withdrawal · {retirementReturn}% return ({realReturn}% real after 3% inflation) · {retirementVol}% vol · Chad passes at {chadPassesAge}
      </div>

      {/* Pool + Two-phase income summary */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
        <div style={{ background: '#0f172a', borderRadius: 8, padding: '10px 12px', border: '1px solid #1e293b' }}>
          <div style={{ fontSize: 9, color: '#64748b', marginBottom: 4 }}>Investment Pool (age 67)</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#e2e8f0', fontFamily: "'JetBrains Mono', monospace" }}>
            {fmtFull(totalPool)}
          </div>
          <div style={{ fontSize: 8, color: '#475569', marginTop: 2, fontFamily: "'JetBrains Mono', monospace" }}>
            Savings {fmtFull(endSavings)} + 401k {fmtFull(end401k)} + Home {fmtFull(homeSaleNet)}
          </div>
        </div>
        <div style={{ background: '#0f172a', borderRadius: 8, padding: '10px 12px', border: '1px solid #60a5fa33' }}>
          <div style={{ fontSize: 9, color: '#60a5fa', marginBottom: 4 }}>Retirement Income (67–{chadPassesAge})</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#60a5fa', fontFamily: "'JetBrains Mono', monospace" }}>
            {fmtFull(phase1Total)}/mo
          </div>
          <div style={{ fontSize: 8, color: '#475569', marginTop: 2, fontFamily: "'JetBrains Mono', monospace" }}>
            {fmtFull(coupleMonthlySpend)} withdraw + {fmtFull(phase1SS)} SS + {fmtFull(trustMonthly)} trust
          </div>
        </div>
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
          const mcBands = mcResult.bands.map(b => b.series[closestIdx]);
          setTooltip({ pctX, pctY, ...d, p10: mcBands[0], p25: mcBands[1], p50: mcBands[2], p75: mcBands[3], p90: mcBands[4] });
        }}>
        {/* Grid */}
        {yTicks.map((v, i) => (
          <g key={i}>
            <line x1={padL} x2={svgW - padR} y1={yPool(v)} y2={yPool(v)}
              stroke={v === 0 ? '#475569' : '#1e293b'} strokeWidth={v === 0 ? 1 : 0.5} />
            <text x={padL - 8} y={yPool(v) + 4} textAnchor="end"
              fill="#94a3b8" fontSize="12" fontFamily="'JetBrains Mono', monospace">
              {fmtPool(v)}
            </text>
          </g>
        ))}

        {/* Survivor phase background */}
        {survivorStartIdx >= 0 && (
          <rect x={x(survivorStartIdx)} y={padT} width={x(years) - x(survivorStartIdx)} height={plotH}
            fill="#f59e0b" opacity="0.04" />
        )}

        {/* MC percentile bands */}
        {bandPairs.map((bp, bi) => {
          const topPts = bp.hi.series.map((v, i) => `${x(i)},${yPool(v)}`);
          const botPts = bp.lo.series.map((v, i) => `${x(i)},${yPool(v)}`).reverse();
          const bandPath = `M ${topPts.join(' L ')} L ${botPts.join(' L ')} Z`;
          return <path key={bi} d={bandPath} fill={bp.color} opacity={bp.opacity} />;
        })}

        {/* MC median line */}
        {(() => {
          const medianPts = mcResult.bands[2].series.map((v, i) => `${x(i)},${yPool(v)}`);
          return <path d={`M ${medianPts.join(' L ')}`} fill="none" stroke="#60a5fa" strokeWidth="1.5"
            strokeDasharray="4,3" opacity="0.5" />;
        })()}

        {/* Deterministic line (mean return) */}
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

        {/* Inheritance marker */}
        {hasInheritance && inheritanceYear >= 0 && inheritanceYear <= years && (
          <g>
            <line x1={x(inheritanceYear)} x2={x(inheritanceYear)}
              y1={padT} y2={padT + plotH}
              stroke="#4ade80" strokeWidth="1.5" strokeDasharray="4,3" />
            <text x={x(inheritanceYear)} y={padT + plotH + 12} textAnchor="middle"
              fill="#4ade80" fontSize="9" fontWeight="700" fontFamily="'JetBrains Mono', monospace">
              +{fmtPool(inheritanceAmount)} inheritance
            </text>
          </g>
        )}

        {/* Start label */}
        <text x={padL + 4} y={yPool(totalPool) - 6}
          fill="#60a5fa" fontSize="11" fontWeight="600" fontFamily="'JetBrains Mono', monospace">
          {fmtPool(totalPool)}
        </text>

        {/* Hover dot */}
        {tooltip && (
          <circle cx={x(tooltip.age - 67)} cy={yPool(tooltip.pool)} r="5"
            fill="#60a5fa" stroke="#f8fafc" strokeWidth="2" />
        )}

        {/* X-axis labels */}
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
          top: `${Math.min(tooltip.pctY, 55)}%`,
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
          <div style={{ fontSize: 13, fontWeight: 700, color: '#60a5fa', fontFamily: "'JetBrains Mono', monospace" }}>
            Pool: {fmtFull(tooltip.pool)} (mean)
          </div>
          <div style={{ fontSize: 10, color: '#475569', marginTop: 2, fontFamily: "'JetBrains Mono', monospace" }}>
            MC range: {fmtPool(tooltip.p10)} – {fmtPool(tooltip.p90)}
          </div>
          <div style={{ fontSize: 10, color: '#475569', fontFamily: "'JetBrains Mono', monospace" }}>
            Median: {fmtPool(tooltip.p50)}
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
            Income: {fmtFull(tooltip.monthly)}/mo
          </div>
        </div>
      )}
      </div>

      {/* Legend */}
      <div style={{ marginTop: 8, display: 'flex', gap: 14, fontSize: 11, flexWrap: 'wrap' }}>
        {[
          { label: 'Mean return', color: '#60a5fa', solid: true },
          { label: 'MC median', color: '#60a5fa', dashed: true },
          { label: '25-75th pctl', color: '#60a5fa', band: true, opacity: 0.25 },
          { label: '10-90th pctl', color: '#60a5fa', band: true, opacity: 0.12 },
          { label: 'Survivor phase', color: '#f59e0b', solid: true },
        ].map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            {item.band ? (
              <div style={{ width: 12, height: 12, borderRadius: 2, background: item.color, opacity: item.opacity }} />
            ) : item.dashed ? (
              <div style={{ width: 16, height: 0, borderTop: `2px dashed ${item.color}`, opacity: 0.5 }} />
            ) : (
              <div style={{ width: 12, height: 3, background: item.color, borderRadius: 1 }} />
            )}
            <span style={{ color: '#94a3b8' }}>{item.label}</span>
          </div>
        ))}
      </div>

      {/* Optimal withdrawal (MC-based: 90% survival) */}
      <div style={{
        marginTop: 12, padding: '10px 14px', background: '#0f172a', borderRadius: 8,
        border: '1px solid #334155',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 10, color: '#64748b', marginBottom: 2 }}>
              Max withdrawal at 90% survival{poolFloor > 0 ? ` (keeping ${fmtFull(poolFloor)})` : ''}
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
        <Slider label="Mean return" value={retirementReturn} onChange={setRetirementReturn}
          min={0} max={15} step={0.5} format={(v) => v + '%'} color="#60a5fa" />
        <Slider label="Volatility (risk)" value={retirementVol} onChange={setRetirementVol}
          min={5} max={20} step={1} format={(v) => v + '%'} color="#94a3b8" />

        {/* Withdrawal rate with optimal marker */}
        <div style={{ padding: "4px 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 13, color: "#8b8fa3" }}>Withdrawal rate</span>
            <span style={{ fontSize: 13, color: withdrawalRate > optimalRate ? '#f87171' : '#f59e0b', fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>
              {withdrawalRate}%
              {withdrawalRate > optimalRate && <span style={{ fontSize: 10, color: '#f87171' }}> (over 90% limit)</span>}
            </span>
          </div>
          <div style={{ position: 'relative' }}>
            <input type="range" min={4} max={25} step={0.5} value={withdrawalRate}
              onChange={(e) => setWithdrawalRate(Number(e.target.value))}
              style={{ width: "100%", accentColor: withdrawalRate > optimalRate ? '#f87171' : '#f59e0b', height: 6 }} />
            <div style={{
              position: 'absolute',
              left: `${((optimalRate - 4) / (25 - 4)) * 100}%`,
              top: -6,
              transform: 'translateX(-50%)',
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              pointerEvents: 'none',
            }}>
              <div style={{ fontSize: 8, color: '#4ade80', fontWeight: 700, whiteSpace: 'nowrap' }}>
                {optimalRate}% @90%
              </div>
              <div style={{ width: 2, height: 8, background: '#4ade80', borderRadius: 1 }} />
            </div>
          </div>
        </div>

        <Slider label="Chad passes at" value={chadPassesAge} onChange={setChadPassesAge}
          min={67} max={95} step={1} format={(v) => v + ''} color="#f59e0b" />
        <Slider label="Pool floor (reserve)" value={poolFloor} onChange={setPoolFloor}
          min={0} max={Math.min(totalPool, 500000)} step={25000} color="#f59e0b" />
        <Slider label="Inheritance amount" value={inheritanceAmount} onChange={setInheritanceAmount}
          min={0} max={2000000} step={50000} color="#4ade80" />
        <Slider label="Sarah's age at inheritance" value={inheritanceSarahAge} onChange={setInheritanceSarahAge}
          min={55} max={80} step={1} format={(v) => v + ''} color="#4ade80" />
      </div>

      {/* Inheritance pre-withdrawal callout */}
      {hasInheritance && (
        <div style={{
          marginTop: 8, padding: '10px 14px', background: '#0f172a', borderRadius: 8,
          border: '1px solid #4ade8033',
        }}>
          <div style={{ fontSize: 10, color: '#4ade80', marginBottom: 4, fontWeight: 600 }}>
            PRE-INHERITANCE STRATEGY (before {fmtPool(inheritanceAmount)} at Sarah {inheritanceSarahAge})
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 10, color: '#64748b', marginBottom: 2 }}>
                Max pre-inheritance rate (90% survival)
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#4ade80', fontFamily: "'JetBrains Mono', monospace" }}>
                {optimalPreRate}% = {fmtFull(optimalPreMonthly)}/mo
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 10, color: '#64748b', marginBottom: 2 }}>
                vs uniform rate
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: optimalPreRate > optimalRate ? '#4ade80' : '#94a3b8', fontFamily: "'JetBrains Mono', monospace" }}>
                +{(optimalPreRate - optimalRate).toFixed(1)}% ({fmtFull(optimalPreMonthly - optimalMonthly)}/mo more)
              </div>
            </div>
          </div>
          <div style={{ fontSize: 10, color: '#64748b', marginTop: 4, fontStyle: 'italic' }}>
            You can withdraw {fmtFull(optimalPreMonthly)}/mo before the inheritance arrives (at {withdrawalRate}% after), vs {fmtFull(optimalMonthly)}/mo uniform. The inheritance refills the pool.
          </div>
        </div>
      )}

      {/* Over-withdrawal warning */}
      {withdrawalRate > optimalRate && !hasInheritance && (
        <div style={{
          marginTop: 8, padding: '8px 12px', background: '#1e293b', borderRadius: 6,
          border: '1px solid #f8717133', fontSize: 11, color: '#f87171', lineHeight: 1.5,
        }}>
          At {withdrawalRate}% withdrawal, fewer than 90% of Monte Carlo simulations sustain the pool to Sarah age {sarahTargetAge}.
          The max rate with 90% confidence is <span style={{ fontWeight: 700, color: '#4ade80' }}>{optimalRate}%</span> ({fmtFull(optimalMonthly)}/mo).
        </div>
      )}
    </div>
  );
}
