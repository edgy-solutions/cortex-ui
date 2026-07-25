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
 */

export interface TaskKindDisplay {
  /** Short chip label (timeline row, card header). */
  badge: string;
  /** Full descriptive title (HUD, card). */
  title: string;
  /** Which canvas archetype renders this kind's card. */
  archetype: "GROUPED_REVIEW" | "APPROVAL_TASK";
}

// The single hardcoded table. `access_request` / `workflow_ack` are generic task
// kinds; `pcn_*` are domain values that leaked in with the first consumer — both
// live here as DATA rows, awaiting served hints, not as code branches.
const REGISTRY: Record<string, TaskKindDisplay> = {
  pcn_grouped_review: { badge: "REVIEW", title: "Disposition review", archetype: "GROUPED_REVIEW" },
  pcn_disposition: { badge: "QUALIFY", title: "Qualification task", archetype: "APPROVAL_TASK" },
  access_request: { badge: "ACCESS", title: "Access request", archetype: "APPROVAL_TASK" },
  workflow_ack: { badge: "APPROVE", title: "Workflow approval", archetype: "APPROVAL_TASK" },
};

const DEFAULT: TaskKindDisplay = { badge: "TASK", title: "Task", archetype: "APPROVAL_TASK" };

/** Resolve a kind's display hints — the honest default for an undeclared kind. */
export function taskKindDisplay(kind: string): TaskKindDisplay {
  return REGISTRY[kind] ?? DEFAULT;
}

export const taskKindLabel = (kind: string): string => taskKindDisplay(kind).badge;
export const taskKindTitle = (kind: string): string => taskKindDisplay(kind).title;
