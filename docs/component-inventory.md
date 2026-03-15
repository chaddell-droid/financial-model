# Component Inventory

**Generated:** 2026-03-15 | **Scan Level:** Deep

---

## Summary

| Category | Count | Description |
|----------|-------|-------------|
| Root | 1 | Application orchestrator |
| Model (pure JS) | 7 | Financial computation, no React |
| State | 2 | Reducer + initial state |
| Charts | 11 | Custom SVG visualizations |
| Shared Components | 6 | Reusable UI primitives |
| Panels | 7 | Feature panels and control groups |
| **Total** | **35** | |

---

## Model Layer (src/model/) — Pure JavaScript

| File | Exports | Purpose |
|------|---------|---------|
| `constants.js` | MONTHS, MONTH_VALUES, MSFT_FLOOR_PRICE, VEST_SHARES, SGA_LIMIT, DAYS_PER_MONTH | Time periods, vesting schedule, constants |
| `formatters.js` | fmt(n), fmtFull(n) | Currency formatting ($1.2K / $1,234) |
| `vesting.js` | getMsftPrice, getVestingMonthly, getVestingLumpSum, getVestEvents, getTotalRemainingVesting | MSFT RSU vesting calculations |
| `projection.js` | runMonthlySimulation(s), computeProjection(s), computeWealthProjection(s) | Core 72-month financial simulation |
| `monteCarlo.js` | runMonteCarlo(base, mcParams, goals), runDadMonteCarlo(base) | Probabilistic scenario analysis |
| `goalEvaluation.js` | evaluateGoal, evaluateGoalPass, evaluateAllGoals | Goal achievement evaluation (5 types) |
| `exportData.js` | exportModelData(state, projection, vestEvents, totalRemainingVesting, extras) | JSON export with full model snapshot |

---

## State Layer (src/state/)

| File | Exports | Purpose |
|------|---------|---------|
| `initialState.js` | INITIAL_STATE, MODEL_KEYS | Default state (80+ keys), persistable key list (50 keys) |
| `reducer.js` | reducer(state, action) | SET_FIELD, RESTORE_STATE (with backward compat), RESET_ALL |

---

## Chart Components (src/charts/) — Custom SVG

| Component | Lines | Key Props | Visualization |
|-----------|-------|-----------|---------------|
| `BridgeChart` | 291 | monthlyDetail, income/expense params, toggles | Stepped line chart + waterfall lever breakdown |
| `SavingsDrawdownChart` | 332 | savingsData, compareProjection, debt/milestone params | Line chart with comparison overlay + milestone markers |
| `MonteCarloPanel` | 389 | mcResults, mcRunning, volatility params, gatherState | Fan chart (P10-P90 bands) + sensitivity tornado |
| `NetWorthChart` | 231 | savingsData, wealthData, 401k/home params | Multi-line (savings, 401k, home, total net worth) |
| `SequenceOfReturnsChart` | 242 | seqBadY1/Y2, monthlyDetail, ssdi params | Three-scenario return timing comparison |
| `TimelineChart` | 225 | Event parameters (debt, SSDI, MSFT, milestones) | 5-year horizontal timeline with event markers |
| `SarahPracticeChart` | 187 | sarahRate, sarahMaxRate, sarahRateGrowth, client params | Income growth projection with target line |
| `IncomeCompositionChart` | 180 | data, investmentReturn | Stacked bars (7 income sources) vs expense line |
| `MonthlyCashFlowChart` | 246 | data, highlightIdx, ssdiApprovalMonth | Net cash flow bars + MSFT vesting line overlay |
| `MsftVestingChart` | 78 | vestEvents, totalRemainingVesting, msftGrowth | Quarterly vesting payout bars |
| `chartUtils.js` | — | — | Shared: createScales, generateYTicks, COLORS, INCOME_SOURCES |

---

## Shared UI Components (src/components/)

| Component | Lines | Props | Purpose |
|-----------|-------|-------|---------|
| `Header` | 77 | presentMode, onTogglePresentMode, onEnterDadMode, savedScenarios, onReset, onExportJSON | App header with mode buttons |
| `KeyMetrics` | 80 | netMonthly, breakevenLabel, savingsZeroLabel, advanceNeeded, mcResults, rawMonthlyGap, steadyStateNet | Gap Journey (4 cards) + core metric cards |
| `SaveLoadPanel` | 107 | showSaveLoad, savedScenarios, scenarioName, save/load/compare/delete callbacks | Scenario persistence UI |
| `ComparisonBanner` | 35 | compareState, compareName, onClearCompare | Active comparison indicator banner |
| `Toggle` | 23 | label, checked, onChange, color | iOS-style toggle switch |
| `Slider` | 16 | label, value, onChange, min, max, step, format, color | Range input with label and formatted value |

---

## Feature Panels (src/panels/)

| Component | Lines | Key Props | Purpose |
|-----------|-------|-----------|---------|
| `GoalPanel` | 174 | goals, goalResults, mcGoalResults, mcRunning, presentMode, onGoalsChange | Goal tracker cards with progress bars + MC success rates; inline add/delete form |
| `DadMode` | 431 | Full financial state, dad-specific params (dadDebtPct, dadBcsParents, dadMold/Roof/Projects) | 3-step inheritance advance presentation with expense breakdown and solvency gauge |
| `ScenarioStrip` | 112 | Toggle states, debt/BCS/advance amounts | Major scenario toggles + advance breakdown |
| `IncomeControls` | 158 | All income params + callbacks | Sliders for Sarah, SSDI, consulting, trust, van, LLC |
| `ExpenseControls` | 192 | All expense params, cut items, milestones + callbacks | Spending cuts (11 items with progress bars), debt, milestones, capital |
| `DataTable` | 55 | data, presentMode | Quarterly projection table with color-coded columns |
| `SummaryAsk` | 67 | MSFT, savings, SSDI, debt, capital, cash flow metrics | Narrative summary with specific ask amount |

---

## Design Patterns

| Pattern | Where Used | Description |
|---------|-----------|-------------|
| Props drilling | All components | State passed from FinancialModel root via props, callbacks via `set(field)` |
| Custom SVG charts | src/charts/ | No charting library — hand-built SVG with computed paths and scales |
| Presenter mode | Multiple components | `presentMode` prop hides edit controls for clean presentations |
| State-based tooltips | Charts | `useState` for hover tooltips on data points |
| Backward compatibility | reducer.js | RESTORE_STATE handles legacy aggregate cuts and missing goals |
| Seeded PRNG | monteCarlo.js (Dad MC) | Mulberry32 RNG for deterministic slider response |
| Lump sum + smoothed | projection.js | MSFT vesting: lump sums for balance, smoothed for charts |
