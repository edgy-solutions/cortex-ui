import { describe, expect, it } from "vitest";
import { readBounds } from "./bounds";

const r = (min: unknown, max: unknown) => readBounds({ min, max } as Parameters<typeof readBounds>[0]);

describe("readBounds", () => {
  // The model lane/74 measured states no cardinality at all: this is today's every property.
  it("null/null is not stated — never 0..*", () => expect(r(null, null)).toEqual({ state: "not-stated" }));
  it("absent/absent is not stated", () => expect(r(undefined, undefined)).toEqual({ state: "not-stated" }));
  it("an explicit 'unbounded' max is *", () => expect(r(0, "unbounded")).toEqual({ state: "stated", text: "0..*" }));
  it("1..1 is stated", () => expect(r(1, 1)).toEqual({ state: "stated", text: "1..1" }));
  it("0..0 is stated (0 is a bound, not an absence)", () =>
    expect(r(0, 0)).toEqual({ state: "stated", text: "0..0" }));
  it("a missing max is ?, never *", () => expect(r(1, null)).toEqual({ state: "part-stated", text: "1..?" }));
  it("a missing min is ?, never 0", () => expect(r(null, 3)).toEqual({ state: "part-stated", text: "?..3" }));
  it("a missing min under an unbounded max", () =>
    expect(r(undefined, "unbounded")).toEqual({ state: "part-stated", text: "?..*" }));

  it.each([
    ["the symbol * itself", 0, "*"],
    ["'Unbounded' (wrong case)", 0, "Unbounded"],
    ["a negative max", 0, -1],
    ["a fractional max", 0, 1.5],
    ["a numeric string max", 0, "1"],
    ["'unbounded' as a MIN", "unbounded", 1],
    ["a negative min", -1, 1],
    ["a fractional min", 0.5, 1],
    ["NaN", Number.NaN, 1],
    ["max below min", 2, 1],
  ])("%s is unreadable", (_n, min, max) => expect(r(min, max)).toEqual({ state: "unreadable" }));

  it("an unreadable bound beside a missing one is still unreadable, not part-stated", () =>
    expect(r(null, "*")).toEqual({ state: "unreadable" }));
});
