function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * Ending resources are the model's terminal available capital, not just cash.
 * The monthly simulation can preserve cash at $0 by drawing from 401k/home
 * equity, so recommendation scoring must include those balances or useful
 * moves can look like zero-impact moves and disappear from the UI.
 */
export function getEndingResourceValue(monthlyData) {
  if (!Array.isArray(monthlyData) || monthlyData.length === 0) return 0;
  const row = monthlyData[monthlyData.length - 1] || {};
  return Math.round(
    finiteNumber(row.balance) +
    finiteNumber(row.balance401k) +
    finiteNumber(row.homeEquity)
  );
}
