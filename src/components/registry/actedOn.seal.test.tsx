/**
 * AN ANSWER NOTHING DRAWS IS NOT A MISSING COMPONENT.
 *
 * The registry has had two treatments for a while: a binding declares a `component` (the answer
 * is DRAWN) or a `consumer` (the answer is ACTED ON), never both. Two seals already guard it —
 * every drawn row names a component the interpreter really renders, every acted-on row names a
 * consumer that is really exported.
 *
 * Both passed while CANVAS_SEED rendered a red "UI COMPONENT NOT FOUND" on screen, because
 * neither pins the NEGATIVE. The component seal only looks at drawn rows; the consumer seal only
 * checks a module export. Nothing asserted that an acted-on archetype must not reach the
 * interpreter's not-found branch — so the model gained a category the renderer was never told
 * about, and the one archetype deliberately built without a component was the one that reported
 * itself broken.
 *
 * A `case "CANVAS_SEED"` in the switch would have silenced the symptom and left the next
 * consumer binding free to repeat it exactly. This seals the category instead.
 */
import { describe, it, expect } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { SemanticInterpreter } from "./SemanticInterpreter";
import { ACTED_ON_ARCHETYPES } from "@/registry/actedOnArchetypes";
import { assembleDerivedCapabilities } from "@/registry/assembleCapabilities";
import { useStageStore } from "@/store/useStageStore";

afterEach(() => {
  cleanup();
  useStageStore.setState({ canvases: [] } as never);
});

const NOT_FOUND = /UI COMPONENT NOT FOUND/i;

describe("the interpreter knows the difference between undrawn and missing", () => {
  it("the registry declares at least one acted-on archetype — positive control", () => {
    // Without this the sweep below iterates an empty list and passes forever, which is how a
    // seal quietly stops guarding anything.
    expect(ACTED_ON_ARCHETYPES.size).toBeGreaterThan(0);
    expect([...ACTED_ON_ARCHETYPES]).toContain("CANVAS_SEED");
  });

  it("still reports a genuinely unknown archetype — the alarm must keep working", () => {
    // The seal's other half. Making the not-found branch unreachable would pass every
    // assertion below while destroying the honest signal the branch exists for.
    render(<SemanticInterpreter payload={{ components: [{ archetype: "NOT_A_REAL_THING" }] }} />);
    expect(screen.getByText(NOT_FOUND)).toBeTruthy();
  });

  it("NO acted-on archetype reaches the not-found branch", () => {
    // The law, swept over the registry rather than written against CANVAS_SEED — the next
    // consumer binding is covered the day it is declared, without anyone remembering to.
    for (const archetype of ACTED_ON_ARCHETYPES) {
      cleanup();
      render(
        <SemanticInterpreter
          payload={{ components: [{ archetype, artifact_ids: ["a", "b", "c"] }] }}
        />,
      );
      expect(
        screen.queryByText(NOT_FOUND),
        `${archetype} is declared ACTED ON but the interpreter reports it as a missing component`,
      ).toBeNull();
    }
  });

  it("says what the answer IS, and never that the act happened", () => {
    // A seed answer re-read from scrollback places nothing — the consumer primes its seen-set
    // at mount so history cannot re-seed. "Seeded 5 cards onto Portfolio Planning" would be
    // false on exactly the rows most likely to be read.
    //
    // This assertion used to ban the STRING "Portfolio Planning", which was too blunt and
    // would have blocked the receipt from naming the canvas at all. The thing that must not
    // appear is a claim that an act OCCURRED — the past tense, the placement, the effect.
    render(
      <SemanticInterpreter
        payload={{ components: [{ archetype: "CANVAS_SEED", artifact_ids: ["a", "b"] }] }}
      />,
    );
    expect(screen.queryByText(/seeded|placed onto|added to|composed onto/i)).toBeNull();
  });

  it("names the canvas, and marks a default name AS a default", () => {
    // The producer sends no `name` today. Showing the consumer default is honest; showing it
    // as though the seed chose it is not, and the difference is one label.
    render(
      <SemanticInterpreter
        payload={{ components: [{ archetype: "CANVAS_SEED", artifact_ids: ["a"] }] }}
      />,
    );
    expect(screen.getByText(/default name/i)).toBeTruthy();
  });

  it("a payload that DOES carry a name shows it, unmarked", () => {
    // The other half — without it the assertion above passes on a card that always prints
    // "default name" regardless of what arrived.
    render(
      <SemanticInterpreter
        payload={{
          components: [{ archetype: "CANVAS_SEED", artifact_ids: ["a"], name: "Q3 Review" }],
        }}
      />,
    );
    expect(screen.getByText(/Q3 Review/)).toBeTruthy();
    expect(screen.queryByText(/default name/i)).toBeNull();
  });

  it("lists a slot per id, anchor first — the order IS the slot assignment", () => {
    render(
      <SemanticInterpreter
        payload={{ components: [{ archetype: "CANVAS_SEED", artifact_ids: ["x", "y", "z"] }] }}
      />,
    );
    expect(screen.getByText(/anchor/i)).toBeTruthy();
    expect(screen.getByText(/slot 2/i)).toBeTruthy();
    expect(screen.getByText(/slot 3/i)).toBeTruthy();
  });

  it("shows the raw id for an artifact this client does not hold, rather than a label", () => {
    // History not hydrated, or another browser. Inventing a readable name for an id we cannot
    // resolve is the manufactured-confidence failure in miniature.
    render(
      <SemanticInterpreter
        payload={{ components: [{ archetype: "CANVAS_SEED", artifact_ids: ["urn:li:nope"] }] }}
      />,
    );
    expect(screen.getByText("urn:li:nope")).toBeTruthy();
  });

  it("offers the link when a local board holds EXACTLY these artifacts", () => {
    // Positive control for the two negatives below — without it they would pass on a receipt
    // that never offers a link at all.
    useStageStore.setState({
      canvases: [{ id: "cv1", name: "b", items: [{ id: "a", x: 0, y: 0 }, { id: "b", x: 0, y: 0 }] }],
    });
    render(
      <SemanticInterpreter
        payload={{ components: [{ archetype: "CANVAS_SEED", artifact_ids: ["a", "b"] }] }}
      />,
    );
    expect(screen.getByText(/view canvas/i)).toBeTruthy();
  });

  it("does NOT offer a board that merely CONTAINS these artifacts among others", () => {
    // A board holding the five among twenty is a different board. Offering it would send the
    // reader somewhere they did not ask to go, which is worse than offering nothing.
    useStageStore.setState({
      canvases: [
        {
          id: "cv1",
          name: "b",
          items: [
            { id: "a", x: 0, y: 0 },
            { id: "b", x: 0, y: 0 },
            { id: "unrelated", x: 0, y: 0 },
          ],
        },
      ],
    });
    render(
      <SemanticInterpreter
        payload={{ components: [{ archetype: "CANVAS_SEED", artifact_ids: ["a", "b"] }] }}
      />,
    );
    expect(screen.queryByText(/view canvas/i)).toBeNull();
  });

  it("offers NO canvas link when no local board holds exactly these artifacts", () => {
    // Absence means "this client cannot offer a link", never "the seed did not run", so
    // nothing is rendered to mark it.
    render(
      <SemanticInterpreter
        payload={{ components: [{ archetype: "CANVAS_SEED", artifact_ids: ["a", "b"] }] }}
      />,
    );
    expect(screen.queryByText(/view canvas/i)).toBeNull();
  });
  it("renders without an id list rather than asserting a count it does not have", () => {
    render(<SemanticInterpreter payload={{ components: [{ archetype: "CANVAS_SEED" }] }} />);
    expect(screen.queryByText(NOT_FOUND)).toBeNull();
    expect(screen.queryByText(/0 artifacts/)).toBeNull(); // absence is not zero
  });
});

describe("the two treatments stay mutually exclusive", () => {
  it("no row declares both a component and a consumer", () => {
    // Restated here because this seal's sweep would silently skip a row that declared both:
    // it would be drawn AND expected not to reach the default branch, and the two guards
    // would disagree about which is the bug.
    for (const c of assembleDerivedCapabilities()) {
      expect(
        !(c.component && c.consumer),
        `${c.archetype} declares both a component and a consumer`,
      ).toBe(true);
    }
  });
});
