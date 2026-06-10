# Component Inventory

**Generated:** 2026-03-25 | **Updated:** 2026-06-09 (post-remediation; dead charts and special modes removed, Tax/Actuals/Advisor tabs and rail charts added) | **Scan Level:** Deep

---

## Charts (`src/charts/`, 28 files)

All charts share one palette (`chartUtils.js` COLORS — no raw hex outside it), the shared `ChartXAxis`/`ChartYAxis` axis components, `fmt()` money labels, and `ChartEmptyState` for missing data (guard-tested by `charts/__tests__/chartConsistency.test.js`).

| Component | File | Purpose | Memoized |
|-----------|------|---------|----------|
| RetirementIncomeChart | `charts/RetirementIncomeChart.jsx` | ERN SWR, PWA strategies, historical cohort bands, pool trajectory | memo |
| BridgeChart | `charts/BridgeChart.jsx` | Cash flow bridge with narrative markers, driver groups, KPI strip | memo + useMemo |
| MonteCarloPanel | `charts/MonteCarloPanel.jsx` | Fan chart + sensitivity tornado + parameter sliders | memo + useMemo |
| IncomeCompositionChart | `charts/IncomeCompositionChart.jsx` | Stacked income bars vs. expense line with event markers | memo |
| SavingsDrawdownChart | `charts/SavingsDrawdownChart.jsx` | Savings trajectory with gradient fills + comparison overlay | memo |
| NetWorthChart | `charts/NetWorthChart.jsx` | 4-series wealth tracking (savings, 401k, home, total) | memo |
| SarahPracticeChart | `charts/SarahPracticeChart.jsx` | Practice income growth trajectory with target ceiling | — |
| PwaDistributionChart | `charts/PwaDistributionChart.jsx` | Historical cohort spending histogram with percentile markers | useMemo |
| SequenceOfReturnsChart | `charts/SequenceOfReturnsChart.jsx` | 3-scenario return ordering risk with vulnerability window | — |
| MsftVestingChart | `charts/MsftVestingChart.jsx` | Legacy vest payout bars with live-price refresh + growth slider | — |
| Chad401kChart | `charts/Chad401kChart.jsx` | 401(k) balance decomposition (start/contrib/match/growth), rail chart | — |
| RetirementCompositionChart | `charts/RetirementCompositionChart.jsx` | Stacked retirement income sources vs spending target | memo |
| MiniNetWorthChart | `charts/MiniNetWorthChart.jsx` | Compact Overview net-worth sparkline | memo |
| MiniIncomeExpenseChart | `charts/MiniIncomeExpenseChart.jsx` | Compact Overview income vs expenses (matches IncomeCompositionChart colors) | memo |
| TaxVisualization | `charts/TaxVisualization.jsx` | Tax tab chart host (rates, composition, waterfall, attribution, deductions) | — |
| TaxRatesOverTimeChart / TaxCompositionChart / TaxWaterfallChart / TaxAttributionChart / DeductionImpactChart | `charts/Tax*.jsx`, `charts/DeductionImpactChart.jsx` | Per-year tax engine views | memo |
| SensitivityCurveSparkline | `charts/SensitivityCurveSparkline.jsx` | Lever sensitivity sparkline (Decision Console) | — |
| ChartXAxis / ChartYAxis | `charts/ChartXAxis.jsx`, `charts/ChartYAxis.jsx` | Shared axis components (10px JetBrains Mono, textDim, fmt labels) | — |
| ChartEmptyState | `charts/ChartEmptyState.jsx` | Shared friendly empty state — charts never throw on empty data | — |
| chartUtils / chartContract / ssBenefitLabel / useChartTooltip | `charts/*.js` | COLORS palette, scales/ticks, time labels, legend builder, shared tooltip hook | — |

## Panels & Components (selected)

| Component | File | Purpose | Memoized |
|-----------|------|---------|----------|
| ScenarioStrip / DecisionConsole | `panels/ScenarioStrip.jsx`, `panels/DecisionConsole.jsx` | Primary levers decision console with ranked toggles/sliders | memo |
| IncomeControls | `panels/IncomeControls.jsx` | Income assumption sliders (practice, SS/SSDI, job, trust, van) | memo |
| ExpenseControls | `panels/ExpenseControls.jsx` | Expense sliders (debt, cuts, BCS, milestones, capital projects) | memo |
| GoalPanel | `panels/GoalPanel.jsx` | Goal cards with progress bars, MC success rates, add/delete (Risk tab) | memo |
| TaxSettingsPanel | `panels/TaxSettingsPanel.jsx` | Tax tab inputs (filing, deductions, engine mode) | memo |
| AdvisorPane | `panels/AdvisorPane.jsx` | LLM advisor chat with projection tools | — |
| TrackTab | `panels/tabs/TrackTab.jsx` | Monthly check-in with drift analysis and reforecasting | memo |
| ActualsTab | `panels/tabs/ActualsTab.jsx` | CSV statement import + merchant classification | — |
| RiskTab | `panels/tabs/RiskTab.jsx` | Risk workflow: MC → sequence → balance damage → goals | — |
| PlanTab | `panels/tabs/PlanTab.jsx` | Plan workspace orchestrator (console + chart stack + assumptions grid) | memo |
| IncomeTab | `panels/tabs/IncomeTab.jsx` | MSFT + practice + income composition charts | — |
| TaxTab | `panels/tabs/TaxTab.jsx` | TaxSettingsPanel + TaxVisualization | — |
| DetailsTab | `panels/tabs/DetailsTab.jsx` | Data table + summary ask | — |
| OverviewTab | `panels/tabs/OverviewTab.jsx` | Hero cards + BridgeChart + mini charts + recommendations | memo |
| Slider | `components/Slider.jsx` | Range input with continuous/release commit strategies | memo |
| SaveLoadPanel | `components/SaveLoadPanel.jsx` | Scenario save/load/compare/delete workspace | — |
| KeyMetrics | `components/KeyMetrics.jsx` | Featured status strip (gap, breakeven, runway, advance) | — |
| Header | `components/Header.jsx` | Top nav with present toggle, export | — |
| SummaryAsk | `panels/SummaryAsk.jsx` | Decision summary + inheritance advance breakdown | — |
| Toggle | `components/Toggle.jsx` | Accessible switch with ARIA role=switch | memo |
| ActionButton | `components/ui/ActionButton.jsx` | 5 variants: primary, secondary, ghost, destructive, chip | — |
| HelpTip / HelpDrawer / HelpPopover | `components/help/*` | Help system trigger + renderer | — |
| TabBar | `components/TabBar.jsx` | 9-tab sticky navigation with accent underlines | — |
| AppShell | `components/layout/AppShell.jsx` | Layout: summary + tabs + workspace + rail | memo |
| ActiveTogglePills | `components/ActiveTogglePills.jsx` | Inline badges for active plan toggles | — |
| DataTable | `panels/DataTable.jsx` | Quarterly projection table with colored cells | — |
| SurfaceCard | `components/ui/SurfaceCard.jsx` | Toned container: default/featured/compare/success | — |
| ComparisonBanner | `components/ComparisonBanner.jsx` | Scenario comparison alert with clear button | — |

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
