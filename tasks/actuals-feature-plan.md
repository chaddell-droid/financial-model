# Actuals Tab — Phased Implementation Plan

**Created:** 2026-04-02
**Status:** Planning

## Overview

New "Actuals" tab that imports real transaction CSVs, classifies them as Core/One-Time/Income, tracks spending month-over-month, and pushes actuals into the financial model.

### CSV Format (from Monarch/bank export)
```
Date,Merchant,Category,Account,Original Statement,Notes,Amount,Tags,Owner
2026-03-31,TacoTime,Restaurants & Bars,Main Checking Account (...6040),TACO TIME...,-13.52,,Shared
```
- **Amount**: negative = expense, positive = income
- **354 rows** typical for a full month
- **Key fields**: Date, Merchant, Category, Amount
- **Unused for now**: Account, Original Statement, Notes, Tags, Owner

### Data Model

```js
// In state
monthlyActuals: {
  "2026-03": {
    transactions: [
      {
        id: "2026-03-31|TacoTime|-13.52",  // dedup key
        date: "2026-03-31",
        merchant: "TacoTime",
        category: "Restaurants & Bars",
        account: "Main Checking (...6040)",
        amount: -13.52,
        type: "core"  // "core" | "onetime" | "income"
      }
    ]
  }
},
// Learned merchant classifications (persists across months)
merchantClassifications: {
  "TacoTime": "core",
  "Delta Air Lines": "onetime",
  "Sarah Dellinger": "income"
}
```

---

## Phase 1: Upload + Classify + Totals (MVP)

**Goal:** Upload a CSV, see transactions categorized, manually fix classifications, see running totals.

### 1.1 — State & Schema
- [ ] Add `monthlyActuals: {}` to INITIAL_STATE
- [ ] Add `merchantClassifications: {}` to INITIAL_STATE
- [ ] Add both to MODEL_KEYS
- [ ] Add schema validation (sanitize objects, validate transaction shape)
- [ ] RANGE constraints: n/a (objects, not numbers)

### 1.2 — CSV Parser
- [ ] New file: `src/model/csvParser.js`
- [ ] Parse CSV string → array of transaction objects
- [ ] Handle quoted fields (merchant names with commas)
- [ ] Generate dedup ID: `${date}|${merchant}|${amount}`
- [ ] Auto-classify amount > 0 as "income"
- [ ] Auto-classify expenses using category mapping + merchantClassifications
- [ ] Default category → type mapping:
  - **Core**: Mortgage, Rent, Groceries, Insurance, Phone, Internet & Cable, Gas & Electric, Fitness, Gas, Auto Payment, Restaurants & Bars, Coffee Shops, Dentist
  - **One-Time**: Travel & Vacation, Medical, Education, Loan Payment, Check, Electronics, Shopping, Clothing, Home Improvement
  - **Income**: any amount > 0
- [ ] Merge logic: new transactions added, existing (by ID) keep their current type

### 1.3 — Actuals Tab UI
- [ ] New file: `src/panels/tabs/ActualsTab.jsx`
- [ ] Add "Actuals" tab to TabBar (between Track and Income)
- [ ] **Top bar**: Month selector (pills for each month with data) + Upload CSV button + "Push to Model" button
- [ ] **Summary cards**: Core Total | One-Time Total | Income Total
- [ ] **Transaction table**: Date | Merchant | Category | Amount | Type (clickable pill: Core/One-Time/Income)
- [ ] Sort by date (newest first), amount, or category
- [ ] Color coding: green=income, orange=one-time, neutral=core

### 1.4 — Wire into FinancialModel
- [ ] Add ActualsTab to tab rendering
- [ ] Pass state + dispatch handlers
- [ ] File input handler: read file, parse, merge into state

### 1.5 — Tests
- [ ] CSV parser: parse valid CSV, handle quoted fields, handle empty rows
- [ ] Dedup: same transaction not added twice
- [ ] Auto-classification: expenses categorized correctly, income detected
- [ ] Merge: new transactions added, existing keep their type override

### 1.6 — Verification
- [ ] Upload the March CSV, see ~354 transactions
- [ ] Running totals match: expenses ~$51K, income ~$17K
- [ ] Change a transaction from core to one-time, re-upload, classification persists
- [ ] `npm test` passes, `npx vite build` succeeds

---

## Phase 2: Push to Model + Month Turnover

**Goal:** One-click sync of actuals into the model inputs. Automatic month separation.

### 2.1 — Push to Model Action
- [ ] "Push to Model" button dispatches:
  - `totalMonthlySpend` = abs(sum of core transactions) / (days elapsed / days in month) — annualized if partial month
  - OR just raw sum if full month
  - `oneTimeExtras` = abs(sum of one-time transactions)
  - `oneTimeMonths` = 1
- [ ] Confirmation: show what will be updated before pushing

### 2.2 — Month Separation
- [ ] On CSV upload, group transactions by `YYYY-MM` from date field
- [ ] Each month gets its own entry in `monthlyActuals`
- [ ] Month selector shows all months with data
- [ ] Totals update per selected month

### 2.3 — Tests
- [ ] Push to model updates correct state fields
- [ ] Multi-month CSV creates separate month entries
- [ ] Month selector switches displayed transactions

---

## Phase 3: Learned Classifier + Trending

**Goal:** System learns from your classifications and shows month-over-month trends.

### 3.1 — Learned Classifier
- [ ] When user changes a transaction's type, update `merchantClassifications[merchant] = type`
- [ ] On next upload, new transactions from known merchants get pre-classified
- [ ] Show "Auto-classified" badge on auto-classified transactions
- [ ] Allow bulk-classify: "Set all [Category] to Core"

### 3.2 — Month-over-Month Trending
- [ ] Summary section showing: "Core: $22K (Mar) → $21K (Apr) → $23K (May)"
- [ ] Simple bar chart or sparkline per category
- [ ] Highlight categories that changed significantly

### 3.3 — Tests
- [ ] Merchant classified in March defaults to same type in April
- [ ] Bulk classify updates all matching transactions
- [ ] Trending correctly computes month-over-month deltas

---

## File Map

| File | Phase | Purpose |
|------|-------|---------|
| `src/state/initialState.js` | 1 | Add monthlyActuals, merchantClassifications |
| `src/state/schemaValidation.js` | 1 | Sanitize new fields |
| `src/model/csvParser.js` | 1 | **NEW** — CSV parsing + auto-classification |
| `src/panels/tabs/ActualsTab.jsx` | 1 | **NEW** — Actuals tab UI |
| `src/components/TabBar.jsx` | 1 | Add Actuals tab |
| `src/FinancialModel.jsx` | 1 | Wire tab + state |
| `src/model/__tests__/csvParser.test.js` | 1 | **NEW** — Parser tests |

---

## Execution Order

```
Phase 1 (MVP) — Upload + Classify + Totals
  ├── 1.1 State & Schema
  ├── 1.2 CSV Parser
  ├── 1.3 Actuals Tab UI
  ├── 1.4 Wire into FinancialModel
  ├── 1.5 Tests
  └── 1.6 Verify with real CSV

Phase 2 — Push to Model + Month Turnover
  ├── 2.1 Push to Model
  ├── 2.2 Month Separation
  └── 2.3 Tests

Phase 3 — Learned Classifier + Trending
  ├── 3.1 Learned Classifier
  ├── 3.2 Trending
  └── 3.3 Tests
```

---

## Resolved Questions

1. **Credit Card Payments** — ARE expenses. Include them in totals. No filtering.
2. **Account tracking** — Track the Account column, show it in the table, but totals are aggregated across all accounts.
3. **Partial months** — No extrapolation. Show actual current totals as-is.
4. **Current month awareness** — System knows the current month (from system date). Prior months can be uploaded for comparison. Month selector distinguishes "current" from "historical."
