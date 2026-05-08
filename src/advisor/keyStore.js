/**
 * CFP Advisor — Anthropic API key storage.
 *
 * Resolution order:
 *   1. import.meta.env.VITE_ANTHROPIC_API_KEY (build-time / .env.local override)
 *   2. window.storage.get('advisor-key')        (in-app settings, persistent)
 *   3. null  → advisor disabled, UI shows "add key" empty state
 *
 * The key is sent only on the Authorization header to api.anthropic.com.
 * Never logged, never embedded in conversation exports. We acknowledge that
 * dangerouslyAllowBrowser places the key in the page memory — acceptable for
 * a personal tool running on the owner's machine.
 */

import { ADVISOR_STORAGE_KEY_API_KEY } from './config.js';

const ENV_KEY_NAME = 'VITE_ANTHROPIC_API_KEY';

function readEnvKey() {
  // import.meta.env is Vite-specific; in Node test environment it's undefined.
  try {
    if (typeof import.meta !== 'undefined' && import.meta && import.meta.env) {
      const v = import.meta.env[ENV_KEY_NAME];
      if (typeof v === 'string' && v.trim().length > 0) return v.trim();
    }
  } catch (_) {
    // ignore — node tests
  }
  return null;
}

/**
 * Get the active API key (env override beats storage). Returns null when
 * neither source has a key.
 *
 * @param {object} [storage] - optional storage adapter for testing; defaults to window.storage
 * @returns {Promise<string | null>}
 */
export async function getKey(storage) {
  const env = readEnvKey();
  if (env) return env;
  const s = storage || (typeof window !== 'undefined' ? window.storage : null);
  if (!s || typeof s.get !== 'function') return null;
  try {
    const result = await s.get(ADVISOR_STORAGE_KEY_API_KEY);
    if (result && typeof result.value === 'string' && result.value.trim().length > 0) {
      return result.value.trim();
    }
  } catch (_) {
    // key not found — that's fine
  }
  return null;
}

/**
 * Set the API key in storage. Env override (if present) still wins on read.
 *
 * @param {string} key
 * @param {object} [storage]
 * @returns {Promise<boolean>} true on success
 */
export async function setKey(key, storage) {
  if (typeof key !== 'string' || key.trim().length === 0) return false;
  const s = storage || (typeof window !== 'undefined' ? window.storage : null);
  if (!s || typeof s.set !== 'function') return false;
  const result = await s.set(ADVISOR_STORAGE_KEY_API_KEY, key.trim());
  return Boolean(result);
}

/**
 * Remove the stored API key. Does not affect env override.
 *
 * @param {object} [storage]
 * @returns {Promise<boolean>}
 */
export async function clearKey(storage) {
  const s = storage || (typeof window !== 'undefined' ? window.storage : null);
  if (!s || typeof s.delete !== 'function') return false;
  const result = await s.delete(ADVISOR_STORAGE_KEY_API_KEY);
  return Boolean(result);
}

/**
 * Whether a key is available from either source.
 *
 * @param {object} [storage]
 * @returns {Promise<boolean>}
 */
export async function hasKey(storage) {
  const k = await getKey(storage);
  return typeof k === 'string' && k.length > 0;
}

/**
 * Where the active key came from. Useful for surfacing in the UI so the user
 * understands which source is in effect.
 *
 * @param {object} [storage]
 * @returns {Promise<'env' | 'storage' | null>}
 */
export async function keySource(storage) {
  if (readEnvKey()) return 'env';
  const s = storage || (typeof window !== 'undefined' ? window.storage : null);
  if (!s || typeof s.get !== 'function') return null;
  try {
    const result = await s.get(ADVISOR_STORAGE_KEY_API_KEY);
    if (result && typeof result.value === 'string' && result.value.trim().length > 0) {
      return 'storage';
    }
  } catch (_) {}
  return null;
}
