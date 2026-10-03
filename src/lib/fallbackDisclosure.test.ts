/**
 * A GENERALIST ANSWER MUST SAY SO, AND MUST NOT DRAW THE CONFIDENT CARD.
 *
 * The defect these arms are about shipped for as long as the flag has existed: `routing.fallback`
 * was read by the answers panel (which collapsed the row) and by the card chrome (which turned
 * amber) and by NOTHING that decides what the body renders. So a fallback with a composed payload
 * drew a metric with a number in it, a chart, a document — exactly the card a specialist produces,
 * differing by a colour and a word in a list.
 *
 * ⛔ THE PARTITION UNDER TEST IS NOT "FALLBACK OR NOT". It is what a component CLAIMS. Measured on
 * `sessions/2026-09-19-payload-finance-performance-indices.json`, which is `fallback: true` with
 * `fallback_reason: no_verb_classified` AND a composed ELICITATION: a rule that hid the body of
 * every fallback would hide the menu the reader is meant to answer. So the arms below come in
 * pairs — the claim is withheld, the request is not — because either half alone is a rule that
 * is right about one kind of payload and wrong about the other.
 *
 * The rendering of all this is `src/components/AgenticCanvas/answerBody.test.tsx`; what is here is
 * the decision.
 */
import { describe, it, expect } from "vitest";
import {
  carriesItsRequest,
  claimsAnAnswer,
  readFallbackDisclosure,
  splitFallbackComponents,
} from "./fallbackDisclosure";
import { DISPLAY_ARCHETYPES } from "./answerDisplay";

const comp = (archetype: string) => ({ archetype, data: { anything: 1 } });

describe("a disclosure is produced for a fallback and for nothing else", () => {
  it("reads the producer's reason and presents the vocabulary's own words", () => {
    // `no_verb_classified` is the reason on the captured payload, so it is the one asserted.
    const d = readFallbackDisclosure({ fallback: true, fallback_reason: "no_verb_classified" });
    expect(d).not.toBeNull();
    expect(d!.reason).toBe("no_verb_classified");
    // Not asserted verbatim: the text belongs to `presentFallbackReason` and this module must not
    // own a second copy of it. What must hold is that something was said, and that it is that
    // function's answer rather than an invention here.
    expect(d!.title.length).toBeGreaterThan(0);
    expect(d!.detail.length).toBeGreaterThan(0);
    expect(["alarm", "warn", "info"]).toContain(d!.severity);
  });

  it("does NOT invent a disclosure for a specialist answer", () => {
    // The near side, and the one that costs most if it breaks: every ordinary answer in the app
    // goes through here, and a disclosure on all of them is a disclosure on none of them.
    expect(readFallbackDisclosure({ fallback: false, fallback_reason: "no_verb_classified" })).toBeNull();
    expect(readFallbackDisclosure({ decision: "routed", capability: "finance" })).toBeNull();
  });

  it("treats a MISSING flag as a specialist answer, never as a fallback", () => {
    /*
      POSITIVE TEST FOR `true`, the same rule `composed` follows in the template catalog. Every
      answer that predates the field has no flag, and reading absence as a fallback would put a
      disclosure on all of them — which teaches a reader to ignore it, and an ignored disclosure
      also covers the real ones. Each form is a separate arm's worth of risk, so each is named.
    */
    expect(readFallbackDisclosure({})).toBeNull();
    expect(readFallbackDisclosure({ fallback: undefined })).toBeNull();
    expect(readFallbackDisclosure({ fallback: "true" })).toBeNull(); // a STRING is not the flag
    expect(readFallbackDisclosure({ fallback: 1 })).toBeNull();
    expect(readFallbackDisclosure(null)).toBeNull();
    expect(readFallbackDisclosure(undefined)).toBeNull();
    expect(readFallbackDisclosure("fallback")).toBeNull();
  });

  it("says the fallback happened even when no reason was recorded, and invents none", () => {
    // The unexplained case is the one a reader can act on LEAST, so it is louder rather than
    // quieter — and `reason` stays EMPTY rather than being filled with a plausible token.
    for (const routing of [
      { fallback: true },
      { fallback: true, fallback_reason: "" },
      { fallback: true, fallback_reason: "   " },
      { fallback: true, fallback_reason: 7 },
    ]) {
      const d = readFallbackDisclosure(routing);
      expect(d, JSON.stringify(routing)).not.toBeNull();
      expect(d!.reason).toBe("");
      expect(d!.severity).toBe("warn");
      expect(d!.detail).toContain("no reason");
    }
  });

  it("renders a reason this build has never heard of AS ITSELF", () => {
    // The verbatim rule: a producer token cortex does not know must reach the screen unchanged
    // rather than being reported as unknown. `presentFallbackReason`'s `never` default is what
    // makes the cast in `readFallbackDisclosure` safe, so it is asserted rather than assumed.
    const d = readFallbackDisclosure({ fallback: true, fallback_reason: "some_future_reason" });
    expect(d!.reason).toBe("some_future_reason");
    expect(d!.detail).toContain("some_future_reason");
  });
});

describe("what claims an answer, and what merely asks", () => {
  it("every archetype the app can display has been classified", () => {
    /*
      ⛔ THE CENSUS IS OVER THE DISPLAY VOCABULARY, NOT OVER THE TABLE'S OWN KEYS. Iterating the
      table would agree with itself by construction — the shape that has left a derived register
      green in this repo before. `DISPLAY_ARCHETYPES` is declared elsewhere for another purpose,
      so it is an independent population, and a new member arriving there without a decision here
      is what this arm is for. The compiler catches the same thing at build time; this catches it
      in a form that names the missing member.
    */
    expect(DISPLAY_ARCHETYPES.length).toBeGreaterThan(10); // positive control on the population
    for (const a of DISPLAY_ARCHETYPES) {
      expect(typeof claimsAnAnswer(a), `${a} is unclassified`).toBe("boolean");
    }
  });

  it("the requests are the four that ask the reader for something", () => {
    // Named individually rather than counted, because "four are false" holds just as well if
    // the wrong four are.
    expect(claimsAnAnswer("ELICITATION")).toBe(false);
    expect(claimsAnAnswer("APPROVAL_TASK")).toBe(false);
    expect(claimsAnAnswer("TRIAGE_TASK")).toBe(false);
    // RULED 2026-10-02: a case is a pending human decision, not an answer.
    expect(claimsAnAnswer("WORKFLOW_CASE")).toBe(false);
  });

  it("and the answers are answers, including the two that look like exceptions", () => {
    expect(claimsAnAnswer("ASSET_STATE_METRIC")).toBe(true);
    expect(claimsAnAnswer("CHART_WIDGET")).toBe(true);
    expect(claimsAnAnswer("KNOWLEDGE_DOCUMENT")).toBe(true);
    // `NAMED_HOLE` says "this exists and is empty", which is a statement about the world and not
    // a request — a generalist is in no position to make it. `UNKNOWN` has said nothing about
    // being a request, and under a fallback the strict reading is the safe one.
    expect(claimsAnAnswer("NAMED_HOLE")).toBe(true);
    expect(claimsAnAnswer("UNKNOWN")).toBe(true);
    // A part's location on a drawing is an assertion, never a question.
    expect(claimsAnAnswer("ILLUSTRATION")).toBe(true);
  });

  it("an archetype nobody has classified counts as a CLAIM", () => {
    // The fail-safe direction, and both ways a component can arrive nameless.
    expect(claimsAnAnswer("SOME_ARCHETYPE_FROM_A_LATER_PRODUCER")).toBe(true);
    expect(claimsAnAnswer("")).toBe(true);
    // Lower case is not the vocabulary: the table is keyed on the wire's own spelling, so a
    // mismatched case is unclassified and therefore strict. Asserted so the default is not
    // mistaken for a normaliser that is missing.
    expect(claimsAnAnswer("elicitation")).toBe(true);
  });
});

describe("the split withholds claims, keeps requests, and never loses a component", () => {
  const FALLBACK = { fallback: true, fallback_reason: "no_verb_classified" };

  it("hands back everything untouched when routing reached a specialist", () => {
    // Identity, and by identity of the ARRAY's contents rather than its length — a split that
    // rebuilt the list in a different order would pass a length check.
    const components = [comp("CHART_WIDGET"), comp("ELICITATION")];
    const out = splitFallbackComponents({ fallback: false }, components);
    expect(out.withheld).toBe(0);
    expect(out.shown).toEqual(components);
  });

  it("withholds the confident card and COUNTS it", () => {
    const out = splitFallbackComponents(FALLBACK, [comp("ASSET_STATE_METRIC")]);
    expect(out.shown).toEqual([]);
    // The count is the claim. A body that silently drops components is indistinguishable from a
    // payload that never had them — the producer's own rule for the list it shortens.
    expect(out.withheld).toBe(1);
  });

  it("keeps the ELICITATION, which is the payload this was measured on", () => {
    // The real capture is `fallback: true` WITH an ask. Withholding it strands the reader
    // mid-elicitation on the very arc that was repaired the same morning.
    const ask = comp("ELICITATION");
    const out = splitFallbackComponents(FALLBACK, [ask]);
    expect(out.shown).toEqual([ask]);
    expect(out.withheld).toBe(0);
  });

  it("splits a MIXED payload, which is the shape that makes both halves matter at once", () => {
    const ask = comp("ELICITATION");
    const approval = comp("APPROVAL_TASK");
    const out = splitFallbackComponents(FALLBACK, [
      comp("CHART_WIDGET"),
      ask,
      comp("KNOWLEDGE_DOCUMENT"),
      approval,
    ]);
    expect(out.shown).toEqual([ask, approval]);
    expect(out.withheld).toBe(2);
    // EVERY component is accounted for, by cardinality. A membership check cannot see one that
    // fell out of both buckets — which is the whole defect being guarded against.
    expect(out.shown.length + out.withheld).toBe(4);
  });

  it("accounts for a component with no archetype at all, rather than dropping it", () => {
    // Malformed entries are still components. Under a fallback they are claims (unclassified), so
    // they are withheld — but they are COUNTED, and the total still reconciles.
    const out = splitFallbackComponents(FALLBACK, [{}, null, "not an object", comp("ELICITATION")]);
    expect(out.withheld).toBe(3);
    expect(out.shown.length + out.withheld).toBe(4);
  });

  it("an empty payload produces an empty split, not a phantom count", () => {
    expect(splitFallbackComponents(FALLBACK, [])).toEqual({ shown: [], withheld: 0 });
  });

  it("keeps a WORKFLOW_CASE that carries its case object, beside the disclosure", () => {
    const kase = { archetype: "WORKFLOW_CASE", case: { subject_ref: "X-1", instances: [] } };
    const claim = comp("CHART_WIDGET");
    const out = splitFallbackComponents(FALLBACK, [claim, kase]);
    expect(out.shown).toEqual([kase]);
    expect(out.withheld).toBe(1);
  });

  it("COUNTS a WORKFLOW_CASE with no case object — nothing to decide, never dropped silently", () => {
    for (const missing of [undefined, null, [], "a string"]) {
      const out = splitFallbackComponents(FALLBACK, [{ archetype: "WORKFLOW_CASE", case: missing }]);
      expect(out, `case: ${JSON.stringify(missing)}`).toEqual({ shown: [], withheld: 1 });
    }
  });

  it("the presence rule reads the package row's key, so other requests are untouched by it", () => {
    expect(carriesItsRequest({ archetype: "WORKFLOW_CASE", case: {} }, "WORKFLOW_CASE")).toBe(true);
    expect(carriesItsRequest({ archetype: "WORKFLOW_CASE", rows: {} }, "WORKFLOW_CASE")).toBe(false);
    expect(carriesItsRequest(comp("ELICITATION"), "ELICITATION")).toBe(true);
  });

  it("agrees with the classification for EVERY displayable archetype, one at a time", () => {
    /*
      The table decides; this proves the split consults it, member by member, so a hardcoded
      branch for one archetype cannot hide behind the sample above. Both sides are counted, so
      neither "nothing is ever withheld" nor "everything is" passes.
    */
    let withheldSeen = 0;
    let shownSeen = 0;
    for (const a of DISPLAY_ARCHETYPES) {
      // A WELL-FORMED component per archetype: a request is kept only when it carries what it asks
      // about (`carriesItsRequest`), and that rule has its own arms above — this one is about the table.
      const c = a === "WORKFLOW_CASE" ? { ...comp(a), case: {} } : comp(a);
      const out = splitFallbackComponents(FALLBACK, [c]);
      if (claimsAnAnswer(a)) {
        expect(out, a).toMatchObject({ withheld: 1 });
        expect(out.shown, a).toEqual([]);
        withheldSeen += 1;
      } else {
        expect(out, a).toMatchObject({ withheld: 0 });
        expect(out.shown.length, a).toBe(1);
        shownSeen += 1;
      }
    }
    expect(withheldSeen).toBeGreaterThan(0);
    expect(shownSeen).toBeGreaterThan(0);
  });
});
