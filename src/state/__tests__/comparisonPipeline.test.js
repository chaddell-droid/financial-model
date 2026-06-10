/**
 * Comparison pipeline tests (remediation plan 2026-06-09, Phase 5).
 *
 * Bug: FinancialModel.jsx computed compared-scenario projections from the RAW
 * saved state (`computeProjection(c.state)`) — no migrate, no
 * validateAndSanitize, no gatherState. An old-schema scenario therefore
 * compared with different numbers than the SAME scenario produced when loaded
 * (the load path runs RESTORE_STATE → migrate + validateAndSanitize, then the
 * projection memo runs gatherState).
 *
 * Fix: `prepareComparisonState(saved)` in gatherState.js mirrors the load
 * pipeline exactly; FinancialModel's compareProjections memo routes every
 * compared state through it.
 *
 * Run with: node src/state/__tests__/comparisonPipeline.test.js
 */
import assert from 'node:assert';
import fs from 'node:fs';
import { INITIAL_STATE } from '../initialState.js';
import { reducer } from '../reducer.js';
import { gatherState, prepareComparisonState } from '../gatherState.js';
import { computeProjection } from '../../model/projection.js';

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

/** The app's load path: RESTORE_STATE reducer (migrate + sanitize), then the
 * projection memo's gatherState. Returns the projection a user sees after
 * loading the scenario. */
function projectViaLoadPath(savedState) {
  const loaded = reducer(INITIAL_STATE, { type: 'RESTORE_STATE', state: savedState });
  return computeProjection(gatherState(loaded));
}

console.log('\n=== prepareComparisonState — parity with the load path ===');

// An old-schema (v0) scenario: legacy aggregate-cuts field (triggers the 0→1
// migration), legacy sarahWorkYears (triggers the 3→4 conversion), a string
// number (type coercion), an out-of-range value (clamping), and several
// missing modern fields (defaults filled by validateAndSanitize).
const OLD_SCHEMA_SCENARIO = {
  lifestyleCuts: 1200,          // legacy aggregate — migration 0→1 seeds cut* defaults
  sarahWorkYears: 8,            // legacy — migration 3→4 converts to sarahWorkMonths=96
  sarahRate: 230,
  sarahCurrentClients: 4,
  startingSavings: 250000,
  retireDebt: true,
  msftPrice: '400.5',           // string → coerced to number
  investmentReturn: 200,        // out of range → clamped to 100
  ssdiApprovalMonth: 9,
  baseExpenses: 45000,
  // No schemaVersion (v0), no capitalItems/customLevers/leverConstraintsOverride,
  // no chadJob* fields — all must be filled with defaults, exactly as on load.
};

test('old-schema scenario compares identically to loading it (monthlyData)', () => {
  const viaCompare = computeProjection(prepareComparisonState(OLD_SCHEMA_SCENARIO));
  const viaLoad = projectViaLoadPath(OLD_SCHEMA_SCENARIO);
  assert.strictEqual(
    JSON.stringify(viaCompare.monthlyData),
    JSON.stringify(viaLoad.monthlyData),
    'compared projection monthlyData must match the load-path projection'
  );
});

test('old-schema scenario compares identically to loading it (data + savingsData)', () => {
  const viaCompare = computeProjection(prepareComparisonState(OLD_SCHEMA_SCENARIO));
  const viaLoad = projectViaLoadPath(OLD_SCHEMA_SCENARIO);
  assert.strictEqual(JSON.stringify(viaCompare.data), JSON.stringify(viaLoad.data));
  assert.strictEqual(JSON.stringify(viaCompare.savingsData), JSON.stringify(viaLoad.savingsData));
});

test('migrations actually ran: sarahWorkYears=8 became sarahWorkMonths=96', () => {
  const prepared = prepareComparisonState(OLD_SCHEMA_SCENARIO);
  assert.strictEqual(prepared.sarahWorkMonths, 96);
  assert.strictEqual(prepared.sarahWorkYears, undefined, 'legacy field must be dropped');
});

test('sanitization actually ran: string msftPrice coerced, investmentReturn clamped', () => {
  const prepared = prepareComparisonState(OLD_SCHEMA_SCENARIO);
  assert.strictEqual(prepared.msftPrice, 400.5);
  assert.strictEqual(prepared.investmentReturn, 100);
});

test('current-schema scenario (gatherState output) is unchanged by the pipeline', () => {
  // Scenario saves store gatherState() output; re-running the pipeline on a
  // modern save must not shift any numbers (idempotence).
  const modern = gatherState({ ...INITIAL_STATE, sarahRate: 240, retireDebt: true });
  const saved = JSON.parse(JSON.stringify(modern)); // storage round-trip
  const viaCompare = computeProjection(prepareComparisonState(saved));
  const direct = computeProjection(modern);
  assert.strictEqual(
    JSON.stringify(viaCompare.monthlyData),
    JSON.stringify(direct.monthlyData),
    'modern scenario must compare identically to its direct projection'
  );
});

test('null/undefined compared state falls back to defaults instead of crashing', () => {
  const prepared = prepareComparisonState(null);
  assert.strictEqual(prepared.sarahRate, INITIAL_STATE.sarahRate);
  const projection = computeProjection(prepared);
  assert.ok(projection.monthlyData.length > 0);
});

console.log('\n=== FinancialModel.jsx wiring (source parity) ===');

test('compareProjections routes through prepareComparisonState, not raw c.state', () => {
  const source = fs.readFileSync(new URL('../../FinancialModel.jsx', import.meta.url), 'utf8');
  assert.ok(
    source.includes('prepareComparisonState'),
    'FinancialModel.jsx must import/use prepareComparisonState for comparisons'
  );
  assert.ok(
    !source.includes('computeProjection(c.state)'),
    'FinancialModel.jsx must not feed raw saved state into computeProjection'
  );
});

console.log(`\n${'='.repeat(60)}`);
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'='.repeat(60)}\n`);

if (failed > 0) process.exit(1);
