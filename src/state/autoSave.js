/**
 * Auto-save and restore for model state.
 *
 * Extracts MODEL_KEYS from current state, serializes to storage.
 * On restore, returns the raw object for RESTORE_STATE dispatch
 * (which handles migration + validation).
 */

import { MODEL_KEYS } from './initialState.js';

const STORAGE_KEY = 'fin-model-state';

/**
 * Extract only the MODEL_KEYS fields from the full state object.
 * Also includes schemaVersion for migration support.
 */
export function extractModelState(state) {
  const model = {};
  for (const key of MODEL_KEYS) {
    if (state[key] !== undefined) model[key] = state[key];
  }
  if (state.schemaVersion !== undefined) model.schemaVersion = state.schemaVersion;
  return model;
}

/**
 * Save model state to storage. Returns true on success, false on failure.
 */
export async function saveModelState(storage, state) {
  if (!storage || typeof storage.set !== 'function') return false;
  try {
    const model = extractModelState(state);
    await storage.set(STORAGE_KEY, JSON.stringify(model));
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Load model state from storage. Returns the raw parsed object, or null.
 * Caller should dispatch RESTORE_STATE with the result to get migration + validation.
 */
export async function loadModelState(storage) {
  if (!storage || typeof storage.get !== 'function') return null;
  try {
    const result = await storage.get(STORAGE_KEY);
    if (!result || !result.value) return null;
    const parsed = JSON.parse(result.value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed;
  } catch (e) {
    return null;
  }
}

export { STORAGE_KEY };
