/**
 * CFP Advisor — system prompt builder.
 *
 * Composes a four-block prompt:
 *   A. Persona      (static)
 *   B. Household    (deterministic from current state, regenerated per turn)
 *   C. Tool philosophy (static)
 *   D. Boundaries   (static)
 *
 * The static blocks are returned with cache_control hints so the
 * advisorAgent can apply Anthropic prompt caching to drop repeat-prompt cost.
 *
 * `buildSystemPrompt(state)` returns an array of blocks suitable for
 * Anthropic's `system` parameter (with cache_control on static blocks).
 *
 * `buildSystemPromptString(state)` returns a single string for environments
 * (or tests) that don't want the structured form.
 */

const PERSONA = `You are the senior Certified Financial Planner (CFP) for Chad and Sarah's household. You have served them for years. You know their full situation, their values, and how they make decisions together.

You are explanatory, not prescriptive. You surface trade-offs and second-order effects rather than telling them what to do. You are comfortable saying "I don't know" or "the model can't answer that — let me explain why."

You speak plainly. Sarah is in this conversation too. Frame everything in dollars, dates, and trade-offs. Avoid jargon — when you must use a term of art, define it inline the first time.

When the user asks "should I", explain the relevant trade-offs using actual numbers from your tools, present the options, and let them choose. You are not a salesperson and not optimistic by default.`;

const TOOL_PHILOSOPHY = `# Tool philosophy

You have tools that wrap a thoroughly tested financial engine. Use them.

**Hard rule: every dollar amount, percentage, and date you state must come from a tool call in the current turn.** If you state "$50K" in your reply, that exact figure must appear in a tool result you executed this turn. Do not estimate. Do not approximate from memory. Do not invent. If you need a number, call a tool.

**Equally important: only describe what's actually in the current plan.** The household snapshot above distinguishes ACTIVE income/expenses (currently flowing in this scenario) from INACTIVE LEVERS (configured but turned off). When the user says "the current plan" or asks "what does my plan look like", they mean the ACTIVE branches. Don't describe Chad's MSFT W-2 details unless \`chadJob\` is on. Don't describe SSDI as a current income unless \`ssType='ssdi'\` and not denied. Inactive levers are options the user could turn on — bring them up only when discussing what to change.

Watch for the **plan-consistency notes** in the household snapshot — they flag combinations that the engine permits but real life does not (e.g., SSDI + a substantial W-2 job). Acknowledge those tensions when relevant; don't paper over them.

Workflow:
  1. **Always call \`getCurrentState\` first** if you don't already have an unambiguous picture of what's active. Cheap, grounds your answer.
  2. **\`runProjection\` second** for any question that touches dollars or timing in the current scenario.
  3. **\`whatIf\` and \`compareScenarios\`** for hypotheticals — never speculate.
  4. **\`causalDelta\`** to explain why two scenarios differ.
  5. **\`topMoves\` and \`moveCascade\`** when the user asks "what should I do".
  6. **\`monteCarloSummary\`** for risk and downside questions.
  7. **\`taxBreakdown\`** for tax-bracket and post-retirement-tax questions.
  8. **\`vestSchedule\`** for RSU grant-by-grant schedules.
  9. **\`getStockCompProjection\`** for steady-state "how much will my W-2 + RSU comp be worth?" questions — returns the SAME numbers as the W-2 Net Diagnostic in the IncomeControls UI, including MSFT-growth-adjusted refresh and hire-stock Y1-Y4. Use when the user asks about take-home, bonus net, refresh grants in steady state, or hire-stock grown to vest year.

When you are uncertain whether a tool can answer, **call it and see** — failing is cheaper than guessing. If a tool returns \`{ok: false, error: ...}\`, read the error, fix your input, and retry, or explain the limitation to the user.

You do not need to narrate every tool call you make — just the conclusions. Brevity over verbosity. The interface will show your tool calls separately.`;

const BOUNDARIES = `# Boundaries

You cannot file taxes, execute trades, move money, or take any action outside this app. You can suggest changes the user can apply with one click in the planner, but you do not change state directly.

If the user asks for legal, tax-filing, or estate-planning advice that requires a licensed professional, recommend they consult one — and explain the relevant trade-offs in financial-planning terms so they walk into that conversation prepared.

Tone: warm, direct, candid. The advisor a friend's parents have had for thirty years. Comfortable saying "that's not knowable from the data we have" or "we'd want a real attorney for that."

Brevity is a virtue. The user can ask follow-ups; you do not need to anticipate every possible question.`;

/**
 * Deterministic compact household summary suitable for the system prompt.
 *
 * Critical: this prompt MUST distinguish what's CURRENTLY ACTIVE in the
 * scenario from levers that exist but are turned off. The advisor needs to
 * answer questions about "the current plan" — i.e., what's actually flowing
 * given the toggle state — without conflating it with available-but-inactive
 * options. Mutual-exclusivity conflicts (e.g., SSDI + W-2 job) are flagged
 * explicitly because the engine doesn't enforce SGA termination.
 */
export function summarizeHousehold(state) {
  const r = (n) => (Number.isFinite(n) ? Math.round(n) : 0);
  const r2 = (n) => (Number.isFinite(n) ? Math.round(n * 100) / 100 : 0);
  const fmt$ = (n) => '$' + r(n).toLocaleString();

  // ─── Branch detection ───────────────────────────────────────────────────
  // Determine which mutually-exclusive scenario branches are ACTIVE.
  const ssType = state.ssType;                     // 'ssdi' | 'ss'
  const ssdiActive = ssType === 'ssdi' && !state.ssdiDenied;
  const ssRetirementActive = ssType === 'ss';
  const chadJobActive = !!state.chadJob;
  const sarahWorking = (state.sarahWorkMonths || 0) > 0;
  const has401k = chadJobActive && !!state.chadJob401kEnabled;
  const hasL64 = chadJobActive && !!state.chadL64Enabled;
  const hasL65 = chadJobActive && !!state.chadL65Enabled;
  const consultingActive = (state.chadConsulting || 0) > 0;
  const trustActive = (state.trustIncomeNow || 0) > 0 || (state.trustIncomeFuture || 0) > 0;

  const lines = [];

  // ─── ONE-LINE PLAN SUMMARY ─────────────────────────────────────────────
  const activeIncomes = [];
  if (chadJobActive) activeIncomes.push(`Chad's MSFT W-2 ${state.chadL65Enabled ? '(L63→L64→L65)' : state.chadL64Enabled ? '(L63→L64)' : '(L63)'}`);
  if (sarahWorking) activeIncomes.push(`Sarah's practice`);
  if (ssdiActive) activeIncomes.push(`Chad SSDI (approves m${state.ssdiApprovalMonth})`);
  if (ssRetirementActive) activeIncomes.push(`Chad SS retirement (claim age ${state.ssClaimAge})`);
  if (consultingActive) activeIncomes.push(`consulting`);
  if (trustActive) activeIncomes.push(`trust`);
  lines.push(`# CURRENT PLAN — what's actually flowing in this scenario`);
  lines.push('');
  lines.push(`Active income sources: ${activeIncomes.length > 0 ? activeIncomes.join(', ') : '(none)'}.`);
  lines.push(`Chad retires at month ${state.chadRetirementMonth ?? state.chadWorkMonths ?? 72}. Sarah works ${state.sarahWorkMonths ?? 72} months.`);
  lines.push('');

  // ─── ACTIVE INCOME — only sources that actually flow ────────────────────
  lines.push('## Active income (currently flowing)');

  if (sarahWorking) {
    lines.push(`- **Sarah's practice (ACTIVE)**: $${r(state.sarahRate)}/hr × ${state.sarahCurrentClients} clients/day, tax ${r(state.sarahTaxRate)}%, growth ${r2(state.sarahRateGrowth)}%/yr rate / ${r2(state.sarahClientGrowth)}%/yr clients. Caps: $${r(state.sarahMaxRate)}/hr, ${state.sarahMaxClients} clients/day. Runs ${state.sarahWorkMonths} months.`);
  }

  if (chadJobActive) {
    const lvlSummary = [];
    lvlSummary.push(`L63 base $${r(state.chadJobSalary).toLocaleString()}/yr from m${state.chadJobStartMonth}`);
    if (hasL64) lvlSummary.push(`→ L64 at m${state.chadL64Month} ($${r(state.chadL64Salary).toLocaleString()})`);
    if (hasL65) lvlSummary.push(`→ L65 at m${state.chadL65Month} ($${r(state.chadL65Salary).toLocaleString()})`);
    lines.push(`- **Chad's MSFT W-2 (ACTIVE)**: ${lvlSummary.join(' ')}.`);
    lines.push(`  - Bonus ${r2(state.chadJobBonusPct)}%${hasL64 ? `/${r2(state.chadL64BonusPct)}%(L64)` : ''}${hasL65 ? `/${r2(state.chadL65BonusPct)}%(L65)` : ''}, raise ${r2(state.chadJobRaisePct)}%/yr, tax ${r(state.chadJobTaxRate)}% (incl. FICA${state.chadJobNoFICA ? '; noFICA TOGGLE ON' : ''}).`);
    if ((state.chadJobStockRefresh || 0) > 0) {
      lines.push(`  - Annual refresh $${r(state.chadJobStockRefresh).toLocaleString()}${hasL64 ? `/$${r(state.chadL64StockRefresh).toLocaleString()}(L64)` : ''}${hasL65 ? `/$${r(state.chadL65StockRefresh).toLocaleString()}(L65)` : ''}, first refresh ${state.chadJobRefreshStartMonth}mo after hire (snaps to next August).`);
      lines.push(`  - Age-65 RSU vest continuation: ${state.chadAge65VestOverride || 'auto'}.`);
    }
    const hire = [state.chadJobHireStockY1, state.chadJobHireStockY2, state.chadJobHireStockY3, state.chadJobHireStockY4].map((v) => r(v || 0));
    if (hire.some((v) => v > 0)) lines.push(`  - Hire stock Y1-Y4: $${hire.map((v) => v.toLocaleString()).join(' / ')} (vest on anniversaries).`);
    if ((state.chadJobSignOnCash || 0) > 0) lines.push(`  - Sign-on $${r(state.chadJobSignOnCash).toLocaleString()} (50% on hire, 50% at 1yr).`);
    if (has401k) {
      lines.push(`  - 401(k) ACTIVE: pre-tax $${r(state.chadJob401kDeferral).toLocaleString()}/yr, Roth catchup $${r(state.chadJob401kCatchupRoth).toLocaleString()}, match $${r(state.chadJob401kMatch).toLocaleString()}/yr.`);
    }
    lines.push(`  - MSFT price ref $${r2(state.msftPrice)}, growth ${r2(state.msftGrowth)}%/yr (vest values scale issue→vest).`);
  }

  if (consultingActive) {
    lines.push(`- **Chad's consulting (ACTIVE)**: $${r(state.chadConsulting)}/mo.`);
  }

  if (ssdiActive) {
    lines.push(`- **SSDI — Chad's disability benefit (ACTIVE BRANCH)**: personal $${r(state.ssdiPersonal)}/mo + family-max $${r(state.ssdiFamilyTotal)}/mo, approves at month ${state.ssdiApprovalMonth}. Auxiliary benefits drop when twins age out (m${state.kidsAgeOutMonths}).`);
  } else if (ssRetirementActive) {
    lines.push(`- **SS retirement (ACTIVE BRANCH)**: claim age ${state.ssClaimAge}, PIA $${r(state.ssPIA)}, personal $${r(state.ssPersonal)}/mo from month ${state.ssStartMonth}.`);
  }

  if (state.sarahSpousalEnabled !== false && (ssRetirementActive || ssdiActive)) {
    lines.push(`- **Sarah's spousal benefit (ACTIVE)**: claim age ${state.sarahSpousalClaimAge} (gates on Chad having claimed).`);
  }

  if (trustActive) {
    lines.push(`- **Trust income (ACTIVE)**: $${r(state.trustIncomeNow)}/mo now${(state.trustIncomeFuture || 0) > (state.trustIncomeNow || 0) ? `, rises to $${r(state.trustIncomeFuture)}/mo at m${state.trustIncreaseMonth}` : ''}.`);
  }

  lines.push('');

  // ─── EXPENSES — what's actually being spent ─────────────────────────────
  lines.push('## Active expenses (currently flowing)');
  if (state.totalMonthlySpend != null) {
    lines.push(`- Total monthly spend OVERRIDE: $${r(state.totalMonthlySpend).toLocaleString()}/mo (engine back-calculates baseExpenses from this).`);
  } else {
    lines.push(`- Base monthly expenses: $${r(state.baseExpenses).toLocaleString()}/mo + debtService + van + BCS${state.expenseInflation ? `, inflated ${r2(state.expenseInflationRate)}%/yr` : ' (no inflation)'}.`);
  }
  if ((state.bcsYearsLeft || 0) > 0) {
    const familyMonthly = Math.round(((state.bcsAnnualTotal || 0) - (state.bcsParentsAnnual || 0)) / 12);
    lines.push(`- BCS tuition (ACTIVE): family share $${familyMonthly.toLocaleString()}/mo for ${state.bcsYearsLeft} more years (parents/aid covers $${r(state.bcsParentsAnnual).toLocaleString()}/yr of $${r(state.bcsAnnualTotal).toLocaleString()}/yr total).`);
  }
  if (!state.vanSold) {
    lines.push(`- Van (NOT SOLD): $${r(state.vanMonthlySavings)}/mo carry, $${r(state.vanLoanBalance).toLocaleString()} loan balance, ~$${r(state.vanSalePrice).toLocaleString()} sale price if sold.`);
  } else {
    lines.push(`- Van SOLD at m${state.vanSaleMonth} (frees $${r(state.vanMonthlySavings)}/mo from then on).`);
  }
  if (state.lifestyleCutsApplied) {
    const cutsTotal = state.cutsOverride != null ? state.cutsOverride : 0;
    lines.push(`- Lifestyle cuts APPLIED: ~$${r(cutsTotal)}/mo reduction.`);
  }
  if ((state.oneTimeExtras || 0) > 0 && (state.oneTimeMonths || 0) > 0) {
    lines.push(`- One-time extras: $${r(state.oneTimeExtras)}/mo for ${state.oneTimeMonths} months.`);
  }
  // Capital projects
  const capItems = Array.isArray(state.capitalItems) ? state.capitalItems : [];
  const includedCap = capItems.filter((c) => c.include);
  if (includedCap.length > 0) {
    const total = includedCap.reduce((s, c) => s + (c.cost || 0), 0);
    lines.push(`- Capital projects INCLUDED: ${includedCap.map((c) => `${c.name} $${r(c.cost).toLocaleString()}`).join(', ')} — total $${r(total).toLocaleString()}.`);
  }
  lines.push('');

  // ─── ASSETS & DEBTS ─────────────────────────────────────────────────────
  lines.push('## Assets & liabilities');
  lines.push(`- Savings: ${fmt$(state.startingSavings)} (assumed return ${r2(state.investmentReturn)}%/yr)`);
  lines.push(`- 401(k): ${fmt$(state.starting401k)} (assumed return ${r2(state.return401k)}%/yr)`);
  lines.push(`- Home equity: ${fmt$(state.homeEquity)} (appreciation ${r2(state.homeAppreciation)}%/yr)`);
  const debtTotal = r((state.debtCC || 0) + (state.debtPersonal || 0) + (state.debtIRS || 0) + (state.debtFirstmark || 0));
  lines.push(`- Debts (total ${fmt$(debtTotal)}): CC ${fmt$(state.debtCC)}, Personal ${fmt$(state.debtPersonal)}, IRS ${fmt$(state.debtIRS)}, Firstmark ${fmt$(state.debtFirstmark)}.`);
  lines.push(`- retireDebt toggle: ${state.retireDebt ? 'ON (debt-payoff scenario active)' : `OFF (paying as-is, debtService ${fmt$(state.debtService)}/mo)`}.`);
  lines.push('');

  // ─── PEOPLE ─────────────────────────────────────────────────────────────
  lines.push('## People & timeline');
  lines.push(`- Chad — age ${state.chadCurrentAge ?? '?'}, retires at month ${state.chadRetirementMonth ?? state.chadWorkMonths ?? 72} (works ${state.chadWorkMonths} more months).`);
  lines.push(`- Sarah — age ${state.sarahCurrentAge ?? '?'}, runs counseling practice for ${state.sarahWorkMonths} months.`);
  if (Number.isFinite(state.kidsAgeOutMonths) && state.kidsAgeOutMonths > 0) {
    lines.push(`- Twins age out in ${state.kidsAgeOutMonths} months.`);
  }
  lines.push('');

  // ─── INACTIVE LEVERS — explicit list of what's NOT flowing ──────────────
  const inactive = [];
  if (!chadJobActive) inactive.push(`Chad's MSFT W-2 (chadJob=false)`);
  if (chadJobActive && !state.chadL64Enabled) inactive.push(`L64 promotion (toggle off; would fire at m${state.chadL64Month} → ${fmt$(state.chadL64Salary)})`);
  if (chadJobActive && !state.chadL65Enabled) inactive.push(`L65 promotion (toggle off; would fire at m${state.chadL65Month} → ${fmt$(state.chadL65Salary)})`);
  if (chadJobActive && !state.chadJob401kEnabled) inactive.push(`401(k) (toggle off; would defer up to ${fmt$(state.chadJob401kDeferral)}/yr with ${fmt$(state.chadJob401kMatch)}/yr match)`);
  if (ssType === 'ssdi' && state.ssdiDenied) inactive.push(`SSDI (DENIED — no benefit will flow)`);
  if (!state.lifestyleCutsApplied) inactive.push(`Lifestyle cuts (toggle off)`);
  if (!state.vanSold) inactive.push(`Van sale (toggle off; could free $${r(state.vanMonthlySavings)}/mo at m${state.vanSaleMonth})`);
  if (!state.retireDebt) inactive.push(`Debt payoff scenario (toggle off; current debtService ${fmt$(state.debtService)}/mo continues)`);
  if (state.chadAge65VestOverride === 'off') inactive.push(`Age-65 RSU vest continuation (forced OFF)`);
  if (inactive.length > 0) {
    lines.push('## Inactive levers (configured but NOT contributing in this scenario)');
    for (const item of inactive) lines.push(`- ${item}`);
    lines.push('');
  }

  // ─── EXCLUSIVITY / CONSISTENCY WARNINGS ─────────────────────────────────
  const warnings = [];
  // SSDI requires inability to engage in Substantial Gainful Activity (SGA = ~$1,620/mo in 2025).
  // A $100K+ W-2 job would terminate SSDI in the real world; the engine does NOT enforce this.
  if (ssdiActive && chadJobActive && (state.chadJobSalary || 0) > 24000) {
    warnings.push(`**Real-world conflict**: SSDI and Chad's W-2 are BOTH active in this scenario. SSDI requires the recipient stay below the SGA earnings cap (~$1,620/mo in 2025). A $${r(state.chadJobSalary).toLocaleString()}/yr salary would terminate SSDI. The engine does not enforce SGA — both incomes flow in the projection. When discussing this scenario, treat it as "Chad takes the MSFT job (SSDI ends)" or "Chad stays on SSDI (no W-2)" — they are mutually exclusive in real life.`);
  }
  // SSDI + SS retirement can't both be selected, but ssType='ssdi' with chadJob and an age 67+ scenario implies a future transition — flag it.
  if (ssdiActive && state.chadCurrentAge && (state.chadCurrentAge + (state.chadWorkMonths || 0) / 12) >= 67) {
    warnings.push(`**Note**: Chad will pass FRA (67) during this projection. SSDI typically auto-converts to SS retirement at FRA — the engine does NOT model this transition. Model the post-67 period as SS retirement explicitly if precision matters.`);
  }
  // Sarah spousal requires Chad to have claimed; if ssType not selected, spousal won't fire.
  if (state.sarahSpousalEnabled !== false && !ssdiActive && !ssRetirementActive) {
    warnings.push(`**Note**: Sarah's spousal benefit is enabled, but neither SSDI nor SS retirement is active for Chad. Spousal benefits gate on Chad having claimed — they will NOT flow without an active SS branch.`);
  }
  if (warnings.length > 0) {
    lines.push('## ⚠ Plan-consistency notes (read these before answering)');
    for (const w of warnings) lines.push(`- ${w}`);
    lines.push('');
  }

  // ─── GOALS ──────────────────────────────────────────────────────────────
  const goals = Array.isArray(state.goals) ? state.goals : [];
  if (goals.length > 0) {
    lines.push(`## Active goals (${goals.length})`);
    for (const g of goals) {
      lines.push(`- ${g.name} (${g.type}): target ${fmt$(g.targetAmount)} by month ${g.targetMonth}.`);
    }
  }

  return lines.join('\n');
}

/**
 * Build the system prompt as an array of structured blocks for the
 * Anthropic API. Static blocks (persona, tool-philosophy, boundaries) are
 * marked with `cache_control` so they can be cached server-side. The
 * household block is uncached because it changes every state mutation.
 *
 * @param {object} state - gathered state
 * @returns {Array<{type:'text', text:string, cache_control?:object}>}
 */
export function buildSystemPrompt(state) {
  return [
    { type: 'text', text: PERSONA, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: summarizeHousehold(state) }, // uncached — varies per turn
    { type: 'text', text: TOOL_PHILOSOPHY, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: BOUNDARIES, cache_control: { type: 'ephemeral' } },
  ];
}

/**
 * Plain-string variant for tests / logging.
 */
export function buildSystemPromptString(state) {
  return [PERSONA, summarizeHousehold(state), TOOL_PHILOSOPHY, BOUNDARIES].join('\n\n---\n\n');
}
