# Repository Guidelines

## Project Structure & Module Organization
- `src/main.jsx` boots the app and provides the `window.storage` polyfill.
- `src/FinancialModel.jsx` is the top-level orchestrator.
- `src/model/` holds pure projection, vesting, and goal-evaluation logic.
- `src/state/` contains initial state and the reducer.
- `src/components/`, `src/panels/`, `src/panels/tabs/`, and `src/charts/` contain UI building blocks and visualizations.
- `public/` stores static assets such as icons. `docs/` and `_bmad/` are reference material, not app entry points.

## Build, Test, and Development Commands
- `npm install` installs dependencies.
- `npm run dev` starts the Vite dev server at `http://localhost:5173`.
- `npm run build` creates the production bundle in `dist/`.
- `npm run preview` serves the built app locally.
- `node src/model/__snapshots__.test.js` runs the regression checks for financial model outputs. There is no `npm test` script.

## Coding Style & Naming Conventions
- Use JavaScript ES modules and React function components only.
- Match the existing style: 2-space indentation, single quotes, and semicolons.
- Use `PascalCase` for components (`NetWorthChart.jsx`) and `camelCase` for helpers and state files (`projection.js`, `initialState.js`).
- Prefer named exports for model utilities and default exports for React components.
- There is no repo-wide formatter or linter config, so keep changes consistent with nearby code.

## Testing Guidelines
- Treat `src/model/__snapshots__.test.js` as the main regression suite.
- When changing financial formulas, update or extend the snapshot assertions with scenario names that describe the case.
- Run the snapshot script and `npm run build` before opening a pull request.

## Commit & Pull Request Guidelines
- Commit messages in this repo are short, imperative, and change-focused, often starting with verbs like `Fix`, `Add`, or `Switch`.
- Keep pull requests small and describe the user-visible impact, the scenarios tested, and any intentional changes to model outputs.
- Include screenshots for UI work and link the related issue when one exists.
- Call out intentional snapshot updates so reviewers can distinguish them from regressions.

## Security & Configuration Tips
- No environment variables are required for local development.
- `src/main.jsx` stores data in `localStorage` using the `fs_` prefix; avoid changing those keys without checking save/load behavior.
- Do not commit secrets or machine-specific local files.
