/**
 * THE CONTROL FOR A CORRECT FIELD NOBODY READS.
 *
 * `available` was a field on the cost engine's refusal, emitted correctly, with zero readers in
 * the dispatch chain and zero in the presentation agent. Nothing failed. On screen the refusal
 * read as prose, and establishing why took a four-hop source trace across two repos.
 *
 * This lists the keys a payload carried that no archetype declared, by NAME, so the next one is
 * visible on the card the day it is emitted.
 */
import { describe, it, expect } from "vitest";
import { unconsumedFields } from "./unconsumedFields";

describe("keys no archetype read are reported by name", () => {
  it("reports an undeclared key on a declared archetype", () => {
    // The worked example: a hole payload carrying `available`, which no contract declares.
    const r = unconsumedFields({
      archetype: "NAMED_HOLE",
      disposition: "unentitled",
      reason: "not yours",
      available: ["2022-02-01"],
    });
    expect(r.status).toBe("unread");
    if (r.status !== "unread") return;
    expect(r.keys).toEqual(["available"]);
  });

  it("⛔ REPORTS NAMES AND NEVER VALUES — the constraint, asserted", () => {
    // A listed key is a FINDING, not a value. A value drawn from a field nobody declared a
    // treatment for has no units, no formatter and no decided meaning; and an undeclared field
    // may carry what the classification does not permit on this surface. The safe disclosure is
    // that a key EXISTS.
    const secret = "COMMERCIALLY-SENSITIVE-9912";
    const r = unconsumedFields({
      archetype: "NAMED_HOLE",
      disposition: "unentitled",
      unit_price: secret,
    });
    expect(JSON.stringify(r)).not.toContain(secret);
    if (r.status !== "unread") throw new Error("expected unread");
    expect(r.keys).toEqual(["unit_price"]);
  });

  it("says ALL_READ when the contract declares everything present", () => {
    const r = unconsumedFields({
      archetype: "NAMED_HOLE",
      disposition: "unentitled",
      reason: "r",
      panel_label: "p",
      verb_iri: "v",
    });
    expect(r.status).toBe("all_read");
  });

  it("does not report `archetype` itself — it is the discriminant, not a field", () => {
    const r = unconsumedFields({ archetype: "NAMED_HOLE", disposition: "unentitled" });
    expect(r.status).toBe("all_read");
  });

  it("says NO_DECLARATION for an archetype this repo has no contract for", () => {
    // Not "every key is unread". A control that lists twenty keys on an ordinary card is noise
    // and gets switched off inside a week, after which the real finding has no arm at all.
    const r = unconsumedFields({ archetype: "WORKFLOW_OBSERVATION", anything: 1, else: 2 });
    expect(r.status).toBe("no_declaration");
  });

  it("says NO_ARCHETYPE when the component names none — a different defect", () => {
    expect(unconsumedFields({ disposition: "unentitled" }).status).toBe("no_archetype");
    expect(unconsumedFields({ archetype: "  " }).status).toBe("no_archetype");
    expect(unconsumedFields(null).status).toBe("no_archetype");
    expect(unconsumedFields([]).status).toBe("no_archetype");
  });

  /**
   * ⛔ THE REGISTRY IS NOT EMPTY — and without this the whole control is a hollow green.
   *
   * If the contract imports failed or the map were built wrong, EVERY component would report
   * `no_declaration`, every assertion above about `no_declaration` would still pass, and the
   * control would report nothing forever while looking installed. That is the exact shape this
   * repo spent a night on: a check whose passing case asserts nothing about what it measured.
   */
  it("resolves real contracts, across more than one of them", () => {
    const declared = [
      ["NAMED_HOLE", { disposition: "x" }],
      ["ELICITATION", { slot: "x" }],
      ["KNOWLEDGE_DOCUMENT", { markdown_content: "x" }],
      ["CONTRIBUTION_RANKING", { ranked: [] }],
    ] as const;
    for (const [archetype, payload] of declared) {
      const r = unconsumedFields({ archetype, ...payload });
      expect(r.status, `${archetype} resolved no contract`).not.toBe("no_declaration");
    }
  });

  it("sorts the keys, so the report is stable between renders", () => {
    const r = unconsumedFields({
      archetype: "NAMED_HOLE",
      disposition: "unentitled",
      zeta: 1,
      alpha: 2,
      mid: 3,
    });
    if (r.status !== "unread") throw new Error("expected unread");
    expect(r.keys).toEqual(["alpha", "mid", "zeta"]);
  });
});
