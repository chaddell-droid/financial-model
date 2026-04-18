import { describe, it, expect } from "vitest";
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
    // W-2 consumes 100K of 176100 base, leaving 76100
    const r = computeSelfEmploymentTax(300000, 100000);
    approx(r.ssTax, 76100 * 0.124);
    approx(r.medTax, 300000 * 0.9235 * 0.029);
  });

  it("returns zero SS when W-2 exceeds wage base", () => {
    const r = computeSelfEmploymentTax(101816, 276679); // W-2 > 176100
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
  it("taxes $10,000 at 10%", () => {
    const r = computeFederalTax(10000);
    expect(r.fedTax).toBe(1000);
    expect(r.marginalRate).toBe(0.10);
  });

  it("taxes at second bracket boundary", () => {
    const r = computeFederalTax(23850);
    expect(r.fedTax).toBe(2385);
    expect(r.marginalRate).toBe(0.10);
  });

  it("taxes into 22% bracket", () => {
    const r = computeFederalTax(150000);
    const expected = 2385 + 8772 + 11671;
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

  it("caps SALT at $40K even with high SALT total", () => {
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
    expect(r.saltDeductible).toBe(40000); // capped at $40K
  });

  it("phases down SALT cap when AGI exceeds $500K", () => {
    // AGI $600K → $100K over threshold → cap reduced by $100K * 0.30 = $30K → cap = $10K
    const r = computeItemizedDeductions({
      agi: 600000,
      propertyTax: 20000,
      salesTax: 10000,
      personalPropTax: 0,
      mortgageInt: 0,
      charitable: 0,
      totalMedicalInput: 0,
    });
    expect(r.saltDeductible).toBe(10000); // phased down to floor
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
    expect(r.deductionUsed).toBe(30000); // standard is higher
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

  it("phases out QBI within $100K range above threshold", () => {
    // At $444,600 (midpoint of $394,600-$494,600), 50% phase-out
    const qbi = computeQBI({ schCNet: 100000, taxableBeforeQbi: 444600 });
    const fullQbi = Math.min(100000 * 0.20, 444600 * 0.20); // 20000
    approx(qbi, fullQbi * 0.5); // 50% remaining
  });

  it("returns 0 above full phase-out", () => {
    const qbi = computeQBI({ schCNet: 100000, taxableBeforeQbi: 500000 });
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

  it("SE SS tax is zero because W-2 exceeds wage base", () => {
    const r = calculateTax(defaultInputs);
    expect(r.ssTax).toBe(0); // W-2 276679 > SS_WAGE_BASE 176100
    expect(r.medTax).toBeGreaterThan(0); // Medicare still applies
    approx(r.seTax, r.medTax); // SE tax = Medicare only
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
    const r = calculateTax(defaultInputs);
    const expected = Math.max(0, r.fedTax - r.totalCredits) + r.seTax + r.addlMedicareOwed;
    approx(r.totalTax, expected);
  });

  it("computes balance as withholding minus tax", () => {
    const r = calculateTax(defaultInputs);
    approx(r.balance, 60872 - r.totalTax);
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
    expect(r.qbi).toBe(102000 * 0.20);
    expect(r.ssTax).toBe(0); // W-2 exceeds wage base
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
    // Verify it's included in total tax
    const expectedTotal = Math.max(0, r.fedTax - r.totalCredits) + r.seTax + r.addlMedicareOwed;
    expect(Math.abs(r.totalTax - expectedTotal)).toBeLessThanOrEqual(1);
  });

  it("reduces QBI via phase-out when taxable income is in $394K-$494K range", () => {
    // 2024-like scenario: high W-2 pushes taxable into QBI phase-out
    const r = calculateTax({
      w2Wages: 490462, schCNet: 85000,
      propertyTax: 15000, salesTax: 15000, personalPropTax: 2000,
      mortgageInt: 38000, charitable: 20000, totalMedicalInput: 79801,
      saltCap: 10000, // 2024 pre-OBBBA
      ctcChildren: 2, odcDependents: 0,
    });
    const fullQbi = 85000 * 0.20; // $17,000
    // Taxable income should be in the $394K-$494K phase-out range
    expect(r.taxableBeforeQbi).toBeGreaterThan(394600);
    expect(r.taxableBeforeQbi).toBeLessThan(494600);
    // QBI should be reduced but not zero
    expect(r.qbi).toBeLessThan(fullQbi);
    expect(r.qbi).toBeGreaterThan(0);
  });
});

// ============================================================
// TEST GROUP 1: Known-Value Snapshot Tests (Dellinger 2025)
// Hand-computed values — any code change that shifts these breaks the test
// ============================================================

describe("SNAPSHOT: Dellinger 2025 defaults — every intermediate value", () => {
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

  it("flatCredits=4000 matches ctcChildren=2 with odcDependents=0", () => {
    const withFlat = calculateTax(sharedInputs);
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

      it("deductionUsed ≥ standard deduction ($30,000)", () => {
        expect(r.deductionUsed).toBeGreaterThanOrEqual(30000);
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

      it("totalTax = max(0, fedTax - credits) + seTax + addlMedicare (exact)", () => {
        const expected = Math.max(0, r.fedTax - r.totalCredits) + r.seTax + r.addlMedicareOwed;
        expect(r.totalTax).toBeCloseTo(expected, 10);
      });

      it("balance = withholding - totalTax (exact)", () => {
        const w2Withholding = inputs.w2Withholding ?? 0;
        expect(r.balance).toBeCloseTo(w2Withholding - r.totalTax, 10);
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

  const yearCases = [
    { year: 2024, w2Wages: 490462, w2Withholding: 93881, schCNet: 85000, credits: 4000, medical: 79801, saltCap: 10000, expectSsTax: 0 },
    { year: 2025, w2Wages: 276679, w2Withholding: 60872, schCNet: 101816, credits: 4000, medical: 79801, saltCap: 40000, expectSsTax: 0 },
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

      it("totalTax is in reasonable range ($5K-$120K)", () => {
        expect(r.totalTax).toBeGreaterThan(5000);
        expect(r.totalTax).toBeLessThan(120000);
      });

      it("totalTax formula holds exactly", () => {
        const expected = Math.max(0, r.fedTax - r.totalCredits) + r.seTax + r.addlMedicareOwed;
        expect(r.totalTax).toBeCloseTo(expected, 10);
      });
    });
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
  it("computes max for typical Sch C net", () => {
    // schCNet=101816, halfSeTax≈1363
    const max = computeMax401k(101816, 1363);
    expect(max.employeeMax).toBe(23500);
    // employerMax = (101816 - 1363) × 0.25 ≈ 25113
    expect(max.employerMax).toBeGreaterThan(25000);
    expect(max.employerMax).toBeLessThan(26000);
    expect(max.totalMax).toBe(max.employeeMax + max.employerMax);
    expect(max.totalMax).toBeLessThan(70000); // under total cap
  });

  it("caps at total limit for high net income", () => {
    const max = computeMax401k(500000, 5000);
    // employerMax = (500000 - 5000) × 0.25 = 123750
    // total = 23500 + 123750 = 147250, capped at 70000
    expect(max.totalMax).toBe(70000);
  });

  it("handles zero net income", () => {
    const max = computeMax401k(0, 0);
    expect(max.employerMax).toBe(0);
    expect(max.totalMax).toBe(23500); // employee only
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
    expect(r.solo401kContribution).toBeLessThanOrEqual(70000);
  });

  it("401k contribution is returned in result", () => {
    const r = calculateTax({ ...DELLINGER, solo401kContribution: 10000 });
    expect(r.solo401kContribution).toBe(10000);
    expect(r.max401k).toBeDefined();
    expect(r.max401k.employeeMax).toBe(23500);
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
