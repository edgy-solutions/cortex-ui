/**
 * WHAT CORTEX SENDS, ASSERTED WHERE IT CAN BE — the client half of "did the row land".
 *
 * The open question on the ELICITATION card is why an ask still renders as KNOWLEDGE_DOCUMENT
 * with the door reporting `ELICITATION admitted: True`. Two claims were on the table —
 * admitted-at-the-door and present-in-the-menu — and only the second selects. A third was
 * mine and is closed below by reading the selector rather than by asserting: `_affinity` in
 * `capability_registry.py` is RANKING ONLY, explicitly "never overrides satisfaction", so the
 * empty `persona_fit`/`domain_fit` on this row cannot exclude it. That was worth checking,
 * because an empty affinity list excluding a row would have looked exactly like this.
 *
 * WHAT A TEST HERE CAN AND CANNOT SETTLE. It can prove the row is in the payload cortex POSTS.
 * It cannot prove the server kept it — `accepted` is the server's count, and the console line
 * in `App.tsx` exists precisely because a count alone could not tell those apart. So this file
 * removes cortex from the suspect list and does not pretend to clear anyone else.
 */
import { describe, it, expect } from "vitest";
import { assembleCapabilities, assembleDerivedCapabilities } from "./assembleCapabilities";
import { CORTEX_UI_CAPABILITIES } from "./frontendCapabilities";
import { ELICITATION_CONTRACT } from "../components/elicitation/Elicitation.contract";
import { COMPETING_MEASURES_CONTRACT } from "../components/planning/CompetingMeasures.contract";

const sent = assembleCapabilities(CORTEX_UI_CAPABILITIES);
const row = sent.find((c) => c.archetype === "ELICITATION");

describe("the ELICITATION row is in the payload cortex posts", () => {
  it("is present at all, and exactly once", () => {
    expect(row, "no ELICITATION row in the registration payload").toBeTruthy();
    expect(sent.filter((c) => c.archetype === "ELICITATION")).toHaveLength(1);
  });

  it("carries the subject the producer stamps", () => {
    // `slot_disposition.py` stamps `output_uri: http://invincible-agent/mesh#SlotElicitation`.
    // The registry's `_canonical()` folds both that and the compact form to `SlotElicitation`,
    // which is why the compact form here is not a mismatch.
    expect(row!.subject_uri).toBe("mesh:SlotElicitation");
    const canonical = (s: string) => s.split("#").pop()!.split(":").pop()!;
    expect(canonical(row!.subject_uri)).toBe(canonical("http://invincible-agent/mesh#SlotElicitation"));
  });

  it("advertises the component the interpreter actually dispatches", () => {
    expect(row!.component).toBe("AskCardConnected");
  });

  it("its expected_fields are the contract's, not a restatement", () => {
    // The satisfaction step keeps only what the payload satisfies, and these are the names it
    // is checked against — so a field list that drifted from the contract would refuse the
    // card the contract was written for.
    expect(row!.expected_fields).toEqual(Object.keys(ELICITATION_CONTRACT.fields));
    expect(row!.expected_fields).toContain("slot");
    expect(row!.expected_fields).toContain("total_count");
  });

  it("empty affinities are DELIBERATE and are not a missing value", () => {
    // An ask is not better suited to a finance analyst than to anyone else. Safe because the
    // server ranks on these and never filters — verified by reading `_affinity`, not assumed.
    expect(row!.persona_fit).toEqual([]);
    expect(row!.domain_fit).toEqual([]);
  });

  it("is derived from the component's own contract", () => {
    expect(row!.contract_source).toBe("derived");
    expect(assembleDerivedCapabilities().some((c) => c.archetype === "ELICITATION")).toBe(true);
  });
});

/**
 * ENGINE-COST'S SEVEN SUBJECTS.
 *
 * "Where did the money go" routed perfectly — conf 1.00, endpoint reached, slot accepted,
 * `rendersAs` present in the graph — and rendered KNOWLEDGE_DOCUMENT, because
 * `select_archetype` found no capability on THIS menu whose subject matched, widened to
 * payload-only, and nothing was declared for it. The archetypes were never missing; only the
 * subject bindings were.
 *
 * THE REFUSAL IS ADR-0017 WORKING. The backend will not hand a surface an archetype the surface
 * never said it could draw. It reads exactly like a defect, which is the case for wrong answers
 * having distinguishable shapes.
 */
describe("the cost subjects are declared", () => {
  const COST = {
    "http://invincible-agent/cost#CategoryBreakdown": "CONTRIBUTION_RANKING",
    "http://invincible-agent/cost#LaborComposition": "CONTRIBUTION_RANKING",
    "http://invincible-agent/cost#LotCostBreakdown": "CONTRIBUTION_RANKING",
    "http://invincible-agent/cost#SupplierConcentration": "CONTRIBUTION_RANKING",
    "http://invincible-agent/cost#UnitPriceTrend": "MULTI_SERIES",
    "http://invincible-agent/cost#RateAssumptions": "MULTI_SERIES",
    "http://invincible-agent/cost#RateComparison": "DELTA_SET",
  } as const;

  it("every one is bound, to the archetype engine-cost declared for it", () => {
    for (const [subject, archetype] of Object.entries(COST)) {
      const row = sent.find((c) => c.subject_uri === subject);
      expect(row, `${subject} is not declared`).toBeTruthy();
      expect(row!.archetype, subject).toBe(archetype);
    }
  });

  it("each resolves under the registrar's canonicalisation", () => {
    // `_canonical()` folds a full IRI and a CURIE to the same token, which is what lets these
    // full IRIs meet the graph's `cost#` classes and cortex's older `cost:` row. Asserted so a
    // future row spelled a third way is caught here rather than by an unrenderable answer.
    const canonical = (s: string) => s.split("#").pop()!.split(":").pop()!;
    for (const subject of Object.keys(COST)) {
      expect(canonical(subject)).toMatch(/^[A-Za-z]+$/);
      expect(canonical(subject)).not.toContain("/");
    }
    expect(canonical("http://invincible-agent/cost#CategoryBreakdown")).toBe(
      canonical("cost:CategoryBreakdown"),
    );
  });

  it("they REUSE existing archetypes and mint nothing", () => {
    // The whole point: no new component, no new contract, no prime needed. A row that named an
    // archetype the interpreter does not dispatch is caught by the dispatch seal above, but a
    // row that quietly MINTED one would be a much larger change wearing a binding's clothes.
    const archetypes = new Set(Object.values(COST));
    for (const a of archetypes) {
      const drawnElsewhere = sent.filter((c) => c.archetype === a && !c.subject_uri.includes("cost#"));
      expect(drawnElsewhere.length, `${a} is not already drawn for another subject`).toBeGreaterThan(0);
    }
  });

  it("SupplierConcentration is not silently identical to the other three", () => {
    // Its rows carry an extra `above_threshold`. That is a ROW field and this contract's
    // `fields` are the ENVELOPE, so the binding is legitimately the same — but the distinction
    // is recorded here so "they were all the same anyway" is never the reason it stays that way.
    const supplier = sent.find((c) => c.subject_uri.endsWith("SupplierConcentration"))!;
    const category = sent.find((c) => c.subject_uri.endsWith("CategoryBreakdown"))!;
    expect(supplier.archetype).toBe(category.archetype);
    expect(supplier.subject_uri).not.toBe(category.subject_uri);
  });
});

/**
 * COMPETING_MEASURES — the binding, asserted because nothing else could see it.
 *
 * The archetype, its contract, its component and its dispatch were all sealed and all green
 * while the REGISTRY ROW was a mutation away from naming the wrong subject. Two mutations —
 * delete the binding, and point it at `fin:EstimateAtCompletion` instead of its Comparison —
 * both survived the component suite, because a component test cannot see which subject the
 * server will be told this card draws.
 *
 * That is the edge again: every node verified, the connection unasserted. And the second
 * mutation is the worse one — pointing at the SINGULAR subject would bind the comparison card
 * to the one-forecast verb, so a single EAC would render as a comparison of one. It would look
 * like a working binding.
 */
describe("the EAC comparison is bound", () => {
  const row = sent.find((c) => c.archetype === "COMPETING_MEASURES");

  it("is present, exactly once", () => {
    expect(row, "no COMPETING_MEASURES row in the registration payload").toBeTruthy();
    expect(sent.filter((c) => c.archetype === "COMPETING_MEASURES")).toHaveLength(1);
  });

  it("names the COMPARISON subject, not the singular one", () => {
    // `fin:EstimateAtCompletion` is FORECAST_MEASURE's — one method, chosen deliberately by a
    // mandatory slot. Binding this card there would draw a comparison of one and look fine.
    expect(row!.subject_uri).toBe("fin:EstimateAtCompletionComparison");
    expect(row!.subject_uri).not.toBe("fin:EstimateAtCompletion");
  });

  it("does not steal the singular subject from FORECAST_MEASURE", () => {
    // The other direction of the same mistake: both rows must survive, each with its own card.
    const singular = sent.find((c) => c.subject_uri === "fin:EstimateAtCompletion");
    expect(singular, "fin:EstimateAtCompletion lost its binding").toBeTruthy();
    expect(singular!.archetype).toBe("FORECAST_MEASURE");
  });

  it("dispatches to the component the interpreter actually renders", () => {
    expect(row!.component).toBe("CompetingMeasures");
  });

  it("its expected_fields are the contract's, not a restatement", () => {
    expect(row!.expected_fields).toEqual(Object.keys(COMPETING_MEASURES_CONTRACT.fields));
    expect(row!.expected_fields).toContain("rows");
    expect(row!.expected_fields).toContain("spread");
  });
});
