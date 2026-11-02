import { describe, it, expect, vi } from "vitest";
import {
  actOnDocumentReview,
  buildSectionCoverage,
  documentCoverageVerb,
  DOCUMENT_REVIEW_SHAPE,
  flaggedSectionsReason,
  readDocumentReviewTask,
  whyNotDocumentReview,
  type DocumentSection,
} from "./documentReview";
import type { ShapeRow } from "./reviewShapes";
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

const ROW: ShapeRow = { review_shape: "document", item_kind: "section", rules_version: "x.v9", params: {}, rules: [] };

describe("buildSectionCoverage", () => {
  it("takes review_shape, item_kind and rules_version from the row", () => {
    const r = buildSectionCoverage(SECS, { a: "accepted", b: "accepted", c: "accepted" }, { ...ROW, item_kind: "k9", review_shape: "s9" });
    expect([r.review_shape, r.item_kind, r.rules_version]).toEqual(["s9", "k9", "x.v9"]);
  });

  it("looked_at is every id in section order; sampled, groups, shared empty; sample null", () => {
    const r = buildSectionCoverage(SECS, { c: "flagged", b: "accepted", a: "accepted" }, ROW);
    expect(r.looked_at).toEqual(["a", "b", "c"]);
    expect(r.flagged).toEqual(["c"]);
    expect([r.sampled, r.groups, r.shared]).toEqual([[], [], []]);
    expect(r.sample).toBeNull();
  });

  it("flagged is the subset, in section order", () => {
    expect(buildSectionCoverage(SECS, { c: "flagged", b: "accepted", a: "flagged" }, ROW).flagged).toEqual(["a", "c"]);
    expect(buildSectionCoverage(SECS, { a: "accepted", b: "accepted", c: "accepted" }, ROW).flagged).toEqual([]);
  });

  it("throws, naming the id, when a section lacks a verdict", () => {
    expect(() => buildSectionCoverage(SECS, { a: "accepted", b: "accepted" }, ROW)).toThrow("section coverage incomplete: no verdict for c");
  });

  it("sends a section id verbatim, as a string", () => {
    const r = buildSectionCoverage([S("007"), S("12")], { "007": "accepted", "12": "accepted" }, ROW);
    expect(r.looked_at).toEqual(["007", "12"]);
    expect(r.looked_at.every((x) => typeof x === "string")).toBe(true);
  });
});

describe("flaggedSectionsReason", () => {
  it("names flagged ids without notes", () => {
    expect(flaggedSectionsReason(SECS, { a: "flagged", b: "accepted", c: "flagged" })).toBe("sections flagged: a; c");
  });
  it("adds a trimmed note only when non-blank", () => {
    expect(flaggedSectionsReason(SECS, { a: "flagged", b: "flagged", c: "accepted" }, { a: " torque is wrong ", b: "   ", c: "kept" })).toBe(
      "sections flagged: a — torque is wrong; b",
    );
  });
  it("follows section order, not the maps' order", () => {
    expect(flaggedSectionsReason(SECS, { c: "flagged", a: "flagged" }, { c: "z", a: "y" })).toBe("sections flagged: a — y; c — z");
  });
});

describe("documentCoverageVerb", () => {
  const needs = (v: string) => v.startsWith("r_");
  it("is the one plain verb", () => expect(documentCoverageVerb(["p_ok", "r_no"], needs)).toBe("p_ok"));
  it("is null with two plain verbs", () => expect(documentCoverageVerb(["p_a", "p_b", "r_no"], needs)).toBeNull());
  it("is null with no plain verb", () => expect(documentCoverageVerb(["r_a", "r_b"], needs)).toBeNull());
});

describe("DOCUMENT_REVIEW_SHAPE", () => {
  it("equals the fixture payload's review_shape", () => {
    expect(DOCUMENT_REVIEW_SHAPE).toBe(fixtureDocumentReviewPayload().review_shape);
  });
});

describe("actOnDocumentReview", () => {
  it("passes the verb, reason and coverage as the act's sixth argument", async () => {
    const act = vi.fn().mockResolvedValue(undefined);
    const coverage = buildSectionCoverage(SECS, { a: "accepted", b: "accepted", c: "accepted" }, ROW);
    await actOnDocumentReview(act, "any_verb", { reason: "why", coverage });
    expect(act).toHaveBeenCalledWith("any_verb", "why", undefined, undefined, undefined, coverage);
  });
  it("passes undefined coverage through", async () => {
    const act = vi.fn().mockResolvedValue(undefined);
    await actOnDocumentReview(act, "any_verb", { reason: "", coverage: undefined });
    expect(act).toHaveBeenCalledWith("any_verb", "", undefined, undefined, undefined, undefined);
  });
});
