import React, { memo, useRef, useEffect, useCallback } from 'react';
import { fmtFull } from '../model/formatters.js';
import { UI_COLORS, UI_SPACE, UI_TEXT } from '../ui/tokens.js';

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
}) => {
  const resolvedAriaLabel = ariaLabel || (typeof label === 'string' && label.trim() ? label : undefined);
  const message = disabled ? disabledReason : helperText;

  // rAF-throttle: batch rapid drag events into one dispatch per frame
  const pendingRef = useRef(null);
  const rafRef = useRef(null);

  const handleChange = useCallback((e) => {
    const val = Number(e.target.value);
    pendingRef.current = val;
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        onChange(pendingRef.current);
      });
    }
  }, [onChange]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div
      data-testid={testId ? `${testId}-container` : undefined}
      style={{ padding: '6px 0', opacity: disabled ? 0.55 : 1 }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, gap: 10, alignItems: 'baseline' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: UI_TEXT.label, color: UI_COLORS.textBody, fontWeight: 600, lineHeight: 1.25 }}>
          {label}
        </span>
        <span style={{ fontSize: UI_TEXT.label, color: disabled ? UI_COLORS.textMuted : color, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
          {format(value)}
        </span>
      </div>
      <input
        type='range'
        min={min}
        max={max}
        step={step}
        value={value}
        data-testid={testId}
        aria-label={resolvedAriaLabel}
        disabled={disabled}
        onChange={handleChange}
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
