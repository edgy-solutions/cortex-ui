/**
 * ADR-0055's DECLARED ROW — cortex's copy of the backend half of the package.
 *
 * Mirrors `_PROJECTED_ARCHETYPES["VARIANCE_TREE"]` in `agent_fleet/presentation_agent/main.py`
 * (`("rows", ("value_label", "value_unit", "scope_label", "verdict"))`): copied verbatim, in
 * order, and mirrored against the producer source by `projectedTupleParity.test.ts`.
 *
 * `passthrough` is deliberately wider than `reads` in `index.ts`: this is everything the wire
 * DECLARES, not everything the card is given. `valid_as_of`/`state_version` are in neither — the
 * producer carries that pair "for every archetype" outside any per-archetype tuple, so the
 * dispatch passes them explicitly (same as CONTRIBUTION_RANKING).
 */
export const VARIANCE_TREE_ROW = {
  archetype: "VARIANCE_TREE",
  payload_key: "rows",
  passthrough: ["value_label", "value_unit", "scope_label", "verdict"],
} as const;
