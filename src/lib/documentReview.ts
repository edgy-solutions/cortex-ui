/**
 * THE DOCUMENT REVIEW TASK (review_shape "document"), READ. A section list left, the page right,
 * Accept/Flag per section. Nothing here draws; `DocumentReviewCard` does.
 *
 * ⛔ PROPOSED, NOT RATIFIED. No producer declares a section list or a per-section verdict today:
 * `document_promotion.yaml` accepts `[promoted, rejected]` and the act takes one `decision`. Every
 * name marked PROPOSED below is Cortex's own proposal, and THIS FILE (plus `buildActBody` in
 * `src/api/client.ts`, which carries the verdicts) is the ONLY place that spells them, so
 * ratification is a one-file edit. `documentReviewContainment.test.ts` seals that.
 *
 * Modelled on `emptyConfirm.ts` (PR #30): a reader keyed on `review_shape`, null when the payload
 * does not claim the shape, so the task falls through to the card that can honestly draw it.
 */

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

export type SectionVerdict = "accepted" | "flagged";

/** The wire shape of one verdict. // PROPOSED (unratified): section_verdicts */
export interface SectionVerdictWire {
  section_id: string;
  verdict: SectionVerdict;
  note?: string;
}

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
  if (payload.review_shape !== "document") return { task: null, why: 'review_shape is not "document"' };
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

/**
 * The act's verdicts. A verdict for EVERY section, in the sections' order, never a subset: a missing
 * one throws. `note` only when non-empty. No decision is derived here: the verb is the served
 * declaration's (config names the case), chosen by the card.
 */
export function buildDocumentVerdicts(
  sections: readonly DocumentSection[],
  verdictsById: Readonly<Record<string, SectionVerdict | undefined>>,
  notesById: Readonly<Record<string, string | undefined>> = {},
): { section_verdicts: SectionVerdictWire[] } {
  const out: SectionVerdictWire[] = [];
  for (const s of sections) {
    const verdict = verdictsById[s.sectionId];
    if (verdict !== "accepted" && verdict !== "flagged") {
      throw new Error(`section_verdicts incomplete: no verdict for ${s.sectionId}`);
    }
    const note = (notesById[s.sectionId] ?? "").trim();
    out.push(note !== "" ? { section_id: s.sectionId, verdict, note } : { section_id: s.sectionId, verdict });
  }
  return { section_verdicts: out };
}

/**
 * Submit through the existing act path. Keeps the verdicts' wire name out of the card.
 * `decision` is a served verb, passed through untouched. When the declaration lists it in
 * `reason_required` (`document_promotion` does for its rejecting verb, and `useTaskAct.act` refuses
 * to send it blank), the reason names the flagged sections: the per-section notes travel in the
 * verdicts, this is the reason the verb itself needs. Otherwise the reason is empty.
 */
export function actOnDocumentReview(
  act: (decision: string, reason: string, rowEdits: undefined, headerEdits: undefined, extra: SectionVerdictWire[]) => Promise<void>,
  decision: string,
  built: ReturnType<typeof buildDocumentVerdicts>,
  reasonRequired: boolean,
): Promise<void> {
  const flagged = built.section_verdicts.filter((v) => v.verdict === "flagged").map((v) => v.section_id);
  const reason = reasonRequired ? `sections flagged: ${flagged.join(", ")}` : "";
  return act(decision, reason, undefined, undefined, built.section_verdicts);
}
