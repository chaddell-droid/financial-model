/**
 * Unit tests for MSFT vesting calculations.
 * Run with: node src/model/__tests__/vesting.test.js
 */
import assert from 'node:assert';
import { MSFT_FLOOR_PRICE, VEST_SHARES } from '../constants.js';
import {
  getMsftPrice,
  getVestingMonthly,
  getVestingLumpSum,
  getVestEvents,
  getTotalRemainingVesting,
} from '../vesting.js';

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

function near(actual, expected, tolerance, label) {
  const diff = Math.abs(actual - expected);
  assert.ok(
    diff <= tolerance,
    `${label}: expected ~${expected} (+/-${tolerance}), got ${actual} (diff ${diff.toFixed(4)})`,
  );
}

// ════════════════════════════════════════════════════════════════════════
// getMsftPrice
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== getMsftPrice ===');

test('getMsftPrice(0, 0) returns MSFT_FLOOR_PRICE', () => {
  assert.strictEqual(getMsftPrice(0, 0), MSFT_FLOOR_PRICE);
});

test('getMsftPrice(12, 0) returns MSFT_FLOOR_PRICE (zero growth, any month)', () => {
  assert.strictEqual(getMsftPrice(12, 0), MSFT_FLOOR_PRICE);
});

test('getMsftPrice(12, 10) returns ~451.75 (one year at 10% growth)', () => {
  const result = getMsftPrice(12, 10);
  const expected = MSFT_FLOOR_PRICE * 1.10;
  near(result, expected, 0.01, '12mo @ 10%');
});

test('getMsftPrice(0, 10, 500) returns 500 (custom start price, month 0)', () => {
  assert.strictEqual(getMsftPrice(0, 10, 500), 500);
});

test('getMsftPrice(12, 10, 500) returns ~550 (custom start price with growth)', () => {
  const result = getMsftPrice(12, 10, 500);
  near(result, 550, 0.01, '500 * 1.10');
});

test('getMsftPrice(0, 0, undefined) returns MSFT_FLOOR_PRICE (undefined falls back via ??)', () => {
  assert.strictEqual(getMsftPrice(0, 0, undefined), MSFT_FLOOR_PRICE);
});

test('getMsftPrice(6, -30) produces a lower price (verify not NaN)', () => {
  const result = getMsftPrice(6, -30);
  assert.ok(!Number.isNaN(result), 'should not be NaN');
  assert.ok(result < MSFT_FLOOR_PRICE, `${result} should be less than ${MSFT_FLOOR_PRICE}`);
});

// ════════════════════════════════════════════════════════════════════════
// getVestingMonthly
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== getVestingMonthly ===');

test('Month 1, 0% growth — returns round(133 * MSFT_FLOOR_PRICE * 0.8 / 3)', () => {
  // First vest: startMonth=0, endMonth=2, shares=133
  // Price at endMonth 2 with 0% growth = MSFT_FLOOR_PRICE
  const expected = Math.round(133 * MSFT_FLOOR_PRICE * 0.8 / 3);
  assert.strictEqual(getVestingMonthly(1, 0), expected);
});

test('Month 4, 0% growth — returns value for 134-share vest', () => {
  // Second vest: startMonth=3, endMonth=5, shares=134
  // Price at endMonth 5 with 0% growth = MSFT_FLOOR_PRICE
  const expected = Math.round(134 * MSFT_FLOOR_PRICE * 0.8 / 3);
  assert.strictEqual(getVestingMonthly(4, 0), expected);
});

test('Month 30, 0% growth — returns 0 (past all vests)', () => {
  assert.strictEqual(getVestingMonthly(30, 0), 0);
});

test('Month 1 with custom msftPrice=500 — uses 500 to get price at endMonth 2', () => {
  // endMonth=2, 0% growth, startPrice=500 → price = 500
  const expected = Math.round(133 * 500 * 0.8 / 3);
  assert.strictEqual(getVestingMonthly(1, 0, 500), expected);
});

test('Different vest windows return different amounts (133-share vs 32-share)', () => {
  const month1 = getVestingMonthly(1, 0);   // 133-share vest
  const month19 = getVestingMonthly(19, 0);  // 32-share vest (startMonth=18, endMonth=20)
  assert.ok(month1 > month19, `133-share window (${month1}) should be greater than 32-share window (${month19})`);
});

// ════════════════════════════════════════════════════════════════════════
// getVestingLumpSum
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== getVestingLumpSum ===');

test('Month 2 (exact endMonth) — returns round(133 * MSFT_FLOOR_PRICE * 0.8)', () => {
  const expected = Math.round(133 * MSFT_FLOOR_PRICE * 0.8);
  assert.strictEqual(getVestingLumpSum(2, 0), expected);
});

test('Month 1 (not an endMonth) — returns 0', () => {
  assert.strictEqual(getVestingLumpSum(1, 0), 0);
});

test('Month 5 (endMonth of vest 2) — returns round(134 * MSFT_FLOOR_PRICE * 0.8)', () => {
  const expected = Math.round(134 * MSFT_FLOOR_PRICE * 0.8);
  assert.strictEqual(getVestingLumpSum(5, 0), expected);
});

test('All 10 endMonths (2,5,8,11,14,17,20,23,26,29) return non-zero', () => {
  const endMonths = [2, 5, 8, 11, 14, 17, 20, 23, 26, 29];
  for (const m of endMonths) {
    const value = getVestingLumpSum(m, 0);
    assert.ok(value > 0, `endMonth ${m} should return non-zero, got ${value}`);
  }
});

test('Month 30+ returns 0', () => {
  assert.strictEqual(getVestingLumpSum(30, 0), 0);
  assert.strictEqual(getVestingLumpSum(50, 0), 0);
  assert.strictEqual(getVestingLumpSum(100, 0), 0);
});

// ════════════════════════════════════════════════════════════════════════
// getVestEvents
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== getVestEvents ===');

test('Returns exactly 10 events', () => {
  const events = getVestEvents(0);
  assert.strictEqual(events.length, 10);
});

test('Share counts match VEST_SHARES', () => {
  const events = getVestEvents(0);
  for (let i = 0; i < VEST_SHARES.length; i++) {
    assert.strictEqual(events[i].shares, VEST_SHARES[i].shares,
      `Event ${i} shares: expected ${VEST_SHARES[i].shares}, got ${events[i].shares}`);
  }
});

test('Each event has label, shares, gross, net, price fields', () => {
  const events = getVestEvents(0);
  for (const event of events) {
    assert.ok('label' in event, 'missing label');
    assert.ok('shares' in event, 'missing shares');
    assert.ok('gross' in event, 'missing gross');
    assert.ok('net' in event, 'missing net');
    assert.ok('price' in event, 'missing price');
  }
});

test('net = round(gross * 0.8) for each event', () => {
  const events = getVestEvents(0);
  for (const event of events) {
    assert.strictEqual(event.net, Math.round(event.gross * 0.8),
      `${event.label}: net (${event.net}) should be round(gross * 0.8) = ${Math.round(event.gross * 0.8)}`);
  }
});

test('Custom msftPrice=500 changes all prices', () => {
  const defaultEvents = getVestEvents(0);
  const customEvents = getVestEvents(0, 500);
  for (let i = 0; i < defaultEvents.length; i++) {
    assert.notStrictEqual(defaultEvents[i].price, customEvents[i].price,
      `Event ${i} price should differ with custom msftPrice`);
  }
});

// ════════════════════════════════════════════════════════════════════════
// getTotalRemainingVesting
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== getTotalRemainingVesting ===');

test('Sum matches manual calculation at 0% growth', () => {
  const totalShares = VEST_SHARES.reduce((sum, v) => sum + v.shares, 0);
  const expectedTotal = Math.round(totalShares * MSFT_FLOOR_PRICE * 0.8);
  const actual = getTotalRemainingVesting(0);
  // Each event rounds individually, so allow small rounding variance
  near(actual, expectedTotal, VEST_SHARES.length, 'total vesting sum');
});

test('Custom msftPrice=500 produces higher total than default', () => {
  const defaultTotal = getTotalRemainingVesting(0);
  const customTotal = getTotalRemainingVesting(0, 500);
  assert.ok(customTotal > defaultTotal,
    `custom (${customTotal}) should exceed default (${defaultTotal})`);
});

test('Negative growth produces lower total', () => {
  const defaultTotal = getTotalRemainingVesting(0);
  const negativeTotal = getTotalRemainingVesting(-20);
  assert.ok(negativeTotal < defaultTotal,
    `negative growth total (${negativeTotal}) should be less than default (${defaultTotal})`);
});

// ════════════════════════════════════════════════════════════════════════
// Summary
// ════════════════════════════════════════════════════════════════════════
console.log(`\n${'='.repeat(50)}`);
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'='.repeat(50)}\n`);

if (failed > 0) process.exit(1);
