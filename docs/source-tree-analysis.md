# Source Tree Analysis

**Generated:** 2026-03-25 | **Scan Level:** Deep | **Files:** 70 source files

```
financial-model/
├── index.html                          # App entry HTML (Vite module script)
├── package.json                        # React 18, Vite 6, Playwright
├── vite.config.js                      # React plugin, minimal config
│
├── src/                                # Application source (70 files)
│   ├── main.jsx                        # ENTRY: localStorage polyfill, test harness, React mount
│   ├── index.css                       # Global dark theme (CSS custom properties)
│   ├── FinancialModel.jsx              # ROOT: useReducer, projections, tab routing (~1050 LOC)
│   │
│   ├── state/                          # Centralized state management
│   │   ├── initialState.js             # INITIAL_STATE (~156 keys), MODEL_KEYS (80 keys)
│   │   └── reducer.js                  # 6 actions: SET_FIELD, SET_FIELDS, RESTORE/RESET, CHECK_IN
│   │
│   ├── model/                          # Pure business logic (no React dependency)
│   │   ├── constants.js                # Quarterly labels, MSFT vesting schedule, SGA limit
│   │   ├── vesting.js                  # MSFT stock vesting calculations
│   │   ├── formatters.js               # Currency formatting (fmt, fmtFull)
│   │   ├── projection.js               # CORE: 72-month simulation (runMonthlySimulation)
│   │   ├── monteCarlo.js               # Monte Carlo (500 sims) + goal evaluation
│   │   ├── goalEvaluation.js           # 5 goal types: savings floor/target, income, net worth, debt
│   │   ├── scenarioLevers.js           # Primary levers ranking and impact analysis
│   │   ├── overviewStory.js            # Narrative timeline events and waterfall drivers (549 LOC)
│   │   ├── exportData.js               # JSON export compilation
│   │   ├── checkIn.js                  # Monthly actuals tracking, drift analysis, reforecasting
│   │   ├── retirementIncome.js         # SS/survivor phases, supplemental flows, spending scaling
│   │   ├── ernWithdrawal.js            # ERN closed-form SWR + simulation paths
│   │   ├── historicalReturns.js        # Blended stock/bond returns interface
│   │   ├── pwaDistribution.js          # Historical cohort spending distribution
│   │   ├── pwaStrategies.js            # Adaptive withdrawal strategies (fixed, sticky, nudge)
│   │   ├── shillerReturns.js           # Raw Shiller data 1871-2025 (1900+ LOC)
│   │   └── __snapshots__.test.js       # Contract tests (Node assert, no framework)
│   │
│   ├── charts/                         # Custom SVG chart components
│   │   ├── chartUtils.js               # Shared scales, ticks, color palettes
│   │   ├── chartContract.js            # Formatting contracts (time labels, legends)
│   │   ├── BridgeChart.jsx             # Cash flow bridge with narrative markers (827 LOC)
│   │   ├── SavingsDrawdownChart.jsx    # Savings balance trajectory with comparison
│   │   ├── MonthlyCashFlowChart.jsx    # Quarterly bar chart with MSFT/SSDI overlays
│   │   ├── MonteCarloPanel.jsx         # Fan chart + sensitivity tornado (405 LOC)
│   │   ├── MsftVestingChart.jsx        # Vesting payout bars
│   │   ├── IncomeCompositionChart.jsx  # Stacked income vs. expense bars
│   │   ├── TimelineChart.jsx           # Diamond-marker event timeline
│   │   ├── SarahPracticeChart.jsx      # Practice growth trajectory
│   │   ├── NetWorthChart.jsx           # Multi-line wealth tracking
│   │   ├── SequenceOfReturnsChart.jsx  # Return ordering risk comparison
│   │   ├── RetirementIncomeChart.jsx   # ERN SWR + PWA strategies (1600+ LOC)
│   │   └── PwaDistributionChart.jsx    # Historical cohort histogram
│   │
│   ├── components/                     # Shared UI components
│   │   ├── Slider.jsx                  # Range input: continuous/settled commit (168 LOC)
│   │   ├── Toggle.jsx                  # Accessible switch control
│   │   ├── Header.jsx                  # Top nav: mode/export/reset buttons
│   │   ├── KeyMetrics.jsx              # Featured status metrics strip
│   │   ├── ActiveTogglePills.jsx       # Inline plan state badges
│   │   ├── ComparisonBanner.jsx        # Scenario comparison alert banner
│   │   ├── SaveLoadPanel.jsx           # Scenario save/load/compare workspace
│   │   ├── TabBar.jsx                  # 6-tab sticky navigation
│   │   ├── ui/
│   │   │   ├── SurfaceCard.jsx         # Toned container (default/featured/compare/success)
│   │   │   └── ActionButton.jsx        # Variant button (primary/secondary/ghost/destructive/chip)
│   │   ├── help/
│   │   │   ├── HelpDrawer.jsx          # Collapsible help section
│   │   │   ├── HelpTip.jsx             # Inline "?" tooltip trigger
│   │   │   └── HelpPopover.jsx         # Styled help card renderer
│   │   └── layout/
│   │       └── AppShell.jsx            # Main layout: summary + tabs + workspace + rail
│   │
│   ├── panels/                         # Feature panels and tab containers
│   │   ├── ScenarioStrip.jsx           # Primary levers decision console (640 LOC)
│   │   ├── DadMode.jsx                 # Family support perspective (499 LOC)
│   │   ├── SarahMode.jsx              # Business growth perspective (440 LOC)
│   │   ├── IncomeControls.jsx          # Income assumption sliders
│   │   ├── ExpenseControls.jsx         # Expense assumption sliders
│   │   ├── GoalPanel.jsx               # Goal cards with MC success rates (313 LOC)
│   │   ├── SummaryAsk.jsx              # Decision summary + advance breakdown
│   │   ├── DataTable.jsx               # Quarterly projection table
│   │   └── tabs/
│   │       ├── OverviewTab.jsx         # BridgeChart (overview variant)
│   │       ├── PlanTab.jsx             # Planning workspace orchestrator
│   │       ├── TrackTab.jsx            # Monthly check-in tracking (291 LOC)
│   │       ├── IncomeTab.jsx           # MSFT + practice + income composition
│   │       ├── RiskTab.jsx             # MC + sequence + savings risk workflow
│   │       └── DetailsTab.jsx          # Data table + summary ask
│   │
│   ├── ui/                             # Design system and utility hooks
│   │   ├── tokens.js                   # Breakpoints, typography, spacing, radii, colors
│   │   ├── useLaggedValue.js           # Delayed value propagation hook
│   │   └── useIsVisible.js             # Intersection Observer lazy-render hook
│   │
│   ├── content/                        # Static content and help text
│   │   ├── uiGlossary.js              # Centralized UI label constants
│   │   └── help/
│   │       ├── registry.js             # Retirement help text (~15 entries)
│   │       └── checkInHelp.js          # Check-in help text (4 entries)
│   │
│   └── testing/                        # Test infrastructure
│       ├── perfMetrics.js              # Render/interaction metric hooks
│       └── uiHarness.js               # window.__FIN_MODEL_TEST__ global API
│
├── tests/                              # External test suites
│   └── ui/
│       ├── run-swarm.js                # Parallel UI test runner
│       ├── coverage-manifest.json      # Test coverage mapping
│       └── perf/
│           └── run-perf.js             # Performance benchmark runner
│
├── dist/                               # Build output (Vite)
├── docs/                               # Project documentation
└── design-artifacts/                   # Design reference files
```

## Critical Folders

| Folder | Purpose | File Count |
|--------|---------|------------|
| `src/model/` | Pure business logic: projection engine, Monte Carlo, goals, retirement SWR, levers, export | 17 |
| `src/charts/` | Custom SVG visualizations (no charting library) | 14 |
| `src/components/` | Reusable UI primitives: Slider, Toggle, SurfaceCard, help system, layout | 14 |
| `src/panels/` | Feature panels and 6 tab containers | 14 |
| `src/state/` | Centralized useReducer state with 80 model keys | 2 |
| `src/ui/` | Design tokens and utility hooks | 3 |
| `src/content/` | Static help text and UI labels | 3 |
| `src/testing/` | Performance metrics and test harness API | 2 |
