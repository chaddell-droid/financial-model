/**
 * Shared persistence guard (remediation 2026-06-09, item 1.3).
 *
 * Every storage layer (model state, scenarios, check-ins, actuals,
 * merchant classifications, advisor conversations, rail config) writes
 * through safeWrite(), which provides three protections:
 *
 *  (a) One-generation backup — the existing payload is copied to
 *      `<key>.bak` before every overwrite, so the last good value always
 *      survives one bad write.
 *
 *  (b) Anti-clobber — refuses to overwrite a non-trivial stored payload
 *      with an empty / default-equivalent / dramatically smaller payload.
 *      The suspicious payload is parked at `<key>.quarantine` with a
 *      console.warn instead of destroying user data.
 *      `{ intentionalClear: true }` is the explicit escape hatch for
 *      user-driven resets/deletions (the backup is still written first,
 *      so even an intentional clear is recoverable for one generation).
 *
 *  (c) Hydration gating — createHydrationGate() gives auto-save effects a
 *      settle()/isSettled() pair so they stay disarmed until their restore
 *      promise settles. This kills the boot race where a debounced
 *      auto-save fires with INITIAL_STATE before the async restore lands.
 *
 * The storage adapter contract matches window.storage in src/main.jsx:
 *   get(key)  -> Promise<{ value }>  (THROWS when the key is missing)
 *   set(key, value) -> Promise<truthy | null>
 */

export const BACKUP_SUFFIX = '.bak';
export const QUARANTINE_SUFFIX = '.quarantine';

// "Dramatically smaller": the new payload is under 10% of the existing one,
// AND the existing payload is big enough that a single ordinary deletion
// (one scenario, one check-in month, ...) could not plausibly explain it.
// Small payloads legitimately shrink to near-trivial sizes, so they are
// only protected by the empty-payload check.
export const SHRINK_RATIO = 0.1;
export const SHRINK_MIN_EXISTING_BYTES = 1024;

/**
 * True when a serialized payload carries no user data: null/undefined,
 * empty string, or the JSON encodings of empty object/array/null.
 */
export function isTrivialPayload(json) {
  if (json === null || json === undefined) return true;
  const s = String(json).trim();
  return s === '' || s === '{}' || s === '[]' || s === 'null' || s === 'undefined';
}

/**
 * Classify an overwrite as suspicious. Returns a reason string
 * ('empty-overwrite' | 'default-overwrite' | 'shrink-overwrite') or null
 * when the write looks legitimate.
 *
 * @param {string|null} existingJson - currently stored payload (null = none)
 * @param {string|null} nextJson - payload about to be written
 * @param {{ isDefaultPayload?: (json: string) => boolean }} [opts]
 */
export function isSuspiciousOverwrite(existingJson, nextJson, opts = {}) {
  if (isTrivialPayload(existingJson)) return null; // nothing worth protecting
  if (isTrivialPayload(nextJson)) return 'empty-overwrite';
  if (typeof opts.isDefaultPayload === 'function' && opts.isDefaultPayload(nextJson)) {
    return 'default-overwrite';
  }
  if (
    existingJson.length >= SHRINK_MIN_EXISTING_BYTES
    && nextJson.length < existingJson.length * SHRINK_RATIO
  ) {
    return 'shrink-overwrite';
  }
  return null;
}

/**
 * Read the currently stored payload for a key. The browser polyfill's
 * get() throws on missing keys — treat that (and any other read failure)
 * as "nothing stored".
 */
async function readExisting(storage, key) {
  try {
    const result = await storage.get(key);
    if (result && typeof result.value === 'string') return result.value;
    return null;
  } catch {
    return null;
  }
}

/**
 * Guarded storage write. See module docstring for semantics.
 *
 * @param {object} storage - adapter with async get/set (e.g. window.storage)
 * @param {string} key - storage key
 * @param {string|null} nextJson - serialized payload to write
 * @param {object} [opts]
 * @param {boolean} [opts.intentionalClear=false] - escape hatch: skip the
 *   anti-clobber checks (backup is still written first)
 * @param {(json: string) => boolean} [opts.isDefaultPayload] - layer-specific
 *   "this payload is equivalent to factory defaults" detector
 * @param {string} [opts.label] - human-readable layer name for the warning
 * @returns {Promise<{ ok: boolean, reason: string|null, quarantined?: boolean, skipped?: boolean }>}
 */
export async function safeWrite(storage, key, nextJson, opts = {}) {
  if (!storage || typeof storage.set !== 'function' || typeof storage.get !== 'function') {
    return { ok: false, reason: 'no-storage' };
  }
  const { intentionalClear = false, isDefaultPayload, label = key } = opts;
  try {
    const existing = await readExisting(storage, key);

    // No-op writes succeed without churning the backup generation.
    if (existing !== null && existing === nextJson) {
      return { ok: true, reason: null, skipped: true };
    }

    if (!intentionalClear) {
      const suspicion = isSuspiciousOverwrite(existing, nextJson, { isDefaultPayload });
      if (suspicion) {
        try {
          await storage.set(key + QUARANTINE_SUFFIX, nextJson == null ? '' : String(nextJson));
        } catch { /* quarantine is best-effort */ }
        console.warn(
          `[safeStorage] Refused to overwrite "${label}" (${suspicion}): `
          + `existing ${existing ? existing.length : 0}B -> attempted ${nextJson ? String(nextJson).length : 0}B. `
          + `Attempted payload parked at "${key}${QUARANTINE_SUFFIX}". `
          + `Pass { intentionalClear: true } if this clear is deliberate.`,
        );
        return { ok: false, reason: suspicion, quarantined: true };
      }
    }

    // One-generation backup before every overwrite of real data.
    if (existing !== null) {
      try { await storage.set(key + BACKUP_SUFFIX, existing); } catch { /* best-effort */ }
    }

    const result = await storage.set(key, nextJson);
    return { ok: Boolean(result), reason: result ? null : 'set-returned-null' };
  } catch (e) {
    return { ok: false, reason: 'error: ' + (e && e.message ? e.message : String(e)) };
  }
}

/**
 * Hydration gate for auto-save effects (protection (c) above).
 *
 * Usage pattern:
 *   const gate = createHydrationGate();
 *   restore().finally(() => gate.settle());   // settle even on failure
 *   // in the auto-save effect:
 *   if (!gate.isSettled()) return;            // stay disarmed until restore lands
 */
export function createHydrationGate() {
  let settled = false;
  return {
    settle() { settled = true; },
    isSettled() { return settled; },
  };
}

/**
 * Union of an in-memory scenario list and a re-read stored list, keyed by
 * scenario name. Memory wins on conflicts. Used after a failed scenario
 * load (remediation 1.3): instead of overwriting storage with the (possibly
 * empty) in-memory list, the caller re-reads storage and merges so scenarios
 * that never made it into memory survive the write.
 */
export function mergeScenarioLists(memoryList, storedList) {
  const mem = Array.isArray(memoryList) ? memoryList.filter((s) => s && typeof s === 'object') : [];
  const stored = Array.isArray(storedList) ? storedList.filter((s) => s && typeof s === 'object') : [];
  const names = new Set(mem.map((s) => s.name));
  return [...mem, ...stored.filter((s) => !names.has(s.name))];
}
