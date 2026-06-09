const STORAGE_PREFIX = 'fs_';

// Reset-backup keys deliberately do NOT use the fs_ prefix so they survive
// subsequent resets and never appear in app storage snapshots.
const RESET_BACKUP_PREFIX = 'fin-harness-reset-backup-';
const RESET_BACKUP_KEEP = 5;

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

/**
 * Snapshot every fs_* key into a single timestamped backup key, then delete
 * the fs_* keys (remediation 1.7 — the harness reset used to destroy
 * irreplaceable user data with no recovery path). Keeps the most recent
 * RESET_BACKUP_KEEP backups; older ones are pruned.
 *
 * Returns the number of fs_* keys deleted.
 */
export function resetStorageWithBackup() {
  if (typeof window === 'undefined') return 0;
  const keys = listStorageKeys();
  if (keys.length > 0) {
    const snapshot = {};
    keys.forEach((key) => { snapshot[key] = window.localStorage.getItem(key); });
    const backupKey = `${RESET_BACKUP_PREFIX}${new Date().toISOString().replace(/[:.]/g, '-')}`;
    try {
      window.localStorage.setItem(backupKey, JSON.stringify(snapshot));
    } catch (e) {
      // Quota — best effort only; warn so the loss is at least visible.
      console.warn('[uiHarness] reset_storage: failed to write backup before reset:', e);
    }
    // Prune old reset backups beyond the keep window (oldest first — keys
    // embed an ISO timestamp, so lexicographic sort is chronological).
    const backups = Object.keys(window.localStorage)
      .filter((k) => k.startsWith(RESET_BACKUP_PREFIX))
      .sort();
    while (backups.length > RESET_BACKUP_KEEP) {
      window.localStorage.removeItem(backups.shift());
    }
  }
  keys.forEach((key) => window.localStorage.removeItem(key));
  return keys.length;
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

  const resetStorage = resetStorageWithBackup;

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
