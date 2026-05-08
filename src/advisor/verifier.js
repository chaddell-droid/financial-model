/**
 * CFP Advisor — number citation verifier.
 *
 * Hard rule from the system prompt: every dollar amount, percentage, and
 * date the model states must come from a tool result in the same turn.
 *
 * This module:
 *   1. Extracts numeric mentions from the assistant's prose (skipping fenced
 *      code blocks, where the model reasonably echoes raw JSON).
 *   2. Walks every tool_result, collecting all numeric leaves.
 *   3. Cross-references with tolerances:
 *        - dollars: ±$1 OR ±0.5% of magnitude, whichever is larger
 *        - percentages: ±0.1pp
 *        - month references: exact integer match
 *
 * Mismatches are returned (not thrown). The agent loop logs them in dev,
 * surfaces a UI badge ("verified N/N numbers traced"), and never blocks.
 */

/**
 * @param {object} args
 * @param {string} args.assistantText - the prose body of the assistant message
 * @param {Array<{name: string, input: object, result: object}>} args.toolCalls - tools executed this turn
 * @returns {{
 *   coveredNumbers: Array,
 *   mismatches: Array<{kind: string, raw: string, normalized: number, snippet: string}>,
 *   stats: { total: number, covered: number, mismatchCount: number, byKind: object }
 * }}
 */
export function verifyTurn({ assistantText, toolCalls }) {
  const text = stripCodeBlocks(typeof assistantText === 'string' ? assistantText : '');
  const toolNumbers = collectToolNumbers(Array.isArray(toolCalls) ? toolCalls : []);

  const mentions = [];
  for (const m of extractDollars(text)) mentions.push({ kind: 'dollar', ...m });
  for (const m of extractPercents(text)) mentions.push({ kind: 'percent', ...m });
  for (const m of extractMonths(text)) mentions.push({ kind: 'month', ...m });

  const covered = [];
  const mismatches = [];

  for (const m of mentions) {
    const matched = matchesAny(m, toolNumbers);
    if (matched) {
      covered.push({ ...m, matchedFrom: matched });
    } else {
      mismatches.push(m);
    }
  }

  const byKind = { dollar: 0, percent: 0, month: 0 };
  for (const m of covered) byKind[m.kind] = (byKind[m.kind] || 0) + 1;

  return {
    coveredNumbers: covered,
    mismatches,
    stats: {
      total: mentions.length,
      covered: covered.length,
      mismatchCount: mismatches.length,
      byKind,
    },
  };
}

// ─── extractors ─────────────────────────────────────────────────────────────

function stripCodeBlocks(text) {
  // Remove fenced code blocks (```...```) and inline code (`...`) — model
  // legitimately echoes raw JSON inside these, which would create false flags.
  return text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]*`/g, '');
}

/**
 * Match dollar amounts: $1,234, $1.5K, $50.5M, $1B, $5,000,000.50, etc.
 * Captures the numeric value normalized to a plain Number.
 */
function extractDollars(text) {
  const out = [];
  // The K/M/B suffix only counts when it's a real suffix (not the start of a
  // word like "by" or "billion-dollar"). Require a non-letter immediately
  // after the suffix character.
  // We also accept signed amounts: $-8,200 and -$8,200 both parse to -8200.
  const reSuffixed = /(-?)\$(-?)([\d,]+(?:\.\d+)?)\s*([kKmMbB])(?![A-Za-z])/g;

  // First pass: collect all suffixed matches, and replace them in the text
  // with placeholder spaces so the plain pass can't misparse partial numbers
  // inside them (e.g., capturing "$1" out of "$1.5K").
  let plainText = text;
  for (const m of text.matchAll(reSuffixed)) {
    const raw = m[0];
    const sign = (m[1] === '-' || m[2] === '-') ? -1 : 1;
    const numStr = m[3].replace(/,/g, '');
    const num = parseFloat(numStr);
    if (!Number.isFinite(num)) continue;
    const mult = { k: 1e3, K: 1e3, m: 1e6, M: 1e6, b: 1e9, B: 1e9 }[m[4]];
    out.push({ raw, normalized: sign * num * mult, snippet: contextSnippet(text, m.index, raw.length) });
    // Blank out this match in plainText so the rePlain scan won't see it.
    plainText = plainText.slice(0, m.index) + ' '.repeat(raw.length) + plainText.slice(m.index + raw.length);
  }

  // Second pass: plain $N forms (no K/M/B suffix).
  const rePlain = /(-?)\$(-?)([\d,]+(?:\.\d+)?)\b/g;
  for (const m of plainText.matchAll(rePlain)) {
    const raw = m[0];
    const sign = (m[1] === '-' || m[2] === '-') ? -1 : 1;
    const numStr = m[3].replace(/,/g, '');
    const num = parseFloat(numStr);
    if (!Number.isFinite(num)) continue;
    out.push({ raw, normalized: sign * num, snippet: contextSnippet(text, m.index, raw.length) });
  }
  return out;
}

/**
 * Match percentages: 12%, 0.5%, 15.0% — including signed forms (+5%, -3%).
 */
function extractPercents(text) {
  const out = [];
  const re = /([+-]?\d+(?:\.\d+)?)\s*%/g;
  for (const m of text.matchAll(re)) {
    const raw = m[0];
    const num = parseFloat(m[1]);
    if (!Number.isFinite(num)) continue;
    out.push({ raw, normalized: num, snippet: contextSnippet(text, m.index, raw.length) });
  }
  return out;
}

/**
 * Match month references: "month 42", "in 24 months", "by month 60".
 * Returns the integer month value.
 */
function extractMonths(text) {
  const out = [];
  // "month N" or "month-N" forms
  const reMonth = /\bmonth[\s-]+(\d{1,3})\b/gi;
  for (const m of text.matchAll(reMonth)) {
    const raw = m[0];
    const num = parseInt(m[1], 10);
    if (!Number.isFinite(num)) continue;
    out.push({ raw, normalized: num, snippet: contextSnippet(text, m.index, raw.length) });
  }
  // "in N months" form
  const reInN = /\bin\s+(\d{1,3})\s+months?\b/gi;
  for (const m of text.matchAll(reInN)) {
    const raw = m[0];
    const num = parseInt(m[1], 10);
    if (!Number.isFinite(num)) continue;
    out.push({ raw, normalized: num, snippet: contextSnippet(text, m.index, raw.length) });
  }
  return out;
}

function contextSnippet(text, idx, len) {
  const start = Math.max(0, idx - 24);
  const end = Math.min(text.length, idx + len + 24);
  return text.slice(start, end).replace(/\s+/g, ' ').trim();
}

// ─── tool-result number collection ──────────────────────────────────────────

/**
 * Walk all tool_result objects and collect numeric leaves with attribution.
 */
function collectToolNumbers(toolCalls) {
  const numbers = []; // { value, path, toolName }
  for (const call of toolCalls) {
    if (!call || !call.result) continue;
    walk(call.result, '', call.name || 'tool', numbers);
  }
  return numbers;
}

function walk(node, path, toolName, out, depth = 0) {
  if (depth > 8) return; // safety against deep cycles
  if (node == null) return;
  if (typeof node === 'number' && Number.isFinite(node)) {
    out.push({ value: node, path, toolName });
    return;
  }
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) walk(node[i], `${path}[${i}]`, toolName, out, depth + 1);
    return;
  }
  if (typeof node === 'object') {
    for (const k of Object.keys(node)) walk(node[k], path ? `${path}.${k}` : k, toolName, out, depth + 1);
    return;
  }
  // strings, booleans — ignore
}

// ─── matching ───────────────────────────────────────────────────────────────

function matchesAny(mention, pool) {
  const value = mention.normalized;
  if (mention.kind === 'dollar') {
    // Dollars: ±$1 OR ±0.5% of magnitude, whichever larger.
    const tol = Math.max(1, Math.abs(value) * 0.005);
    return findInPool(pool, (v) => Math.abs(v - value) <= tol);
  }
  if (mention.kind === 'percent') {
    // Percents are tricky: tool results usually store fractions (0.12 = 12%).
    // Try both interpretations (raw and *100-scaled).
    const tolPP = 0.1; // percentage points
    return findInPool(pool, (v) => {
      // model said e.g., "12%". Match either v=12 or v=0.12.
      return Math.abs(v - value) <= tolPP || Math.abs(v * 100 - value) <= tolPP;
    });
  }
  if (mention.kind === 'month') {
    return findInPool(pool, (v) => Math.round(v) === value);
  }
  return null;
}

function findInPool(pool, predicate) {
  for (const p of pool) {
    if (predicate(p.value)) return { value: p.value, path: p.path, toolName: p.toolName };
  }
  return null;
}
