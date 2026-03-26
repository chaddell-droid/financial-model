# Development Guide

**Generated:** 2026-03-25 | **Scan Level:** Deep

---

## Prerequisites

- **Node.js** (v18+ recommended)
- **npm** (bundled with Node)
- No database, no backend, no external API keys required

## Quick Start

```bash
# Install dependencies
npm install

# Start dev server (port 5173)
npm run dev

# Production build
npm run build

# Preview production build
npm run preview
```

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Vite dev server with HMR (http://localhost:5173) |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve production build locally |
| `npm run ui:swarm` | Run parallel UI test suite |
| `npm run ui:perf` | Run performance benchmarks |

## Dependencies

**Runtime (2):**
- `react` ^18.3.1
- `react-dom` ^18.3.1

**Dev (3):**
- `@vitejs/plugin-react` ^4.3.4
- `vite` ^6.0.0
- `playwright-core` ^1.58.2

## Project Structure

```
src/
├── main.jsx              # Entry point
├── FinancialModel.jsx    # Root component (~1050 LOC)
├── state/                # useReducer state management
├── model/                # Pure business logic (no React)
├── charts/               # Custom SVG visualizations
├── components/           # Shared UI primitives
├── panels/               # Feature panels + tabs
├── ui/                   # Design tokens + hooks
├── content/              # Help text + labels
└── testing/              # Perf metrics + test harness
```

## State Management

All state lives in a single `useReducer` in `FinancialModel.jsx`:
- Dispatch `SET_FIELD` for individual slider/toggle changes
- `MODEL_KEYS` (80 keys) define what's saved/restored with scenarios
- `useDeferredValue(state)` isolates heavy computations from UI updates

## Adding a New Feature

### New Model Logic
1. Create pure function in `src/model/` (no React imports)
2. Export from the module
3. Import in `FinancialModel.jsx` and wire into useMemo/useCallback

### New State Field
1. Add default value to `INITIAL_STATE` in `src/state/initialState.js`
2. If it should persist with scenarios, add key to `MODEL_KEYS`
3. If it needs backward compatibility, add fallback in `RESTORE_STATE` action

### New Chart
1. Create `src/charts/MyChart.jsx`
2. Use `chartUtils.js` for scales and colors
3. Use `chartContract.js` for time label formatting
4. Add `useRenderMetric('MyChart')` for performance tracking
5. Wire props in `FinancialModel.jsx` with useMemo prop bundle

### New Tab
1. Create `src/panels/tabs/MyTab.jsx`
2. Add tab to `TABS` array in `src/components/TabBar.jsx`
3. Wire in `FinancialModel.jsx` render logic

## Design System

All styling uses inline CSS with tokens from `src/ui/tokens.js`:

```javascript
import { UI_COLORS, UI_TEXT, UI_SPACE, UI_RADII } from '../ui/tokens.js';

// Use in components:
style={{ color: UI_COLORS.textBody, fontSize: UI_TEXT.body, padding: UI_SPACE.md }}
```

CSS custom properties are defined in `src/index.css` (dark theme).

## Testing

### Contract Tests
```bash
node --experimental-vm-modules src/model/__snapshots__.test.js
```
Uses Node `assert` module. Tests model exports, state shape, projection contracts.

### UI Test Harness
Add `?ui_test=1` to URL to enable `window.__FIN_MODEL_TEST__`:
- `?mc_seed=12345` — Lock Monte Carlo seed for deterministic results
- `?reset_storage=1` — Clear localStorage on load

### Performance Benchmarks
```bash
npm run ui:perf
```
Measures render counts and slider responsiveness via Playwright.

## Build & Deploy

```bash
npm run build
```

Output goes to `dist/`. The app is a static SPA — deploy the `dist/` folder to any static hosting (GitHub Pages, Netlify, Vercel, S3, etc.).

## Common Patterns

### Memoized Prop Bundles
```javascript
const chartProps = useMemo(() => ({
  data, savingsData, monthlyDetail, ...otherProps
}), [data, savingsData, monthlyDetail, ...otherProps]);
```

### Setter Cache (avoids new function refs)
```javascript
const setterCache = useRef({});
const set = useCallback((field) => {
  if (!setterCache.current[field]) {
    setterCache.current[field] = (v) => dispatch({type:'SET_FIELD', field, value: v});
  }
  return setterCache.current[field];
}, []);
```

### Slider Commit Strategy
- `continuous` — Updates on every frame during drag (default)
- `settled` — Defers commit until mouse up + idle timeout (for expensive computations)
