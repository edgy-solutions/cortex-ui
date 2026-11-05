/**
 * FLOW_DECOMPOSITION's DECLARED ROW — cortex-PROPOSED, with no producer tuple to mirror yet.
 *
 * The measure is served but the projector that lifts it into a component is Lane 1's and is not
 * built: there is no `_PROJECTED_ARCHETYPES["FLOW_DECOMPOSITION"]`. So, like `MODEL_EXPLANATION_ROW`,
 * this is NOT in `projectedTupleParity.test.ts` or `projectedPopulation.testkit.ts` (both compare
 * against the producer's source), and `passthrough` is what this card READS off the served
 * envelope, to be reconciled with the tuple when it lands. The card reads `render.unit` and
 * `render.other_label` only and ignores every other key of `render`.
 */
export const FLOW_DECOMPOSITION_ROW = {
  archetype: "FLOW_DECOMPOSITION",
  payload_key: "rows",
  passthrough: ["value_label", "render", "verdict"],
} as const;
