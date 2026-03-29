/**
 * Unit tests for the formatters module (fmt, fmtFull).
 * Run with: node src/model/__tests__/formatters.test.js
 */
import assert from 'node:assert';
import { fmt, fmtFull } from '../formatters.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (e) {
    console.log(`  FAIL  ${name}`);
    console.log(`        ${e.message}`);
    failed++;
  }
}

// --- fmt() tests ---

test('fmt: zero returns "$0"', () => {
  assert.strictEqual(fmt(0), '$0');
});

test('fmt: small values under $1K show whole dollars', () => {
  assert.strictEqual(fmt(500), '$500');
  assert.strictEqual(fmt(999), '$999');
  assert.strictEqual(fmt(1), '$1');
});

test('fmt: thousands range ($1K-$999K)', () => {
  assert.strictEqual(fmt(1000), '$1.0K');
  assert.strictEqual(fmt(5000), '$5.0K');
  assert.strictEqual(fmt(25000), '$25.0K');
  assert.strictEqual(fmt(500000), '$500.0K');
});

test('fmt: $999.5K boundary promotes to $1.0M', () => {
  // 999499 / 1000 = 999.499, rounds to 999.5 -> still K
  assert.strictEqual(fmt(999499), '$999.5K');
  // 999500 crosses the threshold and enters the M branch
  assert.strictEqual(fmt(999500), '$1.0M');
});

test('fmt: million-scale values', () => {
  assert.strictEqual(fmt(1500000), '$1.5M');
  assert.strictEqual(fmt(10000000), '$10.0M');
  assert.strictEqual(fmt(250000000), '$250.0M');
});

test('fmt: $999.5M boundary promotes to $1.0B', () => {
  // 999499999 / 1000000 = 999.499999, rounds to 999.5 -> still M
  assert.strictEqual(fmt(999499999), '$999.5M');
  // 999500000 crosses the threshold and enters the B branch
  assert.strictEqual(fmt(999500000), '$1.0B');
});

test('fmt: billion-scale values', () => {
  assert.strictEqual(fmt(2500000000), '$2.5B');
  assert.strictEqual(fmt(10000000000), '$10.0B');
});

test('fmt: negative values format symmetrically with leading minus', () => {
  assert.strictEqual(fmt(-500), '-$500');
  assert.strictEqual(fmt(-5000), '-$5.0K');
  assert.strictEqual(fmt(-999500), '-$1.0M');
  assert.strictEqual(fmt(-2500000000), '-$2.5B');
});

// --- fmtFull() tests ---

test('fmtFull: formats full dollar amounts with comma separators', () => {
  assert.strictEqual(fmtFull(0), '$0');
  assert.strictEqual(fmtFull(999), '$999');
  assert.strictEqual(fmtFull(1000), '$1,000');
  assert.strictEqual(fmtFull(1234567), '$1,234,567');
  assert.strictEqual(fmtFull(-1234567), '-$1,234,567');
  // Rounds to nearest integer
  assert.strictEqual(fmtFull(999.5), '$1,000');
  assert.strictEqual(fmtFull(999.4), '$999');
});

console.log(`\n${'='.repeat(50)}`);
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log('='.repeat(50));
if (failed > 0) process.exit(1);
