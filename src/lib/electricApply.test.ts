/**
 * The Electric ingest applies a whole subscribe batch in ONE set().
 * Equivalence: one op at a time must deep-equal the same ops as one batch.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Artifact } from "@/api/types";
import { useCanvasStore } from "@/store/useCanvasStore";
import type { ElectricOp } from "./electricApply";

const art = (id: string, over: Partial<Artifact> = {}): Artifact =>
  ({ id, status: "complete", watermark: 0, created_at: 1, question_text: "", summary: id, ...over }) as unknown as Artifact;
const up = (a: Artifact): ElectricOp => ({ kind: "upsert", artifact: a });

const INITIAL = useCanvasStore.getState();
const reset = (artifacts: Artifact[] = []) =>
  useCanvasStore.setState({
    ...INITIAL,
    artifacts,
    currentArtifactId: null,
    currentArtifactSetByUser: false,
    _lastUpdateSource: {},
  });
const snap = () => {
  const s = useCanvasStore.getState();
  return {
    artifacts: s.artifacts,
    currentArtifactId: s.currentArtifactId,
    currentArtifactSetByUser: s.currentArtifactSetByUser,
    _lastUpdateSource: s._lastUpdateSource,
  };
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(5_000_000);
});
afterEach(() => vi.useRealTimers());

// duplicate ids, two updates to one id, a pending artifact, a delete, a must-refetch mid-batch
const PENDING = art("pend", { status: "pending", question_text: "local q", answered_with: "yes" as never, watermark: 0 });
const FIXTURE: ElectricOp[] = [
  up(art("a", { watermark: 1 })),
  up(art("b", { watermark: 2 })),
  up(art("a", { watermark: 3, summary: "a v2" })),
  up(art("a", { watermark: 4, summary: "a v3", question_text: "from server" })),
  up(art("pend", { status: "complete", watermark: 5, question_text: "server q" })),
  { kind: "remove", id: "b" },
  up(art("c", { watermark: 6 })),
  { kind: "reset" },
  up(art("d", { watermark: 7 })),
  up(art("a", { watermark: 8, summary: "a after refetch" })),
  { kind: "remove", id: "nope" },
  up(art("d", { watermark: 9, summary: "d v2" })),
];

describe("batch === one at a time", () => {
  for (const setByUser of [false, true]) {
    it(`deep-equal (setByUser=${setByUser})`, () => {
      const start = () => {
        reset([PENDING, art("old", { watermark: 0 })]);
        useCanvasStore.setState({ currentArtifactSetByUser: setByUser, currentArtifactId: setByUser ? "old" : null });
      };
      start();
      for (const op of FIXTURE) useCanvasStore.getState().electricApplyBatch([op]);
      const one = snap();
      start();
      useCanvasStore.getState().electricApplyBatch(FIXTURE);
      const batch = snap();
      expect(batch).toEqual(one);
      // sanity: the fixture really exercised the paths
      expect(batch.artifacts.map((a) => a.id)).toEqual(["pend", "d", "a"].filter((x) => batch.artifacts.some((a) => a.id === x)));
      expect(batch.artifacts.find((a) => a.id === "a")!.summary).toBe("a after refetch");
    });
  }

  it("a later update to an id inserted in the same batch lands on that row (not a duplicate)", () => {
    reset();
    useCanvasStore.getState().electricApplyBatch([up(art("x", { summary: "1" })), up(art("x", { summary: "2" }))]);
    const rows = useCanvasStore.getState().artifacts;
    expect(rows).toHaveLength(1);
    expect(rows[0].summary).toBe("2");
  });

  it("the single-row action is the same path", () => {
    reset();
    useCanvasStore.getState().electricUpsertArtifact(art("x", { watermark: 3 }));
    expect(useCanvasStore.getState().currentArtifactId).toBe("x");
  });
});

describe("one batch, one notification", () => {
  it("1,000 rows notify subscribers once", () => {
    reset();
    const fn = vi.fn();
    const off = useCanvasStore.subscribe(fn);
    useCanvasStore.getState().electricApplyBatch(Array.from({ length: 1000 }, (_, i) => up(art(`r${i}`, { watermark: i }))));
    off();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(useCanvasStore.getState().artifacts).toHaveLength(1000);
    expect(useCanvasStore.getState().currentArtifactId).toBe("r999");
  });
});
