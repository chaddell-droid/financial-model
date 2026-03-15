# Architecture Document

**Generated:** 2026-03-15 | **Scan Level:** Deep | **Type:** Web (React SPA)

---

## 1. Executive Summary

A client-side-only React single-page application for interactive family financial planning. All computation (projections, Monte Carlo simulations, goal evaluation) runs in the browser with no backend. State is managed via `useReducer` with props drilling. Scenarios persist to `localStorage`. Charts are rendered as custom SVG without external charting libraries.

---

## 2. Technology Stack

| Category | Technology | Version | Notes |
|----------|-----------|---------|-------|
| UI Framework | React | 18.3.1 | Functional components + hooks |
| Build Tool | Vite | 6.x | Fast HMR, ESM-native |
| Language | JavaScript (JSX) | ES2020+ | No TypeScript |
| Styling | Inline styles | — | CSS-in-JS objects, no CSS files |
| Charts | Custom SVG | — | Hand-built, no d3/recharts |
| State | useReducer | — | Single reducer, no context/Redux |
| Storage | localStorage | — | Polyfilled via window.storage API |
| Fonts | Inter + JetBrains Mono | CDN | System fallbacks |

---

## 3. Architecture Pattern

### Component Hierarchy

```
FinancialModel (root — state owner)
├── Header
├── SaveLoadPanel
├── DadMode (conditional)
├── KeyMetrics
├── GoalPanel
├── ComparisonBanner
├── ScenarioStrip
├── BridgeChart
├── SavingsDrawdownChart
├── NetWorthChart
├── MonteCarloPanel
├── SequenceOfReturnsChart
├── TimelineChart
├── SarahPracticeChart
├── IncomeCompositionChart
├── MonthlyCashFlowChart
├── MsftVestingChart
├── IncomeControls + ExpenseControls
├── DataTable
└── SummaryAsk
```

### State Flow

```
INITIAL_STATE (40+ params)
    │
    ▼
useReducer(reducer, INITIAL_STATE)
    │
    ├── SET_FIELD ──→ individual param updates (slider/toggle changes)
    ├── RESTORE_STATE ──→ load saved scenario (with backward compat)
    └── RESET_ALL ──→ return to defaults (preserves saved scenarios)
    │
    ▼
gatherState() → MODEL_KEYS subset
    │
    ├──→ computeProjection(state) → { data, savingsData, monthlyData, backPayActual }
    ├──→ computeWealthProjection(state) → { wealthData }
    ├──→ evaluateAllGoals(goals, monthlyData, opts) → goalResults[]
    └──→ runMonteCarlo(state, mcParams, goals) → { bands, solvencyRate, goalSuccessRates, ... }
    │
    ▼
Props drilling to 20+ child components
```

### Data Flow

1. User adjusts slider/toggle → `dispatch({ type: 'SET_FIELD', field, value })`
2. State updates → `useMemo` recomputes projection, wealth, goals
3. New projection data flows down via props to charts and panels
4. Monte Carlo runs on-demand (button click) via `setTimeout` to avoid blocking UI
5. Scenario save/load persists MODEL_KEYS subset to localStorage

---

## 4. Core Computation Layer

### Projection Engine (`src/model/projection.js`)

The heart of the application. `runMonthlySimulation(state)` iterates month-by-month (0-72):

- **Income:** Sarah's business (rate × clients × days, with growth), MSFT vesting (quarterly lumps smoothed to monthly), LLC distribution, SSDI (with approval delay and denial), trust income (step function), consulting (SGA-limited)
- **Expenses:** Base expenses, debt service (optional), van savings (optional), BCS tuition (time-limited), lifestyle cuts (11 individual categories × discipline factor), milestone reductions
- **Balance:** Starting savings + monthly (income - expenses) + investment returns (compound) + SSDI back pay lump sum

`computeProjection()` aggregates monthly data into quarterly snapshots for charts.

### Monte Carlo (`src/model/monteCarlo.js`)

- **Full MC:** 500 simulations with Box-Muller normal randomization of: investment returns, business growth, MSFT growth, SSDI delay, SSDI denial, cuts discipline
- **Dad MC:** 200 simulations with seeded PRNG (mulberry32) for deterministic slider response
- **Goal integration:** Evaluates each goal per simulation, returns success rates

### Goal Evaluation (`src/model/goalEvaluation.js`)

5 goal types: `savings_floor`, `savings_target`, `income_target`, `net_worth_target`, `debt_free`. Each returns `{ achieved, currentValue, progress, description }`. Fast boolean `evaluateGoalPass()` for MC inner loop.

### Vesting (`src/model/vesting.js`)

MSFT RSU vesting schedule: 10 quarterly vests (May 2026 – Aug 2028), 133→33 shares declining. Price modeled with annual growth from $410.68 floor. Net = 80% of gross (tax withholding).

---

## 5. State Architecture

### INITIAL_STATE Structure (src/state/initialState.js)

| Category | Parameters | Count |
|----------|-----------|-------|
| Income — Sarah's Business | sarahRate, sarahMaxRate, sarahRateGrowth, sarahCurrentClients, sarahMaxClients, sarahClientGrowth | 6 |
| LLC & MSFT | llcAnnual, llcMultiplier, llcDelayMonths, msftGrowth | 4 |
| SSDI | ssdiApprovalMonth, ssdiDenied, ssdiPersonal, ssdiFamilyTotal, kidsAgeOutMonths, chadConsulting, ssdiBackPayMonths | 7 |
| Expenses | baseExpenses, debtService | 2 |
| BCS Tuition | bcsAnnualTotal, bcsParentsAnnual, bcsYearsLeft | 3 |
| 11 Spending Cuts | cutOliver, cutVacation, cutShopping, cutMedical, cutGym, cutAmazon, cutSaaS, cutEntertainment, cutGroceries, cutPersonalCare, cutSmallItems, lifestyleCutsApplied | 12 |
| Trust Income | trustIncomeNow, trustIncomeFuture, trustIncreaseMonth | 3 |
| Van | vanSold, vanMonthlySavings | 2 |
| Toggles | retireDebt, llcImproves | 2 |
| Savings | startingSavings, investmentReturn | 2 |
| Capital Projects | moldCost, moldInclude, roofCost, roofInclude, otherProjects, otherInclude | 6 |
| Debt Balances | debtCC, debtPersonal, debtIRS, debtFirstmark | 4 |
| Monte Carlo | mcNumSims, mcInvestVol, mcBizGrowthVol, mcMsftVol, mcSsdiDelay, mcSsdiDenialPct, mcCutsDiscipline | 7 |
| Wealth | starting401k, return401k, homeEquity, homeAppreciation | 4 |
| Sequence of Returns | seqBadY1, seqBadY2 | 2 |
| Goals | goals (array of goal objects) | 1 |
| UI State | savedScenarios, scenarioName, showSaveLoad, presentMode, compareState, compareName, dadMode, dadStep, ... | 14 |
| **Total** | | **~80** |

### MODEL_KEYS (persistable subset)

50 keys representing the financial model (excludes UI state). Used by `gatherState()` for projection input and scenario save/load.

### Reducer Actions

| Action | Description |
|--------|-------------|
| `SET_FIELD` | Update single field by name |
| `RESTORE_STATE` | Load scenario with backward compatibility (legacy aggregate cuts, missing goals) |
| `RESET_ALL` | Reset to INITIAL_STATE, preserving saved scenarios |

---

## 6. UI Component Architecture

### Shared Primitives

| Component | Purpose |
|-----------|---------|
| `Toggle` | iOS-style toggle switch with color prop |
| `Slider` | Range input with label, value display, color theming |

### Chart Components (11 total)

All charts are custom SVG — no external charting library. They use shared utilities from `chartUtils.js`:
- `createScales()` — linear X/Y mapping to SVG coordinates
- `generateYTicks()` / `autoTickStep()` — axis tick generation
- `COLORS` — centralized color palette
- `INCOME_SOURCES` — income stream definitions (key, label, color)

### Design System

- **Color scheme:** Dark theme (`#0f172a` background, `#1e293b` cards, `#334155` borders)
- **Typography:** Inter for UI, JetBrains Mono for financial figures
- **Layout:** Max-width 960px, responsive grid for metrics/controls
- **Patterns:** Consistent card styling, color-coded positive/negative values

---

## 7. Scenario Persistence

### Storage Layer

`main.jsx` polyfills `window.storage` with localStorage:
- `get(key)` → returns `{ key, value }`
- `set(key, value)` → stores with `fs_` prefix
- `delete(key)` / `list(prefix)` — full CRUD

Originally designed for Claude Artifacts' storage API; polyfill enables standalone browser deployment.

### Save/Load Flow

1. **Save:** `gatherState()` extracts MODEL_KEYS → JSON → localStorage (`fin-scenarios`)
2. **Load:** `dispatch({ type: 'RESTORE_STATE', state })` with backward compatibility
3. **Compare:** Second projection computed from saved state, overlaid on charts
4. **Export:** Full model snapshot as downloadable JSON with metrics, trajectory, cuts, goals

---

## 8. Testing Strategy

No automated tests are currently implemented. The application relies on:
- Manual testing via the dev server (`npm run dev`)
- Vite's production build (`npm run build`) as a smoke test
- Node.js module-level unit testing for the model layer (ad-hoc)

The model layer (`src/model/`) is pure JavaScript with no React dependencies, making it straightforward to add unit tests.

---

## 9. Deployment

- **Build:** `npm run build` → `dist/` (single HTML + JS bundle, ~307KB / ~88KB gzip)
- **Hosting:** Static file hosting (GitHub Pages via `dist/` folder)
- **CI/CD:** Manual — `git push origin main` to deploy
- **No environment variables** — all configuration is in source code
