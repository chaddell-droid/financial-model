const STORAGE_PREFIX = 'fs_';

function createPerfState() {
  return {
    renderCounts: {},
    sliderDraftCounts: {},
    sliderCommitCounts: {},
    computeCounts: {},
  };
}

function clonePerfState(state) {
  return {
    renderCounts: { ...state.renderCounts },
    sliderDraftCounts: { ...state.sliderDraftCounts },
    sliderCommitCounts: { ...state.sliderCommitCounts },
    computeCounts: { ...state.computeCounts },
  };
}

function bumpCounter(state, bucket, name) {
  if (!name) return 0;
  state[bucket][name] = (state[bucket][name] || 0) + 1;
  return state[bucket][name];
}

function parseSeed(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function listStorageKeys() {
  if (typeof window === 'undefined') return [];
  return Object.keys(window.localStorage)
    .filter((key) => key.startsWith(STORAGE_PREFIX))
    .sort();
}

export function getUiTestConfig() {
  if (typeof window === 'undefined') {
    return { enabled: false, monteCarloSeed: null, resetStorageOnLoad: false };
  }

  const params = new URLSearchParams(window.location.search);
  return {
    enabled: params.get('ui_test') === '1',
    monteCarloSeed: parseSeed(params.get('mc_seed')),
    resetStorageOnLoad: params.get('reset_storage') === '1',
  };
}

export function installUiTestHarness() {
  if (typeof window === 'undefined') return;
  const config = getUiTestConfig();
  if (!import.meta.env.DEV && !config.enabled) return;
  const state = { monteCarloSeed: config.monteCarloSeed };
  const perf = createPerfState();

  const resetStorage = () => {
    const keys = listStorageKeys();
    keys.forEach((key) => window.localStorage.removeItem(key));
    return keys.length;
  };

  if (config.resetStorageOnLoad) {
    resetStorage();
  }

  window.__FIN_MODEL_TEST__ = {
    enabled: config.enabled,
    storagePrefix: STORAGE_PREFIX,
    getMonteCarloSeed() {
      return state.monteCarloSeed;
    },
    setMonteCarloSeed(seed) {
      state.monteCarloSeed = parseSeed(seed);
      return state.monteCarloSeed;
    },
    clearStorage: resetStorage,
    resetStorage,
    listStorageKeys() {
      return listStorageKeys();
    },
    getStorageSnapshot() {
      return listStorageKeys().reduce((snapshot, key) => {
        snapshot[key] = window.localStorage.getItem(key);
        return snapshot;
      }, {});
    },
    resetPerfMetrics() {
      perf.renderCounts = {};
      perf.sliderDraftCounts = {};
      perf.sliderCommitCounts = {};
      perf.computeCounts = {};
      return clonePerfState(perf);
    },
    getPerfMetrics() {
      return clonePerfState(perf);
    },
    bumpRender(name) {
      return bumpCounter(perf, 'renderCounts', name);
    },
    bumpSliderDraft(name) {
      return bumpCounter(perf, 'sliderDraftCounts', name);
    },
    bumpSliderCommit(name) {
      return bumpCounter(perf, 'sliderCommitCounts', name);
    },
    bumpCompute(name) {
      return bumpCounter(perf, 'computeCounts', name);
    },
  };

  document.documentElement.dataset.uiTest = config.enabled ? '1' : '0';
}
