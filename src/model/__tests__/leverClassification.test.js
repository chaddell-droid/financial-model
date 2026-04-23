/**
 * Unit tests for leverClassification.js — Story 2.2.
 *
 * Coverage:
 *   • Every lever in the table has a valid classification value
 *   • Bounded-continuous levers have finite min/max with min <= max
 *   • Workshop-confirmed bounds match (sarahRate 200-300, clients 3.75-5, etc.)
 *   • isOptimizerEligible returns true for bounded-continuous only
 *   • computeEffectiveLeverConstraints merges overrides over defaults
 *   • computeEffectiveLeverConstraints handles null/malformed override safely
 *
 * Run with: node src/model/__tests__/leverClassification.test.js
 */
import assert from 'node:assert';
import {
  LEVER_CLASS,
  LEVER_CLASSIFICATION,
  getLeverClassification,
  isOptimizerEligible,
  getOptimizerEligibleLevers,
  computeEffectiveLeverConstraints,
} from '../leverClassification.js';

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

// ════════════════════════════════════════════════════════════════════════
// LEVER_CLASS enum
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== LEVER_CLASS enum ===');

test('1. LEVER_CLASS has exactly three values', () => {
  assert.deepStrictEqual(Object.values(LEVER_CLASS).sort(), ['awareness-only', 'binary', 'bounded-continuous']);
});

test('2. LEVER_CLASS is frozen', () => {
  assert.throws(() => { LEVER_CLASS.NEW_CLASS = 'x'; }, TypeError);
});

// ════════════════════════════════════════════════════════════════════════
// LEVER_CLASSIFICATION table integrity
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== LEVER_CLASSIFICATION table integrity ===');

test('3. LEVER_CLASSIFICATION is frozen (cannot add new levers at runtime)', () => {
  assert.throws(() => { LEVER_CLASSIFICATION.newLever = {}; }, TypeError);
});

test('4. Every entry has a valid classification value', () => {
  const validClasses = new Set(Object.values(LEVER_CLASS));
  for (const [key, entry] of Object.entries(LEVER_CLASSIFICATION)) {
    assert.ok(validClasses.has(entry.classification), `${key} has invalid classification: ${entry.classification}`);
  }
});

test('5. Every bounded-continuous lever has finite min/max with min <= max', () => {
  for (const [key, entry] of Object.entries(LEVER_CLASSIFICATION)) {
    if (entry.classification !== LEVER_CLASS.BOUNDED_CONTINUOUS) continue;
    assert.ok(typeof entry.min === 'number' && Number.isFinite(entry.min), `${key} missing finite min`);
    assert.ok(typeof entry.max === 'number' && Number.isFinite(entry.max), `${key} missing finite max`);
    assert.ok(entry.min <= entry.max, `${key}: min (${entry.min}) must be <= max (${entry.max})`);
  }
});

test('6. Binary and awareness-only levers do NOT carry bound fields (prevents accidental use)', () => {
  for (const [key, entry] of Object.entries(LEVER_CLASSIFICATION)) {
    if (entry.classification === LEVER_CLASS.BOUNDED_CONTINUOUS) continue;
    assert.ok(!('min' in entry), `${key} (${entry.classification}) should not have min`);
    assert.ok(!('max' in entry), `${key} (${entry.classification}) should not have max`);
  }
});

// ════════════════════════════════════════════════════════════════════════
// Workshop-confirmed bounds (the signed-off Constraint Workshop values)
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== workshop-confirmed bounds ===');

test('7. sarahRate bounds are 200-300 (6yr horizon tenure + market lift)', () => {
  assert.strictEqual(LEVER_CLASSIFICATION.sarahRate.min, 200);
  assert.strictEqual(LEVER_CLASSIFICATION.sarahRate.max, 300);
});

test('8. sarahCurrentClients bounds are 3.75-5 (post-twins-in-college capacity)', () => {
  assert.strictEqual(LEVER_CLASSIFICATION.sarahCurrentClients.min, 3.75);
  assert.strictEqual(LEVER_CLASSIFICATION.sarahCurrentClients.max, 5);
});

test('9. cutsOverride bounds are 0-3000 (total aggressive cut ceiling)', () => {
  assert.strictEqual(LEVER_CLASSIFICATION.cutsOverride.min, 0);
  assert.strictEqual(LEVER_CLASSIFICATION.cutsOverride.max, 3000);
});

test('10. chadConsulting ceiling is SSDI SGA cap ($1,620 for 2025 non-blind)', () => {
  assert.strictEqual(LEVER_CLASSIFICATION.chadConsulting.min, 0);
  assert.strictEqual(LEVER_CLASSIFICATION.chadConsulting.max, 1620);
});

test('11. chadJobStartMonth ceiling is 12 months (realistic W-2 planning window)', () => {
  assert.strictEqual(LEVER_CLASSIFICATION.chadJobStartMonth.min, 0);
  assert.strictEqual(LEVER_CLASSIFICATION.chadJobStartMonth.max, 12);
});

test('12. vanSaleMonth ceiling is 24 months', () => {
  assert.strictEqual(LEVER_CLASSIFICATION.vanSaleMonth.min, 0);
  assert.strictEqual(LEVER_CLASSIFICATION.vanSaleMonth.max, 24);
});

test('13. ssClaimAge bounds match SSA rules (62-70)', () => {
  assert.strictEqual(LEVER_CLASSIFICATION.ssClaimAge.min, 62);
  assert.strictEqual(LEVER_CLASSIFICATION.ssClaimAge.max, 70);
});

test('14. bcsParentsAnnual ceiling matches bcsAnnualTotal default ($43,400)', () => {
  assert.strictEqual(LEVER_CLASSIFICATION.bcsParentsAnnual.min, 0);
  assert.strictEqual(LEVER_CLASSIFICATION.bcsParentsAnnual.max, 43400);
});

// ════════════════════════════════════════════════════════════════════════
// Classification coverage — expected levers are present
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== expected lever coverage ===');

test('15. All expected binary levers are classified', () => {
  const expected = ['retireDebt', 'lifestyleCutsApplied', 'vanSold', 'chadJob', 'ssType', 'ssdiDenied'];
  for (const key of expected) {
    const entry = LEVER_CLASSIFICATION[key];
    assert.ok(entry, `${key} missing from classification`);
    assert.strictEqual(entry.classification, LEVER_CLASS.BINARY, `${key} should be binary`);
  }
});

test('16. All expected bounded-continuous levers are classified', () => {
  const expected = ['sarahRate', 'sarahCurrentClients', 'cutsOverride', 'bcsParentsAnnual', 'chadConsulting', 'ssClaimAge', 'chadJobStartMonth', 'vanSaleMonth'];
  for (const key of expected) {
    const entry = LEVER_CLASSIFICATION[key];
    assert.ok(entry, `${key} missing from classification`);
    assert.strictEqual(entry.classification, LEVER_CLASS.BOUNDED_CONTINUOUS, `${key} should be bounded-continuous`);
  }
});

test('17. All expected awareness-only levers are classified', () => {
  const expected = ['investmentReturn', 'expenseInflationRate', 'msftGrowth', 'return401k', 'homeAppreciation', 'sarahRateGrowth', 'sarahClientGrowth'];
  for (const key of expected) {
    const entry = LEVER_CLASSIFICATION[key];
    assert.ok(entry, `${key} missing from classification`);
    assert.strictEqual(entry.classification, LEVER_CLASS.AWARENESS_ONLY, `${key} should be awareness-only`);
  }
});

// ════════════════════════════════════════════════════════════════════════
// getLeverClassification / isOptimizerEligible / getOptimizerEligibleLevers
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== helper predicates ===');

test('18. getLeverClassification returns entry for known lever, null for unknown', () => {
  assert.ok(getLeverClassification('sarahRate'));
  assert.strictEqual(getLeverClassification('sarahRate').classification, LEVER_CLASS.BOUNDED_CONTINUOUS);
  assert.strictEqual(getLeverClassification('nonexistent_lever'), null);
  assert.strictEqual(getLeverClassification(''), null);
  assert.strictEqual(getLeverClassification('__proto__'), null); // security — prototype pollution guard
});

test('19. isOptimizerEligible returns true only for bounded-continuous', () => {
  assert.strictEqual(isOptimizerEligible('sarahRate'), true);
  assert.strictEqual(isOptimizerEligible('retireDebt'), false); // binary
  assert.strictEqual(isOptimizerEligible('investmentReturn'), false); // awareness-only
  assert.strictEqual(isOptimizerEligible('nonexistent_lever'), false);
});

test('20. getOptimizerEligibleLevers returns exactly the bounded-continuous set', () => {
  const expected = ['sarahRate', 'sarahCurrentClients', 'cutsOverride', 'bcsParentsAnnual', 'chadConsulting', 'ssClaimAge', 'chadJobStartMonth', 'vanSaleMonth'];
  assert.deepStrictEqual(getOptimizerEligibleLevers().sort(), expected.sort());
});

// ════════════════════════════════════════════════════════════════════════
// computeEffectiveLeverConstraints
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== computeEffectiveLeverConstraints ===');

test('21. Null override yields workshop defaults for every optimizer-eligible lever', () => {
  const eff = computeEffectiveLeverConstraints(null);
  assert.strictEqual(eff.sarahRate.min, 200);
  assert.strictEqual(eff.sarahRate.max, 300);
  assert.strictEqual(eff.chadConsulting.max, 1620);
  // No binary or awareness-only leaks through
  assert.strictEqual(eff.retireDebt, undefined);
  assert.strictEqual(eff.investmentReturn, undefined);
});

test('22. Override replaces min only, leaves max at default', () => {
  const override = { sarahRate: { min: 220 } };
  const eff = computeEffectiveLeverConstraints(override);
  assert.strictEqual(eff.sarahRate.min, 220);
  assert.strictEqual(eff.sarahRate.max, 300);
});

test('23. Override replaces max only, leaves min at default', () => {
  const override = { chadConsulting: { max: 1700 } }; // simulate SGA update
  const eff = computeEffectiveLeverConstraints(override);
  assert.strictEqual(eff.chadConsulting.min, 0);
  assert.strictEqual(eff.chadConsulting.max, 1700);
});

test('24. Override replaces both min and max', () => {
  const override = { sarahRate: { min: 250, max: 350 } };
  const eff = computeEffectiveLeverConstraints(override);
  assert.strictEqual(eff.sarahRate.min, 250);
  assert.strictEqual(eff.sarahRate.max, 350);
});

test('25. Override for unknown lever is ignored (prevents prototype pollution / typos)', () => {
  const override = { nonexistent: { min: 99, max: 999 } };
  const eff = computeEffectiveLeverConstraints(override);
  assert.strictEqual(eff.nonexistent, undefined);
});

test('26. Malformed override values fall back to defaults', () => {
  const override = {
    sarahRate: { min: 'not a number', max: NaN },
    chadConsulting: { min: Infinity },
  };
  const eff = computeEffectiveLeverConstraints(override);
  assert.strictEqual(eff.sarahRate.min, 200); // default
  assert.strictEqual(eff.sarahRate.max, 300); // default
  assert.strictEqual(eff.chadConsulting.min, 0); // default (Infinity rejected via Number.isFinite)
});

test('27. Non-object override (string/array/undefined) returns all defaults', () => {
  const cases = [null, undefined, 'bad', 42, [], {}];
  for (const input of cases) {
    const eff = computeEffectiveLeverConstraints(input);
    assert.strictEqual(eff.sarahRate.min, 200, `input ${JSON.stringify(input)}: min default`);
    assert.strictEqual(eff.sarahRate.max, 300, `input ${JSON.stringify(input)}: max default`);
  }
});

test('28. Override does not mutate the defaults (immutability check)', () => {
  const override = { sarahRate: { min: 999, max: 9999 } };
  computeEffectiveLeverConstraints(override);
  assert.strictEqual(LEVER_CLASSIFICATION.sarahRate.min, 200, 'defaults must not be mutated');
  assert.strictEqual(LEVER_CLASSIFICATION.sarahRate.max, 300);
});

// ════════════════════════════════════════════════════════════════════════
// Summary
// ════════════════════════════════════════════════════════════════════════
console.log(`\n${'='.repeat(50)}`);
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'='.repeat(50)}\n`);

if (failed > 0) process.exit(1);
