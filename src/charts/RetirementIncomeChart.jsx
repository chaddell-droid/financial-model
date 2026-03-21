import React, { useState, useMemo, useEffect } from 'react';
import { fmtFull } from '../model/formatters.js';
import Slider from '../components/Slider.jsx';
import { getBlendedReturns, getNumCohorts, getCohortLabel } from '../model/historicalReturns.js';
import { simulatePath, computeSWR, computePreInhSWR } from '../model/ernWithdrawal.js';

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

  // Supplemental flows for closed-form SWR: SS + trust + inheritance per month
  // This is SEPARATE from `flows` (used by simulatePath for chart bands)
  const supplementalFlows = useMemo(() => {
    const sf = new Float64Array(horizonMonths);
    const survivorStartMonth = (chadPassesAge - 67) * 12;

    for (let t = 0; t < horizonMonths; t++) {
      const chadAge = 67 + t / 12;
      const sarahAge = chadAge - ageDiff;
      const chadAlive = t < survivorStartMonth;

      // Trust income every month
      let monthFlow = trustMonthly;

      // SS income
      if (chadAlive) {
        monthFlow += chadSS;
        if (sarahAge >= 62) {
          monthFlow += Math.min(Math.round(ssFRA * 0.5), sarahOwnSS);
        }
      } else {
        if (sarahAge >= 67) {
          monthFlow += Math.max(survivorSS, sarahOwnSS);
        } else if (sarahAge >= 60) {
          monthFlow += Math.round(survivorSS * 0.715);
        }
      }

      sf[t] = monthFlow;
    }

    // Inheritance (one-time lump sum)
    if (hasInheritance && inheritanceMonth >= 0 && inheritanceMonth < horizonMonths) {
      sf[inheritanceMonth] += inheritanceAmount;
    }

    return sf;
  }, [horizonMonths, chadPassesAge, ageDiff, chadSS, ssFRA, sarahOwnSS, survivorSS, trustMonthly, hasInheritance, inheritanceMonth, inheritanceAmount]);

  // Closed-form SWR for each historical cohort (independent of withdrawal slider)
  const cohortSWRs = useMemo(() => {
    const numCohorts = getNumCohorts(horizonMonths);
    if (numCohorts <= 0 || totalPool <= 0) return new Float64Array(0);
    const swrs = new Float64Array(numCohorts);
    for (let c = 0; c < numCohorts; c++) {
      swrs[c] = computeSWR(blendedReturns, c, horizonMonths,
        supplementalFlows, scaling, poolFloor, totalPool);
    }
    return swrs;
  }, [blendedReturns, horizonMonths, supplementalFlows, scaling, poolFloor, totalPool]);

  // Optimal rates (independent of withdrawal slider — closed-form from cohortSWRs)
  const optimalRates = useMemo(() => {
    const empty = {
      optimalRate: 0, optimalMonthly: 0, optimalPreRate: 0, optimalPreMonthly: 0,
      numCohorts: 0, worstCohort: { year: 0 }, cohortRange: '',
      optimalConsumption: 0, initialIncome: 0, sliderMax: 30,
    };
    if (totalPool <= 0) return empty;

    const numCohorts = getNumCohorts(horizonMonths);
    if (numCohorts <= 0 || cohortSWRs.length === 0) return empty;

    // Three-tier rate computation (formula_theoretical ≥ ern_max ≥ safe_rate)
    const initialIncome = chadSS + trustMonthly;
    const targetSurvival = 0.90;

    // Helper: binary search for max pool draw rate at given survival constraint
    function findMaxRate(hi, checkFn) {
      let lo = 0.1;
      for (let iter = 0; iter < 30; iter++) {
        const mid = (lo + hi) / 2;
        const testPoolDraw = Math.round(totalPool * (mid / 100) / 12);
        const testConsumption = testPoolDraw + initialIncome;
        let survived = 0;
        for (let c = 0; c < numCohorts; c++) {
          const sim = simulatePath(blendedReturns, c, horizonMonths, testConsumption, supplementalFlows, scaling, totalPool, poolFloor, flows);
          if (checkFn(sim)) survived++;
        }
        if (survived / numCohorts >= targetSurvival) lo = mid; else hi = mid;
      }
      return Math.round(lo * 10) / 10;
    }

    // Tier 1: Formula theoretical rate (closed-form, no floor constraint — educational only)
    const sorted = Float64Array.from(cohortSWRs).sort();
    const p10idx = Math.floor(numCohorts * 0.10);
    const theoreticalConsumption = Math.max(0, sorted[p10idx]);
    // Tier 2: ERN max rate (simulation-based, endpoint check only — pool can dip to $0 mid-path)
    // Upper bound must be high: simulation ERN max can EXCEED formula theoretical because
    // stopped withdrawals during depletion preserve money the formula assumed would be spent.
    const optimalRate = findMaxRate(80, (sim) => sim.finalPool > poolFloor);
    const optimalMonthly = Math.round(totalPool * (optimalRate / 100) / 12);
    const optimalConsumption = optimalMonthly + initialIncome;

    // Tier 3: Safe rate (simulation-based, pool never depletes)
    const safeRate = findMaxRate(optimalRate + 1, (sim) => sim.finalPool > poolFloor && !sim.everDepleted);
    const safeMonthly = Math.round(totalPool * (safeRate / 100) / 12);

    // Pre-inheritance optimal rate (uses formula — informational)
    let optimalPreRate = optimalRate, optimalPreMonthly = optimalMonthly;
    if (hasInheritance && inheritanceMonth > 0 && inheritanceMonth < horizonMonths) {
      const preSwrs = new Float64Array(numCohorts);
      for (let c = 0; c < numCohorts; c++) {
        preSwrs[c] = computePreInhSWR(blendedReturns, c, horizonMonths,
          supplementalFlows, scaling, poolFloor, totalPool, optimalConsumption, inheritanceMonth);
      }
      const preSorted = Float64Array.from(preSwrs).sort();
      const preOptConsumption = Math.max(0, preSorted[p10idx]);
      const prePoolDraw = Math.max(0, preOptConsumption - initialIncome);
      optimalPreRate = totalPool > 0
        ? Math.round(prePoolDraw * 12 / totalPool * 1000) / 10 : 0;
      optimalPreMonthly = Math.round(prePoolDraw);
    }

    // Worst historical cohort (lowest formula SWR)
    let worstIdx = 0;
    let worstSWR = Infinity;
    for (let c = 0; c < numCohorts; c++) {
      if (cohortSWRs[c] < worstSWR) { worstSWR = cohortSWRs[c]; worstIdx = c; }
    }
    const worstLabel = getCohortLabel(worstIdx);

    const firstLabel = getCohortLabel(0);
    const lastLabel = getCohortLabel(numCohorts - 1);
    const cohortRange = `${firstLabel.year}\u2013${lastLabel.year}`;

    const sliderMax = Math.max(30, Math.ceil(optimalRate / 5) * 5 + 5);

    return {
      optimalRate, optimalMonthly, optimalPreRate, optimalPreMonthly,
      safeRate, safeMonthly,
      numCohorts, worstCohort: { year: worstLabel.year }, cohortRange,
      optimalConsumption, initialIncome, sliderMax,
    };
  }, [cohortSWRs, totalPool, horizonMonths, chadSS, trustMonthly,
    hasInheritance, inheritanceMonth, blendedReturns, supplementalFlows, scaling, poolFloor, flows]);

  // Sync withdrawal slider to SAFE rate (pool never depletes) — chart default
  useEffect(() => {
    if (optimalRates.safeRate > 0) {
      setWithdrawalRate(optimalRates.safeRate);
    }
  }, [optimalRates.safeRate]);

  // Bands and survival at the user's slider rate
  const bandResult = useMemo(() => {
    const emptyBands = [10, 25, 50, 75, 90].map(p => ({ pct: p, series: Array(years + 1).fill(0) }));
    if (totalPool <= 0) return { survivalRate: 0, bands: emptyBands };

    const numCohorts = getNumCohorts(horizonMonths);
    if (numCohorts <= 0) return { survivalRate: 0, bands: emptyBands };

    const allYearlyPools = new Array(numCohorts);
    let survivedCount = 0;

    // Use consumption + supplementalFlows for simulation (matching ERN formula)
    const userConsumption = monthlyWithdrawal + optimalRates.initialIncome;

    for (let c = 0; c < numCohorts; c++) {
      const sim = simulatePath(blendedReturns, c, horizonMonths, userConsumption, supplementalFlows, scaling, totalPool, poolFloor, flows);
      allYearlyPools[c] = sim.yearlyPools;
      if (cohortSWRs[c] >= userConsumption) survivedCount++;
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
  }, [blendedReturns, totalPool, monthlyWithdrawal, poolFloor, supplementalFlows, scaling, horizonMonths, years, cohortSWRs, optimalRates.initialIncome]);

  // Deterministic trajectory using average historical return
  // Uses consumption + supplementalFlows (matching ERN formula and simulatePath)
  const monthlyConsumption = monthlyWithdrawal + chadSS + trustMonthly;
  const { deterministicPools, avgAnnualReal } = useMemo(() => {
    let sum = 0;
    for (let i = 0; i < blendedReturns.length; i++) sum += blendedReturns[i];
    const avgMonthly = sum / blendedReturns.length;
    const avgAnnualReal = Math.round((Math.pow(1 + avgMonthly, 12) - 1) * 1000) / 10;

    // Use consumption + supplementalFlows (matching ERN formula)
    let pool = totalPool;
    const pools = [];

    for (let y = 0; y <= years; y++) {
      pools.push(Math.round(pool));
      if (y >= years) break;

      for (let m = 0; m < 12; m++) {
        const t = y * 12 + m;
        if (pool > poolFloor) {
          pool = pool * (1 + avgMonthly) - monthlyConsumption * scaling[t] + supplementalFlows[t];
          if (pool < poolFloor) pool = poolFloor;
        } else if (flows[t] > 0) {
          pool += flows[t]; // only inheritance rescues depleted pool
        }
      }
    }

    return { deterministicPools: pools, avgAnnualReal };
  }, [blendedReturns, totalPool, monthlyConsumption, poolFloor, scaling, supplementalFlows, flows, years]);

  // Constant-dollar withdrawal amounts for each phase
  const survivorWithdrawal = Math.round(monthlyWithdrawal * survivorSpendRatio);

  // Build yearlyData for tooltip and income display
  const yearlyData = deterministicPools.map((pool, y) => {
    const chadAge = 67 + y;
    const sarahAge = chadAge - ageDiff;
    const chadAlive = chadAge < chadPassesAge;
    const ssInfo = getSSInfo(chadAge, chadAlive);
    const isPostInh = hasInheritance && y >= inheritanceYear;
    const phaseSpend = chadAlive ? monthlyWithdrawal : survivorWithdrawal;
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

  // Income phase calculations (constant-dollar withdrawal model)
  // Couple: same withdrawal before and after inheritance
  // Survivor: withdrawal * survivorRatio
  const phase1SS = chadSS;
  const phase1Total = monthlyWithdrawal + phase1SS + trustMonthly;
  // Post-inheritance SS: compute at start and end of period (spousal may kick in mid-period)
  const postInhSSStart = (() => {
    if (!inhDuringCouple) return 0;
    return getSSInfo(inheritanceChadAge, true).amount;
  })();
  const postInhSSEnd = (() => {
    if (!inhDuringCouple) return 0;
    return getSSInfo(chadPassesAge - 1, true).amount;
  })();
  const postInhSSChanges = postInhSSStart !== postInhSSEnd;
  const spousalKicksInAge = 62 + ageDiff;
  const postInhTotalStart = inhDuringCouple ? (monthlyWithdrawal + postInhSSStart + trustMonthly) : 0;
  const postInhTotalEnd = inhDuringCouple ? (monthlyWithdrawal + postInhSSEnd + trustMonthly) : 0;
  const phase2SS = survivorSS;
  const phase2Spend = survivorWithdrawal;
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
          {Math.round(sr * 100)}% survival to Sarah {sarahTargetAge} ({optimalRates.numCohorts.toLocaleString()} cohorts, {optimalRates.cohortRange})
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
          {chadPassesAge > 70 && bandResult.bands[0].series.length > (chadPassesAge - 67) && (
            <div style={{ fontSize: 8, color: '#475569', marginTop: 2, fontFamily: "'JetBrains Mono', monospace" }}>
              At {chadPassesAge}: {fmtPool(bandResult.bands[0].series[chadPassesAge - 67])} (worst) \u2013 {fmtPool(deterministicPools[chadPassesAge - 67])} (expected)
            </div>
          )}
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
            {postInhSSChanges ? (
              <>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#4ade80', fontFamily: "'JetBrains Mono', monospace" }}>
                  {fmtFull(postInhTotalStart)}/mo {'\u2192'} {fmtFull(postInhTotalEnd)}/mo
                </div>
                <div style={{ fontSize: 8, color: '#475569', marginTop: 2, fontFamily: "'JetBrains Mono', monospace" }}>
                  +{fmtFull(postInhSSEnd - postInhSSStart)} spousal SS at Sarah 62 (Chad {spousalKicksInAge})
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#4ade80', fontFamily: "'JetBrains Mono', monospace" }}>
                  {fmtFull(postInhTotalEnd)}/mo
                </div>
                <div style={{ fontSize: 8, color: '#475569', marginTop: 2, fontFamily: "'JetBrains Mono', monospace" }}>
                  {fmtFull(monthlyWithdrawal)} withdraw + {fmtFull(postInhSSEnd)} SS + {fmtFull(trustMonthly)} trust
                </div>
              </>
            )}
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
          const histBands = bandResult.bands.map(b => b.series[closestIdx]);
          const pctY = (yPool(histBands[0]) / svgH) * 100;
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

        {/* Expected case line (average return — secondary, dashed) */}
        <path d={poolLine} fill="none" stroke="#60a5fa" strokeWidth="1.5"
          strokeDasharray="6,4" opacity="0.7" strokeLinejoin="round" strokeLinecap="round" />

        {/* SWR plan line (10th percentile — worst surviving case, primary) */}
        {(() => {
          const swrPts = bandResult.bands[0].series.map((v, i) => `${xScale(i)},${yPool(v)}`);
          return <path d={`M ${swrPts.join(' L ')}`} fill="none" stroke="#f97316" strokeWidth="2.5"
            strokeLinejoin="round" strokeLinecap="round" />;
        })()}

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

        {/* 10th percentile end label — shows where worst surviving cohort ends */}
        {(() => {
          const p10End = bandResult.bands[0].series[bandResult.bands[0].series.length - 1];
          const endX = xScale(years);
          const endY = yPool(p10End);
          return (
            <g>
              <circle cx={endX} cy={endY} r="3" fill="#f97316" opacity="0.8" />
              <text x={endX - 4} y={endY - 8} textAnchor="end"
                fill="#f97316" fontSize="9" fontWeight="600" opacity="0.9"
                fontFamily="'JetBrains Mono', monospace">
                SWR: {fmtPool(p10End)}
              </text>
            </g>
          );
        })()}

        {/* Hover dot */}
        {tooltip && (
          <circle cx={xScale(tooltip.age - 67)} cy={yPool(tooltip.p10)} r="5"
            fill="#f97316" stroke="#f8fafc" strokeWidth="2" />
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
          <div style={{ fontSize: 13, fontWeight: 700, color: '#f97316', fontFamily: "'JetBrains Mono', monospace" }}>
            Plan: {fmtFull(tooltip.p10)}
          </div>
          <div style={{ fontSize: 11, color: '#60a5fa', fontFamily: "'JetBrains Mono', monospace" }}>
            Likely: {fmtFull(tooltip.pool)}
          </div>
          <div style={{ borderTop: '1px solid #334155', marginTop: 4, paddingTop: 4 }}>
            {tooltip.p10 <= poolFloor ? (
              <>
                <div style={{ fontSize: 11, color: '#f97316', fontWeight: 600 }}>
                  Plan: pool depleted — {fmtFull(tooltip.ssIncome + trustMonthly)}/mo (SS + trust only)
                </div>
                <div style={{ fontSize: 11, color: '#60a5fa' }}>
                  Likely: {fmtFull(tooltip.monthly)}/mo
                </div>
              </>
            ) : (
              <div style={{ fontSize: 11, color: '#e2e8f0', fontWeight: 600 }}>
                Income: {fmtFull(tooltip.monthly)}/mo
              </div>
            )}
            <div style={{ fontSize: 10, color: '#475569', fontFamily: "'JetBrains Mono', monospace" }}>
              {fmtFull(tooltip.monthly - tooltip.ssIncome - trustMonthly)} withdraw + {fmtFull(tooltip.ssIncome)} SS + {fmtFull(trustMonthly)} trust
            </div>
          </div>
        </div>
      )}
      </div>

      {/* Legend */}
      <div style={{ marginTop: 8, display: 'flex', gap: 14, fontSize: 11, flexWrap: 'wrap' }}>
        {[
          { label: 'Your plan (90% safe)', color: '#f97316', solid: true },
          { label: "You'll probably see this", color: '#60a5fa', dashed: true },
          { label: '25-75th pctl', color: '#60a5fa', band: true, opacity: 0.12 },
          { label: '10-90th pctl', color: '#60a5fa', band: true, opacity: 0.08 },
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

      {/* Dual optimal rates: Safe (pool never depletes) + ERN max (pool ends at target) */}
      <div style={{
        marginTop: 12, padding: '10px 14px', background: '#0f172a', borderRadius: 8,
        border: '1px solid #334155',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 10, color: '#64748b', marginBottom: 2 }}>
              Safe withdrawal (pool never depletes, 90% survival)
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#4ade80', fontFamily: "'JetBrains Mono', monospace" }}>
              {optimalRates.safeRate}% = {fmtFull(optimalRates.safeMonthly)}/mo
            </div>
            <div style={{ fontSize: 8, color: '#475569', marginTop: 1, fontFamily: "'JetBrains Mono', monospace" }}>
              Total: {fmtFull(optimalRates.safeMonthly + chadSS + trustMonthly)}/mo with SS + trust
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, color: '#64748b', marginBottom: 2 }}>Sarah's income after Chad ({chadPassesAge})</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#f59e0b', fontFamily: "'JetBrains Mono', monospace" }}>
              {fmtFull(survivorWithdrawal + survivorSS + trustMonthly)}/mo
            </div>
            <div style={{ fontSize: 9, color: '#475569', marginTop: 1, fontFamily: "'JetBrains Mono', monospace" }}>
              {fmtFull(survivorWithdrawal)} withdraw + {fmtFull(survivorSS)} SS + {fmtFull(trustMonthly)} trust
            </div>
          </div>
        </div>
        {/* ERN max consumption */}
        <div style={{ borderTop: '1px solid #334155', marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 10, color: '#64748b', marginBottom: 2 }}>
              ERN max (pool ends at ${fmtPool(poolFloor)}, 90% survival)
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#60a5fa', fontFamily: "'JetBrains Mono', monospace" }}>
              {optRate}% = {fmtFull(optMonthly)}/mo from pool
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, color: '#64748b', marginBottom: 2 }}>Total consumption</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#60a5fa', fontFamily: "'JetBrains Mono', monospace" }}>
              {fmtFull(Math.round(optimalRates.optimalConsumption))}/mo
            </div>
          </div>
        </div>
        {/* Rate vs history comparison */}
        <div style={{ fontSize: 10, color: '#64748b', marginTop: 6, fontStyle: 'italic' }}>
          Your {withdrawalRate}% rate: survived in {Math.round(sr * 100)}% of all historical cohorts
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
            <span style={{ fontSize: 13, color: withdrawalRate > optimalRates.safeRate ? '#f87171' : '#f59e0b', fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>
              {withdrawalRate}%
              {withdrawalRate > optimalRates.safeRate && withdrawalRate <= optRate && <span style={{ fontSize: 10, color: '#f59e0b' }}> (pool may deplete temporarily)</span>}
              {withdrawalRate > optRate && <span style={{ fontSize: 10, color: '#f87171' }}> (exceeds ERN max)</span>}
            </span>
          </div>
          <div style={{ position: 'relative' }}>
            <input type="range" min={0} max={optimalRates.sliderMax} step={0.1} value={withdrawalRate}
              onChange={(e) => setWithdrawalRate(Number(e.target.value))}
              style={{ width: "100%", accentColor: withdrawalRate > optRate ? '#f87171' : withdrawalRate > optimalRates.safeRate ? '#f59e0b' : '#4ade80', height: 6 }} />
            {/* Rate markers below the slider — staggered vertically to avoid overlap */}
            {(() => {
              const thumbHalf = 8;
              const safePct = Math.min(optimalRates.safeRate, optimalRates.sliderMax) / optimalRates.sliderMax;
              const ernPct = Math.min(optRate, optimalRates.sliderMax) / optimalRates.sliderMax;
              return (
                <div style={{ position: 'relative', height: 30, marginTop: 2 }}>
                  {/* Safe rate marker (green) — top row */}
                  <div style={{
                    position: 'absolute',
                    left: `calc(${safePct * 100}% + ${(0.5 - safePct) * thumbHalf * 2}px)`,
                    top: 0,
                    transform: 'translateX(-50%)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    pointerEvents: 'none',
                  }}>
                    <div style={{ width: 2, height: 6, background: '#4ade80', borderRadius: 1 }} />
                    <div style={{ fontSize: 8, color: '#4ade80', fontWeight: 700, whiteSpace: 'nowrap' }}>
                      {optimalRates.safeRate}% safe
                    </div>
                  </div>
                  {/* ERN max marker (blue) — bottom row, staggered down */}
                  {optRate > 0 && (
                    <div style={{
                      position: 'absolute',
                      left: `calc(${ernPct * 100}% + ${(0.5 - ernPct) * thumbHalf * 2}px)`,
                      top: 14,
                      transform: 'translateX(-50%)',
                      display: 'flex', flexDirection: 'column', alignItems: 'center',
                      pointerEvents: 'none',
                    }}>
                      <div style={{ width: 2, height: 6, background: '#60a5fa', borderRadius: 1 }} />
                      <div style={{ fontSize: 8, color: '#60a5fa', fontWeight: 700, whiteSpace: 'nowrap' }}>
                        {optRate}% ERN
                      </div>
                    </div>
                  )}
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
      {hasInheritance && (optPreRate - optRate >= 0.5) && (
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
