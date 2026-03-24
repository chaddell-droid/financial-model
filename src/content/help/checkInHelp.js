export const CHECK_IN_HELP = {
  monthly_check_in: {
    title: 'Monthly Check-In',
    short: 'Track actual results against your plan each month.',
    body: [
      'The check-in captures what actually happened — income received, money spent, and your real bank balance. The model compares these to what the plan projected.',
      'Over time, check-ins build a picture of whether the plan is working or needs adjustment. Think of it as a monthly GPS recalibration.',
    ],
  },
  check_in_balance: {
    title: 'Actual Savings Balance',
    short: 'The single most important number in your check-in.',
    body: [
      'Your actual bank/savings balance is ground truth — it captures everything the model might miss: unexpected expenses, timing differences, rounding.',
      'The model uses this number to re-forecast your runway from reality rather than from assumptions.',
    ],
  },
  check_in_drift: {
    title: 'Plan vs. Actual Drift',
    short: 'How far reality has diverged from the plan.',
    body: [
      'Green means you are ahead of plan (more income or lower expenses than projected). Red means behind. Yellow means within 10% — effectively on track.',
      'Small monthly drifts are normal. Watch for persistent trends in one direction — that signals an assumption needs updating.',
    ],
  },
  check_in_reforecast: {
    title: 'Re-forecast',
    short: 'An updated projection starting from your actual balance.',
    body: [
      'After each check-in, the model re-runs the full projection using your real savings balance instead of the planned one. This shows your actual runway.',
      'If the re-forecast runway differs significantly from the plan, consider updating your assumptions on the Plan tab.',
    ],
  },
};
