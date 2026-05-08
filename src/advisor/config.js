/**
 * CFP Advisor — runtime configuration constants.
 *
 * Single source of truth for the model id, token caps, and safety rails.
 * Pricing is illustrative for the usage display; verify against current
 * Anthropic pricing before publishing.
 */

export const ADVISOR_MODEL = 'claude-opus-4-7';
export const ADVISOR_MAX_TOKENS = 8192;          // per response
export const ADVISOR_MAX_TOOL_ITERATIONS = 10;   // safety cap on tool-use loop
export const ADVISOR_REQUEST_TIMEOUT_MS = 120_000;

// Conversation persistence
export const ADVISOR_MAX_CONVERSATIONS = 50;
export const ADVISOR_STORAGE_KEY_CONVERSATIONS = 'fin-advisor-conversations';
export const ADVISOR_STORAGE_KEY_API_KEY = 'advisor-key';
export const ADVISOR_STORAGE_KEY_USAGE = 'fin-advisor-usage';

// Pricing — used only for the cumulative usage display. Update if Anthropic changes.
// Opus 4.7 indicative rates ($ per 1M tokens).
export const ADVISOR_PRICE_INPUT_PER_MTOK = 15;
export const ADVISOR_PRICE_OUTPUT_PER_MTOK = 75;
export const ADVISOR_PRICE_CACHE_READ_PER_MTOK = 1.5;
export const ADVISOR_PRICE_CACHE_WRITE_PER_MTOK = 18.75;

export function estimateCost({ inputTokens = 0, outputTokens = 0, cacheReadTokens = 0, cacheCreateTokens = 0 } = {}) {
  return (
    (inputTokens / 1_000_000) * ADVISOR_PRICE_INPUT_PER_MTOK
    + (outputTokens / 1_000_000) * ADVISOR_PRICE_OUTPUT_PER_MTOK
    + (cacheReadTokens / 1_000_000) * ADVISOR_PRICE_CACHE_READ_PER_MTOK
    + (cacheCreateTokens / 1_000_000) * ADVISOR_PRICE_CACHE_WRITE_PER_MTOK
  );
}
