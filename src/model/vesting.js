import { MSFT_FLOOR_PRICE, VEST_SHARES } from './constants.js';

export function getMsftPrice(monthOffset, annualGrowth, startPrice) {
  const base = startPrice ?? MSFT_FLOOR_PRICE;
  return base * Math.pow(1 + annualGrowth / 100, monthOffset / 12);
}

export function getVestingMonthly(monthOffset, msftGrowth, msftPrice) {
  for (const v of VEST_SHARES) {
    if (monthOffset >= v.startMonth && monthOffset <= v.endMonth) {
      const price = getMsftPrice(v.endMonth, msftGrowth, msftPrice);
      return Math.round(v.shares * price * 0.8 / 3);
    }
  }
  return 0;
}

// A4 (remediation 2026-06-10): GROSS vest dollars per month — the pre-haircut
// twin of getVestingMonthly (which nets the 20% withholding for cashflow).
// The tax engine (buildTaxSchedule) needs the gross: RSU vests are W-2 Box 1
// AND Box 3/5 (FICA) wages in the vest year regardless of employment.
export function getVestingGrossMonthly(monthOffset, msftGrowth, msftPrice) {
  for (const v of VEST_SHARES) {
    if (monthOffset >= v.startMonth && monthOffset <= v.endMonth) {
      const price = getMsftPrice(v.endMonth, msftGrowth, msftPrice);
      return Math.round(v.shares * price / 3);
    }
  }
  return 0;
}

// P7 / b-14 (remediation 2026-06-10): GROSS lump twin of getVestingLumpSum.
// Engine mode withholds the statutory 29.65% at vest (instead of the legacy
// flat 0.80 net factor) and trues up in April, so it needs the gross dollars.
export function getVestingGrossLumpSum(monthOffset, msftGrowth, msftPrice) {
  for (const v of VEST_SHARES) {
    if (monthOffset === v.endMonth) {
      const price = getMsftPrice(v.endMonth, msftGrowth, msftPrice);
      return Math.round(v.shares * price);
    }
  }
  return 0;
}

export function getVestingLumpSum(monthOffset, msftGrowth, msftPrice) {
  for (const v of VEST_SHARES) {
    if (monthOffset === v.endMonth) {
      const price = getMsftPrice(v.endMonth, msftGrowth, msftPrice);
      return Math.round(v.shares * price * 0.8);
    }
  }
  return 0;
}

// ─── On-hire stock vest schedule (2026-06-10 change request) ────────────────
// SINGLE SOURCE OF TRUTH for chadJobHireStockTotal vesting, consumed by
// projection.js, taxProjection.js, w2Diagnostic.js, and sensitivityAnalysis.js.
//
// MSFT actual schedule: 25% of the grant vests 12 months after job start,
// then 6.25% every 3 months — months 15, 18, ..., 48 (12 quarterly tranches).
// 0.25 + 12 × 0.0625 = 1 EXACTLY (both fractions are binary-exact).
export const HIRE_VEST_TRANCHES = Object.freeze([
  { monthsAfterStart: 12, fraction: 0.25 },
  ...Array.from({ length: 12 }, (_, i) => ({ monthsAfterStart: 15 + 3 * i, fraction: 0.0625 })),
].map(Object.freeze));

/**
 * Gross hire-stock dollars vesting in a given employment month.
 * Each tranche appreciates issue→vest: total × fraction × (1+g)^(monthsWorked/12)
 * — the same msftMultIssueToVest scaling the refresh-grant engine uses.
 *
 * @param {number} total - chadJobHireStockTotal (grant-date $ value)
 * @param {number} monthsWorked - months since chadJobStartMonth
 * @param {number} msftGrowthPct - annual MSFT growth assumption, % (e.g. 10)
 * @returns {number} gross $ vesting this month (0 on non-tranche months)
 */
export function hireVestGrossInMonth(total, monthsWorked, msftGrowthPct) {
  if (!total || total <= 0) return 0;
  const tranche = HIRE_VEST_TRANCHES.find(t => t.monthsAfterStart === monthsWorked);
  if (!tranche) return 0;
  return total * tranche.fraction * Math.pow(1 + (msftGrowthPct || 0) / 100, monthsWorked / 12);
}

/**
 * Gross hire-stock dollars vesting during one employment YEAR (1-based:
 * year 1 = monthsWorked 12..23, etc.) — the SS earnings-test annualization
 * basis. Growth-weighted per tranche, matching hireVestGrossInMonth.
 * Year 1 = 43.75% (m12+15+18+21), years 2-3 = 25% each, year 4 = 6.25% (m48).
 */
export function hireVestGrossForEmploymentYear(total, employmentYear, msftGrowthPct) {
  if (!total || total <= 0) return 0;
  return HIRE_VEST_TRANCHES.reduce((sum, t) => {
    if (Math.floor(t.monthsAfterStart / 12) !== employmentYear) return sum;
    return sum + total * t.fraction * Math.pow(1 + (msftGrowthPct || 0) / 100, t.monthsAfterStart / 12);
  }, 0);
}

/**
 * Growth-weighted mean multiplier across all 13 tranches:
 * Σ fractionᵢ × (1+g)^(monthsᵢ/12). Collapses to exactly 1 at g=0.
 * w2Diagnostic steady-state: hireGrownTotal = total × this mean.
 */
export function hireVestGrowthWeightedMean(msftGrowthPct) {
  const g = (msftGrowthPct || 0) / 100;
  if (g === 0) return 1;
  return HIRE_VEST_TRANCHES.reduce(
    (sum, t) => sum + t.fraction * Math.pow(1 + g, t.monthsAfterStart / 12), 0);
}

export function getVestEvents(msftGrowth, msftPrice) {
  return VEST_SHARES.map(v => {
    const price = getMsftPrice(v.endMonth, msftGrowth, msftPrice);
    const gross = v.shares * price;
    return {
      label: v.label,
      shares: v.shares,
      gross,
      net: Math.round(gross * 0.8),
      price: Math.round(price * 100) / 100,
      // Projection-month bounds (0 = March 2026) carried through so charts can
      // distinguish past/in-flight vests from future ones. Does not affect math.
      startMonth: v.startMonth,
      endMonth: v.endMonth,
    };
  });
}

export function getTotalRemainingVesting(msftGrowth, msftPrice) {
  return getVestEvents(msftGrowth, msftPrice).reduce((sum, v) => sum + v.net, 0);
}
