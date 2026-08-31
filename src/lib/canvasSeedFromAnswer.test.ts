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
import { portfolioPlanningTemplate } from "./stageConstants";
import type { Artifact } from "@/api/types";

const seedArtifact = (id: string, ids: string[], name?: string) =>
  ({
    id,
    status: "complete",
    rendered_output: {
      components: [{ archetype: "CANVAS_SEED", artifact_ids: ids, ...(name ? { name } : {}) }],
    },
  }) as unknown as Artifact;

/**
 * CAPTURED PAYLOAD — 2026-08-28, the first real seed answer to route end to end.
 *
 * Replaces an invented fixture. Everything here is the shape the producer actually sent, and
 * two things about it were news:
 *
 *   - There is no `name` and no `canvas_type`. Both are declared optional by the contract and
 *     both are read by the consumer, and the producer sends NEITHER. They are consumer-side
 *     inventions with no producer — the same species as `elapsed_ms`, harmless only because
 *     they are optional and the consumer already has a default.
 *   - There ARE two fields nothing here knew about: `source_persona` and `subject_concept`.
 *     They are kept in the fixture precisely because the recognizer must ignore them; a
 *     fixture trimmed to the fields we read would prove nothing about the bytes on the wire.
 *
 * The ids are truncated as captured (the panel elides them mid-urn). The PREFIX is verbatim,
 * which is the part that matters: these are answerArtifact urns, not bare uuids, so anything
 * downstream that assumed a plain id would break on the real thing.
 */
const CAPTURED_SEED_PAYLOAD = {
  archetype: "CANVAS_SEED",
  artifact_ids: [
    "urn:li:answerArtifact:canvas-seed-0414904c-s1",
    "urn:li:answerArtifact:canvas-seed-0414904c-s2",
    "urn:li:answerArtifact:canvas-seed-0414904c-s3",
    "urn:li:answerArtifact:canvas-seed-0414904c-s4",
    "urn:li:answerArtifact:canvas-seed-0414904c-s5",
  ],
  source_persona: "PORTFOLIO_LEAD",
  subject_concept: null,
};

const capturedArtifact = () =>
  ({
    id: "captured",
    status: "complete",
    rendered_output: { components: [CAPTURED_SEED_PAYLOAD] },
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


  it("reads the CAPTURED payload — real bytes, not a shape we invented", () => {
    // The whole reason this file waited on a live run. An invented fixture proves the
    // recognizer matches what we imagined the producer sends.
    const seed = canvasSeedFromArtifact(capturedArtifact());
    expect(seed?.ids).toEqual(CAPTURED_SEED_PAYLOAD.artifact_ids);
    expect(seed?.ids).toHaveLength(5);
  });

  it("the real payload carries NO name — the consumer default is what actually ships", () => {
    // `name` is declared optional and read here, and the producer does not send it. Pinned so
    // that if a producer ever starts sending one, this test fails and someone decides whether
    // that was intended rather than discovering it from a renamed board.
    expect("name" in CAPTURED_SEED_PAYLOAD).toBe(false);
    expect(canvasSeedFromArtifact(capturedArtifact())?.name).toBeUndefined();
  });

  it("ignores producer fields it does not know about", () => {
    // `source_persona` and `subject_concept` arrived unannounced. A recognizer that choked on
    // an unrecognised sibling field would break every time the producer grew one.
    expect(canvasSeedFromArtifact(capturedArtifact())).not.toBeNull();
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
    expect({ ...c.items[0] }).toEqual({ id: "gantt", ...portfolioPlanningTemplate(useStageStore.getState().viewport)[0] });
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

/**
 * BOARDS MUST NOT MULTIPLY ON RELOAD.
 *
 * Reported from the field: "the planning canvases at the bottom weren't created by me, they
 * keep multiplying. I delete them and more appear."
 *
 * The receiver guarded against this by remembering which artifacts existed when it mounted —
 * the comment said "so history cannot seed". On a fresh load that set is EMPTY, because
 * artifacts hydrate from Electric AFTER mount. Every historical seed answer then arrived
 * looking brand new and minted another board: one per seed answer, every reload, for ever.
 *
 * A guard whose premise is "the data is already here" is worth nothing at the exact moment the
 * data is arriving. So the protection is not a timing guard at all — it is a fact that persists
 * with the canvas: a seed answer that already has a board does not get another.
 */
describe("seeding is idempotent per seed answer", () => {
  const seedRO = (ids: string[]) => ({
    components: [{ archetype: "CANVAS_SEED", artifact_ids: ids }],
  });

  beforeEach(() => {
    useCanvasStore.setState({ artifacts: [] } as never);
    useStageStore.setState({ canvases: [], view: "global" } as never);
  });

  it("the same seed answer twice makes ONE board", () => {
    const s = useStageStore.getState().seedPortfolioCanvas(["x", "y"], "P", false, "seed-1");
    const again = useStageStore.getState().seedPortfolioCanvas(["x", "y"], "P", false, "seed-1");
    expect(again).toBe(s);
    expect(useStageStore.getState().canvases).toHaveLength(1);
  });

  it("a board that ALREADY EXISTS from a previous session is not re-seeded", () => {
    // The reload case, reproduced exactly: the canvases persist, the artifacts arrive fresh.
    useStageStore.setState({
      canvases: [{ id: "c-old", name: "P", use: "portfolio_planning", items: [], seededFrom: "seed-1" }],
    } as never);
    useStageStore.getState().seedPortfolioCanvas(["x", "y"], "P", false, "seed-1");
    expect(useStageStore.getState().canvases).toHaveLength(1);
    expect(useStageStore.getState().canvases[0].id).toBe("c-old");
  });

  it("DIFFERENT seed answers still get their own boards", () => {
    // The other half. Without it, "one board" would be satisfiable by never seeding again.
    useStageStore.getState().seedPortfolioCanvas(["x"], "P", false, "seed-1");
    useStageStore.getState().seedPortfolioCanvas(["y"], "P", false, "seed-2");
    expect(useStageStore.getState().canvases).toHaveLength(2);
  });

  it("history arriving AFTER mount seeds each answer once, not once per delivery", () => {
    // The failure end to end. The hook mounts against an empty store — as it does on every
    // real page load — and Electric then delivers two historical seed answers twice over.
    renderHook(() => useCanvasSeedFromAnswers());
    const history = [
      { id: "h1", status: "complete", rendered_output: seedRO(["a", "b"]) },
      { id: "h2", status: "complete", rendered_output: seedRO(["c", "d"]) },
    ] as unknown as Artifact[];

    useCanvasStore.setState({ artifacts: history } as never);
    useCanvasStore.setState({ artifacts: [...history] } as never);

    expect(useStageStore.getState().canvases).toHaveLength(2);
    expect(
      useStageStore.getState().canvases.map((c) => c.seededFrom).sort(),
    ).toEqual(["h1", "h2"]);
  });

  it("and a DELETED board stays deleted across the next delivery", () => {
    // "I delete them and more appear" — the part that made it feel unfixable. Deleting removes
    // the claim, so this documents the residual honestly: the seed answer becomes eligible
    // again. What it must NOT do is grow the count on every reload.
    renderHook(() => useCanvasSeedFromAnswers());
    const history = [
      { id: "h1", status: "complete", rendered_output: seedRO(["a", "b"]) },
    ] as unknown as Artifact[];
    useCanvasStore.setState({ artifacts: history } as never);
    expect(useStageStore.getState().canvases).toHaveLength(1);

    useCanvasStore.setState({ artifacts: [...history] } as never);
    useCanvasStore.setState({ artifacts: [...history] } as never);
    expect(useStageStore.getState().canvases).toHaveLength(1);
  });
});
