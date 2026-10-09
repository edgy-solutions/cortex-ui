/**
 * DERIVED from the producer packet (ia-saf, 2026-10-08, "fracas bindings final shape") --
 * NOT a live capture. Transcribed from its PAYLOADS section. Months are zero-filled upstream,
 * so 2026-02 is a real zero, not a gap.
 */
export const FAILURE_TREND_DERIVED = {
  value_label: "Failures per month",
  scope_label: "P-101",
  series: [{ key: "failure_count", label: "Failures", unit: "failures" }],
  rows: [
    { period: "2026-01", failure_count: 3, failure_record_ids: ["FR-1", "FR-2", "FR-3"], citations: ["fracas:FR-1"] },
    { period: "2026-02", failure_count: 0, failure_record_ids: [], citations: [] },
    { period: "2026-03", failure_count: 2, failure_record_ids: ["FR-4", "FR-5"], citations: ["fracas:FR-4"] },
  ],
};
