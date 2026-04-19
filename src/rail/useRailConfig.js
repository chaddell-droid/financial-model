import { useState, useCallback, useEffect } from 'react';
import { DEFAULT_RAIL_CONFIG } from './railDefaults.js';
import { loadRailConfig, saveRailConfig, clearRailConfig } from './railConfigStorage.js';

/**
 * Hook for managing per-tab rail chart configuration.
 *
 * Returns an object with methods to get, add, remove, reorder, and reset
 * chart IDs for any tab. Changes are persisted to storage automatically.
 *
 * Usage:
 *   const rail = useRailConfig();
 *   const charts = rail.getTabCharts('income'); // ['savings', 'networth']
 *   rail.addChart('income', 'retirement');       // now ['savings', 'networth', 'retirement']
 */
export function useRailConfig() {
  const [config, setConfig] = useState(DEFAULT_RAIL_CONFIG);
  const [loaded, setLoaded] = useState(false);

  // Load persisted config on mount
  useEffect(() => {
    loadRailConfig().then(saved => {
      if (saved) {
        // Merge with defaults: ensure every tab has a key, use saved values where available
        const merged = { ...DEFAULT_RAIL_CONFIG };
        for (const tab of Object.keys(saved)) {
          if (Array.isArray(saved[tab])) merged[tab] = saved[tab];
        }
        setConfig(merged);
      }
      setLoaded(true);
    });
  }, []);

  // Persist on every change (after initial load)
  const persist = useCallback((next) => {
    setConfig(next);
    saveRailConfig(next);
  }, []);

  const getTabCharts = useCallback((tab) => {
    return config[tab] || DEFAULT_RAIL_CONFIG[tab] || [];
  }, [config]);

  const setTabCharts = useCallback((tab, chartIds) => {
    persist({ ...config, [tab]: chartIds });
  }, [config, persist]);

  const addChart = useCallback((tab, chartId) => {
    const current = config[tab] || [];
    if (current.includes(chartId)) return; // no duplicates
    persist({ ...config, [tab]: [...current, chartId] });
  }, [config, persist]);

  const removeChart = useCallback((tab, chartId) => {
    const current = config[tab] || [];
    persist({ ...config, [tab]: current.filter(id => id !== chartId) });
  }, [config, persist]);

  const moveChart = useCallback((tab, fromIndex, toIndex) => {
    const current = [...(config[tab] || [])];
    if (fromIndex < 0 || fromIndex >= current.length) return;
    if (toIndex < 0 || toIndex >= current.length) return;
    const [moved] = current.splice(fromIndex, 1);
    current.splice(toIndex, 0, moved);
    persist({ ...config, [tab]: current });
  }, [config, persist]);

  const resetTab = useCallback((tab) => {
    persist({ ...config, [tab]: DEFAULT_RAIL_CONFIG[tab] || [] });
  }, [config, persist]);

  const resetAll = useCallback(() => {
    persist({ ...DEFAULT_RAIL_CONFIG });
    clearRailConfig();
  }, [persist]);

  return {
    config,
    loaded,
    getTabCharts,
    setTabCharts,
    addChart,
    removeChart,
    moveChart,
    resetTab,
    resetAll,
  };
}
