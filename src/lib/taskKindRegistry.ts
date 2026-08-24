/**
 * Task-kind presentation registry — the ONE ADDRESS for per-kind display hints.
 *
 * GENERIC-AT-BIRTH (all repos, not just engines): domain display is DATA, not
 * code. A task kind's badge label, descriptive title, and canvas archetype are
 * PRESENTATION POLICY about a kind registered in the mesh — the rendersAs / M3
 * horizon. This table is INTERIM SCAFFOLDING: it holds the hints hardcoded for
 * now so nothing re-scatters domain branches across six files, but the endstate
 * is that the task payload carries these hints (or the UI resolves them from a
 * served declaration) and this table is deleted.
 *
 * The discipline until then:
 *   - A NEW task kind adds a ROW here, never a `kind === "..."` branch elsewhere.
 *   - Everything else keys on the ARCHETYPE (structural), never the kind string.
 *   - An UNDECLARED kind gets the honest default (TASK / APPROVAL_TASK) — the
 *     UI-COMPONENT-NOT-FOUND discipline applied to labels, not a silent guess.
 *
 * RETIRES AT M3.3 — **together with `_VERBS_BY_KIND`** in invincible-agent's
 * `src/iagent/human_tasks.py`. That is the SECOND hardcoded per-kind table (which
 * verbs each task species accepts), added by the triage-card fix, and the two must
 * retire in ONE change: a served `rendersAs` declaration that says how a task
 * RENDERS while a code table still decides what it can DO is the worse half
 * surviving. See invincible-agent
 * `docs/plans/m3-grouped-review-definition-design.md` §"TWO interim per-kind tables".
 */

export interface TaskKindDisplay {
  /** Short chip label (timeline row, card header). */
  badge: string;
  /** Full descriptive title (HUD, card). */
  title: string;
  /** Which canvas archetype renders this kind's card. */
  archetype: "GROUPED_REVIEW" | "APPROVAL_TASK" | "TRIAGE_TASK";
}

// The single hardcoded table. `access_request` / `workflow_ack` are generic task
// kinds; `pcn_*` are domain values that leaked in with the first consumer — both
// live here as DATA rows, awaiting served hints, not as code branches.
const REGISTRY: Record<string, TaskKindDisplay> = {
  grouped_review: { badge: "REVIEW", title: "Disposition review", archetype: "GROUPED_REVIEW" },
  pcn_disposition: { badge: "QUALIFY", title: "Qualification task", archetype: "APPROVAL_TASK" },
  access_request: { badge: "ACCESS", title: "Access request", archetype: "APPROVAL_TASK" },
  workflow_ack: { badge: "APPROVE", title: "Workflow approval", archetype: "APPROVAL_TASK" },
  // A THIRD SPECIES, not an approval. "Approve"/"Reject" on *"this notice could not be
  // prepared for review"* is not an awkward label — it records a decision the data cannot
  // represent, and ADR-0034's decision records would archive that immutably as promotion
  // evidence. Registered here BEFORE the card exists on purpose: an unregistered kind falls
  // back to APPROVAL_TASK, which is exactly how the bug shipped.
  extraction_refusal: { badge: "TRIAGE", title: "Unprocessable notice", archetype: "TRIAGE_TASK" },
};

// THE DEFAULT WAS HONEST ABOUT LABELS AND DISHONEST ABOUT AFFORDANCES. "TASK" as a badge says
// nothing and is harmless; `APPROVAL_TASK` as an archetype says "this is a decision you accept
// or refuse" and hands the user two buttons to prove it. A label that says nothing is fine; an
// affordance that says nothing still acts. The badge default stays; the ARCHETYPE default now
// renders the card in a NO-VERB read-only mode (see ApprovalTaskCard) so an unregistered kind
// degrades visibly instead of borrowing another species' semantics.
const DEFAULT: TaskKindDisplay = { badge: "TASK", title: "Task", archetype: "APPROVAL_TASK" };

/** Is this kind explicitly declared, or is it riding the default? Consumers use this to
 *  degrade honestly rather than assert affordances they cannot justify. */
/**
 * `Object.hasOwn`, not `in`, and not a bare `REGISTRY[kind]`.
 *
 * `kind` is a PROJECTION FIELD — it arrives from data, not from a constant in this repo —
 * so a row carrying "constructor" or "toString" reaches these lookups. Both `in` and index
 * access walk `Object.prototype`, which made those strings report as registered kinds; the
 * `?? DEFAULT` below could not rescue it either, because a builtin is not nullish. The
 * result was a blank badge and a literal `undefined` in the HUD — the failure of a lookup
 * presented as a successful one.
 */
export const isRegisteredKind = (kind: string): boolean =>
  Object.hasOwn(REGISTRY, kind);

/** Resolve a kind's display hints — the honest default for an undeclared kind. */
export function taskKindDisplay(kind: string): TaskKindDisplay {
  // Ownership-checked for the same reason as above: `REGISTRY["toString"]` returns a
  // function, which is not nullish, so `?? DEFAULT` never fires and the caller reads
  // `.badge` off a builtin.
  return Object.hasOwn(REGISTRY, kind) ? REGISTRY[kind] : DEFAULT;
}

export const taskKindLabel = (kind: string): string => taskKindDisplay(kind).badge;
export const taskKindTitle = (kind: string): string => taskKindDisplay(kind).title;
