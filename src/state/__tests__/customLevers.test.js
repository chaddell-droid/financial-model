/**
 * Unit tests for custom levers state layer.
 * Run with: node src/state/__tests__/customLevers.test.js
 */
import assert from 'node:assert';
import { INITIAL_STATE, MODEL_KEYS } from '../initialState.js';
import { gatherStateWithOverrides } from '../gatherState.js';
import { validateAndSanitize, sanitizeCustomLevers, sanitizeCapitalItems } from '../schemaValidation.js';
import { runMonthlySimulation } from '../../model/projection.js';
import { buildPrimaryLeversModel } from '../../model/scenarioLevers.js';

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

console.log('\n=== Custom Levers — state/schema ===');

test('INITIAL_STATE.customLevers defaults to empty array', () => {
  assert.deepStrictEqual(INITIAL_STATE.customLevers, []);
});

test('MODEL_KEYS includes customLevers and capitalItems', () => {
  assert.ok(MODEL_KEYS.includes('customLevers'));
  assert.ok(MODEL_KEYS.includes('capitalItems'));
});

test('sanitizeCustomLevers drops malformed entries and clamps values', () => {
  const result = sanitizeCustomLevers([
    { id: 'ok', name: 'Good', description: 'd', maxImpact: 1500, currentValue: 1200, active: true },
    null,
    'string',
    { id: 'over', name: 'Over', maxImpact: 999999, currentValue: -50, active: false },
  ]);
  assert.strictEqual(result.length, 2);
  assert.strictEqual(result[0].id, 'ok');
  assert.strictEqual(result[0].currentValue, 1200);
  assert.strictEqual(result[1].id, 'over');
  assert.strictEqual(result[1].maxImpact, 50000); // clamped to max
  assert.strictEqual(result[1].currentValue, 0);  // clamped to min
});

test('sanitizeCustomLevers clamps currentValue to maxImpact', () => {
  const result = sanitizeCustomLevers([
    { id: 'a', name: 'A', maxImpact: 100, currentValue: 500, active: true },
  ]);
  assert.strictEqual(result[0].maxImpact, 100);
  assert.strictEqual(result[0].currentValue, 100);
});

test('sanitizeCustomLevers returns empty array for non-array input', () => {
  assert.deepStrictEqual(sanitizeCustomLevers(null), []);
  assert.deepStrictEqual(sanitizeCustomLevers(undefined), []);
  assert.deepStrictEqual(sanitizeCustomLevers('foo'), []);
  assert.deepStrictEqual(sanitizeCustomLevers(42), []);
});

test('sanitizeCustomLevers generates ids for entries missing them', () => {
  const result = sanitizeCustomLevers([
    { name: 'No id', maxImpact: 100, currentValue: 50, active: true },
  ]);
  assert.ok(typeof result[0].id === 'string');
  assert.ok(result[0].id.length > 0);
});

console.log('\n=== Custom Levers — projection wiring ===');

test('Active custom lever adds currentValue to monthly cashIncome', () => {
  const baseState = gatherStateWithOverrides({ chadJob: false });
  const withLever = gatherStateWithOverrides({
    chadJob: false,
    customLevers: [{ id: 'r', name: 'Rental', description: '', maxImpact: 1800, currentValue: 1500, active: true }],
  });
  const baseSim = runMonthlySimulation(baseState);
  const leverSim = runMonthlySimulation(withLever);
  // Month 1 cashIncome should differ by $1,500 (the lever's currentValue).
  const diff = leverSim.monthlyData[1].cashIncome - baseSim.monthlyData[1].cashIncome;
  assert.strictEqual(diff, 1500);
});

test('Inactive custom lever contributes $0', () => {
  const s = gatherStateWithOverrides({
    customLevers: [{ id: 'r', name: 'R', maxImpact: 1800, currentValue: 1800, active: false }],
  });
  const base = gatherStateWithOverrides({});
  const sim = runMonthlySimulation(s);
  const baseSim = runMonthlySimulation(base);
  assert.strictEqual(sim.monthlyData[1].cashIncome, baseSim.monthlyData[1].cashIncome);
});

test('Multiple active custom levers sum into cashIncome', () => {
  const withTwo = gatherStateWithOverrides({
    customLevers: [
      { id: 'a', name: 'A', maxImpact: 1000, currentValue: 1000, active: true },
      { id: 'b', name: 'B', maxImpact: 500, currentValue: 500, active: true },
    ],
  });
  const base = gatherStateWithOverrides({});
  const sim = runMonthlySimulation(withTwo);
  const baseSim = runMonthlySimulation(base);
  assert.strictEqual(sim.monthlyData[1].cashIncome - baseSim.monthlyData[1].cashIncome, 1500);
});

console.log('\n=== Custom Levers — scenarioLevers summary ===');

test('buildPrimaryLeversModel appends customLevers to recurringLevers', () => {
  const model = buildPrimaryLeversModel({
    retireDebt: false, lifestyleCutsApplied: false, cutsOverride: null,
    lifestyleCuts: 0, cutInHalf: 0, extraCuts: 0,
    debtTotal: 0, debtService: 0, baseExpenses: 1000, currentExpenses: 1000,
    vanSold: false, vanMonthlySavings: 0,
    bcsAnnualTotal: 40000, bcsParentsAnnual: 25000, bcsYearsLeft: 3, bcsFamilyMonthly: 1250,
    capitalItems: [], customLevers: [
      { id: 'rent', name: 'Rental', description: 'offsets housing', maxImpact: 1800, currentValue: 1200, active: true },
    ],
    advanceNeeded: 0,
  });
  const custom = model.recurringLevers.find((lv) => lv.custom);
  assert.ok(custom, 'should include a custom lever');
  assert.strictEqual(custom.label, 'Rental');
  assert.strictEqual(custom.monthlyImpact, 1200);
  assert.strictEqual(custom.availableMonthlyImpact, 1800);
  assert.ok(custom.id.startsWith('custom:'));
});

console.log('\n=== Capital Items — sanitizer ===');

test('sanitizeCapitalItems drops bad entries, clamps cost, defaults likelihood', () => {
  const result = sanitizeCapitalItems([
    { id: 'good', name: 'Good', cost: 20000, include: true },
    { id: 'neg', name: 'Neg', cost: -999, include: false },
    null,
    'not-an-object',
    { name: 'No id', cost: 5000, include: true },
  ]);
  assert.strictEqual(result.length, 3);
  assert.strictEqual(result[0].cost, 20000);
  assert.strictEqual(result[0].likelihood, 100);
  assert.strictEqual(result[1].cost, 0); // clamped
  assert.ok(result[2].id.length > 0);    // auto-generated
});

test('sanitizeCapitalItems returns empty array for non-array', () => {
  assert.deepStrictEqual(sanitizeCapitalItems('foo'), []);
  assert.deepStrictEqual(sanitizeCapitalItems(null), []);
});

console.log('\n=== Capital Items — gatherState migration ===');

test('gatherState derives capitalItems from legacy fields when array empty', () => {
  const s = gatherStateWithOverrides({
    moldCost: 18500, moldInclude: true,
    roofCost: 26000, roofInclude: false,
    otherProjects: 12000, otherInclude: true,
    capitalItems: [],
  });
  assert.strictEqual(s.capitalItems.length, 3);
  assert.strictEqual(s.capitalItems[0].id, 'legacy-mold');
  assert.strictEqual(s.capitalItems[0].cost, 18500);
  assert.strictEqual(s.capitalItems[0].include, true);
  assert.strictEqual(s.capitalItems[1].include, false);
  assert.strictEqual(s.capitalItems[2].cost, 12000);
});

test('gatherState preserves populated capitalItems array (does not overwrite)', () => {
  const existing = [
    { id: 'hvac', name: 'HVAC', description: '', cost: 8000, include: true, likelihood: 100 },
  ];
  const s = gatherStateWithOverrides({
    moldCost: 99999, moldInclude: true, // legacy data should NOT override
    capitalItems: existing,
  });
  assert.strictEqual(s.capitalItems.length, 1);
  assert.strictEqual(s.capitalItems[0].id, 'hvac');
});

test('validateAndSanitize round-trips customLevers and capitalItems through validation', () => {
  const raw = {
    ...INITIAL_STATE,
    customLevers: [{ id: 'x', name: 'X', description: '', maxImpact: 500, currentValue: 500, active: true }],
    capitalItems: [{ id: 'a', name: 'A', description: '', cost: 100, include: true, likelihood: 100 }],
  };
  const clean = validateAndSanitize(raw);
  assert.strictEqual(clean.customLevers.length, 1);
  assert.strictEqual(clean.capitalItems.length, 1);
  assert.strictEqual(clean.customLevers[0].name, 'X');
  assert.strictEqual(clean.capitalItems[0].name, 'A');
});

console.log('\n════════════════════════════════════════════════════════════');
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log('════════════════════════════════════════════════════════════\n');

if (failed > 0) process.exit(1);
