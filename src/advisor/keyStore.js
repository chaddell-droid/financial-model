/**
 * CFP Advisor — Anthropic API key storage.
 *
 * Resolution order:
 *   1. import.meta.env.VITE_ANTHROPIC_API_KEY (build-time / .env.local override)
 *   2. session tier — sessionStorage (in-memory fallback); the DEFAULT for
 *      keys saved in Settings ("remember" toggle OFF). Gone when the tab closes.
 *   3. window.storage.get('advisor-key')        (persistent; "remember" ON)
 *   4. null  → advisor disabled, UI shows "add key" empty state
 *
 * setKey keeps a single source of truth: saving to one tier clears the other.
 *
 * The key is sent only on the Authorization header to api.anthropic.com.
 * Never logged, never embedded in conversation exports. We acknowledge that
 * dangerouslyAllowBrowser places the key in the page memory — acceptable for
 * a personal tool running on the owner's machine. Recommend a spend-capped
 * key either way (the Settings UI says so).
 */

import { ADVISOR_STORAGE_KEY_API_KEY } from './config.js';

const ENV_KEY_NAME = 'VITE_ANTHROPIC_API_KEY';
const SESSION_KEY_NAME = `${ADVISOR_STORAGE_KEY_API_KEY}-session`;

// In-memory fallback for environments without sessionStorage (Node tests).
let memorySessionKey = null;

function readSessionKey() {
  try {
    if (typeof sessionStorage !== 'undefined' && sessionStorage) {
      const v = sessionStorage.getItem(SESSION_KEY_NAME);
      return (typeof v === 'string' && v.trim().length > 0) ? v.trim() : null;
    }
  } catch (_) { /* fall through to memory */ }
  return (typeof memorySessionKey === 'string' && memorySessionKey.length > 0) ? memorySessionKey : null;
}

function writeSessionKey(key) {
  try {
    if (typeof sessionStorage !== 'undefined' && sessionStorage) {
      sessionStorage.setItem(SESSION_KEY_NAME, key);
      return true;
    }
  } catch (_) { /* fall through to memory */ }
  memorySessionKey = key;
  return true;
}

function clearSessionKey() {
  try {
    if (typeof sessionStorage !== 'undefined' && sessionStorage) {
      sessionStorage.removeItem(SESSION_KEY_NAME);
    }
  } catch (_) { /* ignore */ }
  memorySessionKey = null;
}

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
 * Get the active API key (env override beats session, session beats
 * persistent storage). Returns null when no source has a key.
 *
 * @param {object} [storage] - optional storage adapter for testing; defaults to window.storage
 * @returns {Promise<string | null>}
 */
export async function getKey(storage) {
  const env = readEnvKey();
  if (env) return env;
  const session = readSessionKey();
  if (session) return session;
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
 * Set the API key. Env override (if present) still wins on read.
 *
 * Default (`remember: false`): SESSION tier only — sessionStorage (or memory),
 * cleared when the tab closes, never written to persistent storage. The
 * previously-persisted copy (if any) is removed so there is one source of
 * truth. `remember: true` restores the original persistent behavior and
 * clears the session copy.
 *
 * @param {string} key
 * @param {object} [storage]
 * @param {{ remember?: boolean }} [opts]
 * @returns {Promise<boolean>} true on success
 */
export async function setKey(key, storage, opts = {}) {
  if (typeof key !== 'string' || key.trim().length === 0) return false;
  const trimmedKey = key.trim();
  const remember = Boolean(opts.remember);
  const s = storage || (typeof window !== 'undefined' ? window.storage : null);
  if (remember) {
    if (!s || typeof s.set !== 'function') return false;
    const result = await s.set(ADVISOR_STORAGE_KEY_API_KEY, trimmedKey);
    if (!result) return false;
    clearSessionKey();
    return true;
  }
  writeSessionKey(trimmedKey);
  // Best-effort removal of any previously-persisted copy (single source of truth).
  if (s && typeof s.delete === 'function') {
    try { await s.delete(ADVISOR_STORAGE_KEY_API_KEY); } catch (_) { /* ignore */ }
  }
  return true;
}

/**
 * Remove the API key from BOTH tiers (session + persistent). Does not affect
 * the env override.
 *
 * @param {object} [storage]
 * @returns {Promise<boolean>}
 */
export async function clearKey(storage) {
  clearSessionKey();
  const s = storage || (typeof window !== 'undefined' ? window.storage : null);
  if (s && typeof s.delete === 'function') {
    try { await s.delete(ADVISOR_STORAGE_KEY_API_KEY); } catch (_) { /* ignore */ }
  }
  return true;
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
 * @returns {Promise<'env' | 'session' | 'storage' | null>}
 */
export async function keySource(storage) {
  if (readEnvKey()) return 'env';
  if (readSessionKey()) return 'session';
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
