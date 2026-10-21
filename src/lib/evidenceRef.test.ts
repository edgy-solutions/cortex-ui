import { describe, it, expect } from "vitest";
import { isFractionBox, readFractionEvidenceRef } from "./evidenceRef";

describe("readFractionEvidenceRef", () => {
  it("a fraction box inside the page is read", () => {
    expect(readFractionEvidenceRef({ page: 2, bbox: [0.1, 0.2, 0.5, 0.3] })).toEqual({ page: 2, bbox: [0.1, 0.2, 0.5, 0.3] });
  });

  it("the edges of the page are fractions too", () => {
    expect(readFractionEvidenceRef({ page: 1, bbox: [0, 0, 1, 1] })).toEqual({ page: 1, bbox: [0, 0, 1, 1] });
    expect(isFractionBox([0, 0, 1, 1])).toBe(true);
  });

  it("a note is kept when non-blank", () => {
    expect(readFractionEvidenceRef({ page: 1, bbox: [0.1, 0.2, 0.5, 0.3], note: "title" })?.note).toBe("title");
  });

  it.each([
    ["a value over 1 (pixels)", [40, 60, 560, 110]],
    ["a negative value", [-0.1, 0.2, 0.5, 0.3]],
    // One coordinate out of range at a time: a pixel box breaks every bound at once, so it cannot tell them apart.
    ["only x1 over 1", [0.1, 0.2, 1.2, 0.3]],
    ["only y1 over 1", [0.1, 0.2, 0.5, 1.3]],
    ["only y0 negative", [0.1, -0.2, 0.5, 0.3]],
    ["y1 == y0", [0.1, 0.3, 0.5, 0.3]],
    ["x1 < x0", [0.5, 0.2, 0.1, 0.3]],
    ["x1 == x0", [0.3, 0.2, 0.3, 0.3]],
    ["y1 < y0", [0.1, 0.4, 0.5, 0.3]],
    ["3 numbers", [0.1, 0.2, 0.5]],
    ["NaN", [0.1, NaN, 0.5, 0.3]],
  ])("a box that is not page fractions is refused (%s)", (_, bbox) => {
    expect(isFractionBox(bbox)).toBe(false);
    expect(readFractionEvidenceRef({ page: 1, bbox })).toBeUndefined();
  });

  it("a null bbox is read: stated on this page, no box", () => {
    expect(readFractionEvidenceRef({ page: 3, bbox: null })).toEqual({ page: 3, bbox: null });
  });

  it("an absent bbox key is read as no box, the same as null", () => {
    expect(readFractionEvidenceRef({ page: 3 })).toEqual({ page: 3, bbox: null });
    expect(readFractionEvidenceRef({ page: 3, note: "in the footer" })).toEqual({ page: 3, bbox: null, note: "in the footer" });
  });

  it("a null bbox with page 0 is refused", () => {
    expect(readFractionEvidenceRef({ page: 0, bbox: null })).toBeUndefined();
  });

  it.each([
    ["an extra key", { page: 1, bbox: [0.1, 0.2, 0.5, 0.3], extra: 1 }],
    ["a blank note", { page: 1, bbox: [0.1, 0.2, 0.5, 0.3], note: "  " }],
    ["page 0", { page: 0, bbox: [0.1, 0.2, 0.5, 0.3] }],
  ])("an extra key, a blank note, page 0 are refused (%s)", (_, v) => {
    expect(readFractionEvidenceRef(v)).toBeUndefined();
  });
});
