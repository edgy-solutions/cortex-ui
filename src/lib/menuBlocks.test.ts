import { describe, expect, it } from "vitest";
import { mergeServedBlocks, readMenuBlocks, type MenuBlocksRead } from "./menuBlocks";
import { assembleCapabilities, type AssembledCapability } from "@/registry/assembleCapabilities";
import { CORTEX_UI_CAPABILITIES } from "@/registry/frontendCapabilities";

// CONSTRUCTED FROM THE SOURCE ROW, NOT CAPTURED: invincible-agent 0e58ed44,
// policy/overlays/sample/menu_blocks/where_used_set.yaml. A captured body replaces this when served.
const WHERE_USED = {
  subject: "mesh:WhereUsedSet",
  archetype: "mesh:InstancesByProperty",
  persona_fit: ["SAFETY_ENGINEER", "SUSTAINMENT_ENGINEER"],
  domain_fit: ["SUSTAINMENT"],
  declared_by: "mesh:whereIsThisPartUsed",
};
const body = (blocks: unknown, extra: Record<string, unknown> = {}) => ({
  composed: true,
  blocks,
  invalid: [],
  ...extra,
});

const cap = (subject: string, object: string, archetype: string, fit = "OLD"): AssembledCapability =>
  ({
    subject_uri: subject,
    object_uri: object,
    archetype,
    persona_fit: [fit],
    domain_fit: [fit],
    contract_source: "legacy",
  }) as unknown as AssembledCapability;
const blk = (s: string, a: string, by = "mesh:v", p: string[] = ["P"], d: string[] = ["D"]) => ({
  subject: s,
  archetype: a,
  persona_fit: p,
  domain_fit: d,
  declared_by: by,
});
const ready = (blocks: unknown[]): MenuBlocksRead => readMenuBlocks(body(blocks));
const pair = (c: AssembledCapability[], s: string, o: string) =>
  c.filter((x) => x.subject_uri === s && x.object_uri === o);

describe("readMenuBlocks", () => {
  it("1 null is unreachable", () => expect(readMenuBlocks(null)).toEqual({ kind: "unreachable" }));
  it("2 non-envelopes are unreadable", () => {
    for (const b of ["x", {}, { composed: "yes" }]) expect(readMenuBlocks(b).kind).toBe("unreadable");
  });
  it("3 composed true with blocks not an array is unreadable", () => {
    expect(readMenuBlocks({ composed: true, blocks: {} }).kind).toBe("unreadable");
    expect(readMenuBlocks({ composed: true }).kind).toBe("unreadable");
  });
  it("4 composed false is uncomposed and the merge returns the input unchanged", () => {
    const r = readMenuBlocks({ composed: false, blocks: [WHERE_USED] });
    expect(r.kind).toBe("uncomposed");
    const input = [cap("a:A", "mesh:X", "X"), cap("a:B", "mesh:Y", "Y")];
    const { capabilities, report } = mergeServedBlocks(input, r);
    expect(capabilities.length).toBe(input.length);
    capabilities.forEach((c, i) => expect(c).toBe(input[i]));
    expect(report.state).toBe("uncomposed");
  });
  it("5 composed true with no blocks leaves every row in place (cardinality)", () => {
    const input = [cap("a:A", "mesh:X", "X"), cap("a:B", "mesh:Y", "Y")];
    const { capabilities } = mergeServedBlocks(input, ready([]));
    expect(capabilities.length).toBe(2);
    expect(capabilities.map((c) => c.subject_uri)).toEqual(["a:A", "a:B"]);
  });
  it("6 one bad block is skipped by itself and named by field", () => {
    const r = ready([blk("a:A", "mesh:X"), { ...blk("a:B", "mesh:X"), persona_fit: "P" }, blk("a:C", "mesh:X")]);
    if (r.kind !== "ready") throw new Error("not ready");
    expect(r.blocks.length).toBe(2);
    expect(r.skipped.length).toBe(1);
    expect(r.skipped[0].index).toBe(1);
    expect(r.skipped[0].reason).toContain("persona_fit");
  });
  it("7 unknown extra keys are tolerated", () => {
    const r = readMenuBlocks(body([{ ...WHERE_USED, opens_view: "x" }], { version: 2 }));
    if (r.kind !== "ready") throw new Error("not ready");
    expect(r.blocks.length).toBe(1);
    expect(r.skipped).toEqual([]);
  });
  it("13 a served invalid list is counted", () => {
    const r = readMenuBlocks(body([], { invalid: [{ source: "f.yaml", reason: "bad" }, { source: "g.yaml", reason: "worse" }] }));
    expect(mergeServedBlocks([], r).report.served_invalid).toBe(2);
    if (r.kind !== "ready") throw new Error("not ready");
    expect(r.invalid.length).toBe(2);
  });
});

describe("mergeServedBlocks", () => {
  it("8 a block whose pair matches a hand row replaces it in place", () => {
    const input = [cap("a:A", "mesh:X", "X"), cap("a:S", "mesh:X", "X"), cap("a:B", "mesh:Y", "Y")];
    const { capabilities, report } = mergeServedBlocks(input, ready([blk("a:S", "mesh:X", "mesh:v", ["NEW"], ["NEWD"])]));
    expect(capabilities.length).toBe(3);
    expect(capabilities[1].subject_uri).toBe("a:S");
    expect(capabilities[1].persona_fit).toEqual(["NEW"]);
    expect(capabilities[1].domain_fit).toEqual(["NEWD"]);
    expect(pair(capabilities, "a:S", "mesh:X").length).toBe(1);
    expect(report.replaced).toEqual(["a:S -> mesh:X"]);
  });
  it("9 the pair is the key: a MultiSeries block does not remove the Flow row", () => {
    const input = [
      cap("fin:DeclaredMeasureSeries", "mesh:FlowDecomposition", "FLOW_DECOMPOSITION"),
      cap("a:M", "mesh:MultiSeries", "MULTI_SERIES"),
    ];
    const { capabilities, report } = mergeServedBlocks(input, ready([blk("fin:DeclaredMeasureSeries", "mesh:MultiSeries")]));
    expect(pair(capabilities, "fin:DeclaredMeasureSeries", "mesh:FlowDecomposition").length).toBe(1);
    expect(pair(capabilities, "fin:DeclaredMeasureSeries", "mesh:MultiSeries").length).toBe(1);
    expect(capabilities.length).toBe(3);
    expect(report.added).toEqual(["fin:DeclaredMeasureSeries -> mesh:MultiSeries"]);
    expect(report.replaced).toEqual([]);
  });
  it("10 an unknown class is undrawable and not registered", () => {
    const input = [cap("a:A", "mesh:X", "X")];
    const { capabilities, report } = mergeServedBlocks(input, ready([blk("a:Z", "mesh:Nope")]));
    expect(report.undrawable).toEqual(["a:Z -> mesh:Nope"]);
    expect(capabilities.length).toBe(1);
    expect(pair(capabilities, "a:Z", "mesh:Nope").length).toBe(0);
  });
  it("11 blocks sharing a pair make one capability with fits unioned in first-seen order", () => {
    const input = [cap("a:A", "mesh:X", "X")];
    const { capabilities } = mergeServedBlocks(
      input,
      ready([
        blk("a:S", "mesh:X", "mesh:v1", ["P1", "P2"], ["D1"]),
        blk("a:S", "mesh:X", "mesh:v2", ["P2", "P3"], ["D2", "D1"]),
      ]),
    );
    const rows = pair(capabilities, "a:S", "mesh:X");
    expect(rows.length).toBe(1);
    expect(rows[0].persona_fit).toEqual(["P1", "P2", "P3"]);
    expect(rows[0].domain_fit).toEqual(["D1", "D2"]);
  });
  it("12 the real menu: one WhereUsedSet row, drawn as INSTANCES_BY_PROPERTY, length unchanged", () => {
    const assembled = assembleCapabilities(CORTEX_UI_CAPABILITIES);
    const { capabilities, report } = mergeServedBlocks(assembled, ready([WHERE_USED]));
    expect(capabilities.length).toBe(assembled.length);
    const rows = capabilities.filter((c) => c.subject_uri === "mesh:WhereUsedSet");
    expect(rows.length).toBe(1);
    expect(rows[0].object_uri).toBe("mesh:InstancesByProperty");
    expect(rows[0].archetype).toBe("INSTANCES_BY_PROPERTY");
    expect(rows[0].persona_fit).toEqual(WHERE_USED.persona_fit);
    expect(rows[0].domain_fit).toEqual(WHERE_USED.domain_fit);
    expect(report.replaced).toEqual(["mesh:WhereUsedSet -> mesh:InstancesByProperty"]);
  });
});
