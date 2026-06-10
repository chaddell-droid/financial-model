/**
 * Chart consistency guards (remediation plan 2026-06-09, Phase 7).
 *
 * Locks the "one palette / shared axes / unified presentation" cleanup:
 *   1. No raw hex color literals in src/charts outside chartUtils.js — every
 *      chart color must come from the shared COLORS palette (or rgba(), which
 *      is allowed for alpha-composited fills the palette can't express).
 *   2. The intentional accent colors (orange #f97316, emerald #34d399, ...)
 *      exist as NAMED tokens so they can't silently drift per-chart.
 *   3. Dead exports stay dead: CUMULATIVE_REAL_INDICES, responsivePadding,
 *      getSsBenefitShortLabel, METRIC_LABELS, and the unused `fmt` imports in
 *      the tax charts.
 *   4. The hand-rolled-axis charts render via the shared ChartXAxis/ChartYAxis
 *      components (or, where geometry forbids it, are documented below).
 *   5. MiniIncomeExpenseChart's expense line matches IncomeCompositionChart's
 *      slate-white + dark-halo treatment (they previously diverged: red vs
 *      slate-white, with a stale "matches colors" comment).
 *   6. Empty data renders a friendly shared empty state — never throws.
 *
 * Like the other chart tests, these are source guards (no React rendering).
 * Run with: node src/charts/__tests__/chartConsistency.test.js
 */
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CHARTS_DIR = path.resolve(__dirname, '..');
const SRC_DIR = path.resolve(CHARTS_DIR, '..');

const read = (rel) => fs.readFileSync(path.resolve(SRC_DIR, rel), 'utf8');

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

// ════════════════════════════════════════════════════════════════════════
// 1. One palette — no hex literals in src/charts outside chartUtils.js
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== One palette: no hex literals outside chartUtils.js ===');

// Files allowed to carry raw hex (the palette itself).
const HEX_ALLOWED_FILES = new Set(['chartUtils.js']);
// Per-file allowlisted hex literals that genuinely can't come from the palette
// (currently none — add sparingly, with a reason).
const HEX_ALLOWLIST = {};

const HEX_RE = /#[0-9a-fA-F]{3,8}\b/g;

function listChartSources() {
  return fs.readdirSync(CHARTS_DIR, { withFileTypes: true })
    .filter((e) => e.isFile() && /\.(js|jsx)$/.test(e.name) && !e.name.endsWith('.test.js'))
    .map((e) => e.name);
}

test('no new hex color literals in src/charts outside chartUtils.js', () => {
  const offenders = [];
  for (const name of listChartSources()) {
    if (HEX_ALLOWED_FILES.has(name)) continue;
    const source = fs.readFileSync(path.join(CHARTS_DIR, name), 'utf8');
    const allowed = new Set(HEX_ALLOWLIST[name] || []);
    for (const match of source.match(HEX_RE) || []) {
      if (!allowed.has(match)) offenders.push(`${name}: ${match}`);
    }
  }
  assert.deepStrictEqual(offenders, [],
    `hex literals must come from chartUtils COLORS (or be allowlisted):\n${offenders.join('\n')}`);
});

test('intentional accent colors are named palette tokens', () => {
  const utils = read('charts/chartUtils.js');
  assert.ok(/orange:\s*["']#f97316["']/.test(utils), 'COLORS.orange (#f97316) must be a named token');
  assert.ok(/emerald:\s*["']#34d399["']/.test(utils), 'COLORS.emerald (#34d399) must be a named token');
  assert.ok(/teal:\s*["']#14b8a6["']/.test(utils), 'COLORS.teal (#14b8a6) must be a named token');
  assert.ok(/textBright:\s*["']#f1f5f9["']/.test(utils), 'COLORS.textBright (#f1f5f9) must be a named token');
});

// ════════════════════════════════════════════════════════════════════════
// 2. Dead code stays dead
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Dead code purge ===');

test('CUMULATIVE_REAL_INDICES is purged from shillerReturns.js (zero importers)', () => {
  const source = read('model/shillerReturns.js');
  assert.ok(!source.includes('CUMULATIVE_REAL_INDICES'),
    'CUMULATIVE_REAL_INDICES (~1,860 lines of dead data) must stay deleted');
});

test('dead exports removed: responsivePadding / getSsBenefitShortLabel / METRIC_LABELS', () => {
  assert.ok(!read('charts/chartUtils.js').includes('responsivePadding'),
    'chartUtils.responsivePadding had zero importers and must stay deleted');
  assert.ok(!read('charts/ssBenefitLabel.js').includes('getSsBenefitShortLabel'),
    'ssBenefitLabel.getSsBenefitShortLabel had zero importers and must stay deleted');
  assert.ok(!read('content/uiGlossary.js').includes('METRIC_LABELS'),
    'uiGlossary.METRIC_LABELS had zero importers and must stay deleted');
});

test('tax charts no longer import the unused fmt formatter', () => {
  for (const file of ['charts/TaxAttributionChart.jsx', 'charts/TaxCompositionChart.jsx']) {
    const source = read(file);
    const importLine = source.match(/import\s*\{([^}]*)\}\s*from\s*['"][^'"]*formatters\.js['"]/);
    assert.ok(importLine, `${file} should still import from formatters.js`);
    const names = importLine[1].split(',').map((s) => s.trim());
    assert.ok(!names.includes('fmt'), `${file} imports fmt but never calls it — dead import`);
  }
});

// ════════════════════════════════════════════════════════════════════════
// 3. Shared axis components
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Shared ChartXAxis / ChartYAxis adoption ===');

const Y_AXIS_CHARTS = [
  'SequenceOfReturnsChart.jsx',
  'RetirementCompositionChart.jsx',
  'SarahPracticeChart.jsx',
  'MonteCarloPanel.jsx',
  'RetirementIncomeChart.jsx',
  'BridgeChart.jsx',
  'Chad401kChart.jsx', // done in an earlier phase; locked here
];
// RetirementIncomeChart's X axis is a two-row Chad/Sarah age ladder the shared
// single-row component can't express — it stays manual but matches the shared
// font/color convention (asserted below).
const X_AXIS_CHARTS = Y_AXIS_CHARTS.filter((f) => f !== 'RetirementIncomeChart.jsx');

for (const file of Y_AXIS_CHARTS) {
  test(`${file} renders its Y axis via the shared ChartYAxis`, () => {
    const source = read(`charts/${file}`);
    assert.ok(source.includes("from './ChartYAxis.jsx'") && source.includes('<ChartYAxis'),
      `${file} must import and render ChartYAxis`);
  });
}

for (const file of X_AXIS_CHARTS) {
  test(`${file} renders its X axis via the shared ChartXAxis`, () => {
    const source = read(`charts/${file}`);
    assert.ok(source.includes("from './ChartXAxis.jsx'") && source.includes('<ChartXAxis'),
      `${file} must import and render ChartXAxis`);
  });
}

test('RetirementIncomeChart manual X axis matches the shared convention (10px, COLORS.textDim)', () => {
  const source = read('charts/RetirementIncomeChart.jsx');
  const xLabelBlock = source.slice(source.indexOf('X-axis labels'));
  assert.ok(/fill=\{COLORS\.textDim\}/.test(xLabelBlock.slice(0, 600)),
    'primary x-axis row must use COLORS.textDim like ChartXAxis');
  assert.ok(!/fontSize="11"/.test(xLabelBlock.slice(0, 600)),
    'x-axis labels must use the shared 10px size, not 11px');
});

test('SarahPracticeChart X axis uses the model-time convention (formatModelTimeLabel)', () => {
  const source = read('charts/SarahPracticeChart.jsx');
  assert.ok(source.includes('formatModelTimeLabel'),
    "SarahPracticeChart must label its time axis with the majority convention (formatModelTimeLabel), not bare calendar years");
});

test('BridgeChart uses the shared COLORS palette, not UI_COLORS', () => {
  const source = read('charts/BridgeChart.jsx');
  assert.ok(!source.includes('UI_COLORS'),
    'BridgeChart chart colors must come from chartUtils COLORS (one palette)');
});

// ════════════════════════════════════════════════════════════════════════
// 4. Expense-line parity between Mini and full income charts
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Expense-line parity (Mini vs IncomeComposition) ===');

test('both income charts draw the expense line slate-white (COLORS.textBright) with a dark halo', () => {
  for (const file of ['charts/IncomeCompositionChart.jsx', 'charts/MiniIncomeExpenseChart.jsx']) {
    const source = read(file);
    assert.ok(source.includes('stroke={COLORS.textBright}'),
      `${file}: expense line must be COLORS.textBright (slate-white)`);
    assert.ok(source.includes('stroke={COLORS.bgDeep}'),
      `${file}: expense line must keep the dark halo under-stroke`);
  }
});

test('MiniIncomeExpenseChart expense line is no longer red (stale divergence)', () => {
  const source = read('charts/MiniIncomeExpenseChart.jsx');
  const svgBlock = source.slice(source.indexOf('Expense line'));
  assert.ok(!/stroke=\{COLORS\.red\}/.test(svgBlock.split('</svg>')[0]),
    'Mini expense line must match IncomeCompositionChart, not stay red');
});

// ════════════════════════════════════════════════════════════════════════
// 5. Friendly empty states — never throw on empty data
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Unified empty-data handling ===');

test('shared ChartEmptyState component exists', () => {
  assert.ok(fs.existsSync(path.join(CHARTS_DIR, 'ChartEmptyState.jsx')),
    'src/charts/ChartEmptyState.jsx must exist (shared friendly empty state)');
});

const EMPTY_STATE_CHARTS = [
  'IncomeCompositionChart.jsx',   // previously crashed on data[0].expenses
  'MiniIncomeExpenseChart.jsx',   // previously crashed on Math.max spread
  'SequenceOfReturnsChart.jsx',   // previously crashed on monthlyDetail.length
  'RetirementCompositionChart.jsx', // previously vanished (return null)
  'Chad401kChart.jsx',            // previously had a one-off inline message
];
for (const file of EMPTY_STATE_CHARTS) {
  test(`${file} renders the shared ChartEmptyState when data is missing`, () => {
    const source = read(`charts/${file}`);
    assert.ok(source.includes('ChartEmptyState'),
      `${file} must guard empty data with the shared ChartEmptyState`);
  });
}

// ════════════════════════════════════════════════════════════════════════
// Summary
// ════════════════════════════════════════════════════════════════════════
console.log(`\n${'='.repeat(50)}`);
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'='.repeat(50)}\n`);

if (failed > 0) process.exit(1);
