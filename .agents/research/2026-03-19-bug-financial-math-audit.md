# Bug Hunt: Financial Math Audit

**Date:** 2026-03-19  
**Scope:** `src/model/`, `src/charts/` finance paths  
**Failures:** 0

## Summary

| # | Bug | Severity | File | Fix |
|---|-----|----------|------|-----|
| 1 | Monte Carlo truncates negative shocks to zero, biasing risk results optimistic | MEDIUM | `src/model/monteCarlo.js:29-35`, `src/model/monteCarlo.js:127-132` | Allow negative deviations for returns/growth; keep only bounded inputs like discipline in `[0,1]` |
| 2 | Retirement survival logic checks start-of-year snapshots with strict `>` floor comparisons | MEDIUM | `src/charts/RetirementIncomeChart.jsx:80-109`, `src/charts/RetirementIncomeChart.jsx:160-164`, `src/charts/RetirementIncomeChart.jsx:217-243` | Evaluate against end-of-period balances or monthly minima; treat `floor` as a valid surviving balance with `>=` |
| 3 | Snapshot regression test is broken because `computeWealthProjection` no longer exists | LOW | `src/model/__snapshots__.test.js:12`, `src/model/projection.js` | Update the test to `computeHomeProjection` or add a compatibility export, then refresh snapshots |

## Findings

### BUG-1: Monte Carlo clamps downside to zero (MEDIUM)

**File:** `src/model/monteCarlo.js:29-35`, `src/model/monteCarlo.js:127-132`

**Root cause:** The simulation applies `Math.max(0, randNorm(...))` to `investmentReturn`, `sarahClientGrowth`, and `sarahRateGrowth`. That removes negative outcomes entirely, so volatility only helps the forecast.

**Observed:** Both Monte Carlo paths use the same pattern. Any negative shock becomes `0`, which inflates solvency and goal success rates relative to the requested mean/volatility.

**Fix:** Remove the zero-flooring from stochastic growth/return inputs. Keep clamping only where the domain is truly bounded, such as `cutsDiscipline`.

### BUG-2: Retirement survival is evaluated from the wrong snapshot and excludes exact-floor outcomes (MEDIUM)

**File:** `src/charts/RetirementIncomeChart.jsx:80-109`, `src/charts/RetirementIncomeChart.jsx:160-164`, `src/charts/RetirementIncomeChart.jsx:217-243`

**Root cause:** `runRetirementSim()` records balances before simulating each year, then the survival checks read `yearPools[yearPools.length - 1] > poolFloor` and `yearPools.slice(0, inheritanceYear).every(p => p > poolFloor)`. That makes the logic depend on start-of-year snapshots and treats a balance exactly at the floor as a failure.

**Observed:** The model itself stops spending once `pool <= floor`, so a path that ends exactly on the reserve is still internally valid. The current checks can undercount survival and can miss a depletion that happens in the last pre-inheritance year.

**Fix:** Validate survival on post-period balances or monthly minima, and compare with `>= poolFloor`. For the inheritance case, check the full pre-inheritance period, not only the yearly starts.

### BUG-3: Snapshot test entrypoint is stale (LOW)

**File:** `src/model/__snapshots__.test.js:12`

**Root cause:** The test imports `computeWealthProjection`, but `src/model/projection.js` no longer exports that symbol. The current API exposes `computeHomeProjection` instead.

**Observed:** `node src/model/__snapshots__.test.js` fails immediately with an import error, so the model snapshot suite does not run.

**Fix:** Update the test to the current export name or add a backward-compatible alias, then regenerate the snapshots against the current model output.
