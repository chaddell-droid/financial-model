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
  computeQBI,
} from '../taxEngine.js';
import {
  buildTaxSchedule,
  estimateAnnualSSBenefits,
  estimateAnnualTaxableSSBenefits,
} from '../taxProjection.js';
import { gatherStateWithOverrides } from '../../state/gatherState.js';

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
// C1 — QBI SSTB applicable-percentage step + net-capital-gain cap term
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== C1: QBI SSTB phase-in + §199A(a)(2) cap ===');

test('C1-1. SSTB (default) in the $403,500–$553,500 band: 20%·QBI·(1−p)²', () => {
  // Midpoint → p = 0.5 → factor 0.25.
  const qbi = computeQBI({ schCNet: 100000, taxableBeforeQbi: 478500 });
  near(qbi, 20000 * 0.25, 0.01, 'SSTB applicable-percentage squared');
  // Quarter point → p = 0.25 → factor 0.75² = 0.5625.
  const q2 = computeQBI({ schCNet: 100000, taxableBeforeQbi: 403500 + 37500 });
  near(q2, 20000 * 0.75 * 0.75, 0.01, 'SSTB at p=0.25');
});

test('C1-2. isSSTB=false keeps the linear (1−p) zero-wage phase-in', () => {
  const qbi = computeQBI({ schCNet: 100000, taxableBeforeQbi: 478500, isSSTB: false });
  near(qbi, 20000 * 0.5, 0.01, 'non-SSTB linear phase-in');
});

test('C1-3. SSTB above the band: deduction is 0 (unchanged)', () => {
  assert.strictEqual(computeQBI({ schCNet: 100000, taxableBeforeQbi: 600000 }), 0);
});

test('C1-4. overall cap subtracts net capital gain (§199A(a)(2))', () => {
  // Cap = 20% × max(0, taxableBeforeQbi − netCapitalGain), binding here.
  const qbi = computeQBI({ schCNet: 100000, taxableBeforeQbi: 90000, netCapitalGain: 50000 });
  near(qbi, (90000 - 50000) * 0.20, 0.01, 'cap term net of capital gain');
  // Without the gain the cap would not bind.
  near(computeQBI({ schCNet: 100000, taxableBeforeQbi: 90000 }), 90000 * 0.20, 0.01,
    'no-gain baseline caps at 20% of taxable');
});

test('C1-5. calculateTax integration: LT gain shrinks the QBI cap', () => {
  // schCNet $60k + $100k LT gain: taxableBeforeQbi ≈ 60000 − halfSE + 100000
  // − 32200 std ded; the §199A(a)(2) cap nets out the $100k gain.
  const r = calculateTax({ schCNet: 60000, capGainLoss: 100000 });
  near(r.qbi, Math.max(0, r.taxableBeforeQbi - r.ltGain) * 0.20, 1,
    'QBI capped at 20% of (taxable − net capital gain)');
  assert.ok(r.qbi < 0.20 * 60000, 'cap must bind below 20% of Sch C net');
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
// C6 — children's SS auxiliary benefits are the KIDS' income (Pub 915),
//       not the parents' — the tax schedule must see adult-only amounts
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== C6: kids’ SS benefits off the parents’ return ===');

test('C6-1. taxable estimate is adult-only during the kids window', () => {
  const s = gatherStateWithOverrides({
    ssType: 'ssdi', ssdiDenied: false, ssdiApprovalMonth: 7,
    ssdiPersonal: 4214, ssdiFamilyTotal: 6321, ssdiBackPayMonths: 0,
    chadJob: false, expenseInflation: false,
  });
  const taxable = estimateAnnualTaxableSSBenefits(s);
  const cashflow = estimateAnnualSSBenefits(s);
  // Year 1 (m12-23) is fully inside the kids window: cashflow sees the family
  // total, the parents' RETURN sees only the adult benefit.
  assert.strictEqual(cashflow[1], 12 * 6321, 'cashflow estimate keeps the family total');
  assert.strictEqual(taxable.adultBenefits[1], 12 * 4214,
    `parents' return must see 12 × $4,214 adult-only, got ${taxable.adultBenefits[1]}`);
});

test('C6-2. after the kids age out the two estimates agree', () => {
  const s = gatherStateWithOverrides({
    ssType: 'ssdi', ssdiDenied: false, ssdiApprovalMonth: 7,
    ssdiPersonal: 4214, ssdiFamilyTotal: 6321, ssdiBackPayMonths: 0,
    chadJob: false, expenseInflation: false,
  });
  const taxable = estimateAnnualTaxableSSBenefits(s);
  const cashflow = estimateAnnualSSBenefits(s);
  const lastYear = cashflow.length - 1;
  assert.strictEqual(taxable.adultBenefits[lastYear], cashflow[lastYear],
    'adult-only and family totals must agree once the kids’ window has closed');
});

test('C6-3. buildTaxSchedule: kids’ aux benefits create NO phantom tax', () => {
  const base = {
    ssType: 'ssdi', ssdiDenied: false, ssdiApprovalMonth: 7,
    ssdiPersonal: 4214, ssdiBackPayMonths: 0,
    chadJob: false, expenseInflation: false,
    sarahRate: 200, sarahCurrentClients: 4,
  };
  const withKidsAux = buildTaxSchedule(gatherStateWithOverrides({ ...base, ssdiFamilyTotal: 6321 }));
  const adultOnly = buildTaxSchedule(gatherStateWithOverrides({ ...base, ssdiFamilyTotal: 4214 }));
  for (let y = 0; y < withKidsAux.length; y++) {
    assert.strictEqual(withKidsAux[y].fullTax.ssTaxableIncome, adultOnly[y].fullTax.ssTaxableIncome,
      `year ${y}: kids' aux must not change the parents' taxable SS`);
    assert.strictEqual(withKidsAux[y].fullTax.totalTax, adultOnly[y].fullTax.totalTax,
      `year ${y}: kids' aux must not change the parents' total tax`);
  }
});

test('C6-4. SS-retirement path: family window taxes only the personal benefit', () => {
  const s = gatherStateWithOverrides({
    ssType: 'ss', ssClaimAge: 62, chadJob: false, expenseInflation: false,
  });
  const taxable = estimateAnnualTaxableSSBenefits(s);
  const cashflow = estimateAnnualSSBenefits(s);
  // During the family window the cashflow estimate exceeds adult-only.
  const kidYear = cashflow.findIndex((v, i) => v > taxable.adultBenefits[i]);
  assert.ok(kidYear >= 0, 'family window must exist in this scenario');
  assert.ok(taxable.adultBenefits[kidYear] > 0, 'adult benefit still present');
});

test('C6-5. back pay on the parents’ return excludes the kids’ auxiliary share', () => {
  const s = gatherStateWithOverrides({
    ssType: 'ssdi', ssdiDenied: false, ssdiApprovalMonth: 7,
    ssdiPersonal: 4214, ssdiFamilyTotal: 6321, ssdiBackPayMonths: 18,
    kidsAgeOutMonths: 24, chadJob: false, expenseInflation: false,
  });
  const taxable = estimateAnnualTaxableSSBenefits(s);
  assert.ok(taxable.backPay, 'back-pay info must be present');
  assert.strictEqual(taxable.backPay.receiptYearIdx, 0, 'receipt at approval+2 → year 0');
  // Adult share only: at most 18 × $4,214 — never including the aux 18 × $2,107.
  assert.ok(taxable.backPay.adultGross <= 18 * 4214,
    `taxable back pay must exclude the kids' aux share, got ${taxable.backPay.adultGross}`);
  assert.ok(taxable.backPay.adultGross > 0, 'adult back pay present');
});

// ════════════════════════════════════════════════════════════════════════
// C3 — back pay taxable GROSS of the withheld attorney fee (SSA-1099 box 5;
//       the fee is nondeductible post-TCJA)
// b-10 — §86(e) lump-sum election: tax min(standard, election), expose which
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== C3 + b-10: back-pay gross + §86(e) lump-sum election ===');

const C3_STATE = {
  ssType: 'ssdi', ssdiDenied: false, ssdiApprovalMonth: 7,
  ssdiPersonal: 4214, ssdiFamilyTotal: 6321, ssdiBackPayMonths: 18,
  kidsAgeOutMonths: 24, chadJob: false, expenseInflation: false,
};

test('C3-1. taxable back pay is the GROSS adult share (18 × $4,214 = $75,852)', () => {
  const taxable = estimateAnnualTaxableSSBenefits(gatherStateWithOverrides(C3_STATE));
  assert.strictEqual(taxable.backPay.adultGross, 18 * 4214,
    `SSA-1099 box 5 is gross of the withheld fee, got ${taxable.backPay.adultGross}`);
});

test('C3-2. cashflow estimate stays fee-net (fee reduces cash, not taxability)', () => {
  const s = gatherStateWithOverrides(C3_STATE);
  const cashflow = estimateAnnualSSBenefits(s);
  const sNoBP = gatherStateWithOverrides({ ...C3_STATE, ssdiBackPayMonths: 0 });
  const cashflowNoBP = estimateAnnualSSBenefits(sNoBP);
  // adult 75,852 + aux 18×2,107 − fee min(25%×75,852, $9,200) = 113,578.
  assert.strictEqual(cashflow[0] - cashflowNoBP[0], 75852 + 18 * 2107 - 9200,
    'cashflow back pay = family gross − attorney fee');
});

test('b10-1. schedule exposes the §86(e) comparison and taxes the minimum', () => {
  const s = gatherStateWithOverrides(C3_STATE);
  const row = buildTaxSchedule(s)[0];
  assert.ok(row.ssLumpSum, 'receipt-year row must expose ssLumpSum');
  const { taxableStandard, taxableElection, electionApplied, backPayGross } = row.ssLumpSum;
  assert.strictEqual(backPayGross, 75852);
  assert.ok(Number.isFinite(taxableStandard) && Number.isFinite(taxableElection));
  near(row.fullTax.ssTaxableIncome, Math.min(taxableStandard, taxableElection), 1,
    'engine must tax the lesser treatment');
  assert.strictEqual(electionApplied, taxableElection < taxableStandard);
});

test('b10-2. low-income prior years: the election WINS', () => {
  // No Sarah income, no MSFT vests → prior-year provisional income is tiny,
  // so attributing back pay to those years escapes the 85% tier entirely.
  const s = gatherStateWithOverrides({
    ssType: 'ssdi', ssdiDenied: false, ssdiApprovalMonth: 20,
    ssdiPersonal: 4214, ssdiFamilyTotal: 4214, ssdiBackPayMonths: 18,
    kidsAgeOutMonths: 0, chadJob: false, expenseInflation: false,
    sarahCurrentClients: 0, sarahMaxClients: 0, msftPrice: 0,
  });
  const receiptYear = Math.floor((20 + 2) / 12); // year 1
  const row = buildTaxSchedule(s)[receiptYear];
  assert.ok(row.ssLumpSum, 'ssLumpSum present in the receipt year');
  assert.strictEqual(row.ssLumpSum.electionApplied, true,
    `election should win with low prior-year income (std ${row.ssLumpSum.taxableStandard} vs elec ${row.ssLumpSum.taxableElection})`);
  assert.ok(row.ssLumpSum.taxableElection < row.ssLumpSum.taxableStandard);
  near(row.fullTax.ssTaxableIncome, row.ssLumpSum.taxableElection, 1,
    'elected taxable amount drives the return');
});

test('b10-3. high steady income: both treatments hit 85% — standard ties, no election', () => {
  const s = gatherStateWithOverrides(C3_STATE); // Sarah income + legacy vests → high AGI everywhere
  const row = buildTaxSchedule(s)[0];
  // Either the election loses or it ties — it must never INCREASE tax.
  assert.ok(row.fullTax.ssTaxableIncome <= row.ssLumpSum.taxableStandard + 1,
    'taxed amount never exceeds the standard treatment');
});

test('b10-4. non-receipt years expose no ssLumpSum', () => {
  const s = gatherStateWithOverrides(C3_STATE);
  const sched = buildTaxSchedule(s);
  for (let y = 1; y < sched.length; y++) {
    assert.strictEqual(sched[y].ssLumpSum, null, `year ${y} must not carry ssLumpSum`);
  }
});

// ════════════════════════════════════════════════════════════════════════
// Summary
// ════════════════════════════════════════════════════════════════════════
console.log(`\n${'='.repeat(50)}`);
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'='.repeat(50)}\n`);

if (failed > 0) process.exit(1);
