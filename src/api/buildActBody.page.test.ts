import { describe, it, expect } from "vitest";
import { buildActBody } from "./client";

// `HumanTaskActRequest.page` is refused (422 page_not_for_decision) on anything but has_parts, and
// it is a strict int: the body carries it ONLY there, and only a whole page number >= 1.
describe("buildActBody — page", () => {
  it("is sent on has_parts", () => {
    expect(buildActBody("has_parts", "", undefined, undefined, undefined, undefined, 3)).toEqual({
      decision: "has_parts",
      comment: "",
      page: 3,
    });
  });
  it.each(["confirmed_no_parts", "approved", "rejected", "promoted", "acknowledged"])("is NOT sent on %s", (v) => {
    expect("page" in buildActBody(v, "", undefined, undefined, undefined, undefined, 3)).toBe(false);
  });
  it.each([0, -1, 1.5, NaN, Infinity])("is NOT sent for %s", (p) => {
    expect("page" in buildActBody("has_parts", "", undefined, undefined, undefined, undefined, p)).toBe(false);
  });
  it("is NOT sent when absent", () => {
    expect("page" in buildActBody("has_parts")).toBe(false);
  });
});
