/**
 * DIFFERENTIATE THE CELL TREATMENT, SHARE THE INTERACTION.
 *
 * The two grids sat adjacent on a board reading as ONE chart split in two: same cell form,
 * same padding, same big-number-over-small-number, differing only in colour ramp — and a ramp
 * is the first thing a projector washes out.
 *
 * The form now carries the distinction, and it carries the right one: a RATIO is continuous, a
 * MATURITY LEVEL is ordinal. A continuous bar under both would have asserted that maturity is
 * a smooth quantity, which is the same class of error as colouring a maturity gap red.
 *
 * And the interaction must NOT diverge. The inspection layer replaces both detail lines with
 * one panel, and it can only do that if both surfaces behave the same way — otherwise that
 * build inherits two patterns to unify instead of one, which is what unifying them was for.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ThresholdGrid } from "./ThresholdGrid";
import { MatrixGrid } from "./MatrixGrid";
import { ShortfallGrid } from "./ShortfallGrid";

afterEach(cleanup);

const thresholdRows = [
  { subject_id: "S1", subject_label: "Site A", period: "P1", value: 1.8, threshold: 2, over_threshold: false },
  { subject_id: "S2", subject_label: "Site B", period: "P1", value: 3, threshold: 2, over_threshold: true },
];
const matrixRows = [
  { row_id: "C1", row_label: "Cap A", column_id: "X", column_label: "X", level: 1.2, target_level: 4 },
];

describe("the forms differ because the measurements do", () => {
  it("a ratio draws ONE continuous bar", () => {
    const { container } = render(<ThresholdGrid rows={thresholdRows} />);
    const cells = container.querySelectorAll("button");
    expect(cells.length).toBeGreaterThan(0); // positive control
    // One track, one fill — not a row of rungs.
    const track = cells[0].querySelectorAll("span > span[style]");
    expect(track.length).toBe(1);
  });

  it("a level draws RUNGS, one per step of its target", () => {
    const { container } = render(<MatrixGrid rows={matrixRows} />);
    const cell = container.querySelector("button")!;
    const fills = cell.querySelectorAll("span[style]");
    // target_level 4 → four rungs, not one bar.
    expect(fills.length).toBe(4);
  });

  it("a fractional level fills a rung PARTLY rather than rounding it away", () => {
    // 1.2 of 4: first rung full, second a fifth, the rest empty. Rounding to "1" would discard
    // a real measurement; filling two would overstate it.
    const { container } = render(<MatrixGrid rows={matrixRows} />);
    const widths = [...container.querySelector("button")!.querySelectorAll("span[style]")].map(
      (el) => (el as HTMLElement).style.width,
    );
    expect(widths[0]).toBe("100%");
    expect(parseFloat(widths[1])).toBeCloseTo(20, 0);
    expect(widths[3]).toBe("0%");
  });

  it("a breach does not draw outside its own cell", () => {
    // value 3 of threshold 2 is 150%. The overflow is said by the colour and by the payload's
    // own `over_threshold`; a bar wider than its track would be the component asserting it
    // twice, and badly.
    const { container } = render(<ThresholdGrid rows={thresholdRows} />);
    const over = [...container.querySelectorAll("button")].find((b) =>
      within(b).queryByText("3"),
    )!;
    const fill = over.querySelector("span > span[style]") as HTMLElement;
    expect(parseFloat(fill.style.width)).toBeLessThanOrEqual(100);
  });

  it("a non-positive target draws NO rungs rather than a guessed scale", () => {
    const { container } = render(
      <MatrixGrid rows={[{ ...matrixRows[0], target_level: 0 }]} />,
    );
    expect(container.querySelector("button")!.querySelectorAll("span[style]").length).toBe(0);
  });
});

describe("both grids still explain themselves, and behave the same way", () => {
  it("each names what its marks mean", () => {
    render(<ThresholdGrid rows={thresholdRows} />);
    expect(screen.getByText(/value ÷ threshold/)).toBeTruthy();
    cleanup();
    render(<MatrixGrid rows={matrixRows} />);
    expect(screen.getByText(/rungs toward target/)).toBeTruthy();
  });

  it("the INTERACTION is identical — a cell is a button in both", () => {
    // The inspection layer's precondition. If one grid becomes a div-with-onClick and the
    // other stays a button, that build gets two patterns to unify instead of one.
    const T = readFileSync(path.join(__dirname, "ThresholdGrid.tsx"), "utf8");
    const M = readFileSync(path.join(__dirname, "MatrixGrid.tsx"), "utf8");
    for (const src of [T, M]) {
      expect(src).toContain("onClick={() => setSelected(cell)}");
      expect(src).toContain('type="button"');
    }
  });
});

/**
 * THE THREE FUNDING STATES DIFFER IN FORM, NOT ONLY IN HUE.
 *
 * They were three fills — rose, amber, slate — and a colour ramp is the first thing a projector
 * washes out, which left three distinct states reading as one wash of warm cells. The dashed
 * border on "pledged but not firm" survives that: a dashed outline says provisional in a way no
 * tint does, and it is the distinction a room chasing funders actually needs.
 *
 * The state is READ, never worked out. "Pledged but not firm" is invisible to any comparison of
 * required against committed — it lives in `secured`, and the producer states the verdict.
 */
describe("funding states are told apart by form", () => {
  const cell = (state: string, over: Record<string, unknown> = {}) => [
    {
      subject_id: "O1",
      subject_label: "Org A",
      period: "P1",
      required: 100,
      committed: 100,
      secured: 100,
      shortfall: 0,
      state,
      ...over,
    },
  ];

  it("each state gets a DIFFERENT form, not just a different colour", () => {
    const forms = new Map<string, string>();
    for (const state of ["met", "pledged-not-firm", "short"]) {
      cleanup();
      const { container } = render(<ShortfallGrid rows={cell(state)} />);
      forms.set(state, container.querySelector("button")!.className);
    }
    // Provisional is the one that must survive a washed-out projector, so it is the one that
    // carries a border STYLE rather than a fill.
    expect(forms.get("pledged-not-firm")).toMatch(/border-dashed/);
    expect(forms.get("met")).not.toMatch(/border-dashed/);
    expect(forms.get("short")).not.toMatch(/border-dashed/);
    // And all three remain distinct from one another.
    expect(new Set(forms.values()).size).toBe(3);
  });

  it("amber is gone — it meant two things across two surfaces", () => {
    // It was a warning here and "unresolved" on the answer rail. A colour that means two things
    // means neither.
    for (const state of ["met", "pledged-not-firm", "short"]) {
      cleanup();
      const { container } = render(<ShortfallGrid rows={cell(state)} />);
      expect(container.querySelector("button")!.className).not.toMatch(/amber/);
    }
  });

  it("an UNKNOWN state is still not styled as met", () => {
    // A verdict this renderer does not know is a verdict it must not colour, or a future
    // vocabulary lands looking healthy.
    const { container } = render(<ShortfallGrid rows={cell("renegotiating")} />);
    const cls = container.querySelector("button")!.className;
    expect(cls).not.toMatch(/teal/);
    expect(cls).not.toMatch(/rose/);
  });

  it("shows the FIRM subset on every cell, including the ones that are fine", () => {
    // It used to appear only where secured differed from committed, which reads as "this one is
    // special" — and its absence everywhere else is what made the healthy cells and the
    // provisional ones look identical at a glance.
    // Queried on the CELL's text rather than by matcher: the label and the amount are
    // separate text nodes inside one span, and getByText walks elements, not their
    // concatenation.
    const { container } = render(<ShortfallGrid rows={cell("met")} />);
    expect(container.querySelector("button")!.textContent).toMatch(/firm/i);
  });
});
