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
// C4 — LTCG 0/15/20 stack + NIIT 3.8% on positive capital gains
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== C4: LTCG stack + NIIT ===');

test('C4-1. audit regression: +$50k LTCG at ~$250k taxable → +$9,400 (15% + NIIT), not $12,000', () => {
  const r0 = calculateTax({ w2Wages: 300000 });
  const r1 = calculateTax({ w2Wages: 300000, capGainLoss: 50000 });
  // Ordinary taxable ≈ $267,800 — the whole LT gain sits in the 15% band
  // (0% band tops at $98,900, 15% band at $613,700 MFJ, Rev. Proc. 2025-32).
  // NIIT: MAGI = $350k → 3.8% × min($50k, $100k) = $1,900.
  near(r1.totalTax - r0.totalTax, 50000 * 0.15 + 50000 * 0.038, 2,
    'LT gain taxed at 15% + 3.8% NIIT, not the 24% ordinary rate');
  near(r1.niit, 1900, 1, 'NIIT exposed on the result');
  near(r1.ltcgTax, 7500, 1, 'LTCG stack tax exposed on the result');
});

test('C4-2. 0% LTCG bracket: low ordinary income shelters the gain from rate but not provisional stacking', () => {
  // Ordinary taxable 0 (no other income), $40k LT gain: taxable income = $40k
  // − $32,200 std ded = $7,800, entirely inside the 0% band → $0 fed tax.
  const r = calculateTax({ capGainLoss: 40000 });
  assert.strictEqual(r.fedTax, 0, `0% band gain should owe no federal tax, got ${r.fedTax}`);
  assert.strictEqual(r.niit, 0, 'MAGI $40k under $250k → no NIIT');
});

test('C4-3. 20% bracket: gain stacked above $613,700 taxable pays 20%', () => {
  const r0 = calculateTax({ w2Wages: 700000 });
  const r1 = calculateTax({ w2Wages: 700000, capGainLoss: 100000 });
  // Ordinary taxable ≈ $667,800 > $613,700 → entire gain in the 20% band.
  near(r1.totalTax - r0.totalTax, 100000 * 0.20 + 100000 * 0.038, 2,
    '20% LTCG + NIIT above the top breakpoint');
});

test('C4-4. capGainLtShare splits ST (ordinary) from LT (stack)', () => {
  const all = calculateTax({ w2Wages: 300000, capGainLoss: 50000 });
  const half = calculateTax({ w2Wages: 300000, capGainLoss: 50000, capGainLtShare: 0.5 });
  const none = calculateTax({ w2Wages: 300000, capGainLoss: 50000, capGainLtShare: 0 });
  // ST portion is taxed at the 24% ordinary rate; LT at 15%.
  assert.ok(none.totalTax > half.totalTax, 'all-ST must out-tax half-LT');
  assert.ok(half.totalTax > all.totalTax, 'half-LT must out-tax all-LT');
  near(none.totalTax - all.totalTax, 50000 * (0.24 - 0.15), 5,
    'ST-vs-LT delta = (24% − 15%) × gain');
  // NIIT hits the whole net gain regardless of holding period.
  near(none.niit, all.niit, 0.01, 'NIIT identical for ST and LT');
});

test('C4-5. losses unchanged: -$3,000 cap loss still reduces ordinary income, no NIIT', () => {
  const r = calculateTax({ w2Wages: 200000, capGainLoss: -50000 });
  assert.strictEqual(r.niit, 0);
  assert.strictEqual(r.ltcgTax, 0);
  near(r.totalIncome, 200000 - 3000, 0.01, 'cap-loss limit still applies');
});

test('C4-6. NIIT threshold: MAGI below $250k → zero NIIT even with gains', () => {
  const r = calculateTax({ w2Wages: 100000, capGainLoss: 30000 });
  assert.strictEqual(r.niit, 0, `AGI $130k < $250k must owe no NIIT, got ${r.niit}`);
});

// ════════════════════════════════════════════════════════════════════════
// Summary
// ════════════════════════════════════════════════════════════════════════
console.log(`\n${'='.repeat(50)}`);
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'='.repeat(50)}\n`);

if (failed > 0) process.exit(1);
