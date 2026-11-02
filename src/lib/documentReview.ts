/**
 * THE DOCUMENT REVIEW TASK (review_shape "document"), READ. A section list left, the page right,
 * Accept/Flag per section. Nothing here draws; `DocumentReviewCard` does.
 *
 * ⛔ PROPOSED, NOT RATIFIED (the section list). No producer serves a section list yet: it stays PROPOSED
 * until invincible-agent 0.4.75 serves it and a seal reads it (Lane 1, 2026-10-31). The names marked PROPOSED
 * below (the payload keys "sections" and "header") are Cortex's own, and THIS FILE is the ONLY place that
 * spells them, so ratification is a one-file edit. `documentReviewContainment.test.ts` seals that.
 *
 * The per-section verdict list is RETIRED (the gateway reads none of it). A review is sent as ITEM-FORM
 * coverage (`review_coverage`, see `reviewCoverage.ts`) with `item_kind` from the served registry row, and
 * the per-section note folds into the reason.
 *
 * Modelled on `emptyConfirm.ts` (PR #30): a reader keyed on `review_shape`, null when the payload
 * does not claim the shape, so the task falls through to the card that can honestly draw it.
 */

import type { ItemReviewCoverageWire } from "./reviewCoverage";
import type { ShapeRow } from "./reviewShapes";

export interface DocumentHeader {
  title: string | null;
  docId: string | null;
  revision: string | null;
  date: string | null;
}

export interface DocumentSection {
  sectionId: string;
  title: string;
  /** 1-based first page. */
  page: number;
  /** 1-based last page, only when it is a real range past `page`. */
  pageEnd: number | null;
}

export interface DocumentReviewTask {
  ingestId: string;
  header: DocumentHeader;
  sections: DocumentSection[];
  /** Sections dropped as malformed. A verdict on a subset must never be sent, so > 0 blocks submit. */
  droppedSections: number;
}

/** The registry row's review_shape this reader claims (it is the served key, not a case). */
export const DOCUMENT_REVIEW_SHAPE = "document";

/** The item kind this card produces ids for (a section's id), a mechanism like `PLAN_ITEM_KIND`. */
export const SECTION_ITEM_KIND = "section";

export type SectionVerdict = "accepted" | "flagged";

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function nonBlank(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}
function pageNo(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) && v >= 1 ? v : null;
}

interface Parsed {
  task: DocumentReviewTask | null;
  why: string | null;
}

function parse(task: { payload?: unknown } | null | undefined): Parsed {
  const payload = task?.payload;
  if (!isObj(payload)) return { task: null, why: "the payload is not an object" };
  if (payload.review_shape !== DOCUMENT_REVIEW_SHAPE) return { task: null, why: `review_shape is not "${DOCUMENT_REVIEW_SHAPE}"` };
  const ingestId = nonBlank(payload.ingest_id);
  if (ingestId === null) return { task: null, why: "ingest_id is missing" };
  // PROPOSED (unratified): the payload key "sections"
  const rawSections = payload["sections"];
  if (!Array.isArray(rawSections) || rawSections.length === 0) {
    return { task: null, why: "sections is not a non-empty array" };
  }
  const sections: DocumentSection[] = [];
  let dropped = 0;
  const seen = new Set<string>();
  for (const raw of rawSections) {
    if (!isObj(raw)) {
      dropped += 1;
      continue;
    }
    const sectionId = nonBlank(raw.section_id);
    const title = nonBlank(raw.title);
    const page = pageNo(raw.page);
    if (sectionId === null || title === null || page === null) {
      dropped += 1;
      continue;
    }
    if (seen.has(sectionId)) return { task: null, why: `duplicate section_id: ${sectionId}` };
    seen.add(sectionId);
    const end = pageNo(raw.page_end);
    sections.push({ sectionId, title, page, pageEnd: end !== null && end > page ? end : null });
  }
  if (sections.length === 0) return { task: null, why: "no section was well-formed" };
  // PROPOSED (unratified): the payload key "header" and its fields
  const h = isObj(payload.header) ? payload.header : {};
  return {
    task: {
      ingestId,
      header: { title: nonBlank(h.title), docId: nonBlank(h.doc_id), revision: nonBlank(h.revision), date: nonBlank(h.date) },
      sections,
      droppedSections: dropped,
    },
    why: null,
  };
}

export function readDocumentReviewTask(task: { payload?: unknown } | null | undefined): DocumentReviewTask | null {
  return parse(task).task;
}

/** Why a task is not a document review; null when it is one. For tests and for diagnosis. */
export function whyNotDocumentReview(task: { payload?: unknown } | null | undefined): string | null {
  return parse(task).why;
}

type Verdicts = Readonly<Record<string, SectionVerdict | undefined>>;

/**
 * The item-form coverage of a document review. A verdict for EVERY section, never a subset: a missing one
 * throws. The steward looked at every section to judge it, so `looked_at` is all ids in section order;
 * `flagged` is the flagged ids in section order. An id is the section_id, verbatim, as a string. This card
 * samples nothing and groups nothing, so those are empty and `sample` is null. The server checks that
 * `looked_at` equals the item universe and that `item_kind` and `rules_version` equal the row's.
 */
export function buildSectionCoverage(
  sections: readonly DocumentSection[],
  verdictsById: Verdicts,
  row: ShapeRow,
): ItemReviewCoverageWire {
  const looked: string[] = [];
  const flagged: string[] = [];
  for (const s of sections) {
    const verdict = verdictsById[s.sectionId];
    if (verdict !== "accepted" && verdict !== "flagged") {
      throw new Error(`section coverage incomplete: no verdict for ${s.sectionId}`);
    }
    looked.push(s.sectionId);
    if (verdict === "flagged") flagged.push(s.sectionId);
  }
  return {
    review_shape: row.review_shape,
    item_kind: row.item_kind,
    rules_version: row.rules_version,
    looked_at: looked,
    sampled: [],
    flagged,
    groups: [],
    shared: [],
    sample: null,
  };
}

/** The reason a reason-required verb carries: the flagged ids in section order, each with its non-blank note. */
export function flaggedSectionsReason(
  sections: readonly DocumentSection[],
  verdictsById: Verdicts,
  notesById: Readonly<Record<string, string | undefined>> = {},
): string {
  const parts: string[] = [];
  for (const s of sections) {
    if (verdictsById[s.sectionId] !== "flagged") continue;
    const note = (notesById[s.sectionId] ?? "").trim();
    parts.push(note !== "" ? `${s.sectionId} — ${note}` : s.sectionId);
  }
  return `sections flagged: ${parts.join("; ")}`;
}

/**
 * The verb that carries coverage: the one that takes no reason, else null. Interim role rule, as in
 * `PromotionReviewCard`: the producer's gateway decides it by verb name today and nothing served says which, so
 * with two (or no) candidates no verb gets the role and coverage is not sent -- fail closed, never a guess.
 */
export function documentCoverageVerb(verbs: readonly string[], needsReason: (v: string) => boolean): string | null {
  const plain = verbs.filter((v) => !needsReason(v));
  return plain.length === 1 ? plain[0] : null;
}

/**
 * Submit through the existing act path. `decision` is a served verb, passed through untouched; the reason
 * and the coverage (or none) are the card's to compose. The coverage is the act's sixth argument.
 */
export function actOnDocumentReview(
  act: (
    decision: string,
    reason: string,
    rowEdits: undefined,
    headerEdits: undefined,
    page: undefined,
    coverage: ItemReviewCoverageWire | undefined,
  ) => Promise<void>,
  decision: string,
  { reason, coverage }: { reason: string; coverage: ItemReviewCoverageWire | undefined },
): Promise<void> {
  return act(decision, reason, undefined, undefined, undefined, coverage);
}
