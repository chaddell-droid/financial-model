# UI Contract

## Shell Workflow Order

1. Show the current plan summary.
2. Show the active workflow controls and tab choice.
3. Show the active workspace.
4. Show secondary analysis in the rail only when the current experience supports it.

## Required Shell Behavior Matrix

| Experience | Width bucket | showTopSummary | showTabs | showRail | railPlacement | showWorkflowPanels |
|------------|--------------|----------------|----------|----------|---------------|--------------------|
| planner | desktop | yes | yes | yes | side | yes |
| planner | stacked | yes | yes | yes | below | yes |
| planner | compact | yes | yes | yes | below | yes |
| present | any | yes | no | no | hidden | no |
| sarah | any | Sarah summary only | no | no | hidden | no |
| dad | any | Dad summary only | no | no | hidden | no |

## Glossary Rules

- Use `M0`, `Y1`, `Y2` style labels for modeled time.
- Use `Current assumptions` for the live editable plan state.
- Use `Steady state` for the stabilized post-ramp state.
- Use `Pool draw` and `Spending target` instead of mixing raw withdrawal terminology.
- Keep risk labels distinct from retirement confidence labels.

## Chart Contract

- Every chart must answer one primary user question.
- Every chart must include one persistent summary block.
- Hover is supplemental, never the only way to understand the chart.
- Primary annotations are capped and should not become the main reading path.

## Action Hierarchy

- `primary`: commits the main action for the current surface
- `secondary`: standard supporting action
- `ghost`: low-emphasis utility action
- `destructive`: reset/delete actions
- `chip`: mode or state toggle

## Help Hierarchy

- drawer = section framing, how to read the surface, and mode-level guidance
- inline tip = one control, label, or metric definition
- hover tooltip = supplemental numeric detail only
