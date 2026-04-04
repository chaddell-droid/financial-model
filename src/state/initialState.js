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
  sarahWorkYears: 6,

  // MSFT
  msftPrice: 373.46,
  msftGrowth: 0,

  // Social Security (SSDI vs SS retirement — mutually exclusive)
  ssType: 'ssdi',            // 'ssdi' or 'ss'
  ssdiApprovalMonth: 7,
  ssdiDenied: false,
  ssdiPersonal: 4166,
  ssdiFamilyTotal: 6500,
  kidsAgeOutMonths: 36,
  chadConsulting: 0,
  ssdiBackPayMonths: 18,
  // SS retirement at 62
  ssFamilyTotal: 7099,       // You + twins (each at 50% PIA) while twins <18
  ssPersonal: 2933,          // You alone after twins age out
  ssStartMonth: 18,          // Sept 2027 = ~18 months from baseline
  ssKidsAgeOutMonths: 18,    // Twins turn 18 ~18 months after SS starts (Mar 2029)

  // Chad Gets a Job
  chadJob: false,
  chadJobSalary: 80000,       // Gross annual
  chadJobTaxRate: 25,          // Effective tax rate %
  chadJobStartMonth: 0,        // Months from now (0 = immediate)
  chadJobHealthSavings: 4200,  // Monthly health insurance savings from employer coverage

  // Expenses
  totalMonthlySpend: null,   // Actual total spend from all accounts; when set, back-calculates baseExpenses
  oneTimeExtras: 0,          // Temporary extra costs per month (e.g. travel, medical, loan payoffs)
  oneTimeMonths: 0,          // How many months the extras last
  baseExpenses: 43818,
  debtService: 6434,

  // BCS Tuition
  bcsAnnualTotal: 41000,
  bcsParentsAnnual: 25000,
  bcsYearsLeft: 3,

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

  // Capital Projects
  moldCost: 60000,
  moldInclude: false,
  roofCost: 40000,
  roofInclude: false,
  otherProjects: 40000,
  otherInclude: false,

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

  // UI — Comparison
  compareState: null,
  compareName: "",

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
  'sarahRate', 'sarahMaxRate', 'sarahRateGrowth', 'sarahCurrentClients', 'sarahMaxClients', 'sarahClientGrowth', 'sarahTaxRate', 'sarahWorkYears',
  'msftPrice', 'msftGrowth',
  'ssType', 'ssdiApprovalMonth', 'ssdiDenied', 'ssdiPersonal', 'ssdiFamilyTotal', 'kidsAgeOutMonths', 'chadConsulting',
  'ssFamilyTotal', 'ssPersonal', 'ssStartMonth', 'ssKidsAgeOutMonths',
  'chadJob', 'chadJobSalary', 'chadJobTaxRate', 'chadJobStartMonth', 'chadJobHealthSavings',
  'totalMonthlySpend', 'oneTimeExtras', 'oneTimeMonths', 'baseExpenses', 'debtService', 'bcsAnnualTotal', 'bcsParentsAnnual', 'bcsYearsLeft',
  'lifestyleCutsApplied', 'cutsOverride',
  'cutOliver', 'cutVacation', 'cutShopping', 'cutMedical', 'cutGym',
  'cutAmazon', 'cutSaaS', 'cutEntertainment', 'cutGroceries', 'cutPersonalCare', 'cutSmallItems',
  'trustIncomeNow', 'trustIncomeFuture', 'trustIncreaseMonth',
  'vanSold', 'vanMonthlySavings', 'vanSalePrice', 'vanLoanBalance', 'vanSaleMonth',
  'retireDebt',
  'startingSavings', 'investmentReturn', 'ssdiBackPayMonths',
  'moldCost', 'moldInclude', 'roofCost', 'roofInclude', 'otherProjects', 'otherInclude',
  'debtCC', 'debtPersonal', 'debtIRS', 'debtFirstmark', 'milestones',
  'starting401k', 'return401k', 'homeEquity', 'homeAppreciation',
  'seqBadY1', 'seqBadY2',
  'goals',
];
