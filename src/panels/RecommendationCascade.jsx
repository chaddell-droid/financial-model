import React, { useMemo } from 'react';
import { computeMoveCascade } from '../model/moveCascade.js';
import { fmtFull } from '../model/formatters.js';
import { UI_COLORS, UI_SPACE, UI_TEXT } from '../ui/tokens.js';

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
  count = 3,                   // N rungs (default 3 for Overview; Plan passes 5)
  presentMode = false,         // hide all interactive controls in DadMode
}) {
  const stagedIds = useMemo(
    () => new Set(previewMoves.map((m) => m.id)),
    [previewMoves],
  );
  const hasPreview = previewMoves.length > 0;

  const cascade = useMemo(() => {
    if (!gatherState) return [];
    const s = gatherState();
    if (!s) return [];
    return computeMoveCascade(s, count);
  }, [gatherState, count]);

  // Hide entirely in DadMode. Preview state is preserved by the reducer —
  // we just do not render the control surface (FR34, FR35).
  if (presentMode) return null;

  const empty = cascade.length === 0;

  return (
    <div data-testid="recommendation-cascade">
      {hasPreview && <PreviewModeBanner count={previewMoves.length} />}

      {hasPreview && (
        <StagedMovesList moves={previewMoves} onRemove={removePreviewMove} />
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
          {cascade.map((rung, i) => {
            const isStaged = stagedIds.has(rung.id);
            const showCumulative = i > 0 && rung.cumulativeFinalBalanceDelta !== rung.finalBalanceDelta;
            return (
              <li
                key={rung.id}
                style={{
                  marginBottom: i < cascade.length - 1 ? UI_SPACE.md : 0,
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
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

// ─── Staged moves list (FR11: each staged rung has a Remove action) ───────
function StagedMovesList({ moves, onRemove }) {
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
        {moves.map((m) => (
          <li
            key={m.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: UI_SPACE.sm,
              padding: `${UI_SPACE.xs}px 0`,
              fontSize: UI_TEXT.caption,
              color: UI_COLORS.textBody,
            }}
          >
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
          </li>
        ))}
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
