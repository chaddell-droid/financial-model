/**
 * Goal evaluation engine — pure functions, no React dependency.
 * Evaluates user-defined financial goals against projection data.
 */

/**
 * Evaluate a single goal against monthly projection data.
 * @param {Object} goal - { id, name, type, targetAmount, targetMonth, color }
 * @param {Array} monthlyData - Array of monthly projection rows with { month, balance, netMonthly, netCashFlow }
 * @param {Object} options - { wealthData, retireDebt }
 * @returns {{ achieved, currentValue, progress, description, name, type, targetAmount, targetMonth }}
 */
export function evaluateGoal(goal, monthlyData, options = {}) {
  const { type, targetAmount = 0, targetMonth = 72 } = goal;
  const { wealthData, retireDebt } = options;
  const clampedMonth = Math.min(targetMonth, monthlyData.length - 1);

  let achieved = false;
  let currentValue = 0;
  let progress = 0;
  let description = '';

  switch (type) {
    case 'savings_floor': {
      // Balance >= target for all months 0..targetMonth
      const sliceEnd = Math.min(clampedMonth + 1, monthlyData.length);
      const minBalance = Math.min(...monthlyData.slice(0, sliceEnd).map(d => d.balance));
      currentValue = minBalance;
      achieved = minBalance >= targetAmount;
      if (targetAmount === 0) {
        progress = minBalance >= 0 ? 1 : 0;
      } else {
        progress = Math.max(0, Math.min(1, minBalance / targetAmount));
      }
      description = achieved
        ? `Min balance ${fmt(minBalance)} stays above ${fmt(targetAmount)}`
        : `Min balance ${fmt(minBalance)} dips below ${fmt(targetAmount)}`;
      break;
    }
    case 'savings_target': {
      // Balance at targetMonth >= targetAmount
      const balance = monthlyData[clampedMonth]?.balance || 0;
      currentValue = balance;
      achieved = balance >= targetAmount;
      progress = targetAmount > 0 ? Math.max(0, Math.min(1, balance / targetAmount)) : (balance >= 0 ? 1 : 0);
      description = achieved
        ? `Balance ${fmt(balance)} meets ${fmt(targetAmount)} target at month ${targetMonth}`
        : `Balance ${fmt(balance)} short of ${fmt(targetAmount)} at month ${targetMonth}`;
      break;
    }
    case 'income_target': {
      // Net cash flow at targetMonth >= targetAmount
      const row = monthlyData[clampedMonth];
      const netFlow = row?.netCashFlow || 0;
      currentValue = netFlow;
      if (targetAmount === 0) {
        achieved = netFlow >= 0;
        progress = achieved ? 1 : 0;
        description = achieved ? `Cash flow positive (${fmt(netFlow)}/mo)` : `Cash flow negative (${fmt(netFlow)}/mo)`;
      } else {
        achieved = netFlow >= targetAmount;
        progress = Math.max(0, Math.min(1, netFlow / targetAmount));
        description = achieved
          ? `Net income ${fmt(netFlow)} meets ${fmt(targetAmount)} target`
          : `Net income ${fmt(netFlow)} short of ${fmt(targetAmount)}`;
      }
      break;
    }
    case 'net_worth_target': {
      // Savings + 401k + home at targetMonth >= targetAmount
      const balance = monthlyData[clampedMonth]?.balance || 0;
      const w = wealthData?.[clampedMonth];
      const netWorth = balance + (w?.balance401k || 0) + (w?.homeEquity || 0);
      currentValue = netWorth;
      achieved = netWorth >= targetAmount;
      progress = targetAmount > 0 ? Math.max(0, Math.min(1, netWorth / targetAmount)) : 1;
      description = achieved
        ? `Net worth ${fmt(netWorth)} meets ${fmt(targetAmount)} target`
        : `Net worth ${fmt(netWorth)} short of ${fmt(targetAmount)}`;
      break;
    }
    case 'debt_free': {
      // retireDebt === true (current model limitation)
      achieved = !!retireDebt;
      currentValue = retireDebt ? 1 : 0;
      progress = retireDebt ? 1 : 0;
      description = retireDebt ? 'All debt retired' : 'Debt not yet retired';
      break;
    }
    default:
      description = `Unknown goal type: ${type}`;
  }

  return {
    ...goal,
    achieved,
    currentValue,
    progress,
    description,
  };
}

/**
 * Fast boolean-only evaluation for Monte Carlo inner loop.
 */
export function evaluateGoalPass(goal, monthlyData, options = {}) {
  const { type, targetAmount = 0, targetMonth = 72 } = goal;
  const { wealthData, retireDebt } = options;
  const clampedMonth = Math.min(targetMonth, monthlyData.length - 1);

  switch (type) {
    case 'savings_floor': {
      const sliceEnd = Math.min(clampedMonth + 1, monthlyData.length);
      for (let i = 0; i < sliceEnd; i++) {
        if (monthlyData[i].balance < targetAmount) return false;
      }
      return true;
    }
    case 'savings_target':
      return (monthlyData[clampedMonth]?.balance || 0) >= targetAmount;
    case 'income_target':
      return (monthlyData[clampedMonth]?.netCashFlow || 0) >= targetAmount;
    case 'net_worth_target': {
      const balance = monthlyData[clampedMonth]?.balance || 0;
      const w = wealthData?.[clampedMonth];
      return balance + (w?.balance401k || 0) + (w?.homeEquity || 0) >= targetAmount;
    }
    case 'debt_free':
      return !!retireDebt;
    default:
      return false;
  }
}

/**
 * Evaluate all goals.
 */
export function evaluateAllGoals(goals, monthlyData, options = {}) {
  return goals.map(g => evaluateGoal(g, monthlyData, options));
}

function fmt(n) {
  return '$' + Math.round(n).toLocaleString();
}
