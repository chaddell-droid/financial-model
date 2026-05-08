/**
 * Tests for verifier — number citation audit.
 *
 * Run with: node src/advisor/__tests__/verifier.test.js
 */
import assert from 'node:assert';
import { verifyTurn } from '../verifier.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try { fn(); passed++; console.log(`  PASS  ${name}`); }
  catch (err) { failed++; console.log(`  FAIL  ${name}\n        ${err.message}`); }
}

console.log('\n=== verifier — basic coverage ===');

test('Empty input → 0 mismatches', () => {
  const r = verifyTurn({ assistantText: '', toolCalls: [] });
  assert.strictEqual(r.stats.total, 0);
  assert.strictEqual(r.mismatches.length, 0);
});

test('No numbers in prose → 0 mismatches even with no tools', () => {
  const r = verifyTurn({
    assistantText: "I don't have enough data to answer that. Try running a projection first.",
    toolCalls: [],
  });
  assert.strictEqual(r.stats.total, 0);
});

test('Dollar amount that exists in tool result → covered', () => {
  const r = verifyTurn({
    assistantText: 'Your final balance is $325,000 at the horizon.',
    toolCalls: [{ name: 'runProjection', input: {}, result: { ok: true, summary: { finalBalance: 325000 } } }],
  });
  assert.strictEqual(r.stats.total, 1);
  assert.strictEqual(r.stats.covered, 1);
  assert.strictEqual(r.mismatches.length, 0);
});

test('Dollar amount NOT in any tool result → mismatch', () => {
  const r = verifyTurn({
    assistantText: 'Your final balance is $999,999.',
    toolCalls: [{ name: 'runProjection', input: {}, result: { ok: true, summary: { finalBalance: 325000 } } }],
  });
  assert.strictEqual(r.stats.mismatchCount, 1);
  assert.strictEqual(r.mismatches[0].kind, 'dollar');
  assert.strictEqual(r.mismatches[0].normalized, 999999);
});

test('Suffix forms ($1.5K, $50M) match raw tool numbers', () => {
  const r = verifyTurn({
    assistantText: 'Refresh totals roughly $1.5K per quarter, with a hire-stock value of $50M (joke). Wait, that\'s $50K.',
    toolCalls: [{
      name: 'runProjection', input: {},
      result: { perQtr: 1500, hireStockY1: 50000 },
    }],
  });
  // $1.5K → 1500 (matches perQtr); $50M → 50000000 (NOT in pool, mismatch); $50K → 50000 (matches hireStockY1).
  assert.strictEqual(r.stats.mismatchCount, 1, `expected 1 mismatch for $50M, got ${r.stats.mismatchCount}: ${JSON.stringify(r.mismatches)}`);
  assert.strictEqual(r.mismatches[0].normalized, 50_000_000);
});

test('Tolerance: $325,001 matches $325,000 (within $1)', () => {
  const r = verifyTurn({
    assistantText: 'Final balance: $325,001.',
    toolCalls: [{ name: 'x', input: {}, result: { v: 325000 } }],
  });
  assert.strictEqual(r.stats.mismatchCount, 0);
});

test('Tolerance: $326,000 matches $325,000 (within 0.5%)', () => {
  // 0.5% of 325000 = $1625 → $326,000 is 1000 away, well under
  const r = verifyTurn({
    assistantText: 'Final balance: $326,000.',
    toolCalls: [{ name: 'x', input: {}, result: { v: 325000 } }],
  });
  assert.strictEqual(r.stats.mismatchCount, 0);
});

test('Out of tolerance: $400,000 vs $325,000 → mismatch', () => {
  const r = verifyTurn({
    assistantText: 'Final balance: $400,000.',
    toolCalls: [{ name: 'x', input: {}, result: { v: 325000 } }],
  });
  assert.strictEqual(r.stats.mismatchCount, 1);
});

test('Percentages — 12% matches both 12 and 0.12 in tool results', () => {
  const a = verifyTurn({
    assistantText: 'The investment return assumption is 15%.',
    toolCalls: [{ name: 'x', input: {}, result: { investmentReturn: 15 } }],
  });
  assert.strictEqual(a.stats.mismatchCount, 0);
  const b = verifyTurn({
    assistantText: 'Solvency rate is 72%.',
    toolCalls: [{ name: 'x', input: {}, result: { solvencyRate: 0.72 } }],
  });
  assert.strictEqual(b.stats.mismatchCount, 0);
});

test('Month reference — "month 42" matches month 42 in tool result', () => {
  const r = verifyTurn({
    assistantText: 'Lowest balance falls at month 42.',
    toolCalls: [{ name: 'x', input: {}, result: { lowestMonth: { month: 42, balance: -8200 } } }],
  });
  assert.strictEqual(r.stats.mismatchCount, 0);
});

test('"in 24 months" matches 24 in tool result', () => {
  const r = verifyTurn({
    assistantText: 'You break even in 24 months.',
    toolCalls: [{ name: 'x', input: {}, result: { breakevenMonth: 24 } }],
  });
  assert.strictEqual(r.stats.mismatchCount, 0);
});

test('Code blocks ignored — model echoing JSON in fenced block does not flag', () => {
  const r = verifyTurn({
    assistantText: 'Here is the raw output:\n```json\n{ "finalBalance": 999999 }\n```\nThe key insight: your final balance is $325,000.',
    toolCalls: [{ name: 'x', input: {}, result: { finalBalance: 325000 } }],
  });
  // The 999,999 inside the code block is ignored. The $325,000 prose number matches.
  assert.strictEqual(r.stats.mismatchCount, 0);
});

test('Inline code ignored — `$999K` in backticks does not flag', () => {
  const r = verifyTurn({
    assistantText: 'The variable `value=$999K` is just a placeholder. Actual final: $325,000.',
    toolCalls: [{ name: 'x', input: {}, result: { finalBalance: 325000 } }],
  });
  assert.strictEqual(r.stats.mismatchCount, 0);
});

test('Multiple mentions, mixed coverage', () => {
  const r = verifyTurn({
    assistantText: 'Final balance $325,000, lowest at month 42 of $-8,200, with 72% solvency.',
    toolCalls: [{
      name: 'mix', input: {},
      result: {
        finalBalance: 325000,
        lowestMonth: { month: 42, balance: -8200 },
        solvencyRate: 0.72,
      },
    }],
  });
  assert.strictEqual(r.stats.mismatchCount, 0);
  assert.ok(r.stats.total >= 4); // $325000, month 42, $-8,200 (or $8,200), 72%
});

test('Stats by kind', () => {
  const r = verifyTurn({
    assistantText: 'Final balance $325,000 by month 60 with 70% solvency.',
    toolCalls: [{
      name: 'x', input: {},
      result: { finalBalance: 325000, breakevenMonth: 60, solvencyRate: 0.70 },
    }],
  });
  assert.strictEqual(r.stats.byKind.dollar, 1);
  assert.strictEqual(r.stats.byKind.percent, 1);
  assert.strictEqual(r.stats.byKind.month, 1);
});

console.log(`\n${'='.repeat(60)}`);
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'='.repeat(60)}\n`);

if (failed > 0) process.exit(1);
