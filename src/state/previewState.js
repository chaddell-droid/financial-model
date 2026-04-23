/**
 * Preview Sandbox state composition.
 *
 * The preview sandbox layers user-staged moves on top of baseline state. This
 * module exposes a single pure utility — `composePreviewState` — that merges
 * an ordered list of preview moves into a baseline state object. The resulting
 * composed state has the same shape as baseline, so downstream consumers
 * (projection engine, charts, KPIs) don't need preview-awareness. They simply
 * see a state that reflects baseline + all staged mutations.
 *
 * Preview state lives under the UI-only key `previewMoves` on the reducer
 * state. `previewMoves` is intentionally NOT in MODEL_KEYS — `extractModelState`
 * in autoSave.js filters it out, guaranteeing preview is strictly in-memory
 * and never serialized to localStorage (NFR8, FR38).
 *
 * `gatherState` calls this automatically when `state.previewMoves` is non-empty,
 * so most callers do not need to invoke `composePreviewState` directly.
 *
 * Shape of a preview move:
 *   { id: string, label: string, mutation: { [stateKey]: any, ... } }
 *
 * Mutations are applied via object spread in array order. Later moves overwrite
 * earlier moves when they share keys — consistent with the reducer's 1D state
 * model.
 */

export function composePreviewState(baseline, previewMoves) {
  if (!baseline) return baseline;
  if (!Array.isArray(previewMoves) || previewMoves.length === 0) return baseline;

  const composed = { ...baseline };
  for (const move of previewMoves) {
    if (move && typeof move === 'object' && move.mutation && typeof move.mutation === 'object') {
      Object.assign(composed, move.mutation);
    }
  }
  return composed;
}
