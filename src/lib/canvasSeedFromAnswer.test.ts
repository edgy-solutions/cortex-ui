/**
 * Two ways this could mint canvases nobody asked for, and one way it could miss the one they
 * did. All three are the point of the file.
 *
 *  1. Electric RE-DELIVERS rows. Seeding on every delivery of the same artifact mints a board
 *     per delivery.
 *  2. A session's HISTORY contains seed answers from previous sittings. Those already produced
 *     their canvases, and those canvases are durable through /me/canvases — so seeding from
 *     history would add a duplicate board on every page load, forever.
 *  3. A genuinely new seed answer must actually seed, or the feature is decoration.
 *
 * The guard for 1 and 2 is the same one: artifacts present at mount are recorded as SEEN
 * without acting. A historical seed answer is history; a new one is an event.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { canvasSeedFromArtifact, useCanvasSeedFromAnswers } from "./canvasSeedFromAnswer";
import { useCanvasStore } from "@/store/useCanvasStore";
import { useStageStore } from "@/store/useStageStore";
import { PORTFOLIO_PLANNING_TEMPLATE } from "./stageConstants";
import type { Artifact } from "@/api/types";

const seedArtifact = (id: string, ids: string[], name?: string) =>
  ({
    id,
    status: "complete",
    rendered_output: {
      components: [{ archetype: "CANVAS_SEED", artifact_ids: ids, ...(name ? { name } : {}) }],
    },
  }) as unknown as Artifact;

const plainArtifact = (id: string) =>
  ({
    id,
    status: "complete",
    rendered_output: { components: [{ archetype: "CHART_WIDGET" }] },
  }) as unknown as Artifact;

beforeEach(() => {
  useCanvasStore.setState({ artifacts: [] } as never);
  useStageStore.setState({ canvases: [], view: "global" } as never);
});

const canvases = () => useStageStore.getState().canvases;

describe("canvasSeedFromArtifact — the payload shape, declared in one place", () => {
  it("reads slot-ordered ids off a CANVAS_SEED component", () => {
    expect(canvasSeedFromArtifact(seedArtifact("a", ["g", "c", "l"], "Q3"))).toEqual({
      ids: ["g", "c", "l"],
      name: "Q3",
    });
  });

  it("is null for anything that is not a seed answer", () => {
    expect(canvasSeedFromArtifact(plainArtifact("a"))).toBeNull();
    expect(canvasSeedFromArtifact({ id: "a" } as unknown as Artifact)).toBeNull();
  });

  it("drops malformed ids, and is null when NONE survive", () => {
    // An item pointing at no artifact renders as a slot-shaped hole with nothing explaining
    // it. A shorter board is better; no board at all is better than a board of holes.
    expect(
      canvasSeedFromArtifact(seedArtifact("a", ["ok", null as never, "" as never, "fine"])),
    ).toEqual({ ids: ["ok", "fine"], name: undefined });
    expect(canvasSeedFromArtifact(seedArtifact("a", [null as never, 42 as never]))).toBeNull();
  });
});

describe("useCanvasSeedFromAnswers — seeds once, and never from history", () => {
  it("does NOT seed from HISTORY, even once something else arrives", () => {
    // The duplicate-board-per-page-load guard. That seed answer already produced its canvas,
    // and the canvas is durable through /me/canvases.
    //
    // The unrelated arrival is the load-bearing half of this test, and the first version left
    // it out. A store subscription only fires on CHANGE, so with history alone nothing runs
    // and the test passed whether or not the priming existed — it was asserting "no change, no
    // action", not "history is seen". A red-proof that emptied the primed set walked straight
    // past it. The real hazard is history PLUS any later update, because the handler then
    // iterates every artifact including the old seed.
    useCanvasStore.setState({ artifacts: [seedArtifact("old", ["a", "b"])] } as never);

    const r = renderHook(() => useCanvasSeedFromAnswers());
    useCanvasStore.setState({
      artifacts: [seedArtifact("old", ["a", "b"]), plainArtifact("unrelated")],
    } as never);

    expect(canvases()).toEqual([]);
    r.unmount();
  });

  it("SEEDS from an answer that arrives after mount", () => {
    const r = renderHook(() => useCanvasSeedFromAnswers());

    useCanvasStore.setState({
      artifacts: [seedArtifact("new", ["gantt", "cost", "load"], "Seeded")],
    } as never);

    const c = canvases()[0];
    expect(c.use).toBe("portfolio_planning");
    expect(c.name).toBe("Seeded");
    expect(c.items.map((i) => i.id)).toEqual(["gantt", "cost", "load"]);
    // Placement came from the template through the ordinary add path, not from anything here.
    expect({ ...c.items[0] }).toEqual({ id: "gantt", ...PORTFOLIO_PLANNING_TEMPLATE[0] });
    r.unmount();
  });

  it("seeds ONCE even when Electric re-delivers the same artifact", () => {
    // A subscription that acted on every delivery would mint a board per delivery, and Electric
    // re-delivers routinely.
    const r = renderHook(() => useCanvasSeedFromAnswers());
    const a = seedArtifact("new", ["x", "y"]);

    useCanvasStore.setState({ artifacts: [a] } as never);
    useCanvasStore.setState({ artifacts: [a] } as never);
    useCanvasStore.setState({ artifacts: [{ ...a }] } as never);

    expect(canvases()).toHaveLength(1);
    r.unmount();
  });

  it("ignores ordinary answers arriving alongside", () => {
    const r = renderHook(() => useCanvasSeedFromAnswers());

    useCanvasStore.setState({ artifacts: [plainArtifact("p1"), plainArtifact("p2")] } as never);

    expect(canvases()).toEqual([]);
    r.unmount();
  });

  it("preserves the SERVER's order — it does not sort", () => {
    // Which measure lands in the anchor is the producer's declaration.
    const r = renderHook(() => useCanvasSeedFromAnswers());

    useCanvasStore.setState({ artifacts: [seedArtifact("n", ["z", "a", "m"])] } as never);

    expect(canvases()[0].items.map((i) => i.id)).toEqual(["z", "a", "m"]);
    r.unmount();
  });
});
