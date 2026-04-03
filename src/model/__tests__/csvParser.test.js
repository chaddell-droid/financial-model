/**
 * Unit tests for CSV transaction parser.
 * Run with: node src/model/__tests__/csvParser.test.js
 */
import assert from 'node:assert';
import { parseTransactionCSV, classifyTransaction, mergeTransactions, groupByMonth, sanitizeMonthlyActuals } from '../csvParser.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  PASS  ${name}`); }
  catch (e) { failed++; console.error(`  FAIL  ${name}\n        ${e.message}`); }
}

console.log('\n=== CSV Parser ===');

test('parseTransactionCSV parses valid CSV with correct fields', () => {
  const csv = `Date,Merchant,Category,Account,Original Statement,Notes,Amount,Tags,Owner
2026-03-31,TacoTime,Restaurants & Bars,Main Checking (...6040),TACO TIME,,-13.52,,Shared
2026-03-30,Square,Business Income,Sarah Checking (...0618),Square Inc,,385.70,,Shared`;
  const result = parseTransactionCSV(csv);
  assert.strictEqual(result.length, 2);
  assert.strictEqual(result[0].merchant, 'TacoTime');
  assert.strictEqual(result[0].amount, -13.52);
  assert.strictEqual(result[0].month, '2026-03');
  assert.strictEqual(result[0].category, 'Restaurants & Bars');
  assert.strictEqual(result[0].account, 'Main Checking (...6040)');
  assert.strictEqual(result[1].amount, 385.70);
});

test('parseTransactionCSV handles quoted fields with commas', () => {
  const csv = `Date,Merchant,Category,Account,Original Statement,Notes,Amount,Tags,Owner
2026-03-31,"Merchant, Inc",Shopping,Main (...6040),STMT,,-25.00,,Shared`;
  const result = parseTransactionCSV(csv);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].merchant, 'Merchant, Inc');
});

test('parseTransactionCSV handles empty fields (double commas)', () => {
  const csv = `Date,Merchant,Category,Account,Original Statement,Notes,Amount,Tags,Owner
2026-03-31,Affirm,Loan Payment,Main (...6040),AFFIRM.COM,,-54.95,,Shared`;
  const result = parseTransactionCSV(csv);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].amount, -54.95);
});

test('parseTransactionCSV returns empty array for header-only CSV', () => {
  const csv = 'Date,Merchant,Category,Account,Original Statement,Notes,Amount,Tags,Owner';
  assert.strictEqual(parseTransactionCSV(csv).length, 0);
});

test('parseTransactionCSV returns empty array for non-CSV input', () => {
  assert.strictEqual(parseTransactionCSV('random garbage text').length, 0);
  assert.strictEqual(parseTransactionCSV('').length, 0);
  assert.strictEqual(parseTransactionCSV(null).length, 0);
});

console.log('\n=== Classification ===');

test('classifyTransaction returns income for positive amounts', () => {
  assert.strictEqual(classifyTransaction(385.70, 'Business Income'), 'income');
  assert.strictEqual(classifyTransaction(0.17, 'Interest'), 'income');
});

test('classifyTransaction returns core for core categories', () => {
  assert.strictEqual(classifyTransaction(-84.93, 'Groceries'), 'core');
  assert.strictEqual(classifyTransaction(-497.97, 'Insurance'), 'core');
  assert.strictEqual(classifyTransaction(-16.56, 'Entertainment & Recreation'), 'core');
});

test('classifyTransaction returns onetime for onetime categories', () => {
  assert.strictEqual(classifyTransaction(-250.00, 'Medical'), 'onetime');
  assert.strictEqual(classifyTransaction(-10.19, 'Travel & Vacation'), 'onetime');
  assert.strictEqual(classifyTransaction(-54.95, 'Loan Payment'), 'onetime');
});

test('classifyTransaction defaults to core for unknown categories', () => {
  assert.strictEqual(classifyTransaction(-50.00, 'Uncategorized'), 'core');
  assert.strictEqual(classifyTransaction(-20.00, 'Something New'), 'core');
});

console.log('\n=== Merge & Dedup ===');

test('mergeTransactions deduplicates by id and preserves existing type', () => {
  const existing = [
    { id: '2026-03-31|TacoTime|-13.52', date: '2026-03-31', merchant: 'TacoTime', amount: -13.52, type: 'onetime' },
  ];
  const incoming = [
    { id: '2026-03-31|TacoTime|-13.52', date: '2026-03-31', merchant: 'TacoTime', amount: -13.52, type: 'core' },
    { id: '2026-03-30|QFC|-45.00', date: '2026-03-30', merchant: 'QFC', amount: -45.00, type: 'core' },
  ];
  const merged = mergeTransactions(existing, incoming);
  assert.strictEqual(merged.length, 2);
  const taco = merged.find(t => t.merchant === 'TacoTime');
  assert.strictEqual(taco.type, 'onetime', 'existing type override should be preserved');
});

console.log('\n=== Group By Month ===');

test('groupByMonth separates transactions by month', () => {
  const txns = [
    { id: '1', month: '2026-03', date: '2026-03-15' },
    { id: '2', month: '2026-03', date: '2026-03-20' },
    { id: '3', month: '2026-04', date: '2026-04-01' },
  ];
  const grouped = groupByMonth(txns);
  assert.strictEqual(Object.keys(grouped).length, 2);
  assert.strictEqual(grouped['2026-03'].length, 2);
  assert.strictEqual(grouped['2026-04'].length, 1);
});

console.log('\n=== Sanitize Monthly Actuals ===');

test('sanitizeMonthlyActuals filters malformed data', () => {
  const valid = sanitizeMonthlyActuals({
    '2026-03': { transactions: [
      { id: 'a', date: '2026-03-01', merchant: 'X', amount: -10, type: 'core' },
      { id: 'b', date: '2026-03-02', merchant: 'Y', amount: 'bad', type: 'core' },
    ]},
    'invalid-month': { transactions: [] },
    '2026-04': 'not an object',
  });
  assert.strictEqual(Object.keys(valid).length, 1);
  assert.strictEqual(valid['2026-03'].transactions.length, 1);
});

// ════════════════════════════════════════════════════════════════════════
// Summary
// ════════════════════════════════════════════════════════════════════════
console.log(`\n${'='.repeat(50)}`);
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'='.repeat(50)}\n`);

if (failed > 0) process.exit(1);
