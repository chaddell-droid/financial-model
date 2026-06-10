/**
 * CFP Advisor — agent loop.
 *
 * Drives the streaming tool-use loop with the Anthropic API:
 *   1. Send user message + accumulated history
 *   2. Stream the assistant's response (text + tool_use blocks)
 *   3. If stop_reason === 'tool_use', execute every tool, append a
 *      tool_result user message, loop.
 *   4. Otherwise terminate (end_turn / max_tokens).
 *
 * The Anthropic SDK is injected (`client` parameter) so tests can supply a
 * fake client that emits scripted events without hitting the network.
 */

import {
  ADVISOR_MODEL,
  ADVISOR_MAX_TOKENS,
  ADVISOR_MAX_TOOL_ITERATIONS,
  ADVISOR_REQUEST_TIMEOUT_MS,
  estimateCost,
} from './config.js';
import { runTool, toolsForAnthropic } from './tools.js';
import { buildSystemPrompt } from './systemPrompt.js';
import { verifyTurn } from './verifier.js';

/**
 * Return a request-time copy of `messages` with a prompt-cache breakpoint
 * (`cache_control: {type:'ephemeral'}`) on the LAST content block of the
 * MOST RECENT message. Combined with the single system-prompt breakpoint,
 * this caches the whole conversation prefix between tool iterations and
 * follow-up turns. The stored conversation itself is never mutated, so
 * persisted history stays free of stale cache markers.
 */
function withMessageCacheBreakpoint(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return messages;
  const last = messages[messages.length - 1];
  let content = last.content;
  if (typeof content === 'string') {
    content = [{ type: 'text', text: content, cache_control: { type: 'ephemeral' } }];
  } else if (Array.isArray(content) && content.length > 0) {
    content = content.map((b, i) => (
      i === content.length - 1 ? { ...b, cache_control: { type: 'ephemeral' } } : b
    ));
  } else {
    return messages;
  }
  return [...messages.slice(0, -1), { ...last, content }];
}

/**
 * Stream a single advisor turn.
 *
 * @param {object} args
 * @param {object} args.client - Anthropic SDK client (or compatible mock)
 * @param {object} args.state - gathered household state
 * @param {Array} args.messages - prior conversation messages (Anthropic format)
 * @param {string} args.userMessage - user's new prompt
 * @param {(chunk: string) => void} [args.onTextDelta]
 * @param {(call: {id: string, name: string, input: object}) => void} [args.onToolCallStart]
 * @param {(call: {id: string, name: string, input: object, result: object, durationMs: number}) => void} [args.onToolCallResult]
 * @param {(usage: object) => void} [args.onUsage]
 * @param {(out: object) => void} [args.onComplete]
 * @param {(err: Error) => void} [args.onError]
 * @param {AbortSignal} [args.signal]
 * @returns {Promise<{finalMessages: Array, toolCalls: Array, usage: object, stopReason: string, verifier: object}>}
 */
export async function streamAdvisorTurn({
  client,
  state,
  messages,
  userMessage,
  onTextDelta,
  onToolCallStart,
  onToolCallResult,
  onUsage,
  onComplete,
  onError,
  signal,
}) {
  if (!client || !client.messages || typeof client.messages.stream !== 'function') {
    const err = new Error('Anthropic client missing or does not expose messages.stream');
    if (onError) onError(err);
    throw err;
  }

  const systemBlocks = buildSystemPrompt(state);
  const toolDefs = toolsForAnthropic();

  // Build initial conversation: prior history + user message.
  const conversation = [...(messages || []), { role: 'user', content: userMessage }];

  const allToolCalls = [];
  const accumulatedUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreateTokens: 0 };
  let assistantText = ''; // concatenated text across all turns (only for verifier)
  let stopReason = null;

  for (let iter = 0; iter < ADVISOR_MAX_TOOL_ITERATIONS; iter++) {
    if (signal && signal.aborted) {
      const err = new Error('Advisor turn aborted');
      if (onError) onError(err);
      throw err;
    }

    // Request options: forward the caller's AbortSignal so Stop actually
    // cancels the HTTP request, and cap each request at the advisor timeout.
    const stream = client.messages.stream({
      model: ADVISOR_MODEL,
      max_tokens: ADVISOR_MAX_TOKENS,
      system: systemBlocks,
      tools: toolDefs,
      messages: withMessageCacheBreakpoint(conversation),
    }, { signal, timeout: ADVISOR_REQUEST_TIMEOUT_MS });

    if (stream.on) {
      // Use the SDK's typed event emitters when available.
      stream.on('text', (delta) => {
        assistantText += delta;
        if (onTextDelta) onTextDelta(delta);
      });
      stream.on('contentBlock', (block) => {
        if (block && block.type === 'tool_use' && onToolCallStart) {
          onToolCallStart({ id: block.id, name: block.name, input: block.input || {} });
        }
      });
    } else if (typeof stream[Symbol.asyncIterator] === 'function') {
      // Fallback: iterate raw events ourselves. Tool inputs are NOT
      // accumulated here — the complete tool_use blocks (with parsed input)
      // are read off finalMessage() below.
      for await (const event of stream) {
        if (!event) continue;
        if (event.type === 'content_block_delta' && event.delta && event.delta.type === 'text_delta') {
          assistantText += event.delta.text;
          if (onTextDelta) onTextDelta(event.delta.text);
        } else if (event.type === 'content_block_start' && event.content_block && event.content_block.type === 'tool_use') {
          if (onToolCallStart) onToolCallStart({ id: event.content_block.id, name: event.content_block.name, input: {} });
        }
      }
    }

    // Resolve final message (works for both real SDK and fakes that expose it directly).
    const final = typeof stream.finalMessage === 'function'
      ? await stream.finalMessage()
      : (stream.final || (typeof stream.then === 'function' ? await stream : null));

    if (!final) {
      const err = new Error('Anthropic stream returned no final message');
      if (onError) onError(err);
      throw err;
    }

    // Accumulate usage.
    if (final.usage) {
      accumulatedUsage.inputTokens += final.usage.input_tokens || 0;
      accumulatedUsage.outputTokens += final.usage.output_tokens || 0;
      accumulatedUsage.cacheReadTokens += final.usage.cache_read_input_tokens || 0;
      accumulatedUsage.cacheCreateTokens += final.usage.cache_creation_input_tokens || 0;
      if (onUsage) onUsage({ ...final.usage });
    }

    stopReason = final.stop_reason || final.stopReason || 'unknown';

    if (stopReason === 'end_turn' || stopReason === 'max_tokens' || stopReason === 'stop_sequence') {
      // Done — append the final assistant message and exit.
      conversation.push({ role: 'assistant', content: final.content });
      break;
    }

    if (stopReason !== 'tool_use') {
      // Unexpected; bail with what we have.
      conversation.push({ role: 'assistant', content: final.content });
      break;
    }

    // Execute tool_use blocks.
    const toolUseBlocks = (final.content || []).filter((b) => b && b.type === 'tool_use');
    if (toolUseBlocks.length === 0) {
      // Stop reason said tool_use but no blocks — bail.
      conversation.push({ role: 'assistant', content: final.content });
      break;
    }

    const toolResults = [];
    for (const block of toolUseBlocks) {
      const start = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      const result = runTool(block.name, state, block.input || {});
      const end = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      const durationMs = Math.round(end - start);
      const callRecord = { id: block.id, name: block.name, input: block.input || {}, result, durationMs };
      allToolCalls.push(callRecord);
      if (onToolCallResult) onToolCallResult(callRecord);
      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: JSON.stringify(result),
        is_error: !result || result.ok === false,
      });
    }

    // Append the assistant turn (with its tool_use blocks) and the tool results.
    conversation.push({ role: 'assistant', content: final.content });
    conversation.push({ role: 'user', content: toolResults });
    // Loop continues.
  }

  if (stopReason === null || stopReason === 'tool_use') {
    // Iteration cap exhausted.
    const err = new Error('Advisor exceeded max tool iterations');
    if (onError) onError(err);
  }

  const verifier = verifyTurn({ assistantText, toolCalls: allToolCalls, state });
  const cost = estimateCost(accumulatedUsage);
  const out = {
    finalMessages: conversation,
    toolCalls: allToolCalls,
    usage: { ...accumulatedUsage, estimatedCost: cost },
    stopReason,
    verifier,
    assistantText,
  };
  if (onComplete) onComplete(out);
  return out;
}

// Re-export request timeout for callers that want to attach an AbortController.
export { ADVISOR_REQUEST_TIMEOUT_MS };
