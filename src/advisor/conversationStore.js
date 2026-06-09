/**
 * CFP Advisor — conversation persistence.
 *
 * Mirrors the checkInHistory pattern: independent storage key (NOT in
 * MODEL_KEYS), debounced writes, restored on mount by the UI layer.
 *
 * Conversation shape:
 *   {
 *     id, scenarioName, createdAt, updatedAt, stateFingerprint,
 *     messages: [
 *       { id, role, timestamp, content, toolCalls, verifier }
 *     ]
 *   }
 *
 * `content` is the Anthropic content-block array (preserved for replay).
 * `toolCalls` is a hoisted, lightweight summary for fast UI render.
 * `verifier` (assistant messages only) is the verifyTurn output.
 *
 * Cap: ADVISOR_MAX_CONVERSATIONS (50). Older conversations are pruned
 * automatically when the cap is exceeded.
 *
 * Tool-result snapshots in stored history are TRIMMED — heavy fields
 * (monthlyData, big arrays) are dropped to stay under the 5MB localStorage
 * cap. Full results live only in current-session memory.
 */

import {
  ADVISOR_STORAGE_KEY_CONVERSATIONS,
  ADVISOR_MAX_CONVERSATIONS,
} from './config.js';
import { MODEL_KEYS } from '../state/initialState.js';
import { safeWrite } from '../state/safeStorage.js';

const TRIM_MARKER = '<trimmed-for-storage>';
const HEAVY_KEYS = new Set(['monthlyData', 'savingsData', 'data', 'bands', 'allBalances']);

/**
 * Generate a v4-ish UUID. Uses crypto.randomUUID when available; falls back
 * to a Math.random hex composite for Node test environments.
 */
export function uuid() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch (_) {}
  // Fallback (not cryptographically strong; fine for ids).
  const r = () => Math.floor(Math.random() * 0xffff).toString(16).padStart(4, '0');
  return `${r()}${r()}-${r()}-${r()}-${r()}-${r()}${r()}${r()}`;
}

/**
 * Stable, content-based fingerprint of the MODEL_KEYS portion of state.
 * djb2-style hash over JSON.stringify of sorted keys → hex digest.
 *
 * This is NOT cryptographic — used for change detection in the UI and
 * for tagging conversations with their origin state.
 */
export function fingerprint(state) {
  if (!state || typeof state !== 'object') return '0';
  const obj = {};
  for (const k of MODEL_KEYS) obj[k] = state[k];
  const json = JSON.stringify(obj);
  let h = 5381;
  for (let i = 0; i < json.length; i++) {
    h = ((h * 33) ^ json.charCodeAt(i)) >>> 0;
  }
  return h.toString(16);
}

/**
 * Recursively trim heavy fields from an object before persisting. Deep clones
 * the input so the in-memory copy is unaffected.
 *
 * - Arrays longer than 50 entries get truncated with a marker entry.
 * - Object keys in HEAVY_KEYS get replaced with a marker string.
 * - Strings longer than 5KB get truncated.
 */
export function trimForStorage(node, depth = 0) {
  if (depth > 10) return TRIM_MARKER;
  if (node == null) return node;
  if (typeof node === 'string') {
    return node.length > 5000 ? node.slice(0, 5000) + ' ...[trimmed]' : node;
  }
  if (typeof node !== 'object') return node;
  if (Array.isArray(node)) {
    if (node.length > 50) {
      return [
        ...node.slice(0, 50).map((v) => trimForStorage(v, depth + 1)),
        { __trimmed: `${node.length - 50} more items` },
      ];
    }
    return node.map((v) => trimForStorage(v, depth + 1));
  }
  const out = {};
  for (const k of Object.keys(node)) {
    if (HEAVY_KEYS.has(k)) {
      out[k] = TRIM_MARKER;
    } else {
      out[k] = trimForStorage(node[k], depth + 1);
    }
  }
  return out;
}

/**
 * Load all conversations from storage.
 *
 * @param {object} [storage] - storage adapter; defaults to window.storage
 * @returns {Promise<Array>}
 */
export async function loadAll(storage) {
  const s = storage || (typeof window !== 'undefined' ? window.storage : null);
  if (!s || typeof s.get !== 'function') return [];
  try {
    const result = await s.get(ADVISOR_STORAGE_KEY_CONVERSATIONS);
    if (!result || typeof result.value !== 'string') return [];
    const parsed = JSON.parse(result.value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

/**
 * Persist conversations to storage. Trims tool-result snapshots in stored
 * messages and enforces the conversation cap (oldest pruned first).
 *
 * Writes through the shared persistence guard (remediation 1.3): backup to
 * '<key>.bak' before overwrite; refuses to overwrite stored history with an
 * empty/dramatically smaller payload unless opts.intentionalClear is set
 * (the delete-conversation / clear-all paths).
 *
 * @param {Array} conversations
 * @param {object} [storage]
 * @param {{ intentionalClear?: boolean }} [opts]
 * @returns {Promise<{ ok: boolean, pruned: number, bytes: number, reason?: string|null }>}
 */
export async function save(conversations, storage, opts = {}) {
  const s = storage || (typeof window !== 'undefined' ? window.storage : null);
  if (!s || typeof s.set !== 'function') return { ok: false, pruned: 0, bytes: 0 };
  let trimmed = Array.isArray(conversations) ? [...conversations] : [];
  let pruned = 0;
  if (trimmed.length > ADVISOR_MAX_CONVERSATIONS) {
    // Sort by updatedAt descending and keep newest N.
    trimmed.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
    pruned = trimmed.length - ADVISOR_MAX_CONVERSATIONS;
    trimmed = trimmed.slice(0, ADVISOR_MAX_CONVERSATIONS);
  }
  // Trim tool-call payloads in every message before serializing.
  const forStorage = trimmed.map((c) => ({
    ...c,
    messages: (c.messages || []).map((m) => ({
      ...m,
      toolCalls: Array.isArray(m.toolCalls)
        ? m.toolCalls.map((tc) => ({
          name: tc.name,
          input: trimForStorage(tc.input),
          result: trimForStorage(tc.result),
          durationMs: tc.durationMs,
        }))
        : undefined,
    })),
  }));
  const json = JSON.stringify(forStorage);
  const result = await safeWrite(s, ADVISOR_STORAGE_KEY_CONVERSATIONS, json, {
    intentionalClear: Boolean(opts.intentionalClear),
    label: 'advisor-conversations',
  });
  return { ok: result.ok, pruned, bytes: json.length, reason: result.reason };
}

/**
 * Create a new conversation tied to the current scenario + state fingerprint.
 *
 * @param {{scenarioName?: string|null, state: object}} args
 * @returns {object} new conversation (not yet persisted)
 */
export function createNew({ scenarioName, state }) {
  const now = new Date().toISOString();
  return {
    id: uuid(),
    scenarioName: scenarioName || null,
    createdAt: now,
    updatedAt: now,
    stateFingerprint: fingerprint(state),
    messages: [],
  };
}

/**
 * Append a message to a conversation, returning a new conversation object
 * (immutable update — caller should swap the stored copy).
 */
export function appendMessage(convo, message) {
  if (!convo || typeof convo !== 'object') throw new Error('appendMessage: convo required');
  return {
    ...convo,
    updatedAt: new Date().toISOString(),
    messages: [...(convo.messages || []), { id: message.id || uuid(), timestamp: new Date().toISOString(), ...message }],
  };
}

/**
 * Patch a message in a conversation — used by the streaming UI to grow an
 * assistant message as deltas arrive. Returns a new conversation object.
 */
export function updateMessage(convo, messageId, patch) {
  if (!convo || typeof convo !== 'object') throw new Error('updateMessage: convo required');
  return {
    ...convo,
    updatedAt: new Date().toISOString(),
    messages: (convo.messages || []).map((m) => (m.id === messageId ? { ...m, ...patch } : m)),
  };
}

/**
 * Remove a conversation by id.
 */
export function deleteConversation(conversations, id) {
  return (conversations || []).filter((c) => c.id !== id);
}

/**
 * Export a conversation as Markdown — user/assistant turns + tool-call
 * summaries (no API key, no raw state dumps).
 */
export function exportAsMarkdown(convo) {
  if (!convo || !Array.isArray(convo.messages)) return '';
  const lines = [];
  lines.push(`# Advisor Conversation`);
  lines.push('');
  lines.push(`**Created:** ${convo.createdAt}`);
  if (convo.scenarioName) lines.push(`**Scenario:** ${convo.scenarioName}`);
  lines.push(`**State fingerprint:** \`${convo.stateFingerprint}\``);
  lines.push('');
  for (const msg of convo.messages) {
    const heading = msg.role === 'user' ? 'You' : 'Advisor';
    lines.push(`## ${heading}`);
    lines.push(`*${msg.timestamp}*`);
    lines.push('');
    // Render content blocks (text only). Tool calls are summarized below.
    if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.type === 'text' && typeof block.text === 'string') {
          lines.push(block.text);
          lines.push('');
        }
      }
    } else if (typeof msg.content === 'string') {
      lines.push(msg.content);
      lines.push('');
    }
    if (Array.isArray(msg.toolCalls) && msg.toolCalls.length > 0) {
      lines.push('### Tool calls');
      for (const tc of msg.toolCalls) {
        lines.push(`- **${tc.name}**${tc.durationMs ? ` (${tc.durationMs}ms)` : ''}`);
      }
      lines.push('');
    }
    if (msg.verifier && msg.verifier.stats) {
      const v = msg.verifier.stats;
      lines.push(`*Verifier: ${v.covered}/${v.total} numbers traced${v.mismatchCount > 0 ? `, ${v.mismatchCount} unverified` : ''}*`);
      lines.push('');
    }
  }
  return lines.join('\n');
}

/**
 * Export a conversation as a JSON archive (full content blocks preserved,
 * tool-call payloads trimmed).
 */
export function exportAsJSON(convo) {
  if (!convo) return 'null';
  const safe = {
    ...convo,
    messages: (convo.messages || []).map((m) => ({
      ...m,
      toolCalls: Array.isArray(m.toolCalls)
        ? m.toolCalls.map((tc) => ({
          name: tc.name,
          input: trimForStorage(tc.input),
          result: trimForStorage(tc.result),
          durationMs: tc.durationMs,
        }))
        : undefined,
    })),
  };
  return JSON.stringify(safe, null, 2);
}
