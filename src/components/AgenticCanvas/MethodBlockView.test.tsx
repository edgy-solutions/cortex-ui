/**
 * SEALS ON THE METHOD BLOCK, DRAWN ON THE CARD.
 *
 * `cardExport.test.tsx` seals `readMethod` and `readArtifactMethod` as pure functions. This file
 * seals the other half: what `MethodBlockView` draws for each of the three `ArtifactMethod`
 * states, and — because the card's rule is "only when nothing about this answer was withheld" —
 * the integration through `AnswerBody`, mocking `SemanticInterpreter` the same way
 * `answerBody.test.tsx` does, so a heavy archetype renderer never has to mount for a seal that is
 * about the method block, not about the chart beside it.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import type { Artifact } from "@/api/types";
import {
  ABSENT_MARK,
  METHOD_ABSENT_SENTENCE,
  NOT_STATED_MARK,
  type ArtifactMethod,
  type MethodBlock,
} from "@/lib/cardExport";
import PACKET_METHOD_CAPTURE from "@/lib/methodBlockPacketCapture.json";
import { MethodBlockView } from "./MethodBlockView";

vi.mock("@/components/registry/SemanticInterpreter", () => ({
  SemanticInterpreter: () => <div data-interpreter>interpreter</div>,
}));

const { AnswerBody } = await import("./AnswerBody");

afterEach(cleanup);

const comp = (over: Record<string, unknown> = {}) => ({ archetype: "CHART_WIDGET", ...over });

const artifactOf = (over: Record<string, unknown> = {}) =>
  ({
    id: "artifact-1",
    question_text: "q",
    summary: "",
    routing: null,
    rendered_output: { components: [] },
    ...over,
  }) as unknown as Artifact;

const FELL_BACK = { fallback: true, fallback_reason: "no_verb_classified" };

const baseBlock = (over: Partial<MethodBlock> = {}): MethodBlock => ({
  formula: "f",
  inputs: [{ name: "x", value: 1, unit: null }],
  bound: null,
  boundUnreadable: null,
  bound_defaulted: null,
  producer_sha: null,
  ...over,
});

const present = (block: MethodBlock): ArtifactMethod => ({
  state: "present",
  block,
  level: "component",
});

describe("absent draws nothing", () => {
  it("renders null, and no data-cx-method attribute appears anywhere", () => {
    const { container } = render(<MethodBlockView method={{ state: "absent" }} />);
    expect(container.innerHTML).toBe("");
    expect(document.querySelector("[data-cx-method]")).toBeNull();
  });
});

describe("unreadable is drawn, distinctly from absent", () => {
  it("draws the sentence plus the not-readable note, under data-cx-method=\"unreadable\"", () => {
    render(<MethodBlockView method={{ state: "unreadable", level: "component" }} />);
    const el = document.querySelector('[data-cx-method="unreadable"]');
    expect(el).not.toBeNull();
    expect(el?.textContent).toContain(METHOD_ABSENT_SENTENCE);
    expect(el?.textContent).toContain("(sent, but not readable as a method block)");
  });
});

describe("bound — three branches, keyed on presence not truthiness", () => {
  it("0 draws the digit \"0\", never the absent mark", () => {
    render(<MethodBlockView method={present(baseBlock({ bound: 0 }))} />);
    expect(document.body.textContent).toContain("bound: 0");
    expect(document.body.textContent).not.toMatch(new RegExp(`bound: ${ABSENT_MARK}`));
  });

  it("an unreadable bound draws its own note, not absent and not the raw number branch", () => {
    render(
      <MethodBlockView method={present(baseBlock({ bound: null, boundUnreadable: "|x| >= 5" }))} />,
    );
    expect(document.body.textContent).toContain("|x| >= 5");
    expect(document.body.textContent).toContain("not a number");
  });

  it("neither stated: the absent mark", () => {
    render(<MethodBlockView method={present(baseBlock())} />);
    expect(document.body.textContent).toMatch(new RegExp(`bound: ${ABSENT_MARK}`));
  });
});

describe("bound_defaulted — three states, each its own text", () => {
  it("true: the producer's own default", () => {
    render(<MethodBlockView method={present(baseBlock({ bound_defaulted: true }))} />);
    expect(document.body.textContent).toContain("the producer's own default");
  });

  it("false: chosen by the caller", () => {
    render(<MethodBlockView method={present(baseBlock({ bound_defaulted: false }))} />);
    expect(document.body.textContent).toContain("chosen by the caller");
  });

  it("null: NOT_STATED_MARK", () => {
    render(<MethodBlockView method={present(baseBlock({ bound_defaulted: null }))} />);
    expect(document.body.textContent).toContain(NOT_STATED_MARK);
  });
});

/**
 * THE PRODUCER'S EXECUTED `model_dump`, RENDERED THROUGH THE REAL GATEWAY.
 *
 * `methodBlockPacketCapture.json` is ca's own dump, carried in cardExport.test.tsx's seals on
 * `readMethod`. This is the same fixture, this time read by `readArtifactMethod` as a
 * COMPONENT-LEVEL `method` key and drawn by `MethodBlockView`, mounted the way a real answer
 * mounts it: through `AnswerBody`, on a single component, with no fallback in the way.
 */
describe("the producer's executed model_dump, through AnswerBody", () => {
  it("draws every field the dump states, and both absences by their own words", () => {
    render(
      <AnswerBody
        artifact={artifactOf()}
        components={[comp({ method: PACKET_METHOD_CAPTURE })]}
      />,
    );
    const root = document.querySelector('[data-cx-method="present"]');
    expect(root).not.toBeNull();

    expect(document.querySelector("[data-cx-method-formula]")?.textContent).toBe(
      "share = value / total",
    );

    const rows = document.querySelectorAll("[data-cx-method-inputs] tbody tr");
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain("total purchased value");
    expect(rows[0].textContent).toContain("1475520");
    expect(rows[0].textContent).toContain("USD");
    expect(rows[1].textContent).toContain("lot");
    expect(rows[1].textContent).toContain("4");
    expect(rows[1].textContent).toContain(ABSENT_MARK);

    expect(root?.textContent).toMatch(new RegExp(`bound: ${ABSENT_MARK}`));
    expect(root?.textContent).toContain(`bound_defaulted: ${NOT_STATED_MARK}`);
    expect(document.querySelector("[data-cx-method-producer-sha]")?.textContent).toContain(
      "abc1234",
    );
  });
});

/**
 * THE THREE FALLBACK CASES (spec section 3): a method is the provenance of a figure, and a
 * figure that was withheld under a fallback disclosure must not have its method drawn either —
 * at EITHER level, because `AnswerBody`'s single-component gate means a component-level method
 * is always about the one component `withheld` counts.
 */
describe("fallback withholding reaches the method block", () => {
  it("a withheld component's own method is not drawn", () => {
    render(
      <AnswerBody
        artifact={artifactOf({ routing: FELL_BACK })}
        components={[comp({ archetype: "ASSET_STATE_METRIC", method: PACKET_METHOD_CAPTURE })]}
      />,
    );
    // ASSET_STATE_METRIC claims an answer, so under a fallback it is withheld, not drawn.
    expect(document.querySelector("[data-fallback-withheld]")).not.toBeNull();
    expect(document.querySelector("[data-cx-method]")).toBeNull();
  });

  it("an envelope-level method is not drawn when ANY component was withheld, even if others show", () => {
    render(
      <AnswerBody
        artifact={artifactOf({
          routing: FELL_BACK,
          rendered_output: { components: [], method: PACKET_METHOD_CAPTURE },
        })}
        components={[comp({ archetype: "ASSET_STATE_METRIC" }), comp({ archetype: "ELICITATION" })]}
      />,
    );
    // The elicitation renders (it asks rather than claims); the metric is withheld and counted.
    expect(document.querySelector("[data-interpreter]")).not.toBeNull();
    expect(document.querySelector("[data-fallback-withheld]")?.getAttribute(
      "data-fallback-withheld",
    )).toBe("1");
    // The envelope DID carry a readable method, but nothing may draw it: one component of this
    // answer did not render, so the envelope's account of "how it was computed" is not drawable.
    expect(document.querySelector("[data-cx-method]")).toBeNull();
  });

  it("control: the same envelope-level method DOES draw when nothing was withheld", () => {
    render(
      <AnswerBody
        artifact={artifactOf({ rendered_output: { components: [], method: PACKET_METHOD_CAPTURE } })}
        components={[comp({ archetype: "ELICITATION" })]}
      />,
    );
    expect(document.querySelector("[data-fallback-withheld]")).toBeNull();
    expect(document.querySelector('[data-cx-method="present"]')).not.toBeNull();
  });
});
