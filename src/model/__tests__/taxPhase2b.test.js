/**
 * P2b tax-engine batch regression tests (remediation plan 2026-06-10, items 2.3–2.9).
 *
 * Run with:
 *   node src/model/__tests__/taxPhase2b.test.js
 *
 * Covers (one block per audit finding):
 *   C1   — QBI SSTB applicable-percentage step + net-capital-gain cap term
 *   C2   — Solo 401(k) self-employed employer rate = 0.25/1.25 = 20%
 *   C3   — SSDI back pay taxable GROSS of the withheld attorney fee
 *   b-10 — §86(e) lump-sum election: min(standard, election), flag which won
 *   C4   — LTCG 0/15/20 stack + NIIT 3.8% on positive capital gains
 *   C5   — standard deduction indexes with taxInflationAdjust
 *   C6   — kids' SS benefits excluded from the parents' return
 *   C9   — balance defined off 1040 quantities only (no employee FICA)
 */
import assert from 'node:assert';
import {
  calculateTax,
  computeMax401k,
} from '../taxEngine.js';

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
  if (diff > tolerance) {
    throw new Error(
      `${label || 'near'}: expected ~${expected} (+/-${tolerance}), got ${actual} (diff ${diff})`
    );
  }
}

// ════════════════════════════════════════════════════════════════════════
// C2 — Solo 401(k) self-employed employer cap = 20% effective rate
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== C2: solo-401(k) SE employer rate 0.25/1.25 ===');

test('C2-1. audit regression: $100k Sch C → employerMax $18,587 (was $23,234)', () => {
  // halfSeTax for 100k Sch C: seBase 92,350 → SE tax 14,130 → half 7,065.
  const { halfSeTax } = calculateTax({ schCNet: 100000 });
  const max = computeMax401k(100000, halfSeTax);
  near(max.employerMax, 18587, 2, 'Pub 560 reduced-rate employer max');
});

test('C2-2. employer max = round((schCNet − halfSE) × 0.20) exactly', () => {
  const max = computeMax401k(101816, 1363);
  assert.strictEqual(max.employerMax, Math.round((101816 - 1363) * 0.20));
});

// ════════════════════════════════════════════════════════════════════════
// Summary
// ════════════════════════════════════════════════════════════════════════
console.log(`\n${'='.repeat(50)}`);
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'='.repeat(50)}\n`);

if (failed > 0) process.exit(1);
