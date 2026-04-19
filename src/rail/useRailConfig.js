import { useState, useCallback, useEffect, useRef } from 'react';
import { DEFAULT_RAIL_CONFIG } from './railDefaults.js';
import { loadRailConfig, saveRailConfig, clearRailConfig, loadSavedRailConfig, saveSavedRailConfig } from './railConfigStorage.js';

/**
 * Hook for managing per-tab rail chart configuration.
 *
 * Uses functional state updates (prev => next) to avoid stale closure bugs.
 * All mutators use setConfig(prev => ...) so they always operate on the
 * latest state, regardless of React batching or memoization.
 */
export function useRailConfig() {
  const [config, setConfig] = useState(DEFAULT_RAIL_CONFIG);
  const [savedConfig, setSavedConfig] = useState(DEFAULT_RAIL_CONFIG);
  const [railWidth, setRailWidthState] = useState(520);
  const [loaded, setLoaded] = useState(false);
  // Ref to always have latest config for persistence without stale closures
  const configRef = useRef(config);
  configRef.current = config;

  useEffect(() => {
    Promise.all([loadRailConfig(), loadSavedRailConfig()]).then(([live, saved]) => {
      if (live) {
        const merged = { ...DEFAULT_RAIL_CONFIG };
        for (const tab of Object.keys(live)) {
          if (Array.isArray(live[tab])) merged[tab] = live[tab];
        }
        setConfig(merged);
        if (typeof live.railWidth === 'number') setRailWidthState(live.railWidth);
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

  // All mutators use functional updates to avoid stale closures
  const updateConfig = useCallback((updater) => {
    setConfig(prev => {
      const next = updater(prev);
      saveRailConfig({ ...next, railWidth: configRef.current.railWidth });
      return next;
    });
  }, []);

  const getTabCharts = useCallback((tab) => {
    return config[tab] || DEFAULT_RAIL_CONFIG[tab] || [];
  }, [config]);

  const setTabCharts = useCallback((tab, chartIds) => {
    updateConfig(prev => ({ ...prev, [tab]: chartIds }));
  }, [updateConfig]);

  const addChart = useCallback((tab, chartId) => {
    updateConfig(prev => {
      const current = prev[tab] || [];
      if (current.includes(chartId)) return prev;
      return { ...prev, [tab]: [...current, chartId] };
    });
  }, [updateConfig]);

  const removeChart = useCallback((tab, chartId) => {
    updateConfig(prev => ({ ...prev, [tab]: (prev[tab] || []).filter(id => id !== chartId) }));
  }, [updateConfig]);

  const moveChart = useCallback((tab, fromIndex, toIndex) => {
    updateConfig(prev => {
      const current = [...(prev[tab] || [])];
      if (fromIndex < 0 || fromIndex >= current.length) return prev;
      if (toIndex < 0 || toIndex >= current.length) return prev;
      const [moved] = current.splice(fromIndex, 1);
      current.splice(toIndex, 0, moved);
      return { ...prev, [tab]: current };
    });
  }, [updateConfig]);

  const saveLayout = useCallback(() => {
    setSavedConfig({ ...configRef.current });
    saveSavedRailConfig(configRef.current);
  }, []);

  const resetTab = useCallback((tab) => {
    updateConfig(prev => {
      const savedCharts = savedConfig[tab] || DEFAULT_RAIL_CONFIG[tab] || [];
      return { ...prev, [tab]: savedCharts };
    });
  }, [updateConfig, savedConfig]);

  const resetAll = useCallback(() => {
    setConfig({ ...savedConfig });
    saveRailConfig(savedConfig);
  }, [savedConfig]);

  const isTabModified = useCallback((tab) => {
    const current = JSON.stringify(config[tab] || []);
    const saved = JSON.stringify(savedConfig[tab] || DEFAULT_RAIL_CONFIG[tab] || []);
    return current !== saved;
  }, [config, savedConfig]);

  const setRailWidthLive = useCallback((w) => {
    setRailWidthState(w);
  }, []);

  const commitRailWidth = useCallback((w) => {
    setRailWidthState(w);
    saveRailConfig({ ...configRef.current, railWidth: w });
  }, []);

  return {
    config,
    loaded,
    railWidth,
    getTabCharts,
    setTabCharts,
    addChart,
    removeChart,
    moveChart,
    saveLayout,
    resetTab,
    resetAll,
    isTabModified,
    setRailWidthLive,
    commitRailWidth,
  };
}
