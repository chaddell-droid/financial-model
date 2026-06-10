/**
 * 6.6 (remediation 2026-06-10, improvement b-15): emergency-fund floor +
 * two-bucket returns. The only buffer against an SSDI denial previously
 * earned the full equity return. With `cashFloorAmount` set (> 0), the first
 * cashFloorAmount dollars of the savings balance are a CASH bucket earning
 * `cashYieldPct` (default 4%/yr); only the remainder earns the equity
 * investmentReturn. cashFloorAmount = 0 (default) is OFF — the whole balance
 * earns the equity return exactly as before (snapshot-preserving). The 6.5
 * taxableReturnDragPct applies to BOTH buckets (the whole account is
 * taxable; cash interest is ordinary income).
 *
 * Run: node src/model/__tests__/cashFloor.test.js
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

const eqMonthlyRate = Math.pow(1 + INITIAL_STATE.investmentReturn / 100, 1 / 12) - 1;
const cashMonthlyRate = (pct) => Math.pow(1 + pct / 100, 1 / 12) - 1;

test('default cashFloorAmount=0: monthlyData is BYTE-IDENTICAL to the pre-6.6 engine', () => {
  const before = sim({});
  const after = sim({ cashFloorAmount: 0, cashYieldPct: 4 });
  assert.deepStrictEqual(after, before);
});

test('two-bucket split: floor earns the cash yield, remainder earns the equity return', () => {
  const rows = sim({ startingSavings: 200000, cashFloorAmount: 50000, cashYieldPct: 4 });
  const expected = Math.round(50000 * cashMonthlyRate(4) + 150000 * eqMonthlyRate);
  assert.strictEqual(rows[0].investReturn, expected);
});

test('floor above the balance: the ENTIRE balance earns only the cash yield', () => {
  const rows = sim({ startingSavings: 100000, cashFloorAmount: 500000, cashYieldPct: 4 });
  assert.strictEqual(rows[0].investReturn, Math.round(100000 * cashMonthlyRate(4)));
});

test('cash yield below equity return lowers the long-run balance (the floor costs return)', () => {
  const base = sim({ startingSavings: 1_000_000 });
  const floored = sim({ startingSavings: 1_000_000, cashFloorAmount: 200000, cashYieldPct: 4 });
  assert.ok(floored[36].balance < base[36].balance);
});

test('6.5 drag applies to BOTH buckets', () => {
  const undragged = sim({ startingSavings: 200000, cashFloorAmount: 50000, cashYieldPct: 4 });
  const dragged = sim({ startingSavings: 200000, cashFloorAmount: 50000, cashYieldPct: 4, taxableReturnDragPct: 50 });
  assert.ok(Math.abs(dragged[0].investReturn - undragged[0].investReturn * 0.5) <= 1,
    `expected ~${Math.round(undragged[0].investReturn * 0.5)}, got ${dragged[0].investReturn}`);
});

test('cashYieldPct=equity return: split is a no-op for the return amount (±1 rounding)', () => {
  const base = sim({ startingSavings: 200000 });
  const split = sim({ startingSavings: 200000, cashFloorAmount: 50000, cashYieldPct: INITIAL_STATE.investmentReturn });
  assert.ok(Math.abs(split[0].investReturn - base[0].investReturn) <= 1);
});

// ── New Field Checklist ──

test('defaults + clamps: cashFloorAmount 0 in [0, 2M]; cashYieldPct 4 in [0, 15]', () => {
  const d = validateAndSanitize({});
  assert.strictEqual(d.cashFloorAmount, 0);
  assert.strictEqual(d.cashYieldPct, 4);
  assert.strictEqual(validateAndSanitize({ ...INITIAL_STATE, cashFloorAmount: -1 }).cashFloorAmount, 0);
  assert.strictEqual(validateAndSanitize({ ...INITIAL_STATE, cashFloorAmount: 99_999_999 }).cashFloorAmount, 2_000_000);
  assert.strictEqual(validateAndSanitize({ ...INITIAL_STATE, cashYieldPct: -2 }).cashYieldPct, 0);
  assert.strictEqual(validateAndSanitize({ ...INITIAL_STATE, cashYieldPct: 80 }).cashYieldPct, 15);
});

test('gatherState passes both fields through', () => {
  const s = gatherStateWithOverrides({ cashFloorAmount: 75000, cashYieldPct: 5 });
  assert.strictEqual(s.cashFloorAmount, 75000);
  assert.strictEqual(s.cashYieldPct, 5);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
