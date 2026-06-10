/**
 * Regression tests for BridgeChart's memoization (remediation 2026-06-09, 6.5).
 *
 * Bug: BridgeChart's useMemo depended on `pts` — an array rebuilt on every
 * render (unstable identity, so the memo never cached) — and was MISSING
 * `msftPrice`, so once `pts` is built inside the memo, a change to ONLY
 * msftPrice would not refresh the post-cliff MSFT marker
 * (postCliffMsft = getVestingMonthly(18, msftGrowth, msftPrice)).
 *
 * Like msftVestingChartLabels.test.js, these tests do NOT render React:
 *   1. Behavioral: the post-cliff marker value genuinely depends on msftPrice,
 *      so dropping it from the deps array is a real staleness bug.
 *   2. Source guard: the memo's deps include msftPrice and no longer include
 *      the unstable `pts` identity; the empty-data early return sits AFTER
 *      the hook (rules-of-hooks).
 *
 * Run with: node src/charts/__tests__/bridgeChartMemo.test.js
 */
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getVestingMonthly } from '../../model/vesting.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CHART_PATH = path.resolve(__dirname, '..', 'BridgeChart.jsx');
const source = fs.readFileSync(CHART_PATH, 'utf8');

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

console.log('\n=== BridgeChart memo — post-cliff marker depends on msftPrice ===');

test('getVestingMonthly(18, growth, price) changes when ONLY msftPrice changes', () => {
  const atLowPrice = getVestingMonthly(18, 5, 400);
  const atHighPrice = getVestingMonthly(18, 5, 600);
  assert.notStrictEqual(atLowPrice, atHighPrice,
    'post-cliff MSFT marker value must respond to msftPrice — a memo missing this dep serves stale markers');
});

console.log('\n=== BridgeChart memo — deps array shape (source guard) ===');

// Extract the deps array of the main useMemo (the block between the closing
// `}, [` of the memo callback and the matching `]);`).
function extractMemoDeps(src) {
  const memoStart = src.indexOf('useMemo(');
  assert.ok(memoStart >= 0, 'BridgeChart must contain a useMemo');
  const depsStart = src.indexOf('}, [', memoStart);
  assert.ok(depsStart >= 0, 'useMemo must have a deps array');
  const depsEnd = src.indexOf(']);', depsStart);
  return src.slice(depsStart + 4, depsEnd);
}

test('memo deps include msftPrice (regression: stale post-cliff marker)', () => {
  const deps = extractMemoDeps(source);
  assert.ok(/\bmsftPrice\b/.test(deps), `deps must include msftPrice — got: ${deps.trim()}`);
});

test('memo deps no longer include the unstable pts identity', () => {
  const deps = extractMemoDeps(source);
  assert.ok(!/\bpts\b/.test(deps),
    'deps must not include pts (rebuilt every render → memo never caches); build pts inside the memo, keyed on monthlyDetail');
});

test('memo deps still include monthlyDetail (pts is derived from it)', () => {
  const deps = extractMemoDeps(source);
  assert.ok(/\bmonthlyDetail\b/.test(deps), 'deps must include monthlyDetail');
});

test('empty-data early return comes AFTER the useMemo hook (rules-of-hooks)', () => {
  const memoIdx = source.indexOf('useMemo(');
  const emptyReturnIdx = source.indexOf('return null');
  assert.ok(emptyReturnIdx > memoIdx,
    'the empty-data `return null` must come after all hooks so hook order is stable across renders');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
