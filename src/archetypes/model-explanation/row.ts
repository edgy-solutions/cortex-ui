/**
 * MODEL_EXPLANATION's DECLARED ROW — cortex-declared, no producer tuple to mirror yet.
 *
 * Same situation as `ILLUSTRATION_ROW`: no producer serves `mesh:explainModel` (ADR-0057,
 * Proposed), so there is nothing on the wire for `passthrough` to copy and nothing for
 * `projectedTupleParity.test.ts` to check this against. The single `model_explanation` key is
 * the whole payload, carried by `payload_key`. `reads` (in `index.ts`) is empty for the same reason.
 */
export const MODEL_EXPLANATION_ROW = {
  archetype: "MODEL_EXPLANATION",
  payload_key: "model_explanation",
  passthrough: [],
} as const;
