import React, { useState, useCallback, useEffect, useRef } from 'react';

const MIN_WIDTH = 320;
const MAX_WIDTH = 700;

/**
 * Draggable vertical divider between main content and right rail.
 * Drag left to widen rail, drag right to narrow it.
 *
 * Props:
 *   railWidth - current rail width in px
 *   onWidthChange(w) - called on every mouse move during drag (live resize)
 *   onWidthCommit(w) - called on mouseup (persist)
 */
export default function RailDivider({ railWidth, onWidthChange, onWidthCommit }) {
  const [dragging, setDragging] = useState(false);
  const [hover, setHover] = useState(false);
  const dragRef = useRef({ startX: 0, startWidth: 0 });

  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startWidth: railWidth };
    setDragging(true);
  }, [railWidth]);

  useEffect(() => {
    if (!dragging) return;

    const handleMouseMove = (e) => {
      // Moving left (negative deltaX) = wider rail
      const deltaX = e.clientX - dragRef.current.startX;
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, dragRef.current.startWidth - deltaX));
      onWidthChange(newWidth);
    };

    const handleMouseUp = (e) => {
      const deltaX = e.clientX - dragRef.current.startX;
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, dragRef.current.startWidth - deltaX));
      setDragging(false);
      onWidthCommit(newWidth);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    // Prevent text selection during drag
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [dragging, onWidthChange, onWidthCommit]);

  const active = dragging || hover;

  return (
    <div
      data-testid="rail-divider"
      onMouseDown={handleMouseDown}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: 8,
        cursor: 'col-resize',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'stretch',
        alignSelf: 'stretch',
        zIndex: 5,
      }}
    >
      {/* Visible line */}
      <div style={{
        width: active ? 3 : 1,
        background: dragging ? '#60a5fa' : active ? '#64748b' : '#1e293b',
        borderRadius: 2,
        transition: dragging ? 'none' : 'background 0.15s, width 0.15s',
      }} />
    </div>
  );
}
