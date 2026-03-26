# Family Financial Planning Model — Project Overview

**Generated:** 2026-03-25 | **Scan Level:** Deep | **Project Type:** Web (React SPA)

## Executive Summary

A comprehensive family financial planning tool that simulates 6 years (72 months) of income, expenses, savings, and wealth trajectories starting March 2026. Built for the Dellinger family, it models Sarah's therapy practice growth, MSFT stock vesting, Social Security/SSDI, trust income, lifestyle spending decisions, and retirement withdrawal strategies using ERN methodology with 154 years of historical return data.

The app serves multiple audiences through different perspective modes (planner, presenter, Sarah's business view, Dad's support view) and provides probabilistic analysis via Monte Carlo simulation, goal-based planning with success rates, monthly check-in tracking, and adaptive withdrawal strategies.

## Technology Stack

| Category | Technology | Version | Notes |
|----------|-----------|---------|-------|
| Framework | React | 18.3.1 | Functional components, hooks only |
| Build | Vite | 6.0.0 | Fast HMR, production bundling |
| Language | JavaScript/JSX | ES2022+ | No TypeScript |
| State | useReducer | — | Centralized, 156 keys, 80 model keys |
| Styling | Inline CSS | — | Design tokens via `tokens.js` |
| Charts | Custom SVG | — | 12 hand-built chart components |
| Testing | Playwright + Node assert | — | UI swarm runner, performance benchmarks |
| Deployment | Static files | — | `dist/` via `vite build` |

## Architecture Overview

- **Type:** Monolith (single React SPA)
- **Pattern:** Component-based with centralized state + pure model layer
- **Entry Point:** `src/main.jsx` → `<FinancialModel />`
- **State Management:** `useReducer` with `useDeferredValue` for performance isolation
- **No external dependencies** beyond React and Vite (no charting library, no state library, no CSS framework)

## Key Features (as of March 25, 2026)

1. **Core Projection Engine** — 72-month simulation with income sources (Sarah's practice, MSFT vesting, SS/SSDI, trust, consulting, Chad's job), expenses, investment returns, and deficit chain (savings → 401k → HELOC)

2. **Monte Carlo Analysis** — 500-simulation probabilistic modeling with randomized growth rates, SSDI denial risk, and spending discipline variance; produces percentile bands and solvency rates

3. **Goal-Based Planning** — User-definable goals (savings floor/target, income target, net worth target, debt-free) with deterministic progress tracking and MC success probabilities

4. **Primary Levers Console** — Ranked financial decisions (debt retirement, lifestyle cuts, van sale, BCS tuition) with impact modeling and consequence visualization

5. **Monthly Check-In Tracking** — Track tab for recording actuals, computing plan-vs-reality drift, and reforecasting from real balances

6. **Retirement Withdrawal Analysis** — ERN closed-form SWR calculations using Shiller data (1871–2025), adaptive PWA strategies (fixed percentile, sticky median, quartile nudge), and historical cohort survival analysis

7. **Scenario Management** — Save/load/compare scenarios with localStorage persistence, comparison overlay on charts

8. **Multi-Perspective Modes** — Planner (full controls), Presenter (read-only), Sarah Mode (business-focused), Dad Mode (family support narrative)

9. **Narrative Visualization** — Bridge chart with story-driven markers, waterfall drivers, and KPI strips explaining the financial trajectory

## Repository Structure

```
src/
├── state/      (2 files)   Centralized useReducer state
├── model/      (17 files)  Pure business logic, no React
├── charts/     (14 files)  Custom SVG visualizations
├── components/ (14 files)  Shared UI primitives
├── panels/     (14 files)  Feature panels + tab containers
├── ui/         (3 files)   Design tokens + utility hooks
├── content/    (3 files)   Help text + UI labels
└── testing/    (2 files)   Performance metrics + test harness
```

See [Source Tree Analysis](./source-tree-analysis.md) for the full annotated directory tree.
