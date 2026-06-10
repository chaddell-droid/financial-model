/**
 * Bridge between the tax engine and the financial model.
 *
 * buildTaxSchedule(s) pre-computes per-year tax results for the full
 * projection horizon. DISPLAY-ONLY for now (remediation 2026-06-09 D1): it is
 * consumed by the Tax tab (TaxSettingsPanel + TaxVisualization), the W-2 Net
 * Diagnostic breakdown (chadTaxBreakdown in FinancialModel), and the
 * advisor's taxBreakdown tool. The monthly projection loop in projection.js
 * does NOT consume it — cashflow still uses the flat-rate fields
 * (sarahTaxRate, chadJobTaxRate). A follow-on (D1-A2) may wire the engine
 * into the simulation behind taxMode === 'engine'.
 */

import { DAYS_PER_MONTH, PROJECTION_START_MONTH, STOCK_VEST_CALENDAR_MONTHS, TWINS_AGE_OUT_MONTH, SS_CHILD_BENEFIT_END_MONTH, SSDI_ATTORNEY_FEE_CAP, SS_START_OFFSET, ssAdjustmentFactor } from './constants.js';
import { levelAtMonthsWorked, age65VestEligibility, clearsOneYearCliff, firstAugustAtOrAfter } from './chadLevels.js';

// Mirror the projection's quarterly stock-vest helpers (kept in sync).
function isStockVestMonth(m) {
  return STOCK_VEST_CALENDAR_MONTHS.includes((m + PROJECTION_START_MONTH) % 12);
}
function nextStockVestMonthAfter(month) {
  for (let k = month + 1; k <= month + 3; k++) {
    if (isStockVestMonth(k)) return k;
  }
  return month + 3;
}
import { BRACKETS_MFJ_2026, LTCG_BRACKETS_MFJ_2026, STD_DED, getSaltCapForYear, getSaltThresholdForYear } from './taxConstants.js';
import { calculateTax, computeAdditionalMedicare, computeSSTaxableAmount } from './taxEngine.js';
import { getVestingGrossMonthly } from './vesting.js';

/**
 * Inflate bracket thresholds by a compounding factor.
 * Returns a new brackets array with scaled thresholds (rates unchanged).
 */
export function inflateBrackets(brackets, factor) {
  return brackets.map(([cap, rate]) =>
    [cap === Infinity ? Infinity : Math.round(cap * factor), rate]
  );
}

/**
 * Build tax params from gathered state, optionally inflation-adjusted.
 * Returns the deduction/credit inputs for calculateTax().
 */
export function getTaxInputs(s, yearIndex) {
  const factor = s.taxInflationAdjust
    ? Math.pow(1 + (s.taxInflationRate || 2) / 100, yearIndex)
    : 1;

  return {
    propertyTax: Math.round((s.taxPropertyTax || 0) * factor),
    salesTax: Math.round((s.taxSalesTax || 0) * factor),
    personalPropTax: Math.round((s.taxPersonalPropTax || 0) * factor),
    mortgageInt: Math.round((s.taxMortgageInt || 0) * factor),
    charitable: Math.round((s.taxCharitable || 0) * factor),
    totalMedicalInput: Math.round((s.taxMedical || 0) * factor),
    ctcChildren: s.taxCtcChildren ?? 2,
    odcDependents: s.taxOdcDependents ?? 0,
    capGainLoss: s.taxCapGainLoss ?? -3000,
    solo401kContribution: s.taxSolo401k ?? 0,
    w2Withholding: s.taxW2Withholding ?? 0,
  };
}

/**
 * Pre-estimate annual SS/SSDI benefits for each projection year.
 * Mirrors the SS income logic from projection.js (runMonthlySimulation) so the
 * tax schedule can incorporate SS benefit taxation before the monthly loop runs.
 *
 * Remediation 2026-06-09 Phase 4 — re-mirrored against projection.js:
 *   - SSDI kids step-down is CALENDAR-ANCHORED at TWINS_AGE_OUT_MONTH (was
 *     `ssdiApproval + kidsAgeOutMonths`, which drifted with approval month).
 *   - Models the postJobBenefit branch ('ssRetirement' age-gated at
 *     (claimAge − 62) × 12 + SS_START_OFFSET, 'ssdi', or 'none').
 *   - Defaults align with projection.js (ssFamilyTotal 7099, ssPersonal 2933).
 *   - Horizon is Math.ceil((months + 1) / 12) and the loop runs m = 0..months
 *     inclusive, matching both runMonthlySimulation and buildTaxSchedule
 *     (previously the final projection month fell outside the estimate).
 * Known limitation (pre-existing): the SS earnings test is NOT mirrored here,
 * so years where Chad works while drawing SS can overstate benefits slightly.
 *
 * FIX #4: Includes SSDI back-pay lump (paid at effectiveSsdiApproval + 2)
 * in the year that contains the back-pay receipt month, so up-to-85%
 * taxability of that lump is captured. Gating mirrors projection.js:
 *   - only when ssType==='ssdi' (i.e. !useSS) AND !ssdiDenied AND !chadJob.
 *
 * Exported for the parity test (taxPhase4.test.js) that sums projection.js's
 * monthly ssBenefit per year against this estimate.
 */
export function estimateAnnualSSBenefits(s) {
  return estimateAnnualSSBenefitsCore(s).familyBenefits;
}

/**
 * C6 (remediation 2026-06-10): the PARENTS' RETURN view of the SS estimate.
 * Pub 915: a child's auxiliary benefit is the CHILD's income (reported
 * against the child's own provisional income, which is ~zero here), so the
 * household tax schedule must see ADULT-ONLY benefits and ADULT-ONLY back
 * pay. estimateAnnualSSBenefits above keeps the family-total cashflow view.
 *
 * Returns { adultBenefits, backPay }:
 *   adultBenefits — per projection year, adult-only regular benefits.
 *   backPay — null, or the adult share of the SSDI back-pay lump for the
 *     receipt year (approval + 2). The kids' auxiliary back pay never
 *     appears here. C3 (remediation 2026-06-10): the taxable amount is the
 *     GROSS adult share — SSA-1099 box 5 reports benefits BEFORE the
 *     withheld attorney fee, and the fee is a nondeductible misc itemized
 *     expense post-TCJA. Fields:
 *       receiptYearIdx     — projection year containing approval + 2
 *       adultGross         — backPayMonths × ssdiPersonal (gross of fee)
 *       currentYearAlloc   — portion attributable to receipt-year months
 *       priorAllocations   — [{ yearIdx, amount }] for earlier years; yearIdx
 *                            may be NEGATIVE (months before the projection),
 *                            which buildTaxSchedule proxies with current-year
 *                            income (see the §86(e) block there)
 */
export function estimateAnnualTaxableSSBenefits(s) {
  const core = estimateAnnualSSBenefitsCore(s);
  return { adultBenefits: core.adultBenefits, backPay: core.backPay };
}

function estimateAnnualSSBenefitsCore(s) {
  const useSS = s.ssType === 'ss';
  const chadJob = s.chadJob || false;
  const months = s.totalProjectionMonths || 72;
  const years = Math.ceil((months + 1) / 12);
  const familyBenefits = new Array(years).fill(0);
  // C6: adult-only view for the parents' tax return (kids' aux excluded).
  const adultBenefits = new Array(years).fill(0);
  const ssStart = s.ssStartMonth ?? 18;
  const ssKidsOut = s.ssKidsAgeOutMonths ?? 18;
  const kidsOut = s.kidsAgeOutMonths || 0;
  const chadRetirementMonth = s.chadRetirementMonth || 72;
  // Same gate as projection.js: SS retirement, denial, or active job → no SSDI.
  const effectiveSsdiApproval = (useSS || chadJob) ? 999 : (s.ssdiDenied ? 999 : (s.ssdiApprovalMonth ?? 7));
  const ssFamilyTotal = s.ssFamilyTotal || 7099;
  const ssPersonal = s.ssPersonal || 2933;
  const ssdiApproval = s.ssdiApprovalMonth ?? 7;

  for (let m = 0; m <= months; m++) {
    let benefit = 0;
    let adultBenefit = 0;
    if (useSS) {
      if (m >= ssStart) {
        benefit = (m < ssStart + ssKidsOut) ? ssFamilyTotal : ssPersonal;
        adultBenefit = ssPersonal;
      }
    } else if (!chadJob && m >= effectiveSsdiApproval) {
      // Calendar-anchored kids age-out, matching projection.js FIX #8.
      // B4 (2026-06-10): student-rule end month, mirroring projection.js.
      benefit = (m < SS_CHILD_BENEFIT_END_MONTH) ? (s.ssdiFamilyTotal || 0) : (s.ssdiPersonal || 0);
      adultBenefit = s.ssdiPersonal || 0;
    }
    // Post-job benefit fallback — mirrors projection.js's postJobBenefit branch.
    if (benefit === 0 && chadJob && m > chadRetirementMonth) {
      const postJobMode = s.postJobBenefit || 'ssRetirement';
      if (postJobMode === 'ssRetirement') {
        const claimAge = s.ssClaimAge || 67;
        const ssAnchorStartMonth = (claimAge - 62) * 12 + SS_START_OFFSET;
        if (m >= ssAnchorStartMonth) {
          const piaForFallback = s.ssPIA || 0;
          benefit = piaForFallback > 0
            ? Math.round(piaForFallback * ssAdjustmentFactor(claimAge))
            : ssPersonal;
          adultBenefit = benefit;
        }
      } else if (postJobMode === 'ssdi') {
        // B4 (2026-06-10): student-rule end month, mirroring projection.js.
        benefit = (m < SS_CHILD_BENEFIT_END_MONTH) ? (s.ssdiFamilyTotal || 0) : (s.ssdiPersonal || 0);
        adultBenefit = s.ssdiPersonal || 0;
      }
      // 'none' — benefit stays 0
    }
    // The adult share can never exceed what is actually paid (e.g. a family
    // total configured below the personal benefit).
    adultBenefit = Math.min(adultBenefit, benefit);
    // A2 (2026-06-10): mirror projection.js's SS COLA so the tax schedule sees
    // the same nominal benefit amounts (gated on expense inflation, like the engine).
    if (benefit > 0 && s.expenseInflation) {
      const colaFactor = Math.pow(1 + (s.ssColaRate ?? 2.5) / 100, m / 12);
      benefit = Math.round(benefit * colaFactor);
      adultBenefit = Math.round(adultBenefit * colaFactor);
    }
    const yearIdx = Math.floor(m / 12);
    familyBenefits[yearIdx] += benefit;
    adultBenefits[yearIdx] += adultBenefit;
  }

  // FIX #4: Add SSDI back-pay to the calendar year containing approval+2.
  // Re-derive backPayActual the same way projection.js does (in case the caller
  // hasn't already attached it to state).
  let backPay = null;
  if (!useSS && !chadJob && !s.ssdiDenied && (s.ssdiBackPayMonths || 0) > 0) {
    const totalBackPayMonths = s.ssdiBackPayMonths || 0;
    const auxBackPayMonths = Math.min(totalBackPayMonths, kidsOut);
    const ssdiPersonal = s.ssdiPersonal || 4214;
    const ssdiFamilyTotal = s.ssdiFamilyTotal || 6321;
    const adultBackPayGross = totalBackPayMonths * ssdiPersonal;
    const auxBackPayGross = auxBackPayMonths * Math.max(0, ssdiFamilyTotal - ssdiPersonal);
    const backPayFee = Math.min(Math.round(adultBackPayGross * 0.25), SSDI_ATTORNEY_FEE_CAP);
    const backPayActual = adultBackPayGross + auxBackPayGross - backPayFee;
    const receiptMonth = ssdiApproval + 2;
    const receiptYearIdx = Math.floor(receiptMonth / 12);
    if (receiptYearIdx >= 0 && receiptYearIdx < years) {
      familyBenefits[receiptYearIdx] += backPayActual;
      // C6: the parents' return sees the ADULT share only (the kids' aux back
      // pay is the kids' income). C3: GROSS of the withheld attorney fee.
      // b-10: allocate the covered months (the backPayMonths immediately
      // preceding approval) to projection years for the §86(e) election —
      // flat ssdiPersonal per month, matching how the lump itself is built.
      const allocByYear = new Map();
      let currentYearAlloc = 0;
      for (let mm = ssdiApproval - totalBackPayMonths; mm < ssdiApproval; mm++) {
        const allocYear = Math.floor(mm / 12);
        if (allocYear === receiptYearIdx) {
          currentYearAlloc += ssdiPersonal;
        } else {
          allocByYear.set(allocYear, (allocByYear.get(allocYear) || 0) + ssdiPersonal);
        }
      }
      backPay = {
        receiptYearIdx,
        adultGross: adultBackPayGross,
        currentYearAlloc,
        priorAllocations: [...allocByYear.entries()]
          .map(([yearIdx, amount]) => ({ yearIdx, amount }))
          .sort((a, b) => a.yearIdx - b.yearIdx),
      };
    }
  }

  return { familyBenefits, adultBenefits, backPay };
}

/**
 * Pre-compute per-year tax results for the entire projection.
 *
 * For each projection year:
 *   1. Sum Sarah's monthly gross across 12 months, apply expense ratio → Sch C net
 *   2. Determine Chad's W-2 wages (pro-rated if partial year)
 *   3. Call calculateTax() for full household, then again with schCNet=0
 *   4. Sarah's attributed tax = full - w2Only (marginal method)
 *
 * Returns an array indexed by year, each with monthly tax amounts.
 *
 * PROJECTION-YEAR vs CALENDAR-TAX-YEAR WINDOW: projection month 0 is March
 * 2026 (PROJECTION_START_MONTH), so "year y" here spans projection months
 * [y*12 .. y*12+11] = March (2026+y) through February (2027+y). Each window
 * is approximated as the calendar tax year 2026+y when selecting brackets
 * and the SALT cap (`calendarYear = 2026 + y` below). The two months of
 * Jan–Feb skew are accepted: incomes/deductions change smoothly enough that
 * a 10-of-12-month overlap keeps the annual tax estimate within tolerance,
 * and the projection loop only consumes per-month averages.
 *
 * Note: inflation adjustment applies to brackets and to user-entered
 * deduction amounts. The SALT cap follows the OBBBA statutory schedule only
 * (getSaltCapForYear — NOT additionally inflated). SS wage base, standard
 * deduction, QBI thresholds, and Medicare thresholds are NOT inflated in
 * this version.
 */
export function buildTaxSchedule(s) {
  const months = s.totalProjectionMonths || 72;
  const years = Math.ceil((months + 1) / 12);
  const expenseRatio = (s.taxSchCExpenseRatio ?? 25) / 100;
  const chadJob = s.chadJob || false;
  const chadJobStartMonth = s.chadJobStartMonth ?? 0;  // matches INITIAL_STATE; chadLevels.js uses the same default
  const chadRetirementMonth = s.chadRetirementMonth || 72;
  const sarahRetirementMonth = s.sarahWorkMonths || 72;
  const chadJobRaisePct = (s.chadJobRaisePct || 0) / 100;
  const chadJobBonusMonth = s.chadJobBonusMonth ?? 8;
  const chadJobBonusProrateFirst = s.chadJobBonusProrateFirst !== false;
  const chadJobRefreshStartMonth = s.chadJobRefreshStartMonth ?? 12;
  // L63 baseline values (chadJobSalary, chadJobBonusPct, chadJobStockRefresh)
  // are pulled per-month via levelAtMonthsWorked() to support promotions.
  const chadJobHireStock = [
    s.chadJobHireStockY1 || 0,
    s.chadJobHireStockY2 || 0,
    s.chadJobHireStockY3 || 0,
    s.chadJobHireStockY4 || 0,
  ];
  const chadJobSignOnCash = s.chadJobSignOnCash || 0;
  // MSFT growth scales each refresh-grant vest's gross dollars (mirrors
  // projection.js so tax engine W-2 stock numbers match cashflow). Multiplier
  // is from issue → vest, so a $50K grant in year 3 has fewer shares than
  // the same $50K grant in year 1.
  const msftGrowthPct = s.msftGrowth || 0;
  const msftMultIssueToVest = (issueMonth, vestMonth) => Math.pow(1 + msftGrowthPct / 100, (vestMonth - issueMonth) / 12);
  // FIX #1: Pull NoFICA + pension contrib pct so we can flow them into the tax engine.
  const chadJobNoFICA = !!s.chadJobNoFICA;
  const chadJobPensionContribPct = (s.chadJobPensionContrib || 0) / 100;
  // Age-65 RSU vest continuation — kept in sync with projection.js. When applies=true,
  // refresh grants issued before retirement keep vesting (and adding to W-2) post-retirement.
  const age65Vest = age65VestEligibility(s, chadRetirementMonth);
  // 401(k): pre-tax deferral reduces W-2 wages reported on Box 1. Roth catch-up does NOT.
  // Gated by master toggle chadJob401kEnabled — matches projection.js semantics.
  const chadJob401kEnabled = !!s.chadJob401kEnabled;
  const chadJob401kDeferralAnnual = chadJob401kEnabled ? (s.chadJob401kDeferral || 0) : 0;
  // 6.1 (remediation 2026-06-10, improvement a-2): SEHI premium = the SAME
  // family private premium that employer coverage replaces
  // (chadJobHealthSavings, $/mo — one source of truth with projection.js's
  // expense offset, including its `|| 4200` default convention). A month has
  // employer coverage when the projection's offset condition holds
  // (chadJob && m >= chadJobStartMonth — no retirement boundary, matching
  // projection.js); every OTHER month's premium is §162(l)-eligible.
  const sehiPremiumMonthly = s.chadJobHealthSavings || 4200;
  const hasEmployerCoverage = (m) => chadJob && m >= chadJobStartMonth;
  // C6 (remediation 2026-06-10): the tax schedule consumes the ADULT-ONLY
  // benefit estimate (Pub 915: kids' auxiliary benefits and kids' back pay
  // are the kids' income, never the parents'). The family-total view remains
  // available via estimateAnnualSSBenefits for cashflow parity.
  const ssTaxable = estimateAnnualTaxableSSBenefits(s);
  // C3: the receipt year carries the GROSS adult back pay (SSA-1099 box 5).
  const ssAnnualBenefits = ssTaxable.adultBenefits.map((adult, y) =>
    adult + (ssTaxable.backPay && ssTaxable.backPay.receiptYearIdx === y
      ? ssTaxable.backPay.adultGross
      : 0));

  // b-10 (remediation 2026-06-10): IRC §86(e) lump-sum election. In the
  // back-pay receipt year the taxpayer may compute the taxable amount of the
  // portion attributable to EARLIER years using those years' provisional
  // income, and include only the resulting increments this year. We compute
  // both treatments and tax the minimum (the election can never raise tax —
  // if it would, it simply isn't elected). Earlier years that precede the
  // projection window (negative yearIdx) have no modeled income history, so
  // they are proxied with the receipt year's other-AGI — a conservative
  // stand-in (this household's pre-projection MSFT W-2 income was at least
  // as high), which makes the election win only on genuinely-modeled
  // low-income prior years.
  const applyLumpSumElection = (baseInputs, y, otherAGIHistory) => {
    const standard = calculateTax(baseInputs);
    const bp = ssTaxable.backPay;
    if (!bp || bp.receiptYearIdx !== y) return { result: standard, lumpSum: null };
    const regularAdult = ssTaxable.adultBenefits[y] || 0;
    const otherAGI = standard.agi - standard.ssTaxableIncome;
    const taxableStandard = standard.ssTaxableIncome;
    // Current-year piece: regular benefits + back pay attributable to THIS year.
    let taxableElection = computeSSTaxableAmount(regularAdult + bp.currentYearAlloc, otherAGI);
    // Prior-year increments, each against that year's own income.
    for (const { yearIdx, amount } of bp.priorAllocations) {
      const priorBenefit = yearIdx >= 0 ? (ssTaxable.adultBenefits[yearIdx] || 0) : 0;
      const priorOtherAGI = (yearIdx >= 0 && otherAGIHistory[yearIdx] !== undefined)
        ? otherAGIHistory[yearIdx]
        : otherAGI; // pre-projection proxy (see note above)
      taxableElection += computeSSTaxableAmount(priorBenefit + amount, priorOtherAGI)
        - computeSSTaxableAmount(priorBenefit, priorOtherAGI);
    }
    const lumpSum = {
      backPayGross: bp.adultGross,
      taxableStandard,
      taxableElection,
      electionApplied: taxableElection < taxableStandard,
    };
    if (!lumpSum.electionApplied) return { result: standard, lumpSum };
    const elected = calculateTax({ ...baseInputs, ssTaxableOverride: taxableElection });
    return { result: elected, lumpSum };
  };
  // Per-year other-AGI histories (one per attribution path) feed the
  // election's prior-year computations.
  const fullOtherAGIHistory = [];
  const w2OnlyOtherAGIHistory = [];
  const schedule = [];

  for (let y = 0; y < years; y++) {
    const startMonth = y * 12;
    const endMonth = Math.min(startMonth + 11, months);
    const monthsInYear = endMonth - startMonth + 1;

    // Sum Sarah's actual monthly gross for this year
    let annualSarahGross = 0;
    let chadMonthsEmployed = 0;
    let chadAnnualSalary = 0;
    let chadAnnualBonus = 0;
    let chadAnnualStock = 0;
    let chadAnnualSignOn = 0;
    // A4 (remediation 2026-06-10): legacy MSFT vests (VEST_SHARES, through
    // Aug 2028) are W-2 + FICA wages in the vest year REGARDLESS of
    // employment — post-separation RSU vests still hit Box 1/3/5. Mirrors
    // projection.js's getVestingMonthly cashflow (same growth/price inputs)
    // but at GROSS (pre-withholding) dollars, which is what tax law sees.
    let chadLegacyVestGross = 0;
    // 6.1: months this year WITHOUT employer coverage (SEHI-eligible).
    let sehiMonths = 0;

    for (let m = startMonth; m <= endMonth; m++) {
      chadLegacyVestGross += getVestingGrossMonthly(m, msftGrowthPct, s.msftPrice);
      if (!hasEmployerCoverage(m)) sehiMonths++;
      if (m <= sarahRetirementMonth) {
        const rate = Math.min(
          s.sarahRate * Math.pow(1 + s.sarahRateGrowth / 100, m / 12),
          s.sarahMaxRate
        );
        const clients = Math.min(
          s.sarahCurrentClients * Math.pow(1 + s.sarahClientGrowth / 100, m / 12),
          s.sarahMaxClients
        );
        annualSarahGross += Math.round(rate * clients * DAYS_PER_MONTH);
      }

      const inWorkWindow = chadJob && m >= chadJobStartMonth && m <= chadRetirementMonth;
      const inVestContinuation = chadJob && m > chadRetirementMonth && age65Vest.applies;
      if (inWorkWindow) {
        chadMonthsEmployed++;
        const monthsWorked = m - chadJobStartMonth;
        const lvl = levelAtMonthsWorked(monthsWorked, s);
        // Math.floor: raises step on each anniversary of the current level
        // (matches projection.js semantics for pre-promotion years).
        const yearsAtCurrentLevel = Math.floor((monthsWorked - lvl.promoMonthsWorked) / 12);
        const annualSalaryCurr = lvl.salary * Math.pow(1 + chadJobRaisePct, yearsAtCurrentLevel);
        chadAnnualSalary += annualSalaryCurr / 12;

        // Lump-sum bonus paid in configured calendar month — uses level's bonus pct
        const calendarMonthOfYear = (m + PROJECTION_START_MONTH) % 12;
        if (lvl.bonusPct > 0 && monthsWorked > 0 && calendarMonthOfYear === chadJobBonusMonth) {
          let bonusFraction;
          if (monthsWorked >= 12) bonusFraction = 1;
          else if (chadJobBonusProrateFirst) bonusFraction = monthsWorked / 12;
          else bonusFraction = 0;
          chadAnnualBonus += annualSalaryCurr * lvl.bonusPct * bonusFraction;
        }

        // Stock comp — lumpy events sum into the calendar year they occur in.
        // Refresh: ALWAYS issued end-of-August (MSFT review cycle). First refresh
        // = first August at or after chadJobStartMonth + chadJobRefreshStartMonth.
        // Grant size locked at issuance month.
        if (isStockVestMonth(m)) {
          const firstRefreshIssue = firstAugustAtOrAfter(chadJobStartMonth + chadJobRefreshStartMonth);
          for (let g = 0; ; g++) {
            const issueMonth = firstRefreshIssue + 12 * g;
            if (issueMonth >= m) break;
            const grantSize = levelAtMonthsWorked(issueMonth - chadJobStartMonth, s).refresh;
            if (grantSize <= 0) continue;
            const firstVest = nextStockVestMonthAfter(issueMonth);
            if (m < firstVest) continue;
            const vestIdx = (m - firstVest) / 3;
            if (vestIdx >= 0 && vestIdx < 20) {
              chadAnnualStock += grantSize * 0.05 * msftMultIssueToVest(issueMonth, m);
            }
          }
        }
        // Hire stock: lump on each work anniversary. Y1-Y4 sliders are
        // dollars-at-hire; vests appreciate with msftGrowth from hire month.
        if (monthsWorked > 0 && monthsWorked % 12 === 0) {
          const yearIdx = monthsWorked / 12 - 1;
          if (yearIdx >= 0 && yearIdx < 4) {
            chadAnnualStock += chadJobHireStock[yearIdx] * msftMultIssueToVest(chadJobStartMonth, m);
          }
        }
        // Cash sign-on: 50% on hire date, 50% on 1-yr anniversary
        if (chadJobSignOnCash > 0) {
          if (monthsWorked === 0 || monthsWorked === 12) {
            chadAnnualSignOn += chadJobSignOnCash * 0.5;
          }
        }
      } else if (inVestContinuation && isStockVestMonth(m)) {
        // Post-retirement RSU vest continuation with 1-year cliff: grants
        // issued within 12 months of retirement are forfeited. Mirrors
        // projection.js for tax-engine consistency.
        const firstRefreshIssue = firstAugustAtOrAfter(chadJobStartMonth + chadJobRefreshStartMonth);
        for (let g = 0; ; g++) {
          const issueMonth = firstRefreshIssue + 12 * g;
          if (issueMonth >= m) break;
          if (issueMonth > chadRetirementMonth) break;
          if (!clearsOneYearCliff(issueMonth, chadRetirementMonth)) continue;
          const grantSize = levelAtMonthsWorked(issueMonth - chadJobStartMonth, s).refresh;
          if (grantSize <= 0) continue;
          const firstVest = nextStockVestMonthAfter(issueMonth);
          if (m < firstVest) continue;
          const vestIdx = (m - firstVest) / 3;
          if (vestIdx >= 0 && vestIdx < 20) {
            chadAnnualStock += grantSize * 0.05 * msftMultIssueToVest(issueMonth, m);
          }
        }
      }
    }

    // Pro-rate salary to 12 months if partial year (last year of projection).
    // Bonus and stock are discrete events — don't annualize.
    if (monthsInYear < 12) {
      annualSarahGross = Math.round(annualSarahGross * 12 / monthsInYear);
      if (chadMonthsEmployed > 0) {
        chadAnnualSalary = chadAnnualSalary * 12 / monthsInYear;
      }
    }

    // Sch C net after business expenses
    const schCNet = Math.round(annualSarahGross * (1 - expenseRatio));

    // 6.1: eligible SEHI premiums this tax year. Partial final years are
    // annualized by the uncovered-month FRACTION (sehiMonths/monthsInYear ×
    // 12 × premium) so the premium basis matches the annualized Sarah gross
    // above — a 1-month trailing year with no coverage deducts a full year's
    // premium against a full-year-equivalent Sch C.
    const sehiPremiums = monthsInYear > 0
      ? Math.round(sehiPremiumMonthly * 12 * (sehiMonths / monthsInYear))
      : 0;

    // Chad's W-2 wages (salary + bonus + RSU vesting + sign-on, with compounded raises).
    // A4: legacy MSFT vest gross stacks on top UNCONDITIONALLY (W-2 wages in the
    // vest year even with no job) — into BOTH the Box 1 gross and the FICA base.
    const chadJobCompGross = chadJob ? Math.round(chadAnnualSalary + chadAnnualBonus + chadAnnualStock + chadAnnualSignOn) : 0;
    const chadW2Gross = chadJobCompGross + chadLegacyVestGross;

    // FIX #1: Pension contribution is pre-tax for both federal income tax AND FICA.
    // Reduce taxable W-2 wages by (annual salary × pension %). Pension is on salary
    // only (not bonus/RSU/sign-on), matching projection.js's chadJobSalaryNetMult.
    // FIX #M2: chadJobHealthSavings is intentionally NOT subtracted here. Re-read of
    // projection.js (lines 96, 304-306) confirms it is a premium-savings expense
    // OFFSET (employer pays more of the premium so household expenses are lower);
    // it is NOT an employee pre-tax HSA contribution, so it does not reduce W-2
    // taxable wages. If it ever becomes a true pre-tax HSA contribution, subtract
    // it from chadW2 here.
    const pensionDollar = chadJob ? Math.round(chadAnnualSalary * chadJobPensionContribPct) : 0;
    // 401(k): pre-tax deferral reduces W-2 wages reported on Box 1. Pro-rate by
    // months actually worked this projection year (so a half-year doesn't get the full annual deferral).
    const chad401kDeferralDollar = chadJob && chadMonthsEmployed > 0
      ? Math.round(chadJob401kDeferralAnnual * (chadMonthsEmployed / 12))
      : 0;
    // BUG #2: chadW2 is the INCOME-TAX base (Box 1) — reduced by pre-tax pension AND
    // pre-tax 401(k). chadW2FicaBase is the FICA base (Box 3/5) — full gross. Pre-tax
    // pension and 401(k) deferral DO NOT reduce SS/Medicare wages.
    const chadW2 = Math.max(0, chadW2Gross - pensionDollar - chad401kDeferralDollar);
    // A4: FICA base (Box 3/5) = full gross including legacy vests, on every path.
    const chadW2FicaBase = chadW2Gross;

    // Inflation-adjusted brackets and SALT cap
    const inflationFactor = s.taxInflationAdjust
      ? Math.pow(1 + (s.taxInflationRate || 2) / 100, y)
      : 1;
    // Calendar year ≈ 2026 + yearIndex (projection starts ~2026)
    const calendarYear = 2026 + y;
    // SALT cap: the OBBBA statutory schedule ALREADY steps the cap year-by-year
    // (+1%/yr through 2029, reversion after), so it must NOT be multiplied by the
    // user's inflation factor — that double-counted inflation when
    // taxInflationAdjust was on (remediation 2026-06-09 Phase 4).
    const saltCap = getSaltCapForYear(calendarYear);
    // C8 (remediation 2026-06-10 Phase 0): the phase-down MAGI threshold is ALSO
    // OBBBA-scheduled (+1%/yr; $505,000 for 2026) — same no-double-inflation rule.
    const saltThreshold = getSaltThresholdForYear(calendarYear);
    // Inflate bracket thresholds so income doesn't creep into higher brackets
    const inflatedBrackets = inflationFactor > 1
      ? inflateBrackets(BRACKETS_MFJ_2026, inflationFactor)
      : null;
    // C4: LTCG breakpoints index the same way as the ordinary brackets.
    const inflatedLtcgBrackets = inflationFactor > 1
      ? inflateBrackets(LTCG_BRACKETS_MFJ_2026, inflationFactor)
      : null;
    // C5: §63(c)(4) indexes the standard deduction annually — move it with
    // the brackets when taxInflationAdjust is on (previously only the
    // brackets and user-entered deduction amounts grew, silently costing
    // ~$715/yr of phantom tax by year 6).
    const inflatedStdDeduction = inflationFactor > 1
      ? Math.round(STD_DED * inflationFactor)
      : null;

    const taxInputs = getTaxInputs(s, y);

    // FIX #M3: CTC drops once twins age out. Per the project's canonical
    // TWINS_AGE_OUT_MONTH (last month of SS-auxiliary eligibility), we treat
    // years whose end-month reaches that boundary as ineligible for CTC.
    // (Strictly the IRS test is "under 17 at end of tax year", which would
    // cut a year earlier; using TWINS_AGE_OUT_MONTH matches the project's
    // single source of truth and the spec's worked example.)
    const ctcChildrenForYear = (endMonth < TWINS_AGE_OUT_MONTH) ? taxInputs.ctcChildren : 0;

    // Full household tax (Sarah + Chad) — b-10: §86(e)-aware in the
    // back-pay receipt year.
    const fullRun = applyLumpSumElection({
      w2Wages: chadW2,
      w2FicaBase: chadW2FicaBase, // BUG #2: full gross for FICA, reduced w2Wages for income tax
      w2Withholding: taxInputs.w2Withholding,
      schCNet,
      capGainLoss: taxInputs.capGainLoss,
      propertyTax: taxInputs.propertyTax,
      salesTax: taxInputs.salesTax,
      personalPropTax: taxInputs.personalPropTax,
      mortgageInt: taxInputs.mortgageInt,
      charitable: taxInputs.charitable,
      totalMedicalInput: taxInputs.totalMedicalInput,
      ctcChildren: ctcChildrenForYear,
      odcDependents: taxInputs.odcDependents,
      solo401kContribution: taxInputs.solo401kContribution,
      sehiPremiums, // 6.1: §162(l) SEHI for non-employer-coverage months
      ssBenefitAnnual: ssAnnualBenefits[y] || 0,
      saltCap,
      saltThreshold,
      brackets: inflatedBrackets,
      ltcgBrackets: inflatedLtcgBrackets, // C4
      stdDeduction: inflatedStdDeduction, // C5
      noFICA: chadJobNoFICA, // FIX #1
    }, y, fullOtherAGIHistory);
    const fullTax = fullRun.result;

    // W-2 only tax (for marginal attribution — what would tax be without
    // Sarah?). b-10: the counterfactual elects independently on its own
    // income history so the attribution split stays internally consistent.
    const w2Run = applyLumpSumElection({
      w2Wages: chadW2,
      w2FicaBase: chadW2FicaBase, // BUG #2: full gross for FICA, reduced w2Wages for income tax
      w2Withholding: taxInputs.w2Withholding,
      schCNet: 0,
      capGainLoss: taxInputs.capGainLoss,
      propertyTax: taxInputs.propertyTax,
      salesTax: taxInputs.salesTax,
      personalPropTax: taxInputs.personalPropTax,
      mortgageInt: taxInputs.mortgageInt,
      charitable: taxInputs.charitable,
      totalMedicalInput: taxInputs.totalMedicalInput,
      ctcChildren: ctcChildrenForYear,
      odcDependents: taxInputs.odcDependents,
      solo401kContribution: 0, // No Solo 401(k) without self-employment
      sehiPremiums, // 6.1: passed for symmetry — schCNet=0 caps the deduction at 0, so the SEHI benefit attributes to Sarah
      ssBenefitAnnual: ssAnnualBenefits[y] || 0, // FIX RA-1: include SS in counterfactual to avoid attribution drift
      saltCap,
      saltThreshold,
      brackets: inflatedBrackets,
      ltcgBrackets: inflatedLtcgBrackets, // C4
      stdDeduction: inflatedStdDeduction, // C5
      noFICA: chadJobNoFICA, // FIX #1
    }, y, w2OnlyOtherAGIHistory);
    const w2OnlyTax = w2Run.result;

    // b-10: record this year's non-SS AGI for later receipt years.
    fullOtherAGIHistory.push(fullTax.agi - fullTax.ssTaxableIncome);
    w2OnlyOtherAGIHistory.push(w2OnlyTax.agi - w2OnlyTax.ssTaxableIncome);

    // Marginal attribution
    const sarahAnnualTax = Math.max(0, fullTax.totalTax - w2OnlyTax.totalTax);
    const chadAnnualTax = w2OnlyTax.totalTax;

    // Chad-only FICA actually PAID this year (additional Medicare is withheld, so use
    // the gross amount, not the return-net "owed"). Shared by the W-2 diagnostic breakdown.
    const chadAddlMedicarePaid = computeAdditionalMedicare({ w2Wages: chadW2FicaBase, seBase: 0 }).addlMedicare;
    const chadFicaTotalPaid = w2OnlyTax.w2FicaSS + w2OnlyTax.w2FicaMedicare + chadAddlMedicarePaid;

    // Sarah's effective rate on gross revenue (combined expenses + tax burden)
    const sarahEffectiveOnGross = annualSarahGross > 0
      ? (annualSarahGross * expenseRatio + sarahAnnualTax) / annualSarahGross
      : 0;

    schedule.push({
      // Monthly amounts for the projection loop
      sarahMonthlyTax: Math.round(sarahAnnualTax / 12),
      chadMonthlyTax: chadW2 > 0 ? Math.round(chadAnnualTax / 12) : 0,
      chadMonthlyNet: chadW2 > 0 ? Math.round((chadW2 - chadAnnualTax) / 12) : 0,

      // Rates for display
      effectiveTaxRate: fullTax.effectiveRate,
      marginalRate: fullTax.marginalRate,
      sarahEffectiveOnGross,
      chadEffectiveRate: chadW2 > 0 ? chadAnnualTax / chadW2 : 0,

      // Annual totals for tax tab display
      annualTotalTax: fullTax.totalTax,
      annualSarahTax: sarahAnnualTax,
      annualChadTax: chadAnnualTax,

      // Chad-only tax components (from the W-2-only counterfactual) so the W-2 Net
      // Diagnostic can show a REAL federal/FICA split instead of a flat-rate guess.
      // ALL on the same year-0 gross (chadW2FicaBase) so FICA + federal reconcile.
      // ficaAddlMedicare is the amount PAID (withheld), not the return-net "owed".
      chadW2OnlyTax: {
        ficaBase: chadW2FicaBase,               // gross W-2 wages (Box 3/5) this year
        ficaSS: w2OnlyTax.w2FicaSS,             // min(gross, wage base) × 6.2% (0 if noFICA)
        ficaMedicare: w2OnlyTax.w2FicaMedicare, // gross × 1.45%
        ficaAddlMedicare: chadAddlMedicarePaid, // (gross − $250k)₊ × 0.9% (withheld)
        ficaTotal: chadFicaTotalPaid,           // SS + Medicare + additional Medicare
        fedTax: Math.max(0, w2OnlyTax.fedTax - w2OnlyTax.totalCredits), // income tax after credits
        totalTax: w2OnlyTax.totalTax,
      },
      annualSarahGross,
      schCNet,
      chadW2,           // FIX #1: W-2 wages AFTER pension + 401(k) deferral reduction (taxable)
      chadW2Gross,      // FIX #1: W-2 wages BEFORE pension reduction (for display)
      chadPensionDollar: pensionDollar, // FIX #1: pre-tax pension dollar amount this year
      chad401kDeferralDollar, // 401(k): pre-tax deferral dollars this year (already prorated)
      ctcChildrenForYear, // FIX #M3: CTC kids actually used this year
      sehiPremiums,       // 6.1: eligible §162(l) premiums this year (deducted amount = fullTax.sehi)
      noFICA: chadJobNoFICA, // FIX #1

      // C3/b-10: §86(e) lump-sum election detail for the back-pay receipt
      // year (null elsewhere): { backPayGross, taxableStandard,
      // taxableElection, electionApplied } — fullTax already reflects the
      // winning (minimum) treatment.
      ssLumpSum: fullRun.lumpSum,

      // Full engine results for detailed display
      fullTax,
    });
  }

  return schedule;
}
