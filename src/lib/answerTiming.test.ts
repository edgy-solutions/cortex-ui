/**
 * The architect's wording and thresholds (2026-11-27), one arm per state and per boundary, both
 * sides. E = 110 s (the architect's own example, "usually under 1:50"); D = 900 s (15:00).
 */
import { describe, it, expect } from "vitest";
import { timingLine, usuallyUnder } from "./answerTiming";

const E = 110_000;
const D = 900_000;

describe("with nothing served, the strip judges nothing", () => {
  it("no timing at all → normal, however long", () => {
    expect(timingLine(3_600_000)).toEqual({ state: "normal" });
    expect(timingLine(3_600_000, null)).toEqual({ state: "normal" });
  });

  it("an expected time that is null, absent, zero, negative or not finite → normal", () => {
    for (const expectedMs of [null, undefined, 0, -1, NaN, Infinity]) {
      expect(timingLine(3_600_000, { expectedMs, deadlineMs: D })).toEqual({ state: "normal" });
    }
  });
});

describe("under E: no judgement", () => {
  it("just under E is normal", () => {
    expect(timingLine(E - 1, { expectedMs: E, deadlineMs: D })).toEqual({ state: "normal" });
  });
});

describe("E up to 2E: longer than usual", () => {
  it("at E exactly, and just under 2E, says longer than usual with the rounded-up figure", () => {
    for (const t of [E, 2 * E - 1]) {
      expect(timingLine(t, { expectedMs: E, deadlineMs: D })).toEqual({
        state: "long",
        suffix: "— longer than usual (usually under 1:50)",
      });
    }
  });
});

describe("2E and over: the stalled line", () => {
  it("at 2E exactly it is stalled, not long", () => {
    expect(timingLine(2 * E, { expectedMs: E, deadlineMs: D }).state).toBe("stalled");
  });

  it("the architect's wording, with the deadline sentence when D is served", () => {
    expect(timingLine(303_000, { expectedMs: E, deadlineMs: D })).toEqual({
      state: "stalled",
      sentence:
        "Still working after 5:03. Answers usually finish in under 1:50, so this one may be stuck.",
      deadline: "The server stops waiting at 15:00.",
    });
  });

  it("no deadline sentence when D is not served", () => {
    for (const deadlineMs of [null, undefined, 0, NaN]) {
      const line = timingLine(303_000, { expectedMs: E, deadlineMs });
      expect(line).toMatchObject({ state: "stalled", deadline: null });
    }
  });
});

describe("usually under rounds E UP to the next 10 s", () => {
  it("never promises sooner than the producer measured", () => {
    expect(usuallyUnder(103_000)).toBe("1:50");
    expect(usuallyUnder(110_000)).toBe("1:50");
    expect(usuallyUnder(110_001)).toBe("2:00");
    expect(usuallyUnder(1)).toBe("0:10");
  });
});
