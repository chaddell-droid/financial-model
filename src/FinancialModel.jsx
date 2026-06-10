import { useReducer, useMemo, useEffect, useState, useDeferredValue, useCallback, useRef, Suspense, lazy } from "react";
import { DAYS_PER_MONTH, SSDI_ATTORNEY_FEE_CAP } from './model/constants.js';
import { fmt, fmtFull } from './model/formatters.js';
import { getVestEvents, getTotalRemainingVesting } from './model/vesting.js';
import { computeChadPensionMonthly } from './model/chadLevels.js';
import { getEffectiveCuts } from './model/scenarioLevers.js';
import { computeProjection, findOperationalBreakevenIndex } from './model/projection.js';
import { exportModelData } from './model/exportData.js';
import { evaluateAllGoals } from './model/goalEvaluation.js';
import { INITIAL_STATE, MODEL_KEYS } from './state/initialState.js';
import { buildRecommendationProvenance } from './state/scenarioProvenance.js';
import { reducer } from './state/reducer.js';
import { gatherState as _gatherState, deriveCapitalItemsFromLegacy, prepareComparisonState, computeOneTimeTotal } from './state/gatherState.js';
import { extractProjectionInputs, projectionInputsEqual } from './state/autoSave.js';
import { usePersistence } from './state/usePersistence.js';
import { useChartPropBundles } from './hooks/useChartPropBundles.js';
import Header from './components/Header.jsx';
import SaveLoadPanel from './components/SaveLoadPanel.jsx';
import KeyMetrics from './components/KeyMetrics.jsx';
import ComparisonBanner from './components/ComparisonBanner.jsx';
import TabBar from './components/TabBar.jsx';
import ActiveTogglePills from './components/ActiveTogglePills.jsx';
import AppShell from './components/layout/AppShell.jsx';
import SavingsDrawdownChart from './charts/SavingsDrawdownChart.jsx';
import NetWorthChart from './charts/NetWorthChart.jsx';
const RetirementIncomeChart = lazy(() => import('./charts/RetirementIncomeChart.jsx'));
import OverviewTab from './panels/tabs/OverviewTab.jsx';
import PlanTab from './panels/tabs/PlanTab.jsx';
import IncomeTab from './panels/tabs/IncomeTab.jsx';
import TaxTab from './panels/tabs/TaxTab.jsx';
import RiskTab from './panels/tabs/RiskTab.jsx';
import DetailsTab from './panels/tabs/DetailsTab.jsx';
import TrackTab from './panels/tabs/TrackTab.jsx';
import ActualsTab from './panels/tabs/ActualsTab.jsx';
const AdvisorPane = lazy(() => import('./panels/AdvisorPane.jsx'));
import { getCurrentModelMonth, buildReforecast } from './model/checkIn.js';
import { getShellWidthBucket } from './ui/tokens.js';
import { useIsVisible } from './ui/useIsVisible.js';
import { noteCompute } from './testing/perfMetrics.js';
import { useRailConfig } from './rail/useRailConfig.js';
import RailRenderer from './rail/RailRenderer.jsx';
import BridgeChart from './charts/BridgeChart.jsx';
import Chad401kChart from './charts/Chad401kChart.jsx';
import IncomeCompositionChart from './charts/IncomeCompositionChart.jsx';
import MonteCarloPanel from './charts/MonteCarloPanel.jsx';
import SequenceOfReturnsChart from './charts/SequenceOfReturnsChart.jsx';

// Lazy wrapper: only renders RetirementIncomeChart when scrolled into view.
// React.lazy code-splits the chart + shillerReturns (~162KB) into a separate chunk.
// useIsVisible defers rendering until the user scrolls to it.
function LazyRetirementChart(props) {
  const [ref, visible] = useIsVisible();
  return (
    <div ref={ref} style={{ minHeight: visible ? undefined : 400 }}>
      {visible ? (
        <Suspense fallback={<div style={{ padding: 24, color: '#94a3b8', fontSize: 13 }}>Loading retirement analysis...</div>}>
          <RetirementIncomeChart {...props} />
        </Suspense>
      ) : null}
    </div>
  );
}

function getInitialShellWidthBucket() {
  if (typeof window === 'undefined') return 'desktop';
  return getShellWidthBucket(window.innerWidth);
}

// Multi-comparison line colors (yellow, cyan, purple). Module-scope constant
// (remediation 6.6): this used to be re-created inside the component on every
// render, so every memo bundle passing `compareColors` carried an unstable
// identity that silently defeated React.memo on the receiving charts.
const COMPARE_COLORS = ['#fbbf24', '#22d3ee', '#c084fc'];

// Remediation 2026-06-09 phase 6.1: stable extraction of the projection-input
// subset (MODEL_KEYS + schemaVersion + previewMoves). Returns the PREVIOUS
// object whenever nothing the projection pipeline reads has changed, so memos
// keyed on the result survive UI-only state changes (tab switches,
// scenario-name keystrokes, storage-status timers, mcRunning/mcResults flips).
function useStableProjectionInputs(state) {
  const ref = useRef(null);
  return useMemo(() => {
    const next = extractProjectionInputs(state);
    if (ref.current && projectionInputsEqual(ref.current, next)) return ref.current;
    ref.current = next;
    return next;
  }, [state]);
}

export default function FinancialModel() {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const [shellWidthBucket, setShellWidthBucket] = useState(getInitialShellWidthBucket);
  const [retirementSpendingTargets, setRetirementSpendingTargets] = useState(null);
  const railConfig = useRailConfig();

  const patchUiState = (patch) => {
    dispatch({ type: 'SET_FIELDS', fields: patch });
  };

  const setterCache = useRef({});
  const set = useCallback((field) => {
    if (!setterCache.current[field]) {
      setterCache.current[field] = (value) => {
        if (field.startsWith('cut') && field !== 'cutsOverride') {
          dispatch({ type: 'SET_FIELDS', fields: { [field]: value, cutsOverride: null } });
          return;
        }
        dispatch({ type: 'SET_FIELD', field, value });
      };
    }
    return setterCache.current[field];
  }, [dispatch]);

  // Preview Sandbox dispatch helpers (Story 1.2 reducer actions). Stable
  // references so child components can memoize prop bundles cleanly.
  const applyPreviewMove = useCallback(
    (move) => dispatch({ type: 'APPLY_PREVIEW_MOVE', move }),
    [dispatch],
  );
  const removePreviewMove = useCallback(
    (id) => dispatch({ type: 'REMOVE_PREVIEW_MOVE', id }),
    [dispatch],
  );
  const clearPreview = useCallback(
    () => dispatch({ type: 'CLEAR_PREVIEW' }),
    [dispatch],
  );
  const commitPreview = useCallback(
    () => dispatch({ type: 'COMMIT_PREVIEW' }),
    [dispatch],
  );
  // Ref bound to saveScenario (declared later) — enables saveFromPreview to
  // call saveScenario without creating a hoisting cycle. Assignment happens
  // right after saveScenario is declared (~line 410).
  const saveScenarioRef = useRef(null);

  // Ref to latest leverConstraintsOverride so setLeverConstraintOverride
  // below can read it without forcing callers to re-memoize on every state
  // change. Assigned below each render near other refs.
  const leverConstraintsOverrideRef = useRef(null);

  const {
    sarahRate, sarahMaxRate, sarahRateGrowth, sarahCurrentClients, sarahMaxClients, sarahClientGrowth, sarahTaxRate,
    chadWorkMonths, sarahWorkMonths,
    msftPrice, msftGrowth,
    ssType, ssdiApprovalMonth, ssdiDenied, ssdiPersonal, ssdiFamilyTotal, kidsAgeOutMonths, chadConsulting,
    ssClaimAge, ssPIA, ssFamilyTotal, ssPersonal, ssStartMonth, ssKidsAgeOutMonths,
    postJobBenefit,
    sarahCurrentAge, sarahSpousalClaimAge, sarahOwnSS,
    chadJob, chadJobSalary, chadJobTaxRate, chadJobStartMonth, chadJobHealthSavings, chadJobNoFICA, chadJobPensionRate, chadJobPensionContrib, chadJobRaisePct, chadJobBonusPct, chadJobBonusMonth, chadJobBonusProrateFirst, chadJobStockRefresh, chadJobRefreshStartMonth, chadJobHireStockY1, chadJobHireStockY2, chadJobHireStockY3, chadJobHireStockY4, chadJobSignOnCash, chadJob401kEnabled, chadJob401kDeferral, chadJob401kCatchupRoth, chadJob401kMatch,
    chadCurrentAge, chadAge65VestOverride,
    chadL64Enabled, chadL64Month, chadL64Salary, chadL64StockRefresh, chadL64BonusPct,
    chadL65Enabled, chadL65Month, chadL65Salary, chadL65StockRefresh, chadL65BonusPct,
    totalMonthlySpend, oneTimeExtras, oneTimeMonths, baseExpenses, debtService, expenseInflation, expenseInflationRate,
    bcsAnnualTotal, bcsParentsAnnual, bcsYearsLeft,
    lifestyleCutsApplied, cutsOverride,
    cutOliver, cutVacation, cutShopping, cutMedical, cutGym,
    cutAmazon, cutSaaS, cutEntertainment, cutGroceries, cutPersonalCare, cutSmallItems,
    trustIncomeNow, trustIncomeFuture, trustIncreaseMonth,
    vanSold, vanMonthlySavings, vanSalePrice, vanLoanBalance, vanSaleMonth,
    milestones,
    retireDebt,
    startingSavings, investmentReturn,
    ssdiBackPayMonths,
    moldCost, moldInclude, roofCost, roofInclude, otherProjects, otherInclude,
    capitalItems, capitalFundingSource, customLevers,
    debtCC, debtPersonal, debtIRS, debtFirstmark,
    savedScenarios, scenarioName, showSaveLoad, presentMode,
    comparisons,
    starting401k, return401k, homeEquity, homeAppreciation, deficit401kTaxRate, retirement401kTaxRate,
    mcResults, mcRunning, mcNumSims, mcInvestVol, mcBizGrowthVol, mcMsftVol, mcSsdiDelay, mcSsdiDenialPct, mcCutsDiscipline,
    seqBadY1, seqBadY2,
    taxMode, taxInflationAdjust, taxInflationRate, taxSchCExpenseRatio,
    taxPropertyTax, taxSalesTax, taxPersonalPropTax, taxMortgageInt,
    taxCharitable, taxMedical, taxW2Withholding, taxCtcChildren,
    taxOdcDependents, taxCapGainLoss, taxSolo401k,
    goals,
    storageStatus,
    activeTab,
    checkInHistory, activeCheckInMonth,
    monthlyActuals, merchantClassifications,
    previewMoves,
    leverConstraintsOverride,
  } = state;
  leverConstraintsOverrideRef.current = leverConstraintsOverride;
  // Latest full state for click-time reads (Monte Carlo run) so the callback
  // can stay referentially stable without going stale (remediation 6.3).
  const stateRef = useRef(state);
  stateRef.current = state;

  // Backward-compatible computed totals from individual cuts
  const lifestyleCuts = cutOliver + cutVacation + cutGym;
  const cutInHalf = cutMedical + cutShopping + cutSaaS;
  const extraCuts = cutAmazon + cutEntertainment + cutGroceries + cutPersonalCare + cutSmallItems;
  // Effective cuts total for display surfaces (ActiveTogglePills) — same
  // resolution as gatherState/the engine: cutsOverride when set, otherwise the
  // individual-cut detail sum. Raw `cutsOverride ?? 0` showed $0 for legacy
  // scenarios with individual cut fields set (remediation phase 5).
  const effectiveCutsTotal = getEffectiveCuts({
    lifestyleCutsApplied, cutsOverride, lifestyleCuts, cutInHalf, extraCuts,
  }).effectiveTotal;

  // Derived values
  const daysPerMonth = DAYS_PER_MONTH;
  const sarahCurrentGross = Math.round(sarahRate * sarahCurrentClients * daysPerMonth);
  const sarahCurrentNet = Math.round(sarahCurrentGross * (1 - (sarahTaxRate ?? 25) / 100));
  const sarahCeilingGross = Math.round(sarahMaxRate * sarahMaxClients * daysPerMonth);
  const sarahCeiling = Math.round(sarahCeilingGross * (1 - (sarahTaxRate ?? 25) / 100));
  const vestEvents = useMemo(() => getVestEvents(msftGrowth, msftPrice), [msftGrowth, msftPrice]);
  const totalRemainingVesting = useMemo(() => getTotalRemainingVesting(msftGrowth, msftPrice), [msftGrowth, msftPrice]);
  const bcsFamilyMonthly = Math.round(Math.max(0, bcsAnnualTotal - bcsParentsAnnual) / 12);
  // When totalMonthlySpend is set, derive baseExpenses from it (same logic as gatherState)
  const effectiveBaseExpenses = totalMonthlySpend != null
    ? Math.max(0, totalMonthlySpend - debtService - vanMonthlySavings - bcsFamilyMonthly)
    : baseExpenses;
  const debtTotal = debtCC + debtPersonal + debtIRS + debtFirstmark;
  // Effective capital items: use the array form when populated, else derive from legacy scalar fields.
  const effectiveCapitalItems = useMemo(
    () => (Array.isArray(capitalItems) && capitalItems.length > 0
      ? capitalItems
      : deriveCapitalItemsFromLegacy({ moldCost, moldInclude, roofCost, roofInclude, otherProjects, otherInclude })),
    [capitalItems, moldCost, moldInclude, roofCost, roofInclude, otherProjects, otherInclude]
  );
  // Shared with the JSON export (remediation phase 5 — export parity).
  const oneTimeTotal = computeOneTimeTotal(effectiveCapitalItems);
  const advanceNeeded = (retireDebt ? debtTotal : 0) + oneTimeTotal;

  // Projected PERS pension at retirement — same shared helper as
  // gatherState.chadJobPensionMonthly (remediation phase 5: inclusive month
  // count + final salary incl. promotions/raises). `state` carries the raw
  // model fields the helper reads.
  const chadJobPensionMonthly = computeChadPensionMonthly(state);

  // Mirror of projection.js back-pay formula. Auxiliary back pay for dependent kids
  // (the portion of family total exceeding the worker's PIA) is added on top, bounded
  // by kidsAgeOutMonths. Attorney fee applies only to the worker's share.
  const ssdiAuxBackPayMonths = Math.min(ssdiBackPayMonths, kidsAgeOutMonths || 0);
  const ssdiAdultBackPayGross = ssdiBackPayMonths * ssdiPersonal;
  const ssdiAuxBackPayGross = ssdiAuxBackPayMonths * Math.max(0, (ssdiFamilyTotal || 0) - ssdiPersonal);
  const ssdiBackPayGross = ssdiAdultBackPayGross + ssdiAuxBackPayGross;
  const ssdiAttorneyFee = Math.min(Math.round(ssdiAdultBackPayGross * 0.25), SSDI_ATTORNEY_FEE_CAP);

  const gatherState = (src) => _gatherState(src || state);

  // All storage persistence (scenarios, model auto-save, check-ins, actuals,
  // merchant classifications) lives in usePersistence — hydration gates,
  // intentional-clear intent flags, and guarded writes included.
  const {
    storageAvailable,
    actualsDispatch,
    saveScenario,
    deleteScenario,
    markModelReset,
    markCheckInClear,
  } = usePersistence({ state, dispatch, set, gatherState });
  // Bind the ref so saveFromPreview (declared earlier) can call saveScenario.
  saveScenarioRef.current = saveScenario;

  const handleResetAll = () => {
    const confirmed = typeof window === 'undefined'
      ? true
      : window.confirm('Reset all assumptions back to the baseline model?');
    if (!confirmed) return;
    markModelReset();
    dispatch({ type: 'RESET_ALL' });
  };

  // Projections — use deferred state so computation doesn't block slider interaction.
  // React will skip intermediate computations during rapid drag and only compute when idle.
  const deferredState = useDeferredValue(state);
  // Remediation 6.1: the projection pipeline is keyed on the extracted
  // model-input subset, NOT the whole state object, so UI-only fields
  // (activeTab, scenarioName keystrokes, storageStatus timer, mcRunning)
  // can never invalidate it. Live extraction feeds the stable gatherState
  // callback below; deferred extraction feeds the projection memos.
  const modelInputs = useStableProjectionInputs(state);
  const deferredModelInputs = useStableProjectionInputs(deferredState);
  // Single gathered model state shared by the projection, the W-2 tax
  // breakdown (6.2), and the MonteCarloPanel tornado (6.3) — none of them
  // mutate it. buildReforecast DOES mutate its gather, so it gets a fresh
  // one further down.
  const gatheredModelState = useMemo(
    () => _gatherState(deferredModelInputs),
    [deferredModelInputs],
  );
  const projection = useMemo(
    () => {
      noteCompute('projection');
      return computeProjection(gatheredModelState);
    },
    [gatheredModelState],
  );
  const data = projection.data;
  const savingsData = projection.savingsData;
  const monthlyDetail = projection.monthlyData;
  const ssdiBackPayActual = projection.backPayActual;
  const ssWithheldSummary = projection.ssWithheldSummary;

  // wealthData assembled from monthlyDetail (401k + home equity now both in main simulation)
  const wealthData = useMemo(() =>
    monthlyDetail.map(d => ({
      month: d.month,
      balance401k: d.balance401k,
      homeEquity: d.homeEquity,
    })),
    [monthlyDetail]
  );

  const goalResults = useMemo(() => {
    if (!goals || goals.length === 0) return [];
    return evaluateAllGoals(goals, monthlyDetail, { wealthData, retireDebt });
  }, [goals, monthlyDetail, wealthData, retireDebt]);

  // Clamp "today" to the projection's ACTUAL horizon (monthlyDetail covers
  // months 0..N), not the legacy hardcoded 72 — long vest-tail projections run
  // to ~204 months (remediation phase 5).
  const projectionHorizonMonths = Math.max(0, (monthlyDetail?.length || 73) - 1);
  const currentModelMonth = useMemo(
    () => getCurrentModelMonth(new Date(), projectionHorizonMonths),
    [projectionHorizonMonths],
  );

  const reforecastProjection = useMemo(() => {
    if (!checkInHistory || checkInHistory.length === 0) return null;
    const latest = checkInHistory[checkInHistory.length - 1];
    // buildReforecast overwrites startingSavings/starting401k on the gathered
    // object — hand it a FRESH gather, never the shared gatheredModelState.
    // Keyed on the model-input subset (6.1): UI-only changes don't re-run it.
    return buildReforecast(() => _gatherState(deferredModelInputs), latest);
  }, [checkInHistory, deferredModelInputs]);

  // Multi-comparison: compute projections for up to 3 comparisons.
  // Compared states are SAVED scenario payloads — route them through the same
  // migrate + validateAndSanitize + gatherState pipeline as loading, so an
  // old-schema scenario compares identically to loading it (remediation phase 5).
  const compareProjections = useMemo(() => {
    return (comparisons || []).map(c => ({
      name: c.name,
      projection: computeProjection(prepareComparisonState(c.state)),
    }));
  }, [comparisons]);

  // Scenario restore into the reducer (full-payload RESTORE_STATE — partial
  // payloads like check-ins go through usePersistence's dedicated restores).
  const restoreState = (s) => {
    if (!s) return;
    dispatch({ type: 'RESTORE_STATE', state: s });
  };

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    let frameId = null;
    const syncShellBucket = () => {
      const nextBucket = getShellWidthBucket(window.innerWidth);
      setShellWidthBucket((current) => current === nextBucket ? current : nextBucket);
    };

    const handleResize = () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        syncShellBucket();
      });
    };

    syncShellBucket();
    window.addEventListener('resize', handleResize);
    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Monte Carlo — dynamic import keeps monteCarlo.js out of the main bundle.
  // Stable callback (remediation 6.3): reads the LATEST state via stateRef at
  // click time, so memo'd prop bundles holding onRun never go stale.
  const handleRunMonteCarlo = useCallback(() => {
    set('mcRunning')(true);
    import('./model/monteCarlo.js').then(({ runMonteCarlo }) => {
      setTimeout(() => {
        const st = stateRef.current;
        const base = _gatherState(st);
        const mcParams = {
          mcNumSims: st.mcNumSims, mcInvestVol: st.mcInvestVol, mcBizGrowthVol: st.mcBizGrowthVol,
          mcMsftVol: st.mcMsftVol, mcSsdiDelay: st.mcSsdiDelay, mcSsdiDenialPct: st.mcSsdiDenialPct,
          mcCutsDiscipline: st.mcCutsDiscipline,
        };
        const mcSeed = typeof window !== 'undefined' && window.__FIN_MODEL_TEST__ && typeof window.__FIN_MODEL_TEST__.getMonteCarloSeed === 'function'
          ? window.__FIN_MODEL_TEST__.getMonteCarloSeed()
          : null;
        const results = runMonteCarlo(base, mcParams, st.goals, { seed: mcSeed });
        set('mcResults')(results);
        set('mcRunning')(false);
      }, 50);
    });
  }, [set]);

  // Savings zero-crossing
  const savingsZeroMonth = savingsData.find(d => d.balance <= 0);
  const horizonYears = Math.round(Math.max(chadWorkMonths || 72, sarahWorkMonths || 72) / 12);
  const savingsZeroLabel = savingsZeroMonth ? `~${Math.round(savingsZeroMonth.month)} months` : `${horizonYears}+ years`;

  const handleTogglePresentMode = () => {
    if (presentMode) {
      patchUiState({ presentMode: false });
      return;
    }
    patchUiState({
      presentMode: true,
      showSaveLoad: false,
    });
  };

  // Raw monthly gap — no toggles, no returns. Matches waterfall "Today" bar.
  const currentMsft = data[0]?.msftVesting || 0;
  const chadJobImmediate = chadJob && (chadJobStartMonth ?? 3) === 0;
  // FIX #5: chadJobNetForGap parity. Use engine's chadJobSalaryNet (salary-only,
  // includes FICA savings + pension contrib adjustments) from monthlyData[0] rather
  // than recomputing a simple tax-only formula here. Falls back to 0 when chadJob is
  // not immediate or monthlyData[0] is unavailable.
  const chadJobNetForGap = chadJobImmediate ? (monthlyDetail[0]?.chadJobSalaryNet ?? 0) : 0;
  const chadJobHealthForGap = chadJobImmediate ? (chadJobHealthSavings || 4200) : 0;
  const totalCurrentIncome = sarahCurrentNet + currentMsft + trustIncomeNow
    + (monthlyDetail[0]?.ssBenefit ?? 0)
    + (monthlyDetail[0]?.consulting ?? 0)
    + chadJobNetForGap;
  const extrasAtMonth0 = (oneTimeExtras || 0) > 0 && (oneTimeMonths || 0) > 0 ? oneTimeExtras : 0;
  const totalCurrentExpenses = Math.max(effectiveBaseExpenses + debtService + vanMonthlySavings + bcsFamilyMonthly - chadJobHealthForGap + extrasAtMonth0, 0);
  const rawMonthlyGap = totalCurrentIncome - totalCurrentExpenses;

  // Steady state net at Y3
  const steadyIdxRaw = data.findIndex(d => d.month >= 36);
  const steadyIdx = steadyIdxRaw >= 0 ? steadyIdxRaw : data.length - 1;
  const steadyStateNet = data[steadyIdx]?.netMonthly || data[data.length - 1].netMonthly;
  const steadyStateIncome = data[steadyIdx]?.totalIncome || data[data.length - 1]?.totalIncome || 0;

  const mcGoalResults = mcResults?.goalSuccessRates || null;

  // Export handler
  const handleExportJSON = () => {
    exportModelData(gatherState(), projection, vestEvents, totalRemainingVesting, {
      rawMonthlyGap, sarahCurrentNet, advanceNeeded, ssdiDenied, lifestyleCutsApplied,
      cutOliver, cutVacation, cutShopping, cutMedical, cutGym, cutAmazon, cutSaaS,
      cutEntertainment, cutGroceries, cutPersonalCare, cutSmallItems,
      lifestyleCuts, cutInHalf, extraCuts, goalResults,
    });
  };

  // Chart helpers (memoized — only recompute when projection data changes)
  const chartHelpers = useMemo(() => {
    const breakevenIdx = findOperationalBreakevenIndex(data);
    const bestIdx = data.reduce((bestI, d, i) => d.netMonthly > data[bestI].netMonthly ? i : bestI, 0);
    const bestProjectedGap = data[bestIdx]?.netMonthly ?? data[0]?.netMonthly ?? rawMonthlyGap;
    const bestProjectedLabel = data[bestIdx]?.label ?? '';
    const breakevenLabel = breakevenIdx >= 0 ? data[breakevenIdx].label : `Best: ${fmt(data[bestIdx].netMonthly)} at ${data[bestIdx].label}`;
    return { breakevenIdx, bestProjectedGap, bestProjectedLabel, breakevenLabel };
  }, [data, rawMonthlyGap]);
  const { breakevenIdx, bestProjectedGap, bestProjectedLabel, breakevenLabel } = chartHelpers;

  // === PROP BUNDLES for tab components ===
  // Stable across UI-only state changes (remediation 6.1/6.3): identity
  // changes only when the model-input subset does. Gathers FRESH on every
  // call — consumers (RecommendationCascade, TaxSettingsPanel, AdvisorPane,
  // TopMovesPanel) key memos on this identity and may mutate the result.
  const stableGatherState = useCallback(() => _gatherState(modelInputs), [modelInputs]);

  // Chart/tab prop bundles (extracted to useChartPropBundles — Phase 7 file
  // split, behavior-identical). Bundles whose contracts are locked to this
  // file (scenarioStripProps' layoutBucket, retirementRailProps, the
  // instanceId variants, railPropsMap) intentionally stay below.
  const {
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
  } = useChartPropBundles({
    state,
    monthlyDetail, data, savingsData, wealthData, gatheredModelState,
    compareProjections, compareColors: COMPARE_COLORS,
    sarahCurrentNet, effectiveBaseExpenses, debtTotal,
    lifestyleCuts, cutInHalf, extraCuts, bcsFamilyMonthly, advanceNeeded,
    ssdiBackPayGross, ssdiAttorneyFee, ssdiBackPayActual,
    savingsZeroMonth, savingsZeroLabel, breakevenIdx, totalRemainingVesting,
    set, handleRunMonteCarlo, stableGatherState,
  });

  const scenarioStripProps = useMemo(() => ({
    retireDebt, lifestyleCutsApplied, cutsOverride,
    lifestyleCuts, cutInHalf, extraCuts,
    debtTotal, debtService,
    baseExpenses: effectiveBaseExpenses, currentExpenses: monthlyDetail[0].expenses,
    totalMonthlySpend,
    vanSold, vanMonthlySavings,
    bcsAnnualTotal, bcsParentsAnnual,
    bcsYearsLeft, bcsFamilyMonthly,
    moldCost, moldInclude,
    roofCost, roofInclude,
    otherProjects, otherInclude,
    advanceNeeded,
    layoutBucket: shellWidthBucket,
    onFieldChange: set,
  }), [
    retireDebt, lifestyleCutsApplied, cutsOverride,
    lifestyleCuts, cutInHalf, extraCuts,
    debtTotal, debtService,
    effectiveBaseExpenses, totalMonthlySpend, monthlyDetail,
    vanSold, vanMonthlySavings,
    bcsAnnualTotal, bcsParentsAnnual,
    bcsYearsLeft, bcsFamilyMonthly,
    moldCost, moldInclude,
    roofCost, roofInclude,
    otherProjects, otherInclude,
    advanceNeeded, shellWidthBucket, set,
  ]);

  // Save-from-preview helper — builds recommendation provenance from the
  // current preview stack + active scenario name, then calls saveScenario.
  // Used by CommitActionBar's "Save as new scenario" flow (Story 1.5).
  // The ref indirection (saveScenarioRef, declared at top of component near
  // other preview callbacks) avoids the hoisting cycle with saveScenario.
  const saveFromPreview = useCallback(async (name) => {
    if (!saveScenarioRef.current) return;
    const baseline = typeof scenarioName === 'string' && scenarioName.length > 0 ? scenarioName : null;
    const provenance = buildRecommendationProvenance(baseline, previewMoves);
    await saveScenarioRef.current(name, { provenance });
  }, [previewMoves, scenarioName]);

  // Story 2.4 — update a single lever's constraint bounds. Passing `null` as
  // the bounds clears the override for that lever, reverting to workshop
  // defaults. Passing `{ min, max }` (partial allowed) installs an override.
  // Uses the ref so the callback is stable even as leverConstraintsOverride
  // changes — avoids cascading prop-bundle re-memoization.
  const setLeverConstraintOverride = useCallback((leverKey, bounds) => {
    if (typeof leverKey !== 'string' || leverKey.length === 0) return;
    const current = leverConstraintsOverrideRef.current;
    const currentObj = current && typeof current === 'object' ? current : {};
    let next;
    if (bounds === null) {
      if (!(leverKey in currentObj)) return; // nothing to clear
      next = { ...currentObj };
      delete next[leverKey];
      if (Object.keys(next).length === 0) next = null;
    } else if (bounds && typeof bounds === 'object') {
      const entry = {};
      if (typeof bounds.min === 'number' && Number.isFinite(bounds.min)) entry.min = bounds.min;
      if (typeof bounds.max === 'number' && Number.isFinite(bounds.max)) entry.max = bounds.max;
      if (Object.keys(entry).length === 0) return;
      next = { ...currentObj, [leverKey]: entry };
    } else {
      return;
    }
    dispatch({ type: 'SET_FIELD', field: 'leverConstraintsOverride', value: next });
  }, [dispatch]);

  // Preview sandbox prop bundle — passed through to any surface that renders
  // the RecommendationCascade. Preview state is strictly in-memory; see
  // src/state/previewState.js and autoSave.js filtering.
  const previewProps = useMemo(() => ({
    previewMoves: Array.isArray(previewMoves) ? previewMoves : [],
    applyPreviewMove,
    removePreviewMove,
    clearPreview,
    commitPreview,
    saveFromPreview,
    setLeverConstraintOverride,
  }), [previewMoves, applyPreviewMove, removePreviewMove, clearPreview, commitPreview, saveFromPreview, setLeverConstraintOverride]);

  // Stable risk-tab variants with instanceId baked in (avoids inline spread that defeats memo)
  const riskSavingsDrawdownProps = useMemo(
    () => ({ ...savingsDrawdownProps, instanceId: 'risk-tab' }),
    [savingsDrawdownProps],
  );
  const riskNetWorthProps = useMemo(
    () => ({ ...netWorthProps, instanceId: 'risk-tab' }),
    [netWorthProps],
  );
  // Stable Plan-tab variants — same pattern as the risk-tab ones above
  // (remediation 6.6: these were inline `{...props, instanceId}` spreads in
  // plannerWorkspace, handing PlanTab's memo'd charts a fresh object on every
  // workspace re-evaluation).
  const planSavingsDrawdownProps = useMemo(
    () => ({ ...savingsDrawdownProps, instanceId: 'plan-savings' }),
    [savingsDrawdownProps],
  );
  const planNetWorthProps = useMemo(
    () => ({ ...netWorthProps, instanceId: 'plan-networth' }),
    [netWorthProps],
  );

  const trackTabProps = useMemo(() => ({
    checkInHistory,
    monthlyDetail,
    currentModelMonth,
    onRecordCheckIn: (checkIn) => dispatch({ type: 'RECORD_CHECK_IN', checkIn }),
    onDeleteCheckIn: (month) => {
      // Explicit user deletion: the resulting shrink/empty persist is
      // intentional (remediation 1.4) — flag it for the guard.
      markCheckInClear();
      dispatch({ type: 'DELETE_CHECK_IN', month });
    },
    savingsData,
    reforecastProjection,
    goals,
    goalResults,
    presentMode,
  }), [checkInHistory, monthlyDetail, currentModelMonth, savingsData,
       reforecastProjection, goals, goalResults, presentMode]);

  const effectiveTab = presentMode ? "overview" : (activeTab || "overview");
  const showTopSummary = true;
  const showTabs = !presentMode;
  // Plan tab has its own in-workspace chart stack (Savings + NetWorth) via
  // WorkspaceSplit, so hide the AppShell rail on Plan.
  // Tax tab renders its own full-width settings + chart stack, so no rail.
  const noRailTabs = new Set(['actuals', 'details', 'plan', 'tax']);
  const showRail = !presentMode && !noRailTabs.has(effectiveTab);
  const railPlacement = !showRail
    ? 'hidden'
    : effectiveTab === 'track'
      ? 'below'
      : shellWidthBucket === 'desktop'
        ? 'side'
        : 'below';
  const compactShell = shellWidthBucket === 'compact';
  const showCompareBanner = !presentMode && (comparisons || []).length > 0;
  // Rail charts use useDeferredValue for prioritization — no additional delay needed.
  // A hard debounce here prevents charts from updating at all during slider drag.
  const goalPanelProps = useMemo(() => ({
    goals,
    goalResults,
    mcGoalResults,
    mcRunning,
    presentMode,
    onGoalsChange: (newGoals) => set('goals')(newGoals),
  }), [goals, goalResults, mcGoalResults, mcRunning, presentMode, set]);

  // (deferredPlanBridgeProps deleted — remediation 6.6: it was computed and
  // listed as a plannerWorkspace dep but never rendered anywhere.)
  // savingsDrawdownProps and netWorthProps are NOT deferred — they contain sliders
  // whose values must update immediately. The projection data inside them is already
  // deferred via deferredState (layer 1), so no second defer is needed.
  const retirementRailProps = useMemo(() => ({
    savingsData,
    wealthData,
    ssType,
    ssPersonal,
    ssPIA,
    ssClaimAge,
    chadJob,
    trustIncomeFuture,
    ssMonthsWithheld: ssWithheldSummary?.monthsFullyWithheld ?? 0,
    chadJobPensionMonthly,
    chadCurrentAge,
    sarahCurrentAge,
    sarahSpousalClaimAge, // A7 (2026-06-10): retirement sim gates + reduces her spousal by claim age
    sarahOwnSS,
    retirement401kTaxRate, // A5 (2026-06-10): pool haircuts the pre-tax 401(k) leg by this rate
    onSpendingTargets: setRetirementSpendingTargets,
  }), [savingsData, wealthData, ssType, ssPersonal, ssPIA, ssClaimAge, chadJob, trustIncomeFuture, ssWithheldSummary, chadJobPensionMonthly, chadCurrentAge, sarahCurrentAge, sarahSpousalClaimAge, sarahOwnSS, retirement401kTaxRate]);
  const deferredRetirementRailProps = useDeferredValue(retirementRailProps);
  const deferredGoalPanelProps = useDeferredValue(goalPanelProps);
  // Removed: useLaggedValue debounce layer — useDeferredValue already handles prioritization

  const plannerSummary = useMemo(() => {
    if (!showTopSummary) return null;
    return (
      <>
        <KeyMetrics
          netMonthly={data[0].netMonthly}
          breakevenLabel={breakevenLabel}
          breakevenIdx={breakevenIdx}
          savingsZeroLabel={savingsZeroLabel}
          savingsZeroMonth={savingsZeroMonth}
          advanceNeeded={advanceNeeded}
          mcResults={mcResults}
          rawMonthlyGap={rawMonthlyGap}
          steadyStateNet={steadyStateNet}
          steadyLabel={data[steadyIdx]?.label}
          bestProjectedGap={bestProjectedGap}
          bestProjectedLabel={bestProjectedLabel}
          totalMonthlySpend={totalMonthlySpend}
          oneTimeExtras={oneTimeExtras}
          oneTimeMonths={oneTimeMonths}
          totalCurrentIncome={totalCurrentIncome}
          steadyStateIncome={steadyStateIncome}
          totalCurrentExpenses={totalCurrentExpenses}
          retirementSpendingTargets={retirementSpendingTargets}
          baseLivingDerived={effectiveBaseExpenses}
          debtServiceMonthly={debtService}
          vanMonthlyCost={vanMonthlySavings}
          bcsFamilyMonthly={bcsFamilyMonthly}
          onFieldChange={set}
        />

        <ActiveTogglePills
          retireDebt={retireDebt}
          lifestyleCutsApplied={lifestyleCutsApplied}
          vanSold={vanSold}
          debtService={debtService}
          totalCuts={effectiveCutsTotal}
        />

        {showCompareBanner ? (
          <ComparisonBanner
            comparisons={comparisons || []}
            compareProjections={compareProjections}
            compareColors={COMPARE_COLORS}
            onRemoveComparison={(name) => set('comparisons')((comparisons || []).filter(c => c.name !== name))}
            onClearAll={() => set('comparisons')([])}
            projection={projection}
          />
        ) : null}
      </>
    );
  }, [
    // Deps audited (remediation 6.6): every value RENDERED inside is listed —
    // the missing ones (oneTimeExtras/Months, steadyStateIncome, the expense
    // breakdown rows, projection) left KeyMetrics' controlled inputs stale
    // during deferred windows; the unused cut components are gone.
    showTopSummary,
    data,
    breakevenLabel,
    breakevenIdx,
    savingsZeroLabel,
    savingsZeroMonth,
    advanceNeeded,
    totalMonthlySpend,
    oneTimeExtras,
    oneTimeMonths,
    totalCurrentIncome,
    steadyStateIncome,
    totalCurrentExpenses,
    mcResults,
    rawMonthlyGap,
    steadyStateNet,
    steadyIdx,
    bestProjectedGap,
    bestProjectedLabel,
    retireDebt,
    lifestyleCutsApplied,
    vanSold,
    debtService,
    effectiveBaseExpenses,
    vanMonthlySavings,
    bcsFamilyMonthly,
    effectiveCutsTotal,
    showCompareBanner,
    comparisons,
    compareProjections,
    projection,
    retirementSpendingTargets,
    set,
  ]);

  const plannerTabs = useMemo(() => (
    showTabs ? <TabBar activeTab={effectiveTab} onChange={set('activeTab')} compact={compactShell} /> : null
  ), [showTabs, effectiveTab, compactShell, set]);

  // Chart picker: component map + props map for the configurable rail
  // Must be defined BEFORE plannerWorkspace which references them
  const RAIL_COMPONENTS = useMemo(() => ({
    savings: SavingsDrawdownChart,
    networth: NetWorthChart,
    retirement: LazyRetirementChart,
    bridge: BridgeChart,
    income: IncomeCompositionChart,
    montecarlo: MonteCarloPanel,
    sequence: SequenceOfReturnsChart,
    chad401k: Chad401kChart,
  }), []);

  const railPropsMap = useMemo(() => ({
    savings: { ...savingsDrawdownProps, instanceId: effectiveTab === 'risk' ? 'right-rail' : 'shared-rail' },
    networth: { ...netWorthProps, instanceId: effectiveTab === 'risk' ? 'right-rail' : 'shared-rail' },
    retirement: deferredRetirementRailProps,
    bridge: bridgeProps,
    income: incomeChartProps,
    montecarlo: monteCarloProps,
    sequence: seqReturnsProps,
    chad401k: chad401kChartProps,
  }), [savingsDrawdownProps, netWorthProps, deferredRetirementRailProps, bridgeProps,
    incomeChartProps, monteCarloProps, seqReturnsProps, chad401kChartProps, effectiveTab]);

  const plannerWorkspace = useMemo(() => (
    <>
      {effectiveTab === 'overview' && (
        <OverviewTab
          bridgeProps={bridgeProps}
          rawMonthlyGap={rawMonthlyGap}
          savingsZeroLabel={savingsZeroLabel}
          savingsZeroMonth={savingsZeroMonth}
          mcResults={mcResults}
          onTabChange={set('activeTab')}
          savingsData={savingsData}
          wealthData={wealthData}
          monthlyDetail={monthlyDetail}
          ssType={ssType}
          goals={goals}
          goalResults={goalResults}
          gatherState={stableGatherState}
          previewProps={previewProps}
          presentMode={presentMode}
        />
      )}

      {effectiveTab === 'plan' && (
        <PlanTab
          incomeControlsProps={incomeControlsProps}
          expenseControlsProps={expenseControlsProps}
          scenarioStripProps={scenarioStripProps}
          savingsChartProps={planSavingsDrawdownProps}
          netWorthChartProps={planNetWorthProps}
          incomeChartProps={incomeChartProps}
          capitalItems={effectiveCapitalItems}
          capitalFundingSource={capitalFundingSource}
          customLevers={customLevers}
          onFieldChange={set}
          shellWidthBucket={shellWidthBucket}
          presentMode={presentMode}
          gatherState={stableGatherState}
          previewProps={previewProps}
        />
      )}

      {effectiveTab === 'track' && (
        <TrackTab {...trackTabProps} />
      )}

      {effectiveTab === 'actuals' && (
        <ActualsTab
          monthlyActuals={monthlyActuals}
          merchantClassifications={merchantClassifications}
          currentTotalMonthlySpend={totalMonthlySpend}
          currentOneTimeExtras={oneTimeExtras}
          baseExpenses={effectiveBaseExpenses}
          debtService={debtService}
          vanMonthlySavings={vanMonthlySavings}
          bcsFamilyMonthly={bcsFamilyMonthly}
          dispatch={actualsDispatch}
        />
      )}

      {effectiveTab === 'income' && (
        <IncomeTab
          vestEvents={vestEvents} totalRemainingVesting={totalRemainingVesting}
          msftPrice={msftPrice} msftGrowth={msftGrowth} onMsftGrowthChange={set('msftGrowth')} onMsftPriceChange={set('msftPrice')}
          sarahRate={sarahRate} sarahMaxRate={sarahMaxRate} sarahRateGrowth={sarahRateGrowth}
          sarahCurrentClients={sarahCurrentClients} sarahMaxClients={sarahMaxClients} sarahClientGrowth={sarahClientGrowth}
          sarahTaxRate={sarahTaxRate} sarahWorkMonths={sarahWorkMonths}
          sarahCurrentGross={sarahCurrentGross} sarahCurrentNet={sarahCurrentNet}
          sarahCeilingGross={sarahCeilingGross} sarahCeiling={sarahCeiling}
          onFieldChange={set}
          monthlyDetail={monthlyDetail} investmentReturn={investmentReturn} ssType={ssType}
          ssBenefitPersonal={ssType === 'ss' ? ssPersonal : ssdiPersonal}
          chadJob={chadJob} chadJobStartMonth={chadJobStartMonth} chadJobHealthSavings={chadJobHealthSavings}
          vanSold={vanSold} vanSaleMonth={vanSaleMonth} vanMonthlySavings={vanMonthlySavings}
          bcsYearsLeft={bcsYearsLeft} milestones={milestones}
          compareProjections={compareProjections} compareColors={COMPARE_COLORS}
        />
      )}

      {effectiveTab === 'tax' && (
        <TaxTab {...taxTabProps} />
      )}

      {effectiveTab === 'risk' && (
        <RiskTab
          monteCarloProps={monteCarloProps}
          seqReturnsProps={seqReturnsProps}
          savingsDrawdownProps={riskSavingsDrawdownProps}
          netWorthProps={riskNetWorthProps}
          sarahWorkMonths={sarahWorkMonths}
          showEmbeddedBalanceCharts={!showRail}
          goalPanelProps={deferredGoalPanelProps}
        />
      )}

      {effectiveTab === 'details' && (
        <DetailsTab
          dataTableProps={dataTableProps}
          summaryAskProps={summaryAskProps}
          presentMode={presentMode}
        />
      )}

      {effectiveTab === 'advisor' && (
        <Suspense fallback={<div style={{ padding: 24, color: '#94a3b8' }}>Loading advisor…</div>}>
          <AdvisorPane
            state={state}
            gatherState={stableGatherState}
            onApplyMove={(mutation) => {
              if (!mutation || typeof mutation !== 'object') return;
              for (const [field, value] of Object.entries(mutation)) {
                set(field)(value);
              }
            }}
            scenarioName={state.scenarioName || null}
          />
        </Suspense>
      )}
    </>
  ), [
    // Deps audited (remediation 6.6): every value rendered by some tab branch
    // is listed; dead entries (deferredPlanBridgeProps, data, railConfig,
    // RAIL_COMPONENTS, railPropsMap — none rendered inside this memo) removed.
    effectiveTab,
    // overview
    bridgeProps,
    rawMonthlyGap,
    savingsZeroLabel,
    savingsZeroMonth,
    mcResults,
    savingsData,
    wealthData,
    monthlyDetail,
    ssType,
    goals,
    goalResults,
    previewProps,
    // plan
    incomeControlsProps,
    expenseControlsProps,
    scenarioStripProps,
    planSavingsDrawdownProps,
    planNetWorthProps,
    incomeChartProps,
    effectiveCapitalItems,
    capitalFundingSource,        // D4: Plan-tab funding-source toggle
    customLevers,
    shellWidthBucket,
    // track
    trackTabProps,
    // actuals
    monthlyActuals,
    merchantClassifications,
    totalMonthlySpend,
    oneTimeExtras,
    effectiveBaseExpenses,
    debtService,
    vanMonthlySavings,
    bcsFamilyMonthly,
    actualsDispatch,             // stable wrapper around dispatch for ActualsTab
    // income
    vestEvents,
    totalRemainingVesting,
    msftPrice,
    msftGrowth,
    sarahRate,
    sarahMaxRate,
    sarahRateGrowth,
    sarahCurrentClients,
    sarahMaxClients,
    sarahClientGrowth,
    sarahTaxRate,
    sarahWorkMonths,
    sarahCurrentGross,
    sarahCurrentNet,
    sarahCeilingGross,
    sarahCeiling,
    investmentReturn,
    ssPersonal,
    ssdiPersonal,
    chadJob,
    chadJobStartMonth,
    chadJobHealthSavings,
    vanSold,
    vanSaleMonth,
    bcsYearsLeft,
    milestones,
    compareProjections,
    // tax
    taxTabProps,
    // risk
    monteCarloProps,
    seqReturnsProps,
    riskSavingsDrawdownProps,
    riskNetWorthProps,
    showRail,
    deferredGoalPanelProps,
    // details
    dataTableProps,
    summaryAskProps,
    presentMode,
    // advisor (reads state + uses set() to apply moves) + shared callbacks
    state, set, stableGatherState,
  ]);

  const plannerRail = (
    <RailRenderer
      tab={effectiveTab}
      chartIds={railConfig.getTabCharts(effectiveTab)}
      componentMap={RAIL_COMPONENTS}
      propsMap={railPropsMap}
      onReorder={(from, to) => railConfig.moveChart(effectiveTab, from, to)}
      onRemove={(id) => railConfig.removeChart(effectiveTab, id)}
      onAdd={(id) => railConfig.addChart(effectiveTab, id)}
      onReset={() => railConfig.resetTab(effectiveTab)}
      onClearAll={() => railConfig.setTabCharts(effectiveTab, [])}
      onSave={() => railConfig.saveLayout()}
      isModified={railConfig.isTabModified(effectiveTab)}
    />
  );

  return (
    <div style={{
      fontFamily: "'Inter', -apple-system, sans-serif",
      background: "#0f172a",
      color: "#e2e8f0",
      minHeight: "100vh",
      padding: "24px 16px"
    }}>
      <div style={{ maxWidth: 1920, margin: "0 auto" }}>
        <Header
          presentMode={presentMode}
          onTogglePresentMode={handleTogglePresentMode}
          showSaveLoad={showSaveLoad}
          onToggleSaveLoad={() => set('showSaveLoad')(!showSaveLoad)}
          savedScenarios={savedScenarios}
          onReset={handleResetAll}
          onExportJSON={handleExportJSON}
        />

        {!presentMode && (
          <SaveLoadPanel
            showSaveLoad={showSaveLoad}
            savedScenarios={savedScenarios}
            scenarioName={scenarioName}
            onScenarioNameChange={set('scenarioName')}
            onSave={saveScenario}
            onLoad={(s) => { restoreState(s.state); set('scenarioName')(s.name); }}
            onCompare={(name, st) => {
              const current = comparisons || [];
              const existing = current.findIndex(c => c.name === name);
              if (existing >= 0) {
                set('comparisons')(current.filter((_, i) => i !== existing));
              } else {
                const next = current.length >= 3 ? [...current.slice(1), { name, state: st }] : [...current, { name, state: st }];
                set('comparisons')(next);
              }
            }}
            comparisons={comparisons || []}
            compareColors={COMPARE_COLORS}
            onClearCompare={() => set('comparisons')([])}
            onDelete={deleteScenario}
            onApplyTemplate={(name, overrides) => { dispatch({ type: 'APPLY_TEMPLATE', overrides }); set('scenarioName')(name); }}
            onCompareTemplate={(name, overrides) => {
              const current = comparisons || [];
              const existing = current.findIndex(c => c.name === name);
              if (existing >= 0) {
                set('comparisons')(current.filter((_, i) => i !== existing));
              } else {
                const templateState = gatherState({ ...state, ...overrides });
                const next = current.length >= 3 ? [...current.slice(1), { name, state: templateState }] : [...current, { name, state: templateState }];
                set('comparisons')(next);
              }
            }}
            storageStatus={storageStatus}
            storageAvailable={storageAvailable}
          />
        )}

        <AppShell
          summary={plannerSummary}
          tabs={plannerTabs}
          workspace={plannerWorkspace}
          rail={plannerRail}
          showRail={showRail}
          compact={compactShell}
          railPlacement={railPlacement}
          railWidth={railConfig.railWidth}
          onRailWidthChange={railConfig.setRailWidthLive}
          onRailWidthCommit={railConfig.commitRailWidth}
        />
      </div>
    </div>
  );
}
