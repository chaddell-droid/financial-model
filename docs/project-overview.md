# Family Financial Planning Model — Project Overview

**Generated:** 2026-03-15 | **Scan Level:** Deep | **Project Type:** Web (React SPA)

## Executive Summary

A comprehensive family financial planning application built as a single-page React app. The tool models a 6-year (72-month) financial projection for the Dellinger family, incorporating multiple income streams (Sarah's therapy practice, MSFT stock vesting, SSDI, farm LLC, trust income), debt management, lifestyle spending cuts, and capital project planning. Features include Monte Carlo risk analysis, goal-based planning, scenario save/load, presentation mode, and a specialized "Dad Mode" for communicating an inheritance advance request.

## Purpose

Enable interactive what-if scenario planning for a complex family financial situation involving:
- Disability (SSDI application with potential denial)
- Business growth (therapy practice rate/client ramp)
- Stock vesting (MSFT RSUs with hedged floor price)
- Debt consolidation and retirement
- Education costs (BCS tuition with parent contribution splits)
- Capital needs (mold remediation, roof, house projects)
- Inheritance advance request communication

## Tech Stack Summary

| Category | Technology | Version |
|----------|-----------|---------|
| Framework | React | 18.3.1 |
| Build Tool | Vite | 6.x |
| Language | JavaScript (JSX) | ES2020+ |
| Styling | Inline CSS-in-JS | — |
| Charts | Custom SVG | — |
| State | useReducer + Context-free | — |
| Storage | localStorage (polyfilled) | — |
| Package Manager | npm | — |

## Architecture Type

**Client-side monolith** — single React component tree with no backend. All computation runs in the browser. State is managed via `useReducer` in the root component with props drilling to children.

## Repository Structure

- **Type:** Monolith (single cohesive codebase)
- **Parts:** 1 (client-only)
- **Source Files:** 35 `.js`/`.jsx` files
- **Lines of Code:** ~4,500 (source only)
- **Dependencies:** 2 runtime (react, react-dom), 2 dev (@vitejs/plugin-react, vite)

## Key Features

1. **11 Interactive Charts** — Bridge, Savings Drawdown, Monte Carlo Fan, Net Worth, Sequence of Returns, Timeline, Sarah Practice Growth, Income Composition, Monthly Cash Flow, MSFT Vesting, Sensitivity Tornado
2. **Monte Carlo Simulation** — 500-sim probabilistic analysis with percentile bands and solvency rate
3. **Goal-Based Planning** — Define financial goals with progress tracking and MC success probabilities
4. **40+ Parameters** — All assumptions adjustable via sliders and toggles
5. **Scenario Management** — Save/load/compare scenarios via localStorage
6. **Dad Mode** — Guided 3-step presentation for communicating inheritance advance request
7. **Present Mode** — Read-only view hiding all controls for stakeholder presentations
8. **JSON Export** — Full model state export for external analysis

## Links to Detailed Documentation

- [Architecture](./architecture.md)
- [Source Tree Analysis](./source-tree-analysis.md)
- [Component Inventory](./component-inventory.md)
- [Development Guide](./development-guide.md)
