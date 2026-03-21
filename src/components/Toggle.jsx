import React from "react";

const Toggle = ({ label, checked, onChange, color = "#4ade80", testId, ariaLabel }) => {
  const resolvedAriaLabel = ariaLabel || (typeof label === 'string' && label.trim() ? label : undefined);
  const handleToggle = (event) => {
    event.preventDefault();
    onChange(!checked);
  };

  return (
    <label data-testid={testId ? `${testId}-container` : undefined} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "6px 0" }}>
      <div
        data-testid={testId}
        role="switch"
        aria-checked={checked}
        aria-label={resolvedAriaLabel}
        tabIndex={0}
        onClick={handleToggle}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            handleToggle(event);
          }
        }}
        style={{
          width: 44, height: 24, borderRadius: 12, position: "relative",
          background: checked ? color : "#334155", transition: "background 0.2s",
          flexShrink: 0
        }}
      >
        <div style={{
          width: 20, height: 20, borderRadius: 10, background: "#fff",
          position: "absolute", top: 2, left: checked ? 22 : 2, transition: "left 0.2s",
          boxShadow: "0 1px 3px rgba(0,0,0,0.3)"
        }} />
      </div>
      <span style={{ fontSize: 14, color: "#e2e8f0", lineHeight: 1.3 }}>{label}</span>
    </label>
  );
};

export default Toggle;
