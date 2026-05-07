import { STOCK_VEST_CALENDAR_MONTHS, PROJECTION_START_MONTH } from './constants.js';

// Mirror of projection.js helpers — kept inline so chadLevels.js doesn't
// depend on projection.js (which would create a circular import).
function isStockVestMonth(m) {
  return STOCK_VEST_CALENDAR_MONTHS.includes((m + PROJECTION_START_MONTH) % 12);
}
function nextStockVestMonthAfter(month) {
  for (let k = month + 1; k <= month + 3; k++) {
    if (isStockVestMonth(k)) return k;
  }
  return month + 3;
}

// MSFT performance refresh grants are always issued at the end of August.
// Calendar August = month index where (m + PROJECTION_START_MONTH) % 12 === 7.
// firstAugustAtOrAfter returns the smallest m ≥ minMonth where the calendar
// month is August. Used to align refresh issuance to MSFT's annual review cycle.
const AUG_MOD = ((7 - PROJECTION_START_MONTH) % 12 + 12) % 12;
export function firstAugustAtOrAfter(minMonth) {
  const m = Math.max(0, Math.ceil(minMonth));
  const offset = ((AUG_MOD - (m % 12)) + 12) % 12;
  return m + offset;
}

/**
 * Microsoft promotion ladder for Chad's W-2 job.
 *
 * The L63 baseline lives in chadJobSalary / chadJobStockRefresh / chadJobBonusPct.
 * L64 and L65 each have their own enable toggle, "months after hire" trigger,
 * and replacement values for salary, refresh-grant size, and bonus %. Raise %
 * (chadJobRaisePct) is shared across levels — when a promotion fires, the new
 * base salary becomes the new compounding anchor.
 *
 * Used by both projection.js (monthly cashflow) and taxProjection.js (annual
 * tax engine) so the two stay in sync. If you change semantics here, both
 * consumers automatically get the update.
 */

/**
 * Resolve Chad's level + comp at a given monthsWorked elapsed since hire.
 *
 * Promotion months are "months after hire", NOT "months from project start".
 * If both L65 and L64 are enabled and L65's month <= L64's month, L65 wins
 * (we don't auto-correct — the UI surfaces a warning instead).
 *
 * @param {number} monthsWorked - months elapsed since chadJobStartMonth
 * @param {object} s - state
 * @returns {{
 *   level: 'L63' | 'L64' | 'L65',
 *   salary: number,
 *   refresh: number,
 *   bonusPct: number,
 *   promoMonthsWorked: number
 * }}
 */
export function levelAtMonthsWorked(monthsWorked, s) {
  if (s.chadL65Enabled && monthsWorked >= (s.chadL65Month ?? 60)) {
    return {
      level: 'L65',
      salary: s.chadL65Salary || 0,
      refresh: s.chadL65StockRefresh || 0,
      bonusPct: (s.chadL65BonusPct || 0) / 100,
      promoMonthsWorked: s.chadL65Month ?? 60,
    };
  }
  if (s.chadL64Enabled && monthsWorked >= (s.chadL64Month ?? 24)) {
    return {
      level: 'L64',
      salary: s.chadL64Salary || 0,
      refresh: s.chadL64StockRefresh || 0,
      bonusPct: (s.chadL64BonusPct || 0) / 100,
      promoMonthsWorked: s.chadL64Month ?? 24,
    };
  }
  return {
    level: 'L63',
    salary: s.chadJobSalary || 0,
    refresh: s.chadJobStockRefresh || 0,
    bonusPct: (s.chadJobBonusPct || 0) / 100,
    promoMonthsWorked: 0,
  };
}

/**
 * Decide whether RSU refresh grants continue vesting after Chad retires.
 *
 * Rule: if Chad is age 65+ at retirement, his unvested grants keep vesting on
 * the original 5-yr schedule — but ONLY for grants issued more than 12 months
 * before retirement (the standard 1-year cliff: grants in their first year are
 * forfeited at retirement). Override can force the answer either way for
 * "what if" cases.
 *
 * @param {object} s - state (reads chadCurrentAge, chadAge65VestOverride)
 * @param {number} chadRetirementMonth - resolved retirement month
 * @returns {{ eligibleAuto: boolean, applies: boolean, ageAtRetirement: number }}
 */
export function age65VestEligibility(s, chadRetirementMonth) {
  const chadCurrentAge = s.chadCurrentAge ?? 61;
  const ageAtRetirement = chadCurrentAge + chadRetirementMonth / 12;
  const eligibleAuto = ageAtRetirement >= 65;
  const override = s.chadAge65VestOverride ?? 'auto';
  const applies =
    override === 'on' ? true :
    override === 'off' ? false :
    eligibleAuto;
  return { eligibleAuto, applies, ageAtRetirement };
}

/**
 * MSFT stock-price multiplier for a vest event relative to its grant's issue
 * month.
 *
 * Refresh grants are denominated in fixed dollars at issue: $G is converted
 * to N = G / price(issueMonth) shares, then each 5% vest pays
 * N * 0.05 * price(vestMonth). The dollar payout per vest scales with growth
 * from issue → vest, NOT from project start. This means a grant issued in
 * year 3 has fewer shares than a grant issued in year 1 (same dollar
 * value, higher stock price), matching how MSFT actually issues RSUs.
 */
function msftMultiplierIssueToVest(issueMonth, vestMonth, s) {
  const g = s.msftGrowth || 0;
  return Math.pow(1 + g / 100, (vestMonth - issueMonth) / 12);
}

/**
 * Compute the projected post-retirement RSU windfall analytically.
 *
 * For each refresh grant Chad would receive while employed:
 *   - If grant was issued > 12 months before retirement (1-year cliff cleared)
 *     AND age-65 vest rule applies, sum the UNVESTED portion as continuing
 *     post-retirement W-2 income.
 *   - Else, the unvested portion is forfeited.
 *
 * Each vest's gross dollars are scaled by msftGrowth from project-month 0 to
 * the vest month, so a grant entered in today's dollars appreciates with the
 * stock as it vests over 5 years.
 *
 * Returns gross dollars (no tax applied — caller can multiply by netMult).
 * This is used by the IncomeControls panel to surface the windfall without
 * inflating the main projection horizon, which caused unrealistic savings
 * crashes when both spouses retired together with no SS yet active.
 *
 * @param {object} s - state
 * @returns {{
 *   eligibleGrants: number,
 *   forfeitedGrants: number,
 *   grossWindfall: number,
 *   firstVestMonth: number | null,
 *   lastVestMonth: number | null,
 * }}
 */
export function projectedPostRetirementVests(s) {
  if (!s.chadJob) {
    return { eligibleGrants: 0, forfeitedGrants: 0, grossWindfall: 0, firstVestMonth: null, lastVestMonth: null };
  }
  const chadRetirementMonth = s.chadRetirementMonth ?? (s.chadWorkMonths || 72);
  const { applies } = age65VestEligibility(s, chadRetirementMonth);
  if (!applies) {
    return { eligibleGrants: 0, forfeitedGrants: 0, grossWindfall: 0, firstVestMonth: null, lastVestMonth: null };
  }
  const chadJobStartMonth = s.chadJobStartMonth ?? 0;
  const refreshStartMonth = s.chadJobRefreshStartMonth ?? 12;

  // MSFT performance refreshes are issued on the last day of August every year.
  // First refresh = first August at or after chadJobStartMonth + refreshStartMonth
  // (default refreshStartMonth=12 = "after first review cycle"). Subsequent
  // grants are exactly 12 months apart, which keeps them in August.
  const firstRefreshIssue = firstAugustAtOrAfter(chadJobStartMonth + refreshStartMonth);

  let eligibleGrants = 0;
  let forfeitedGrants = 0;
  let grossWindfall = 0;
  let firstVestMonth = null;
  let lastVestMonth = null;
  for (let g = 0; ; g++) {
    const issueMonth = firstRefreshIssue + 12 * g;
    if (issueMonth >= chadRetirementMonth) break;
    const monthsAtIssue = issueMonth - chadJobStartMonth;
    const grantSize = levelAtMonthsWorked(monthsAtIssue, s).refresh;
    if (grantSize <= 0) continue;

    if (!clearsOneYearCliff(issueMonth, chadRetirementMonth)) {
      forfeitedGrants++;
      continue;
    }

    // Iterate the 20 calendar-aligned vests; accumulate only those after retirement.
    const firstVest = nextStockVestMonthAfter(issueMonth);
    let postRetVestsThisGrant = 0;
    for (let v = 0; v < 20; v++) {
      const vm = firstVest + v * 3;
      if (vm <= chadRetirementMonth) continue;
      grossWindfall += grantSize * 0.05 * msftMultiplierIssueToVest(issueMonth, vm, s);
      postRetVestsThisGrant++;
      if (firstVestMonth === null || vm < firstVestMonth) firstVestMonth = vm;
      if (lastVestMonth === null || vm > lastVestMonth) lastVestMonth = vm;
    }
    if (postRetVestsThisGrant > 0) eligibleGrants++;
  }
  return { eligibleGrants, forfeitedGrants, grossWindfall, firstVestMonth, lastVestMonth };
}

/**
 * One-year-cliff helper. Single source of truth for the rule that grants
 * issued within 12 months of retirement are forfeited at termination.
 *
 * Note: uses strict `> 12` semantics — a grant issued exactly 12 months
 * before retirement is forfeited. Real MSFT plan language is "first vest
 * cycle has occurred." If you change this rule, update tests.
 */
export function clearsOneYearCliff(issueMonth, chadRetirementMonth) {
  return (chadRetirementMonth - issueMonth) > 12;
}

/**
 * Build a year-by-grant vest schedule matrix.
 *
 * Returns:
 *   {
 *     grants: [{ id, level, gross, issueMonth, issueYear, lastVestYear, cliff, postRetVested }],
 *     years: [yearIdx, ...],
 *     cells: number[year][grant]   // gross dollars vested in that grant in that year
 *     yearTotals: number[year],
 *   }
 *
 * Year indexing: Y1 = months 0-11 (first year of projection / first work year if hired m=0),
 * matches the user's mental model. Cell value is GROSS dollars vested in that year for that grant
 * (caller multiplies by netMult for after-tax view).
 *
 * Grants that don't clear the 1-year cliff at retirement only show their pre-retirement vests.
 * If age65 doesn't apply, all grants stop vesting at chadRetirementMonth regardless of cliff.
 */
export function vestSchedule(s) {
  const empty = { grants: [], years: [], cells: [], yearTotals: [] };
  if (!s.chadJob) return empty;
  const chadJobStartMonth = s.chadJobStartMonth ?? 0;
  const chadRetirementMonth = s.chadRetirementMonth ?? (s.chadWorkMonths || 72);
  const refreshStart = s.chadJobRefreshStartMonth ?? 12;
  const { applies } = age65VestEligibility(s, chadRetirementMonth);

  // MSFT refreshes always issue end-of-August. Match projection.js / taxProjection.js.
  const firstRefreshIssue = firstAugustAtOrAfter(chadJobStartMonth + refreshStart);

  const grants = [];
  const yearMap = new Map(); // year (1-indexed) → { perGrant: Map<grantIdx, gross>, postRetPerGrant: Map<grantIdx, gross>, total, postRetTotal }

  for (let g = 0; ; g++) {
    const issueMonth = firstRefreshIssue + 12 * g;
    if (issueMonth >= chadRetirementMonth) break;
    const monthsAtIssue = issueMonth - chadJobStartMonth;
    const lvl = levelAtMonthsWorked(monthsAtIssue, s);
    const grantSize = lvl.refresh;
    const cliff = !clearsOneYearCliff(issueMonth, chadRetirementMonth);
    const postRetVested = applies && !cliff;

    const grantIdx = grants.length;
    const msftBasePrice = s.msftPrice || 1;
    const priceAtIssue = msftBasePrice * Math.pow(1 + (s.msftGrowth || 0) / 100, issueMonth / 12);
    const grant = {
      id: g + 1,
      level: lvl.level,
      gross: grantSize,
      issueMonth,
      issueYear: Math.floor(issueMonth / 12) + 1,
      priceAtIssue,
      sharesAtIssue: grantSize > 0 ? grantSize / priceAtIssue : 0,
      cliff,
      postRetVested,
      postRetGross: 0,  // sum of vest-month-based post-retirement gross dollars
      lastVestYear: -1,
    };
    grants.push(grant);
    if (grantSize <= 0) continue;

    const firstVest = nextStockVestMonthAfter(issueMonth);
    for (let v = 0; v < 20; v++) {
      const vm = firstVest + v * 3;
      const isPostRet = vm > chadRetirementMonth;
      if (isPostRet && !postRetVested) continue;
      const year = Math.floor(vm / 12) + 1; // 1-indexed
      grant.lastVestYear = Math.max(grant.lastVestYear, year);
      if (!yearMap.has(year)) yearMap.set(year, { perGrant: new Map(), postRetPerGrant: new Map(), total: 0, postRetTotal: 0 });
      const yd = yearMap.get(year);
      const amt = grantSize * 0.05 * msftMultiplierIssueToVest(issueMonth, vm, s);
      yd.perGrant.set(grantIdx, (yd.perGrant.get(grantIdx) || 0) + amt);
      yd.total += amt;
      if (isPostRet) {
        grant.postRetGross += amt;
        yd.postRetPerGrant.set(grantIdx, (yd.postRetPerGrant.get(grantIdx) || 0) + amt);
        yd.postRetTotal += amt;
      }
    }
  }

  const years = [...yearMap.keys()].sort((a, b) => a - b);
  const cells = years.map(y => {
    const yd = yearMap.get(y);
    return grants.map((_, gi) => yd.perGrant.get(gi) || 0);
  });
  const postRetCells = years.map(y => {
    const yd = yearMap.get(y);
    return grants.map((_, gi) => yd.postRetPerGrant.get(gi) || 0);
  });
  const yearTotals = years.map(y => yearMap.get(y).total);
  const postRetYearTotals = years.map(y => yearMap.get(y).postRetTotal);
  return { grants, years, cells, postRetCells, yearTotals, postRetYearTotals, retMonth: chadRetirementMonth };
}
