import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ASKABLE_MEASURE_FIELDS, askablePick, groupRows, matchesSearch, readAskableMeasures, readAskableRefusal, type AskableRow } from "./askableMeasures";

const row = (o: Record<string, unknown> = {}) => ({ verb: "v1", name: "N1", description: "d1", phrasings: ["p1"], cells: ["x"], ...o });
const env = (o: Record<string, unknown> = {}) => ({
  composed: true, invalid: [], measures: [row()], persona: "P", domains: ["D"], cell_source: "picker", ...o,
});
const R = (o: Partial<AskableRow> = {}): AskableRow => ({
  verb: "v", name: "Name", description: "Desc", phrasings: [], shape: null, unit: null, exampleAsk: null, groupLabel: null, ...o,
});

describe("readAskableMeasures envelope", () => {
  it("non-object is unreadable", () => {
    for (const x of [null, undefined, 3, "s", []]) expect(readAskableMeasures(x)).toEqual({ kind: "unreadable" });
  });
  it("composed missing is unreadable", () => {
    expect(readAskableMeasures({ measures: [] })).toEqual({ kind: "unreadable" });
  });
  it("measures not an array is unreadable", () => {
    expect(readAskableMeasures({ composed: true, measures: {} })).toEqual({ kind: "unreadable" });
  });
  it("invalid not an array is unreadable", () => {
    expect(readAskableMeasures(env({ invalid: "x" }))).toEqual({ kind: "unreadable" });
  });
  it("composed false is not-composed, invalid carried", () => {
    const r = readAskableMeasures(env({ composed: false, invalid: [{ source: "s", reason: "r" }, { source: 1 }] }));
    expect(r).toEqual({ kind: "not-composed", invalid: [{ source: "s", reason: "r" }] });
  });
  it("the served cell is carried: persona, domains, cell_source verbatim", () => {
    const r = readAskableMeasures(env({ persona: "p", domains: ["a", "b"], cell_source: "Anything Served" }));
    expect(r.kind === "ready" && r.cell).toEqual({ persona: "p", domains: ["a", "b"], cellSource: "Anything Served" });
  });
  it("a null persona is a legal cell (no access cell)", () => {
    const r = readAskableMeasures(env({ persona: null, domains: [] }));
    expect(r.kind === "ready" && r.cell.persona).toBeNull();
  });
  it("a served key that is ABSENT or the wrong type is unreadable", () => {
    for (const k of ["persona", "domains", "cell_source"]) {
      const e = env() as Record<string, unknown>;
      delete e[k];
      expect(readAskableMeasures(e), "absent " + k).toEqual({ kind: "unreadable" });
    }
    expect(readAskableMeasures(env({ persona: 3 }))).toEqual({ kind: "unreadable" });
    expect(readAskableMeasures(env({ domains: ["a", 2] }))).toEqual({ kind: "unreadable" });
    expect(readAskableMeasures(env({ domains: "a" }))).toEqual({ kind: "unreadable" });
    expect(readAskableMeasures(env({ cell_source: "" }))).toEqual({ kind: "unreadable" });
  });
  it("ready, invalid absent is []", () => {
    const r = readAskableMeasures(env({ invalid: undefined }));
    expect(r.kind).toBe("ready");
    if (r.kind === "ready") expect(r.invalid).toEqual([]);
  });
});

describe("readAskableMeasures rows", () => {
  it("a row missing verb is counted, not listed", () => {
    const r = readAskableMeasures(env({ measures: [row({ verb: undefined }), row({ verb: "v2" })] }));
    expect(r.kind === "ready" && r.rows.map((x) => x.verb)).toEqual(["v2"]);
    expect(r.kind === "ready" && r.unreadableRows).toBe(1);
  });
  it("optional null / empty / absent / wrong type are null", () => {
    const r = readAskableMeasures(env({ measures: [row({ shape: null, unit: "", example_ask: 5 })] }));
    expect(r.kind === "ready" && r.rows[0]).toMatchObject({ shape: null, unit: null, exampleAsk: null, groupLabel: null });
  });
  it("unknown extra keys are tolerated", () => {
    const r = readAskableMeasures(env({ measures: [row({ brand_new: { a: 1 } })] }));
    expect(r.kind === "ready" && r.rows.length).toBe(1);
  });
  it("non-string phrasings are dropped", () => {
    const r = readAskableMeasures(env({ measures: [row({ phrasings: ["a", 2, null, "b"] })] }));
    expect(r.kind === "ready" && r.rows[0].phrasings).toEqual(["a", "b"]);
  });
  it("served order is kept", () => {
    const r = readAskableMeasures(env({ measures: [row({ verb: "c" }), row({ verb: "a" }), row({ verb: "b" })] }));
    expect(r.kind === "ready" && r.rows.map((x) => x.verb)).toEqual(["c", "a", "b"]);
  });
  it("every field except cells round-trips", () => {
    const full = row({ shape: "S", unit: "U", example_ask: "E", group_label: "G" });
    const r = readAskableMeasures(env({ measures: [full] }));
    expect(r.kind === "ready" && r.rows[0]).toEqual({
      verb: "v1", name: "N1", description: "d1", phrasings: ["p1"], shape: "S", unit: "U", exampleAsk: "E", groupLabel: "G",
    });
  });
});

describe("matchesSearch", () => {
  const r = R({ name: "Alpha", description: "Beta text", phrasings: ["Gamma phrase"] });
  it("empty matches", () => expect(matchesSearch(r, "  ")).toBe(true));
  it("name", () => expect(matchesSearch(r, "alph")).toBe(true));
  it("description", () => expect(matchesSearch(r, "BETA")).toBe(true));
  it("a phrasing, case-insensitive", () => expect(matchesSearch(r, "gamma PHR")).toBe(true));
  it("a miss", () => expect(matchesSearch(r, "zzz")).toBe(false));
});

describe("groupRows", () => {
  it("groups by first appearance, null is its own group in place", () => {
    const g = groupRows([R({ verb: "1", groupLabel: "B" }), R({ verb: "2" }), R({ verb: "3", groupLabel: "A" }), R({ verb: "4", groupLabel: "B" }), R({ verb: "5" })]);
    expect(g.map((x) => [x.label, x.rows.map((y) => y.verb)])).toEqual([["B", ["1", "4"]], [null, ["2", "5"]], ["A", ["3"]]]);
  });
});

describe("population tie", () => {
  it("the reader's field list equals the served schema's properties", () => {
    const p = path.resolve("src/api/openapi/cortex-bff.openapi.json");
    const spec = JSON.parse(fs.readFileSync(p, "utf8"));
    const served = Object.keys(spec.components.schemas.AskableMeasure.properties).sort();
    expect(served.length).toBeGreaterThan(0);
    expect(served).toEqual([...ASKABLE_MEASURE_FIELDS].sort());
  });
});

describe("refusals and the pick", () => {
  const err = (status: number, detail: unknown) => ({ response: { status, data: { detail } } });
  it("a string detail is the reason, verbatim", () => {
    expect(readAskableRefusal(err(400, "active_persona and active_domains go together"))).toEqual({
      status: 400, code: null, reason: "active_persona and active_domains go together",
    });
  });
  it("an object detail takes its code and its words", () => {
    const r = readAskableRefusal(err(403, { error: "persona_not_held", message: "You do not hold p." }));
    expect(r).toMatchObject({ status: 403, code: "persona_not_held", reason: "You do not hold p." });
  });
  it("no response is not a refusal", () => {
    expect(readAskableRefusal(new Error("network"))).toBeNull();
  });
  it("the pick is the verb with empty bindings", () => {
    expect(askablePick("v")).toEqual({ verb: "v", bindings: {} });
  });
});
