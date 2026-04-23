import React, { useState } from 'react';
import { UI_COLORS, UI_SPACE, UI_TEXT } from '../ui/tokens.js';

/**
 * ContinuousLeverSlider — Story 2.4.
 *
 * Inline slider for a bounded-continuous recommendation rung. Shows the
 * lever's valid [min, max] range, marks the current value, and dispatches
 * APPLY_PREVIEW_MOVE on every change so the cascade re-ranks live via the
 * existing useDeferredValue pipeline on state.
 *
 * Constraint editing: a small pencil icon opens an inline popover with
 * min/max numeric inputs. Saving dispatches SET_FIELD on
 * leverConstraintsOverride and the optimizer immediately respects the new
 * bounds on the next cascade computation (FR44).
 *
 * Hidden entirely when presentMode is true (FR34).
 *
 * Built as a NEW component alongside the intentionally-minimal Slider.jsx
 * primitive — per CLAUDE.md, Slider.jsx is not to be modified.
 */
export default function ContinuousLeverSlider({
  leverKey,         // e.g., 'sarahRate'
  currentValue,     // the mutation's value (optimizer pick OR user-dragged)
  min,              // from effectiveLeverConstraints[leverKey].min
  max,              // from effectiveLeverConstraints[leverKey].max
  step,             // UI step; defaults per lever below
  onChange,         // (newValue: number) => void  — dispatches APPLY_PREVIEW_MOVE
  onOverrideBounds, // (bounds: {min?, max?}|null) => void  — sets leverConstraintsOverride[key]
  presentMode = false,
}) {
  const [editing, setEditing] = useState(false);

  if (presentMode) return null;
  if (typeof min !== 'number' || typeof max !== 'number' || min > max) return null;

  const resolvedStep = step ?? defaultStepFor(leverKey);
  const v = clamp(currentValue, min, max);

  const handleChange = (e) => {
    const next = parseFloat(e.target.value);
    if (!Number.isFinite(next)) return;
    onChange?.(next);
  };

  return (
    <div
      data-testid="continuous-lever-slider"
      data-lever-key={leverKey}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: UI_SPACE.xs,
        marginTop: UI_SPACE.xs,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: UI_SPACE.sm }}>
        <span
          style={{
            fontSize: UI_TEXT.micro,
            color: UI_COLORS.textDim,
            fontFamily: "'JetBrains Mono', monospace",
            minWidth: 48,
          }}
          title={`Min: ${formatLeverValue(leverKey, min)}`}
        >
          {formatLeverValue(leverKey, min)}
        </span>

        <input
          type="range"
          data-testid="continuous-lever-slider-input"
          min={min}
          max={max}
          step={resolvedStep}
          value={v}
          onChange={handleChange}
          style={{ flex: 1, minWidth: 0, accentColor: UI_COLORS.primary }}
        />

        <span
          style={{
            fontSize: UI_TEXT.micro,
            color: UI_COLORS.textDim,
            fontFamily: "'JetBrains Mono', monospace",
            minWidth: 48,
            textAlign: 'right',
          }}
          title={`Max: ${formatLeverValue(leverKey, max)}`}
        >
          {formatLeverValue(leverKey, max)}
        </span>

        <button
          type="button"
          data-testid="edit-constraints"
          onClick={() => setEditing(true)}
          title="Edit min/max bounds"
          style={{
            background: 'transparent',
            border: `1px solid ${UI_COLORS.border}`,
            borderRadius: 3,
            padding: `0 ${UI_SPACE.xs}px`,
            fontSize: UI_TEXT.micro,
            color: UI_COLORS.textMuted,
            cursor: 'pointer',
            lineHeight: 1.6,
          }}
        >
          ✎
        </button>
      </div>

      <div
        style={{
          fontSize: UI_TEXT.caption,
          color: UI_COLORS.textBody,
          fontFamily: "'JetBrains Mono', monospace",
          textAlign: 'center',
        }}
      >
        <span style={{ color: UI_COLORS.primary, fontWeight: 600 }}>
          {formatLeverValue(leverKey, v)}
        </span>
      </div>

      {editing && (
        <ConstraintEditor
          leverKey={leverKey}
          currentMin={min}
          currentMax={max}
          onSave={(bounds) => { onOverrideBounds?.(bounds); setEditing(false); }}
          onCancel={() => setEditing(false)}
        />
      )}
    </div>
  );
}

// ─── Inline min/max editor popover ─────────────────────────────────────────
function ConstraintEditor({ leverKey, currentMin, currentMax, onSave, onCancel }) {
  const [min, setMin] = useState(String(currentMin));
  const [max, setMax] = useState(String(currentMax));
  const [error, setError] = useState(null);

  const parseBounds = () => {
    const nMin = parseFloat(min);
    const nMax = parseFloat(max);
    if (!Number.isFinite(nMin) || !Number.isFinite(nMax)) {
      return { error: 'Both bounds must be numbers' };
    }
    if (nMin > nMax) return { error: 'Min must be ≤ max' };
    return { min: nMin, max: nMax };
  };

  const handleSave = () => {
    const parsed = parseBounds();
    if (parsed.error) { setError(parsed.error); return; }
    onSave({ min: parsed.min, max: parsed.max });
  };

  const handleReset = () => {
    // null override → revert to workshop defaults
    onSave(null);
  };

  return (
    <div
      data-testid="constraint-editor"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: UI_SPACE.xs,
        padding: UI_SPACE.sm,
        background: 'rgba(96, 165, 250, 0.04)',
        border: `1px solid ${UI_COLORS.border}`,
        borderRadius: 4,
      }}
    >
      <div style={{ fontSize: UI_TEXT.micro, color: UI_COLORS.textDim, fontWeight: 500 }}>
        Edit bounds for {leverKey}
      </div>
      <div style={{ display: 'flex', gap: UI_SPACE.sm, alignItems: 'center' }}>
        <label style={{ fontSize: UI_TEXT.micro, color: UI_COLORS.textMuted }}>Min</label>
        <input
          type="number"
          data-testid="edit-min"
          value={min}
          onChange={(e) => { setMin(e.target.value); setError(null); }}
          style={{
            width: 80,
            padding: `${UI_SPACE.xs}px`,
            fontSize: UI_TEXT.caption,
            fontFamily: "'JetBrains Mono', monospace",
            border: `1px solid ${UI_COLORS.border}`,
            borderRadius: 3,
            background: UI_COLORS.panelBg,
            color: UI_COLORS.textBody,
          }}
        />
        <label style={{ fontSize: UI_TEXT.micro, color: UI_COLORS.textMuted }}>Max</label>
        <input
          type="number"
          data-testid="edit-max"
          value={max}
          onChange={(e) => { setMax(e.target.value); setError(null); }}
          style={{
            width: 80,
            padding: `${UI_SPACE.xs}px`,
            fontSize: UI_TEXT.caption,
            fontFamily: "'JetBrains Mono', monospace",
            border: `1px solid ${UI_COLORS.border}`,
            borderRadius: 3,
            background: UI_COLORS.panelBg,
            color: UI_COLORS.textBody,
          }}
        />
      </div>
      {error && (
        <div style={{ fontSize: UI_TEXT.micro, color: UI_COLORS.destructive }}>{error}</div>
      )}
      <div style={{ display: 'flex', gap: UI_SPACE.xs, justifyContent: 'flex-end' }}>
        <button
          type="button"
          data-testid="reset-bounds"
          onClick={handleReset}
          title="Revert to Constraint Workshop defaults"
          style={{
            padding: `${UI_SPACE.xs}px ${UI_SPACE.sm}px`,
            fontSize: UI_TEXT.micro,
            background: 'transparent',
            color: UI_COLORS.textMuted,
            border: `1px solid ${UI_COLORS.border}`,
            borderRadius: 3,
            cursor: 'pointer',
          }}
        >
          Reset to default
        </button>
        <button
          type="button"
          data-testid="cancel-edit"
          onClick={onCancel}
          style={{
            padding: `${UI_SPACE.xs}px ${UI_SPACE.sm}px`,
            fontSize: UI_TEXT.micro,
            background: 'transparent',
            color: UI_COLORS.textMuted,
            border: `1px solid ${UI_COLORS.border}`,
            borderRadius: 3,
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          data-testid="save-bounds"
          onClick={handleSave}
          style={{
            padding: `${UI_SPACE.xs}px ${UI_SPACE.sm}px`,
            fontSize: UI_TEXT.micro,
            fontWeight: 600,
            background: UI_COLORS.primary,
            color: '#fff',
            border: `1px solid ${UI_COLORS.primary}`,
            borderRadius: 3,
            cursor: 'pointer',
          }}
        >
          Save
        </button>
      </div>
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function clamp(v, min, max) {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : min;
  return Math.min(max, Math.max(min, n));
}

function defaultStepFor(leverKey) {
  switch (leverKey) {
    case 'sarahRate': return 5;
    case 'sarahCurrentClients': return 0.25;
    case 'cutsOverride': return 100;
    case 'bcsParentsAnnual': return 500;
    case 'chadConsulting': return 50;
    case 'ssClaimAge':
    case 'chadJobStartMonth':
    case 'vanSaleMonth':
      return 1;
    default: return 1;
  }
}

export function formatLeverValue(leverKey, value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return String(value);
  const r = Math.round(value * 100) / 100;
  switch (leverKey) {
    case 'sarahRate':
      return `$${Math.round(r)}/hr`;
    case 'sarahCurrentClients':
      return `${r} clients`;
    case 'cutsOverride':
      return `$${Math.round(r).toLocaleString()}/mo`;
    case 'bcsParentsAnnual':
      return `$${Math.round(r).toLocaleString()}/yr`;
    case 'chadConsulting':
      return `$${Math.round(r).toLocaleString()}/mo`;
    case 'ssClaimAge':
      return `age ${Math.round(r)}`;
    case 'chadJobStartMonth':
    case 'vanSaleMonth':
      return `M${Math.round(r)}`;
    default:
      return String(r);
  }
}
