/**
 * GroupedReviewTable's own contract (GROUPED_REVIEW).
 *
 * NOT A SemanticArchetype MEMBER. This archetype is dispatched by SemanticInterpreter but
 * absent from BAML's enum (enumeration finding D4). The backend validator admits it via the
 * union vocabulary, which is deliberate and carries a `trigger:` to tighten when the enum is
 * repaired — see docs/plans/presentation-contract-enumeration.md.
 *
 * `extraction_warnings` IS PART OF THE CONTRACT, not decoration. A degraded extraction
 * yields a PARTIAL parts list indistinguishable from a complete one; unsaid, the missing
 * parts never get a disposition and nobody notices. The field is how the batch says how much
 * to trust itself.
 */

export const GROUPED_REVIEW_ROW_REQUIREMENTS = {
  /** A batch with no items has nothing to dispose. */
  minItems: 1,
} as const;

export const GROUPED_REVIEW_REFUSAL_REASONS = [
  "no items",
] as const;

export const GROUPED_REVIEW_CONTRACT = {
  archetype: "GROUPED_REVIEW",
  component: "GroupedReviewTable",
  layout: "full-width",
  fields: {
    /** ReviewBatch. The grouped HumanTask this batch resolves. */
    batch: {
      encoding: "object",
      required: true,
      requiredKeys: [
        "batch_id",
        "notice_id",
        "notice_type",
        // The idempotency namespace — resolutions are keyed notice_fingerprint x mpn.
        "notice_fingerprint",
        "approver",
        "items",
      ],
    },
  },
  rowRequirements: GROUPED_REVIEW_ROW_REQUIREMENTS,
  refusalReasons: GROUPED_REVIEW_REFUSAL_REASONS,
} as const;
