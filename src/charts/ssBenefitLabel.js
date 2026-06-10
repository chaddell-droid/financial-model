/**
 * SS Benefit label helpers — single source of truth for chart display strings.
 *
 * The projection emits a polymorphic `ssBenefit` field that holds either SS
 * retirement or SSDI income depending on `ssType`. UI surfaces must use these
 * helpers to render the correct user-facing label; never hard-code "SSDI" or
 * "SS" without checking `ssType`.
 */

export function getSsBenefitLabel(ssType) {
  return ssType === 'ss' ? 'SS Retirement' : 'SSDI';
}

/**
 * Per-month SS label driven by the engine-emitted `ssBenefitType` field
 * (set in projection.js per month). Used in chart tooltips when a single
 * month may have a different source than the legend-level static ssType
 * (e.g. chadJob=true with postJobBenefit='ssRetirement' switches to SS
 * retirement after the job ends, while ssType remains 'ssdi' globally).
 * Falls back to the static label when ssBenefitType is missing.
 */
export function getSsBenefitLabelForMonth(ssBenefitType, fallbackSsType) {
  if (ssBenefitType === 'retirement') return 'SS Retirement';
  if (ssBenefitType === 'ssdi') return 'SSDI';
  return getSsBenefitLabel(fallbackSsType);
}
