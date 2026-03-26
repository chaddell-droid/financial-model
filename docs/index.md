# Family Financial Planning Model — Documentation Index

**Generated:** 2026-03-25 | **Scan Level:** Deep Scan

---

## Project Overview

- **Type:** Monolith (React 18 SPA)
- **Primary Language:** JavaScript/JSX
- **Architecture:** Component-based with centralized useReducer + pure model layer
- **Build:** Vite 6
- **Styling:** Inline CSS with design tokens (dark theme, CSS custom properties)
- **Charts:** 12 custom SVG components (no charting library)

## Quick Reference

- **Tech Stack:** React 18, Vite 6, Playwright
- **Entry Point:** `src/main.jsx` → `<FinancialModel />`
- **State:** useReducer (~156 keys, 80 MODEL_KEYS)
- **Source Files:** 70 in `src/`

## Generated Documentation

- [Project Overview](./project-overview.md) — Executive summary, features, tech stack
- [Architecture](./architecture.md) — State management, data flow, model layer, UI layer, testing
- [Source Tree Analysis](./source-tree-analysis.md) — Annotated directory tree with critical folders
- [Component Inventory](./component-inventory.md) — All 70 files: charts, panels, components, model modules
- [Development Guide](./development-guide.md) — Quick start, scripts, adding features, testing, deploy

## Existing Documentation

- [Adaptive PWA Guide](./adaptive-pwa-guide.md) — Detailed guide for adaptive withdrawal strategies
- [UI Contract](./ui-contract.md) — UI presentation rules and component contracts

## Getting Started

```bash
npm install
npm run dev
# Open http://localhost:5173
```

See [Development Guide](./development-guide.md) for full setup, testing, and deployment instructions.
