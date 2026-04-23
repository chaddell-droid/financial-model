/**
 * Unit tests for the preview sandbox state layer:
 *   • composePreviewState (pure utility in previewState.js)
 *   • reducer actions APPLY/REMOVE/CLEAR/COMMIT_PREVIEW
 *   • gatherState auto-composition when previewMoves is present
 *   • autoSave excludes previewMoves from persisted state
 *
 * Run with: node src/state/__tests__/previewState.test.js
 */
import assert from 'node:assert';
import { composePreviewState } from '../previewState.js';
import { reducer } from '../reducer.js';
import { gatherState, gatherStateWithOverrides } from '../gatherState.js';
import { extractModelState } from '../autoSave.js';
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

// Helpers
function baseReducerState() {
  return { ...INITIAL_STATE };
}
const MOVE_RETIRE_DEBT = { id: 'retire_debt', label: 'Retire all debt', mutation: { retireDebt: true } };
const MOVE_SELL_VAN = { id: 'sell_van', label: 'Sell the van', mutation: { vanSold: true, vanSaleMonth: 12 } };
const MOVE_CUTS = { id: 'spending_cuts', label: 'Apply cuts', mutation: { lifestyleCutsApplied: true, cutsOverride: 1200 } };

// ════════════════════════════════════════════════════════════════════════
// composePreviewState — pure utility
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== composePreviewState ===');

test('1. Empty previewMoves returns baseline unchanged', () => {
  const baseline = { retireDebt: false, vanSold: false };
  assert.strictEqual(composePreviewState(baseline, []), baseline, 'empty array should return same reference');
  assert.strictEqual(composePreviewState(baseline, null), baseline, 'null should return baseline');
  assert.strictEqual(composePreviewState(baseline, undefined), baseline, 'undefined should return baseline');
});

test('2. Single move mutation is applied', () => {
  const baseline = { retireDebt: false, vanSold: false };
  const composed = composePreviewState(baseline, [MOVE_RETIRE_DEBT]);
  assert.strictEqual(composed.retireDebt, true, 'retireDebt should be true');
  assert.strictEqual(composed.vanSold, false, 'vanSold untouched should be false');
  assert.notStrictEqual(composed, baseline, 'should return a new object');
});

test('3. Multiple mutations applied in order', () => {
  const baseline = { retireDebt: false, vanSold: false, lifestyleCutsApplied: false, cutsOverride: 0 };
  const composed = composePreviewState(baseline, [MOVE_RETIRE_DEBT, MOVE_SELL_VAN, MOVE_CUTS]);
  assert.strictEqual(composed.retireDebt, true);
  assert.strictEqual(composed.vanSold, true);
  assert.strictEqual(composed.lifestyleCutsApplied, true);
  assert.strictEqual(composed.cutsOverride, 1200);
});

test('4. Later move wins when keys overlap (array order = precedence)', () => {
  const baseline = { cutsOverride: 0 };
  const first = { id: 'first', label: 'First', mutation: { cutsOverride: 500 } };
  const second = { id: 'second', label: 'Second', mutation: { cutsOverride: 1500 } };
  const composed = composePreviewState(baseline, [first, second]);
  assert.strictEqual(composed.cutsOverride, 1500, 'later move should win on key overlap');
});

test('5. Null/malformed moves in the array are skipped safely', () => {
  const baseline = { retireDebt: false };
  const composed = composePreviewState(baseline, [null, { id: 'x' }, MOVE_RETIRE_DEBT, {}, { mutation: null }]);
  assert.strictEqual(composed.retireDebt, true, 'valid move should still apply');
});

// ════════════════════════════════════════════════════════════════════════
// Reducer actions — APPLY / REMOVE / CLEAR / COMMIT
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== reducer actions ===');

test('6. APPLY_PREVIEW_MOVE appends new move to previewMoves', () => {
  const s = baseReducerState();
  assert.deepStrictEqual(s.previewMoves, [], 'precondition: previewMoves starts empty');
  const next = reducer(s, { type: 'APPLY_PREVIEW_MOVE', move: MOVE_RETIRE_DEBT });
  assert.strictEqual(next.previewMoves.length, 1);
  assert.strictEqual(next.previewMoves[0].id, 'retire_debt');
  assert.strictEqual(next.retireDebt, false, 'APPLY should not mutate baseline state directly');
});

test('7. APPLY_PREVIEW_MOVE with existing id replaces in place (preserves ordering)', () => {
  let s = baseReducerState();
  s = reducer(s, { type: 'APPLY_PREVIEW_MOVE', move: MOVE_RETIRE_DEBT });
  s = reducer(s, { type: 'APPLY_PREVIEW_MOVE', move: MOVE_SELL_VAN });
  s = reducer(s, { type: 'APPLY_PREVIEW_MOVE', move: MOVE_CUTS });
  assert.strictEqual(s.previewMoves.length, 3);
  // Now re-apply retire_debt with a different label — should replace position 0, not append
  const newRetire = { id: 'retire_debt', label: 'Retire debt (updated)', mutation: { retireDebt: true } };
  s = reducer(s, { type: 'APPLY_PREVIEW_MOVE', move: newRetire });
  assert.strictEqual(s.previewMoves.length, 3, 'length unchanged when replacing');
  assert.strictEqual(s.previewMoves[0].label, 'Retire debt (updated)', 'position 0 replaced');
  assert.strictEqual(s.previewMoves[1].id, 'sell_van', 'position 1 preserved');
  assert.strictEqual(s.previewMoves[2].id, 'spending_cuts', 'position 2 preserved');
});

test('8. APPLY_PREVIEW_MOVE with malformed action returns state unchanged', () => {
  const s = baseReducerState();
  const a = reducer(s, { type: 'APPLY_PREVIEW_MOVE', move: null });
  assert.strictEqual(a, s, 'null move should return original state reference');
  const b = reducer(s, { type: 'APPLY_PREVIEW_MOVE', move: { label: 'no id or mutation' } });
  assert.strictEqual(b, s, 'missing id/mutation should return original state');
});

test('9. REMOVE_PREVIEW_MOVE filters by id', () => {
  let s = baseReducerState();
  s = reducer(s, { type: 'APPLY_PREVIEW_MOVE', move: MOVE_RETIRE_DEBT });
  s = reducer(s, { type: 'APPLY_PREVIEW_MOVE', move: MOVE_SELL_VAN });
  s = reducer(s, { type: 'REMOVE_PREVIEW_MOVE', id: 'retire_debt' });
  assert.strictEqual(s.previewMoves.length, 1);
  assert.strictEqual(s.previewMoves[0].id, 'sell_van');
});

test('10. REMOVE_PREVIEW_MOVE on unknown id is a no-op', () => {
  let s = baseReducerState();
  s = reducer(s, { type: 'APPLY_PREVIEW_MOVE', move: MOVE_RETIRE_DEBT });
  const before = s.previewMoves;
  s = reducer(s, { type: 'REMOVE_PREVIEW_MOVE', id: 'does-not-exist' });
  assert.strictEqual(s.previewMoves.length, 1);
  assert.deepStrictEqual(s.previewMoves, before);
});

test('11. CLEAR_PREVIEW empties the list', () => {
  let s = baseReducerState();
  s = reducer(s, { type: 'APPLY_PREVIEW_MOVE', move: MOVE_RETIRE_DEBT });
  s = reducer(s, { type: 'APPLY_PREVIEW_MOVE', move: MOVE_SELL_VAN });
  s = reducer(s, { type: 'APPLY_PREVIEW_MOVE', move: MOVE_CUTS });
  assert.strictEqual(s.previewMoves.length, 3);
  s = reducer(s, { type: 'CLEAR_PREVIEW' });
  assert.deepStrictEqual(s.previewMoves, []);
  // baseline state untouched
  assert.strictEqual(s.retireDebt, false);
  assert.strictEqual(s.vanSold, false);
  assert.strictEqual(s.lifestyleCutsApplied, false);
});

test('12. COMMIT_PREVIEW atomically merges all mutations and clears preview', () => {
  let s = baseReducerState();
  s = reducer(s, { type: 'APPLY_PREVIEW_MOVE', move: MOVE_RETIRE_DEBT });
  s = reducer(s, { type: 'APPLY_PREVIEW_MOVE', move: MOVE_SELL_VAN });
  s = reducer(s, { type: 'APPLY_PREVIEW_MOVE', move: MOVE_CUTS });
  const committed = reducer(s, { type: 'COMMIT_PREVIEW' });
  // Baseline now reflects all mutations
  assert.strictEqual(committed.retireDebt, true, 'retireDebt committed');
  assert.strictEqual(committed.vanSold, true, 'vanSold committed');
  assert.strictEqual(committed.vanSaleMonth, 12, 'vanSaleMonth committed');
  assert.strictEqual(committed.lifestyleCutsApplied, true, 'lifestyleCutsApplied committed');
  assert.strictEqual(committed.cutsOverride, 1200, 'cutsOverride committed');
  // Preview cleared
  assert.deepStrictEqual(committed.previewMoves, [], 'previewMoves emptied after commit');
});

test('13. COMMIT_PREVIEW with empty preview is a no-op', () => {
  const s = baseReducerState();
  const after = reducer(s, { type: 'COMMIT_PREVIEW' });
  assert.strictEqual(after, s, 'empty commit should return original state reference');
});

// ════════════════════════════════════════════════════════════════════════
// gatherState auto-composition
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== gatherState auto-composition ===');

test('14. gatherState with empty previewMoves matches plain gatherState', () => {
  const s = { ...INITIAL_STATE, previewMoves: [] };
  const composed = gatherState(s);
  const plain = gatherStateWithOverrides({});
  // Compare a handful of derived fields to ensure no composition leak
  assert.strictEqual(composed.retireDebt, plain.retireDebt);
  assert.strictEqual(composed.vanSold, plain.vanSold);
  assert.strictEqual(composed.lifestyleCutsApplied, plain.lifestyleCutsApplied);
  assert.strictEqual(composed.bcsFamilyMonthly, plain.bcsFamilyMonthly);
});

test('15. gatherState applies previewMoves mutations before derivations', () => {
  // Verify derivations RE-compute after mutations, not from stale state.
  // Example: bcsFamilyMonthly = round(max(0, bcsAnnualTotal - bcsParentsAnnual) / 12)
  // Default: (43400 - 25000) / 12 ≈ 1533. If we mutate bcsParentsAnnual to 43400
  // via a preview move, the composed bcsFamilyMonthly must be 0 (fully covered).
  const previewMove = {
    id: 'bcs_fully_covered',
    label: 'BCS fully covered',
    mutation: { bcsParentsAnnual: 43400 },
  };
  const s = { ...INITIAL_STATE, previewMoves: [previewMove] };
  const composed = gatherState(s);
  assert.strictEqual(composed.bcsParentsAnnual, 43400, 'mutation should be applied');
  assert.strictEqual(composed.bcsFamilyMonthly, 0, 'derivation re-runs after mutation');
});

test('16. gatherState output never contains previewMoves (not in MODEL_KEYS)', () => {
  const s = { ...INITIAL_STATE, previewMoves: [MOVE_RETIRE_DEBT] };
  const composed = gatherState(s);
  assert.strictEqual('previewMoves' in composed, false, 'composed output should not carry previewMoves forward');
});

// ════════════════════════════════════════════════════════════════════════
// autoSave filter — preview is NEVER persisted (NFR8 / FR38)
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== autoSave filter (preview never persisted) ===');

test('17. extractModelState strips previewMoves from persisted state', () => {
  let s = baseReducerState();
  s = reducer(s, { type: 'APPLY_PREVIEW_MOVE', move: MOVE_RETIRE_DEBT });
  s = reducer(s, { type: 'APPLY_PREVIEW_MOVE', move: MOVE_SELL_VAN });
  assert.strictEqual(s.previewMoves.length, 2, 'precondition: preview has 2 moves');

  const persisted = extractModelState(s);
  assert.strictEqual('previewMoves' in persisted, false, 'persisted state must not contain previewMoves');
  // Sanity: legitimate MODEL_KEYS fields still persist
  assert.strictEqual(persisted.retireDebt, false, 'baseline retireDebt (still false) persists');
  assert.strictEqual(persisted.vanSold, false, 'baseline vanSold (still false) persists');
});

test('18. Round-trip: apply preview → extract for save → preview is lost (correct behavior)', () => {
  let s = baseReducerState();
  s = reducer(s, { type: 'APPLY_PREVIEW_MOVE', move: MOVE_RETIRE_DEBT });
  const persisted = extractModelState(s);
  // Simulate a reload: new initial state + spread the persisted model keys on top
  const reloaded = { ...INITIAL_STATE, ...persisted };
  assert.deepStrictEqual(reloaded.previewMoves, [], 'preview must be empty on reload — strictly in-memory');
  assert.strictEqual(reloaded.retireDebt, false, 'baseline preserved');
});

// ════════════════════════════════════════════════════════════════════════
// Summary
// ════════════════════════════════════════════════════════════════════════
console.log(`\n${'='.repeat(50)}`);
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'='.repeat(50)}\n`);

if (failed > 0) process.exit(1);
