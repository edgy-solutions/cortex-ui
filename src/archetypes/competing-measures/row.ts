/**
 * ADR-0055's DECLARED ROW — cortex's copy of the backend half of the package.
 *
 * The producer side of this declaration does not exist yet: `policy/archetypes/
 * competing_measures.yaml` is not landed on `invincible-agent` (Lane 1 will be asked for it).
 * Until it is, this is the one place on this side that states the tuple `agent_fleet/
 * presentation_agent/main.py:771` actually sends — copied verbatim, in order, and mirrored against
 * the producer source by `projectedTupleParity.test.ts` so the two cannot drift silently.
 *
 * `passthrough` is deliberately wider than `reads` in `index.ts`: this is everything the wire
 * DECLARES for the archetype, not everything the card today is given. `defineArchetype` enforces
 * the inclusion the other way (a card may not read what the row does not declare), never the
 * reverse.
 */
export const COMPETING_MEASURES_ROW = {
  archetype: "COMPETING_MEASURES",
  payload_key: "rows",
  passthrough: [
    "spread",
    "spread_percent_of_bac",
    "lowest_value",
    "highest_value",
    "reference_value",
    "lowest_eac",
    "highest_eac",
    "methods_compared",
    "methods_answered",
    "all_methods_answered",
    "verdict",
    "value_unit",
    "value_label",
    "scope_label",
  ],
} as const;
