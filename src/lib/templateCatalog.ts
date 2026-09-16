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
