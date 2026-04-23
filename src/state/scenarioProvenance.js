/**
 * Scenario provenance.
 *
 * Every saved scenario carries metadata describing how it was built:
 *   provenance: {
 *     source: 'manual' | 'recommendations',
 *     baseline: string | null,     // name of the scenario it was derived from
 *     moves:    Array | null,      // when source === 'recommendations', the
 *                                  // ordered list of moves applied:
 *                                  //   [{ id, label, mutation }, ...]
 *   }
 *
 * Legacy scenarios saved before provenance existed need a default on load.
 * `withProvenance` is idempotent and safe to apply on every load — scenarios
 * that already carry a valid provenance object are returned unchanged.
 *
 * Deviation from PRD: the PRD called for a CURRENT_SCHEMA_VERSION bump on
 * state schema for this field. In practice, `provenance` is metadata on the
 * scenario container (the save-record wrapper) rather than on the MODEL_KEYS
 * state inside the scenario — bumping the state-schema version is unnecessary.
 * Legacy scenarios load gracefully because this helper applies a default
 * wherever provenance is missing. Documented here so future agents understand.
 */

const DEFAULT_SOURCE = 'manual';
const VALID_SOURCES = new Set(['manual', 'recommendations']);

export const DEFAULT_PROVENANCE = Object.freeze({
  source: DEFAULT_SOURCE,
  baseline: null,
  moves: null,
});

/**
 * Apply a default provenance to a scenario object when it is missing or
 * malformed. Idempotent — already-valid scenarios are returned unchanged
 * (reference-equal when no change is needed).
 */
export function withProvenance(scenario) {
  if (!scenario || typeof scenario !== 'object') return scenario;
  const existing = scenario.provenance;
  if (isValidProvenance(existing)) return scenario;
  return { ...scenario, provenance: { ...DEFAULT_PROVENANCE } };
}

/**
 * Map withProvenance over an array of scenarios. Non-array inputs return [].
 */
export function withProvenanceAll(scenarios) {
  if (!Array.isArray(scenarios)) return [];
  return scenarios.map(withProvenance);
}

/**
 * Build a provenance object for a new scenario derived from recommendations.
 * `baseline` is the name of the scenario the preview was launched from (or
 * null if the preview was launched from the app's baseline plan). `moves` is
 * the ordered list of preview moves the user staged before save.
 */
export function buildRecommendationProvenance(baseline, moves) {
  return {
    source: 'recommendations',
    baseline: typeof baseline === 'string' && baseline.length > 0 ? baseline : null,
    moves: Array.isArray(moves)
      ? moves
          .filter((m) => m && typeof m === 'object' && typeof m.id === 'string' && m.mutation && typeof m.mutation === 'object')
          .map((m) => ({
            id: m.id,
            label: typeof m.label === 'string' ? m.label : m.id,
            mutation: { ...m.mutation },
          }))
      : null,
  };
}

/**
 * Shape validator for stored provenance objects. Returns true when the object
 * has a valid `source` enum value and a well-formed `moves` array (null or
 * array of objects with id + mutation).
 */
function isValidProvenance(p) {
  if (!p || typeof p !== 'object') return false;
  if (!VALID_SOURCES.has(p.source)) return false;
  if (p.baseline !== null && typeof p.baseline !== 'string') return false;
  if (p.moves !== null && !Array.isArray(p.moves)) return false;
  if (Array.isArray(p.moves)) {
    for (const m of p.moves) {
      if (!m || typeof m !== 'object') return false;
      if (typeof m.id !== 'string') return false;
      if (!m.mutation || typeof m.mutation !== 'object') return false;
    }
  }
  return true;
}

/**
 * Convenience predicate — was this scenario built by the recommendation
 * engine? Used by the scenario list UI to surface a subtle indicator.
 */
export function isRecommendationSourced(scenario) {
  return Boolean(
    scenario &&
      scenario.provenance &&
      scenario.provenance.source === 'recommendations',
  );
}
