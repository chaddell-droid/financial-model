import React, { memo } from 'react';
import { UI_COLORS, UI_SPACE, UI_TEXT } from '../ui/tokens.js';

const Toggle = ({
  label,
  description,
  checked,
  onChange,
  color = '#4ade80',
  testId,
  ariaLabel,
  disabled = false,
  disabledReason,
}) => {
  const resolvedAriaLabel = ariaLabel || (typeof label === 'string' && label.trim() ? label : undefined);
  const handleToggle = (event) => {
    event.preventDefault();
    if (disabled) return;
    onChange(!checked);
  };

  return (
    <label
      data-testid={testId ? `${testId}-container` : undefined}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: UI_SPACE.md,
        cursor: disabled ? 'not-allowed' : 'pointer',
        padding: '8px 0',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <div
        data-testid={testId}
        role='switch'
        aria-checked={checked}
        aria-label={resolvedAriaLabel}
        aria-disabled={disabled}
        tabIndex={disabled ? -1 : 0}
        onClick={handleToggle}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            handleToggle(event);
          }
        }}
        style={{
          width: 46,
          height: 26,
          borderRadius: 999,
          position: 'relative',
          background: checked ? color : '#334155',
          transition: 'background 0.2s',
          flexShrink: 0,
          marginTop: 1,
        }}
      >
        <div
          style={{
            width: 20,
            height: 20,
            borderRadius: 999,
            background: '#fff',
            position: 'absolute',
            top: 3,
            left: checked ? 23 : 3,
            transition: 'left 0.2s',
            boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
          }}
        />
      </div>
      <span style={{ display: 'grid', gap: 4 }}>
        <span style={{ fontSize: UI_TEXT.body, color: UI_COLORS.textStrong, lineHeight: 1.3 }}>
          {label}
        </span>
        {description ? (
          <span style={{ fontSize: UI_TEXT.micro, color: UI_COLORS.textMuted, lineHeight: 1.4 }}>
            {description}
          </span>
        ) : null}
        {disabled && disabledReason ? (
          <span style={{ fontSize: UI_TEXT.micro, color: UI_COLORS.textDim, lineHeight: 1.4 }}>
            {disabledReason}
          </span>
        ) : null}
      </span>
    </label>
  );
};

export default memo(Toggle);
