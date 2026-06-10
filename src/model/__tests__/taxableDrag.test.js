/**
 * 6.5 (remediation 2026-06-10, improvement b-11): tax drag on the taxable
 * savings balance. An untaxed 15% taxable return was the model's most
 * optimistic untracked assumption. `taxableReturnDragPct` (default 0 —
 * snapshot-preserving) scales the monthly return credited to the TAXABLE
 * savings balance by (1 − drag/100): after-tax return = pre-tax × (1 − drag).
 * The 401(k) is tax-sheltered and is NOT dragged.
 *
 * Run: node src/model/__tests__/taxableDrag.test.js
 */

import assert from 'node:assert';
import { INITIAL_STATE } from '../../state/initialState.js';
import { gatherStateWithOverrides } from '../../state/gatherState.js';
import { validateAndSanitize } from '../../state/schemaValidation.js';
import { runMonthlySimulation } from '../projection.js';

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

function sim(overrides = {}) {
  return runMonthlySimulation(gatherStateWithOverrides(overrides)).monthlyData;
}

test('default 0 drag: monthlyData is BYTE-IDENTICAL to the pre-6.5 engine (snapshot-preserving)', () => {
  const before = sim({});
  const after = sim({ taxableReturnDragPct: 0 });
  assert.deepStrictEqual(after, before);
});

test('drag scales the month-0 investment return by (1 − drag/100)', () => {
  const base = sim({})[0].investReturn;
  const dragged = sim({ taxableReturnDragPct: 20 })[0].investReturn;
  // Same starting balance at month 0 → exact proportional scaling (±1 rounding).
  assert.ok(Math.abs(dragged - base * 0.8) <= 1,
    `expected ~${Math.round(base * 0.8)}, got ${dragged} (base ${base})`);
  assert.ok(dragged < base);
});

test('drag=100 zeroes the taxable return entirely', () => {
  assert.strictEqual(sim({ taxableReturnDragPct: 100 })[0].investReturn, 0);
});

test('drag compounds into a lower savings balance, but does NOT touch the 401(k)', () => {
  const base = sim({ startingSavings: 1_000_000 });
  const dragged = sim({ startingSavings: 1_000_000, taxableReturnDragPct: 25 });
  assert.ok(dragged[36].balance < base[36].balance, '3-yr dragged balance should be lower');
  assert.strictEqual(dragged[6].balance401k, base[6].balance401k, '401(k) is sheltered — no drag');
});

// ── New Field Checklist ──

test('default + clamps: taxableReturnDragPct 0, range [0, 100]', () => {
  assert.strictEqual(validateAndSanitize({}).taxableReturnDragPct, 0);
  assert.strictEqual(validateAndSanitize({ ...INITIAL_STATE, taxableReturnDragPct: -5 }).taxableReturnDragPct, 0);
  assert.strictEqual(validateAndSanitize({ ...INITIAL_STATE, taxableReturnDragPct: 250 }).taxableReturnDragPct, 100);
});

test('gatherState passes taxableReturnDragPct through', () => {
  assert.strictEqual(gatherStateWithOverrides({ taxableReturnDragPct: 15 }).taxableReturnDragPct, 15);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
