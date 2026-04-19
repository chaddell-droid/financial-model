/**
 * Default rail chart configuration per tab.
 * Each tab gets its own independent list of chart IDs.
 */
export const DEFAULT_RAIL_CONFIG = {
  overview: ['savings', 'networth', 'retirement'],
  plan: ['savings', 'networth', 'retirement'],
  income: ['savings', 'networth'],
  risk: ['savings', 'networth'],
  track: ['savings', 'networth'],
  actuals: [],
  details: [],
};

/** All tab names that support a rail. */
export const RAIL_TABS = Object.keys(DEFAULT_RAIL_CONFIG);
