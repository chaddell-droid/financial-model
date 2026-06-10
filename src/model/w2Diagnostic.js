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
 *   - refreshSteadyMult assumes 5 grants in flight (each vesting 20%/yr × 5 yrs).
 *     Time-weighted mean MSFT growth multiplier across all 5 grants ≈
 *     mean of (1+g)^(k − 0.5) for k = 1..5. With g=0 this collapses to 1.
 *   - Hire stock Y1-Y4 vest on anniversaries; each scaled by (1+g)^n
 *     (engine: projection.js:253 via msftMultIssueToVest).
 */
import { computeW2EmployeeFica, computeAdditionalMedicare } from './taxEngine.js';

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
  const chadJobHireStockY1 = state.chadJobHireStockY1 || 0;
  const chadJobHireStockY2 = state.chadJobHireStockY2 || 0;
  const chadJobHireStockY3 = state.chadJobHireStockY3 || 0;
  const chadJobHireStockY4 = state.chadJobHireStockY4 || 0;
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
  const salaryNetMo = Math.round(afterTaxMo - pensionCashflowMo - chadJob401kCatchupRoth / 12);
  const annualSalaryNet = salaryNetMo * 12;

  // ─── Bonus (annual lump) ──────────────────────────────────────────────────
  const bonusGrossYr = effectiveSalary * chadJobBonusPct / 100;
  const bonusNetYr = bonusGrossYr * bonusMult;

  // ─── Refresh RSU steady-state ─────────────────────────────────────────────
  const growth = msftGrowth / 100;
  // 5 grants in flight; time-weighted mean MSFT multiplier across all 5.
  const refreshSteadyMult = growth === 0
    ? 1
    : [0.5, 1.5, 2.5, 3.5, 4.5].reduce((acc, t) => acc + Math.pow(1 + growth, t), 0) / 5;
  const refreshNetYr = chadJobStockRefresh * bonusMult * refreshSteadyMult;

  // ─── Hire stock Y1-Y4 (grown to vest year, taxed, averaged over 4 yrs) ───
  const hireTotalAtHire = chadJobHireStockY1 + chadJobHireStockY2 + chadJobHireStockY3 + chadJobHireStockY4;
  const hireGrownTotal = chadJobHireStockY1 * Math.pow(1 + growth, 1)
                       + chadJobHireStockY2 * Math.pow(1 + growth, 2)
                       + chadJobHireStockY3 * Math.pow(1 + growth, 3)
                       + chadJobHireStockY4 * Math.pow(1 + growth, 4);
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

  // ─── Monthly health benefit equivalent (used by SSDI comparison) ─────────
  const monthlyHealthSavings = effectiveHealthSavings / 12;

  return {
    // Inputs (for transparency in advisor output)
    chadJob,
    chadJobSalary: effectiveSalary,
    chadJobTaxRate: effectiveTaxRate,
    chadJobNoFICA,
    chadJobBonusPct,
    chadJobStockRefresh,
    chadJobRefreshStartMonth,
    chadJobHireStockY1,
    chadJobHireStockY2,
    chadJobHireStockY3,
    chadJobHireStockY4,
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
 * Human-readable explanations of the model assumptions. The advisor can pass
 * these through verbatim so users understand WHY refresh is steady-state.
 */
export const W2_DIAGNOSTIC_NOTES = Object.freeze({
  refreshSteadyState: 'Refresh assumes steady state with 5 grants in flight (each vests 20%/yr over 5 years). MSFT growth is applied as the time-weighted mean across all 5 grants.',
  hireStock: 'Hire stock Y1-Y4 vest on each anniversary. Each tranche is grown by (1+msftGrowth)^n where n = years to vest.',
  bonusMult: 'Bonus and RSU dollars use the same net multiplier as salary: 1 − taxRate (+ 6.2% FICA savings if noFICA toggle is on).',
  pension: 'Pension is deducted separately from the salary mult because FICA still applies on pension dollars (1.45% Medicare-only when noFICA=true, else 7.65%).',
  source: 'Mirrors projection.js exactly. Single source of truth for both the on-screen diagnostic and the advisor tool.',
});
