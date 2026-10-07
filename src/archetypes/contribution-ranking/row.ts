/**
 * ADR-0055's DECLARED ROW — cortex's copy of the producer's tuple.
 *
 * Mirrored against `agent_fleet/presentation_agent/main.py:850`, read fresh for this package:
 *
 *     "CONTRIBUTION_RANKING": ("rows",
 *                             ("value_label", "value_unit", "scope_label", "verdict",
 *                              "threshold", "threshold_defaulted", "method")),
 *
 * SEVEN fields, copied verbatim and in order. `SemanticInterpreter.tsx`'s own pre-packaging
 * comment at the old `case "CONTRIBUTION_RANKING"` claimed SIX and omitted `method`, citing a
 * stale line number — `projectedTupleParity.test.ts` already expected seven before this move,
 * so this file brings the row declaration in line with that test rather than with the stale
 * comment.
 *
 * `passthrough` is deliberately wider than `reads` in `contract.ts`
 * (`CONTRIBUTION_RANKING_ENVELOPE_FIELDS`): this is everything the wire DECLARES for the
 * archetype, not everything the card today is given. `defineArchetype` enforces the inclusion
 * the other way (a card may not read what the row does not declare), never the reverse.
 */
export const CONTRIBUTION_RANKING_ROW = {
  archetype: "CONTRIBUTION_RANKING",
  payload_key: "rows",
  passthrough: [
    "value_label",
    "value_unit",
    "scope_label",
    "verdict",
    "threshold",
    "threshold_defaulted",
    "method",
  ],
} as const;
