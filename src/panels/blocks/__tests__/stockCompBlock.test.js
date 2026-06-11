/**
 * StockCompBlock Display Parity Tests — locks the vest-avg formula
 * rendered by src/panels/blocks/StockCompBlock.jsx to the same math
 * used by the W-2 diagnostic (src/model/w2Diagnostic.js) and the engine
 * (src/model/vesting.js HIRE_VEST_TRANCHES via projection.js).
 *
 * 2026-06-10 schedule change: ONE total grant (chadJobHireStockTotal)
 * vesting 25% at month 12 after hire, then 6.25% every 3 months through
 * month 48 (13 tranches). Each tranche grows (1+g)^(months/12); the block
 * shows total × growth-weighted mean × bonusMult / 4 as the vest avg.
 *
 * Bug A regression (kept from the old suite): the block must show the
 * GROWN vest value, not just the flat grant total, or it disagrees with
 * the W-2 diagnostic on screen.
 *
 * Run with: node src/panels/blocks/__tests__/stockCompBlock.test.js
 */
import assert from 'node:assert';
import { computeW2Diagnostic } from '../../../model/w2Diagnostic.js';

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
    throw new Error(`${label || 'near'}: expected ~${expected} (+/-${tolerance}), got ${actual} (diff ${diff})`);
  }
}

// Independent re-derivation of the schedule (NOT imported from vesting.js)
// so drift in either the helper or the block shows up here.
const TRANCHES = [
  { t: 12, f: 0.25 },
  ...Array.from({ length: 12 }, (_, i) => ({ t: 15 + 3 * i, f: 0.0625 })),
];

// Pure formula extracted from StockCompBlock.jsx — keep in sync.
function computeBlockVestAvg({ chadJobHireStockTotal, chadJobTaxRate, chadJobNoFICA, msftGrowth }) {
  const totalHireStock = chadJobHireStockTotal || 0;
  const g = (msftGrowth || 0) / 100;
  const taxRateDec = (chadJobTaxRate ?? 25) / 100;
  const ficaSavings = chadJobNoFICA ? 0.062 : 0;
  const bonusMult = 1 - taxRateDec + ficaSavings;
  const weightedMean = g === 0 ? 1
    : TRANCHES.reduce((acc, tr) => acc + tr.f * Math.pow(1 + g, tr.t / 12), 0);
  const hireGrownTotal = totalHireStock * weightedMean;
  const hireNetAvgYr = totalHireStock > 0 ? hireGrownTotal * bonusMult / 4 : 0;
  return { totalHireStock, hireGrownTotal, hireNetAvgYr, bonusMult };
}

// ════════════════════════════════════════════════════════════════════════
// Section 1: Zero-growth baseline
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Section 1: StockCompBlock vest-avg formula ===');

test('A1: g=0 → vest avg = total × bonusMult / 4', () => {
  const r = computeBlockVestAvg({
    chadJobHireStockTotal: 160000,
    chadJobTaxRate: 25,
    chadJobNoFICA: false,
    msftGrowth: 0,
  });
  // bonusMult = 1 - 0.25 + 0 = 0.75; grown total = 160_000 (no growth);
  // vest avg = 160_000 × 0.75 / 4 = 30_000.
  assert.strictEqual(r.totalHireStock, 160000, 'flat grant total');
  assert.strictEqual(r.hireGrownTotal, 160000, 'no growth applied');
  near(r.bonusMult, 0.75, 1e-9, 'bonusMult');
  near(r.hireNetAvgYr, 30000, 0.01, 'vest avg yr');
});

// ════════════════════════════════════════════════════════════════════════
// Section 2: Growth applied per tranche (25% @ m12, 6.25% quarterly → m48)
// ════════════════════════════════════════════════════════════════════════
test('A2: g=10% → each tranche grows by (1.1)^(months/12)', () => {
  const r = computeBlockVestAvg({
    chadJobHireStockTotal: 100000,
    chadJobTaxRate: 25,
    chadJobNoFICA: false,
    msftGrowth: 10,
  });
  const expectedGrown = TRANCHES.reduce(
    (acc, tr) => acc + 100000 * tr.f * Math.pow(1.1, tr.t / 12), 0);
  near(r.hireGrownTotal, expectedGrown, 0.01, 'grown total (10% growth)');
  near(r.hireNetAvgYr, expectedGrown * 0.75 / 4, 0.01, 'vest avg (10% growth)');
  // Sanity check: must be > flat grant net (no growth case)
  assert.ok(r.hireNetAvgYr > 100000 * 0.75 / 4, 'growth should increase vest avg');
});

// ════════════════════════════════════════════════════════════════════════
// Section 3: noFICA addback
// ════════════════════════════════════════════════════════════════════════
test('A3: chadJobNoFICA=true → bonusMult includes +6.2% addback', () => {
  const r = computeBlockVestAvg({
    chadJobHireStockTotal: 160000,
    chadJobTaxRate: 25,
    chadJobNoFICA: true,
    msftGrowth: 0,
  });
  // bonusMult = 1 - 0.25 + 0.062 = 0.812; vest avg = 160_000 × 0.812 / 4 = 32_480.
  near(r.bonusMult, 0.812, 1e-9, 'bonusMult with noFICA');
  near(r.hireNetAvgYr, 32480, 0.01, 'vest avg with noFICA');
  assert.ok(r.hireNetAvgYr > 30000, 'noFICA must increase net');
});

// ════════════════════════════════════════════════════════════════════════
// Section 4: Zero-input safety (no NaN)
// ════════════════════════════════════════════════════════════════════════
test('A4: zero total → vest avg = 0 (no NaN)', () => {
  const r = computeBlockVestAvg({
    chadJobHireStockTotal: 0,
    chadJobTaxRate: 25,
    chadJobNoFICA: false,
    msftGrowth: 10,
  });
  assert.strictEqual(r.totalHireStock, 0, 'total = 0');
  assert.strictEqual(r.hireGrownTotal, 0, 'grown = 0');
  assert.strictEqual(r.hireNetAvgYr, 0, 'vest avg = 0');
  assert.ok(!Number.isNaN(r.hireNetAvgYr), 'no NaN');
});

test('A4b: undefined inputs → safe zeros (no NaN)', () => {
  const r = computeBlockVestAvg({});
  assert.strictEqual(r.totalHireStock, 0);
  assert.strictEqual(r.hireGrownTotal, 0);
  assert.strictEqual(r.hireNetAvgYr, 0);
  assert.ok(!Number.isNaN(r.bonusMult), 'bonusMult uses defaults, not NaN');
  near(r.bonusMult, 0.75, 1e-9, 'default bonusMult');
});

// ════════════════════════════════════════════════════════════════════════
// Section 5: Parity with the EXPORTED W-2 diagnostic (the whole point)
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Section 2: Parity with computeW2Diagnostic ===');

test('A5: Block vest-avg == computeW2Diagnostic.hireNetAvgYr (g=0, FICA)', () => {
  const inputs = {
    chadJobHireStockTotal: 180000,
    chadJobTaxRate: 25, chadJobNoFICA: false, msftGrowth: 0,
  };
  const block = computeBlockVestAvg(inputs).hireNetAvgYr;
  const diag = computeW2Diagnostic({ chadJob: true, chadJobSalary: 100000, ...inputs }).hireNetAvgYr;
  near(block, diag, 1e-6, 'parity g=0');
});

test('A5b: Block vest-avg == computeW2Diagnostic.hireNetAvgYr (g=8, noFICA)', () => {
  const inputs = {
    chadJobHireStockTotal: 160000,
    chadJobTaxRate: 22, chadJobNoFICA: true, msftGrowth: 8,
  };
  const block = computeBlockVestAvg(inputs).hireNetAvgYr;
  const diag = computeW2Diagnostic({ chadJob: true, chadJobSalary: 100000, ...inputs }).hireNetAvgYr;
  near(block, diag, 1e-6, 'parity g=8, noFICA');
});

// ════════════════════════════════════════════════════════════════════════
// Summary
// ════════════════════════════════════════════════════════════════════════
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
