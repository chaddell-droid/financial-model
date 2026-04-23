---
type: 'constraint-workshop'
feature: 'suggested-next-moves'
phase: 'Phase 2'
storyId: '2.1'
date: '2026-04-23'
participant: 'Chad'
status: 'signed-off'
signedOffAt: '2026-04-23'
---

# Constraint Workshop — Phase 2 Continuous-Lever Bounds

**Purpose:** This artifact captures the realistic min/max bounds for every bounded-continuous lever in the Financial Model, plus the classification (binary / bounded-continuous / awareness-only) for every lever the recommendation engine considers. It is the **signed-off gate** for Phase 2 — Stories 2.2–2.5 (lever classification module, golden-section optimizer, cascade integration, slider UI) all depend on these numbers.

**Why this matters:** Without workshop-derived bounds, a continuous-lever optimizer would cheerfully recommend "raise Sarah to $10,000/hr" or "cut spending by $50,000/mo" — mathematically optimal, humanly absurd. These bounds encode what is *actually* negotiable inside Chad's family's real life.

## Lever Classification (FR7)

Every lever the recommendation engine evaluates is classified into exactly one of three archetypes. Only **bounded-continuous** levers are eligible for the Phase 2 optimizer.

### Binary

| Lever | Model field | Rationale |
|---|---|---|
| Retire all debt | `retireDebt` | Pay off debt at once with a lump sum, or not — no partial value |
| Apply spending cuts | `lifestyleCutsApplied` | Activation flag for `cutsOverride`; the *amount* is bounded-continuous below |
| Sell the van | `vanSold` | Own it or sell it |
| Chad takes a W-2 job | `chadJob` | Activation flag; salary & start come with the specific offer |
| SS Retirement vs SSDI | `ssType` (enum `'ssdi'` \| `'ss'`) | Mutually exclusive Social Security paths |
| SSDI denied scenario | `ssdiDenied` | Worst-case planning toggle |

### Bounded-Continuous *(Phase 2 optimizer eligible)*

| Lever | Model field | Min | Max | Rationale |
|---|---|---|---|---|
| Sarah's hourly rate | `sarahRate` | $200 | **$300** | Floor is today's rate. Over the 6-year horizon, rate may climb as high as $300 with tenure and market lift. Above $300, clients push back. |
| Sarah's client count | `sarahCurrentClients` | 3.75 | **5** | Floor is today. Ceiling rises to 5 once the twins are in college — she has more calendar capacity and is willing to take on the extra load after that milestone. Before the girls age out, the soft cap is lower (~4.5); the optimizer should favor the higher ceiling for post-college months. |
| Aggressive spending cuts | `cutsOverride` | $0 | **$3,000/mo** | Total monthly cut across all categories. The $3k ceiling is the most aggressive realistic cut the family can absorb without quality-of-life damage. **Interpretation note:** `cutsOverride` overrides the individual `cut*` fields (see `gatherState`), so $3,000/mo is the *total* cut, not additive to any individual cuts already set. |
| External BCS contribution | `bcsParentsAnnual` | $0 | $43,400/yr | Floor = grandparents / financial aid stop. Ceiling = full tuition covered externally (= `bcsAnnualTotal`). Nothing else is leverable in BCS — tuition schedule is fixed. |
| Chad's consulting income | `chadConsulting` | $0 | **SSDI SGA cap** | Ceiling = Social Security Administration's Substantial Gainful Activity monthly limit (non-blind), published annually. 2025 value: **$1,620/mo** — verify current value at ssa.gov/oact/cola/sga.html before each cascade run. Going above SGA triggers SSDI loss, which defeats the purpose of optimizing income at the margin. |
| SS claim age | `ssClaimAge` | 62 | 70 | Already enforced by SSA regulation and the existing `RANGE` entry. No workshop-level tuning needed. |
| Chad W-2 job start month | `chadJobStartMonth` *(only when `chadJob` is active)* | 0 | **12** | How far out Chad would reasonably accept a W-2 offer. 12 months is the realistic planning window; beyond that the offer/fit become too uncertain to model. |
| Van sale month | `vanSaleMonth` *(only when `vanSold` is active)* | 0 | **24** | When to sell the van. 24-month window accommodates waiting for a better market or a replacement vehicle plan. |

### Awareness-Only *(never recommended as actions)*

These levers surface in the **Sensitivities** section as "things to watch" — they move the outcome but Chad cannot *choose* them.

| Lever | Model field | Why not leverable |
|---|---|---|
| Market investment return | `investmentReturn` | Market-driven |
| Expense inflation rate | `expenseInflationRate` | Macro CPI |
| MSFT stock growth | `msftGrowth` | Stock-driven |
| 401k return | `return401k` | Market-driven |
| Home appreciation | `homeAppreciation` | Housing-market-driven |
| Sarah's ambient rate growth | `sarahRateGrowth` | Organic, not actively chosen per year |
| Sarah's ambient client growth | `sarahClientGrowth` | Organic demand growth, not actively chosen |

## Contextual Notes for the Optimizer

**Sarah's client-count time-dependence.** The 5-client ceiling only applies after the twins are in college (post `kidsAgeOutMonths`). Before that milestone, a softer ceiling of ~4.5 is more realistic. Phase 2 optimizer implementation should consider a **phase-aware constraint** for this lever, OR apply the stricter 4.5 bound universally as a simplification. The simpler 4.5-universal interpretation is acceptable for MVP; phase-aware bounds can come in a Phase 3+ enhancement if the cascade produces unrealistic recommendations for Sarah's pre-college years.

**Cuts-override interaction.** `cutsOverride` is an *override*, not an *addition*. When set, it zeroes out the individual `cut*` fields in `gatherState`'s derivation. The $3,000/mo ceiling is the TOTAL cut, regardless of any individual cut sliders already set in the Decision Console.

**SSDI SGA cap is time-varying.** The Social Security Administration updates the Substantial Gainful Activity threshold annually. Hardcoding "$1,620" would decay. Options for Phase 2 implementation:
- (a) Constants file with a documented annual-review comment and the current year's value
- (b) A per-MODEL_KEY field `chadConsultingMax` defaulting to the current SGA cap, editable by Chad when SSA updates
- (c) Auto-fetch from an SSA endpoint (out of scope — adds network dep)

Recommend option (b) for user-editability without requiring a code deploy. Decision deferred to Story 2.2 implementation.

**Chad W-2 conditional bounds.** `chadJobStartMonth`, `chadJobSalary`, `chadJobHealthSavings`, `chadJobTaxRate`, `chadJobNoFICA`, `chadJobPensionRate`, `chadJobPensionContrib` all become meaningful *only* when `chadJob === true`. The optimizer should treat the W-2 package as a unit — binary activation + fixed offer details per job — rather than independently varying the fields. `chadJobStartMonth` is the only one genuinely tunable here (when to start).

**Van-sale conditional bounds.** Same pattern: `vanSold` is binary activation; `vanSaleMonth` is the only tunable continuous parameter once activation is set.

## Out-of-Scope for This Workshop

These items do NOT need bounds defined because they're not leverable:

- `baseExpenses` / `totalMonthlySpend` — anchor value, derived from actuals or user-entered total
- `debtCC`, `debtPersonal`, `debtIRS`, `debtFirstmark`, `debtService` — current balances, facts
- `startingSavings`, `starting401k`, `homeEquity` — current balances, facts
- `msftPrice`, `ssPIA`, `ssdiPersonal`, `ssdiFamilyTotal` — determined by external authorities (market, SSA) at plan-creation time
- `moldCost`, `roofCost`, `otherProjects`, `capitalItems` — quoted capital expenses; user toggles `*Include` to include/exclude, but the cost itself is a quote, not a lever
- `milestones`, `goals` — meta / planning metadata
- `trustIncomeNow`, `trustIncomeFuture`, `trustIncreaseMonth` — fixed per family trust structure

## Custom Levers

User-added custom levers (`customLevers` in state) define their own bounds via `maxImpact` per lever. They are treated as **binary activation + continuous value in [0, maxImpact]**, which means:
- If a custom lever is inactive, the binary activation is the decision
- If active, `currentValue ∈ [0, maxImpact]` is a bounded-continuous sub-decision (Phase 2 optimizer eligible)

No workshop bounds needed — each custom lever defines its own `maxImpact` at creation.

## Sign-off

This document unlocks Stories 2.2–2.5. Once signed off, Story 2.2 (lever classification + constraint storage) can begin immediately.

**Participant:** Chad
**Workshop conducted:** 2026-04-23
**Status:** ✅ **Signed off by Chad on 2026-04-23.** Phase 2 Stories 2.2–2.5 unblocked.
