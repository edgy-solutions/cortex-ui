/**
 * THE ONE GATE EVERY ANSWER BODY GOES THROUGH, AND WHAT IT IS ALLOWED TO CHANGE.
 *
 * A generalist answer — `routing.fallback === true` — used to render the identical confident card
 * a specialist produces. The honest sentence already existed, in `presentFallbackReason`, and its
 * only reader was a HUD panel somebody has to go and open. A disclosure nobody opens is not a
 * disclosure, so it moved onto the body, and the body became one component because there are five
 * artifact-fed mounts and gating "the" call site would have gated a fifth of the surface.
 *
 * ── WHY THE INTERPRETER IS MOCKED HERE, WHICH IS NOT THE USUAL CHOICE ─────────────────────
 *
 * The subject is `AnswerBody`'s DECISIONS and its FAITHFULNESS AS A GATEWAY, not how a chart
 * draws. Recording what the renderer was handed is the only instrument that can see the defect
 * this component is most likely to have: accepting a prop and dropping it. Five mounts now depend
 * on a prop surviving one hop, and every source-text census in the repo — `askFold`'s artifactId
 * scan, `askedPick`'s sibling scan, `StageCard.persona`'s count — is satisfied by a gateway that
 * takes `hidePersona` and forwards nothing. Those seals constrain the MOUNTS; this one constrains
 * the hop they now all go through, and without it the invariant they assert is unenforced.
 *
 * The mock's prop NAMES are cross-checked against the real component below, so the recorder
 * cannot drift into agreeing with itself about a prop that no longer exists.
 */
import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Artifact } from "@/api/types";

/** Every prop the renderer was handed, per mount, in order. */
const handed: Record<string, unknown>[] = [];

vi.mock("@/components/registry/SemanticInterpreter", () => ({
  SemanticInterpreter: (props: Record<string, unknown>) => {
    handed.push(props);
    const payload = props.payload as { components?: unknown[] } | undefined;
    return (
      <div data-interpreter data-component-count={payload?.components?.length ?? 0}>
        interpreter
      </div>
    );
  },
}));

const { AnswerBody } = await import("./AnswerBody");

beforeEach(() => {
  handed.length = 0;
});
afterEach(cleanup);

const comp = (archetype: string) => ({ archetype, data: {} });

const artifactOf = (over: Record<string, unknown> = {}) =>
  ({
    id: "artifact-1",
    question_text: "what is the cost variance on the Aurora program?",
    summary: "",
    routing: null,
    ...over,
  }) as unknown as Artifact;

/** The reason on the real capture — `sessions/2026-09-19-payload-finance-performance-indices.json`. */
const FELL_BACK = { fallback: true, fallback_reason: "no_verb_classified" };

const disclosure = () => document.querySelector("[data-fallback-disclosure]");
const interpreter = () => document.querySelector("[data-interpreter]");

describe("a specialist answer is untouched", () => {
  it("draws the interpreter and NOTHING else — not even a wrapper", () => {
    /*
      THE ARM THAT PROTECTS EVERY OTHER CARD IN THE APP. This gate is now on all five mounts, so a
      wrapper div added unconditionally changes the layout of every answer ever rendered. The claim
      is that a non-fallback answer gets byte-for-byte the previous tree: the interpreter, returned
      bare, with no disclosure and no `data-answer-body` around it.
    */
    const { container } = render(
      <AnswerBody artifact={artifactOf({ routing: { decision: "routed" } })} components={[comp("CHART_WIDGET")]} />,
    );
    expect(disclosure()).toBeNull();
    expect(document.querySelector("[data-answer-body]")).toBeNull();
    expect(container.firstElementChild).toBe(interpreter());
    // And the payload arrived whole.
    expect(interpreter()?.getAttribute("data-component-count")).toBe("1");
  });

  it("is untouched when routing is absent entirely, which is most of the record", () => {
    // A row written before the flag existed has no routing at all. It must not acquire a
    // disclosure — see `fallbackDisclosure.test.ts` for why absence is not a fallback.
    render(<AnswerBody artifact={artifactOf()} components={[comp("ASSET_STATE_METRIC")]} />);
    expect(disclosure()).toBeNull();
    expect(interpreter()?.getAttribute("data-component-count")).toBe("1");
  });
});

describe("a generalist answer says so, and does not draw the confident card", () => {
  it("renders the sentence and withholds the component that claims an answer", () => {
    // The overnight order, verbatim: the sentence, never the confident card.
    render(
      <AnswerBody
        artifact={artifactOf({ routing: FELL_BACK })}
        components={[comp("ASSET_STATE_METRIC")]}
      />,
    );
    expect(disclosure()).not.toBeNull();
    // The metric is not drawn AT ALL — the interpreter is not even mounted, because an empty one
    // draws its own chrome around nothing.
    expect(interpreter()).toBeNull();
    expect(handed).toHaveLength(0);
  });

  it("carries the producer's reason onto the element, for the HUD and for a walk", () => {
    render(<AnswerBody artifact={artifactOf({ routing: FELL_BACK })} components={[]} />);
    expect(disclosure()?.getAttribute("data-fallback-reason")).toBe("no_verb_classified");
    // And a title was drawn — the words are `presentFallbackReason`'s, asserted in the lib seal.
    expect(document.querySelector("[data-fallback-title]")?.textContent?.length).toBeGreaterThan(0);
  });

  it("COUNTS what it withheld and says where it still is", () => {
    // Named, never dropped. A body that quietly loses components is indistinguishable from a
    // payload that never had them, and the reader has no way to find out otherwise.
    render(
      <AnswerBody
        artifact={artifactOf({ routing: FELL_BACK })}
        components={[comp("CHART_WIDGET"), comp("KNOWLEDGE_DOCUMENT")]}
      />,
    );
    const said = document.querySelector("[data-fallback-withheld]");
    expect(said?.getAttribute("data-fallback-withheld")).toBe("2");
    expect(said?.textContent).toMatch(/2 composed components/);
    // Where they went, so the count is actionable rather than an apology.
    expect(said?.textContent).toMatch(/payload panel/);
    expect(said?.textContent).toMatch(/export/);
  });

  it("says NOTHING about withholding when there was nothing to withhold", () => {
    // The near side. A count line under every fallback, reading "0 components", is the kind of
    // always-present line a reader learns to skip.
    render(<AnswerBody artifact={artifactOf({ routing: FELL_BACK })} components={[comp("ELICITATION")]} />);
    expect(document.querySelector("[data-fallback-withheld]")).toBeNull();
  });

  it("still draws the ASK, which is the payload this was measured on", () => {
    /*
      ⛔ THE ARM THAT RULED OUT THE OBVIOUS RULE. The captured payload is `fallback: true` with a
      composed ELICITATION, so "hide the body under a fallback" would have hidden the menu the
      reader is meant to answer — on the arc repaired the same morning. The disclosure and the ask
      appear TOGETHER, which is the whole shape.
    */
    render(<AnswerBody artifact={artifactOf({ routing: FELL_BACK })} components={[comp("ELICITATION")]} />);
    expect(disclosure()).not.toBeNull();
    expect(interpreter()).not.toBeNull();
    expect(interpreter()?.getAttribute("data-component-count")).toBe("1");
  });

  it("splits a mixed payload — the ask is drawn, the metric is counted", () => {
    render(
      <AnswerBody
        artifact={artifactOf({ routing: FELL_BACK })}
        components={[comp("ASSET_STATE_METRIC"), comp("ELICITATION")]}
      />,
    );
    expect(interpreter()?.getAttribute("data-component-count")).toBe("1");
    expect(document.querySelector("[data-fallback-withheld]")?.getAttribute("data-fallback-withheld")).toBe("1");
    // The interpreter was handed the ask alone, not the whole payload with a note.
    const payload = handed[0].payload as { components: { archetype: string }[] };
    expect(payload.components.map((c) => c.archetype)).toEqual(["ELICITATION"]);
  });
});

describe("the generalist's words are its own, or there are none", () => {
  it("quotes a captured summary", () => {
    render(
      <AnswerBody
        artifact={artifactOf({ routing: FELL_BACK, summary: "No cost variance data was found." })}
        components={[]}
      />,
    );
    expect(document.querySelector("[data-fallback-words]")?.textContent).toBe(
      "No cost variance data was found.",
    );
  });

  it("does NOT echo the question back where the answer goes", () => {
    /*
      `answerSummary` falls back to `question_text`, which is correct for a LABEL in a list and a
      lie here: it would print the reader's own question in the position reserved for what the
      generalist said. `hasCapturedSummary` is the discriminator that already exists for exactly
      this distinction, so an uncaptured summary renders nothing at all.
    */
    render(
      <AnswerBody artifact={artifactOf({ routing: FELL_BACK, summary: "  " })} components={[]} />,
    );
    expect(document.querySelector("[data-fallback-words]")).toBeNull();
    expect(disclosure()?.textContent).not.toContain("what is the cost variance");
  });
});

describe("the gateway forwards what it was given", () => {
  /**
   * ⛔ EVERY CENSUS IN THE REPO IS SATISFIED BY A GATEWAY THAT DROPS THE PROP.
   *
   * `askFold` asserts each mount carries `artifact`; `StageCard.persona` counts that each mount
   * says `hidePersona`. Both are now claims about the MOUNT and say nothing about the hop. A
   * component that accepted both and forwarded neither would leave all of them green while the
   * ask lost its lineage — `answeringArtifactBody()` returns `{}` on a falsy id, so the pick
   * arrives well-formed with no claim on it, which is the gateway defect already observed once —
   * and the persona drew twice on every card. So the hop is asserted here, per prop.
   */
  it("threads the artifact's id, so a pick keeps its lineage", () => {
    render(<AnswerBody artifact={artifactOf({ id: "artifact-77" })} components={[comp("ELICITATION")]} />);
    expect(handed[0].artifactId).toBe("artifact-77");
  });

  it("threads it under a FALLBACK too, which is the branch that renders the ask", () => {
    // The disclosed branch builds its own tree, so it is a second chance to lose the prop — and
    // it is the branch where an ELICITATION is most likely to be the only thing drawn.
    render(
      <AnswerBody artifact={artifactOf({ id: "artifact-88", routing: FELL_BACK })} components={[comp("ELICITATION")]} />,
    );
    expect(handed[0].artifactId).toBe("artifact-88");
  });

  it("forwards hidePersona, both ways", () => {
    // Both ways on purpose: forwarding a hardcoded `true` would satisfy the card's count and
    // silently delete the badge from the pane and the pinned answer, which have no eyebrow and
    // for which it is the only attribution there is.
    render(<AnswerBody artifact={artifactOf()} components={[comp("ELICITATION")]} hidePersona />);
    expect(handed[0].hidePersona).toBe(true);
    cleanup();
    handed.length = 0;
    render(<AnswerBody artifact={artifactOf()} components={[comp("ELICITATION")]} />);
    expect(handed[0].hidePersona).toBeFalsy();
  });

  it("forwards previewRows, which is what makes a preview a preview", () => {
    render(<AnswerBody artifact={artifactOf()} components={[comp("ELICITATION")]} previewRows={3} />);
    expect(handed[0].previewRows).toBe(3);
  });

  it("and the props it forwards are the ones the real component declares", () => {
    /*
      THE MOCK'S ONLY WEAKNESS, CLOSED. Everything above is recorded through a stand-in, so a prop
      renamed on the real renderer would leave these arms green and the app broken. Asserted on the
      renderer's own destructuring, which is one line and is where the names live.
    */
    const INTERP = readFileSync(
      path.join(__dirname, "../registry/SemanticInterpreter.tsx"),
      "utf8",
    );
    const sig = INTERP.slice(INTERP.indexOf("export const SemanticInterpreter"));
    const destructured = sig.slice(0, sig.indexOf(") =>"));
    for (const prop of ["payload", "artifactId", "hidePersona", "previewRows"]) {
      expect(destructured, `${prop} is not a prop of SemanticInterpreter`).toContain(prop);
    }
  });
});
