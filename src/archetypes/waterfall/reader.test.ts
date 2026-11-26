/** The reader: balanced is accepted; every refusal names its reason; served order is kept; nothing is inferred. */
import { describe, expect, it } from "vitest";
import { WATERFALL_REFUSAL_REASONS, WATERFALL_WALK_REFUSAL_REASONS, readWaterfall } from "./contract";
import { NEGATIVE_START, STEP_ORDER, WATERFALL_FIXTURES, good, goodRows } from "./fixtures";

const byName = (prefix: string) => {
  const f = WATERFALL_FIXTURES.find((x) => x.name.startsWith(prefix));
  if (!f) throw new Error(`no fixture ${prefix}`);
  return f.payload;
};

describe("readWaterfall", () => {
  it("a balanced walk is accepted, with start, steps and end as served", () => {
    const r = readWaterfall(good());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.start).toMatchObject({ label: "Opening total", exact: "1000.00" });
    expect(r.end).toMatchObject({ label: "Closing total", exact: "1200.00" });
    expect(r.notes).toEqual([]);
  });

  it("a walk off by 0.01 is walk_unbalanced and the detail names start, steps, end and the gap", () => {
    const r = readWaterfall(byName("walk_unbalanced"));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.refusal).toBe("walk_unbalanced");
    expect(r.detail).toContain("start 1000.00");
    expect(r.detail).toContain("steps 200.00");
    expect(r.detail).toContain("end is 1200.01");
    expect(r.detail).toContain("gap 0.01");
  });

  it("a walk that balances only in decimals, not floats, is accepted (0.1 + 0.2 = 0.3)", () => {
    const rows = [
      { source: null, target: ["T"], value: 0.3, value_exact: "0.3", sign: "positive", level: 0, node_kind: "item" },
      { source: ["T"], target: ["T", "a"], value: 0.1, value_exact: "0.1", sign: "positive", level: 1, node_kind: "item" },
      { source: ["T"], target: ["T", "b"], value: 0.2, value_exact: "0.2", sign: "positive", level: 1, node_kind: "item" },
    ];
    const walk = { start: { label: "s", value: 0, value_exact: "0" }, end: { label: "e", value: 0.3, value_exact: "0.3" } };
    expect(readWaterfall({ rows, walk }).ok).toBe(true);
  });

  it("no walk is walk_missing: the totals are never inferred from the edges", () => {
    const r = readWaterfall(byName("walk_missing"));
    expect(r.ok ? "accepted" : r.refusal).toBe("walk_missing");
    const { walk: _w, ...noWalk } = good();
    expect(readWaterfall({ ...noWalk, walk: null }).ok).toBe(false);
  });

  it("a malformed start or end is walk_malformed, one arm per field", () => {
    const base = good().walk as { start: Record<string, unknown>; end: Record<string, unknown> };
    const cases: Record<string, unknown>[] = [
      { ...base, start: "x" },
      { ...base, end: null },
      { ...base, start: { ...base.start, label: 5 } },
      { ...base, start: { ...base.start, label: "" } },
      { ...base, end: { ...base.end, value_exact: 1200 } },
      { ...base, end: { ...base.end, value_exact: "1.2e3" } },
      { ...base, end: { ...base.end, value_exact: "+1200" } },
      { ...base, end: { ...base.end, value_exact: undefined } },
    ];
    for (const walk of cases) {
      const r = readWaterfall(good({ walk }));
      expect(r.ok ? "accepted" : r.refusal, JSON.stringify(walk)).toBe("walk_malformed");
    }
    expect((readWaterfall(good({ walk: [] })) as { refusal: string }).refusal).toBe("walk_malformed");
  });

  it("a level-1 edge with no value_exact cannot be checked: walk_unchecked", () => {
    const r = readWaterfall(byName("walk_unchecked"));
    expect(r.ok ? "accepted" : r.refusal).toBe("walk_unchecked");
  });

  it("a flow refusal passes through with the flow reason", () => {
    expect((readWaterfall(byName("no_rows")) as { refusal: string }).refusal).toBe("no_rows");
  });

  it("every refusal reason has a fixture that trips exactly it", () => {
    for (const reason of WATERFALL_WALK_REFUSAL_REASONS) {
      const r = readWaterfall(byName(reason));
      expect(r.ok ? "accepted" : r.refusal, reason).toBe(reason);
    }
    expect(WATERFALL_REFUSAL_REASONS).toContain("no_rows");
  });

  it("a negative start walks: -100.00 + 40.00 - 10.50 = -70.50", () => {
    const r = readWaterfall(NEGATIVE_START);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.steps.map((s) => s.signed)).toEqual([40, -10.5]);
  });

  it("a level-1 remainder is labelled by render.other_label, and recognised by node_kind", () => {
    const r = readWaterfall(good({ render: { shape: "WATERFALL", other_label: "Everything else" } }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const other = r.steps.filter((s) => s.kind === "other");
    expect(other.map((s) => s.label)).toEqual(["Everything else"]);
  });

  it("steps are the level-1 edges IN SERVED ORDER, not sorted", () => {
    // Guard the fixture itself: the served order is not value-descending, signed-ascending or alphabetical.
    const served = goodRows().filter((e) => e.level === 1).map((e) => e.target[1]);
    expect(served).toEqual([...STEP_ORDER]);
    const abs = goodRows().filter((e) => e.level === 1).map((e) => e.value);
    expect(abs).not.toEqual([...abs].sort((a, b) => b - a));
    expect(served).not.toEqual([...served].sort());
    const r = readWaterfall(good());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.steps.map((s) => s.label)).toEqual([...STEP_ORDER]);
  });

  it("render.shape naming another archetype is a note, not a refusal", () => {
    const r = readWaterfall(good({ render: { shape: "FLOW_DECOMPOSITION", other_label: "All other" } }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.notes.map((n) => n.kind)).toEqual(["shape_mismatch"]);
  });
});
