import { describe, it, expect } from "vitest";
import type { Artifact } from "@/api/types";
import {
  applyElectricOps,
  filterLiveOps,
  INITIAL_ANSWER_PAGING,
  BODY_FIELDS,
  type ElectricOp,
  type ElectricSlice,
} from "./electricApply";

const art = (id: string, over: Partial<Artifact> = {}): Artifact =>
  ({
    id, created_at: 1000, updated_at: 0, question_text: "q", message_id: "m", summary: "s", status: "complete", watermark: 1,
    rendered_output: null, routing: null, resolved_intent: {}, sources: [], graph_trace: [], graph_trace_alternates: [],
    ...over,
  }) as unknown as Artifact;

const LOADED = {
  rendered_output: { components: [{ archetype: "TABLE" }] },
  routing: { fallback: false },
  resolved_intent: { a: 1 },
  sources: [{ id: "s1" }],
  graph_trace: [{ id: "g1" }],
  graph_trace_alternates: [{ id: "g2" }],
} as unknown as Partial<Artifact>;

const slice = (artifacts: Artifact[], bodies: ElectricSlice["bodies"] = {}): ElectricSlice => ({
  artifacts, currentArtifactId: null, currentArtifactSetByUser: false, _lastUpdateSource: {}, bodies,
  subjects: {}, answerPaging: INITIAL_ANSWER_PAGING, answerSearch: null,
});
const summaryRow = (id: string) => art(id, { summary: "fresh" });

describe("a summary upsert and a loaded body", () => {
  it("keeps a loaded body: all six body fields survive", () => {
    const out = applyElectricOps(slice([art("a", LOADED)], { a: "loaded" }), [{ kind: "upsert", artifact: summaryRow("a") }], { summaries: true });
    const a = out.artifacts![0]!;
    expect(a.summary).toBe("fresh");
    for (const f of BODY_FIELDS) expect(a[f], f).toEqual((LOADED as Record<string, unknown>)[f]);
  });

  it("an absent body is not protected: the summary row replaces it", () => {
    const out = applyElectricOps(slice([art("a", LOADED)], { a: "absent" }), [{ kind: "upsert", artifact: summaryRow("a") }], { summaries: true });
    expect(out.artifacts![0]!.rendered_output).toBeNull();
  });

  it("flag off: an upsert replaces body fields as before, even with a body marked loaded", () => {
    const out = applyElectricOps(slice([art("a", LOADED)], { a: "loaded" }), [{ kind: "upsert", artifact: summaryRow("a") }]);
    const a = out.artifacts![0]!;
    for (const f of BODY_FIELDS) expect(a[f], f).toEqual(summaryRow("a")[f]);
  });
});

describe("filterLiveOps: live rows below the frontier", () => {
  const up = (id: string, created_at: number): ElectricOp => ({ kind: "upsert", artifact: art(id, { created_at }) });
  const ids = (ops: ElectricOp[]) => ops.map((o) => (o.kind === "upsert" ? o.artifact.id : o.kind));

  it("an older, unheld row is skipped; newer, equal and held ones pass", () => {
    const out = filterLiveOps([up("old-new-id", 500), up("old-held", 500), up("at", 1000), up("newer", 2000)], 1000, new Set(["old-held"]));
    expect(ids(out)).toEqual(["old-held", "at", "newer"]);
  });

  it("removes and resets pass; no frontier filters nothing", () => {
    const ops: ElectricOp[] = [{ kind: "remove", id: "x" }, { kind: "reset" }, up("old", 1)];
    expect(ids(filterLiveOps(ops, 1000, new Set()))).toEqual(["remove", "reset"]);
    expect(ids(filterLiveOps(ops, null, new Set()))).toEqual(["remove", "reset", "old"]);
  });
});

describe("a reset in summaries mode", () => {
  it("clears bodies, subjects, paging and the search with the rows", () => {
    const s = slice([art("a", LOADED)], { a: "loaded" });
    s.subjects = { a: { uri: "u", label: "l" } };
    s.answerPaging = { status: "loaded", loaded: 50, total: 900, nextPage: 2, frontier: 5 };
    const out = applyElectricOps(s, [{ kind: "reset" }], { summaries: true });
    expect(out.artifacts).toEqual([]);
    expect(out.bodies).toEqual({});
    expect(out.subjects).toEqual({});
    expect(out.answerPaging).toEqual(INITIAL_ANSWER_PAGING);
    expect(out.answerSearch).toBeNull();
  });

  it("flag off: the paging state stays out of the result", () => {
    const out = applyElectricOps(slice([art("a")]), [{ kind: "reset" }]);
    expect(out).not.toHaveProperty("bodies");
  });
});
