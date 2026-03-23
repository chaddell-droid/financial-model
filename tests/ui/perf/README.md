# UI Performance Checks

Run these checks against a preview build, not the dev server.

## Start preview

```bash
npm run build
npm run preview -- --host 127.0.0.1 --port 4173
```

## Run perf checks

```bash
npm run ui:perf
```

The runner targets:

- `shell.overview_to_plan_ready_ms`
- `plan.retire_debt_toggle_ms`
- `plan.van_toggle_ms`
- `plan.cuts_toggle_ms`
- `plan.base_expense_slider_ms`

Budgets live in [budgets.json](/C:/Users/chad_/Financial-Model/financial-model/tests/ui/perf/budgets.json).
