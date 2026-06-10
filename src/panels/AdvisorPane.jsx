/**
 * AdvisorPane — CFP-grade advisor pane.
 *
 * Bottom-of-tab pane that lets the user have a real CFP conversation with
 * Claude Opus 4.7 over the household's projection. Tool-augmented streaming.
 *
 * Sub-components defined inline below to keep file count manageable:
 *   - AdvisorMessage      — renders one message (user or assistant)
 *   - AdvisorToolCallCard — collapsible card per tool call
 *   - AdvisorComposer     — multiline input + send/stop
 *   - AdvisorSettings     — slide-over with API key + usage + clear
 *   - SuggestedPrompts    — state-aware prompt suggestions
 *   - ConversationList    — sidebar with prior conversations
 *
 * Storage:
 *   - Conversations:    fs_fin-advisor-conversations
 *   - API key:          fs_advisor-key
 *   - Lifetime usage:   fs_fin-advisor-usage
 */

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import Anthropic from '@anthropic-ai/sdk';
import { ADVISOR_MODEL, estimateCost, ADVISOR_STORAGE_KEY_USAGE, ADVISOR_STORAGE_KEY_CONVERSATIONS } from '../advisor/config.js';
import { getKey, setKey, clearKey, hasKey, keySource } from '../advisor/keyStore.js';
import {
  loadAll, save, createNew, appendMessage, updateMessage, deleteConversation,
  exportAsMarkdown, exportAsJSON, uuid,
} from '../advisor/conversationStore.js';
import { streamAdvisorTurn } from '../advisor/advisorAgent.js';
import { renderMarkdown } from './advisor/advisorMarkdown.js';

const COLORS = {
  bg: '#0f172a',
  surface: '#1e293b',
  surfaceMuted: '#0f172a',
  border: '#334155',
  borderSoft: '#1e293b',
  text: '#e2e8f0',
  textMuted: '#94a3b8',
  textDim: '#64748b',
  accent: '#60a5fa',
  user: '#7dd3fc',
  assistant: '#a78bfa',
  positive: '#4ade80',
  warn: '#fbbf24',
  error: '#f87171',
  cyan: '#22d3ee',
};

export default function AdvisorPane({ state, gatherState, onApplyMove, scenarioName }) {
  // ─── state ────────────────────────────────────────────────────────────────
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [draft, setDraft] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState(null);
  const [error, setError] = useState(null);
  const [keyAvailable, setKeyAvailable] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [usage, setUsage] = useState({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreateTokens: 0, estimatedCost: 0 });
  const [lifetimeUsage, setLifetimeUsage] = useState(null);
  const abortRef = useRef(null);
  const streamBufferRef = useRef(''); // rAF-throttled accumulator
  const messagesEndRef = useRef(null);
  // Hydration gate (remediation 1.3c): the debounced persist effect stays
  // disarmed until loadAll() settles, so the initial empty conversation list
  // can never overwrite stored history.
  const loadedRef = useRef(false);
  // Set by the delete / clear-all handlers so the next debounced save may
  // legitimately shrink or empty the stored list (backup taken first).
  const clearIntentRef = useRef(false);

  // ─── load conversations + key on mount ────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const convs = await loadAll();
      if (cancelled) return;
      setConversations(convs);
      loadedRef.current = true;
      if (convs.length > 0) {
        // Bind to the most-recently-updated conversation matching the current scenario,
        // or the most-recent overall.
        const matched = convs.find((c) => c.scenarioName === (scenarioName || null));
        setActiveId((matched || convs[convs.length - 1]).id);
      }
      const k = await hasKey();
      setKeyAvailable(k);
      // Load lifetime usage
      try {
        if (typeof window !== 'undefined' && window.storage) {
          const r = await window.storage.get(ADVISOR_STORAGE_KEY_USAGE);
          if (r && r.value) setLifetimeUsage(JSON.parse(r.value));
        }
      } catch (_) {}
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── persist conversations on change (debounced) ──────────────────────────
  const saveTimerRef = useRef(null);
  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      if (!loadedRef.current) return; // disarmed until loadAll() settles
      const intentional = clearIntentRef.current;
      clearIntentRef.current = false;
      save(conversations, undefined, { intentionalClear: intentional }).catch(() => {});
    }, 500);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [conversations]);

  const activeConvo = useMemo(
    () => conversations.find((c) => c.id === activeId) || null,
    [conversations, activeId],
  );

  // ─── start a new conversation ─────────────────────────────────────────────
  const startNew = useCallback(() => {
    const fresh = createNew({ scenarioName: scenarioName || null, state: gatherState() });
    setConversations((prev) => [...prev, fresh]);
    setActiveId(fresh.id);
    setError(null);
  }, [scenarioName, gatherState]);

  // ─── send a message ──────────────────────────────────────────────────────
  const send = useCallback(async (text) => {
    if (!text || !text.trim() || streaming) return;
    if (!keyAvailable) { setShowSettings(true); return; }
    setError(null);
    let convo = activeConvo;
    if (!convo) {
      convo = createNew({ scenarioName: scenarioName || null, state: gatherState() });
      setConversations((prev) => [...prev, convo]);
      setActiveId(convo.id);
    }
    // Append user message
    const userMsg = { id: uuid(), role: 'user', content: text.trim(), timestamp: new Date().toISOString() };
    let next = appendMessage(convo, userMsg);
    setConversations((prev) => prev.map((c) => (c.id === convo.id ? next : c)));
    setDraft('');

    // Prepare assistant placeholder
    const assistantId = uuid();
    next = appendMessage(next, {
      id: assistantId,
      role: 'assistant',
      content: [],
      timestamp: new Date().toISOString(),
      toolCalls: [],
      streaming: true,
    });
    setConversations((prev) => prev.map((c) => (c.id === convo.id ? next : c)));
    setStreamingMessageId(assistantId);
    setStreaming(true);

    // Build messages history for the API (Anthropic format: role + content blocks).
    const apiMessages = next.messages
      .filter((m) => m.id !== assistantId) // exclude the placeholder we just added
      .map((m) => ({
        role: m.role,
        content: typeof m.content === 'string'
          ? m.content
          : (Array.isArray(m.content) ? m.content : [{ type: 'text', text: String(m.content || '') }]),
      }));
    // The streamAdvisorTurn API expects messages prior to userMessage.
    const priorMessages = apiMessages.slice(0, -1);
    const userMessageText = apiMessages[apiMessages.length - 1].content;

    // Init Anthropic client
    const apiKey = await getKey();
    if (!apiKey) {
      setStreaming(false);
      setKeyAvailable(false);
      setShowSettings(true);
      return;
    }
    const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

    // Streaming text accumulation: buffered with rAF
    streamBufferRef.current = '';
    let rafScheduled = false;
    const flushText = () => {
      const text = streamBufferRef.current;
      setConversations((prev) => prev.map((c) => {
        if (c.id !== convo.id) return c;
        return updateMessage(c, assistantId, {
          content: [{ type: 'text', text }],
        });
      }));
      rafScheduled = false;
    };
    const onTextDelta = (chunk) => {
      streamBufferRef.current += chunk;
      if (!rafScheduled) {
        rafScheduled = true;
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(flushText);
        else setTimeout(flushText, 16);
      }
    };

    const liveToolCalls = [];
    const onToolCallStart = (info) => {
      liveToolCalls.push({ id: info.id, name: info.name, input: info.input, result: null, durationMs: null });
      setConversations((prev) => prev.map((c) => {
        if (c.id !== convo.id) return c;
        return updateMessage(c, assistantId, { toolCalls: [...liveToolCalls] });
      }));
    };
    const onToolCallResult = (info) => {
      const idx = liveToolCalls.findIndex((t) => t.id === info.id);
      if (idx >= 0) {
        liveToolCalls[idx] = { id: info.id, name: info.name, input: info.input, result: info.result, durationMs: info.durationMs };
      } else {
        liveToolCalls.push({ id: info.id, name: info.name, input: info.input, result: info.result, durationMs: info.durationMs });
      }
      setConversations((prev) => prev.map((c) => {
        if (c.id !== convo.id) return c;
        return updateMessage(c, assistantId, { toolCalls: [...liveToolCalls] });
      }));
    };

    abortRef.current = new AbortController();
    try {
      const out = await streamAdvisorTurn({
        client,
        state: gatherState(),
        messages: priorMessages,
        userMessage: userMessageText,
        onTextDelta,
        onToolCallStart,
        onToolCallResult,
        // Surfaces non-fatal loop failures too (e.g., the tool-iteration cap),
        // which return normally rather than throwing.
        onError: (turnErr) => setError(turnErr && turnErr.message ? turnErr.message : String(turnErr)),
        signal: abortRef.current.signal,
      });
      // Finalize assistant message with content + verifier + final tool calls
      setConversations((prev) => prev.map((c) => {
        if (c.id !== convo.id) return c;
        return updateMessage(c, assistantId, {
          content: [{ type: 'text', text: out.assistantText }],
          toolCalls: out.toolCalls,
          verifier: out.verifier,
          stopReason: out.stopReason,
          streaming: false,
        });
      }));
      // Update usage (per-turn + lifetime)
      setUsage((prev) => ({
        inputTokens: prev.inputTokens + out.usage.inputTokens,
        outputTokens: prev.outputTokens + out.usage.outputTokens,
        cacheReadTokens: prev.cacheReadTokens + out.usage.cacheReadTokens,
        cacheCreateTokens: prev.cacheCreateTokens + out.usage.cacheCreateTokens,
        estimatedCost: prev.estimatedCost + out.usage.estimatedCost,
      }));
      const newLifetime = {
        inputTokens: (lifetimeUsage?.inputTokens || 0) + out.usage.inputTokens,
        outputTokens: (lifetimeUsage?.outputTokens || 0) + out.usage.outputTokens,
        cacheReadTokens: (lifetimeUsage?.cacheReadTokens || 0) + out.usage.cacheReadTokens,
        cacheCreateTokens: (lifetimeUsage?.cacheCreateTokens || 0) + out.usage.cacheCreateTokens,
      };
      newLifetime.estimatedCost = estimateCost(newLifetime);
      setLifetimeUsage(newLifetime);
      try {
        if (typeof window !== 'undefined' && window.storage) {
          await window.storage.set(ADVISOR_STORAGE_KEY_USAGE, JSON.stringify(newLifetime));
        }
      } catch (_) {}
    } catch (err) {
      setError(err.message || String(err));
      setConversations((prev) => prev.map((c) => {
        if (c.id !== convo.id) return c;
        return updateMessage(c, assistantId, {
          content: [{ type: 'text', text: `**Error:** ${err.message || String(err)}` }],
          streaming: false,
          errored: true,
        });
      }));
    } finally {
      setStreaming(false);
      setStreamingMessageId(null);
      abortRef.current = null;
    }
  }, [activeConvo, gatherState, scenarioName, streaming, keyAvailable, lifetimeUsage]);

  // ─── stop (abort) ─────────────────────────────────────────────────────────
  const stop = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
  }, []);

  // ─── auto-scroll on new content ───────────────────────────────────────────
  useEffect(() => {
    if (messagesEndRef.current && messagesEndRef.current.scrollIntoView) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [activeConvo?.messages?.length, streamingMessageId]);

  // ─── render ───────────────────────────────────────────────────────────────
  return (
    <div data-testid="advisor-pane" style={{
      background: COLORS.bg, borderRadius: 12, padding: 0, border: `1px solid ${COLORS.border}`,
      display: 'grid', gridTemplateRows: 'auto 1fr auto', minHeight: 600, maxHeight: '85vh', overflow: 'hidden',
    }}>
      {/* Header */}
      <Header
        scenarioName={scenarioName}
        usage={usage}
        lifetimeUsage={lifetimeUsage}
        keyAvailable={keyAvailable}
        onNew={startNew}
        onSettings={() => setShowSettings(true)}
        onExport={() => activeConvo && downloadMarkdown(activeConvo)}
      />

      {/* Body: sidebar + thread */}
      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', minHeight: 0, overflow: 'hidden' }}>
        <ConversationList
          conversations={conversations}
          activeId={activeId}
          onSelect={setActiveId}
          onDelete={(id) => {
            clearIntentRef.current = true; // user-driven shrink/empty is legitimate
            setConversations((prev) => deleteConversation(prev, id));
            if (activeId === id) setActiveId(conversations.find((c) => c.id !== id)?.id || null);
          }}
        />
        <div style={{ display: 'grid', gridTemplateRows: '1fr auto', minHeight: 0, overflow: 'hidden' }}>
          <ThreadView
            convo={activeConvo}
            keyAvailable={keyAvailable}
            error={error}
            messagesEndRef={messagesEndRef}
            streamingMessageId={streamingMessageId}
            onApplyMove={onApplyMove}
            onOpenSettings={() => setShowSettings(true)}
          />
          <SuggestedPrompts state={state} onPick={(t) => send(t)} disabled={streaming} />
        </div>
      </div>

      {/* Composer always at bottom */}
      <Composer
        draft={draft}
        setDraft={setDraft}
        streaming={streaming}
        onSend={() => send(draft)}
        onStop={stop}
        keyAvailable={keyAvailable}
      />

      {/* Settings drawer */}
      {showSettings && (
        <SettingsDrawer
          usage={usage}
          lifetimeUsage={lifetimeUsage}
          onClose={() => setShowSettings(false)}
          onKeySet={() => setKeyAvailable(true)}
          onKeyCleared={() => setKeyAvailable(false)}
          onClearConversations={() => { clearIntentRef.current = true; setConversations([]); setActiveId(null); }}
        />
      )}
    </div>
  );
}

// ─── Header ────────────────────────────────────────────────────────────────

function Header({ scenarioName, usage, lifetimeUsage, keyAvailable, onNew, onSettings, onExport }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 16px', borderBottom: `1px solid ${COLORS.border}`,
      background: COLORS.surface,
    }}>
      <div style={{ flex: '0 0 auto' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.text }}>💬 Advisor</div>
        <div style={{ fontSize: 10, color: COLORS.textMuted }}>Claude Opus 4.7 · CFP-grade</div>
      </div>
      <div style={{ flex: '0 0 auto', padding: '4px 10px', background: COLORS.surfaceMuted, borderRadius: 12, fontSize: 11, color: COLORS.textMuted, border: `1px solid ${COLORS.borderSoft}` }}>
        Scenario: {scenarioName || 'baseline'}
      </div>
      <div style={{ flex: '0 0 auto', padding: '4px 10px', background: COLORS.surfaceMuted, borderRadius: 12, fontSize: 11, color: COLORS.textMuted, border: `1px solid ${COLORS.borderSoft}` }} title="Token usage this session">
        Session: {(usage.inputTokens / 1000).toFixed(1)}k in · {(usage.outputTokens / 1000).toFixed(1)}k out · ${usage.estimatedCost.toFixed(3)}
      </div>
      <div style={{ flex: 1 }} />
      <button onClick={onNew} style={chipBtn}>＋ New</button>
      <button onClick={onExport} style={chipBtn}>⤓ Export</button>
      <button onClick={onSettings} style={chipBtn}>⚙ Settings</button>
      <div style={{ width: 8, height: 8, borderRadius: 4, background: keyAvailable ? COLORS.positive : COLORS.error }} title={keyAvailable ? 'API key configured' : 'No API key — click Settings'} />
    </div>
  );
}

// ─── ConversationList ─────────────────────────────────────────────────────

function ConversationList({ conversations, activeId, onSelect, onDelete }) {
  const sorted = [...conversations].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  return (
    <div style={{
      borderRight: `1px solid ${COLORS.border}`, overflow: 'auto',
      background: COLORS.surfaceMuted,
    }}>
      <div style={{ padding: '10px 12px', fontSize: 10, color: COLORS.textDim, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
        Conversations
      </div>
      {sorted.length === 0 && (
        <div style={{ padding: '8px 12px', fontSize: 11, color: COLORS.textDim, fontStyle: 'italic' }}>None yet</div>
      )}
      {sorted.map((c) => {
        const isActive = c.id === activeId;
        const firstUser = (c.messages || []).find((m) => m.role === 'user');
        const preview = firstUser
          ? (typeof firstUser.content === 'string' ? firstUser.content : (firstUser.content?.[0]?.text || ''))
          : '(empty)';
        return (
          <div key={c.id}
            onClick={() => onSelect(c.id)}
            style={{
              padding: '10px 12px', cursor: 'pointer',
              borderLeft: isActive ? `3px solid ${COLORS.accent}` : '3px solid transparent',
              background: isActive ? COLORS.surface : 'transparent',
              borderBottom: `1px solid ${COLORS.borderSoft}`,
              display: 'flex', flexDirection: 'column', gap: 2,
            }}>
            <div style={{ fontSize: 10, color: COLORS.textMuted }}>
              {c.scenarioName || 'baseline'} · {new Date(c.updatedAt).toLocaleDateString()}
            </div>
            <div style={{ fontSize: 11, color: isActive ? COLORS.text : COLORS.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {preview.slice(0, 60)}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: COLORS.textDim }}>
              <span>{(c.messages || []).length} msg</span>
              <button onClick={(e) => { e.stopPropagation(); onDelete(c.id); }} style={{ ...chipBtn, padding: '0 4px', fontSize: 9 }}>Delete</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── ThreadView ─────────────────────────────────────────────────────────────

function ThreadView({ convo, keyAvailable, error, messagesEndRef, streamingMessageId, onApplyMove, onOpenSettings }) {
  if (!keyAvailable) {
    return <NoKeyState onOpenSettings={onOpenSettings} />;
  }
  if (!convo || !convo.messages || convo.messages.length === 0) {
    return <EmptyState />;
  }
  return (
    <div style={{ overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {error && (
        <div style={{ background: '#3a1a1a', border: `1px solid ${COLORS.error}`, borderRadius: 6, padding: '8px 12px', color: COLORS.error, fontSize: 12 }}>
          {error}
        </div>
      )}
      {convo.messages.map((m) => (
        <AdvisorMessage key={m.id} message={m} streaming={m.id === streamingMessageId} onApplyMove={onApplyMove} />
      ))}
      <div ref={messagesEndRef} />
    </div>
  );
}

function NoKeyState({ onOpenSettings }) {
  return (
    <div style={{ padding: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: COLORS.textMuted }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>🔑</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.text, marginBottom: 6 }}>Add your Anthropic API key to start</div>
      <div style={{ fontSize: 12, maxWidth: 480, marginBottom: 16, lineHeight: 1.5 }}>
        The advisor calls Claude Opus 4.7 via the Anthropic API. Your key is stored in this browser only and is sent directly to Anthropic — never to any other server.
      </div>
      <button onClick={onOpenSettings} style={primaryBtn}>Open settings</button>
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{ padding: 32, color: COLORS.textMuted, textAlign: 'center', fontSize: 12 }}>
      <div style={{ fontSize: 24, marginBottom: 8 }}>💬</div>
      <div style={{ fontWeight: 700, color: COLORS.text, marginBottom: 4, fontSize: 14 }}>What would you like to know?</div>
      <div>Ask anything about your plan. I'll pull real numbers from the projection — never invent them.</div>
    </div>
  );
}

// ─── AdvisorMessage ─────────────────────────────────────────────────────────

function AdvisorMessage({ message, streaming, onApplyMove }) {
  const isUser = message.role === 'user';
  const text = useMemo(() => {
    if (typeof message.content === 'string') return message.content;
    if (Array.isArray(message.content)) {
      return message.content
        .filter((b) => b && b.type === 'text')
        .map((b) => b.text || '')
        .join('');
    }
    return '';
  }, [message.content]);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 6,
      alignSelf: isUser ? 'flex-end' : 'flex-start',
      maxWidth: '85%',
    }}>
      <div style={{ fontSize: 10, color: isUser ? COLORS.user : COLORS.assistant, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {isUser ? 'You' : 'Advisor'} · <span style={{ color: COLORS.textDim }}>{new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      </div>

      {/* Tool calls (assistant only) */}
      {!isUser && Array.isArray(message.toolCalls) && message.toolCalls.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {message.toolCalls.map((tc, i) => (
            <AdvisorToolCallCard key={tc.id || `${tc.name}-${i}`} call={tc} onApplyMove={onApplyMove} />
          ))}
        </div>
      )}

      {/* Body */}
      <div style={{
        background: isUser ? '#1e3a5f' : COLORS.surface,
        border: `1px solid ${isUser ? '#2563eb' : COLORS.border}`,
        borderRadius: 8,
        padding: '10px 14px',
        color: COLORS.text,
        fontSize: 13,
        lineHeight: 1.55,
        wordBreak: 'break-word',
      }}>
        {text.length > 0 ? renderMarkdown(text) : (streaming ? <StreamingDots /> : <span style={{ color: COLORS.textDim, fontStyle: 'italic' }}>(thinking...)</span>)}
        {streaming && text.length > 0 && <span style={{ color: COLORS.textDim }}>▍</span>}
      </div>

      {/* Truncation notice (assistant only): max_tokens = response length cap;
          tool_use as a FINAL stop reason = the tool-iteration cap was hit. */}
      {!isUser && !streaming && (message.stopReason === 'max_tokens' || message.stopReason === 'tool_use') && (
        <TruncationNotice stopReason={message.stopReason} />
      )}

      {/* Verifier badge (assistant only) */}
      {!isUser && message.verifier && message.verifier.stats && message.verifier.stats.total > 0 && (
        <VerifierBadge stats={message.verifier.stats} mismatches={message.verifier.mismatches} />
      )}
    </div>
  );
}

function TruncationNotice({ stopReason }) {
  const reason = stopReason === 'max_tokens' ? 'response length limit' : 'tool-iteration limit';
  return (
    <div title={`The model stopped at the ${reason} before finishing.`}
      style={{
        alignSelf: 'flex-start',
        fontSize: 10, color: COLORS.warn,
        background: 'rgba(251, 191, 36, 0.1)',
        border: `1px solid ${COLORS.warn}`, opacity: 0.85,
        borderRadius: 10, padding: '2px 8px', fontWeight: 600,
      }}>
      ⚠ Response was cut off ({reason}) — ask me to continue
    </div>
  );
}

function StreamingDots() {
  return <span style={{ color: COLORS.textMuted, fontStyle: 'italic' }}>thinking…</span>;
}

function VerifierBadge({ stats, mismatches }) {
  const allOk = stats.mismatchCount === 0;
  return (
    <div title={allOk ? 'Every number traced to a tool result' : 'Some numbers could not be traced — check tool calls'}
      style={{
        alignSelf: 'flex-start',
        fontSize: 10, color: allOk ? COLORS.positive : COLORS.warn,
        background: allOk ? 'rgba(74, 222, 128, 0.1)' : 'rgba(251, 191, 36, 0.1)',
        border: `1px solid ${allOk ? COLORS.positive : COLORS.warn}`, opacity: 0.85,
        borderRadius: 10, padding: '2px 8px', fontWeight: 600,
      }}>
      {allOk ? `✓ ${stats.covered}/${stats.total} numbers traced` : `⚠ ${stats.mismatchCount} of ${stats.total} numbers not traced`}
    </div>
  );
}

// ─── AdvisorToolCallCard ────────────────────────────────────────────────────

function AdvisorToolCallCard({ call, onApplyMove }) {
  const [expanded, setExpanded] = useState(false);
  const inProgress = call.result == null;
  const errored = call.result && call.result.ok === false;
  // moveCascade results have no applicable single mutation — excluded.
  const isWhatIf = call.name === 'whatIf' || call.name === 'topMoves';
  const showApply = !inProgress && !errored && isWhatIf && onApplyMove && hasApplicableMutation(call);

  return (
    <div style={{
      background: COLORS.surfaceMuted, border: `1px solid ${COLORS.borderSoft}`,
      borderRadius: 6, fontSize: 11,
    }}>
      <div onClick={() => setExpanded((v) => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', cursor: 'pointer' }}>
        <span style={{ color: inProgress ? COLORS.warn : errored ? COLORS.error : COLORS.cyan, fontWeight: 700 }}>
          {inProgress ? '⏳' : errored ? '⚠' : '▸'} {call.name}
        </span>
        {!inProgress && (
          <span style={{ color: COLORS.textDim, fontSize: 10 }}>{call.durationMs}ms</span>
        )}
        <span style={{ flex: 1 }} />
        <span style={{ color: COLORS.textDim, fontSize: 10 }}>{expanded ? 'collapse' : 'expand'}</span>
      </div>
      {expanded && (
        <div style={{ padding: '6px 10px', borderTop: `1px solid ${COLORS.borderSoft}`, fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: COLORS.textMuted, maxHeight: 280, overflow: 'auto' }}>
          {Object.keys(call.input || {}).length > 0 && (
            <>
              <div style={{ color: COLORS.textDim, marginBottom: 2 }}>input:</div>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{JSON.stringify(call.input, null, 2)}</pre>
            </>
          )}
          {!inProgress && (
            <>
              <div style={{ color: COLORS.textDim, marginTop: 6, marginBottom: 2 }}>result:</div>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{JSON.stringify(call.result, null, 2).slice(0, 4000)}</pre>
            </>
          )}
          {showApply && (
            <button
              onClick={() => {
                const mutation = extractMutation(call);
                if (mutation) onApplyMove(mutation);
              }}
              style={{ ...primaryBtn, marginTop: 8, fontSize: 11, padding: '4px 10px' }}
            >
              {call.name === 'topMoves'
                ? `Apply top move: ${firstMoveWithMutation(call)?.label || ''}`
                : 'Apply this move'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** First (top-ranked) move in a topMoves result that carries a mutation. */
function firstMoveWithMutation(call) {
  const moves = call.result?.moves;
  if (!Array.isArray(moves)) return null;
  return moves.find((m) => m && m.mutation && typeof m.mutation === 'object') || null;
}

function hasApplicableMutation(call) {
  if (call.name === 'whatIf') return Boolean(call.input?.mutation);
  if (call.name === 'topMoves') return Boolean(firstMoveWithMutation(call));
  return false;
}

function extractMutation(call) {
  if (call.name === 'whatIf') return call.input?.mutation || null;
  if (call.name === 'topMoves') return firstMoveWithMutation(call)?.mutation || null;
  return null;
}

// ─── Composer ───────────────────────────────────────────────────────────────

function Composer({ draft, setDraft, streaming, onSend, onStop, keyAvailable }) {
  const onKeyDown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (!streaming) onSend();
    }
  };
  return (
    <div style={{ display: 'flex', gap: 8, padding: '10px 16px', borderTop: `1px solid ${COLORS.border}`, background: COLORS.surface }}>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={keyAvailable ? 'Ask anything about your plan… (Cmd/Ctrl+Enter to send)' : 'Configure your API key first…'}
        disabled={!keyAvailable || streaming}
        rows={2}
        style={{
          flex: 1, resize: 'none', padding: '8px 10px',
          background: COLORS.bg, border: `1px solid ${COLORS.border}`,
          borderRadius: 6, color: COLORS.text, fontSize: 13,
          fontFamily: 'inherit', lineHeight: 1.4, outline: 'none',
        }}
      />
      {streaming
        ? <button onClick={onStop} style={{ ...primaryBtn, background: COLORS.error }}>Stop</button>
        : <button onClick={onSend} disabled={!keyAvailable || !draft.trim()} style={primaryBtn}>Send</button>}
    </div>
  );
}

// ─── SuggestedPrompts ──────────────────────────────────────────────────────

function SuggestedPrompts({ state, onPick, disabled }) {
  const prompts = useMemo(() => buildPrompts(state), [state]);
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '8px 16px', borderTop: `1px solid ${COLORS.borderSoft}`, background: COLORS.surfaceMuted }}>
      <span style={{ fontSize: 10, color: COLORS.textDim, alignSelf: 'center', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Suggested:</span>
      {prompts.map((p, i) => (
        <button key={i} onClick={() => !disabled && onPick(p)} disabled={disabled}
          style={{ ...chipBtn, fontSize: 11, padding: '4px 10px', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1 }}>
          {p}
        </button>
      ))}
    </div>
  );
}

function buildPrompts(state) {
  const out = ['What does my plan look like right now?'];
  if (Array.isArray(state.goals) && state.goals.length > 0) out.push('Are we on track to hit our goals?');
  out.push("What's the biggest risk in this plan?");
  if (state.chadJob === false) out.push('What if Chad takes the MSFT offer with L64 promotion?');
  if (state.chadJob && !state.chadL64Enabled) out.push('What if Chad gets promoted to L64 in 24 months?');
  if (state.chadJob && !state.chadJob401kEnabled) out.push('Should Chad max out his 401(k)?');
  out.push('How does our plan look in a 2008-style downturn?');
  return out.slice(0, 5);
}

// ─── SettingsDrawer ─────────────────────────────────────────────────────────

function SettingsDrawer({ usage, lifetimeUsage, onClose, onKeySet, onKeyCleared, onClearConversations }) {
  const [keyInput, setKeyInput] = useState('');
  const [source, setSource] = useState(null);
  const [saving, setSaving] = useState(false);
  // Default OFF: the key lives in this tab's session only. ON mirrors the
  // current source so re-saving a remembered key stays remembered.
  const [remember, setRemember] = useState(false);
  useEffect(() => {
    (async () => {
      const src = await keySource();
      setSource(src);
      setRemember(src === 'storage');
    })();
  }, []);

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100,
      display: 'flex', justifyContent: 'flex-end',
    }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: 420, maxWidth: '100%', height: '100%', background: COLORS.surface,
        borderLeft: `1px solid ${COLORS.border}`, padding: 24, overflow: 'auto',
        display: 'flex', flexDirection: 'column', gap: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.text }}>Advisor Settings</div>
          <button onClick={onClose} style={chipBtn}>✕ Close</button>
        </div>

        <Section title="Anthropic API key">
          <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 8, lineHeight: 1.5 }}>
            {source === 'env'
              ? <>Currently using <code style={{ color: COLORS.cyan }}>VITE_ANTHROPIC_API_KEY</code> from your build environment. To override, save a key here.</>
              : source === 'storage'
                ? 'Key configured (remembered in this browser). Clear to remove or replace.'
                : source === 'session'
                  ? 'Key active for this session only — it is NOT saved and disappears when this tab closes.'
                  : 'No key configured. Get one at console.anthropic.com.'}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="sk-ant-…"
              style={{
                flex: 1, padding: '6px 10px', fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
                background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 6, color: COLORS.text,
              }}
            />
            <button disabled={saving || !keyInput.trim()} onClick={async () => {
              setSaving(true);
              const ok = await setKey(keyInput, undefined, { remember });
              setSaving(false);
              if (ok) {
                setKeyInput('');
                setSource(await keySource());
                onKeySet();
              }
            }} style={primaryBtn}>Save</button>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 11, color: COLORS.textMuted, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            Remember key on this device (off = kept for this session only)
          </label>
          {(source === 'storage' || source === 'session') && (
            <button style={{ ...chipBtn, marginTop: 6 }} onClick={async () => {
              await clearKey();
              setSource(await keySource());
              onKeyCleared();
            }}>Clear key</button>
          )}
          <div style={{ fontSize: 10, color: COLORS.textDim, marginTop: 8, lineHeight: 1.5 }}>
            Your key never leaves this browser except to Anthropic directly over HTTPS. Recommendation: use a dedicated key with a monthly spend cap (set one at console.anthropic.com) so a leaked key can't run up charges. The advisor uses <code style={{ color: COLORS.cyan }}>{ADVISOR_MODEL}</code>.
          </div>
        </Section>

        <Section title="Token usage">
          <UsageRow label="This session" usage={usage} />
          {lifetimeUsage && <UsageRow label="Lifetime (this browser)" usage={lifetimeUsage} />}
        </Section>

        <Section title="Conversations">
          <button onClick={() => {
            if (typeof window !== 'undefined' && window.confirm && window.confirm('Delete all advisor conversations? This cannot be undone.')) {
              onClearConversations();
              if (typeof window !== 'undefined' && window.storage) window.storage.delete(ADVISOR_STORAGE_KEY_CONVERSATIONS).catch(() => {});
              onClose();
            }
          }} style={{ ...chipBtn, color: COLORS.error, borderColor: COLORS.error }}>
            Delete all conversations
          </button>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: COLORS.textDim, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}

function UsageRow({ label, usage }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'baseline', marginBottom: 6, fontSize: 11 }}>
      <div style={{ color: COLORS.textMuted }}>{label}</div>
      <div style={{ color: COLORS.text, fontFamily: "'JetBrains Mono', monospace" }}>
        {(usage.inputTokens / 1000).toFixed(1)}k in · {(usage.outputTokens / 1000).toFixed(1)}k out · ${(usage.estimatedCost || 0).toFixed(3)}
      </div>
    </div>
  );
}

// ─── helpers ────────────────────────────────────────────────────────────────

function downloadMarkdown(convo) {
  const md = exportAsMarkdown(convo);
  const blob = new Blob([md], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const safeName = (convo.scenarioName || 'baseline').replace(/[^a-z0-9]/gi, '-').toLowerCase();
  a.download = `advisor-${safeName}-${new Date().toISOString().slice(0, 10)}.md`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ─── shared styles ──────────────────────────────────────────────────────────

const chipBtn = {
  background: 'transparent',
  border: `1px solid ${COLORS.border}`,
  borderRadius: 4,
  padding: '4px 10px',
  fontSize: 11,
  color: COLORS.textMuted,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const primaryBtn = {
  background: COLORS.accent,
  border: 'none',
  borderRadius: 4,
  padding: '6px 14px',
  fontSize: 12,
  fontWeight: 700,
  color: '#0a1628',
  cursor: 'pointer',
  fontFamily: 'inherit',
};
