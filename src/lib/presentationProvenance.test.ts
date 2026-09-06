/**
 * NO NUMBER OF EXAMPLES DISTINGUISHES THE TWO CAUSES.
 *
 * Two answers from the same verb and declared output drew different cards. Either the payloads
 * genuinely differ and the selector chose correctly for each, or output_uri matched nothing,
 * the search widened, and some card's contract happened to fit the data. BOTH PRODUCE A
 * REASONABLE-LOOKING CARD, so a third data point measures the outcome and not the cause.
 *
 * `selection_basis` is the discriminator, and it is one field. It is also, today, a log line —
 * the selector computes every field of this per answer and hands it to a logger, so it reaches
 * a pod's stdout rather than the artifact. Absence is therefore the case that runs now, and the
 * one asserted hardest.
 */
import { describe, it, expect } from "vitest";
import { readPresentation, DECLARED_BASIS } from "./presentationProvenance";

const prov = (over: Record<string, unknown> = {}) => ({
  presentation_source: "registered",
  selection_basis: DECLARED_BASIS,
  candidates_considered: 3,
  candidates_satisfied: 1,
  refusals: [],
  ...over,
});

describe("the basis is the claim", () => {
  it("marks the ONE basis that means the caller declared this archetype", () => {
    expect(readPresentation(prov())!.declared).toBe(true);
    expect(DECLARED_BASIS).toBe("output_uri+payload");
  });

  it("a widening is NOT declared — this is the case that drew a bar chart", () => {
    // `mesh:PeriodCostSeries` matched no capability, the search widened, a `[{period, total}]`
    // series satisfied CHART_WIDGET, and the answer rendered with
    // `presentation_source: "registered"`. The source said nothing was wrong; the basis did.
    const p = readPresentation(
      prov({ selection_basis: "payload-only (output_uri matched no capability)" }),
    )!;
    expect(p.declared).toBe(false);
    expect(p.source).toBe("registered");
  });

  it("an UNKNOWN basis is not declared, and renders as itself", () => {
    // THE SEAL THAT MATTERS. One known-good value, never an enum of failure modes: a basis
    // nobody has written yet must not fall into a default that reads as "fine". A lookup table
    // here would be the silent-fall-through defect wearing a switch statement.
    const p = readPresentation(prov({ selection_basis: "shape-vote (something new)" }))!;
    expect(p.declared).toBe(false);
    expect(p.basis).toBe("shape-vote (something new)");
  });

  it("drops a record that cannot say HOW it chose", () => {
    // The other fields are colour. Provenance with no basis is not provenance, and a panel
    // reporting "basis: unknown" would be a measurement nobody took.
    expect(readPresentation(prov({ selection_basis: "" }))).toBeNull();
    expect(readPresentation({ presentation_source: "registered" })).toBeNull();
  });
});

describe("absence is silence, and it is the common case today", () => {
  it("returns nothing for anything that is not a record", () => {
    expect(readPresentation(undefined)).toBeNull();
    expect(readPresentation(null)).toBeNull();
    expect(readPresentation("output_uri+payload")).toBeNull();
    expect(readPresentation([])).toBeNull();
  });
});

describe("the counts and refusals are read, not inferred", () => {
  it("keeps both counts when present", () => {
    const p = readPresentation(prov({ candidates_considered: 7, candidates_satisfied: 2 }))!;
    expect(p.considered).toBe(7);
    expect(p.satisfied).toBe(2);
  });

  it("keeps a ZERO count, which is a real answer", () => {
    // "nothing could draw this" is the most informative value either field takes, and a truthy
    // check would erase exactly that case.
    const p = readPresentation(prov({ candidates_satisfied: 0 }))!;
    expect(p.satisfied).toBe(0);
  });

  it("reports a missing count as absent rather than as zero", () => {
    const p = readPresentation(prov({ candidates_considered: undefined }))!;
    expect(p.considered).toBeNull();
  });

  it("keeps refusals that name a card AND a reason", () => {
    const p = readPresentation(
      prov({ refusals: [{ archetype: "PERIOD_SERIES", reason: "rows lack `period`" }] }),
    )!;
    expect(p.refusals).toEqual([{ archetype: "PERIOD_SERIES", reason: "rows lack `period`" }]);
  });

  it("drops a refusal that declines to explain itself", () => {
    // Same rule as the eligibility trace: a refusal nobody records is a choice that looks
    // unanimous, and one rendered as a blank looks like the system spoke.
    const p = readPresentation(
      prov({ refusals: [{ archetype: "PERIOD_SERIES" }, { reason: "no rows" }, "nope"] }),
    )!;
    expect(p.refusals).toEqual([]);
  });
});
