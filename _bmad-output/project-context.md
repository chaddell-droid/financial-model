---
project_name: 'financial-model'
user_name: 'Chad_'
date: '2026-03-15'
sections_completed: ['technology_stack', 'language_rules', 'framework_rules', 'testing_rules', 'code_quality', 'workflow_rules', 'critical_rules']
status: 'complete'
rule_count: 83
optimized_for_llm: true
---

# Project Context for AI Agents

_This file contains critical rules and patterns that AI agents must follow when implementing code in this project. Focus on unobvious details that agents might otherwise miss._

---

## Technology Stack & Versions

- **React 18.3.1** — functional components only, no class components
- **Vite 6.x** — build tool + dev server, minimal config (single plugin)
- **JavaScript ES2020+ (JSX)** — no TypeScript, `"type": "module"` in package.json
- **Inline CSS-in-JS** — style objects on elements, no CSS files or CSS-in-JS libraries
- **Custom SVG charts** — hand-built, no charting libraries (no d3, recharts, chart.js)
- **localStorage** — persistence via polyfilled `window.storage` API
- **Fonts** — Inter (UI) + JetBrains Mono (financial figures) via CDN
- **Zero runtime dependencies** beyond React/ReactDOM — all computation is custom

## Critical Implementation Rules

### Language-Specific Rules

- **Named exports** for model/utility functions, **default exports** for React components
- **ES Modules only** — no CommonJS `require()`, all files use `import`/`export`
- **No TypeScript** — do not add `.ts`/`.tsx` files or type annotations
- **No try/catch in model layer** — pure functions assume valid numeric inputs from state
- **Flat camelCase state keys** — no nested objects in state (e.g., `sarahRate` not `sarah.rate`)
- **`set(field)` callback pattern** — components receive `set('fieldName')` which returns `(value) => dispatch({type: 'SET_FIELD', field, value})`
- **Template literal formatting** — currency formatting uses `fmt()` and `fmtFull()` from `src/model/formatters.js`, not `Intl.NumberFormat` directly

### Framework-Specific Rules (React)

- **Single state owner** — `FinancialModel.jsx` is the ONLY component with `useReducer`; all others receive props
- **Props drilling is intentional** — do NOT introduce Context, Redux, Zustand, or any state library
- **`useMemo` for all computed data** — projections, wealth, goals must be memoized with correct dependency arrays
- **`useState` for local UI only** — chart tooltips, panel form visibility; never for financial data
- **No custom hooks** — keep logic in model layer functions, not in React hook abstractions
- **4-step new feature wiring**: (1) add to `INITIAL_STATE`, (2) add to `MODEL_KEYS` if persistable, (3) destructure from `state` in root, (4) update `RESTORE_STATE` backward-compat in `reducer.js`
- **`gatherState()` boundary** — MODEL_KEYS (50 keys) separates financial model from UI state; projection functions only receive this subset
- **Monte Carlo runs on-demand** — triggered by button click via `setTimeout` to avoid blocking UI, not reactive/memoized

### Testing Rules

- **No test framework installed** — do not assume Jest/Vitest/Mocha are available
- **Model layer is independently testable** — `src/model/*.js` has zero React dependencies; test with `node --input-type=module -e "import {...} from './src/model/file.js'; ..."`
- **`npm run build` is the smoke test** — Vite will fail on import errors, missing exports, syntax issues
- **Deterministic simulations** — `runMonthlySimulation(s)` produces identical output for identical state input; Dad MC uses seeded PRNG
- **Do not add test dependencies** without explicit user approval — keep `package.json` minimal
- **Validate state changes end-to-end** — when adding a new state key, verify: initial value loads, slider/toggle updates it, scenario save/load round-trips it, projection uses it correctly
- **Silent NaN cascade risk** — new numeric state keys MUST have sensible defaults in `INITIAL_STATE` and be included in `gatherState()` if used by the projection; `undefined` coerces to `NaN` and silently corrupts all downstream calculations
- **MC inner loop performance** — every microsecond multiplies by 500 simulations; never add expensive computation inside the Monte Carlo loop
- **`RESTORE_STATE` round-trip testing** — this is the highest-risk backward-compat path; always test: save scenario → add new key → load old scenario → verify backward-compat guard produces correct values
- **`evaluateGoal` / `evaluateGoalPass` lockstep** — both functions must be updated together when modifying goal evaluation logic; divergence means deterministic results disagree with MC success rates
- **Dual vesting output pattern** — MSFT vesting uses lump sums for balance accuracy and smoothed values for chart display; both paths must stay consistent when touching vesting logic
- **`cutsDiscipline` multiplier** — never hardcode cut amounts inside MC loop; always scale lifestyle cuts through this factor (default 1.0)

### Code Quality & Style Rules

- **Inline styles only** — CSS-in-JS objects on elements; do NOT create CSS files, use CSS modules, or add styling libraries
- **Dark theme palette** — bg `#0f172a`, cards `#1e293b`, borders `#334155`, muted text `#94a3b8`; use `COLORS` from `chartUtils.js` for chart-specific colors
- **Color semantics** — green (`#4ade80`) = positive, red (`#ef4444`) = negative, amber (`#f59e0b`) = warning, blue (`#60a5fa`) = primary, purple (`#a78bfa`) = special
- **Financial health thresholds** — green >= 90% (healthy), amber >= 70% (caution), red < 70% (danger); must be consistent across ALL status indicators (GoalPanel MC rates, MonteCarloPanel solvency, KeyMetrics)
- **Financial figures** — always render with `fontFamily: 'JetBrains Mono, monospace'`
- **960px max-width is load-bearing** — all panels and charts assume this container width; never exceed it
- **File naming** — PascalCase for `.jsx` components, camelCase for `.js` modules
- **Folder boundaries are strict** — `model/` must never import React; `charts/` and `panels/` must never contain financial math beyond presentation (formatting, coordinates, conditionals). Test: "Can I run this with `node` and no React?" → if yes, it belongs in `model/`
- **Constants** — UPPER_SNAKE_CASE for true constants (`INITIAL_STATE`, `MODEL_KEYS`, `COLORS`); do not use for derived/computed values
- **No comments or docstrings** unless logic is non-obvious; the codebase convention is self-documenting code
- **Chart conventions** — always use `createScales()` from `chartUtils.js` for coordinate mapping; no custom scale functions. Use `INCOME_SOURCES` for consistent income stream labeling/coloring. No `viewBox` or responsive SVG — charts are fixed-width inside the container
- **`presentMode` gating** — every new interactive control (slider, toggle, button, form) MUST be hidden when `presentMode === true`; this is easy to forget and breaks the clean presentation view
- **Primitives are intentionally minimal** — `Toggle` (23 lines), `Slider` (16 lines) are thin wrappers by design; do NOT add validation, animation, error states, or accessibility features to these

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
