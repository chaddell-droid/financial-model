# Development Guide

**Generated:** 2026-03-15 | **Scan Level:** Deep

---

## Prerequisites

- **Node.js** 18+ (ES module support required)
- **npm** (ships with Node.js)
- **Git** (for version control)

---

## Installation

```bash
git clone https://github.com/chaddell-droid/financial-model.git
cd financial-model
npm install
```

---

## Local Development

```bash
npm run dev
```

Opens at `http://localhost:5173` (Vite auto-increments port if busy). Hot module replacement (HMR) is enabled — changes to source files reflect instantly.

---

## Build

```bash
npm run build
```

Outputs to `dist/`:
- `dist/index.html` — app shell
- `dist/assets/index-*.js` — single bundled JS (~307KB, ~88KB gzip)

Preview production build locally:
```bash
npm run preview
```

---

## Deployment

The app deploys as static files. Current workflow:

1. `npm run build` — generates `dist/`
2. `git add dist/ && git commit` — include build artifacts
3. `git push origin main` — push to GitHub (dist/ is committed)

No CI/CD pipeline. No environment variables. No server required.

---

## Project Structure

```
src/
├── main.jsx              # Entry point — React root mount + storage polyfill
├── FinancialModel.jsx    # Root component — all state + orchestration
├── model/                # Pure computation (testable without React)
├── state/                # State defaults + reducer
├── charts/               # SVG chart components
├── components/           # Shared UI primitives
└── panels/               # Feature panels + control groups
```

---

## Key Development Patterns

### Adding a New Parameter

1. Add default value to `INITIAL_STATE` in `src/state/initialState.js`
2. Add key to `MODEL_KEYS` array (if it should persist with scenario save/load)
3. Destructure from `state` in `FinancialModel.jsx`
4. If needed in projections, add to `gatherState()` and use in `runMonthlySimulation()`
5. Add UI control (Slider/Toggle) in the appropriate panel component

### Adding a New Chart

1. Create `src/charts/MyChart.jsx`
2. Import shared utilities from `chartUtils.js` (createScales, COLORS, etc.)
3. Build SVG — use `createScales()` for coordinate mapping
4. Import and render in `FinancialModel.jsx` within the `!dadMode` block
5. Pass required data/state via props

### Adding a New Goal Type

1. Add evaluation logic to `evaluateGoal()` and `evaluateGoalPass()` in `src/model/goalEvaluation.js`
2. Add option to `GOAL_TYPES` array in `src/panels/GoalPanel.jsx`
3. MC integration is automatic — goal passes through to `runMonteCarlo`

### Modifying the Projection Engine

All financial logic lives in `src/model/projection.js`:
- `runMonthlySimulation(s)` — the core loop, accepts full state object
- Changes here affect: charts, Monte Carlo, goals, export
- The `cutsDiscipline` parameter (default 1.0) scales lifestyle cuts for MC

---

## Code Conventions

- **No TypeScript** — plain JavaScript with JSX
- **Inline styles** — CSS-in-JS objects, no separate stylesheets
- **Functional components** — no class components
- **Hooks:** `useReducer` (state), `useMemo` (computed values), `useState` (local UI), `useEffect` (storage init)
- **Named exports** for model functions, **default exports** for React components
- **Monospace numerics** — financial figures use JetBrains Mono font
- **Color coding** — green=positive, red=negative, amber=warning, blue=primary, purple=special

---

## Testing

No automated test framework is installed. The model layer (`src/model/`) is pure JavaScript and can be tested with:

```bash
# Ad-hoc module testing
node --input-type=module -e "
import { evaluateGoal } from './src/model/goalEvaluation.js';
// ... test code
"
```

The `npm run build` command serves as a smoke test — Vite will fail on import errors, undefined references, etc.

---

## Common Tasks

| Task | Command |
|------|---------|
| Start dev server | `npm run dev` |
| Production build | `npm run build` |
| Preview prod build | `npm run preview` |
| Install dependencies | `npm install` |
| Run ad-hoc tests | `node --input-type=module -e "..."` |
