import React, { useState, useMemo, useEffect } from 'react';
import { fmtFull } from '../model/formatters.js';
import Slider from '../components/Slider.jsx';
import { getBlendedReturns, getNumCohorts, getCohortLabel } from '../model/historicalReturns.js';
import { computeSWR, computePreInhSWR, simulatePath } from '../model/ernWithdrawal.js';

export default function RetirementIncomeChart({
  savingsData, wealthData,
  ssType, ssPersonal, ssdiPersonal,
  chadJob,
  trustIncomeFuture,
  investmentReturn,
}) {
  const [equityAllocation, setEquityAllocation] = useState(60);
  const [withdrawalRate, setWithdrawalRate] = useState(4);
  const [poolFloor, setPoolFloor] = useState(0);
  const [chadPassesAge, setChadPassesAge] = useState(82);
  const [inheritanceAmount, setInheritanceAmount] = useState(1000000);
  const [inheritanceSarahAge, setInheritanceSarahAge] = useState(60);
  const [tooltip, setTooltip] = useState(null);

  // Chad is 60, Sarah is 46 (14 years younger)
  const ageDiff = 14;
  const sarahTargetAge = 90;
  const endAge = sarahTargetAge + ageDiff; // 104
  const years = endAge - 67; // 37
  const horizonMonths = years * 12; // 444
  const survivorSpendRatio = 0.6;

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

  // Inheritance
  const inheritanceChadAge = inheritanceSarahAge + ageDiff;
  const inheritanceYear = inheritanceChadAge - 67;
  const inheritanceMonth = inheritanceYear * 12;
  const hasInheritance = inheritanceAmount > 0;
  const inhDuringCouple = hasInheritance && inheritanceChadAge < chadPassesAge;

  // Helper: compute SS income + label for a given year
  function getSSInfo(chadAge, chadAlive) {
    const sarahAge = chadAge - ageDiff;
    if (chadAlive) {
      const sarahSpousal = sarahAge >= 62 ? Math.min(Math.round(ssFRA * 0.5), sarahOwnSS) : 0;
      const amount = chadSS + sarahSpousal;
      const label = sarahSpousal > 0 ? 'Chad + Sarah spousal' : 'Chad only';
      return { amount, label };
    } else {
      const amount = sarahAge >= 67 ? Math.max(survivorSS, sarahOwnSS) :
        sarahAge >= 60 ? Math.round(survivorSS * 0.715) : 0;
      const label = sarahAge >= 67 ? 'Sarah survivor' : sarahAge >= 60 ? 'Sarah survivor (reduced)' : 'none';
      return { amount, label };
    }
  }

  // Blended historical returns (memoized on equity allocation)
  const blendedReturns = useMemo(
    () => getBlendedReturns(equityAllocation / 100),
    [equityAllocation]
  );

  // Build flows and scaling arrays (shared by all cohorts)
  // flows: only inheritance (one-time lump sum)
  // scaling: 1.0 for couple months, survivorRatio for survivor months
  const { flows, scaling } = useMemo(() => {
    const flows = new Float64Array(horizonMonths);
    const scaling = new Float64Array(horizonMonths);
    const survivorStartMonth = (chadPassesAge - 67) * 12;

    for (let t = 0; t < horizonMonths; t++) {
      scaling[t] = t < survivorStartMonth ? 1.0 : survivorSpendRatio;
    }

    if (hasInheritance && inheritanceMonth >= 0 && inheritanceMonth < horizonMonths) {
      flows[inheritanceMonth] = inheritanceAmount;
    }

    return { flows, scaling };
  }, [horizonMonths, chadPassesAge, survivorSpendRatio, hasInheritance, inheritanceMonth, inheritanceAmount]);

  // Optimal rates (independent of withdrawal slider — computed via binary search)
  const optimalRates = useMemo(() => {
    const empty = {
      optimalRate: 0, optimalMonthly: 0, optimalPreRate: 0, optimalPreMonthly: 0,
      numCohorts: 0, worstCohort: { year: 0 }, cohortRange: '',
    };
    if (totalPool <= 0) return empty;

    const numCohorts = getNumCohorts(horizonMonths);
    if (numCohorts <= 0) return empty;

    // Binary search for optimal rate (90% survival, pool never depletes)
    const targetSurvival = 0.90;
    let lo = 0.1, hi = 25;
    for (let iter = 0; iter < 30; iter++) {
      const mid = (lo + hi) / 2;
      const testW = Math.round(totalPool * (mid / 100) / 12);
      let survived = 0;
      for (let c = 0; c < numCohorts; c++) {
        const sim = simulatePath(blendedReturns, c, horizonMonths, testW, flows, scaling, totalPool, poolFloor);
        if (sim.finalPool > poolFloor && !sim.everDepleted) survived++;
      }
      if (survived / numCohorts >= targetSurvival) lo = mid; else hi = mid;
    }
    const optimalRate = Math.round(lo * 10) / 10;
    const optimalW = Math.round(totalPool * (optimalRate / 100) / 12);
    const optimalMonthly = optimalW;

    // Pre-inheritance optimal rate (only constrains pre-inh period)
    let optimalPreRate = optimalRate, optimalPreMonthly = optimalMonthly;
    if (hasInheritance && inheritanceMonth > 0 && inheritanceMonth < horizonMonths) {
      const postW = optimalW;
      const inhYear = Math.floor(inheritanceMonth / 12);
      let loP = 0.1, hiP = 50;
      for (let iter = 0; iter < 30; iter++) {
        const mid = (loP + hiP) / 2;
        const preW = Math.round(totalPool * (mid / 100) / 12);
        const preScaling = new Float64Array(horizonMonths);
        const survivorStartMonth = (chadPassesAge - 67) * 12;
        for (let t = 0; t < horizonMonths; t++) {
          if (t < inheritanceMonth) {
            preScaling[t] = t < survivorStartMonth ? 1.0 : survivorSpendRatio;
          } else {
            preScaling[t] = t < survivorStartMonth ? (postW / (preW || 1)) : (postW / (preW || 1)) * survivorSpendRatio;
          }
        }
        let survived = 0;
        for (let c = 0; c < numCohorts; c++) {
          const sim = simulatePath(blendedReturns, c, horizonMonths, preW, flows, preScaling, totalPool, poolFloor);
          const preInhOk = sim.yearlyPools.slice(0, inhYear + 1).every(p => p > poolFloor);
          if (preInhOk && sim.finalPool > poolFloor) survived++;
        }
        if (survived / numCohorts >= targetSurvival) loP = mid; else hiP = mid;
      }
      optimalPreRate = Math.round(loP * 10) / 10;
      optimalPreMonthly = Math.round(totalPool * (optimalPreRate / 100) / 12);
    }

    // Worst historical cohort
    let worstIdx = 0;
    let worstFinal = Infinity;
    for (let c = 0; c < numCohorts; c++) {
      const sim = simulatePath(blendedReturns, c, horizonMonths, optimalW, flows, scaling, totalPool, poolFloor);
      if (sim.finalPool < worstFinal) { worstFinal = sim.finalPool; worstIdx = c; }
    }
    const worstLabel = getCohortLabel(worstIdx);

    const firstLabel = getCohortLabel(0);
    const lastLabel = getCohortLabel(numCohorts - 1);
    const cohortRange = `${firstLabel.year}\u2013${lastLabel.year}`;

    return {
      optimalRate, optimalMonthly, optimalPreRate, optimalPreMonthly,
      numCohorts, worstCohort: { year: worstLabel.year }, cohortRange,
    };
  }, [blendedReturns, totalPool, poolFloor, flows, scaling,
    horizonMonths, hasInheritance, inheritanceMonth, chadPassesAge, survivorSpendRatio]);

  // Sync withdrawal slider to optimal rate whenever it changes
  useEffect(() => {
    if (optimalRates.optimalRate > 0) {
      setWithdrawalRate(optimalRates.optimalRate);
    }
  }, [optimalRates.optimalRate]);

  // Bands and survival at the user's slider rate
  const bandResult = useMemo(() => {
    const emptyBands = [10, 25, 50, 75, 90].map(p => ({ pct: p, series: Array(years + 1).fill(0) }));
    if (totalPool <= 0) return { survivalRate: 0, bands: emptyBands };

    const numCohorts = getNumCohorts(horizonMonths);
    if (numCohorts <= 0) return { survivalRate: 0, bands: emptyBands };

    const allYearlyPools = new Array(numCohorts);
    let survivedCount = 0;

    for (let c = 0; c < numCohorts; c++) {
      const sim = simulatePath(blendedReturns, c, horizonMonths, monthlyWithdrawal, flows, scaling, totalPool, poolFloor);
      allYearlyPools[c] = sim.yearlyPools;
      if (sim.finalPool > poolFloor && !sim.everDepleted) survivedCount++;
    }

    const percentiles = [10, 25, 50, 75, 90];
    const temp = new Float64Array(numCohorts);
    const bandSeries = percentiles.map(() => []);

    for (let y = 0; y <= years; y++) {
      for (let c = 0; c < numCohorts; c++) temp[c] = allYearlyPools[c][y];
      temp.sort();
      for (let p = 0; p < percentiles.length; p++) {
        const idx = Math.floor(numCohorts * percentiles[p] / 100);
        bandSeries[p].push(temp[Math.min(idx, numCohorts - 1)]);
      }
    }
    const bands = percentiles.map((p, i) => ({ pct: p, series: bandSeries[i] }));

    return { survivalRate: survivedCount / numCohorts, bands };
  }, [blendedReturns, totalPool, monthlyWithdrawal, poolFloor, flows, scaling, horizonMonths, years]);

  // Deterministic trajectory using average historical return
  // Uses rate-based recalculation at inheritance and survivor transitions
  const { deterministicPools, deterministicSurvivorSpend, deterministicPostInhCouple, avgAnnualReal } = useMemo(() => {
    let sum = 0;
    for (let i = 0; i < blendedReturns.length; i++) sum += blendedReturns[i];
    const avgMonthly = sum / blendedReturns.length;
    const avgAnnualReal = Math.round((Math.pow(1 + avgMonthly, 12) - 1) * 1000) / 10;

    let pool = totalPool;
    const pools = [];
    const effectiveRate = withdrawalRate;
    const coupleSpend = monthlyWithdrawal;
    let survivorSpend = 0;
    let postInhCouple = 0;
    const endChadAge = chadPassesAge;

    for (let y = 0; y <= years; y++) {
      // Inheritance at start of year
      if (hasInheritance && y === inheritanceYear) {
        pool += inheritanceAmount;
        if (67 + y < endChadAge) {
          postInhCouple = Math.round(pool * (effectiveRate / 100) / 12);
        } else if (survivorSpend > 0) {
          survivorSpend = Math.round(pool * (effectiveRate / 100) / 12);
        }
      }
      pools.push(Math.round(pool));

      if (y >= years) break;

      const chadAge = 67 + y;

      // Survivor transition: recalculate from current pool
      if (chadAge === endChadAge && survivorSpend === 0) {
        survivorSpend = Math.round(pool * (effectiveRate / 100) / 12);
      }

      const isPreInh = hasInheritance && y < inheritanceYear;
      let spend;
      if (chadAge < endChadAge) {
        spend = (!isPreInh && postInhCouple > 0) ? postInhCouple : coupleSpend;
      } else {
        spend = survivorSpend;
      }

      for (let m = 0; m < 12; m++) {
        if (pool > poolFloor) {
          pool += pool * avgMonthly;
          pool -= spend;
          if (pool < poolFloor) pool = poolFloor;
        }
      }
    }

    return { deterministicPools: pools, deterministicSurvivorSpend: survivorSpend, deterministicPostInhCouple: postInhCouple, avgAnnualReal };
  }, [blendedReturns, totalPool, monthlyWithdrawal, withdrawalRate, poolFloor,
    chadPassesAge, years, hasInheritance, inheritanceYear, inheritanceAmount]);

  // Build yearlyData for tooltip and income display
  const yearlyData = deterministicPools.map((pool, y) => {
    const chadAge = 67 + y;
    const sarahAge = chadAge - ageDiff;
    const chadAlive = chadAge < chadPassesAge;
    const ssInfo = getSSInfo(chadAge, chadAlive);
    const isPostInh = hasInheritance && y >= inheritanceYear;
    let phaseSpend;
    if (chadAlive) {
      phaseSpend = (isPostInh && deterministicPostInhCouple > 0) ? deterministicPostInhCouple : monthlyWithdrawal;
    } else {
      phaseSpend = deterministicSurvivorSpend;
    }
    const effectiveWithdrawal = pool > poolFloor ? phaseSpend : 0;
    const isInheritanceYear = hasInheritance && y === inheritanceYear;
    const phase = !chadAlive ? 'survivor' : (isPostInh ? 'postInheritance' : 'chad');
    return {
      age: chadAge, sarahAge, pool,
      monthly: effectiveWithdrawal + ssInfo.amount + trustMonthly,
      ssIncome: ssInfo.amount, ssLabel: ssInfo.label,
      phase, isInheritanceYear,
    };
  });

  // Chart dimensions
  const svgW = 800, svgH = 340;
  const padL = 70, padR = 20, padT = 20, padB = 40;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;

  // Scale: use sqrt to compress large post-inheritance values while keeping
  // pre-inheritance pool visible. A linear scale makes $215K look like zero
  // when the chart goes to $4M+.
  const allBandValues = bandResult.bands.flatMap(b => b.series);
  const rawMax = Math.max(...allBandValues, totalPool, ...deterministicPools) * 1.05;
  const poolRange = rawMax || 1;
  const sqrtMax = Math.sqrt(poolRange);

  const xScale = (i) => padL + (i / years) * plotW;
  const yPool = (v) => padT + (1 - Math.sqrt(Math.max(0, v)) / sqrtMax) * plotH;

  const poolPts = deterministicPools.map((p, i) => `${xScale(i)},${yPool(p)}`);
  const poolLine = `M ${poolPts.join(' L ')}`;

  const survivorStartIdx = yearlyData.findIndex(d => d.phase === 'survivor');

  // Y-axis ticks — placed at nice round values that look good on sqrt scale
  const yTicks = [];
  const tickCandidates = [0, 50000, 100000, 250000, 500000, 1000000, 2000000, 3000000, 5000000, 10000000];
  for (const v of tickCandidates) {
    if (v <= poolRange) yTicks.push(v);
  }

  // Income phase calculations
  const phase1SS = chadSS;
  const phase1Total = monthlyWithdrawal + phase1SS + trustMonthly;
  const postInhSS = (() => {
    if (!inhDuringCouple) return 0;
    const sarahAtInh = inheritanceSarahAge;
    const spousal = sarahAtInh >= 62 ? Math.min(Math.round(ssFRA * 0.5), sarahOwnSS) : 0;
    return chadSS + spousal;
  })();
  const postInhTotal = inhDuringCouple ? (deterministicPostInhCouple + postInhSS + trustMonthly) : 0;
  const phase2SS = survivorSS;
  const phase2Spend = deterministicSurvivorSpend;
  const phase2Total = phase2Spend + phase2SS + trustMonthly;

  // Band paths for chart
  const bandPairs = [
    { lo: bandResult.bands[0], hi: bandResult.bands[4], color: '#60a5fa', opacity: 0.08 },
    { lo: bandResult.bands[1], hi: bandResult.bands[3], color: '#60a5fa', opacity: 0.12 },
  ];

  const fmtPool = (v) => v >= 1000000 ? `$${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `$${(v / 1000).toFixed(0)}K` : `$${v}`;

  // Shorthand for cohort results
  const sr = bandResult.survivalRate;
  const optRate = optimalRates.optimalRate;
  const optMonthly = optimalRates.optimalMonthly;
  const optPreRate = optimalRates.optimalPreRate;
  const optPreMonthly = optimalRates.optimalPreMonthly;

  return (
    <div style={{
      background: '#1e293b', borderRadius: 12, padding: '20px 16px',
      border: '1px solid #334155', marginBottom: 24,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h3 style={{ fontSize: 14, color: '#e2e8f0', margin: 0, fontWeight: 600 }}>
          Retirement + Survivor Income (today's dollars)
        </h3>
        <span style={{ fontSize: 11, color: sr >= 0.9 ? '#4ade80' : sr >= 0.7 ? '#f59e0b' : '#f87171', fontWeight: 600 }}>
          {Math.round(sr * 100)}% historical success to Sarah {sarahTargetAge} ({optimalRates.numCohorts.toLocaleString()} cohorts, {optimalRates.cohortRange})
        </span>
      </div>

      {/* Subtitle */}
      <div style={{ fontSize: 10, color: '#64748b', marginBottom: 12, fontStyle: 'italic' }}>
        House sold at 67 · {withdrawalRate}% withdrawal · {equityAllocation}/{100 - equityAllocation} portfolio · {avgAnnualReal}% avg real return · Chad passes at {chadPassesAge}
        {optimalRates.worstCohort.year > 0 && ` · Worst start: ${optimalRates.worstCohort.year}`}
      </div>

      {/* Income phase summary */}
      <div style={{ display: 'grid', gridTemplateColumns: inhDuringCouple ? '1fr 1fr' : '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
        {/* Pool card */}
        <div style={{ background: '#0f172a', borderRadius: 8, padding: '10px 12px', border: '1px solid #1e293b' }}>
          <div style={{ fontSize: 9, color: '#64748b', marginBottom: 4 }}>Investment Pool (age 67)</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#e2e8f0', fontFamily: "'JetBrains Mono', monospace" }}>
            {fmtFull(totalPool)}
          </div>
          <div style={{ fontSize: 8, color: '#475569', marginTop: 2, fontFamily: "'JetBrains Mono', monospace" }}>
            Savings {fmtFull(endSavings)} + 401k {fmtFull(end401k)} + Home {fmtFull(homeSaleNet)}
          </div>
        </div>

        {/* Pre-inheritance couple (or full couple if no inheritance during couple phase) */}
        <div style={{ background: '#0f172a', borderRadius: 8, padding: '10px 12px', border: '1px solid #60a5fa33' }}>
          <div style={{ fontSize: 9, color: '#60a5fa', marginBottom: 4 }}>
            {inhDuringCouple ? `Pre-Inheritance (67\u2013${inheritanceChadAge})` : `Retirement Income (67\u2013${chadPassesAge})`}
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#60a5fa', fontFamily: "'JetBrains Mono', monospace" }}>
            {fmtFull(phase1Total)}/mo
          </div>
          <div style={{ fontSize: 8, color: '#475569', marginTop: 2, fontFamily: "'JetBrains Mono', monospace" }}>
            {fmtFull(monthlyWithdrawal)} withdraw + {fmtFull(phase1SS)} SS + {fmtFull(trustMonthly)} trust
          </div>
        </div>

        {/* Post-inheritance couple (only when inheritance during couple phase) */}
        {inhDuringCouple && (
          <div style={{ background: '#0f172a', borderRadius: 8, padding: '10px 12px', border: '1px solid #4ade8033' }}>
            <div style={{ fontSize: 9, color: '#4ade80', marginBottom: 4 }}>Post-Inheritance ({inheritanceChadAge}\u2013{chadPassesAge})</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#4ade80', fontFamily: "'JetBrains Mono', monospace" }}>
              {fmtFull(postInhTotal)}/mo
            </div>
            <div style={{ fontSize: 8, color: '#475569', marginTop: 2, fontFamily: "'JetBrains Mono', monospace" }}>
              {fmtFull(deterministicPostInhCouple)} withdraw + {fmtFull(postInhSS)} SS + {fmtFull(trustMonthly)} trust
            </div>
          </div>
        )}

        {/* Survivor */}
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
            const dist = Math.abs(xScale(i) - mouseX);
            if (dist < closestDist) { closestDist = dist; closestIdx = i; }
          }
          const d = yearlyData[closestIdx];
          const pctX = (xScale(closestIdx) / svgW) * 100;
          const pctY = (yPool(d.pool) / svgH) * 100;
          const histBands = bandResult.bands.map(b => b.series[closestIdx]);
          setTooltip({ pctX, pctY, ...d, p10: histBands[0], p25: histBands[1], p50: histBands[2], p75: histBands[3], p90: histBands[4] });
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
          <rect x={xScale(survivorStartIdx)} y={padT} width={xScale(years) - xScale(survivorStartIdx)} height={plotH}
            fill="#f59e0b" opacity="0.04" />
        )}

        {/* Historical percentile bands */}
        {bandPairs.map((bp, bi) => {
          const topPts = bp.hi.series.map((v, i) => `${xScale(i)},${yPool(v)}`);
          const botPts = bp.lo.series.map((v, i) => `${xScale(i)},${yPool(v)}`).reverse();
          const bandPath = `M ${topPts.join(' L ')} L ${botPts.join(' L ')} Z`;
          return <path key={bi} d={bandPath} fill={bp.color} opacity={bp.opacity} />;
        })}

        {/* Historical median line (50th percentile) */}
        {(() => {
          const medianPts = bandResult.bands[2].series.map((v, i) => `${xScale(i)},${yPool(v)}`);
          return <path d={`M ${medianPts.join(' L ')}`} fill="none" stroke="#60a5fa" strokeWidth="1.5"
            strokeDasharray="4,3" opacity="0.5" />;
        })()}

        {/* Deterministic line (expected return) */}
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
            <line x1={xScale(survivorStartIdx)} x2={xScale(survivorStartIdx)}
              y1={padT} y2={padT + plotH}
              stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="4,3" />
            <text x={xScale(survivorStartIdx)} y={padT - 4} textAnchor="middle"
              fill="#f59e0b" fontSize="9" fontWeight="700" fontFamily="'JetBrains Mono', monospace">
              Chad {chadPassesAge} / Sarah {chadPassesAge - ageDiff}
            </text>
          </g>
        )}

        {/* Inheritance marker */}
        {hasInheritance && inheritanceYear >= 0 && inheritanceYear <= years && (
          <g>
            <line x1={xScale(inheritanceYear)} x2={xScale(inheritanceYear)}
              y1={padT} y2={padT + plotH}
              stroke="#4ade80" strokeWidth="1.5" strokeDasharray="4,3" />
            <text x={xScale(inheritanceYear)} y={padT + plotH + 12} textAnchor="middle"
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
          <circle cx={xScale(tooltip.age - 67)} cy={yPool(tooltip.pool)} r="5"
            fill="#60a5fa" stroke="#f8fafc" strokeWidth="2" />
        )}

        {/* X-axis labels */}
        {yearlyData.filter((_, i) => i % 5 === 0).map((d, i) => (
          <g key={i}>
            <text x={xScale(d.age - 67)} y={svgH - 20} textAnchor="middle"
              fill="#94a3b8" fontSize="11" fontFamily="'JetBrains Mono', monospace">
              C:{d.age}
            </text>
            <text x={xScale(d.age - 67)} y={svgH - 8} textAnchor="middle"
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
            Chad {tooltip.age} / Sarah {tooltip.sarahAge} {tooltip.phase === 'survivor' ? '(survivor)' : tooltip.phase === 'postInheritance' ? '(post-inheritance)' : ''}
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#60a5fa', fontFamily: "'JetBrains Mono', monospace" }}>
            Pool: {fmtFull(tooltip.pool)}
          </div>
          <div style={{ fontSize: 10, color: '#475569', marginTop: 2, fontFamily: "'JetBrains Mono', monospace" }}>
            Historical: {fmtPool(tooltip.p10)} \u2013 {fmtPool(tooltip.p50)} \u2013 {fmtPool(tooltip.p90)}
          </div>
          <div style={{ fontSize: 10, color: '#475569', fontFamily: "'JetBrains Mono', monospace" }}>
            (10th / median / 90th percentile)
          </div>
          <div style={{ borderTop: '1px solid #334155', marginTop: 4, paddingTop: 4 }}>
            <div style={{ fontSize: 11, color: '#e2e8f0', fontWeight: 600 }}>
              Income: {fmtFull(tooltip.monthly)}/mo
            </div>
            <div style={{ fontSize: 10, color: '#475569', fontFamily: "'JetBrains Mono', monospace" }}>
              {fmtFull(tooltip.monthly - tooltip.ssIncome - trustMonthly)} withdraw + {fmtFull(tooltip.ssIncome)} SS ({tooltip.ssLabel}) + {fmtFull(trustMonthly)} trust
            </div>
          </div>
        </div>
      )}
      </div>

      {/* Legend */}
      <div style={{ marginTop: 8, display: 'flex', gap: 14, fontSize: 11, flexWrap: 'wrap' }}>
        {[
          { label: 'Expected return', color: '#60a5fa', solid: true },
          { label: 'Historical median', color: '#60a5fa', dashed: true },
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

      {/* Optimal withdrawal (ERN historical: 90% success) */}
      <div style={{
        marginTop: 12, padding: '10px 14px', background: '#0f172a', borderRadius: 8,
        border: '1px solid #334155',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 10, color: '#64748b', marginBottom: 2 }}>
              Max withdrawal at 90% historical success{poolFloor > 0 ? ` (keeping ${fmtFull(poolFloor)})` : ''}
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#4ade80', fontFamily: "'JetBrains Mono', monospace" }}>
              {optRate}% = {fmtFull(optMonthly)}/mo
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, color: '#64748b', marginBottom: 2 }}>Sarah's income after Chad ({chadPassesAge})</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#f59e0b', fontFamily: "'JetBrains Mono', monospace" }}>
              {fmtFull(deterministicSurvivorSpend + survivorSS + trustMonthly)}/mo
            </div>
            <div style={{ fontSize: 9, color: '#475569', marginTop: 1, fontFamily: "'JetBrains Mono', monospace" }}>
              {fmtFull(deterministicSurvivorSpend)} withdraw + {fmtFull(survivorSS)} SS + {fmtFull(trustMonthly)} trust
            </div>
          </div>
        </div>
        {/* Rate vs history comparison */}
        <div style={{ fontSize: 10, color: '#64748b', marginTop: 6, fontStyle: 'italic' }}>
          Your {withdrawalRate}% rate: {withdrawalRate <= optRate
            ? `succeeded in ${Math.round(sr * 100)}% of all historical periods`
            : `exceeds safe rate \u2014 only ${Math.round(sr * 100)}% historical success`}
        </div>
      </div>

      {/* Sliders */}
      <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Slider label="Equity allocation" value={equityAllocation} onChange={setEquityAllocation}
          min={0} max={100} step={5} format={(v) => `${v}/${100 - v}`} color="#60a5fa" />

        {/* Withdrawal rate with optimal marker */}
        <div style={{ padding: "4px 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 13, color: "#8b8fa3" }}>Withdrawal rate</span>
            <span style={{ fontSize: 13, color: withdrawalRate > optRate ? '#f87171' : '#f59e0b', fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>
              {withdrawalRate}%
              {withdrawalRate > optRate && <span style={{ fontSize: 10, color: '#f87171' }}> (over 90% limit)</span>}
            </span>
          </div>
          <div style={{ position: 'relative' }}>
            <input type="range" min={0} max={30} step={0.1} value={withdrawalRate}
              onChange={(e) => setWithdrawalRate(Number(e.target.value))}
              style={{ width: "100%", accentColor: withdrawalRate > optRate ? '#f87171' : '#f59e0b', height: 6 }} />
            {(() => {
              const pct = Math.min(optRate, 30) / 30;
              const thumbHalf = 8;
              return (
                <div style={{
                  position: 'absolute',
                  left: `calc(${pct * 100}% + ${(0.5 - pct) * thumbHalf * 2}px)`,
                  top: -6,
                  transform: 'translateX(-50%)',
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  pointerEvents: 'none',
                }}>
                  <div style={{ fontSize: 8, color: '#4ade80', fontWeight: 700, whiteSpace: 'nowrap' }}>
                    {optRate}% @90%
                  </div>
                  <div style={{ width: 2, height: 8, background: '#4ade80', borderRadius: 1 }} />
                </div>
              );
            })()}
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
                Max pre-inheritance rate (90% success)
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#4ade80', fontFamily: "'JetBrains Mono', monospace" }}>
                {optPreRate}% = {fmtFull(optPreMonthly)}/mo
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 10, color: '#64748b', marginBottom: 2 }}>
                vs uniform rate
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: optPreRate > optRate ? '#4ade80' : '#94a3b8', fontFamily: "'JetBrains Mono', monospace" }}>
                {optPreRate >= optRate ? '+' : ''}{(optPreRate - optRate).toFixed(1)}% ({fmtFull(Math.abs(optPreMonthly - optMonthly))}/mo {optPreRate >= optRate ? 'more' : 'less'})
              </div>
            </div>
          </div>
          <div style={{ fontSize: 10, color: '#64748b', marginTop: 4, fontStyle: 'italic' }}>
            Withdraw {fmtFull(optPreMonthly)}/mo before inheritance, then {optRate}% (sustainable) after. Compared to {fmtFull(optMonthly)}/mo uniform.
          </div>
        </div>
      )}

      {/* Over-withdrawal warning */}
      {withdrawalRate > optRate && !hasInheritance && (
        <div style={{
          marginTop: 8, padding: '8px 12px', background: '#1e293b', borderRadius: 6,
          border: '1px solid #f8717133', fontSize: 11, color: '#f87171', lineHeight: 1.5,
        }}>
          At {withdrawalRate}% withdrawal, fewer than 90% of historical cohorts sustain the pool to Sarah age {sarahTargetAge}.
          The max rate with 90% confidence is <span style={{ fontWeight: 700, color: '#4ade80' }}>{optRate}%</span> ({fmtFull(optMonthly)}/mo).
        </div>
      )}
    </div>
  );
}
