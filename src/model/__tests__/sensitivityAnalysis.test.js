/**
 * Unit tests for sensitivityAnalysis.js (computeTopMoves + computeSensitivities).
 * Run with: node src/model/__tests__/sensitivityAnalysis.test.js
 */
import assert from 'node:assert';
import { computeTopMoves, computeSensitivities, computeIncomePathways, buildLeverCandidates } from '../sensitivityAnalysis.js';
import { gatherStateWithOverrides } from '../../state/gatherState.js';

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
// computeTopMoves — basics
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== computeTopMoves — basics ===');

test('1. Returns an array', () => {
  const s = gatherStateWithOverrides({});
  const results = computeTopMoves(s);
  assert.ok(Array.isArray(results), 'should return an array');
});

test('2. Returns at most topN results (default 3)', () => {
  const s = gatherStateWithOverrides({});
  const results = computeTopMoves(s);
  assert.ok(results.length <= 3, `expected at most 3 results, got ${results.length}`);
});

test('3. Results are sorted by score descending', () => {
  const s = gatherStateWithOverrides({});
  const results = computeTopMoves(s, 10);
  for (let i = 1; i < results.length; i++) {
    assert.ok(
      results[i - 1].score >= results[i].score,
      `result ${i - 1} (score ${results[i - 1].score}) should be >= result ${i} (score ${results[i].score})`
    );
  }
});

test('4. Each result has required fields', () => {
  const s = gatherStateWithOverrides({});
  const results = computeTopMoves(s, 10);
  for (const r of results) {
    assert.ok('key' in r, 'missing key');
    assert.ok('label' in r, 'missing label');
    assert.ok('finalBalanceDelta' in r, 'missing finalBalanceDelta');
    assert.ok('breakevenMonthDelta' in r, 'missing breakevenMonthDelta');
    assert.ok('score' in r, 'missing score');
    assert.ok('delta' in r, 'missing delta');
    assert.ok('unit' in r, 'missing unit');
    assert.strictEqual(r.kind, 'lever', 'kind should be "lever"');
  }
});

test('5. Custom topN limits output length', () => {
  const s = gatherStateWithOverrides({});
  const results1 = computeTopMoves(s, 1);
  assert.ok(results1.length <= 1, `expected at most 1 result, got ${results1.length}`);
  const results5 = computeTopMoves(s, 5);
  assert.ok(results5.length <= 5, `expected at most 5 results, got ${results5.length}`);
});

// ════════════════════════════════════════════════════════════════════════
// computeTopMoves — lever-based candidate selection
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== computeTopMoves — lever behavior ===');

test('6. Inactive retireDebt appears in top moves when debt service is large', () => {
  const s = gatherStateWithOverrides({ retireDebt: false, debtService: 6434 });
  const results = computeTopMoves(s, 10);
  const retireResult = results.find(r => r.key === 'retire_debt');
  assert.ok(retireResult, 'retire_debt should appear in results');
  assert.ok(retireResult.finalBalanceDelta > 0, `retire_debt should improve end balance, got ${retireResult.finalBalanceDelta}`);
});

test('7. Already-active retireDebt is NOT in top moves', () => {
  const s = gatherStateWithOverrides({ retireDebt: true });
  const results = computeTopMoves(s, 10);
  const retireResult = results.find(r => r.key === 'retire_debt');
  assert.ok(!retireResult, 'retire_debt should be excluded when already active');
});

test('8. Inactive vanSold appears in top moves', () => {
  const s = gatherStateWithOverrides({ vanSold: false, vanMonthlySavings: 2597 });
  const results = computeTopMoves(s, 10);
  const vanResult = results.find(r => r.key === 'sell_van');
  assert.ok(vanResult, 'sell_van should appear when vanSold=false');
});

test('9. Already-active vanSold is excluded', () => {
  const s = gatherStateWithOverrides({ vanSold: true });
  const results = computeTopMoves(s, 10);
  const vanResult = results.find(r => r.key === 'sell_van');
  assert.ok(!vanResult, 'sell_van should be excluded when vanSold=true');
});

test('10. Inactive lifestyleCutsApplied appears in top moves', () => {
  const s = gatherStateWithOverrides({ lifestyleCutsApplied: false, cutsOverride: 1500 });
  const results = computeTopMoves(s, 10);
  const cutsResult = results.find(r => r.key === 'spending_cuts');
  assert.ok(cutsResult, 'spending_cuts should appear when lifestyleCutsApplied=false');
  assert.strictEqual(cutsResult.delta, 1500, 'spending_cuts delta should reflect cutsOverride');
});

test('11. Inactive custom levers surface as moves', () => {
  const customLever = { id: 'rental-1', name: 'Rental income', description: '', maxImpact: 1800, currentValue: 0, active: false };
  const s = gatherStateWithOverrides({ customLevers: [customLever] });
  const results = computeTopMoves(s, 10);
  const rentalResult = results.find(r => r.key === 'custom:rental-1');
  assert.ok(rentalResult, 'custom:rental-1 should appear in results');
  assert.strictEqual(rentalResult.delta, 1800, 'custom lever delta should be maxImpact');
  assert.ok(rentalResult.finalBalanceDelta > 0, 'activating rental income should improve end balance');
});

test('12. Active custom levers are excluded', () => {
  const activeLever = { id: 'r', name: 'Rental', description: '', maxImpact: 1800, currentValue: 1800, active: true };
  const s = gatherStateWithOverrides({ customLevers: [activeLever] });
  const results = computeTopMoves(s, 10);
  const found = results.find(r => r.key === 'custom:r');
  assert.ok(!found, 'active custom lever should not appear as a move');
});

test('13. Only improvements returned (no negative-only results)', () => {
  const s = gatherStateWithOverrides({});
  const results = computeTopMoves(s, 10);
  for (const r of results) {
    // A candidate must improve on at least one axis: final balance, breakeven,
    // or goal progress (the latter is goal-aware ranking introduced with MSFT
    // lever expansion — see sensitivityAnalysis.js computeGoalProgressDelta).
    const isImprovement = r.finalBalanceDelta > 0
      || r.breakevenMonthDelta < 0
      || (r.goalProgressDelta || 0) > 0;
    assert.ok(isImprovement, `result ${r.key} should improve on at least one axis: finalBalanceDelta=${r.finalBalanceDelta}, breakevenMonthDelta=${r.breakevenMonthDelta}, goalProgressDelta=${r.goalProgressDelta}`);
  }
});

test('14. Fully-leveraged state returns empty top moves', () => {
  // Note: bcsParentsAnnual represents EXTERNAL contribution (grandparents/aid).
  // "Fully covered" means bcsParentsAnnual >= bcsAnnualTotal, NOT 0.
  const s = gatherStateWithOverrides({
    retireDebt: true,
    lifestyleCutsApplied: true,
    cutsOverride: 1000,
    vanSold: true,
    bcsAnnualTotal: 43400,
    bcsParentsAnnual: 43400, // external fully covers — family share is $0
    customLevers: [],
    // Suppress the MSFT-offer / promotion / 401k / age65 candidates by having
    // Chad already employed with the ladder + 401k enabled and override forced on.
    chadJob: true,
    chadL64Enabled: true,
    chadL65Enabled: true,
    chadJob401kEnabled: true,
    chadAge65VestOverride: 'on',
  });
  const results = computeTopMoves(s, 10);
  assert.strictEqual(results.length, 0, `expected empty results when all levers active, got ${results.length}`);
});

test('14b. BCS candidate appears when external contribution is less than total, and IMPROVES balance', () => {
  const s = gatherStateWithOverrides({
    bcsAnnualTotal: 43400,
    bcsParentsAnnual: 25000, // external covers half
  });
  const results = computeTopMoves(s, 10);
  const bcs = results.find(r => r.key === 'bcs_fully_covered');
  assert.ok(bcs, 'bcs_fully_covered should appear when external contribution is below total');
  // Must actually improve: activating the candidate should RAISE the final balance
  assert.ok(bcs.finalBalanceDelta > 0, `bcs_fully_covered should improve final balance, got ${bcs.finalBalanceDelta}`);
});

test('14c. BCS candidate excluded when external already covers full tuition', () => {
  const s = gatherStateWithOverrides({
    bcsAnnualTotal: 43400,
    bcsParentsAnnual: 43400,
  });
  const results = computeTopMoves(s, 10);
  const bcs = results.find(r => r.key === 'bcs_fully_covered');
  assert.ok(!bcs, 'bcs_fully_covered should NOT appear when external already covers everything');
});

test('14msft. "Take the MSFT offer" bundle is generated when chadJob=false', () => {
  // Composite move that toggles chadJob + L64 + L65 + 401(k) max & match.
  // Inspect via buildLeverCandidates (pre-filter) so we test the bundle
  // structure regardless of whether goal/balance filters surface it.
  const s = gatherStateWithOverrides({ chadJob: false });
  const cands = buildLeverCandidates(s);
  const msft = cands.find(c => c.id === 'take_msft_offer');
  assert.ok(msft, 'take_msft_offer should be generated when chadJob=false');
  assert.ok(msft.label.includes('L63') && msft.label.includes('L64') && msft.label.includes('L65'),
    `Label should advertise the full ladder, got "${msft.label}"`);
  // All ladder + 401k toggles flipped on
  assert.strictEqual(msft.mutation.chadJob, true);
  assert.strictEqual(msft.mutation.chadL64Enabled, true);
  assert.strictEqual(msft.mutation.chadL65Enabled, true);
  assert.strictEqual(msft.mutation.chadJob401kEnabled, true);
  assert.strictEqual(msft.mutation.chadAge65VestOverride, 'on');
});

test('14msft-2. MSFT bundle preserves user-customized values (only fills zeros)', () => {
  const s = gatherStateWithOverrides({
    chadJob: false,
    chadJobSalary: 195000,           // user-tuned, higher than bundle default $165K
    chadJob401kDeferral: 0,          // currently zero — bundle should fill in
    chadL64Salary: 0,                // currently zero — bundle should fill in
  });
  const cands = buildLeverCandidates(s);
  const msft = cands.find(c => c.id === 'take_msft_offer');
  assert.ok(msft, 'take_msft_offer should be generated');
  const m = msft.mutation;
  assert.strictEqual(m.chadJobSalary, 195000, 'should preserve user-customized salary');
  assert.strictEqual(m.chadJob401kDeferral, 24500, 'should fill in 401k deferral when zero');
  assert.strictEqual(m.chadL64Salary, 220000, 'should fill in L64 salary when zero');
  assert.strictEqual(m.chadJobSignOnCash, 50000, 'should fill in sign-on cash when zero');
  assert.strictEqual(m.chadJob401kMatch, 12250, 'should fill in employer match');
  assert.strictEqual(m.chadJob401kCatchupRoth, 11250, 'should fill in super catch-up');
});

test('14msft-3. MSFT bundle excluded when Chad already employed', () => {
  const s = gatherStateWithOverrides({ chadJob: true });
  const cands = buildLeverCandidates(s);
  const msft = cands.find(c => c.id === 'take_msft_offer');
  assert.ok(!msft, 'take_msft_offer should NOT appear when chadJob is already true');
});

test('14msft-4. MSFT bundle improves at least ONE axis of the standard goals', () => {
  // From a no-job baseline, the bundle activates significant W-2 income that
  // should improve at least one default goal (savings_floor at Y6 / cash flow
  // breakeven at m36 / emergency fund $50K at m48). It also kills SSDI, so
  // savings-only final balance can decline — that's expected. We assert
  // goal-progress improvement instead.
  const s = gatherStateWithOverrides({ chadJob: false });
  const results = computeTopMoves(s, 20);
  const msft = results.find(r => r.key === 'take_msft_offer');
  assert.ok(msft, 'take_msft_offer should surface via the goal-aware filter');
  const improvedSomething = msft.finalBalanceDelta > 0
    || msft.breakevenMonthDelta < 0
    || (msft.goalProgressDelta || 0) > 0;
  assert.ok(improvedSomething,
    `MSFT bundle should improve on at least one axis, got finalBalance=${msft.finalBalanceDelta}, breakeven=${msft.breakevenMonthDelta}, goalProgress=${msft.goalProgressDelta}`);
});

test('14d. Mutations re-run gatherState (derived fields refresh)', () => {
  // If gatherState wasn\'t re-run after mutating bcsParentsAnnual, the stale
  // bcsFamilyMonthly would cause the projection to charge the old share
  // and the candidate would appear to improve balance less than expected.
  // Setting bcsParentsAnnual to full total should reduce monthly expenses by
  // roughly bcsFamilyMonthly × bcsYearsLeft × 12. Verify the impact scales.
  const s = gatherStateWithOverrides({
    bcsAnnualTotal: 48000,
    bcsParentsAnnual: 12000,
    bcsYearsLeft: 3,
  });
  const results = computeTopMoves(s, 10);
  const bcs = results.find(r => r.key === 'bcs_fully_covered');
  assert.ok(bcs, 'bcs_fully_covered should appear');
  // At 3 yrs × 12mo × $3000/mo family share ≈ $108k saved (pre-compounding).
  // We just assert a lower bound consistent with gatherState re-running.
  assert.ok(
    bcs.finalBalanceDelta > 50000,
    `expected meaningful savings (>$50k) when family share is $3k/mo for 3yrs; got ${bcs.finalBalanceDelta}. If stale bcsFamilyMonthly, this would be near zero.`
  );
});

test('14e. enable_401k surfaces with POSITIVE net-worth delta in a solvent household (finding 1.3)', () => {
  // Regression for finding 1.3: scoring must rank by total ending RESOURCES
  // (savings + 401k + home equity), not savings-only final balance. A 401(k)
  // deferral REDUCES take-home (savings) while the employer match + tax-deferred
  // growth land in the segregated bal401k bucket. Scored savings-only, the move
  // looks NEGATIVE and is filtered out at the `<= 0` guard, hiding the single
  // best "free employer match" move. Scored on net worth, it is clearly positive.
  const s = gatherStateWithOverrides({
    chadJob: true,
    chadJobSalary: 200000,
    chadJobTaxRate: 30,
    chadJobStartMonth: 0,
    chadJob401kDeferral: 23000,
    chadJob401kMatch: 12000,
    startingSavings: 2_000_000,
    starting401k: 100000,
    return401k: 8,
    chadWorkMonths: 60,
    chadJob401kEnabled: false,
  });
  const moves = computeTopMoves(s, 10);
  const k401 = moves.find(m => m.key === 'enable_401k');
  assert.ok(k401, 'enable_401k should surface in a solvent household (was hidden by savings-only scoring)');
  assert.ok(
    k401.finalBalanceDelta > 0,
    `enable_401k net-worth delta should be POSITIVE (free match + tax-deferred growth), got ${k401.finalBalanceDelta}`
  );
});

test('15. No hardcoded parameter sweeps (sarahRate, etc.) in Tier 1', () => {
  // Top moves should NOT include things Chad doesn't control as levers.
  const s = gatherStateWithOverrides({});
  const results = computeTopMoves(s, 10);
  const forbiddenKeys = ['sarahRate', 'sarahClientGrowth', 'investmentReturn', 'msftGrowth', 'chadJob'];
  for (const key of forbiddenKeys) {
    const found = results.find(r => r.key === key);
    assert.ok(!found, `${key} should NOT be in Tier 1 top moves (it belongs in sensitivities)`);
  }
});

// ════════════════════════════════════════════════════════════════════════
// computeSensitivities — Tier 2 awareness items
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== computeSensitivities — Tier 2 ===');

test('16. Returns an array', () => {
  const s = gatherStateWithOverrides({});
  const results = computeSensitivities(s);
  assert.ok(Array.isArray(results), 'should return an array');
});

test('17. Respects topN', () => {
  const s = gatherStateWithOverrides({});
  const results = computeSensitivities(s, 1);
  assert.ok(results.length <= 1, `expected at most 1 result, got ${results.length}`);
});

test('18. Investment return sensitivity has positive impact when delta is positive', () => {
  const s = gatherStateWithOverrides({});
  const results = computeSensitivities(s, 10);
  const irResult = results.find(r => r.key === 'investmentReturn');
  assert.ok(irResult, 'investmentReturn sensitivity should appear');
  assert.ok(irResult.finalBalanceDelta > 0, `expected positive impact from +3% return, got ${irResult.finalBalanceDelta}`);
});

test('19. Results sorted by absolute impact descending', () => {
  const s = gatherStateWithOverrides({});
  const results = computeSensitivities(s, 10);
  for (let i = 1; i < results.length; i++) {
    assert.ok(
      Math.abs(results[i - 1].finalBalanceDelta) >= Math.abs(results[i].finalBalanceDelta),
      `sensitivity ${i - 1} should have >= absolute impact than ${i}`
    );
  }
});

test('20. Each sensitivity result has required fields', () => {
  const s = gatherStateWithOverrides({});
  const results = computeSensitivities(s, 10);
  for (const r of results) {
    assert.ok('key' in r && 'label' in r && 'unit' in r && 'delta' in r, 'missing core field');
    assert.ok('finalBalanceDelta' in r && 'baseValue' in r && 'testValue' in r, 'missing impact field');
    assert.strictEqual(r.kind, 'sensitivity', 'kind should be "sensitivity"');
  }
});

// ════════════════════════════════════════════════════════════════════════
// computeIncomePathways — Tier 3 counterfactual income options
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== computeIncomePathways — Tier 3 ===');

test('21. Returns an array', () => {
  const s = gatherStateWithOverrides({});
  const results = computeIncomePathways(s);
  assert.ok(Array.isArray(results), 'should return an array');
});

test('22. Sarah rate pathway respects sarahMaxRate cap', () => {
  // Rate already at max → no sarah_rate candidate
  const sAtMax = gatherStateWithOverrides({ sarahRate: 250, sarahMaxRate: 250 });
  const resultsAtMax = computeIncomePathways(sAtMax, 10);
  assert.ok(!resultsAtMax.find(r => r.key === 'sarah_rate'), 'sarah_rate should NOT appear when already at max');
  // Rate below max → candidate exists
  const sBelowMax = gatherStateWithOverrides({ sarahRate: 200, sarahMaxRate: 250 });
  const resultsBelowMax = computeIncomePathways(sBelowMax, 10);
  const rateCand = resultsBelowMax.find(r => r.key === 'sarah_rate');
  assert.ok(rateCand, 'sarah_rate should appear when below max');
  assert.ok(rateCand.finalBalanceDelta > 0, 'raising Sarah\'s rate should improve balance');
});

test('23. Sarah clients pathway respects sarahMaxClients cap', () => {
  const sAtMax = gatherStateWithOverrides({ sarahCurrentClients: 4.5, sarahMaxClients: 4.5 });
  const results = computeIncomePathways(sAtMax, 10);
  assert.ok(!results.find(r => r.key === 'sarah_clients'), 'sarah_clients should NOT appear when at max');
});

test('24. Chad W-2 pathway appears only when chadJob=false', () => {
  const sNoJob = gatherStateWithOverrides({ chadJob: false });
  const resultsNo = computeIncomePathways(sNoJob, 10);
  const jobCandNo = resultsNo.find(r => r.key === 'chad_w2_job');
  assert.ok(jobCandNo, 'chad_w2_job should appear when chadJob=false');

  const sJob = gatherStateWithOverrides({ chadJob: true });
  const resultsJob = computeIncomePathways(sJob, 10);
  assert.ok(!resultsJob.find(r => r.key === 'chad_w2_job'), 'chad_w2_job should NOT appear when chadJob=true');
});

test('25. Pathways sorted by finalBalanceDelta descending', () => {
  const s = gatherStateWithOverrides({});
  const results = computeIncomePathways(s, 10);
  for (let i = 1; i < results.length; i++) {
    assert.ok(
      results[i - 1].finalBalanceDelta >= results[i].finalBalanceDelta,
      `pathway ${i - 1} should have >= delta than ${i}`
    );
  }
});

test('26. Only pathways that IMPROVE balance are returned', () => {
  const s = gatherStateWithOverrides({});
  const results = computeIncomePathways(s, 10);
  for (const p of results) {
    assert.ok(p.finalBalanceDelta > 0, `pathway ${p.key} should improve balance, got ${p.finalBalanceDelta}`);
  }
});

test('27. Each pathway has required fields + kind=\'pathway\'', () => {
  const s = gatherStateWithOverrides({});
  const results = computeIncomePathways(s, 10);
  for (const p of results) {
    assert.ok('key' in p && 'label' in p && 'unit' in p && 'delta' in p, 'missing field');
    assert.ok('finalBalanceDelta' in p, 'missing finalBalanceDelta');
    assert.strictEqual(p.kind, 'pathway', 'kind should be "pathway"');
  }
});

// ════════════════════════════════════════════════════════════════════════
// Summary
// ════════════════════════════════════════════════════════════════════════
console.log(`\n${'='.repeat(50)}`);
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'='.repeat(50)}\n`);

if (failed > 0) process.exit(1);
