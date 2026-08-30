/**
 * A CARD SIZED FOR THREE ROWS SHOWING FOUR HIDES ONE — AND LIES ABOUT A COLUMN.
 *
 * This started as "collapse the grids' empty columns", and that item does not exist: `gridAxes`
 * derives periods FROM THE CELLS in both grids, so a period column cannot appear unless some
 * cell references it. What looked empty was a column whose only cells belonged to rows below
 * the fold — the grid's own subtitle said `4 × 4` while three rows were visible.
 *
 * The panel scrolls rather than clips, so nothing is lost and that is precisely the problem:
 * the reader is shown a full-looking grid with a period of apparently missing data, and the
 * wrong conclusion is the one the card invited. The gantt already fixed this for itself — its
 * height is derived from row count because a fixed 420px "clipped a 17-row tree instead of
 * scrolling it, so the plan simply appeared to stop".
 */
import { describe, it, expect } from "vitest";
import { naturalContentHeight, tallestContentHeight } from "./naturalCardSize";
import { portfolioPlanningTemplate } from "./stageConstants";

const grid = (subjects: string[], periods: string[]) => [
  {
    archetype: "THRESHOLD_GRID",
    rows: subjects.flatMap((s) => periods.map((p) => ({ subject_id: s, period: p, value: 1, threshold: 2 }))),
  },
];

describe("naturalContentHeight", () => {
  it("counts SUBJECTS, not cells — a grid's rows are cells", () => {
    // The defect this would otherwise have: a 3x6 grid has eighteen row objects and three
    // visible rows. Sizing by cell count would make every grid enormous.
    const three = naturalContentHeight(grid(["a", "b", "c"], ["p1", "p2", "p3", "p4", "p5", "p6"]))!;
    const four = naturalContentHeight(grid(["a", "b", "c", "d"], ["p1"]))!;
    expect(three).toBeLessThan(four);
  });

  it("grows with each additional subject", () => {
    const h3 = naturalContentHeight(grid(["a", "b", "c"], ["p1"]))!;
    const h5 = naturalContentHeight(grid(["a", "b", "c", "d", "e"], ["p1"]))!;
    expect(h5).toBeGreaterThan(h3);
  });

  it("knows BOTH row-identity field names — matrix rows key on row_id", () => {
    // The grids do not agree: THRESHOLD_GRID and SHORTFALL_GRID key rows on `subject_id`,
    // MATRIX_GRID on `row_id`. Reading only one silently falls through to counting CELLS, so a
    // 5x4 matrix sized as twenty rows — a card four times too tall, arrived at confidently.
    const matrix = [
      {
        archetype: "MATRIX_GRID",
        rows: ["r1", "r2", "r3"].flatMap((r) =>
          ["c1", "c2", "c3", "c4"].map((c) => ({ row_id: r, column_id: c, level: 1, target_level: 4 })),
        ),
      },
    ];
    const threeRows = naturalContentHeight(grid(["a", "b", "c"], ["p1"]));
    expect(naturalContentHeight(matrix)).toBe(threeRows);
  });
  it("returns NULL for an archetype it does not know", () => {
    // A plausible number computed from an unknown shape would size cards confidently and
    // wrongly, and the failure would read as a layout bug rather than a missing case.
    expect(naturalContentHeight([{ archetype: "SOMETHING_NEW", rows: [1, 2, 3] }])).toBeNull();
    expect(naturalContentHeight([{ archetype: "PERIOD_SERIES", rows: [1, 2] }])).toBeNull();
  });

  it("returns null for absent, empty or malformed input rather than guessing", () => {
    expect(naturalContentHeight(undefined)).toBeNull();
    expect(naturalContentHeight([])).toBeNull();
    expect(naturalContentHeight([null])).toBeNull();
    expect(naturalContentHeight([{ archetype: "THRESHOLD_GRID", rows: [] }])).toBeNull();
  });

  it("caps a very long gantt rather than growing without bound", () => {
    const many = naturalContentHeight([
      { archetype: "INTERVAL_TIMELINE", rows: Array.from({ length: 200 }, () => ({})) },
    ])!;
    const some = naturalContentHeight([
      { archetype: "INTERVAL_TIMELINE", rows: Array.from({ length: 14 }, () => ({})) },
    ])!;
    expect(many).toBe(some);
  });

  it("tallest takes the max and ignores the ones it cannot size", () => {
    const list = [grid(["a", "b"], ["p"]), undefined, grid(["a", "b", "c", "d", "e"], ["p"])];
    expect(tallestContentHeight(list)).toBe(naturalContentHeight(grid(["a", "b", "c", "d", "e"], ["p"])));
  });

  it("tallest is null when NOTHING is recognised — the caller keeps its default", () => {
    expect(tallestContentHeight([undefined, [{ archetype: "PERIOD_SERIES" }]])).toBeNull();
  });
});

describe("the template treats a content height as a FLOOR-raiser, never a shrink", () => {
  const VP = { w: 1600, h: 900 };

  it("a taller content makes the lower rows taller", () => {
    const base = portfolioPlanningTemplate(VP);
    const tall = portfolioPlanningTemplate(VP, 900);
    expect(tall[1].h).toBeGreaterThan(base[1].h);
    expect(tall[3].h).toBeGreaterThan(base[3].h);
  });

  it("a SHORTER content is ignored — a chart still gets the room it needs", () => {
    // An unknown or small archetype must never shrink a card below the height reserved for a
    // fixed-height chart, or the fix for grids becomes a regression for charts.
    const base = portfolioPlanningTemplate(VP);
    const short = portfolioPlanningTemplate(VP, 50);
    expect(short[1].h).toBe(base[1].h);
  });

  it("the rows still tile without overlapping when the height grows", () => {
    // The failure mode of raising one row's height: the row below keeps its old y and the two
    // overlap, which is worse than a hidden row.
    const t = portfolioPlanningTemplate(VP, 900);
    expect(t[3].y).toBeGreaterThanOrEqual(t[1].y + t[1].h);
    expect(t[1].y).toBeGreaterThanOrEqual(t[0].y + t[0].h);
  });

  it("and the board still matches the pane's aspect", () => {
    const t = portfolioPlanningTemplate(VP, 900);
    const w = Math.max(...t.map((s) => s.x + s.w));
    const h = Math.max(...t.map((s) => s.y + s.h));
    expect(w / h).toBeCloseTo(VP.w / VP.h, 1);
  });
});
