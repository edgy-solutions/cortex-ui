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
import { describe, it, expect, vi } from "vitest";
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

  /**
   * ABSENT AND REFUSED RENDER THE SAME AND MUST NOT DIAGNOSE THE SAME.
   *
   * Both yield `null`, which is the right RENDER — a wrong duration reads as a measurement,
   * so refusing to absence is correct on the card. But the two states have different owners:
   * a column that is null or missing belongs to the projection, a value that arrived and was
   * refused belongs to the producer. Collapsed, "no time is showing" sends everyone to look in
   * the same wrong place.
   *
   * This is `fetch_registered_entries`' rule applied to a scalar — `None` for could-not-reach
   * and `{}` for reached-and-empty have opposite repairs and must not fold together — and it
   * came up because exactly that question was live: the backend had the value written, read and
   * upserted, and nothing downstream could say whether the client ever saw it.
   */
  describe("a refused duration is distinguishable from an absent one", () => {
    const warnings = (row: Record<string, unknown>): unknown[][] => {
      const seen: unknown[][] = [];
      const spy = vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
        seen.push(args);
      });
      try {
        rowToArtifact(row as never);
      } finally {
        spy.mockRestore();
      }
      return seen;
    };

    it("says nothing when the column is simply not there", () => {
      // The common case and the one that must stay quiet: every historical row predates the
      // column. A warning here would fire on every row of a full canvas and be turned off
      // within a day, taking the useful half with it.
      expect(warnings(base)).toEqual([]);
      expect(warnings({ ...base, duration_ms: null })).toEqual([]);
    });

    it("SAYS SO when a value arrived and was refused", () => {
      const negative = warnings({ ...base, duration_ms: -3 });
      expect(negative).toHaveLength(1);
      expect(String(negative[0].join(" "))).toContain("ARRIVED AND WAS REFUSED");

      const nonsense = warnings({ ...base, duration_ms: "abc" });
      expect(nonsense).toHaveLength(1);
    });

    it("names the row and the raw value, since neither is recoverable afterwards", () => {
      // The refused value never reaches the artifact, so a warning that omitted it would say
      // "something was wrong somewhere" — which is the shape of report that gets ignored.
      const [args] = warnings({ ...base, duration_ms: -3 });
      expect(args).toContain("a1");
      expect(args).toContain(-3);
    });

    it("still renders as absence — the card is unchanged", () => {
      // The warning is for the engineer. The reader is owed absence, exactly as before.
      expect(rowToArtifact({ ...base, duration_ms: -3 } as never).duration_ms).toBeNull();
    });
  });
});

describe("the panel never manufactures a duration", () => {
  it("both rows gate rendering on the refusal, and neither defaults the absence away", () => {
    // The specific regression: `formatDuration(a.duration_ms ?? 0)` typechecks, reads as
    // defensive, and prints "0.0s" on every legacy row in the list.
    //
    // REWRITTEN, because the first version pinned a NAME. It required the literal
    // `const took = artifactDuration(a.duration_ms)` twice, so when the rows moved to a helper
    // that totals a multi-hop answer this went red with the behaviour completely intact — the
    // panel still refused, still never defaulted, and the seal failed anyway. A check that
    // fires on a change that does not matter teaches everyone to edit the check.
    //
    // The RULE is what it guards, and the rule is about what the panel must not do: never
    // format a duration itself, never read the raw field, never substitute a value for
    // absence. Any call shape that obeys those is fine, which is what makes it a seal on
    // behaviour rather than on a spelling.
    const panel = readFileSync(
      path.join(__dirname, "../components/NeuralStream/AnswersPanel.tsx"),
      "utf8",
    );
    // Positive control: the panel does render a duration, so this cannot pass on a file that
    // simply stopped showing one.
    expect(panel).toMatch(/const took = /);
    expect(panel.split("const took = ").length - 1).toBe(2);
    // It delegates the decision instead of making it.
    expect(panel).not.toContain("formatDuration(");
    expect(panel).not.toMatch(/a\.duration_ms/);
    // And nothing anywhere defaults the absence into a number.
    expect(panel).not.toMatch(/duration_ms\s*\?\?/);
  });
});
