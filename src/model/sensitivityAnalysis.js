import { computeProjection } from './projection.js';

const VARIABLES_TO_TEST = [
  { key: 'sarahRate', label: "Increase Sarah's hourly rate", unit: '$/hr', delta: 15 },
  { key: 'sarahClientGrowth', label: "Increase Sarah's client growth rate", unit: '%', delta: 3 },
  { key: 'sarahMaxClients', label: "Increase Sarah's max clients", unit: 'clients', delta: 1 },
  { key: 'msftGrowth', label: "Increase MSFT growth rate", unit: '%', delta: 5 },
  { key: 'investmentReturn', label: "Increase investment return", unit: '%', delta: 3 },
  { key: 'baseExpenses', label: "Reduce monthly expenses", unit: '$/mo', delta: -500 },
  { key: 'ssdiApprovalMonth', label: "Earlier SSDI approval", unit: 'months', delta: -3 },
  { key: 'bcsParentsAnnual', label: "Reduce BCS parent contribution", unit: '$/yr', delta: -5000 },
  { key: 'cutsOverride', label: "Increase lifestyle cuts", unit: '$/mo', delta: 200 },
  { key: 'chadJob', label: 'Get a W-2 job', unit: 'toggle', delta: 0, toggle: true,
    companions: { chadJobSalary: 120000, chadJobStartMonth: 0, chadJobHealthSavings: 4200 } },
];

export function computeTopMoves(baseState, topN = 3) {
  // 1. Run base projection
  const baseProj = computeProjection(baseState);
  const baseMonthly = baseProj.monthlyData;
  const baseFinalBalance = baseMonthly[baseMonthly.length - 1].balance;
  const baseZeroMonth = baseMonthly.find(d => d.balance <= 0)?.month ?? null;

  // 2. For each variable, run projection with +delta
  const results = [];
  for (const v of VARIABLES_TO_TEST) {
    const baseValue = baseState[v.key];
    if (baseValue === undefined && !v.toggle) continue;

    let testValue;
    const testState = { ...baseState };

    if (v.toggle) {
      if (baseValue) continue;
      testValue = true;
      testState[v.key] = true;
      if (v.companions) Object.assign(testState, v.companions);
    } else {
      testValue = baseValue + v.delta;
      testState[v.key] = testValue;
    }

    // cutsOverride changes require lifestyleCutsApplied to be on
    if (v.key === 'cutsOverride') {
      testState.lifestyleCutsApplied = true;
    }

    const testProj = computeProjection(testState);
    const testMonthly = testProj.monthlyData;
    const testFinalBalance = testMonthly[testMonthly.length - 1].balance;
    const testZeroMonth = testMonthly.find(d => d.balance <= 0)?.month ?? null;

    // Measure impact
    const finalBalanceDelta = testFinalBalance - baseFinalBalance;
    const runwayDelta = (testZeroMonth == null ? 999 : testZeroMonth) - (baseZeroMonth == null ? 999 : baseZeroMonth);

    // Composite score (final balance impact dominates, runway is tiebreaker)
    const score = Math.abs(finalBalanceDelta) + Math.abs(runwayDelta) * 1000;

    // Only include moves that IMPROVE the situation
    if (finalBalanceDelta <= 0 && runwayDelta <= 0) continue;

    results.push({
      ...v,
      baseValue,
      testValue,
      finalBalanceDelta,
      runwayDelta,
      score,
    });
  }

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}
