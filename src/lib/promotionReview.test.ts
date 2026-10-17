/**
 * `promotionReview` — Lane 1's 193 shape read as what the review card draws. Each arm here is one
 * of the module's stated rules (see its doc comment):
 *   - which task gets the review card;
 *   - what a dropped row is;
 *   - the THREE evidence states;
 *   - the header merged from two sources, with a disagreement surfaced and not settled;
 *   - the two completeness counts, checked and never corrected;
 *   - the route failures, named by the server's own code.
 */
import { describe, it, expect } from "vitest";
import {
  promotionReviewIngestId,
  readExtraction,
  readPromotionHeader,
  mergeReview,
  reviewFlags,
  partsDrawn,
  shaPrefix,
  rejectReason,
  reviewRouteFailure,
  DEFAULT_REJECT_CODES,
  evidenceQuality,
  rowsSharingEvidence,
  type Extraction,
} from "./promotionReview";
import { fixtureExtractionBody, fixturePromotionPayload } from "./promotionReviewFixture";

const SHA = `sha256:${"5b15f205".padEnd(64, "0")}`;
const ev = { page: 1, bbox: [10, 20, 110, 40], page_dims: { width: 612, height: 792 }, units: "pt" };
const extraction = (over: Record<string, unknown> = {}) => ({
  ingest_id: SHA,
  notice_id: "EOL-36",
  content_kind: "pdf",
  attempt: 2,
  notice: { mfr: "Example", mfr_parent: null, notice_date: "2026-09-30" },
  part_count: 1,
  rows: [{ row_index: 0, part_index: 0, mpn: "A-1", field: "ltb_date", extracted_value: "2027-03-31", obtained_via: "text_layer_cell", evidence_ref: ev }],
  rows_without_evidence: 0,
  review_ref: null,
  ...over,
});
const read = (over: Record<string, unknown> = {}) => readExtraction(extraction(over))!;
const NO_HEADER = readPromotionHeader({ ingest_id: SHA });
const flagsOf = (ex: Extraction, header = NO_HEADER) => reviewFlags(mergeReview(header, ex))!;

describe("which task gets the review card", () => {
  it("a document_promotion task naming an ingest_id, and nothing else", () => {
    expect(promotionReviewIngestId("document_promotion", { ingest_id: SHA })).toBe(SHA);
    expect(promotionReviewIngestId("document_promotion", { ingest_id: "" })).toBeNull();
    expect(promotionReviewIngestId("document_promotion", { subject: SHA })).toBeNull();
    expect(promotionReviewIngestId("document_promotion", null)).toBeNull();
    // another kind carrying an ingest_id would fetch routes that refuse it
    expect(promotionReviewIngestId("evidence_review", { ingest_id: SHA })).toBeNull();
  });
});

describe("the extraction body", () => {
  it("not an object, or rows that are not an array: unreadable (null)", () => {
    expect(readExtraction(null)).toBeNull();
    expect(readExtraction([])).toBeNull();
    expect(readExtraction(extraction({ rows: "nope" }))).toBeNull();
    expect(readExtraction(extraction({ rows: undefined }))).toBeNull();
  });

  it("an empty rows array reads: zero rows is an answer, not a failure", () => {
    expect(read({ rows: [] }).rows).toEqual([]);
  });

  it("the fixture reads whole: six rows over two parts, every one with evidence, counts agreeing", () => {
    const ex = readExtraction(fixtureExtractionBody(SHA))!;
    expect(ex.rows).toHaveLength(6);
    expect(ex.rows.every((x) => x.evidence.state === "ok")).toBe(true);
    expect(partsDrawn(ex.rows)).toBe(2);
    const merged = mergeReview(readPromotionHeader(fixturePromotionPayload(SHA)), ex);
    expect(merged.headerConflicts).toEqual([]);
    expect(reviewFlags(merged)).toEqual({
      absentEvidence: 0,
      malformedEvidence: 0,
      partsMismatch: null,
      partsUnknown: false,
      evidenceCountMismatch: null,
      regionEvidence: 2, // the two replacement rows on p2 are table-box evidence
      unknownMethod: 0,
    });
  });

  it("reads the header out of the body, the notice's fields from under `notice`", () => {
    expect(read()).toMatchObject({ notice_id: "EOL-36", manufacturer: "Example", notice_date: "2026-09-30", attempt: 2, part_count: 1, rows_without_evidence: 0 });
    expect(read({ notice: null })).toMatchObject({ manufacturer: null, notice_date: null });
    expect(read({ notice_id: 42, attempt: 0, part_count: -1 })).toMatchObject({ notice_id: null, attempt: null, part_count: null });
  });

  it("part_count 0 is a count, not an absence", () => {
    expect(read({ part_count: 0 }).part_count).toBe(0);
  });
});

describe("rows", () => {
  it("a row without a string mpn is dropped and counted, never drawn half-filled", () => {
    const ex = read({ rows: [{ mpn: "", evidence_ref: ev }, { mpn: 5 }, 7, { mpn: "B-2", evidence_ref: ev }] });
    expect(ex.rows.map((x) => x.mpn)).toEqual(["B-2"]);
    expect(ex.droppedRows).toBe(3);
  });

  it("a numeric or boolean value is drawn as text; an object value is a dash, not [object Object]", () => {
    const ex = read({ rows: [{ mpn: "A", extracted_value: 3.3 }, { mpn: "B", extracted_value: false }, { mpn: "C", extracted_value: { v: 1 } }] });
    expect(ex.rows.map((x) => x.extracted_value)).toEqual(["3.3", "false", null]);
  });

  it("row_index is the key when served, else the row's position", () => {
    const ex = read({ rows: [{ row_index: 9, mpn: "A" }, { mpn: "B" }] });
    expect(ex.rows.map((x) => x.key)).toEqual(["row-9", "row-at-1"]);
  });

  it("needs_review is true only when served true; review_reason rides with it", () => {
    const ex = read({ rows: [{ mpn: "A", needs_review: true, review_reason: "two dates" }, { mpn: "B", needs_review: "yes" }] });
    expect(ex.rows.map((x) => [x.needs_review, x.review_reason])).toEqual([[true, "two dates"], [false, null]]);
  });
});

describe("evidence has three states, with different owners", () => {
  const one = (row: Record<string, unknown>) => read({ rows: [{ mpn: "A", ...row }] }).rows[0].evidence;

  it("missing or null evidence_ref is ABSENT (the corpus-gate miss)", () => {
    expect(one({})).toEqual({ state: "absent" });
    expect(one({ evidence_ref: null })).toEqual({ state: "absent" });
  });

  it("a readable ref is ok, carried exactly, units and all", () => {
    expect(one({ evidence_ref: ev })).toEqual({ state: "ok", ref: { page: 1, bbox: [10, 20, 110, 40], page_dims: { width: 612, height: 792 }, units: "pt" } });
    expect(one({ evidence_ref: { ...ev, units: undefined } })).toMatchObject({ state: "ok", ref: { units: null } });
  });

  it.each([
    ["not an object", "p1"],
    ["page 0 (pages are 1-based)", { ...ev, page: 0 }],
    ["fractional page", { ...ev, page: 1.5 }],
    ["three-number bbox", { ...ev, bbox: [1, 2, 3] }],
    ["a NaN in the bbox", { ...ev, bbox: [1, 2, NaN, 4] }],
    ["a string in the bbox", { ...ev, bbox: [1, 2, "3", 4] }],
    ["a box with no width", { ...ev, bbox: [10, 20, 10, 40] }],
    ["a box turned upside down", { ...ev, bbox: [10, 40, 110, 20] }],
    ["no page_dims", { page: 1, bbox: ev.bbox }],
    ["zero page height", { ...ev, page_dims: { width: 612, height: 0 } }],
  ])("%s is MALFORMED, not absent", (_label, ref) => {
    expect(one({ evidence_ref: ref })).toEqual({ state: "malformed" });
  });
});

describe("the header comes from two places", () => {
  const PAYLOAD_193 = { ingest_id: SHA, notice_id: "EOL-36", mfr: "Example", notice_date: "2026-09-30", part_count: 1, attempt: 2 };

  it("193's payload header, read; a pre-193 payload has only notice_id", () => {
    expect(readPromotionHeader(PAYLOAD_193)).toEqual({ ingest_id: SHA, notice_id: "EOL-36", manufacturer: "Example", notice_date: "2026-09-30", attempt: 2, part_count: 1 });
    expect(readPromotionHeader({ ingest_id: SHA, notice_id: "EOL-36", mfr: null, notice_date: null, part_count: null, attempt: null })).toEqual({
      ingest_id: SHA, notice_id: "EOL-36", manufacturer: null, notice_date: null, attempt: null, part_count: null,
    });
  });

  it("before the extraction arrives the top line is the payload's, with no rows and no flags", () => {
    const m = mergeReview(readPromotionHeader(PAYLOAD_193), null);
    expect(m).toMatchObject({ notice_id: "EOL-36", manufacturer: "Example", part_count: 1, rows: [], headerConflicts: [] });
    expect(reviewFlags(m)).toBeNull();
  });

  it("a pre-193 task takes every missing field from the extraction", () => {
    const m = mergeReview(readPromotionHeader({ ingest_id: SHA }), read());
    expect(m).toMatchObject({ notice_id: "EOL-36", manufacturer: "Example", notice_date: "2026-09-30", attempt: 2, part_count: 1 });
    expect(m.headerConflicts).toEqual([]);
  });

  it("where both carry a value the payload's is drawn, and a DIFFERENT one is listed as a conflict", () => {
    const m = mergeReview(readPromotionHeader({ ...PAYLOAD_193, notice_id: "EOL-37", attempt: 3 }), read());
    expect(m.notice_id).toBe("EOL-37");
    expect(m.attempt).toBe(3);
    expect(m.headerConflicts).toEqual(["notice_id", "attempt"]);
  });

  it("part_count 0 on the payload is a value, not an absence: it is drawn and it conflicts", () => {
    const m = mergeReview(readPromotionHeader({ ...PAYLOAD_193, part_count: 0 }), read());
    expect(m.part_count).toBe(0);
    expect(m.headerConflicts).toEqual(["part_count"]);
  });

  it("the reject codes are cortex's, whatever is served", () => {
    expect(mergeReview(NO_HEADER, read()).rejectCodes).toEqual(DEFAULT_REJECT_CODES);
  });
});

describe("the completeness counts", () => {
  it("absent and malformed are counted separately", () => {
    const f = flagsOf(read({ rows_without_evidence: 1, rows: [{ mpn: "A" }, { mpn: "B", evidence_ref: { page: 0 } }, { mpn: "C", evidence_ref: ev }] }));
    expect(f).toMatchObject({ absentEvidence: 1, malformedEvidence: 1, evidenceCountMismatch: null });
  });

  it("rows_without_evidence that disagrees with the absent rows drawn is reported both ways", () => {
    expect(flagsOf(read({ rows_without_evidence: 2, rows: [{ mpn: "A" }] })).evidenceCountMismatch).toEqual({ served: 2, drawn: 1 });
    expect(flagsOf(read({ rows_without_evidence: 0, rows: [{ mpn: "A" }] })).evidenceCountMismatch).toEqual({ served: 0, drawn: 1 });
    expect(flagsOf(read({ rows_without_evidence: undefined, rows: [{ mpn: "A" }] })).evidenceCountMismatch).toBeNull();
  });

  it("parts are counted by part_index when every row has one, so two parts sharing an mpn are two", () => {
    const rows = [{ mpn: "A", part_index: 0 }, { mpn: "A", part_index: 1 }, { mpn: "A", part_index: 1 }];
    expect(partsDrawn(read({ rows }).rows)).toBe(2);
  });

  it("and by distinct mpn when any row lacks one", () => {
    const rows = [{ mpn: "A", part_index: 0 }, { mpn: "A" }, { mpn: "B", part_index: 0 }];
    expect(partsDrawn(read({ rows }).rows)).toBe(2);
  });

  it("part_count is checked against the parts drawn, and a mismatch is reported both ways", () => {
    const twoRowsOnePart = [{ mpn: "A", part_index: 0, evidence_ref: ev }, { mpn: "A", part_index: 0, evidence_ref: ev }];
    expect(flagsOf(read({ part_count: 1, rows: twoRowsOnePart })).partsMismatch).toBeNull();
    expect(flagsOf(read({ part_count: 2, rows: twoRowsOnePart })).partsMismatch).toEqual({ declared: 2, drawn: 1 });
    expect(flagsOf(read({ part_count: 0, rows: twoRowsOnePart })).partsMismatch).toEqual({ declared: 0, drawn: 1 });
  });

  it("the part_count checked is the MERGED one: the payload's, when it carries one", () => {
    const header = readPromotionHeader({ ingest_id: SHA, part_count: 3 });
    expect(flagsOf(read({ part_count: 1 }), header).partsMismatch).toEqual({ declared: 3, drawn: 1 });
  });

  it("a part_count from neither source is its own flag, not a pass", () => {
    const f = flagsOf(read({ part_count: undefined }));
    expect(f.partsUnknown).toBe(true);
    expect(f.partsMismatch).toBeNull();
  });
});

describe("route failures name the server's code", () => {
  const err = (status: number, detail?: unknown) => ({ response: { status, data: detail === undefined ? {} : { detail } } });

  it("a PLAIN 404 is the route not served yet; a coded 404 is the route's own answer", () => {
    expect(reviewRouteFailure(err(404, "Not Found"), "extraction")).toBe("The extraction route is not served here yet (404). It lands with 193.");
    expect(reviewRouteFailure(err(404, { error: "ingest_not_found" }), "extraction")).toBe("The extraction could not be loaded (404 ingest_not_found).");
    expect(reviewRouteFailure(err(404, { error: "source_absent" }), "source")).toBe("The source could not be loaded (404 source_absent).");
  });

  it("403 says access closes when the task resolves; 422 and 503 carry their codes", () => {
    expect(reviewRouteFailure(err(403, { error: "not_entitled" }), "source")).toContain("(403 not_entitled)");
    expect(reviewRouteFailure(err(422, { error: "extraction_rows_absent" }), "extraction")).toBe("The extraction could not be loaded (422 extraction_rows_absent).");
    expect(reviewRouteFailure(err(503, { error: "artifact_store_unreachable" }), "source")).toBe("The source could not be loaded (503 artifact_store_unreachable).");
  });

  // /source is fetched as an arraybuffer, so axios hands its error body over as bytes. The mock walk
  // caught this: a coded 404 source_absent read as "not served" until the bytes were decoded.
  it("a /source error body arrives as BYTES: its code is still read; a plain 404 in bytes is still plain", () => {
    const bytes = (o: unknown) => new TextEncoder().encode(JSON.stringify(o));
    const raw = (status: number, data: unknown) => ({ response: { status, data } });
    expect(reviewRouteFailure(raw(404, bytes({ detail: { error: "source_absent" } }).buffer), "source")).toBe("The source could not be loaded (404 source_absent).");
    expect(reviewRouteFailure(raw(403, bytes({ detail: { error: "not_entitled" } })), "source")).toContain("(403 not_entitled)");
    expect(reviewRouteFailure(raw(404, bytes({ detail: "Not Found" }).buffer), "source")).toBe("The source route is not served here yet (404). It lands with 193.");
    expect(reviewRouteFailure(raw(502, new TextEncoder().encode("<html>bad gateway").buffer), "source")).toBe("The source could not be loaded (502).");
  });

  it("no response at all: the source is unreadable bytes, the extraction a failed load", () => {
    expect(reviewRouteFailure(new Error("Invalid PDF structure"), "source")).toBe("The source could not be read as a PDF.");
    expect(reviewRouteFailure(new Error("network"), "extraction")).toBe("The extraction could not be loaded.");
  });
});

describe("evidence quality: what the outline IS (7f, doc-tools #132)", () => {
  it("names the three served qualities; every other method is unknown, never the cell", () => {
    expect(evidenceQuality("text_layer_cell")).toBe("cell");
    expect(evidenceQuality("region_preferred")).toBe("region");
    expect(evidenceQuality("unique")).toBe("region");
    expect(evidenceQuality("inherited_doc_level")).toBe("inherited");
    for (const m of [null, "", "ambiguous", "not_found", "layout_prose", "TEXT_LAYER_CELL", "toString", "__proto__", "constructor"]) {
      expect(evidenceQuality(m), String(m)).toBe("unknown");
    }
  });

  it("counts region-only and unknown-method rows among rows WITH a box; absent rows count in neither", () => {
    const row = (i: number, via: string | null, e: unknown = ev) => ({ row_index: i, part_index: 0, mpn: "A-1", field: "f", extracted_value: "v", obtained_via: via, evidence_ref: e });
    const f = flagsOf(
      read({
        rows: [row(0, "text_layer_cell"), row(1, "region_preferred"), row(2, "unique"), row(3, "inherited_doc_level"), row(4, "layout_prose"), row(5, "region_preferred", null), row(6, null, null)],
        rows_without_evidence: 2,
      }),
    );
    expect(f.regionEvidence).toBe(2);
    expect(f.unknownMethod).toBe(1);
    expect(f.absentEvidence).toBe(2);
  });

  it("rowsSharingEvidence counts the rows on the SAME page and bbox, and only those", () => {
    const row = (i: number, e: unknown) => ({ row_index: i, part_index: 0, mpn: "A-1", field: "ltb_date", extracted_value: "v", obtained_via: "inherited_doc_level", evidence_ref: e });
    const ex = read({
      rows: [row(0, ev), row(1, ev), row(2, { ...ev, page: 2 }), row(3, { ...ev, bbox: [10, 20, 110, 41] }), row(4, null)],
      rows_without_evidence: 1,
    });
    const ref = ex.rows[0].evidence.state === "ok" ? ex.rows[0].evidence.ref : null;
    expect(rowsSharingEvidence(ex.rows, ref!)).toBe(2);
  });
});

describe("helpers", () => {
  it("shaPrefix takes 12 hex with or without the prefix", () => {
    expect(shaPrefix(SHA)).toBe("5b15f2050000");
    expect(shaPrefix("abcdef0123456789")).toBe("abcdef012345");
  });

  it("rejectReason is the code, then the note if any", () => {
    expect(rejectReason("wrong_value", "")).toBe("wrong_value");
    expect(rejectReason("wrong_value", "  row 3 says 2028  ")).toBe("wrong_value: row 3 says 2028");
  });
});
