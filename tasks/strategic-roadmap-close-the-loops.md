# Strategic Feature Roadmap: "Close the Loops"

## Context
The financial model has grown into a comprehensive 7-tab, 16-chart planning tool with Monte Carlo simulation, scenario management, smart transaction classification, and retirement analysis. It's excellent at **showing** the family's financial future — but the next evolution is the tool **telling** you things. This plan covers 5 strategic features that close feedback loops: Actuals -> Model, Scenarios -> Recommendations, Charts -> Actions.

---

## Implementation Order (with dependencies)

| Priority | Feature | Scope | Dependencies | Why This Order |
|----------|---------|-------|-------------|----------------|
| **1** | Glanceable Dashboard (3-Number Hero) | Small | None | Quick win, high daily value, no new data flows |
| **2** | Drift Detection + Auto-Suggest | Medium | None | Closes actuals->model loop, builds on existing drift logic |
| **3** | Scenario Templates | Small | None | Low complexity, high accessibility for Sarah |
| **4** | Responsive Charts | Medium | None (but benefits from #1 being done) | Infrastructure improvement, enables mobile |
| **5** | Decision Support / Top 3 Moves | Large | Benefits from #4 (responsive panels) | Most complex, needs solid foundation |

---

## Feature 1: Glanceable Dashboard (3-Number Hero)

### Problem
To answer "how are we doing?", users must interpret a complex waterfall chart. No instant summary exists.

### Solution
Add a 3-number hero section at the top of OverviewTab: **Monthly Gap**, **Savings Runway**, **Success Probability**.

### Files to Modify
- `src/panels/tabs/OverviewTab.jsx` — Add hero section above BridgeChart
- `src/model/overviewStory.js` — Reuse existing `buildOverviewStatusModel()` which already computes gap, runway, breakeven with tone coloring

### Design
```
OverviewTab
  +-- HeroMetrics (NEW inline section, not a separate component)
  |   +-- Monthly Gap: rawMonthlyGap -> green (positive) / red (negative)
  |   +-- Savings Runway: savingsZeroLabel -> green (long) / amber (short)
  |   +-- Success Rate: mcResults?.solvencyRate -> green/amber/red, or "Run MC" link
  +-- BridgeChart (existing)
```

### Key Data (already available in OverviewTab's parent props)
- `rawMonthlyGap` — computed in FinancialModel.jsx:386-394
- `savingsZeroLabel` / `savingsZeroMonth` — from projection data
- `mcResults?.solvencyRate` — from Monte Carlo (null if not run yet)

### Implementation
1. Expand OverviewTab props to include `rawMonthlyGap`, `savingsZeroLabel`, `savingsZeroMonth`, `mcResults`
2. Render 3 large styled cards using `UI_COLORS`, `UI_SPACE`, `UI_TEXT` tokens
3. Tone logic: reuse patterns from `overviewStory.js` status items
4. If `mcResults` is null, show "Run Monte Carlo" as clickable text linking to Risk tab

### Testing
- Verify numbers match projection output
- Test all tone states (positive/caution/destructive)
- Test with mcResults null vs populated
- Visual check on dev server

### Scope: Small (~1-2 hours)

---

## Feature 2: Drift Detection + Auto-Suggest Model Updates

### Problem
Users manually push actuals to the model. No automatic detection when reality diverges from plan assumptions.

### Solution
Auto-detect spending drift from actuals data, show a suggestion banner, one-click accept.

### Files to Modify
- `src/model/checkIn.js` — Add `computeActualsDrift(monthlyActuals, modelState)` function
- `src/panels/tabs/ActualsTab.jsx` — Add drift suggestion banner above transaction table
- `src/panels/tabs/TrackTab.jsx` — Add drift suggestion banner (using existing `computeMonthlyDrift`)

### Existing Infrastructure to Reuse
- `computeMonthlyDrift(actuals, planSnapshot)` in checkIn.js:53-81 — already compares 9 fields with +/-10% threshold
- `computeCumulativeDrift(checkInHistory)` in checkIn.js:86-109 — sums deltas
- ActualsTab already computes `coreTotal`, `onetimeTotal` from transactions (lines 71-83)
- Push-to-model already dispatches `SET_FIELDS` with `totalMonthlySpend` and `oneTimeExtras`

### Design
```
ActualsTab
  +-- DriftBanner (NEW inline)  <-- shows when |coreTotal - model.baseExpenses| > 10%
  |   "Your actual core spending ($X) differs from model ($Y) by Z%. [Update Model] [Dismiss]"
  +-- Transaction table (existing)
  +-- Push to Model (existing)

TrackTab  
  +-- DriftBanner (reuse same pattern) <-- shows when cumulative drift > threshold
  |   "After N check-ins, expenses are running $X/mo higher than planned. [Update Model] [Dismiss]"
  +-- Check-in form (existing)
```

### Implementation
1. Add `computeActualsDrift(transactions, modelExpenses)` to checkIn.js — compare actuals totals vs model
2. In ActualsTab, compute drift in useMemo, render banner if threshold exceeded
3. "Update Model" dispatches same SET_FIELDS as existing push-to-model
4. "Dismiss" sets a local state flag (per-session, not persisted)
5. In TrackTab, reuse existing `latestDrift` to show banner when expenses are `behind`

### Testing
- Test `computeActualsDrift` with exact match, slight drift, large drift
- Test banner appears/disappears at threshold
- Test "Update Model" correctly sets totalMonthlySpend
- Test dismiss behavior

### Scope: Medium (~3-4 hours)

---

## Feature 3: Scenario Templates (Pre-built "What If" Paths)

### Problem
Exploring scenarios requires manually toggling 12+ sliders. Too much cognitive load for Sarah or quick what-if exploration.

### Solution
3-5 pre-built scenario templates that set key fields with one click.

### Files to Create/Modify
- **NEW** `src/model/scenarioTemplates.js` — Template definitions (partial state overrides)
- `src/components/SaveLoadPanel.jsx` — Add "Templates" section above saved scenarios
- `src/FinancialModel.jsx` — Add template load handler

### Template Definitions
```javascript
export const SCENARIO_TEMPLATES = [
  {
    id: 'optimistic-sarah',
    name: 'Optimistic Sarah',
    description: 'Fast practice growth, max clients by month 18',
    overrides: {
      sarahCurrentClients: 4, sarahMaxClients: 6, sarahClientGrowth: 15,
      sarahRateGrowth: 8, sarahMaxRate: 150,
    }
  },
  {
    id: 'conservative-sarah', 
    name: 'Conservative Sarah',
    description: 'Slow growth, plateaus at 15 clients',
    overrides: {
      sarahClientGrowth: 3, sarahMaxClients: 4, sarahRateGrowth: 3,
    }
  },
  {
    id: 'ssdi-denied',
    name: 'SSDI Denied',
    description: 'No disability income, must self-fund gap',
    overrides: { ssdiDenied: true }
  },
  {
    id: 'chad-w2-job',
    name: 'Chad Gets W-2 Job',
    description: 'Chad employed with salary + health benefits',
    overrides: {
      chadJob: true, chadJobSalary: 120000, chadJobStartMonth: 3,
      chadJobHealthSavings: 800,
    }
  },
  {
    id: 'worst-case',
    name: 'Worst Case',
    description: 'SSDI denied, slow Sarah growth, higher expenses',
    overrides: {
      ssdiDenied: true, sarahClientGrowth: 3, sarahMaxClients: 4,
      lifestyleCutsApplied: false,
    }
  },
];
```

### Implementation
1. Create scenarioTemplates.js with template definitions
2. In SaveLoadPanel, add "Quick Templates" section with cards showing name + description
3. "Apply" button merges template overrides with current state via `SET_FIELDS`
4. Template load is NOT a full state restore — it's a partial override (keeps current values for unspecified fields)
5. After applying, user can tweak and save as custom scenario

### Testing
- Test each template produces valid state (all overrides pass schema validation)
- Test partial merge doesn't clobber unrelated fields
- Test template load + save-as-custom round-trip

### Scope: Small (~2-3 hours)

---

## Feature 4: Responsive Charts

### Problem
All charts hardcode svgW=800. They overflow on mobile, waste space on large screens.

### Solution
Container-aware chart sizing via ResizeObserver hook.

### Files to Create/Modify
- **NEW** `src/hooks/useContainerWidth.js` — ResizeObserver-based width hook
- `src/charts/chartUtils.js` — Add responsive padding helper
- ALL chart components (10+) — Replace hardcoded svgW with container width

### Existing Pattern (already good)
All charts already use `viewBox` + `width: 100%` + `height: auto`. Tooltip positioning already uses percentage (pctX, pctY). Mouse coords already convert via getBoundingClientRect. **The SVG scaling infrastructure is in place — we just need dynamic svgW.**

### Implementation
1. Create `useContainerWidth()` hook:
   ```javascript
   function useContainerWidth(ref) {
     const [width, setWidth] = useState(800);
     useEffect(() => {
       if (!ref.current) return;
       const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
       ro.observe(ref.current);
       return () => ro.disconnect();
     }, []);
     return Math.max(400, Math.min(width, 1200)); // clamp
   }
   ```
2. Add `responsivePadding(containerW)` to chartUtils.js — scales padL/padR based on width
3. Wrap each chart's outer div with a ref, pass width to SVG dimensions
4. X-axis: filter labels when containerW < 600 (show every other label)
5. Apply to charts incrementally: start with BridgeChart, SavingsDrawdown, then others

### Chart Inventory (10 charts to update)
- BridgeChart.jsx (svgW=800, svgH=240/290)
- SavingsDrawdownChart.jsx (svgW=800, svgH=340)
- NetWorthChart.jsx (svgW=800, svgH=340)
- MonteCarloPanel.jsx (svgW=800, svgH=260)
- RetirementIncomeChart.jsx (svgW=800, svgH=340)
- RetirementCompositionChart.jsx (svgW=800, svgH=260)
- SequenceOfReturnsChart.jsx (check dimensions)
- PwaDistributionChart.jsx (svgW=760, svgH=220)
- IncomeCompositionChart.jsx (already dynamic width)
- MonthlyCashFlowChart.jsx (already dynamic width)

### Testing
- Resize browser window, verify charts scale smoothly
- Test min/max clamp (400px - 1200px)
- Test tooltip positioning still works at different widths
- Test label readability at compact width
- Build check: `npx vite build`

### Scope: Medium (~4-6 hours, incremental across charts)

---

## Feature 5: Decision Support / "Top 3 Moves" Ranking

### Problem
Users can model scenarios but must manually discover which lever has the biggest impact. No automated "what should I change?" guidance.

### Solution
Parametric sensitivity analysis that ranks input variables by impact on outcomes.

### Files to Create/Modify
- **NEW** `src/model/sensitivityAnalysis.js` — Core ranking engine
- **NEW** `src/panels/TopMovesPanel.jsx` — UI component
- `src/panels/tabs/OverviewTab.jsx` or `src/panels/tabs/PlanTab.jsx` — Embed panel
- `src/state/initialState.js` — No new persisted fields needed (compute on demand)

### Existing Infrastructure to Reuse
- `buildPrimaryLeversModel()` in scenarioLevers.js — already ranks 4 discrete levers
- `computeProjection(gatherState())` in projection.js — pure function, can run variants
- `gatherState()` — extracts MODEL_KEYS for projection input
- Dynamic import pattern from Monte Carlo — lazy load for performance

### Design
```javascript
// sensitivityAnalysis.js
export function computeTopMoves(baseState, baseProjection, topN = 3) {
  const VARIABLES_TO_TEST = [
    { key: 'sarahRate', label: "Sarah's hourly rate", delta: 15 },
    { key: 'sarahClientGrowth', label: "Sarah's client growth rate", delta: 3 },
    { key: 'sarahMaxClients', label: "Sarah's max clients", delta: 1 },
    { key: 'msftGrowth', label: "MSFT growth rate", delta: 5 },
    { key: 'investmentReturn', label: "Investment return rate", delta: 3 },
    { key: 'baseExpenses', label: "Monthly base expenses", delta: -500 },
    { key: 'ssdiApprovalMonth', label: "SSDI approval timing", delta: -3 },
    { key: 'bcsParentsAnnual', label: "BCS parent contribution", delta: -5000 },
    { key: 'chadJobSalary', label: "Chad's job salary", delta: 20000 },
    { key: 'cutsOverride', label: "Lifestyle cuts", delta: 200 },
  ];
  
  // For each variable: run projection with +delta, measure impact on:
  // - Savings runway (months gained/lost)
  // - Final balance change ($)
  // - Breakeven shift (months)
  // Rank by composite score, return top N with actionable description
}
```

### UI Design (TopMovesPanel)
```
+---------------------------------------------+
| Your Top 3 Moves                            |
|                                             |
| 1. Increase Sarah's rate by $15/hr          |
|    -> +$12,400 savings at Year 6            |
|    -> Runway extends 4 months               |
|                                             |
| 2. Reduce base expenses by $500/mo          |
|    -> +$8,200 savings at Year 6             |
|    -> Runway extends 3 months               |
|                                             |
| 3. SSDI approved 3 months earlier           |
|    -> +$6,800 savings at Year 6             |
|    -> Breakeven 2 months sooner             |
|                                             |
| [Recalculate]         Last run: 2m ago      |
+---------------------------------------------+
```

### Implementation
1. Create sensitivityAnalysis.js with `computeTopMoves()`
2. Each variable test: clone baseState, apply delta, run computeProjection, compare metrics
3. Composite score = weighted sum of runway impact + final balance impact + breakeven impact
4. Create TopMovesPanel.jsx with results display
5. Lazy import (like Monte Carlo) to avoid bundling computation
6. Button-triggered, not auto-run (10 projections = ~20ms, fast enough for sync)
7. Embed in OverviewTab below hero metrics, or in PlanTab

### Testing
- Test each variable delta produces expected direction of impact
- Test ranking stability (same inputs -> same ranking)
- Test with edge cases (variable already at max, variable at 0)
- Test composite score calculation
- At least 3 tests per CLAUDE.md requirements

### Scope: Large (~5-7 hours)

---

## Verification Plan

For each feature, before marking complete:
1. `npm test` — all tests pass
2. `npx vite build` — build succeeds  
3. Visual verification on dev server (http://localhost:5173)
4. Test both states: feature active and inactive/empty
5. Check no regressions in existing functionality

## Risk Areas
| Risk | Mitigation |
|------|-----------|
| Feature 1 hero metrics props not flowing to OverviewTab | Trace prop bundle in FinancialModel.jsx before coding |
| Feature 2 drift threshold too sensitive/not sensitive enough | Start with 10% (matching existing check-in logic), make adjustable later |
| Feature 3 template overrides conflicting with schema validation | Run each template through validateAndSanitize in tests |
| Feature 4 ResizeObserver not supported in old browsers | Fallback to 800px default (graceful degradation) |
| Feature 5 sensitivity analysis too slow with many variables | Only test ~10 variables, each projection is <2ms |
