// Persistence layer for FinancialModel — extracted verbatim from
// FinancialModel.jsx (remediation 2026-06-09 Phase 7 file-size rule).
// Owns every storage effect (scenarios, model state, check-ins, actuals,
// merchant classifications), the hydration gates that disarm auto-save until
// each restore settles (remediation 1.3c), and the intentional-clear intent
// flags (remediation 1.4). Behavior is identical to the inline original:
// effect order, dependency arrays, and guard semantics are preserved.
import { useRef, useEffect, useCallback } from 'react';
import { saveModelState, loadModelState } from './autoSave.js';
import { safeWrite, createHydrationGate, mergeScenarioLists } from './safeStorage.js';
import { sanitizeCheckInHistory } from './schemaValidation.js';
import { withProvenanceAll, DEFAULT_PROVENANCE } from './scenarioProvenance.js';
import { sanitizeMonthlyActuals } from '../model/csvParser.js';

export function usePersistence({ state, dispatch, set, gatherState }) {
  const { savedScenarios, checkInHistory, monthlyActuals, merchantClassifications } = state;

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

  // Intent markers for the callers that own the explicit user actions
  // (Reset All confirmation lives in FinancialModel; check-in deletion lives
  // in the TrackTab prop bundle).
  const markModelReset = useCallback(() => { intentionalModelResetRef.current = true; }, []);
  const markCheckInClear = useCallback(() => { checkInClearIntentRef.current = true; }, []);

  // Dispatch wrapper for ActualsTab: flags explicit resets so the actuals
  // persist effect routes the shrink/empty write through the guard's
  // intentionalClear escape hatch (remediation 1.4).
  const actualsDispatch = useCallback((action) => {
    if (action && (action.type === 'RESET_ACTUALS_MONTH' || action.type === 'RESET_ACTUALS_ALL')) {
      actualsClearIntentRef.current = true;
    }
    dispatch(action);
  }, [dispatch]);

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

  const deleteScenario = async (name) => {
    const updated = savedScenarios.filter(s => s.name !== name);
    set('savedScenarios')(updated);
    if (storageAvailable) {
      // Deleting is explicit user intent — write through the escape hatch so
      // removing the last scenario sticks (backup taken first, remediation 1.4).
      try { await persistScenarios(updated, { intentionalClear: true }); } catch (e) { /* */ }
    }
  };

  return {
    storageAvailable,
    actualsDispatch,
    saveScenario,
    deleteScenario,
    markModelReset,
    markCheckInClear,
  };
}
