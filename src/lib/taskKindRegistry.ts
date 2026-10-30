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
 *     Whether a kind is declared is the served `/task_kinds`' answer (`useTaskAct`), not this
 *     table's (architect, 2026-10-30).
 *
 * RETIRES AT M3.3 — **together with `_VERBS_BY_KIND`** in invincible-agent's
 * `src/iagent/human_tasks.py`. That is the SECOND hardcoded per-kind table (which
 * verbs each task species accepts), added by the triage-card fix, and the two must
 * retire in ONE change: a served `rendersAs` declaration that says how a task
 * RENDERS while a code table still decides what it can DO is the worse half
 * surviving. See invincible-agent
 * `docs/reference/m3-grouped-review-definition-design.md` §"TWO interim per-kind tables".
 */

export interface TaskKindDisplay {
  /** Short chip label (timeline row, card header). */
  badge: string;
  /** Full descriptive title (HUD, card). */
  title: string;
}

/** The card archetypes a task can render as. WHICH one a kind gets is SERVED (`/task_kinds`' `archetype`, or the
 *  row's own declaration): this file no longer decides it. See `taskArchetype` in `taskArtifact.ts`. */
export type TaskCardArchetype = "GROUPED_REVIEW" | "APPROVAL_TASK" | "TRIAGE_TASK";

/** The generic card for a kind that is served no archetype this client has a card for: the read-only
 *  approval card (see ApprovalTaskCard's no-verb mode). Never a guess at what the kind "probably" is. */
export const GENERIC_TASK_ARCHETYPE: TaskCardArchetype = "APPROVAL_TASK";

/** Resolve a SERVED archetype name to a card, or the generic fallback. */
export function resolveTaskArchetype(served: unknown): TaskCardArchetype {
  return served === "GROUPED_REVIEW" || served === "APPROVAL_TASK" || served === "TRIAGE_TASK" ? served : GENERIC_TASK_ARCHETYPE;
}

// The single hardcoded table of DISPLAY hints (badge + title). The ARCHETYPE column is gone: the served
// `/task_kinds` declaration decides it. The badge/title STAY here as the fallback, because the server sends
// none (or not always); a served badge/title, where present, is the endstate and would delete these rows. `access_request` / `workflow_ack` are generic task
// kinds; `pcn_*` are domain values that leaked in with the first consumer — both
// live here as DATA rows, awaiting served hints, not as code branches.
const REGISTRY: Record<string, TaskKindDisplay> = {
  grouped_review: { badge: "REVIEW", title: "Disposition review" },
  pcn_disposition: { badge: "QUALIFY", title: "Qualification task" },
  access_request: { badge: "ACCESS", title: "Access request" },
  workflow_ack: { badge: "APPROVE", title: "Workflow approval" },
  // A THIRD SPECIES, not an approval. "Approve"/"Reject" on *"this notice could not be
  // prepared for review"* is not an awkward label — it records a decision the data cannot
  // represent, and ADR-0034's decision records would archive that immutably as promotion
  // evidence. Registered here BEFORE the card exists on purpose: an unregistered kind falls
  // back to APPROVAL_TASK, which is exactly how the bug shipped.
  extraction_refusal: { badge: "TRIAGE", title: "Unprocessable notice" },
  // Spec 208: the producer declares it (policy/task_kinds/document_empty_confirm.yaml) as an
  // APPROVAL_TASK; EmptyConfirmCard draws it. taskKindParity reds on a declared kind we omit.
  document_empty_confirm: { badge: "EMPTY", title: "Confirm a document has no parts" },
};

// THE DEFAULT WAS HONEST ABOUT LABELS AND DISHONEST ABOUT AFFORDANCES. "TASK" as a badge says
// nothing and is harmless; `APPROVAL_TASK` as an archetype says "this is a decision you accept
// or refuse" and hands the user two buttons to prove it. A label that says nothing is fine; an
// affordance that says nothing still acts. The badge default stays; the ARCHETYPE default
// renders the card in a NO-VERB read-only mode (see ApprovalTaskCard) so an unregistered kind
// degrades visibly instead of borrowing another species' semantics.
//
// THAT SENTENCE WAS FALSE WHEN IT WAS WRITTEN and stayed false for as long as it stood.
// `ApprovalTaskCard` had no no-verb mode; it offered Approve and Reject to every kind that
// reached it, which by this very default is every UNDECLARED kind. Corrected in place rather
// than deleted, because a false reason that is deleted is a false reason somebody re-derives.
// The behaviour now matches the claim, and `approvalTaskCard.test.tsx` is what keeps it true.
const DEFAULT: TaskKindDisplay = { badge: "TASK", title: "Task" };

/** Does cortex hold an interim badge/title row for this kind? Answers ONLY that. It decides display, never
 *  affordances, and it is NOT a declaration (that is the served `/task_kinds`, 2026-10-30). */
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
export const hasDisplayRow = (kind: string): boolean =>
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
