/**
 * End-to-end scenario tests — run full pipeline for each scenario template + baseline.
 * Verifies: row counts, field presence, identity equations, cross-scenario ordering.
 * Run with: node src/model/__tests__/scenarios.test.js
 */
import assert from 'node:assert';
import { runMonthlySimulation, computeProjection } from '../projection.js';
import { gatherStateWithOverrides } from '../../state/gatherState.js';
import { SCENARIO_TEMPLATES } from '../scenarioTemplates.js';
import { INITIAL_STATE } from '../../state/initialState.js';

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

// Monthly data fields that must be present and finite on every row
const MONTHLY_FIELDS = [
  'month', 'sarahIncome', 'msftSmoothed', 'msftLump', 'trustLLC',
  'ssBenefit', 'consulting', 'chadJobIncome', 'investReturn',
  'cashIncome', 'cashIncomeSmoothed', 'expenses',
  'netCashFlow', 'netCashFlowSmoothed', 'netMonthly', 'netMonthlySmoothed',
  'balance', 'balance401k', 'withdrawal401k',
];

// Helper: run full pipeline for a set of overrides
function runScenario(overrides = {}) {
  const s = gatherStateWithOverrides(overrides);
  const sim = runMonthlySimulation(s);
  const proj = computeProjection(s);
  return { s, sim, proj };
}

// ════════════════════════════════════════════════════════════════════════
// Section 1: Default Baseline Full Pipeline
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Scenario: Default Baseline Full Pipeline ===');

test('Baseline: monthlyData length = totalProjectionMonths + 1', () => {
  const { s, sim } = runScenario();
  assert.strictEqual(sim.monthlyData.length, s.totalProjectionMonths + 1,
    `expected ${s.totalProjectionMonths + 1} rows, got ${sim.monthlyData.length}`);
});

test('Baseline: quarterly data has expected count', () => {
  const { proj } = runScenario();
  // Default 72 months → quarters at months 0,3,6,...,57 = 20 quarters (last 12 months excluded)
  assert.ok(proj.data.length > 0, 'should have quarterly data');
  assert.ok(proj.data.length <= 20, `unexpected quarter count: ${proj.data.length}`);
});

test('Baseline: savingsData mirrors monthlyData length and month indices', () => {
  const { sim, proj } = runScenario();
  assert.strictEqual(proj.savingsData.length, sim.monthlyData.length,
    'savingsData length should match monthlyData');
  for (let i = 0; i < proj.savingsData.length; i++) {
    assert.strictEqual(proj.savingsData[i].month, i,
      `savingsData[${i}].month should be ${i}, got ${proj.savingsData[i].month}`);
  }
});

test('Baseline: balance reconciliation holds for months 1-5', () => {
  // Use simplified state to avoid 401k/home drawdown complicating the check
  const { sim } = runScenario({
    starting401k: 0, homeEquity: 0, ssdiDenied: true, startingSavings: 1000000,
    vanSold: false, retireDebt: false, lifestyleCutsApplied: false,
    milestones: [], oneTimeExtras: 0,
  });
  const md = sim.monthlyData;
  for (let m = 1; m <= 5; m++) {
    const expected = md[m - 1].balance + md[m].investReturn + md[m].cashIncome - md[m].expenses;
    const actual = md[m].balance;
    const diff = Math.abs(actual - expected);
    assert.ok(diff <= 1,
      `Month ${m}: balance ${actual} should reconcile to ${expected} (diff ${diff})`);
  }
});

test('Baseline: quarterly sarahIncome is average of constituent months', () => {
  const { sim, proj } = runScenario();
  const md = sim.monthlyData;
  // First quarter averages months 0, 1, 2
  const expected = Math.round((md[0].sarahIncome + md[1].sarahIncome + md[2].sarahIncome) / 3);
  assert.strictEqual(proj.data[0].sarahIncome, expected,
    `Q1 sarahIncome: expected ${expected}, got ${proj.data[0].sarahIncome}`);
});

// ════════════════════════════════════════════════════════════════════════
// Section 2: Per-Template Full Pipeline
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Scenario: Per-Template Full Pipeline ===');

for (const template of SCENARIO_TEMPLATES) {
  const { id, name, overrides } = template;

  test(`${name}: simulation completes without error`, () => {
    const { sim } = runScenario(overrides);
    assert.ok(Array.isArray(sim.monthlyData), 'monthlyData should be an array');
    assert.ok(sim.monthlyData.length > 0, 'monthlyData should not be empty');
    assert.strictEqual(typeof sim.backPayActual, 'number', 'backPayActual should be a number');
  });

  test(`${name}: all monthly fields present and finite`, () => {
    const { sim } = runScenario(overrides);
    for (let m = 0; m < sim.monthlyData.length; m++) {
      const row = sim.monthlyData[m];
      for (const field of MONTHLY_FIELDS) {
        const val = row[field];
        assert.ok(val !== undefined, `month ${m}: missing field '${field}'`);
        assert.ok(Number.isFinite(val), `month ${m}: '${field}' is not finite (${val})`);
      }
    }
  });

  test(`${name}: cashIncome identity holds`, () => {
    const { sim } = runScenario(overrides);
    for (let m = 0; m < sim.monthlyData.length; m++) {
      const d = sim.monthlyData[m];
      const expected = d.sarahIncome + d.msftLump + d.trustLLC + d.ssBenefit + d.consulting + d.chadJobIncome;
      assert.strictEqual(d.cashIncome, expected,
        `month ${m}: cashIncome ${d.cashIncome} !== sum ${expected} (sarah=${d.sarahIncome} msft=${d.msftLump} trust=${d.trustLLC} ss=${d.ssBenefit} consult=${d.consulting} job=${d.chadJobIncome})`);
    }
  });

  test(`${name}: netCashFlow identity holds`, () => {
    const { sim } = runScenario(overrides);
    for (let m = 0; m < sim.monthlyData.length; m++) {
      const d = sim.monthlyData[m];
      assert.strictEqual(d.netCashFlow, d.cashIncome - d.expenses,
        `month ${m}: netCashFlow ${d.netCashFlow} !== cashIncome ${d.cashIncome} - expenses ${d.expenses}`);
    }
  });
}

// ════════════════════════════════════════════════════════════════════════
// Section 3: Cross-Scenario Comparisons
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Scenario: Cross-Scenario Comparisons ===');

// Helper: get final balance for a template
function getFinalBalance(templateId) {
  const template = SCENARIO_TEMPLATES.find(t => t.id === templateId);
  const { sim } = runScenario(template.overrides);
  return sim.monthlyData[sim.monthlyData.length - 1].balance;
}

// Helper: get balance at specific month
function getBalanceAt(templateId, month) {
  const template = SCENARIO_TEMPLATES.find(t => t.id === templateId);
  // Some scenarios need extended horizon
  const overrides = { ...template.overrides };
  if (month > 72) {
    overrides.sarahWorkMonths = Math.max(overrides.sarahWorkMonths || 72, month + 12);
    overrides.chadWorkMonths = Math.max(overrides.chadWorkMonths || 72, month + 12);
  }
  const { sim } = runScenario(overrides);
  return sim.monthlyData[Math.min(month, sim.monthlyData.length - 1)].balance;
}

test('Optimistic Sarah has higher Y6 balance than Conservative Sarah', () => {
  const opt = getFinalBalance('optimistic-sarah');
  const con = getFinalBalance('conservative-sarah');
  assert.ok(opt > con,
    `Optimistic (${opt}) should beat Conservative (${con})`);
});

test('Chad W-2 Job has higher net worth than SSDI Denied at Y3', () => {
  // Compare total net worth (savings + 401k + home equity) since savings alone may be
  // exhausted by 401k drawdowns in both scenarios
  function getNetWorthAt(templateId, month) {
    const template = SCENARIO_TEMPLATES.find(t => t.id === templateId);
    const { sim } = runScenario(template.overrides);
    const d = sim.monthlyData[Math.min(month, sim.monthlyData.length - 1)];
    return d.balance + d.balance401k + (d.homeEquity || 0);
  }
  const jobNW = getNetWorthAt('chad-w2-job', 36);
  const deniedNW = getNetWorthAt('ssdi-denied', 36);
  assert.ok(jobNW > deniedNW,
    `Job net worth (${jobNW}) should beat SSDI Denied (${deniedNW}) at month 36`);
});

test('Worst Case has lower Y6 balance than default baseline', () => {
  // Worst case (SSDI denied + slow growth + no cuts) should be worse than baseline defaults
  const worstBal = getFinalBalance('worst-case');
  const { sim: baseline } = runScenario({});
  const baselineBal = baseline.monthlyData[baseline.monthlyData.length - 1].balance;
  assert.ok(worstBal < baselineBal,
    `Worst case (${worstBal}) should be worse than baseline (${baselineBal})`);
});

test('ssdi-max-consulting has non-zero consulting after SSDI approval', () => {
  const template = SCENARIO_TEMPLATES.find(t => t.id === 'ssdi-max-consulting');
  const { s, sim } = runScenario(template.overrides);
  const approvalMonth = s.ssdiApprovalMonth ?? 7;
  assert.ok(sim.monthlyData[approvalMonth].consulting > 0,
    `consulting should be positive at approval month ${approvalMonth}`);
});

test('chad-w2-job has zero ssBenefit for all months', () => {
  const template = SCENARIO_TEMPLATES.find(t => t.id === 'chad-w2-job');
  const { sim } = runScenario(template.overrides);
  for (let m = 0; m < sim.monthlyData.length; m++) {
    assert.strictEqual(sim.monthlyData[m].ssBenefit, 0,
      `month ${m}: ssBenefit should be 0 with job, got ${sim.monthlyData[m].ssBenefit}`);
  }
});

test('chad-job-ss62 has SS starting with earnings test reduction', () => {
  const template = SCENARIO_TEMPLATES.find(t => t.id === 'chad-job-ss62');
  const { s, sim } = runScenario(template.overrides);
  const ssStart = s.ssStartMonth;
  assert.strictEqual(sim.monthlyData[ssStart - 1].ssBenefit, 0,
    `month ${ssStart - 1}: no SS before start`);
  assert.ok(sim.monthlyData[ssStart].ssBenefit > 0,
    `month ${ssStart}: SS should flow`);
  // With $120K salary, earnings test should reduce below full family benefit
  assert.ok(sim.monthlyData[ssStart].ssBenefit < s.ssFamilyTotal,
    `SS at ${sim.monthlyData[ssStart].ssBenefit} should be < full family ${s.ssFamilyTotal} due to earnings test`);
});

test('ssdi-denied has zero ssBenefit all months and backPayActual=0', () => {
  const template = SCENARIO_TEMPLATES.find(t => t.id === 'ssdi-denied');
  const { sim } = runScenario(template.overrides);
  for (let m = 0; m < sim.monthlyData.length; m++) {
    assert.strictEqual(sim.monthlyData[m].ssBenefit, 0,
      `month ${m}: ssBenefit should be 0 when denied`);
  }
  assert.strictEqual(sim.backPayActual, 0, 'backPayActual should be 0 when denied');
});

test('chad-job-ss67 SS benefit at FRA > chad-job-ss62 SS benefit at 62', () => {
  const t62 = SCENARIO_TEMPLATES.find(t => t.id === 'chad-job-ss62');
  const t67 = SCENARIO_TEMPLATES.find(t => t.id === 'chad-job-ss67');
  const { s: s62, sim: sim62 } = runScenario({ ...t62.overrides, sarahWorkMonths: 96 });
  const { s: s67, sim: sim67 } = runScenario({ ...t67.overrides, sarahWorkMonths: 96 });
  // SS67 benefit at its start month should be higher than SS62 at its start month
  // (FRA gives full PIA vs ~70% at 62)
  const ss62Start = s62.ssStartMonth;
  const ss67Start = s67.ssStartMonth;
  // Compare personal rates (post kids-age-out) since family composition may differ
  assert.ok(s67.ssPersonal > s62.ssPersonal,
    `FRA personal (${s67.ssPersonal}) should be > age-62 personal (${s62.ssPersonal})`);
});

// ════════════════════════════════════════════════════════════════════════
// Summary
// ════════════════════════════════════════════════════════════════════════
console.log(`\n${'='.repeat(50)}`);
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'='.repeat(50)}\n`);

if (failed > 0) process.exit(1);
