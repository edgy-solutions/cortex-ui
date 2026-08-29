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

afterEach(cleanup);

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
    // false on exactly the rows most likely to be read, and it would also name a destination
    // that is not in the payload. The count is captured; the effect and the destination are not.
    render(
      <SemanticInterpreter
        payload={{ components: [{ archetype: "CANVAS_SEED", artifact_ids: ["a", "b"] }] }}
      />,
    );
    expect(screen.getByText(/2 artifacts/)).toBeTruthy();
    expect(screen.queryByText(/seeded/i)).toBeNull();
    expect(screen.queryByText(/Portfolio Planning/i)).toBeNull();
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
