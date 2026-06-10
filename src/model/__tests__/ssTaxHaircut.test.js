/**
 * A1 (remediation 2026-06-10, plan item 1.2): INTERIM SS taxability haircut.
 *
 * SS/SSDI benefits and the back-pay lump previously flowed into cash flow
 * completely untaxed. With Sarah's Schedule C profit, MFJ provisional income
 * is far above the $44,000 tier, so 85% of the ADULT benefit is federally
 * taxable (IRC §86, Pub 915) — ~$57k of overstated savings over 72 months.
 *
 * INTERIM until Phase 7 wires taxMode='engine' into the simulation: the adult
 * share of ssBenefit, sarahSpousal, and adult back pay are haircut by an
 * effective rate = 0.85 (taxable share) × 0.22 (household MFJ marginal
 * estimate) = 18.7%. Kids' auxiliary share is the KIDS' income (Pub 915) and
 * stays untaxed.
 *
 * Run: node src/model/__tests__/ssTaxHaircut.test.js
 */

import assert from 'node:assert';
import { gatherStateWithOverrides } from '../../state/gatherState.js';
import {
  runMonthlySimulation,
  SS_INTERIM_TAX_HAIRCUT,
  applyInterimSsTax,
} from '../projection.js';

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

const netAdult = (g) => Math.round(g * (1 - SS_INTERIM_TAX_HAIRCUT));

console.log('\n=== A1 — interim SS taxability haircut ===');

test('haircut rate is 0.85 × 0.22 = 18.7% (interim until P7 engine wiring)', () => {
  assert.ok(Math.abs(SS_INTERIM_TAX_HAIRCUT - 0.187) < 1e-12);
});

test('SSDI family benefit: adult share taxed, kids share untaxed', () => {
  // Inflation off isolates the haircut from A2 COLA.
  const s = gatherStateWithOverrides({ expenseInflation: false });
  const { monthlyData } = runMonthlySimulation(s);
  // m=7 (approval): family 6321 = adult 4214 + kids 2107.
  // Net = 2107 + round(4214 × 0.813) = 2107 + 3426 = 5533.
  assert.strictEqual(monthlyData[7].ssBenefit, 2107 + netAdult(4214));
  assert.strictEqual(monthlyData[7].ssBenefit, 5533);
  // Gross is preserved on the row for tax-layer parity and tooltips.
  assert.strictEqual(monthlyData[7].ssBenefitGross, 6321);
  // ssBenefitPersonal is net-of-tax by the same rate so the kids' share
  // (ssBenefit − ssBenefitPersonal) still equals the kids' gross 2107.
  assert.strictEqual(monthlyData[7].ssBenefitPersonal, netAdult(4214));
  assert.strictEqual(monthlyData[7].ssBenefit - monthlyData[7].ssBenefitPersonal, 2107);
});

test('SSDI personal benefit after kids age out: fully adult, taxed', () => {
  const s = gatherStateWithOverrides({ expenseInflation: false });
  const { monthlyData } = runMonthlySimulation(s);
  // m=48 (post student-rule window): personal 4214 → 3426.
  assert.strictEqual(monthlyData[48].ssBenefit, netAdult(4214));
  assert.strictEqual(monthlyData[48].ssBenefit, 3426);
});

test('back pay: adult share haircut by 18.7%, kids aux untaxed, fee unchanged', () => {
  // Defaults: 18 months × 4214 adult = 75,852 gross; aux 18 × 2107 = 37,926;
  // fee = min(25% × 75,852, 9,200) = 9,200; tax = round(75,852 × 0.187) = 14,184.
  // Net deposit = 75,852 + 37,926 − 9,200 − 14,184 = 90,394.
  const s = gatherStateWithOverrides({});
  const { backPayActual, backPayTax } = runMonthlySimulation(s);
  assert.strictEqual(backPayTax, Math.round(75852 * SS_INTERIM_TAX_HAIRCUT));
  assert.strictEqual(backPayTax, 14184);
  assert.strictEqual(backPayActual, 75852 + 37926 - 9200 - 14184);
  assert.strictEqual(backPayActual, 90394);
});

test('Sarah spousal benefit is haircut as adult income', () => {
  const s = gatherStateWithOverrides({
    ssType: 'ss', ssClaimAge: 62, ssPIA: 4214, chadConsulting: 0,
    sarahSpousalEnabled: true, sarahSpousalClaimAge: 62, sarahCurrentAge: 59,
    expenseInflation: false,
  });
  const { monthlyData } = runMonthlySimulation(s);
  // Spousal gross = round(2107 × 0.70) = 1475 → net = round(1475 × 0.813) = 1199.
  assert.strictEqual(s.sarahSpousalAmount, 1475);
  assert.strictEqual(monthlyData[36].sarahSpousal, netAdult(1475));
  assert.strictEqual(monthlyData[36].sarahSpousalGross, 1475);
});

test('haircut composes with A2 COLA (COLA first, then tax)', () => {
  const s = gatherStateWithOverrides({}); // inflation on, cola 2.5
  const { monthlyData } = runMonthlySimulation(s);
  // m=12: gross family = round(6321 × 1.025) = 6479; gross personal = round(4214 × 1.025) = 4319.
  // Net = (6479 − 4319) + round(4319 × 0.813) = 2160 + 3511 = 5671.
  assert.strictEqual(monthlyData[12].ssBenefitGross, 6479);
  assert.strictEqual(monthlyData[12].ssBenefit, (6479 - 4319) + netAdult(4319));
});

test('applyInterimSsTax: earnings-test-reduced benefit below the adult share is fully adult', () => {
  // If the earnings test cuts the total below the personal amount, the whole
  // remainder is the worker's (adult) benefit — taxed in full.
  assert.strictEqual(applyInterimSsTax(2000, 4214), Math.round(2000 * (1 - SS_INTERIM_TAX_HAIRCUT)));
  // Zero benefit stays zero.
  assert.strictEqual(applyInterimSsTax(0, 4214), 0);
});

test('denied SSDI: nothing to haircut (benefit and back pay stay 0)', () => {
  const s = gatherStateWithOverrides({ ssdiDenied: true });
  const { monthlyData, backPayActual, backPayTax } = runMonthlySimulation(s);
  assert.ok(monthlyData.every((d) => d.ssBenefit === 0));
  assert.strictEqual(backPayActual, 0);
  assert.strictEqual(backPayTax, 0);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
