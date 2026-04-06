import { useReducer, useMemo, useEffect, useState, useDeferredValue, useCallback, useRef, Suspense, lazy } from "react";
import { DAYS_PER_MONTH, SSDI_ATTORNEY_FEE_CAP } from './model/constants.js';
import { fmt, fmtFull } from './model/formatters.js';
import { getVestEvents, getTotalRemainingVesting } from './model/vesting.js';
import { computeProjection, findOperationalBreakevenIndex } from './model/projection.js';
import { exportModelData } from './model/exportData.js';
import { evaluateAllGoals } from './model/goalEvaluation.js';
import { INITIAL_STATE, MODEL_KEYS } from './state/initialState.js';
import { reducer } from './state/reducer.js';
import { gatherState as _gatherState } from './state/gatherState.js';
import { saveModelState, loadModelState } from './state/autoSave.js';
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
import RiskTab from './panels/tabs/RiskTab.jsx';
import DetailsTab from './panels/tabs/DetailsTab.jsx';
import TrackTab from './panels/tabs/TrackTab.jsx';
import ActualsTab from './panels/tabs/ActualsTab.jsx';
import { sanitizeMonthlyActuals } from './model/csvParser.js';
import { getCurrentModelMonth, buildReforecast } from './model/checkIn.js';
import { getShellWidthBucket } from './ui/tokens.js';
import { useIsVisible } from './ui/useIsVisible.js';
import { noteCompute } from './testing/perfMetrics.js';

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

export default function FinancialModel() {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const [shellWidthBucket, setShellWidthBucket] = useState(getInitialShellWidthBucket);
  const [retirementSpendingTargets, setRetirementSpendingTargets] = useState(null);
  const handleResetAll = () => {
    const confirmed = typeof window === 'undefined'
      ? true
      : window.confirm('Reset all assumptions back to the baseline model?');
    if (!confirmed) return;
    dispatch({ type: 'RESET_ALL' });
  };

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

  const {
    sarahRate, sarahMaxRate, sarahRateGrowth, sarahCurrentClients, sarahMaxClients, sarahClientGrowth, sarahTaxRate, sarahWorkYears,
    msftPrice, msftGrowth,
    ssType, ssdiApprovalMonth, ssdiDenied, ssdiPersonal, ssdiFamilyTotal, kidsAgeOutMonths, chadConsulting,
    ssFamilyTotal, ssPersonal, ssStartMonth, ssKidsAgeOutMonths,
    chadJob, chadJobSalary, chadJobTaxRate, chadJobStartMonth, chadJobHealthSavings,
    totalMonthlySpend, oneTimeExtras, oneTimeMonths, baseExpenses, debtService,
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
    debtCC, debtPersonal, debtIRS, debtFirstmark,
    savedScenarios, scenarioName, showSaveLoad, presentMode,
    compareState, compareName,
    starting401k, return401k, homeEquity, homeAppreciation,
    mcResults, mcRunning, mcNumSims, mcInvestVol, mcBizGrowthVol, mcMsftVol, mcSsdiDelay, mcSsdiDenialPct, mcCutsDiscipline,
    seqBadY1, seqBadY2,
    goals,
    storageStatus,
    activeTab,
    checkInHistory, activeCheckInMonth,
    monthlyActuals, merchantClassifications,
  } = state;

  // Backward-compatible computed totals from individual cuts
  const lifestyleCuts = cutOliver + cutVacation + cutGym;
  const cutInHalf = cutMedical + cutShopping + cutSaaS;
  const extraCuts = cutAmazon + cutEntertainment + cutGroceries + cutPersonalCare + cutSmallItems;

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
  const oneTimeTotal = (moldInclude ? moldCost : 0) + (roofInclude ? roofCost : 0) + (otherInclude ? otherProjects : 0);
  const advanceNeeded = (retireDebt ? debtTotal : 0) + oneTimeTotal;
  const ssdiBackPayGross = ssdiBackPayMonths * ssdiPersonal;
  const ssdiAttorneyFee = Math.min(Math.round(ssdiBackPayGross * 0.25), SSDI_ATTORNEY_FEE_CAP);

  const gatherState = (src) => _gatherState(src || state);

  // Projections — use deferred state so computation doesn't block slider interaction.
  // React will skip intermediate computations during rapid drag and only compute when idle.
  const deferredState = useDeferredValue(state);
  const projection = useMemo(
    () => {
      noteCompute('projection');
      return computeProjection(gatherState(deferredState));
    },
    [deferredState],
  );
  const data = projection.data;
  const savingsData = projection.savingsData;
  const monthlyDetail = projection.monthlyData;
  const ssdiBackPayActual = projection.backPayActual;

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

  const currentModelMonth = useMemo(() => getCurrentModelMonth(), []);

  const reforecastProjection = useMemo(() => {
    if (!checkInHistory || checkInHistory.length === 0) return null;
    const latest = checkInHistory[checkInHistory.length - 1];
    return buildReforecast(gatherState, latest);
  }, [checkInHistory, deferredState]);

  const compareProjection = useMemo(() => {
    if (!compareState) return null;
    return computeProjection(compareState);
  }, [compareState]);

  // Scenario persistence
  const restoreState = (s) => {
    if (!s) return;
    dispatch({ type: 'RESTORE_STATE', state: s });
  };

  const storageAvailable = typeof window !== "undefined" && window.storage && typeof window.storage.set === "function";

  useEffect(() => {
    if (!storageAvailable) {
      set('storageStatus')("no-storage");
      return;
    }
    (async () => {
      try {
        const result = await window.storage.get("fin-scenarios");
        if (result && result.value) {
          const parsed = JSON.parse(result.value);
          if (Array.isArray(parsed)) {
            set('savedScenarios')(parsed);
            set('storageStatus')(`loaded-${parsed.length}`);
          }
        }
      } catch (e) {
        set('storageStatus')("empty");
      }
    })();
  }, []);

  // Restore model state on mount
  useEffect(() => {
    if (!storageAvailable) return;
    (async () => {
      try {
        const saved = await loadModelState(window.storage);
        if (saved) dispatch({ type: 'RESTORE_STATE', state: saved });
      } catch (e) { /* no saved model state */ }
    })();
  }, []);

  // Auto-save model state (debounced — waits 500ms after last change)
  const saveTimerRef = useRef(null);
  useEffect(() => {
    if (!storageAvailable) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveModelState(window.storage, state);
    }, 500);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [state, storageAvailable]);

  useEffect(() => {
    if (!storageAvailable) return;
    (async () => {
      try {
        const result = await window.storage.get("fin-check-ins");
        if (result && result.value) {
          const parsed = JSON.parse(result.value);
          if (Array.isArray(parsed)) {
            dispatch({ type: 'RESTORE_STATE', state: { checkInHistory: parsed } });
          }
        }
      } catch (e) { /* no saved check-ins */ }
    })();
  }, []);

  useEffect(() => {
    if (!storageAvailable || !checkInHistory.length) return;
    (async () => {
      try {
        await window.storage.set("fin-check-ins", JSON.stringify(checkInHistory));
      } catch (e) { /* storage write failed */ }
    })();
  }, [checkInHistory, storageAvailable]);

  // Restore monthlyActuals from storage
  useEffect(() => {
    if (!storageAvailable) return;
    (async () => {
      try {
        const result = await window.storage.get("fin-actuals");
        if (result && result.value) {
          const parsed = sanitizeMonthlyActuals(JSON.parse(result.value));
          if (Object.keys(parsed).length > 0) {
            dispatch({ type: 'SET_FIELD', field: 'monthlyActuals', value: parsed });
          }
        }
        const mcResult = await window.storage.get("fin-merchant-classifications");
        if (mcResult && mcResult.value) {
          const parsed = JSON.parse(mcResult.value);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            dispatch({ type: 'SET_FIELD', field: 'merchantClassifications', value: parsed });
          }
        }
      } catch (e) { /* no saved actuals */ }
    })();
  }, []);

  // Persist monthlyActuals to storage
  useEffect(() => {
    if (!storageAvailable || !Object.keys(monthlyActuals).length) return;
    (async () => {
      try {
        await window.storage.set("fin-actuals", JSON.stringify(monthlyActuals));
        await window.storage.set("fin-merchant-classifications", JSON.stringify(merchantClassifications));
      } catch (e) { /* storage write failed */ }
    })();
  }, [monthlyActuals, merchantClassifications, storageAvailable]);

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

  const saveScenario = async (name) => {
    if (!name.trim()) return;
    const st = gatherState();
    const entry = { name: name.trim(), state: st, schemaVersion: st.schemaVersion, savedAt: new Date().toISOString() };
    const updated = [...savedScenarios.filter(s => s.name !== name.trim()), entry];
    set('savedScenarios')(updated);
    set('scenarioName')("");
    if (!storageAvailable) { set('storageStatus')("no-storage"); return; }
    try {
      const val = JSON.stringify(updated);
      const result = await window.storage.set("fin-scenarios", val);
      if (result) {
        set('storageStatus')("saved");
        setTimeout(() => set('storageStatus')(""), 3000);
      } else {
        set('storageStatus')("set-returned-null");
      }
    } catch (e) {
      set('storageStatus')("error: " + e.message);
    }
  };

  const deleteScenario = async (name) => {
    const updated = savedScenarios.filter(s => s.name !== name);
    set('savedScenarios')(updated);
    if (storageAvailable) {
      try { await window.storage.set("fin-scenarios", JSON.stringify(updated)); } catch (e) { /* */ }
    }
  };

  // Monte Carlo — dynamic import keeps monteCarlo.js out of the main bundle
  const handleRunMonteCarlo = () => {
    set('mcRunning')(true);
    import('./model/monteCarlo.js').then(({ runMonteCarlo }) => {
      setTimeout(() => {
        const base = gatherState();
        const mcParams = { mcNumSims, mcInvestVol, mcBizGrowthVol, mcMsftVol, mcSsdiDelay, mcSsdiDenialPct, mcCutsDiscipline };
        const mcSeed = typeof window !== 'undefined' && window.__FIN_MODEL_TEST__ && typeof window.__FIN_MODEL_TEST__.getMonteCarloSeed === 'function'
          ? window.__FIN_MODEL_TEST__.getMonteCarloSeed()
          : null;
        const results = runMonteCarlo(base, mcParams, goals, { seed: mcSeed });
        set('mcResults')(results);
        set('mcRunning')(false);
      }, 50);
    });
  };

  // Savings zero-crossing
  const savingsZeroMonth = savingsData.find(d => d.balance <= 0);
  const savingsZeroLabel = savingsZeroMonth ? `~${Math.round(savingsZeroMonth.month)} months` : `${sarahWorkYears || 6}+ years`;

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
  const chadJobNetForGap = chadJobImmediate ? Math.round((chadJobSalary || 80000) * (1 - (chadJobTaxRate || 25) / 100) / 12) : 0;
  const chadJobHealthForGap = chadJobImmediate ? (chadJobHealthSavings || 4200) : 0;
  const totalCurrentIncome = sarahCurrentNet + currentMsft + trustIncomeNow + chadJobNetForGap;
  const extrasAtMonth0 = (oneTimeExtras || 0) > 0 && (oneTimeMonths || 0) > 0 ? oneTimeExtras : 0;
  const totalCurrentExpenses = Math.max(effectiveBaseExpenses + debtService + vanMonthlySavings + bcsFamilyMonthly - chadJobHealthForGap + extrasAtMonth0, 0);
  const rawMonthlyGap = totalCurrentIncome - totalCurrentExpenses;

  // Steady state net at Y3
  const steadyIdxRaw = data.findIndex(d => d.month >= 36);
  const steadyIdx = steadyIdxRaw >= 0 ? steadyIdxRaw : data.length - 1;
  const steadyStateNet = data[steadyIdx]?.netMonthly || data[data.length - 1].netMonthly;

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
    const minNet = Math.min(...data.map(d => d.netMonthly));
    const maxNet = Math.max(...data.map(d => d.netMonthly));
    const maxVesting = Math.max(...data.map(d => d.msftVesting));
    const chartH = 380;
    const netRange = Math.max(Math.abs(minNet), Math.abs(maxNet)) || 1;
    const breakevenIdx = findOperationalBreakevenIndex(data);
    const bestIdx = data.reduce((bestI, d, i) => d.netMonthly > data[bestI].netMonthly ? i : bestI, 0);
    const bestProjectedGap = data[bestIdx]?.netMonthly ?? data[0]?.netMonthly ?? rawMonthlyGap;
    const bestProjectedLabel = data[bestIdx]?.label ?? '';
    const highlightIdx = breakevenIdx >= 0 ? breakevenIdx : bestIdx;
    const highlightLabel = breakevenIdx >= 0 ? "BREAKEVEN" : "BEST";
    const breakevenLabel = breakevenIdx >= 0 ? data[breakevenIdx].label : `Best: ${fmt(data[bestIdx].netMonthly)} at ${data[bestIdx].label}`;
    return { minNet, maxNet, maxVesting, chartH, netRange, breakevenIdx, bestIdx, bestProjectedGap, bestProjectedLabel, highlightIdx, highlightLabel, breakevenLabel };
  }, [data, rawMonthlyGap]);
  const { minNet, maxNet, maxVesting, chartH, netRange, breakevenIdx, bestIdx, bestProjectedGap, bestProjectedLabel, highlightIdx, highlightLabel, breakevenLabel } = chartHelpers;

  // === PROP BUNDLES for tab components ===
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

  const timelineProps = useMemo(() => ({
    retireDebt, debtService,
    ssType, ssdiApprovalMonth, ssdiFamilyTotal,
    ssdiPersonal, ssdiBackPayActual,
    ssFamilyTotal, ssPersonal, ssStartMonth, ssKidsAgeOutMonths,
    chadConsulting, milestones,
    bcsYearsLeft, bcsFamilyMonthly,
    trustIncomeNow, trustIncomeFuture, trustIncreaseMonth,
    vanSold, vanMonthlySavings,
    kidsAgeOutMonths, msftGrowth,
    currentMsftVesting: data[0].msftVesting,
    sarahWorkYears,
  }), [
    retireDebt, debtService,
    ssType, ssdiApprovalMonth, ssdiFamilyTotal,
    ssdiPersonal, ssdiBackPayActual,
    ssFamilyTotal, ssPersonal, ssStartMonth, ssKidsAgeOutMonths,
    chadConsulting, milestones,
    bcsYearsLeft, bcsFamilyMonthly,
    trustIncomeNow, trustIncomeFuture, trustIncreaseMonth,
    vanSold, vanMonthlySavings,
    kidsAgeOutMonths, msftGrowth, data, sarahWorkYears,
  ]);

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
    advanceNeeded, shellWidthBucket,
  ]);

  const cashFlowProps = useMemo(() => ({
    data, chartH, netRange,
    minNet, maxNet, maxVesting,
    highlightIdx, highlightLabel,
    ssType, ssdiApprovalMonth, ssdiFamilyTotal,
    msftGrowth,
  }), [
    data, chartH, netRange,
    minNet, maxNet, maxVesting,
    highlightIdx, highlightLabel,
    ssType, ssdiApprovalMonth, ssdiFamilyTotal,
    msftGrowth,
  ]);

  const incomeControlsProps = useMemo(() => ({
    ssType, ssdiDenied,
    ssdiFamilyTotal, ssdiPersonal, kidsAgeOutMonths,
    ssdiApprovalMonth, ssdiBackPayMonths,
    ssdiBackPayGross, ssdiAttorneyFee, ssdiBackPayActual,
    ssFamilyTotal, ssPersonal, ssStartMonth, ssKidsAgeOutMonths,
    chadConsulting,
    chadJob, chadJobSalary, chadJobTaxRate, chadJobStartMonth, chadJobHealthSavings,
    trustIncomeNow, trustIncomeFuture, trustIncreaseMonth,
    vanSold, vanMonthlySavings, vanSalePrice, vanLoanBalance, vanSaleMonth,
    onFieldChange: set,
  }), [
    ssType, ssdiDenied,
    ssdiFamilyTotal, ssdiPersonal, kidsAgeOutMonths,
    ssdiApprovalMonth, ssdiBackPayMonths,
    ssdiBackPayGross, ssdiAttorneyFee, ssdiBackPayActual,
    ssFamilyTotal, ssPersonal, ssStartMonth, ssKidsAgeOutMonths,
    chadConsulting,
    chadJob, chadJobSalary, chadJobTaxRate, chadJobStartMonth, chadJobHealthSavings,
    trustIncomeNow, trustIncomeFuture, trustIncreaseMonth,
    vanSold, vanMonthlySavings, vanSalePrice, vanLoanBalance, vanSaleMonth,
  ]);

  const expenseControlsProps = useMemo(() => ({
    totalMonthlySpend, baseExpenses: effectiveBaseExpenses, debtService,
    debtTotal, retireDebt,
    lifestyleCutsApplied, cutsOverride,
    bcsAnnualTotal, bcsParentsAnnual, bcsYearsLeft, bcsFamilyMonthly,
    vanSold, vanMonthlySavings, vanSaleMonth,
    chadJob, chadJobStartMonth, chadJobHealthSavings,
    milestones,
    moldCost, moldInclude, roofCost, roofInclude,
    otherProjects, otherInclude,
    onFieldChange: set,
  }), [
    totalMonthlySpend, effectiveBaseExpenses, debtService,
    debtTotal, retireDebt,
    lifestyleCutsApplied, cutsOverride,
    bcsAnnualTotal, bcsParentsAnnual, bcsYearsLeft, bcsFamilyMonthly,
    vanSold, vanMonthlySavings, vanSaleMonth,
    chadJob, chadJobStartMonth, chadJobHealthSavings,
    milestones,
    moldCost, moldInclude, roofCost, roofInclude,
    otherProjects, otherInclude,
  ]);

  const stableGatherState = useCallback(() => gatherState(), [state]);
  const monteCarloProps = useMemo(() => ({
    mcResults, mcRunning,
    mcNumSims, mcInvestVol, mcBizGrowthVol,
    mcMsftVol, mcSsdiDelay, mcSsdiDenialPct, mcCutsDiscipline,
    onParamChange: set, onRun: handleRunMonteCarlo,
    savingsData, presentMode,
    gatherState: stableGatherState,
    mcParams: { mcNumSims, mcInvestVol, mcBizGrowthVol, mcMsftVol, mcSsdiDelay, mcSsdiDenialPct, mcCutsDiscipline },
  }), [
    mcResults, mcRunning,
    mcNumSims, mcInvestVol, mcBizGrowthVol,
    mcMsftVol, mcSsdiDelay, mcSsdiDenialPct, mcCutsDiscipline,
    savingsData, presentMode, stableGatherState,
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
    monthlyDetail, presentMode,
  ]);

  const savingsDrawdownProps = useMemo(() => ({
    savingsData, savingsZeroMonth, savingsZeroLabel,
    compareProjection, compareName,
    data, startingSavings, investmentReturn,
    debtCC, debtPersonal, debtIRS, debtFirstmark,
    debtService, ssdiApprovalMonth, ssdiBackPayActual,
    milestones, retireDebt, presentMode,
    onFieldChange: set, baseExpenses: effectiveBaseExpenses, totalMonthlySpend,
  }), [
    savingsData, savingsZeroMonth, savingsZeroLabel,
    compareProjection, compareName,
    data, startingSavings, investmentReturn,
    debtCC, debtPersonal, debtIRS, debtFirstmark,
    debtService, ssdiApprovalMonth, ssdiBackPayActual,
    milestones, retireDebt, presentMode, effectiveBaseExpenses, totalMonthlySpend,
  ]);

  const netWorthProps = useMemo(() => ({
    savingsData, wealthData,
    starting401k, return401k,
    homeEquity, homeAppreciation,
    presentMode, onFieldChange: set,
  }), [
    savingsData, wealthData,
    starting401k, return401k,
    homeEquity, homeAppreciation,
    presentMode,
  ]);

  // Stable risk-tab variants with instanceId baked in (avoids inline spread that defeats memo)
  const riskSavingsDrawdownProps = useMemo(
    () => ({ ...savingsDrawdownProps, instanceId: 'risk-tab' }),
    [savingsDrawdownProps],
  );
  const riskNetWorthProps = useMemo(
    () => ({ ...netWorthProps, instanceId: 'risk-tab' }),
    [netWorthProps],
  );

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

  const trackTabProps = useMemo(() => ({
    checkInHistory,
    monthlyDetail,
    currentModelMonth,
    onRecordCheckIn: (checkIn) => dispatch({ type: 'RECORD_CHECK_IN', checkIn }),
    onDeleteCheckIn: (month) => dispatch({ type: 'DELETE_CHECK_IN', month }),
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
  const showRail = !presentMode && effectiveTab !== 'plan';
  const railPlacement = !showRail
    ? 'hidden'
    : (effectiveTab === 'overview' || effectiveTab === 'track')
      ? 'below'
      : shellWidthBucket === 'desktop'
        ? 'side'
        : 'below';
  const compactShell = shellWidthBucket === 'compact';
  const showCompareBanner = !presentMode && Boolean(compareState);
  // Rail charts use useDeferredValue for prioritization — no additional delay needed.
  // A hard debounce here prevents charts from updating at all during slider drag.
  const goalPanelProps = useMemo(() => ({
    goals,
    goalResults,
    mcGoalResults,
    mcRunning,
    presentMode,
    onGoalsChange: (newGoals) => set('goals')(newGoals),
  }), [goals, goalResults, mcGoalResults, mcRunning, presentMode]);

  const deferredPlanBridgeProps = useDeferredValue(bridgeProps);
  const deferredCashFlowProps = useDeferredValue(cashFlowProps);
  // savingsDrawdownProps and netWorthProps are NOT deferred — they contain sliders
  // whose values must update immediately. The projection data inside them is already
  // deferred via deferredState (layer 1), so no second defer is needed.
  const retirementRailProps = useMemo(() => ({
    savingsData,
    wealthData,
    ssType,
    ssPersonal,
    chadJob,
    trustIncomeFuture,
    onSpendingTargets: setRetirementSpendingTargets,
  }), [savingsData, wealthData, ssType, ssPersonal, chadJob, trustIncomeFuture]);
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
          totalCurrentExpenses={totalCurrentExpenses}
          retirementSpendingTargets={retirementSpendingTargets}
          onFieldChange={set}
        />

        <ActiveTogglePills
          retireDebt={retireDebt}
          lifestyleCutsApplied={lifestyleCutsApplied}
          vanSold={vanSold}
          debtService={debtService}
          totalCuts={cutsOverride ?? 0}
        />

        {showCompareBanner ? (
          <ComparisonBanner
            compareState={compareState}
            compareName={compareName}
            onClearCompare={() => { set('compareState')(null); set('compareName')(''); }}
          />
        ) : null}
      </>
    );
  }, [
    showTopSummary,
    data,
    breakevenLabel,
    breakevenIdx,
    savingsZeroLabel,
    savingsZeroMonth,
    advanceNeeded,
    totalMonthlySpend,
    totalCurrentIncome,
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
    lifestyleCuts,
    cutInHalf,
    extraCuts,
    showCompareBanner,
    compareState,
    compareName,
    retirementSpendingTargets,
  ]);

  const plannerTabs = useMemo(() => (
    showTabs ? <TabBar activeTab={effectiveTab} onChange={set('activeTab')} compact={compactShell} /> : null
  ), [showTabs, effectiveTab, compactShell]);

  const plannerWorkspace = useMemo(() => (
    <>
      {effectiveTab === 'overview' && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: shellWidthBucket === 'desktop' ? 'minmax(0, 1fr) minmax(320px, 420px)' : '1fr',
          gap: 24,
          alignItems: 'start',
        }}>
          <div>
            <SavingsDrawdownChart {...savingsDrawdownProps} instanceId='overview' />
            <OverviewTab
              bridgeProps={bridgeProps}
              rawMonthlyGap={rawMonthlyGap}
              savingsZeroLabel={savingsZeroLabel}
              savingsZeroMonth={savingsZeroMonth}
              mcResults={mcResults}
              onTabChange={set('activeTab')}
            />
          </div>
          {shellWidthBucket === 'desktop' && (
            <div style={{ position: 'sticky', top: 24, alignSelf: 'start' }}>
              <LazyRetirementChart {...deferredRetirementRailProps} />
            </div>
          )}
        </div>
      )}

      {effectiveTab === 'plan' && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: shellWidthBucket === 'desktop' ? 'minmax(0, 1fr) minmax(320px, 420px)' : '1fr',
          gap: 24,
          alignItems: 'start',
        }}>
          <PlanTab
            incomeControlsProps={incomeControlsProps}
            expenseControlsProps={expenseControlsProps}
            scenarioStripProps={scenarioStripProps}
            shellWidthBucket={shellWidthBucket}
            presentMode={presentMode}
            gatherState={stableGatherState}
          />
          {shellWidthBucket === 'desktop' && (
            <div style={{ position: 'sticky', top: 24, alignSelf: 'start' }}>
              <SavingsDrawdownChart {...savingsDrawdownProps} instanceId='plan' />
              <LazyRetirementChart {...deferredRetirementRailProps} />
            </div>
          )}
        </div>
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
          dispatch={dispatch}
        />
      )}

      {effectiveTab === 'income' && (
        <IncomeTab
          vestEvents={vestEvents} totalRemainingVesting={totalRemainingVesting}
          msftPrice={msftPrice} msftGrowth={msftGrowth} onMsftGrowthChange={set('msftGrowth')} onMsftPriceChange={set('msftPrice')}
          sarahRate={sarahRate} sarahMaxRate={sarahMaxRate} sarahRateGrowth={sarahRateGrowth}
          sarahCurrentClients={sarahCurrentClients} sarahMaxClients={sarahMaxClients} sarahClientGrowth={sarahClientGrowth}
          sarahTaxRate={sarahTaxRate} sarahWorkYears={sarahWorkYears}
          sarahCurrentGross={sarahCurrentGross} sarahCurrentNet={sarahCurrentNet}
          sarahCeilingGross={sarahCeilingGross} sarahCeiling={sarahCeiling}
          onFieldChange={set}
          data={data} investmentReturn={investmentReturn}
          vanSold={vanSold} vanSaleMonth={vanSaleMonth} vanMonthlySavings={vanMonthlySavings}
          bcsYearsLeft={bcsYearsLeft} milestones={milestones}
        />
      )}

      {effectiveTab === 'risk' && (
        <RiskTab
          monteCarloProps={monteCarloProps}
          seqReturnsProps={seqReturnsProps}
          savingsDrawdownProps={riskSavingsDrawdownProps}
          netWorthProps={riskNetWorthProps}
          sarahWorkYears={sarahWorkYears}
          showEmbeddedBalanceCharts={!showRail}
        />
      )}

      {effectiveTab === 'details' && (
        <DetailsTab
          dataTableProps={dataTableProps}
          summaryAskProps={summaryAskProps}
          presentMode={presentMode}
        />
      )}
    </>
  ), [
    effectiveTab,
    bridgeProps,
    deferredPlanBridgeProps,
    deferredCashFlowProps,
    incomeControlsProps,
    expenseControlsProps,
    scenarioStripProps,
    deferredGoalPanelProps,
    shellWidthBucket,
    presentMode,
    vestEvents,
    totalRemainingVesting,
    msftGrowth,
    sarahRate,
    sarahMaxRate,
    sarahRateGrowth,
    sarahCurrentClients,
    sarahMaxClients,
    sarahClientGrowth,
    data,
    investmentReturn,
    vanSold,
    vanSaleMonth,
    vanMonthlySavings,
    bcsYearsLeft,
    milestones,
    monteCarloProps,
    seqReturnsProps,
    savingsDrawdownProps,
    netWorthProps,
    showRail,
    dataTableProps,
    summaryAskProps,
    trackTabProps,
    rawMonthlyGap,
    savingsZeroLabel,
    savingsZeroMonth,
    mcResults,
  ]);

  const plannerRail = useMemo(() => (
    <>
      <SavingsDrawdownChart
        {...savingsDrawdownProps}
        instanceId={effectiveTab === 'risk' ? 'right-rail' : 'shared-rail'}
      />
      <NetWorthChart
        {...netWorthProps}
        instanceId={effectiveTab === 'risk' ? 'right-rail' : 'shared-rail'}
      />
      <LazyRetirementChart {...deferredRetirementRailProps} />
    </>
  ), [savingsDrawdownProps, netWorthProps, deferredRetirementRailProps, effectiveTab]);

  return (
    <div style={{
      fontFamily: "'Inter', -apple-system, sans-serif",
      background: "#0f172a",
      color: "#e2e8f0",
      minHeight: "100vh",
      padding: "24px 16px"
    }}>
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
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
              if (compareState && compareName === name) { set('compareState')(null); set('compareName')(""); }
              else { set('compareState')(st); set('compareName')(name); }
            }}
            compareName={compareName}
            onClearCompare={() => { set('compareState')(null); set('compareName')(""); }}
            onDelete={deleteScenario}
            onApplyTemplate={(overrides) => dispatch({ type: 'SET_FIELDS', fields: overrides })}
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
        />
      </div>
    </div>
  );
}
