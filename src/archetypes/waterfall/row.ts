/**
 * WATERFALL's DECLARED ROW — cortex-PROPOSED, with no producer tuple to mirror.
 *
 * invincible-agent #553 admits `WATERFALL` to KNOWN_ARCHETYPES and declares `mesh:Waterfall`, but
 * adds no `_PROJECTED_ARCHETYPES["WATERFALL"]` tuple. So, like `FLOW_DECOMPOSITION_ROW`, this is
 * NOT in `projectedTupleParity.test.ts` or `projectedPopulation.testkit.ts` (both compare against
 * the producer's source); `passthrough` is what this card READS off the served envelope, to be
 * reconciled with the tuple when it lands. `walk` is the walk's start and end totals (#552).
 */
export const WATERFALL_ROW = {
  archetype: "WATERFALL",
  payload_key: "rows",
  passthrough: ["value_label", "render", "verdict", "data_provenance", "walk"],
} as const;
