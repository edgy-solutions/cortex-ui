/**
 * A TWO-ARTIFACT ANSWER TOOK TWO ARTIFACTS' WORTH OF WORK, AND THE FOOTER SAYS WHICH NUMBER IS WHICH.
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
 *
 * ── AND THE THIRD: A COUNT OF ARTIFACTS IS NOT A COUNT OF HOPS ────────────────────────────
 *
 * The footer once read `7m 35s · 4 hops`. Perf's census (11-08) found the 4 counted artifacts and
 * the time was summed work, so the line read as a wall clock and an engine-hop count and was
 * neither. Each number now carries its own label, and the two only the server can measure
 * (`wall clock`, `hops`) are drawn only when served.
 */
import { describe, it, expect } from "vitest";
import { answerElapsed, answerFooter, NOT_SERVED, type FooterNumber } from "./answerElapsed";
import { artifactDuration } from "./formatDuration";
import type { Artifact } from "@/api/types";

const art = (id: string, duration_ms: number | null, parent?: string) =>
  ({
    id,
    duration_ms,
    ...(parent ? { derived_from_artifact_id: parent } : {}),
  }) as unknown as Artifact;

/** An ask card: an artifact whose output holds an ELICITATION component. */
const askCard = (id: string, duration_ms: number | null, parent?: string) =>
  ({
    ...(art(id, duration_ms, parent) as unknown as Record<string, unknown>),
    rendered_output: { components: [{ archetype: "ELICITATION" }] },
  }) as unknown as Artifact;

/** A lookup over a fixed set, the shape the panel threads in. */
const lookup = (rows: Artifact[]) => (id: string) => rows.find((r) => r.id === id);

/** The footer as a reader sees it: `label value` per number, in order. */
const line = (f: FooterNumber[]) => f.map((n) => `${n.label} ${n.value}`).join(" · ");

describe("the work is summed across the chain", () => {
  it("a two-artifact answer reports BOTH legs' work, and counts artifacts, not hops", () => {
    const ask = art("ask-1", 8000);
    const answer = art("ans-1", 4400, "ask-1");
    const e = answerElapsed(answer, lookup([ask, answer]));
    expect(e.ms).toBe(12400);
    expect(e.artifacts).toBe(2);
    expect(e.measured).toBe(2);
    // The ask is a plain artifact here (no ELICITATION), so it is a prior answer: own time only (chain of 2).
    expect(line(answerFooter(e))).toBe("this answer 4.4s · chain total 12s · artifacts 2");
  });

  it("a single-artifact answer shows only its own time; no total group", () => {
    const only = art("a", 4400);
    const f = answerFooter(answerElapsed(only, lookup([only])));
    expect(line(f)).toBe("this answer 4.4s");
    expect(f.some((n) => n.group === "total")).toBe(false);
  });

  it("three artifacts still sum, and the count follows", () => {
    const rows = [art("h1", 1000), art("h2", 2000, "h1"), art("h3", 3000, "h2")];
    const e = answerElapsed(rows[2], lookup(rows));
    expect(e.ms).toBe(6000);
    expect(e.artifacts).toBe(3);
    expect(line(answerFooter(e))).toBe("this answer 3.0s · chain total 6.0s · artifacts 3");
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
    expect(answerFooter(e).map((n) => n.key)).not.toContain("wall-clock");
  });
});

describe("a partial sum is never presented as a total", () => {
  it("says how many artifacts it covers when a leg is unmeasured", () => {
    // The common case on this substrate: the ask predates the field, the answer does not.
    const ask = art("ask-1", null);
    const answer = art("ans-1", 4400, "ask-1");
    const e = answerElapsed(answer, lookup([ask, answer]));
    expect(e.ms).toBe(4400);
    expect(e.measured).toBe(1);
    expect(e.artifacts).toBe(2);
    expect(line(answerFooter(e))).toBe("this answer 4.4s · chain total 4.4s (1 of 2 measured) · artifacts 2");
  });

  it("draws NO work when nothing was measured, and still counts the artifacts", () => {
    // Not "0.0s", and not a total of zero measurements dressed as a fast answer.
    const ask = art("ask-1", null);
    const answer = art("ans-1", null, "ask-1");
    const e = answerElapsed(answer, lookup([ask, answer]));
    expect(e.ms).toBeNull();
    expect(line(answerFooter(e))).toBe("artifacts 2");
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
    expect(e.artifacts).toBe(2);
  });

  it("ZERO is a measurement and counts as one", () => {
    // A sub-millisecond cache hit is real. Treating it as unmeasured would report the fastest
    // legs as the ones nobody timed — exactly inverted.
    const ask = art("ask-1", 0);
    const answer = art("ans-1", 4400, "ask-1");
    const e = answerElapsed(answer, lookup([ask, answer]));
    expect(e.measured).toBe(2);
    expect(line(answerFooter(e))).toBe("this answer 4.4s · chain total 4.4s · artifacts 2");
  });
});

describe("the footer shows THIS answer's time (ruled 2026-11-19)", () => {
  // prior answer (60 000) <- ask (41 000) <- answer (85 000)
  const chain = () => {
    const prior = art("prior", 60_000);
    const ask = askCard("ask", 41_000, "prior");
    const ans = art("ans", 85_000, "ask");
    return answerFooter(answerElapsed(ans, lookup([prior, ask, ans])));
  };
  const val = (f: FooterNumber[], k: string) => f.find((n) => n.key === k)?.value;

  it("this answer is the last step alone, never a chain sum", () => {
    const f = chain();
    expect(val(f, "this")).toBe(artifactDuration(85_000));
    for (const n of f.filter((x) => x.key !== "chain-total")) {
      expect(n.value).not.toBe(artifactDuration(186_000));
      expect(n.value).not.toBe(artifactDuration(126_000));
    }
    expect(f.map((n) => n.key as string)).not.toContain("work");
  });

  it("the ask's own time sits beside it, labelled", () => {
    const f = chain();
    expect(val(f, "ask")).toBe(artifactDuration(41_000));
    expect(f.find((n) => n.key === "ask")!.title).toMatch(/not included in this answer's time/);
  });

  it("the chain total is a labelled total in the apart group; this and ask are in the answer group", () => {
    const f = chain();
    expect(val(f, "chain-total")).toBe(artifactDuration(186_000));
    expect(f.find((n) => n.key === "chain-total")!.title).toMatch(/a total, not this answer's time/);
    const group = (k: string) => f.find((n) => n.key === k)!.group;
    expect(group("chain-total")).toBe("total");
    expect(group("artifacts")).toBe("total");
    expect(group("this")).toBe("answer");
    expect(group("ask")).toBe("answer");
    expect(f.map((n) => n.key)).toEqual(["this", "ask", "chain-total", "artifacts"]);
  });

  it("an ask-reached answer with nothing before the ask shows no total group", () => {
    const ask = askCard("ask", 41_000);
    const ans = art("ans", 85_000, "ask");
    const f = answerFooter(answerElapsed(ans, lookup([ask, ans])));
    expect(f.map((n) => n.key)).toEqual(["this", "ask"]);
  });

  it("an unmeasured leaf with a measured ask: no this answer, ask present", () => {
    const ask = askCard("ask", 41_000);
    const ans = art("ans", null, "ask");
    expect(answerFooter(answerElapsed(ans, lookup([ask, ans]))).map((n) => n.key)).toEqual(["ask"]);
  });

  it("near side: an ask parent with no duration draws no ask number", () => {
    const ask = askCard("ask", null);
    const ans = art("ans", 85_000, "ask");
    expect(answerFooter(answerElapsed(ans, lookup([ask, ans]))).map((n) => n.key)).toEqual(["this"]);
  });

  it("a follow-up whose parent is NOT an ask: no ask, and the chain total is shown", () => {
    const prior = art("prior", 60_000);
    const ans = art("ans", 85_000, "prior");
    const f = answerFooter(answerElapsed(ans, lookup([prior, ans])));
    expect(f.map((n) => n.key)).toEqual(["this", "chain-total", "artifacts"]);
    expect(val(f, "chain-total")).toBe(artifactDuration(145_000));
  });

  it("a chain with an unmeasured member marks the total as partial", () => {
    const prior = art("prior", null);
    const ask = askCard("ask", 41_000, "prior");
    const ans = art("ans", 85_000, "ask");
    const f = answerFooter(answerElapsed(ans, lookup([prior, ask, ans])));
    expect(val(f, "chain-total")).toBe(`${artifactDuration(126_000)} (2 of 3 measured)`);
  });
});

describe("wall clock and hops are the server's, drawn only when served", () => {
  const two = () => {
    const ask = art("ask-1", 8000);
    const answer = art("ans-1", 4400, "ask-1");
    return answerElapsed(answer, lookup([ask, answer]));
  };

  it("absent: neither is drawn, and nothing is derived to stand in for them", () => {
    expect(answerFooter(two(), NOT_SERVED).map((n) => n.key)).toEqual(["this", "chain-total", "artifacts"]);
  });

  it("served: each is its own labelled number, in the order this answer, wall clock, hops, then the total group", () => {
    const f = answerFooter(two(), { wallClockMs: 455_000, hops: 4 });
    expect(f.map((n) => n.key)).toEqual(["this", "wall-clock", "hops", "chain-total", "artifacts"]);
    expect(line(f)).toBe("this answer 4.4s · wall clock 7m 35s · hops 4 · chain total 12s · artifacts 2");
  });

  it("each served value stands alone: one served, the other absent", () => {
    expect(answerFooter(two(), { wallClockMs: 455_000, hops: null }).map((n) => n.key)).toEqual(["this", "wall-clock", "chain-total", "artifacts"]);
    expect(answerFooter(two(), { wallClockMs: null, hops: 3 }).map((n) => n.key)).toEqual(["this", "hops", "chain-total", "artifacts"]);
  });

  it("ZERO hops is a served count and is drawn", () => {
    expect(line(answerFooter(two(), { wallClockMs: null, hops: 0 }))).toBe("this answer 4.4s · hops 0 · chain total 12s · artifacts 2");
  });

  it("a served value that is not a usable number is dropped like an absent one", () => {
    for (const bad of [
      { wallClockMs: -1, hops: -1 },
      { wallClockMs: Number.NaN, hops: 2.5 },
      { wallClockMs: Infinity, hops: Number.NaN },
    ]) {
      expect(answerFooter(two(), bad).map((n) => n.key), JSON.stringify(bad)).toEqual(["this", "chain-total", "artifacts"]);
    }
  });

  it("every number carries a title saying what it measures", () => {
    for (const n of answerFooter(two(), { wallClockMs: 1000, hops: 1 })) expect(n.title, n.key).not.toBe("");
    expect(answerFooter(two()).find((n) => n.key === "this")!.title).toMatch(/not a wall clock/);
  });
});

describe("the walk is bounded and does not trust the wire", () => {
  it("a parent that is not in this client's collection ends the chain", () => {
    // History not hydrated, or another browser. The chain stops at what is actually here and
    // reports the artifacts it could see, rather than guessing at what it could not.
    const answer = art("ans-1", 4400, "missing-parent");
    const e = answerElapsed(answer, lookup([answer]));
    expect(e.artifacts).toBe(1);
    expect(line(answerFooter(e))).toBe("this answer 4.4s");
  });

  it("a row naming ITSELF terminates", () => {
    const self = art("a", 1000, "a");
    const e = answerElapsed(self, lookup([self]));
    expect(e.artifacts).toBe(1);
    expect(e.ms).toBe(1000);
  });

  it("a cycle between two rows terminates", () => {
    const x = art("x", 1000, "y");
    const y = art("y", 2000, "x");
    const e = answerElapsed(x, lookup([x, y]));
    expect(e.artifacts).toBe(2);
    expect(e.ms).toBe(3000);
  });

  it("a very long chain is capped rather than walked forever", () => {
    const rows = Array.from({ length: 40 }, (_, i) =>
      art(`n${i}`, 1000, i === 0 ? undefined : `n${i - 1}`),
    );
    const e = answerElapsed(rows[39], lookup(rows));
    expect(e.artifacts).toBeLessThanOrEqual(8);
    expect(e.artifacts).toBeGreaterThan(1);
  });

  it("says nothing at all for no artifact", () => {
    expect(answerElapsed(null, () => undefined).ms).toBeNull();
    const e = answerElapsed(undefined, () => undefined);
    expect(e.artifacts).toBe(0);
    expect(answerFooter(e, { wallClockMs: 1000, hops: 1 })).toEqual([]);
  });
});

describe("the first intent call is part of the time (2026-11-20, served intent_ms)", () => {
  const withIntent = (a: Artifact, intent_ms: unknown) => ({ ...a, intent_ms }) as unknown as Artifact;
  const own = (a: Artifact) => answerElapsed(a, lookup([a]));

  it("own = duration_ms + intent_ms", () => {
    const e = own(withIntent(art("a", 80_000), 7_800));
    expect(e.ownMs).toBe(87_800);
    expect(e.ownIntentMs).toBe(7_800);
    expect(e.ms).toBe(87_800);
    expect(e.measured).toBe(1);
  });

  it.each([
    ["absent", undefined],
    ["null", null],
    ["negative", -5],
    ["NaN", Number.NaN],
    ["a string", "7800"],
  ])("intent %s leaves own = duration_ms and ownIntentMs null", (_n, v) => {
    const e = own(withIntent(art("a", 80_000), v));
    expect(e.ownMs).toBe(80_000);
    expect(e.ownIntentMs).toBeNull();
  });

  it("zero intent is a served value and is added (ownIntentMs 0)", () => {
    const e = own(withIntent(art("a", 80_000), 0));
    expect(e.ownMs).toBe(80_000);
    expect(e.ownIntentMs).toBe(0);
  });

  it("duration null + intent: no own time, no this number, not measured", () => {
    const e = own(withIntent(art("a", null), 7_800));
    expect(e.ownMs).toBeNull();
    expect(e.ownIntentMs).toBeNull();
    expect(e.measured).toBe(0);
    expect(e.ms).toBeNull();
    expect(answerFooter(e).find((n) => n.key === "this")).toBeUndefined();
  });

  it("an ask parent's intent is added to the ask time; a pick leg without intent is unchanged", () => {
    const ask = withIntent(askCard("ask", 41_000), 9_000);
    const ans = art("ans", 85_000, "ask");
    const e = answerElapsed(ans, lookup([ask, ans]));
    expect(e.askMs).toBe(50_000);
    expect(e.askIntentMs).toBe(9_000);
    expect(e.ownMs).toBe(85_000);
    expect(e.ownIntentMs).toBeNull();
  });

  it("the chain total sums own times including intent; measured count unchanged", () => {
    const prior = withIntent(art("prior", 60_000), 6_500);
    const ask = withIntent(askCard("ask", 41_000, "prior"), 9_000);
    const ans = withIntent(art("ans", 85_000, "ask"), 7_800);
    const e = answerElapsed(ans, lookup([prior, ask, ans]));
    expect(e.ms).toBe(60_000 + 6_500 + 41_000 + 9_000 + 85_000 + 7_800);
    expect(e.measured).toBe(3);
    expect(e.artifacts).toBe(3);
  });

  it("footer titles: with intent they name the intent step and its formatted time", () => {
    const ask = withIntent(askCard("ask", 41_000), 9_000);
    const ans = withIntent(art("ans", 85_000, "ask"), 7_800);
    const f = answerFooter(answerElapsed(ans, lookup([ask, ans])));
    const t = f.find((n) => n.key === "this")!;
    expect(t.value).toBe("1m 32s");
    expect(t.title).toBe("This answer's own producer time (its last step), including its intent step (7.8s); not a wall clock");
    const a = f.find((n) => n.key === "ask")!;
    expect(a.value).toBe("50s");
    expect(a.title).toBe("The ask card's step before your pick, including its intent step (9.0s); not included in this answer's time");
  });

  it("footer titles without intent equal the old titles exactly", () => {
    const ask = askCard("ask", 41_000);
    const ans = art("ans", 85_000, "ask");
    const f = answerFooter(answerElapsed(ans, lookup([ask, ans])));
    expect(f.find((n) => n.key === "this")!.title).toBe("This answer's own producer time (its last step); not a wall clock");
    expect(f.find((n) => n.key === "ask")!.title).toBe("The ask card's step before your pick; not included in this answer's time");
  });
});
