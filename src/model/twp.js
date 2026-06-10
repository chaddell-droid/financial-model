/**
 * P8 (remediation 2026-06-10, improvement b-1, gate D8): Trial Work Period /
 * Extended Period of Eligibility module.
 *
 * SSA work-incentive reality for an SSDI beneficiary who tries a W-2 job
 * (20 CFR 404.1592–404.1592a; SSA Red Book):
 *   - TWP: 9 service months (gross earnings >= the year's TWP threshold,
 *     $1,210/mo in 2026 — statutory table in constants.js) with FULL benefit
 *     paid regardless of earnings level.
 *   - Cessation + grace: the first SGA month after the TWP plus the two
 *     following months are still paid in full.
 *   - EPE: for 36 months after TWP completion, the benefit is suspended in
 *     over-SGA months and payable in any month not over SGA (no new
 *     application needed when work stops).
 *   - Termination: the first over-SGA month AFTER the EPE terminates
 *     entitlement; expedited reinstatement (EXR) within 60 months restores
 *     the benefit once SGA work stops (provisional benefits modeled as
 *     immediate).
 *
 * Documented simplifications (single source for projection.js AND
 * taxProjection.js so flat and engine tax modes agree):
 *   - Service months are counted from SSDI approval (the model pays benefits
 *     from ssdiApprovalMonth); pre-approval work months are not retro-counted
 *     against the TWP (and SGA work during adjudication is out of scope).
 *   - The wage basis is the monthly SALARY gross (level-aware, with raises) —
 *     lumpy bonus/RSU months are ignored for the threshold tests. Any
 *     realistic salary is far above both thresholds, so this only matters
 *     for sub-SGA salaries where salary IS the steady signal.
 *   - The grace months are the first three over-SGA months after TWP
 *     completion (consecutive in every deterministic scenario this model
 *     produces).
 */
import { PROJECTION_START_MONTH, SSA_LIMITS_BASE_YEAR, getSsaLimitsForYear } from './constants.js';
import { levelAtMonthsWorked } from './chadLevels.js';

export const TWP_SERVICE_MONTHS = 9;   // 20 CFR 404.1592(a)
export const TWP_GRACE_MONTHS = 3;     // cessation month + 2 (20 CFR 404.1592a(a)(2)(i))
export const EPE_MONTHS = 36;          // re-entitlement period (20 CFR 404.1592a(b)(2))
export const EXR_WINDOW_MONTHS = 60;   // expedited reinstatement window (42 U.S.C. §423(i))

/**
 * The TWP module governs the SSDI path only when Chad actually works:
 * ssType='ssdi', chadJob on, claim not denied, and the toggle (default true)
 * not explicitly off. When inactive with chadJob on, the legacy behavior
 * (instant forfeiture — no SSDI, no back pay) applies.
 */
export function isTwpActive(s) {
  return !!(s.chadJob && s.ssType !== 'ss' && !s.ssdiDenied && s.twpEnabled !== false);
}

/**
 * Per-month TWP/EPE state machine. Returns an array of length months+1:
 *   { payable: boolean, phase: 'twp'|'grace'|'suspended'|'epe'|'reinstated'|null }
 * `payable` gates the SSDI benefit; `phase` drives chart annotations
 * (null = ordinary SSDI months: pre-TWP non-service months, or post-EPE
 * continuation after work stopped without termination).
 */
export function buildTwpSchedule(s, months) {
  const out = new Array(months + 1);
  const approval = s.ssdiApprovalMonth ?? 7;
  const startMonth = s.chadJobStartMonth ?? 0;
  const retirementMonth = s.chadRetirementMonth || s.chadWorkMonths || 72;
  const raisePct = (s.chadJobRaisePct || 0) / 100;
  let twpUsed = 0;
  let twpCompletionMonth = null; // month of the 9th service month
  let graceUsed = 0;
  let terminationMonth = null;   // first over-SGA month after the EPE
  for (let m = 0; m <= months; m++) {
    if (m < approval) { out[m] = { payable: false, phase: null }; continue; }
    // Level-aware monthly salary gross — same derivation as projection.js
    // (lvl.salary compounds with the annual raise on level anniversaries).
    let wage = 0;
    if (m >= startMonth && m <= retirementMonth) {
      const monthsWorked = m - startMonth;
      const lvl = levelAtMonthsWorked(monthsWorked, s);
      const yearsAtLevel = Math.floor((monthsWorked - lvl.promoMonthsWorked) / 12);
      wage = lvl.salary * Math.pow(1 + raisePct, yearsAtLevel) / 12;
    }
    // Thresholds are calendar-year indexed via the Phase-0 statutory table.
    const calYear = SSA_LIMITS_BASE_YEAR + Math.floor((m + PROJECTION_START_MONTH) / 12);
    const limits = getSsaLimitsForYear(calYear);
    const serviceMonth = wage >= limits.twpServiceMonthly;
    const overSga = wage >= limits.sgaMonthly;

    let payable, phase;
    if (twpCompletionMonth === null) {
      // TWP still open: full benefit regardless of earnings.
      if (serviceMonth) {
        twpUsed++;
        if (twpUsed >= TWP_SERVICE_MONTHS) twpCompletionMonth = m;
      }
      payable = true;
      phase = serviceMonth ? 'twp' : null;
    } else {
      const inEpe = m <= twpCompletionMonth + EPE_MONTHS;
      if (overSga) {
        if (graceUsed < TWP_GRACE_MONTHS) {
          graceUsed++;
          payable = true;
          phase = 'grace';
        } else {
          payable = false;
          phase = 'suspended';
          if (!inEpe && terminationMonth === null) terminationMonth = m;
        }
      } else if (terminationMonth === null) {
        // Not over SGA and never terminated: payable (EPE resume, or simple
        // continuation after the EPE if cessation never ripened to termination).
        payable = true;
        phase = inEpe ? 'epe' : null;
      } else if (m - terminationMonth <= EXR_WINDOW_MONTHS) {
        payable = true;
        phase = 'reinstated';
      } else {
        payable = false;
        phase = 'suspended';
      }
    }
    out[m] = { payable, phase };
  }
  return out;
}
