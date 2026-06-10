/**
 * Capital items funding + likelihood weighting tests (remediation 2026-06-09 D4 + D6b).
 *
 * D4 — capitalFundingSource ('advance' | 'savings'):
 *   'advance' (default) keeps historical behavior: one-time capital items and the
 *   retire-debt payoff never touch savings (covered externally by Dad's advance).
 *   'savings' deducts the expected capital total + the debt payoff (when retireDebt
 *   is on) from the savings balance at month 0 (capital items carry no scheduled
 *   month on their shape, so the model treats them as immediate).
 *
 * D6b — likelihood weighting:
 *   computeOneTimeTotal weights each included item by likelihood/100 (an EXPECTED
 *   value). All three surfaces (advanceNeeded, scenarioLevers capital consequences,
 *   JSON export via the shared helper) must agree at 0% / 50% / 100%.
 *
 * Run: node src/model/__tests__/capitalFunding.test.js
 */

import assert from 'node:assert';
import { INITIAL_STATE } from '../../state/initialState.js';
import { gatherStateWithOverrides, computeOneTimeTotal } from '../../state/gatherState.js';
import { validateAndSanitize } from '../../state/schemaValidation.js';
import { runMonthlySimulation } from '../projection.js';
import { buildPrimaryLeversModel } from '../scenarioLevers.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL  ${name}`);
    console.log(`        ${e.message}`);
  }
}

const item = (overrides = {}) => ({
  id: 'cap-test',
  name: 'Test item',
  description: '',
  cost: 10000,
  include: true,
  likelihood: 100,
  ...overrides,
});

const DEBT_TOTAL = INITIAL_STATE.debtCC + INITIAL_STATE.debtPersonal
  + INITIAL_STATE.debtIRS + INITIAL_STATE.debtFirstmark;

// Engine states use investmentReturn 0 + a large savings balance so balance
// diffs between funding modes stay constant (no returns compounding the gap,
// no 401k drawdown firing in either run over the asserted window).
function simBalances(overrides) {
  const s = gatherStateWithOverrides({
    investmentReturn: 0,
    startingSavings: 2_000_000,
    ...overrides,
  });
  return runMonthlySimulation(s).monthlyData.map((d) => d.balance);
}

// ── D6b: computeOneTimeTotal likelihood weighting ──────────────────────────
console.log('\n=== D6b — computeOneTimeTotal (expected value) ===');

test('likelihood 100 → full cost (legacy behavior preserved)', () => {
  assert.strictEqual(computeOneTimeTotal([item({ likelihood: 100 })]), 10000);
});

test('likelihood 50 → half the cost', () => {
  assert.strictEqual(computeOneTimeTotal([item({ likelihood: 50 })]), 5000);
});

test('likelihood 0 → $0 expected', () => {
  assert.strictEqual(computeOneTimeTotal([item({ likelihood: 0 })]), 0);
});

test('missing/invalid likelihood treated as 100% (legacy items predate the field)', () => {
  const it = item();
  delete it.likelihood;
  assert.strictEqual(computeOneTimeTotal([it]), 10000);
  assert.strictEqual(computeOneTimeTotal([item({ likelihood: 'oops' })]), 10000);
});

test('likelihood clamped to [0, 100]', () => {
  assert.strictEqual(computeOneTimeTotal([item({ likelihood: 250 })]), 10000);
  assert.strictEqual(computeOneTimeTotal([item({ likelihood: -40 })]), 0);
});

test('excluded items contribute 0 regardless of likelihood', () => {
  assert.strictEqual(computeOneTimeTotal([item({ include: false, likelihood: 100 })]), 0);
});

test('mixed list sums expected values and rounds to whole dollars', () => {
  const items = [
    item({ id: 'a', cost: 333, likelihood: 50 }),   // 166.5
    item({ id: 'b', cost: 20000, likelihood: 25 }),  // 5000
    item({ id: 'c', cost: 5000, include: false }),   // 0
  ];
  assert.strictEqual(computeOneTimeTotal(items), Math.round(166.5 + 5000));
});

test('non-array input → 0 (unchanged guard)', () => {
  assert.strictEqual(computeOneTimeTotal(null), 0);
  assert.strictEqual(computeOneTimeTotal('x'), 0);
});

// ── D6b: scenarioLevers capital consequences parity ─────────────────────────
console.log('\n=== D6b — scenarioLevers capitalConsequenceItems parity ===');

function leversModel(overrides = {}) {
  return buildPrimaryLeversModel({
    retireDebt: false, lifestyleCutsApplied: false, cutsOverride: null,
    lifestyleCuts: 0, cutInHalf: 0, extraCuts: 0,
    debtTotal: DEBT_TOTAL, debtService: 6434, baseExpenses: 40000, currentExpenses: 40000,
    vanSold: false, vanMonthlySavings: 0,
    bcsAnnualTotal: 43400, bcsParentsAnnual: 25000, bcsYearsLeft: 3, bcsFamilyMonthly: 1533,
    moldCost: 0, moldInclude: false, roofCost: 0, roofInclude: false,
    otherProjects: 0, otherInclude: false,
    capitalItems: [], customLevers: [],
    advanceNeeded: 0,
    ...overrides,
  });
}

test('consequence amount is the expected value at 50% likelihood, labeled via fields', () => {
  const model = leversModel({ capitalItems: [item({ cost: 20000, likelihood: 50 })] });
  const cap = model.consequenceItems.find((c) => c.id === 'capital:cap-test');
  assert.ok(cap, 'capital consequence item must exist');
  assert.strictEqual(cap.amount, 10000, 'amount must be cost × likelihood/100');
  assert.strictEqual(cap.cost, 20000, 'raw cost preserved for display');
  assert.strictEqual(cap.likelihood, 50);
  assert.strictEqual(cap.expected, true, 'flagged as an expected (weighted) value');
});

test('consequence amount at 100% equals raw cost and is NOT flagged expected', () => {
  const model = leversModel({ capitalItems: [item({ cost: 20000, likelihood: 100 })] });
  const cap = model.consequenceItems.find((c) => c.id === 'capital:cap-test');
  assert.strictEqual(cap.amount, 20000);
  assert.strictEqual(cap.expected, false);
});

test('consequence amount at 0% is $0 (still active so UI can explain)', () => {
  const model = leversModel({ capitalItems: [item({ cost: 20000, likelihood: 0 })] });
  const cap = model.consequenceItems.find((c) => c.id === 'capital:cap-test');
  assert.strictEqual(cap.amount, 0);
  assert.strictEqual(cap.active, true);
});

test('sum of active capital consequence amounts === computeOneTimeTotal (display parity)', () => {
  const items = [
    item({ id: 'a', cost: 20000, likelihood: 50 }),
    item({ id: 'b', cost: 10000, likelihood: 100 }),
    item({ id: 'c', cost: 8000, include: false, likelihood: 100 }),
  ];
  const model = leversModel({ capitalItems: items });
  const sum = model.consequenceItems
    .filter((c) => c.id.startsWith('capital:'))
    .reduce((t, c) => t + c.amount, 0);
  assert.strictEqual(sum, computeOneTimeTotal(items));
});

test('legacy fallback items (no likelihood field) keep full cost', () => {
  const model = leversModel({ capitalItems: [], moldCost: 60000, moldInclude: true });
  const mold = model.consequenceItems.find((c) => c.id === 'mold_remediation');
  assert.strictEqual(mold.amount, 60000);
  assert.strictEqual(mold.expected, false);
});

test('advanceNeeded derivation matches at 0/50/100% likelihood', () => {
  for (const [lk, expected] of [[0, 0], [50, 5000], [100, 10000]]) {
    const items = [item({ likelihood: lk })];
    const ask = 0 + computeOneTimeTotal(items); // retireDebt off
    assert.strictEqual(ask, expected, `ask at ${lk}%`);
  }
});

// ── D4: New Field Checklist — default / override / sanitize ────────────────
console.log('\n=== D4 — capitalFundingSource field ===');

test('default value is advance (current behavior preserved)', () => {
  assert.strictEqual(INITIAL_STATE.capitalFundingSource, 'advance');
  assert.strictEqual(gatherStateWithOverrides({}).capitalFundingSource, 'advance');
});

test('gatherState passes the savings override through', () => {
  assert.strictEqual(
    gatherStateWithOverrides({ capitalFundingSource: 'savings' }).capitalFundingSource,
    'savings',
  );
});

test('sanitizer: invalid enum value reverts to advance; valid values round-trip', () => {
  const bad = validateAndSanitize({ ...INITIAL_STATE, capitalFundingSource: 'piggybank' });
  assert.strictEqual(bad.capitalFundingSource, 'advance');
  const good = validateAndSanitize({ ...INITIAL_STATE, capitalFundingSource: 'savings' });
  assert.strictEqual(good.capitalFundingSource, 'savings');
  const missing = validateAndSanitize({});
  assert.strictEqual(missing.capitalFundingSource, 'advance');
});

// ── D4: engine behavior ─────────────────────────────────────────────────────
console.log('\n=== D4 — engine deduction (savings mode) ===');

test('advance mode (default): included capital items never touch savings', () => {
  const withItems = simBalances({ capitalItems: [item({ cost: 30000 })] });
  const without = simBalances({ capitalItems: [item({ cost: 30000, include: false })] });
  for (const m of [0, 1, 6, 24]) {
    assert.strictEqual(withItems[m], without[m], `month ${m} must be identical in advance mode`);
  }
});

test('savings mode: expected capital total deducted exactly once at month 0 (boundary)', () => {
  const adv = simBalances({ capitalItems: [item({ cost: 30000 })], capitalFundingSource: 'advance' });
  const sav = simBalances({ capitalItems: [item({ cost: 30000 })], capitalFundingSource: 'savings' });
  assert.strictEqual(adv[0] - sav[0], 30000, 'month 0 diff = full deduction');
  // With investmentReturn 0 the gap must stay EXACTLY 30000 — proves the
  // deduction fires once at m=0 and never repeats.
  for (const m of [1, 2, 12, 36]) {
    assert.strictEqual(adv[m] - sav[m], 30000, `month ${m} diff must remain the one-time deduction`);
  }
});

test('savings mode: deduction uses the likelihood-weighted EXPECTED cost', () => {
  const adv = simBalances({ capitalItems: [item({ cost: 30000, likelihood: 50 })], capitalFundingSource: 'advance' });
  const sav = simBalances({ capitalItems: [item({ cost: 30000, likelihood: 50 })], capitalFundingSource: 'savings' });
  assert.strictEqual(adv[0] - sav[0], 15000);
});

test('savings mode: excluded items are not deducted', () => {
  const sav = simBalances({ capitalItems: [item({ include: false })], capitalFundingSource: 'savings' });
  const adv = simBalances({ capitalItems: [item({ include: false })], capitalFundingSource: 'advance' });
  assert.strictEqual(adv[0], sav[0]);
});

test('savings mode + retireDebt: one-time debt payoff also comes out of savings at month 0', () => {
  const items = [item({ cost: 30000 })];
  const adv = simBalances({ capitalItems: items, retireDebt: true, capitalFundingSource: 'advance' });
  const sav = simBalances({ capitalItems: items, retireDebt: true, capitalFundingSource: 'savings' });
  assert.strictEqual(adv[0] - sav[0], DEBT_TOTAL + 30000,
    'savings mode must deduct debt payoff + expected capital total');
});

test('advance mode + retireDebt: debt payoff still external (no month-0 deduction)', () => {
  const advDebt = simBalances({ retireDebt: true, capitalFundingSource: 'advance' });
  const advNoDebt = simBalances({ retireDebt: false, capitalFundingSource: 'advance' });
  // retireDebt removes debtService from monthly expenses but the PAYOFF never
  // hits savings in advance mode: month-0 balances differ only by the saved
  // debtService, never by debtTotal.
  assert.strictEqual(advDebt[0] - advNoDebt[0], INITIAL_STATE.debtService);
});

test('advance-ask metric is identical in both modes (D4 exit criterion)', () => {
  const items = [item({ cost: 30000, likelihood: 50 })];
  const askFor = (fundingSource) => {
    const s = gatherStateWithOverrides({ capitalItems: items, retireDebt: true, capitalFundingSource: fundingSource });
    const debtTotal = s.debtCC + s.debtPersonal + s.debtIRS + s.debtFirstmark;
    return (s.retireDebt ? debtTotal : 0) + computeOneTimeTotal(s.capitalItems);
  };
  assert.strictEqual(askFor('advance'), askFor('savings'));
  assert.strictEqual(askFor('advance'), DEBT_TOTAL + 15000);
});

test('savings mode flows through scenario save/load sanitize unchanged', () => {
  const clean = validateAndSanitize({
    ...INITIAL_STATE,
    capitalFundingSource: 'savings',
    capitalItems: [item({ cost: 30000, likelihood: 50 })],
  });
  const sav = simBalances({ ...clean, investmentReturn: 0, startingSavings: 2_000_000 });
  const adv = simBalances({ ...clean, investmentReturn: 0, startingSavings: 2_000_000, capitalFundingSource: 'advance' });
  assert.strictEqual(adv[0] - sav[0], 15000);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
