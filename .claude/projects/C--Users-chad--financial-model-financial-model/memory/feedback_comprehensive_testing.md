---
name: comprehensive_testing
description: Always audit all downstream consumers when changing data flow — test comprehensively before pushing
type: feedback
---

When modifying how a value flows through the system (e.g., adding an override like totalMonthlySpend), trace EVERY consumer of that value across all components, charts, calculations, and exports. Don't just wire up the happy path — verify sliders, summaries, narratives, exports, Monte Carlo, and secondary displays all reflect the change.

**Why:** User got burned when totalMonthlySpend override was added but base expenses sliders and other downstream displays weren't properly updated, making the app feel broken.

**How to apply:** Before pushing any data-flow change, grep for every reference to the affected field, trace through all prop bundles, and verify each consumer handles the new behavior correctly. Test both states (override set and override cleared).
