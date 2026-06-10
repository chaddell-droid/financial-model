/**
 * Sanitizer hardening tests (remediation plan 2026-06-09, Phase 5).
 *
 * Covers three gaps in schemaValidation.js:
 *   1. sanitizeMilestones — accepted any finite month/savings; a corrupted
 *      saved scenario (e.g. savings: 1e15) would flow straight into the
 *      projection's expense math. Now range-clamped.
 *   2. sanitizeLeverConstraintsOverride — accepted any finite min/max,
 *      including inverted windows (min > max), which downstream consumers
 *      (optimizer, sliders) assume never happen. Now range-clamped and
 *      inverted entries rejected (revert to workshop defaults).
 *   3. sanitizeGoals — used `typeof === 'number'`, which lets NaN/Infinity
 *      through (typeof NaN === 'number'). Now finite-checked.
 *
 * Run with: node src/state/__tests__/sanitizerHardening.test.js
 */
import assert from 'node:assert';
import {
  validateAndSanitize,
  sanitizeLeverConstraintsOverride,
} from '../schemaValidation.js';
import { INITIAL_STATE } from '../initialState.js';

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

function sanitized(overrides) {
  return validateAndSanitize({ ...INITIAL_STATE, ...overrides });
}

// ════════════════════════════════════════════════════════════════════════
// 1. Milestones — range clamping
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== sanitizeMilestones — range clamping ===');

test('valid milestone passes through unchanged', () => {
  const ms = [{ name: 'Twins to college', month: 36, savings: 3000 }];
  assert.deepStrictEqual(sanitized({ milestones: ms }).milestones, ms);
});

test('negative month and savings clamp to 0', () => {
  const result = sanitized({ milestones: [{ name: 'bad', month: -5, savings: -100 }] });
  assert.deepStrictEqual(result.milestones, [{ name: 'bad', month: 0, savings: 0 }]);
});

test('pathologically large savings clamps to the 50000 ceiling', () => {
  const result = sanitized({ milestones: [{ name: 'corrupt', month: 24, savings: 1e15 }] });
  assert.strictEqual(result.milestones[0].savings, 50000);
});

test('pathologically large month clamps to the 600 ceiling', () => {
  const result = sanitized({ milestones: [{ name: 'corrupt', month: 1e9, savings: 500 }] });
  assert.strictEqual(result.milestones[0].month, 600);
});

test('non-finite month/savings entries are still dropped entirely', () => {
  const result = sanitized({
    milestones: [
      { name: 'keep', month: 12, savings: 500 },
      { name: 'nan-month', month: NaN, savings: 500 },
      { name: 'inf-savings', month: 12, savings: Infinity },
      { name: 'string-month', month: '12', savings: 500 },
    ],
  });
  assert.strictEqual(result.milestones.length, 1);
  assert.strictEqual(result.milestones[0].name, 'keep');
});

// ════════════════════════════════════════════════════════════════════════
// 2. leverConstraintsOverride — clamping + inverted-window rejection
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== sanitizeLeverConstraintsOverride — hardening ===');

test('inverted window (min > max) is rejected — entry dropped', () => {
  const result = sanitizeLeverConstraintsOverride({ sarahRate: { min: 300, max: 200 } });
  assert.strictEqual(result, null, 'sole inverted entry → cleaned map is empty → null');
});

test('inverted entry dropped while valid siblings survive', () => {
  const result = sanitizeLeverConstraintsOverride({
    sarahRate: { min: 300, max: 200 },          // inverted → dropped
    chadConsulting: { min: 100, max: 500 },     // valid → kept
  });
  assert.deepStrictEqual(result, { chadConsulting: { min: 100, max: 500 } });
});

test('negative bounds clamp to 0', () => {
  const result = sanitizeLeverConstraintsOverride({ chadConsulting: { min: -50, max: 500 } });
  assert.deepStrictEqual(result, { chadConsulting: { min: 0, max: 500 } });
});

test('pathologically large bounds clamp to the 5,000,000 ceiling', () => {
  const result = sanitizeLeverConstraintsOverride({ chadJobSalary: { max: 1e12 } });
  assert.deepStrictEqual(result, { chadJobSalary: { max: 5_000_000 } });
});

test('min-only and max-only partial overrides still round-trip (no regression)', () => {
  const result = sanitizeLeverConstraintsOverride({
    sarahRate: { min: 210 },
    chadConsulting: { max: 1700 },
  });
  assert.deepStrictEqual(result, { sarahRate: { min: 210 }, chadConsulting: { max: 1700 } });
});

test('equal min == max is a valid (degenerate) window and survives', () => {
  const result = sanitizeLeverConstraintsOverride({ sarahRate: { min: 250, max: 250 } });
  assert.deepStrictEqual(result, { sarahRate: { min: 250, max: 250 } });
});

test('inverted entry is rejected through the full validateAndSanitize path too', () => {
  const result = sanitized({ leverConstraintsOverride: { sarahRate: { min: 300, max: 200 } } });
  assert.strictEqual(result.leverConstraintsOverride, null);
});

// ════════════════════════════════════════════════════════════════════════
// 3. Goals — finite-number checks
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== sanitizeGoals — finite-number checks ===');

test('NaN targetAmount falls back to 0 (typeof NaN === "number" no longer passes)', () => {
  const result = sanitized({
    goals: [{ id: 'g1', name: 'G', type: 'savings_target', targetAmount: NaN, targetMonth: 48, color: '#fff' }],
  });
  assert.strictEqual(result.goals[0].targetAmount, 0);
});

test('Infinity targetMonth falls back to 72', () => {
  const result = sanitized({
    goals: [{ id: 'g1', name: 'G', type: 'savings_target', targetAmount: 1000, targetMonth: Infinity, color: '#fff' }],
  });
  assert.strictEqual(result.goals[0].targetMonth, 72);
});

test('finite goal values still pass through unchanged (no regression)', () => {
  const goals = [{ id: 'g1', name: 'G', type: 'income_target', targetAmount: 5000, targetMonth: 24, color: '#00ff00' }];
  assert.deepStrictEqual(sanitized({ goals }).goals, goals);
});

console.log(`\n${'='.repeat(60)}`);
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'='.repeat(60)}\n`);

if (failed > 0) process.exit(1);
