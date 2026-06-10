import {
  BRACKETS_MFJ_2026, SS_WAGE_BASE, SS_RATE, MEDICARE_RATE,
  SE_FACTOR, STD_DED, SALT_CAP, SALT_CAP_FLOOR, SALT_MAGI_THRESHOLD, SALT_PHASEOUT_RATE,
  MEDICAL_FLOOR, CAP_LOSS_LIMIT,
  SOLO_401K_EMPLOYEE_LIMIT, SOLO_401K_EMPLOYER_RATE_SE, SOLO_401K_TOTAL_LIMIT,
  QBI_RATE, QBI_PHASE_OUT, QBI_PHASE_OUT_RANGE, ADDL_MEDICARE_RATE,
  ADDL_MEDICARE_THRESHOLD, ADDL_MEDICARE_W2_THRESHOLD,
  CTC_AMOUNT, ODC_AMOUNT, CTC_PHASEOUT_THRESHOLD_MFJ, CTC_PHASEOUT_RATE,
  SS_PROVISIONAL_THRESHOLD_1, SS_PROVISIONAL_THRESHOLD_2, SS_TAXABLE_TIER_1, SS_TAXABLE_TIER_2,
  LTCG_BRACKETS_MFJ_2026, NIIT_RATE, NIIT_THRESHOLD_MFJ,
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

  // IRS Pub 915 / 1040 SS Benefits Worksheet caps the tier-1 carry-in at
  // 50% of the band between the two thresholds (= $6,000 MFJ). The full
  // uncapped tier1 above overstates taxable SS when provisional > THRESHOLD_2.
  const tier1AddBack = Math.min(
    (SS_PROVISIONAL_THRESHOLD_2 - SS_PROVISIONAL_THRESHOLD_1) * SS_TAXABLE_TIER_1,
    tier1
  );
  const tier2 = Math.min(
    annualSSBenefit * SS_TAXABLE_TIER_2,
    (provisional - SS_PROVISIONAL_THRESHOLD_2) * 0.85 + tier1AddBack
  );
  return Math.round(tier2);
}

// FIX #1: noFICA controls whether W-2 SS wages count against the SS wage-base cap
// for SE tax purposes. When the W-2 employer is non-FICA-covered (e.g. certain
// state/local government), SS tax was never withheld on those wages, so the full
// SS_WAGE_BASE remains available for self-employment income.
export function computeSelfEmploymentTax(schCNet, w2Wages = 0, noFICA = false) {
  const seBase = Math.max(0, schCNet) * SE_FACTOR;
  const w2SsWages = noFICA ? 0 : w2Wages;
  const remainingBase = Math.max(0, SS_WAGE_BASE - w2SsWages);
  const ssTax = Math.min(seBase, remainingBase) * SS_RATE;
  const medTax = seBase * MEDICARE_RATE;
  const seTax = ssTax + medTax;
  const halfSeTax = seTax / 2;
  return { seBase, ssTax, medTax, seTax, halfSeTax };
}

export function computeFederalTax(taxableIncome, brackets = BRACKETS_MFJ_2026) {
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

/**
 * C4 (remediation 2026-06-10): long-term capital gain tax via the 0/15/20
 * stack. The LT gain is STACKED ON TOP of ordinary taxable income — each
 * slice of the gain pays the rate of the LTCG bracket it lands in by total
 * taxable income (§1(h), breakpoints per Rev. Proc. 2025-32 MFJ).
 */
export function computeLtcgTax(ordinaryTaxable, ltGain, brackets = LTCG_BRACKETS_MFJ_2026) {
  if (!(ltGain > 0)) return 0;
  let tax = 0;
  let prev = ordinaryTaxable;
  const top = ordinaryTaxable + ltGain;
  for (const [cap, rate] of brackets) {
    if (cap <= prev) continue;
    const sliceTop = Math.min(cap, top);
    tax += (sliceTop - prev) * rate;
    prev = sliceTop;
    if (prev >= top) break;
  }
  return tax;
}

export function computeItemizedDeductions({ agi, propertyTax, salesTax, personalPropTax, mortgageInt, charitable, totalMedicalInput, saltCap = null, saltThreshold = null }) {
  const saltTotal = propertyTax + salesTax + personalPropTax;
  const baseCap = saltCap ?? SALT_CAP;
  // C8 (remediation 2026-06-10): the phase-down MAGI threshold is year-scheduled
  // (OBBBA +1%/yr) — callers pass getSaltThresholdForYear(year); default is the
  // base-year (2026) value.
  const baseThreshold = saltThreshold ?? SALT_MAGI_THRESHOLD;
  const saltCapEffective = Math.max(
    SALT_CAP_FLOOR,
    baseCap - Math.max(0, agi - baseThreshold) * SALT_PHASEOUT_RATE
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

/**
 * FIX #1: Employee-side FICA on W-2 wages.
 * Normally the employer withholds 6.2% SS (up to SS_WAGE_BASE) + 1.45% Medicare.
 * When noFICA=true (non-FICA-covered employer such as certain state/local pensions),
 * the SS portion is suppressed but Medicare still applies. Additional Medicare
 * (0.9% over $200K W-2 wages) is computed separately in computeAdditionalMedicare.
 */
export function computeW2EmployeeFica(w2Wages, noFICA = false) {
  const ssWages = Math.min(Math.max(0, w2Wages), SS_WAGE_BASE);
  const ssTax = noFICA ? 0 : ssWages * (SS_RATE / 2); // employee half = 6.2%
  const medTax = Math.max(0, w2Wages) * (MEDICARE_RATE / 2); // employee half = 1.45%
  return { ssTax, medTax, ficaTax: ssTax + medTax };
}

export function computeMax401k(schCNet, halfSeTax) {
  const employeeMax = SOLO_401K_EMPLOYEE_LIMIT;
  const netForEmployer = Math.max(0, schCNet - halfSeTax);
  // C2 (remediation 2026-06-10): self-employed employer contribution uses the
  // Pub 560 reduced rate 0.25/1.25 = 20% of net SE earnings (the 25% plan rate
  // applies to a base that already excludes the contribution; solving the
  // circular definition gives rate/(1+rate)). The old 25% overstated Sarah's
  // employer max by ~$4.6k on a $100k Sch C year.
  const employerMax = Math.round(netForEmployer * SOLO_401K_EMPLOYER_RATE_SE);
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
    // C4 (remediation 2026-06-10): share of a POSITIVE net capital gain that
    // is long-term (taxed via the 0/15/20 stack). The household's realistic
    // gains are MSFT shares held >1 year, so the default is 1.0 (all LT);
    // set lower to model short-term gains taxed at ordinary rates. Losses
    // are unaffected (the $3,000 ordinary-income offset has no ST/LT seam
    // at this level of modeling).
    capGainLtShare = 1,

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
    saltThreshold = null, // C8: year-scheduled SALT phase-down MAGI threshold
    flatCredits = null,
    skipAdditionalMedicare = false,
    skipQbiPhaseOut = false,
    marginalRateOverride = null,
    // Optional bracket override for inflation adjustment
    brackets = null,
    // C4: optional LTCG-breakpoint override for inflation adjustment.
    ltcgBrackets = null,

    // FIX #1: Non-FICA-covered W-2 employer (no SS withholding on Chad's W-2 wages).
    // When true, the employee SS portion (6.2% × min(wages, SS_WAGE_BASE)) is zero,
    // but Medicare 1.45% and Additional Medicare 0.9% still apply.
    noFICA = false,

    // BUG #2: Separate FICA base from income-tax base. Pre-tax 401(k) deferrals AND
    // pre-tax pension contributions reduce Box 1 (federal income tax base = w2Wages
    // here) but Box 3/5 (SS+Medicare) wages stay at gross. So FICA must be computed
    // on a separate, larger base. Defaults to w2Wages for back-compat with callers
    // that haven't been updated.
    w2FicaBase = null,

    // A3 (remediation 2026-06-10): Schedule SE wage-base coordination is
    // PER-INDIVIDUAL (IRC §1402(b)(1) / Sch SE line 8a). The Sch C filer's
    // SS SE base is reduced only by HER OWN W-2 wages — never by the
    // spouse's. Sarah has no W-2 in this household, so this defaults to 0.
    sarahW2Wages = 0,
  } = inputs;
  // If w2FicaBase wasn't passed, fall back to w2Wages (pre-bug behavior).
  const effectiveW2FicaBase = w2FicaBase !== null ? w2FicaBase : w2Wages;

  // SE tax — shared by all modes.
  // A3 (remediation 2026-06-10): previously this passed Chad's W-2 FICA base,
  // zeroing Sarah's SE SS tax whenever his wages exceeded the wage base —
  // wrong under IRC §1402(b), which coordinates per individual. Only the
  // Sch C filer's own wages (sarahW2Wages) coordinate. noFICA (Chad's
  // employer attribute) is therefore irrelevant to the SE computation.
  // computeAdditionalMedicare below stays household-combined (correct:
  // the 0.9% $250K MFJ threshold applies to joint Medicare wages).
  const se = computeSelfEmploymentTax(schCNet, sarahW2Wages);

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
  // C4: split a positive net gain into LT (0/15/20 stack) and ST (ordinary).
  const ltShare = Math.min(1, Math.max(0, capGainLtShare));
  const ltGain = capAdj > 0 ? Math.round(capAdj * ltShare) : 0;
  const max401k = computeMax401k(schCNet, se.halfSeTax);
  const effective401k = Math.min(solo401kContribution, max401k.totalMax);
  // Provisional income (IRS Pub 915) uses "other AGI" — AGI excluding SS —
  // which is NET of above-the-line deductions (half SE tax + solo 401k).
  // Remediation 2026-06-09 Phase 4: previously fed the gross w2+schC+capAdj.
  const otherAGI = w2Wages + schCNet + capAdj - se.halfSeTax - effective401k;
  const ssTaxableIncome = computeSSTaxableAmount(ssBenefitAnnual, otherAGI);
  const totalIncome = w2Wages + schCNet + capAdj + ssTaxableIncome;
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
      mortgageInt, charitable, totalMedicalInput, saltCap, saltThreshold,
    });
  }

  // QBI — base is Sch C net REDUCED by the deductible half of SE tax and the
  // self-employed retirement deduction (IRC §199A(c)(4) / Form 8995 line 1).
  // Remediation 2026-06-09 Phase 4: previously used raw schCNet.
  const taxableBeforeQbi = Math.max(0, agi - deductions.deductionUsed);
  const qbiBase = Math.max(0, schCNet - se.halfSeTax - effective401k);
  const qbi = computeQBI({ schCNet: qbiBase, taxableBeforeQbi, skipPhaseOut: skipQbiPhaseOut });
  const taxableIncome = Math.max(0, taxableBeforeQbi - qbi);

  // Federal income tax (use inflated brackets if provided).
  // C4: the LT portion of taxable income comes OUT of the ordinary bracket
  // run and is taxed via the 0/15/20 stack on top of ordinary taxable income
  // (§1(h)). Deductions absorb ordinary income first, so the LT slice inside
  // taxable income is min(ltGain, taxableIncome). marginalRate stays the
  // ordinary-income marginal (what another $1 of wages/Sch C would pay).
  const ltTaxablePortion = Math.min(ltGain, taxableIncome);
  const ordinaryTaxable = taxableIncome - ltTaxablePortion;
  const { fedTax: ordinaryFedTax, marginalRate } = brackets
    ? computeFederalTax(ordinaryTaxable, brackets)
    : computeFederalTax(ordinaryTaxable);
  const ltcgTax = computeLtcgTax(ordinaryTaxable, ltTaxablePortion, ltcgBrackets ?? LTCG_BRACKETS_MFJ_2026);
  const fedTax = ordinaryFedTax + ltcgTax;

  // Credits — CTC $2,200/child + $500/ODC dependent, phased out $50 per
  // $1,000 (or fraction) of MAGI over $400K MFJ (5%). MAGI ≈ AGI here (no
  // foreign-income add-backs modeled). flatCredits (simplified mode) bypasses
  // the count-based path AND the phase-out by contract.
  let totalCredits;
  if (flatCredits !== null) {
    totalCredits = flatCredits;
  } else {
    const grossCredits = ctcChildren * CTC_AMOUNT + odcDependents * ODC_AMOUNT;
    const excessMagi = Math.max(0, agi - CTC_PHASEOUT_THRESHOLD_MFJ);
    const phaseOutReduction = Math.ceil(excessMagi / 1000) * 1000 * CTC_PHASEOUT_RATE;
    totalCredits = Math.max(0, grossCredits - phaseOutReduction);
  }

  // Additional Medicare — applies to MEDICARE wages (full gross including pre-tax
  // 401(k) and pension), not Box 1 income. Use the FICA base, same as the regular
  // Medicare 1.45% in computeW2EmployeeFica.
  // Remediation 2026-06-09 Phase 4: the FULL liability (addlMedicare) belongs in
  // totalTax; the employer-withheld 0.9% (addlMedicareWithheld) is a PREPAYMENT
  // credited when computing `balance`, not a reduction of the liability. This
  // mirrors taxProjection.js's chadAddlMedicarePaid treatment.
  let addlMedicare = 0;
  let addlMedicareWithheld = 0;
  let addlMedicareOwed = 0;
  if (!skipAdditionalMedicare) {
    const aml = computeAdditionalMedicare({ w2Wages: effectiveW2FicaBase, seBase: se.seBase });
    addlMedicare = aml.addlMedicare;
    addlMedicareWithheld = aml.addlWithheld;
    addlMedicareOwed = aml.addlMedicareOwed;
  }

  // FIX #1: Employee-side W-2 FICA — SS portion suppressed when noFICA=true.
  // BUG #2: Use the FICA base (full gross including pre-tax 401(k) and pension)
  // rather than the post-deduction w2Wages used for income tax.
  const w2Fica = computeW2EmployeeFica(effectiveW2FicaBase, noFICA);

  // C4: NIIT (§1411) — 3.8% × min(net investment income, MAGI − $250k MFJ).
  // Net investment income here is the positive net capital gain (ST and LT
  // both count); MAGI ≈ AGI (no foreign-income add-backs modeled).
  const netInvestmentIncome = Math.max(0, capAdj);
  const niit = NIIT_RATE * Math.max(0, Math.min(netInvestmentIncome, agi - NIIT_THRESHOLD_MFJ));

  // Total tax — includes the FULL additional-Medicare liability. The withheld
  // 0.9% is credited as a prepayment alongside w2Withholding in `balance`.
  const totalTax = Math.max(0, fedTax - totalCredits) + se.seTax + addlMedicare + niit + w2Fica.ficaTax;
  const balance = w2Withholding + addlMedicareWithheld - totalTax;
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
    // Federal tax. C4: fedTax = ordinary brackets on (taxable − LT slice)
    // + the 0/15/20 stack on the LT slice; the components are exposed too.
    fedTax,
    ordinaryFedTax,
    ltcgTax,
    ltGain,
    niit,
    marginalRate,
    // Credits
    totalCredits,
    // Additional Medicare: full liability (in totalTax), withheld prepayment
    // (credited in balance), and the net due at filing (display only).
    addlMedicare,
    addlMedicareWithheld,
    addlMedicareOwed,
    // FIX #1: W-2 employee FICA (SS portion suppressed when noFICA=true)
    w2FicaTax: w2Fica.ficaTax,
    w2FicaSS: w2Fica.ssTax,
    w2FicaMedicare: w2Fica.medTax,
    // Totals
    totalTax,
    balance,
    effectiveRate,
    // Pass-through inputs for deduction impact display
    mortgageInt,
    charitable,
  };
}
