/**
 * A STAGE THIS FILE HAS NEVER HEARD OF MUST STILL BE DRAWN.
 *
 * ── WHAT WAS WRONG, AND WHY NOTHING WOULD HAVE REPORTED IT ────────────────────────────────
 *
 * The stage list was built by mapping the canonical five and looking arriving steps up BY KIND.
 * A step whose kind was not one of the five was not mis-drawn and did not raise anything — it
 * was DROPPED, while five invented rows carried on showing one stuck `loading` and four
 * `pending`. A turn on any other path renders as a slow classic turn, forever, and the only
 * symptom is a progress bar that never moves.
 *
 * That became live work when the direct route path landed with THREE stages. The count is the
 * point: there is no classifying or planning stage on that path because neither RUNS — the
 * subject and verb came from an ask the person already answered — so a client that draws five
 * is claiming success for work nobody did.
 *
 * ── WHAT IS ASSERTED, AND WHAT IS DELIBERATELY NOT ────────────────────────────────────────
 *
 * The rule is vocabulary-free: render what arrived, in arrival order. So the tests use INVENTED
 * kinds, not the three real ones. Pinning the real names here would make this a test of a
 * protocol that has not shipped, and would go green for a spelling rather than for the property
 * — and the property is the whole point, because the next path added will not be in any list
 * this file could hold either.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { deriveStages } from "./useLiveStages";
import { useInterviewStore } from "@/store/useInterviewStore";
import type { ThinkingStep } from "@/store/useInterviewStore";
import { PIPELINE_STAGES } from "@/api/types";

type Status = ThinkingStep["status"];

/**
 * FIXTURES ARE BUILT BY THE REAL STORE, never by a hand-written copy of it.
 *
 * Written the other way first, and a mutation survey found it immediately: `seed()` was a
 * literal that mirrored `primePipelineStages`, so DELETING the `seeded: true` marker from the
 * store — and deleting the clearing of it in `upsertThinkingStep` — left every test here green
 * while the real path broke. The tests were checking the fixture, not the code.
 *
 * That is the same failure the LangGraph lane hit in the same hour, from the other direction:
 * a projector-coverage test that built its materialization from a hand-written kwarg list and
 * so kept passing when a field was dropped from the real dispatch. Both are a check that
 * co-occurs with the behaviour rather than testing it, and the cure is the same — make the
 * subject produce the fixture.
 */
const MSG = "agent-1";

beforeEach(() => {
  useInterviewStore.getState().reset();
  useInterviewStore.getState().addMessage({
    id: MSG,
    role: "agent",
    content: "",
    isStreaming: true,
    timestamp: 0,
  });
});

const stepsNow = (): ThinkingStep[] =>
  useInterviewStore.getState().messages.find((m) => m.id === MSG)?.thinkingSteps ?? [];

/** The canonical five, guessed before the turn has spoken — through the real store. */
function seed(): ThinkingStep[] {
  useInterviewStore.getState().primePipelineStages(MSG);
  return stepsNow();
}

/** A stage the turn actually reported — through the real upsert, in arrival order. */
function report(kind: string, label: string, status: Status): ThinkingStep[] {
  useInterviewStore
    .getState()
    .upsertThinkingStep(MSG, { kind: kind as ThinkingStep["kind"], label, status });
  return stepsNow();
}

describe("the canonical turn is unchanged", () => {
  it("keeps the canonical ORDER and pre-renders the rest, before anything reports", () => {
    // The seed's reason for existing: the panel never appears empty, and the order is stable
    // before every stage has spoken. That is worth more than arrival order while the guess holds.
    const out = deriveStages(seed());
    expect(out.map((s) => s.kind)).toEqual(PIPELINE_STAGES.map((s) => s.kind));
    expect(out[0].status).toBe("loading");
    expect(out[4].status).toBe("pending");
  });

  it("reports canonical statuses in canonical order even when they arrive out of order", () => {
    // `composing` reports before `locating` — arrival order must not reorder the display while
    // the turn is on the path the seed guessed.
    seed();
    const steps = report("composing", "Composing the answer", "done");
    const out = deriveStages(steps);
    expect(out.map((s) => s.kind)).toEqual(PIPELINE_STAGES.map((s) => s.kind));
    expect(out[4].status).toBe("done");
  });
});

describe("a path the canonical list does not know about", () => {
  it("DRAWS the unknown stages rather than dropping them", () => {
    // The defect, stated directly. Before the fix this returned the canonical five and none of
    // these three appeared anywhere.
    seed();
    report("stage_one", "First", "done");
    report("stage_two", "Second", "loading");
    const steps = report("stage_three", "Third", "pending");
    const out = deriveStages(steps);
    expect(out.map((s) => s.kind)).toEqual(["stage_one", "stage_two", "stage_three"]);
    expect(out.map((s) => s.label)).toEqual(["First", "Second", "Third"]);
  });

  it("draws them in ARRIVAL order, not in any order this file holds", () => {
    seed();
    report("zeta", "Zeta", "done");
    const steps = report("alpha", "Alpha", "done");
    expect(deriveStages(steps).map((s) => s.kind)).toEqual(["zeta", "alpha"]);
  });

  it("DROPS the seed's un-taken rows, including the one it left `loading`", () => {
    // The seeded `loading` is the only place the status vocabulary is written with no signal
    // behind it — it exists to show motion instantly. Left in, it renders as a stage that
    // started and never finished, which is a claim about the pipeline that nothing made.
    seed();
    const steps = report("stage_one", "First", "loading");
    const out = deriveStages(steps);
    expect(out).toHaveLength(1);
    expect(out.some((s) => s.kind === "understanding")).toBe(false);
  });

  it("KEEPS a canonical stage that genuinely reported — the fall-back case", () => {
    // Fall-back is not an answer and not an error: the route could not be confirmed and the
    // turn hands off to the full run, whose five-stage stream follows ON THE SAME TURN. Both
    // streams really ran, so both are drawn, in the order they happened. No special case.
    seed();
    report("verify", "Verifying", "done");
    report("handoff", "Handing off", "done");
    // The classic stream then reports over the seeded rows, through the real upsert — which is
    // what clears their seed marking.
    let steps = stepsNow();
    for (const st of PIPELINE_STAGES) steps = report(st.kind, st.label, "done");
    const out = deriveStages(steps);
    expect(out.map((s) => s.kind)).toEqual([
      ...PIPELINE_STAGES.map((s) => s.kind),
      "verify",
      "handoff",
    ]);
    expect(out.every((s) => s.status === "done")).toBe(true);
  });

  it("a turn that reports ONLY unknown stages, with no seed at all", () => {
    report("a", "A", "done");
    const steps = report("b", "B", "loading");
    expect(deriveStages(steps).map((s) => s.kind)).toEqual(["a", "b"]);
  });
});

describe("the count is never assumed", () => {
  it("a three-stage path yields THREE rows, not five", () => {
    // Stated as its own assertion because this is the number a reader will look for, and
    // because a fraction computed over five would show a finished turn at 60%.
    seed();
    report("s1", "One", "done");
    report("s2", "Two", "done");
    const steps = report("s3", "Three", "done");
    expect(deriveStages(steps)).toHaveLength(3);
  });

  it("holds for a count nobody has designed — seven", () => {
    // The property, not the case. A rule keyed to three would pass the test above and fail here.
    seed();
    let steps = stepsNow();
    for (let i = 0; i < 7; i++) steps = report("k" + i, "K" + i, "done");
    expect(deriveStages(steps)).toHaveLength(7);
  });

  it("an empty turn draws the canonical pre-render, not nothing", () => {
    // The guard on the other side: `offPath` is false for an empty list, so this must stay the
    // seeded five rather than collapsing to an empty strip.
    expect(deriveStages([])).toHaveLength(PIPELINE_STAGES.length);
  });
});
