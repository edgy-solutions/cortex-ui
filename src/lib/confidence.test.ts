/**
 * The IRI label helpers, at the boundary where an identifier becomes something a person reads.
 */
import { describe, it, expect } from "vitest";
import { fallbackSubjectLabel, fallbackVerbLabel, looksLikeIri } from "./confidence";

describe("a curie prefix is not the first word of a name", () => {
  it("strips ANY namespace prefix, not just `mesh:`", () => {
    // It was `^mesh:` and only that, which was right when `mesh` was the only vocabulary. A
    // `fin:` term now reaches these helpers, and rendered as "Fin funding status" — the prefix
    // read as part of the name, on the heading of the fallback card every unregistered
    // archetype lands on.
    expect(fallbackVerbLabel("fin:finFundingStatus")).toBe("Fin funding status");
    expect(fallbackSubjectLabel("fin:FundingLine")).toBe("Funding Line");
    expect(fallbackSubjectLabel("mesh:SlotElicitation")).toBe("Slot Elicitation");
  });

  it("a full IRI still resolves to its local name", () => {
    // The scheme is already gone by the time the prefix rule runs — the split on `#` and `/`
    // takes it — so there is nothing else shaped like a prefix for the rule to eat.
    expect(fallbackSubjectLabel("http://invincible-agent/mesh#SlotElicitation")).toBe(
      "Slot Elicitation",
    );
    expect(fallbackVerbLabel("http://invincible-agent/mesh#finFundingStatus")).toBe(
      "Fin funding status",
    );
  });

  it("looksLikeIri tells an identifier from something a person wrote", () => {
    // The gate on the fallback heading: a subject someone actually wrote must be left exactly
    // as written, because humanising prose is how a title becomes an invention.
    expect(looksLikeIri("mesh:SlotElicitation")).toBe(true);
    expect(looksLikeIri("http://invincible-agent/mesh#Thing")).toBe(true);
    expect(looksLikeIri("Funding Line")).toBe(false);
    expect(looksLikeIri("Operations and Maintenance")).toBe(false);
    expect(looksLikeIri(undefined)).toBe(false);
  });
});
