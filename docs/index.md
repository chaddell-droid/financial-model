# Family Financial Planning Model — Documentation Index

**Generated:** 2026-03-15 | **Scan Level:** Deep Scan

---

## Project Overview

- **Type:** Monolith (single-part, client-only)
- **Primary Language:** JavaScript (JSX)
- **Framework:** React 18 + Vite 6
- **Architecture:** Client-side SPA with useReducer state management

## Quick Reference

- **Entry Point:** `src/main.jsx`
- **Root Component:** `src/FinancialModel.jsx` (state owner, orchestrator)
- **Computation:** `src/model/projection.js` (72-month simulation engine)
- **State:** `src/state/initialState.js` (40+ parameters, MODEL_KEYS)
- **Build:** `npm run build` → `dist/` (~307KB JS, ~88KB gzip)
- **Dev Server:** `npm run dev` → `http://localhost:5173`

## Generated Documentation

- [Project Overview](./project-overview.md) — Executive summary, tech stack, key features
- [Architecture](./architecture.md) — Component hierarchy, state flow, data flow, computation layer
- [Source Tree Analysis](./source-tree-analysis.md) — Annotated directory structure, critical folders
- [Component Inventory](./component-inventory.md) — All 35 source files categorized with props/exports
- [Development Guide](./development-guide.md) — Setup, build, deploy, conventions, common tasks

## Existing Documentation

- [README.md](../README.md) — StackBlitz link (minimal)

## Getting Started

1. `npm install` — install dependencies
2. `npm run dev` — start development server
3. Open `http://localhost:5173` in browser
4. Read [Architecture](./architecture.md) for system understanding
5. Read [Component Inventory](./component-inventory.md) for file-level detail

## AI-Assisted Development Guidance

When working with this codebase:
- **Model changes** affect everything downstream — edit `src/model/projection.js` carefully
- **State changes** require updating `INITIAL_STATE` + `MODEL_KEYS` + destructuring in `FinancialModel.jsx`
- **New features** follow the pattern: state → model → component → wire in root
- **Backward compatibility** is handled in `reducer.js` RESTORE_STATE — update when adding new state keys
- The model layer is **pure JavaScript** — test without React
