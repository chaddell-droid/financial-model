# Adaptive PWA Guide

## What Adaptive PWA Is

`Adaptive PWA` is the second retirement-planning mode in this app.

It is different from `Historical Safe`:

- `Historical Safe` asks: how much can the pool support across historical cohorts while meeting a reserve-floor rule?
- `Adaptive PWA` asks: given the current pool, remaining horizon, guaranteed income, and bequest target, what spending target does history support now, and how likely is it that this target will not need to be cut later?

Those are different questions. The outputs should not be compared as if they were the same metric.

## Core Semantics

Adaptive PWA in this codebase uses these rules:

- The canonical decision variable is `total spending target`.
- Current-year `portfolio draw` is derived from the spending target and current guaranteed income.
- `probabilityNoCut` means the share of current-state historical samples that support the chosen target or more.
- `bequestTarget` is the terminal objective in this mode.
- Reserve-floor semantics are not the confidence concept in this mode.
- Inheritance is intentionally out of scope for Adaptive PWA v1.

## Mental Model

Use the Adaptive PWA model in five steps:

1. Build the full retirement context.
2. Build the current PWA distribution from all valid remaining-horizon cohorts.
3. Select a spending target from that distribution.
4. Convert that target into current portfolio draw and guaranteed-income components.
5. Optionally simulate the strategy forward with yearly re-solving and monthly realization.

## Key Terms

### Total spending target

The full monthly consumption target for the household in real dollars. This is what the distribution and strategy engine select.

### Current guaranteed income

The current month’s non-portfolio income:

- Social Security
- trust income

### Current portfolio draw

The portion of the spending target that must come from the investment pool right now.

Formula:

```js
currentPortfolioDraw = max(0, totalSpendingTarget - currentGuaranteedIncome)
```

### Bequest target

The desired ending pool balance at the end of the planning horizon.

### Tolerance band

The lower and upper percentile bounds used by the sticky strategies to decide whether the prior spending target can be kept.

### Probability no cut

The proportion of current-state historical samples that are greater than or equal to the chosen spending target.

This is not a reserve-survival probability.

### Realized cohort

One historical cohort used to realize one backtested path through time.

### Reference distribution

The full set of valid remaining-horizon cohorts used to compute the current PWA distribution at each decision year.

## Model Flow

### 1. Build Retirement Context

Start with [retirementIncome.js](/C:/Users/chad_/Financial-Model/financial-model/src/model/retirementIncome.js).

Use `buildRetirementContext(...)` to build the full month-by-month retirement policy surface:

- guaranteed income
- survivor scaling
- current ages
- phase labels

The returned object is the canonical context for Adaptive PWA mode.

### 2. Build Current Distribution

Use [pwaDistribution.js](/C:/Users/chad_/Financial-Model/financial-model/src/model/pwaDistribution.js).

`buildPwaDistribution(...)`:

- slices the remaining horizon from `decisionMonth`
- treats each valid historical cohort as one empirical sample
- solves a supported spending target for that cohort with `computeSWR(...)`
- returns a sorted sample set and summary fields

The output distribution is over `total spending target`, not pool draw.

### 3. Select a Withdrawal Policy

Use [pwaStrategies.js](/C:/Users/chad_/Financial-Model/financial-model/src/model/pwaStrategies.js).

`selectPwaWithdrawal(...)` supports three strategies:

- `fixed_percentile`
  - always pick the configured percentile
- `sticky_median`
  - keep the prior target if it stays inside the band, otherwise recenter to the median
- `sticky_quartile_nudge`
  - keep the prior target if it stays inside the band, otherwise move only to the nearest band edge

### 4. Convert To Current Income View

Still in [retirementIncome.js](/C:/Users/chad_/Financial-Model/financial-model/src/model/retirementIncome.js), use `deriveCurrentWithdrawalView(...)`.

That converts the selected spending target into:

- `currentPortfolioDraw`
- `currentGuaranteedIncome`
- `currentTotalIncome`
- `outsideIncomeReinvested`

### 5. Simulate Adaptive Behavior

Back in [pwaStrategies.js](/C:/Users/chad_/Financial-Model/financial-model/src/model/pwaStrategies.js), use `simulateAdaptivePwaStrategy(...)`.

This does:

1. choose one realized historical cohort
2. solve the current distribution from the current balance
3. select the next year’s target
4. realize 12 months of the chosen cohort path
5. repeat from the updated balance

Important:

- decision cadence is yearly
- realization is monthly
- the arithmetic floor is `$0`
- reserve-floor depletion metrics are not reused here

## API Reference

### `buildRetirementContext({...})`

**Purpose:** Build the month-by-month retirement context used by both distribution building and adaptive simulation.

**Parameters:**

- `horizonMonths`
- `chadPassesAge`
- `ageDiff`
- `survivorSpendRatio`
- `chadSS`
- `ssFRA`
- `sarahOwnSS`
- `survivorSS`
- `trustMonthly`

**Returns:**

- `supplementalFlows`
- `scaling`
- `guaranteedIncome`
- `ssIncome`
- `trustIncome`
- `chadAges`
- `sarahAges`
- `phases`
- `ssLabels`

### `sliceRetirementContext(context, decisionMonth)`

**Purpose:** Get the remaining-horizon view at one decision point.

**Returns:**

- `remainingMonths`
- `supplementalFlows`
- `scaling`
- `currentGuaranteedIncome`
- `currentSSIncome`
- `currentTrustIncome`
- `currentScaling`
- `currentPhase`

### `deriveCurrentWithdrawalView(totalSpendingTarget, currentGuaranteedIncome)`

**Purpose:** Convert the canonical target into current-year components.

**Returns:**

- `totalSpendingTarget`
- `currentGuaranteedIncome`
- `currentPortfolioDraw`
- `currentTotalIncome`
- `outsideIncomeReinvested`

### `buildPwaDistribution({...})`

**Purpose:** Build the current empirical distribution of supported spending targets.

**Parameters:**

- `blendedReturns`
- `decisionMonth`
- `horizonMonths`
- `totalPool`
- `bequestTarget`
- `supplementalFlows`
- `scaling`

**Returns:**

- `decisionMonth`
- `remainingMonths`
- `sampleCount`
- `samples`
- `sortedSampleValues`
- `min`
- `median`
- `max`

### `getPwaSummary(samples, {...})`

**Purpose:** Convert the raw sample set into selected percentile and tolerance-band outputs.

### `selectPwaWithdrawal(distribution, strategyConfig)`

**Purpose:** Choose a spending target from the current distribution.

**Returns:**

- `selectedWithdrawal`
- `selectedPercentile`
- `lowerToleranceWithdrawal`
- `medianWithdrawal`
- `upperToleranceWithdrawal`
- `probabilityNoCut`
- `cutOccurred`
- `reason`

### `simulateAdaptivePwaStrategy({...})`

**Purpose:** Simulate a strategy across time with yearly re-solving and monthly realization.

**Returns:**

- `monthlySchedule`
- `monthlyPools`
- `yearlyDecisions`
- `cutCount`
- `finalPool`

## Minimal Usage Example

```js
import { getBlendedReturns } from '../src/model/historicalReturns.js';
import {
  buildRetirementContext,
  deriveCurrentWithdrawalView,
} from '../src/model/retirementIncome.js';
import { buildPwaDistribution } from '../src/model/pwaDistribution.js';
import {
  selectPwaWithdrawal,
  simulateAdaptivePwaStrategy,
} from '../src/model/pwaStrategies.js';

const blendedReturns = getBlendedReturns(0.6);

const retirementContext = buildRetirementContext({
  horizonMonths: 444,
  chadPassesAge: 82,
  ageDiff: 14,
  survivorSpendRatio: 0.6,
  chadSS: 2933,
  ssFRA: 4213,
  sarahOwnSS: 1900,
  survivorSS: 4186,
  trustMonthly: 2000,
});

const distribution = buildPwaDistribution({
  blendedReturns,
  decisionMonth: 0,
  horizonMonths: 444,
  totalPool: 1500000,
  bequestTarget: 250000,
  supplementalFlows: retirementContext.supplementalFlows,
  scaling: retirementContext.scaling,
});

const selection = selectPwaWithdrawal(distribution, {
  strategy: 'sticky_median',
  basePercentile: 50,
  lowerTolerancePercentile: 25,
  upperTolerancePercentile: 75,
});

const currentView = deriveCurrentWithdrawalView(
  selection.selectedWithdrawal,
  retirementContext.guaranteedIncome[0],
);

const simulation = simulateAdaptivePwaStrategy({
  blendedReturns,
  cohortStart: 0,
  horizonMonths: 444,
  totalPool: 1500000,
  bequestTarget: 250000,
  supplementalFlows: retirementContext.supplementalFlows,
  scaling: retirementContext.scaling,
  retirementContext,
  strategyConfig: {
    strategy: 'sticky_median',
    basePercentile: 50,
    lowerTolerancePercentile: 25,
    upperTolerancePercentile: 75,
  },
});

console.log({
  selectedTarget: currentView.totalSpendingTarget,
  currentDraw: currentView.currentPortfolioDraw,
  confidence: selection.probabilityNoCut,
  firstDecision: simulation.yearlyDecisions[0],
});
```

## UI Mapping

The retirement UI uses the model like this:

- [RetirementIncomeChart.jsx](/C:/Users/chad_/Financial-Model/financial-model/src/charts/RetirementIncomeChart.jsx)
  - builds the current retirement context
  - builds the current PWA distribution
  - selects the current strategy output
  - renders cards, control surface, and annual preview
- [PwaDistributionChart.jsx](/C:/Users/chad_/Financial-Model/financial-model/src/charts/PwaDistributionChart.jsx)
  - renders the current distribution histogram
  - marks the selected target, median, and tolerance band

## Common Mistakes

### Mistake: Treating `selectedWithdrawal` as raw pool draw

It is a `total spending target`.

Always convert it with `deriveCurrentWithdrawalView(...)` before presenting a current pool draw.

### Mistake: Comparing PWA confidence directly to safe-rate confidence

Do not compare:

- `reserve never touched`
- `won't need to cut later`

as if they are interchangeable.

They are different risk definitions.

### Mistake: Forgetting that `decisionMonth` changes the horizon

When `decisionMonth` moves forward:

- `remainingMonths` shrinks
- the valid cohort count changes
- the distribution changes even if the strategy config is unchanged

### Mistake: Forgetting the realized-path vs reference-distribution split

Adaptive simulation needs both:

- one realized cohort path for monthly evolution
- all valid remaining-horizon cohorts for the next decision-year distribution

### Mistake: Reusing inheritance or reserve-floor semantics in PWA mode

Adaptive PWA v1 is intentionally narrower:

- bequest target is the terminal objective
- reserve-floor safety is not the confidence metric
- inheritance is not active in the mode

## When To Use Which Mode

Use `Historical Safe` when you want:

- reserve-floor analysis
- historical cohort survival framing
- fixed-rate intuition

Use `Adaptive PWA` when you want:

- a current-state spending recommendation
- strategy-specific adjustment behavior
- future-cut confidence instead of reserve-floor confidence

## Current Limitations

- Adaptive PWA uses historical cohorts, not iid Monte Carlo.
- Decision cadence is yearly, not monthly.
- Inheritance is not active in PWA v1.
- Longevity is still a fixed horizon to Sarah age 90.

## Related Files

- [retirementIncome.js](/C:/Users/chad_/Financial-Model/financial-model/src/model/retirementIncome.js)
- [pwaDistribution.js](/C:/Users/chad_/Financial-Model/financial-model/src/model/pwaDistribution.js)
- [pwaStrategies.js](/C:/Users/chad_/Financial-Model/financial-model/src/model/pwaStrategies.js)
- [PwaDistributionChart.jsx](/C:/Users/chad_/Financial-Model/financial-model/src/charts/PwaDistributionChart.jsx)
- [RetirementIncomeChart.jsx](/C:/Users/chad_/Financial-Model/financial-model/src/charts/RetirementIncomeChart.jsx)
