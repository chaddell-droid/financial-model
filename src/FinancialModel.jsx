import { useReducer, useMemo, useEffect, useState, useDeferredValue, useCallback, useRef, Suspense, lazy } from "react";
import { DAYS_PER_MONTH, SSDI_ATTORNEY_FEE_CAP } from './model/constants.js';
import { fmt, fmtFull } from './model/formatters.js';
import { getVestEvents, getTotalRemainingVesting } from './model/vesting.js';
import { computeProjection, findOperationalBreakevenIndex } from './model/projection.js';
import { exportModelData } from './model/exportData.js';
import { evaluateAllGoals } from './model/goalEvaluation.js';
import { INITIAL_STATE, MODEL_KEYS } from './state/initialState.js';
import { withProvenanceAll, DEFAULT_PROVENANCE, buildRecommendationProvenance } from './state/scenarioProvenance.js';
import { reducer } from './state/reducer.js';
import { gatherState as _gatherState, deriveCapitalItemsFromLegacy, prepareComparisonState, computeOneTimeTotal } from './state/gatherState.js';
import { buildTaxSchedule } from './model/taxProjection.js';
import { saveModelState, loadModelState } from './state/autoSave.js';
import { safeWrite, createHydrationGate, mergeScenarioLists } from './state/safeStorage.js';
import { sanitizeCheckInHistory } from './state/schemaValidation.js';
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
const AdvisorPane = lazy(() => import('./panels/AdvisorPane.jsx'));
import { sanitizeMonthlyActuals } from './model/csvParser.js';
import { getCurrentModelMonth, buildReforecast } from './model/checkIn.js';
import { getShellWidthBucket } from './ui/tokens.js';
import { useIsVisible } from './ui/useIsVisible.js';
import { noteCompute } from './testing/perfMetrics.js';
import { useRailConfig } from './rail/useRailConfig.js';
import RailRenderer from './rail/RailRenderer.jsx';
import BridgeChart from './charts/BridgeChart.jsx';
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

export default function FinancialModel() {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const [shellWidthBucket, setShellWidthBucket] = useState(getInitialShellWidthBucket);
  const [retirementSpendingTargets, setRetirementSpendingTargets] = useState(null);
  const railConfig = useRailConfig();

  // Hydration gates (remediation 1.3c): each persistence layer's auto-save
  // effect stays disarmed until its restore promise settles, so the boot
  // race (debounced save firing with INITIAL_STATE before the async restore
  // lands) can never overwrite stored data.
  const hydrationRef = useRef(null);
  if (hydrationRef.current === null) {
    hydrationRef.current = {
      model: createHydrationGate(),
      checkIns: createHydrationGate(),
      actuals: createHydrationGate(),
    };
  }
  const hydration = hydrationRef.current;
  // Set when the user explicitly resets to baseline (RESET_ALL) so the next
  // auto-save may legitimately write an INITIAL_STATE-equivalent payload
  // through the guard's intentionalClear escape hatch (backup taken first).
  const intentionalModelResetRef = useRef(false);
  // Set by explicit user deletions/resets (RESET_ACTUALS_*, DELETE_CHECK_IN)
  // so the next persist may legitimately shrink/empty the stored payload.
  const actualsClearIntentRef = useRef(false);
  const checkInClearIntentRef = useRef(false);
  // Set when the fin-scenarios payload exists but could not be parsed: the
  // next save re-reads + merges instead of overwriting (remediation 1.3).
  const scenariosLoadFailedRef = useRef(false);

  const handleResetAll = () => {
    const confirmed = typeof window === 'undefined'
      ? true
      : window.confirm('Reset all assumptions back to the baseline model?');
    if (!confirmed) return;
    intentionalModelResetRef.current = true;
    dispatch({ type: 'RESET_ALL' });
  };

  const patchUiState = (patch) => {
    dispatch({ type: 'SET_FIELDS', fields: patch });
  };

  // Dispatch wrapper for ActualsTab: flags explicit resets so the actuals
  // persist effect routes the shrink/empty write through the guard's
  // intentionalClear escape hatch (remediation 1.4).
  const actualsDispatch = useCallback((action) => {
    if (action && (action.type === 'RESET_ACTUALS_MONTH' || action.type === 'RESET_ACTUALS_ALL')) {
      actualsClearIntentRef.current = true;
    }
    dispatch(action);
  }, [dispatch]);

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
    sarahCurrentAge, sarahOwnSS,
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
    capitalItems, customLevers,
    debtCC, debtPersonal, debtIRS, debtFirstmark,
    savedScenarios, scenarioName, showSaveLoad, presentMode,
    comparisons,
    starting401k, return401k, homeEquity, homeAppreciation,
    mcResults, mcRunning, mcNumSims, mcInvestVol, mcBizGrowthVol, mcMsftVol, mcSsdiDelay, mcSsdiDenialPct, mcCutsDiscipline,
    seqBadY1, seqBadY2,
    goals,
    storageStatus,
    activeTab,
    checkInHistory, activeCheckInMonth,
    monthlyActuals, merchantClassifications,
    previewMoves,
    leverConstraintsOverride,
  } = state;
  leverConstraintsOverrideRef.current = leverConstraintsOverride;

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

  // Projected PERS pension at retirement — mirrors gatherState.chadJobPensionMonthly
  const chadJobPensionMonthly = (chadJob && chadJobPensionRate > 0)
    ? Math.round((chadJobSalary / 12) * (chadJobPensionRate / 100) * Math.max(0, ((chadWorkMonths || 72) - (chadJobStartMonth || 0)) / 12))
    : 0;

  // Mirror of projection.js back-pay formula. Auxiliary back pay for dependent kids
  // (the portion of family total exceeding the worker's PIA) is added on top, bounded
  // by kidsAgeOutMonths. Attorney fee applies only to the worker's share.
  const ssdiAuxBackPayMonths = Math.min(ssdiBackPayMonths, kidsAgeOutMonths || 0);
  const ssdiAdultBackPayGross = ssdiBackPayMonths * ssdiPersonal;
  const ssdiAuxBackPayGross = ssdiAuxBackPayMonths * Math.max(0, (ssdiFamilyTotal || 0) - ssdiPersonal);
  const ssdiBackPayGross = ssdiAdultBackPayGross + ssdiAuxBackPayGross;
  const ssdiAttorneyFee = Math.min(Math.round(ssdiAdultBackPayGross * 0.25), SSDI_ATTORNEY_FEE_CAP);

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

  const currentModelMonth = useMemo(() => getCurrentModelMonth(), []);

  const reforecastProjection = useMemo(() => {
    if (!checkInHistory || checkInHistory.length === 0) return null;
    const latest = checkInHistory[checkInHistory.length - 1];
    return buildReforecast(gatherState, latest);
  }, [checkInHistory, deferredState]);

  // Multi-comparison: compute projections for up to 3 comparisons.
  // Compared states are SAVED scenario payloads — route them through the same
  // migrate + validateAndSanitize + gatherState pipeline as loading, so an
  // old-schema scenario compares identically to loading it (remediation phase 5).
  const COMPARE_COLORS = ['#fbbf24', '#22d3ee', '#c084fc']; // yellow, cyan, purple
  const compareProjections = useMemo(() => {
    return (comparisons || []).map(c => ({
      name: c.name,
      projection: computeProjection(prepareComparisonState(c.state)),
    }));
  }, [comparisons]);

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
      // Separate read vs parse failures: a missing key is "empty", but a
      // stored payload that won't parse is a FAILED load — flag it so the
      // next save re-reads + merges instead of overwriting (remediation 1.3).
      let result = null;
      try {
        result = await window.storage.get("fin-scenarios");
      } catch (e) { /* nothing stored (polyfill throws on missing keys) */ }
      if (result && result.value) {
        try {
          const parsed = JSON.parse(result.value);
          if (Array.isArray(parsed)) {
            // Default provenance on legacy scenarios (idempotent, safe on every load).
            const normalized = withProvenanceAll(parsed);
            set('savedScenarios')(normalized);
            set('storageStatus')(`loaded-${normalized.length}`);
          } else {
            scenariosLoadFailedRef.current = true;
            set('storageStatus')("load-failed");
          }
        } catch (e) {
          scenariosLoadFailedRef.current = true;
          set('storageStatus')("load-failed");
        }
      } else {
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
      finally {
        // Settle even on failure — auto-save stays disarmed until here.
        hydration.model.settle();
      }
    })();
  }, []);

  // Auto-save model state (debounced — waits 500ms after last change).
  // Disarmed until the restore promise settles (remediation 1.3c) so a slow
  // restore can never lose the race against the first debounced save.
  const saveTimerRef = useRef(null);
  useEffect(() => {
    if (!storageAvailable) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      if (!hydration.model.isSettled()) return;
      const intentional = intentionalModelResetRef.current;
      intentionalModelResetRef.current = false;
      saveModelState(window.storage, state, { intentionalClear: intentional });
    }, 500);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [state, storageAvailable]);

  useEffect(() => {
    if (!storageAvailable) return;
    (async () => {
      try {
        const result = await window.storage.get("fin-check-ins");
        if (result && result.value) {
          // Dedicated restore (mirrors monthlyActuals below). NEVER route this
          // partial payload through RESTORE_STATE: checkInHistory is not a
          // MODEL_KEY, so validateAndSanitize would drop it AND reset every
          // other model field to defaults (remediation 1.1 data-loss bug).
          const parsed = sanitizeCheckInHistory(JSON.parse(result.value));
          if (parsed.length > 0) {
            dispatch({ type: 'SET_FIELD', field: 'checkInHistory', value: parsed });
          }
        }
      } catch (e) { /* no saved check-ins */ }
      finally { hydration.checkIns.settle(); }
    })();
  }, []);

  useEffect(() => {
    // Disarmed until the restore settles (remediation 1.3c). After that,
    // checkInHistory can only shrink via DELETE_CHECK_IN (which sets the
    // intent flag), so shrink/empty writes here are intentional clears
    // (remediation 1.4) — persisted through the escape hatch (backup taken
    // first) so deleting the last check-in sticks across reload.
    if (!storageAvailable || !hydration.checkIns.isSettled()) return;
    const intentional = checkInClearIntentRef.current || checkInHistory.length === 0;
    checkInClearIntentRef.current = false;
    (async () => {
      try {
        await safeWrite(window.storage, "fin-check-ins", JSON.stringify(checkInHistory), {
          intentionalClear: intentional,
          label: 'check-ins',
        });
      } catch (e) { /* storage write failed */ }
    })();
  }, [checkInHistory, storageAvailable]);

  // Restore monthlyActuals + merchantClassifications from storage.
  // Independent try-blocks (remediation 1.3): a failure restoring actuals
  // must not skip the classifications restore, and vice versa.
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
      } catch (e) { /* no saved actuals */ }
      try {
        const mcResult = await window.storage.get("fin-merchant-classifications");
        if (mcResult && mcResult.value) {
          const parsed = JSON.parse(mcResult.value);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            dispatch({ type: 'SET_FIELD', field: 'merchantClassifications', value: parsed });
          }
        }
      } catch (e) { /* no saved classifications */ }
      hydration.actuals.settle();
    })();
  }, []);

  // Persist monthlyActuals + merchantClassifications to storage.
  // Disarmed until the restore settles (remediation 1.3c). These maps only
  // shrink/empty via RESET_ACTUALS_MONTH/ALL (which set the intent flag via
  // actualsDispatch), so such writes are intentional clears (remediation
  // 1.4) — persisted through the escape hatch (backup taken first) so
  // resets stick across reload instead of resurrecting.
  useEffect(() => {
    if (!storageAvailable || !hydration.actuals.isSettled()) return;
    const intentional = actualsClearIntentRef.current;
    actualsClearIntentRef.current = false;
    (async () => {
      try {
        await safeWrite(window.storage, "fin-actuals", JSON.stringify(monthlyActuals), {
          intentionalClear: intentional || Object.keys(monthlyActuals).length === 0,
          label: 'actuals',
        });
        await safeWrite(window.storage, "fin-merchant-classifications", JSON.stringify(merchantClassifications), {
          intentionalClear: intentional || Object.keys(merchantClassifications).length === 0,
          label: 'merchant-classifications',
        });
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

  // Guarded write of the scenario list (remediation 1.3). If the boot-time
  // load FAILED (payload present but unreadable), the in-memory list may be
  // missing scenarios that are still on disk — re-read and merge (memory
  // wins on name conflicts) instead of overwriting. safeWrite then takes a
  // one-generation backup and refuses suspicious clobbers.
  const persistScenarios = async (updated, { intentionalClear = false } = {}) => {
    let toWrite = updated;
    if (scenariosLoadFailedRef.current) {
      let stored = null;
      try {
        const result = await window.storage.get("fin-scenarios");
        if (result && result.value) stored = JSON.parse(result.value);
      } catch (e) { /* still unreadable — safeWrite backs up the raw payload below */ }
      if (Array.isArray(stored)) {
        toWrite = mergeScenarioLists(updated, withProvenanceAll(stored));
        scenariosLoadFailedRef.current = false;
        set('savedScenarios')(toWrite);
      }
    }
    return safeWrite(window.storage, "fin-scenarios", JSON.stringify(toWrite), {
      intentionalClear,
      label: 'scenarios',
    });
  };

  const saveScenario = async (name, options = {}) => {
    // Make saveScenario reachable from saveFromPreview via the ref set on every render.
    // (Assigned below, after function declaration.)
    if (!name.trim()) return;
    const st = gatherState();
    // Provenance defaults to manual. Story 1.5's "Save from preview" path
    // passes options.provenance built via buildRecommendationProvenance.
    const provenance = options && options.provenance ? options.provenance : { ...DEFAULT_PROVENANCE };
    const entry = {
      name: name.trim(),
      state: st,
      schemaVersion: st.schemaVersion,
      savedAt: new Date().toISOString(),
      provenance,
    };
    const updated = [...savedScenarios.filter(s => s.name !== name.trim()), entry];
    set('savedScenarios')(updated);
    set('scenarioName')("");
    if (!storageAvailable) { set('storageStatus')("no-storage"); return; }
    try {
      const result = await persistScenarios(updated);
      if (result.ok) {
        set('storageStatus')("saved");
        setTimeout(() => set('storageStatus')(""), 3000);
      } else {
        set('storageStatus')(result.reason || "set-returned-null");
      }
    } catch (e) {
      set('storageStatus')("error: " + e.message);
    }
  };
  // Bind the ref so saveFromPreview (declared earlier) can call saveScenario.
  saveScenarioRef.current = saveScenario;

  const deleteScenario = async (name) => {
    const updated = savedScenarios.filter(s => s.name !== name);
    set('savedScenarios')(updated);
    if (storageAvailable) {
      // Deleting is explicit user intent — write through the escape hatch so
      // removing the last scenario sticks (backup taken first, remediation 1.4).
      try { await persistScenarios(updated, { intentionalClear: true }); } catch (e) { /* */ }
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
    ssClaimAge, ssFamilyTotal, ssPersonal, ssStartMonth, ssKidsAgeOutMonths,
    chadConsulting, milestones,
    bcsYearsLeft, bcsFamilyMonthly,
    trustIncomeNow, trustIncomeFuture, trustIncreaseMonth,
    vanSold, vanMonthlySavings,
    kidsAgeOutMonths, msftGrowth,
    currentMsftVesting: data[0].msftVesting,
    sarahWorkMonths,
  }), [
    retireDebt, debtService,
    ssType, ssdiApprovalMonth, ssdiFamilyTotal,
    ssdiPersonal, ssdiBackPayActual,
    ssClaimAge, ssFamilyTotal, ssPersonal, ssStartMonth, ssKidsAgeOutMonths,
    chadConsulting, milestones,
    bcsYearsLeft, bcsFamilyMonthly,
    trustIncomeNow, trustIncomeFuture, trustIncreaseMonth,
    vanSold, vanMonthlySavings,
    kidsAgeOutMonths, msftGrowth, data, sarahWorkMonths,
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

  // Real federal/FICA breakdown for the W-2 Net Diagnostic, from the same engine as
  // the Tax tab. FICA is exact; federal is the household return for the first working
  // year (representative). Falls back to null (pane then shows FICA-only) on any error.
  const chadTaxBreakdown = useMemo(() => {
    if (!chadJob) return null;
    try {
      const sched = buildTaxSchedule(gatherState());
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
  }, [state]);

  const incomeControlsProps = useMemo(() => ({
    ssType, ssdiDenied,
    ssdiFamilyTotal, ssdiPersonal, kidsAgeOutMonths,
    ssdiApprovalMonth, ssdiBackPayMonths,
    ssdiBackPayGross, ssdiAttorneyFee, ssdiBackPayActual,
    ssClaimAge, ssPIA,
    ssFamilyTotal, ssPersonal, ssStartMonth, ssKidsAgeOutMonths,
    chadConsulting,
    chadJob, chadJobSalary, chadJobTaxRate, chadJobStartMonth, chadJobHealthSavings,
    chadJobNoFICA, chadJobPensionRate, chadJobPensionContrib, chadJobRaisePct, chadJobBonusPct, chadJobBonusMonth, chadJobBonusProrateFirst, chadJobStockRefresh, chadJobRefreshStartMonth, chadJobHireStockY1, chadJobHireStockY2, chadJobHireStockY3, chadJobHireStockY4, chadJobSignOnCash, chadJob401kEnabled, chadJob401kDeferral, chadJob401kCatchupRoth, chadJob401kMatch,
    chadCurrentAge, chadAge65VestOverride,
    chadL64Enabled, chadL64Month, chadL64Salary, chadL64StockRefresh, chadL64BonusPct,
    chadL65Enabled, chadL65Month, chadL65Salary, chadL65StockRefresh, chadL65BonusPct,
    msftPrice, msftGrowth,
    chadWorkMonths,
    postJobBenefit,
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
    chadConsulting,
    chadJob, chadJobSalary, chadJobTaxRate, chadJobStartMonth, chadJobHealthSavings,
    chadJobNoFICA, chadJobPensionRate, chadJobPensionContrib, chadJobRaisePct, chadJobBonusPct, chadJobBonusMonth, chadJobBonusProrateFirst, chadJobStockRefresh, chadJobRefreshStartMonth, chadJobHireStockY1, chadJobHireStockY2, chadJobHireStockY3, chadJobHireStockY4, chadJobSignOnCash, chadJob401kEnabled, chadJob401kDeferral, chadJob401kCatchupRoth, chadJob401kMatch,
    chadCurrentAge, chadAge65VestOverride,
    chadL64Enabled, chadL64Month, chadL64Salary, chadL64StockRefresh, chadL64BonusPct,
    chadL65Enabled, chadL65Month, chadL65Salary, chadL65StockRefresh, chadL65BonusPct,
    msftPrice, msftGrowth,
    chadWorkMonths,
    postJobBenefit,
    trustIncomeNow, trustIncomeFuture, trustIncreaseMonth,
    vanSold, vanMonthlySavings, vanSalePrice, vanLoanBalance, vanSaleMonth,
    chadTaxBreakdown,
  ]);

  const expenseControlsProps = useMemo(() => ({
    totalMonthlySpend, baseExpenses: effectiveBaseExpenses, debtService,
    expenseInflation, expenseInflationRate,
    debtTotal, retireDebt,
    lifestyleCutsApplied, cutsOverride,
    bcsAnnualTotal, bcsParentsAnnual, bcsYearsLeft, bcsFamilyMonthly,
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
    expenseInflation, expenseInflationRate,
    debtTotal, retireDebt,
    lifestyleCutsApplied, cutsOverride,
    bcsAnnualTotal, bcsParentsAnnual, bcsYearsLeft, bcsFamilyMonthly,
    vanSold, vanMonthlySavings, vanSaleMonth,
    chadJob, chadJobStartMonth, chadJobHealthSavings,
    milestones,
    moldCost, moldInclude, roofCost, roofInclude,
    otherProjects, otherInclude,
    monthlyDetail,
  ]);

  const stableGatherState = useCallback(() => gatherState(), [state]);

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
    compareProjections, compareColors: COMPARE_COLORS,
    data, startingSavings, investmentReturn,
    debtCC, debtPersonal, debtIRS, debtFirstmark,
    debtService, ssdiApprovalMonth, ssdiBackPayActual,
    milestones, retireDebt, presentMode,
    onFieldChange: set, baseExpenses: effectiveBaseExpenses, totalMonthlySpend,
    monthlyDetail,
  }), [
    savingsData, savingsZeroMonth, savingsZeroLabel,
    compareProjections,
    data, startingSavings, investmentReturn,
    debtCC, debtPersonal, debtIRS, debtFirstmark,
    debtService, ssdiApprovalMonth, ssdiBackPayActual,
    milestones, retireDebt, presentMode, effectiveBaseExpenses, totalMonthlySpend,
    monthlyDetail,
  ]);

  const netWorthProps = useMemo(() => ({
    savingsData, wealthData,
    starting401k, return401k,
    homeEquity, homeAppreciation,
    presentMode, onFieldChange: set,
    compareProjections, compareColors: COMPARE_COLORS,
  }), [
    savingsData, wealthData,
    starting401k, return401k,
    homeEquity, homeAppreciation,
    presentMode,
    compareProjections,
  ]);

  // 401(k) detail chart props — exposes monthly contribution/match/balance breakdown
  // for the Plan tab's Chad401kChart panel.
  const chad401kChartProps = useMemo(() => ({
    monthlyDetail,
    starting401k,
    return401k,
    chadJob,
    chadRetirementMonth: chadWorkMonths || 72,
    chadJob401kEnabled,
  }), [monthlyDetail, starting401k, return401k, chadJob, chadWorkMonths, chadJob401kEnabled]);

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
    onDeleteCheckIn: (month) => {
      // Explicit user deletion: the resulting shrink/empty persist is
      // intentional (remediation 1.4) — flag it for the guard.
      checkInClearIntentRef.current = true;
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
  const noRailTabs = new Set(['actuals', 'details', 'plan']);
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
    ssPIA,
    ssClaimAge,
    chadJob,
    trustIncomeFuture,
    ssMonthsWithheld: ssWithheldSummary?.monthsFullyWithheld ?? 0,
    chadJobPensionMonthly,
    chadCurrentAge,
    sarahCurrentAge,
    sarahOwnSS,
    onSpendingTargets: setRetirementSpendingTargets,
  }), [savingsData, wealthData, ssType, ssPersonal, ssPIA, ssClaimAge, chadJob, trustIncomeFuture, ssWithheldSummary, chadJobPensionMonthly, chadCurrentAge, sarahCurrentAge, sarahOwnSS]);
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
          totalCuts={cutsOverride ?? 0}
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
    comparisons,
    compareProjections,
    retirementSpendingTargets,
  ]);

  const plannerTabs = useMemo(() => (
    showTabs ? <TabBar activeTab={effectiveTab} onChange={set('activeTab')} compact={compactShell} /> : null
  ), [showTabs, effectiveTab, compactShell]);

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
  }), []);

  const railPropsMap = useMemo(() => ({
    savings: { ...savingsDrawdownProps, instanceId: effectiveTab === 'risk' ? 'right-rail' : 'shared-rail' },
    networth: { ...netWorthProps, instanceId: effectiveTab === 'risk' ? 'right-rail' : 'shared-rail' },
    retirement: deferredRetirementRailProps,
    bridge: bridgeProps,
    income: {
      monthlyDetail, investmentReturn, ssType,
      ssBenefitPersonal: ssType === 'ss' ? ssPersonal : ssdiPersonal,
      chadJob, chadJobStartMonth, chadJobHealthSavings,
      vanSold, vanSaleMonth, vanMonthlySavings,
      bcsYearsLeft, milestones,
      compareProjections, compareColors: COMPARE_COLORS,
    },
    montecarlo: monteCarloProps,
    sequence: seqReturnsProps,
  }), [savingsDrawdownProps, netWorthProps, deferredRetirementRailProps, bridgeProps,
    monthlyDetail, investmentReturn, ssType, ssPersonal, ssdiPersonal,
    chadJob, chadJobStartMonth, chadJobHealthSavings,
    vanSold, vanSaleMonth, vanMonthlySavings, bcsYearsLeft, milestones,
    compareProjections, monteCarloProps, seqReturnsProps, effectiveTab]);

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
          savingsChartProps={{ ...savingsDrawdownProps, instanceId: 'plan-savings' }}
          netWorthChartProps={{ ...netWorthProps, instanceId: 'plan-networth' }}
          incomeChartProps={{
            monthlyDetail, investmentReturn, ssType,
            ssBenefitPersonal: ssType === 'ss' ? ssPersonal : ssdiPersonal,
            chadJob, chadJobStartMonth, chadJobHealthSavings,
            vanSold, vanSaleMonth, vanMonthlySavings,
            bcsYearsLeft, milestones,
            compareProjections, compareColors: COMPARE_COLORS,
          }}
          capitalItems={effectiveCapitalItems}
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

      {effectiveTab === 'risk' && (
        <RiskTab
          monteCarloProps={monteCarloProps}
          seqReturnsProps={seqReturnsProps}
          savingsDrawdownProps={riskSavingsDrawdownProps}
          netWorthProps={riskNetWorthProps}
          sarahWorkMonths={sarahWorkMonths}
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
    savingsData,
    wealthData,
    monthlyDetail,
    ssType,
    goals,
    goalResults,
    stableGatherState,
    railConfig, RAIL_COMPONENTS, railPropsMap,
    actualsDispatch,             // stable wrapper around dispatch for ActualsTab
    state, set,                  // advisor pane reads state + uses set() to apply moves
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
