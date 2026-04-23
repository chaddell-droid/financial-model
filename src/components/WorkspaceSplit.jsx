import React, { useEffect, useRef, useState, useCallback } from 'react';

const MIN_RATIO = 0.22;
const MAX_RATIO = 0.72;
const DEFAULT_RATIO = 0.4167;
const LS_KEY = 'planSplitRatio';

/**
 * Draggable vertical divider for splitting a horizontal workspace into
 * two resizable panes. Persists ratio (left-pane fraction) to localStorage.
 *
 * Usage:
 *   <WorkspaceSplit left={<LeftPane />} right={<RightPane />} />
 */
export default function WorkspaceSplit({ left, right, lsKey = LS_KEY, defaultRatio = DEFAULT_RATIO }) {
  const [ratio, setRatio] = useState(() => readStored(lsKey, defaultRatio));
  const [dragging, setDragging] = useState(false);
  const rowRef = useRef(null);

  useEffect(() => {
    try { window.localStorage.setItem(lsKey, String(ratio)); } catch (_) { /* ignore */ }
  }, [ratio, lsKey]);

  const onPointerMove = useCallback((e) => {
    const row = rowRef.current;
    if (!row) return;
    const rect = row.getBoundingClientRect();
    const handleWidth = 12;
    const raw = (e.clientX - rect.left - handleWidth / 2) / (rect.width - handleWidth);
    const clamped = Math.max(MIN_RATIO, Math.min(MAX_RATIO, raw));
    setRatio(clamped);
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e) => onPointerMove(e);
    const onUp = () => setDragging(false);
    document.body.classList.add('plan-split-dragging');
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      document.body.classList.remove('plan-split-dragging');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [dragging, onPointerMove]);

  const onKeyDown = useCallback((e) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setRatio((prev) => Math.max(MIN_RATIO, prev - 0.02));
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      setRatio((prev) => Math.min(MAX_RATIO, prev + 0.02));
    }
  }, []);

  const onDoubleClick = useCallback(() => setRatio(defaultRatio), [defaultRatio]);

  return (
    <div
      ref={rowRef}
      className="plan-split-row"
      style={{ '--plan-split-ratio': ratio }}
      data-testid="plan-split-row"
    >
      <div className="plan-split-left">{left}</div>
      <div
        className={`plan-split-handle${dragging ? ' plan-dragging' : ''}`}
        role="separator"
        aria-orientation="vertical"
        aria-valuenow={Math.round(ratio * 100)}
        aria-valuemin={Math.round(MIN_RATIO * 100)}
        aria-valuemax={Math.round(MAX_RATIO * 100)}
        tabIndex={0}
        title="Drag to resize · double-click to reset · arrow keys to nudge"
        onPointerDown={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onKeyDown={onKeyDown}
        onDoubleClick={onDoubleClick}
        data-testid="plan-split-handle"
      >
        <div className="plan-split-grip" />
      </div>
      <div className="plan-split-right">{right}</div>
    </div>
  );
}

function readStored(lsKey, fallback) {
  try {
    const raw = window.localStorage.getItem(lsKey);
    const n = parseFloat(raw);
    if (Number.isFinite(n) && n >= MIN_RATIO && n <= MAX_RATIO) return n;
  } catch (_) { /* ignore */ }
  return fallback;
}
