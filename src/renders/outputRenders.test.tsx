import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { SemanticInterpreter } from "@/components/registry/SemanticInterpreter";
import { outputRenderFor, OUTPUT_RENDERS } from "./outputRenders";
import {
  DRAFT_NO_MATRIX_CITATION,
  DRAFT_EVERY_VERIFIED_STATE,
  DRAFT_HAZ_1003,
  DRAFT_ORPHAN,
  DRAFT_WITH_CASE,
  DRAFT_URI,
  FRS_COMPLETE,
  FRS_SHORT,
  FRS_UNDATED,
  FRS_URI,
  asDocument,
} from "./fixtures/safetyReplies.derived";

afterEach(cleanup);

const draw = (comp: object) => render(<SemanticInterpreter payload={{ components: [comp] }} />).container;
const text = (c: ParentNode, sel: string) => c.querySelector(sel)?.textContent;

describe("output_uri lookup", () => {
  it("exact IRI match only, no CURIE folding", () => {
    expect(OUTPUT_RENDERS.size).toBe(2);
    expect(outputRenderFor(DRAFT_URI)).toBeDefined();
    expect(outputRenderFor(FRS_URI)).toBeDefined();
    expect(outputRenderFor("safety:FailureRecordSet")).toBeUndefined();
    expect(outputRenderFor(undefined)).toBeUndefined();
  });
});

describe("RISK_ASSESSMENT_DRAFT through SemanticInterpreter", () => {
  it("draws HAZ-1003 in the producer's vocabulary, every section in order", () => {
    const c = draw(asDocument(DRAFT_HAZ_1003));
    const root = c.querySelector('[data-output-render="' + DRAFT_URI + '"] [data-render="RISK_ASSESSMENT_DRAFT"]')!;
    expect(root).not.toBeNull();
    expect(text(c, "[data-draft-title]")).toBe(
      "HAZ-1003 — Fuel quantity probe seal degrades, allowing vapour ingress to the sense line.",
    );
    expect(text(c, "[data-draft-headline]")).toContain("severity II · probability D → Medium");
    expect(text(c, "[data-draft-matrix-citation]")).toBe("safety_risk_matrix.ttl");
    expect(c.querySelector("[data-draft-matrix-citation-missing]")).toBeNull();
    const rows = [...c.querySelectorAll("[data-draft-mitigation]")];
    expect(rows.map((r) => r.textContent)).toEqual(["MIT-2103quality.lead@example.invalidnot verified in field"]);
    // Owned but never verified: NOT an empty list, so no orphan line, but the producer's reason shows.
    expect(c.querySelector("[data-draft-orphan]")).toBeNull();
    expect(text(c, "[data-draft-orphan-reason]")).toBe("mitigation owned but never verified in the field");
    expect(text(c, "[data-draft-provenance]")).toContain("MIT-2103");
    expect([...c.querySelectorAll("[data-draft-citation]")].map((e) => e.getAttribute("data-draft-citation"))).toEqual([
      "acceptance_audience",
      "probability",
      "risk_level",
      "severity",
    ]);
    expect(text(c, "[data-draft-review]")).toContain("risk_acceptance_medium");
    expect(text(c, "[data-draft-review]")).toContain("audience: risk_acceptance_medium:SUSTAINMENT");
    expect(text(c, "[data-draft-review]")).toContain("Accept Medium risk — HAZ-1003");
    expect(text(c, "[data-draft-note]")).toContain("DRAFTED.");
    expect(c.querySelector("pre")).toBeNull();
    const order = ["title", "headline", "mitigations", "provenance", "review", "note"].map(
      (k) => c.querySelector(`[data-draft-${k}]`)!,
    );
    for (let i = 1; i < order.length; i++) {
      expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("verified_in_field is a three-state STRING: each state its own words, an unknown value verbatim", () => {
    const c = draw(asDocument(DRAFT_EVERY_VERIFIED_STATE));
    const cells = [...c.querySelectorAll("[data-draft-verified]")].map((e) => [
      e.getAttribute("data-draft-verified"),
      e.textContent,
    ]);
    expect(cells).toEqual([
      ["not_verified", "not verified in field"],
      ["true", "verified in field"],
      ["false", "field verification FAILED"],
      ["pending_trial", "verified_in_field: pending_trial"],
    ]);
  });

  it("a boolean verified_in_field is NOT read as the string vocabulary", () => {
    const c = draw(
      asDocument({
        ...DRAFT_HAZ_1003,
        mitigations: [{ mitigation_id: "MIT-9", owner: "o", verified_in_field: true }],
      }),
    );
    expect(text(c, "[data-draft-verified]")).toBe("verification not stated");
  });

  it("subline omits absent keys, never prints undefined", () => {
    const { tail: _t, ...noTail } = DRAFT_HAZ_1003 as Record<string, unknown>;
    const c = draw(asDocument(noTail));
    expect(c.textContent).not.toContain("undefined");
    expect(c.textContent).toContain("PLT-BRAVO · drafted");
  });

  it("headline names a missing half instead of printing an empty slot", () => {
    const { probability: _p, ...noProb } = DRAFT_HAZ_1003 as Record<string, unknown>;
    const c = draw(asDocument(noProb));
    expect(text(c, "[data-draft-headline]")).toContain("severity II · probability ? → Medium");
  });

  it("orphan line iff mitigations are empty, followed by the orphan_reason", () => {
    const c = draw(asDocument(DRAFT_ORPHAN));
    expect(text(c, "[data-draft-orphan]")).toBe("none recorded — orphan");
    expect(text(c, "[data-draft-orphan-reason]")).toBe("no mitigation recorded");
    expect(c.querySelector("[data-draft-mitigation]")).toBeNull();
  });

  it("no case_id: pending line and no link", () => {
    const c = draw(asDocument(DRAFT_HAZ_1003));
    expect(text(c, "[data-draft-case-pending]")).toBe("task risk-acceptance-HAZ-1003 · case not opened yet");
    expect(c.querySelector("[data-draft-case-link]")).toBeNull();
  });

  it("case_id: link to /case/<id> and no pending line", () => {
    const c = draw(asDocument(DRAFT_WITH_CASE));
    expect(c.querySelector("[data-draft-case-link]")!.getAttribute("href")).toBe("/case/case-77");
    expect(c.querySelector("[data-draft-case-pending]")).toBeNull();
  });

  it("top-level case_id also links", () => {
    const c = draw(asDocument({ ...DRAFT_HAZ_1003, case_id: "top-1" }));
    expect(c.querySelector("[data-draft-case-link]")!.getAttribute("href")).toBe("/case/top-1");
  });

  it("missing matrix citation says so", () => {
    const c = draw(asDocument(DRAFT_NO_MATRIX_CITATION));
    expect(text(c, "[data-draft-matrix-citation-missing]")).toBe("matrix citation not supplied");
    expect(c.querySelector("[data-draft-matrix-citation]")).toBeNull();
  });

  it("prose before the fence is kept", () => {
    const c = draw(asDocument(DRAFT_HAZ_1003, "A short summary line."));
    expect(c.textContent).toContain("A short summary line.");
    expect(c.querySelector("[data-render]")).not.toBeNull();
  });
});

describe("FAILURE_RECORD_SET through SemanticInterpreter", () => {
  it("header, modes, records by date, source refs, note", () => {
    const c = draw(asDocument(FRS_COMPLETE));
    expect(c.querySelector('[data-render="FAILURE_RECORD_SET"]')).not.toBeNull();
    expect(text(c, "[data-frs-header]")).toContain("part 5530-184 · 4 failures");
    expect(text(c, "[data-frs-header]")).toContain("PLT-ALPHA, PLT-BRAVO · relyence, sor-events-a · checked against 12 critical items");
    expect(c.querySelector("[data-frs-count-mismatch]")).toBeNull();
    expect([...c.querySelectorAll("[data-frs-modes] li")].map((e) => e.textContent)).toEqual([
      "Chafed wiring loom shorted the primary bus. (2)",
      "Wiring harness chafe — FMEA failure mode WH-12. (2)",
    ]);
    expect([...c.querySelectorAll("[data-frs-record]")].map((e) => e.getAttribute("data-frs-record"))).toEqual([
      "FR-6002",
      "FR-6001",
      "FR-6003",
      "FR-6004",
    ]);
    const first = c.querySelector('[data-frs-record="FR-6002"]')!;
    expect(first.textContent).toContain("2026-01-11");
    expect(first.textContent).toContain("Wiring harness chafe — FMEA failure mode WH-12.");
    expect(first.querySelector("[data-frs-source]")!.textContent).toBe("relyence · relyence:FM-7734");
    expect(text(c, "[data-frs-note]")).toContain("4 failure(s) for 5530-184");
    expect(c.querySelector("pre")).toBeNull();
  });

  it("mismatch line iff counts differ", () => {
    const c = draw(asDocument(FRS_SHORT));
    expect(text(c, "[data-frs-count-mismatch]")).toBe("4 of 6 records arrived");
  });

  it("undated record sorts last and says so", () => {
    const c = draw(asDocument(FRS_UNDATED));
    const ids = [...c.querySelectorAll("[data-frs-record]")].map((e) => e.getAttribute("data-frs-record"));
    expect(ids[ids.length - 1]).toBe("FR-6000");
    expect(c.querySelector('[data-frs-record="FR-6000"]')!.textContent).toContain("date not recorded");
  });
});

describe("fences with no typed render", () => {
  it("unknown output_uri -> StructuredFields naming that uri", () => {
    const uri = "http://internal/sustainment/safety#SomethingNew";
    const c = draw(asDocument({ refused: false, output_uri: uri, a: 1, nested: { x: [1, 2] } }));
    expect(c.querySelector(`[data-no-render-registered="${uri}"]`)!.textContent).toBe(`no render registered for ${uri}`);
    expect(c.querySelector("[data-structured-fields]")).not.toBeNull();
    expect(c.querySelector("pre")).toBeNull();
  });

  it("a fence without output_uri -> no render registered for KNOWLEDGE_DOCUMENT", () => {
    const c = draw(asDocument({ refused: false, a: 1 }));
    expect(c.querySelector("[data-no-render-registered]")!.textContent).toBe(
      "no render registered for KNOWLEDGE_DOCUMENT",
    );
  });

  it("a refused fence without an envelope draws the refusal block only", () => {
    const c = draw(asDocument({ refused: true, outcome: "unknown_part", reason: "unknown part 'x'", output_uri: FRS_URI }));
    expect(c.querySelector("[data-refusal]")).not.toBeNull();
    expect(c.textContent).toContain("unknown part 'x'");
    expect(c.querySelector("[data-render]")).toBeNull();
    expect(c.querySelector("pre")).toBeNull();
  });

  it("a non-reply json block inside prose draws structured, not a code block", () => {
    const c = draw({
      archetype: "KNOWLEDGE_DOCUMENT",
      markdown_content: 'Intro.\n\n```json\n{"a": 1}\n```\n\nOutro after the block.',
    });
    expect(c.querySelector("[data-json-block-structured]")).not.toBeNull();
    expect(c.querySelector("pre")).toBeNull();
  });

  it("an unparseable json block stays a code block", () => {
    const c = draw({ archetype: "KNOWLEDGE_DOCUMENT", markdown_content: "```json\n{nope\n```\n\nafter" });
    expect(c.querySelector("[data-json-block-structured]")).toBeNull();
    expect(c.querySelector("pre")).not.toBeNull();
  });
});
