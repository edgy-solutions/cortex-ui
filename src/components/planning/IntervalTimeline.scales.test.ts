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
