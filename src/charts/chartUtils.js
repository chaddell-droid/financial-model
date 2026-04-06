// Shared chart utilities — scales, ticks, colors, income source definitions

/**
 * Create linear scales for SVG charts.
 * Returns { xOf, yOf, plotW, plotH, zeroY } where xOf/yOf map domain values to SVG coordinates.
 */
export function createScales(padL, padR, padT, padB, svgW, svgH, xDomain, yDomain) {
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;
  const [xMin, xMax] = xDomain;
  const [yMin, yMax] = yDomain;
  const xRange = xMax - xMin || 1;
  const yRange = yMax - yMin || 1;

  const xOf = (v) => padL + ((v - xMin) / xRange) * plotW;
  const yOf = (v) => padT + ((yMax - v) / yRange) * plotH;
  const zeroY = yOf(0);

  return { xOf, yOf, plotW, plotH, zeroY };
}

/**
 * Generate Y-axis tick values at sensible intervals.
 */
export function generateYTicks(min, max, step) {
  const ticks = [];
  for (let v = Math.ceil(min / step) * step; v <= max; v += step) {
    ticks.push(v);
  }
  return ticks;
}

/**
 * Choose a sensible tick step for a given value range.
 */
export function autoTickStep(range) {
  if (range > 500000) return 200000;
  if (range > 200000) return 100000;
  if (range > 100000) return 50000;
  if (range > 50000) return 25000;
  if (range > 20000) return 5000;
  if (range > 10000) return 2500;
  return 1000;
}

// Centralized color palette
export const COLORS = {
  // Background / surface
  bgDeep: "#0f172a",
  bgCard: "#1e293b",
  border: "#334155",
  borderLight: "#475569",

  // Text
  textPrimary: "#f8fafc",
  textSecondary: "#e2e8f0",
  textMuted: "#94a3b8",
  textDim: "#64748b",

  // Accent — blue
  blue: "#60a5fa",
  blueLight: "#38bdf8",
  blueBright: "#3b82f6",

  // Accent — green
  green: "#4ade80",
  greenDark: "#22c55e",

  // Accent — red / warning
  red: "#f87171",
  redDark: "#ef4444",

  // Accent — amber / yellow
  amber: "#f59e0b",
  yellow: "#fbbf24",

  // Accent — purple
  purple: "#c084fc",
  purpleLight: "#a78bfa",

  // Accent — cyan
  cyan: "#22d3ee",

  // Chart-specific
  positive: "#4ade80",
  negative: "#f87171",
};

/**
 * Compute responsive padding that scales with container width.
 */
export function responsivePadding(containerW) {
  const scale = Math.min(1, containerW / 800);
  return {
    padL: Math.round(60 * scale),
    padR: Math.round(20 * scale),
    padT: 20,
    padB: 30,
  };
}

// Income source definitions — used by Income Composition chart and Dad Mode
export const INCOME_SOURCES = [
  { key: "sarahIncome", label: "Sarah's Business", color: COLORS.blue },
  { key: "msftVesting", label: "MSFT Vesting", color: COLORS.amber },
  { key: "ssdi", label: "SSDI", color: COLORS.green },
  { key: "chadJobIncome", label: "Chad's Job", color: COLORS.greenDark },
  { key: "consulting", label: "Chad Consulting", color: COLORS.blueLight },
  { key: "trustLLC", label: "Trust / LLC", color: COLORS.purple },
  { key: "investReturn", label: "Invest Returns", color: COLORS.cyan },
];
