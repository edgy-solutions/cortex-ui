/**
 * DERIVED from the producer packet (ia-saf, 2026-10-08, "fracas bindings final shape") --
 * NOT a live capture. Transcribed from its PAYLOADS section. Replace with a capture when one
 * exists. `favourable` is deliberately absent upstream: a failure count has no good direction.
 */
export const FAILURE_RECORD_SET_DERIVED = {
  value_label: "failures",
  value_unit: "failures",
  scope_label: "PN-4410-27",
  rows: [
    { rank: 1, entity_id: "bearing wear", entity_name: "bearing wear", contribution: 7, share_of_total: 0.5, platforms: ["P-101", "P-102"], record_ids: ["FR-1", "FR-2"], citations: ["fracas:FR-1", "fracas:FR-2"] },
    { rank: 2, entity_id: "seal leak", entity_name: "seal leak", contribution: 4, share_of_total: 0.2857, platforms: ["P-101"], record_ids: ["FR-3"], citations: ["fracas:FR-3"] },
    { rank: 3, entity_id: "connector fatigue", entity_name: "connector fatigue", contribution: 3, share_of_total: 0.2143, platforms: ["P-102"], record_ids: ["FR-4"], citations: ["fracas:FR-4"] },
  ],
};
