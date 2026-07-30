/**
 * Grouped-review projection shape (PCN/PDN part-obsolescence).
 *
 * The observer-facing projection of the backend bulk-resolve core's `ReviewBatch`
 * (invincible-agent/agent_fleet/restate_analyst/workflow_bulk_resolve.py). `items` is ALREADY
 * per-approver-filtered server-side (Seal 2) — the client renders what it is given and never
 * filters; two approvers on one notice receive different-sized batches by construction.
 *
 * Hand-written here (like RouteDecision/Artifact in src/api/types.ts) until the contract lands in
 * @platform/iagent-contracts; move it there when it does.
 */
import type { Disposition } from "@/lib/dispositions";

export interface ReviewItem {
  /** affected manufacturer part number — the item id + idempotency key component. */
  mpn: string;
  /** resolved ontology subject IRI, or null if the part didn't resolve to a catalog node. */
  subject?: string | null;
  /** system-proposed disposition, or null when the system couldn't propose one (needs an override). */
  proposed_disposition: Disposition | null;
  /** doc-tools weak-extraction flag — the MPN read was uncertain. Carried forward, shown, never hidden. */
  needs_review: boolean;
  replacement_mpn?: string | null;
  ltb_date?: string | null;
}

export interface ReviewBatch {
  /** the grouped HumanTask id this batch resolves. */
  batch_id: string;
  notice_id: string;
  notice_type: "PCN" | "PDN";
  /** the idempotency namespace — resolutions are keyed notice_fingerprint × mpn. */
  notice_fingerprint: string;
  /** the approver this batch was filtered for ("you"). */
  approver: string;
  items: ReviewItem[];
  /**
   * Extraction-quality warnings qualifying this batch — how much to trust the list.
   * A degraded extraction (a timed-out vision crop, a failed header pass) yields a
   * PARTIAL parts list that is indistinguishable from a complete one; unsaid, the
   * missing parts simply never get a disposition and nobody notices. Absent/empty
   * on a clean extraction.
   */
  extraction_warnings?: string[];
}
