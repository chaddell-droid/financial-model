/**
 * Persistence layer for rail chart configuration.
 * Uses window.storage (same API as autoSave.js) with key 'fin-rail-config'.
 */

const STORAGE_KEY = 'fin-rail-config';

/**
 * Load rail config from storage. Returns parsed config object or null.
 */
export async function loadRailConfig() {
  try {
    if (!window.storage || typeof window.storage.get !== 'function') return null;
    const result = await window.storage.get(STORAGE_KEY);
    if (!result || !result.value) return null;
    const parsed = JSON.parse(result.value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Save rail config to storage.
 */
export async function saveRailConfig(config) {
  try {
    if (!window.storage || typeof window.storage.set !== 'function') return;
    await window.storage.set(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // Silent fail — UI state is non-critical
  }
}

/**
 * Clear rail config from storage (reset to defaults on next load).
 */
export async function clearRailConfig() {
  try {
    if (!window.storage || typeof window.storage.set !== 'function') return;
    await window.storage.set(STORAGE_KEY, null);
  } catch {
    // Silent fail
  }
}
