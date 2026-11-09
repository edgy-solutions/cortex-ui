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
