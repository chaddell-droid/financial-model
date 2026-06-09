/**
 * Persistence layer for rail chart configuration.
 * Uses window.storage (same API as autoSave.js) with key 'fin-rail-config'.
 *
 * All writes go through the shared persistence guard (remediation 1.3):
 * one-generation backup to '<key>.bak' before every overwrite, anti-clobber
 * refusal of empty/dramatically-smaller payloads, and an intentionalClear
 * escape hatch for the explicit reset path.
 */

import { safeWrite } from '../state/safeStorage.js';

const STORAGE_KEY = 'fin-rail-config';
const SAVED_STORAGE_KEY = 'fin-rail-config-saved';

/**
 * Build the object actually persisted for the live rail config: the per-tab
 * chart lists PLUS the committed rail width (remediation 1.5 — previously
 * chart add/remove/reorder saved a config without railWidth, erasing it).
 */
export function buildPersistedRailConfig(config, railWidth) {
  const out = { ...(config || {}) };
  if (typeof railWidth === 'number' && Number.isFinite(railWidth)) {
    out.railWidth = railWidth;
  }
  return out;
}

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
 * Save rail config to storage (guarded; backup written first).
 */
export async function saveRailConfig(config) {
  try {
    if (typeof window === 'undefined') return;
    await safeWrite(window.storage, STORAGE_KEY, JSON.stringify(config), {
      label: 'rail-config',
    });
  } catch {
    // Silent fail — UI state is non-critical
  }
}

/**
 * Load saved rail config checkpoint from storage.
 */
export async function loadSavedRailConfig() {
  try {
    if (!window.storage || typeof window.storage.get !== 'function') return null;
    const result = await window.storage.get(SAVED_STORAGE_KEY);
    if (!result || !result.value) return null;
    const parsed = JSON.parse(result.value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Save rail config checkpoint to storage (guarded; backup written first).
 */
export async function saveSavedRailConfig(config) {
  try {
    if (typeof window === 'undefined') return;
    await safeWrite(window.storage, SAVED_STORAGE_KEY, JSON.stringify(config), {
      label: 'rail-config-saved',
    });
  } catch {
    // Silent fail
  }
}

/**
 * Clear rail config from storage (reset to defaults on next load).
 * Intentional clear: the previous config is still backed up to
 * 'fin-rail-config.bak' before being nulled out.
 */
export async function clearRailConfig() {
  try {
    if (typeof window === 'undefined') return;
    await safeWrite(window.storage, STORAGE_KEY, null, {
      intentionalClear: true,
      label: 'rail-config',
    });
  } catch {
    // Silent fail
  }
}
