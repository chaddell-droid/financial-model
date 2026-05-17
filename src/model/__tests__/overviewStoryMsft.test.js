/**
 * Tests locking that MSFT bridge markers surface their dollar magnitude.
 * Bug C from the MSFT cross-codebase audit: Bridge chart labels like
 * "MSFT cliff" rendered without any dollar context, even though the underlying
 * math (cliffLoss / endLoss / msftDelta) was correct. These tests verify the
 * marker objects now carry both a labeled magnitude AND a numeric `impact`
 * field that downstream renderers / advisors can rely on.
 *
 * Run with: node src/model/__tests__/overviewStoryMsft.test.js
 */
import assert from 'node:assert';
import { buildBridgeStoryModel } from '../overviewStory.js';

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

// Shared baseline: a story state that activates BOTH the MSFT cliff (month 18)
// and the MSFT end (month 30), so we exercise the static event path that owns
// the cliffLoss / endLoss magnitudes.
function buildBaseStory(overrides = {}) {
  const defaults = {
    monthlyDetail: [{ month: 0, netMonthlySmoothed: -10000 }, { month: 12, netMonthlySmoothed: -8000 }],
    data: [
      { label: 'Q1\'26', month: 0, netMonthly: -10000, netCashFlow: -10000 },
      { label: 'Q4\'30', month: 57, netMonthly: -8000, netCashFlow: -8000 },
    ],
    milestones: [],
    variant: 'overview',
    todayGap: -10000,
    finalNet: -8000,
    crossMonth: null,
    trustIncomeNow: 833,
    trustIncomeFuture: 833,
    trustIncreaseMonth: 0,
    retireDebt: false,
    debtService: 0,
    vanSold: false,
    vanMonthlySavings: 0,
    lifestyleCutsApplied: false,
    totalCuts: 0,
    bcsYearsLeft: 0,
    bcsFamilyMonthly: 0,
    currentMsft: 14565,
    postCliffMsft: 3500,
    ssLabel: 'SSDI',
    ssMonth: 0,
    ssAmount: 0,
    sarahGrowth: 0,
    monthlyReturn: 0,
    chadJobLabel: '',
    chadJobMonth: 0,
    chadJobMonthlyNet: 0,
    chadJobHealthVal: 0,
  };
  return buildBridgeStoryModel({ ...defaults, ...overrides });
}

function findMarker(story, id) {
  return story.markers.find((marker) => marker.id === id) || null;
}

// ════════════════════════════════════════════════════════════════════════
// Static MSFT markers: cliffLoss / endLoss-driven
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== buildBridgeStoryModel — static MSFT markers ===');

test('msft_cliff marker carries a nonzero negative impact field', () => {
  const story = buildBaseStory();
  const cliff = findMarker(story, 'msft_cliff');
  assert.ok(cliff, 'msft_cliff marker must be present when cliffLoss > 0');
  assert.ok(Number.isFinite(cliff.impact), `impact must be finite, got ${cliff.impact}`);
  assert.ok(cliff.impact < 0, `cliff impact should be negative (drop), got ${cliff.impact}`);
  assert.notStrictEqual(cliff.impact, 0, 'cliff impact must be nonzero');
});

test('msft_ends marker carries a nonzero negative impact field', () => {
  const story = buildBaseStory();
  const end = findMarker(story, 'msft_end');
  assert.ok(end, 'msft_end marker must be present when endLoss > 0');
  assert.ok(Number.isFinite(end.impact), `impact must be finite, got ${end.impact}`);
  assert.ok(end.impact < 0, `end impact should be negative (drop), got ${end.impact}`);
  assert.notStrictEqual(end.impact, 0, 'end impact must be nonzero');
});

test('cliff impact magnitude ~= (currentMsft - postCliffMsft)', () => {
  const currentMsft = 14565;
  const postCliffMsft = 3500;
  const story = buildBaseStory({ currentMsft, postCliffMsft });
  const cliff = findMarker(story, 'msft_cliff');
  const expectedDrop = currentMsft - postCliffMsft; // 11065
  assert.strictEqual(
    Math.abs(cliff.impact),
    expectedDrop,
    `cliff |impact| (${Math.abs(cliff.impact)}) should equal currentMsft - postCliffMsft (${expectedDrop})`,
  );
});

test('end impact magnitude ~= postCliffMsft (what falls off at month 30)', () => {
  const postCliffMsft = 3500;
  const story = buildBaseStory({ postCliffMsft });
  const end = findMarker(story, 'msft_end');
  assert.strictEqual(
    Math.abs(end.impact),
    postCliffMsft,
    `end |impact| (${Math.abs(end.impact)}) should equal postCliffMsft (${postCliffMsft})`,
  );
});

test('cliff label embeds a dollar magnitude (not just "MSFT cliff")', () => {
  const story = buildBaseStory();
  const cliff = findMarker(story, 'msft_cliff');
  assert.ok(cliff.label.includes('$'), `cliff label should include "$": "${cliff.label}"`);
  assert.ok(cliff.label.includes('MSFT cliff'), `cliff label should retain "MSFT cliff": "${cliff.label}"`);
  assert.ok(cliff.label.includes('/mo'), `cliff label should include "/mo" cadence: "${cliff.label}"`);
  assert.notStrictEqual(cliff.label.trim(), 'MSFT cliff', 'label must NOT be the bare "MSFT cliff" string');
});

test('end label embeds a dollar magnitude (not just "MSFT ends")', () => {
  const story = buildBaseStory();
  const end = findMarker(story, 'msft_end');
  assert.ok(end.label.includes('$'), `end label should include "$": "${end.label}"`);
  assert.ok(end.label.includes('MSFT ends'), `end label should retain "MSFT ends": "${end.label}"`);
  assert.ok(end.label.includes('/mo'), `end label should include "/mo" cadence: "${end.label}"`);
  assert.notStrictEqual(end.label.trim(), 'MSFT ends', 'label must NOT be the bare "MSFT ends" string');
});

// ════════════════════════════════════════════════════════════════════════
// MSFT growth sensitivity — bigger MSFT means bigger cliff dollars
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== buildBridgeStoryModel — msftGrowth sensitivity ===');

test('higher MSFT (growth) produces larger cliff magnitude than baseline', () => {
  // Simulate msftGrowth=0 baseline vs msftGrowth=10% scenario via the
  // already-computed currentMsft / postCliffMsft values. (BridgeChart resolves
  // these via getVestingMonthly before passing into buildBridgeStoryModel.)
  const baselineStory = buildBaseStory({ currentMsft: 10000, postCliffMsft: 2500 });
  const grownStory = buildBaseStory({ currentMsft: 14565, postCliffMsft: 3500 });

  const baselineCliff = findMarker(baselineStory, 'msft_cliff');
  const grownCliff = findMarker(grownStory, 'msft_cliff');

  assert.ok(
    Math.abs(grownCliff.impact) > Math.abs(baselineCliff.impact),
    `grown cliff |${grownCliff.impact}| should exceed baseline cliff |${baselineCliff.impact}|`,
  );
});

test('higher MSFT (growth) produces larger end-of-vesting magnitude', () => {
  const baselineStory = buildBaseStory({ currentMsft: 10000, postCliffMsft: 2500 });
  const grownStory = buildBaseStory({ currentMsft: 14565, postCliffMsft: 3500 });

  const baselineEnd = findMarker(baselineStory, 'msft_end');
  const grownEnd = findMarker(grownStory, 'msft_end');

  assert.ok(
    Math.abs(grownEnd.impact) > Math.abs(baselineEnd.impact),
    `grown end |${grownEnd.impact}| should exceed baseline end |${baselineEnd.impact}|`,
  );
});

test('zero MSFT (no grant or fully sold) suppresses both MSFT markers', () => {
  const story = buildBaseStory({ currentMsft: 0, postCliffMsft: 0 });
  assert.strictEqual(findMarker(story, 'msft_cliff'), null, 'no cliff marker when no MSFT income');
  assert.strictEqual(findMarker(story, 'msft_end'), null, 'no end marker when no MSFT income');
});

// ════════════════════════════════════════════════════════════════════════
// Dynamic MSFT step-down marker (driven by monthlyDetail.msftSmoothed drop)
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== buildBridgeStoryModel — dynamic MSFT step-down ===');

test('dynamic msft step-down marker (detected from monthlyDetail) carries impact + dollar label', () => {
  // Construct a monthlyDetail series where msftSmoothed drops > $1,000
  // mid-stream at a month that does NOT match the static cliff (18) or end (30),
  // and is below the cliff threshold (5,000 magnitude AND month >= 18).
  // Use month 9 with a -$2,000 drop -> should be classified msft_stepdown_9.
  const story = buildBaseStory({
    monthlyDetail: [
      { month: 0, netMonthlySmoothed: -10000, msftSmoothed: 12000 },
      { month: 9, netMonthlySmoothed: -11000, msftSmoothed: 10000 }, // -2000 step-down
      { month: 12, netMonthlySmoothed: -11000, msftSmoothed: 10000 },
    ],
    // Suppress static cliff/end markers so we isolate the dynamic one.
    currentMsft: 0,
    postCliffMsft: 0,
  });

  const stepdown = story.markers.find((marker) => marker.id && marker.id.startsWith('msft_stepdown_'));
  assert.ok(stepdown, `expected an msft_stepdown_* marker in markers: ${JSON.stringify(story.markers.map((m) => m.id))}`);
  assert.ok(Number.isFinite(stepdown.impact), `dynamic step-down impact must be finite, got ${stepdown.impact}`);
  assert.ok(stepdown.impact < 0, `dynamic step-down impact should be negative, got ${stepdown.impact}`);
  assert.ok(stepdown.label.includes('$'), `dynamic step-down label should include "$": "${stepdown.label}"`);
  assert.ok(stepdown.label.includes('MSFT step-down'), `dynamic step-down label should mention "MSFT step-down": "${stepdown.label}"`);
});

// ════════════════════════════════════════════════════════════════════════
// Summary
// ════════════════════════════════════════════════════════════════════════
console.log(`\n${'='.repeat(50)}`);
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'='.repeat(50)}\n`);

if (failed > 0) process.exit(1);
