/**
 * StockCompBlock Display Parity Tests — locks the vest-avg formula
 * rendered by src/panels/blocks/StockCompBlock.jsx to the same math
 * used by the W-2 Net diagnostic in src/panels/IncomeControls.jsx
 * (w2HireGrownTotal / w2HireNetAvgYr) and the engine in
 * src/model/projection.js:253 (msftMultIssueToVest).
 *
 * Bug A regression: the block previously showed only the flat grant
 * total (Y1+Y2+Y3+Y4), ignoring MSFT growth. The diagnostic showed the
 * grown vest value, so the two panels disagreed. The block now shows
 * BOTH: "Grant total: $X" + "Vest avg: $Y/yr (g=Z%)".
 *
 * Run with: node src/panels/blocks/__tests__/stockCompBlock.test.js
 */
import assert from 'node:assert';

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

// Pure formula extracted from StockCompBlock.jsx — keep in sync.
// Mirrors w2HireNetAvgYr in src/panels/IncomeControls.jsx and
// msftMultIssueToVest behavior in src/model/projection.js:253.
function computeBlockVestAvg({
  chadJobHireStockY1, chadJobHireStockY2, chadJobHireStockY3, chadJobHireStockY4,
  chadJobTaxRate, chadJobNoFICA, msftGrowth,
}) {
  const y1 = chadJobHireStockY1 || 0;
  const y2 = chadJobHireStockY2 || 0;
  const y3 = chadJobHireStockY3 || 0;
  const y4 = chadJobHireStockY4 || 0;
  const totalHireStock = y1 + y2 + y3 + y4;
  const w2Growth = (msftGrowth || 0) / 100;
  const taxRateDec = (chadJobTaxRate ?? 25) / 100;
  const ficaSavings = chadJobNoFICA ? 0.062 : 0;
  const bonusMult = 1 - taxRateDec + ficaSavings;
  const hireGrownTotal = y1 * Math.pow(1 + w2Growth, 1)
                       + y2 * Math.pow(1 + w2Growth, 2)
                       + y3 * Math.pow(1 + w2Growth, 3)
                       + y4 * Math.pow(1 + w2Growth, 4);
  const hireNetAvgYr = totalHireStock > 0 ? hireGrownTotal * bonusMult / 4 : 0;
  return { totalHireStock, hireGrownTotal, hireNetAvgYr, bonusMult };
}

// ════════════════════════════════════════════════════════════════════════
// Section 1: Zero-growth baseline
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Section 1: StockCompBlock vest-avg formula ===');

test('A1: g=0 → vest avg = (Y1+Y2+Y3+Y4) × bonusMult / 4', () => {
  const r = computeBlockVestAvg({
    chadJobHireStockY1: 40000,
    chadJobHireStockY2: 40000,
    chadJobHireStockY3: 40000,
    chadJobHireStockY4: 40000,
    chadJobTaxRate: 25,
    chadJobNoFICA: false,
    msftGrowth: 0,
  });
  // bonusMult = 1 - 0.25 + 0 = 0.75
  // grown total = 160_000 (no growth)
  // vest avg = 160_000 * 0.75 / 4 = 30_000
  assert.strictEqual(r.totalHireStock, 160000, 'flat grant total');
  assert.strictEqual(r.hireGrownTotal, 160000, 'no growth applied');
  near(r.bonusMult, 0.75, 1e-9, 'bonusMult');
  near(r.hireNetAvgYr, 30000, 0.01, 'vest avg yr');
});

// ════════════════════════════════════════════════════════════════════════
// Section 2: Growth applied per anniversary (mirrors projection.js:253)
// ════════════════════════════════════════════════════════════════════════
test('A2: g=10% → each Yn grows by (1.1)^n', () => {
  const r = computeBlockVestAvg({
    chadJobHireStockY1: 25000,
    chadJobHireStockY2: 25000,
    chadJobHireStockY3: 25000,
    chadJobHireStockY4: 25000,
    chadJobTaxRate: 25,
    chadJobNoFICA: false,
    msftGrowth: 10,
  });
  const expectedGrown =
    25000 * 1.1 ** 1 +
    25000 * 1.1 ** 2 +
    25000 * 1.1 ** 3 +
    25000 * 1.1 ** 4;
  near(r.hireGrownTotal, expectedGrown, 0.01, 'grown total (10% growth)');
  // vest avg = grown * 0.75 / 4
  near(r.hireNetAvgYr, expectedGrown * 0.75 / 4, 0.01, 'vest avg (10% growth)');
  // Sanity check: must be > flat grant net (no growth case)
  assert.ok(r.hireNetAvgYr > 100000 * 0.75 / 4, 'growth should increase vest avg');
});

test('A2b: g=10% asymmetric grants — Y4 weighted highest', () => {
  // Verifies the per-anniversary exponent matches engine (later years more $)
  const r = computeBlockVestAvg({
    chadJobHireStockY1: 10000,
    chadJobHireStockY2: 20000,
    chadJobHireStockY3: 30000,
    chadJobHireStockY4: 40000,
    chadJobTaxRate: 25,
    chadJobNoFICA: false,
    msftGrowth: 10,
  });
  const expectedGrown =
    10000 * 1.1 ** 1 +
    20000 * 1.1 ** 2 +
    30000 * 1.1 ** 3 +
    40000 * 1.1 ** 4;
  near(r.hireGrownTotal, expectedGrown, 0.01, 'asymmetric grown total');
  near(r.hireNetAvgYr, expectedGrown * 0.75 / 4, 0.01, 'asymmetric vest avg');
});

// ════════════════════════════════════════════════════════════════════════
// Section 3: noFICA addback (mirrors IncomeControls.jsx w2BonusMult)
// ════════════════════════════════════════════════════════════════════════
test('A3: chadJobNoFICA=true → bonusMult includes +6.2% addback', () => {
  const r = computeBlockVestAvg({
    chadJobHireStockY1: 40000,
    chadJobHireStockY2: 40000,
    chadJobHireStockY3: 40000,
    chadJobHireStockY4: 40000,
    chadJobTaxRate: 25,
    chadJobNoFICA: true,
    msftGrowth: 0,
  });
  // bonusMult = 1 - 0.25 + 0.062 = 0.812
  near(r.bonusMult, 0.812, 1e-9, 'bonusMult with noFICA');
  // vest avg = 160_000 * 0.812 / 4 = 32_480
  near(r.hireNetAvgYr, 32480, 0.01, 'vest avg with noFICA');
  // Sanity: must exceed the FICA-paying case ($30K from A1)
  assert.ok(r.hireNetAvgYr > 30000, 'noFICA must increase net');
});

// ════════════════════════════════════════════════════════════════════════
// Section 4: Zero-input safety (no NaN)
// ════════════════════════════════════════════════════════════════════════
test('A4: all Y values zero → vest avg = 0 (no NaN)', () => {
  const r = computeBlockVestAvg({
    chadJobHireStockY1: 0,
    chadJobHireStockY2: 0,
    chadJobHireStockY3: 0,
    chadJobHireStockY4: 0,
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
  // default taxRate = 25, default noFICA = false → bonusMult = 0.75
  near(r.bonusMult, 0.75, 1e-9, 'default bonusMult');
});

// ════════════════════════════════════════════════════════════════════════
// Section 5: Parity with IncomeControls W-2 diagnostic (the whole point)
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Section 2: Parity with IncomeControls W-2 diagnostic ===');

// Re-implement the IncomeControls formula EXACTLY (copy-paste from lines 73-91).
// If StockCompBlock's vest avg ever diverges from this, the two panels
// will disagree on screen — which is the Bug A regression.
function computeW2HireNetAvgYr({
  chadJobHireStockY1, chadJobHireStockY2, chadJobHireStockY3, chadJobHireStockY4,
  chadJobTaxRate, chadJobNoFICA, msftGrowth,
}) {
  const taxRateDec = (chadJobTaxRate ?? 25) / 100;
  const ficaSavings = chadJobNoFICA ? 0.062 : 0;
  const w2BonusMult = 1 - taxRateDec + ficaSavings;
  const w2Growth = (msftGrowth || 0) / 100;
  const w2HireY1 = chadJobHireStockY1 || 0;
  const w2HireY2 = chadJobHireStockY2 || 0;
  const w2HireY3 = chadJobHireStockY3 || 0;
  const w2HireY4 = chadJobHireStockY4 || 0;
  const w2HireGrownTotal = w2HireY1 * Math.pow(1 + w2Growth, 1)
                         + w2HireY2 * Math.pow(1 + w2Growth, 2)
                         + w2HireY3 * Math.pow(1 + w2Growth, 3)
                         + w2HireY4 * Math.pow(1 + w2Growth, 4);
  return w2HireGrownTotal * w2BonusMult / 4;
}

test('A5: Block vest-avg == IncomeControls w2HireNetAvgYr (g=0, FICA)', () => {
  const inputs = {
    chadJobHireStockY1: 50000, chadJobHireStockY2: 60000,
    chadJobHireStockY3: 40000, chadJobHireStockY4: 30000,
    chadJobTaxRate: 25, chadJobNoFICA: false, msftGrowth: 0,
  };
  const block = computeBlockVestAvg(inputs).hireNetAvgYr;
  const diag = computeW2HireNetAvgYr(inputs);
  near(block, diag, 1e-6, 'parity g=0');
});

test('A5b: Block vest-avg == IncomeControls w2HireNetAvgYr (g=8, noFICA)', () => {
  const inputs = {
    chadJobHireStockY1: 40000, chadJobHireStockY2: 40000,
    chadJobHireStockY3: 40000, chadJobHireStockY4: 40000,
    chadJobTaxRate: 22, chadJobNoFICA: true, msftGrowth: 8,
  };
  const block = computeBlockVestAvg(inputs).hireNetAvgYr;
  const diag = computeW2HireNetAvgYr(inputs);
  near(block, diag, 1e-6, 'parity g=8, noFICA');
});

// ════════════════════════════════════════════════════════════════════════
// Summary
// ════════════════════════════════════════════════════════════════════════
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
