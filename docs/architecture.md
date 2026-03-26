# Architecture Document

**Generated:** 2026-03-25 | **Scan Level:** Deep | **Type:** Web (React SPA)

---

## 1. Architecture Pattern

**Component-based SPA with centralized state and pure model layer.**

```
User Input (sliders, toggles)
       │
       ▼
  ┌─────────────┐
  │  useReducer  │  ← SET_FIELD, RESTORE_STATE, RESET_ALL, etc.
  │  (~156 keys) │
  └──────┬───────┘
         │
    useDeferredValue (isolates UI from heavy computation)
         │
         ▼
  ┌──────────────────┐
  │  Model Layer     │  Pure functions, no React dependency
  │  (projection,    │
  │   monteCarlo,    │  → computeProjection(state) → 73-month data
  │   goals, etc.)   │  → runMonteCarlo(base, params, goals) → bands
  └──────┬───────────┘
         │
    useMemo (stable prop objects)
         │
         ▼
  ┌──────────────────┐
  │  Tab Routing     │  AppShell → TabBar → active tab
  │  + Panel Props   │  (PlanTab, RiskTab, IncomeTab, etc.)
  └──────┬───────────┘
         │
         ▼
  ┌──────────────────┐
  │  Chart + Panel   │  SVG charts, slider panels, goal cards
  │  Components      │  All memoized (React.memo / useMemo)
  └──────────────────┘
```

## 2. State Management

### 2.1 State Shape

`useReducer(reducer, INITIAL_STATE)` in `FinancialModel.jsx`.

**~156 state keys** organized into:
- Income assumptions (Sarah practice, MSFT, SS/SSDI, trust, Chad job, consulting)
- Expense assumptions (base, debt service, BCS tuition, spending cuts × 11 categories)
- Asset assumptions (savings, investment return, 401k, home equity)
- Scenario toggles (retireDebt, lifestyleCutsApplied, vanSold)
- Capital projects (mold, roof, other — cost + include flags)
- Monte Carlo parameters (numSims, volatilities, SSDI denial rate)
- Goals (array of 3+ goals with type/target/month/color)
- UI state (activeTab, presentMode, modes, savedScenarios, checkInHistory)
- Sequence-of-returns shocks (seqBadY1, seqBadY2)

### 2.2 MODEL_KEYS (80 keys)

Subset of state used for scenario save/load and projection input. Excludes UI-only keys (activeTab, savedScenarios, checkInHistory, storageStatus).

### 2.3 Action Types

| Action | Purpose | Preserved on RESET_ALL |
|--------|---------|----------------------|
| `SET_FIELD` | Update single key | — |
| `SET_FIELDS` | Batch update | — |
| `RESTORE_STATE` | Load saved scenario (backward-compat) | — |
| `RESET_ALL` | Reset to INITIAL_STATE | savedScenarios, checkInHistory, storageStatus |
| `RECORD_CHECK_IN` | Add/update monthly check-in | — |
| `DELETE_CHECK_IN` | Remove check-in by month | — |

### 2.4 Performance Strategy

- **useDeferredValue(state)** — Slider drags update state immediately; projection computation runs in deferred frame
- **Setter cache** — Ref-based function memoization prevents new callback references per render
- **Prop bundling** — useMemo'd prop objects for each tab/chart/panel with tight dependency arrays
- **Lazy rendering** — RetirementIncomeChart wrapped in IntersectionObserver; only mounts when scrolled into view
- **Seeded PRNG** — Dad Mode uses seed=42 for deterministic Monte Carlo during slider drags

## 3. Model Layer

Pure JavaScript functions with no React dependency. All imported by FinancialModel.jsx or chart components.

### 3.1 Core Simulation

| Module | Purpose | Key Exports |
|--------|---------|-------------|
| `projection.js` | 72-month simulation engine | `runMonthlySimulation`, `computeProjection` |
| `monteCarlo.js` | 500-sim probabilistic analysis | `runMonteCarlo`, `runDadMonteCarlo` |
| `goalEvaluation.js` | 5-type goal achievement | `evaluateGoal`, `evaluateGoalPass`, `evaluateAllGoals` |

### 3.2 Financial Logic

| Module | Purpose | Key Exports |
|--------|---------|-------------|
| `vesting.js` | MSFT stock vesting | `getVestEvents`, `getVestingMonthly`, `getVestingLumpSum` |
| `scenarioLevers.js` | Lever ranking and impact | `buildPrimaryLeversModel`, `getEffectiveCuts` |
| `checkIn.js` | Monthly actuals tracking | `computeMonthlyDrift`, `buildReforecast`, `buildStatusSummary` |
| `exportData.js` | JSON export | `exportModelData` |

### 3.3 Retirement Analysis

| Module | Purpose | Key Exports |
|--------|---------|-------------|
| `retirementIncome.js` | SS/survivor modeling | `buildRetirementContext`, `buildSupplementalFlows` |
| `ernWithdrawal.js` | ERN closed-form SWR | `computeSWR`, `computePreInhSWR`, `simulatePath` |
| `historicalReturns.js` | Blended returns | `getBlendedReturns`, `getNumCohorts` |
| `pwaDistribution.js` | Cohort spending distribution | `buildPwaDistribution`, `getPwaSummary` |
| `pwaStrategies.js` | Adaptive withdrawal | `selectPwaWithdrawal`, `simulateAdaptivePwaStrategy` |
| `shillerReturns.js` | 1871–2025 raw data | `MONTHLY_REAL_RETURNS` |

### 3.4 Narrative

| Module | Purpose | Key Exports |
|--------|---------|-------------|
| `overviewStory.js` | Timeline events and drivers | `buildBridgeStoryModel`, `selectBridgeMarkers` |
| `formatters.js` | Currency display | `fmt`, `fmtFull` |
| `constants.js` | Time labels, vesting schedule | `MONTHS`, `VEST_SHARES`, `SGA_LIMIT` |

## 4. UI Layer

### 4.1 Design System (`tokens.js`)

CSS custom properties define the dark theme. JavaScript tokens mirror them for inline styles:

- **Colors:** 16 semantic tokens (page, surface, text × 4, positive, caution, destructive, info, compare, mode accents)
- **Typography:** 7 sizes (12–24px)
- **Spacing:** 6 sizes (6–32px)
- **Radii:** 3 sizes (8, 12, 16px)
- **Breakpoints:** compact (960), railCollapse (1180), desktop (1400)

### 4.2 Layout

`AppShell` provides a consistent layout:
- **Summary bar** (KeyMetrics + ActiveTogglePills + ComparisonBanner)
- **Tab bar** (6 tabs: Overview, Plan, Track, Income, Risk, Details)
- **Workspace** (active tab content)
- **Right rail** (SavingsDrawdownChart, NetWorthChart, RetirementIncomeChart — side or stacked based on width)

### 4.3 Help System

Three-tier architecture:
1. **Content:** `registry.js` + `checkInHelp.js` — structured help objects (title, short, body, footer)
2. **Trigger:** `HelpTip` (inline ?) and `HelpDrawer` (collapsible section)
3. **Renderer:** `HelpPopover` — styled card with outside-click/Escape dismissal

## 5. Tab Architecture

| Tab | Component | Contents |
|-----|-----------|----------|
| Overview | `OverviewTab` | BridgeChart (overview variant) |
| Plan | `PlanTab` | ScenarioStrip, IncomeControls, ExpenseControls, MonthlyCashFlowChart, BridgeChart (plan), GoalPanel |
| Track | `TrackTab` | Monthly check-in form, drift table, reforecast, status card |
| Income | `IncomeTab` | MsftVestingChart, SarahPracticeChart, IncomeCompositionChart |
| Risk | `RiskTab` | MonteCarloPanel, SequenceOfReturnsChart, (optional) balance charts |
| Details | `DetailsTab` | DataTable, SummaryAsk |

**Special modes** (replace tab layout):
- **Sarah Mode** — Business-focused dashboard with practice metrics, spending capacity, goal progress
- **Dad Mode** — 3-act narrative: expense breakdown → self-help levers → support ask

## 6. Data Flow

### 6.1 Projection Pipeline

```
state → gatherState(deferredState) → computeProjection(s)
  → runMonthlySimulation(s)        73-month loop
    → monthlyData[]                 per-month: income, expenses, balance, 401k, home
  → data[]                          quarterly aggregation
  → savingsData[]                   monthly balance series
```

### 6.2 Monte Carlo Pipeline

```
base + mcParams + goals → runMonteCarlo(...)
  → 500 iterations:
    randomize(investReturn, sarahGrowth, msftGrowth, ssdiDelay, ssdiDenied, cutsDiscipline)
    → runMonthlySimulation(randomizedState)
    → evaluateGoalPass(goal, monthlyData) per goal
  → bands (10/25/50/75/90 percentiles)
  → solvencyRate, medianTrough, goalSuccessRates
```

### 6.3 Deficit Chain

When monthly cash flow is negative:
1. Draw from **savings** (investment account)
2. If savings depleted, draw from **401k** (with withdrawal tracking)
3. If 401k depleted, draw from **home equity** (HELOC)

## 7. Testing Strategy

- **Contract tests** (`__snapshots__.test.js`) — Node `assert`, no framework. Verify model exports, state shape, projection contracts.
- **UI swarm** (`tests/ui/run-swarm.js`) — Parallel browser-based test runner.
- **Performance benchmarks** (`tests/ui/perf/run-perf.js`) — Measure render counts, slider responsiveness.
- **Test harness** (`uiHarness.js`) — `window.__FIN_MODEL_TEST__` API for controlling MC seed, storage, metrics from test scripts.

## 8. Storage & Persistence

- **localStorage** via `window.storage` polyfill (prefix `fs_`)
- **Scenarios:** Saved as JSON objects (name + state snapshot + timestamp)
- **Check-ins:** Persisted as array of monthly check-in records
- **Graceful degradation:** Storage unavailable → in-memory only, status message shown
