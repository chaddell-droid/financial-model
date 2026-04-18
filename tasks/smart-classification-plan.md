# Smart Transaction Classification — Phased Plan

**Created:** 2026-04-03
**Status:** Planning

## Overview

Replace the crude category-only classification with a multi-signal approach that gets smarter over time. Three layers, each independent and additive.

---

## Layer 1: Smarter First-Month Defaults

**Goal:** Better accuracy on day one, before any history exists.

### 1.1 — Amount Thresholds for Mixed Categories

Replace single-category defaults with conditional logic based on amount:

| Category | Amount Threshold | Below → | Above → | Rationale |
|----------|-----------------|---------|---------|-----------|
| Medical | > -$500 | Core | One-Time | Copays/therapy vs procedures |
| Loan Payment | > -$200 | Core | One-Time | Installments vs payoffs |
| Shopping | > -$100 | Core | One-Time | Regular purchases vs big buys |
| Electronics | > -$50 | Core | One-Time | Subscriptions (Perplexity $17) vs hardware |
| Clothing | > -$75 | Core | One-Time | Basics vs splurges |
| Taxes | > -$200 | Core | One-Time | Small fees vs quarterly payments |
| Employee Wages & Contract Labor | always | — | One-Time | Always irregular |
| Check | always | — | One-Time | Always irregular |
| Charity | always | — | One-Time | Always irregular |

**File:** `src/model/csvParser.js` — update `classifyTransaction()`

**Change:** Replace the simple `ONETIME_CATEGORIES.has(category)` check with a function that evaluates amount + category together.

```js
function classifyByCategory(category, amount) {
  // Categories that are always one-time regardless of amount
  if (ALWAYS_ONETIME.has(category)) return 'onetime';
  // Categories that are always core regardless of amount
  if (ALWAYS_CORE.has(category)) return 'core';
  // Mixed categories — use amount threshold
  const threshold = MIXED_CATEGORY_THRESHOLDS[category];
  if (threshold) return amount > threshold ? 'core' : 'onetime';
  // Unknown category defaults to core
  return 'core';
}
```

Constants:
```js
const ALWAYS_CORE = new Set([
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

const ALWAYS_ONETIME = new Set([
  'Travel & Vacation', 'Home Improvement',
  'Employee Wages & Contract Labor', 'Check', 'Charity',
  'Financial & Legal Services',
]);

// Negative amounts (expenses): if amount > threshold (closer to 0), classify as core
const MIXED_CATEGORY_THRESHOLDS = {
  'Medical': -500,
  'Loan Payment': -200,
  'Shopping': -100,
  'Electronics': -50,
  'Clothing': -75,
  'Taxes': -200,
  'Education': -200,
};
```

### 1.2 — Tests

- Medical $-250 → core (therapy copay)
- Medical $-2,052 → onetime (cosmetic surgery)
- Loan Payment $-54.95 → core (Affirm installment)
- Loan Payment $-1,541 → onetime (LendingClub payoff)
- Shopping $-45 → core (regular Amazon)
- Shopping $-676 → onetime (large purchase)
- Travel & Vacation any amount → onetime (always)
- Groceries any amount → core (always)
- Unknown category → core (default)

---

## Layer 2: Confidence Badges

**Goal:** Draw attention to uncertain classifications so Chad only reviews what needs reviewing.

### 2.1 — Confidence Scoring

Each transaction gets a confidence level: `high`, `medium`, `low`.

```js
function getConfidence(txn, merchantClassifications, monthlyActuals) {
  // Manual override = highest confidence
  if (merchantClassifications[txn.merchant]) return 'high';
  
  // Income is always certain
  if (txn.amount > 0) return 'high';
  
  // ALWAYS_CORE or ALWAYS_ONETIME category = high
  if (ALWAYS_CORE.has(txn.category) || ALWAYS_ONETIME.has(txn.category)) return 'high';
  
  // Merchant seen in 2+ prior months = high
  const monthsSeen = countMerchantMonths(txn.merchant, monthlyActuals);
  if (monthsSeen >= 2) return 'high';
  
  // Mixed category with threshold = medium
  if (MIXED_CATEGORY_THRESHOLDS[txn.category]) return 'medium';
  
  // First time merchant, ambiguous category = low
  return 'low';
}
```

### 2.2 — UI Changes

**Transaction table pill styling:**

| Confidence | Pill Style | Behavior |
|-----------|-----------|----------|
| High | Solid pill, dimmed | Unlikely to need attention |
| Medium | Pill with `?` badge, normal opacity | May need review |
| Low | Pill with `?` badge, highlighted border | Needs attention |

**Summary stat:** "12 transactions need review" (count of low + medium confidence) — shown above the table when > 0.

**Sort option:** Add "Needs review" sort that puts low confidence first, then medium, then high.

### 2.3 — Data Model Change

Add `confidence` field to each transaction:
```js
{ id, date, month, merchant, category, account, amount, type, confidence }
```

Computed on import (not stored — derived from current state each render via useMemo).

Actually, better: **don't store confidence.** Compute it in `ActualsTab` as a derived value in `useMemo`. This way it updates automatically when merchant classifications change or new months are uploaded.

### 2.4 — Tests

- Transaction with manual merchant override → high confidence
- Income transaction → high confidence
- Groceries transaction (ALWAYS_CORE) → high confidence  
- Medical $-250 (mixed, threshold) → medium confidence
- New merchant in "Uncategorized" → low confidence
- Merchant seen in 3 prior months → high confidence

---

## Layer 3: Frequency-Based Auto-Classification

**Goal:** After 2+ months of data, automatically classify recurring merchants as core.

### 3.1 — Merchant Frequency Analysis

```js
function analyzeMerchantFrequency(monthlyActuals) {
  // Count how many distinct months each merchant appears in
  const merchantMonths = {};
  for (const [month, data] of Object.entries(monthlyActuals)) {
    const seen = new Set();
    for (const txn of data.transactions) {
      if (txn.amount < 0 && !seen.has(txn.merchant)) {
        seen.add(txn.merchant);
        merchantMonths[txn.merchant] = (merchantMonths[txn.merchant] || 0) + 1;
      }
    }
  }
  return merchantMonths;
}
```

### 3.2 — Auto-Classification on Upload

When importing a new month's CSV:
1. Compute merchant frequency from all stored months
2. For each new transaction:
   - If merchant has manual override → use override
   - If merchant appears in 2+ prior months → classify as core (recurring pattern detected)
   - If merchant is new → use Layer 1 logic (category + threshold)

### 3.3 — "Recurring" Badge

Add a visual indicator for frequency-detected recurring merchants: small `↻` icon next to the merchant name, with tooltip "Seen in X months."

### 3.4 — Edge Case: Same Merchant, Mixed Amounts

Some merchants (Affirm, Venmo) have both recurring and one-time transactions. The frequency check should also consider amount consistency:

```js
// If merchant appears 2+ months AND amount is within 20% of the average → core
// If merchant appears 2+ months BUT this amount is 3x+ the average → onetime (unusual)
function isAmountConsistent(amount, merchantHistory) {
  const avg = merchantHistory.reduce((s, a) => s + a, 0) / merchantHistory.length;
  return Math.abs(amount) < Math.abs(avg) * 3;
}
```

### 3.5 — Tests

- Merchant in 1 month only → no frequency boost
- Merchant in 3 months → auto-classified as core
- Merchant in 3 months but current amount is 5x average → flagged as onetime
- Manual override takes priority over frequency detection

---

## Execution Order

```
Layer 1 — Smarter First-Month Defaults (quick, no new UI)
  ├── 1.1 Amount thresholds in classifyTransaction()
  └── 1.2 Tests

Layer 2 — Confidence Badges (UI enhancement)
  ├── 2.1 Confidence scoring function
  ├── 2.2 UI: pill styling + "needs review" count + sort
  ├── 2.3 Derived confidence in useMemo (no storage change)
  └── 2.4 Tests

Layer 3 — Frequency-Based Auto-Classification (needs 2+ months)
  ├── 3.1 Merchant frequency analysis
  ├── 3.2 Auto-classification on upload
  ├── 3.3 Recurring badge UI
  ├── 3.4 Amount consistency check
  └── 3.5 Tests
```

## Files to Modify

| File | Layer | Change |
|------|-------|--------|
| `src/model/csvParser.js` | 1, 3 | Smarter classifyTransaction, frequency analysis |
| `src/model/__tests__/csvParser.test.js` | 1, 2, 3 | New test cases |
| `src/panels/tabs/ActualsTab.jsx` | 2, 3 | Confidence badges, sort, review count, recurring badge |
