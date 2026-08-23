/**
 * The disposition vocabulary, exported as COMPOSABLE PARTS rather than only as whole contracts.
 *
 * WHY THIS FILE EXISTS. `DECISION_RECORD` was ruled to REUSE the disposition/approval
 * contracts, not parallel them — "similar-looking parallel shapes are how two-masters starts."
 * But `APPROVAL_TASK_CONTRACT` exported only its whole, and its one field was
 * `{encoding:"object", required:true}` with NO requiredKeys: the HumanTask shape appeared
 * nowhere in the contract layer. There was nothing to import, so composing would have meant
 * hand-copying field names — duplication wearing composition's name.
 *
 * So the parts are extracted FIRST, in the review contracts' own file, before anything
 * consumes them.
 *
 * THE KEYS ARE READ, NOT INVENTED. They are what `ApprovalTaskCard` actually destructures off
 * its payload — `task.task_id`, `task.kind`, `task.task_state`, `task.audience`,
 * `task.requested_by`, `task.subject_ref`, `task.title`, `task.summary` — and they line up
 * with `src/iagent/human_tasks.py`'s columns. Note `status` (DB) arrives as `task_state`
 * (wire); the wire name is the one a contract describes.
 *
 * WHAT THESE DO NOT DO, stated so nobody assumes otherwise: `requiredKeys` is READ BY NOTHING
 * today — not in cortex-ui, not in the backend (grep returns only this repo's own docs). It is
 * declarative. Composition here is therefore enforced by a TEST asserting shared identity, not
 * by runtime validation, and tightening a contract with these keys cannot turn a working
 * payload into a refusal.
 */

/**
 * Identity and routing — true of EVERY human task regardless of species.
 * `audience` is the axis Phase 7's multi-party review adds to, not a new concept.
 */
export const DISPOSITION_IDENTITY_KEYS = [
  "task_id",
  "kind",
  "task_state",
  "audience",
  "requested_by",
  "subject_ref",
] as const;

/** What a card shows before anyone acts. Generic, but presentation rather than disposition. */
export const DISPOSITION_DISPLAY_KEYS = ["title", "summary"] as const;

/**
 * Present only ONCE ACTED ON. `comment` is the rationale — the field the portfolio commit
 * ceremony blocks on when empty, and the same semantics as disposition-with-override-reason.
 * A pending task has none of these; a DECISION_RECORD has all of them.
 */
export const DISPOSITION_ACTED_KEYS = [
  "acted_by",
  "acted_at",
  "decision",
  "comment",
] as const;

/**
 * The field shape for a PENDING human task. Shared by reference — a consumer must import THIS
 * object, not restate its contents, so that changing the keys here changes every contract that
 * composes it. `tests/…/dispositionComposition.test.ts` asserts that identity.
 */
export const DISPOSITION_TASK_FIELD = {
  encoding: "object",
  required: true,
  requiredKeys: [...DISPOSITION_IDENTITY_KEYS, ...DISPOSITION_DISPLAY_KEYS],
} as const;

/** The field shape for a COMPLETED disposition — identity plus the act itself. */
export const DISPOSED_TASK_FIELD = {
  encoding: "object",
  required: true,
  requiredKeys: [...DISPOSITION_IDENTITY_KEYS, ...DISPOSITION_ACTED_KEYS],
} as const;
