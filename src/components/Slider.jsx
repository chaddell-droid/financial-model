import React, { memo, useRef, useEffect, useCallback, useMemo, useState } from 'react';
import { fmtFull } from '../model/formatters.js';
import { UI_COLORS, UI_SPACE, UI_TEXT } from '../ui/tokens.js';
import { noteSliderCommit, noteSliderDraft } from '../testing/perfMetrics.js';

const Slider = ({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  format = fmtFull,
  color = '#60a5fa',
  testId,
  ariaLabel,
  disabled = false,
  helperText,
  disabledReason,
  commitStrategy = 'continuous',
  settleMs = 120,
  onDraftChange,
  hideHeader = false,
}) => {
  const resolvedAriaLabel = ariaLabel || (typeof label === 'string' && label.trim() ? label : undefined);
  const message = disabled ? disabledReason : helperText;
  const metricName = useMemo(() => testId || resolvedAriaLabel || (typeof label === 'string' ? label : 'slider'), [testId, resolvedAriaLabel, label]);
  const [draftValue, setDraftValue] = useState(value);

  // For continuous sliders, keep one commit per frame.
  // For release sliders, keep local draft state and commit on interaction end
  // with a short idle fallback for programmatic changes.
  const pendingRef = useRef(value);
  const rafRef = useRef(null);
  const settleRef = useRef(null);
  const draftingRef = useRef(false);
  const pointerActiveRef = useRef(false);
  const lastCommittedRef = useRef(value);

  useEffect(() => {
    pendingRef.current = value;
    lastCommittedRef.current = value;
    if (!draftingRef.current) {
      setDraftValue(value);
    }
  }, [value]);

  const clearSettle = useCallback(() => {
    if (settleRef.current !== null) {
      window.clearTimeout(settleRef.current);
      settleRef.current = null;
    }
  }, []);

  const commitValue = useCallback((nextValue = pendingRef.current) => {
    clearSettle();
    if (!Number.isFinite(nextValue)) return;
    draftingRef.current = false;
    if (nextValue === lastCommittedRef.current) return;
    lastCommittedRef.current = nextValue;
    onChange(nextValue);
    noteSliderCommit(metricName);
  }, [clearSettle, metricName, onChange]);

  const flushContinuous = useCallback(() => {
    rafRef.current = null;
    commitValue(pendingRef.current);
  }, [commitValue]);

  const scheduleSettledCommit = useCallback(() => {
    clearSettle();
    settleRef.current = window.setTimeout(() => {
      settleRef.current = null;
      if (pointerActiveRef.current) return;
      commitValue(pendingRef.current);
    }, settleMs);
  }, [clearSettle, commitValue, settleMs]);

  const handleChange = useCallback((e) => {
    if (disabled) return;
    const val = Number(e.target.value);
    pendingRef.current = val;
    setDraftValue(val);
    noteSliderDraft(metricName);
    if (typeof onDraftChange === 'function') {
      onDraftChange(val);
    }
    if (commitStrategy === 'continuous') {
      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(flushContinuous);
      }
      return;
    }
    draftingRef.current = true;
    scheduleSettledCommit();
  }, [commitStrategy, disabled, flushContinuous, metricName, onDraftChange, scheduleSettledCommit]);

  const finishInteraction = useCallback(() => {
    if (commitStrategy === 'continuous' || disabled) return;
    commitValue(pendingRef.current);
  }, [commitStrategy, commitValue, disabled]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (settleRef.current !== null) window.clearTimeout(settleRef.current);
    };
  }, []);

  return (
    <div
      data-testid={testId ? `${testId}-container` : undefined}
      style={{ padding: '6px 0', opacity: disabled ? 0.55 : 1 }}
    >
      {!hideHeader ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, gap: 10, alignItems: 'baseline' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: UI_TEXT.label, color: UI_COLORS.textBody, fontWeight: 600, lineHeight: 1.25 }}>
            {label}
          </span>
          <span style={{ fontSize: UI_TEXT.label, color: disabled ? UI_COLORS.textMuted : color, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
            {format(draftValue)}
          </span>
        </div>
      ) : null}
      <input
        type='range'
        min={min}
        max={max}
        step={step}
        value={draftValue}
        data-testid={testId}
        aria-label={resolvedAriaLabel}
        disabled={disabled}
        onChange={handleChange}
        onPointerDown={() => {
          if (commitStrategy !== 'continuous' && !disabled) {
            draftingRef.current = true;
            pointerActiveRef.current = true;
            clearSettle();
          }
        }}
        onPointerUp={() => {
          pointerActiveRef.current = false;
          finishInteraction();
        }}
        onPointerCancel={() => {
          pointerActiveRef.current = false;
          finishInteraction();
        }}
        onBlur={finishInteraction}
        onKeyUp={(event) => {
          if (event.key.startsWith('Arrow') || event.key === 'Home' || event.key === 'End' || event.key === 'PageUp' || event.key === 'PageDown') {
            finishInteraction();
          }
        }}
        style={{ width: '100%', accentColor: color, height: 6, cursor: disabled ? 'not-allowed' : 'pointer' }}
      />
      {message ? (
        <div style={{ marginTop: 4, fontSize: UI_TEXT.micro, color: disabled ? UI_COLORS.textMuted : UI_COLORS.textDim, lineHeight: 1.4 }}>
          {message}
        </div>
      ) : null}
    </div>
  );
};

export default memo(Slider);
