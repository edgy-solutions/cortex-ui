import { describe, it, expect } from "vitest";
import { buildActBody } from "@/api/client";
import { buildDocumentVerdicts, readDocumentReviewTask, whyNotDocumentReview, type DocumentSection } from "./documentReview";
import {
  FIXTURE_DOCUMENT_INGEST_ID,
  fixtureDocumentReviewDuplicate,
  fixtureDocumentReviewMalformed,
  fixtureDocumentReviewPayload,
} from "./documentReviewFixture";

const t = (payload: unknown) => ({ payload });

describe("readDocumentReviewTask", () => {
  it("reads the happy path: header, five sections, nothing dropped", () => {
    const r = readDocumentReviewTask(t(fixtureDocumentReviewPayload()))!;
    expect(r.ingestId).toBe(FIXTURE_DOCUMENT_INGEST_ID);
    expect(r.droppedSections).toBe(0);
    expect(r.header).toEqual({ title: "Hydraulic pump removal and refit", docId: "WI-2231", revision: null, date: "2026-09-14" });
    expect(r.sections.map((s) => [s.sectionId, s.page, s.pageEnd])).toEqual([
      ["s1", 1, null],
      ["s2", 2, null],
      ["s3", 3, 4],
      ["s4", 5, null],
      ["s5", 7, null],
    ]);
  });

  it.each([
    ["no ingest_id", { ingest_id: undefined }],
    ["a blank ingest_id", { ingest_id: "  " }],
    ["sections absent", { sections: undefined }],
    ["sections not an array", { sections: {} }],
    ["sections empty", { sections: [] }],
  ])("returns null for %s", (_n, over) => {
    const p = fixtureDocumentReviewPayload(over);
    expect(readDocumentReviewTask(t(p))).toBeNull();
    expect(whyNotDocumentReview(t(p))).not.toBeNull();
  });

  it("returns null for a payload that is not an object, or no task", () => {
    expect(readDocumentReviewTask(t("x"))).toBeNull();
    expect(readDocumentReviewTask(t([]))).toBeNull();
    expect(readDocumentReviewTask(null)).toBeNull();
  });

  it.each([["empty"], ["promotion"], [undefined]])("returns null for review_shape %s", (shape) => {
    const p = fixtureDocumentReviewPayload({ review_shape: shape });
    expect(readDocumentReviewTask(t(p))).toBeNull();
    expect(whyNotDocumentReview(t(p))).toMatch(/review_shape/);
  });

  it("drops a malformed section and counts it", () => {
    const r = readDocumentReviewTask(t(fixtureDocumentReviewMalformed()))!;
    expect(r.droppedSections).toBe(1);
    expect(r.sections.map((s) => s.sectionId)).toEqual(["s1", "s3", "s4", "s5"]);
  });

  it.each([
    ["no section_id", { title: "x", page: 1 }],
    ["no title", { section_id: "z", page: 1 }],
    ["a page of 0", { section_id: "z", title: "x", page: 0 }],
    ["a fractional page", { section_id: "z", title: "x", page: 1.5 }],
    ["a string page", { section_id: "z", title: "x", page: "1" }],
    ["not an object", "z"],
  ])("counts a section with %s as dropped", (_n, bad) => {
    const good = { section_id: "a", title: "A", page: 1 };
    const r = readDocumentReviewTask(t(fixtureDocumentReviewPayload({ sections: [good, bad] })))!;
    expect(r.droppedSections).toBe(1);
    expect(r.sections).toHaveLength(1);
  });

  it("returns null when no section is well-formed", () => {
    const p = fixtureDocumentReviewPayload({ sections: [{ section_id: "z", title: "x", page: 0 }] });
    expect(readDocumentReviewTask(t(p))).toBeNull();
    expect(whyNotDocumentReview(t(p))).toMatch(/no section/);
  });

  it("refuses a duplicate section_id with a reason naming it", () => {
    const p = fixtureDocumentReviewDuplicate();
    expect(readDocumentReviewTask(t(p))).toBeNull();
    expect(whyNotDocumentReview(t(p))).toBe("duplicate section_id: s1");
  });

  it("has no reason for a task it accepts", () => {
    expect(whyNotDocumentReview(t(fixtureDocumentReviewPayload()))).toBeNull();
  });

  it("ignores a page_end that is not past page", () => {
    const p = fixtureDocumentReviewPayload({ sections: [{ section_id: "a", title: "A", page: 3, page_end: 3 }] });
    expect(readDocumentReviewTask(t(p))!.sections[0].pageEnd).toBeNull();
  });
});

const S = (id: string): DocumentSection => ({ sectionId: id, title: id, page: 1, pageEnd: null });
const SECS = [S("a"), S("b"), S("c")];

describe("buildDocumentVerdicts", () => {
  it("promotes when every section is accepted", () => {
    const r = buildDocumentVerdicts(SECS, { a: "accepted", b: "accepted", c: "accepted" });
    expect(r).toEqual({
      decision: "promoted",
      section_verdicts: [
        { section_id: "a", verdict: "accepted" },
        { section_id: "b", verdict: "accepted" },
        { section_id: "c", verdict: "accepted" },
      ],
    });
  });

  it("rejects when any section is flagged", () => {
    expect(buildDocumentVerdicts(SECS, { a: "accepted", b: "flagged", c: "accepted" }).decision).toBe("rejected");
  });

  it("sends a note only when non-empty after trimming", () => {
    const r = buildDocumentVerdicts(SECS, { a: "flagged", b: "flagged", c: "accepted" }, { a: "torque is wrong", b: "   ", c: "kept" });
    expect(r.section_verdicts).toEqual([
      { section_id: "a", verdict: "flagged", note: "torque is wrong" },
      { section_id: "b", verdict: "flagged" },
      { section_id: "c", verdict: "accepted", note: "kept" },
    ]);
    expect("note" in r.section_verdicts[1]).toBe(false);
  });

  it("throws when a section lacks a verdict", () => {
    expect(() => buildDocumentVerdicts(SECS, { a: "accepted", b: "accepted" })).toThrow(/no verdict for c/);
  });

  it("follows the order of sections, not of the verdict map", () => {
    const r = buildDocumentVerdicts(SECS, { c: "flagged", b: "accepted", a: "accepted" });
    expect(r.section_verdicts.map((v) => v.section_id)).toEqual(["a", "b", "c"]);
  });
});

describe("buildActBody with section verdicts", () => {
  it("sends them only when provided, and changes nothing else", () => {
    const v = [{ section_id: "a", verdict: "accepted" }];
    expect(buildActBody("promoted", "", undefined, undefined, undefined, undefined, v)).toEqual({ decision: "promoted", comment: "", section_verdicts: v });
    expect(buildActBody("promoted", "c")).toEqual({ decision: "promoted", comment: "c" });
    expect("section_verdicts" in buildActBody("promoted", "", undefined, undefined, undefined, undefined, [])).toBe(false);
  });
});
