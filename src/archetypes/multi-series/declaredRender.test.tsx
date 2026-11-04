/**
 * A DECLARED MEASURE ARRIVES, END TO END: the component the producer's projector emits for a
 * `render.shape: MULTI_SERIES` row, through `SemanticInterpreter`, to the card.
 *
 * Asserted on the DOM the card draws outside the chart (header, verdict, flags, raw section).
 * Recharts measures its container and jsdom reports zero (see `Card.test.tsx`), so the chart
 * itself is not asserted here.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { SemanticInterpreter } from "@/components/registry/SemanticInterpreter";
import { readReference } from "./contract";
import { DECLARED_TCPI_COMPONENT, DECLARED_VAC_COMPONENT } from "./fixtures/declaredRender";

afterEach(cleanup);

const draw = (component: Record<string, unknown>) =>
  render(<SemanticInterpreter payload={{ components: [component] }} />).container;

describe("a declared TCPI and a declared VAC draw through the interpreter", () => {
  it("TCPI draws the card and the verdict verbatim; the one key with no reader is the projector's subject_concept", () => {
    const c = draw({ ...DECLARED_TCPI_COMPONENT });
    expect(c.querySelector("[data-verdict]")!.textContent).toBe(DECLARED_TCPI_COMPONENT.verdict);
    expect(c.textContent).toContain("3 periods");
    // NOT a declared-render defect: every projected package card carries this row, and the parity
    // baselines record it. Any second key here is a wire key this card has no reader for. Ruled
    // 2026-11-03: the producer omits a null, cortex excuses nothing, so this goes to [] at that
    // re-pin. `subjectConceptOmitted.test.tsx` proves the omission draws clean.
    const raw = [...c.querySelectorAll("[data-raw-field]")].map((f) => f.getAttribute("data-raw-field"));
    expect(raw).toEqual(["subject_concept"]);
    expect(c.querySelector("[data-no-render-registered]")).toBeNull();
  });

  it("VAC: a reference of 0 is a reference, not an absent one, and the unit is named", () => {
    const c = draw({ ...DECLARED_VAC_COMPONENT });
    expect(c.querySelector("[data-reference-unreadable]")).toBeNull();
    expect(readReference(DECLARED_VAC_COMPONENT.reference)).toEqual({ value: 0, label: "on budget" });
    expect(c.textContent).toContain("USD");
    expect(c.querySelector("[data-verdict]")!.textContent).toBe(DECLARED_VAC_COMPONENT.verdict);
  });

  it("the render block does not arrive today: if presentation starts carrying it, cortex prints it raw, and this arm is what to change", () => {
    const c = draw({ ...DECLARED_TCPI_COMPONENT, render: { shape: "MULTI_SERIES", value_label: "TCPI" } });
    expect(c.querySelector("[data-verdict]")).not.toBeNull();
    const raw = c.querySelector("details[data-raw-fields]")!;
    expect(raw.getAttribute("data-raw-fields")).toBe("2");
    expect(raw.querySelector("[data-raw-field='render']")).not.toBeNull();
  });

  it("control: an unknown archetype takes the no-render-registered path, not the card", () => {
    const c = draw({ ...DECLARED_TCPI_COMPONENT, archetype: "NOT_AN_ARCHETYPE" });
    expect(c.querySelector("[data-no-render-registered='NOT_AN_ARCHETYPE']")).not.toBeNull();
    expect(c.querySelector("[data-verdict]")).toBeNull();
  });
});
