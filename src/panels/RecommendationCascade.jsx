import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { computeMoveCascade } from '../model/moveCascade.js';
import { fmtFull } from '../model/formatters.js';
import { UI_COLORS, UI_SPACE, UI_TEXT } from '../ui/tokens.js';
import ContinuousLeverSlider, { formatLeverValue } from './ContinuousLeverSlider.jsx';

/**
 * RecommendationCascade — preview-sandbox recommendation engine panel.
 *
 * Renders a live cascade of next-best moves. Each rung shows the move
 * label, dual-axis impact (monthly + long-term), and an Apply/Remove action
 * that stages the move into the preview layer. When one or more moves are
 * staged, a preview-mode banner renders above the cascade.
 *
 * The cascade recomputes automatically whenever state changes (FR9). There
 * is no "Calculate" button. `gatherState` is a live closure over reducer
 * state; when state mutates, `gatherState`'s reference changes and `useMemo`
 * recomputes.
 *
 * Hidden entirely when `presentMode === true` (FR34). Preview state is
 * preserved while DadMode is active — it is merely invisible, never
 * committed.
 */
export default function RecommendationCascade({
  gatherState,                 // () => composed state (auto-applies previewMoves inside)
  previewMoves = [],           // current preview stack (for staged-status indicators)
  applyPreviewMove,            // (move) => void — dispatches APPLY_PREVIEW_MOVE
  removePreviewMove,           // (id) => void — dispatches REMOVE_PREVIEW_MOVE
  clearPreview,                // () => void — dispatches CLEAR_PREVIEW (Story 1.5)
  commitPreview,               // () => void — dispatches COMMIT_PREVIEW (Story 1.5)
  saveFromPreview,             // (name) => Promise<void> — save-as-scenario with provenance (Story 1.5)
  setLeverConstraintOverride,  // (leverKey, bounds|null) => void — updates leverConstraintsOverride (Story 2.4)
  count = 3,                   // N rungs (default 3 for Overview; Plan passes 5)
  presentMode = false,         // hide all interactive controls in DadMode
}) {
  const stagedIds = useMemo(
    () => new Set(previewMoves.map((m) => m.id)),
    [previewMoves],
  );
  const hasPreview = previewMoves.length > 0;

  // Grab composed state so we can read effectiveLeverConstraints and feed
  // the cascade engine. useDeferredValue keeps the cascade recomputation
  // low-priority; the staged-list slider has its own local state so the
  // drag can't be interrupted by a re-render here either way.
  const composedState = useMemo(() => (gatherState ? gatherState() : null), [gatherState]);
  const deferredComposedState = useDeferredValue(composedState);

  const cascade = useMemo(() => {
    if (!deferredComposedState) return [];
    return computeMoveCascade(deferredComposedState, count);
  }, [deferredComposedState, count]);


  // Hide entirely in DadMode. Preview state is preserved by the reducer —
  // we just do not render the control surface (FR34, FR35).
  if (presentMode) return null;

  const empty = cascade.length === 0;

  return (
    <div data-testid="recommendation-cascade">
      {hasPreview && <PreviewModeBanner count={previewMoves.length} />}

      {hasPreview && (
        <StagedMovesList
          moves={previewMoves}
          onRemove={removePreviewMove}
          composedState={composedState}
          applyPreviewMove={applyPreviewMove}
          setLeverConstraintOverride={setLeverConstraintOverride}
          presentMode={presentMode}
        />
      )}

      {empty && !hasPreview && (
        <p
          style={{
            margin: 0,
            color: UI_COLORS.textMuted,
            fontSize: UI_TEXT.caption,
            fontStyle: 'italic',
          }}
        >
          No levers left to pull — your plan is fully leveraged.
        </p>
      )}

      {empty && hasPreview && (
        <p
          style={{
            margin: `${UI_SPACE.sm}px 0 0`,
            color: UI_COLORS.textMuted,
            fontSize: UI_TEXT.caption,
            fontStyle: 'italic',
          }}
        >
          No additional moves to suggest given the staged preview.
        </p>
      )}

      {!empty && (
        <ol
          style={{
            margin: hasPreview ? `${UI_SPACE.sm}px 0 0` : 0,
            paddingLeft: UI_SPACE.xl,
            listStyleType: 'decimal',
          }}
        >
          {cascade.map((rung, i, list) => {
            const isStaged = stagedIds.has(rung.id);
            const showCumulative = i > 0 && rung.cumulativeFinalBalanceDelta !== rung.finalBalanceDelta;
            return (
              <li
                key={rung.id}
                style={{
                  marginBottom: i < list.length - 1 ? UI_SPACE.md : 0,
                  color: UI_COLORS.textBody,
                  fontSize: UI_TEXT.body,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: UI_SPACE.md }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500 }}>{rung.label}</div>
                    <ImpactLine rung={rung} showCumulative={showCumulative} />
                  </div>
                  <RungAction
                    isStaged={isStaged}
                    onApply={() => applyPreviewMove?.({ id: rung.id, label: rung.label, mutation: rung.mutation })}
                    onRemove={() => removePreviewMove?.(rung.id)}
                  />
                </div>
                {/*
                  Note: continuous-lever rungs show only the label + Apply
                  button — NOT an inline slider. The slider lives exclusively
                  in the Staged in preview list above, where it's parented to
                  a stable DOM position that doesn't get re-rendered by
                  cascade re-ranking. Earlier attempts to render the slider
                  in the cascade rung caused the DOM element to unmount on
                  every state update, breaking drag tracking. The user's flow
                  is now: click Apply to preview → drag the slider in the
                  Staged list above → commit / save / clear when ready.
                */}
              </li>
            );
          })}
        </ol>
      )}

      {/* Commit action bar — Story 1.5. Only renders when callbacks are provided
          (keeps Story 1.3 tests / isolated usage working without the full
          commit/save plumbing). */}
      {(commitPreview || clearPreview || saveFromPreview) && (
        <CommitActionBar
          previewMoves={previewMoves}
          onCommit={commitPreview}
          onSave={saveFromPreview}
          onClear={clearPreview}
          presentMode={presentMode}
        />
      )}
    </div>
  );
}

// ─── Commit action bar — Commit / Save as scenario / Clear (Story 1.5) ─────
function CommitActionBar({ previewMoves, onCommit, onSave, onClear, presentMode }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  if (presentMode) return null;

  const disabled = !Array.isArray(previewMoves) || previewMoves.length === 0;

  const handleCommitClick = () => {
    if (disabled || !onCommit) return;
    setConfirmOpen(true);
  };
  const handleConfirm = () => {
    setConfirmOpen(false);
    onCommit?.();
  };
  const handleCancel = () => setConfirmOpen(false);

  const handleSaveClick = async () => {
    if (disabled || !onSave) return;
    // Simple prompt for Story 1.5 MVP. Future iteration can swap to inline form.
    const name = typeof window !== 'undefined'
      ? window.prompt('Save preview as a new scenario. Name:', '')
      : '';
    if (name && name.trim()) {
      await onSave(name.trim());
    }
  };

  const handleClearClick = () => {
    if (disabled || !onClear) return;
    onClear();
  };

  const baseBtn = {
    padding: `${UI_SPACE.xs}px ${UI_SPACE.md}px`,
    fontSize: UI_TEXT.caption,
    fontWeight: 600,
    borderRadius: 4,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.4 : 1,
  };

  return (
    <div
      data-testid="commit-action-bar"
      style={{
        display: 'flex',
        gap: UI_SPACE.sm,
        justifyContent: 'flex-end',
        alignItems: 'center',
        flexWrap: 'wrap',
        marginTop: UI_SPACE.md,
        paddingTop: UI_SPACE.sm,
        borderTop: `1px dashed ${UI_COLORS.border}`,
      }}
    >
      {!disabled && (
        <span style={{ fontSize: UI_TEXT.micro, color: UI_COLORS.textDim, marginRight: 'auto' }}>
          {previewMoves.length} move{previewMoves.length === 1 ? '' : 's'} staged
        </span>
      )}
      <button
        type="button"
        data-testid="clear-preview"
        onClick={handleClearClick}
        disabled={disabled}
        style={{
          ...baseBtn,
          background: 'transparent',
          color: UI_COLORS.textMuted,
          border: `1px solid ${UI_COLORS.border}`,
        }}
      >
        Clear preview
      </button>
      <button
        type="button"
        data-testid="save-as-scenario"
        onClick={handleSaveClick}
        disabled={disabled}
        style={{
          ...baseBtn,
          background: 'transparent',
          color: UI_COLORS.primary,
          border: `1px solid ${UI_COLORS.primary}`,
        }}
      >
        Save as new scenario
      </button>
      <button
        type="button"
        data-testid="commit-to-plan"
        onClick={handleCommitClick}
        disabled={disabled}
        style={{
          ...baseBtn,
          background: UI_COLORS.primary,
          color: '#fff',
          border: `1px solid ${UI_COLORS.primary}`,
        }}
      >
        Commit to plan
      </button>

      {confirmOpen && (
        <ConfirmCommitModal
          moves={previewMoves}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}
    </div>
  );
}

// ─── Confirm modal for Commit-to-plan ──────────────────────────────────────
function ConfirmCommitModal({ moves, onConfirm, onCancel }) {
  // Dismiss on Escape; click outside handled by the backdrop onClick.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCancel?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const count = Array.isArray(moves) ? moves.length : 0;

  return (
    <div
      data-testid="confirm-commit-backdrop"
      onClick={onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        data-testid="confirm-commit-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: UI_COLORS.panelBg,
          border: `1px solid ${UI_COLORS.border}`,
          borderRadius: 6,
          padding: UI_SPACE.lg,
          minWidth: 320,
          maxWidth: 480,
          color: UI_COLORS.textBody,
        }}
      >
        <div style={{ fontSize: UI_TEXT.title, fontWeight: 600, color: UI_COLORS.textStrong, marginBottom: UI_SPACE.md }}>
          Commit {count} move{count === 1 ? '' : 's'} to your plan?
        </div>
        <ol style={{ margin: 0, paddingLeft: UI_SPACE.xl, marginBottom: UI_SPACE.md }}>
          {Array.isArray(moves) && moves.map((m, i) => (
            <li key={m.id || i} style={{ fontSize: UI_TEXT.body, marginBottom: UI_SPACE.xs }}>
              {m.label || m.id}
            </li>
          ))}
        </ol>
        <div style={{ fontSize: UI_TEXT.micro, color: UI_COLORS.textDim, marginBottom: UI_SPACE.md }}>
          This updates your baseline plan. Existing saved scenarios are unchanged.
        </div>
        <div style={{ display: 'flex', gap: UI_SPACE.sm, justifyContent: 'flex-end' }}>
          <button
            type="button"
            data-testid="confirm-cancel"
            onClick={onCancel}
            style={{
              padding: `${UI_SPACE.xs}px ${UI_SPACE.md}px`,
              fontSize: UI_TEXT.caption,
              fontWeight: 500,
              borderRadius: 4,
              background: 'transparent',
              color: UI_COLORS.textMuted,
              border: `1px solid ${UI_COLORS.border}`,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="confirm-commit"
            onClick={onConfirm}
            style={{
              padding: `${UI_SPACE.xs}px ${UI_SPACE.md}px`,
              fontSize: UI_TEXT.caption,
              fontWeight: 600,
              borderRadius: 4,
              background: UI_COLORS.primary,
              color: '#fff',
              border: `1px solid ${UI_COLORS.primary}`,
              cursor: 'pointer',
            }}
          >
            Commit to plan
          </button>
        </div>
      </div>
    </div>
  );
}

// Short, human-readable prefix used when we regenerate a continuous-lever
// staged-move label on every slider change. Keeps the staged list honest
// about the ACTUAL value the user has dragged to.
function leverLabelPrefix(leverKey) {
  switch (leverKey) {
    case 'sarahRate': return `Sarah's rate:`;
    case 'sarahCurrentClients': return `Sarah's clients:`;
    case 'cutsOverride': return `Spending cuts:`;
    case 'bcsParentsAnnual': return `External BCS:`;
    case 'chadConsulting': return `Consulting:`;
    case 'ssClaimAge': return `Claim SS at`;
    case 'chadJobStartMonth': return `W-2 starts`;
    case 'vanSaleMonth': return `Sell van`;
    default: return `${leverKey}:`;
  }
}

// ─── Staged moves list (FR11: each staged rung has a Remove action) ───────
function StagedMovesList({ moves, onRemove, composedState, applyPreviewMove, setLeverConstraintOverride, presentMode }) {
  return (
    <div
      data-testid="staged-moves-list"
      style={{
        marginBottom: UI_SPACE.sm,
        padding: UI_SPACE.sm,
        border: `1px dashed ${UI_COLORS.primary}`,
        borderRadius: 4,
        background: 'rgba(96, 165, 250, 0.04)',
      }}
    >
      <div style={{ fontSize: UI_TEXT.micro, color: UI_COLORS.textDim, marginBottom: UI_SPACE.xs, fontWeight: 500 }}>
        Staged in preview
      </div>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
        {moves.map((m) => {
          const isContinuous = typeof m.id === 'string' && m.id.startsWith('optimize:');
          const leverKey = isContinuous ? m.id.slice('optimize:'.length) : null;
          const constraints =
            isContinuous && composedState && composedState.effectiveLeverConstraints
              ? composedState.effectiveLeverConstraints[leverKey]
              : null;
          const stagedValue =
            isContinuous && m.mutation && typeof m.mutation[leverKey] === 'number'
              ? m.mutation[leverKey]
              : null;

          return (
            <li
              key={m.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: UI_SPACE.xs,
                padding: `${UI_SPACE.xs}px 0`,
                fontSize: UI_TEXT.caption,
                color: UI_COLORS.textBody,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: UI_SPACE.sm }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: UI_SPACE.xs }}>
                  <span style={{ color: UI_COLORS.positive, fontWeight: 600 }}>✓</span>
                  <span>{m.label}</span>
                </span>
                <button
                  type="button"
                  data-testid="remove-preview"
                  onClick={() => onRemove?.(m.id)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: UI_COLORS.textMuted,
                    fontSize: UI_TEXT.caption,
                    cursor: 'pointer',
                    padding: `${UI_SPACE.xs}px ${UI_SPACE.sm}px`,
                    borderRadius: 3,
                  }}
                  title="Remove from preview"
                >
                  Remove
                </button>
              </div>

              {/* Continuous-lever staged moves get a stable slider here —
                  the cascade above filters them out so they don't vanish
                  while the user drags. */}
              {isContinuous && constraints && typeof stagedValue === 'number' && (
                <ContinuousLeverSlider
                  leverKey={leverKey}
                  currentValue={stagedValue}
                  min={constraints.min}
                  max={constraints.max}
                  onChange={(nextValue) => {
                    const freshLabel = `${leverLabelPrefix(leverKey)} ${formatLeverValue(leverKey, nextValue)}`;
                    applyPreviewMove?.({
                      id: m.id,
                      label: freshLabel,
                      mutation: { [leverKey]: nextValue },
                    });
                  }}
                  onOverrideBounds={(bounds) => setLeverConstraintOverride?.(leverKey, bounds)}
                  presentMode={presentMode}
                />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─── Preview-mode banner — unmistakable visual indicator (FR14) ────────────
function PreviewModeBanner({ count }) {
  return (
    <div
      data-testid="preview-mode-banner"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: UI_SPACE.xs,
        padding: `${UI_SPACE.xs}px ${UI_SPACE.sm}px`,
        marginBottom: UI_SPACE.sm,
        background: 'rgba(96, 165, 250, 0.08)',
        border: `1px dashed ${UI_COLORS.primary}`,
        borderRadius: 4,
        fontSize: UI_TEXT.caption,
        color: UI_COLORS.primary,
        fontWeight: 500,
      }}
    >
      <span>◆</span>
      <span>
        Preview mode — {count} move{count === 1 ? '' : 's'} staged
      </span>
    </div>
  );
}

// ─── Dual-axis impact line (monthly + long-term, optionally cumulative) ────
function ImpactLine({ rung, showCumulative }) {
  const monoFont = "'JetBrains Mono', monospace";
  const monthly = rung.monthlyImpact;
  const finalDelta = rung.finalBalanceDelta;
  const beDelta = rung.breakevenMonthDelta;

  return (
    <div style={{ fontSize: UI_TEXT.caption, color: UI_COLORS.textMuted, marginTop: 2 }}>
      {monthly > 0 && (
        <span style={{ fontFamily: monoFont, color: UI_COLORS.positive }}>
          +{fmtFull(monthly)}/mo
        </span>
      )}
      {finalDelta > 0 && (
        <>
          {monthly > 0 && ' · '}
          <span style={{ fontFamily: monoFont, color: UI_COLORS.positive }}>
            +{fmtFull(finalDelta)} at end
          </span>
        </>
      )}
      {beDelta < 0 && (
        <>
          {(monthly > 0 || finalDelta > 0) && ' · '}
          <span style={{ fontFamily: monoFont, color: UI_COLORS.positive }}>
            Breakeven {Math.abs(beDelta)} mo sooner
          </span>
        </>
      )}
      {showCumulative && rung.cumulativeFinalBalanceDelta > 0 && (
        <div style={{ marginTop: 1, fontSize: UI_TEXT.micro, color: UI_COLORS.textDim }}>
          <span style={{ fontFamily: monoFont }}>
            Cumulative w/ prior moves: +{fmtFull(rung.cumulativeFinalBalanceDelta)} at end
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Apply / Remove action button ──────────────────────────────────────────
function RungAction({ isStaged, onApply, onRemove }) {
  const baseStyle = {
    padding: `${UI_SPACE.xs}px ${UI_SPACE.sm}px`,
    fontSize: UI_TEXT.caption,
    fontWeight: 500,
    borderRadius: 4,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  };
  if (isStaged) {
    return (
      <button
        type="button"
        data-testid="remove-preview"
        onClick={onRemove}
        style={{
          ...baseStyle,
          background: 'transparent',
          color: UI_COLORS.textMuted,
          border: `1px solid ${UI_COLORS.border}`,
        }}
      >
        ✓ Staged — Remove
      </button>
    );
  }
  return (
    <button
      type="button"
      data-testid="apply-preview"
      onClick={onApply}
      style={{
        ...baseStyle,
        background: 'transparent',
        color: UI_COLORS.primary,
        border: `1px solid ${UI_COLORS.primary}`,
      }}
    >
      Apply to preview
    </button>
  );
}
