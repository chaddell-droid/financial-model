/**
 * Unit tests for scenario templates.
 * Run with: node src/model/__tests__/scenarioTemplates.test.js
 */
import assert from 'node:assert';
import { SCENARIO_TEMPLATES } from '../scenarioTemplates.js';
import { INITIAL_STATE, MODEL_KEYS } from '../../state/initialState.js';
import { validateAndSanitize } from '../../state/schemaValidation.js';
import { reducer } from '../../state/reducer.js';

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

const MODEL_KEYS_SET = new Set(MODEL_KEYS);

// ════════════════════════════════════════════════════════════════════════
// Template overrides contain only valid MODEL_KEYS
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Scenario Templates — valid keys ===');

for (const template of SCENARIO_TEMPLATES) {
  test(`"${template.name}" overrides only contain MODEL_KEYS`, () => {
    const invalidKeys = Object.keys(template.overrides).filter(k => !MODEL_KEYS_SET.has(k));
    assert.deepStrictEqual(invalidKeys, [],
      `Invalid keys: ${invalidKeys.join(', ')}`);
  });
}

// ════════════════════════════════════════════════════════════════════════
// Template overrides pass through validateAndSanitize without clamping
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Scenario Templates — values within valid ranges ===');

for (const template of SCENARIO_TEMPLATES) {
  test(`"${template.name}" overrides survive validateAndSanitize unclamped`, () => {
    // Build a full state with the template overrides applied
    const stateWithOverrides = { ...INITIAL_STATE, ...template.overrides };
    const sanitized = validateAndSanitize(stateWithOverrides);

    for (const [key, value] of Object.entries(template.overrides)) {
      assert.strictEqual(sanitized[key], value,
        `Key "${key}": expected ${value}, got ${sanitized[key]} (was clamped or coerced)`);
    }
  });
}

// ════════════════════════════════════════════════════════════════════════
// SET_FIELDS preserves unrelated fields when applying template
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Scenario Templates — SET_FIELDS preserves unrelated fields ===');

test('Applying a template via SET_FIELDS preserves unrelated fields', () => {
  const customState = { ...INITIAL_STATE, baseExpenses: 55555, msftGrowth: 7 };
  const template = SCENARIO_TEMPLATES.find(t => t.id === 'optimistic-sarah');
  const next = reducer(customState, { type: 'SET_FIELDS', fields: template.overrides });

  // Template overrides applied
  assert.strictEqual(next.sarahCurrentClients, 4);
  assert.strictEqual(next.sarahMaxClients, 6);
  assert.strictEqual(next.sarahClientGrowth, 15);

  // Unrelated fields preserved
  assert.strictEqual(next.baseExpenses, 55555, 'baseExpenses should be preserved');
  assert.strictEqual(next.msftGrowth, 7, 'msftGrowth should be preserved');
});

test('Worst case template applies boolean overrides correctly', () => {
  const customState = { ...INITIAL_STATE, startingSavings: 300000 };
  const template = SCENARIO_TEMPLATES.find(t => t.id === 'worst-case');
  const next = reducer(customState, { type: 'SET_FIELDS', fields: template.overrides });

  assert.strictEqual(next.ssdiDenied, true, 'ssdiDenied should be true');
  assert.strictEqual(next.lifestyleCutsApplied, false, 'lifestyleCutsApplied should be false');
  assert.strictEqual(next.startingSavings, 300000, 'startingSavings should be preserved');
});

test('Chad W-2 Job template sets all job fields', () => {
  const template = SCENARIO_TEMPLATES.find(t => t.id === 'chad-w2-job');
  const next = reducer(INITIAL_STATE, { type: 'SET_FIELDS', fields: template.overrides });

  assert.strictEqual(next.chadJob, true);
  assert.strictEqual(next.chadJobSalary, 120000);
  assert.strictEqual(next.chadJobStartMonth, 3);
  assert.strictEqual(next.chadJobHealthSavings, INITIAL_STATE.chadJobHealthSavings);
  // Unrelated default preserved
  assert.strictEqual(next.sarahRate, INITIAL_STATE.sarahRate);
});

// ════════════════════════════════════════════════════════════════════════
// Template data integrity
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Scenario Templates — data integrity ===');

test('All templates have required fields (id, name, description, overrides)', () => {
  for (const t of SCENARIO_TEMPLATES) {
    assert.ok(typeof t.id === 'string' && t.id.length > 0, `Template missing id`);
    assert.ok(typeof t.name === 'string' && t.name.length > 0, `Template "${t.id}" missing name`);
    assert.ok(typeof t.description === 'string' && t.description.length > 0, `Template "${t.id}" missing description`);
    assert.ok(typeof t.overrides === 'object' && Object.keys(t.overrides).length > 0, `Template "${t.id}" missing overrides`);
  }
});

test('Template IDs are unique', () => {
  const ids = SCENARIO_TEMPLATES.map(t => t.id);
  const uniqueIds = new Set(ids);
  assert.strictEqual(ids.length, uniqueIds.size, 'Duplicate template IDs found');
});

// ════════════════════════════════════════════════════════════════════════
// Summary
// ════════════════════════════════════════════════════════════════════════
console.log(`\nScenario Templates: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
