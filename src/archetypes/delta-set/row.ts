/**
 * ADR-0055's DECLARED ROW — cortex's copy of the backend half of the package.
 *
 * Mirrors `_PROJECTED_ARCHETYPES["DELTA_SET"]` in `agent_fleet/presentation_agent/main.py`
 * (`("effects", ("scope_label", "baseline_label", "headline"))`): copied verbatim, in order, and
 * mirrored against the producer source by `projectedTupleParity.test.ts`.
 *
 * `valid_as_of`/`state_version` are in no tuple — the producer carries that pair "for every
 * archetype" outside any per-archetype passthrough, so the dispatch passes them explicitly (same
 * as CONTRIBUTION_RANKING).
 */
export const DELTA_SET_ROW = {
  archetype: "DELTA_SET",
  payload_key: "effects",
  passthrough: ["scope_label", "baseline_label", "headline"],
} as const;
