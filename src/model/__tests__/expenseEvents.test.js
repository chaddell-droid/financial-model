/**
 * deriveExpenseChangeEvents — engine-derived expense-line annotations for the
 * Income Composition vs Expenses chart (replaces four hand-coded heuristics).
 *
 * Contract:
 *   - Diffs every expenseBreakdown component between consecutive months.
 *   - A component delta is an EVENT only if
 *       |Δ| >= max(thresholdDollars (150), |prev| × driftAllowancePctMonthly (1.5%/mo))
 *     so CPI (3%/yr ≈ 0.25%/mo) and medical trend (6.5%/yr ≈ 0.53%/mo)
 *     compounding never fires.
 *   - All firing components of one month merge into ONE event
 *       { month, netDelta, items: [{ key, label, delta }] }  (|delta| desc).
 *   - The aggregate 'milestones' key resolves to the milestone NAME(s) whose
 *     month matches the event month (opts.milestones).
 *   - PARITY LOCK: because the engine guarantees Σ expenseBreakdown ==
 *     expenses every month, Σ event netDeltas + Σ sub-threshold drift ==
 *     expenses[end] − expenses[start] exactly — annotations can never lie.
 *
 * Run: node src/model/__tests__/expenseEvents.test.js
 */

import assert from 'node:assert';
import { gatherStateWithOverrides } from '../../state/gatherState.js';
import { runMonthlySimulation } from '../projection.js';
import { deriveExpenseChangeEvents } from '../expenseEvents.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL  ${name}`);
    console.log(`        ${e.message}`);
  }
}

function simulate(overrides = {}) {
  const s = gatherStateWithOverrides(overrides);
  return { s, monthlyData: runMonthlySimulation(s).monthlyData };
}

function eventAt(events, month) {
  return events.find((e) => e.month === month);
}
function itemFor(ev, key) {
  return ev && ev.items.find((it) => it.key === key);
}

console.log('\n=== expenseEvents — engine-derived chart annotations ===');

// ── College window (default scenario, horizon extended past month 87) ──────
// Default: collegeStartMonth=39, collegeMonths=48 (ends after month 86),
// 529 = $0 → out-of-pocket 2 × 2833 = 5666 for the whole window.
const COMBINED_COLLEGE = 2 * 2833;
const { s: longState, monthlyData: longData } = simulate({ sarahWorkMonths: 120 });
const longEvents = deriveExpenseChangeEvents(longData, { milestones: longState.milestones });

test('college start: +$5,666 event at month 39 (increase)', () => {
  const ev = eventAt(longEvents, 39);
  assert.ok(ev, 'expected an event at month 39');
  const item = itemFor(ev, 'college');
  assert.ok(item, 'month-39 event must carry a college item');
  assert.strictEqual(item.delta, COMBINED_COLLEGE, `college delta ${item.delta}`);
  assert.strictEqual(item.label, 'College (twins)');
  assert.ok(ev.netDelta > 0, 'month 39 must be a net increase (red)');
});

test('college end: −$5,666 event at month 87 (decrease)', () => {
  const ev = eventAt(longEvents, 87);
  assert.ok(ev, 'expected an event at month 87');
  const item = itemFor(ev, 'college');
  assert.ok(item, 'month-87 event must carry a college item');
  assert.strictEqual(item.delta, -COMBINED_COLLEGE, `college delta ${item.delta}`);
  assert.ok(ev.netDelta < 0, 'month 87 must be a net decrease (green)');
});

// ── BCS end — exact engine amount, no neighbor-subtraction ─────────────────
test('BCS end: event at month 42 with delta = −bcsFamilyMonthly exactly', () => {
  const ev = eventAt(longEvents, 42); // bcsYearsLeft 3.5 → last payment month 41
  assert.ok(ev, 'expected an event at month 42');
  const item = itemFor(ev, 'bcs');
  assert.ok(item, 'month-42 event must carry a bcs item');
  assert.strictEqual(item.delta, -longState.bcsFamilyMonthly,
    `bcs delta ${item.delta} must equal −${longState.bcsFamilyMonthly}`);
  assert.strictEqual(item.label, 'BCS tuition');
});

// ── Default-scenario marker months are exactly the engine's discrete steps ─
test('default scenario (120-mo horizon): events at exactly months 36, 39, 42, 87', () => {
  assert.deepStrictEqual(longEvents.map((e) => e.month), [36, 39, 42, 87],
    `got events at [${longEvents.map((e) => e.month)}]`);
});

test('default milestone at 36 resolves the milestone NAME, not "Milestones"', () => {
  const ev = eventAt(longEvents, 36);
  const item = itemFor(ev, 'milestones');
  assert.ok(item, 'month-36 event must carry a milestones item');
  assert.strictEqual(item.delta, -3000);
  assert.strictEqual(item.label, 'Twins to college');
});

// ── Health premium zeroing when chadJob starts (premium line, not legacy) ──
test('chadJob start zeroes the healthPremium line → green event at job start', () => {
  const { s, monthlyData } = simulate({ chadJob: true, chadJobStartMonth: 12 });
  const events = deriveExpenseChangeEvents(monthlyData, { milestones: s.milestones });
  const ev = eventAt(events, 12);
  assert.ok(ev, 'expected an event at month 12 (job start)');
  const item = itemFor(ev, 'healthPremium');
  assert.ok(item, 'event must fire on the healthPremium line');
  const expectedPrev = Math.round(4200 * Math.pow(1.065, 11 / 12));
  assert.strictEqual(item.delta, -expectedPrev,
    `premium delta ${item.delta} must equal −trended premium ${expectedPrev}`);
  assert.ok(!itemFor(ev, 'healthInsurance'),
    'legacy healthInsurance offset must NOT fire (carve path is the single source)');
  assert.ok(ev.netDelta < 0, 'job start must be a net expense decrease');
});

// ── Drift exclusion: pure CPI + medical trend never fires ──────────────────
test('drift exclusion: 3% CPI + 6.5% medical trend, no discrete events → ZERO events over 72 months', () => {
  const { s, monthlyData } = simulate({ milestones: [], bcsYearsLeft: 0, collegeMonths: 0 });
  assert.ok(monthlyData.length >= 73, 'default horizon covers 72 months');
  const events = deriveExpenseChangeEvents(monthlyData, { milestones: s.milestones });
  assert.strictEqual(events.length, 0,
    `smooth compounding must never annotate; got [${events.map((e) => `${e.month}:${e.items.map((i) => i.key)}`)}]`);
});

// ── Multi-driver month merges into ONE event with sorted items ─────────────
test('multi-driver month (milestone at 39 + college start): ONE event, two items, correct netDelta', () => {
  const { s, monthlyData } = simulate({
    milestones: [{ name: 'Test cut', month: 39, savings: 3000 }],
  });
  const events = deriveExpenseChangeEvents(monthlyData, { milestones: s.milestones });
  const at39 = events.filter((e) => e.month === 39);
  assert.strictEqual(at39.length, 1, 'all drivers of one month merge into ONE event');
  const ev = at39[0];
  assert.strictEqual(ev.items.length, 2, `expected 2 items, got ${ev.items.map((i) => i.key)}`);
  assert.strictEqual(ev.items[0].key, 'college', 'items sorted by |delta| desc → college first');
  assert.strictEqual(ev.items[0].delta, COMBINED_COLLEGE);
  assert.strictEqual(ev.items[1].key, 'milestones');
  assert.strictEqual(ev.items[1].delta, -3000);
  assert.strictEqual(ev.items[1].label, 'Test cut', 'aggregate milestones key resolves the milestone name');
  assert.strictEqual(ev.netDelta, COMBINED_COLLEGE - 3000);
});

// ── One-time extras window ──────────────────────────────────────────────────
test('one-time extras: window END fires a −$2,000 event (window start at m0 is baseline)', () => {
  const { s, monthlyData } = simulate({ oneTimeExtras: 2000, oneTimeMonths: 24 });
  const events = deriveExpenseChangeEvents(monthlyData, { milestones: s.milestones });
  const ev = eventAt(events, 24);
  assert.ok(ev, 'expected an event at month 24 (window end)');
  const item = itemFor(ev, 'oneTimeExtras');
  assert.ok(item, 'event must fire on the oneTimeExtras line');
  assert.strictEqual(item.delta, -2000);
  // The engine starts the window at month 0 (m < oneTimeMonths) — part of the
  // baseline, so no start marker; and no other month may fire on this key.
  for (const e of events) {
    if (e.month !== 24) {
      assert.ok(!itemFor(e, 'oneTimeExtras'), `oneTimeExtras must not fire at month ${e.month}`);
    }
  }
});

// ── PARITY LOCK: annotations can never lie about the expense line ───────────
test('parity lock: Σ event netDeltas + Σ drift === expenses[end] − expenses[start] (exact)', () => {
  const data = longData;
  const events = longEvents;
  const evByMonth = new Map(events.map((e) => [e.month, e]));
  let sumNetDeltas = 0;
  let sumDrift = 0;
  for (let i = 1; i < data.length; i++) {
    const monthDelta = data[i].expenses - data[i - 1].expenses;
    // Engine invariant: Σ breakdown == expenses → component deltas sum exactly.
    const prevB = data[i - 1].expenseBreakdown || {};
    const currB = data[i].expenseBreakdown || {};
    const keys = new Set([...Object.keys(prevB), ...Object.keys(currB)]);
    let componentSum = 0;
    for (const k of keys) componentSum += (currB[k] || 0) - (prevB[k] || 0);
    assert.strictEqual(componentSum, monthDelta,
      `month ${data[i].month}: Σ component deltas (${componentSum}) !== expense delta (${monthDelta})`);
    const ev = evByMonth.get(data[i].month);
    const eventNet = ev ? ev.netDelta : 0;
    sumNetDeltas += eventNet;
    sumDrift += monthDelta - eventNet;
    if (!ev) {
      assert.ok(Math.abs(monthDelta) < 300,
        `non-event month ${data[i].month} moved $${monthDelta} — too large to hide as drift`);
    }
  }
  const total = data[data.length - 1].expenses - data[0].expenses;
  assert.strictEqual(sumNetDeltas + sumDrift, total,
    `Σ netDeltas (${sumNetDeltas}) + drift (${sumDrift}) must equal total change (${total})`);
});

// ── Threshold / drift-allowance knobs ───────────────────────────────────────
test('opts knobs: a delta below thresholdDollars or inside the drift allowance never fires', () => {
  // Synthetic rows isolate the rule from the engine.
  const rows = [
    { month: 0, expenses: 10100, expenseBreakdown: { baseLiving: 10000, van: 100 } },
    // baseLiving +140 (< $150 floor), van +60 (< $150 floor) → no event
    { month: 1, expenses: 10300, expenseBreakdown: { baseLiving: 10140, van: 160 } },
    // baseLiving +149 (< floor) → still no event
    { month: 2, expenses: 10449, expenseBreakdown: { baseLiving: 10289, van: 160 } },
    // baseLiving +200 (> floor, but 200 < 10489 × 10% custom allowance) → no event with pct=0.10
    { month: 3, expenses: 10649, expenseBreakdown: { baseLiving: 10489, van: 160 } },
  ];
  assert.strictEqual(deriveExpenseChangeEvents(rows).length, 1,
    'default 1.5%/mo allowance: only the month-3 +$200 baseLiving step fires');
  assert.strictEqual(deriveExpenseChangeEvents(rows, { driftAllowancePctMonthly: 0.10 }).length, 0,
    'a 10%/mo allowance absorbs the +$200 step on a $10,489 base');
  assert.strictEqual(
    deriveExpenseChangeEvents(rows, { thresholdDollars: 50, driftAllowancePctMonthly: 0.001 }).length, 3,
    'lowering BOTH knobs fires every month (the rule is max(floor, pct×prev))');
});

console.log(`\n${'='.repeat(50)}`);
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'='.repeat(50)}\n`);
process.exit(failed > 0 ? 1 : 0);
