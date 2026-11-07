/**
 * FLOW_DECOMPOSITION's DECLARED ROW — cortex-PROPOSED, with no producer tuple to mirror yet.
 *
 * The measure is served but the projector that lifts it into a component is Lane 1's and is not
 * built: there is no `_PROJECTED_ARCHETYPES["FLOW_DECOMPOSITION"]`. So, like `MODEL_EXPLANATION_ROW`,
 * this is NOT in `projectedTupleParity.test.ts` or `projectedPopulation.testkit.ts` (both compare
 * against the producer's source), and `passthrough` is what this card READS off the served
 * envelope, to be reconciled with the tuple when it lands. Of `render` (served as the row's block
 * plus `other_label`) the card reads `shape`, `value_label`, `unit` and `other_label`, and
 * ignores every other key; the top-level `value_label` is read only when `render` has none.
 * `data_provenance` was added 2026-11-07 (ruled: it rides every served table), after the
 * three-field tuple was accepted; Lane 1's projector row gains it too.
 */
export const FLOW_DECOMPOSITION_ROW = {
  archetype: "FLOW_DECOMPOSITION",
  payload_key: "rows",
  passthrough: ["value_label", "render", "verdict", "data_provenance"],
} as const;
