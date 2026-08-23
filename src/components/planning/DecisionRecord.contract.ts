/**
 * DecisionRecord's own contract (DECISION_RECORD) — Phase 3's commit ceremony card.
 *
 * COMPOSED, NOT PARALLEL. Ruled 2026-08-22: a `DecisionArtifact` is structurally *a disposition
 * record with a planning-flavoured payload* — the ops are the disposed items, the rationale is
 * the override-reason, the alternatives are the considered-set. So this contract IMPORTS the
 * disposition field shape rather than restating it, and the commit ceremony is the degenerate
 * single-approver case of the review flow that already exists. Phase 7's multi-party version
 * (finance disposes funding effects, site leads dispose load effects, leader approves) is then
 * ADDING AUDIENCES to a flow that already names `audience` — not translating a lookalike into
 * the real thing.
 *
 * The caution recorded with that ruling is the reason for the import: *similar-looking parallel
 * shapes are how two-masters starts.* The whole presentation arc began with a backend table
 * that happened to look like the UI's registry.
 *
 * NOT A LIVE VIEW — `recomputes: false`, and this is a deliberate difference from every other
 * planning archetype. PERIOD_SERIES, THRESHOLD_GRID, MATRIX_GRID and DELTA_SET recompute
 * because they describe a plan that is still moving. A committed decision describes an ACT, at
 * a time, by a named actor. Recomputing it would let the record of what someone decided drift
 * with the state they decided against, which destroys the only property that makes it evidence.
 * Its `acted_at` is a fact, not a `valid_as_of` stamp.
 *
 * WHY A RATIONALE-LESS RECORD IS REFUSED RATHER THAN RENDERED. The commit ceremony blocks on an
 * empty rationale at ACT time. If an artifact nonetheless arrives without one, that block has
 * failed somewhere, and drawing the card anyway would present an ungoverned decision in the
 * exact visual language of a governed one. The refusal is how the card declines to launder it.
 */

import { DISPOSED_TASK_FIELD } from "../registry/disposition.contract";

export const DECISION_RECORD_ROW_REQUIREMENTS = {
  /** A decision that disposed nothing is not a decision. */
  minOps: 1,
  /** The rationale is REQUIRED — the same semantics as disposition-with-override-reason. */
  requiresRationale: true,
  /**
   * `acted_at` is the moment of the act and is never restamped. Recorded as a row requirement
   * rather than a comment because it is the property that separates a record from a view.
   */
  actedAtIsImmutable: true,
} as const;

/**
 * Reasons THIS COMPONENT can emit. Note what is NOT here: there is no "not yet approved"
 * reason. A pending approval is an APPROVAL_TASK — a different archetype with a different
 * card — and publishing a pending refusal here would tell the selector this component can
 * stand in for one, which is precisely the parallel-shape drift the ruling forbids.
 */
export const DECISION_RECORD_REFUSAL_REASONS = [
  "decision has no rationale",
  "decision disposed no ops",
  "decision is missing its actor",
] as const;

export const DECISION_RECORD_CONTRACT = {
  archetype: "DECISION_RECORD",
  component: "DecisionRecord",
  layout: "full-width",
  /** ADR-0042 Ruling 9's discriminant. FALSE here — see the header. A committed act does not
   *  recompute, and a live-view refusal for anonymous callers does not apply to a record. */
  recomputes: false,
  fields: {
    /**
     * THE COMPOSED FIELD — imported by reference from the disposition family, never restated.
     * Carries identity (`task_id`, `kind`, `task_state`, `audience`, `requested_by`,
     * `subject_ref`) and the act (`acted_by`, `acted_at`, `decision`, `comment`), where
     * `comment` IS the rationale.
     *
     * `dispositionComposition.test.ts` asserts this is the SAME OBJECT as the review contracts'
     * export. That test is the ONLY enforcement of the composition — `requiredKeys` is read by
     * nothing at runtime, here or in the backend — so it is load-bearing rather than
     * belt-and-braces. If it is deleted, this contract silently becomes a lookalike.
     */
    decision: DISPOSED_TASK_FIELD,
    /** The disposed items: the scenario ops this commit applied to baseline. */
    ops: { encoding: "array", parsesTo: "array-of-objects", required: true },
    /** The auto-gathered question trail — what was asked on the way to deciding. */
    question_trail: { encoding: "array", parsesTo: "array-of-objects", required: false },
    /** The considered-set. Each carries whether it was considered or explicitly not. */
    alternatives: { encoding: "array", parsesTo: "array-of-objects", required: false },
    /** What the decision was made against. Supplied; the renderer invents no framing. */
    scope_label: { type: "string", required: false },
  },
  rowRequirements: DECISION_RECORD_ROW_REQUIREMENTS,
  refusalReasons: DECISION_RECORD_REFUSAL_REASONS,
} as const;

export type DecisionRecordContract = typeof DECISION_RECORD_CONTRACT;
export type DecisionRecordRefusal = (typeof DECISION_RECORD_REFUSAL_REASONS)[number];

/** One alternative that was weighed. `considered: false` is a POSITIVE statement — someone
 *  looked at this and set it aside — not an absence of information. */
export interface DecisionAlternative {
  label: string;
  considered: boolean;
  note?: string;
}

export function validateDecisionRecord(
  payload: unknown,
):
  | { kind: "ok"; ops: Record<string, unknown>[] }
  | { kind: "empty"; reason: DecisionRecordRefusal } {
  const p = (payload ?? {}) as Record<string, unknown>;
  const decision = (p.decision ?? {}) as Record<string, unknown>;

  // Actor first: a record with no actor cannot be attributed, and every other check would be
  // describing an act nobody performed.
  if (typeof decision.acted_by !== "string" || decision.acted_by.length === 0) {
    return { kind: "empty", reason: "decision is missing its actor" };
  }
  // `comment` is the rationale. Blank-but-present is the same failure as absent — a whitespace
  // rationale satisfies a truthiness check and says nothing.
  if (typeof decision.comment !== "string" || decision.comment.trim().length === 0) {
    return { kind: "empty", reason: "decision has no rationale" };
  }
  if (!Array.isArray(p.ops) || p.ops.length < DECISION_RECORD_ROW_REQUIREMENTS.minOps) {
    return { kind: "empty", reason: "decision disposed no ops" };
  }
  return { kind: "ok", ops: p.ops as Record<string, unknown>[] };
}
