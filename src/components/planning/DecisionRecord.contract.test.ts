import { describe, expect, it } from "vitest";
import {
  DECISION_RECORD_CONTRACT,
  DECISION_RECORD_REFUSAL_REASONS,
  validateDecisionRecord,
} from "./DecisionRecord.contract";
import {
  DISPOSED_TASK_FIELD,
  DISPOSITION_ACTED_KEYS,
  DISPOSITION_IDENTITY_KEYS,
} from "../registry/disposition.contract";
import { APPROVAL_TASK_CONTRACT } from "../registry/TaskAndObservation.contracts";

/**
 * THE COMPOSITION ARM IS FIRST AND IT IS LOAD-BEARING.
 *
 * `requiredKeys` is read by NOTHING at runtime — not in cortex-ui, not in the backend. So the
 * ruling that DECISION_RECORD must COMPOSE the disposition contracts rather than parallel them
 * has exactly one enforcement mechanism, and it is this file. Delete these assertions and the
 * contract silently degrades into a lookalike that happens to have matching field names — which
 * is the two-masters seed the ruling exists to prevent.
 *
 * The mechanical test, as specified: change a disposition field's shape in the review
 * contracts, and this must break. It breaks on IDENTITY (`toBe`), not on deep equality, because
 * deep equality would still pass for a hand-copied duplicate — and a hand-copied duplicate is
 * precisely the defect. Composition that does not import is duplication wearing composition's
 * name.
 */
describe("DECISION_RECORD composes the disposition family", () => {
  it("uses the SHARED field object, not a copy of its shape", () => {
    expect(DECISION_RECORD_CONTRACT.fields.decision).toBe(DISPOSED_TASK_FIELD);
  });

  it("APPROVAL_TASK and DECISION_RECORD draw from the same vocabulary module", () => {
    // Both compose from disposition.contract. They use DIFFERENT field objects — a pending task
    // has no `acted_by` — but the identity keys must be the same list, or the two archetypes
    // have quietly forked their notion of what a task IS.
    const approvalKeys = APPROVAL_TASK_CONTRACT.fields.task.requiredKeys as readonly string[];
    const decisionKeys = DECISION_RECORD_CONTRACT.fields.decision.requiredKeys as readonly string[];
    for (const k of DISPOSITION_IDENTITY_KEYS) {
      expect(approvalKeys).toContain(k);
      expect(decisionKeys).toContain(k);
    }
  });

  it("carries the ACTED keys a pending task must not have", () => {
    const decisionKeys = DECISION_RECORD_CONTRACT.fields.decision.requiredKeys as readonly string[];
    const approvalKeys = APPROVAL_TASK_CONTRACT.fields.task.requiredKeys as readonly string[];
    for (const k of DISPOSITION_ACTED_KEYS) {
      expect(decisionKeys).toContain(k);
      // The asymmetry is the point: a task awaiting disposition has no actor and no rationale.
      expect(approvalKeys).not.toContain(k);
    }
  });

  it("names `comment` as the rationale — the field the commit ceremony blocks on", () => {
    const decisionKeys = DECISION_RECORD_CONTRACT.fields.decision.requiredKeys as readonly string[];
    expect(decisionKeys).toContain("comment");
  });
});

describe("DECISION_RECORD is a record, not a live view", () => {
  it("does not recompute", () => {
    // Deliberate difference from every other planning archetype. Recomputing a committed act
    // would let the record of what someone decided drift with the state they decided against.
    expect(DECISION_RECORD_CONTRACT.recomputes).toBe(false);
  });

  it("publishes no pending-approval refusal", () => {
    // A pending approval is an APPROVAL_TASK. Publishing a pending reason here would tell the
    // selector this component can stand in for one.
    const joined = DECISION_RECORD_REFUSAL_REASONS.join("|").toLowerCase();
    expect(joined).not.toContain("pending");
    expect(joined).not.toContain("await");
  });
});

describe("validateDecisionRecord refuses what must not be laundered", () => {
  const ok = {
    decision: { acted_by: "alice@example.com", comment: "Accepted the Q3 slip to protect Site B." },
    ops: [{ kind: "move_project", project_id: "P-1" }],
  };

  it("accepts a complete record", () => {
    expect(validateDecisionRecord(ok)).toEqual({ kind: "ok", ops: ok.ops });
  });

  it("refuses a record with no actor, before anything else", () => {
    const r = validateDecisionRecord({ ...ok, decision: { comment: "x" } });
    expect(r).toEqual({ kind: "empty", reason: "decision is missing its actor" });
  });

  it("refuses a WHITESPACE rationale, not just a missing one", () => {
    // A blank-but-present rationale satisfies a truthiness check and says nothing. This is the
    // shape that would sail through `if (comment)`.
    const r = validateDecisionRecord({ ...ok, decision: { ...ok.decision, comment: "   " } });
    expect(r).toEqual({ kind: "empty", reason: "decision has no rationale" });
  });

  it("refuses a decision that disposed nothing", () => {
    const r = validateDecisionRecord({ ...ok, ops: [] });
    expect(r).toEqual({ kind: "empty", reason: "decision disposed no ops" });
  });

  it("every refusal it can return is in the published vocabulary", () => {
    // The union check: a reason the backend has never seen is unroutable, and a card refusing
    // with an unpublished reason renders as a blank instead of an honest empty.
    for (const bad of [
      { ...ok, decision: { comment: "x" } },
      { ...ok, decision: { ...ok.decision, comment: "" } },
      { ...ok, ops: [] },
    ]) {
      const r = validateDecisionRecord(bad);
      expect(r.kind).toBe("empty");
      if (r.kind === "empty") {
        expect(DECISION_RECORD_REFUSAL_REASONS).toContain(r.reason);
      }
    }
  });
});
