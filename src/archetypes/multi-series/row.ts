/**
 * ADR-0055's DECLARED ROW — cortex's copy of the backend half of the package.
 *
 * Mirrors `_PROJECTED_ARCHETYPES["MULTI_SERIES"]` in `agent_fleet/presentation_agent/main.py`
 * (`("rows", ("series", "reference", "verdict", "value_label", "scope_label", "data_provenance"))`):
 * copied verbatim, in order, and mirrored against the producer source by `projectedTupleParity.test.ts`.
 *
 * `data_provenance` joined the tuple at invincible-agent e77883aa (0.4.82). It is passed through and
 * NOT in `reads`: the card does not draw it yet (Lane 1, 11-08: "no binding is owed").
 *
 * `valid_as_of`/`state_version` are in neither this row nor `reads`: the producer carries that
 * pair "for every archetype" outside any per-archetype tuple, so the dispatch passes them
 * explicitly (same as CONTRIBUTION_RANKING).
 */
export const MULTI_SERIES_ROW = {
  archetype: "MULTI_SERIES",
  payload_key: "rows",
  passthrough: ["series", "reference", "verdict", "value_label", "scope_label", "data_provenance"],
} as const;
