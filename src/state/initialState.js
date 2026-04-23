export const INITIAL_STATE = {
  // Schema version — for migration framework (not in MODEL_KEYS)
  schemaVersion: 1,

  // Income — Sarah's Business
  sarahRate: 200,
  sarahMaxRate: 250,
  sarahRateGrowth: 5,
  sarahCurrentClients: 3.75,
  sarahMaxClients: 4.5,
  sarahClientGrowth: 10,
  sarahTaxRate: 25,
  chadWorkMonths: 72,         // How long Chad works (months from now)
  sarahWorkMonths: 72,         // How long Sarah's practice runs (months from now)

  // MSFT
  msftPrice: 373.46,
  msftGrowth: 0,

  // Social Security (SSDI vs SS retirement — mutually exclusive)
  ssType: 'ssdi',            // 'ssdi' or 'ss'
  ssdiApprovalMonth: 7,
  ssdiDenied: false,
  ssdiPersonal: 4214,        // Per SSA tool — disability benefit = PIA
  ssdiFamilyTotal: 6321,     // SSDI family max = 150% of PIA ($4,214)
  kidsAgeOutMonths: 36,
  chadConsulting: 0,
  ssdiBackPayMonths: 18,
  // SS retirement (configurable claiming age 62–70)
  ssClaimAge: 67,            // Claiming age (62–70); default FRA
  ssPIA: 4214,               // Primary Insurance Amount (benefit at FRA) — per SSA tool
  ssFamilyTotal: 7099,       // Computed in gatherState from PIA + claim age
  ssPersonal: 2933,          // Computed in gatherState from PIA + claim age
  ssStartMonth: 18,          // Computed in gatherState from claim age
  ssKidsAgeOutMonths: 18,    // Computed in gatherState from claim age

  // Chad Gets a Job
  chadJob: false,
  chadJobSalary: 80000,       // Gross annual
  chadJobTaxRate: 25,          // Effective tax rate %
  chadJobStartMonth: 0,        // Months from now (0 = immediate)
  chadJobHealthSavings: 4200,  // Monthly health insurance savings from employer coverage
  chadJobNoFICA: false,         // No 6.2% SS tax (non-SS-covered employer)
  chadJobPensionRate: 0,        // Annual pension accrual rate (0=none, 2=PERS Plan 2)
  chadJobPensionContrib: 0,     // Employee pension contribution % deducted from gross

  // Expenses
  totalMonthlySpend: null,   // Actual total spend from all accounts; when set, back-calculates baseExpenses
  oneTimeExtras: 0,          // Temporary extra costs per month (e.g. travel, medical, loan payoffs)
  oneTimeMonths: 0,          // How many months the extras last
  baseExpenses: 43818,
  debtService: 6434,
  expenseInflation: true,        // Apply annual inflation to base living expenses
  expenseInflationRate: 3,       // 3% annual default (CPI approximation)

  // BCS Tuition
  bcsAnnualTotal: 43400,       // Grades 7-12: $22,720 (1st) + $20,680 (2nd)
  bcsParentsAnnual: 25000,
  bcsYearsLeft: 3.5,           // Freshmen 2025–2026, graduate June 2029 (~month 39)

  // Spending Cuts — single slider amount (applied when lifestyleCutsApplied is true)
  lifestyleCutsApplied: false,
  cutsOverride: 0,
  cutOliver: 0,
  cutVacation: 0,
  cutShopping: 0,
  cutMedical: 0,
  cutGym: 0,
  cutAmazon: 0,
  cutSaaS: 0,
  cutEntertainment: 0,
  cutGroceries: 0,
  cutPersonalCare: 0,
  cutSmallItems: 0,

  // Trust Income
  trustIncomeNow: 833,
  trustIncomeFuture: 2083,
  trustIncreaseMonth: 11,

  // Van
  vanSold: false,
  vanMonthlySavings: 2597,
  vanSalePrice: 150000,         // What we'd get for it
  vanLoanBalance: 200000,       // What we owe
  vanSaleMonth: 12,             // When we sell (months from now)

  // Milestones
  milestones: [{ name: "Twins to college", month: 36, savings: 3000 }],

  // Scenario toggles
  retireDebt: false,

  // Savings & Investment
  startingSavings: 200000,
  investmentReturn: 15,

  // Capital Projects (legacy scalar fields — preserved for back-compat; migration seeds capitalItems from these)
  moldCost: 60000,
  moldInclude: false,
  roofCost: 40000,
  roofInclude: false,
  otherProjects: 40000,
  otherInclude: false,

  // Capital Items — array-based model (Plan tab redesign). Seeded by gatherState migration from legacy fields if empty.
  // Shape: { id: string, name: string, description: string, cost: number, include: boolean, likelihood: number }
  capitalItems: [],

  // Custom Levers — user-added recurring-income levers (Plan tab Decision Console).
  // Shape: { id: string, name: string, description: string, maxImpact: number, currentValue: number, active: boolean }
  customLevers: [],

  // Lever constraint overrides — per-lever min/max that override the
  // Constraint Workshop defaults in src/model/leverClassification.js.
  // Shape: { [leverKey]: { min?: number, max?: number } } | null
  // null means "use workshop defaults for every bounded-continuous lever".
  // Exposed via gatherState's effectiveLeverConstraints derivation.
  leverConstraintsOverride: null,

  // Debt Balances
  debtCC: 92760,
  debtPersonal: 57611,
  debtIRS: 17937,
  debtFirstmark: 21470,

  // Goals
  goals: [
    { id: 'default-1', name: 'Savings positive at Y6', type: 'savings_floor', targetAmount: 0, targetMonth: 72, color: '#4ade80' },
    { id: 'default-2', name: 'Cash flow breakeven', type: 'income_target', targetAmount: 0, targetMonth: 36, color: '#60a5fa' },
    { id: 'default-3', name: 'Emergency fund $50k', type: 'savings_target', targetAmount: 50000, targetMonth: 48, color: '#fbbf24' },
  ],

  // UI — Scenario Management
  savedScenarios: [],
  scenarioName: "",
  showSaveLoad: false,
  presentMode: false,

  // UI — Comparison (up to 3 simultaneous)
  comparisons: [],  // Array of { name: string, state: object }

  // Monte Carlo
  mcResults: null,
  mcRunning: false,
  mcNumSims: 500,
  mcInvestVol: 12,
  mcBizGrowthVol: 5,
  mcMsftVol: 15,
  mcSsdiDelay: 6,
  mcSsdiDenialPct: 5,
  mcCutsDiscipline: 25,

  // Wealth / Net Worth tracking
  starting401k: 478000,
  return401k: 15,
  homeEquity: 700000,
  homeAppreciation: 4,

  // Sequence of Returns
  seqBadY1: -10,
  seqBadY2: -5,

  // UI
  activeTab: "overview",

  // Preview Sandbox (UI-only, strictly in-memory — never persisted)
  // Shape: Array<{ id: string, label: string, mutation: object }>
  // Each element layers mutations onto baseline; composePreviewState applies
  // them in order. Not in MODEL_KEYS, so autoSave's extractModelState filters
  // it out automatically.
  previewMoves: [],

  // Storage
  storageStatus: "",

  // Monthly Check-In
  checkInHistory: [],
  activeCheckInMonth: null,

  // Actuals — transaction import (persisted separately, not in MODEL_KEYS)
  monthlyActuals: {},
  merchantClassifications: {},  // { "TacoTime": "core", "Delta Air Lines": "onetime" } — learned overrides
};

// Keys that constitute the financial model (for save/restore/projection)
export const MODEL_KEYS = [
  'sarahRate', 'sarahMaxRate', 'sarahRateGrowth', 'sarahCurrentClients', 'sarahMaxClients', 'sarahClientGrowth', 'sarahTaxRate',
  'chadWorkMonths', 'sarahWorkMonths',
  'msftPrice', 'msftGrowth',
  'ssType', 'ssdiApprovalMonth', 'ssdiDenied', 'ssdiPersonal', 'ssdiFamilyTotal', 'kidsAgeOutMonths', 'chadConsulting',
  'ssClaimAge', 'ssPIA', 'ssFamilyTotal', 'ssPersonal', 'ssStartMonth', 'ssKidsAgeOutMonths',
  'chadJob', 'chadJobSalary', 'chadJobTaxRate', 'chadJobStartMonth', 'chadJobHealthSavings',
  'chadJobNoFICA', 'chadJobPensionRate', 'chadJobPensionContrib',
  'totalMonthlySpend', 'oneTimeExtras', 'oneTimeMonths', 'baseExpenses', 'debtService',
  'expenseInflation', 'expenseInflationRate',
  'bcsAnnualTotal', 'bcsParentsAnnual', 'bcsYearsLeft',
  'lifestyleCutsApplied', 'cutsOverride',
  'cutOliver', 'cutVacation', 'cutShopping', 'cutMedical', 'cutGym',
  'cutAmazon', 'cutSaaS', 'cutEntertainment', 'cutGroceries', 'cutPersonalCare', 'cutSmallItems',
  'trustIncomeNow', 'trustIncomeFuture', 'trustIncreaseMonth',
  'vanSold', 'vanMonthlySavings', 'vanSalePrice', 'vanLoanBalance', 'vanSaleMonth',
  'retireDebt',
  'startingSavings', 'investmentReturn', 'ssdiBackPayMonths',
  'moldCost', 'moldInclude', 'roofCost', 'roofInclude', 'otherProjects', 'otherInclude',
  'capitalItems', 'customLevers', 'leverConstraintsOverride',
  'debtCC', 'debtPersonal', 'debtIRS', 'debtFirstmark', 'milestones',
  'starting401k', 'return401k', 'homeEquity', 'homeAppreciation',
  'seqBadY1', 'seqBadY2',
  'goals',
];
