/**
 * Pure-function tests for the rail config mutators (remediation Phase 9 —
 * useRailConfig's logic, extracted into railConfigOps.js so it can be tested
 * without React).
 *
 * Run with: node src/rail/__tests__/railConfigOps.test.js
 */
import assert from 'node:assert';
import {
  mergeLoadedRailConfig,
  getTabChartsFromConfig,
  setTabChartsOp,
  addChartOp,
  removeChartOp,
  moveChartOp,
  resetTabOp,
  isTabModifiedOp,
} from '../railConfigOps.js';
import { DEFAULT_RAIL_CONFIG, RAIL_TABS } from '../railDefaults.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${e.message}`);
  }
}

console.log('\n=== mergeLoadedRailConfig ===');

test('partial loaded config merges over defaults; untouched tabs keep defaults', () => {
  const merged = mergeLoadedRailConfig({ overview: ['bridge'], risk: [] });
  assert.deepStrictEqual(merged.overview, ['bridge']);
  assert.deepStrictEqual(merged.risk, []);
  assert.deepStrictEqual(merged.income, DEFAULT_RAIL_CONFIG.income, 'unmentioned tab falls back to default');
  for (const tab of RAIL_TABS) {
    assert.ok(Array.isArray(merged[tab]), `merged.${tab} should be an array`);
  }
});

test('non-array tab values (incl. railWidth scalar) are ignored', () => {
  const merged = mergeLoadedRailConfig({
    overview: 'garbage',
    income: { not: 'an array' },
    railWidth: 640,
    track: ['savings'],
  });
  assert.deepStrictEqual(merged.overview, DEFAULT_RAIL_CONFIG.overview, 'string junk ignored');
  assert.deepStrictEqual(merged.income, DEFAULT_RAIL_CONFIG.income, 'object junk ignored');
  assert.ok(!Array.isArray(merged.railWidth), 'railWidth scalar not treated as a tab');
  assert.deepStrictEqual(merged.track, ['savings']);
});

test('null / undefined / array inputs yield pure defaults', () => {
  assert.deepStrictEqual(mergeLoadedRailConfig(null), DEFAULT_RAIL_CONFIG);
  assert.deepStrictEqual(mergeLoadedRailConfig(undefined), DEFAULT_RAIL_CONFIG);
  assert.deepStrictEqual(mergeLoadedRailConfig(['savings']), DEFAULT_RAIL_CONFIG);
});

test('merge never mutates DEFAULT_RAIL_CONFIG', () => {
  const before = JSON.stringify(DEFAULT_RAIL_CONFIG);
  const merged = mergeLoadedRailConfig({ overview: ['bridge'] });
  merged.overview.push('mutant');
  assert.strictEqual(JSON.stringify(DEFAULT_RAIL_CONFIG), before);
});

console.log('\n=== getTabChartsFromConfig ===');

test('returns the config list when present, defaults when missing, [] for unknown tabs', () => {
  const config = { overview: ['bridge'] };
  assert.deepStrictEqual(getTabChartsFromConfig(config, 'overview'), ['bridge']);
  assert.deepStrictEqual(getTabChartsFromConfig(config, 'income'), DEFAULT_RAIL_CONFIG.income);
  assert.deepStrictEqual(getTabChartsFromConfig(config, 'no-such-tab'), []);
  assert.deepStrictEqual(getTabChartsFromConfig(null, 'overview'), DEFAULT_RAIL_CONFIG.overview);
});

console.log('\n=== setTabChartsOp ===');

test('replaces one tab wholesale without touching others or the input', () => {
  const config = { overview: ['savings'], risk: ['montecarlo'] };
  const next = setTabChartsOp(config, 'overview', ['bridge', 'income']);
  assert.deepStrictEqual(next.overview, ['bridge', 'income']);
  assert.deepStrictEqual(next.risk, ['montecarlo']);
  assert.notStrictEqual(next, config, 'returns a new object');
  assert.deepStrictEqual(config.overview, ['savings'], 'input unmutated');
});

console.log('\n=== addChartOp ===');

test('appends to the end of the tab list', () => {
  const config = { overview: ['savings'] };
  const next = addChartOp(config, 'overview', 'networth');
  assert.deepStrictEqual(next.overview, ['savings', 'networth']);
  assert.deepStrictEqual(config.overview, ['savings'], 'input unmutated');
});

test('duplicate add is a no-op returning the SAME reference (setState bail-out)', () => {
  const config = { overview: ['savings', 'networth'] };
  assert.strictEqual(addChartOp(config, 'overview', 'savings'), config);
});

test('adding to a tab with no list yet creates it', () => {
  const next = addChartOp({}, 'actuals', 'savings');
  assert.deepStrictEqual(next.actuals, ['savings']);
});

console.log('\n=== removeChartOp ===');

test('removes only the matching id', () => {
  const config = { overview: ['savings', 'networth', 'bridge'] };
  const next = removeChartOp(config, 'overview', 'networth');
  assert.deepStrictEqual(next.overview, ['savings', 'bridge']);
  assert.deepStrictEqual(config.overview, ['savings', 'networth', 'bridge'], 'input unmutated');
});

test('removing an absent id / from a missing tab leaves the list content unchanged', () => {
  assert.deepStrictEqual(removeChartOp({ overview: ['savings'] }, 'overview', 'ghost').overview, ['savings']);
  assert.deepStrictEqual(removeChartOp({}, 'overview', 'savings').overview, []);
});

console.log('\n=== moveChartOp ===');

test('moves forward and backward', () => {
  const config = { overview: ['a', 'b', 'c'] };
  assert.deepStrictEqual(moveChartOp(config, 'overview', 0, 2).overview, ['b', 'c', 'a']);
  assert.deepStrictEqual(moveChartOp(config, 'overview', 2, 0).overview, ['c', 'a', 'b']);
  assert.deepStrictEqual(config.overview, ['a', 'b', 'c'], 'input unmutated');
});

test('move to the same index is harmless', () => {
  const next = moveChartOp({ overview: ['a', 'b'] }, 'overview', 1, 1);
  assert.deepStrictEqual(next.overview, ['a', 'b']);
});

test('out-of-bounds indices are a no-op returning the SAME reference', () => {
  const config = { overview: ['a', 'b'] };
  assert.strictEqual(moveChartOp(config, 'overview', -1, 0), config);
  assert.strictEqual(moveChartOp(config, 'overview', 2, 0), config);
  assert.strictEqual(moveChartOp(config, 'overview', 0, -1), config);
  assert.strictEqual(moveChartOp(config, 'overview', 0, 2), config);
  assert.strictEqual(moveChartOp({ overview: [] }, 'overview', 0, 0).overview.length, 0);
});

console.log('\n=== resetTabOp ===');

test('resets to the saved checkpoint when one exists', () => {
  const config = { overview: ['bridge'], risk: ['montecarlo'] };
  const saved = { overview: ['savings', 'networth'] };
  const next = resetTabOp(config, saved, 'overview');
  assert.deepStrictEqual(next.overview, ['savings', 'networth']);
  assert.deepStrictEqual(next.risk, ['montecarlo'], 'other tabs untouched');
});

test('falls back to DEFAULT_RAIL_CONFIG, then [] for unknown tabs', () => {
  assert.deepStrictEqual(resetTabOp({ overview: ['bridge'] }, {}, 'overview').overview, DEFAULT_RAIL_CONFIG.overview);
  assert.deepStrictEqual(resetTabOp({ mystery: ['x'] }, {}, 'mystery').mystery, []);
  assert.deepStrictEqual(resetTabOp({ overview: ['bridge'] }, null, 'overview').overview, DEFAULT_RAIL_CONFIG.overview);
});

console.log('\n=== isTabModifiedOp ===');

test('detects content and order differences against the checkpoint', () => {
  const saved = { overview: ['savings', 'networth'] };
  assert.strictEqual(isTabModifiedOp({ overview: ['savings', 'networth'] }, saved, 'overview'), false);
  assert.strictEqual(isTabModifiedOp({ overview: ['networth', 'savings'] }, saved, 'overview'), true);
  assert.strictEqual(isTabModifiedOp({ overview: ['savings'] }, saved, 'overview'), true);
});

test('missing saved entry compares against the defaults', () => {
  assert.strictEqual(isTabModifiedOp({ overview: DEFAULT_RAIL_CONFIG.overview }, {}, 'overview'), false);
  assert.strictEqual(isTabModifiedOp({ overview: ['bridge'] }, {}, 'overview'), true);
});

console.log('\n=== mutator pipeline (hook-equivalent sequence) ===');

test('add -> move -> remove -> reset round-trip behaves like the hook', () => {
  let config = mergeLoadedRailConfig(null);
  const saved = mergeLoadedRailConfig(null);
  config = addChartOp(config, 'overview', 'bridge');         // [...defaults, bridge]
  config = moveChartOp(config, 'overview', config.overview.length - 1, 0);
  assert.strictEqual(config.overview[0], 'bridge');
  assert.strictEqual(isTabModifiedOp(config, saved, 'overview'), true);
  config = removeChartOp(config, 'overview', 'bridge');
  assert.deepStrictEqual(config.overview, DEFAULT_RAIL_CONFIG.overview);
  assert.strictEqual(isTabModifiedOp(config, saved, 'overview'), false);
  config = setTabChartsOp(config, 'overview', ['income']);
  config = resetTabOp(config, saved, 'overview');
  assert.deepStrictEqual(config.overview, DEFAULT_RAIL_CONFIG.overview);
});

console.log(`\n${'='.repeat(60)}`);
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'='.repeat(60)}\n`);

if (failed > 0) process.exit(1);
