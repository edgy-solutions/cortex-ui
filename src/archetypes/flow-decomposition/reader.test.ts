/** The reader: one arm per refusal reason (asserting the REASON), and the non-refusing notes. */
import { describe, expect, it } from "vitest";
import { FLOW_DECOMPOSITION_REFUSAL_REASONS, readFlowTable } from "./contract";
import { FLOW_DECOMPOSITION_FIXTURES, PLAIN_RENDER, broken, find, plain, plainRows } from "./fixtures";

const byName = (prefix: string) => {
  const f = FLOW_DECOMPOSITION_FIXTURES.find((x) => x.name.startsWith(prefix));
  if (!f) throw new Error(`no fixture ${prefix}`);
  return f.payload;
};
const reasonOf = (payload: Record<string, unknown>) => {
  const r = readFlowTable(payload);
  return r.ok ? "accepted" : r.refusal;
};

describe("readFlowTable refuses with exactly one named reason", () => {
  it.each(FLOW_DECOMPOSITION_REFUSAL_REASONS.map((r) => [r] as const))("%s", (reason) => {
    expect(reasonOf(byName(reason)), `fixture for ${reason}`).toBe(reason);
  });

  it("every reason has a fixture, and every refusal fixture names a reason", () => {
    const named = FLOW_DECOMPOSITION_FIXTURES.filter((f) => f.declares.includes("data-flow-refusal")).map(
      (f) => f.name.split(" ")[0],
    );
    expect(named.sort()).toEqual([...FLOW_DECOMPOSITION_REFUSAL_REASONS].sort());
  });

  it("value_exact that is not a decimal string is malformed_edge, null included", () => {
    for (const bad of ["1e3", "-5", "", null, 12]) {
      const rows = broken((r) => void ((find(r, "Total", "Branch 2").value_exact as unknown) = bad));
      expect(reasonOf(plain(rows)), String(bad)).toBe("malformed_edge");
    }
  });

  it("the good fixture is accepted, with no closure note (0.1 + 0.2 closes exactly)", () => {
    const r = readFlowTable(FLOW_DECOMPOSITION_FIXTURES[0].payload);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.notes.map((n) => n.kind)).toEqual(["zero_subtree"]);
  });
});

describe("notes do not refuse", () => {
  it("closure names the node and the cent", () => {
    const r = readFlowTable(byName("closure —"));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const n = r.notes.filter((x) => x.kind === "closure");
    expect(n).toHaveLength(1);
    expect(n[0].text).toContain("Branch 1");
    expect(n[0].text).toContain("0.01");
  });

  it("closure_unchecked when value_exact is missing: says so and does not guess", () => {
    const r = readFlowTable(byName("closure_unchecked"));
    expect(r.ok && r.notes.map((n) => n.kind)).toEqual(["closure_unchecked"]);
  });

  it("other_label_missing is only raised when the label is absent", () => {
    const r = readFlowTable(byName("other_label_missing"));
    expect(r.ok && r.notes.map((n) => n.kind)).toEqual(["other_label_missing"]);
    const withLabel = readFlowTable(plain(broken(() => {}), { render: PLAIN_RENDER }));
    expect(withLabel.ok && withLabel.notes).toEqual([]);
  });

  it("shape_mismatch names the declared shape; the served shape raises nothing", () => {
    const r = readFlowTable(byName("shape_mismatch"));
    expect(r.ok && r.notes.map((n) => n.kind)).toEqual(["shape_mismatch"]);
    expect(r.ok && r.notes[0].text).toContain('"MULTI_SERIES"');
    const absent = readFlowTable(plain(plainRows(), { render: { other_label: "All other" } }));
    expect(absent.ok && absent.notes).toEqual([]);
  });

  it("zero_subtree counts zero nodes that have items beneath them", () => {
    const r = readFlowTable(byName("zero_subtree"));
    expect(r.ok && r.notes.map((n) => n.kind)).toEqual(["zero_subtree"]);
    expect(r.ok && r.notes[0].text).toContain("1 items at zero");
  });
});

describe("a sink is recognised by node_kind only", () => {
  it("an item labelled like other_label is an item; an other with another label is a sink", () => {
    const r = readFlowTable(byName("an item labelled"));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const kinds = Object.fromEntries([...r.nodes.values()].map((n) => [n.path[n.path.length - 1], n.kind]));
    expect(kinds["All other"]).toBe("item");
    expect(kinds["Remainder"]).toBe("other");
  });
});
