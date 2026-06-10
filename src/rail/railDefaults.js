/**
 * Default rail chart configuration per tab.
 * Each tab gets its own independent list of chart IDs.
 */
export const DEFAULT_RAIL_CONFIG = {
  overview: ['savings', 'networth', 'retirement'],
  // Plan tab renders its own in-workspace chart stack; rail is hidden via noRailTabs.
  plan: [],
  income: ['savings', 'networth'],
  // Tax tab renders its own full-width chart stack; rail is hidden via noRailTabs.
  tax: [],
  risk: ['savings', 'networth'],
  track: ['savings', 'networth'],
  actuals: [],
  details: [],
};

/** All tab names that support a rail. */
export const RAIL_TABS = Object.keys(DEFAULT_RAIL_CONFIG);
