import { MONTHS, MONTH_VALUES, DAYS_PER_MONTH, SGA_LIMIT, SS_EARNINGS_LIMIT_ANNUAL, SS_EARNINGS_LIMIT_FRA_YEAR, SS_FRA, SS_FRA_MONTH, SS_START_OFFSET, SSDI_ATTORNEY_FEE_CAP, PROJECTION_START_MONTH, STOCK_VEST_CALENDAR_MONTHS, SS_CHILD_BENEFIT_END_MONTH, buildQuarterlySchedule, ssAdjustmentFactor, ssRecalculatedBenefit, ssSpousalFactorFromMonthsEarly } from './constants.js';

/**
 * Helpers for lumpy stock-vest calendar math.
 * Refresh grants vest 5% on each Feb/May/Aug/Nov (last day) for 5 years (20 vests).
 */
function isStockVestMonth(m) {
  return STOCK_VEST_CALENDAR_MONTHS.includes((m + PROJECTION_START_MONTH) % 12);
}
// First quarterly vest strictly AFTER `month` (so a grant issued in a vest month
// skips its same-month vest — first payout 3 months later).
function nextStockVestMonthAfter(month) {
  for (let k = month + 1; k <= month + 3; k++) {
    if (isStockVestMonth(k)) return k;
  }
  return month + 3; // fallback (shouldn't hit — vest months are every 3 months)
}
import { getVestingMonthly, getVestingLumpSum } from './vesting.js';

// ── A1 INTERIM SS taxability haircut (remediation 2026-06-10, plan 1.2) ──
// SS/SSDI benefits previously flowed into cash flow completely untaxed. With
// Sarah's Schedule C profit, MFJ provisional income is far above the $44,000
// tier, so 85% of the ADULT benefit is federally taxable (IRC §86, Pub 915) —
// ~$57k of overstated savings over 72 months plus ~$14.2k of back-pay-year tax.
// Kids' auxiliary benefits are the KIDS' income (Pub 915) and stay untaxed.
//
// *** INTERIM until Phase 7 (improvement a-1) wires taxMode='engine' per-year
// effective rates from buildTaxSchedule into this loop. These constants are an
// effective-rate approximation, NOT the tiered §86 computation the tax engine
// already performs for the display layer. Replace this whole block in P7. ***
export const SS_TAXABLE_SHARE = 0.85;          // IRC §86(a)(2) upper-tier inclusion
export const SS_INTERIM_MARGINAL_RATE = 0.22;  // household MFJ marginal bracket estimate
export const SS_INTERIM_TAX_HAIRCUT = SS_TAXABLE_SHARE * SS_INTERIM_MARGINAL_RATE; // 0.187

/**
 * Haircut the ADULT share of a (possibly family-total) benefit. The adult
 * share is capped at the personal benefit; anything above it is the kids'
 * auxiliary share and passes through untaxed. An earnings-test-reduced total
 * below the personal amount is fully adult (taxed in full).
 */
export function applyInterimSsTax(totalBenefit, personalBenefit) {
  if (!(totalBenefit > 0)) return 0;
  const cap = personalBenefit > 0 ? personalBenefit : totalBenefit;
  const adultShare = Math.min(totalBenefit, cap);
  const kidShare = totalBenefit - adultShare;
  return kidShare + Math.round(adultShare * (1 - SS_INTERIM_TAX_HAIRCUT));
}
import { levelAtMonthsWorked, age65VestEligibility, clearsOneYearCliff, firstAugustAtOrAfter } from './chadLevels.js';
import { computeOneTimeTotal } from '../state/gatherState.js';

export function findOperationalBreakevenIndex(rows) {
  if (!Array.isArray(rows)) return -1;
  return rows.findIndex((row) => (
    row?.netCashFlowSmoothed
    ?? row?.netCashFlow
    ?? Number.NEGATIVE_INFINITY
  ) >= 0);
}

/**
 * Core monthly simulation loop — single source of truth for all projections.
 * Tracks both savings balance AND 401k balance. When savings would go negative,
 * draws from 401k to cover the deficit (no early withdrawal penalty at 60+).
 * Accepts `cutsDiscipline` (default 1.0) to scale lifestyle cuts for Monte Carlo.
 * Returns { monthlyData, backPayActual }.
 */
export function runMonthlySimulation(s) {
  const months = s.totalProjectionMonths || 72;
  const cutsDiscipline = s.cutsDiscipline ?? 1.0;
  const useSS = s.ssType === 'ss';
  const chadJob = s.chadJob || false;
  // If SS retirement, SSDI denied, or Chad has a job: no SSDI, no back pay.
  const effectiveSsdiApproval = (useSS || chadJob) ? 999 : (s.ssdiDenied ? 999 : (s.ssdiApprovalMonth ?? 7));
  // Back pay includes auxiliary benefits for dependent kids during their eligibility window.
  // Bound auxiliary months by kidsAgeOutMonths as a forward-looking proxy: if kids are
  // eligible at/after approval they were eligible during the (past) back-pay window too.
  // Attorney fee applies only to the worker's share, not auxiliary benefits.
  const totalBackPayMonths = (useSS || chadJob || s.ssdiDenied) ? 0 : (s.ssdiBackPayMonths || 0);
  const auxBackPayMonths = Math.min(totalBackPayMonths, s.kidsAgeOutMonths || 0);
  const adultBackPayGross = totalBackPayMonths * (s.ssdiPersonal || 4214);
  const auxBackPayGross = auxBackPayMonths * Math.max(0, (s.ssdiFamilyTotal || 6321) - (s.ssdiPersonal || 4214));
  const backPayFee = Math.min(Math.round(adultBackPayGross * 0.25), SSDI_ATTORNEY_FEE_CAP);
  // A1 INTERIM (2026-06-10): the ADULT back pay is taxable in the receipt year
  // (SSA-1099 box 5 is gross of the attorney fee, but the interim haircut uses
  // the adult gross — C3/§86(e) refinements land in Phase 2). Kids' auxiliary
  // back pay is the kids' income — untaxed.
  const backPayTax = Math.round(adultBackPayGross * SS_INTERIM_TAX_HAIRCUT);
  const backPayActual = adultBackPayGross + auxBackPayGross - backPayFee - backPayTax;
  const ssStartMonth = s.ssStartMonth ?? 18;
  const ssFamilyTotal = s.ssFamilyTotal || 7099;
  const ssPersonal = s.ssPersonal || 2933;
  const ssKidsAgeOutMonths = s.ssKidsAgeOutMonths ?? 18;
  const ms = s.milestones || [];
  const trustNow = s.trustIncomeNow || 0;
  const trustFuture = s.trustIncomeFuture || 0;
  const trustMonth = s.trustIncreaseMonth ?? 11;
  // Custom levers (Plan Decision Console) — active levers add currentValue to monthly cashIncome.
  const customLeverMonthly = Array.isArray(s.customLevers)
    ? s.customLevers.reduce((sum, lv) => sum + (lv && lv.active ? Math.max(0, Number(lv.currentValue) || 0) : 0), 0)
    : 0;
  const monthlyReturnRate = Math.pow(1 + (s.investmentReturn || 0) / 100, 1/12) - 1;

  // Chad's work duration — driven by chadWorkMonths state field (was hardcoded chadRetirementMonth = 72)
  const chadRetirementMonth = s.chadRetirementMonth || 72;

  // Chad Gets a Job
  // chadJobTaxRate is the ALL-IN effective income tax rate.
  // No-FICA adds 6.2% back (non-SS-covered employer saves that portion).
  // Pension contribution is deducted automatically from gross.
  const chadJobStartMonth = s.chadJobStartMonth ?? 0;  // matches INITIAL_STATE; chadLevels.js uses the same default
  const ficaSavings = s.chadJobNoFICA ? 0.062 : 0;
  const pensionContrib = (s.chadJobPensionContrib || 0) / 100;
  const chadJobRaisePct = (s.chadJobRaisePct || 0) / 100;
  const chadJobBonusMonth = s.chadJobBonusMonth ?? 8; // 0=Jan, 8=Sept
  const chadJobBonusProrateFirst = s.chadJobBonusProrateFirst !== false;
  const chadJobRefreshStartMonth = s.chadJobRefreshStartMonth ?? 12;
  // Salary, bonus pct, and refresh size are now resolved per-month via
  // levelAtMonthsWorked() so promotions can step them up. The L63 baseline
  // values (chadJobSalary, chadJobBonusPct, chadJobStockRefresh) remain on
  // state and are returned by levelAtMonthsWorked when no promotion has fired.
  const chadJobHireStock = [
    s.chadJobHireStockY1 || 0,
    s.chadJobHireStockY2 || 0,
    s.chadJobHireStockY3 || 0,
    s.chadJobHireStockY4 || 0,
  ];
  const chadJobSignOnCash = s.chadJobSignOnCash || 0;
  // 401(k) — annual amounts; spread monthly over 12. Pre-tax deferral reduces taxable salary
  // (so net cashflow falls by deferral × tax-saved-fraction less than the gross deduction);
  // Roth catch-up is post-tax (cashflow falls by full amount). Match flows to bal401k only.
  // Master toggle chadJob401kEnabled gates all three; when false, slider values are ignored.
  const chadJob401kEnabled = !!s.chadJob401kEnabled;
  const chadJob401kDeferralMonthly = chadJob401kEnabled ? (s.chadJob401kDeferral || 0) / 12 : 0;
  const chadJob401kCatchupRothMonthly = chadJob401kEnabled ? (s.chadJob401kCatchupRoth || 0) / 12 : 0;
  const chadJob401kMatchMonthly = chadJob401kEnabled ? (s.chadJob401kMatch || 0) / 12 : 0;
  const chadJobTaxRate = (s.chadJobTaxRate ?? 25) / 100;
  // Pension is deducted from salary only (not bonuses or RSUs, per typical employer rules).
  // FICA correctness: pre-tax pension reduces federal income tax base (Box 1) but FICA
  // (SS+Medicare) still applies on the full gross. So the per-dollar cashflow effect of a
  // pension contribution is: lose $1 of cash, save income tax (chadJobTaxRate which already
  // bakes in FICA when noFICA is false), but still pay FICA on that dollar.
  const chadJobSalaryNetMult = 1 - chadJobTaxRate + ficaSavings;
  // FICA still applies to pension (1.45% Medicare-only when noFICA=true, full 7.65% otherwise).
  const ficaRateOnPension = s.chadJobNoFICA ? 0.0145 : 0.0765;
  // Cashflow loss per pension dollar: 1 - chadJobTaxRate (saves income tax) + ficaRateOnPension (still pays FICA).
  const pensionCashflowMult = 1 - chadJobTaxRate + ficaRateOnPension;
  const chadJobBonusNetMult = 1 - chadJobTaxRate + ficaSavings;
  // Post-retirement RSU vests come from former employer's W-2 — full FICA always applies.
  const chadJobBonusNetMultPostRet = 1 - chadJobTaxRate;
  const chadJobHealthSavings = chadJob ? (s.chadJobHealthSavings || 4200) : 0;
  // MSFT stock-price growth applied to refresh-grant vests. Refresh sliders
  // are nominal dollars at issue: a $50K grant in year 3 buys fewer shares
  // than a $50K grant in year 1 because MSFT has appreciated. Each vest's
  // dollar payout scales from ISSUE → VEST (not from project start), so
  // share count drops over time but each grant's own vests grow within its
  // 5-yr cycle.
  const msftGrowthPct = s.msftGrowth || 0;
  const msftMultIssueToVest = (issueMonth, vestMonth) => Math.pow(1 + msftGrowthPct / 100, (vestMonth - issueMonth) / 12);

  // Age-65 RSU vest continuation. Decided once per simulation based on Chad's
  // age at retirement (or override). When applies=true, refresh grants issued
  // BEFORE retirement keep vesting on their original 5-yr schedule after the
  // last paycheck. Salary/bonus/hire-stock/sign-on/401k all still stop at
  // chadRetirementMonth — only refresh vests continue.
  const age65Vest = age65VestEligibility(s, chadRetirementMonth);

  // 401k and home equity — tracked alongside savings for deficit drawdown
  const monthly401kRate = Math.pow(1 + (s.return401k ?? 8) / 100, 1/12) - 1;
  const monthlyHomeRate = Math.pow(1 + (s.homeAppreciation ?? 4) / 100, 1/12) - 1;
  // D7 (remediation 2026-06-09): effective income-tax rate on 401(k) deficit
  // withdrawals. Defensive clamp below 100% — the gross-up divides by (1-rate)
  // (schema RANGE caps the field at 60, but raw callers may pass anything).
  const deficit401kTaxRate = Math.min(Math.max((s.deficit401kTaxRate ?? 25) / 100, 0), 0.99);

  // D4 (remediation 2026-06-09): capital-items funding source.
  // 'advance' (default) keeps the historical behavior — one-time capital items
  // and the retire-debt payoff are funded externally (Dad's advance) and never
  // touch savings. 'savings' deducts them from the savings balance at MONTH 0:
  // capital items carry no scheduled-month field on their shape ({id, name,
  // description, cost, include, likelihood}), so the model treats them as
  // immediate outlays. The deduction uses the same likelihood-weighted
  // EXPECTED total as the advance-ask metric (computeOneTimeTotal, D6b) so
  // the engine and every display surface agree. Note: like the van sale and
  // SSDI back pay, this one-time event re-fires when buildReforecast re-runs
  // the simulation from month 0 with an updated starting balance.
  const capitalFromSavings = s.capitalFundingSource === 'savings';
  const debtPayoffTotal = (s.debtCC || 0) + (s.debtPersonal || 0) + (s.debtIRS || 0) + (s.debtFirstmark || 0);
  const capitalOutlayAtStart = capitalFromSavings
    ? computeOneTimeTotal(s.capitalItems) + (s.retireDebt ? debtPayoffTotal : 0)
    : 0;

  const monthlyData = [];
  let balance = s.startingSavings || 0;
  let bal401k = s.starting401k || 0;
  let homeEquity = s.homeEquity || 0;
  // B1/B2 (remediation 2026-06-10, item 1.7 via improvement b-3): whole-check
  // earnings-test withholding state. SSA withholds WHOLE monthly checks from
  // the start of each calendar year until the year's required withholding is
  // recovered (the boundary month pays the remainder — net of SSA's
  // reconciliation repayment). ssMonthsWithheld counts ONLY months with NO
  // benefit payable (20 CFR 404.412) — partial-boundary months do NOT count
  // toward the ARF recredit.
  let ssMonthsWithheld = 0;
  let ssTotalAmountWithheld = 0;
  let ssEtYear = -1;              // calendar-year index of the current withholding cycle
  let ssEtWithheldThisYear = 0;   // cumulative withheld in the current calendar year
  let ssPersonalAtFra = null;     // B2: ARF-recredited personal benefit, fixed at FRA
  // B7 (item 1.8): the $1-per-$3 FRA-year tier is CALENDAR-YEAR anchored.
  // The attainment month (SS_FRA_MONTH − 1 = m=78, Sep 2032) and later are
  // fully exempt; the FRA-year tier applies only to earlier months of the
  // FRA calendar year (m=70..77 for this household).
  const ssFraAttainMonth = SS_FRA_MONTH - 1;
  const ssFraCalYear = Math.floor((ssFraAttainMonth + PROJECTION_START_MONTH) / 12);
  // A8 (remediation 2026-06-10, item 1.6): earnings test on Sarah's SPOUSAL
  // benefit vs her own net SE earnings while she is under HER FRA — the same
  // whole-check semantics as Chad's test above. Fully-withheld months earn
  // the ARF recredit at her FRA: the early-claim reduction is recomputed
  // with those months removed (clamped at the full FRA ceiling).
  const sarahCurAgeForFra = s.sarahCurrentAge ?? 59;
  const sarahFraMonth = Math.max(0, Math.round((SS_FRA - sarahCurAgeForFra) * 12));
  const sarahFraCalYear = Math.floor((sarahFraMonth + PROJECTION_START_MONTH) / 12);
  const sarahSpousalMonthsEarlyAtClaim = Math.max(0, Math.round((SS_FRA - (s.sarahSpousalClaimAge || 67)) * 12));
  let sarahEtYear = -1;
  let sarahEtWithheldThisYear = 0;
  let sarahSpousalMonthsWithheld = 0;
  let sarahSpousalAtFra = null; // ARF-recredited spousal, fixed at her FRA

  // Sarah's practice stops at her work duration
  const sarahRetirementMonth = s.sarahWorkMonths || 72;

  for (let m = 0; m <= months; m++) {
    let sarahIncome = 0;
    let sarahGross = 0; // A8: her net SE earnings drive the spousal earnings test
    if (m <= sarahRetirementMonth) {
      const rate = Math.min(s.sarahRate * Math.pow(1 + s.sarahRateGrowth / 100, m / 12), s.sarahMaxRate);
      const clients = Math.min(s.sarahCurrentClients * Math.pow(1 + s.sarahClientGrowth / 100, m / 12), s.sarahMaxClients);
      sarahGross = Math.round(rate * clients * DAYS_PER_MONTH);
      sarahIncome = Math.round(sarahGross * (1 - (s.sarahTaxRate ?? 25) / 100));
    }
    const msftSmoothed = getVestingMonthly(m, s.msftGrowth || 0, s.msftPrice);
    const msftLump = getVestingLumpSum(m, s.msftGrowth || 0, s.msftPrice);
    const trustLLC = m < trustMonth ? trustNow : trustFuture;

    // Chad's job income (after tax) — salary compounds with annual raise; bonus
    // is paid as a lump sum once per year in the configured calendar month
    // (default September). First-year bonus prorated by months worked when
    // chadJobBonusProrateFirst is true; otherwise it pays only after a full
    // year of employment.
    let chadJobIncome = 0;
    let chadJobSalaryNet = 0;
    let chadJobBonusNet = 0;
    let chadJobStockRefreshNet = 0;
    let chadJobStockHireNet = 0;
    let chadJobSignOnNet = 0;
    let chadJobBonusGross = 0;
    let chadJobStockGross = 0;
    let chadJob401kFlow = 0;          // Total monthly 401(k) outflow from take-home (deferral + Roth catch-up)
    let chadJob401kContribGross = 0;   // Pre-tax + Roth contribution this month (excludes match)
    let chadJob401kMatchGross = 0;     // Employer match this month
    let chadCurrentAnnualSalary = 0;
    const inWorkWindow = chadJob && m >= chadJobStartMonth && m <= chadRetirementMonth;
    const inVestContinuation = chadJob && m > chadRetirementMonth && age65Vest.applies;
    if (inWorkWindow) {
      const monthsWorked = m - chadJobStartMonth;
      const lvl = levelAtMonthsWorked(monthsWorked, s);
      // Raises compound on anniversary of the current level (or hire if pre-promotion).
      // Math.floor preserves the existing pre-promotion test contract (raises step on
      // each completed year of work, not continuously).
      const yearsAtCurrentLevel = Math.floor((monthsWorked - lvl.promoMonthsWorked) / 12);
      chadCurrentAnnualSalary = lvl.salary * Math.pow(1 + chadJobRaisePct, yearsAtCurrentLevel);
      const monthlySalaryGross = chadCurrentAnnualSalary / 12;
      // Pre-tax 401(k) deferral reduces taxable salary BEFORE applying the netMult (federal + FICA savings).
      // Roth catch-up does NOT reduce taxable salary (post-tax) but still leaves cashflow.
      const taxableSalaryGross = Math.max(0, monthlySalaryGross - chadJob401kDeferralMonthly);
      // Pension is pre-tax for federal income tax but FICA still applies on full gross.
      // Apply the salary netMult to the full taxable gross, then subtract the pension dollar
      // weighted by its own cashflow mult (saves income tax, still pays FICA).
      const pensionDeduction = monthlySalaryGross * pensionContrib;
      // B6 (remediation 2026-06-10, item 3.5): IRC §3121(v)(1)(A) — 401(k)
      // elective deferrals are STILL FICA wages. Subtracting the deferral
      // before the all-in netMult wrongly "saved" the 7.65% FICA too; add it
      // back at the same rate the pension uses (Medicare-only 1.45% when the
      // employer is non-SS-covered). Mirrored in w2Diagnostic.js.
      chadJobSalaryNet = Math.round(
        taxableSalaryGross * chadJobSalaryNetMult
        - pensionDeduction * pensionCashflowMult
        - chadJob401kDeferralMonthly * ficaRateOnPension
        - chadJob401kCatchupRothMonthly
      );
      chadJob401kContribGross = Math.round(chadJob401kDeferralMonthly + chadJob401kCatchupRothMonthly);
      chadJob401kMatchGross = Math.round(chadJob401kMatchMonthly);
      chadJob401kFlow = chadJob401kContribGross; // outflow from take-home (employee side)

      // Lump-sum bonus on the configured calendar month, after at least 1 month
      // of employment (so a same-month start doesn't pay an instant bonus).
      // Bonus % comes from current level — bonus paid at promotion year uses
      // the new level's pct on whatever salary is in effect at the bonus month.
      const calendarMonthOfYear = (m + PROJECTION_START_MONTH) % 12;
      if (lvl.bonusPct > 0 && monthsWorked > 0 && calendarMonthOfYear === chadJobBonusMonth) {
        let bonusFraction;
        if (monthsWorked >= 12) {
          bonusFraction = 1;
        } else if (chadJobBonusProrateFirst) {
          bonusFraction = monthsWorked / 12;
        } else {
          bonusFraction = 0; // strict eligibility — no bonus until 1 full year
        }
        chadJobBonusGross = chadCurrentAnnualSalary * lvl.bonusPct * bonusFraction;
        chadJobBonusNet = Math.round(chadJobBonusGross * chadJobBonusNetMult);
      }

      // Stock comp — both schedules are lumpy.
      // Refresh: ALWAYS issued end-of-August (MSFT performance review cycle).
      // First refresh = first August at or after chadJobStartMonth + chadJobRefreshStartMonth
      // (default refreshStartMonth=12 = "after first review"). Subsequent grants
      // every 12 months (still August). Each grant vests 5% per quarter on
      // Feb/May/Aug/Nov for 20 quarters (5 years).
      // Grant SIZE is determined by the level in effect at the grant's issuance
      // month, so a grant issued during L63 keeps L63 size through its full
      // 5-year vest even after Chad is promoted to L64.
      let refreshGrossThisMonth = 0;
      if (isStockVestMonth(m) && monthsWorked >= 0) {
        const firstRefreshIssue = firstAugustAtOrAfter(chadJobStartMonth + chadJobRefreshStartMonth);
        for (let g = 0; ; g++) {
          const issueMonth = firstRefreshIssue + 12 * g;
          if (issueMonth >= m) break; // no instant vest on grant date; stops iteration once future
          const grantSize = levelAtMonthsWorked(issueMonth - chadJobStartMonth, s).refresh;
          if (grantSize <= 0) continue;
          const firstVest = nextStockVestMonthAfter(issueMonth);
          if (m < firstVest) continue;
          const vestIdx = (m - firstVest) / 3; // integer — both endpoints are vest months
          if (vestIdx >= 0 && vestIdx < 20) {
            refreshGrossThisMonth += grantSize * 0.05 * msftMultIssueToVest(issueMonth, m);
          }
        }
      }
      // Hire stock: lump on each work anniversary (start + 12, +24, +36, +48).
      // Each Y1-Y4 slider value is the dollar value AT HIRE; vests appreciate
      // with msftGrowth from hire month → vest month (matches refresh treatment).
      let hireGrossThisMonth = 0;
      if (monthsWorked > 0 && monthsWorked % 12 === 0) {
        const yearIdx = monthsWorked / 12 - 1; // m=startMonth+12 → Y1 amount
        if (yearIdx >= 0 && yearIdx < 4) {
          hireGrossThisMonth = chadJobHireStock[yearIdx] * msftMultIssueToVest(chadJobStartMonth, m);
        }
      }
      chadJobStockGross = refreshGrossThisMonth + hireGrossThisMonth;
      chadJobStockRefreshNet = refreshGrossThisMonth > 0 ? Math.round(refreshGrossThisMonth * chadJobBonusNetMult) : 0;
      chadJobStockHireNet = hireGrossThisMonth > 0 ? Math.round(hireGrossThisMonth * chadJobBonusNetMult) : 0;

      // Cash sign-on bonus — 50% on hire date (m === startMonth), 50% on 1-yr anniversary.
      if (chadJobSignOnCash > 0) {
        if (monthsWorked === 0) {
          chadJobSignOnNet = Math.round(chadJobSignOnCash * 0.5 * chadJobBonusNetMult);
        } else if (monthsWorked === 12) {
          chadJobSignOnNet = Math.round(chadJobSignOnCash * 0.5 * chadJobBonusNetMult);
        }
      }

      chadJobIncome = chadJobSalaryNet + chadJobBonusNet + chadJobStockRefreshNet + chadJobStockHireNet + chadJobSignOnNet;
    } else if (inVestContinuation && isStockVestMonth(m)) {
      // Post-retirement RSU vest continuation under the age-65 rule.
      //
      // 1-year cliff: only grants issued > 12 months before retirement keep
      // vesting. Grants issued in the final pre-retirement year are forfeited
      // (matches MSFT and most employer policies — the first vest typically
      // hasn't happened yet for those grants). User-specified rule.
      //
      // Salary, bonus, hire stock, sign-on, 401(k) all stop at retirement —
      // only refresh vests continue. FICA still applies via former employer's W-2.
      const firstRefreshIssue = firstAugustAtOrAfter(chadJobStartMonth + chadJobRefreshStartMonth);
      let refreshGrossThisMonth = 0;
      for (let g = 0; ; g++) {
        const issueMonth = firstRefreshIssue + 12 * g;
        if (issueMonth >= m) break;
        if (issueMonth > chadRetirementMonth) break; // no grants issued post-retirement
        if (!clearsOneYearCliff(issueMonth, chadRetirementMonth)) continue;
        const grantSize = levelAtMonthsWorked(issueMonth - chadJobStartMonth, s).refresh;
        if (grantSize <= 0) continue;
        const firstVest = nextStockVestMonthAfter(issueMonth);
        if (m < firstVest) continue;
        const vestIdx = (m - firstVest) / 3;
        if (vestIdx >= 0 && vestIdx < 20) {
          refreshGrossThisMonth += grantSize * 0.05 * msftMultIssueToVest(issueMonth, m);
        }
      }
      if (refreshGrossThisMonth > 0) {
        chadJobStockGross = refreshGrossThisMonth;
        // BUG #5: Former-employer W-2 always withholds full FICA — the noFICA toggle from
        // active employment does NOT carry over post-retirement. Use a netMult without
        // the ficaSavings addback for these vest checks.
        chadJobStockRefreshNet = Math.round(refreshGrossThisMonth * chadJobBonusNetMultPostRet);
        chadJobIncome = chadJobStockRefreshNet;
      }
    }

    // SS/SSDI income — SS retirement can coexist with job (earnings test applies);
    // SSDI requires no job (SGA rules)
    //
    // ssBenefit is the TOTAL benefit (personal + family auxiliary if kids eligible).
    // ssBenefitPersonal is the personal-only amount that would apply if no kids
    // were eligible. Charts use the difference (ssBenefit - ssBenefitPersonal) to
    // show kids' auxiliary share. CRITICAL: ssBenefitPersonal must reflect what
    // THIS month's simulation actually produced, not a stale stored value, so the
    // chart tooltip correctly attributes the kids portion only when kids are active.
    let ssBenefit = 0;
    let ssBenefitPersonal = 0;
    if (useSS) {
      if (m >= ssStartMonth) {
        // B2 (remediation 2026-06-10, item 1.7): apply the SSA recredit (ARF)
        // at FRA in the MAIN projection. The benefit is recomputed once with
        // the fully-withheld months removed from the early-claim reduction —
        // the same ssRecalculatedBenefit the RetirementIncomeChart already
        // uses, so monthlyData and the retirement sim finally agree.
        let personalNow = ssPersonal;
        if (m >= SS_FRA_MONTH) {
          if (ssPersonalAtFra === null) {
            ssPersonalAtFra = (s.ssPIA || 0) > 0
              ? ssRecalculatedBenefit(s.ssPIA, s.ssClaimAge || 67, ssMonthsWithheld)
              : ssPersonal;
          }
          personalNow = ssPersonalAtFra;
        }
        ssBenefit = (m < ssStartMonth + ssKidsAgeOutMonths) ? ssFamilyTotal : personalNow;
        ssBenefitPersonal = personalNow;
      }
    } else if (!chadJob && m >= effectiveSsdiApproval) {
      // FIX #8: Kids age-out is CALENDAR-ANCHORED, not relative to approval month.
      // B4 (remediation 2026-06-10): anchored to SS_CHILD_BENEFIT_END_MONTH (=40,
      // student rule — benefits run through HS graduation June 2029), not the 18th
      // birthday (TWINS_AGE_OUT_MONTH=34, kept for the CTC).
      // The legacy `kidsAgeOutMonths` state field (default 36) is preserved for back-compat
      // (still used to bound auxiliary back-pay months above), but ignored on this path.
      ssBenefit = m < SS_CHILD_BENEFIT_END_MONTH ? s.ssdiFamilyTotal : s.ssdiPersonal;
      ssBenefitPersonal = s.ssdiPersonal || 0;
    }
    // Post-employment benefit: when Chad finishes his W-2 job and no SS income
    // is currently flowing (the pre-job ssType branch was suppressed by chadJob),
    // pay whatever post-job benefit the user selected. Three modes:
    //   'ssRetirement' (default) — pay PIA-adjusted SS amount, but only once Chad
    //                              has reached ssClaimAge (age-gated). If he retires
    //                              early, there's a gap until claim age.
    //   'ssdi'                   — pay SSDI personal/family immediately after the
    //                              job ends (with kids age-out via TWINS_AGE_OUT_MONTH).
    //   'none'                   — no post-job benefit.
    // postJobBenefit defaults to 'ssRetirement' so saved scenarios from before this
    // field existed get the conservative age-gated behavior, NOT the prior bug
    // (which paid the FRA amount immediately regardless of Chad's actual age).
    let postJobBenefitTypeThisMonth = null;
    if (ssBenefit === 0 && chadJob && m > chadRetirementMonth) {
      const postJobMode = s.postJobBenefit || 'ssRetirement';
      if (postJobMode === 'ssRetirement') {
        const claimAge = s.ssClaimAge || 67;
        // Age gate anchored to the SAME calendar math as the pre-job SS path
        // (gatherState.js: ssStartMonth = (claimAge − 62) × 12 + SS_START_OFFSET,
        // where SS_START_OFFSET is the months from baseline Mar 2026 to Chad's
        // first eligible month at 62 — mid-September birthday → Oct 2027, m=19).
        // Remediation 2026-06-09 item 2.4: the previous gate
        // ((chadCurrentAge × 12 + m) >= claimAge × 12) treated Chad as exactly
        // chadCurrentAge years old at m=0 and fired ~7 months early.
        const ssAnchorStartMonth = (claimAge - 62) * 12 + SS_START_OFFSET;
        if (m >= ssAnchorStartMonth) {
          const piaForFallback = s.ssPIA || 0;
          const computedSS = piaForFallback > 0
            ? Math.round(piaForFallback * ssAdjustmentFactor(claimAge))
            : (ssPersonal || 0);
          ssBenefit = computedSS;
          ssBenefitPersonal = computedSS;
          postJobBenefitTypeThisMonth = 'retirement';
        }
      } else if (postJobMode === 'ssdi') {
        // SSDI starts the month after retirement. Kids auxiliary uses the
        // same SS_CHILD_BENEFIT_END_MONTH calendar anchor (B4, student rule)
        // as the pre-job SSDI branch.
        ssBenefit = m < SS_CHILD_BENEFIT_END_MONTH
          ? (s.ssdiFamilyTotal || 0)
          : (s.ssdiPersonal || 0);
        ssBenefitPersonal = s.ssdiPersonal || 0;
        postJobBenefitTypeThisMonth = 'ssdi';
      }
      // 'none' — leave ssBenefit at 0
    }

    // Sarah's spousal SS — flows once she reaches sarahSpousalClaimAge AND Chad
    // has claimed (signaled by ssBenefit > 0, which covers SSDI, SS retirement,
    // and the post-retirement auto-SS fallback above). When the toggle is off,
    // gatherState sets sarahSpousalStartMonth=999 so this branch never fires.
    // Tracked as a separate field on monthlyData so charts can show "Chad SS"
    // vs "Sarah spousal" distinctly; flows into cashIncome below.
    let sarahSpousal = 0;
    const sarahSpousalEnabled = s.sarahSpousalEnabled !== false;
    if (
      sarahSpousalEnabled
      && m >= (s.sarahSpousalStartMonth ?? 999)
      && ssBenefit > 0
      // A7 (remediation 2026-06-10, item 1.5): suppress spousal inside the
      // family-maximum window. While the kids' auxiliary share is flowing
      // (ssBenefit > ssBenefitPersonal), the aux pool (FMAX − PIA) is already
      // fully consumed by the two children — Sarah's spousal would have to
      // come out of the same capped pool, so SSA pays her $0 until a child
      // ages out and frees pool room. Modeled as full suppression while any
      // kids' share is being paid (two kids at 50% each exhaust the pool at
      // this household's PIA).
      && ssBenefit <= ssBenefitPersonal
    ) {
      if (m >= sarahFraMonth) {
        // A8: ARF recredit at HER FRA — recompute the spousal reduction with
        // the fully-withheld months removed (mirrors Chad's B2 recredit).
        if (sarahSpousalAtFra === null) {
          sarahSpousalAtFra = (s.ssPIA || 0) > 0
            ? Math.round(s.ssPIA * 0.5 * ssSpousalFactorFromMonthsEarly(
                Math.max(0, sarahSpousalMonthsEarlyAtClaim - sarahSpousalMonthsWithheld)))
            : (s.sarahSpousalAmount || 0);
        }
        sarahSpousal = sarahSpousalAtFra;
      } else {
        sarahSpousal = s.sarahSpousalAmount || 0;
      }
    }

    // A2 (remediation 2026-06-10, plan 1.1): SS COLA. Benefits are statutorily
    // indexed (42 U.S.C. §415(i)) but were paid flat forever while expenses
    // inflated 3%/yr — a mixed nominal/real frame that penalized the
    // benefit-dependent path (~$700–$1,050/mo of guaranteed income missing by
    // year 6). Applied to ALL SS/SSDI/spousal/child streams, gated on
    // expense inflation being ON so both ledger sides share one nominal frame
    // (D2: ssColaRate default 2.5%/yr, RANGE 0–4). ssBenefitPersonal scales by
    // the same factor so the kids' share (ssBenefit − ssBenefitPersonal)
    // remains internally consistent for chart tooltips. The earnings test
    // below operates on the COLA'd amount (SSA withholds from current-year
    // benefits). Back pay is NOT COLA'd — it compensates past months.
    if (s.expenseInflation && (ssBenefit > 0 || sarahSpousal > 0)) {
      const ssColaFactor = Math.pow(1 + (s.ssColaRate ?? 2.5) / 100, m / 12);
      ssBenefit = Math.round(ssBenefit * ssColaFactor);
      ssBenefitPersonal = Math.round(ssBenefitPersonal * ssColaFactor);
      sarahSpousal = Math.round(sarahSpousal * ssColaFactor);
    }

    // Consulting: only when not employed full-time
    const consulting = (m > chadRetirementMonth) ? 0
      : chadJob ? 0
      : useSS
        ? (m >= ssStartMonth ? (s.chadConsulting || 0) : 0)
        : (m >= effectiveSsdiApproval ? Math.min(s.chadConsulting || 0, SGA_LIMIT) : 0);
    // SS earnings test: applies to total earned income (salary if employed, consulting if not).
    // B7 (2026-06-10): calendar-year anchored — exempt from the FRA-attainment
    // month (m=78) onward; the $1/$3 FRA-year tier applies only inside the FRA
    // calendar year (m=70..77).
    const ssPreTestBenefit = ssBenefit;
    if (useSS && ssBenefit > 0 && m < ssFraAttainMonth) {
      const isEmployed = chadJob && m >= chadJobStartMonth && m <= chadRetirementMonth;
      // FIX #7: Annualized stock comp for SS earnings test — chadJobStockGross is
      // lumpy (only nonzero on quarterly vest / anniversary months), so project
      // the expected annual stock comp from the current year of employment.
      const yearsWorkedForSS = Math.max(0, Math.floor((m - chadJobStartMonth) / 12));
      // FIX #7a: Hire stock — Y1 lump pays at the 1-year ANNIVERSARY, not in Y0.
      // So during employment year 1 (yearsWorkedForSS=0), no hire stock has paid yet
      // for SS earnings test purposes. yearsWorkedForSS=1 → Y1 anniversary fell this
      // calendar year → use chadJobHireStock[0]. Index = yearsWorkedForSS - 1.
      // Y4 (yearsWorkedForSS=4) is the last year where Y4 lump pays this calendar year.
      const hireStockForSS = (yearsWorkedForSS >= 1 && yearsWorkedForSS <= 4)
        ? (chadJobHireStock[yearsWorkedForSS - 1] || 0)
        : 0;
      // FIX #7b: Refresh grants vest 60 months (5 years × 4 quarters) from issuance.
      // Old logic: Math.min(5, floor(...) + 1) — never dropped below 5 even when
      // grant 1 had expired after 5+ years. New logic: count grants whose 60-month
      // vesting window still includes month m. Each grant carries the size in
      // effect at its issuance month (level-aware after promotions).
      // Remediation 2026-06-09 phase 5: issuance months use the SAME August
      // alignment as the actual vest engine above (firstAugustAtOrAfter + 12·g),
      // so the earnings-test estimate matches what actually vests instead of
      // assuming grants issue at start + refreshStart + 12·g.
      // C18 (2026-06-10): include the msftGrowth appreciation factor in the
      // wage estimate — each grant's expected annual vests scale from
      // issuance to the test month, matching the actual vest engine's
      // issue→vest scaling. Zero-impact at the default msftGrowth=0.
      let annualStockFromRefresh = 0;
      const firstRefreshIssueForSS = firstAugustAtOrAfter(chadJobStartMonth + chadJobRefreshStartMonth);
      for (let g = 0; ; g++) {
        const issueMonth = firstRefreshIssueForSS + 12 * g;
        if (issueMonth >= m) break;        // not yet issued (no instant vest on grant date)
        if (m - issueMonth >= 60) continue; // grant fully vested
        const grantSize = levelAtMonthsWorked(issueMonth - chadJobStartMonth, s).refresh;
        annualStockFromRefresh += grantSize * 0.20 * msftMultIssueToVest(issueMonth, m); // 20% per year while vesting
      }
      const annualStockProjected = annualStockFromRefresh
        + hireStockForSS * msftMultIssueToVest(chadJobStartMonth, m); // C18: hire vests appreciate from hire month
      // Sign-on cash: 50% in employment year 0, 50% in year 1.
      const signOnYear = yearsWorkedForSS === 0 || yearsWorkedForSS === 1 ? chadJobSignOnCash * 0.5 : 0;
      // Bonus pct comes from current level (month m) — bonus due this year reflects
      // promotion if Chad has been promoted by m.
      const currentBonusPct = levelAtMonthsWorked(m - chadJobStartMonth, s).bonusPct;
      const annualEarned = isEmployed
        ? chadCurrentAnnualSalary * (1 + currentBonusPct) + annualStockProjected + signOnYear  // salary + bonus + RSU + sign-on
        : consulting * 12;                                                                       // annualized consulting
      // B7: derive the calendar year from the projection month. The FRA-year
      // ($1/$3, higher limit) tier applies only inside the FRA calendar year;
      // earlier years use the standard ($1/$2) tier. (m >= attainment month
      // was excluded above.)
      const calYear = Math.floor((m + PROJECTION_START_MONTH) / 12);
      if (calYear !== ssEtYear) { ssEtYear = calYear; ssEtWithheldThisYear = 0; }
      if (annualEarned > 0) {
        const inFraCalYear = calYear === ssFraCalYear;
        const exemptAmount = inFraCalYear ? SS_EARNINGS_LIMIT_FRA_YEAR : SS_EARNINGS_LIMIT_ANNUAL;
        const divisor = inFraCalYear ? 3 : 2;
        const requiredWithholding = Math.round(Math.max(0, annualEarned - exemptAmount) / divisor);
        // B1 (improvement b-3): whole-check withholding — SSA withholds FULL
        // monthly checks from the start of the year until the required annual
        // amount is recovered; the boundary month pays the remainder (the
        // partial SSA repays at reconciliation), then full checks resume.
        const remaining = Math.max(0, requiredWithholding - ssEtWithheldThisYear);
        const withheldThisMonth = Math.min(ssBenefit, remaining);
        ssBenefit -= withheldThisMonth;
        ssEtWithheldThisYear += withheldThisMonth;
      }
    }
    if (useSS && ssPreTestBenefit > 0) {
      const ssWithheldThisMonth = ssPreTestBenefit - ssBenefit;
      if (ssWithheldThisMonth > 0) {
        ssTotalAmountWithheld += ssWithheldThisMonth;
        // B1: ARF counts only months with NO benefit payable (20 CFR 404.412)
        // — a partially-paid boundary month does not earn a recredit month.
        if (ssBenefit === 0) ssMonthsWithheld++;
      }
    }

    // A8 (2026-06-10, item 1.6): earnings test on Sarah's spousal vs HER net
    // SE earnings while under HER FRA — whole-check withholding (B1
    // semantics), annualized from her current-month practice earnings (the
    // model has no Schedule C expense layer, so gross revenue is her net SE
    // earnings). Exempt from her FRA-attainment month onward; the $1/$3 tier
    // applies inside her FRA calendar year.
    if (sarahSpousal > 0 && m < sarahFraMonth) {
      const sarahCalYear = Math.floor((m + PROJECTION_START_MONTH) / 12);
      if (sarahCalYear !== sarahEtYear) { sarahEtYear = sarahCalYear; sarahEtWithheldThisYear = 0; }
      const sarahAnnualSeEarnings = sarahGross * 12;
      if (sarahAnnualSeEarnings > 0) {
        const inSarahFraCalYear = sarahCalYear === sarahFraCalYear;
        const sarahExempt = inSarahFraCalYear ? SS_EARNINGS_LIMIT_FRA_YEAR : SS_EARNINGS_LIMIT_ANNUAL;
        const sarahDivisor = inSarahFraCalYear ? 3 : 2;
        const sarahRequired = Math.round(Math.max(0, sarahAnnualSeEarnings - sarahExempt) / sarahDivisor);
        const sarahRemaining = Math.max(0, sarahRequired - sarahEtWithheldThisYear);
        const sarahWithheld = Math.min(sarahSpousal, sarahRemaining);
        if (sarahWithheld > 0) {
          sarahSpousal -= sarahWithheld;
          sarahEtWithheldThisYear += sarahWithheld;
          // ARF: only months with NO spousal payable count toward her recredit.
          if (sarahSpousal === 0) sarahSpousalMonthsWithheld++;
        }
      }
    }

    // A1 INTERIM (2026-06-10, until P7 engine wiring — see module constants):
    // haircut the ADULT share of the benefit streams by the effective SS tax
    // rate (0.85 × 22% = 18.7%). Gross amounts are preserved on the row
    // (ssBenefitGross / sarahSpousalGross) for the tax layer and tooltips.
    // ssBenefitPersonal nets by the same rate so the kids' untaxed share
    // (ssBenefit − ssBenefitPersonal) is unchanged by the haircut. Applied
    // AFTER COLA and the earnings test (tax is on what SSA actually pays),
    // and after the withheld-month counters (which track gross withholding).
    const ssBenefitGross = ssBenefit;
    const sarahSpousalGross = sarahSpousal;
    ssBenefit = applyInterimSsTax(ssBenefit, ssBenefitPersonal);
    if (ssBenefitPersonal > 0) ssBenefitPersonal = Math.round(ssBenefitPersonal * (1 - SS_INTERIM_TAX_HAIRCUT));
    if (sarahSpousal > 0) sarahSpousal = Math.round(sarahSpousal * (1 - SS_INTERIM_TAX_HAIRCUT));

    const investReturn = balance > 0 ? Math.round(balance * monthlyReturnRate) : 0;

    // Base living expenses with optional inflation (debt/van/BCS are fixed contracts, not inflated)
    let inflatedBase = s.baseExpenses;
    if (s.expenseInflation) {
      inflatedBase = Math.round(inflatedBase * Math.pow(1 + (s.expenseInflationRate || 0) / 100, m / 12));
    }
    // Track expense breakdown so tooltips can show the math that rolls up to `expenses`.
    const expenseBreakdown = { baseLiving: inflatedBase };
    let expenses = inflatedBase;
    if (!s.retireDebt) {
      expenses += s.debtService;
      expenseBreakdown.debtService = s.debtService;
    }
    // Van: if sold, monthly cost stops at sale month; if not sold, cost continues forever
    const vanSaleMonth = s.vanSaleMonth ?? 12;
    if (s.vanSold) {
      if (m < vanSaleMonth) {
        expenses += (s.vanMonthlySavings || 0); // still paying before sale
        expenseBreakdown.van = s.vanMonthlySavings || 0;
      }
    } else {
      expenses += (s.vanMonthlySavings || 0); // never sold, always paying
      expenseBreakdown.van = s.vanMonthlySavings || 0;
    }
    const totalCuts = (s.lifestyleCuts || 0) + (s.cutInHalf || 0) + (s.extraCuts || 0);
    if (s.lifestyleCutsApplied) {
      const appliedCuts = Math.round(totalCuts * cutsDiscipline);
      expenses -= appliedCuts;
      expenseBreakdown.lifestyleCuts = -appliedCuts;
    }
    if (m < (s.bcsYearsLeft ?? 3) * 12) {
      expenses += s.bcsFamilyMonthly;
      expenseBreakdown.bcs = s.bcsFamilyMonthly;
    }
    let milestoneSavings = 0;
    for (const mi of ms) { if (m >= mi.month) milestoneSavings += (mi.savings || 0); }
    if (milestoneSavings > 0) {
      expenses -= milestoneSavings;
      expenseBreakdown.milestones = -milestoneSavings;
    }
    // Employer health insurance savings — applied for ALL months once Chad has
    // started his job (no retirement boundary). User-specified: post-retirement
    // healthcare is covered by retiree benefits / Sarah's practice / Medicare,
    // so expenses should NOT jump up at retirement when the employer subsidy
    // would otherwise end.
    if (chadJob && m >= chadJobStartMonth) {
      expenses -= chadJobHealthSavings;
      expenseBreakdown.healthInsurance = -chadJobHealthSavings;
    }
    // One-time extras: temporary additional costs for a limited duration
    const oneTimeExtras = s.oneTimeExtras || 0;
    const oneTimeMonths = s.oneTimeMonths || 0;
    if (oneTimeExtras > 0 && m < oneTimeMonths) {
      expenses += oneTimeExtras;
      expenseBreakdown.oneTimeExtras = oneTimeExtras;
    }
    expenses = Math.max(expenses, 0);

    // Canonical monthly cash-flow rows use actual vest timing so they reconcile to
    // savings balance changes. Keep smoothed MSFT as an explicit secondary series.
    // sarahSpousal flows in alongside ssBenefit; tracked separately on the row so
    // tooltips can attribute "Chad SS" vs "Sarah spousal" distinctly.
    const cashIncome = sarahIncome + msftLump + trustLLC + ssBenefit + sarahSpousal + consulting + chadJobIncome + customLeverMonthly;
    const cashIncomeSmoothed = sarahIncome + msftSmoothed + trustLLC + ssBenefit + sarahSpousal + consulting + chadJobIncome + customLeverMonthly;

    balance += investReturn;
    balance += (cashIncome - expenses);
    // D4: savings-funded one-time capital outlay (+ debt payoff when retireDebt
    // is on) leaves the savings balance once, at month 0. See block above loop.
    if (m === 0 && capitalOutlayAtStart > 0) {
      balance -= capitalOutlayAtStart;
    }
    // FIX RA-3: only deposit back-pay when SSDI is actually active (effectiveSsdiApproval !== 999)
    // AND backPayActual > 0. Previously the m===999+2 branch could fire on long projections.
    if (effectiveSsdiApproval !== 999 && backPayActual > 0 && m === effectiveSsdiApproval + 2) {
      balance += backPayActual;
    }
    // FIX #10: Van sale at sale month — handle BOTH shortfall (sale price < loan)
    // AND positive equity (sale price > loan). Previously only deficit was handled,
    // silently dropping any positive proceeds.
    if (s.vanSold && m === vanSaleMonth) {
      const vanShortfall = Math.max(0, (s.vanLoanBalance || 0) - (s.vanSalePrice || 0));
      const vanProceeds = Math.max(0, (s.vanSalePrice || 0) - (s.vanLoanBalance || 0));
      balance -= vanShortfall;
      balance += vanProceeds;
    }

    // FIX M-Sym: BOTH 401k and home equity grow BEFORE drawdown so they're
    // symmetric. Previously 401k grew before drawdown but home grew after,
    // creating an inconsistent treatment of the two reserves.
    // (skip month 0 to match standalone behavior — the starting balance is the snapshot)
    if (m > 0) bal401k *= (1 + monthly401kRate);
    // 401(k) contributions: employee (pre-tax + Roth catch-up) + employer match flow into bal401k
    // each employed month. Added AFTER monthly growth so this month's contribution doesn't earn
    // a free month of return (matches typical end-of-month payroll deposit semantics).
    if (chadJob401kContribGross > 0 || chadJob401kMatchGross > 0) {
      bal401k += chadJob401kContribGross + chadJob401kMatchGross;
    }
    bal401k = Math.round(bal401k);
    if (m > 0) homeEquity = Math.round(homeEquity * (1 + monthlyHomeRate));

    // Deficit transfer chain: savings → 401(k) → home equity.
    // D7 (remediation 2026-06-09): 401(k) dollars are PRE-TAX — covering $1 of
    // net deficit requires withdrawing 1/(1-rate) gross. withdrawal401k is the
    // GROSS amount leaving the account; only the after-tax net lands in savings.
    let withdrawal401k = 0;
    let withdrawalHome = 0;
    if (balance < 0 && bal401k > 0) {
      const netNeeded = Math.round(-balance);
      const grossNeeded = Math.ceil(netNeeded / (1 - deficit401kTaxRate));
      withdrawal401k = Math.min(grossNeeded, bal401k);
      // When the account fully covers the gross, credit the exact net so the
      // balance lands at 0 (avoids ±$1 rounding residue spilling into home equity).
      const netReceived = withdrawal401k === grossNeeded
        ? netNeeded
        : Math.floor(withdrawal401k * (1 - deficit401kTaxRate));
      balance += netReceived;
      bal401k -= withdrawal401k;
    }
    // If still negative after the 401(k) is exhausted, draw on home equity.
    // This is a SALE OF EQUITY, not a HELOC: equity converts to cash
    // dollar-for-dollar with no loan, no interest, and no tax (primary-
    // residence exclusion). Previously labeled "HELOC" while carrying no
    // interest — renamed for honesty (D7).
    if (balance < 0 && homeEquity > 0) {
      withdrawalHome = Math.min(Math.round(-balance), homeEquity);
      balance += withdrawalHome;
      homeEquity -= withdrawalHome;
    }

    // Label the benefit source so charts/tooltips show 'SSDI' vs 'SS retirement'
    // correctly. Pre-job: useSS toggle decides. Post-job: the postJobBenefit
    // fallback set postJobBenefitTypeThisMonth explicitly. Prior bug labeled
    // post-job SS-retirement amounts as 'ssdi' just because useSS=false.
    const ssBenefitType = ssBenefit > 0
      ? (postJobBenefitTypeThisMonth || (useSS ? 'retirement' : 'ssdi'))
      : null;
    monthlyData.push({
      month: m,
      sarahIncome, msftSmoothed, msftLump, trustLLC, ssBenefit, ssBenefitType, ssBenefitPersonal,
      // A1: pre-haircut (post-COLA, post-earnings-test) gross amounts — what
      // SSA actually pays before federal tax. The net fields above are cash.
      ssBenefitGross, sarahSpousalGross,
      sarahSpousal, // Sarah's spousal SS benefit (net of the A1 interim tax haircut)
      consulting, chadJobIncome,
      chadJobSalaryNet, chadJobBonusNet, chadJobStockRefreshNet, chadJobStockHireNet, chadJobSignOnNet,
      chadJob401kContribGross, chadJob401kMatchGross, chadJob401kFlow, // 401(k) breakdown for tooltips/audit
      customLeverMonthly, // FIX RA-2: expose on row so charts/tooltips can sum back to cashIncome
      investReturn, cashIncome, cashIncomeSmoothed, expenses, expenseBreakdown, homeEquity,
      netCashFlow: cashIncome - expenses,
      netCashFlowSmoothed: cashIncomeSmoothed - expenses,
      netMonthly: cashIncome + investReturn - expenses,
      netMonthlySmoothed: cashIncomeSmoothed + investReturn - expenses,
      balance: Math.round(balance),
      balance401k: bal401k,
      withdrawal401k,
    });
  }

  return {
    monthlyData,
    backPayActual,
    backPayTax,
    ssWithheldSummary: {
      monthsFullyWithheld: ssMonthsWithheld,
      totalAmountWithheld: ssTotalAmountWithheld,
      // A8: fully-withheld spousal months (drives her ARF recredit at FRA).
      sarahSpousalMonthsWithheld,
    },
  };
}

export function computeProjection(s) {
  const { monthlyData, backPayActual, backPayTax, ssWithheldSummary } = runMonthlySimulation(s);

  // Aggregate to quarterly snapshots for charts (every 3rd month starting at 0)
  const { labels: qLabels, monthValues: qMonthValues } = buildQuarterlySchedule(s.totalProjectionMonths || 72);
  const data = qMonthValues.map((m, i) => {
    const months = monthlyData.filter(d => d.month >= m && d.month < m + 3);
    if (months.length === 0) return null;

    const qtrInvestReturn = months.reduce((sum, d) => sum + d.investReturn, 0);
    const avgInvestReturn = Math.round(qtrInvestReturn / months.length);
    const avgCashIncome = Math.round(months.reduce((sum, d) => sum + d.cashIncome, 0) / months.length);
    const avgExpenses = Math.round(months.reduce((sum, d) => sum + d.expenses, 0) / months.length);
    const avgNetCash = Math.round(months.reduce((sum, d) => sum + d.netCashFlow, 0) / months.length);
    const avgNetMonthly = Math.round(months.reduce((sum, d) => sum + d.netMonthly, 0) / months.length);

    // Aggregate expense breakdown across the quarter (monthly average per component).
    const expenseBreakdownKeys = new Set();
    for (const mo of months) {
      if (mo.expenseBreakdown) for (const k of Object.keys(mo.expenseBreakdown)) expenseBreakdownKeys.add(k);
    }
    const expenseBreakdownAvg = {};
    for (const k of expenseBreakdownKeys) {
      const sum = months.reduce((s, mo) => s + ((mo.expenseBreakdown && mo.expenseBreakdown[k]) || 0), 0);
      expenseBreakdownAvg[k] = Math.round(sum / months.length);
    }

    return {
      label: qLabels[i], month: m,
      sarahIncome: Math.round(months.reduce((sum, d) => sum + d.sarahIncome, 0) / months.length),
      msftVesting: Math.round(months.reduce((sum, d) => sum + d.msftLump, 0) / months.length),
      trustLLC: Math.round(months.reduce((sum, d) => sum + d.trustLLC, 0) / months.length),
      ssBenefit: Math.round(months.reduce((sum, d) => sum + d.ssBenefit, 0) / months.length),
      ssBenefitType: months.find(d => d.ssBenefitType)?.ssBenefitType ?? null,
      consulting: Math.round(months.reduce((sum, d) => sum + d.consulting, 0) / months.length),
      chadJobIncome: Math.round(months.reduce((sum, d) => sum + d.chadJobIncome, 0) / months.length),
      // ChadJob breakdown (monthly avg across the quarter)
      chadJobSalary: Math.round(months.reduce((sum, d) => sum + (d.chadJobSalaryNet || 0), 0) / months.length),
      chadJobBonus: Math.round(months.reduce((sum, d) => sum + (d.chadJobBonusNet || 0), 0) / months.length),
      chadJobStockRefresh: Math.round(months.reduce((sum, d) => sum + (d.chadJobStockRefreshNet || 0), 0) / months.length),
      chadJobStockHire: Math.round(months.reduce((sum, d) => sum + (d.chadJobStockHireNet || 0), 0) / months.length),
      chadJobSignOn: Math.round(months.reduce((sum, d) => sum + (d.chadJobSignOnNet || 0), 0) / months.length),
      investReturn: avgInvestReturn,
      investReturnQtr: qtrInvestReturn,
      totalIncome: Math.round(avgCashIncome + avgInvestReturn),
      expenses: avgExpenses,
      expenseBreakdown: expenseBreakdownAvg,
      netCashFlow: avgNetCash,
      netMonthly: avgNetMonthly,
    };
  }).filter(Boolean);

  // Savings data for the chart (monthly from the same loop)
  const savingsData = monthlyData.map(d => {
    const yr = Math.floor(d.month / 12);
    const mo = d.month % 12;
    // Month 0 is the first simulated snapshot, not an opening balance.
    const label = d.month === 0 ? "M0" : d.month < 12 ? `M${d.month}` : mo === 0 ? `Y${yr}` : `Y${yr}.${Math.round(mo/12*10)/10}`;
    return { month: d.month, balance: d.balance, label };
  });

  return { data, savingsData, backPayActual, backPayTax, monthlyData, ssWithheldSummary };
}

