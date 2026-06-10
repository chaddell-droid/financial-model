import { computeProjection } from './projection.js';

/**
 * Get the current model month based on today's date.
 * Month 0 = March 2026. Clamps to 0..maxMonth.
 *
 * Remediation 2026-06-09 phase 5: `maxMonth` replaces the hardcoded 72-month
 * clamp — callers pass the projection's actual horizon (up to ~204 months for
 * long vest-tail projections). Default stays 72 for legacy callers.
 */
export function getCurrentModelMonth(today = new Date(), maxMonth = 72) {
  const baseYear = 2026;
  const baseMonth = 2; // March (0-indexed)
  const monthsSinceBase = (today.getFullYear() - baseYear) * 12 + (today.getMonth() - baseMonth);
  return Math.max(0, Math.min(maxMonth, monthsSinceBase));
}

/**
 * Get the month label for display (e.g., "March 2026", "April 2026").
 */
export function getMonthLabel(modelMonth) {
  const baseYear = 2026;
  const baseMonthIndex = 2; // March
  const totalMonths = baseMonthIndex + modelMonth;
  const year = baseYear + Math.floor(totalMonths / 12);
  const monthIndex = totalMonths % 12;
  const names = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return `${names[monthIndex]} ${year}`;
}

/**
 * Extract the plan's projected values for a specific month from monthlyDetail.
 * Returns the same shape as check-in actuals for easy comparison.
 */
export function getPlanSnapshot(monthlyDetail, month) {
  const row = monthlyDetail[month];
  if (!row) return null;
  return {
    sarahIncome: row.sarahIncome,
    msftVesting: row.msftLump,
    trustIncome: row.trustLLC,
    ssdiIncome: row.ssBenefit,
    chadJobIncome: row.chadJobIncome,
    consultingIncome: row.consulting,
    totalIncome: row.cashIncome,
    expenses: row.expenses,
    balance: row.balance,
    balance401k: row.balance401k,
  };
}

/**
 * Compute drift between actuals and plan for a single check-in.
 * Returns an object with { field: { planned, actual, delta, pctDelta, status } }
 * status: 'ahead' (better than plan), 'on-track' (within 10%), 'behind' (worse than plan)
 */
export function computeMonthlyDrift(actuals, planSnapshot) {
  if (!actuals || !planSnapshot) return null;

  const fields = [
    { key: 'sarahIncome', label: "Sarah's business", higherIsBetter: true },
    { key: 'msftVesting', label: 'MSFT vesting', higherIsBetter: true },
    { key: 'trustIncome', label: 'Trust/LLC', higherIsBetter: true },
    { key: 'ssdiIncome', label: 'SSDI/SS', higherIsBetter: true },
    { key: 'chadJobIncome', label: 'Chad job', higherIsBetter: true },
    { key: 'consultingIncome', label: 'Consulting', higherIsBetter: true },
    { key: 'totalIncome', label: 'Total income', higherIsBetter: true },
    { key: 'expenses', label: 'Expenses', higherIsBetter: false },
    { key: 'balance', label: 'Savings balance', higherIsBetter: true },
  ];

  const result = {};
  for (const { key, label, higherIsBetter } of fields) {
    const planned = planSnapshot[key] || 0;
    const actual = actuals[key];
    if (actual == null) continue;
    const delta = actual - planned;
    const pctDelta = planned !== 0 ? Math.round((delta / Math.abs(planned)) * 100) : 0;
    const isGood = higherIsBetter ? delta >= 0 : delta <= 0;
    const isClose = Math.abs(pctDelta) <= 10;
    const status = isClose ? 'on-track' : isGood ? 'ahead' : 'behind';
    result[key] = { label, planned, actual, delta, pctDelta, status };
  }
  return result;
}

/**
 * Compute cumulative drift across all completed check-ins.
 */
export function computeCumulativeDrift(checkInHistory) {
  if (!checkInHistory || checkInHistory.length === 0) return null;

  let totalIncomeDelta = 0;
  let totalExpenseDelta = 0;

  for (const checkIn of checkInHistory) {
    const { actuals, planSnapshot } = checkIn;
    if (!actuals || !planSnapshot) continue;
    totalIncomeDelta += (actuals.totalIncome || 0) - (planSnapshot.totalIncome || 0);
    totalExpenseDelta += (actuals.expenses || 0) - (planSnapshot.expenses || 0);
  }

  // Remediation 2026-06-09 phase 5: a latest check-in missing actuals or
  // planSnapshot must not crash. Use the most recent COMPLETE check-in for the
  // balance delta; null when none exists.
  const latest = checkInHistory[checkInHistory.length - 1];
  let balanceDelta = null;
  for (let i = checkInHistory.length - 1; i >= 0; i--) {
    const c = checkInHistory[i];
    const actualBal = c?.actuals?.balance;
    const planBal = c?.planSnapshot?.balance;
    if (Number.isFinite(actualBal) && Number.isFinite(planBal)) {
      balanceDelta = actualBal - planBal;
      break;
    }
  }

  return {
    months: checkInHistory.length,
    totalIncomeDelta,
    totalExpenseDelta,
    balanceDelta,
    latestMonth: latest?.month ?? null,
  };
}

/**
 * Build a re-forecast projection starting from the latest actual balance.
 * Reuses computeProjection() with overridden starting balances.
 * @param {Function} gatherState - function that returns the current model state object
 * @param {Object} latestCheckIn - the most recent check-in record
 * @returns {Object|null} projection result from computeProjection()
 */
export function buildReforecast(gatherState, latestCheckIn) {
  // Remediation 2026-06-09 phase 5: a check-in without a usable balance would
  // seed the projection with undefined startingSavings → NaN balances. Bail out.
  if (!latestCheckIn || !latestCheckIn.actuals || !Number.isFinite(latestCheckIn.actuals.balance)) return null;
  const base = gatherState();
  base.startingSavings = latestCheckIn.actuals.balance;
  if (latestCheckIn.actuals.balance401k != null) {
    base.starting401k = latestCheckIn.actuals.balance401k;
  }
  return computeProjection(base);
}

/**
 * Compute drift between actual core spending (from CSV actuals) and the model's
 * assumed total monthly spend.  Returns an object with comparison details.
 *
 * @param {number} coreTotal - actual core (recurring) spend from CSV
 * @param {number} onetimeTotal - actual one-time spend from CSV (informational)
 * @param {number} modelBaseExpenses - model baseExpenses (or effectiveBaseExpenses)
 * @param {number} modelDebtService - model debtService
 * @param {number} modelVanSavings - model vanMonthlySavings
 * @param {number} modelBcsFamilyMonthly - model bcsFamilyMonthly
 * @returns {{ modelTotal: number, actualCore: number, delta: number, pctDelta: number, status: string }}
 */
export function computeActualsDrift(coreTotal, onetimeTotal, modelBaseExpenses, modelDebtService, modelVanSavings, modelBcsFamilyMonthly) {
  const modelTotal = (modelBaseExpenses || 0) + (modelDebtService || 0) + (modelVanSavings || 0) + (modelBcsFamilyMonthly || 0);
  const actualCore = coreTotal || 0;
  const delta = actualCore - modelTotal;
  const pctDelta = modelTotal !== 0 ? Math.round((delta / Math.abs(modelTotal)) * 100) : 0;
  const isClose = Math.abs(pctDelta) <= 10;
  // For expenses, lower actual is "ahead" (spending less than planned)
  const isGood = delta <= 0;
  const status = isClose ? 'on-track' : isGood ? 'ahead' : 'behind';
  return { modelTotal, actualCore, delta, pctDelta, status };
}

/**
 * Build a shareable status summary from the latest check-in.
 */
export function buildStatusSummary(checkIn, drift, savingsData) {
  if (!checkIn || !drift) return null;

  const balanceDrift = drift.balance;
  const headline = !balanceDrift
    ? 'No balance data'
    : balanceDrift.status === 'ahead'
      ? `On Track (+$${Math.abs(balanceDrift.delta).toLocaleString()} ahead)`
      : balanceDrift.status === 'on-track'
        ? 'On Track (within plan range)'
        : `Behind Plan (-$${Math.abs(balanceDrift.delta).toLocaleString()})`;

  const savingsZeroMonth = savingsData?.find(d => d.balance <= 0);
  const runway = savingsZeroMonth ? `~${savingsZeroMonth.month} months` : '6+ years';

  return {
    monthLabel: getMonthLabel(checkIn.month),
    headline,
    // Crash guards (remediation phase 5): malformed check-ins may lack
    // actuals/planSnapshot — surface null rather than throwing.
    actualBalance: checkIn.actuals?.balance ?? null,
    plannedBalance: checkIn.planSnapshot?.balance ?? null,
    runway,
  };
}
