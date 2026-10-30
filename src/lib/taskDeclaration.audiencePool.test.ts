import { describe, it, expect } from "vitest";
import { AUDIENCE_POOL_OF, audienceKindContradiction, offeredVerbs } from "./taskDeclaration";

// Every prefix is a declared kind here, so the only thing that can return null is the rule under test.
const allDeclared = () => true;

describe("audienceKindContradiction — a kind filed to another kind's steward pool", () => {
  it("document_empty_confirm filed to document_promotion:<DOMAIN> is NOT a contradiction", () => {
    expect(audienceKindContradiction("document_promotion:SUSTAINMENT", "document_empty_confirm", allDeclared)).toBeNull();
  });
  it("control: the same prefix on a DIFFERENT kind still contradicts", () => {
    expect(audienceKindContradiction("document_promotion:SUSTAINMENT", "workflow_ack", allDeclared)).toEqual({
      audienceKind: "document_promotion",
      taskKind: "workflow_ack",
    });
  });
  it("the exempt kind with a DIFFERENT declared prefix still contradicts", () => {
    expect(audienceKindContradiction("risk_acceptance_high:SUSTAINMENT", "document_empty_confirm", allDeclared)).toEqual({
      audienceKind: "risk_acceptance_high",
      taskKind: "document_empty_confirm",
    });
  });
  it("the table is exactly the one pair, and a prototype key is not an exemption", () => {
    expect(AUDIENCE_POOL_OF).toEqual({ document_empty_confirm: "document_promotion" });
    expect(audienceKindContradiction("document_promotion:X", "constructor", allDeclared)).not.toBeNull();
  });
});

describe("offeredVerbs", () => {
  it("no declaration, no verbs: fail closed (architect 2026-10-30)", () => {
    expect(offeredVerbs(null)).toEqual([]);
  });
});
