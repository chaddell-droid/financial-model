/**
 * Tax tab wiring tests (remediation 2026-06-09, Phase 3 Decision D1).
 *
 * The Tax tab tree (TaxTab → TaxSettingsPanel + TaxVisualization + 5 tax
 * charts) was fully built but unreachable: no TabBar entry, no render branch,
 * and none of the tax* control fields existed in the model state. Worse, both
 * panels fed buildTaxSchedule a hand-built ~20-field subset of state that
 * omitted ALL of Chad's stock/bonus/pension/401k comp fields, so the engine
 * silently under-reported W-2 wages whenever Chad had stock comp.
 *
 * Covers:
 *   1. New-field checklist: all 15 tax* fields in MODEL_KEYS, defaults match
 *      the engine's `??` fallbacks, round-trip (default / override / edge).
 *   2. Display parity: buildTaxSchedule fed the GATHERED state includes
 *      Chad's stock comp in year-1 wages.
 *   3. Source smoke tests: tab reachable (TabBar has 'tax', FinancialModel
 *      renders the branch) and panels pass the full gathered state.
 *
 * Run with: node src/state/__tests__/taxTabWiring.test.js
 */
import assert from 'node:assert';
import fs from 'node:fs';
import { INITIAL_STATE, MODEL_KEYS } from '../initialState.js';
import { gatherState, gatherStateWithOverrides } from '../gatherState.js';
import { validateAndSanitize, migrate } from '../schemaValidation.js';
import { buildTaxSchedule } from '../../model/taxProjection.js';

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

function roundTrip(stateOverrides) {
  const fullState = { ...INITIAL_STATE, ...stateOverrides };
  const gathered = gatherState(fullState);
  const serialized = JSON.parse(JSON.stringify(gathered));
  return validateAndSanitize(migrate(serialized));
}

function readSource(relPath) {
  return fs.readFileSync(new URL(relPath, import.meta.url), 'utf8');
}

// The 15 tax* control fields TaxSettingsPanel/TaxVisualization consume.
const TAX_FIELDS = [
  'taxMode', 'taxInflationAdjust', 'taxInflationRate', 'taxSchCExpenseRatio',
  'taxPropertyTax', 'taxSalesTax', 'taxPersonalPropTax', 'taxMortgageInt',
  'taxCharitable', 'taxMedical', 'taxW2Withholding', 'taxCtcChildren',
  'taxOdcDependents', 'taxCapGainLoss', 'taxSolo401k',
];

// ════════════════════════════════════════════════════════════════════════
// 1. New Field Checklist — MODEL_KEYS membership + defaults
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Tax fields — MODEL_KEYS membership + engine-default parity ===');

test('all 15 tax* fields are MODEL_KEYS', () => {
  const missing = TAX_FIELDS.filter((k) => !MODEL_KEYS.includes(k));
  assert.deepStrictEqual(missing, [], `tax fields missing from MODEL_KEYS: ${missing.join(', ')}`);
});

test('all 15 tax* fields have INITIAL_STATE defaults', () => {
  const missing = TAX_FIELDS.filter((k) => !(k in INITIAL_STATE));
  assert.deepStrictEqual(missing, [], `tax fields missing from INITIAL_STATE: ${missing.join(', ')}`);
});

test('INITIAL_STATE tax defaults match the engine fallbacks (?? defaults in taxProjection.js)', () => {
  // These MUST stay in lockstep with getTaxInputs/buildTaxSchedule fallbacks,
  // otherwise adding the fields to MODEL_KEYS changes every locked tax number.
  assert.strictEqual(INITIAL_STATE.taxMode, 'flat');
  assert.strictEqual(INITIAL_STATE.taxInflationAdjust, false);
  assert.strictEqual(INITIAL_STATE.taxInflationRate, 2);
  assert.strictEqual(INITIAL_STATE.taxSchCExpenseRatio, 25);
  assert.strictEqual(INITIAL_STATE.taxPropertyTax, 0);
  assert.strictEqual(INITIAL_STATE.taxSalesTax, 0);
  assert.strictEqual(INITIAL_STATE.taxPersonalPropTax, 0);
  assert.strictEqual(INITIAL_STATE.taxMortgageInt, 0);
  assert.strictEqual(INITIAL_STATE.taxCharitable, 0);
  assert.strictEqual(INITIAL_STATE.taxMedical, 0);
  assert.strictEqual(INITIAL_STATE.taxW2Withholding, 0);
  assert.strictEqual(INITIAL_STATE.taxCtcChildren, 2);
  assert.strictEqual(INITIAL_STATE.taxOdcDependents, 0);
  assert.strictEqual(INITIAL_STATE.taxCapGainLoss, -3000);
  assert.strictEqual(INITIAL_STATE.taxSolo401k, 0);
});

test('buildTaxSchedule output is IDENTICAL with default tax fields present vs absent (no regression)', () => {
  // Locks the property the previous two tests imply: putting the tax fields
  // into gathered state must not move a single engine number at defaults.
  const g = gatherStateWithOverrides({ chadJob: true, chadJobStartMonth: 0, chadJobSalary: 180000 });
  const stripped = { ...g };
  for (const k of TAX_FIELDS) delete stripped[k];
  assert.deepStrictEqual(buildTaxSchedule(g), buildTaxSchedule(stripped));
});

// ════════════════════════════════════════════════════════════════════════
// 2. Round-trip — default / override / edge
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Tax fields — save/load round-trip ===');

test('tax* defaults survive round-trip (default behavior)', () => {
  const result = roundTrip({});
  for (const k of TAX_FIELDS) {
    assert.strictEqual(result[k], INITIAL_STATE[k], `${k} default mismatch: got ${result[k]}`);
  }
});

test('tax* overrides survive round-trip (override behavior)', () => {
  const overrides = {
    taxMode: 'engine',
    taxInflationAdjust: true,
    taxInflationRate: 3.5,
    taxSchCExpenseRatio: 30,
    taxPropertyTax: 9000,
    taxSalesTax: 3500,
    taxPersonalPropTax: 1200,
    taxMortgageInt: 18000,
    taxCharitable: 6000,
    taxMedical: 8000,
    taxW2Withholding: 25000,
    taxCtcChildren: 1,
    taxOdcDependents: 1,
    taxCapGainLoss: 5000,
    taxSolo401k: 12000,
  };
  const result = roundTrip(overrides);
  for (const [k, v] of Object.entries(overrides)) {
    assert.strictEqual(result[k], v, `${k} expected ${v}, got ${result[k]}`);
  }
});

test('tax* RANGE constraints clamp out-of-range values (edge)', () => {
  assert.strictEqual(roundTrip({ taxInflationRate: 99 }).taxInflationRate, 10, 'taxInflationRate max');
  assert.strictEqual(roundTrip({ taxInflationRate: -1 }).taxInflationRate, 0, 'taxInflationRate min');
  assert.strictEqual(roundTrip({ taxSchCExpenseRatio: 95 }).taxSchCExpenseRatio, 80, 'taxSchCExpenseRatio max');
  assert.strictEqual(roundTrip({ taxPropertyTax: 1e9 }).taxPropertyTax, 50000, 'taxPropertyTax max');
  assert.strictEqual(roundTrip({ taxSalesTax: -500 }).taxSalesTax, 0, 'taxSalesTax min');
  assert.strictEqual(roundTrip({ taxPersonalPropTax: 99999 }).taxPersonalPropTax, 10000, 'taxPersonalPropTax max');
  assert.strictEqual(roundTrip({ taxMortgageInt: 5e6 }).taxMortgageInt, 100000, 'taxMortgageInt max');
  assert.strictEqual(roundTrip({ taxCharitable: -1 }).taxCharitable, 0, 'taxCharitable min');
  assert.strictEqual(roundTrip({ taxMedical: 1e7 }).taxMedical, 200000, 'taxMedical max');
  assert.strictEqual(roundTrip({ taxW2Withholding: 5e5 }).taxW2Withholding, 100000, 'taxW2Withholding max');
  assert.strictEqual(roundTrip({ taxCtcChildren: 50 }).taxCtcChildren, 10, 'taxCtcChildren max');
  assert.strictEqual(roundTrip({ taxCtcChildren: -2 }).taxCtcChildren, 0, 'taxCtcChildren min');
  assert.strictEqual(roundTrip({ taxOdcDependents: 25 }).taxOdcDependents, 10, 'taxOdcDependents max');
  assert.strictEqual(roundTrip({ taxCapGainLoss: -9e6 }).taxCapGainLoss, -100000, 'taxCapGainLoss min');
  assert.strictEqual(roundTrip({ taxCapGainLoss: 9e6 }).taxCapGainLoss, 100000, 'taxCapGainLoss max');
  assert.strictEqual(roundTrip({ taxSolo401k: 99999 }).taxSolo401k, 70000, 'taxSolo401k max');
});

test('taxMode enum: both values round-trip; invalid resets to flat (edge)', () => {
  assert.strictEqual(roundTrip({ taxMode: 'flat' }).taxMode, 'flat');
  assert.strictEqual(roundTrip({ taxMode: 'engine' }).taxMode, 'engine');
  assert.strictEqual(roundTrip({ taxMode: 'bogus' }).taxMode, 'flat');
});

test('tax* string corruption coerces back to numeric defaults (edge)', () => {
  const result = roundTrip({ taxPropertyTax: 'not-a-number', taxCtcChildren: 'NaN' });
  assert.strictEqual(result.taxPropertyTax, INITIAL_STATE.taxPropertyTax);
  assert.strictEqual(result.taxCtcChildren, INITIAL_STATE.taxCtcChildren);
});

// ════════════════════════════════════════════════════════════════════════
// 3. gatherState passthrough
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Tax fields — gatherState passthrough ===');

test('gatherState passes tax* fields through (defaults)', () => {
  const g = gatherStateWithOverrides({});
  for (const k of TAX_FIELDS) {
    assert.strictEqual(g[k], INITIAL_STATE[k], `${k} not passed through gatherState`);
  }
});

test('gatherState passes tax* overrides through', () => {
  const g = gatherStateWithOverrides({ taxMode: 'engine', taxSchCExpenseRatio: 40, taxCapGainLoss: 10000 });
  assert.strictEqual(g.taxMode, 'engine');
  assert.strictEqual(g.taxSchCExpenseRatio, 40);
  assert.strictEqual(g.taxCapGainLoss, 10000);
});

// ════════════════════════════════════════════════════════════════════════
// 4. Display parity — full gathered state reaches buildTaxSchedule
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Display parity — gathered state includes Chad stock comp ===');

const PARITY_BASE = {
  chadJob: true, chadJobStartMonth: 0, chadJobSalary: 200000,
  chadJobBonusPct: 0, chadJobStockRefresh: 0, chadJobSignOnCash: 0,
  msftGrowth: 0, chadWorkMonths: 60, sarahWorkMonths: 72,
};

test('PARITY-1: hire stock Y1 lands in year-1 W-2 gross via the gathered state', () => {
  // The old hand-built ~20-field subset in TaxSettingsPanel/TaxVisualization
  // omitted chadJobHireStockY1-Y4 entirely, so $50K of vesting stock was
  // invisible to the displayed tax schedule. Fed the FULL gathered state, the
  // year-1 anniversary vest (monthsWorked=12 → month 12 → year index 1) must
  // raise chadW2Gross by exactly the grant (msftGrowth=0 ⇒ multiplier 1).
  const noStock = buildTaxSchedule(gatherStateWithOverrides(PARITY_BASE));
  const withStock = buildTaxSchedule(gatherStateWithOverrides({ ...PARITY_BASE, chadJobHireStockY1: 50000 }));
  assert.strictEqual(
    withStock[1].chadW2Gross - noStock[1].chadW2Gross, 50000,
    `year-1 W-2 gross must include the $50K hire-stock vest; ` +
    `got ${withStock[1].chadW2Gross} vs ${noStock[1].chadW2Gross}`
  );
});

test('PARITY-2: refresh stock grants raise year-1 W-2 gross via the gathered state', () => {
  const noStock = buildTaxSchedule(gatherStateWithOverrides(PARITY_BASE));
  const withRefresh = buildTaxSchedule(gatherStateWithOverrides({
    ...PARITY_BASE, chadJobStockRefresh: 60000, chadJobRefreshStartMonth: 0,
  }));
  assert.ok(
    withRefresh[1].chadW2Gross > noStock[1].chadW2Gross,
    `refresh-grant vests must appear in year-1 W-2 gross; ` +
    `got ${withRefresh[1].chadW2Gross} vs ${noStock[1].chadW2Gross}`
  );
});

test('PARITY-3: bonus comp lands in year-0 W-2 gross via the gathered state', () => {
  const noBonus = buildTaxSchedule(gatherStateWithOverrides(PARITY_BASE));
  const withBonus = buildTaxSchedule(gatherStateWithOverrides({ ...PARITY_BASE, chadJobBonusPct: 10 }));
  assert.ok(
    withBonus[0].chadW2Gross > noBonus[0].chadW2Gross,
    `bonus must appear in year-0 W-2 gross; got ${withBonus[0].chadW2Gross} vs ${noBonus[0].chadW2Gross}`
  );
});

test('PARITY-4: panels feed buildTaxSchedule the gathered state, not a hand-built subset', () => {
  for (const rel of ['../../panels/TaxSettingsPanel.jsx', '../../charts/TaxVisualization.jsx']) {
    const source = readSource(rel);
    assert.ok(
      source.includes('buildTaxSchedule(gatherState())'),
      `${rel} must call buildTaxSchedule(gatherState())`
    );
    assert.ok(
      !source.includes('chadRetirementMonth: 72'),
      `${rel} must no longer hand-build a partial state (hardcoded chadRetirementMonth: 72 found)`
    );
    assert.ok(
      !source.includes('chadJobStartMonth ?? 3'),
      `${rel} must no longer default chadJobStartMonth to 3 (engine default is 0)`
    );
  }
});

// ════════════════════════════════════════════════════════════════════════
// 5. Smoke — the Tax tab is reachable
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Smoke — Tax tab reachable ===');

test('SMOKE-1: TabBar TABS contains the tax entry', () => {
  const source = readSource('../../components/TabBar.jsx');
  assert.ok(/\{\s*id:\s*'tax'/.test(source), "TabBar.jsx TABS must contain { id: 'tax', ... }");
  assert.ok(/tax:\s*UI_COLORS\./.test(source), 'TabBar.jsx ACCENT_COLORS must include a tax accent');
  assert.ok(
    !source.includes("repeat(8, minmax(0, 1fr))"),
    'TabBar grid must size from TABS.length, not a hardcoded 8 columns'
  );
});

test('SMOKE-2: FinancialModel renders TaxTab on the tax branch', () => {
  const source = readSource('../../FinancialModel.jsx');
  assert.ok(source.includes("effectiveTab === 'tax'"), "FinancialModel.jsx must branch on effectiveTab === 'tax'");
  assert.ok(source.includes('<TaxTab'), 'FinancialModel.jsx must render <TaxTab>');
  assert.ok(/import TaxTab from '\.\/panels\/tabs\/TaxTab\.jsx'/.test(source), 'FinancialModel.jsx must import TaxTab');
});

test('SMOKE-3: tax tab hides the rail like the other full-width tabs', () => {
  const source = readSource('../../FinancialModel.jsx');
  const m = source.match(/noRailTabs = new Set\(\[([^\]]*)\]\)/);
  assert.ok(m, 'noRailTabs Set must exist');
  assert.ok(m[1].includes("'tax'"), `noRailTabs must include 'tax'; got [${m[1]}]`);
});

test('SMOKE-4: taxProjection docstring no longer claims the projection loop consumes the schedule', () => {
  const source = readSource('../../model/taxProjection.js');
  const header = source.slice(0, source.indexOf('*/'));
  assert.ok(
    !header.includes('The projection loop looks up'),
    'taxProjection.js header must not claim the projection loop consumes the schedule'
  );
  assert.ok(
    /display[- ]only/i.test(header),
    'taxProjection.js header must state the engine is display-only for now'
  );
});

console.log(`\n${'='.repeat(60)}`);
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'='.repeat(60)}\n`);

if (failed > 0) process.exit(1);
