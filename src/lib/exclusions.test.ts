/**
 * A SILENT REMOVAL IS INDISTINGUISHABLE FROM "THERE WAS NEVER AN ANSWER".
 *
 * `candidates` is what SURVIVED. Every eligibility gate — domain, arity, argument-fit,
 * permission, the productive-option gate — can delete the only verb that fits, and the record
 * afterwards shows only the survivors. So an abstention on a pool of one reads as "the
 * classifier was not sure" when the truth is "the gate deleted the answer before the classifier
 * saw it". Those need different remedies, and the record could not tell them apart.
 *
 * WHAT IS DELIBERATELY ABSENT FROM THESE TESTS: any vocabulary of gates. There is no assertion
 * that `arity` renders one way and `permission` another, because this surface must not know —
 * the point of the trace is that the NEXT gate anyone adds inherits it, and a closed enum would
 * render that one as an unknown token. That would be the silent-removal defect one layer up,
 * wearing a switch statement.
 *
 * The field is not on the wire yet. These pin the reader against the shape the record will
 * carry, and the absence case is the one that runs today.
 */
import { describe, it, expect } from "vitest";
import { presentAbstention, presentFallbackReason, readExclusions } from "./routing";

const arity = {
  verb: "mesh:planCapabilityPath",
  gate: "arity",
  reason: "needs an instance",
};

describe("reading what a gate removed", () => {
  it("keeps a well-formed row", () => {
    expect(readExclusions([arity])).toEqual([arity]);
  });

  it("returns nothing when the field is absent — silence, not a placeholder", () => {
    // Most records will not carry this for a long while, and a card claiming "0 removed" on a
    // record that never reported would be a measurement nobody took.
    expect(readExclusions(undefined)).toEqual([]);
    expect(readExclusions(null)).toEqual([]);
    expect(readExclusions("arity")).toEqual([]);
    expect(readExclusions([])).toEqual([]);
  });

  it("drops a row that names no verb", () => {
    // It removed nothing identifiable, so there is nothing to report.
    expect(readExclusions([{ gate: "arity", reason: "needs an instance" }])).toEqual([]);
    expect(readExclusions([{ verb: "   ", gate: "arity", reason: "x" }])).toEqual([]);
  });

  it("drops a removal that declines to explain itself", () => {
    // A verb with neither gate nor reason is exactly the silence this field exists to end.
    // Rendering it as "— excluded by :" is worse than nothing, because it LOOKS like the
    // system said something.
    expect(readExclusions([{ verb: "mesh:x" }])).toEqual([]);
    expect(readExclusions([{ verb: "mesh:x", gate: "", reason: "" }])).toEqual([]);
  });

  it("keeps a row with a gate but no reason, and one with a reason but no gate", () => {
    // Half an explanation is still an explanation, and both halves are the producer's to give.
    expect(readExclusions([{ verb: "mesh:x", gate: "arity" }])).toEqual([
      { verb: "mesh:x", gate: "arity", reason: "" },
    ]);
    expect(readExclusions([{ verb: "mesh:x", reason: "needs an instance" }])).toEqual([
      { verb: "mesh:x", gate: "", reason: "needs an instance" },
    ]);
  });

  it("passes an UNKNOWN gate through untouched", () => {
    // THE SEAL THAT MATTERS MOST. The next gate anyone adds must render, not fall into a
    // default. Nothing here may recognise gate names.
    const future = { verb: "mesh:z", gate: "budget-envelope", reason: "over the ceiling" };
    expect(readExclusions([future])).toEqual([future]);
  });
});

describe("the abstention says which of the two things happened", () => {
  it("is UNCHANGED when nothing was removed", () => {
    // An ordinary abstention must never get louder because this field exists.
    const plain = presentAbstention("no_verb_classified", undefined);
    const base = presentFallbackReason("no_verb_classified");
    expect(plain.title).toBe(base.title);
    expect(plain.detail).toBe(base.detail);
    expect(plain.severity).toBe(base.severity);
    expect(plain.excluded).toEqual([]);
  });

  it("names what fit and which gate took it", () => {
    // The cue the user could not reach: an arity exclusion is asking to be given a name, and
    // "no confident action" told them to try being more confident.
    const told = presentAbstention("no_verb_classified", [arity]);
    expect(told.detail).toContain("mesh:planCapabilityPath");
    expect(told.detail).toContain("arity");
    expect(told.detail).toContain("needs an instance");
    // And it ADDS to the producer's reason rather than replacing it.
    expect(told.detail.startsWith(presentFallbackReason("no_verb_classified").detail)).toBe(true);
  });

  it("counts the rest rather than listing all of them", () => {
    const many = presentAbstention("no_verb_classified", [
      arity,
      { verb: "mesh:b", gate: "domain", reason: "out of scope" },
      { verb: "mesh:c", gate: "permission", reason: "not entitled" },
    ]);
    expect(many.detail).toContain("and 2 more");
    expect(many.excluded).toHaveLength(3);
  });

  it("does not invent a gate when the producer gave only a reason", () => {
    const told = presentAbstention("no_verb_classified", [
      { verb: "mesh:x", reason: "needs an instance" },
    ]);
    // ASSERTED AS THE WHOLE CLAUSE. Written as `not.toMatch(/the\s+gate/)` this passed while
    // the code filled in a gate named "eligibility" — the invented word sat between "the" and
    // "gate" and the pattern slid straight past it. Found by mutation.
    expect(told.detail).toContain("was removed: needs an instance");
  });
});
