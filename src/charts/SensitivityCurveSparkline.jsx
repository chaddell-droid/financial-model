import React, { useRef } from 'react';
import { COLORS, createScales } from './chartUtils.js';
import useContainerWidth from '../hooks/useContainerWidth.js';
import { UI_COLORS, UI_SPACE } from '../ui/tokens.js';

/**
 * SensitivityCurveSparkline — Story 3.2 (Phase 3, Epic 3).
 *
 * Small inline SVG sparkline rendered next to each continuous-lever slider
 * in the Staged-in-preview list. Shows the shape of the marginal-impact
 * curve across the lever's [min, max] range, with a vertical marker at the
 * user's current staged value so Chad can see at a glance whether he's in
 * a linear-returns region, a diminishing-returns region, or near an
 * inflection point.
 *
 * Rendering choices per CLAUDE.md + NFRs:
 *   • Inline SVG with `createScales` from chartUtils — no new chart libs (NFR22)
 *   • `COLORS.blue` + `UI_COLORS` tokens only — no palette fork (NFR24)
 *   • No text labels inside the SVG to avoid the preserveAspectRatio="none"
 *     distortion trap (documented in CLAUDE.md).
 *   • Hidden entirely when `presentMode === true` (FR34)
 *   • Gracefully returns `null` when curve is unavailable (null / undefined /
 *     empty array) — no console noise, no layout jump.
 *   • Optional `onExpand` callback for Story 3.3's larger view.
 */
export default function SensitivityCurveSparkline({
  curve,
  currentValue,
  min,
  max,
  presentMode = false,
  onExpand,
  height = 32,
  testId = 'sensitivity-sparkline',
}) {
  const containerRef = useRef(null);
  const svgW = useSparklineWidth(containerRef);

  if (presentMode) return null;
  if (!Array.isArray(curve) || curve.length < 2) return null;
  if (typeof min !== 'number' || typeof max !== 'number' || min >= max) return null;

  const padL = 2;
  const padR = 2;
  const padT = 2;
  const padB = 2;
  const svgH = height;

  // Y domain covers the curve's full delta range, with a tiny pad so the
  // curve isn't flush against the top/bottom edges. A flat curve collapses
  // to a horizontal line by createScales' fallback.
  let yMin = curve[0].finalBalanceDelta;
  let yMax = curve[0].finalBalanceDelta;
  for (const s of curve) {
    if (s.finalBalanceDelta < yMin) yMin = s.finalBalanceDelta;
    if (s.finalBalanceDelta > yMax) yMax = s.finalBalanceDelta;
  }
  const ySpan = yMax - yMin || 1;
  const yPad = ySpan * 0.08;
  const { xOf, yOf } = createScales(
    padL, padR, padT, padB, svgW, svgH,
    [min, max],
    [yMin - yPad, yMax + yPad],
  );

  const pathD = curve.map((s, i) => `${i === 0 ? 'M' : 'L'} ${xOf(s.value).toFixed(2)},${yOf(s.finalBalanceDelta).toFixed(2)}`).join(' ');

  const markerX = typeof currentValue === 'number' && Number.isFinite(currentValue)
    ? xOf(Math.max(min, Math.min(max, currentValue)))
    : null;

  const clickable = typeof onExpand === 'function';

  const content = (
    <svg
      viewBox={`0 0 ${svgW} ${svgH}`}
      preserveAspectRatio="none"
      style={{ width: '100%', height: svgH, display: 'block', overflow: 'visible' }}
      aria-hidden="true"
    >
      {/* Zero-delta baseline — subtle dashed line so the user can see the
          sign of the curve (above zero = improvement, below = regression). */}
      {yMin < 0 && yMax > 0 && (
        <line
          x1={padL}
          x2={svgW - padR}
          y1={yOf(0)}
          y2={yOf(0)}
          stroke={UI_COLORS.border}
          strokeWidth={1}
          strokeDasharray="2,3"
          opacity={0.6}
        />
      )}
      <path
        d={pathD}
        fill="none"
        stroke={COLORS.blue}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {markerX != null && (
        <line
          x1={markerX}
          x2={markerX}
          y1={padT}
          y2={svgH - padB}
          stroke={UI_COLORS.primary}
          strokeWidth={1.5}
          opacity={0.9}
        />
      )}
    </svg>
  );

  return (
    <div
      ref={containerRef}
      data-testid={testId}
      onClick={clickable ? onExpand : undefined}
      title={clickable ? 'Click to expand curve view' : undefined}
      style={{
        width: '100%',
        padding: `${UI_SPACE.xs / 2}px 0`,
        cursor: clickable ? 'pointer' : 'default',
      }}
    >
      {content}
    </div>
  );
}

/** Sparkline width: smaller floor than chart hooks normally use.
 *  The chart hook's 400px floor makes full charts readable but would blow
 *  up a sparkline in the staged list. */
function useSparklineWidth(ref, fallback = 240) {
  const width = useContainerWidthBounded(ref, fallback);
  return Math.max(120, Math.min(width, 480));
}

// Re-implementing the bounded-width pattern locally because the shared
// useContainerWidth clamps to [400, 1200] — too wide for a sparkline.
function useContainerWidthBounded(ref, fallback) {
  const [width, setWidth] = React.useState(fallback);
  React.useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([entry]) => {
      setWidth(Math.round(entry.contentRect.width));
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}
