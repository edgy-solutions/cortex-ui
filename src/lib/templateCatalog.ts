/**
 * THE RATIFIED TEMPLATE MENU, READ WITHOUT FLATTENING ITS STATES.
 *
 * R-039's read path: before `/templates`, the only way to learn which boards exist was to SEED
 * one and see whether the id came back recognised. A picker built on that is a picker built on
 * guesses, and the failure it produces — offering a board that does not exist — is indisinguishable
 * on screen from offering one the caller may not have.
 *
 * ── FOUR STATES, AND COLLAPSING ANY TWO LOSES A REPAIR ────────────────────────────────────
 *
 *   unreachable   the endpoint did not answer. cortex knows NOTHING — not that there is nothing.
 *   unreadable    `composed: false`. The producer could not READ its template directory. An
 *                 empty list here is a deployment accident, and rendering it as a menu shows a
 *                 complete-looking picker with nothing in it.
 *   empty         `composed: true`, no templates. Genuinely nothing is ratified.
 *   ready         the menu.
 *
 * The producer draws the same distinction deliberately (`gateway.py` `/templates`: "anything
 * raising out of the read is reported as not-composed rather than as an empty menu"), so
 * flattening it on arrival would discard a distinction made one hop earlier on purpose — the
 * None-is-not-empty rule `/task_kinds` and `failure_cause` both turn on.
 *
 * ── A TEMPLATE THAT WILL NOT LOAD IS NAMED, NEVER DROPPED ─────────────────────────────────
 *
 * `unreadable[]` carries ratified ids whose files do not parse. The producer's reasoning, kept
 * here because the picker is where it becomes visible: "silently omitting it would make the list
 * SHORTER and nothing would say why, and a shorter list reads as the complete set." So the
 * picker shows what it cannot offer, with the reason, rather than a menu that quietly lost a row.
 *
 * ⛔ `template_ref` IS A CONTENT HASH AND IS NOT DECORATION. It distinguishes a template that
 * CHANGED from one that merely still exists. A picker holding a stale ref offers a board whose
 * shape has moved under it — the same class as a seeded board whose template was edited after
 * the fact.
 */

/** One offerable board. */
export interface TemplateRow {
  templateId: string;
  title: string;
  description: string;
  /** `<template_id>@<first 12 hex of sha256>` — changed content, changed ref. */
  templateRef: string;
  panels: number;
  sharedSlots: string[];
}

/** A ratified id whose file does not load. Named, with the producer's reason verbatim. */
export interface UnreadableTemplate {
  templateId: string;
  reason: string;
}

export type TemplateCatalog =
  | { status: "unreachable" }
  | { status: "unreadable"; unreadable: UnreadableTemplate[] }
  | { status: "empty"; unreadable: UnreadableTemplate[] }
  | { status: "ready"; templates: TemplateRow[]; unreadable: UnreadableTemplate[] };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

function readRow(v: unknown): TemplateRow | null {
  if (!isRecord(v)) return null;
  const templateId = str(v.template_id);
  // A row naming no template cannot be offered — picking it would send an id the producer never
  // gave. Dropped rather than rendered blank, the same rule `readExclusions` applies.
  if (!templateId) return null;
  const slots = Array.isArray(v.shared_slots) ? v.shared_slots.map(str).filter(Boolean) : [];
  return {
    templateId,
    title: str(v.title),
    description: str(v.description),
    templateRef: str(v.template_ref),
    panels: typeof v.panels === "number" && Number.isFinite(v.panels) ? v.panels : 0,
    sharedSlots: slots,
  };
}

function readUnreadable(raw: unknown): UnreadableTemplate[] {
  if (!Array.isArray(raw)) return [];
  const out: UnreadableTemplate[] = [];
  for (const v of raw) {
    if (!isRecord(v)) continue;
    const templateId = str(v.template_id);
    if (!templateId) continue;
    out.push({ templateId, reason: str(v.reason) });
  }
  return out;
}

/**
 * Read the catalog envelope.
 *
 * ⛔ `composed` IS TESTED POSITIVELY FOR `true`. An envelope that omits the flag, or sends a
 * non-boolean, is treated as NOT composed — because the flag's whole job is to distinguish a
 * real empty menu from a failed read, and assuming success when the producer did not say so
 * reintroduces exactly the case it was added to prevent.
 */
export function readTemplateCatalog(raw: unknown): TemplateCatalog {
  if (raw === null || raw === undefined) return { status: "unreachable" };
  if (!isRecord(raw)) return { status: "unreachable" };

  const unreadable = readUnreadable(raw.unreadable);
  if (raw.composed !== true) return { status: "unreadable", unreadable };

  const rows = Array.isArray(raw.templates) ? raw.templates : [];
  const templates = rows.map(readRow).filter((r): r is TemplateRow => r !== null);
  if (templates.length === 0) return { status: "empty", unreadable };
  return { status: "ready", templates, unreadable };
}

/**
 * ── SEEDABILITY: THE THIRD STATE THE PICKER NEVER HAD ─────────────────────────────────────
 *
 * A walk picked PROGRAM FINANCE STATUS and got an empty board. The template is not broken —
 * `policy/canvases/program_finance.yaml` is ratified, schema-valid, and says in its own header
 * that it CANNOT seed: `shared_slots: [program]` is declared with nothing binding it, so the
 * platform's seed route answers 409 (R-005, *"panel(s) consuming shared slot(s) ['program']
 * that nothing binds yet"*) and the file ends with, verbatim, *"Do not wire it into a seed path
 * expecting cards."*
 *
 * ⛔ CORTEX NEVER SEES THAT 409, BECAUSE CORTEX NEVER ASKS — the create path is local. So the
 * refusal the producer wrote down never reaches a reader, and the board we draw instead is one
 * we invented where the platform would have refused and named the reason.
 *
 * The evidence was already arriving. `/templates` sends `shared_slots` per row and `readRow`
 * projects it faithfully to `TemplateRow.sharedSlots` — and NOTHING READ IT. A correct field
 * with no consumer, which is the defect class this codebase keeps filing against: the picker
 * had two buckets, offerable and *"cannot be offered: <reason>"* for a file that will not
 * parse, and a ratified-but-unbindable template fell into the offerable one because there was
 * nowhere else for it to go.
 *
 * ── WHY NON-EMPTY IS ENOUGH, AND WHY THERE IS NO SECOND FLAG ──────────────────────────────
 *
 * `sharedSlots` NON-EMPTY means unseedable *from this picker*, with no further question asked,
 * because the create path binds nothing: `createCanvas` takes a name, a lens, and a template
 * id, and there is no argument through which a slot could be bound. The binding set is empty by
 * construction, not by accident — so when ADR-0050 §3 lands and create DOES carry a binding,
 * this predicate is the one place that has to learn about it.
 *
 * A producer-side `seedable: false` would be a THIRD declaration of one truth, after the
 * slots themselves and the seed route's 409, and this lane has already paid for that shape once
 * — a pinned seal that went stale while both halves it compared stayed true.
 */
export function needsBinding(row: TemplateRow): boolean {
  return row.sharedSlots.length > 0;
}

/**
 * Split the ready menu into what may be offered and what must be NAMED WITH ITS REASON.
 *
 * The unseedable rows are not dropped, for the reason the producer already gives for
 * `unreadable`: *"silently omitting it would make the list SHORTER and nothing would say why,
 * and a shorter list reads as the complete set."* A reader who came looking for the finance
 * board must find out that it exists and what it is waiting for.
 */
export function partitionTemplates(rows: TemplateRow[]): {
  offerable: TemplateRow[];
  unbound: TemplateRow[];
} {
  const offerable: TemplateRow[] = [];
  const unbound: TemplateRow[] = [];
  for (const row of rows) (needsBinding(row) ? unbound : offerable).push(row);
  return { offerable, unbound };
}

/**
 * Whether a create may carry this template id, and the reason when it may not.
 *
 * ⛔ THIS ENUMERATES THE SAFE SET, NOT THE DANGEROUS ONE. It permits exactly two things — no
 * template at all, and an id the catalog currently offers — so a stale id, an id that never
 * existed, an id from the `unreadable` list, and an id whose row grew a shared slot since it
 * was picked ALL refuse by default, without this function having to know their spellings. A
 * rule written the other way round is total only over the forms somebody thought to list.
 *
 * The stale path is reachable, not hypothetical: Cancel leaves `newTemplate` set, so a
 * selection outlives the form it was made in.
 *
 * Returning the reason rather than a boolean is deliberate. A create that silently does nothing
 * is the defect this repo fixed on the elicitation seam the same day — a reader who clicks and
 * is told nothing clicks again, or worse, believes it worked.
 */
export function refuseTemplateForCreate(
  templateId: string,
  catalog: TemplateCatalog,
): string | null {
  const id = templateId.trim();
  if (!id) return null; // a freeform board, which is always allowed
  const rows = catalog.status === "ready" ? catalog.templates : [];
  const row = rows.find((r) => r.templateId === id);
  if (!row) {
    // Not on the menu we can see. That covers a registry we could not read at all, which is
    // why the message does not claim the template is missing — only that we cannot offer it.
    return `${id} is not on offer, so no board was created.`;
  }
  if (needsBinding(row)) {
    return `${row.title || row.templateId} is ratified but needs a binding for ${row.sharedSlots.join(", ")} before it can arrange a board — no board was created.`;
  }
  return null;
}
