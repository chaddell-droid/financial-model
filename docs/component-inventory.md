# Component Inventory

**Generated:** 2026-03-25 | **Scan Level:** Deep

---

## Charts (14 files)

| Component | File | LOC | Purpose | Memoized |
|-----------|------|-----|---------|----------|
| BridgeChart | `charts/BridgeChart.jsx` | 827 | Cash flow bridge with narrative markers, driver groups, KPI strip | useMemo |
| RetirementIncomeChart | `charts/RetirementIncomeChart.jsx` | 1600+ | ERN SWR, PWA strategies, historical cohort bands, pool trajectory | useMemo |
| ScenarioStrip | `panels/ScenarioStrip.jsx` | 640 | Primary levers decision console with ranked toggles/sliders | memo |
| DadMode | `panels/DadMode.jsx` | 499 | 3-act family support narrative with solvency gauge | — |
| SarahMode | `panels/SarahMode.jsx` | 440 | Business-focused dashboard with practice growth + goals | — |
| MonteCarloPanel | `charts/MonteCarloPanel.jsx` | 405 | Fan chart + sensitivity tornado + parameter sliders | useMemo |
| PwaDistributionChart | `charts/PwaDistributionChart.jsx` | 363 | Historical cohort spending histogram with percentile markers | useMemo |
| SavingsDrawdownChart | `charts/SavingsDrawdownChart.jsx` | 345 | Savings trajectory with gradient fills + comparison overlay | memo |
| IncomeControls | `panels/IncomeControls.jsx` | 332 | Income assumption sliders (practice, SS, job, trust, van) | memo |
| GoalPanel | `panels/GoalPanel.jsx` | 313 | Goal cards with progress bars, MC success rates, add/delete | memo |
| NetWorthChart | `charts/NetWorthChart.jsx` | 296 | 4-series wealth tracking (savings, 401k, home, total) | memo |
| TrackTab | `panels/tabs/TrackTab.jsx` | 291 | Monthly check-in with drift analysis and reforecasting | memo |
| MonthlyCashFlowChart | `charts/MonthlyCashFlowChart.jsx` | 259 | Quarterly bars with MSFT vesting line + SSDI marker | memo |
| SequenceOfReturnsChart | `charts/SequenceOfReturnsChart.jsx` | 254 | 3-scenario return ordering risk with vulnerability window | — |
| IncomeCompositionChart | `charts/IncomeCompositionChart.jsx` | 253 | Stacked income bars vs. expense line with event markers | — |
| TimelineChart | `charts/TimelineChart.jsx` | 230 | Diamond-marker event timeline with staggered cards | — |
| ExpenseControls | `panels/ExpenseControls.jsx` | 216 | Expense sliders (debt, cuts × 11, BCS, milestones, projects) | memo |
| SarahPracticeChart | `charts/SarahPracticeChart.jsx` | 186 | Practice income growth trajectory with target ceiling | — |
| Slider | `components/Slider.jsx` | 168 | Range input with continuous/settled commit strategies | memo |
| SaveLoadPanel | `components/SaveLoadPanel.jsx` | 148 | Scenario save/load/compare/delete workspace | — |
| KeyMetrics | `components/KeyMetrics.jsx` | 143 | Featured status strip (gap, breakeven, runway, advance) | — |
| Header | `components/Header.jsx` | 124 | Top nav with mode labels, present toggle, export | — |
| SummaryAsk | `panels/SummaryAsk.jsx` | 115 | Decision summary + inheritance advance breakdown | — |
| RiskTab | `panels/tabs/RiskTab.jsx` | 95 | Risk workflow: MC → sequence → balance damage | — |
| Toggle | `components/Toggle.jsx` | 92 | Accessible switch with ARIA role=switch | memo |
| ActionButton | `components/ui/ActionButton.jsx` | 88 | 5 variants: primary, secondary, ghost, destructive, chip | — |
| HelpTip | `components/help/HelpTip.jsx` | 81 | Inline "?" button with positioned popover | — |
| TabBar | `components/TabBar.jsx` | 78 | 6-tab sticky navigation with accent underlines | — |
| MsftVestingChart | `charts/MsftVestingChart.jsx` | 78 | Vesting payout bars with price growth slider | — |
| PlanTab | `panels/tabs/PlanTab.jsx` | 76 | Plan workspace orchestrator (5 sections) | memo |
| HelpDrawer | `components/help/HelpDrawer.jsx` | 62 | Collapsible help section with toggle | — |
| AppShell | `components/layout/AppShell.jsx` | 57 | Layout: summary + tabs + workspace + rail | memo |
| ActiveTogglePills | `components/ActiveTogglePills.jsx` | 54 | Inline badges for active plan toggles | — |
| DataTable | `panels/DataTable.jsx` | 54 | Quarterly projection table with colored cells | — |
| SurfaceCard | `components/ui/SurfaceCard.jsx` | 53 | Toned container: default/featured/compare/success | — |
| HelpPopover | `components/help/HelpPopover.jsx` | 45 | Styled help card: title, short, body, footer | — |
| ComparisonBanner | `components/ComparisonBanner.jsx` | 40 | Scenario comparison alert with clear button | — |
| IncomeTab | `panels/tabs/IncomeTab.jsx` | 28 | MSFT + practice + income composition charts | — |
| DetailsTab | `panels/tabs/DetailsTab.jsx` | 12 | Data table + summary ask | — |
| OverviewTab | `panels/tabs/OverviewTab.jsx` | 8 | BridgeChart wrapper (overview variant) | memo |

---

## Model Modules (17 files)

| Module | File | LOC | Key Exports |
|--------|------|-----|-------------|
| shillerReturns | `model/shillerReturns.js` | 1900+ | `MONTHLY_REAL_RETURNS` (1871–2025 monthly real returns) |
| overviewStory | `model/overviewStory.js` | 549 | `buildBridgeStoryModel`, `selectBridgeMarkers`, `groupBridgeDrivers` |
| pwaStrategies | `model/pwaStrategies.js` | 338 | `selectPwaWithdrawal`, `simulateAdaptivePwaStrategy` |
| retirementIncome | `model/retirementIncome.js` | 270 | `buildRetirementContext`, `buildSupplementalFlows`, `getRetirementSSInfo` |
| scenarioLevers | `model/scenarioLevers.js` | 253 | `buildPrimaryLeversModel`, `getEffectiveCuts`, `rankRecurringLevers` |
| projection | `model/projection.js` | 242 | `runMonthlySimulation`, `computeProjection`, `computeWealthProjection` |
| monteCarlo | `model/monteCarlo.js` | 160 | `runMonteCarlo`, `runDadMonteCarlo` |
| checkIn | `model/checkIn.js` | 154 | `computeMonthlyDrift`, `buildReforecast`, `buildStatusSummary` |
| pwaDistribution | `model/pwaDistribution.js` | 151 | `buildPwaDistribution`, `getPwaSummary`, `getDistributionPercentile` |
| goalEvaluation | `model/goalEvaluation.js` | 147 | `evaluateGoal`, `evaluateGoalPass`, `evaluateAllGoals` |
| exportData | `model/exportData.js` | 145 | `exportModelData` |
| ernWithdrawal | `model/ernWithdrawal.js` | 113 | `computeSWR`, `computePreInhSWR`, `simulatePath` |
| initialState | `state/initialState.js` | 179 | `INITIAL_STATE`, `MODEL_KEYS` |
| reducer | `state/reducer.js` | 62 | `reducer` (6 action types) |
| vesting | `model/vesting.js` | 38 | `getMsftPrice`, `getVestEvents`, `getVestingMonthly/LumpSum` |
| chartContract | `charts/chartContract.js` | 35 | `formatModelTimeLabel`, `buildLegendItems` |
| historicalReturns | `model/historicalReturns.js` | 32 | `getBlendedReturns`, `getNumCohorts`, `getCohortLabel` |
| formatters | `model/formatters.js` | 26 | `fmt`, `fmtFull` |
| constants | `model/constants.js` | 24 | `MONTHS`, `MONTH_VALUES`, `VEST_SHARES`, `MSFT_FLOOR_PRICE`, `SGA_LIMIT` |

---

## Design System Components

| Component | Props | Tones/Variants |
|-----------|-------|---------------|
| SurfaceCard | tone, padding, style | default, featured, compare, success |
| ActionButton | variant, size, active, accent, disabled | primary, secondary, ghost, destructive, chip |
| Slider | value, onChange, min, max, step, format, color, commitStrategy | continuous, settled |
| Toggle | checked, onChange, label, description, color, disabled | — |

## Utility Hooks

| Hook | File | Purpose |
|------|------|---------|
| `useLaggedValue` | `ui/useLaggedValue.js` | Delay value propagation by N ms |
| `useIsVisible` | `ui/useIsVisible.js` | IntersectionObserver one-way visibility flag |
| `useRenderMetric` | `testing/perfMetrics.js` | Report component render to test harness |
