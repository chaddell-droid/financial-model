import React from 'react';
import { fmtFull } from '../model/formatters.js';

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
}) => {
  const resolvedAriaLabel = ariaLabel || (typeof label === 'string' && label.trim() ? label : undefined);

  return (
    <div
      data-testid={testId ? `${testId}-container` : undefined}
      style={{ padding: '4px 0', opacity: disabled ? 0.45 : 1 }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, gap: 10 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#cbd5e1', fontWeight: 600, lineHeight: 1.25 }}>
          {label}
        </span>
        <span style={{ fontSize: 13, color, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        data-testid={testId}
        aria-label={resolvedAriaLabel}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: color, height: 6, cursor: disabled ? 'not-allowed' : 'pointer' }}
      />
    </div>
  );
};

export default Slider;
