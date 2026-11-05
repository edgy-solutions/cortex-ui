/** What is drawn: columns, pass-through, zeros, focus, text. */
import { describe, expect, it } from "vitest";
import { readFlowTable, type FlowTable } from "./contract";
import { buildFlowGraph, hoverFor, signedText } from "./model";
import { FLOW_DECOMPOSITION_FIXTURES } from "./fixtures";

const table = (i: number): FlowTable => {
  const r = readFlowTable(FLOW_DECOMPOSITION_FIXTURES[i].payload);
  if (!r.ok) throw new Error("fixture refused");
  return r;
};
const GOOD = table(0);
const graph = buildFlowGraph(GOOD, null);
const real = (label: string) => graph.nodes.filter((n) => !n.passthrough && n.path.join(" / ") === label);

describe("columns follow the level", () => {
  it("depth equals path length - 1 for every real node", () => {
    for (const n of graph.nodes.filter((x) => !x.passthrough)) {
      expect(n.depth, n.path.join("/")).toBe(n.path.length - 1);
    }
    expect(graph.maxDepth).toBe(4);
  });
});

describe("a sink continues to the last column", () => {
  it("level-2 sink has pass-throughs at 3 and 4; level-3 sink has one at 4", () => {
    const sink2 = real("Program / Group A / All other")[0];
    const sink3 = real("Program / Group A / Item A1 / All other")[0];
    expect(sink2.depth).toBe(2);
    expect(sink3.depth).toBe(3);
    const pass = (key: string) => graph.nodes.filter((n) => n.passthrough && n.key === key).map((n) => n.depth).sort();
    expect(pass(sink2.key)).toEqual([3, 4]);
    expect(pass(sink3.key)).toEqual([4]);
  });
});

describe("zero draws no band", () => {
  it("no node and no link for a zero path, nor beneath it", () => {
    const paths = graph.nodes.map((n) => n.path.join(" / "));
    expect(paths.some((p) => p.includes("Item B3") || p.includes("Item B4"))).toBe(false);
    expect(paths.some((p) => p.includes("Part B3"))).toBe(false);
    expect(graph.links.every((l) => l.value > 0)).toBe(true);
    expect(graph.links.every((l) => l.sign !== "zero")).toBe(true);
  });

  it("the parent's hover lists its zero children", () => {
    const group = [...GOOD.nodes.values()].find((n) => n.label === "Group B")!;
    expect(hoverFor(GOOD, group.key)!.zeroList).toBe("2 at zero: Item B3, Item B4");
  });

  it("a sink of sign zero under a drawn parent is not drawn either", () => {
    expect(graph.nodes.some((n) => n.path.join("/") === "Program/Group A/Item A2/All other")).toBe(false);
  });
});

describe("focus", () => {
  it("the focused node is column 0 and the crumbs walk to the root", () => {
    const a1 = [...GOOD.nodes.values()].find((n) => n.label === "Item A1")!;
    const g = buildFlowGraph(GOOD, a1.key);
    expect(g.nodes[0].label).toBe("Item A1");
    expect(g.nodes[0].depth).toBe(0);
    expect(g.crumbs.map((c) => c.label)).toEqual(["Program", "Group A", "Item A1"]);
    expect(g.maxDepth).toBe(2);
  });

  it("leaves and sinks are not clickable", () => {
    expect(graph.nodes.filter((n) => n.kind === "other").every((n) => !n.clickable)).toBe(true);
    expect(real("Program / Group A / Item A1 / Part A1b")[0].clickable).toBe(false);
    expect(real("Program / Group A")[0].clickable).toBe(true);
  });
});

describe("text", () => {
  it("negatives carry U+2212, positives +, and the unit only when served", () => {
    expect(signedText("negative", 35000, "USD")).toBe("−35,000 USD");
    expect(signedText("positive", 1065000, undefined)).toBe("+1,065,000");
    expect(signedText("zero", 0, undefined)).toBe("0");
    expect(signedText("negative", 5, undefined)).not.toContain("-");
  });
});
