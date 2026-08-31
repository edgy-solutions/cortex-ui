/**
 * A SCALE FORMAT THAT MISSES THE DIALECT RENDERS AS ITS OWN PATTERN.
 *
 * This shipped twice. The header read `yyyy` and `QQQ` — the literal strings — because
 * react-gantt compiles a string format with `dateToString` from `@svar-ui/lib-dom`, whose
 * table is strftime, and `gantt-store` then does:
 *
 *     const value = typeof s.format === "function" ? s.format(from, to) : s.format;
 *
 * A pattern with no `%` matches no token, survives compilation untouched, and is printed.
 * There is no error, no warning, and no blank cell — the failure LOOKS like a styling or
 * locale problem, which is what it was diagnosed as twice before the one-line cause was read.
 *
 * WHY A TEST AND NOT A COMMENT. The comment was already there and said the opposite, because
 * `gantt-store` ALSO bundles a date-fns CLDR formatter the scale never calls. Two formatters
 * live in that dependency; only one is on this path. A reader cannot tell them apart, so the
 * constraint is asserted here rather than trusted to be remembered.
 *
 * The quarter case is not an oversight to fix later: lib-dom has NO quarter token, so a
 * quarter scale can only ever be a function. That is asserted too, so a future "tidy-up" to
 * a string is caught by a test rather than by the room.
 */
import { describe, it, expect } from "vitest";
import { SCALES, ZOOM } from "./IntervalTimeline";

/** Every token `dateToString` in @svar-ui/lib-dom recognises, read off its own switch. */
const STRFTIME_TOKENS = /%[dmjnyYDlMFhgGHiaAsS]/;

type Scale = { unit: string; step: number; format: unknown };

const allScales = (): Scale[] => [
  ...(SCALES as unknown as Scale[]),
  ...ZOOM.levels.flatMap((l) => l.scales as unknown as Scale[]),
];

describe("interval timeline scale formats", () => {
  it("has scales to check — positive control", () => {
    // A flattening bug that produced [] would pass every assertion below over nothing.
    expect(allScales().length).toBeGreaterThanOrEqual(6);
  });

  it("every string format uses a token dateToString actually recognises", () => {
    const literal = allScales()
      .filter((s) => typeof s.format === "string")
      .filter((s) => !STRFTIME_TOKENS.test(s.format as string));
    expect(
      literal.map((s) => `${s.unit}: ${JSON.stringify(s.format)}`),
    ).toEqual([]);
  });

  it("quarter scales are functions, because strftime has no quarter token", () => {
    for (const s of allScales().filter((s) => s.unit === "quarter")) {
      expect(typeof s.format).toBe("function");
    }
  });

  it("the quarter function maps months to calendar quarters", () => {
    const q = allScales().find((s) => s.unit === "quarter")?.format as (d: Date) => string;
    expect(q(new Date(2026, 0, 15))).toBe("Q1");
    expect(q(new Date(2026, 2, 31))).toBe("Q1");
    expect(q(new Date(2026, 3, 1))).toBe("Q2");
    expect(q(new Date(2026, 11, 31))).toBe("Q4");
  });
});

/**
 * THE AXIS MUST NOT SPRAWL — AND THE FIRST VERSION OF THIS TEST MEASURED THE WRONG LEVER.
 *
 * It asserted that `maxCellWidth` was large enough for a short plan to fill a wide card,
 * reasoning that cells were being CLAMPED from stretching. The behaviour says otherwise: the
 * column count follows the available WIDTH, so cell width sits near the MINIMUM and the
 * maximum never binds. The same board went from an axis ending in 2028 to one ending in 2032
 * purely because the pane got wider — after the fix, and with the fix in the bundle.
 *
 * That test was green the whole time. It is the day`s clearest case of a guard that reads as
 * obviously correct and constrains nothing, because it asserted a relation about a constant
 * the behaviour does not consult.
 *
 * What actually bounds the sprawl is the FLOOR: a wider cell means fewer fit, which means
 * fewer empty periods. This asserts the floors are big enough to keep a realistic pane from
 * drawing decades, and it names the pane width so the arithmetic is checkable rather than
 * taken on trust.
 */
describe("the zoom floors bound how far the axis can sprawl", () => {
  // A planning card on a full-screen pane, less the task table on the left.
  const CHART_PX = 1540;
  // Beyond this a reader is looking at more empty axis than plan.
  const MAX_COLUMNS = 12;

  it("the DEFAULT grain cannot draw more than a dozen columns in a full-screen card", () => {
    // Bounded on the default level specifically, because that is the one a card opens at and
    // therefore the one a room sees. The finer grains legitimately draw more columns — 17
    // months is a reasonable month-scale view and would be a nonsense year-scale one — so a
    // single cap across all three would either be too loose for the default or too strict for
    // the rest, and would have to be weakened to fit. Bounding the one that matters is the
    // claim that survives.
    const level = ZOOM.levels[ZOOM.level];
    expect(level, "the default zoom level does not exist").toBeTruthy(); // positive control
    const columns = CHART_PX / level.minCellWidth;
    expect(
      columns,
      `the default grain allows ${Math.round(columns)} columns in a ${CHART_PX}px chart — the axis sprawls past the plan`,
    ).toBeLessThanOrEqual(MAX_COLUMNS);
  });

  it("and no grain is so fine that a full-screen card becomes a wall of columns", () => {
    // A weaker bound on the rest: they are reachable by ctrl+wheel and must stay readable,
    // but a month view is allowed to show months.
    for (const [i, level] of ZOOM.levels.entries()) {
      expect(CHART_PX / level.minCellWidth, `zoom level ${i}`).toBeLessThanOrEqual(24);
    }
  });
  it("and every floor still sits below its own ceiling", () => {
    // A min above its max is a config that cannot be satisfied at any width.
    for (const level of ZOOM.levels) {
      expect(level.maxCellWidth).toBeGreaterThan(level.minCellWidth);
    }
  });
});
