/**
 * A duration that is not known must not render as a duration that is zero.
 *
 * That is the whole subject. `0s` beside an answer is a measurement — it says the
 * pipeline returned instantly. Nothing beside an answer is the absence of one. The
 * artifacts already in the substrate were written before the producer emitted a
 * duration and will never have one (capture-or-lose-forever), so absence is not an
 * edge case here, it is most of the list on day one.
 *
 * Same law as ShortfallGrid's "an absent cell is a gap, not a zero", and the reason
 * the refusal lives in `artifactDuration` rather than at each call site: a surface
 * that renders a duration inherits the decision instead of re-making it.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { formatDuration, artifactDuration } from "./formatDuration";
import { rowToArtifact } from "./electric";

describe("formatDuration", () => {
  it("reads at the precision the number deserves", () => {
    expect(formatDuration(2500)).toBe("2.5s");
    expect(formatDuration(12000)).toBe("12s");
    expect(formatDuration(63000)).toBe("1m 03s");
  });

  it("pads the seconds so times stay column-aligned", () => {
    // The list renders these tabular-nums in a fixed-width column; "1m 3s" and
    // "1m 13s" at different widths make a scannable column jitter.
    expect(formatDuration(63000)).toBe("1m 03s");
    expect(formatDuration(73000)).toBe("1m 13s");
  });
});

describe("artifactDuration refuses everything that is not a measurement", () => {
  it("absent is null — not zero, not a dash, not a guess", () => {
    expect(artifactDuration(undefined)).toBeNull();
    expect(artifactDuration(null)).toBeNull();
  });

  it("NaN and Infinity are null", () => {
    // Reachable from the wire: Number("abc") is NaN and the row parser does not
    // reject it on its own.
    expect(artifactDuration(NaN)).toBeNull();
    expect(artifactDuration(Infinity)).toBeNull();
  });

  it("a negative duration is null, not a negative number of seconds", () => {
    // Reachable from a producer subtracting two timestamps in the wrong order.
    // "-3.0s" beside an answer is worse than nothing: it looks authoritative.
    expect(artifactDuration(-3000)).toBeNull();
  });

  it("ZERO is a real measurement and survives", () => {
    // The one value that must NOT be swallowed by the refusals above. A cache hit
    // is genuinely sub-millisecond, and dropping it would make the fastest answers
    // the ones that look unmeasured — exactly inverted.
    expect(artifactDuration(0)).toBe("0.0s");
  });
});

describe("the projection row carries it, or honestly does not", () => {
  const base = {
    id: "a1",
    status: "complete",
    durability_status: "durable",
    created_at: 1,
    updated_at: 2,
    valid_as_of: 1,
  };

  it("maps a real duration through", () => {
    expect(rowToArtifact({ ...base, duration_ms: 4200 } as never).duration_ms).toBe(4200);
  });

  it("a row without the column yields null, not 0", () => {
    // The state of every row in the substrate today. If this returned 0 the whole
    // list would claim every historical answer was instantaneous.
    expect(rowToArtifact(base as never).duration_ms).toBeNull();
  });

  it("refuses a negative and a non-numeric string at the boundary", () => {
    expect(rowToArtifact({ ...base, duration_ms: -1 } as never).duration_ms).toBeNull();
    expect(rowToArtifact({ ...base, duration_ms: "abc" } as never).duration_ms).toBeNull();
  });

  it("accepts the shapes Electric actually decodes to", () => {
    // bigint and string are both real: Postgres bigint columns arrive as either
    // depending on the client version, which is why the parser tolerates both.
    expect(rowToArtifact({ ...base, duration_ms: 900n } as never).duration_ms).toBe(900);
    expect(rowToArtifact({ ...base, duration_ms: "1500" } as never).duration_ms).toBe(1500);
  });
});

describe("the panel never manufactures a duration", () => {
  it("both rows gate rendering on the refusal, and neither defaults the absence away", () => {
    // The specific regression: `formatDuration(a.duration_ms ?? 0)` typechecks,
    // reads as defensive, and prints "0.0s" on every legacy row in the list.
    const panel = readFileSync(
      path.join(__dirname, "../components/NeuralStream/AnswersPanel.tsx"),
      "utf8",
    );
    expect(panel).toContain("const took = artifactDuration(a.duration_ms)"); // positive control
    expect(panel.split("const took = artifactDuration(a.duration_ms)").length - 1).toBe(2);
    expect(panel).not.toMatch(/duration_ms\s*\?\?/);
    expect(panel).not.toContain("formatDuration(");
  });
});
