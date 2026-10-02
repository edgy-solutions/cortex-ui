/**
 * ADR-0055's DECLARED ROW — cortex-declared, no producer tuple to mirror yet.
 *
 * Unlike `COMPETING_MEASURES_ROW`, there is no `agent_fleet/presentation_agent/main.py` tuple
 * this mirrors: no producer route serves a case today (see `contract.ts`'s header), so there is
 * nothing on the wire for `passthrough` to copy and nothing for `projectedTupleParity.test.ts`
 * to check this against. `passthrough` is empty because the wire declares nothing yet, not
 * because the card reads nothing — see `index.ts`'s `reads`, which is also empty for the same
 * reason (the single `case` key is the whole payload, carried by `payload_key`, never a
 * passthrough field).
 *
 * The day a producer route exists, this file is the one place that states the tuple it sends,
 * copied verbatim and in order, same as `COMPETING_MEASURES_ROW` — and at that point a producer-
 * mirror arm belongs in `projectedTupleParity.test.ts` for this archetype too.
 */
export const WORKFLOW_CASE_ROW = {
  archetype: "WORKFLOW_CASE",
  payload_key: "case",
  passthrough: [],
} as const;
