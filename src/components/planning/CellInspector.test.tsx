/**
 * ONE INSPECTION SURFACE, ACROSS EVERY GRID.
 *
 * Three grids had grown three hand-rolled detail blocks with the same skeleton and three
 * copies of the same class strings. They drifted in ways nobody notices one card at a time and
 * everybody notices on a board — and none of them could be closed.
 *
 * The panel REPLACES those blocks rather than sitting beside them. Built as a fourth surface
 * next to three existing ones it would have been a fourth pattern, and the unification would
 * have made things worse by exactly one.
 *
 * READ HALF ONLY. The original ask was "click a bar and see its values with options to change
 * them"; changing a value is either a what-if scenario or an edit to plan state, and which one
 * has not been ruled. An edit control shipped now would pick that answer by accident.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ThresholdGrid } from "./ThresholdGrid";
import { MatrixGrid } from "./MatrixGrid";
import { ShortfallGrid } from "./ShortfallGrid";

afterEach(cleanup);

const HERE = __dirname;
const SOURCES = ["ThresholdGrid.tsx", "MatrixGrid.tsx", "ShortfallGrid.tsx"].map((f) => [
  f,
  readFileSync(path.join(HERE, f), "utf8"),
]) as [string, string][];

const threshold = [
  { subject_id: "S1", subject_label: "Site A", period: "P1", value: 3, threshold: 2, over_threshold: true },
];
const matrix = [
  { row_id: "C1", row_label: "Cap A", column_id: "X", column_label: "Col X", level: 1, target_level: 4, gap: 3 },
];
const shortfall = [
  { subject_id: "O1", subject_label: "Org A", period: "P1", required: 100, committed: 60, secured: 40, shortfall: 40 },
];

const grids: [string, () => void][] = [
  ["ThresholdGrid", () => render(<ThresholdGrid rows={threshold} />)],
  ["MatrixGrid", () => render(<MatrixGrid rows={matrix} />)],
  ["ShortfallGrid", () => render(<ShortfallGrid rows={shortfall} />)],
];

describe("every grid inspects through the SAME panel", () => {
  it("no grid keeps a hand-rolled detail frame", () => {
    // The frame's class string, which all three used to carry a copy of. A grid still holding
    // one is a grid that will drift.
    for (const [name, src] of SOURCES) {
      expect(src, `${name} still hand-rolls the inspector frame`).not.toContain(
        'className="mt-4 p-3 rounded glass-panel-sm border-cyan-500/20"',
      );
      expect(src, `${name} does not use the shared inspector`).toContain("<CellInspector");
    }
  });

  for (const [name, mount] of grids) {
    it(`${name}: clicking a cell opens the panel, and it can be closed`, () => {
      mount();
      // Positive control: nothing is open before a click. Without this the assertions below
      // would pass on a panel that is always rendered.
      expect(document.querySelector("[data-cell-inspector]")).toBeNull();

      fireEvent.click(screen.getAllByRole("button")[0]);
      expect(document.querySelector("[data-cell-inspector]")).not.toBeNull();

      // A panel that cannot be closed is a panel that eats the card. Before the unification
      // none of the three had this gesture at all.
      fireEvent.click(screen.getByLabelText("Close"));
      expect(document.querySelector("[data-cell-inspector]")).toBeNull();
    });
  }
});

describe("the panel owns the frame and none of the words", () => {
  it("each grid keeps its OWN vocabulary for its own measurement", () => {
    // "over by", "to go", "pledged but not firm" are claims about different measurements. A
    // generic renderer would have to invent a wording that fits none of them.
    render(<ThresholdGrid rows={threshold} />);
    fireEvent.click(screen.getAllByRole("button")[0]);
    expect(screen.getByText(/over by/)).toBeTruthy();
    cleanup();

    render(<MatrixGrid rows={matrix} />);
    fireEvent.click(screen.getAllByRole("button")[0]);
    expect(screen.getByText(/to go/)).toBeTruthy();
    cleanup();

    render(<ShortfallGrid rows={shortfall} />);
    fireEvent.click(screen.getAllByRole("button")[0]);
    expect(screen.getByText(/pledged but not firm/)).toBeTruthy();
  });

  it("an absent detail is STATED, not left as a blank line", () => {
    // The contributors are the actionable half; their absence is a fact about the payload and
    // is said out loud rather than rendered as empty space.
    render(<ThresholdGrid rows={threshold} />);
    fireEvent.click(screen.getAllByRole("button")[0]);
    expect(screen.getByText(/no contributors recorded/)).toBeTruthy();
  });

  it("a null detail line is DROPPED rather than rendered empty", () => {
    // ShortfallGrid passes its "short" line as null when there is no shortfall. An empty <p>
    // is a row of whitespace that reads as a missing value.
    render(<ShortfallGrid rows={[{ ...shortfall[0], shortfall: 0, committed: 100, secured: 100 }]} />);
    fireEvent.click(screen.getAllByRole("button")[0]);
    const panel = document.querySelector("[data-cell-inspector]")!;
    expect([...panel.querySelectorAll("p")].some((p) => p.textContent?.trim() === "")).toBe(false);
  });
});

describe("the write half is NOT built", () => {
  it("no grid offers an edit control from the inspector", () => {
    // Deciding whether "change this value" is a what-if or an edit to plan state is a ruling
    // nobody has made. A control shipped now would make it by accident.
    for (const [name, src] of SOURCES) {
      expect(src, `${name} appears to offer an edit seam`).not.toMatch(/<input|contentEditable/);
    }
  });
});
