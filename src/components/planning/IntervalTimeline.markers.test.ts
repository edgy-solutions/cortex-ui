/**
 * Milestones -> markers, and the one thing this conversion must never do.
 *
 * `flag` is COMPUTED UPSTREAM. Re-deriving it from `date` against the reader's clock would
 * make a card opened in January and one opened in July disagree about the same plan, and only
 * the producer knows which state version it evaluated.
 *
 * It would also make a claim the producer refuses to make. The field was `overdue?: boolean`
 * for one day; `plan_capability_path` computes "last contribution end > target date" and
 * declines to call that MISSED, because the model holds no per-plateau maturity requirement —
 * a capability can reach the maturity an early plateau needs long before its last contributing
 * project finishes. A clock comparison in the renderer silently reinstates exactly that refused
 * claim: arithmetic in the view overruling the measure.
 *
 * These tests were written after a red-proof walked straight past this file. Replacing the
 * payload read with `start < new Date()` broke nothing, because nothing tested the converter —
 * a weak guard, not a void mutation.
 */
import { describe, it, expect } from "vitest";
import { toMarkers } from "./IntervalTimeline";

const PAST = "2020-01-15";
const FUTURE = "2099-06-01";

describe("toMarkers — the flag is read, never derived", () => {
  it("a PAST-dated milestone with NO flag gets NO flag styling", () => {
    // The load-bearing negative, and the one the red-proof exposed. Any clock comparison here
    // turns this red, because the date alone is not the judgement.
    const [m] = toMarkers([{ milestone_id: "m1", label: "Plateau 1", date: PAST }]);
    expect(m.css).toBe("wx-milestone");
    expect(m.css).not.toMatch(/wx-flag-/);
  });

  it("a FUTURE-dated milestone WITH a flag keeps it", () => {
    // The mirror. If the flag were derived, a future date would strip a flag the producer set.
    const [m] = toMarkers([
      { milestone_id: "m1", label: "Plateau 2", date: FUTURE, flag: "contributions-outstanding" },
    ]);
    expect(m.css).toContain("wx-flag-contributions-outstanding");
  });

  it("passes an UNKNOWN flag through — the value is vocabulary this component never learns", () => {
    // Same generic-styling-key pattern as `risk_flag` on a row: style an unknown string and
    // stop. A renderer that branched on today's only value would have to be edited for the
    // next one.
    const [m] = toMarkers([{ milestone_id: "m1", label: "X", date: FUTURE, flag: "some-future-word" }]);
    expect(m.css).toContain("wx-flag-some-future-word");
  });

  it("carries the label verbatim and the date as its axis position", () => {
    const [m] = toMarkers([{ milestone_id: "m1", label: "Target", date: FUTURE }]);
    expect(m.text).toBe("Target");
    expect(m.start.toISOString().slice(0, 10)).toBe(FUTURE);
  });
});

describe("toMarkers — absence and malformation", () => {
  it("no milestones means NO markers, never an invented one", () => {
    // `milestones` is optional in the contract; absent means the payload said nothing.
    expect(toMarkers(undefined)).toEqual([]);
    expect(toMarkers(null)).toEqual([]);
    expect(toMarkers([])).toEqual([]);
    expect(toMarkers("nonsense")).toEqual([]);
  });

  it("DROPS a milestone whose date cannot be placed on the axis", () => {
    // Placing it at the epoch would draw a mark decades to the left of the plan, which reads
    // as a real milestone in 1970 rather than as a payload problem.
    expect(toMarkers([{ milestone_id: "m1", label: "X", date: "not-a-date" }])).toEqual([]);
    expect(toMarkers([{ milestone_id: "m1", label: "X" }])).toEqual([]);
    expect(toMarkers([null, 42, "x"])).toEqual([]);
  });

  it("keeps the good marks when one in the set is malformed", () => {
    // A single bad row must not cost the reader the rest of the plan's marks.
    const out = toMarkers([
      { milestone_id: "a", label: "Good", date: FUTURE },
      { milestone_id: "b", label: "Bad", date: "" },
      { milestone_id: "c", label: "Also good", date: PAST },
    ]);
    expect(out.map((m) => m.text)).toEqual(["Good", "Also good"]);
  });
});
