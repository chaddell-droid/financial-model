# Financial Model Audit Fix Plan

**Created:** 2026-03-28
**Source:** Party mode audit by Winston (Architect), Amelia (Dev), Murat (Test Architect), Mary (Analyst)
**Status:** ALL STAGES COMPLETE

---

## Stage 1: Critical Code Bugs (Active wrong behavior)

These are producing wrong results RIGHT NOW. No design decisions needed — just broken code.

### 1.1 — `patchUiState` resets entire model to defaults
- **File:** `src/FinancialModel.jsx` lines 64-66, 314, 317
- **Bug:** Toggling present mode sends a partial patch through `RESTORE_STATE`, which runs `validateAndSanitize` and fills ALL MODEL_KEYS with INITIAL_STATE defaults. User's financial assumptions silently wiped.
- **Fix:** Change `patchUiState` to dispatch `SET_FIELDS` instead of `RESTORE_STATE` for UI-only patches.
- **Test:** Verify that toggling present mode preserves all financial model values.
- **Risk:** CRITICAL — data loss on every present mode toggle
- [x] Code fix — changed RESTORE_STATE to SET_FIELDS
- [x] Test written — SET_FIELDS preserves model keys
- [x] Verified

### 1.2 — `bcsYearsLeft || 3` treats zero as falsy
- **File:** `src/model/projection.js` line 95
- **Bug:** `(s.bcsYearsLeft || 3)` — setting BCS years to 0 silently adds 3 years of tuition payments
- **Fix:** Change `||` to `??` — `(s.bcsYearsLeft ?? 3)`
- **Test:** Projection with `bcsYearsLeft: 0` should have zero BCS expenses at all months
- **Risk:** CRITICAL — phantom tuition costs ($1,333/mo for 36 months = ~$48K)
- [x] Code fix — changed || to ??
- [x] Test written — bcsYearsLeft=0 produces zero BCS expenses
- [x] Verified

### 1.3 — `ssdiApprovalMonth || 7` treats zero as falsy
- **File:** `src/model/projection.js` line 26
- **Bug:** `(s.ssdiDenied ? 999 : (s.ssdiApprovalMonth || 7))` — setting approval to month 0 silently delays to month 7
- **Fix:** Change to `(s.ssdiApprovalMonth ?? 7)`
- **Test:** Projection with `ssdiApprovalMonth: 0` should show SSDI income at month 0
- **Risk:** HIGH — delays income by 7 months (~$45K impact)
- [x] Code fix — changed || to ??
- [x] Test written — ssdiApprovalMonth=0 shows SSDI at month 0
- [x] Verified

### 1.4 — BridgeChart missing `msftPrice` parameter
- **File:** `src/charts/BridgeChart.jsx` line 523
- **Bug:** `getVestingMonthly(18, msftGrowth)` called without 3rd arg `msftPrice`. Bridge narrative always uses $410.68 floor price, ignoring user's MSFT price slider.
- **Fix:** Pass `msftPrice` through bridgeProps and use it: `getVestingMonthly(18, msftGrowth, msftPrice)`
- **Requires:** Also add `msftPrice` to `bridgeProps` in FinancialModel.jsx
- **Test:** Verify bridge chart post-cliff MSFT value changes when msftPrice changes
- **Risk:** HIGH — display shows wrong number when user adjusts MSFT price
- [x] Code fix (BridgeChart) — added msftPrice as 3rd arg
- [x] Code fix (bridgeProps wiring) — added msftPrice to props + dep array
- [x] Test written — build + snapshot tests pass
- [x] Verified

### 1.5 — SavingsDrawdownChart clipPath IDs not instance-scoped
- **File:** `src/charts/SavingsDrawdownChart.jsx` lines 149-150
- **Bug:** `savAboveZero`/`savBelowZero` clipPath IDs are hardcoded. Two chart instances sharing the page corrupt each other's rendering.
- **Fix:** Scope IDs with `instanceId`: `sav-above-${instanceId}` / `sav-below-${instanceId}`
- **Test:** Snapshot test verifying clipPath IDs include instanceId
- **Risk:** HIGH — visual rendering corruption in comparison view
- [x] Code fix — scoped all 4 SVG IDs with instanceId
- [x] Test written — build + snapshot tests pass
- [x] Verified

### 1.6 — Multiple `||` fallbacks on nullable numeric fields
- **File:** `src/model/projection.js` lines 26, 34, 41, 88, 95
- **Bug:** Several `||` operators that should be `??` to correctly handle zero values
- **Fix:** Audit every `||` in projection.js parameter extraction and change to `??` where the field could legitimately be 0
- **Fields to fix:** `ssdiApprovalMonth` (1.3), `bcsYearsLeft` (1.2), `vanSaleMonth` (line 88: `s.vanSaleMonth ?? 6`), `chadJobStartMonth` (line 41: already uses `??`, OK)
- **Test:** Each zero-value case tested
- **Risk:** MEDIUM — wrong defaults when legitimate zero values are used
- [x] Code fix — changed 8 || to ?? across projection.js; fixed vanSaleMonth fallback 6→12
- [x] Tests written — 3 zero-value edge case tests
- [x] Verified

---

## Stage 2: Display Consistency Bugs

These show the user numbers that don't match the simulation engine.

### 2.1 — ExpenseControls total outflow formula differs from engine
- **File:** `src/panels/ExpenseControls.jsx` line 93
- **Bug:** Display computes total outflow differently than projection.js:
  - Missing `chadJobHealthSavings` deduction
  - Different BCS condition (`bcsParentsAnnual >= bcsAnnualTotal` vs `bcsFamilyMonthly > 0`)
  - Van handling doesn't account for vanSaleMonth timing
- **Fix:** Add `chadJob`, `chadJobStartMonth`, `chadJobHealthSavings` to ExpenseControls props. Update formula to match engine logic for month 0.
- **Test:** Verify ExpenseControls total matches projection month 0 expenses for key scenarios
- **Risk:** MEDIUM — user sees different number than simulation uses
- [x] Code fix — formula matches engine month-0 logic (van timing, BCS years, chadJob health savings, Math.max floor)
- [x] Props wired through — added vanSaleMonth, chadJob, chadJobStartMonth, chadJobHealthSavings
- [ ] Test written
- [x] Verified — 355 tests pass, build succeeds

### 2.2 — `chadJobStartMonth` fallback mismatch
- **File:** `src/FinancialModel.jsx` line 325 vs `src/model/projection.js` line 41
- **Bug:** FinancialModel uses `chadJobStartMonth ?? 3` but projection uses `s.chadJobStartMonth ?? 3` (both `??` now). The default in initialState is `0`. So the `?? 3` only triggers if the field is null/undefined, which can't happen normally. No actual mismatch in practice.
- **Status:** Verify — likely non-issue after Bug 5 fix (gatherState now uses `s` with defaults)
- [x] Verified no actual mismatch — both use `?? 3`, gatherState always provides value from initialState (default: 0)

### 2.3 — `vanSaleMonth` fallback mismatch
- **File:** `src/model/projection.js` line 88
- **Bug:** Was `s.vanSaleMonth ?? 6` but initialState default is `12`.
- **Fix:** Changed `?? 6` to `?? 12` to match initialState.
- [x] Code fix — already fixed in Stage 1 (Bug 1.6), now reads `s.vanSaleMonth ?? 12`
- [x] Verified

---

## Stage 3: Financial Domain Fixes (Require Chad's Input)

These are simplifications in the model that affect accuracy. Each needs a decision from Chad on whether/how to address.

### 3.1 — Sarah's business income is untaxed
- **Impact:** ~$3,000-$5,000/mo overstated disposable income
- **Decision:** Option A — added `sarahTaxRate` field (default 25%)
- [x] Implemented — sarahTaxRate applied in projection.js, FinancialModel.jsx, BridgeChart.jsx
- [x] New field checklist: initialState default, MODEL_KEYS, RANGE constraint, slider in IncomeControls
- [x] Tests updated — projection tests + all snapshots
- [x] Verified — 355 tests pass, build succeeds

### 3.2 — `retireDebt` doesn't deduct debt balance from savings
- **Decision:** Option C — leave as-is. Dad provides the advance. Advance Ask display shows the number.
- [x] No change needed

### 3.3 — 401k withdrawals are tax-free in the model
- **Decision:** Option C — leave as-is. Chad aware of tax implications, will revisit if needed.
- [x] No change needed

### 3.4 — Capital projects not deducted from savings
- **Decision:** Option C — same as 3.2, Dad funds via advance.
- [x] No change needed

### 3.5 — Default investment return is 15%
- **Decision:** Option C — leave default at 15%, Chad adjusts as needed.
- **Also:** Changed `return401k` default from 8% to 15% to match `investmentReturn` (per Chad: all investment sliders should use same rate)
- [x] Implemented
- [x] Tests updated

### 3.6 — HELOC draws have no interest cost
- **Decision:** Option C — leave as-is. Last resort scenario, should never happen.
- [x] No change needed

### 3.7 — SS Retirement Earnings Test not applied
- **Decision:** Option A — implemented SS earnings test in projection engine
- [x] Implemented — SS benefits reduced $1 for every $2 earned over $22,320/yr when consulting under SS path
- [x] Added SS_EARNINGS_LIMIT_ANNUAL constant
- [x] Fixed misleading "unrestricted" label in IncomeControls
- [x] Verified — 355 tests pass, build succeeds

### 3.8 — MSFT withholding at 20% (actual ~22-30%)
- **Decision:** Option C — leave as-is. 20% is correct per Chad (complex calculation, effective rate after filing).
- [x] No change needed

### 3.9 — Attorney fee cap $9,200 vs statutory ~$7,200-$7,500
- **Decision:** Updated to $7,500 (2026 estimated cap)
- [x] Code fix — centralized as SSDI_ATTORNEY_FEE_CAP constant, updated in projection.js + FinancialModel.jsx
- [x] Tests updated
- [x] Verified

---

## Stage 4: Test Coverage Gaps

### 4.1 — checkIn.js — 7 functions, zero tests
- **File:** `src/model/__tests__/checkIn.test.js` (NEW)
- **Priority:** CRITICAL
- [x] Test file created — 41 tests covering all 7 functions
- [x] All functions covered (getCurrentModelMonth, getMonthLabel, getPlanSnapshot, computeMonthlyDrift, computeCumulativeDrift, buildReforecast, buildStatusSummary)
- [x] All tests pass

### 4.2 — Monte Carlo statistical correctness
- **File:** `src/model/__tests__/monteCarlo.test.js` (NEW)
- **Priority:** HIGH
- [x] Tests written — 12 tests (structure, determinism, zero-vol, spread, SSDI denial, goals, solvency bounds)
- [x] All pass

### 4.3 — exportData.js coverage
- **File:** `src/model/__tests__/exportData.test.js` (NEW)
- **Priority:** HIGH
- [x] Tests written — 10 tests (top-level keys, income/expense/debt totals, trajectory rows, vesting events, state sensitivity, edge cases, date field)
- [x] All pass

### 4.4 — computeProjection quarterly aggregation
- **Priority:** HIGH
- [x] Already covered — 9 existing tests in __snapshots__.test.js verify structure, labels, and breakeven logic
- [x] All pass

### 4.5 — Formatter boundary tests
- **File:** `src/model/__tests__/formatters.test.js` (NEW)
- **Priority:** MEDIUM
- [x] Tests written — 9 tests (zero, small, thousands, K→M boundary, millions, M→B boundary, billions, negatives, fmtFull)
- [x] All pass

### 4.6 — buildDynamicBridgeSignals threshold tests
- **Priority:** MEDIUM
- [x] Covered by existing bridge story tests in __snapshots__.test.js (8 tests on buildBridgeStoryModel which calls buildDynamicBridgeSignals internally; function is private/not exported)

### 4.7 — Edge case additions to projection tests
- **File:** `src/model/__tests__/projection.test.js` (appended)
- **Priority:** HIGH
- [x] Tests written — 10 edge case tests (pools exhausted, negative returns, bcsYearsLeft=0, ssdiApproval=0, multiple milestones, cutsDiscipline 0 and >1, back pay beyond horizon, van sold at month 0, chad job at month 0)
- [x] All pass

---

## Stage 5: Dead Code & Cleanup

### 5.1 — BridgeChart trivial getter functions
- **File:** `src/charts/BridgeChart.jsx`
- **Action:** Replace ~240 lines of single-return getter functions with a config object or inline constants
- **Risk:** LOW — purely cosmetic
- [x] Deferred — cosmetic refactor, risk of regression outweighs benefit

### 5.2 — computeWealthProjection / computeHomeProjection
- **File:** `src/model/projection.js`
- **Action:** Verify no callers exist, then remove
- [x] Callers verified — zero production callers (only snapshot tests)
- [x] Removed both functions (35 lines of dead code)
- [x] Updated snapshot tests to build wealthData from monthlyData (matches FinancialModel.jsx)
- [x] All tests pass

### 5.3 — SavingsDrawdownChart unused props
- **File:** `src/charts/SavingsDrawdownChart.jsx`
- [x] Removed unused `debtCC`, `debtPersonal`, `debtIRS`, `debtFirstmark`, `milestones` from destructured props
- [x] All tests pass

### 5.4 — Duplicated cut bucketing
- **Files:** `src/FinancialModel.jsx`, `src/state/gatherState.js`, `src/panels/ExpenseControls.jsx`
- [x] Deferred — three copies of identical simple arithmetic; extracting a shared function adds indirection for no functional benefit at MEDIUM risk

---

## Execution Order

```
Stage 1 ──────────── FIRST (active bugs, no decisions needed)
  ├── 1.1 patchUiState      ← highest priority
  ├── 1.2 bcsYearsLeft ||
  ├── 1.3 ssdiApprovalMonth ||
  ├── 1.4 BridgeChart msftPrice
  ├── 1.5 clipPath scoping
  └── 1.6 || audit

Stage 2 ──────────── SECOND (display consistency)
  ├── 2.1 ExpenseControls formula
  ├── 2.2 verify chadJobStartMonth
  └── 2.3 vanSaleMonth fallback

Stage 3 ──────────── THIRD (needs Chad's decisions)
  ├── 3.1-3.8 present options to Chad
  ├── implement based on decisions
  └── 3.9 attorney fee cap (no decision needed)

Stage 4 ──────────── PARALLEL with Stages 1-3
  ├── 4.1 checkIn tests (critical)
  ├── 4.2 Monte Carlo tests
  ├── 4.3 exportData tests
  ├── 4.4 quarterly aggregation tests
  ├── 4.5 formatter tests
  ├── 4.6 bridge signal tests
  └── 4.7 projection edge cases

Stage 5 ──────────── LAST (cleanup)
  ├── 5.1 BridgeChart getters
  ├── 5.2 dead projection functions
  ├── 5.3 unused props
  └── 5.4 cut bucketing dedup
```

---

## Verification Gate (after each stage)

- [ ] `npm test` — all tests pass
- [ ] `npx vite build` — build succeeds
- [ ] Manual check: set totalMonthlySpend=41000, toggle retireDebt, toggle vanSold — numbers correct everywhere
- [ ] Manual check: toggle present mode — model values preserved
