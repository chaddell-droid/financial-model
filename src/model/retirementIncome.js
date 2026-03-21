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
  const survivorStartMonth = (chadPassesAge - 67) * 12;

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
  hasInheritance,
  inheritanceMonth,
  inheritanceAmount,
}) {
  const supplementalFlows = new Float64Array(horizonMonths);
  const survivorStartMonth = (chadPassesAge - 67) * 12;
  const ssConfig = { ageDiff, chadSS, ssFRA, sarahOwnSS, survivorSS };

  for (let t = 0; t < horizonMonths; t++) {
    const chadAge = 67 + t / 12;
    const chadAlive = t < survivorStartMonth;
    const ssInfo = getRetirementSSInfo(chadAge, chadAlive, ssConfig);
    supplementalFlows[t] = trustMonthly + ssInfo.amount;
  }

  if (hasInheritance && inheritanceMonth >= 0 && inheritanceMonth < horizonMonths) {
    supplementalFlows[inheritanceMonth] += inheritanceAmount;
  }

  return supplementalFlows;
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
}) {
  const chadAlive = chadAge < chadPassesAge;
  const ssInfo = getRetirementSSInfo(chadAge, chadAlive, {
    ageDiff,
    chadSS,
    ssFRA,
    sarahOwnSS,
    survivorSS,
  });
  const totalTarget = Math.round(baseMonthlyConsumption * (chadAlive ? 1 : survivorSpendRatio));
  const guaranteedIncome = ssInfo.amount + trustMonthly;
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
