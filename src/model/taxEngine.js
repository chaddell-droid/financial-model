import {
  BRACKETS_MFJ_2025, SS_WAGE_BASE, SS_RATE, MEDICARE_RATE,
  SE_FACTOR, STD_DED, SALT_CAP, SALT_CAP_FLOOR, SALT_MAGI_THRESHOLD, SALT_PHASEOUT_RATE,
  MEDICAL_FLOOR, CAP_LOSS_LIMIT,
  SOLO_401K_EMPLOYEE_LIMIT, SOLO_401K_EMPLOYER_RATE, SOLO_401K_TOTAL_LIMIT,
  QBI_RATE, QBI_PHASE_OUT, QBI_PHASE_OUT_RANGE, ADDL_MEDICARE_RATE,
  ADDL_MEDICARE_THRESHOLD, ADDL_MEDICARE_W2_THRESHOLD,
  CTC_AMOUNT, ODC_AMOUNT,
  SS_PROVISIONAL_THRESHOLD_1, SS_PROVISIONAL_THRESHOLD_2, SS_TAXABLE_TIER_1, SS_TAXABLE_TIER_2,
} from './taxConstants.js';

/**
 * Compute the taxable portion of Social Security benefits using IRS provisional income rules.
 * Provisional income = other AGI + 50% of SS benefits.
 * MFJ thresholds: $32K (50% taxable) and $44K (85% taxable).
 */
export function computeSSTaxableAmount(annualSSBenefit, otherAGI) {
  if (annualSSBenefit <= 0) return 0;
  const provisional = otherAGI + annualSSBenefit * 0.5;
  if (provisional <= SS_PROVISIONAL_THRESHOLD_1) return 0;

  const tier1 = Math.min(
    annualSSBenefit * SS_TAXABLE_TIER_1,
    (provisional - SS_PROVISIONAL_THRESHOLD_1) * 0.5
  );
  if (provisional <= SS_PROVISIONAL_THRESHOLD_2) return Math.round(tier1);

  const tier2 = Math.min(
    annualSSBenefit * SS_TAXABLE_TIER_2,
    tier1 + (provisional - SS_PROVISIONAL_THRESHOLD_2) * 0.85
  );
  return Math.round(tier2);
}

export function computeSelfEmploymentTax(schCNet, w2Wages = 0) {
  const seBase = Math.max(0, schCNet) * SE_FACTOR;
  const remainingBase = Math.max(0, SS_WAGE_BASE - w2Wages);
  const ssTax = Math.min(seBase, remainingBase) * SS_RATE;
  const medTax = seBase * MEDICARE_RATE;
  const seTax = ssTax + medTax;
  const halfSeTax = seTax / 2;
  return { seBase, ssTax, medTax, seTax, halfSeTax };
}

export function computeFederalTax(taxableIncome, brackets = BRACKETS_MFJ_2025) {
  let fedTax = 0, prev = 0;
  for (const [cap, rate] of brackets) {
    if (taxableIncome > cap) { fedTax += (cap - prev) * rate; prev = cap; }
    else { fedTax += (taxableIncome - prev) * rate; break; }
  }

  let marginalRate = brackets[0][1];
  for (const [cap, rate] of brackets) {
    if (taxableIncome <= cap) { marginalRate = rate; break; }
  }

  return { fedTax, marginalRate };
}

export function computeItemizedDeductions({ agi, propertyTax, salesTax, personalPropTax, mortgageInt, charitable, totalMedicalInput, saltCap = null }) {
  const saltTotal = propertyTax + salesTax + personalPropTax;
  const baseCap = saltCap ?? SALT_CAP;
  const saltCapEffective = Math.max(
    SALT_CAP_FLOOR,
    baseCap - Math.max(0, agi - SALT_MAGI_THRESHOLD) * SALT_PHASEOUT_RATE
  );
  const saltDeductible = Math.min(saltTotal, saltCapEffective);
  const medicalFloor = agi * MEDICAL_FLOOR;
  const medicalDeductible = Math.max(0, totalMedicalInput - medicalFloor);
  const itemized = saltDeductible + mortgageInt + charitable + medicalDeductible;
  const deductionUsed = Math.max(itemized, STD_DED);
  const usingItemized = itemized > STD_DED;
  return { saltTotal, saltDeductible, medicalFloor, medicalDeductible, itemized, deductionUsed, usingItemized };
}

export function computeQBI({ schCNet, taxableBeforeQbi, skipPhaseOut = false }) {
  if (skipPhaseOut) {
    return schCNet * QBI_RATE;
  }
  const fullQbi = Math.min(schCNet * QBI_RATE, taxableBeforeQbi * QBI_RATE);
  if (taxableBeforeQbi <= QBI_PHASE_OUT) {
    return fullQbi;
  }
  if (taxableBeforeQbi < QBI_PHASE_OUT + QBI_PHASE_OUT_RANGE) {
    const phaseOutPct = (taxableBeforeQbi - QBI_PHASE_OUT) / QBI_PHASE_OUT_RANGE;
    return fullQbi * (1 - phaseOutPct);
  }
  return 0;
}

export function computeAdditionalMedicare({ w2Wages, seBase }) {
  const medicareWages = w2Wages + seBase;
  const addlMedicare = Math.max(0, medicareWages - ADDL_MEDICARE_THRESHOLD) * ADDL_MEDICARE_RATE;
  const addlWithheld = Math.max(0, w2Wages - ADDL_MEDICARE_W2_THRESHOLD) * ADDL_MEDICARE_RATE;
  const addlMedicareOwed = Math.max(0, addlMedicare - addlWithheld);
  return { addlMedicare, addlWithheld, addlMedicareOwed };
}

export function computeMax401k(schCNet, halfSeTax) {
  const employeeMax = SOLO_401K_EMPLOYEE_LIMIT;
  const netForEmployer = Math.max(0, schCNet - halfSeTax);
  const employerMax = Math.round(netForEmployer * SOLO_401K_EMPLOYER_RATE);
  const totalMax = Math.min(employeeMax + employerMax, SOLO_401K_TOTAL_LIMIT);
  return { employeeMax, employerMax, totalMax };
}

/**
 * Unified tax calculation supporting three modes:
 *
 * Full mode (main calculator): pass all deduction components, credits by count
 * Simplified mode (TaxBurdenShift): pass preComputedItemized, flatCredits, skipAdditionalMedicare, skipQbiPhaseOut
 * Projection mode (PracticeForecaster): pass marginalRateOverride to bypass bracket iteration
 */
export function calculateTax(inputs) {
  const {
    w2Wages = 0,
    w2Withholding = 0,
    schCNet = 0,
    capGainLoss = 0,

    // Itemized deduction components (full mode)
    propertyTax = 0,
    salesTax = 0,
    personalPropTax = 0,
    mortgageInt = 0,
    charitable = 0,
    totalMedicalInput = 0,

    // Credits (full mode)
    ctcChildren = 0,
    odcDependents = 0,

    // Retirement
    solo401kContribution = 0,

    // SS benefit taxation
    ssBenefitAnnual = 0,

    // Overrides for simplified/projection modes
    preComputedItemized = null,
    saltCap = null,
    flatCredits = null,
    skipAdditionalMedicare = false,
    skipQbiPhaseOut = false,
    marginalRateOverride = null,
    // Optional bracket override for inflation adjustment
    brackets = null,
  } = inputs;

  // SE tax — shared by all modes
  const se = computeSelfEmploymentTax(schCNet, w2Wages);

  // --- Projection mode: simplified marginal rate calculation ---
  if (marginalRateOverride !== null) {
    const mr = marginalRateOverride;
    const qbiBenefit = schCNet * QBI_RATE * mr;
    const halfSeBenefit = se.halfSeTax * mr;
    const incomeTaxOnSchC = (schCNet - se.halfSeTax) * mr;
    const totalTax = se.seTax + incomeTaxOnSchC - qbiBenefit;
    const takeHome = schCNet - totalTax;
    const effectiveOnNet = schCNet > 0 ? totalTax / schCNet : 0;

    return {
      ...se,
      marginalRate: mr,
      qbiBenefit,
      halfSeBenefit,
      incomeTaxOnSchC,
      totalTax,
      takeHome,
      effectiveOnNet,
    };
  }

  // --- Standard mode: full or simplified ---
  const capAdj = Math.max(capGainLoss, CAP_LOSS_LIMIT);
  const ssTaxableIncome = computeSSTaxableAmount(ssBenefitAnnual, w2Wages + schCNet + capAdj);
  const totalIncome = w2Wages + schCNet + capAdj + ssTaxableIncome;
  const max401k = computeMax401k(schCNet, se.halfSeTax);
  const effective401k = Math.min(solo401kContribution, max401k.totalMax);
  const agi = totalIncome - se.halfSeTax - effective401k;

  // Deductions
  let deductions;
  if (preComputedItemized !== null) {
    deductions = {
      saltTotal: 0,
      saltDeductible: 0,
      medicalFloor: 0,
      medicalDeductible: 0,
      itemized: preComputedItemized,
      deductionUsed: preComputedItemized,
      usingItemized: true,
    };
  } else {
    deductions = computeItemizedDeductions({
      agi, propertyTax, salesTax, personalPropTax,
      mortgageInt, charitable, totalMedicalInput, saltCap,
    });
  }

  // QBI
  const taxableBeforeQbi = Math.max(0, agi - deductions.deductionUsed);
  const qbi = computeQBI({ schCNet, taxableBeforeQbi, skipPhaseOut: skipQbiPhaseOut });
  const taxableIncome = Math.max(0, taxableBeforeQbi - qbi);

  // Federal income tax (use inflated brackets if provided)
  const { fedTax, marginalRate } = brackets
    ? computeFederalTax(taxableIncome, brackets)
    : computeFederalTax(taxableIncome);

  // Credits
  const totalCredits = flatCredits !== null
    ? flatCredits
    : (ctcChildren * CTC_AMOUNT + odcDependents * ODC_AMOUNT);

  // Additional Medicare
  let addlMedicareOwed = 0;
  if (!skipAdditionalMedicare) {
    const aml = computeAdditionalMedicare({ w2Wages, seBase: se.seBase });
    addlMedicareOwed = aml.addlMedicareOwed;
  }

  // Total tax
  const totalTax = Math.max(0, fedTax - totalCredits) + se.seTax + addlMedicareOwed;
  const balance = w2Withholding - totalTax;
  const effectiveRate = agi > 0 ? totalTax / agi : 0;

  return {
    // SE tax breakdown
    ...se,
    // Income
    totalIncome,
    ssTaxableIncome,
    agi,
    // Solo 401(k)
    solo401kContribution: effective401k,
    max401k,
    // Deductions
    ...deductions,
    // QBI
    qbi,
    taxableBeforeQbi,
    taxableIncome,
    // Federal tax
    fedTax,
    marginalRate,
    // Credits
    totalCredits,
    // Additional Medicare
    addlMedicareOwed,
    // Totals
    totalTax,
    balance,
    effectiveRate,
    // Pass-through inputs for deduction impact display
    mortgageInt,
    charitable,
  };
}
