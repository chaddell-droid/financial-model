/**
 * Pre-built scenario templates — partial overrides users can apply with one click.
 * Each template's `overrides` object contains only MODEL_KEYS fields.
 *
 * Templates use APPLY_TEMPLATE which resets to the user's last loaded checkpoint
 * before applying overrides, so each template is a clean what-if scenario that
 * preserves the user's real spend/extras/savings.
 */
export const SCENARIO_TEMPLATES = [
  {
    id: 'optimistic-sarah',
    name: 'Optimistic Sarah',
    description: 'Fast practice growth, max clients by month 18',
    overrides: {
      sarahRate: 150, sarahCurrentClients: 4, sarahMaxClients: 6, sarahClientGrowth: 15,
      sarahRateGrowth: 8, sarahMaxRate: 150,
    },
  },
  {
    id: 'conservative-sarah',
    name: 'Conservative Sarah',
    description: 'Slow growth, plateaus at 4 clients',
    overrides: {
      sarahRate: 125, sarahCurrentClients: 3.8, sarahMaxClients: 4, sarahClientGrowth: 3,
      sarahRateGrowth: 3, sarahMaxRate: 125,
    },
  },
  {
    id: 'ssdi-denied',
    name: 'SSDI Denied',
    description: 'No disability income, must self-fund gap',
    overrides: {
      ssType: 'ssdi', ssdiDenied: true, chadJob: false, chadConsulting: 0,
    },
  },
  {
    id: 'chad-w2-job',
    name: 'Chad Gets W-2 Job',
    description: 'Chad employed with salary + health benefits (no SSDI)',
    overrides: {
      chadJob: true, chadJobSalary: 120000, chadJobStartMonth: 3, chadConsulting: 0,
      ssType: 'ssdi', ssdiDenied: false,
    },
  },
  {
    id: 'worst-case',
    name: 'Worst Case',
    description: 'SSDI denied, slow Sarah growth, no lifestyle cuts',
    overrides: {
      ssType: 'ssdi', ssdiDenied: true, chadJob: false,
      sarahClientGrowth: 3, sarahMaxClients: 4,
      lifestyleCutsApplied: false,
    },
  },
  {
    id: 'chad-job-ss62',
    name: 'Chad Works + SS at 62',
    description: 'W-2 job with earnings test on early SS claim',
    overrides: {
      chadJob: true, chadJobSalary: 120000, chadJobStartMonth: 3, chadConsulting: 0,
      ssType: 'ss', ssClaimAge: 62, ssdiDenied: false,
    },
  },
  {
    id: 'chad-job-ss67',
    name: 'Chad Works + SS at FRA',
    description: 'W-2 job with no earnings test at Full Retirement Age',
    overrides: {
      chadJob: true, chadJobSalary: 120000, chadJobStartMonth: 3, chadConsulting: 0,
      ssType: 'ss', ssClaimAge: 67, ssdiDenied: false,
    },
  },
  {
    id: 'ssdi-max-consulting',
    name: 'SSDI + Max Consulting',
    description: 'SSDI benefits with consulting at SGA limit ($1,690/mo)',
    overrides: {
      ssType: 'ssdi', ssdiDenied: false, chadJob: false,
      chadConsulting: 1690,
    },
  },
];
