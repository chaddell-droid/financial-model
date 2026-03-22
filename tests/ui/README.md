# UI Swarm Validation

This directory holds the coordination contract for browser-agent UI validation.

## Files

- `coverage-manifest.json`
  - machine-readable ownership, selectors, preconditions, and expected behaviors

## Deterministic Launch

Use the app in deterministic validation mode:

```text
http://127.0.0.1:5173/?ui_test=1&mc_seed=123&reset_storage=1
```

## One-Command Swarm

With the app running locally, execute the full UI swarm with:

```bash
npm run ui:swarm
```

Optional:

- override the target URL with `UI_SWARM_URL`

```bash
UI_SWARM_URL="http://127.0.0.1:4173/?ui_test=1&mc_seed=123&reset_storage=1" npm run ui:swarm
```

The runner:

- launches isolated headless Chromium sessions per worker
- executes the current 6-worker, 28-entry coverage set
- prints a per-worker pass/fail summary
- exits nonzero on any failure

Wave 0 added a dev-only browser harness at `window.__FIN_MODEL_TEST__`.

Available helpers:

- `window.__FIN_MODEL_TEST__.resetStorage()`
- `window.__FIN_MODEL_TEST__.clearStorage()`
- `window.__FIN_MODEL_TEST__.listStorageKeys()`
- `window.__FIN_MODEL_TEST__.getStorageSnapshot()`
- `window.__FIN_MODEL_TEST__.getMonteCarloSeed()`
- `window.__FIN_MODEL_TEST__.setMonteCarloSeed(seed)`

## Run Rules

1. Start from the deterministic launch URL.
2. Confirm `window.__FIN_MODEL_TEST__.enabled === true`.
3. Reset storage before each worker run unless the scenario explicitly validates persistence.
4. Keep `mc_seed` fixed for Monte Carlo checks unless the case explicitly tests seed changes.
5. Workers only exercise the entries assigned to them in `coverage-manifest.json`.
6. Failures need evidence:
   - exact entry id
   - reproduction steps
   - observed result
   - expected result
   - screenshot or console evidence when relevant

## Status Meanings

- `ready`
  - stable selector exists and the behavior is actionable for browser agents
- `partial`
  - behavior is testable, but one or more selectors still rely on visible text or layout assumptions
- `observe`
  - surface is mostly read-only or visual; agents should verify rendering and integrity, not force weak interactions

## Behavior Classes

The manifest uses these validation classes:

- `render`
- `input`
- `state`
- `derived`
- `mode`
- `persistence`
- `visual`
- `integrity`

An element is only considered covered when the relevant behavior class is checked. A slider is not done just because it moves; it must update the dependent state or chart it controls.

## Current Constraints

- `GoalPanel.jsx` and `DadMode.jsx` still rely partly on visible-text selectors.
- `BridgeChart.jsx`, `SarahPracticeChart.jsx`, `DataTable.jsx`, and `SummaryAsk.jsx` are observation surfaces, not rich automation surfaces.
- Some retirement and help behaviors persist in `localStorage`; those runs must start from a reset state.
- Hover-driven charts should use the explicit hover-surface selectors from Wave 0 rather than raw SVG coordinate guessing.

## Expected Swarm Flow

1. Coordinator reads `coverage-manifest.json`.
2. Coordinator assigns each worker only its owned entries.
3. Workers run in deterministic mode and log evidence per entry.
4. Coordinator deduplicates failures by entry id and failing expectation.
5. Stable failures get promoted into repeatable browser automation in later waves.

## Notes For Playwright Agents

- Prefer `data-testid` selectors first.
- Fall back to `aria-label`, then visible text, only where the manifest marks the entry `partial`.
- For duplicate Risk-tab charts, always include the chart `instanceId` selector suffix:
  - `risk-tab`
  - `right-rail`
  - `shared-rail`
