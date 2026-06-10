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
  // A2 (remediation 2026-06-10, D2): annual SS COLA %, applied as
  // (1+rate/100)^(m/12) to ALL SS/SSDI/spousal/child streams in the engine —
  // but ONLY while expenseInflation is on (keeps both sides of the ledger in
  // the same nominal frame). Benefits are indexed by law (42 U.S.C. §415(i));
  // 2.5 ≈ recent-decade average (2026 actual COLA was 2.8). RANGE 0–4.
  ssColaRate: 2.5,
  // SS retirement (configurable claiming age 62–70)
  ssClaimAge: 67,            // Claiming age (62–70); default FRA
  ssPIA: 4214,               // Primary Insurance Amount (benefit at FRA) — per SSA tool
  // After Chad's W-2 job ends — what benefit (if any) replaces it?
  //   'ssRetirement' — pay SS retirement amount once Chad reaches ssClaimAge (age-gated)
  //   'ssdi'         — pay SSDI personal/family immediately after job ends
  //   'none'         — no post-job benefit
  // Only consulted when chadJob=true. The pre-job ssType field still controls
  // the SSDI/SS branch when chadJob=false.
  postJobBenefit: 'ssRetirement',
  // B5 (2026-06-10): gatherState computes the SS family total via the statutory
  // bend-point family maximum (familyMaxForPIA) — aux pool = FMAX − PIA on top of
  // the reduced worker benefit. This default is only a placeholder (recomputed
  // whenever ssType === 'ss').
  ssFamilyTotal: 6321,       // Computed in gatherState from PIA + claim age (bend-point family max)
  ssPersonal: 2933,          // Computed in gatherState from PIA + claim age
  ssStartMonth: 18,          // Computed in gatherState from claim age
  ssKidsAgeOutMonths: 18,    // Computed in gatherState from claim age

  // Sarah's SS spousal benefit — up to 50% of Chad's PIA at her FRA, reduced for early claim.
  // Active when (m >= sarahSpousalStartMonth) AND Chad has claimed (ssBenefit > 0).
  // sarahSpousalStartMonth derived in gatherState from sarahCurrentAge → sarahSpousalClaimAge.
  sarahSpousalEnabled: true,        // Master toggle to model Sarah's spousal benefit
  sarahCurrentAge: 59,              // Sarah's current age (drives months-until-claim derivation)
  sarahSpousalClaimAge: 67,         // Age at which Sarah claims spousal (62–70)
  // Sarah's own-record SS retirement benefit (monthly $). Used by the
  // retirement simulation: caps her spousal top-up while Chad is alive and
  // floors her survivor benefit after he passes. Was hardcoded (1900) in
  // useRetirementSimulation — finding 2026-06-09 2.3.
  sarahOwnSS: 1900,

  // Chad Gets a Job
  chadJob: false,
  chadJobSalary: 80000,       // Gross annual
  chadJobTaxRate: 25,          // Effective tax rate %
  chadJobStartMonth: 0,        // Months from now (0 = immediate)
  chadJobHealthSavings: 4200,  // $/MONTH: employer coverage replaces the family's $4,200/mo private premium (engine subtracts from monthly expenses)
  chadJobNoFICA: false,         // No 6.2% SS tax (non-SS-covered employer)
  chadJobPensionRate: 0,        // Annual pension accrual rate (0=none, 2=PERS Plan 2)
  chadJobPensionContrib: 0,     // Employee pension contribution % deducted from gross
  chadJobRaisePct: 0,           // Annual raise % compounded yearly on base salary
  chadJobBonusPct: 0,           // Annual bonus as % of current annual salary (paid lump-sum)
  chadJobBonusMonth: 8,         // Calendar month of bonus payment (0=Jan, 8=Sept)
  chadJobBonusProrateFirst: true, // Prorate first-year bonus by months worked
  chadJobStockRefresh: 0,       // Annual stock refresh grant $ (each grant vests 20%/yr × 5)
  chadJobRefreshStartMonth: 12, // Months from hire until first refresh grant is issued (MSFT default ~12 = after first review)
  chadJobHireStockY1: 0,        // One-time hire stock $ vesting in year 1
  chadJobHireStockY2: 0,        // ... year 2
  chadJobHireStockY3: 0,        // ... year 3
  chadJobHireStockY4: 0,        // ... year 4 (typically tail end of 4-yr vesting)
  chadJobSignOnCash: 0,         // One-time cash sign-on bonus (50% on hire, 50% on 1yr anniv)
  // 401(k) — annual dollar amounts. Pre-tax deferral reduces W2 wages + cashflow + adds to 401k.
  // Roth catch-up (SECURE 2.0 mandate for high earners 50+) is post-tax — reduces cashflow + adds to 401k but no tax benefit.
  // Employer match goes straight to 401k (no cashflow or tax impact for employee).
  chadJob401kEnabled: false,    // Master toggle — when false, all 401(k) math is gated off regardless of slider values
  chadJob401kDeferral: 0,       // Annual pre-tax 401(k) deferral $ (e.g., $24,500 IRS 2026 limit)
  chadJob401kCatchupRoth: 0,    // Annual Roth catch-up $ (e.g., $11,250 ages 60-63, $8,000 age 64+)
  chadJob401kMatch: 0,          // Annual employer match $ (e.g., $12,250 = 50% of $24,500 deferral)

  // Chad's current age. Used for age-65 RSU vest continuation eligibility.
  // Default 61 matches the model's existing convention (chadAge = 67 + y at retirement
  // assumes chadCurrentAge=61 and default chadRetirementMonth=72 → age 67 at retirement).
  chadCurrentAge: 61,

  // MSFT promotion ladder. Each level can be enabled independently. Promotion
  // month is measured from hire date (chadJobStartMonth), not project start.
  // When a promotion fires, the new salary becomes the compounding anchor for
  // chadJobRaisePct (which is shared across all levels).
  chadL64Enabled: false,
  chadL64Month: 24,             // Months after hire until L64 promotion
  chadL64Salary: 220000,         // New base salary at L64
  chadL64StockRefresh: 0,        // New annual refresh grant size at L64
  chadL64BonusPct: 15,           // Bonus % at L64
  chadL65Enabled: false,
  chadL65Month: 60,              // Months after hire until L65 promotion
  chadL65Salary: 280000,         // New base salary at L65
  chadL65StockRefresh: 0,        // New annual refresh grant size at L65
  chadL65BonusPct: 20,           // Bonus % at L65

  // Age-65 RSU vest continuation. When eligible, unvested refresh grants keep
  // vesting on their original 5-yr schedule after Chad retires (no salary,
  // bonus, or new grants — just the existing vests playing out).
  // 'auto' = engine checks age at retirement
  // 'on' = force eligibility on (regardless of age)
  // 'off' = force eligibility off (regardless of age)
  chadAge65VestOverride: 'auto',

  // Expenses
  totalMonthlySpend: null,   // Actual total spend from all accounts; when set, back-calculates baseExpenses
  oneTimeExtras: 0,          // Temporary extra costs per month (e.g. travel, medical, loan payoffs)
  oneTimeMonths: 0,          // How many months the extras last
  baseExpenses: 43818,
  debtService: 6434,
  // Per-debt amortization (6.3 — remediation 2026-06-10, improvement a-5, gate D5).
  // Shape: { id: string, name: string, balance: number, apr: number (% APR),
  // payment: number ($/mo) }. Each debt amortizes monthly (interest first,
  // final payment capped at balance + interest) and its payment drops to ZERO
  // at payoff. DEFAULT IS FLAT-EQUIVALENT: with no entries the flat
  // `debtService` above continues exactly as before (snapshot-preserving).
  // When entries exist they REPLACE debtService in the expense loop, the
  // totalMonthlySpend back-calc, and the retireDebt payoff total.
  // D5: Chad to enter real balances/APRs/payments — see the Debts editor hint.
  debts: [],
  // Mortgage P&I split (6.3 — improvement b-12). mortgagePI is the fixed
  // monthly principal+interest carved OUT of the inflating baseExpenses (a
  // fixed-rate payment does not inflate). With mortgageBalance/mortgageRate
  // set, the principal portion is credited to home equity each month and the
  // payment drops to zero at payoff; with no balance info the payment simply
  // continues as a fixed non-inflating expense. Defaults are a no-op (D5:
  // Chad to fill in real numbers).
  mortgagePI: 0,        // $/mo fixed P&I (0 = entire baseExpenses inflates, pre-6.3 behavior)
  mortgageBalance: 0,   // current principal balance
  mortgageRate: 0,      // mortgage APR %
  expenseInflation: true,        // Apply annual inflation to base living expenses
  expenseInflationRate: 3,       // 3% annual default (CPI approximation)

  // Healthcare cost path (6.4 — remediation 2026-06-10, improvement a-6, gate D6).
  // healthPremiumMonthly is the family's private health premium, carved OUT of
  // the inflating baseExpenses and re-added as its own expense line trending at
  // medicalTrendRate (D6: 6.5%/yr) instead of general CPI. SINGLE SOURCE with
  // chadJobHealthSavings: while employer coverage is active the premium line is
  // zeroed (the legacy flat chadJobHealthSavings subtraction applies only when
  // this field is 0). taxProjection's SEHI deduction reads the same field.
  healthPremiumMonthly: 4200,    // $/mo family private premium (matches the long-standing 4200 convention)
  medicalTrendRate: 6.5,         // %/yr medical-trend inflation on the premium (D6)
  // Chad's SSDI Medicare entitlement month (months from projection start;
  // negative = entitlement date already passed). When set, chadMedicareMonth =
  // min(entitlement + 24, age-65 month) relieves Chad's per-capita share of
  // the premium. null = no Medicare modeled — D6: the UI hint asks for the
  // date from the SSA award letter.
  ssdiEntitlementMonth: null,

  // BCS Tuition
  bcsAnnualTotal: 43400,       // Grades 7-12: $22,720 (1st) + $20,680 (2nd)
  bcsParentsAnnual: 25000,
  // FIX M-BCS: 3.5 yr × 12 = 42 monthly BCS payments — payments through month 41 (3.5 years).
  // If actual graduation is mid-2029 not 2030, change to 3.25 (graduation June 2029 = m=39).
  bcsYearsLeft: 3.5,           // Freshmen 2025–2026, payments through month 41 (3.5 years)

  // Twins' college (6.2 — remediation 2026-06-10, improvement a-3, gate D4).
  // The "Twins to college" milestone (below) keeps modeling the HOUSEHOLD
  // running-cost drop when they move out; these fields carry the tuition
  // itself, which the audit found entirely missing (the combined event
  // wrongly REDUCED expenses $3,000/mo). Cost applies PER KID — the engine
  // charges 2× for the twins. Nominal dollars (like BCS, treated as a fixed
  // contract — not inflated). The 529 draws down first, dollar-for-dollar
  // (no growth modeled on the 529 itself); only the uncovered remainder
  // lands in monthly expenses (expenseBreakdown.college).
  collegeCostPerKidMonthly: 2833,  // $/mo per kid ≈ $34k/kid/yr in-state all-in (D4)
  collegeStartMonth: 39,           // Sept 2029 (m=39 from Mar-2026 baseline)
  collegeMonths: 48,               // 4 academic years
  college529Balance: 0,            // Current 529 balance (D4: Chad to fill in)

  // Spending Cuts — single slider amount (applied when lifestyleCutsApplied is true)
  lifestyleCutsApplied: false,
  cutsOverride: null,                // null = no override (use individual cut sliders); number = total cut amount
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
  // Tax drag on the TAXABLE savings return (6.5 — remediation 2026-06-10,
  // improvement b-11). After-tax return = pre-tax × (1 − drag/100). Default 0
  // preserves every saved snapshot; the audit pegged an untaxed 15% taxable
  // return as the model's most optimistic untracked assumption (~$15–30k over
  // 6 years). The 401(k) is tax-sheltered and is never dragged.
  taxableReturnDragPct: 0,
  // Emergency-fund floor + two-bucket returns (6.6 — remediation 2026-06-10,
  // improvement b-15). The first cashFloorAmount dollars of savings are a CASH
  // bucket earning cashYieldPct; only the remainder earns the equity
  // investmentReturn. 0 = off (whole balance at the equity return — the
  // pre-6.6 behavior, snapshot-preserving). The 6.5 tax drag applies to both
  // buckets (the entire account is taxable).
  cashFloorAmount: 0,   // $ kept in cash (emergency fund); 0 = feature off
  cashYieldPct: 4,      // %/yr yield on the cash bucket (HYSA/T-bill ballpark)

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

  // Capital funding source (remediation 2026-06-09 D4):
  //   'advance' — one-time capital items + the retire-debt payoff are covered
  //               externally (Dad's advance) and never touch savings (the
  //               historical behavior; default).
  //   'savings' — the engine deducts the expected capital total (likelihood-
  //               weighted, per D6b) and the debt payoff (when retireDebt is
  //               on) from the savings balance at month 0. Capital items carry
  //               no scheduled month on their shape, so they are treated as
  //               immediate outlays.
  capitalFundingSource: 'advance',

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
  // Block-bootstrap mode (item 4.2 — remediation 2026-06-10, gate D7,
  // opt-in). When on, each sim's savings/401(k) returns ride a sequence of
  // 12-month blocks sampled from the Shiller monthly real stock-return
  // series (recentered on the user's expected return) instead of one
  // constant draw — true sequence-of-returns risk. Off = the legacy
  // "assumption uncertainty" mode (one constant value per assumption).
  mcBlockBootstrap: false,

  // Wealth / Net Worth tracking
  starting401k: 478000,
  return401k: 15,
  homeEquity: 700000,
  homeAppreciation: 4,
  // Effective income-tax rate (%) on 401(k) DEFICIT withdrawals (remediation
  // 2026-06-09 D7). 401(k) dollars are pre-tax: covering $1 of net deficit
  // requires withdrawing 1/(1-rate) gross, so deficit draws deplete the
  // account faster than the net shortfall. 25 matches the model's other
  // effective-rate defaults (sarahTaxRate, chadJobTaxRate). Home-equity draws
  // are NOT taxed — they model a sale of equity (primary-residence exclusion).
  deficit401kTaxRate: 25,
  // Effective income-tax rate (%) on RETIREMENT 401(k) withdrawals (A5 —
  // remediation 2026-06-10 item 3.1, decision D3). The retirement pool used
  // to spend the pre-tax 401(k) at face value; computeRetirementPool now
  // haircuts that leg by this rate before pooling. 13 = mid of the audit's
  // realistic 10–15% effective MFJ band at retirement income levels (lower
  // than deficit401kTaxRate because retirement income is lower).
  retirement401kTaxRate: 13,

  // Sequence of Returns
  seqBadY1: -10,
  seqBadY2: -5,

  // Tax engine (Tax tab — remediation 2026-06-09 D1). Defaults MUST match the
  // engine's own `??` fallbacks in taxProjection.js (getTaxInputs/buildTaxSchedule)
  // so adding these fields to gathered state changes no locked tax number.
  // The engine is DISPLAY-ONLY for now: the monthly projection loop still uses
  // the flat-rate fields (sarahTaxRate, chadJobTaxRate).
  taxMode: 'flat',            // 'flat' (legacy flat-rate) or 'engine' (full federal engine display)
  taxInflationAdjust: false,  // Inflate bracket thresholds + deduction inputs annually
  taxInflationRate: 2,        // Annual inflation % applied when taxInflationAdjust is on
  taxSchCExpenseRatio: 25,    // Sarah's Sch C business expense ratio (% of gross)
  taxPropertyTax: 0,          // Itemized: annual property tax $
  taxSalesTax: 0,             // Itemized: annual sales tax $
  taxPersonalPropTax: 0,      // Itemized: annual personal property tax $
  taxMortgageInt: 0,          // Itemized: annual mortgage interest $
  taxCharitable: 0,           // Itemized: annual charitable contributions $
  taxMedical: 0,              // Itemized: total annual medical expenses $ (7.5% AGI floor applied in engine)
  taxW2Withholding: 0,        // Annual W-2 federal withholding $ (prepayment vs balance)
  taxCtcChildren: 2,          // Children qualifying for the Child Tax Credit
  taxOdcDependents: 0,        // Other dependents (ODC $500 credit)
  taxCapGainLoss: -3000,      // Annual capital gain/loss $ (default: $3K loss carryforward)
  taxSolo401k: 0,             // Sarah's annual Solo 401(k) contribution $

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
  'ssType', 'ssdiApprovalMonth', 'ssdiDenied', 'ssdiPersonal', 'ssdiFamilyTotal', 'kidsAgeOutMonths', 'chadConsulting', 'ssColaRate',
  'ssClaimAge', 'ssPIA', 'ssFamilyTotal', 'ssPersonal', 'ssStartMonth', 'ssKidsAgeOutMonths',
  'postJobBenefit',
  'sarahSpousalEnabled', 'sarahCurrentAge', 'sarahSpousalClaimAge', 'sarahOwnSS',
  'chadJob', 'chadJobSalary', 'chadJobTaxRate', 'chadJobStartMonth', 'chadJobHealthSavings',
  'chadJobNoFICA', 'chadJobPensionRate', 'chadJobPensionContrib',
  'chadJobRaisePct', 'chadJobBonusPct', 'chadJobBonusMonth', 'chadJobBonusProrateFirst',
  'chadJobStockRefresh', 'chadJobRefreshStartMonth', 'chadJobHireStockY1', 'chadJobHireStockY2', 'chadJobHireStockY3', 'chadJobHireStockY4',
  'chadJobSignOnCash',
  'chadJob401kEnabled', 'chadJob401kDeferral', 'chadJob401kCatchupRoth', 'chadJob401kMatch',
  'chadCurrentAge',
  'chadL64Enabled', 'chadL64Month', 'chadL64Salary', 'chadL64StockRefresh', 'chadL64BonusPct',
  'chadL65Enabled', 'chadL65Month', 'chadL65Salary', 'chadL65StockRefresh', 'chadL65BonusPct',
  'chadAge65VestOverride',
  'totalMonthlySpend', 'oneTimeExtras', 'oneTimeMonths', 'baseExpenses', 'debtService',
  // Per-debt amortization + mortgage P&I split (6.3 — remediation 2026-06-10, D5)
  'debts', 'mortgagePI', 'mortgageBalance', 'mortgageRate',
  'expenseInflation', 'expenseInflationRate',
  // Healthcare cost path (6.4 — remediation 2026-06-10, D6)
  'healthPremiumMonthly', 'medicalTrendRate', 'ssdiEntitlementMonth',
  'bcsAnnualTotal', 'bcsParentsAnnual', 'bcsYearsLeft',
  // Twins' college (6.2 — remediation 2026-06-10, D4)
  'collegeCostPerKidMonthly', 'collegeStartMonth', 'collegeMonths', 'college529Balance',
  'lifestyleCutsApplied', 'cutsOverride',
  'cutOliver', 'cutVacation', 'cutShopping', 'cutMedical', 'cutGym',
  'cutAmazon', 'cutSaaS', 'cutEntertainment', 'cutGroceries', 'cutPersonalCare', 'cutSmallItems',
  'trustIncomeNow', 'trustIncomeFuture', 'trustIncreaseMonth',
  'vanSold', 'vanMonthlySavings', 'vanSalePrice', 'vanLoanBalance', 'vanSaleMonth',
  'retireDebt',
  'startingSavings', 'investmentReturn', 'taxableReturnDragPct', 'cashFloorAmount', 'cashYieldPct', 'ssdiBackPayMonths',
  'moldCost', 'moldInclude', 'roofCost', 'roofInclude', 'otherProjects', 'otherInclude',
  'capitalItems', 'capitalFundingSource', 'customLevers', 'leverConstraintsOverride',
  'debtCC', 'debtPersonal', 'debtIRS', 'debtFirstmark', 'milestones',
  'starting401k', 'return401k', 'homeEquity', 'homeAppreciation', 'deficit401kTaxRate', 'retirement401kTaxRate',
  'seqBadY1', 'seqBadY2',
  // Tax engine controls (Tax tab — remediation 2026-06-09 D1)
  'taxMode', 'taxInflationAdjust', 'taxInflationRate', 'taxSchCExpenseRatio',
  'taxPropertyTax', 'taxSalesTax', 'taxPersonalPropTax', 'taxMortgageInt',
  'taxCharitable', 'taxMedical', 'taxW2Withholding', 'taxCtcChildren',
  'taxOdcDependents', 'taxCapGainLoss', 'taxSolo401k',
  // Monte Carlo settings (remediation phase 5). mcResults/mcRunning stay
  // UI-only — only the user-tunable parameters persist.
  'mcNumSims', 'mcInvestVol', 'mcBizGrowthVol', 'mcMsftVol', 'mcSsdiDelay', 'mcSsdiDenialPct', 'mcCutsDiscipline',
  'mcBlockBootstrap',
  'goals',
];
