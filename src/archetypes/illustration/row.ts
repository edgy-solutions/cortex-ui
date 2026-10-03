/**
 * ILLUSTRATION's DECLARED ROW — cortex-declared, no producer tuple to mirror yet.
 *
 * Same situation as `WORKFLOW_CASE_ROW` (see its own header): no producer route serves an
 * illustration today, so there is nothing on the wire for `passthrough` to copy and nothing for
 * `projectedTupleParity.test.ts` to check this against. `passthrough` is empty because the wire
 * declares nothing yet — the single `illustration` key is the whole payload, carried by
 * `payload_key`, never a passthrough field. `reads` (in `index.ts`) is empty for the same reason.
 */
export const ILLUSTRATION_ROW = {
  archetype: "ILLUSTRATION",
  payload_key: "illustration",
  passthrough: [],
} as const;
