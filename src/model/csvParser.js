/**
 * CSV transaction parser for Monarch bank exports.
 *
 * Format: Date,Merchant,Category,Account,Original Statement,Notes,Amount,Tags,Owner
 * Amount: negative = expense, positive = income
 */

export const ALWAYS_CORE = new Set([
  'Mortgage', 'Rent', 'Groceries', 'Insurance', 'Phone',
  'Internet & Cable', 'Gas & Electric', 'Fitness', 'Gas',
  'Auto Payment', 'Restaurants & Bars', 'Coffee Shops', 'Dentist',
  'Auto Maintenance', 'Financial Fees', 'Parking & Tolls',
  'Postage & Shipping', 'Credit Card Payment', 'Oliver Costs',
  'Oliver Care', 'Advertising & Promotion',
  'Business Utilities & Communication', 'Child Activities',
  'Investments', 'Office Supplies & Expenses', 'Personal',
  'Entertainment & Recreation',
]);

export const ALWAYS_ONETIME = new Set([
  'Travel & Vacation', 'Home Improvement',
  'Employee Wages & Contract Labor', 'Check',
  'Charity', 'Financial & Legal Services',
]);

export const MIXED_CATEGORY_THRESHOLDS = {
  Medical: -500,
  'Loan Payment': -200,
  Shopping: -100,
  Electronics: -50,
  Clothing: -75,
  Taxes: -200,
  Education: -200,
};

/**
 * Parse a single CSV row, handling quoted fields and empty fields.
 * Returns an array of field values.
 */
function parseCSVRow(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { current += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { fields.push(current); current = ''; }
      else { current += ch; }
    }
  }
  fields.push(current);
  return fields;
}

/**
 * Count how many distinct months each merchant appears in (expenses only).
 */
export function analyzeMerchantFrequency(monthlyActuals) {
  const merchantMonths = {};
  if (!monthlyActuals) return merchantMonths;
  for (const data of Object.values(monthlyActuals)) {
    const seen = new Set();
    for (const txn of (data.transactions || [])) {
      if (txn.amount < 0 && !seen.has(txn.merchant)) {
        seen.add(txn.merchant);
        merchantMonths[txn.merchant] = (merchantMonths[txn.merchant] || 0) + 1;
      }
    }
  }
  return merchantMonths;
}

/**
 * Check if an amount is consistent with a merchant's historical amounts.
 * Returns true if within 3x of the average (i.e. not an unusual spike).
 */
export function isAmountConsistent(amount, merchantAmounts) {
  if (!merchantAmounts || merchantAmounts.length === 0) return true;
  const avg = merchantAmounts.reduce((s, a) => s + Math.abs(a), 0) / merchantAmounts.length;
  return Math.abs(amount) < avg * 3;
}

/**
 * Get all historical amounts for a merchant across all months.
 */
export function getMerchantAmounts(merchant, monthlyActuals) {
  const amounts = [];
  if (!monthlyActuals) return amounts;
  for (const data of Object.values(monthlyActuals)) {
    for (const txn of (data.transactions || [])) {
      if (txn.merchant === merchant && txn.amount < 0) amounts.push(txn.amount);
    }
  }
  return amounts;
}

export function classifyTransaction(amount, category, merchant, merchantClassifications, monthlyActuals) {
  if (amount > 0) return 'income';
  if (merchantClassifications && merchantClassifications[merchant]) return merchantClassifications[merchant];
  // Frequency-based: merchant in 2+ prior months with consistent amount → core
  if (monthlyActuals) {
    const freq = analyzeMerchantFrequency(monthlyActuals);
    if (freq[merchant] >= 2) {
      const amounts = getMerchantAmounts(merchant, monthlyActuals);
      if (isAmountConsistent(amount, amounts)) return 'core';
    }
  }
  if (ALWAYS_CORE.has(category)) return 'core';
  if (ALWAYS_ONETIME.has(category)) return 'onetime';
  const threshold = MIXED_CATEGORY_THRESHOLDS[category];
  if (threshold !== undefined) return amount > threshold ? 'core' : 'onetime';
  return 'core';
}

export function parseTransactionCSV(csvString, merchantClassifications, monthlyActuals) {
  if (!csvString || typeof csvString !== 'string') return [];
  const lines = csvString.split(/\r?\n/).filter(l => l.trim());
  if (lines.length <= 1) return [];

  const transactions = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCSVRow(lines[i]);
    if (fields.length < 7) continue;

    const date = fields[0]?.trim();
    const merchant = fields[1]?.trim();
    const category = fields[2]?.trim();
    const account = fields[3]?.trim();
    const amount = parseFloat(fields[6]) || 0;

    if (!date || !merchant) continue;

    const id = `${date}|${merchant}|${amount}`;
    const month = date.slice(0, 7);
    const type = classifyTransaction(amount, category, merchant, merchantClassifications, monthlyActuals);

    transactions.push({ id, date, month, merchant, category, account, amount, type });
  }
  return transactions;
}

export function mergeTransactions(existing, incoming) {
  const map = new Map();
  for (const t of existing) map.set(t.id, t);
  for (const t of incoming) {
    if (!map.has(t.id)) map.set(t.id, t);
  }
  return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date) || a.merchant.localeCompare(b.merchant));
}

export function groupByMonth(transactions) {
  const groups = {};
  for (const t of transactions) {
    if (!groups[t.month]) groups[t.month] = [];
    groups[t.month].push(t);
  }
  return groups;
}

export function getCurrentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function sanitizeMonthlyActuals(val) {
  if (!val || typeof val !== 'object' || Array.isArray(val)) return {};
  const result = {};
  for (const [month, data] of Object.entries(val)) {
    if (!/^\d{4}-\d{2}$/.test(month)) continue;
    if (!data || !Array.isArray(data.transactions)) continue;
    result[month] = {
      transactions: data.transactions.filter(t =>
        t && typeof t === 'object' &&
        typeof t.id === 'string' &&
        typeof t.date === 'string' &&
        typeof t.merchant === 'string' &&
        typeof t.amount === 'number' && Number.isFinite(t.amount) &&
        ['core', 'onetime', 'income'].includes(t.type)
      ),
    };
  }
  return result;
}
