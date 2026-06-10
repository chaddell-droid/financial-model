/**
 * Unit tests for CSV transaction parser.
 * Run with: node src/model/__tests__/csvParser.test.js
 */
import assert from 'node:assert';
import { parseTransactionCSV, parseTransactionCSVDetailed, classifyTransaction, mergeTransactions, groupByMonth, sanitizeMonthlyActuals, analyzeMerchantFrequency, isAmountConsistent, legacyTransactionId, ALWAYS_CORE, ALWAYS_ONETIME, MIXED_CATEGORY_THRESHOLDS } from '../csvParser.js';

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

test('classifyTransaction returns onetime for always-onetime categories', () => {
  assert.strictEqual(classifyTransaction(-10.19, 'Travel & Vacation'), 'onetime');
  assert.strictEqual(classifyTransaction(-5000.00, 'Travel & Vacation'), 'onetime');
  assert.strictEqual(classifyTransaction(-200.00, 'Home Improvement'), 'onetime');
});

test('classifyTransaction defaults to core for unknown categories', () => {
  assert.strictEqual(classifyTransaction(-50.00, 'Uncategorized'), 'core');
  assert.strictEqual(classifyTransaction(-20.00, 'Something New'), 'core');
});

console.log('\n=== Mixed Category Thresholds ===');

test('Medical below threshold (-$250) → core', () => {
  assert.strictEqual(classifyTransaction(-250.00, 'Medical'), 'core');
});

test('Medical above threshold (-$2052) → onetime', () => {
  assert.strictEqual(classifyTransaction(-2052.00, 'Medical'), 'onetime');
});

test('Medical at exact threshold (-$500) → onetime', () => {
  assert.strictEqual(classifyTransaction(-500.00, 'Medical'), 'onetime');
});

test('Loan Payment below threshold (-$54.95) → core', () => {
  assert.strictEqual(classifyTransaction(-54.95, 'Loan Payment'), 'core');
});

test('Loan Payment above threshold (-$1541) → onetime', () => {
  assert.strictEqual(classifyTransaction(-1541.00, 'Loan Payment'), 'onetime');
});

test('Shopping below threshold (-$45) → core', () => {
  assert.strictEqual(classifyTransaction(-45.00, 'Shopping'), 'core');
});

test('Shopping above threshold (-$676) → onetime', () => {
  assert.strictEqual(classifyTransaction(-676.00, 'Shopping'), 'onetime');
});

test('Groceries always core regardless of amount', () => {
  assert.strictEqual(classifyTransaction(-15.00, 'Groceries'), 'core');
  assert.strictEqual(classifyTransaction(-500.00, 'Groceries'), 'core');
});

test('Travel & Vacation always onetime regardless of amount', () => {
  assert.strictEqual(classifyTransaction(-10.19, 'Travel & Vacation'), 'onetime');
  assert.strictEqual(classifyTransaction(-3000.00, 'Travel & Vacation'), 'onetime');
});

test('ALWAYS_CORE, ALWAYS_ONETIME, MIXED_CATEGORY_THRESHOLDS are exported', () => {
  assert.ok(ALWAYS_CORE instanceof Set);
  assert.ok(ALWAYS_ONETIME instanceof Set);
  assert.strictEqual(typeof MIXED_CATEGORY_THRESHOLDS, 'object');
  assert.ok(ALWAYS_CORE.has('Groceries'));
  assert.ok(ALWAYS_ONETIME.has('Travel & Vacation'));
  assert.strictEqual(MIXED_CATEGORY_THRESHOLDS.Medical, -500);
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
// CSV Import Integrity (remediation 2.6)
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== CSV Import Integrity ===');

const HEADER = 'Date,Merchant,Category,Account,Original Statement,Notes,Amount,Tags,Owner';

test('twin same-day same-merchant same-amount rows BOTH survive parsing', () => {
  const csv = `${HEADER}
2026-03-15,Starbucks,Coffee Shops,Main (...6040),STARBUCKS #123,,-6.75,,Shared
2026-03-15,Starbucks,Coffee Shops,Main (...6040),STARBUCKS #123,,-6.75,,Shared`;
  const result = parseTransactionCSV(csv);
  assert.strictEqual(result.length, 2, 'both twin rows must survive');
  assert.notStrictEqual(result[0].id, result[1].id, 'twin rows must get distinct ids');
});

test('same-day same-amount rows with different Original Statement get distinct ids', () => {
  const csv = `${HEADER}
2026-03-15,Amazon,Shopping,Main (...6040),AMZN MKTP US*ABC,,-25.00,,Shared
2026-03-15,Amazon,Shopping,Main (...6040),AMZN MKTP US*XYZ,,-25.00,,Shared`;
  const result = parseTransactionCSV(csv);
  assert.strictEqual(result.length, 2);
  assert.notStrictEqual(result[0].id, result[1].id);
});

test('re-import of the IDENTICAL file adds nothing (idempotent import)', () => {
  const csv = `${HEADER}
2026-03-15,Starbucks,Coffee Shops,Main (...6040),STARBUCKS #123,,-6.75,,Shared
2026-03-15,Starbucks,Coffee Shops,Main (...6040),STARBUCKS #123,,-6.75,,Shared
2026-03-16,QFC,Groceries,Main (...6040),QFC #456,,-84.93,,Shared`;
  const firstImport = mergeTransactions([], parseTransactionCSV(csv));
  assert.strictEqual(firstImport.length, 3);
  const reImport = mergeTransactions(firstImport, parseTransactionCSV(csv));
  assert.strictEqual(reImport.length, 3, 're-importing the same file must add nothing');
});

test('cross-file merge dedupes overlapping rows but keeps distinct twins', () => {
  const fileA = `${HEADER}
2026-03-15,Starbucks,Coffee Shops,Main (...6040),STARBUCKS #123,,-6.75,,Shared
2026-03-16,QFC,Groceries,Main (...6040),QFC #456,,-84.93,,Shared`;
  const fileB = `${HEADER}
2026-03-15,Starbucks,Coffee Shops,Main (...6040),STARBUCKS #123,,-6.75,,Shared
2026-03-15,Starbucks,Coffee Shops,Main (...6040),STARBUCKS #123,,-6.75,,Shared
2026-03-17,TacoTime,Restaurants & Bars,Main (...6040),TACO TIME,,-13.52,,Shared`;
  const afterA = mergeTransactions([], parseTransactionCSV(fileA));
  const afterB = mergeTransactions(afterA, parseTransactionCSV(fileB));
  // fileA's Starbucks dedupes against fileB's first occurrence; fileB's second
  // occurrence and TacoTime are new → 2 + 2 = 4
  assert.strictEqual(afterB.length, 4);
  assert.strictEqual(afterB.filter(t => t.merchant === 'Starbucks').length, 2);
});

test('legacy-id existing data: re-import does not duplicate first occurrence', () => {
  // Data imported before the id-format change uses `date|merchant|amount` ids.
  const existing = [
    { id: '2026-03-15|Starbucks|-6.75', date: '2026-03-15', merchant: 'Starbucks', amount: -6.75, type: 'core' },
  ];
  const csv = `${HEADER}
2026-03-15,Starbucks,Coffee Shops,Main (...6040),STARBUCKS #123,,-6.75,,Shared`;
  const merged = mergeTransactions(existing, parseTransactionCSV(csv));
  assert.strictEqual(merged.length, 1, 'first occurrence must dedupe against legacy id');
  assert.strictEqual(merged[0].type, 'core', 'existing classification preserved');
});

test('legacy-id existing data: genuine second twin is still added', () => {
  const existing = [
    { id: '2026-03-15|Starbucks|-6.75', date: '2026-03-15', merchant: 'Starbucks', amount: -6.75, type: 'core' },
  ];
  const csv = `${HEADER}
2026-03-15,Starbucks,Coffee Shops,Main (...6040),STARBUCKS #123,,-6.75,,Shared
2026-03-15,Starbucks,Coffee Shops,Main (...6040),STARBUCKS #123,,-6.75,,Shared`;
  const merged = mergeTransactions(existing, parseTransactionCSV(csv));
  assert.strictEqual(merged.length, 2, 'second twin (never representable under legacy ids) is new');
});

test('legacyTransactionId derives the pre-change id format', () => {
  const t = { date: '2026-03-15', merchant: 'Starbucks', amount: -6.75 };
  assert.strictEqual(legacyTransactionId(t), '2026-03-15|Starbucks|-6.75');
});

test('amount with thousands separators parses correctly: "-1,234.56" → -1234.56', () => {
  const csv = `${HEADER}
2026-03-15,BigCo,Shopping,Main (...6040),BIGCO,,"-1,234.56",,Shared`;
  const result = parseTransactionCSV(csv);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].amount, -1234.56);
});

test('amount with dollar sign and separators parses: "$2,500.00" → 2500', () => {
  const csv = `${HEADER}
2026-03-15,Square,Business Income,Sarah (...0618),SQUARE INC,,"$2,500.00",,Shared`;
  const result = parseTransactionCSV(csv);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].amount, 2500);
  assert.strictEqual(result[0].type, 'income');
});

test('garbage amount row is skipped and counted, valid rows survive', () => {
  const csv = `${HEADER}
2026-03-15,GoodRow,Groceries,Main (...6040),GOOD,,-50.00,,Shared
2026-03-15,BadRow,Groceries,Main (...6040),BAD,,not-a-number,,Shared
2026-03-15,EmptyAmount,Groceries,Main (...6040),EMPTY,,,,Shared`;
  const { transactions, skippedCount } = parseTransactionCSVDetailed(csv);
  assert.strictEqual(transactions.length, 1, 'only the valid row survives');
  assert.strictEqual(transactions[0].merchant, 'GoodRow');
  assert.strictEqual(skippedCount, 2, 'both unparseable-amount rows counted');
});

test('parseTransactionCSVDetailed reports zero skipped for a clean file', () => {
  const csv = `${HEADER}
2026-03-15,QFC,Groceries,Main (...6040),QFC,,-84.93,,Shared`;
  const { transactions, skippedCount } = parseTransactionCSVDetailed(csv);
  assert.strictEqual(transactions.length, 1);
  assert.strictEqual(skippedCount, 0);
});

test('garbage amount is never stored as a wrong number (parseFloat("1,234.56") regression)', () => {
  const csv = `${HEADER}
2026-03-15,Landlord,Rent,Main (...6040),RENT,,"-1,234.56",,Shared`;
  const result = parseTransactionCSV(csv);
  // Old bug: parseFloat('-1,234.56') === -1 stored silently
  assert.strictEqual(result[0].amount, -1234.56);
  assert.notStrictEqual(result[0].amount, -1);
});

// ════════════════════════════════════════════════════════════════════════
// Frequency-Based Classification
// ════════════════════════════════════════════════════════════════════════
console.log('\n=== Frequency-Based Classification ===');

test('analyzeMerchantFrequency counts distinct months per merchant', () => {
  const actuals = {
    '2026-03': { transactions: [
      { merchant: 'QFC', amount: -50 },
      { merchant: 'QFC', amount: -30 },
      { merchant: 'Delta', amount: -500 },
    ]},
    '2026-04': { transactions: [
      { merchant: 'QFC', amount: -45 },
    ]},
  };
  const freq = analyzeMerchantFrequency(actuals);
  assert.strictEqual(freq['QFC'], 2, 'QFC in 2 months');
  assert.strictEqual(freq['Delta'], 1, 'Delta in 1 month');
});

test('Merchant in 2+ months with consistent amount → core via frequency', () => {
  const actuals = {
    '2026-03': { transactions: [{ merchant: 'Netflix', amount: -15.99, category: 'Entertainment & Recreation' }] },
    '2026-04': { transactions: [{ merchant: 'Netflix', amount: -15.99, category: 'Entertainment & Recreation' }] },
  };
  // Shopping category would normally be threshold-based, but frequency overrides
  const result = classifyTransaction(-15.99, 'Shopping', 'Netflix', null, actuals);
  assert.strictEqual(result, 'core', 'frequency-detected recurring → core');
});

test('Merchant in 2+ months but amount 5x average → uses category logic', () => {
  const actuals = {
    '2026-03': { transactions: [{ merchant: 'Affirm', amount: -55, category: 'Loan Payment' }] },
    '2026-04': { transactions: [{ merchant: 'Affirm', amount: -55, category: 'Loan Payment' }] },
  };
  // Normal Affirm is $55, but this charge is $1500 (5x) → not consistent → falls through to threshold
  const result = classifyTransaction(-1500, 'Loan Payment', 'Affirm', null, actuals);
  assert.strictEqual(result, 'onetime', 'unusual amount skips frequency, uses threshold');
});

test('Merchant in 1 month only → no frequency boost', () => {
  const actuals = {
    '2026-03': { transactions: [{ merchant: 'OneTime Co', amount: -200, category: 'Shopping' }] },
  };
  const result = classifyTransaction(-200, 'Shopping', 'OneTime Co', null, actuals);
  assert.strictEqual(result, 'onetime', 'single month → no frequency boost, uses threshold');
});

test('Manual override takes priority over frequency detection', () => {
  const actuals = {
    '2026-03': { transactions: [{ merchant: 'QFC', amount: -50 }] },
    '2026-04': { transactions: [{ merchant: 'QFC', amount: -50 }] },
  };
  const overrides = { 'QFC': 'onetime' };
  const result = classifyTransaction(-50, 'Groceries', 'QFC', overrides, actuals);
  assert.strictEqual(result, 'onetime', 'manual override wins over frequency');
});

test('isAmountConsistent returns true for normal amounts', () => {
  assert.strictEqual(isAmountConsistent(-55, [-50, -55, -60]), true);
});

test('isAmountConsistent returns false for 3x+ spike', () => {
  assert.strictEqual(isAmountConsistent(-500, [-50, -55, -60]), false);
});

// ════════════════════════════════════════════════════════════════════════
// Summary
// ════════════════════════════════════════════════════════════════════════
console.log(`\n${'='.repeat(50)}`);
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'='.repeat(50)}\n`);

if (failed > 0) process.exit(1);
