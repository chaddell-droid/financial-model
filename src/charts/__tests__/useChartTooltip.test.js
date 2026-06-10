/**
 * Unit tests for the shared chart-tooltip core (remediation 2026-06-09, 6.4).
 *
 * computeTooltipState is the pure heart of useChartTooltip: nearest-point
 * detection, percentage positioning, and — critically — the prev-index
 * bail-out that returns the SAME reference when the nearest point hasn't
 * moved, so React skips the state update on most mousemove events.
 *
 * Run with: node src/charts/__tests__/useChartTooltip.test.js
 */
import assert from 'node:assert';
import { computeTooltipState } from '../useChartTooltip.js';

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL  ${name}`);
    console.log(`        ${err.message}`);
  }
}

const data = [
  { month: 0, balance: 100 },
  { month: 12, balance: 200 },
  { month: 24, balance: 300 },
];
const cfg = {
  data,
  xAccessor: (d) => d.month * 10, // x: 0, 120, 240
  yAccessor: (d) => d.balance,     // y: 100, 200, 300
  svgW: 240,
  svgH: 400,
};

console.log('\n=== computeTooltipState — nearest-point detection ===');

test('picks the nearest data point by x distance', () => {
  const t = computeTooltipState(null, cfg, 130);
  assert.strictEqual(t.index, 1);
  assert.strictEqual(t.dataPoint, data[1]);
});

test('clamps to first/last point at the extremes', () => {
  assert.strictEqual(computeTooltipState(null, cfg, -50).index, 0);
  assert.strictEqual(computeTooltipState(null, cfg, 10000).index, 2);
});

test('pctX/pctY are percentage positions within the SVG', () => {
  const t = computeTooltipState(null, cfg, 130);
  assert.strictEqual(t.pctX, (120 / 240) * 100);
  assert.strictEqual(t.pctY, (200 / 400) * 100);
});

test('pctY defaults to 50 when yAccessor is omitted', () => {
  const t = computeTooltipState(null, { ...cfg, yAccessor: undefined }, 130);
  assert.strictEqual(t.pctY, 50);
});

test('empty/missing data returns null', () => {
  assert.strictEqual(computeTooltipState(null, { ...cfg, data: [] }, 130), null);
  assert.strictEqual(computeTooltipState(null, { ...cfg, data: null }, 130), null);
});

console.log('\n=== computeTooltipState — prev-index bail-out (remediation 6.4) ===');

test('returns the SAME reference when nearest point is unchanged', () => {
  const first = computeTooltipState(null, cfg, 130);
  const second = computeTooltipState(first, cfg, 125); // still nearest to index 1
  assert.strictEqual(second, first, 'unchanged nearest point must return prev reference');
});

test('returns a NEW object when the nearest index changes', () => {
  const first = computeTooltipState(null, cfg, 130);
  const second = computeTooltipState(first, cfg, 230); // nearest to index 2
  assert.notStrictEqual(second, first);
  assert.strictEqual(second.index, 2);
});

test('returns a NEW object when data was rebuilt at the same index', () => {
  const first = computeTooltipState(null, cfg, 130);
  const rebuilt = { ...cfg, data: data.map((d) => ({ ...d })) };
  const second = computeTooltipState(first, rebuilt, 130);
  assert.notStrictEqual(second, first, 'rebuilt data must refresh dataPoint even at same index');
  assert.strictEqual(second.index, 1);
  assert.strictEqual(second.dataPoint, rebuilt.data[1]);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
