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

export function getSsBenefitShortLabel(ssType) {
  return ssType === 'ss' ? 'SS' : 'SSDI';
}
