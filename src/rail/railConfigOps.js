/**
 * Pure config-transform operations for the per-tab rail chart configuration.
 *
 * Extracted from useRailConfig (remediation 2026-06-09 Phase 9) so plain-node
 * tests can exercise every mutator's logic directly — the hook is a thin
 * wrapper that routes these through React state + persistence.
 *
 * Conventions:
 *  - Every op takes the current config object and returns a NEW object with
 *    the input left unmutated…
 *  - …EXCEPT when the operation is a no-op (chart already present, move out
 *    of bounds), in which case the SAME object reference is returned so the
 *    hook's functional setState can bail out without a spurious save.
 */
import { DEFAULT_RAIL_CONFIG } from './railDefaults.js';

/**
 * Merge a loaded (possibly partial / junk-laden) config over the defaults.
 * Only array-valued tab entries are honoured; scalar keys in the persisted
 * payload (e.g. railWidth) and non-array junk are ignored here — railWidth
 * is read separately by the hook.
 */
export function mergeLoadedRailConfig(loaded) {
  const merged = { ...DEFAULT_RAIL_CONFIG };
  if (loaded && typeof loaded === 'object' && !Array.isArray(loaded)) {
    for (const tab of Object.keys(loaded)) {
      if (Array.isArray(loaded[tab])) merged[tab] = loaded[tab];
    }
  }
  return merged;
}

/** Chart list for a tab, falling back to the defaults (never undefined). */
export function getTabChartsFromConfig(config, tab) {
  return (config && config[tab]) || DEFAULT_RAIL_CONFIG[tab] || [];
}

/** Replace a tab's chart list wholesale. */
export function setTabChartsOp(config, tab, chartIds) {
  return { ...config, [tab]: chartIds };
}

/** Append a chart to a tab; no-op (same reference) when already present. */
export function addChartOp(config, tab, chartId) {
  const current = config[tab] || [];
  if (current.includes(chartId)) return config;
  return { ...config, [tab]: [...current, chartId] };
}

/** Remove a chart from a tab (absent ids leave the list unchanged). */
export function removeChartOp(config, tab, chartId) {
  return { ...config, [tab]: (config[tab] || []).filter(id => id !== chartId) };
}

/**
 * Reorder a tab's charts. Out-of-bounds indices are a no-op (same reference)
 * — mirrors the original hook guard so drag artifacts can't corrupt state.
 */
export function moveChartOp(config, tab, fromIndex, toIndex) {
  const current = [...(config[tab] || [])];
  if (fromIndex < 0 || fromIndex >= current.length) return config;
  if (toIndex < 0 || toIndex >= current.length) return config;
  const [moved] = current.splice(fromIndex, 1);
  current.splice(toIndex, 0, moved);
  return { ...config, [tab]: current };
}

/** Reset one tab to the saved checkpoint (or the defaults when unsaved). */
export function resetTabOp(config, savedConfig, tab) {
  const savedCharts = (savedConfig && savedConfig[tab]) || DEFAULT_RAIL_CONFIG[tab] || [];
  return { ...config, [tab]: savedCharts };
}

/** True when a tab's live list differs from the saved checkpoint. */
export function isTabModifiedOp(config, savedConfig, tab) {
  const current = JSON.stringify((config && config[tab]) || []);
  const saved = JSON.stringify((savedConfig && savedConfig[tab]) || DEFAULT_RAIL_CONFIG[tab] || []);
  return current !== saved;
}
