/**
 * promotionReview — what the review card (`PromotionReviewCard`) draws for a `document_promotion`
 * task: the notice's top line, its extracted rows, and where on the source PDF each row's
 * evidence sits.
 *
 * ── LANE 1's SHAPE, BUILT ON 193 (`lane/01-193` at 71cdc40b), NOT LIVE UNTIL 193 ROLLS ────────
 *
 * From Lane 1's packet, `sessions/2026-10-17-packet-to-cortex-the-review-card-routes-are-built-on-193-…`.
 * The data comes from two places:
 *
 *   THE TASK PAYLOAD (193 on): `ingest_id`, `notice_id`, `mfr`, `notice_date`, `part_count`,
 *     `attempt`. All four new keys are always present, and `null` when unknown. A task filed BEFORE
 *     193 keeps its old payload; `notice_id` was already on it.
 *   `GET /ingest/{ingest_id}/extraction` (`ingestExtractionPath`):
 *       { ingest_id, notice_id, content_kind, attempt, notice: {mfr, mfr_source, mfr_parent, notice_date},
 *         part_count, rows_without_evidence, review_ref,
 *         rows: [{ row_index, part_index, mpn, field, extracted_value, obtained_via,
 *                  match_confidence, needs_review, review_reason, source_snippet,
 *                  evidence_ref: {page, bbox, bboxes, page_dims, units} | null }] }
 *       (or, in the ruled form of 10-21, evidence_ref: {page, bbox} with the bbox in page fractions, no page_dims)
 *
 * The top line takes each field from the PAYLOAD when it carries a value, and from the extraction
 * otherwise. Both come from the same manifest, so on ordinary data they agree. A field where both
 * carry a value and the values DIFFER is listed in `headerConflicts`, and drawn as a flag. It is
 * not settled by picking one: a disagreement the card hid would be a coincidence defect.
 *
 * NOT SERVED by either source: the notice KIND (PCN/PDN, which the review standard puts on the top
 * line) and reject CODES. The card prints the kind as unknown, and offers `DEFAULT_REJECT_CODES`,
 * which cortex proposes. Both are asked of Lane 1 in the reply packet.
 *
 * ── THE SOURCE IS NEVER A PATH FROM THE PAYLOAD ───────────────────────────────────────────
 *
 * Both routes are built HERE from `payload.ingest_id` (`ingestExtractionPath`, `ingestSourcePath`),
 * and fetched through the minting wrapper with the caller's bearer. A path read off a payload
 * could be absolute (axios honours an absolute URL over `baseURL`), and the bearer would go
 * wherever it points.
 *
 * ── WHAT IS READ AS WHAT ──────────────────────────────────────────────────────────────────
 *
 * - A top-line field that is absent or mis-typed is `null`, and the card prints a dash. One bad
 *   field never hides the rows.
 * - A row with no string `mpn` is DROPPED and counted (`droppedRows`), never drawn half-filled.
 * - A row's evidence has THREE states, not two. ABSENT (`evidence_ref` missing or `null`) is the
 *   corpus-gate miss the standard names (7f). MALFORMED (present but unreadable) is a producer bug
 *   (Lane 1). They have different owners, so they are flagged differently.
 * - An evidence_ref arrives in one of two forms. With `page_dims` present: today's form below. With `page_dims`
 *   ABSENT: the ruled form (architect 10-21), `{page, bbox}` with the bbox in page fractions, read on a 1x1 page
 *   (`FRACTION_PAGE`); a bbox outside 0..1 or with no area is malformed.
 * - In EITHER form, `bbox: null` with a valid page is "stated on this page, no box we can draw" (architect 10-21):
 *   read as page-only, `page_dims` not validated. An absent `bbox` key is the same as null (Lane 1, 205); a bad page is malformed.
 * - `bbox` (with `page_dims`) is in `page_dims` units: `pt` for `text_layer_cell`, layout `px` otherwise. The card
 *   scales by `page_dims` (the evidence pane's sealed rule, `bboxScale.ts`), so `units` is carried
 *   but never needed to place the box.
 * - Two completeness counts travel, and each is CHECKED, never corrected:
 *   - `part_count` against the parts drawn (distinct `part_index`, else distinct mpn);
 *   - `rows_without_evidence` against the absent rows drawn.
 */
import type { Bbox, PageDims } from "./bboxScale";
import { FRACTION_PAGE, isFractionBox } from "./evidenceRef";
import { readCorrectedBy, readLeafSource, type IngestLeafSource } from "./ingestWire";

export interface EvidenceRef {
  /** 1-based page number in the source PDF. */
  page: number;
  /** Top-left origin, in `page_dims` units (the evidence pane's rule, `bboxScale.ts`). null = no box (page only);
   *  `page_dims` is then unused (nothing is scaled). */
  bbox: Bbox | null;
  page_dims: PageDims;
  /** `pt` or `px` as served, else null. Carried, never needed: the box is scaled by `page_dims`. */
  units: string | null;
}

export type RowEvidence =
  | { state: "ok"; ref: EvidenceRef }
  | { state: "absent" }
  | { state: "malformed" };

export interface ReviewRow {
  /** `row-<row_index>` when served, else `row-at-<position>`: React keys and keyboard selection only. */
  key: string;
  mpn: string;
  part_index: number | null;
  field: string | null;
  extracted_value: string | null;
  obtained_via: string | null;
  /** The extractor's own doubt, drawn as muted text beside the row. */
  needs_review: boolean;
  review_reason: string | null;
  evidence: RowEvidence;
}

export interface RejectCode {
  code: string;
  label: string;
}

/** The `/extraction` body, read. */
export interface Extraction {
  notice_id: string | null;
  manufacturer: string | null;
  /** Which value `manufacturer` is: the header's own, or the `notice_identity` fallback for a blank header (`MfrSource`). */
  manufacturer_source: MfrSource;
  notice_date: string | null;
  attempt: number | null;
  part_count: number | null;
  rows_without_evidence: number | null;
  rows: ReviewRow[];
  droppedRows: number;
  /** PCN or PDN, when the extraction names it; anything else reads as null (a defaulted doc_type is not shown). */
  leaf: "pcn" | "pdn" | null;
  /** Where the leaf came from: the drop, the title, or a person (same enum as the status row). */
  leaf_source: IngestLeafSource | null;
  /** The person who changed it; only with source "corrected", else null. */
  corrected_by: string | null;
}

/**
 * `notice.mfr_source` (199 on, `_review_notice_summary`): `"header"` when `notice.mfr` is the
 * header's own value, `"identity"` when the header was blank and `notice.mfr` is the
 * `notice_identity` fallback, null when there is no value. A BFF without the key is read as
 * `"header"` (what `notice.mfr` always meant before 199); any other value reads as null.
 */
export type MfrSource = "header" | "identity" | null;

/**
 * The sources whose `notice.mfr` the server compares a header edit against. The act route passes
 * `extracted.mfr` only `if _hdr.get("mfr_source") == "header"`, else None: a steward value equal to
 * the identity FALLBACK fills a missing header field and is accepted (the TYC ruling). Sealed against
 * gateway.py in rowEditsWireParity.test.ts.
 */
export const MFR_COMPARED_SOURCES: readonly MfrSource[] = ["header"];

/** What a header edit is refused for equalling, per field: the extraction's values, mfr only when the server compares it. */
export function headerEditComparands(ex: Extraction | null): { mfr: string | null; notice_id: string | null; notice_date: string | null } {
  return {
    mfr: ex && MFR_COMPARED_SOURCES.includes(ex.manufacturer_source) ? ex.manufacturer : null,
    notice_id: ex?.notice_id ?? null,
    notice_date: ex?.notice_date ?? null,
  };
}

/** The 193 payload header, read. Every field null on a task filed before 193 (except notice_id). */
export interface PromotionHeader {
  ingest_id: string | null;
  notice_id: string | null;
  manufacturer: string | null;
  notice_date: string | null;
  attempt: number | null;
  part_count: number | null;
}

export type HeaderField = "notice_id" | "manufacturer" | "notice_date" | "attempt" | "part_count";

/** What the card draws: the merged top line, plus the rows once the extraction has arrived. */
export interface PromotionReview {
  ingest_id: string | null;
  notice_id: string | null;
  manufacturer: string | null;
  notice_date: string | null;
  attempt: number | null;
  part_count: number | null;
  /** Fields both sources carry, with different values. */
  headerConflicts: HeaderField[];
  /** null until the extraction arrives, and when it cannot be read. */
  extraction: Extraction | null;
  rows: ReviewRow[];
  rejectCodes: RejectCode[];
}

/**
 * The reject codes, ruled final by the architect (2026-10-17): these four, in this order. The
 * chosen code IS the reason sent, plus any note.
 *
 * A wrong value, a wrong part or a missing row is NOT a reject. It is a CORRECTION: the steward
 * fixes the row in place against the evidence (row_edits, flag-gated), and the correction files
 * extraction_defect itself. A reject for a wrong value sends nothing back to the extractor and
 * loses the correction, so those three codes are gone from here on purpose.
 *
 * The producer takes exactly these four: promotion.py's PROMOTION_REJECT_CODES, and since c1dbbf6c (served
 * from 198) the grouped act's _GROUPED_REJECT_CODES too. rowEditsWireParity.test.ts seals this list and the
 * grouped table's against both, in order.
 */
export const DEFAULT_REJECT_CODES: RejectCode[] = [
  { code: "not_a_notice", label: "not a PCN/PDN" },
  { code: "unreadable", label: "the source cannot be read" },
  { code: "parts_unusable", label: "the parts list cannot be used" },
  { code: "duplicate", label: "already promoted under another drop" },
];

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
const posInt = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) && v >= 1 ? v : null);
const count = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function readEvidence(raw: Record<string, unknown>): RowEvidence {
  if (!Object.hasOwn(raw, "evidence_ref") || raw.evidence_ref === null || raw.evidence_ref === undefined) {
    return { state: "absent" };
  }
  const e = raw.evidence_ref;
  if (!isObj(e)) return { state: "malformed" };
  const page = posInt(e.page);
  // A null (or absent) bbox: stated on this page, no box we can draw. Either form; page_dims is not validated.
  if (!Object.hasOwn(e, "bbox") || e.bbox === null) {
    if (page === null) return { state: "malformed" };
    return { state: "ok", ref: { page, bbox: null, page_dims: FRACTION_PAGE, units: str(e.units) } };
  }
  const b = e.bbox;
  const d = e.page_dims;
  // The ruled form (architect 10-21): page fractions, no page_dims. The page's own size is 1x1.
  // Extra keys are not checked here: the served row body carries others.
  if (!Object.hasOwn(e, "page_dims") || d === undefined) {
    if (page === null || !isFractionBox(b)) return { state: "malformed" };
    return { state: "ok", ref: { page, bbox: b, page_dims: FRACTION_PAGE, units: null } };
  }
  if (page === null || !Array.isArray(b) || b.length !== 4 || !b.every(finite) || !isObj(d)) return { state: "malformed" };
  const { width, height } = d;
  if (!finite(width) || !finite(height) || width <= 0 || height <= 0) return { state: "malformed" };
  const [x0, y0, x1, y1] = b as Bbox;
  // A box with no area, or turned inside out, outlines nothing a steward could read against.
  if (x1 <= x0 || y1 <= y0) return { state: "malformed" };
  return { state: "ok", ref: { page, bbox: [x0, y0, x1, y1], page_dims: { width, height }, units: str(e.units) } };
}

function scalarText(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null;
}

/**
 * The ingest id a task is reviewed by, or null when the task gets the generic card. Keyed on the
 * KIND as well as the id. Lane 1's routes are the review's only data, and only a
 * `document_promotion` task opens them to its audience. A task of another kind that happened to
 * carry an `ingest_id` would fetch routes that refuse it.
 */
export function promotionReviewIngestId(kind: string, payload: unknown): string | null {
  if (kind !== "document_promotion" || !isObj(payload)) return null;
  return str(payload.ingest_id);
}

/** `GET /ingest/{id}/extraction`'s body, read; null when it is not an object with a rows array. */
export function readExtraction(body: unknown): Extraction | null {
  if (!isObj(body) || !Array.isArray(body.rows)) return null;
  const rows: ReviewRow[] = [];
  let droppedRows = 0;
  body.rows.forEach((raw, i) => {
    if (!isObj(raw) || str(raw.mpn) === null) {
      droppedRows += 1;
      return;
    }
    const idx = count(raw.row_index);
    rows.push({
      key: idx !== null ? `row-${idx}` : `row-at-${i}`,
      mpn: raw.mpn as string,
      part_index: count(raw.part_index),
      field: str(raw.field),
      extracted_value: scalarText(raw.extracted_value),
      obtained_via: str(raw.obtained_via),
      needs_review: raw.needs_review === true,
      review_reason: str(raw.review_reason),
      evidence: readEvidence(raw),
    });
  });
  const notice = isObj(body.notice) ? body.notice : {};
  return {
    notice_id: str(body.notice_id),
    manufacturer: str(notice.mfr),
    manufacturer_source: !("mfr_source" in notice)
      ? "header"
      : notice.mfr_source === "header" || notice.mfr_source === "identity"
        ? notice.mfr_source
        : null,
    notice_date: str(notice.notice_date),
    attempt: posInt(body.attempt),
    part_count: count(body.part_count),
    rows_without_evidence: count(body.rows_without_evidence),
    rows,
    droppedRows,
    leaf: body.leaf === "pcn" || body.leaf === "pdn" ? body.leaf : null,
    leaf_source: readLeafSource(body.leaf_source),
    corrected_by: readCorrectedBy(readLeafSource(body.leaf_source), body.corrected_by),
  };
}

/** The task payload's header: 193's keys, and `notice_id`, which pre-193 tasks carry too. */
export function readPromotionHeader(payload: unknown): PromotionHeader {
  const p = isObj(payload) ? payload : {};
  return {
    ingest_id: str(p.ingest_id),
    notice_id: str(p.notice_id),
    manufacturer: str(p.mfr),
    notice_date: str(p.notice_date),
    attempt: posInt(p.attempt),
    part_count: count(p.part_count),
  };
}

const HEADER_FIELDS: HeaderField[] = ["notice_id", "manufacturer", "notice_date", "attempt", "part_count"];

/** The top line from both sources (payload first), the conflicts between them, and the rows. */
export function mergeReview(header: PromotionHeader, extraction: Extraction | null): PromotionReview {
  // Both sources type each field alike (string | null or number | null), so the union is that type.
  const pick = <K extends HeaderField>(k: K) => (header[k] ?? extraction?.[k] ?? null) as PromotionHeader[K];
  const headerConflicts = HEADER_FIELDS.filter((k) => {
    const a = header[k];
    const b = extraction?.[k] ?? null;
    return a !== null && b !== null && a !== b;
  });
  return {
    ingest_id: header.ingest_id,
    notice_id: pick("notice_id"),
    manufacturer: pick("manufacturer"),
    notice_date: pick("notice_date"),
    attempt: pick("attempt"),
    part_count: pick("part_count"),
    headerConflicts,
    extraction,
    rows: extraction?.rows ?? [],
    rejectCodes: DEFAULT_REJECT_CODES,
  };
}

/**
 * The parts drawn, which `part_count` is checked against. Lane 1 groups rows by `part_index`
 * (`mpn` is that part's `affected_mpn`). So `part_index` is counted when every row carries one,
 * and the distinct mpns are counted otherwise.
 */
export function partsDrawn(rows: ReviewRow[]): number {
  if (rows.length > 0 && rows.every((r) => r.part_index !== null)) return new Set(rows.map((r) => r.part_index)).size;
  return new Set(rows.map((r) => r.mpn)).size;
}

/** What the card flags above the rows. Each is a separate fact, with a separate owner. */
export interface ReviewFlags {
  /** Rows with no `evidence_ref`: the corpus-gate miss (7f). */
  absentEvidence: number;
  /** Rows whose `evidence_ref` cannot be read: a producer bug (Lane 1). */
  malformedEvidence: number;
  /** `part_count` disagrees with the parts drawn; null when it agrees or did not travel. */
  partsMismatch: { declared: number; drawn: number } | null;
  /** `part_count` did not travel, so the table cannot be shown to be whole. */
  partsUnknown: boolean;
  /** `rows_without_evidence` disagrees with the absent rows drawn; null when it agrees or did not travel. */
  evidenceCountMismatch: { served: number; drawn: number } | null;
  /** Rows whose outline is the enclosing table box, not the cell (`evidenceQuality` "region"). Counts only rows with a box: no box, no outline to warn about. */
  regionEvidence: number;
  /** Rows with a box whose `obtained_via` is no method this card knows: the outline is not claimed exact. Rows with a null bbox are not counted. */
  unknownMethod: number;
}

/** Null until the extraction has arrived: nothing can be counted before the rows are here. */
export function reviewFlags(review: PromotionReview): ReviewFlags | null {
  const ex = review.extraction;
  if (!ex) return null;
  const drawn = partsDrawn(ex.rows);
  const absent = ex.rows.filter((r) => r.evidence.state === "absent").length;
  return {
    absentEvidence: absent,
    malformedEvidence: ex.rows.filter((r) => r.evidence.state === "malformed").length,
    partsMismatch: review.part_count !== null && review.part_count !== drawn ? { declared: review.part_count, drawn } : null,
    partsUnknown: review.part_count === null,
    evidenceCountMismatch:
      ex.rows_without_evidence !== null && ex.rows_without_evidence !== absent
        ? { served: ex.rows_without_evidence, drawn: absent }
        : null,
    regionEvidence: ex.rows.filter((r) => r.evidence.state === "ok" && r.evidence.ref.bbox !== null && evidenceQuality(r.obtained_via) === "region").length,
    unknownMethod: ex.rows.filter((r) => r.evidence.state === "ok" && r.evidence.ref.bbox !== null && evidenceQuality(r.obtained_via) === "unknown").length,
  };
}

/**
 * What a row's outline actually IS. `obtained_via` is doc-tools' `match_method` (Lane 1's 193
 * packet), and a has-a-bbox test passes all three qualities alike (7f, 2026-10-17, doc-tools #132):
 *   cell       `text_layer_cell`: the exact cell.
 *   region     `region_preferred` / `unique`: the enclosing TABLE box; every row on the page shares it.
 *   inherited  `inherited_doc_level`: the sentence that states a document-level date (an LTB stated
 *              once, in prose); often on a different page from the row, and one crop for every row.
 * The safe set is enumerated: any other method is "unknown", never taken for the cell.
 */
export type EvidenceQuality = "cell" | "region" | "inherited" | "unknown";

const QUALITY_BY_METHOD: Record<string, EvidenceQuality> = {
  text_layer_cell: "cell",
  region_preferred: "region",
  unique: "region",
  inherited_doc_level: "inherited",
};

export function evidenceQuality(obtainedVia: string | null): EvidenceQuality {
  return (obtainedVia !== null && Object.hasOwn(QUALITY_BY_METHOD, obtainedVia) && QUALITY_BY_METHOD[obtainedVia]) || "unknown";
}

/** Rows whose evidence is this exact crop: an inherited date's one sentence clears them all at once. */
export function rowsSharingEvidence(rows: ReviewRow[], ref: EvidenceRef): number {
  // A page with no box is not "this exact crop": a null-bbox ref matches nothing. A row's null bbox keys as
  // "<page>:none", which no boxed ref's key can equal.
  if (ref.bbox === null) return 0;
  const k = (e: EvidenceRef) => `${e.page}:${e.bbox ? e.bbox.join(",") : "none"}`;
  const want = k(ref);
  return rows.filter((r) => r.evidence.state === "ok" && k(r.evidence.ref) === want).length;
}

/** `sha256:5b15f205…` or bare hex: the first 12 hex, for the top line. The full value goes in a title. */
export function shaPrefix(sha: string): string {
  const hex = sha.startsWith("sha256:") ? sha.slice(7) : sha;
  return hex.slice(0, 12);
}

/**
 * The reason sent with a reject: the code, then the steward's note if any. The declaration
 * requires a reason for `rejected` and names no codes, so this string is the whole record of why.
 */
export function rejectReason(code: string, note: string): string {
  const n = note.trim();
  return n ? `${code}: ${n}` : code;
}

/**
 * An error's body as JSON. `/source` is fetched with `responseType: "arraybuffer"`, so axios hands
 * its error body over as BYTES too: a coded 404 `source_absent` arrives as an ArrayBuffer and, read
 * as an object, has no `detail` — which would misread it as "route not served". Decode first.
 */
function errorBody(data: unknown): unknown {
  const bytes = Object.prototype.toString.call(data) === "[object ArrayBuffer]" ? new Uint8Array(data as ArrayBuffer) : ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : null;
  if (!bytes) return data;
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

/**
 * Why one of the review's two routes failed, in words a steward can act on. The server's own
 * `detail.error` code is named whenever it sent one. A PLAIN 404 (no code) is the route not
 * being served at all: before 193 rolls, FastAPI answers an unknown path that way. That is
 * different from 404 `ingest_not_found`, which the route itself sends. The server's `detail.message`
 * is shown after the code when it sent one.
 */
export function reviewRouteFailure(err: unknown, route: "extraction" | "source"): string {
  const res = isObj(err) && isObj(err.response) ? err.response : null;
  const status = res && typeof res.status === "number" ? res.status : null;
  const body = res ? errorBody(res.data) : null;
  const detail = isObj(body) ? body.detail : null;
  const code = isObj(detail) ? str(detail.error) : null;
  const message = isObj(detail) ? str(detail.message) : null;
  const what = route === "extraction" ? "The extraction" : "The source";
  if (status === 404 && code === null) return `${what} route is not served here yet (404). It lands with 193.`;
  if (status === 403) return `You are not entitled to this task's ${route} (403${code ? ` ${code}` : ""}). A steward's access closes when the task resolves.`;
  if (status !== null) {
    const head = `${what} could not be loaded (${status}${code ? ` ${code}` : ""})`;
    if (message === null) return `${head}.`;
    return `${head}: ${message}${/[.!?]$/.test(message) ? "" : "."}`;
  }
  if (route === "extraction") return "The extraction could not be loaded.";
  return `The source request failed before any answer (${errorText(err)}).`;
}

/** `Name: message`, capped, for a thrown value of any shape. Never a stack. */
export function errorText(err: unknown): string {
  const name = isObj(err) && typeof err.name === "string" && err.name ? err.name : "Error";
  const msg = isObj(err) && typeof err.message === "string" ? err.message : String(err);
  const s = `${name}: ${msg}`.replace(/\s+/g, " ").trim();
  return s.length > 300 ? `${s.slice(0, 299)}…` : s;
}

/** The first bytes, printable ASCII as-is and everything else as \xHH, quoted. */
export function bytesPreview(bytes: ArrayBuffer, n = 16): string {
  const head = new Uint8Array(bytes, 0, Math.min(n, bytes.byteLength));
  let s = "";
  for (const b of head) s += b >= 0x20 && b < 0x7f && b !== 0x22 && b !== 0x5c ? String.fromCharCode(b) : `\\x${b.toString(16).padStart(2, "0")}`;
  return `"${s}"${bytes.byteLength > n ? "…" : ""}`;
}

/** pdf.js accepts a `%PDF-` header anywhere in the first 1024 bytes. */
function hasPdfHeader(bytes: ArrayBuffer): boolean {
  const head = new Uint8Array(bytes, 0, Math.min(1024, bytes.byteLength));
  for (let i = 0; i + 5 <= head.length; i++) {
    if (head[i] === 0x25 && head[i + 1] === 0x50 && head[i + 2] === 0x44 && head[i + 3] === 0x46 && head[i + 4] === 0x2d) return true;
  }
  return false;
}

/**
 * Why a `/source` that ANSWERED could not be opened, naming what it answered. THE P0 THIS IS FOR
 * (2026-10-18): real PDFs showed "could not be read as a PDF" because pdf.js's worker was refused
 * by the browser (served as octet-stream); the sentence blamed the bytes and hid pdf.js's own
 * message, which named the worker. So the pane never guesses: bytes that are not a PDF say so with
 * their first bytes, and a PDF pdf.js could not open carries pdf.js's error verbatim.
 */
export function sourceOpenFailure(err: unknown, src: { bytes: ArrayBuffer; status: number; contentType: string | null }): string {
  const got = `${src.status} ${src.contentType ?? "with no content-type"}`;
  const n = src.bytes.byteLength;
  if (n === 0) return `The source answered ${got} with no bytes.`;
  if (!hasPdfHeader(src.bytes)) return `The source answered ${got}, ${n} bytes, but they are not a PDF: they begin ${bytesPreview(src.bytes)}.`;
  return `The source answered ${got}, ${n} bytes beginning ${bytesPreview(src.bytes)}, and pdf.js could not open it: ${errorText(err)}`;
}
