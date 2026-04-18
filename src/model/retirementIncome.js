function getSurvivorStartMonth(chadPassesAge) {
  return (chadPassesAge - 67) * 12;
}

function getPensionAtMonth(t, pensionMonthly, chadAlive) {
  if (pensionMonthly <= 0) return 0;
  const pensionCola = 1.03; // WA PERS COLA cap
  const yearsFromStart = Math.floor(t / 12);
  const pensionWithCola = Math.round(pensionMonthly * Math.pow(pensionCola, yearsFromStart));
  // Full pension while Chad is alive; survivor gets 50%
  return chadAlive ? pensionWithCola : Math.round(pensionWithCola * 0.5);
}

function getRetirementMonthDetails(t, {
  chadPassesAge,
  ageDiff,
  survivorSpendRatio,
  trustMonthly,
  chadSS,
  ssFRA,
  sarahOwnSS,
  survivorSS,
  pensionMonthly,
}) {
  const survivorStartMonth = getSurvivorStartMonth(chadPassesAge);
  const chadAge = 67 + t / 12;
  const chadAlive = t < survivorStartMonth;
  const ssInfo = getRetirementSSInfo(chadAge, chadAlive, {
    ageDiff,
    chadSS,
    ssFRA,
    sarahOwnSS,
    survivorSS,
  });
  const pension = getPensionAtMonth(t, pensionMonthly || 0, chadAlive);
  const guaranteedIncome = trustMonthly + ssInfo.amount + pension;

  return {
    chadAge,
    sarahAge: ssInfo.sarahAge,
    chadAlive,
    phase: chadAlive ? 'couple' : 'survivor',
    scaling: chadAlive ? 1.0 : survivorSpendRatio,
    guaranteedIncome,
    ssIncome: ssInfo.amount,
    ssLabel: ssInfo.label,
    trustIncome: trustMonthly,
    pensionIncome: pension,
  };
}

function getDecisionMonth(context, decisionMonth) {
  if (!Number.isFinite(decisionMonth)) return 0;
  return Math.max(0, Math.min(context.horizonMonths, Math.floor(decisionMonth)));
}

export function getRetirementSSInfo(chadAge, chadAlive, {
  ageDiff,
  chadSS,
  ssFRA,
  sarahOwnSS,
  survivorSS,
}) {
  const sarahAge = chadAge - ageDiff;

  if (chadAlive) {
    const sarahSpousal = sarahAge >= 62 ? Math.min(Math.round(ssFRA * 0.5), sarahOwnSS) : 0;
    return {
      amount: chadSS + sarahSpousal,
      label: sarahSpousal > 0 ? 'Chad + Sarah spousal' : 'Chad only',
      sarahAge,
    };
  }

  return {
    amount: sarahAge >= 67 ? Math.max(survivorSS, sarahOwnSS)
      : sarahAge >= 60 ? Math.round(survivorSS * 0.715)
      : 0,
    label: sarahAge >= 67 ? 'Sarah survivor' : sarahAge >= 60 ? 'Sarah survivor (reduced)' : 'none',
    sarahAge,
  };
}

export function buildRetirementContext({
  horizonMonths,
  chadPassesAge,
  ageDiff,
  survivorSpendRatio,
  chadSS,
  ssFRA,
  sarahOwnSS,
  survivorSS,
  trustMonthly,
  pensionMonthly,
}) {
  const supplementalFlows = new Float64Array(horizonMonths);
  const scaling = new Float64Array(horizonMonths);
  const guaranteedIncome = new Float64Array(horizonMonths);
  const ssIncome = new Float64Array(horizonMonths);
  const trustIncome = new Float64Array(horizonMonths);
  const pensionIncome = new Float64Array(horizonMonths);
  const chadAges = new Float64Array(horizonMonths);
  const sarahAges = new Float64Array(horizonMonths);
  const phases = new Array(horizonMonths);
  const ssLabels = new Array(horizonMonths);
  const config = {
    chadPassesAge,
    ageDiff,
    survivorSpendRatio,
    trustMonthly,
    chadSS,
    ssFRA,
    sarahOwnSS,
    survivorSS,
    pensionMonthly: pensionMonthly || 0,
  };

  for (let t = 0; t < horizonMonths; t++) {
    const details = getRetirementMonthDetails(t, config);
    supplementalFlows[t] = details.guaranteedIncome;
    scaling[t] = details.scaling;
    guaranteedIncome[t] = details.guaranteedIncome;
    ssIncome[t] = details.ssIncome;
    trustIncome[t] = details.trustIncome;
    pensionIncome[t] = details.pensionIncome;
    chadAges[t] = details.chadAge;
    sarahAges[t] = details.sarahAge;
    phases[t] = details.phase;
    ssLabels[t] = details.ssLabel;
  }

  return {
    horizonMonths,
    survivorStartMonth: getSurvivorStartMonth(chadPassesAge),
    supplementalFlows,
    scaling,
    guaranteedIncome,
    ssIncome,
    trustIncome,
    pensionIncome,
    chadAges,
    sarahAges,
    phases,
    ssLabels,
  };
}

export function buildScalingAndRescueFlows({
  horizonMonths,
  chadPassesAge,
  survivorSpendRatio,
  hasInheritance,
  inheritanceMonth,
  inheritanceAmount,
}) {
  const rescueFlows = new Float64Array(horizonMonths);
  const scaling = new Float64Array(horizonMonths);
  const survivorStartMonth = getSurvivorStartMonth(chadPassesAge);

  for (let t = 0; t < horizonMonths; t++) {
    scaling[t] = t < survivorStartMonth ? 1.0 : survivorSpendRatio;
  }

  if (hasInheritance && inheritanceMonth >= 0 && inheritanceMonth < horizonMonths) {
    rescueFlows[inheritanceMonth] = inheritanceAmount;
  }

  return { rescueFlows, scaling };
}

export function buildSupplementalFlows({
  horizonMonths,
  chadPassesAge,
  ageDiff,
  chadSS,
  ssFRA,
  sarahOwnSS,
  survivorSS,
  trustMonthly,
  pensionMonthly,
  hasInheritance,
  inheritanceMonth,
  inheritanceAmount,
}) {
  const context = buildRetirementContext({
    horizonMonths,
    chadPassesAge,
    ageDiff,
    survivorSpendRatio: 1,
    chadSS,
    ssFRA,
    sarahOwnSS,
    survivorSS,
    trustMonthly,
    pensionMonthly,
  });
  const supplementalFlows = new Float64Array(context.supplementalFlows);

  if (hasInheritance && inheritanceMonth >= 0 && inheritanceMonth < horizonMonths) {
    supplementalFlows[inheritanceMonth] += inheritanceAmount;
  }

  return supplementalFlows;
}

export function sliceRetirementContext(context, decisionMonth) {
  const currentMonth = getDecisionMonth(context, decisionMonth);
  const remainingMonths = Math.max(0, context.horizonMonths - currentMonth);
  const lastMonth = Math.max(0, context.horizonMonths - 1);

  return {
    decisionMonth: currentMonth,
    remainingMonths,
    supplementalFlows: context.supplementalFlows.subarray(currentMonth, context.horizonMonths),
    scaling: context.scaling.subarray(currentMonth, context.horizonMonths),
    currentGuaranteedIncome: remainingMonths > 0 ? context.guaranteedIncome[currentMonth] : 0,
    currentSSIncome: remainingMonths > 0 ? context.ssIncome[currentMonth] : 0,
    currentTrustIncome: remainingMonths > 0 ? context.trustIncome[currentMonth] : 0,
    currentPensionIncome: remainingMonths > 0 ? (context.pensionIncome ? context.pensionIncome[currentMonth] : 0) : 0,
    currentScaling: remainingMonths > 0 ? context.scaling[currentMonth] : 0,
    currentPhase: remainingMonths > 0 ? context.phases[currentMonth] : 'completed',
    currentChadAge: remainingMonths > 0 ? context.chadAges[currentMonth] : context.chadAges[lastMonth] || 67,
    currentSarahAge: remainingMonths > 0 ? context.sarahAges[currentMonth] : context.sarahAges[lastMonth] || 67,
    currentSSLabel: remainingMonths > 0 ? context.ssLabels[currentMonth] : 'none',
  };
}

export function deriveCurrentWithdrawalView(totalSpendingTarget, currentGuaranteedIncome) {
  const spendingTarget = Math.max(0, Number.isFinite(totalSpendingTarget) ? totalSpendingTarget : 0);
  const guaranteedIncome = Math.max(0, Number.isFinite(currentGuaranteedIncome) ? currentGuaranteedIncome : 0);
  const currentPortfolioDraw = Math.max(0, spendingTarget - guaranteedIncome);
  const outsideIncomeReinvested = Math.max(0, guaranteedIncome - spendingTarget);

  return {
    totalSpendingTarget: spendingTarget,
    currentGuaranteedIncome: guaranteedIncome,
    currentPortfolioDraw,
    currentTotalIncome: guaranteedIncome + currentPortfolioDraw,
    outsideIncomeReinvested,
  };
}

export function getRetirementIncomePlan(chadAge, poolActive, {
  chadPassesAge,
  ageDiff,
  baseMonthlyConsumption,
  survivorSpendRatio,
  trustMonthly,
  chadSS,
  ssFRA,
  sarahOwnSS,
  survivorSS,
  pensionMonthly,
}) {
  const chadAlive = chadAge < chadPassesAge;
  const ssInfo = getRetirementSSInfo(chadAge, chadAlive, {
    ageDiff,
    chadSS,
    ssFRA,
    sarahOwnSS,
    survivorSS,
  });
  const yearsFromRetirement = Math.max(0, chadAge - 67);
  const pension = getPensionAtMonth(yearsFromRetirement * 12, pensionMonthly || 0, chadAlive);
  const totalTarget = Math.round(baseMonthlyConsumption * (chadAlive ? 1 : survivorSpendRatio));
  const guaranteedIncome = ssInfo.amount + trustMonthly + pension;
  const poolDraw = poolActive ? Math.max(0, totalTarget - guaranteedIncome) : 0;
  const savedToPool = poolActive ? Math.max(0, guaranteedIncome - totalTarget) : 0;

  return {
    chadAlive,
    sarahAge: ssInfo.sarahAge,
    totalTarget,
    monthly: poolActive ? totalTarget : guaranteedIncome,
    guaranteedIncome,
    poolDraw,
    savedToPool,
    ssIncome: ssInfo.amount,
    ssLabel: ssInfo.label,
    pensionIncome: pension,
  };
}

export function getRetirementPhaseSummary(startAge, endAgeExclusive, planConfig) {
  const endAgeInPhase = Math.max(startAge, endAgeExclusive - 1);
  const start = getRetirementIncomePlan(startAge, true, planConfig);
  const end = getRetirementIncomePlan(endAgeInPhase, true, planConfig);
  return {
    totalTarget: start.totalTarget,
    start,
    end,
  };
}
