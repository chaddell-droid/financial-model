// Chart/tab prop bundles for FinancialModel — extracted verbatim from
// FinancialModel.jsx (remediation 2026-06-09 Phase 7 file-size rule).
// Every useMemo keeps its original dependency array, so memo identity
// semantics are unchanged: bundles only re-create when the listed model
// values change. Bundles with source-guard contracts locked to
// FinancialModel.jsx (scenarioStripProps' layoutBucket, retirementRailProps,
// the instanceId variants, railPropsMap) intentionally stay in the component.
import { useMemo } from 'react';
import { buildTaxSchedule } from '../model/taxProjection.js';

export function useChartPropBundles({
  state,
  // Projection outputs + derived values computed in FinancialModel
  monthlyDetail, data, savingsData, wealthData, gatheredModelState,
  compareProjections, compareColors,
  sarahCurrentNet, effectiveBaseExpenses, debtTotal,
  lifestyleCuts, cutInHalf, extraCuts, bcsFamilyMonthly, advanceNeeded,
  ssdiBackPayGross, ssdiAttorneyFee, ssdiBackPayActual,
  savingsZeroMonth, savingsZeroLabel, breakevenIdx, totalRemainingVesting,
  // Stable callbacks
  set, handleRunMonteCarlo, stableGatherState,
}) {
  // Same destructure as FinancialModel — the values (not the state object)
  // drive every dependency array below.
  const {
    sarahRate, sarahMaxRate, sarahRateGrowth, sarahCurrentClients, sarahMaxClients, sarahClientGrowth, sarahTaxRate,
    chadWorkMonths,
    msftPrice, msftGrowth,
    ssType, ssdiApprovalMonth, ssdiDenied, ssdiPersonal, ssdiFamilyTotal, kidsAgeOutMonths, chadConsulting,
    ssClaimAge, ssPIA, ssFamilyTotal, ssPersonal, ssStartMonth, ssKidsAgeOutMonths,
    sarahSpousalEnabled, sarahSpousalClaimAge, sarahCurrentAge, sarahOwnSS,
    postJobBenefit,
    twpEnabled, // P8 (2026-06-10, b-1): TWP/EPE module toggle
    chadJob, chadJobSalary, chadJobTaxRate, chadJobStartMonth, chadJobHealthSavings, chadJobNoFICA, chadJobPensionRate, chadJobPensionContrib, chadJobRaisePct, chadJobBonusPct, chadJobBonusMonth, chadJobBonusProrateFirst, chadJobStockRefresh, chadJobRefreshStartMonth, chadJobHireStockTotal, chadJobSignOnCash, chadJob401kEnabled, chadJob401kDeferral, chadJob401kCatchupRoth, chadJob401kMatch,
    chadCurrentAge, chadAge65VestOverride,
    chadL64Enabled, chadL64Month, chadL64Salary, chadL64StockRefresh, chadL64BonusPct,
    chadL65Enabled, chadL65Month, chadL65Salary, chadL65StockRefresh, chadL65BonusPct,
    totalMonthlySpend, debtService, expenseInflation, expenseInflationRate, ssColaRate,
    debts, mortgagePI, mortgageBalance, mortgageRate, // 6.3 (2026-06-10, D5)
    healthPremiumMonthly, medicalTrendRate, ssdiEntitlementMonth, // 6.4 (2026-06-10, D6)
    bcsAnnualTotal, bcsParentsAnnual, bcsYearsLeft,
    collegeCostPerKidMonthly, collegeStartMonth, collegeMonths, college529Balance, // 6.2 (2026-06-10)
    lifestyleCutsApplied, cutsOverride,
    trustIncomeNow, trustIncomeFuture, trustIncreaseMonth,
    vanSold, vanMonthlySavings, vanSalePrice, vanLoanBalance, vanSaleMonth,
    milestones,
    retireDebt,
    startingSavings, investmentReturn,
    taxableReturnDragPct, cashFloorAmount, cashYieldPct, // 6.5/6.6 (2026-06-10, b-11/b-15)
    ssdiBackPayMonths,
    moldCost, moldInclude, roofCost, roofInclude, otherProjects, otherInclude,
    debtCC, debtPersonal, debtIRS, debtFirstmark,
    presentMode,
    starting401k, return401k, homeEquity, homeAppreciation, deficit401kTaxRate,
    mcResults, mcRunning, mcNumSims, mcInvestVol, mcBizGrowthVol, mcMsftVol, mcSsdiDelay, mcSsdiDenialPct, mcCutsDiscipline,
    mcBlockBootstrap,
    seqBadY1, seqBadY2,
    taxMode, taxInflationAdjust, taxInflationRate, taxSchCExpenseRatio,
    taxPropertyTax, taxSalesTax, taxPersonalPropTax, taxMortgageInt,
    taxCharitable, taxMedical, taxW2Withholding, taxCtcChildren,
    taxOdcDependents, taxCapGainLoss, taxSolo401k,
  } = state;

  const bridgeProps = useMemo(() => ({
    monthlyDetail, data,
    sarahCurrentNet, sarahTaxRate, sarahRate, sarahMaxRate, sarahRateGrowth,
    sarahCurrentClients, sarahMaxClients, sarahClientGrowth,
    retireDebt, vanSold, lifestyleCutsApplied,
    ssType, ssdiApprovalMonth, ssdiDenied, ssdiFamilyTotal, chadConsulting,
    ssFamilyTotal, ssStartMonth,
    trustIncomeNow, trustIncomeFuture, trustIncreaseMonth,
    milestones, bcsYearsLeft, bcsFamilyMonthly,
    baseExpenses: effectiveBaseExpenses, debtService, vanMonthlySavings, vanSaleMonth,
    lifestyleCuts, cutInHalf, extraCuts,
    startingSavings, investmentReturn, msftGrowth, msftPrice,
    chadJob, chadJobSalary, chadJobTaxRate, chadJobStartMonth, chadJobHealthSavings,
  }), [
    monthlyDetail, data,
    sarahCurrentNet, sarahTaxRate, sarahRate, sarahMaxRate, sarahRateGrowth,
    sarahCurrentClients, sarahMaxClients, sarahClientGrowth,
    retireDebt, vanSold, lifestyleCutsApplied,
    ssType, ssdiApprovalMonth, ssdiDenied, ssdiFamilyTotal, chadConsulting,
    ssFamilyTotal, ssStartMonth,
    trustIncomeNow, trustIncomeFuture, trustIncreaseMonth,
    milestones, bcsYearsLeft, bcsFamilyMonthly,
    effectiveBaseExpenses, debtService, vanMonthlySavings, vanSaleMonth,
    lifestyleCuts, cutInHalf, extraCuts,
    startingSavings, investmentReturn, msftGrowth, msftPrice,
    chadJob, chadJobSalary, chadJobTaxRate, chadJobStartMonth, chadJobHealthSavings,
  ]);

  // Real federal/FICA breakdown for the W-2 Net Diagnostic, from the same engine as
  // the Tax tab. FICA is exact; federal is the household return for the first working
  // year (representative). Falls back to null (pane then shows FICA-only) on any error.
  // Keyed on the gathered model inputs (remediation 6.2) — never the whole
  // state object, so UI-only changes don't re-run the full tax engine.
  const chadTaxBreakdown = useMemo(() => {
    if (!gatheredModelState.chadJob) return null;
    try {
      const sched = buildTaxSchedule(gatheredModelState);
      if (!sched || sched.length === 0) return null;
      const idx = sched.findIndex((e) => e.chadW2Gross > 0);
      const yr = idx >= 0 ? sched[idx] : sched[0];
      const b = yr.chadW2OnlyTax;
      if (!b) return null;
      const combinedTax = b.ficaTotal + b.fedTax;
      return {
        year: idx >= 0 ? idx : 0,
        // Everything below is on the SAME year-0 gross (b.ficaBase) so the rows reconcile.
        ficaBase: b.ficaBase,
        ficaSS: b.ficaSS,
        ficaMedicare: b.ficaMedicare,
        ficaAddlMedicare: b.ficaAddlMedicare,
        ficaTotal: b.ficaTotal,
        fedTax: b.fedTax,
        combinedTax,
        effectivePct: b.ficaBase > 0 ? combinedTax / b.ficaBase : 0,
      };
    } catch {
      return null;
    }
  }, [gatheredModelState]);

  const incomeControlsProps = useMemo(() => ({
    ssType, ssdiDenied,
    ssdiFamilyTotal, ssdiPersonal, kidsAgeOutMonths,
    ssdiApprovalMonth, ssdiBackPayMonths,
    ssdiBackPayGross, ssdiAttorneyFee, ssdiBackPayActual,
    ssClaimAge, ssPIA,
    ssFamilyTotal, ssPersonal, ssStartMonth, ssKidsAgeOutMonths,
    sarahSpousalEnabled, sarahSpousalClaimAge, sarahCurrentAge,
    sarahOwnSS, // D1 (2026-06-10 retirement review): own-record benefit slider
    chadConsulting,
    chadJob, chadJobSalary, chadJobTaxRate, chadJobStartMonth, chadJobHealthSavings,
    chadJobNoFICA, chadJobPensionRate, chadJobPensionContrib, chadJobRaisePct, chadJobBonusPct, chadJobBonusMonth, chadJobBonusProrateFirst, chadJobStockRefresh, chadJobRefreshStartMonth, chadJobHireStockTotal, chadJobSignOnCash, chadJob401kEnabled, chadJob401kDeferral, chadJob401kCatchupRoth, chadJob401kMatch,
    chadCurrentAge, chadAge65VestOverride,
    chadL64Enabled, chadL64Month, chadL64Salary, chadL64StockRefresh, chadL64BonusPct,
    chadL65Enabled, chadL65Month, chadL65Salary, chadL65StockRefresh, chadL65BonusPct,
    msftPrice, msftGrowth,
    chadWorkMonths,
    postJobBenefit,
    twpEnabled, // P8 (2026-06-10, b-1)
    trustIncomeNow, trustIncomeFuture, trustIncreaseMonth,
    vanSold, vanMonthlySavings, vanSalePrice, vanLoanBalance, vanSaleMonth,
    chadTaxBreakdown,
    onFieldChange: set,
  }), [
    ssType, ssdiDenied,
    ssdiFamilyTotal, ssdiPersonal, kidsAgeOutMonths,
    ssdiApprovalMonth, ssdiBackPayMonths,
    ssdiBackPayGross, ssdiAttorneyFee, ssdiBackPayActual,
    ssClaimAge, ssPIA,
    ssFamilyTotal, ssPersonal, ssStartMonth, ssKidsAgeOutMonths,
    sarahSpousalEnabled, sarahSpousalClaimAge, sarahCurrentAge, sarahOwnSS,
    chadConsulting,
    chadJob, chadJobSalary, chadJobTaxRate, chadJobStartMonth, chadJobHealthSavings,
    chadJobNoFICA, chadJobPensionRate, chadJobPensionContrib, chadJobRaisePct, chadJobBonusPct, chadJobBonusMonth, chadJobBonusProrateFirst, chadJobStockRefresh, chadJobRefreshStartMonth, chadJobHireStockTotal, chadJobSignOnCash, chadJob401kEnabled, chadJob401kDeferral, chadJob401kCatchupRoth, chadJob401kMatch,
    chadCurrentAge, chadAge65VestOverride,
    chadL64Enabled, chadL64Month, chadL64Salary, chadL64StockRefresh, chadL64BonusPct,
    chadL65Enabled, chadL65Month, chadL65Salary, chadL65StockRefresh, chadL65BonusPct,
    msftPrice, msftGrowth,
    chadWorkMonths,
    postJobBenefit,
    twpEnabled, // P8 (2026-06-10, b-1)
    trustIncomeNow, trustIncomeFuture, trustIncreaseMonth,
    vanSold, vanMonthlySavings, vanSalePrice, vanLoanBalance, vanSaleMonth,
    chadTaxBreakdown, set,
  ]);

  const expenseControlsProps = useMemo(() => ({
    totalMonthlySpend, baseExpenses: effectiveBaseExpenses, debtService,
    debts, mortgagePI, mortgageBalance, mortgageRate, // 6.3 (2026-06-10, D5)
    expenseInflation, expenseInflationRate, ssColaRate, // A2 (2026-06-10)
    healthPremiumMonthly, medicalTrendRate, ssdiEntitlementMonth, chadCurrentAge, // 6.4 (2026-06-10, D6)
    debtTotal, retireDebt,
    lifestyleCutsApplied, cutsOverride,
    bcsAnnualTotal, bcsParentsAnnual, bcsYearsLeft, bcsFamilyMonthly,
    collegeCostPerKidMonthly, collegeStartMonth, collegeMonths, college529Balance, // 6.2 (2026-06-10)
    vanSold, vanMonthlySavings, vanSaleMonth,
    chadJob, chadJobStartMonth, chadJobHealthSavings,
    milestones,
    moldCost, moldInclude, roofCost, roofInclude,
    otherProjects, otherInclude,
    // Milestone month slider max should match the actual projection horizon,
    // not a hardcoded 60. Derived from monthlyDetail length (= horizon + 1).
    totalProjectionMonths: Math.max(0, (monthlyDetail?.length || 73) - 1),
    onFieldChange: set,
  }), [
    totalMonthlySpend, effectiveBaseExpenses, debtService,
    debts, mortgagePI, mortgageBalance, mortgageRate, // 6.3 (2026-06-10, D5)
    expenseInflation, expenseInflationRate, ssColaRate, // A2 (2026-06-10)
    healthPremiumMonthly, medicalTrendRate, ssdiEntitlementMonth, chadCurrentAge, // 6.4 (2026-06-10, D6)
    debtTotal, retireDebt,
    lifestyleCutsApplied, cutsOverride,
    bcsAnnualTotal, bcsParentsAnnual, bcsYearsLeft, bcsFamilyMonthly,
    collegeCostPerKidMonthly, collegeStartMonth, collegeMonths, college529Balance, // 6.2 (2026-06-10)
    vanSold, vanMonthlySavings, vanSaleMonth,
    chadJob, chadJobStartMonth, chadJobHealthSavings,
    milestones,
    moldCost, moldInclude, roofCost, roofInclude,
    otherProjects, otherInclude,
    monthlyDetail, set,
  ]);

  const monteCarloProps = useMemo(() => ({
    mcResults, mcRunning,
    mcNumSims, mcInvestVol, mcBizGrowthVol,
    mcMsftVol, mcSsdiDelay, mcSsdiDenialPct, mcCutsDiscipline,
    mcBlockBootstrap,
    onParamChange: set, onRun: handleRunMonteCarlo,
    savingsData, presentMode,
    // Remediation 6.3: the tornado depends on DATA (the gathered model state
    // shared with the main projection), not a gatherState callback whose
    // identity changed on every state update.
    gatheredState: gatheredModelState,
    mcParams: { mcNumSims, mcInvestVol, mcBizGrowthVol, mcMsftVol, mcSsdiDelay, mcSsdiDenialPct, mcCutsDiscipline, mcBlockBootstrap },
  }), [
    mcResults, mcRunning,
    mcNumSims, mcInvestVol, mcBizGrowthVol,
    mcMsftVol, mcSsdiDelay, mcSsdiDenialPct, mcCutsDiscipline,
    mcBlockBootstrap,
    savingsData, presentMode, gatheredModelState, set, handleRunMonteCarlo,
  ]);

  const seqReturnsProps = useMemo(() => ({
    seqBadY1, seqBadY2,
    onParamChange: set,
    startingSavings, investmentReturn,
    ssType, ssdiApprovalMonth, ssdiDenied, ssdiBackPayActual,
    ssStartMonth, ssKidsAgeOutMonths,
    monthlyDetail, presentMode,
  }), [
    seqBadY1, seqBadY2,
    startingSavings, investmentReturn,
    ssType, ssdiApprovalMonth, ssdiDenied, ssdiBackPayActual,
    ssStartMonth, ssKidsAgeOutMonths,
    monthlyDetail, presentMode, set,
  ]);

  const savingsDrawdownProps = useMemo(() => ({
    savingsData, savingsZeroMonth, savingsZeroLabel,
    compareProjections, compareColors,
    data, startingSavings, investmentReturn,
    taxableReturnDragPct, cashFloorAmount, cashYieldPct, // 6.5/6.6 (2026-06-10, b-11/b-15)
    debtCC, debtPersonal, debtIRS, debtFirstmark,
    debtService, ssdiApprovalMonth, ssdiBackPayActual,
    milestones, retireDebt, presentMode,
    onFieldChange: set, baseExpenses: effectiveBaseExpenses, totalMonthlySpend,
    monthlyDetail,
  }), [
    savingsData, savingsZeroMonth, savingsZeroLabel,
    compareProjections,
    data, startingSavings, investmentReturn,
    taxableReturnDragPct, cashFloorAmount, cashYieldPct, // 6.5/6.6 (2026-06-10, b-11/b-15)
    debtCC, debtPersonal, debtIRS, debtFirstmark,
    debtService, ssdiApprovalMonth, ssdiBackPayActual,
    milestones, retireDebt, presentMode, effectiveBaseExpenses, totalMonthlySpend,
    monthlyDetail, set,
  ]);

  const netWorthProps = useMemo(() => ({
    savingsData, wealthData,
    starting401k, return401k,
    homeEquity, homeAppreciation,
    deficit401kTaxRate,
    presentMode, onFieldChange: set,
    compareProjections, compareColors,
  }), [
    savingsData, wealthData,
    starting401k, return401k,
    homeEquity, homeAppreciation,
    deficit401kTaxRate,
    presentMode,
    compareProjections, set,
  ]);

  // 401(k) detail chart props — exposes monthly contribution/match/balance breakdown
  // for the Chad401kChart rail chart (registered as 'chad401k' in chartRegistry).
  const chad401kChartProps = useMemo(() => ({
    monthlyDetail,
    starting401k,
    return401k,
    chadJob,
    chadRetirementMonth: chadWorkMonths || 72,
    chadJob401kEnabled,
  }), [monthlyDetail, starting401k, return401k, chadJob, chadWorkMonths, chadJob401kEnabled]);

  // Income-composition chart props — single memo shared by the rail's
  // 'income' entry and PlanTab (remediation 6.3: the inline object literals
  // re-rendered the memo'd IncomeCompositionChart on every parent render).
  const incomeChartProps = useMemo(() => ({
    monthlyDetail, investmentReturn, ssType,
    ssBenefitPersonal: ssType === 'ss' ? ssPersonal : ssdiPersonal,
    chadJob, chadJobStartMonth, chadJobHealthSavings,
    vanSold, vanSaleMonth, vanMonthlySavings,
    bcsYearsLeft, milestones,
    compareProjections, compareColors,
  }), [
    monthlyDetail, investmentReturn, ssType, ssPersonal, ssdiPersonal,
    chadJob, chadJobStartMonth, chadJobHealthSavings,
    vanSold, vanSaleMonth, vanMonthlySavings,
    bcsYearsLeft, milestones, compareProjections,
  ]);

  // Tax tab prop bundle. The panels read the individual tax* fields for their
  // controls and call gatherState() (the FULL gathered state — never a
  // hand-built subset) to feed buildTaxSchedule (remediation 2026-06-09 D1).
  const taxTabProps = useMemo(() => ({
    taxMode, taxInflationAdjust, taxInflationRate, taxSchCExpenseRatio,
    taxPropertyTax, taxSalesTax, taxPersonalPropTax, taxMortgageInt,
    taxCharitable, taxMedical, taxW2Withholding, taxCtcChildren,
    taxOdcDependents, taxCapGainLoss, taxSolo401k,
    chadJob,
    gatherState: stableGatherState,
    onFieldChange: set,
  }), [
    taxMode, taxInflationAdjust, taxInflationRate, taxSchCExpenseRatio,
    taxPropertyTax, taxSalesTax, taxPersonalPropTax, taxMortgageInt,
    taxCharitable, taxMedical, taxW2Withholding, taxCtcChildren,
    taxOdcDependents, taxCapGainLoss, taxSolo401k,
    chadJob, stableGatherState, set,
  ]);

  const dataTableProps = useMemo(() => ({ data }), [data]);

  const summaryAskProps = useMemo(() => ({
    totalRemainingVesting, data, startingSavings,
    savingsZeroMonth, savingsZeroLabel,
    ssdiApprovalMonth, ssdiBackPayActual, ssdiBackPayMonths,
    retireDebt, debtTotal, debtService,
    moldInclude, moldCost, roofInclude, roofCost,
    otherInclude, otherProjects,
    bcsParentsAnnual, bcsYearsLeft, bcsFamilyMonthly,
    advanceNeeded, breakevenIdx,
  }), [
    totalRemainingVesting, data, startingSavings,
    savingsZeroMonth, savingsZeroLabel,
    ssdiApprovalMonth, ssdiBackPayActual, ssdiBackPayMonths,
    retireDebt, debtTotal, debtService,
    moldInclude, moldCost, roofInclude, roofCost,
    otherInclude, otherProjects,
    bcsParentsAnnual, bcsYearsLeft, bcsFamilyMonthly,
    advanceNeeded, breakevenIdx,
  ]);

  return {
    bridgeProps,
    incomeControlsProps,
    expenseControlsProps,
    monteCarloProps,
    seqReturnsProps,
    savingsDrawdownProps,
    netWorthProps,
    chad401kChartProps,
    incomeChartProps,
    taxTabProps,
    dataTableProps,
    summaryAskProps,
  };
}
