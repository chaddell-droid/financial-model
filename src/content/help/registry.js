export const HELP = {
  retirement_mode: {
    title: 'Retirement Mode',
    short: 'Historical Safe uses reserve-floor history. Adaptive PWA uses future-cut confidence.',
    body: [
      'Historical Safe evaluates fixed pool draws across historical cohorts and reports reserve-floor outcomes.',
      'Adaptive PWA recomputes a current-state spending target from the remaining horizon and reports the chance that future cuts will be unnecessary.',
    ],
    footer: 'See docs/adaptive-pwa-guide.md in the repo for the full Adaptive PWA model guide.',
  },
  retirement_overview_historical: {
    title: 'Historical Safe Overview',
    short: 'This mode shows fixed-rate historical outcomes, reserve-floor bands, and survivor spending targets.',
    body: [
      'The headline percentage is about how often historical cohorts finish above the reserve by the end of the horizon.',
      'The green safe rate means the reserve is never touched in 90% of cohorts.',
      'The blue ERN max rate allows brief reserve gaps but still requires 90% of cohorts to finish above the reserve.',
    ],
  },
  retirement_overview_pwa: {
    title: 'Adaptive PWA Overview',
    short: 'This mode builds a current spending-target distribution and shows how the recommendation can adjust over time.',
    body: [
      'The selected number is a total spending target, not just a pool draw.',
      'The histogram shows the current state of historical-cohort spending targets from the remaining horizon.',
      'The annual preview shows one realized cohort path while the full distribution is rebuilt every year from the updated balance.',
    ],
    footer: 'Adaptive PWA v1 uses bequest-target semantics and does not reuse reserve-floor confidence.',
  },
  finish_above_reserve: {
    title: 'Finish Above Reserve',
    short: 'This is the share of historical cohorts that finish at or above the reserve at the end of the horizon.',
    body: [
      'It is looser than reserve-never-touched safety.',
      'A cohort can still count here even if it touched the reserve earlier, as long as it finishes above it at the end.',
    ],
  },
  reserve_never_touched: {
    title: 'Reserve Never Touched',
    short: 'This is the stricter safe-rate definition used in Historical Safe mode.',
    body: [
      'The reserve is treated as touched if the simulated pool reaches the floor at any point in the path.',
      'This is stricter than finish-above-reserve and should not be compared directly to Adaptive PWA confidence.',
    ],
  },
  probability_no_cut: {
    title: "Won't Need To Cut Later",
    short: 'This is the share of current-state historical samples that support the chosen spending target or more.',
    body: [
      'It is a future-cut confidence measure, not a reserve survival measure.',
      'Higher values mean fewer historical samples would force a later reduction in the chosen target while still meeting the bequest target.',
    ],
  },
  bequest_target: {
    title: 'Bequest Target',
    short: 'This is the ending pool target Adaptive PWA tries to preserve by the end of the planning horizon.',
    body: [
      'Raising the bequest target lowers the current recommended spending target.',
      'In Adaptive PWA v1, this replaces reserve-floor semantics as the terminal objective.',
    ],
  },
  pwa_strategy: {
    title: 'PWA Strategy',
    short: 'The strategy decides how aggressively the current spending target can move when the distribution changes next year.',
    body: [
      'Fixed Percentile always chooses the configured percentile.',
      'Sticky Median keeps the old target if it stays inside the tolerance band; otherwise it recenters to the median.',
      'Sticky Quartile Nudge keeps the old target if it stays inside the band; otherwise it moves only to the nearest band edge.',
    ],
  },
  pwa_target_percentile: {
    title: 'Target Percentile',
    short: 'This selects which point in the current PWA spending-target distribution becomes the recommendation.',
    body: [
      'Higher percentiles choose a more aggressive current spending target.',
      'Lower percentiles choose a more conservative target that fewer historical samples would force downward later.',
    ],
  },
  pwa_tolerance_band: {
    title: 'Tolerance Band',
    short: 'This band defines how far the distribution can move before a sticky strategy adjusts the spending target.',
    body: [
      'A wider band keeps the old target longer and reduces adjustment frequency.',
      'A narrower band recenters or nudges the target sooner when the distribution shifts.',
    ],
  },
  spending_target: {
    title: 'Spending Target',
    short: 'This is the total household spending target in real monthly dollars.',
    body: [
      'It includes both guaranteed income and any draw from the investment pool.',
      'Use the pool-draw line underneath it to see how much of the target must come from investments right now.',
    ],
  },
  pool_draw_rate: {
    title: 'Pool Draw Rate',
    short: 'This slider controls the annualized percentage drawn from the investment pool in Historical Safe mode.',
    body: [
      'It does not include Social Security or trust income.',
      'The app converts the chosen percentage into a monthly pool draw, then adds guaranteed income to get total spending.',
    ],
  },
  pool_draw: {
    title: 'Pool Draw',
    short: 'Pool draw is the part of current spending that must come from the investment pool after guaranteed income is applied.',
    body: [
      'In Adaptive PWA mode, pool draw is derived from the spending target and current guaranteed income.',
      'In Historical Safe mode, the pool draw slider is the starting point and total spending is built from it.',
    ],
  },
  reserve_floor: {
    title: 'Pool Floor (Reserve)',
    short: 'The reserve is the minimum pool level you want to preserve in Historical Safe mode.',
    body: [
      'Historical band and safe-rate calculations use this floor to determine reserve survival outcomes.',
      'Adaptive PWA v1 does not use this as its headline confidence metric.',
    ],
  },
  max_depletion_gap: {
    title: 'Max Depletion Gap',
    short: 'This sets how long the pool is allowed to sit at the reserve in the looser ERN-style historical constraint.',
    body: [
      'A value of 0 means the reserve gap is not allowed at all.',
      'Higher values allow the pool to touch the reserve for longer stretches while still counting as acceptable in the finish-above-reserve test.',
    ],
  },
  annual_decision_preview: {
    title: 'Annual Decision Preview',
    short: 'This table shows one realized historical cohort path with yearly re-solving of the full PWA distribution.',
    body: [
      'The realized cohort drives the month-by-month balance path for that example.',
      'At each year boundary, the app rebuilds the distribution from all valid remaining-horizon cohorts using the updated balance.',
    ],
  },
  adaptive_pwa_intro: {
    title: 'What Changed In Adaptive PWA?',
    short: 'The recommendation is now a spending target supported by the current historical distribution, not a fixed reserve-floor rate.',
    body: [
      'The green number is total spending target, not raw pool draw.',
      'The blue confidence number means chance you will not need to cut later, not reserve survival.',
      'The histogram and annual preview show how the recommendation is built and how it can adjust over time.',
    ],
  },
};
