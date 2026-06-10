/**
 * A2 (remediation 2026-06-10, plan item 1.1): SS COLA on benefit streams.
 *
 * SS/SSDI benefits are statutorily indexed (42 U.S.C. §415(i)), but the engine
 * paid them flat forever while expenses inflated 3%/yr by default — a mixed
 * nominal/real frame that penalized the benefit-dependent path. The new
 * `ssColaRate` field (default 2.5, RANGE 0–4, D2) applies
 * (1 + cola/100)^(m/12) to ALL SS/SSDI/spousal/child streams, gated on
 * expense inflation being ON so both sides of the ledger share one frame.
 *
 * Run: node src/model/__tests__/ssCola.test.js
 */

import assert from 'node:assert';
import { INITIAL_STATE, MODEL_KEYS } from '../../state/initialState.js';
import { gatherStateWithOverrides } from '../../state/gatherState.js';
import { validateAndSanitize } from '../../state/schemaValidation.js';
import { runMonthlySimulation } from '../projection.js';

// NOTE (A1, 2026-06-10): COLA assertions use the GROSS row fields
// (ssBenefitGross / sarahSpousalGross) — the A1 interim taxability haircut
// nets the adult share afterwards and is locked in ssTaxHaircut.test.js.

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

const colaFactor = (rate, m) => Math.pow(1 + rate / 100, m / 12);

console.log('\n=== A2 — ssColaRate field (New Field Checklist) ===');

test('default value is 2.5 and the field is in MODEL_KEYS', () => {
  assert.strictEqual(INITIAL_STATE.ssColaRate, 2.5);
  assert.ok(MODEL_KEYS.includes('ssColaRate'), 'ssColaRate must be a model key');
});

test('gatherState passes ssColaRate through (default and override)', () => {
  assert.strictEqual(gatherStateWithOverrides({}).ssColaRate, 2.5);
  assert.strictEqual(gatherStateWithOverrides({ ssColaRate: 3.1 }).ssColaRate, 3.1);
});

test('schema RANGE clamps ssColaRate to 0–4', () => {
  assert.strictEqual(validateAndSanitize({ ...INITIAL_STATE, ssColaRate: 10 }).ssColaRate, 4);
  assert.strictEqual(validateAndSanitize({ ...INITIAL_STATE, ssColaRate: -2 }).ssColaRate, 0);
  assert.strictEqual(validateAndSanitize({ ...INITIAL_STATE, ssColaRate: 2.8 }).ssColaRate, 2.8);
});

console.log('\n=== A2 — COLA applied to benefit streams (engine) ===');

test('default behavior: SSDI benefit grows at ssColaRate when expense inflation is on', () => {
  // Defaults: expenseInflation=true, ssColaRate=2.5, SSDI family 6321 from m=7.
  const s = gatherStateWithOverrides({});
  const { monthlyData } = runMonthlySimulation(s);
  // m=12: one year of COLA on the family rate.
  const expected12 = Math.round(6321 * colaFactor(2.5, 12));
  assert.strictEqual(monthlyData[12].ssBenefitGross, expected12,
    `m=12 family benefit should carry one year of COLA (${expected12})`);
  // m=48 (post kids, personal rate 4214): four years of COLA.
  const expected48 = Math.round(4214 * colaFactor(2.5, 48));
  assert.strictEqual(monthlyData[48].ssBenefitGross, expected48,
    `m=48 personal benefit should carry four years of COLA (${expected48})`);
  // ssBenefitPersonal is COLA'd (then taxed, A1) by the same factors, so the
  // kids' share (ssBenefit − ssBenefitPersonal) equals the COLA'd gross kids
  // share in chart tooltips: round(6321×f) − round(4214×f) = 6479 − 4319 = 2160.
  assert.strictEqual(
    monthlyData[12].ssBenefit - monthlyData[12].ssBenefitPersonal,
    Math.round(6321 * colaFactor(2.5, 12)) - Math.round(4214 * colaFactor(2.5, 12)),
  );
});

test('override behavior: ssColaRate=0 pays flat benefits even with inflation on', () => {
  const s = gatherStateWithOverrides({ ssColaRate: 0 });
  const { monthlyData } = runMonthlySimulation(s);
  assert.strictEqual(monthlyData[12].ssBenefitGross, 6321, 'flat family rate at cola 0');
  assert.strictEqual(monthlyData[48].ssBenefitGross, 4214, 'flat personal rate at cola 0');
});

test('edge/gate: expenseInflation=false suppresses COLA regardless of rate', () => {
  const s = gatherStateWithOverrides({ expenseInflation: false, ssColaRate: 4 });
  const { monthlyData } = runMonthlySimulation(s);
  assert.strictEqual(monthlyData[12].ssBenefitGross, 6321, 'no COLA when inflation toggle is off');
  assert.strictEqual(monthlyData[48].ssBenefitGross, 4214, 'no COLA when inflation toggle is off');
});

test('SS retirement stream is COLA\'d too', () => {
  const s = gatherStateWithOverrides({ ssType: 'ss', ssClaimAge: 62, ssPIA: 4214, chadConsulting: 0 });
  const { monthlyData } = runMonthlySimulation(s);
  // ssStartMonth 19, family total 6110 (B5 bend-point max).
  const expected = Math.round(s.ssFamilyTotal * colaFactor(2.5, 19));
  assert.strictEqual(monthlyData[19].ssBenefitGross, expected,
    `SS family at m=19 should be COLA'd to ${expected}`);
});

test('Sarah\'s spousal benefit is COLA\'d by the same factor', () => {
  // Chad takes SS at 62 (claims at m=19); Sarah (59) claims spousal at 62 →
  // start m=(62−59)×12=36. Spousal = round(2107 × factor(62)) = round(2107 × 0.70) = 1475.
  const s = gatherStateWithOverrides({
    ssType: 'ss', ssClaimAge: 62, ssPIA: 4214, chadConsulting: 0,
    sarahSpousalEnabled: true, sarahSpousalClaimAge: 62, sarahCurrentAge: 59,
  });
  const { monthlyData } = runMonthlySimulation(s);
  const expected = Math.round(s.sarahSpousalAmount * colaFactor(2.5, 36));
  assert.strictEqual(monthlyData[36].sarahSpousalGross, expected,
    `spousal at m=36 should be COLA'd to ${expected} (gross ${s.sarahSpousalAmount})`);
});

test('m=0 carries no COLA (factor 1) on any path', () => {
  const s = gatherStateWithOverrides({ ssdiApprovalMonth: 0 });
  const { monthlyData } = runMonthlySimulation(s);
  assert.strictEqual(monthlyData[0].ssBenefitGross, 6321, 'month 0 is the baseline — no COLA yet');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
