/**
 * Auto-save and restore for model state.
 *
 * Extracts MODEL_KEYS from current state, serializes to storage.
 * On restore, returns the raw object for RESTORE_STATE dispatch
 * (which handles migration + validation).
 */

import { MODEL_KEYS, INITIAL_STATE } from './initialState.js';
import { safeWrite } from './safeStorage.js';

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

// Lazily computed JSON of the factory-default model payload. Because
// extractModelState iterates MODEL_KEYS in a fixed order, an
// INITIAL_STATE-equivalent save serializes to exactly this string.
let defaultModelJson = null;

/**
 * True when a serialized model payload is byte-equivalent to
 * INITIAL_STATE — used by the anti-clobber guard so a boot race or crash
 * can never overwrite real saved data with factory defaults.
 */
export function isDefaultModelPayload(json) {
  if (defaultModelJson === null) {
    defaultModelJson = JSON.stringify(extractModelState(INITIAL_STATE));
  }
  return json === defaultModelJson;
}

/**
 * Save model state to storage. Returns true on success, false on failure.
 *
 * Writes through the shared persistence guard (remediation 1.3): backup to
 * 'fin-model-state.bak' before overwrite; refuses to clobber a non-default
 * stored payload with an INITIAL_STATE-equivalent/empty/dramatically smaller
 * one unless opts.intentionalClear is set (the RESET_ALL path).
 */
export async function saveModelState(storage, state, opts = {}) {
  try {
    const model = extractModelState(state);
    const result = await safeWrite(storage, STORAGE_KEY, JSON.stringify(model), {
      intentionalClear: Boolean(opts.intentionalClear),
      isDefaultPayload: isDefaultModelPayload,
      label: 'model-state',
    });
    return result.ok;
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
