/**
 * INSTANCES_BY_PROPERTY, grouped by the producer's declared `group_by`, with absent cells drawn as absent.
 *
 * WHERE_USED below is TRANSCRIBED, not captured: it is the table part of what `where_used()` returns in
 * invincible-agent #315 at 8c48128f (`agent_fleet/ontology_service/where_used.py`) for part P over the
 * shipped synthetic fixture, as_designed. It is the producer FUNCTION's shape, one layer inside the wire;
 * no HTTP/SSE capture exists while #315 is unmerged and unrolled. Its two rows never put a 0 beside an
 * absence, so the breaking input (missing / null / 0 / a number in ONE column) is this file's own.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { InstancesByPropertyView } from "./InstancesByPropertyView";
import type { InstancesByPropertyPayload } from "./types";

afterEach(cleanup);

const E1 = "urn:uuid:01930000-0000-7000-8000-000000000001";
const E2 = "urn:uuid:01930000-0000-7000-8000-000000000002";

const WHERE_USED: InstancesByPropertyPayload = {
  archetype: "INSTANCES_BY_PROPERTY",
  title: "Where P is used (as_designed, synthetic fixture)",
  target: { domain: "SUSTAINMENT", class: "ps:Part" },
  columns: [
    { key: "end_item", label: "End item", from: "ImpactRow.end_item" },
    { key: "program", label: "Program", from: "ImpactRow.program" },
    { key: "qty_per", label: "Qty per", from: "ImpactRow.qty_per" },
    { key: "population", label: "Population", from: "ImpactRow.population" },
    { key: "stock", label: "Stock", from: "ImpactRow.stock" },
    { key: "configuration", label: "Configuration", from: "ImpactRow.configuration" },
    { key: "as_of", label: "As of", from: "ImpactRow.as_of" },
  ],
  row_identity: { key: "instance" },
  group_by: "program",
  rows: [
    { instance: E1, end_item: "E1", program: "SANDBOX_PROGRAM_ALPHA", qty_per: 26, population: null, stock: null, configuration: "as_designed", as_of: "2026-11-07" },
    { instance: E2, end_item: "E2", program: "SANDBOX_PROGRAM_BRAVO", qty_per: 12, population: null, stock: null, configuration: "as_designed", as_of: "2026-11-07" },
  ],
};

const draw = (p: InstancesByPropertyPayload) => render(<InstancesByPropertyView payload={p} />).container;
const colIdx = (p: InstancesByPropertyPayload, key: string) => p.columns.findIndex((c) => c.key === key);
const cellsOf = (c: HTMLElement, p: InstancesByPropertyPayload, key: string) =>
  [...c.querySelectorAll("tr[data-ibp-row]")].map((tr) => tr.querySelectorAll("td")[colIdx(p, key)]!);
const groupHeads = (c: HTMLElement) =>
  [...c.querySelectorAll("tbody > tr")].map((tr) => (tr.hasAttribute("data-ibp-group") ? `G:${tr.getAttribute("data-ibp-group")}` : "row"));

describe("#315's where-used table (transcribed from the producer function)", () => {
  it("groups by the column group_by names, in the order the rows arrive, each head before its rows", () => {
    const c = draw(WHERE_USED);
    expect(groupHeads(c)).toEqual(["G:SANDBOX_PROGRAM_ALPHA", "row", "G:SANDBOX_PROGRAM_BRAVO", "row"]);
    expect(c.querySelector('[data-ibp-group="SANDBOX_PROGRAM_ALPHA"]')!.textContent).toBe("Program: SANDBOX_PROGRAM_ALPHA · 1");
  });
  it("a served quantity is drawn as served", () => {
    const c = draw(WHERE_USED);
    expect(cellsOf(c, WHERE_USED, "qty_per").map((td) => td.textContent)).toEqual(["26", "12"]);
  });
  it("null population and stock are drawn as absent, every row, never as 0", () => {
    const c = draw(WHERE_USED);
    for (const key of ["population", "stock"]) {
      for (const td of cellsOf(c, WHERE_USED, key)) {
        expect(td.querySelector("[data-ibp-cell-absent]"), key).not.toBeNull();
        expect(td.textContent).not.toBe("0");
      }
    }
    expect(c.querySelectorAll("[data-ibp-cell-absent]")).toHaveLength(4);
  });
  it("the identity key that is not a column is not drawn as one", () => {
    const c = draw(WHERE_USED);
    expect(c.querySelectorAll("thead th")).toHaveLength(WHERE_USED.columns.length);
    expect(c.textContent).not.toContain(E1);
  });
});

describe("absent is not 0: the breaking input", () => {
  const p: InstancesByPropertyPayload = {
    ...WHERE_USED,
    rows: [
      { instance: "a", end_item: "A", program: "G1" }, // key missing
      { instance: "b", end_item: "B", program: "G1", qty_per: null },
      { instance: "c", end_item: "C", program: "G1", qty_per: 0 },
      { instance: "d", end_item: "D", program: "G1", qty_per: 7 },
    ],
  };
  it("missing and null are absent; 0 and 7 are values", () => {
    const tds = cellsOf(draw(p), p, "qty_per");
    expect(tds.map((td) => !!td.querySelector("[data-ibp-cell-absent]"))).toEqual([true, true, false, false]);
    expect(tds.map((td) => td.textContent)).toEqual(["—", "—", "0", "7"]);
  });
  it("one group holds all four rows, counted", () => {
    const c = draw(p);
    expect(groupHeads(c)).toEqual(["G:G1", "row", "row", "row", "row"]);
    expect(c.querySelector('[data-ibp-group="G1"]')!.textContent).toBe("Program: G1 · 4");
  });
});

describe("the group key, as declared", () => {
  it("rows apart in arrival order still meet in their group", () => {
    const p = { ...WHERE_USED, rows: [WHERE_USED.rows[0]!, WHERE_USED.rows[1]!, { ...WHERE_USED.rows[0]!, instance: "x", end_item: "E9" }] };
    const c = draw(p);
    expect(groupHeads(c)).toEqual(["G:SANDBOX_PROGRAM_ALPHA", "row", "row", "G:SANDBOX_PROGRAM_BRAVO", "row"]);
  });
  it("a row with no value for the group key gets an absent group, not a guessed one", () => {
    const p = { ...WHERE_USED, rows: [{ ...WHERE_USED.rows[0]!, program: null }, WHERE_USED.rows[1]!] };
    const c = draw(p);
    const head = c.querySelector("[data-ibp-group-absent]");
    expect(head).not.toBeNull();
    expect(head!.textContent).toBe("Program: — · 1");
  });
  it("group_by naming no column: drawn ungrouped, and said", () => {
    const c = draw({ ...WHERE_USED, group_by: "nope" });
    expect(c.querySelectorAll("[data-ibp-group]")).toHaveLength(0);
    expect(c.querySelectorAll("tr[data-ibp-row]")).toHaveLength(2);
    expect(c.querySelector("[data-ibp-group-by-undeclared]")!.textContent).toContain("nope");
  });
  it("no group_by (every table before #315): one ungrouped table, nothing said", () => {
    const { group_by: _drop, ...p } = WHERE_USED;
    const c = draw(p);
    expect(c.querySelectorAll("[data-ibp-group]")).toHaveLength(0);
    expect(c.querySelector("[data-ibp-group-by-undeclared]")).toBeNull();
    expect(c.querySelectorAll("tr[data-ibp-row]")).toHaveLength(2);
  });
});

describe("the widget spells none of the producer's words", () => {
  it("no column key, value, or domain from this table appears in the renderer or its types", () => {
    const FORBIDDEN = /program|qty|end_item|population|stock|configuration|sustain|where.?used|impact/i;
    for (const name of ["InstancesByPropertyView.tsx", "types.ts"]) {
      const src = readFileSync(join(__dirname, name), "utf8");
      expect([...src.matchAll(new RegExp(FORBIDDEN.source, "gi"))].map((m) => m[0]), name).toEqual([]);
    }
  });
});

describe("the table fits the 640px canvas width (compact cells; real layout proved in Chromium)", () => {
  it("a value with no whitespace is never broken mid-token; a value with a space may wrap", () => {
    const p = { ...WHERE_USED, rows: [{ ...WHERE_USED.rows[0]!, configuration: "as designed", as_of: "2026-11-07" }] };
    const c = draw(p);
    const span = (key: string) => cellsOf(c, p, key)[0]!.querySelector("span")!;
    expect(span("as_of").className).toContain("whitespace-nowrap");
    expect(span("configuration").className).not.toContain("whitespace-nowrap");
    expect(span("configuration").className).toContain("text-xs");
  });
  it("cells and headers carry the compact padding", () => {
    const c = draw(WHERE_USED);
    for (const th of c.querySelectorAll("thead th")) {
      expect(th.className).toContain("px-2");
      expect(th.className).toContain("tracking-wider");
      expect(th.className).not.toContain("px-3");
    }
    for (const td of cellsOf(c, WHERE_USED, "as_of")) expect(td.className).toContain("px-2");
    expect(c.querySelector(".glass-panel")!.className).toContain("p-4");
  });
});

describe("served absent_reason in an absent cell", () => {
  const base = (rows: InstancesByPropertyPayload["rows"], extra: Record<string, unknown> = {}): InstancesByPropertyPayload => ({
    archetype: "INSTANCES_BY_PROPERTY",
    title: "t",
    columns: [
      { key: "name", label: "Name" },
      { key: "stock", label: "Stock" },
    ],
    row_identity: { key: "name" },
    rows,
    ...extra,
  });
  const stock = (p: InstancesByPropertyPayload) => cellsOf(draw(p), p, "stock");

  it("envelope reason in an all-null column", () => {
    const p = base([{ name: "a", stock: null }, { name: "b", stock: null }], { absent_reason: { stock: "not held at this site" } });
    const cs = stock(p);
    expect(cs.map((c) => c.textContent)).toEqual(["not held at this site", "not held at this site"]);
    expect(cs[0]!.querySelector("[data-ibp-absent-reason]")).not.toBeNull();
    expect(cs[0]!.querySelector(".whitespace-nowrap")).toBeNull();
  });
  it("a reason is prose in the proportional font, so it adds no width to a table that fits with no spare pixel", () => {
    // Measured 11-19 in Chromium at 640px with "no source" in two columns: in font-mono at 12px the
    // Stock column grew 46→49px and the table overflowed by 10px; mono at 10px still +3px; the
    // proportional font at 10px left every column at its dash width. jsdom measures nothing, so
    // the decision is pinned as classes.
    const p = base([{ name: "a", stock: null }], { absent_reason: { stock: "no source" } });
    const span = draw(p).querySelector("[data-ibp-absent-reason]")!;
    expect(span.className).not.toMatch(/\bfont-mono\b/);
    expect(span.className).toMatch(/\btext-\[10px\]/);
  });
  it("a row reason beats the envelope; a row without one falls to the envelope", () => {
    const p = base(
      [{ name: "a", stock: null, absent_reason: { stock: "row says" } }, { name: "b", stock: "", absent_reason: { other: "x" } }],
      { absent_reason: { stock: "envelope says" } },
    );
    expect(stock(p).map((c) => c.textContent)).toEqual(["row says", "envelope says"]);
  });
  it("neither present gives the dash", () => {
    expect(stock(base([{ name: "a", stock: null }])).map((c) => c.textContent)).toEqual(["—"]);
  });
  it("a served 0 and any valued cell never draw a reason", () => {
    const p = base([{ name: "a", stock: 0, absent_reason: { stock: "row", name: "r2" } }], { absent_reason: { stock: "env", name: "e2" } });
    const c = draw(p);
    expect(cellsOf(c, p, "stock")[0]!.textContent).toBe("0");
    expect(c.querySelector("[data-ibp-absent-reason]")).toBeNull();
    expect(c.textContent).not.toMatch(/env|row|r2|e2/);
  });
  it("a non-object absent_reason gives the dash", () => {
    for (const bad of ["why", 3, ["stock"], null, true]) {
      const p = base([{ name: "a", stock: null }], { absent_reason: bad });
      expect(stock(p)[0]!.textContent).toBe("—");
      cleanup();
    }
  });
  it("an over-long or multi-line phrase falls through to the next source", () => {
    const p = base(
      [{ name: "a", stock: null, absent_reason: { stock: "x".repeat(161) } }, { name: "b", stock: null, absent_reason: { stock: "a\nb" } }],
      { absent_reason: { stock: "envelope says" } },
    );
    expect(stock(p).map((c) => c.textContent)).toEqual(["envelope says", "envelope says"]);
    const q = base([{ name: "a", stock: null, absent_reason: { stock: "x".repeat(161) } }], { absent_reason: { stock: "y".repeat(161) } });
    cleanup();
    expect(stock(q)[0]!.textContent).toBe("—");
  });
  it("the row's absent_reason object is never drawn as text or a cell", () => {
    const p = base([{ name: "a", stock: 5, absent_reason: { stock: "SECRETPHRASE" } }]);
    const c = draw(p);
    expect(c.textContent).not.toContain("SECRETPHRASE");
    expect(c.textContent).not.toContain("[object Object]");
    expect(c.querySelectorAll("tr[data-ibp-row] td")).toHaveLength(2);
  });
  it("an object under a COLUMN key is not a value: drawn absent, never as [object Object]", () => {
    // The per-row map is an object inside the row. Nothing stops a column from carrying a key that
    // collides with it, or a producer from nesting a value; either must read as absent, not as text.
    const p = base([{ name: "a", stock: { n: 5 } }]);
    const c = draw(p);
    expect(stock(p)[0]!.textContent).toBe("—");
    expect(c.textContent).not.toContain("[object Object]");
  });
  it("an array map is not a map, even where an index could match a column key", () => {
    // Every other column key misses an array by accident; a key that IS an index ("0") would not,
    // so the breaking input names one.
    const p: InstancesByPropertyPayload = {
      ...base([{ "0": null }], { absent_reason: ["from an array"] }),
      columns: [{ key: "0", label: "Zero" }],
      row_identity: undefined,
    };
    const c = draw(p);
    expect(c.textContent).not.toContain("from an array");
    expect(c.querySelector("[data-ibp-cell-absent]")!.textContent).toBe("—");
    cleanup();
    const q: InstancesByPropertyPayload = {
      // The wire can carry anything here; the type says object, so the wrong shape is cast in.
      ...base([{ "0": null, absent_reason: ["from a row array"] as unknown as Record<string, unknown> }]),
      columns: [{ key: "0", label: "Zero" }],
      row_identity: undefined,
    };
    expect(draw(q).textContent).not.toContain("from a row array");
  });
  it("an old payload without the key draws as before", () => {
    const p = base([{ name: "a", stock: null }]);
    const c = draw(p);
    expect(c.querySelector("[data-ibp-absent-reason]")).toBeNull();
    expect(c.querySelector("[data-ibp-cell-absent]")!.textContent).toBe("—");
  });
});
