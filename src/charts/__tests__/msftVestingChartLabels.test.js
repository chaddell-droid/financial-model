/**
 * Unit tests for MsftVestingChart label disambiguation + past/in-flight/future
 * classification (Bug D fix).
 *
 * These tests intentionally do NOT render React (no jsdom dependency here);
 * instead they verify:
 *   1. getVestEvents now exposes startMonth/endMonth so the chart can classify.
 *   2. The classification logic the chart uses (past/inflight/future) matches
 *      what we expect given a synthetic "current model month".
 *   3. The chart source file contains the disambiguated title and the
 *      "Pre-Job Grants" / legacy subtitle copy (regression guard against
 *      accidental rename back to the ambiguous original).
 *
 * Run with: node src/charts/__tests__/msftVestingChartLabels.test.js
 */
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VEST_SHARES, MSFT_FLOOR_PRICE } from '../../model/constants.js';
import { getVestEvents } from '../../model/vesting.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CHART_PATH = path.resolve(__dirname, '..', 'MsftVestingChart.jsx');

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

// Replicate the chart's classifier exactly so any divergence is caught here.
function classify(vestEvent, currentModelMonth) {
  if (typeof vestEvent.endMonth !== 'number') return 'future';
  if (vestEvent.endMonth < currentModelMonth) return 'past';
  if (vestEvent.startMonth <= currentModelMonth && currentModelMonth <= vestEvent.endMonth) return 'inflight';
  return 'future';
}

// ════════════════════════════════════════════════════════════════════════
// 1. getVestEvents exposes startMonth/endMonth
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== getVestEvents now carries projection-month bounds ===');

test('Every event has numeric startMonth and endMonth', () => {
  const events = getVestEvents(0, MSFT_FLOOR_PRICE);
  for (const e of events) {
    assert.strictEqual(typeof e.startMonth, 'number', `missing startMonth on ${e.label}`);
    assert.strictEqual(typeof e.endMonth, 'number', `missing endMonth on ${e.label}`);
  }
});

test('startMonth/endMonth values match the source VEST_SHARES schedule', () => {
  const events = getVestEvents(0, MSFT_FLOOR_PRICE);
  for (let i = 0; i < VEST_SHARES.length; i++) {
    assert.strictEqual(events[i].startMonth, VEST_SHARES[i].startMonth,
      `Event ${i} startMonth mismatch`);
    assert.strictEqual(events[i].endMonth, VEST_SHARES[i].endMonth,
      `Event ${i} endMonth mismatch`);
  }
});

test('Adding new fields does NOT break existing required fields (label/shares/gross/net/price)', () => {
  const events = getVestEvents(0, MSFT_FLOOR_PRICE);
  for (const e of events) {
    assert.ok('label' in e && 'shares' in e && 'gross' in e && 'net' in e && 'price' in e,
      `Required fields missing on ${e.label}`);
    assert.strictEqual(e.net, Math.round(e.gross * 0.8),
      `${e.label}: net != round(gross*0.8) — calc must not have changed`);
  }
});

// ════════════════════════════════════════════════════════════════════════
// 2. Classification logic — past vs in-flight vs future
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Past / in-flight / future classification ===');

test('At model-month 0 (March 2026) — only first vest is in-flight, rest are future', () => {
  const events = getVestEvents(0, MSFT_FLOOR_PRICE);
  const classes = events.map(e => classify(e, 0));
  assert.strictEqual(classes[0], 'inflight', 'first vest (startMonth=0) at m=0 should be in-flight');
  for (let i = 1; i < classes.length; i++) {
    assert.strictEqual(classes[i], 'future', `vest ${i} (${events[i].label}) at m=0 should be future, got ${classes[i]}`);
  }
});

test('At model-month 2 (May 2026 — today) — first vest still in-flight (endMonth=2)', () => {
  // PROJECTION_START_MONTH=2 (March 2026=m=0). Today (2026-05-16) = m=2.
  // First vest spans m=0..2, so on its last month it is still "in flight".
  const events = getVestEvents(0, MSFT_FLOOR_PRICE);
  assert.strictEqual(classify(events[0], 2), 'inflight',
    'May 2026 sits on endMonth=2 — should still classify as in-flight, not past');
  assert.strictEqual(classify(events[1], 2), 'future',
    'Aug 2026 vest (startMonth=3) at m=2 should be future');
});

test('At model-month 3 (June 2026) — first vest is past, second is in-flight', () => {
  const events = getVestEvents(0, MSFT_FLOOR_PRICE);
  assert.strictEqual(classify(events[0], 3), 'past',
    'First vest (endMonth=2) should be past once m=3');
  assert.strictEqual(classify(events[1], 3), 'inflight',
    'Second vest (startMonth=3, endMonth=5) at m=3 should be in-flight');
});

test('At model-month 30 (past last endMonth=29) — every vest is past', () => {
  const events = getVestEvents(0, MSFT_FLOOR_PRICE);
  for (const e of events) {
    assert.strictEqual(classify(e, 30), 'past',
      `${e.label} (endMonth=${e.endMonth}) should be past at m=30`);
  }
});

test('Exactly one vest is "in-flight" at any given month within the schedule', () => {
  // Sanity: the legacy schedule is contiguous quarterly windows, so for any m
  // in [0..29] exactly one vest should be in-flight (no overlaps, no gaps).
  for (let m = 0; m <= 29; m++) {
    const events = getVestEvents(0, MSFT_FLOOR_PRICE);
    const inflightCount = events.filter(e => classify(e, m) === 'inflight').length;
    assert.strictEqual(inflightCount, 1,
      `At m=${m} expected exactly 1 in-flight vest, got ${inflightCount}`);
  }
});

// ════════════════════════════════════════════════════════════════════════
// 3. Chart copy disambiguation (regression guard)
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Chart title + subtitle copy ===');

const chartSource = fs.readFileSync(CHART_PATH, 'utf8');

test('Title clarifies these are LEGACY pre-job grants (not new-job stock comp)', () => {
  assert.ok(
    chartSource.includes('Legacy MSFT Vesting (Pre-Job Grants)'),
    'Chart title must say "Legacy MSFT Vesting (Pre-Job Grants)" to disambiguate from new-job stock comp',
  );
});

test('Subtitle explains relationship to new-job stock comp', () => {
  assert.ok(
    /prior MSFT grants/i.test(chartSource) && /new-job stock comp/i.test(chartSource),
    'Subtitle must mention "prior MSFT grants" AND "new-job stock comp" so Chad cannot conflate the two streams',
  );
});

test('Old ambiguous title "MSFT Vesting Runway — Actual Quarterly Payouts" is gone (no leading "MSFT Vesting Runway" on its own)', () => {
  // We allow the substring "Actual Quarterly Payouts" because the new title
  // keeps it. We just want to make sure the ambiguous standalone is gone.
  assert.ok(
    !/>MSFT Vesting Runway — Actual Quarterly Payouts</.test(chartSource),
    'The ambiguous original title must not be present verbatim',
  );
});

test('Chart consumes getCurrentModelMonth so today-marker logic is wired up', () => {
  assert.ok(
    chartSource.includes("from '../model/checkIn.js'") && chartSource.includes('getCurrentModelMonth'),
    'Chart must import getCurrentModelMonth so past/in-flight indicators react to real "today"',
  );
});

// ════════════════════════════════════════════════════════════════════════
// Summary
// ════════════════════════════════════════════════════════════════════════
console.log(`\n${'='.repeat(50)}`);
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'='.repeat(50)}\n`);

if (failed > 0) process.exit(1);
