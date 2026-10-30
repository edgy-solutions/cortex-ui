/**
 * Task-kind presentation: archetype resolution plus the generic default for display hints.
 *
 * GENERIC-AT-BIRTH (all repos, not just engines): domain display is DATA, not code. A task kind's
 * badge and title are the SERVED declaration's (`/task_kinds`, the producer's `renders_as`, held
 * in `useTaskKindStore`). The interim hand-written badge/title table that used to live here is
 * RETIRED (architect, relayed 2026-10-30): it even disagreed with the producer, so the served
 * value is now the only one.
 *
 * What remains here:
 *   - `resolveTaskArchetype` / `GENERIC_TASK_ARCHETYPE`: a served archetype name to a card.
 *   - The honest default (TASK / Task) for a kind the menu does not serve, or does not serve YET:
 *     the default shows until `/task_kinds` loads, then the components re-render.
 *
 * A NEW task kind is a served declaration, never a row or a `kind === "..."` branch here.
 * Whether a kind is declared is the served `/task_kinds`' answer (`useTaskAct`), not this file's.
 *
 * History: this table and `_VERBS_BY_KIND` in invincible-agent's `src/iagent/human_tasks.py` were
 * the two interim per-kind tables slated to retire together (see invincible-agent
 * `docs/reference/m3-grouped-review-definition-design.md` "TWO interim per-kind tables").
 * Cortex's half has now retired; the producer's half is theirs.
 */

import type { TaskDeclaration } from "@/lib/taskDeclaration";

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

type ServedKinds = Readonly<Record<string, TaskDeclaration>>;

/** The served display hints for a kind: the /task_kinds declaration's badge/title when the menu serves a
 *  non-empty one, else the honest generic default. `byKind` is the store's (useTaskKindStore). Badge and
 *  title are taken independently. */
export function taskKindDisplay(kind: string, byKind: ServedKinds): TaskKindDisplay {
  // `kind` is a PROJECTION FIELD, it arrives from data, so a row carrying "constructor" or "toString"
  // reaches this lookup; index access walks `Object.prototype`, and the old table read `.badge` off a
  // builtin (a blank badge and a literal `undefined` in the HUD). What stops that NOW is the per-field
  // `typeof ... === "string"` check below: a builtin has no string badge, so it takes DEFAULT. Removing
  // `Object.hasOwn` alone is an equivalent mutant today (it survived, 2026-10-30); it stays so the lookup
  // means "this kind's OWN declaration", and the prototype-key arms in the test hold the behaviour.
  const d = Object.hasOwn(byKind, kind) ? byKind[kind] : undefined;
  return {
    badge: typeof d?.badge === "string" && d.badge !== "" ? d.badge : DEFAULT.badge,
    title: typeof d?.title === "string" && d.title !== "" ? d.title : DEFAULT.title,
  };
}

export const taskKindLabel = (kind: string, byKind: ServedKinds): string => taskKindDisplay(kind, byKind).badge;
export const taskKindTitle = (kind: string, byKind: ServedKinds): string => taskKindDisplay(kind, byKind).title;
