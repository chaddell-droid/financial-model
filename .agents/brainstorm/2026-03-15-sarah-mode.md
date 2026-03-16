---
name: sarah-mode
date: 2026-03-15
status: captured
---

# Brainstorm: Sarah Mode — Accessible Financial Dashboard for Sarah

## Problem Statement

Sarah is a co-decision-maker in the family's financial plan, but the current tool is built for Chad's analytical mindset (11 charts, 40+ sliders, Monte Carlo bands). Sarah is intimidated by it and can't answer two questions: (1) "What am I contributing?" — both income from growing her practice and savings from spending cuts, and (2) "Are we going to be OK?" She needs a warm, simple, narrative view that makes her feel empowered rather than overwhelmed.

## Approaches Considered

### Approach 1: Story Dashboard (Three Cards) — SELECTED

A single-screen view with three vertically-stacked cards:

1. **"Your Income Impact"** — Sarah Practice Chart (hero-sized), her current earnings, growth trajectory in plain English, rate + client sliders (the only interactive controls)
2. **"Your Savings Impact"** — The spending cuts she's managing shown as money saved per year, with a "that's like earning an extra $X/month" reframe
3. **"We're Going To Be OK"** — Solvency confidence gauge, plain-English narrative sentence, goal progress indicators with MC success rates

**Pros:** Single screen, warm narrative framing, her contributions front and center, minimal controls (just her 2 sliders + growth rates), answers both core questions
**Cons:** Static spending cuts section (no toggles — those stay in Chad's view)
**Effort:** Medium (~250-300 lines for the panel component)

### Approach 2: Guided Walkthrough (Multi-Step Wizard)

Like DadMode — 3 steps walking Sarah through the plan sequentially.

**Pros:** Even simpler per-screen, guided narrative
**Cons:** More code (~350 lines), feels like a presentation rather than a dashboard she can check anytime, DadMode already uses the wizard pattern for a different audience
**Effort:** Medium-Large

### Approach 3: Two-Panel Side-by-Side

Left: "What You're Doing" (income + expenses). Right: "Where We're Headed" (solvency + goals).

**Pros:** Compact
**Cons:** Denser, less warm, feels more analytical than narrative
**Effort:** Medium

## Selected Approach

**Story Dashboard (Three Cards)** — single screen, three stacked cards, warm narrative tone.

### Design Details

**Entry:** Toggle button in Header (like DadMode button), sets `sarahMode: true` in state.

**Card 1 — "Your Income Impact":**
- Reuses `SarahPracticeChart` component at larger size
- Plain-English summary: "You're earning $X/mo today, growing to $Y/mo by Year 3"
- Dynamic insight: "Every new client adds $Z/mo to our income"
- Only controls: sarahRate, sarahMaxRate, sarahRateGrowth, sarahCurrentClients, sarahMaxClients, sarahClientGrowth sliders
- Warm color scheme (teal/green)

**Card 2 — "Your Savings Impact":**
- Lists all 11 spending cuts when `lifestyleCutsApplied` is true, or shows encouragement if not yet applied
- Computed total savings per year and reframed as monthly "extra income equivalent"
- No toggles — the cut management stays in Chad's view; this card just celebrates what she's doing
- If cuts not applied: gentle message like "When we're ready, spending adjustments can save up to $X/year"

**Card 3 — "We're Going To Be OK":**
- Solvency gauge (arc/semicircle showing MC solvency rate percentage)
- Plain-English narrative: "With your practice growing and our spending discipline, X% of scenarios show us staying solvent through Year 6"
- Goal cards (simplified from GoalPanel — just name, color dot, MC %, achieved/not)
- If MC hasn't been run: show deterministic goal results only with "Run Monte Carlo for confidence percentages" note
- Tone: reassuring, forward-looking

**Data Flow:**
- Same `gatherState()` → `computeProjection()` → projection data
- Same MC results (if run)
- Same goal evaluation results
- New computed values: total annual cuts, per-client income impact, breakeven month estimate
- NO separate projection — reuses existing memoized data

**Color/Tone:**
- Warmer palette: softer backgrounds, teal/green accents instead of blue/purple
- Avoid raw negative numbers — reframe as "gap closing" rather than "-$21K"
- Financial figures still use JetBrains Mono but with warmer colors

## Open Questions

1. Should Sarah Mode have its own MC "Run" button or always show the last MC results from Chad's view?
2. Should the savings impact card show cuts as a toggle Sarah can control, or purely read-only celebration of current state?
3. What's the right label for the header button — "Sarah's View", "Simple View", or something else?
4. Should there be a simplified timeline at the bottom showing key events (SSDI, vesting milestones, BCS ending)?
5. When `lifestyleCutsApplied` is false, should Card 2 show the potential savings or be hidden entirely?

## Next Step: /plan

```
/plan "Implement Sarah Mode: a three-card story dashboard (Your Income Impact, Your Savings Impact, We're Going To Be OK) toggled from Header. Reuses existing projection/MC/goal data. New file: src/panels/SarahMode.jsx (~250 lines). State additions: sarahMode boolean. Wiring: Header button + conditional render in FinancialModel.jsx. See .agents/brainstorm/2026-03-15-sarah-mode.md for full design."
```
