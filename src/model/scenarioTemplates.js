/**
 * Pre-built scenario templates — partial overrides users can apply with one click.
 * Each template's `overrides` object contains only MODEL_KEYS fields.
 */
export const SCENARIO_TEMPLATES = [
  {
    id: 'optimistic-sarah',
    name: 'Optimistic Sarah',
    description: 'Fast practice growth, max clients by month 18',
    overrides: {
      sarahCurrentClients: 4, sarahMaxClients: 6, sarahClientGrowth: 15,
      sarahRateGrowth: 8, sarahMaxRate: 150,
    },
  },
  {
    id: 'conservative-sarah',
    name: 'Conservative Sarah',
    description: 'Slow growth, plateaus at 4 clients',
    overrides: {
      sarahClientGrowth: 3, sarahMaxClients: 4, sarahRateGrowth: 3,
    },
  },
  {
    id: 'ssdi-denied',
    name: 'SSDI Denied',
    description: 'No disability income, must self-fund gap',
    overrides: { ssdiDenied: true },
  },
  {
    id: 'chad-w2-job',
    name: 'Chad Gets W-2 Job',
    description: 'Chad employed with salary + health benefits',
    overrides: {
      chadJob: true, chadJobSalary: 120000, chadJobStartMonth: 3,
      chadJobHealthSavings: 800,
    },
  },
  {
    id: 'worst-case',
    name: 'Worst Case',
    description: 'SSDI denied, slow Sarah growth, no lifestyle cuts',
    overrides: {
      ssdiDenied: true, sarahClientGrowth: 3, sarahMaxClients: 4,
      lifestyleCutsApplied: false,
    },
  },
];
