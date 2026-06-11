/**
 * W-2 Stock Compensation Diagnostic — single source of truth for the
 * steady-state "what does Chad's MSFT comp look like?" projection.
 *
 * This helper is consumed by:
 *   - src/panels/IncomeControls.jsx  (the on-screen W-2 Net Diagnostic)
 *   - src/advisor/tools.js           (the advisor `getStockCompProjection` tool)
 *
 * Formulas mirror src/model/projection.js exactly. Any drift is a display-parity
 * bug per CLAUDE.md. Keep this in sync with projection.js when comp logic moves.
 *
 * Inputs come straight off the gathered state (same field names). Outputs are
 * raw numbers — callers do their own rounding/formatting.
 *
 * Notes on the model:
 *   - salaryMult / bonusMult exclude pension; pension is subtracted separately
 *     with its own cashflow mult (mirrors projection.js:108, 112).
 *   - refreshSteadyMult assumes 5 grants in flight (each vesting 5%/quarter ×
 *     20 quarters). C17 (remediation 2026-06-10, item 5.4): EXACT 20-quarter
 *     mean of (1+g)^(k/4) for k = 1..20 — matches the engine's quarterly vest
 *     ages 0.25..5.0 yrs (the old annual-midpoint mean of (1+g)^(0.5..4.5) ran
 *     ~1.23% low at g=10%). With g=0 this collapses to 1.
 *   - Hire stock (2026-06-10): chadJobHireStockTotal vests 25% at month 12,
 *     then 6.25% every 3 months through month 48 (HIRE_VEST_TRANCHES in
 *     vesting.js — the engine's single source of truth). Each tranche is
 *     scaled by (1+g)^(months/12); the steady-state mean across all 13
 *     tranches comes from hireVestGrowthWeightedMean.
 */
import { computeW2EmployeeFica, computeAdditionalMedicare } from './taxEngine.js';
import { hireVestGrowthWeightedMean } from './vesting.js';
import { SS_EARNINGS_LIMIT_ANNUAL, SS_EARNINGS_LIMIT_FRA_YEAR } from './constants.js';

/**
 * Compute the W-2 steady-state diagnostic from gathered state.
 * Returns ALL intermediate values so both UI and advisor can surface them.
 *
 * @param {object} state - gathered household state (must include W-2 fields).
 * @returns {object} diagnostic - never throws; finite-or-zero numbers throughout.
 */
export function computeW2Diagnostic(state) {
  // ─── Resolve inputs with the same defaults as IncomeControls ──────────────
  const chadJob = !!state.chadJob;
  const effectiveSalary = state.chadJobSalary || 80000;
  const effectiveTaxRate = state.chadJobTaxRate ?? 25;
  const effectiveHealthSavings = state.chadJobHealthSavings ?? 4200;
  const chadJobNoFICA = !!state.chadJobNoFICA;
  const chadJobBonusPct = state.chadJobBonusPct || 0;
  const chadJobStockRefresh = state.chadJobStockRefresh || 0;
  const chadJobRefreshStartMonth = state.chadJobRefreshStartMonth ?? 0;
  const chadJobHireStockTotal = state.chadJobHireStockTotal || 0;
  const chadJob401kEnabled = !!state.chadJob401kEnabled;
  const chadJob401kDeferral = chadJob401kEnabled ? (state.chadJob401kDeferral || 0) : 0;
  const chadJob401kCatchupRoth = chadJob401kEnabled ? (state.chadJob401kCatchupRoth || 0) : 0;
  const chadJobPensionContrib = state.chadJobPensionContrib || 0;
  const chadJobSignOnCash = state.chadJobSignOnCash || 0;
  const msftGrowth = state.msftGrowth || 0;

  // ─── Derived multipliers ──────────────────────────────────────────────────
  const ficaSavings = chadJobNoFICA ? 0.062 : 0;
  const pensionContribPct = chadJobPensionContrib / 100;
  const taxRateDec = effectiveTaxRate / 100;
  const salaryMult = 1 - taxRateDec + ficaSavings;
  const bonusMult = 1 - taxRateDec + ficaSavings;
  const ficaRateOnPension = chadJobNoFICA ? 0.0145 : 0.0765;
  const pensionCashflowMult = 1 - taxRateDec + ficaRateOnPension;

  // ─── Salary walk (monthly) ────────────────────────────────────────────────
  const monthlyGross = effectiveSalary / 12;
  const taxableMo = Math.max(0, monthlyGross - chadJob401kDeferral / 12);
  const afterTaxMo = taxableMo * salaryMult;
  const pensionDeductionMo = monthlyGross * pensionContribPct;
  const pensionCashflowMo = pensionDeductionMo * pensionCashflowMult;
  // B6 (remediation 2026-06-10, item 3.5): pre-tax deferrals are still FICA
  // wages (IRC §3121(v)(1)(A)) — add FICA back on the deferral at the same
  // rate the pension uses. Mirrors projection.js exactly.
  const deferralFicaMo = (chadJob401kDeferral / 12) * ficaRateOnPension;
  const salaryNetMo = Math.round(afterTaxMo - pensionCashflowMo - deferralFicaMo - chadJob401kCatchupRoth / 12);
  const annualSalaryNet = salaryNetMo * 12;

  // ─── Bonus (annual lump) ──────────────────────────────────────────────────
  const bonusGrossYr = effectiveSalary * chadJobBonusPct / 100;
  const bonusNetYr = bonusGrossYr * bonusMult;

  // ─── Refresh RSU steady-state ─────────────────────────────────────────────
  const growth = msftGrowth / 100;
  // 5 grants in flight, each vesting in 20 quarterly tranches (vest ages
  // 0.25..5.0 yrs). C17: exact 20-quarter mean of (1+g)^(k/4), k=1..20 —
  // mirrors projection.js's msftMultIssueToVest quarterly vest schedule.
  const refreshSteadyMult = growth === 0
    ? 1
    : Array.from({ length: 20 }, (_, i) => (i + 1) / 4)
        .reduce((acc, t) => acc + Math.pow(1 + growth, t), 0) / 20;
  const refreshNetYr = chadJobStockRefresh * bonusMult * refreshSteadyMult;

  // ─── Hire stock (grown per tranche to vest month, taxed, averaged ÷ 4) ───
  // 2026-06-10 schedule change: 25% at month 12, then 6.25% quarterly through
  // month 48. hireGrownTotal = total × growth-weighted mean across the 13
  // tranches (Σ fᵢ(1+g)^(tᵢ/12) — collapses to total at g=0). The 4-year
  // averaging (÷ 4) is unchanged: the grant still pays out over months 12–48.
  const hireTotalAtHire = chadJobHireStockTotal;
  const hireGrownTotal = chadJobHireStockTotal * hireVestGrowthWeightedMean(msftGrowth);
  const hireNetAvgYr = hireGrownTotal * bonusMult / 4;

  // ─── Sign-on cash (ONE-TIME, non-steady) ──────────────────────────────────
  // Engine (projection.js:261-266): 50% paid on hire month, 50% on 1-yr anniversary,
  // each taxed with the active-employment bonus multiplier. The diagnostic surfaces
  // the FULL sign-on (both halves) as a one-time line. This is deliberately NOT
  // folded into totalAvgYr/totalAvgMo (those are the recurring steady-state numbers).
  const signOnGross = chadJobSignOnCash;
  const signOnNet = chadJobSignOnCash * bonusMult;

  // ─── Totals ───────────────────────────────────────────────────────────────
  const totalAvgYr = annualSalaryNet + bonusNetYr + refreshNetYr + hireNetAvgYr;
  const totalAvgMo = Math.round(totalAvgYr / 12);
  // Total annual GROSS comp (steady state, excludes one-time sign-on) — the
  // denominator for the net total. Mirrors the components rolled into totalAvgYr
  // ON THE SAME PER-YEAR BASIS: hireNetAvgYr averages the 4 anniversary vests
  // (÷ 4), so the gross counts hireGrownTotal / 4 too (remediation 2026-06-09
  // item 2.2 — previously all four hire years were counted at once, deflating
  // the blended take-home % and inflating the FICA base).
  const totalGrossYr = effectiveSalary + bonusGrossYr + chadJobStockRefresh * refreshSteadyMult + hireGrownTotal / 4;
  // Blended steady-state take-home fraction (net ÷ gross). Guard divide-by-zero.
  const blendedTakeHomePct = totalGrossYr > 0 ? totalAvgYr / totalGrossYr : 0;

  // ─── Real FICA breakdown (traceable, computed by the tax engine) ──────────
  // The flat salary/bonus multiplier above bundles income tax + FICA into one
  // effective rate. FICA itself is exact and depends ONLY on Chad's gross W-2
  // wages (Box 3/5 = steady-state PER-YEAR gross, hire stock averaged ÷ 4,
  // excl. one-time sign-on), so we compute it precisely here via the same
  // functions the Tax tab uses:
  //   SS       = min(gross, SS_WAGE_BASE) × 6.2%   (0 when noFICA employer)
  //   Medicare = gross × 1.45%
  //   Addl Med = (gross − $250k)₊ × 0.9%
  // These are informational — they are NOT folded into the net totals above
  // (those keep the flat-multiplier engine-parity formula).
  const ficaBaseAnnual = totalGrossYr;
  const { ssTax: ficaSocialSecurity, medTax: ficaMedicare, ficaTax: ficaTotal } =
    computeW2EmployeeFica(ficaBaseAnnual, chadJobNoFICA);
  const { addlMedicare: ficaAddlMedicare } =
    computeAdditionalMedicare({ w2Wages: ficaBaseAnnual, seBase: 0 });
  const ficaAllInTotal = ficaTotal + ficaAddlMedicare;
  const ficaEffectivePct = ficaBaseAnnual > 0 ? ficaAllInTotal / ficaBaseAnnual : 0;

  // ─── Monthly health benefit (used by SSDI comparison) ────────────────────
  // chadJobHealthSavings is $/MONTH — the family's actual private-insurance
  // premium that employer coverage replaces ($4,200/mo, user-confirmed
  // 2026-06-10). The engine subtracts it from monthly expenses as-is
  // (projection.js). The 2026-05-16 audit mis-read it as annual and divided
  // by 12 here, understating the benefit 12× vs the projection.
  const monthlyHealthSavings = effectiveHealthSavings;

  return {
    // Inputs (for transparency in advisor output)
    chadJob,
    chadJobSalary: effectiveSalary,
    chadJobTaxRate: effectiveTaxRate,
    chadJobNoFICA,
    chadJobBonusPct,
    chadJobStockRefresh,
    chadJobRefreshStartMonth,
    chadJobHireStockTotal,
    chadJob401kEnabled,
    chadJob401kDeferral,
    chadJob401kCatchupRoth,
    chadJobPensionContrib,
    chadJobSignOnCash,
    msftGrowth,

    // Multipliers
    salaryMult,
    bonusMult,
    pensionCashflowMult,
    refreshSteadyMult,
    // The salary/bonus net mult is a FLAT all-in effective-rate approximation (the
    // single chadJobTaxRate bundles income tax + FICA). This is the user's assumption;
    // multIncomeTaxPct exposes it. The precise federal/FICA/state split comes from the
    // Tax-tab engine (taxEngine.js / taxProjection.js) — surfaced via the real FICA
    // fields below and the chadTaxBreakdown prop threaded into IncomeControls.
    multIncomeTaxPct: effectiveTaxRate,        // the flat all-in effective rate assumption, %

    // Real FICA breakdown (computed by the tax engine on the W-2 gross — traceable)
    ficaBaseAnnual,            // Box 3/5 wages the FICA figures are computed on
    ficaSocialSecurity,        // min(gross, SS_WAGE_BASE) × 6.2% (0 if noFICA employer)
    ficaMedicare,              // gross × 1.45%
    ficaAddlMedicare,          // (gross − $250k)₊ × 0.9%
    ficaTotal,                 // SS + base Medicare (= computeW2EmployeeFica.ficaTax)
    ficaAllInTotal,            // ficaTotal + additional Medicare
    ficaEffectivePct,          // ficaAllInTotal ÷ gross

    // Salary walk
    monthlyGross,
    taxableMo,
    pensionDeductionMo,
    pensionCashflowMo,
    salaryNetMo,
    annualSalaryNet,

    // Bonus
    bonusGrossYr,
    bonusNetYr,

    // Refresh
    refreshGrant: chadJobStockRefresh,
    refreshNetYrSteady: refreshNetYr,

    // Hire stock
    hireTotalAtHire,
    hireGrownTotal,
    hireNetAvgYr,

    // Sign-on cash (one-time, NON-steady — not in totals)
    signOnGross,
    signOnNet,

    // Totals
    totalAvgYr,
    totalAvgMo,
    totalGrossYr,
    blendedTakeHomePct,

    // Health
    monthlyHealthSavings,
  };
}

/**
 * SS earnings-test impact estimate — shared helper for the IncomeControls
 * panel (C10, remediation 2026-06-10 item 5.1).
 *
 * The engine (projection.js) tests TOTAL earned income — salary × (1+bonus%)
 * + projected annual RSU vests (+ sign-on in employment years 0–1) — and
 * applies two statutory tiers: $1 withheld per $2 over the standard exempt
 * amount in pre-FRA calendar years, $1 per $3 over the higher exempt amount
 * inside the FRA calendar year (exempt from the attainment month onward).
 * The panel previously used SALARY ONLY with the standard tier — a
 * display-parity bug.
 *
 * Wage basis here is the STEADY-STATE annual gross W-2 — the same
 * totalGrossYr the W-2 diagnostic shows (salary + bonus + refresh×steadyMult
 * + hire stock averaged ÷ 4; one-time sign-on excluded). The engine's basis
 * is per-year (ramping RSUs, sign-on halves in years 0–1, whole-check
 * withholding order), so this is the representative steady-state estimate
 * for display, not a month-exact reconciliation.
 *
 * @param {object} state - gathered household state (same fields as computeW2Diagnostic).
 * @returns {{annualEarned:number, monthlyReductionStandard:number,
 *            monthlyReductionFraYear:number, limitStandard:number, limitFraYear:number}}
 */
export function estimateEarningsTestImpact(state) {
  const { totalGrossYr } = computeW2Diagnostic(state);
  const annualEarned = totalGrossYr;
  // Statutory limits flow from the Phase-0 SSA table (never hardcoded here).
  const monthlyReductionStandard =
    Math.round(Math.max(0, annualEarned - SS_EARNINGS_LIMIT_ANNUAL) / 2 / 12);
  const monthlyReductionFraYear =
    Math.round(Math.max(0, annualEarned - SS_EARNINGS_LIMIT_FRA_YEAR) / 3 / 12);
  return {
    annualEarned,
    monthlyReductionStandard,
    monthlyReductionFraYear,
    limitStandard: SS_EARNINGS_LIMIT_ANNUAL,
    limitFraYear: SS_EARNINGS_LIMIT_FRA_YEAR,
  };
}

/**
 * Human-readable explanations of the model assumptions. The advisor can pass
 * these through verbatim so users understand WHY refresh is steady-state.
 */
export const W2_DIAGNOSTIC_NOTES = Object.freeze({
  refreshSteadyState: 'Refresh assumes steady state with 5 grants in flight (each vests 20%/yr over 5 years). MSFT growth is applied as the time-weighted mean across all 5 grants.',
  hireStock: 'On-hire stock (one total grant $) vests 25% at month 12 after job start, then 6.25% every 3 months through month 48. Each tranche is grown by (1+msftGrowth)^(months/12) from hire to vest.',
  bonusMult: 'Bonus and RSU dollars use the same net multiplier as salary: 1 − taxRate (+ 6.2% FICA savings if noFICA toggle is on).',
  pension: 'Pension is deducted separately from the salary mult because FICA still applies on pension dollars (1.45% Medicare-only when noFICA=true, else 7.65%).',
  source: 'Mirrors projection.js exactly. Single source of truth for both the on-screen diagnostic and the advisor tool.',
});
