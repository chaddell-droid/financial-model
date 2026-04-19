import { useState, useCallback, useEffect } from 'react';
import { DEFAULT_RAIL_CONFIG } from './railDefaults.js';
import { loadRailConfig, saveRailConfig, clearRailConfig, loadSavedRailConfig, saveSavedRailConfig } from './railConfigStorage.js';

/**
 * Hook for managing per-tab rail chart configuration.
 *
 * Two layers of state:
 * - config: the live working config (changes as you add/remove/reorder)
 * - savedConfig: the last explicitly saved checkpoint (what "Reset" restores to)
 *
 * "Save" locks the current layout as the checkpoint.
 * "Reset" restores the current tab to the last saved checkpoint.
 * If no checkpoint exists, reset falls back to DEFAULT_RAIL_CONFIG.
 */
export function useRailConfig() {
  const [config, setConfig] = useState(DEFAULT_RAIL_CONFIG);
  const [savedConfig, setSavedConfig] = useState(DEFAULT_RAIL_CONFIG);
  const [loaded, setLoaded] = useState(false);

  // Load persisted config + saved checkpoint on mount
  useEffect(() => {
    Promise.all([loadRailConfig(), loadSavedRailConfig()]).then(([live, saved]) => {
      if (live) {
        const merged = { ...DEFAULT_RAIL_CONFIG };
        for (const tab of Object.keys(live)) {
          if (Array.isArray(live[tab])) merged[tab] = live[tab];
        }
        setConfig(merged);
      }
      if (saved) {
        const merged = { ...DEFAULT_RAIL_CONFIG };
        for (const tab of Object.keys(saved)) {
          if (Array.isArray(saved[tab])) merged[tab] = saved[tab];
        }
        setSavedConfig(merged);
      }
      setLoaded(true);
    });
  }, []);

  // Persist live config on every change
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
    if (current.includes(chartId)) return;
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

  // Save: lock current config as the checkpoint
  const saveLayout = useCallback(() => {
    setSavedConfig({ ...config });
    saveSavedRailConfig(config);
  }, [config]);

  // Reset: restore current tab to saved checkpoint (or defaults)
  const resetTab = useCallback((tab) => {
    const savedCharts = savedConfig[tab] || DEFAULT_RAIL_CONFIG[tab] || [];
    persist({ ...config, [tab]: savedCharts });
  }, [config, savedConfig, persist]);

  const resetAll = useCallback(() => {
    persist({ ...savedConfig });
  }, [savedConfig, persist]);

  // Check if current tab differs from saved
  const isTabModified = useCallback((tab) => {
    const current = JSON.stringify(config[tab] || []);
    const saved = JSON.stringify(savedConfig[tab] || DEFAULT_RAIL_CONFIG[tab] || []);
    return current !== saved;
  }, [config, savedConfig]);

  return {
    config,
    loaded,
    getTabCharts,
    setTabCharts,
    addChart,
    removeChart,
    moveChart,
    saveLayout,
    resetTab,
    resetAll,
    isTabModified,
  };
}
