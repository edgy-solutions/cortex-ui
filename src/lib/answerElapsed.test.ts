/**
 * A TWO-HOP ANSWER TOOK TWO HOPS' WORTH OF WORK.
 *
 * "On a 2 hop answer the time should be both hops."
 *
 * An answer that came from an ask is the product of two turns: the one that decided to ask and
 * built the menu, and the one that took the pick and dispatched. The row reported the final
 * artifact's `duration_ms` and called it the answer's time, so the routing leg — often the
 * slower of the two — was absent from the figure entirely.
 *
 * ── THE TRAP THIS FILE EXISTS TO PIN ──────────────────────────────────────────────────────
 *
 * The obvious implementation is the wall clock from the ask's creation to the answer's, and it
 * is wrong in the way that matters: it reports a reader who went for coffee as a slow system.
 * Summing each producer's OWN measurement counts work and excludes deliberation structurally,
 * rather than by trying to detect an idle gap and subtract it.
 *
 * ── AND THE SECOND TRAP, WHICH IS THE COMMON CASE ─────────────────────────────────────────
 *
 * Most rows in the substrate predate `duration_ms` — 268 of 270 at the time of writing — so a
 * chain where only one leg was measured is normal, not an edge. Summing what exists and
 * printing it bare would state a total quietly missing a leg. A wrong measurement is worse than
 * an absent one, so the coverage travels with the figure.
 */
import { describe, it, expect } from "vitest";
import { answerElapsed, answerElapsedLabel } from "./answerElapsed";
import type { Artifact } from "@/api/types";

const art = (id: string, duration_ms: number | null, parent?: string) =>
  ({
    id,
    duration_ms,
    ...(parent ? { derived_from_artifact_id: parent } : {}),
  }) as unknown as Artifact;

/** A lookup over a fixed set, the shape the panel threads in. */
const lookup = (rows: Artifact[]) => (id: string) => rows.find((r) => r.id === id);

describe("the work is summed across the chain", () => {
  it("a two-hop answer reports BOTH hops", () => {
    const ask = art("ask-1", 8000);
    const answer = art("ans-1", 4400, "ask-1");
    const e = answerElapsed(answer, lookup([ask, answer]));
    expect(e.ms).toBe(12400);
    expect(e.hops).toBe(2);
    expect(e.measured).toBe(2);
    expect(answerElapsedLabel(e)).toBe("12s · 2 hops");
  });

  it("a single-hop answer is unchanged, and says nothing extra", () => {
    // The ordinary row. A "· 1 hop" on every line is noise, and noise is what gets a useful
    // marker ignored on the rows that need it.
    const only = art("a", 4400);
    expect(answerElapsedLabel(answerElapsed(only, lookup([only])))).toBe("4.4s");
  });

  it("three hops still sum, and the count follows", () => {
    const rows = [art("h1", 1000), art("h2", 2000, "h1"), art("h3", 3000, "h2")];
    const e = answerElapsed(rows[2], lookup(rows));
    expect(e.ms).toBe(6000);
    expect(e.hops).toBe(3);
    expect(answerElapsedLabel(e)).toBe("6.0s · 3 hops");
  });

  it("does NOT count the time the person spent deciding", () => {
    // The whole design decision, asserted rather than described. These two artifacts are an
    // hour apart on the wall clock because somebody went to lunch mid-pick; the work was nine
    // seconds. An implementation reading created_at deltas would say an hour here and would be
    // reporting the reader, not the mesh.
    const ask = { ...art("ask-1", 5000), created_at: 1_000_000 } as Artifact;
    const answer = { ...art("ans-1", 4000, "ask-1"), created_at: 1_000_000 + 3_600_000 } as Artifact;
    const e = answerElapsed(answer, lookup([ask, answer]));
    expect(e.ms).toBe(9000);
  });
});

describe("a partial sum is never presented as a total", () => {
  it("says how many hops it covers when a leg is unmeasured", () => {
    // The common case on this substrate: the ask predates the field, the answer does not.
    const ask = art("ask-1", null);
    const answer = art("ans-1", 4400, "ask-1");
    const e = answerElapsed(answer, lookup([ask, answer]));
    expect(e.ms).toBe(4400);
    expect(e.measured).toBe(1);
    expect(e.hops).toBe(2);
    expect(answerElapsedLabel(e)).toBe("4.4s · 1 of 2 hops");
  });

  it("renders NOTHING when no hop was measured", () => {
    // Not "0.0s", and not a total of zero measurements dressed as a fast answer.
    const ask = art("ask-1", null);
    const answer = art("ans-1", null, "ask-1");
    const e = answerElapsed(answer, lookup([ask, answer]));
    expect(e.ms).toBeNull();
    expect(answerElapsedLabel(e)).toBeNull();
  });

  it("refuses a nonsense leg rather than adding it into a plausible-looking sum", () => {
    // A negative duration is reachable from a producer subtracting timestamps in the wrong
    // order. Added in, it would SHORTEN the total — a wrong number that looks entirely normal,
    // which is the failure the card-level refusal already exists to prevent.
    const ask = art("ask-1", -3000);
    const answer = art("ans-1", 4400, "ask-1");
    const e = answerElapsed(answer, lookup([ask, answer]));
    expect(e.ms).toBe(4400);
    expect(e.measured).toBe(1);
    expect(e.hops).toBe(2);
  });

  it("ZERO is a measurement and counts as one", () => {
    // A sub-millisecond cache hit is real. Treating it as unmeasured would report the fastest
    // hops as the ones nobody timed — exactly inverted.
    const ask = art("ask-1", 0);
    const answer = art("ans-1", 4400, "ask-1");
    const e = answerElapsed(answer, lookup([ask, answer]));
    expect(e.measured).toBe(2);
    expect(answerElapsedLabel(e)).toBe("4.4s · 2 hops");
  });
});

describe("the walk is bounded and does not trust the wire", () => {
  it("a parent that is not in this client's collection ends the chain", () => {
    // History not hydrated, or another browser. The chain stops at what is actually here and
    // reports the hops it could see, rather than guessing at what it could not.
    const answer = art("ans-1", 4400, "missing-parent");
    const e = answerElapsed(answer, lookup([answer]));
    expect(e.hops).toBe(1);
    expect(answerElapsedLabel(e)).toBe("4.4s");
  });

  it("a row naming ITSELF terminates", () => {
    const self = art("a", 1000, "a");
    const e = answerElapsed(self, lookup([self]));
    expect(e.hops).toBe(1);
    expect(e.ms).toBe(1000);
  });

  it("a cycle between two rows terminates", () => {
    const x = art("x", 1000, "y");
    const y = art("y", 2000, "x");
    const e = answerElapsed(x, lookup([x, y]));
    expect(e.hops).toBe(2);
    expect(e.ms).toBe(3000);
  });

  it("a very long chain is capped rather than walked forever", () => {
    const rows = Array.from({ length: 40 }, (_, i) =>
      art(`n${i}`, 1000, i === 0 ? undefined : `n${i - 1}`),
    );
    const e = answerElapsed(rows[39], lookup(rows));
    expect(e.hops).toBeLessThanOrEqual(8);
    expect(e.hops).toBeGreaterThan(1);
  });

  it("says nothing at all for no artifact", () => {
    expect(answerElapsed(null, () => undefined).ms).toBeNull();
    expect(answerElapsed(undefined, () => undefined).hops).toBe(0);
  });
});
