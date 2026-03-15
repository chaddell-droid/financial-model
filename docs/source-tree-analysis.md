# Source Tree Analysis

**Generated:** 2026-03-15 | **Scan Level:** Deep

## Directory Structure

```
financial-model/
├── index.html                  # App shell — mounts React root
├── package.json                # Dependencies: react 18, vite 6
├── vite.config.js              # Vite config — React plugin only
├── dist/                       # Production build output
│   ├── index.html
│   └── assets/
│       └── index-*.js          # Single bundled JS (~307KB, ~88KB gzip)
├── public/                     # Static assets (served as-is)
├── src/                        # Application source (35 files)
│   ├── main.jsx                # ★ ENTRY POINT — React root + localStorage polyfill
│   ├── FinancialModel.jsx      # ★ ROOT COMPONENT — state, projections, all wiring
│   │
│   ├── model/                  # Pure computation layer (no React)
│   │   ├── constants.js        #   Time periods, MSFT vesting schedule, SGA limit
│   │   ├── formatters.js       #   Currency formatting (fmt, fmtFull)
│   │   ├── vesting.js          #   MSFT RSU vesting calculations
│   │   ├── projection.js       #   ★ Core 72-month financial simulation engine
│   │   ├── monteCarlo.js       #   Monte Carlo (500-sim + 200-sim Dad mode)
│   │   ├── goalEvaluation.js   #   Goal evaluation engine (5 goal types)
│   │   └── exportData.js       #   JSON export with full model snapshot
│   │
│   ├── state/                  # State management
│   │   ├── initialState.js     #   ★ INITIAL_STATE (40+ params) + MODEL_KEYS
│   │   └── reducer.js          #   SET_FIELD, RESTORE_STATE, RESET_ALL
│   │
│   ├── charts/                 # SVG visualization components
│   │   ├── chartUtils.js       #   Shared scales, ticks, COLORS, INCOME_SOURCES
│   │   ├── BridgeChart.jsx     #   Cash flow path + waterfall lever breakdown
│   │   ├── SavingsDrawdownChart.jsx  # Savings balance over time
│   │   ├── MonteCarloPanel.jsx #   Fan chart + sensitivity tornado + controls
│   │   ├── NetWorthChart.jsx   #   Savings + 401k + home equity lines
│   │   ├── SequenceOfReturnsChart.jsx  # Return timing scenarios
│   │   ├── TimelineChart.jsx   #   5-year event timeline
│   │   ├── SarahPracticeChart.jsx  # Practice income growth projection
│   │   ├── IncomeCompositionChart.jsx  # Stacked income sources vs expenses
│   │   ├── MonthlyCashFlowChart.jsx    # Net cash flow bars + MSFT line
│   │   └── MsftVestingChart.jsx  # Quarterly vesting payout bars
│   │
│   ├── components/             # Shared UI components
│   │   ├── Header.jsx          #   App header with mode buttons
│   │   ├── KeyMetrics.jsx      #   Gap Journey cards + core metric cards
│   │   ├── SaveLoadPanel.jsx   #   Scenario persistence UI
│   │   ├── ComparisonBanner.jsx  # Active comparison indicator
│   │   ├── Toggle.jsx          #   Reusable toggle switch
│   │   └── Slider.jsx          #   Reusable range slider with label
│   │
│   └── panels/                 # Feature panels and control groups
│       ├── GoalPanel.jsx       #   Goal tracker cards + add/delete form
│       ├── DadMode.jsx         #   ★ 3-step inheritance presentation
│       ├── ScenarioStrip.jsx   #   Toggle switches + advance breakdown
│       ├── IncomeControls.jsx  #   All income parameter sliders
│       ├── ExpenseControls.jsx #   Spending cuts, debt, milestones, capital
│       ├── DataTable.jsx       #   Quarterly projection table
│       └── SummaryAsk.jsx      #   Narrative summary + ask amount
└── docs/                       # Generated documentation (this folder)
```

## Critical Folders

| Folder | Purpose | File Count |
|--------|---------|-----------|
| `src/model/` | Pure financial computation — projection engine, Monte Carlo, vesting, goals | 7 |
| `src/state/` | Application state — initial values, MODEL_KEYS, reducer | 2 |
| `src/charts/` | All 11 chart visualizations — custom SVG, no charting library | 11 |
| `src/components/` | Shared reusable UI (Toggle, Slider, Header, etc.) | 6 |
| `src/panels/` | Feature panels — controls, Dad Mode, goals, data table | 7 |

## Entry Points

- **Application:** `src/main.jsx` → mounts `<FinancialModel />` into `#root`
- **Root Component:** `src/FinancialModel.jsx` — owns all state, computes projections, renders layout
- **Build:** `vite build` → `dist/` (single HTML + JS bundle)

## File Organization Patterns

- **Model layer** (`src/model/`) is pure JavaScript — no React imports, fully testable
- **State layer** (`src/state/`) centralizes all 40+ parameters and their defaults
- **Chart layer** (`src/charts/`) uses custom SVG — no external charting library (d3, recharts, etc.)
- **Component layer** (`src/components/`) contains small, reusable UI primitives
- **Panel layer** (`src/panels/`) contains larger feature compositions
- **Root** (`FinancialModel.jsx`) acts as the orchestrator connecting everything
