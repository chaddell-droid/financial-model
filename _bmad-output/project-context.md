---
project_name: 'financial-model'
user_name: 'Chad_'
date: '2026-04-18'
sections_completed: ['technology_stack', 'language_rules', 'framework_rules', 'testing_rules', 'code_quality']
status: 'updating'
rule_count: 83
optimized_for_llm: true
previous_update: '2026-03-15'
---

# Project Context for AI Agents

_This file contains critical rules and patterns that AI agents must follow when implementing code in this project. Focus on unobvious details that agents might otherwise miss._

---

## Technology Stack & Versions

**Versions (pinned — do not upgrade without approval):**
- **React 18.3.1** + **react-dom 18.3.1**
- **Vite 6.0** + **@vitejs/plugin-react 4.3.4** (single plugin)
- **@dnd-kit suite** — `core 6.3.1`, `sortable 10.0.0`, `utilities 3.2.2` — install all three together or none; used only in `src/rail/`
- **playwright-core 1.58.2** (devDep) — drives `tests/ui/run-swarm.js` and `tests/ui/perf/run-perf.js`; not a unit-test framework

**Conventions:**
- Functional components only. `React.Suspense` is permitted *only* around `LazyRetirementChart` in `src/FinancialModel.jsx` (≈ line 44); do not add new Suspense boundaries
- JavaScript/JSX, ES2020+, ESM only (`"type": "module"`); no `.ts`, `.tsx`, or `.d.ts`
- Inline CSS-in-JS only; no CSS files, CSS modules, Tailwind, styled-components, emotion
- Custom SVG charts (25 files in `src/charts/`) — no d3, recharts, chart.js, visx, nivo
- Fonts via CDN in `index.html`: Inter (UI), JetBrains Mono (all financial figures)

**Constants & boundaries:**
- Package manager is **npm** — do not switch to yarn/pnpm/bun
- **Schema version 5** (`src/state/schemaValidation.js`) — bump + add a sequential migration whenever a MODEL_KEY is *added, renamed, retyped, or removed*
- **`window.storage` polyfill** defined in `src/main.jsx` wraps localStorage with `fs_` prefix
- Persisted storage keys: `fin-scenarios`, `fin-check-ins`, `fin-actuals`, `fin-merchant-classifications`, plus auto-saved model state

## Critical Implementation Rules

### Language-Specific Rules

**Module system:**
- ES Modules only — no CommonJS `require()`, all files use `import`/`export`
- **Named exports** for model/utility functions (`export function`, `export const`); **default exports** for React components (`.jsx` files)
- No TypeScript — no `.ts`, `.tsx`, `.d.ts`; do not add type annotations or JSDoc `@type` assertions that imply checking

**Error handling:**
- **No `try`/`catch` in `src/model/`** — model functions are pure and assume validated numeric input. Input sanitization happens at the storage boundary via `validateAndSanitize()` in `schemaValidation.js`. `try`/`catch` is only allowed around `window.storage.get/set` calls in `FinancialModel.jsx`
- **No thrown errors from projection or simulation** — `runMonthlySimulation` and `computeProjection` must return a valid structure for any schema-valid input

**Default/nullish handling (the most common source of silent bugs):**
- Prefer **`??` nullish coalescing** over `||` for numeric defaults — `0 || 5 === 5` (wrong for valid-zero fields); `0 ?? 5 === 0` (correct). The projection engine uses `??` throughout
- `gatherState()` pattern for reading MODEL_KEYS: `s[key] = st[key] ?? INITIAL_STATE[key]` — never `||`
- `undefined` coerces to `NaN` in arithmetic and silently corrupts downstream balances. Every numeric MODEL_KEY *must* have a non-null default in `INITIAL_STATE`

**Naming & state shape:**
- **Flat camelCase state keys** — no nested objects (`sarahRate`, not `sarah.rate`). `useReducer` state is flat by design
- **`effective*` prefix** for values derived from an override-or-base pair (e.g. `effectiveBaseExpenses` derives from `totalMonthlySpend` if set, else `baseExpenses`). Use this prefix whenever the UI value diverges from the raw state value
- **`cut*` individual fields** (`cutOliver`, `cutMedical`, etc.) + `cutsOverride` — setting any `cut*` slider must clear `cutsOverride`; `FinancialModel.jsx` `set()` does this automatically; preserve that coupling if you touch the setter

**Financial arithmetic:**
- **`Math.round()` every balance, income, and expense value** — the projection carries integer dollars, not floats. No pennies, no floating-point drift
- **Currency formatting**: use `fmt()` and `fmtFull()` from `src/model/formatters.js` — never `Intl.NumberFormat`, never raw `$${value}` template concat
- **`DAYS_PER_MONTH`** constant in `src/model/constants.js` — never hardcode `30.4` or similar

**Variable ordering (real incident — see CLAUDE.md lessons):**
- `const` is NOT hoisted in module scope. If `useMemo A` references variable `B` in its dependency array or body, `B` must be declared *above* `A` in the source file
- Re-ordering `useMemo` blocks in `FinancialModel.jsx` has crashed production — audit both declaration order and dependency arrays when moving memoized values

**MODEL_KEYS discipline:**
- `MODEL_KEYS` (in `src/state/initialState.js`) defines what is persisted, migrated, validated, and passed to the projection. New **financial** fields must be added to both `INITIAL_STATE` and `MODEL_KEYS`
- **UI-only state stays OUT** of MODEL_KEYS: `savedScenarios`, `scenarioName`, `showSaveLoad`, `presentMode`, `comparisons`, `activeTab`, `storageStatus`, `checkInHistory`, `monthlyActuals`, `merchantClassifications`, `activeCheckInMonth`, `mcResults`, `mcRunning`
- `schemaVersion` is tracked by the migration pipeline, NOT in MODEL_KEYS — do not add it

### Framework-Specific Rules (React)

**State ownership:**
- **Single state owner** — `FinancialModel.jsx` is the ONLY component with `useReducer`; all others receive props
- Props drilling is intentional — do NOT introduce Context, Redux, Zustand, Jotai, Valtio, or any state library
- State shape is strictly flat; reducer lives in `src/state/reducer.js`

**Reducer actions (all defined in `src/state/reducer.js`):**
- `SET_FIELD`, `SET_FIELDS` — raw field updates
- `RESTORE_STATE` — runs `migrate()` then `validateAndSanitize()`, captures `_templateBaseState` for template toggling
- `RESET_ALL` — resets model but **preserves** `savedScenarios`, `checkInHistory`, `monthlyActuals`, `merchantClassifications`, `storageStatus`
- `APPLY_TEMPLATE` — overlays overrides on `_templateBaseState` (lets templates be toggled off cleanly)
- Check-in: `RECORD_CHECK_IN`, `DELETE_CHECK_IN`
- Actuals: `MERGE_ACTUALS`, `UPDATE_TRANSACTION_TYPE`, `BULK_CLASSIFY`, `BULK_CLASSIFY_MERCHANT`, `RESET_ACTUALS_MONTH`, `RESET_ACTUALS_ALL`
- New actions must update the sanitize path if they add persisted keys

**`set(field)` setter-cache pattern:**
- `setterCache.current[field]` produces a **stable** callback per field — reuse this across renders so child components can rely on reference equality
- The setter for any `cut*` field (except `cutsOverride`) also clears `cutsOverride` in the same dispatch — do not bypass this coupling
- Consumers receive setters as `onFieldChange={set}` in prop bundles, then call `onFieldChange('fieldName')(value)`

**Custom hooks (allowed only for UI concerns — never for model logic):**
- Existing: `useContainerWidth`, `useRetirementSimulation`, `useRailConfig`, `useChartTooltip`, `useIsVisible`, `useLaggedValue`
- **Never wrap financial computation in a hook.** Do not create `useProjection`, `useMonteCarlo`, etc. Model functions stay as pure exports in `src/model/` so they remain testable under plain `node`

**Memoization & concurrent features:**
- **Every prop bundle is `useMemo`'d** (`bridgeProps`, `cashFlowProps`, `incomeControlsProps`, `expenseControlsProps`, `scenarioStripProps`, `monteCarloProps`, `seqReturnsProps`, `savingsDrawdownProps`, `netWorthProps`, `trackTabProps`, etc.) with exact dependency arrays — *every* variable used inside the memo body must appear in deps
- **`useDeferredValue`** wraps `state` → `deferredState` before projection runs, and wraps `bridgeProps`, `cashFlowProps`, `retirementRailProps`, `goalPanelProps` — this keeps slider drag responsive. Do not remove these defers
- Do NOT add a second `useLaggedValue` debounce on top of `useDeferredValue`; React handles the prioritization

**Lazy loading (one carve-out only):**
- `RetirementIncomeChart` is the only lazy-loaded chart — uses `React.lazy` + `Suspense` + `useIsVisible` via the `LazyRetirementChart` wrapper
- Code-splits `shillerReturns.js` (~162KB) out of the main bundle
- Do not introduce new lazy boundaries without profiling justification

**Monte Carlo isolation:**
- MC runs ONLY via `handleRunMonteCarlo` (button click) — never reactive, never in `useEffect`
- Uses **dynamic `import('./model/monteCarlo.js')`** to code-split MC out of the main bundle
- Wrapped in `setTimeout(..., 50)` so the UI can paint the "running" state before the blocking sim loop
- `mcResults` is UI-only state (not persisted), lives outside MODEL_KEYS

**Auto-save / storage effects:**
- Model state auto-saved via debounced `setTimeout(500ms)` in a `useEffect` keyed on `[state, storageAvailable]`; timer cleared on each change
- `monthlyActuals` and `merchantClassifications` have a separate persistence effect (keyed on their own changes) — do not unify them into the model-state save
- **Never overwrite larger stored data with smaller/empty data** — the `saveModelState` function in `src/state/autoSave.js` guards this; preserve the guard if you touch it
- `checkInHistory` persists independently under `fin-check-ins`

**Tab routing & presentation gating:**
- `activeTab` is a UI-only state key; 7 active tabs wired in `plannerWorkspace`: `overview`, `plan`, `income`, `risk`, `track`, `actuals`, `details`
- `TaxTab.jsx` exists in `src/panels/tabs/` but is intentionally not wired — do not import it without confirming the tax UI is shippable
- `presentMode` forces `effectiveTab = 'overview'` and hides Header SaveLoad controls, TabBar, and all interactive panels
- Rail is hidden when `presentMode` OR `effectiveTab ∈ { 'actuals', 'details' }` — use the `noRailTabs` set, don't hardcode

**New-field wiring — 6-step checklist:**
1. Add default to `INITIAL_STATE` in `src/state/initialState.js`
2. Add key to `MODEL_KEYS` if it should persist / migrate / validate / project
3. Add `RANGE` entry in `src/state/schemaValidation.js` (include the nullable branch for `null`-defaulted fields like `totalMonthlySpend`)
4. If the field is a schema break (rename, retype, delete): add a migration from `CURRENT_SCHEMA_VERSION` → `+1`, bump `CURRENT_SCHEMA_VERSION`
5. Destructure from `state` in `FinancialModel.jsx`; add to every relevant `useMemo` prop-bundle body **and** deps array
6. If derivable at UI layer (override-or-base): expose as `effectiveXxx` and pass `effectiveXxx` through prop bundles, never the raw key

### Testing Rules

**Test infrastructure (no third-party framework by design):**
- No Jest, Vitest, Mocha, ava, or similar test runners installed — do not add them without explicit approval
- Tests are plain Node scripts using the standard-library `node:assert`
- Each test file defines its own inline `test(name, fn)` runner and `near(actual, expected, tolerance, label)` helper — match this pattern, do not extract to a shared util file (keeps test files single-file runnable)
- Every new test file must be added to the `npm test` script in `package.json` — the script chains 17 files with `&&`; a single failure halts the chain

**Running tests:**
- `npm test` — full suite (17 files, ≈1–2 seconds, gate for every commit)
- `node src/model/__tests__/<file>.test.js` — run a single file
- `node src/model/__snapshots__.test.js` — regression snapshots (~400 numerical assertions)
- `npm run ui:swarm`, `npm run ui:perf` — playwright-core browser tests under `tests/ui/`

**Test state construction (canonical pattern):**
- `gatherStateWithOverrides({...})` from `src/state/gatherState.js` is the **only** approved way to build projection input in tests
- Pass *source* fields (e.g. `sarahWorkMonths: 96`) — never set derived values (`totalProjectionMonths`, `effectiveBaseExpenses`, `bcsFamilyMonthly`, SS-computed fields) directly; let `gatherState` derive them
- For reducer/persistence tests, `INITIAL_STATE` is the baseline; shallow-merge only

**Test categories (required for every new field or feature):**
- **Transition boundary tests** — any feature with start/stop months (e.g. `chadJobStartMonth`, `ssdiApprovalMonth`, `vanSaleMonth`, milestone triggers). Assert behavior at `m = start - 1`, `m = start`, `m = end`, `m = end + 1`
- **Display parity tests** — whenever a UI-layer formula *could* diverge from the engine formula, add a test to `displayParity.test.js` that compares the two
- **Regression snapshot tests** — add scenarios to `__snapshots__.test.js` locking exact numerical values; update snapshot baselines in a **separate commit** from behavioral changes so reviewers can distinguish
- **At least 3 tests per new MODEL_KEY**: default behavior, override behavior, edge case
- **Bug-reproducing test FIRST** — when you find a bug manually, add a failing test before fixing it (non-negotiable per CLAUDE.md)

**State migration & round-trip tests:**
- `RESTORE_STATE` is the highest-risk backward-compat path — for every schema bump, add a reducer test that loads a state from the *previous* schema version and verifies the migration output
- `autoSave.test.js` covers the round-trip guard: save → load must return the same state; must not lose data when corrupted input arrives
- Auto-save tests must verify the "never overwrite larger data with smaller data" guard still holds

**Deterministic simulation contract:**
- `runMonthlySimulation(s)` produces **bit-identical** output for identical input — never introduce `Date.now()`, `Math.random()`, or file I/O into the model layer
- Monte Carlo is deterministic when seeded via the `window.__FIN_MODEL_TEST__.getMonteCarloSeed()` test hook in `FinancialModel.jsx`
- `evaluateGoal` (deterministic) and `evaluateGoalPass` (MC inner-loop fast path) in `src/model/goalEvaluation.js` must be updated **in lockstep** — divergence means deterministic results disagree with MC success rates; every goal-logic test should assert both paths produce the same verdict for the same input

**Dual-output patterns that must stay consistent:**
- MSFT vesting: `getVestingLumpSum()` (balance accuracy) and `getVestingMonthly()` (chart smoothing) — tests must cover both; a change to one requires a test asserting the other still matches its expected shape
- Quarterly aggregation in `computeProjection` produces `data[]` (averaged) vs monthly `monthlyData[]` (raw); both consumed by charts — a snapshot test should lock the relationship

**Performance guardrails (Monte Carlo hot path):**
- MC runs 500 sims × `totalProjectionMonths` — every microsecond matters
- Never add object allocation, array copies, regex, or expensive function calls inside the MC loop
- `cutsDiscipline` scales lifestyle cuts in MC — preserve the `s.lifestyleCutsApplied ? totalCuts * cutsDiscipline : 0` pattern; never hardcode a discipline factor inside the sim

**Silent NaN cascade (the #1 silent-failure mode):**
- A new numeric MODEL_KEY with no default in `INITIAL_STATE` causes `undefined → NaN` to cascade through every balance and every chart — projection looks empty, no error thrown
- Every new numeric field MUST have (a) a non-null default in `INITIAL_STATE`, (b) a RANGE entry in `schemaValidation.js`, (c) a test asserting the default produces finite values

**`npx vite build` is a supplementary smoke test:**
- Vite fails on import errors, missing exports, syntax issues that tests might miss
- Required after any rename, file move, or dependency tree change
- Run **after** `npm test` passes, before committing

### Code Quality & Style Rules

**Naming & file conventions:**
- **PascalCase** for `.jsx` React components (`NetWorthChart.jsx`, `RailRenderer.jsx`)
- **camelCase** for `.js` modules (`projection.js`, `gatherState.js`, `chartUtils.js`)
- **UPPER_SNAKE_CASE** for true constants (`INITIAL_STATE`, `MODEL_KEYS`, `COLORS`, `DAYS_PER_MONTH`, `CHAD_RETIREMENT_MONTH`); never for derived/computed values or function output
- `__tests__` folders under their owning directory (`src/model/__tests__/`, `src/state/__tests__/`); `.test.js` suffix on every test file
- Test files import from `../<module>.js` relative — do not introduce path aliases

**Folder boundaries (STRICT — do not violate):**
- `src/model/` must never `import` React, ReactDOM, or any JSX file. Test: "Can I run this file with `node` and zero React?" → if no, it doesn't belong in `model/`
- `src/charts/` and `src/panels/` must never contain financial math beyond presentation concerns (formatting via `fmt/fmtFull`, coordinate mapping via `createScales`, conditional rendering). Financial calculation lives in `model/`
- `src/state/` may import `model/` for schema helpers; `model/` must not import `state/` (reverse dependency breaks the purity)
- `src/rail/` owns the chart-picker subsystem (registry, config, renderer); chart components themselves stay in `src/charts/`
- `src/hooks/` is for general React hooks (ResizeObserver, retirement simulation driver); UI-utility hooks live in `src/ui/`; chart-specific hooks live with their chart in `src/charts/`

**Design tokens (use these, not raw values):**
- `src/ui/tokens.js` exports `UI_BREAKPOINTS` (compact=960, railCollapse=1180, desktop=1400), `UI_TEXT` (micro=12 … hero=24), `UI_SPACE` (xs=6 … xxl=32), `UI_RADII`, `UI_COLORS`, `UI_ACTION_VARIANTS`
- Use `UI_COLORS` tokens (CSS variables like `var(--ui-page)`) inside panels/components whenever possible — the light/dark palette is driven by CSS vars
- Use `UI_SPACE` for gaps/padding in layouts; only drop to literal pixels for chart-internal positioning (SVG coords)
- Use `getShellWidthBucket(width)` from tokens to branch on layout bucket — do not compare `window.innerWidth` directly

**Chart-specific palette (use `COLORS` from `chartUtils.js`):**
- Background: `COLORS.bgDeep` (#0f172a), `COLORS.bgCard` (#1e293b)
- Borders: `COLORS.border` (#334155), `COLORS.borderLight` (#475569)
- Text: `COLORS.textPrimary` / `textSecondary` / `textMuted` / `textDim`
- Semantics (enforce consistency across EVERY status indicator):
  - Green (`COLORS.green` #4ade80) = positive / healthy
  - Red (`COLORS.red` / `redDark`) = negative / danger
  - Amber (`COLORS.amber` #f59e0b) = warning / caution
  - Blue (`COLORS.blue` #60a5fa) = primary
  - Purple (`COLORS.purple` / `purpleLight`) = special / trust income
  - Cyan (`COLORS.cyan` #22d3ee) = investment returns
- **Financial health thresholds** (must match across `GoalPanel` MC rates, `MonteCarloPanel` solvency, `KeyMetrics`):
  - green ≥ 90% (healthy)
  - amber ≥ 70% (caution)
  - red < 70% (danger)
- `INCOME_SOURCES` array in `chartUtils.js` is the single source of truth for income stream labels + colors — every income-stacked chart must iterate it, never hardcode a stream label

**Typography:**
- **Financial figures always render in `fontFamily: 'JetBrains Mono, monospace'`** — every dollar amount, percentage, balance, month label
- UI labels use the default Inter font stack
- Font sizes come from `UI_TEXT` tokens in panel/layout code; chart text can use literals inside SVG for coordinate precision

**Layout & shell sizing:**
- Shell container max-width is **1680** (`FinancialModel.jsx`) — this is the OUTER bound
- Individual tab content may set its own internal max-width (e.g. `TrackTab` clamps to 960)
- `AppShell` handles the summary/tabs/workspace/rail grid; do not build ad-hoc layouts at the root of new tabs — render inside the workspace slot

**Styling primitives:**
- Inline CSS-in-JS only — `style={{ ... }}` objects on elements
- `Toggle.jsx` (23 lines) and `Slider.jsx` (16 lines) are **intentionally minimal** — do NOT add validation, animation, error states, or ARIA polish to these primitives
- If you need rich interactivity, build a new component alongside them; leave the minimal ones untouched

**Chart infrastructure (shared contract):**
- `createScales(padL, padR, padT, padB, svgW, svgH, xDomain, yDomain)` from `chartUtils.js` is the ONLY coordinate-mapping function — no custom scale implementations per chart
- `generateYTicks(min, max, step)` and `autoTickStep(range)` for Y-axis gridlines
- `responsivePadding(containerW)` for width-adaptive padding
- `ChartXAxis.jsx` and `ChartYAxis.jsx` are shared — use them instead of hand-rolling axes
- `chartContract.js` defines the data shape every chart consumes — new charts must validate their prop shape against this contract
- No SVG `viewBox` / `preserveAspectRatio="none"` on chart roots — charts render at their container's actual width (computed via `useContainerWidth`); stretching distorts text labels (real incident — see CLAUDE.md)

**`presentMode` gating (easy to forget — breaks the clean presentation view):**
- Every new interactive control (slider, toggle, button, form, menu) MUST be hidden when `presentMode === true`
- Test the Present-Mode view before merging any UI change

**Fit-and-finish (consistency across ALL charts):**
- Uniform font sizes within the same chart type — do not mix 11/12/13px
- Uniform label positioning conventions (e.g. all comparison endpoint labels above the line, left-aligned)
- When updating one chart, audit the sibling charts for the same pattern; if three charts do annotations one way, the fourth must match

**Comments & documentation:**
- **Default to no comments.** Code should be self-documenting via good names
- Acceptable to comment: a hidden financial rule (SSDI SGA limit semantics), a workaround for a specific bug, a non-obvious invariant, a contractual value that looks magic (MSFT RSU tranche dates)
- Never comment "what the code does" — the identifiers do that
- Never reference the current task, fix, or caller ("added for X story", "used by Y flow") — that belongs in commit messages and rots over time
- No TSDoc/JSDoc `@param`/`@returns` unless the function signature is genuinely ambiguous

### Development Workflow Rules

- **Always build and push after changes** — workflow is: `git pull` → edit → `npm run build` → commit source + `dist/` → `git push origin main`
- **Pull-build-commit-push order matters** — always build AFTER pulling latest; Vite content-hashes filenames (`index-*.js`), building before pull causes false merge conflicts
- **`dist/` is committed** — build artifacts are tracked in git; always rebuild before committing
- **Never hand-edit `dist/`** — source of truth is always `src/`; built files are overwritten every build
- **Single branch** — work directly on `main`; no feature branches or PR workflow
- **Every push to main is production** — no staging, no CI/CD, no rollback; broken push = broken production
- **Pre-push verification** — (1) `npm run build` succeeds, (2) `npm run preview` visually works, (3) existing features still function (sliders, charts, Monte Carlo)
- **Commit messages are the only change history** — no PRs, no tickets, no deploy logs; messages must document what changed and why
- **No environment variables** — all configuration is hardcoded in source; do not introduce `.env` files
- **Financial data is model parameters, not secrets** — hardcoded values (MSFT vesting, debt amounts, share counts) are the application, not sensitive config; do NOT extract to `.env`
- **`window.storage` polyfill is not dead code** — `main.jsx` bridges Claude Artifacts storage API to localStorage; do not remove it; it enables the app to run in both standalone and Artifact contexts
- **No pre-commit hooks or linting** — `npm run build` success is the only automated quality gate
- **Static hosting** — single `index.html` + JS bundle; no SSR, no API routes, no serverless functions

### Critical Don't-Miss Rules

**Anti-Patterns:**
- Do NOT introduce any new dependencies (npm packages) without explicit user approval
- Do NOT refactor the single-root-component architecture — props drilling is intentional, not technical debt
- Do NOT add TypeScript, CSS files, Context providers, or custom hooks — these are deliberate omissions
- Do NOT "improve" the storage polyfill, primitive components, or chart scale utilities — they are stable by design
- Do NOT parameterize `VEST_SHARES` in `constants.js` — these are contractual RSU grant terms, not configurable values

**Data Flow Coupling:**
- **Savings + net worth are coupled across two computation paths** — `computeProjection` (savings) and `computeWealthProjection` (401k/home) feed into `NetWorthChart` together; changes to either require verifying the combined output
- **`backPayActual` propagates to summary UI** — SSDI logic changes in `projection.js` affect `KeyMetrics` and `SummaryAsk` via this return value
- **Comparison overlay data contract** — `compareState` triggers a second projection in `SavingsDrawdownChart`; if data shapes change, old saved comparison scenarios will crash the chart

**Edge Cases:**
- `ssdiDenied` pushes approval to month 999 and zeros backpay — check for this when adding SSDI-dependent logic
- `retireDebt` toggle applies a lump-sum deduction from savings at month 0 — not monthly payments
- Goals array can be empty (`[]`) — all goal-consuming code must handle zero goals gracefully
- `kidsAgeOutMonths` causes SSDI family benefit to drop — time-dependent income that agents may overlook
- Spending cuts are 11 individual items, not a single aggregate — legacy scenarios may have old aggregate `lifestyleCuts` key
- **Month 0 = model start, not January** — simulation uses 0-based month index; `MONTHS` array in `constants.js` maps to calendar dates for display; do not confuse model-month with calendar-month

**DadMode is a Parallel Universe:**
- Separate Monte Carlo (`runDadMonteCarlo`), separate expense breakdown (16 buckets), 3-step wizard (`dadStep` 1/2/3)
- Changes to income sources, expense categories, or state keys may need DUAL updates — one in main flow AND one in `DadMode`
- `dadMode` is not a simple toggle; it's a multi-step stateful presentation flow

**Security:**
- No user authentication, no multi-tenancy, no server — standard web security concerns (XSS, CSRF, injection) do not apply
- localStorage data is unencrypted — this is acceptable for a personal single-user tool

**Performance:**
- Monte Carlo (500 sims) is the only expensive operation — keep it behind the manual "Run" button, never trigger automatically
- `useMemo` dependency arrays must be exact — over-broad deps cause unnecessary re-computation of 72-month projections on every render
- SVG charts re-render on every state change — keep chart components lean; avoid expensive operations in render path

---

## Usage Guidelines

**For AI Agents:**
- Read this file before implementing any code
- Follow ALL rules exactly as documented
- When in doubt, prefer the more restrictive option
- Update this file if new patterns emerge

**For Humans:**
- Keep this file lean and focused on agent needs
- Update when technology stack changes
- Review quarterly for outdated rules
- Remove rules that become obvious over time

Last Updated: 2026-03-15
