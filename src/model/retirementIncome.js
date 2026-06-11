import { ssSpousalAdjustmentFactor } from './constants.js';

function getSurvivorStartMonth(chadPassesAge) {
  return (chadPassesAge - 67) * 12;
}

export function getPensionAtMonth(t, pensionMonthly, chadAlive) {
  if (pensionMonthly <= 0) return 0;
  // Held FLAT in real terms (owner decision 2026-05-28). The model is a REAL
  // (inflation-adjusted) model; a nominal ~3% COLA roughly tracks inflation and
  // is therefore ~constant in today's dollars — exactly like the SS streams,
  // which are also held flat. Previously this grew by Math.pow(1.03, years),
  // which double-counted inflation inside a real-dollar model (finding 2.1).
  const pensionWithCola = Math.round(pensionMonthly);
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
  survivorCap,
  chadSSStartAge,
  sarahSpousalClaimAge,
  sarahSpousalEnabled,
  pensionMonthly,
  imputedRentMonthly,
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
    survivorCap,
    chadSSStartAge,
    sarahSpousalClaimAge,
    sarahSpousalEnabled,
    // Survivor claim age = Sarah's age when widowed (floored at 60 inside the
    // helper) — locks the SSA reduction factor at claim time (D3).
    survivorClaimAge: chadPassesAge - ageDiff,
  });
  const pension = getPensionAtMonth(t, pensionMonthly || 0, chadAlive);
  // Item 7 (2026-06-10 batch 2): imputed rent (house kept) is guaranteed
  // income in BOTH phases — exposed as its own component so charts never
  // fold it into the trust layer.
  const imputedRent = imputedRentMonthly || 0;
  const guaranteedIncome = trustMonthly + ssInfo.amount + pension + imputedRent;

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
    imputedRentIncome: imputedRent,
  };
}

function getDecisionMonth(context, decisionMonth) {
  if (!Number.isFinite(decisionMonth)) return 0;
  return Math.max(0, Math.min(context.horizonMonths, Math.floor(decisionMonth)));
}

// SSA survivor-benefit reduction (remediation 2026-06-09 D3): a widow(er)
// claiming at 60 receives 71.5% of the deceased's benefit; the factor rises
// linearly to 100% at the survivor's FRA (67). The reduction is locked at
// CLAIM age and is permanent — it does not "heal" at FRA.
const SURVIVOR_EARLIEST_AGE = 60;
const SURVIVOR_FRA = 67;
const SURVIVOR_MIN_FACTOR = 0.715;

export function survivorReductionFactor(claimAge) {
  const a = Math.min(
    SURVIVOR_FRA,
    Math.max(SURVIVOR_EARLIEST_AGE, Number.isFinite(claimAge) ? claimAge : SURVIVOR_FRA),
  );
  return SURVIVOR_MIN_FACTOR
    + (a - SURVIVOR_EARLIEST_AGE) * ((1 - SURVIVOR_MIN_FACTOR) / (SURVIVOR_FRA - SURVIVOR_EARLIEST_AGE));
}

export function getRetirementSSInfo(chadAge, chadAlive, {
  ageDiff,
  chadSS,
  ssFRA,
  sarahOwnSS,
  survivorSS,
  survivorCap,
  chadSSStartAge,
  survivorClaimAge,
  sarahSpousalClaimAge,
  sarahSpousalEnabled,
}) {
  const sarahAge = chadAge - ageDiff;

  if (chadAlive) {
    // SSA spousal rule (remediation 2026-06-09 D3): once Sarah claims, the
    // household receives Chad's benefit PLUS the LARGER of her own-record
    // benefit or the spousal ceiling (50% of Chad's PIA) — her own benefit is
    // topped up toward the spousal amount, never reduced to the smaller of
    // the two (dual entitlement: own + spousal excess = max of the two).
    //
    // A7 (remediation 2026-06-10, item 1.5): the ceiling is REDUCED by the
    // spousal early-claim factor (25/36%/mo first 36, 5/12%/mo beyond; clamp
    // 1.0 at FRA — no delayed credits), keyed on sarahSpousalClaimAge from
    // state (D9 default 67). Nothing is payable before her claim age (deemed
    // filing claims own + spousal together) — the old rule paid the UNREDUCED
    // 50% ceiling from age 62 regardless of claim age, filling ages 62–67
    // with money SSA would never pay.
    // A2 (2026-06-10 retirement review): a delayed claim (68-70) is not in
    // payment until chadSSStartAge — the old code paid the DRC-inflated
    // benefit from t=0 (age 67), 1-3 years before SSA would. Callers without
    // the param (legacy/direct) default to 0 = always payable.
    const chadFiled = chadAge >= (chadSSStartAge ?? 0);
    const chadBenefit = chadFiled ? chadSS : 0;
    const spousalClaimAge = Math.min(70, Math.max(62, sarahSpousalClaimAge ?? 67));
    // Spousal requires the worker to be ENTITLED (filed): nothing is payable
    // before Chad's claim, and when his filing comes after her elected age,
    // the spousal reduction is measured at her age when the benefit BEGINS
    // (no reduction once she's past FRA), not at the earlier election age.
    const spousalStartAge = Math.max(spousalClaimAge, (chadSSStartAge ?? 0) - ageDiff);
    // A3: the spousal toggle suppresses only the TOP-UP (ceiling) — Sarah's
    // own-record benefit below is a different SSA benefit and still pays.
    const spousalCeiling = (chadFiled && sarahSpousalEnabled !== false)
      ? Math.round(ssFRA * 0.5 * ssSpousalAdjustmentFactor(Math.min(70, spousalStartAge)))
      : 0;
    const sarahBenefit = sarahAge >= spousalClaimAge ? Math.max(spousalCeiling, sarahOwnSS) : 0;
    return {
      amount: chadBenefit + sarahBenefit,
      label: chadBenefit === 0 && sarahBenefit === 0 ? 'none'
        : sarahBenefit === 0 ? 'Chad only'
        : chadBenefit === 0 ? 'Sarah own record'
        : spousalCeiling > sarahOwnSS ? 'Chad + Sarah spousal'
        : 'Chad + Sarah own record',
      sarahAge,
    };
  }

  // Survivor phase. Nothing is payable before 60. From 60, Sarah claims the
  // survivor benefit with the SSA reduction factor locked at her CLAIM age
  // (the age she was widowed, floored at 60; callers that know chadPassesAge
  // pass it via survivorClaimAge — direct callers fall back to her current
  // age). The factor interpolates 71.5% → 100% between 60 and FRA (67) and is
  // permanent thereafter. The old rule paid a flat 71.5% for ALL ages 60–66
  // and then jumped to 100% at 67 — SSA does neither. From 62 she can switch
  // to her own record when it pays more.
  if (sarahAge < SURVIVOR_EARLIEST_AGE) {
    return { amount: 0, label: 'none', sarahAge };
  }
  const claimAge = Math.max(SURVIVOR_EARLIEST_AGE, survivorClaimAge ?? sarahAge);
  const factor = survivorReductionFactor(claimAge);
  // A1 (2026-06-10 retirement review): the claim-age reduction applies to the
  // BASE (PIA + DRCs); the RIB-LIM cap — max(82.5% PIA, the deceased's actual
  // reduced benefit) when he claimed early — is applied AFTER, as a min().
  // Callers without a cap (legacy/direct) default to Infinity (no limit).
  const cap = Number.isFinite(survivorCap) ? survivorCap : Infinity;
  const reducedSurvivor = Math.round(Math.min(survivorSS * factor, cap));
  const usesOwnRecord = sarahAge >= 62 && sarahOwnSS > reducedSurvivor;
  return {
    amount: usesOwnRecord ? sarahOwnSS : reducedSurvivor,
    label: usesOwnRecord ? 'Sarah own record'
      : factor >= 1 ? 'Sarah survivor'
      : 'Sarah survivor (reduced)',
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
  survivorCap,
  chadSSStartAge,
  sarahSpousalClaimAge,
  sarahSpousalEnabled,
  trustMonthly,
  pensionMonthly,
  imputedRentMonthly,
}) {
  const supplementalFlows = new Float64Array(horizonMonths);
  const scaling = new Float64Array(horizonMonths);
  const guaranteedIncome = new Float64Array(horizonMonths);
  const ssIncome = new Float64Array(horizonMonths);
  const trustIncome = new Float64Array(horizonMonths);
  const pensionIncome = new Float64Array(horizonMonths);
  const imputedRentIncome = new Float64Array(horizonMonths);
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
    survivorCap,
    chadSSStartAge,
    sarahSpousalClaimAge,
    sarahSpousalEnabled,
    pensionMonthly: pensionMonthly || 0,
    imputedRentMonthly: imputedRentMonthly || 0,
  };

  for (let t = 0; t < horizonMonths; t++) {
    const details = getRetirementMonthDetails(t, config);
    supplementalFlows[t] = details.guaranteedIncome;
    scaling[t] = details.scaling;
    guaranteedIncome[t] = details.guaranteedIncome;
    ssIncome[t] = details.ssIncome;
    trustIncome[t] = details.trustIncome;
    pensionIncome[t] = details.pensionIncome;
    imputedRentIncome[t] = details.imputedRentIncome;
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
    imputedRentIncome,
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
  survivorCap,
  chadSSStartAge,
  sarahSpousalClaimAge,
  sarahSpousalEnabled,
  trustMonthly,
  pensionMonthly,
  imputedRentMonthly,
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
    survivorCap,
    chadSSStartAge,
    sarahSpousalClaimAge,
    sarahSpousalEnabled,
    trustMonthly,
    pensionMonthly,
    imputedRentMonthly,
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
  survivorCap,
  chadSSStartAge,
  sarahSpousalClaimAge,
  sarahSpousalEnabled,
  pensionMonthly,
  imputedRentMonthly,
}) {
  const chadAlive = chadAge < chadPassesAge;
  const ssInfo = getRetirementSSInfo(chadAge, chadAlive, {
    ageDiff,
    chadSS,
    ssFRA,
    sarahOwnSS,
    survivorSS,
    survivorCap,
    chadSSStartAge,
    sarahSpousalClaimAge,
    sarahSpousalEnabled,
    // Lock the SSA survivor reduction at the age Sarah is widowed (D3).
    survivorClaimAge: chadPassesAge - ageDiff,
  });
  const yearsFromRetirement = Math.max(0, chadAge - 67);
  const pension = getPensionAtMonth(yearsFromRetirement * 12, pensionMonthly || 0, chadAlive);
  const totalTarget = Math.round(baseMonthlyConsumption * (chadAlive ? 1 : survivorSpendRatio));
  const imputedRent = imputedRentMonthly || 0;
  const guaranteedIncome = ssInfo.amount + trustMonthly + pension + imputedRent;
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
    imputedRentIncome: imputedRent,
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
