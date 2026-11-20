import { describe, expect, it } from "vitest";
import { readServedLists } from "./servedLists";

const one = (o: unknown) => readServedLists([o]);

describe("readServedLists", () => {
  it("non-array input -> []", () => {
    for (const v of [undefined, null, "x", 3, {}, { items: ["a"] }]) expect(readServedLists(v)).toEqual([]);
  });
  it("entries that are not objects, or whose items is not an array, are skipped", () => {
    expect(readServedLists([null, "x", 3, ["a"], { items: "a" }, { label: "L" }, { items: ["ok"] }])).toEqual([
      { label: null, items: ["ok"], total: 1 },
    ]);
  });
  it("an unbounded label becomes null but the list is kept", () => {
    for (const label of ["a\nb", "x".repeat(161), "  ", "", 3, null, {}]) {
      expect(one({ label, items: ["a"] })).toEqual([{ label: null, items: ["a"], total: 1 }]);
    }
  });
  it("a bounded label is trimmed", () => {
    expect(one({ label: "  L  ", items: ["a"] })[0].label).toBe("L");
  });
  it("items that are non-string, multi-line or over 160 are dropped", () => {
    const r = one({ items: ["a", 3, null, "x\ny", "x".repeat(161), "  ", "b"] });
    expect(r[0].items).toEqual(["a", "b"]);
    expect(r[0].total).toBe(7);
  });
  it("total is honoured when an integer >= served length", () => {
    expect(one({ items: ["a", "b"], total: 5 })[0].total).toBe(5);
    expect(one({ items: ["a", "b"], total: 2 })[0].total).toBe(2);
  });
  it("total is ignored when < served length, non-integer, or a string", () => {
    for (const total of [1, 2.5, "9", null, NaN, Infinity]) {
      expect(one({ items: ["a", "b"], total })[0].total).toBe(2);
    }
  });
  it("total counts dropped items", () => {
    expect(one({ items: ["a", "x\ny"] })).toEqual([{ label: null, items: ["a"], total: 2 }]);
  });
  it("empty items with no total is skipped; empty items with total 3 is kept", () => {
    expect(one({ items: [] })).toEqual([]);
    expect(one({ items: [], total: 0 })).toEqual([]);
    expect(one({ items: [], total: 3 })).toEqual([{ label: null, items: [], total: 3 }]);
  });
  it("order is preserved and items are trimmed", () => {
    expect(one({ items: [" c ", "a", "b"] })[0].items).toEqual(["c", "a", "b"]);
  });
  it("several lists keep their order", () => {
    expect(readServedLists([{ label: "A", items: ["1"] }, { label: "B", items: ["2"] }]).map((l) => l.label)).toEqual(["A", "B"]);
  });
});
