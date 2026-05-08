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

Prefer:
  - \`runProjection\` and \`getCurrentState\` to ground yourself before answering
  - \`whatIf\` and \`compareScenarios\` over speculation
  - \`causalDelta\` to explain why two scenarios differ
  - \`topMoves\` and \`moveCascade\` when the user asks "what should I do"
  - \`monteCarloSummary\` for risk and downside questions
  - \`taxBreakdown\` for tax-bracket and post-retirement-tax questions
  - \`vestSchedule\` for RSU-specific questions

When you are uncertain whether a tool can answer, **call it and see** — failing is cheaper than guessing. If a tool returns \`{ok: false, error: ...}\`, read the error, fix your input, and retry, or explain the limitation to the user.

You do not need to narrate every tool call you make — just the conclusions. Brevity over verbosity. The interface will show your tool calls separately.`;

const BOUNDARIES = `# Boundaries

You cannot file taxes, execute trades, move money, or take any action outside this app. You can suggest changes the user can apply with one click in the planner, but you do not change state directly.

If the user asks for legal, tax-filing, or estate-planning advice that requires a licensed professional, recommend they consult one — and explain the relevant trade-offs in financial-planning terms so they walk into that conversation prepared.

Tone: warm, direct, candid. The advisor a friend's parents have had for thirty years. Comfortable saying "that's not knowable from the data we have" or "we'd want a real attorney for that."

Brevity is a virtue. The user can ask follow-ups; you do not need to anticipate every possible question.`;

/**
 * Deterministic compact household summary suitable for the system prompt.
 * Pulled from the gathered state. Numbers rounded; nullable fields handled.
 */
export function summarizeHousehold(state) {
  const r = (n) => (Number.isFinite(n) ? Math.round(n) : 0);
  const r2 = (n) => (Number.isFinite(n) ? Math.round(n * 100) / 100 : 0);

  const lines = [];
  lines.push('# Household snapshot (current plan state)');
  lines.push('');

  // People
  lines.push(`Chad — age ${state.chadCurrentAge ?? 'unknown'}, planning to work ${state.chadWorkMonths ?? 72} more months (retirement at month ${state.chadRetirementMonth ?? state.chadWorkMonths ?? 72}).`);
  lines.push(`Sarah — age ${state.sarahCurrentAge ?? 'unknown'}, runs counseling practice; planning to work ${state.sarahWorkMonths ?? 72} more months.`);
  if (Number.isFinite(state.kidsAgeOutMonths) && state.kidsAgeOutMonths > 0) {
    lines.push(`Twins age out in ${state.kidsAgeOutMonths} months.`);
  }
  lines.push('');

  // Assets / liabilities
  lines.push(`Starting savings: $${r(state.startingSavings).toLocaleString()}`);
  lines.push(`401(k) balance: $${r(state.starting401k).toLocaleString()} (assumed return ${r2(state.return401k)}%/yr)`);
  lines.push(`Home equity: $${r(state.homeEquity).toLocaleString()} (appreciation ${r2(state.homeAppreciation)}%/yr)`);
  lines.push(`Investment return assumed: ${r2(state.investmentReturn)}%/yr`);
  lines.push('');
  const debtTotal = r((state.debtCC || 0) + (state.debtPersonal || 0) + (state.debtIRS || 0) + (state.debtFirstmark || 0));
  lines.push(`Debts (total $${debtTotal.toLocaleString()}): CC $${r(state.debtCC).toLocaleString()}, Personal $${r(state.debtPersonal).toLocaleString()}, IRS $${r(state.debtIRS).toLocaleString()}, Firstmark $${r(state.debtFirstmark).toLocaleString()}.`);
  lines.push(`retireDebt toggle: ${state.retireDebt ? 'ON (debt payoff scenario)' : 'OFF (paying as-is, debtService $' + r(state.debtService) + '/mo)'}`);
  lines.push('');

  // Income — Sarah's practice
  lines.push(`Sarah's practice: rate $${r(state.sarahRate)}/hr (max $${r(state.sarahMaxRate)}), ${state.sarahCurrentClients} clients/day (max ${state.sarahMaxClients}), tax rate ${r(state.sarahTaxRate)}%, growth ${r2(state.sarahRateGrowth)}%/yr rate / ${r2(state.sarahClientGrowth)}%/yr clients.`);
  lines.push('');

  // Income — Chad's MSFT job (if active)
  if (state.chadJob) {
    lines.push(`Chad's MSFT W-2 job: ENABLED. Salary $${r(state.chadJobSalary).toLocaleString()}/yr, starts month ${state.chadJobStartMonth}, tax rate ${r(state.chadJobTaxRate)}% (incl. FICA), bonus ${r2(state.chadJobBonusPct)}%, raise ${r2(state.chadJobRaisePct)}%/yr.`);
    lines.push(`  Annual stock refresh: $${r(state.chadJobStockRefresh).toLocaleString()} (first refresh ${state.chadJobRefreshStartMonth} mo after hire — engine snaps to next August).`);
    const hire = [state.chadJobHireStockY1, state.chadJobHireStockY2, state.chadJobHireStockY3, state.chadJobHireStockY4].map((v) => r(v || 0));
    if (hire.some((v) => v > 0)) {
      lines.push(`  Hire stock (anniversaries Y1-Y4): $${hire.map((v) => v.toLocaleString()).join(' / ')}`);
    }
    if ((state.chadJobSignOnCash || 0) > 0) lines.push(`  Sign-on cash: $${r(state.chadJobSignOnCash).toLocaleString()} (50% on hire, 50% at 1yr).`);
    if (state.chadJobNoFICA) lines.push('  noFICA toggle: ON (state employer or similar non-SS-covered).');
    if (state.chadL64Enabled) lines.push(`  L64 promotion: ENABLED at month ${state.chadL64Month} → salary $${r(state.chadL64Salary).toLocaleString()}, refresh $${r(state.chadL64StockRefresh).toLocaleString()}, bonus ${r2(state.chadL64BonusPct)}%.`);
    if (state.chadL65Enabled) lines.push(`  L65 promotion: ENABLED at month ${state.chadL65Month} → salary $${r(state.chadL65Salary).toLocaleString()}, refresh $${r(state.chadL65StockRefresh).toLocaleString()}, bonus ${r2(state.chadL65BonusPct)}%.`);
    lines.push(`  Age-65 RSU vest continuation: ${state.chadAge65VestOverride || 'auto'} (refresh grants keep vesting post-retirement when eligible).`);
    if (state.chadJob401kEnabled) {
      lines.push(`  401(k): ENABLED — pre-tax deferral $${r(state.chadJob401kDeferral).toLocaleString()}, Roth super-catchup $${r(state.chadJob401kCatchupRoth).toLocaleString()}, employer match $${r(state.chadJob401kMatch).toLocaleString()}.`);
    } else {
      lines.push('  401(k): disabled.');
    }
    lines.push(`  MSFT price reference: $${r2(state.msftPrice)}; assumed growth ${r2(state.msftGrowth)}%/yr (vest values scale with growth from issue → vest).`);
  } else {
    lines.push(`Chad's MSFT W-2 job: NOT ENABLED in current scenario.`);
  }
  if ((state.chadConsulting || 0) > 0) lines.push(`Chad's consulting: $${r(state.chadConsulting)}/mo.`);
  lines.push('');

  // Trust + van
  if ((state.trustIncomeNow || 0) > 0 || (state.trustIncomeFuture || 0) > 0) {
    lines.push(`Trust income: $${r(state.trustIncomeNow)}/mo now, increases to $${r(state.trustIncomeFuture)}/mo at month ${state.trustIncreaseMonth}.`);
  }
  if (state.vanSold) {
    lines.push(`Van: SOLD at month ${state.vanSaleMonth} (frees $${r(state.vanMonthlySavings)}/mo).`);
  } else {
    lines.push(`Van: not sold; current monthly carry $${r(state.vanMonthlySavings)} (loan balance $${r(state.vanLoanBalance).toLocaleString()}, sale price ~$${r(state.vanSalePrice).toLocaleString()}).`);
  }
  lines.push('');

  // Social Security
  if (state.ssType === 'ssdi') {
    lines.push(`Social Security plan: SSDI (Chad's disability benefit). Personal $${r(state.ssdiPersonal)}/mo, family-max $${r(state.ssdiFamilyTotal)}/mo. Approval expected month ${state.ssdiApprovalMonth}${state.ssdiDenied ? ' — currently DENIED in scenario' : ''}.`);
  } else if (state.ssType === 'ss') {
    lines.push(`Social Security plan: SS retirement at age ${state.ssClaimAge} (PIA $${r(state.ssPIA)}). Personal benefit $${r(state.ssPersonal)}/mo starting month ${state.ssStartMonth}.`);
  }
  if (state.sarahSpousalEnabled !== false) {
    lines.push(`Sarah's spousal benefit: ENABLED, claim age ${state.sarahSpousalClaimAge}.`);
  }
  lines.push('');

  // Expenses
  if (state.totalMonthlySpend != null) {
    lines.push(`Total monthly spend (override): $${r(state.totalMonthlySpend).toLocaleString()}/mo (back-calculates baseExpenses).`);
  } else {
    lines.push(`Base monthly expenses: $${r(state.baseExpenses).toLocaleString()} + debtService + van + BCS, with ${state.expenseInflation ? r2(state.expenseInflationRate) + '%/yr inflation' : 'NO inflation'}.`);
  }
  lines.push(`BCS tuition: $${r(state.bcsAnnualTotal).toLocaleString()}/yr total, $${r(state.bcsParentsAnnual).toLocaleString()}/yr from grandparents/aid; ${state.bcsYearsLeft} years remaining.`);
  if (state.lifestyleCutsApplied) {
    const cutsTotal = state.cutsOverride != null ? state.cutsOverride : 0;
    lines.push(`Lifestyle cuts applied (~$${r(cutsTotal)}/mo).`);
  }
  if ((state.oneTimeExtras || 0) > 0 && (state.oneTimeMonths || 0) > 0) {
    lines.push(`One-time extras: $${r(state.oneTimeExtras)}/mo for ${state.oneTimeMonths} months.`);
  }
  lines.push('');

  // Capital projects
  const capItems = Array.isArray(state.capitalItems) ? state.capitalItems : [];
  const includedCap = capItems.filter((c) => c.include);
  if (includedCap.length > 0) {
    const total = includedCap.reduce((s, c) => s + (c.cost || 0), 0);
    lines.push(`Capital projects (included): ${includedCap.map((c) => `${c.name} $${r(c.cost).toLocaleString()}`).join(', ')} — total $${r(total).toLocaleString()}.`);
  }

  // Goals
  const goals = Array.isArray(state.goals) ? state.goals : [];
  if (goals.length > 0) {
    lines.push('');
    lines.push(`Active goals (${goals.length}):`);
    for (const g of goals) {
      lines.push(`  - ${g.name} (${g.type}): target $${r(g.targetAmount).toLocaleString()} by month ${g.targetMonth}.`);
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
