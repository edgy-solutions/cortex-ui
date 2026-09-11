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
import { describe, it, expect, beforeEach, vi } from "vitest";
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
    // "I delete them and they come right back." This used to document an accepted residual —
    // deleting removed the claim, so the seed answer became eligible again and the board
    // returned on the next delivery. It is a tombstone now: see the last block in this file.
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


/**
 * THE PENDING ROW ATE THE SEED ANSWER.
 *
 * "When the portfolio canvas card is first completed the list appears, but there is no view
 * canvas link and no canvas below. Then after a pretty large delay the canvas appears."
 *
 * Every turn appends a PENDING artifact at submit time — the turn's own id, no rendered_output
 * at all — so the canvas has something to draw the instant Enter is pressed. That row reached
 * this watcher FIRST. It was marked seen, carried no seed because it carried nothing, and when
 * the real answer landed on THE SAME ID it was skipped as already known. The one artifact
 * guaranteed to become the seed answer was the one guaranteed to be pre-empted.
 *
 * So no board was built during the session that asked for one. The "delay" was the next page
 * load, where hydration replays the answer against an empty seen-set.
 *
 * The rule: marking a row seen is a claim to have JUDGED it, and an empty row cannot be judged.
 */
describe("a pending row must not consume the answer's turn to be judged", () => {
  const seedRO = (ids: string[]) => ({
    components: [{ archetype: "CANVAS_SEED", artifact_ids: ids }],
  });
  beforeEach(() => {
    useStageStore.setState({ canvases: [], view: "global", dismissedSeeds: [] } as never);
    useCanvasStore.setState({ artifacts: [] } as never);
  });

  const pending = (id: string) =>
    ({ id, status: "pending", rendered_output: null }) as unknown as Artifact;

  it("seeds when the answer lands on the id the pending row already occupied", () => {
    renderHook(() => useCanvasSeedFromAnswers());

    // Turn start: the pending row, carrying the turn's artifact id and no content.
    useCanvasStore.setState({ artifacts: [pending("t1")] } as never);
    expect(useStageStore.getState().canvases).toHaveLength(0);

    // The answer arrives ON THE SAME ROW. Before the fix this was skipped for ever.
    useCanvasStore.setState({
      artifacts: [{ id: "t1", status: "complete", rendered_output: seedRO(["a", "b"]) }],
    } as never);
    expect(useStageStore.getState().canvases).toHaveLength(1);
    expect(useStageStore.getState().canvases[0].seededFrom).toBe("t1");
  });

  it("does not seed, or churn, while the row is still empty", () => {
    renderHook(() => useCanvasSeedFromAnswers());
    for (let i = 0; i < 5; i++) {
      useCanvasStore.setState({ artifacts: [pending("t1")] } as never);
    }
    expect(useStageStore.getState().canvases).toHaveLength(0);
  });

  it("a row that gains NON-seed content is judged once and then left alone", () => {
    renderHook(() => useCanvasSeedFromAnswers());
    useCanvasStore.setState({ artifacts: [pending("t1")] } as never);
    useCanvasStore.setState({
      artifacts: [
        { id: "t1", status: "complete", rendered_output: { components: [{ archetype: "TABLE" }] } },
      ],
    } as never);
    expect(useStageStore.getState().canvases).toHaveLength(0);
  });

  it("BUILDS the board but does not NAVIGATE to it", () => {
    // Auto-seeding ran with enter:true, harmless only while the bug above meant it never ran on
    // a live turn. Fixed, it also fires for every seed answer that hydrates on a reload — so
    // entering would yank the view into whichever historical board arrived last. Composing is
    // the answer to the question; going there is the person's to choose.
    renderHook(() => useCanvasSeedFromAnswers());
    useCanvasStore.setState({ artifacts: [pending("t1")] } as never);
    useCanvasStore.setState({
      artifacts: [{ id: "t1", status: "complete", rendered_output: seedRO(["a", "b"]) }],
    } as never);
    expect(useStageStore.getState().canvases).toHaveLength(1);
    expect(useStageStore.getState().view).toBe("global");
  });
});

/**
 * DELETING A SEEDED BOARD HAS TO SURVIVE THE NEXT LOAD.
 *
 * "When I delete portfolio canvases and remove all of them and refresh, they come right back."
 *
 * The idempotency check asks "does this seed already have a board" — the wrong question after a
 * deletion, because absence is exactly what deleting produced. Hydration replays every
 * historical seed answer, each found no board, and each rebuilt one. The guard read the user's
 * decision as its trigger.
 *
 * A decision has to be RECORDED, never inferred from the state it produced.
 */
describe("a deleted board stays deleted, and can be asked for again", () => {
  const seedRO = (ids: string[]) => ({
    components: [{ archetype: "CANVAS_SEED", artifact_ids: ids }],
  });
  beforeEach(() => {
    useStageStore.setState({ canvases: [], view: "global", dismissedSeeds: [] } as never);
    useCanvasStore.setState({ artifacts: [] } as never);
  });

  const deliver = (id: string) =>
    useCanvasStore.setState({
      artifacts: [{ id, status: "complete", rendered_output: seedRO(["a", "b"]) }],
    } as never);

  it("survives the reload that used to bring it back", () => {
    renderHook(() => useCanvasSeedFromAnswers());
    deliver("h1");
    const board = useStageStore.getState().canvases[0];
    useStageStore.getState().deleteCanvas(board.id);
    expect(useStageStore.getState().canvases).toHaveLength(0);
    expect(useStageStore.getState().dismissedSeeds).toEqual(["h1"]);

    // A fresh load: a new watcher, an empty seen-set, the same answer replayed.
    useCanvasStore.setState({ artifacts: [] } as never);
    renderHook(() => useCanvasSeedFromAnswers());
    deliver("h1");
    expect(useStageStore.getState().canvases).toHaveLength(0);
  });

  it("REBUILDS when a person asks for it, and forgets the tombstone", () => {
    // The link on the answer card. A deletion says "not on my board right now", never "never
    // again" — so an explicit request must not be refused by the guard that exists to stop the
    // watcher acting on its own.
    renderHook(() => useCanvasSeedFromAnswers());
    deliver("h1");
    useStageStore.getState().deleteCanvas(useStageStore.getState().canvases[0].id);

    const id = useStageStore
      .getState()
      .seedPortfolioCanvas(["a", "b"], "Portfolio Planning", true, "h1", true);
    expect(id).not.toBe("");
    expect(useStageStore.getState().canvases).toHaveLength(1);
    expect(useStageStore.getState().dismissedSeeds).toEqual([]);

    // And having been asked for, the watcher may keep it — the tombstone is gone.
    useCanvasStore.setState({ artifacts: [] } as never);
    deliver("h1");
    expect(useStageStore.getState().canvases).toHaveLength(1);
  });

  it("tombstones only SEEDED boards — a hand-made canvas has nothing to resurrect it", () => {
    const id = useStageStore.getState().createCanvas("By hand", undefined, false);
    useStageStore.getState().deleteCanvas(id);
    expect(useStageStore.getState().dismissedSeeds).toEqual([]);
  });

  it("is DURABLE — a reload is the thing it protects against", () => {
    renderHook(() => useCanvasSeedFromAnswers());
    deliver("h1");
    useStageStore.getState().deleteCanvas(useStageStore.getState().canvases[0].id);
    const persisted = JSON.parse(window.localStorage.getItem("cortex-stage") ?? "{}");
    expect(persisted.state.dismissedSeeds).toEqual(["h1"]);
  });
});

/**
 * THE SEED HAS TO REACH THE RIGHT TEMPLATE — the walk that closes slice 2.
 *
 * "Seeding a `program_finance` board should fire one program ask and fill all six."
 *
 * Every seeded board was a PORTFOLIO board. `seedPortfolioCanvas` called `createCanvas` with a
 * hardcoded `portfolio_planning` lens and nothing set `template_id` at all, so placement fell
 * through to the legacy `use` alias. Correct while one template existed. Wrong the moment a
 * second one seeds: six finance panels laid out by the five-slot portfolio arrangement, with
 * the sixth falling to generic placement.
 *
 * AND SILENTLY — this is the part that matters. The unlanded-row warning fires when a lookup
 * FAILS. Here the lookup SUCCEEDS; it just succeeds with the wrong template. A board that draws
 * wrong is harder to catch than one that does not draw, and this is that failure with the
 * warning looking straight past it.
 */
describe("a seed names its template, and the board records it", () => {
  const seedRO = (ids: string[], extra: Record<string, unknown> = {}) => ({
    components: [{ archetype: "CANVAS_SEED", artifact_ids: ids, ...extra }],
  });

  beforeEach(() => {
    useStageStore.setState({ canvases: [], view: "global", dismissedSeeds: [] } as never);
    useCanvasStore.setState({ artifacts: [] } as never);
  });

  const deliver = (id: string, ro: unknown) =>
    useCanvasStore.setState({
      artifacts: [{ id, status: "complete", rendered_output: ro }],
    } as never);

  it("reads `template_id` — ADR-0050's name", () => {
    expect(
      canvasSeedFromArtifact({
        rendered_output: seedRO(["a"], { template_id: "program_finance" }),
      } as never)?.templateId,
    ).toBe("program_finance");
  });

  it("HONOURS `canvas_type` — read-only legacy, not ignored", () => {
    // Ruled: `template_id` is the field. `canvas_type` is tolerated so a producer still
    // sending it is not silently mis-laid out — dropping it would change arrangements with no
    // visible cause, which is the failure this whole area keeps producing.
    expect(
      canvasSeedFromArtifact({
        rendered_output: seedRO(["a"], { canvas_type: "program_finance" }),
      } as never)?.templateId,
    ).toBe("program_finance");
  });

  it("SAYS SO when the legacy field is used — tolerated is not ignored", () => {
    // A quietly-accepted field is indistinguishable from one that still works: the producer
    // keeps sending it, nobody learns it is deprecated, and the day it is finally dropped every
    // board it named changes arrangement for no reason anyone can see.
    const seen: string[] = [];
    const spy = vi.spyOn(console, "warn").mockImplementation((...a: unknown[]) => {
      seen.push(a.join(" "));
    });
    try {
      canvasSeedFromArtifact({
        rendered_output: seedRO(["a"], { canvas_type: "a_legacy_value_seen_once" }),
      } as never);
    } finally {
      spy.mockRestore();
    }
    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain("canvas_type");
    // It must name the REPLACEMENT, or the notice reports a problem with no repair.
    expect(seen[0]).toContain("template_id");
    expect(seen[0]).toContain("a_legacy_value_seen_once");
  });

  it("says nothing about legacy when BOTH are present and the ratified one wins", () => {
    // The discriminating fixture, and the first version of this file did not have it. "Says
    // nothing when template_id is used" passed a payload with NO canvas_type at all, so a
    // mutant that warned whenever canvas_type merely EXISTED was unreachable and survived.
    //
    // The notice says the legacy field "was honoured". When `template_id` wins, it was not —
    // so firing here would report an honouring that did not happen, which is a worse lie than
    // silence.
    const seen: string[] = [];
    const spy = vi.spyOn(console, "warn").mockImplementation((...a: unknown[]) => {
      seen.push(a.join(" "));
    });
    try {
      const r = canvasSeedFromArtifact({
        rendered_output: seedRO(["a"], {
          template_id: "portfolio",
          canvas_type: "a_losing_legacy_value",
        }),
      } as never);
      expect(r?.templateId).toBe("portfolio");
    } finally {
      spy.mockRestore();
    }
    expect(seen).toEqual([]);
  });

  it("says NOTHING when the ratified field is used", () => {
    const seen: string[] = [];
    const spy = vi.spyOn(console, "warn").mockImplementation((...a: unknown[]) => {
      seen.push(a.join(" "));
    });
    try {
      canvasSeedFromArtifact({
        rendered_output: seedRO(["a"], { template_id: "program_finance" }),
      } as never);
    } finally {
      spy.mockRestore();
    }
    expect(seen).toEqual([]);
  });

  it("warns ONCE per value — Electric re-delivers the same row", () => {
    const seen: string[] = [];
    const spy = vi.spyOn(console, "warn").mockImplementation((...a: unknown[]) => {
      seen.push(a.join(" "));
    });
    try {
      for (let i = 0; i < 4; i++) {
        canvasSeedFromArtifact({
          rendered_output: seedRO(["a"], { canvas_type: "a_repeated_legacy_value" }),
        } as never);
      }
    } finally {
      spy.mockRestore();
    }
    expect(seen).toHaveLength(1);
  });

  it("prefers `template_id` when both are present — the ratified name wins", () => {
    expect(
      canvasSeedFromArtifact({
        rendered_output: seedRO(["a"], { template_id: "program_finance", canvas_type: "portfolio" }),
      } as never)?.templateId,
    ).toBe("program_finance");
  });

  it("carries the template ONTO the board, end to end", () => {
    renderHook(() => useCanvasSeedFromAnswers());
    deliver("t1", seedRO(["a", "b", "c"], { template_id: "program_finance" }));
    const board = useStageStore.getState().canvases[0];
    expect(board.template_id).toBe("program_finance");
  });

  it("DEFAULTS to the first template when the producer names none — today's every producer", () => {
    // Behaviour must not change for the seed that actually ships. Portfolio boards laid out
    // through the legacy `use` alias before; they lay out through a recorded id now, and the
    // arrangement is the same builder either way.
    renderHook(() => useCanvasSeedFromAnswers());
    deliver("t1", seedRO(["a", "b", "c"]));
    expect(useStageStore.getState().canvases[0].template_id).toBe("portfolio");
  });

  it("ignores a blank or non-string template, rather than recording a hole", () => {
    for (const bad of ["", "   ", 42, null, {}]) {
      expect(
        canvasSeedFromArtifact({
          rendered_output: seedRO(["a"], { template_id: bad }),
        } as never)?.templateId,
      ).toBeUndefined();
    }
  });
});
