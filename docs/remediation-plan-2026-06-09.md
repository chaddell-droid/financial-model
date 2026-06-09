# Remediation Plan — 2026-06-09 Deep Audit

Source: 91-agent swarm audit (75 confirmed findings, 5 critic findings, 38 low observations).
Full structured findings: `C:\Users\chad_\AppData\Local\Temp\claude\C--Users-chad--financial-model-financial-model\a46d4044-80dd-415c-af6c-b2a5570fbd09\tasks\wztzyduj7.output`

## Working rules (apply to every phase)

- Reproducing test BEFORE each fix (project rule).
- Every commit passes the full gate: `npm test` + `npx vite build` + dev-server restart + screenshot verify.
- One workstream per commit; push to main after each phase lands.
- Data-protection fixes are shared utilities, not per-call-site patches.

---

## Phase 0 — Fix the test gate (FIRST: everything later depends on it)

The gate silently skips 9 test files (~69 tests) and the 111-test tax suite imports vitest (not installed). New regression tests added in later phases could silently not run.

- **0.1** Replace the hand-maintained `node <file>` chain in `package.json:11` with a glob-discovery runner (`scripts/run-tests.mjs` finding `src/**/__tests__/*.test.js` + `src/model/__snapshots__.test.js` + `src/panels/__tests__`, etc.).
- **0.2** Add a meta-test: every `*.test.js` on disk is executed by the gate (fails on orphans).
- **0.3** Port `taxEngine.test.js` (89 cases) and `taxProjection.test.js` (22 cases) from vitest to the project's plain-node assert harness (same pattern as `taxFixes.test.js`).
- **0.4** Run the full suite — newly-enabled tests have never run in the gate; fix or explicitly triage each failure before proceeding.

**Exit criteria:** `npm test` executes every test file on disk; total count reported and locked by the meta-test.
**Effort:** ~1 session.

---

## Phase 1 — Stop active data loss (immediately after Phase 0)

- **1.1 Check-in restore wipe (CRITICAL).** Tests first: RESTORE_STATE with a partial payload over a state with multiple NON-default values (current tests start from INITIAL_STATE, masking the clobber); round-trip: record check-in → reload path → model intact + check-ins present. Fix: never route partial payloads through RESTORE_STATE — restore `checkInHistory` via a dedicated action (mirroring the `monthlyActuals` restore), with array sanitization. `FinancialModel.jsx:313-326`, `reducer.js:10-15`.
- **1.2 `debt_free` goal deletion (CRITICAL).** Add to `VALID_GOAL_TYPES` (`schemaValidation.js:147`); regression test round-tripping one goal of EVERY type GoalPanel offers.
- **1.3 Shared persistence guard (HIGH, systemic).** Build `safeWrite(key, value, opts)` in `src/state/`: (a) one-generation backup (`<key>.bak`) before overwrite; (b) anti-clobber — refuse to overwrite a non-trivial stored payload with an empty/INITIAL_STATE-equivalent/dramatically-smaller payload (quarantine key + console warn instead); (c) hydration gating — auto-save effects disarmed until the restore promise settles (`hydratedRef`). Apply to ALL six layers: `fin-model-state` (`autoSave.js:29`), `fin-scenarios` (`FinancialModel.jsx:415-431` — track load-failure flag, re-read+merge on write after failed load), `fin-merchant-classifications` + `fin-actuals` (`FinancialModel.jsx:361-369` — split restore try-blocks, gate persist on restore-complete), advisor conversations (`AdvisorPane.jsx:95` — `loadedRef`), rail config.
- **1.4 Intentional-clear semantics.** RESET_ACTUALS_ALL and deleting the last check-in must persist (backup → explicit clear) so resets stick; currently deleted data resurrects on reload.
- **1.5 Rail width wipe.** Merge `railWidth` into the saved config object so chart add/remove/reorder stops erasing it (`useRailConfig.js:46`).
- **1.6 Committed API key.** CHAD ACTION: revoke/rotate the Alpha Vantage key (`TNLBGSM5GKK3GEAT`). Code: move to `import.meta.env.VITE_ALPHA_VANTAGE_KEY`, keyless Yahoo endpoint as primary (`MsftVestingChart.jsx:43`); add a secret-scan check.
- **1.7 Dev harness safety.** `?reset_storage=1` / `clearStorage` snapshot all `fs_*` keys to a timestamped backup key before deleting (`src/testing/uiHarness.js:53-68`).

**Tests:** corrupted-load, restore-race, and empty-overwrite reproductions for each layer.
**Effort:** 1–2 sessions.

---

## Phase 2 — Wrong numbers on screen (critical correctness)

- **2.1 Inheritance double-count (CRITICAL).** Test first (per project rule): a cash event present in both `supplementalFlows` and `rescueFlows` credits the pool exactly once. Fix: single carrier — keep inheritance in supplementalFlows; `rescue` applies only when the pool is pinned at the floor (matching the deterministic loop). `ernWithdrawal.js:107-108`, `useRetirementSimulation.js:138-153`.
- **2.2 W-2 FICA basis (CRITICAL).** `totalGrossYr` uses `hireGrownTotal / 4` so gross, net, FICA, and blended take-home % share one steady-state basis (`w2Diagnostic.js:105`); update the displayParity regression tests that currently lock the wrong value.
- **2.3 Retirement context drift (HIGH).** Derive `ageDiff` from `chadCurrentAge - sarahCurrentAge` (state says 2; module hardcodes 14) and promote `sarahOwnSS` to a state field (full New Field Checklist) or derive it (`useRetirementSimulation.js:58-82`). Parity test: retirement context vs gatherState.
- **2.4 Post-job SS anchor (MEDIUM, boundary).** Anchor the post-job age gate to the same calendar math as `ssStartMonth` (`(claimAge-62)*12 + SS_START_OFFSET`) — currently fires ~7 months early (`projection.js:347-350`). Transition test: both paths start the same month.
- **2.5 Withdrawal slider (HIGH).** (a) Two-phase band path scales by the user's slider as its comment claims (`useRetirementSimulation.js:359-371`); (b) dirty-flag the slider so the sync effect (`:456-460`) stops clobbering manual values. Tests for both.
- **2.6 CSV integrity (HIGH, critic).** Dedupe key gains Original-Statement field and/or per-file occurrence counter so legitimate same-day/same-amount transactions survive (`csvParser.js:138`); amount parsing strips `[$,]`, uses `Number()`, surfaces a warning count for non-finite rows instead of storing garbage (`csvParser.js:134`). Tests: twin same-day rows; `"-1,234.56"`.
- **2.7 Quarterly horizon (MEDIUM).** `buildQuarterlySchedule` covers the full projection (limit = `totalProjectionMonths`; aggregation already handles partial trailing quarters) — last 12 months currently invisible in quarterly charts (`constants.js:74`).

**Effort:** ~2 sessions.

---

## Phase 3 — Product decisions (Chad's call; recommended defaults marked ★)

| # | Decision | Options |
|---|----------|---------|
| D1 | **Tax tab** (built but unreachable; fields not in state) | ★ A: Wire it — TabBar entry + render branch, pass full `gatherState()` to buildTaxSchedule (fixes the partial-state bug), add `tax*` fields per New Field Checklist; engine stays display-only initially (fix taxProjection docstring). A2 (follow-on): wire engine into the monthly sim behind `taxMode==='engine'`. B: delete TaxTab/TaxSettingsPanel/TaxVisualization + fix IncomeControls copy pointing at it (~2 hrs). |
| D2 | **GoalPanel** (built, prop-plumbed, never rendered; Overview copy points to it) | ★ Re-render it on the tab the copy references. B: remove copy + dead goalPanelProps. |
| D3 | **Spousal SS rule** (model pays `min(own, spousal)`; SSA pays larger) | ★ Match SSA (`max`), interpolate survivor reduction by claim age, update locked tests. B: keep as deliberate conservatism — document in function header + test names. |
| D4 | **Capital items never hit savings** (implicit "Dad's advance covers it") | ★ Funding-source toggle: "advance covers" (current) vs "pay from savings" (deducts at scheduled month). B: document the external-advance assumption prominently. |
| D5 | **Dead charts** (TimelineChart, MonthlyCashFlowChart, Chad401kChart) | ★ Wire Chad401kChart (props ready; fix its SVG pattern first — Phase 7); delete the other two + their dead prop bundles. B: delete all three. |
| D6 | **No-op controls** | ★ Kids-age-out slider → read-only calendar-derived display (zero engine effect across full range); Likelihood slider → either weight the ask (cost × likelihood, labeled expected value) or relabel as metadata. |
| D7 | **401k/HELOC deficit draw** (tax-free + interest-free today) | ★ Gross up 401k draws by effective tax rate; model HELOC interest OR rename to "home equity sale" honestly. |
| D8 | **Monte Carlo design** (one constant return per sim → no sequence-of-returns risk) | ★ Label the panel "assumption uncertainty" now (honest, cheap); optional later: monthly path sampling. |

---

## Phase 4 — Tax engine accuracy (each item ships with a regression test)

- CTC → $2,200 + 5%-over-$400K-MAGI phase-out (`taxConstants.js:67`).
- Additional Medicare: full liability in totalTax; withheld 0.9% treated as prepayment in `balance` (`taxEngine.js:263-275`).
- Provisional income: subtract `halfSeTax` + `effective401k` from otherAGI (`taxEngine.js:220`).
- QBI base: `max(0, schCNet − halfSeTax − effective401k) × QBI_RATE` (`taxEngine.js:92`).
- SALT: fix double-count with inflation-adjust on; default to 2026 cap (`taxProjection.js:312`).
- Solo-401(k) limits → 2026 values (acknowledged TODO, `taxConstants.js:70-73`).
- `estimateAnnualSSBenefits`: re-mirror projection.js (TWINS_AGE_OUT_MONTH step-down, postJobBenefit branch, defaults, horizon `Math.ceil((months+1)/12)`) + parity test summing projection's monthly ssBenefit per year (`taxProjection.js:69-110`).
- Document the March–February projection-year vs calendar-tax-year window.

**Effort:** 1–2 sessions.

---

## Phase 5 — Remaining engine/state correctness

- Comparison pipeline: `computeProjection(gatherState(validateAndSanitize(migrate(c.state))))` — currently raw saved state, no migration (`FinancialModel.jsx:253-258`); old-schema scenario test.
- Seven `mc*` fields → MODEL_KEYS so their RANGE constraints execute and MC settings persist (`initialState.js:251-285`).
- SS earnings test: August-aligned refresh issuance via `firstAugustAtOrAfter` (`projection.js:415-423`).
- JSON export: `effectiveCapitalItems` + customLevers; total parity test vs advanceNeeded (`exportData.js:86-89`).
- `checkIn.js`: crash guards for missing actuals/planSnapshot (`:99-100`); 72-month clamp vs 204-month projections (`:11`).
- Pension accrual: month count + promotions/raises (`gatherState.js:123-128`).
- KeyMetrics Base Monthly Spend: clamp on input (`KeyMetrics.jsx:120`).
- Sanitizer hardening: milestone/leverConstraints range clamping; finite-number checks (consistency, even where currently unreachable).
- Display parity: ActiveTogglePills/DecisionConsole use effective cuts (`getEffectiveCuts`), not raw `cutsOverride ?? 0` (`FinancialModel.jsx:983`).
- SSDI back-pay "Gross" row label vs auxiliary back-pay (`IncomeControls.jsx:1158`).

---

## Phase 6 — Performance (ordered by leverage)

- **6.1** Key the main projection + reforecast on the extracted MODEL_KEYS subset, not the whole state object (`FinancialModel.jsx:215`) — kills full-engine re-runs on tab switches/keystrokes/status timers. Verify with a render/compute counter before/after. **Single highest-leverage change.**
- **6.2** `chadTaxBreakdown` keyed on tax inputs (or deferred path), not `[state]` (`FinancialModel.jsx:628`).
- **6.3** Tornado: depend on data (base projection / gathered state object), not the unstable `stableGatherState` identity — currently up to 15 full projections per state change (`MonteCarloPanel.jsx:39`); wrap MonteCarloPanel + IncomeCompositionChart in `React.memo`; hoist the inline income rail props.
- **6.4** Tooltip systemic fix: adopt `useChartTooltip` (adding a prev-index bail-out: `setTooltip(prev => prev?.index === i ? prev : next)`) in the line/area charts (NetWorth, SavingsDrawdown, MonteCarloPanel, RetirementComposition, SarahPractice); functional-update bail-outs in the rest; consider extracting a tooltip layer for RetirementIncomeChart's 1141-line tree.
- **6.5** BridgeChart: build `pts` inside the memo (drop unstable dep), ADD `msftPrice` to deps (regression test: post-cliff marker updates when only msftPrice changes), move empty-return after hooks. Fix hook-order in ContinuousLeverSlider (`:41` — hooks above early returns; clamp min>max) and tidy MonteCarloPanel's. Add `eslint-plugin-react-hooks` to prevent recurrence.
- **6.6** `plannerWorkspace`/`plannerSummary` deps audit (missing rendered values → stale controlled inputs during deferred windows; `FinancialModel.jsx:998,1092`); hoist Plan-tab prop spreads like the risk-tab ones; delete dead deferred bundles.
- **6.7** Lows (opportunistic): SavingsDrawdown annotation memo; computeBands single-sort; CSV per-row classification hoist; dedupe `formulaSupplementalFlows`.

---

## Phase 7 — Consistency & cleanup

- Migrate the 7 hand-rolled-axis charts to ChartXAxis/ChartYAxis (SequenceOfReturns, RetirementComposition, SarahPractice, MonteCarloPanel, RetirementIncome, Chad401k, BridgeChart).
- One palette: migrate the 8 hex-hardcoded charts + BridgeChart's UI_COLORS to COLORS; add named tokens for the intentional orange/emerald; guard test against new hex literals in `src/charts/` outside chartUtils.
- Fix `COLORS.text` (nonexistent key → invisible crosshair) in Chad401kChart + IncomeControls; test that every referenced COLORS key exists.
- Chad401kChart: standard pattern (useContainerWidth, drop `preserveAspectRatio="none"` — documented distortion trap).
- TimelineChart: derive share counts/months from vestEvents or delete per D5.
- Unify time-axis labels, empty-data handling, and fmt() money formatting; align Mini chart expense-line color with IncomeCompositionChart.
- Dead code purge: CUMULATIVE_REAL_INDICES (~1,860 lines), dead exports (responsivePadding, getSsBenefitShortLabel, METRIC_LABELS), dead imports, dead prop bundles, useChartTooltip adoption-or-delete.
- docs/ refresh to match the actual app.
- File-size rule: split FinancialModel.jsx (1323), IncomeControls.jsx (1175), RetirementIncomeChart.jsx (1141) toward 500 lines — opportunistic, last.

---

## Phase 8 — Advisor

- Pass AbortSignal to `client.messages.stream({...}, { signal })` so Stop works; wire `ADVISOR_REQUEST_TIMEOUT_MS` (`advisorAgent.js:80`).
- Pricing constants → 5 / 25 / 0.5 / 6.25 (lifetime display self-corrects since tokens are stored).
- Surface iteration-cap and `max_tokens` truncation: pass onError from AdvisorPane; "response was cut off" banner (`advisorAgent.js:187`).
- Verifier: kind-matched pools (months vs percents vs dollars by path heuristics); add household-snapshot numbers to the pool (`verifier.js:197`).
- "Apply this move": hide for topMoves or include mutation objects in the tool result (`AdvisorPane.jsx:605`).
- Prompt-cache: reorder static blocks (PERSONA, TOOL_PHILOSOPHY, BOUNDARIES) before the volatile household block; breakpoint on last message (`systemPrompt.js:264`).
- Lows: persist tool-call ids (React key collisions), `runProjection` falsy-zero startMonth fix, hardcoded storage key → config constant.
- Key storage: add "remember key" toggle (in-memory/sessionStorage default); spend-capped-key recommendation in Settings copy. (Accepted residual risk otherwise.)

---

## Phase 9 — Coverage backfill

- Rail subsystem: railConfigStorage round-trip/malformed-JSON/missing-storage tests; useRailConfig mutators via pure-function extraction (its `__tests__` dir is empty).
- Tax chart contracts in chartContracts.test.js + buildTaxSchedule snapshot in `__snapshots__.test.js`.
- useRetirementSimulation: extract pure derivation (state → sim params), unit-test SS + SSDI configs; delete the source-text-grep pseudo-tests.
- Transition-boundary and display-parity tests added per-fix in Phases 2–5 (already counted there).

---

## Sequencing & cadence

```
Phase 0 → Phase 1 → Phase 2        (strictly sequential; ~4-5 sessions)
Phase 3 decisions: answer any time before Phase 5
Phases 4–9: independent, interleave freely (~6-9 sessions)
```

Every phase = one or more commits, each passing the full gate, pushed to main on completion. Total estimate: **10–14 working sessions**, front-loaded so the data-loss and wrong-number risk is gone in the first ~3.

## Refuted findings (no action; documented for the record)

MC main-thread blocking (measured fast), advisor tool blocking (measured fast), MonteCarloPanel hooks crash (unreachable — panel unmounts), earnings-test attribution harm (doesn't materialize), NaN goal sanitizer (unreachable through real dispatchers). The hook-order and sanitizer items still get tidied in Phases 5–6 as hardening.
