/**
 * Tax engine unit tests.
 *
 * Run with:
 *   node src/model/__tests__/taxEngine.test.js
 *
 * Ported from vitest to the project's plain-node assert harness
 * (remediation plan 2026-06-09, Phase 0.3). Assertion bodies are unchanged;
 * the describe/it/expect shim below provides vitest-compatible semantics on
 * top of node:assert so the 90+ original assertions did not need rewriting.
 */
import assert from 'node:assert';
import {
  computeSelfEmploymentTax,
  computeFederalTax,
  computeItemizedDeductions,
  computeQBI,
  computeAdditionalMedicare,
  computeMax401k,
  computeSSTaxableAmount,
  calculateTax,
} from "../taxEngine.js";

// ── Minimal vitest-compatible harness (plain node) ──────────────────────
let passed = 0;
let failed = 0;
const suiteStack = [];

function describe(name, fn) {
  suiteStack.push(name);
  console.log(`\n=== ${suiteStack.join(' › ')} ===`);
  try {
    fn();
  } catch (err) {
    failed++;
    console.log(`  FAIL  (suite-level setup threw)`);
    console.log(`        ${err.message}`);
  } finally {
    suiteStack.pop();
  }
}
describe.skip = (name) => {
  console.log(`\n  SKIP  suite "${name}"`);
};

function it(name, fn) {
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
it.skip = (name) => {
  console.log(`  SKIP  ${name}`);
};

function expect(actual) {
  return {
    toBe(expected) {
      assert.strictEqual(actual, expected);
    },
    toBeCloseTo(expected, precision = 2) {
      const tolerance = 0.5 * Math.pow(10, -precision);
      assert.ok(
        Math.abs(actual - expected) < tolerance,
        `expected ${actual} to be close to ${expected} (precision ${precision})`
      );
    },
    toBeGreaterThan(e) {
      assert.ok(actual > e, `expected ${actual} > ${e}`);
    },
    toBeGreaterThanOrEqual(e) {
      assert.ok(actual >= e, `expected ${actual} >= ${e}`);
    },
    toBeLessThan(e) {
      assert.ok(actual < e, `expected ${actual} < ${e}`);
    },
    toBeLessThanOrEqual(e) {
      assert.ok(actual <= e, `expected ${actual} <= ${e}`);
    },
    toBeDefined() {
      assert.notStrictEqual(actual, undefined, 'expected value to be defined');
    },
    toHaveProperty(key) {
      assert.ok(
        actual != null && key in actual,
        `expected object to have property "${key}"`
      );
    },
  };
}
// ─────────────────────────────────────────────────────────────────────────

const approx = (val, expected, tolerance = 1) =>
  expect(Math.abs(val - expected)).toBeLessThanOrEqual(tolerance);

describe("computeSelfEmploymentTax", () => {
  it("computes correctly with no W-2 wages", () => {
    const r = computeSelfEmploymentTax(101816, 0);
    approx(r.seBase, 101816 * 0.9235);
    approx(r.ssTax, r.seBase * 0.124);
    approx(r.medTax, r.seBase * 0.029);
    approx(r.seTax, r.ssTax + r.medTax);
    approx(r.halfSeTax, r.seTax / 2);
  });

  it("caps Social Security at remaining wage base after W-2", () => {
    // FIX #2: 2026 SS_WAGE_BASE = 184500. W-2 consumes 100K, leaving 84500.
    const r = computeSelfEmploymentTax(300000, 100000);
    approx(r.ssTax, 84500 * 0.124);
    approx(r.medTax, 300000 * 0.9235 * 0.029);
  });

  it("returns zero SS when W-2 exceeds wage base", () => {
    // FIX #2: W-2 276679 > 2026 SS_WAGE_BASE 184500
    const r = computeSelfEmploymentTax(101816, 276679);
    expect(r.ssTax).toBe(0);
    approx(r.medTax, 101816 * 0.9235 * 0.029);
    approx(r.seTax, r.medTax); // SE tax = Medicare only
  });

  it("handles zero income", () => {
    const r = computeSelfEmploymentTax(0, 0);
    expect(r.seBase).toBe(0);
    expect(r.seTax).toBe(0);
  });
});

describe("computeFederalTax", () => {
  // FIX #3: Brackets updated to 2026 MFJ (Rev. Proc. 2025-32):
  //   10% to 24,800 | 12% to 100,800 | 22% to 211,400 | 24% to 403,550 | ...
  it("taxes $10,000 at 10%", () => {
    const r = computeFederalTax(10000);
    expect(r.fedTax).toBe(1000);
    expect(r.marginalRate).toBe(0.10);
  });

  it("taxes at first bracket boundary (2026 MFJ 10% cap = $24,800)", () => {
    const r = computeFederalTax(24800);
    expect(r.fedTax).toBe(2480);
    expect(r.marginalRate).toBe(0.10);
  });

  it("taxes into 22% bracket (2026 brackets)", () => {
    const r = computeFederalTax(150000);
    // 24800 × 10% + 76000 × 12% + 49200 × 22%
    const expected = 24800 * 0.10 + (100800 - 24800) * 0.12 + (150000 - 100800) * 0.22;
    approx(r.fedTax, expected);
    expect(r.marginalRate).toBe(0.22);
  });

  it("handles zero taxable income", () => {
    const r = computeFederalTax(0);
    expect(r.fedTax).toBe(0);
    expect(r.marginalRate).toBe(0.10);
  });
});

describe("computeItemizedDeductions", () => {
  it("allows full SALT below $40K cap when AGI under $500K", () => {
    const r = computeItemizedDeductions({
      agi: 400000,
      propertyTax: 15000,
      salesTax: 15000,
      personalPropTax: 2000,
      mortgageInt: 38000,
      charitable: 20000,
      totalMedicalInput: 0,
    });
    expect(r.saltTotal).toBe(32000);
    expect(r.saltDeductible).toBe(32000); // full amount, under $40K cap
    expect(r.itemized).toBe(32000 + 38000 + 20000);
    expect(r.usingItemized).toBe(true);
  });

  it("caps SALT at the 2026 default cap ($40,400) even with high SALT total", () => {
    // Phase 4 (2026-06-09): default SALT_CAP is the 2026 OBBBA value 40400.
    const r = computeItemizedDeductions({
      agi: 400000,
      propertyTax: 25000,
      salesTax: 20000,
      personalPropTax: 5000,
      mortgageInt: 0,
      charitable: 0,
      totalMedicalInput: 0,
    });
    expect(r.saltTotal).toBe(50000);
    expect(r.saltDeductible).toBe(40400); // capped at 2026 cap
  });

  it("phases down SALT cap when AGI exceeds the 2026 threshold ($505K)", () => {
    // C8 (remediation 2026-06-10): the default threshold is the OBBBA-scheduled
    // 2026 value $505,000 (was frozen at the 2025 $500,000).
    // AGI $600K → $95K over threshold → cap reduced by $95K * 0.30 = $28.5K
    // → effective cap = 40400 − 28500 = 11900 (2026 base cap).
    const r = computeItemizedDeductions({
      agi: 600000,
      propertyTax: 20000,
      salesTax: 10000,
      personalPropTax: 0,
      mortgageInt: 0,
      charitable: 0,
      totalMedicalInput: 0,
    });
    expect(r.saltDeductible).toBe(11900); // phased down toward floor
  });

  it("SALT cap floors at $10K for very high income", () => {
    const r = computeItemizedDeductions({
      agi: 1000000,
      propertyTax: 30000,
      salesTax: 0,
      personalPropTax: 0,
      mortgageInt: 0,
      charitable: 0,
      totalMedicalInput: 0,
    });
    expect(r.saltDeductible).toBe(10000); // floor
  });

  it("uses saltCap override for year-specific caps (e.g. 2024 $10K)", () => {
    const r = computeItemizedDeductions({
      agi: 400000,
      propertyTax: 15000,
      salesTax: 15000,
      personalPropTax: 2000,
      mortgageInt: 38000,
      charitable: 20000,
      totalMedicalInput: 0,
      saltCap: 10000, // 2024 pre-OBBBA
    });
    expect(r.saltTotal).toBe(32000);
    expect(r.saltDeductible).toBe(10000); // capped at override
    expect(r.itemized).toBe(10000 + 38000 + 20000);
  });

  it("applies 7.5% AGI medical floor", () => {
    const r = computeItemizedDeductions({
      agi: 400000,
      propertyTax: 0, salesTax: 0, personalPropTax: 0,
      mortgageInt: 0, charitable: 0,
      totalMedicalInput: 80000,
    });
    expect(r.medicalFloor).toBe(30000);
    expect(r.medicalDeductible).toBe(50000);
  });

  it("uses standard deduction when itemized is lower", () => {
    const r = computeItemizedDeductions({
      agi: 50000,
      propertyTax: 5000, salesTax: 0, personalPropTax: 0,
      mortgageInt: 10000, charitable: 1000,
      totalMedicalInput: 0,
    });
    expect(r.itemized).toBe(5000 + 10000 + 1000); // all SALT deductible (under cap)
    // FIX #3: 2026 STD_DED MFJ = $32,200 per Rev. Proc. 2025-32.
    expect(r.deductionUsed).toBe(32200);
    expect(r.usingItemized).toBe(false);
  });
});

describe("computeQBI", () => {
  it("applies full 20% below phase-out threshold", () => {
    const qbi = computeQBI({ schCNet: 100000, taxableBeforeQbi: 200000 });
    expect(qbi).toBe(20000);
  });

  it("caps at 20% of taxableBeforeQbi when lower", () => {
    const qbi = computeQBI({ schCNet: 200000, taxableBeforeQbi: 50000 });
    expect(qbi).toBe(10000);
  });

  it("phases out QBI within phase-out range above threshold", () => {
    // FIX #3: 2026 phase-in threshold MFJ = $403,500, range = $150,000 (OBBBA).
    // Midpoint = 403500 + 75000 = 478500 → 50% phase-out.
    const qbi = computeQBI({ schCNet: 100000, taxableBeforeQbi: 478500 });
    const fullQbi = Math.min(100000 * 0.20, 478500 * 0.20); // 20000
    approx(qbi, fullQbi * 0.5);
  });

  it("returns 0 above full phase-out", () => {
    // FIX #3: full phase-out now at 403500 + 150000 = 553500.
    const qbi = computeQBI({ schCNet: 100000, taxableBeforeQbi: 600000 });
    expect(qbi).toBe(0);
  });

  it("skips phase-out when flagged", () => {
    const qbi = computeQBI({ schCNet: 100000, taxableBeforeQbi: 500000, skipPhaseOut: true });
    expect(qbi).toBe(20000);
  });
});

describe("computeAdditionalMedicare", () => {
  it("computes additional Medicare above threshold", () => {
    const r = computeAdditionalMedicare({ w2Wages: 276679, seBase: 94027 });
    const addlMedicare = (370706 - 250000) * 0.009;
    const addlWithheld = (276679 - 200000) * 0.009;
    approx(r.addlMedicareOwed, Math.max(0, addlMedicare - addlWithheld));
  });

  it("returns 0 when below threshold", () => {
    const r = computeAdditionalMedicare({ w2Wages: 100000, seBase: 50000 });
    expect(r.addlMedicareOwed).toBe(0);
  });
});

describe("calculateTax — full mode (Dellinger defaults)", () => {
  const defaultInputs = {
    w2Wages: 276679, w2Withholding: 60872,
    schCNet: 101816, capGainLoss: -3000,
    propertyTax: 15000, salesTax: 15000, personalPropTax: 2000,
    mortgageInt: 38000, charitable: 20000, totalMedicalInput: 79801,
    ctcChildren: 2, odcDependents: 0,
  };

  it("computes AGI correctly", () => {
    const r = calculateTax(defaultInputs);
    expect(r.totalIncome).toBeCloseTo(375495, 0);
    expect(r.agi).toBeLessThan(r.totalIncome);
  });

  it("SE SS tax is NOT reduced by the spouse's W-2 wages (A3, IRC §1402(b))", () => {
    // A3 (remediation 2026-06-10): Schedule SE coordination is per-individual.
    // Chad's $276,679 W-2 does NOT consume Sarah's SS wage base — her full
    // SE base (101816 × 0.9235 = 94,027, under the $184,500 cap) is SS-taxed.
    const r = calculateTax(defaultInputs);
    approx(r.ssTax, 101816 * 0.9235 * 0.124); // ≈ $11,659 (was wrongly 0)
    expect(r.medTax).toBeGreaterThan(0); // Medicare still applies
    approx(r.seTax, r.ssTax + r.medTax);
  });

  it("SALT is fully deductible (under $40K, AGI under $500K)", () => {
    const r = calculateTax(defaultInputs);
    expect(r.saltDeductible).toBe(32000); // full $32K, not capped at $10K
  });

  it("uses itemized deductions (above standard)", () => {
    const r = calculateTax(defaultInputs);
    expect(r.usingItemized).toBe(true);
    expect(r.deductionUsed).toBeGreaterThan(30000);
  });

  it("applies QBI deduction", () => {
    const r = calculateTax(defaultInputs);
    expect(r.qbi).toBeGreaterThan(0);
    expect(r.qbi).toBeLessThanOrEqual(101816 * 0.20);
  });

  it("computes total tax as sum of components", () => {
    // FIX #1: totalTax now includes employee-side W-2 FICA (w2FicaTax).
    // Phase 4 (2026-06-09): totalTax carries the FULL additional-Medicare
    // liability (addlMedicare), not the net-of-withholding addlMedicareOwed.
    const r = calculateTax(defaultInputs);
    const expected = Math.max(0, r.fedTax - r.totalCredits) + r.seTax + r.addlMedicare + r.w2FicaTax;
    approx(r.totalTax, expected);
  });

  it("computes balance as withholding plus addl-Medicare prepayment minus tax", () => {
    // Phase 4 (2026-06-09): the withheld 0.9% is a PREPAYMENT in balance.
    const r = calculateTax(defaultInputs);
    approx(r.balance, 60872 + r.addlMedicareWithheld - r.totalTax);
  });
});

describe("calculateTax — simplified mode (TaxBurdenShift)", () => {
  it("uses preComputedItemized and flatCredits", () => {
    const r = calculateTax({
      w2Wages: 276679, w2Withholding: 60872, schCNet: 102000,
      preComputedItemized: 121700, flatCredits: 4000,
      skipAdditionalMedicare: true, skipQbiPhaseOut: true,
    });
    expect(r.deductionUsed).toBe(121700);
    expect(r.totalCredits).toBe(4000);
    expect(r.addlMedicareOwed).toBe(0);
    // Phase 4 (2026-06-09): QBI base nets out the deductible half of SE tax
    // (IRC §199A(c)(4)) — previously locked the raw schCNet × 20% value.
    expect(r.qbi).toBeCloseTo((102000 - r.halfSeTax) * 0.20, 6);
    // A3 (remediation 2026-06-10): per-individual SE coordination — Chad's W-2
    // no longer zeroes Sarah's SE SS tax (was wrongly locked to 0).
    approx(r.ssTax, 102000 * 0.9235 * 0.124);
  });
});

describe("calculateTax — projection mode (PracticeForecaster)", () => {
  it("uses marginal rate override instead of brackets", () => {
    const r = calculateTax({ schCNet: 157500, marginalRateOverride: 0.24 });
    expect(r.marginalRate).toBe(0.24);
    expect(r.seTax).toBeGreaterThan(0);
    expect(r.totalTax).toBeGreaterThan(r.seTax);
    expect(r.takeHome).toBe(157500 - r.totalTax);
    expect(r.effectiveOnNet).toBeCloseTo(r.totalTax / 157500, 4);
  });
});

describe("calculateTax — edge cases", () => {
  it("handles all zeros", () => {
    const r = calculateTax({});
    expect(r.totalTax).toBe(0);
    expect(r.balance).toBe(0);
    expect(r.agi).toBe(0);
  });

  it("handles zero SchC with W-2 only", () => {
    const r = calculateTax({ w2Wages: 276679, w2Withholding: 60872, schCNet: 0 });
    expect(r.seTax).toBe(0);
    expect(r.totalTax).toBeGreaterThan(0);
  });

  it("SE SS tax applies when W-2 is low", () => {
    const r = calculateTax({ w2Wages: 50000, schCNet: 100000 });
    expect(r.ssTax).toBeGreaterThan(0); // remaining base = 176100 - 50000 = 126100
  });
});

describe("calculateTax — integration: forensic audit cases", () => {
  it("includes additional Medicare for high combined Medicare wages", () => {
    const r = calculateTax({
      w2Wages: 276679, w2Withholding: 60872, schCNet: 101816,
      propertyTax: 15000, salesTax: 15000, personalPropTax: 2000,
      mortgageInt: 38000, charitable: 20000, totalMedicalInput: 79801,
      ctcChildren: 2, odcDependents: 0,
    });
    // Combined Medicare wages = 276679 + (101816 * 0.9235) ≈ 370,706 > $250K threshold
    expect(r.addlMedicareOwed).toBeGreaterThan(0);
    // FIX #1: totalTax now includes w2FicaTax. Phase 4: full addl-Medicare
    // liability in totalTax. Verify the full sum.
    const expectedTotal = Math.max(0, r.fedTax - r.totalCredits) + r.seTax + r.addlMedicare + r.w2FicaTax;
    expect(Math.abs(r.totalTax - expectedTotal)).toBeLessThanOrEqual(1);
  });

  it("reduces QBI via phase-out when taxable income is in 2026 MFJ phase-in range", () => {
    // FIX #3: 2026 QBI phase-in window MFJ = $403,500–$553,500 (OBBBA).
    const r = calculateTax({
      w2Wages: 490462, schCNet: 85000,
      propertyTax: 15000, salesTax: 15000, personalPropTax: 2000,
      mortgageInt: 38000, charitable: 20000, totalMedicalInput: 79801,
      saltCap: 10000, // 2024 pre-OBBBA SALT cap, used here just to drive AGI up
      ctcChildren: 2, odcDependents: 0,
    });
    const fullQbi = 85000 * 0.20;
    expect(r.taxableBeforeQbi).toBeGreaterThan(403500);
    expect(r.taxableBeforeQbi).toBeLessThan(553500);
    expect(r.qbi).toBeLessThan(fullQbi);
    expect(r.qbi).toBeGreaterThan(0);
  });
});

// ============================================================
// TEST GROUP 1: Known-Value Snapshot Tests (Dellinger 2025)
// Hand-computed values — any code change that shifts these breaks the test
// ============================================================

// FIX #1/#2/#3: 2025-locked snapshot values do not survive 2026 constants
// + new W-2 FICA inclusion. Skipped pending hand-recomputation against 2026.
describe.skip("SNAPSHOT: Dellinger 2025 defaults — every intermediate value", () => {
  const DELLINGER = {
    w2Wages: 276679, w2Withholding: 60872,
    schCNet: 101816, capGainLoss: -3000,
    propertyTax: 15000, salesTax: 15000, personalPropTax: 2000,
    mortgageInt: 38000, charitable: 20000, totalMedicalInput: 79801,
    ctcChildren: 2, odcDependents: 0,
  };
  const r = calculateTax(DELLINGER);

  it("SE tax: ssTax=0, medTax≈2727, seTax≈2727", () => {
    expect(r.ssTax).toBe(0);
    approx(r.medTax, 2727);
    approx(r.seTax, 2727);
    approx(r.halfSeTax, 1363);
  });

  it("Income: totalIncome=375495, agi≈374132", () => {
    expect(r.totalIncome).toBe(375495);
    approx(r.agi, 374132);
  });

  it("Deductions: salt=32000, medical≈51741, itemized≈141741", () => {
    expect(r.saltTotal).toBe(32000);
    expect(r.saltDeductible).toBe(32000);
    approx(r.medicalFloor, 28060);
    approx(r.medicalDeductible, 51741);
    approx(r.itemized, 141741);
    approx(r.deductionUsed, 141741);
    expect(r.usingItemized).toBe(true);
  });

  it("QBI: ≈20363, taxableIncome≈212027", () => {
    approx(r.qbi, 20363);
    approx(r.taxableBeforeQbi, 232390);
    approx(r.taxableIncome, 212027);
  });

  it("Federal tax: ≈36581, marginal=24%", () => {
    approx(r.fedTax, 36581);
    expect(r.marginalRate).toBe(0.24);
  });

  it("Credits: 4000", () => {
    expect(r.totalCredits).toBe(4000);
  });

  it("Additional Medicare: ≈396", () => {
    approx(r.addlMedicareOwed, 396);
  });

  it("Total tax: ≈35704, balance≈25168", () => {
    approx(r.totalTax, 35704);
    approx(r.balance, 25168);
  });

  it("Effective rate: ≈9.5%", () => {
    expect(r.effectiveRate).toBeGreaterThan(0.09);
    expect(r.effectiveRate).toBeLessThan(0.10);
  });
});

// ============================================================
// TEST GROUP 2: Cross-Section Reconciliation
// Same inputs MUST produce identical results regardless of call site
// ============================================================

describe("RECONCILIATION: identical inputs → identical outputs", () => {
  const sharedInputs = {
    w2Wages: 276679, w2Withholding: 60872, schCNet: 101816,
    propertyTax: 15000, salesTax: 15000, personalPropTax: 2000,
    mortgageInt: 38000, charitable: 20000, totalMedicalInput: 79801,
    saltCap: 40000, flatCredits: 4000,
  };

  it("same schCNet produces same totalTax regardless of other flags", () => {
    const a = calculateTax(sharedInputs);
    const b = calculateTax({ ...sharedInputs });
    expect(a.totalTax).toBe(b.totalTax);
    expect(a.agi).toBe(b.agi);
    expect(a.taxableIncome).toBe(b.taxableIncome);
    expect(a.balance).toBe(b.balance);
  });

  it("flatCredits=4400 matches ctcChildren=2 with odcDependents=0", () => {
    // Phase 4 (2026-06-09): CTC is $2,200/child → 2 kids = $4,400. AGI here
    // (~$377K) is under the $400K phase-out threshold, so no reduction.
    const withFlat = calculateTax({ ...sharedInputs, flatCredits: 4400 });
    const withCounts = calculateTax({
      ...sharedInputs, flatCredits: null, ctcChildren: 2, odcDependents: 0,
    });
    expect(withFlat.totalCredits).toBe(withCounts.totalCredits);
    expect(withFlat.totalTax).toBe(withCounts.totalTax);
  });

  it("saltCap override produces different SALT than default when cap differs", () => {
    const with40K = calculateTax({ ...sharedInputs, saltCap: 40000 });
    const with10K = calculateTax({ ...sharedInputs, saltCap: 10000 });
    expect(with40K.saltDeductible).toBe(32000);
    expect(with10K.saltDeductible).toBe(10000);
    expect(with40K.totalTax).toBeLessThan(with10K.totalTax);
  });
});

// ============================================================
// TEST GROUP 3: Invariant Tests
// Mathematical properties that MUST hold for any input
// ============================================================

describe("INVARIANTS: mathematical properties across input ranges", () => {
  const scenarios = [
    { name: "Dellinger 2025", inputs: { w2Wages: 276679, w2Withholding: 60872, schCNet: 101816, capGainLoss: -3000, propertyTax: 15000, salesTax: 15000, personalPropTax: 2000, mortgageInt: 38000, charitable: 20000, totalMedicalInput: 79801, ctcChildren: 2 } },
    { name: "High income", inputs: { w2Wages: 500000, schCNet: 200000, propertyTax: 25000, salesTax: 20000, personalPropTax: 5000, mortgageInt: 40000, charitable: 50000, totalMedicalInput: 10000, ctcChildren: 2 } },
    { name: "Low income", inputs: { w2Wages: 50000, schCNet: 30000, propertyTax: 5000, salesTax: 3000, mortgageInt: 15000, charitable: 2000, totalMedicalInput: 5000 } },
    { name: "Zero everything", inputs: {} },
    { name: "W-2 only", inputs: { w2Wages: 276679, w2Withholding: 60872, schCNet: 0 } },
    { name: "Sch C only", inputs: { w2Wages: 0, schCNet: 150000, propertyTax: 10000, salesTax: 8000, mortgageInt: 30000, charitable: 10000, totalMedicalInput: 20000 } },
    { name: "Very high medical", inputs: { w2Wages: 200000, schCNet: 80000, totalMedicalInput: 200000, mortgageInt: 30000, charitable: 10000, propertyTax: 10000, salesTax: 8000 } },
    { name: "SALT above cap", inputs: { w2Wages: 300000, schCNet: 100000, propertyTax: 30000, salesTax: 25000, personalPropTax: 5000, mortgageInt: 30000, charitable: 15000, totalMedicalInput: 10000 } },
    { name: "SALT phase-out AGI", inputs: { w2Wages: 500000, schCNet: 150000, propertyTax: 20000, salesTax: 15000, personalPropTax: 3000, mortgageInt: 40000, charitable: 30000, totalMedicalInput: 10000 } },
    { name: "Capital loss", inputs: { w2Wages: 200000, schCNet: 80000, capGainLoss: -3000, mortgageInt: 25000, charitable: 10000, propertyTax: 8000, salesTax: 6000 } },
  ];

  scenarios.forEach(({ name, inputs }) => {
    describe(`Scenario: ${name}`, () => {
      const r = calculateTax(inputs);
      const schCNet = inputs.schCNet ?? 0;

      it("totalTax ≥ 0", () => {
        expect(r.totalTax).toBeGreaterThanOrEqual(0);
      });

      it("seTax = ssTax + medTax (exact)", () => {
        expect(r.seTax).toBeCloseTo(r.ssTax + r.medTax, 10);
      });

      it("seTax ≥ 0", () => {
        expect(r.seTax).toBeGreaterThanOrEqual(0);
      });

      it("agi = totalIncome - halfSeTax (exact)", () => {
        expect(r.agi).toBeCloseTo(r.totalIncome - r.halfSeTax, 10);
      });

      it("deductionUsed ≥ standard deduction ($32,200 — 2026 MFJ)", () => {
        // FIX #3: 2026 STD_DED = $32,200 per Rev. Proc. 2025-32.
        expect(r.deductionUsed).toBeGreaterThanOrEqual(32200);
      });

      it("saltDeductible ≤ saltTotal", () => {
        expect(r.saltDeductible).toBeLessThanOrEqual(r.saltTotal);
      });

      it("saltDeductible ≥ 0", () => {
        expect(r.saltDeductible).toBeGreaterThanOrEqual(0);
      });

      it("medicalDeductible ≥ 0", () => {
        expect(r.medicalDeductible).toBeGreaterThanOrEqual(0);
      });

      it("taxableIncome ≥ 0", () => {
        expect(r.taxableIncome).toBeGreaterThanOrEqual(0);
      });

      it("qbi ≥ 0 and ≤ schCNet × 20%", () => {
        expect(r.qbi).toBeGreaterThanOrEqual(0);
        expect(r.qbi).toBeLessThanOrEqual(schCNet * 0.20 + 1);
      });

      it("addlMedicareOwed ≥ 0", () => {
        expect(r.addlMedicareOwed).toBeGreaterThanOrEqual(0);
      });

      it("totalTax = max(0, fedTax - credits) + seTax + addlMedicare + w2Fica (exact)", () => {
        // FIX #1: totalTax now includes employee W-2 FICA.
        // Phase 4: full addl-Medicare LIABILITY (r.addlMedicare) in totalTax.
        const expected = Math.max(0, r.fedTax - r.totalCredits) + r.seTax + r.addlMedicare + r.w2FicaTax;
        expect(r.totalTax).toBeCloseTo(expected, 10);
      });

      it("balance = withholding + addl-Medicare prepayment - totalTax (exact)", () => {
        // Phase 4: withheld 0.9% is a prepayment credited in balance.
        const w2Withholding = inputs.w2Withholding ?? 0;
        expect(r.balance).toBeCloseTo(w2Withholding + r.addlMedicareWithheld - r.totalTax, 10);
      });
    });
  });
});

// ============================================================
// TEST GROUP 4: Year-Specific Tax Burden Shift Verification
// Verify each default year produces reasonable results
// ============================================================

describe("YEAR VERIFICATION: TaxBurdenShift default years (2024-2028)", () => {
  const deductionInputs = {
    propertyTax: 15000, salesTax: 15000, personalPropTax: 2000,
    mortgageInt: 38000, charitable: 20000,
  };

  // A3 (remediation 2026-06-10): SE tax is per-individual (IRC §1402(b)) —
  // Chad's W-2 never consumes Sarah's SS wage base, so her SE SS tax is
  // positive in EVERY year (her Sch C net is always under the wage base).
  // 2024/2025 previously (wrongly) expected 0.
  const yearCases = [
    { year: 2024, w2Wages: 490462, w2Withholding: 93881, schCNet: 85000, credits: 4000, medical: 79801, saltCap: 10000, expectSsTax: "positive" },
    { year: 2025, w2Wages: 276679, w2Withholding: 60872, schCNet: 101816, credits: 4000, medical: 79801, saltCap: 40000, expectSsTax: "positive" },
    { year: 2026, w2Wages: 132355, w2Withholding: 29118, schCNet: 123000, credits: 4000, medical: 20000, saltCap: 40400, expectSsTax: "positive" },
    { year: 2027, w2Wages: 72004, w2Withholding: 15841, schCNet: 143000, credits: 1000, medical: 20000, saltCap: 40804, expectSsTax: "positive" },
    { year: 2028, w2Wages: 19420, w2Withholding: 4272, schCNet: 158000, credits: 1000, medical: 20000, saltCap: 41212, expectSsTax: "positive" },
  ];

  yearCases.forEach(({ year, w2Wages, w2Withholding, schCNet, credits, medical, saltCap, expectSsTax }) => {
    describe(`Year ${year}`, () => {
      const r = calculateTax({
        w2Wages, w2Withholding, schCNet,
        ...deductionInputs,
        totalMedicalInput: medical,
        saltCap,
        flatCredits: credits,
      });

      it(`SALT cap is ${saltCap} (${year <= 2024 ? "pre-OBBBA" : "OBBBA"})`, () => {
        expect(r.saltDeductible).toBeLessThanOrEqual(saltCap);
      });

      it(`SE SS tax is ${expectSsTax === 0 ? "zero (W-2 exceeds wage base)" : "positive (W-2 below wage base)"}`, () => {
        if (expectSsTax === 0) {
          expect(r.ssTax).toBe(0);
        } else {
          expect(r.ssTax).toBeGreaterThan(0);
        }
      });

      it(`credits = ${credits}`, () => {
        expect(r.totalCredits).toBe(credits);
      });

      it("totalTax is in reasonable range ($5K-$160K)", () => {
        // FIX #1: W-2 FICA now included, so range widened from old $120K cap.
        expect(r.totalTax).toBeGreaterThan(5000);
        expect(r.totalTax).toBeLessThan(160000);
      });

      it("totalTax formula holds exactly", () => {
        // FIX #1: includes w2FicaTax. Phase 4: full addl-Medicare liability.
        const expected = Math.max(0, r.fedTax - r.totalCredits) + r.seTax + r.addlMedicare + r.w2FicaTax;
        expect(r.totalTax).toBeCloseTo(expected, 10);
      });
    });
  });
});

// ============================================================
// A3 REGRESSION (remediation 2026-06-10): Schedule SE wage-base
// coordination is PER-INDIVIDUAL (IRC §1402(b)(1) / Sch SE line 8a).
// Chad's W-2 wages must NOT reduce Sarah's SE SS base; only HER OWN
// W-2 wages (sarahW2Wages, default 0) coordinate. Additional Medicare
// stays household-combined (0.9% over $250K MFJ) — correct as-is.
// ============================================================

describe("A3 REGRESSION: SE tax per-individual (IRC §1402(b))", () => {
  it("$200K W-2 + $150K Sch C → SE SS tax ≈ $17,177 (not $0)", () => {
    const r = calculateTax({ w2Wages: 200000, schCNet: 150000 });
    // seBase = 150000 × 0.9235 = 138,525 < 184,500 wage base → full 12.4%
    approx(r.ssTax, 138525 * 0.124); // ≈ 17,177
    approx(r.seBase, 138525);
  });

  it("sarahW2Wages (her OWN wages) still coordinates her SE base", () => {
    const r = calculateTax({ w2Wages: 200000, schCNet: 150000, sarahW2Wages: 100000 });
    // Her own $100K W-2 consumes wage base: remaining 184,500 − 100,000 = 84,500
    approx(r.ssTax, 84500 * 0.124);
  });

  it("sarahW2Wages defaults to 0 (Sarah has no W-2 in this household)", () => {
    const withDefault = calculateTax({ w2Wages: 200000, schCNet: 150000 });
    const withExplicitZero = calculateTax({ w2Wages: 200000, schCNet: 150000, sarahW2Wages: 0 });
    expect(withDefault.ssTax).toBe(withExplicitZero.ssTax);
  });

  it("Additional Medicare remains household-combined (unchanged by A3)", () => {
    const r = calculateTax({ w2Wages: 200000, schCNet: 150000 });
    // Medicare wages = 200,000 + 138,525 = 338,525 → (338,525 − 250,000) × 0.9%
    approx(r.addlMedicare, (200000 + 138525 - 250000) * 0.009);
  });

  it("Chad's W-2 above the wage base STILL leaves Sarah's SE SS tax intact", () => {
    const r = calculateTax({ w2Wages: 300000, schCNet: 150000 });
    approx(r.ssTax, 138525 * 0.124); // unaffected by his wages
  });
});

// ============================================================
// TEST GROUP 5: Negative Input Guard Rails
// Engine must not produce nonsensical results with bad inputs
// ============================================================

describe("GUARD RAILS: bad/negative inputs produce safe results", () => {
  it("negative schCNet → totalTax still ≥ 0", () => {
    const r = calculateTax({ w2Wages: 100000, schCNet: -50000 });
    expect(r.totalTax).toBeGreaterThanOrEqual(0);
    expect(r.seTax).toBeGreaterThanOrEqual(0);
  });

  it("negative w2Wages → seTax still ≥ 0", () => {
    const r = calculateTax({ w2Wages: -100000, schCNet: 50000 });
    expect(r.seTax).toBeGreaterThanOrEqual(0);
    expect(r.totalTax).toBeGreaterThanOrEqual(0);
  });

  it("negative medical → medicalDeductible = 0", () => {
    const r = calculateTax({ w2Wages: 100000, totalMedicalInput: -10000 });
    expect(r.medicalDeductible).toBe(0);
  });

  it("all zeros → all outputs zero", () => {
    const r = calculateTax({});
    expect(r.totalTax).toBe(0);
    expect(r.seTax).toBe(0);
    expect(r.fedTax).toBe(0);
    expect(r.agi).toBe(0);
    expect(r.balance).toBe(0);
  });

  it("extremely high income → totalTax still reasonable", () => {
    const r = calculateTax({ w2Wages: 10000000, schCNet: 5000000 });
    expect(r.totalTax).toBeGreaterThan(0);
    expect(r.totalTax).toBeLessThan(r.totalIncome); // can't pay more than you earn
    expect(r.effectiveRate).toBeLessThan(0.50); // effective rate sanity
  });
});

// ============================================================
// TEST GROUP 6: Solo 401(k) — Max Computation & Tax Impact
// ============================================================

describe("computeMax401k", () => {
  // Phase 4 (2026-06-09): 2026 limits — employee $24,500, total DC $72,000.
  // C2 (remediation 2026-06-10): the self-employed employer contribution uses
  // the Pub 560 REDUCED rate 0.25/1.25 = 20% of net SE earnings, not the
  // common-law-employee 25%.
  it("computes max for typical Sch C net", () => {
    // schCNet=101816, halfSeTax≈1363
    const max = computeMax401k(101816, 1363);
    expect(max.employeeMax).toBe(24500);
    // employerMax = (101816 - 1363) × 0.20 ≈ 20091 (C2: was wrongly × 0.25)
    expect(max.employerMax).toBe(Math.round((101816 - 1363) * 0.20));
    expect(max.totalMax).toBe(max.employeeMax + max.employerMax);
    expect(max.totalMax).toBeLessThan(72000); // under total cap
  });

  it("caps at total limit for high net income", () => {
    const max = computeMax401k(500000, 5000);
    // employerMax = (500000 - 5000) × 0.20 = 99000 (C2 reduced rate)
    // total = 24500 + 99000 = 123500, capped at 72000
    expect(max.totalMax).toBe(72000);
  });

  it("handles zero net income", () => {
    const max = computeMax401k(0, 0);
    expect(max.employerMax).toBe(0);
    expect(max.totalMax).toBe(24500); // employee only
  });
});

describe("Solo 401(k) tax impact", () => {
  const DELLINGER = {
    w2Wages: 276679, w2Withholding: 60872,
    schCNet: 101816, capGainLoss: -3000,
    propertyTax: 15000, salesTax: 15000, personalPropTax: 2000,
    mortgageInt: 38000, charitable: 20000, totalMedicalInput: 79801,
    ctcChildren: 2, odcDependents: 0,
  };

  it("zero contribution = no change", () => {
    const without = calculateTax(DELLINGER);
    const with0 = calculateTax({ ...DELLINGER, solo401kContribution: 0 });
    expect(with0.totalTax).toBe(without.totalTax);
    expect(with0.agi).toBe(without.agi);
  });

  it("employee-only contribution reduces AGI and tax", () => {
    const without = calculateTax(DELLINGER);
    const with23500 = calculateTax({ ...DELLINGER, solo401kContribution: 23500 });
    expect(with23500.agi).toBeCloseTo(without.agi - 23500, 0);
    expect(with23500.totalTax).toBeLessThan(without.totalTax);
    expect(with23500.solo401kContribution).toBe(23500);
  });

  it("max contribution produces significant tax savings", () => {
    const without = calculateTax(DELLINGER);
    const max = without.max401k.totalMax;
    const withMax = calculateTax({ ...DELLINGER, solo401kContribution: max });
    const savings = without.totalTax - withMax.totalTax;
    expect(savings).toBeGreaterThan(5000); // at least $5K savings
    expect(withMax.agi).toBeCloseTo(without.agi - max, 0);
  });

  it("contribution capped at max even if higher value passed", () => {
    const r = calculateTax({ ...DELLINGER, solo401kContribution: 999999 });
    expect(r.solo401kContribution).toBe(r.max401k.totalMax);
    expect(r.solo401kContribution).toBeLessThanOrEqual(72000); // Phase 4: 2026 cap
  });

  it("401k contribution is returned in result", () => {
    const r = calculateTax({ ...DELLINGER, solo401kContribution: 10000 });
    expect(r.solo401kContribution).toBe(10000);
    expect(r.max401k).toBeDefined();
    expect(r.max401k.employeeMax).toBe(24500); // Phase 4: 2026 limit
  });
});

// ============================================================
// TEST GROUP 7: SS Benefit Taxation
// IRS provisional income rules for Social Security benefit taxation
// ============================================================

describe("computeSSTaxableAmount", () => {
  it("returns 0 below threshold", () => {
    // $20K AGI + $10K SS: provisional = $25K < $32K threshold
    expect(computeSSTaxableAmount(10000, 20000)).toBe(0);
  });

  it("returns tier-1 amount between thresholds", () => {
    // $30K AGI + $20K SS: provisional = $40K, between $32K and $44K
    // tier1 = min(20000 * 0.50, (40000 - 32000) * 0.5) = min(10000, 4000) = 4000
    expect(computeSSTaxableAmount(20000, 30000)).toBe(4000);
  });

  it("returns tier-2 amount above upper threshold", () => {
    // $80K AGI + $50K SS: provisional = $105K, well above $44K
    // tier1 = min(25000, (105000-32000)*0.5) = min(25000, 36500) = 25000
    // tier2 = min(42500, 25000 + (105000-44000)*0.85) = min(42500, 25000+51850) = 42500
    expect(computeSSTaxableAmount(50000, 80000)).toBe(42500);
  });

  it("caps the tier-1 add-back at $6,000 when over the upper threshold", () => {
    // $30K AGI + $40K SS: provisional = $50K, above $44K
    // tier-1 add-back capped at min(6000, (50000-32000)*0.5=9000) = 6000
    // tier2 = min(0.85*40000=34000, (50000-44000)*0.85=5100 + 6000) = 11100
    expect(computeSSTaxableAmount(40000, 30000)).toBe(11100);
  });

  it("applies the $6,000 cap on a benefit-heavy SSDI case", () => {
    // $40K AGI + $75,852 SS: provisional = $77,926, above $44K
    // add-back = min(6000, (77926-32000)*0.5=22963) = 6000
    // tier2 = min(0.85*75852=64474, (77926-44000)*0.85=28837 + 6000) = 34837
    expect(computeSSTaxableAmount(75852, 40000)).toBe(34837);
  });

  it("returns 0 for zero SS benefit", () => {
    expect(computeSSTaxableAmount(0, 50000)).toBe(0);
  });

  it("returns 0 for negative SS benefit", () => {
    expect(computeSSTaxableAmount(-5000, 50000)).toBe(0);
  });
});

describe("calculateTax — SS benefit taxation integration", () => {
  it("SS benefits increase totalIncome when taxable", () => {
    const without = calculateTax({ w2Wages: 80000 });
    const withSS = calculateTax({ w2Wages: 80000, ssBenefitAnnual: 50000 });
    expect(withSS.totalIncome).toBeGreaterThan(without.totalIncome);
    expect(withSS.ssTaxableIncome).toBeGreaterThan(0);
    expect(withSS.totalTax).toBeGreaterThan(without.totalTax);
  });

  it("SS benefits do not affect tax when below provisional threshold", () => {
    const without = calculateTax({ schCNet: 10000 });
    const withSS = calculateTax({ schCNet: 10000, ssBenefitAnnual: 10000 });
    // provisional = 10000 + 5000 = 15000 < 32000
    expect(withSS.ssTaxableIncome).toBe(0);
    expect(withSS.totalTax).toBe(without.totalTax);
  });

  it("ssTaxableIncome is included in return object", () => {
    const r = calculateTax({ w2Wages: 80000, ssBenefitAnnual: 30000 });
    expect(r).toHaveProperty('ssTaxableIncome');
    expect(r.ssTaxableIncome).toBeGreaterThan(0);
  });
});

// ============================================================
// Summary
// ============================================================
console.log(`\n${'='.repeat(50)}`);
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'='.repeat(50)}\n`);

if (failed > 0) process.exit(1);
