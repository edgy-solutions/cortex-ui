/**
 * The raw section's rendering seals — the human's 2026-10-07 ruling (ADR-0055 amendment
 * requested of Lane 1).
 */
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, render } from "@testing-library/react";
import { RawFields } from "./RawFields";
import { SemanticInterpreter } from "@/components/registry/SemanticInterpreter";
import { parityComponents } from "./competing-measures/parityPopulation.testkit";

const readCapture = (f: string): unknown =>
  JSON.parse(readFileSync(path.join(__dirname, "../../sessions", f), "utf8"));

afterEach(cleanup);

describe("RawFields", () => {
  it("renders nothing when there is nothing raw", () => {
    const { container } = render(<RawFields fields={{}} />);
    expect(container.innerHTML).toBe("");
  });

  it("seal 3 — CLOSED by default: the details has no open attribute", () => {
    const { container } = render(<RawFields fields={{ a: 1 }} />);
    const d = container.querySelector("details[data-raw-fields]")!;
    expect(d).not.toBeNull();
    expect(d.hasAttribute("open")).toBe(false);
    expect(d.getAttribute("data-raw-fields")).toBe("1");
    expect(d.querySelector("summary")!.textContent).toBe("Raw — 1 field(s) with no declared rendering");
  });

  it("lists every key, sorted", () => {
    const { container } = render(<RawFields fields={{ b: 1, a: 2, c: 3 }} />);
    const keys = [...container.querySelectorAll("[data-raw-field]")].map((e) => e.getAttribute("data-raw-field"));
    expect(keys).toEqual(["a", "b", "c"]);
  });

  it("seal 4 — raw means raw: 1234.5 is `1234.5`, not `1,234.5`, not `$`; a string keeps its quotes", () => {
    const { container } = render(<RawFields fields={{ n: 1234.5, s: "hours" }} />);
    const n = container.querySelector('[data-raw-field="n"] pre')!.textContent;
    const s = container.querySelector('[data-raw-field="s"] pre')!.textContent;
    expect(n).toBe("1234.5");
    expect(n).not.toContain(",");
    expect(n).not.toContain("$");
    expect(s).toBe('"hours"');
  });

  it("undefined shows as the literal text `undefined`; objects are indented JSON", () => {
    const { container } = render(<RawFields fields={{ u: undefined, o: { x: 1 } }} />);
    expect(container.querySelector('[data-raw-field="u"] pre')!.textContent).toBe("undefined");
    expect(container.querySelector('[data-raw-field="o"] pre')!.textContent).toBe('{\n  "x": 1\n}');
  });

  it("stops pointerdown on the summary so opening it does not start a canvas drag", () => {
    let reached = false;
    const { container } = render(
      <div onPointerDown={() => (reached = true)}>
        <RawFields fields={{ a: 1 }} />
      </div>,
    );
    container.querySelector("summary")!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    expect(reached).toBe(false);
  });
});

describe("seal 5 — reach: the section mounts at the population, on every dispatch branch", () => {
  const probe = (component: Record<string, unknown>) =>
    render(<SemanticInterpreter payload={{ components: [{ ...component, zz_probe: "p" }] }} />).container;
  const found = (c: HTMLElement) => c.querySelector('[data-raw-field="zz_probe"]');

  it("package branch (COMPETING_MEASURES)", () => {
    const first = Object.values(parityComponents(readCapture))[0];
    expect(found(probe(first))).not.toBeNull();
  });

  it("package branch that BREAKS out of the switch and draws no card (WORKFLOW_CASE with no case)", () => {
    const c = probe({ archetype: "WORKFLOW_CASE" });
    // `break` leaves renderComponent returning undefined: no card at all, yet the keys still arrive.
    expect(c.querySelector("[data-archetype]")).toBeNull();
    expect(found(c)).not.toBeNull();
  });

  it("switch case (NAMED_HOLE)", () => {
    const c = probe({ archetype: "NAMED_HOLE", subject_concept: "x" });
    expect(found(c)).not.toBeNull();
  });

  it("default/fallback branch (CANVAS_SEED, acted on rather than drawn)", () => {
    const c = probe({ archetype: "CANVAS_SEED", artifact_ids: ["a"] });
    expect(found(c)).not.toBeNull();
  });

  it("a no_declaration archetype in the default branch gets no raw section", () => {
    const c = probe({ archetype: "NOT_A_THING" });
    expect(c.querySelector("[data-raw-fields]")).toBeNull();
  });
});
