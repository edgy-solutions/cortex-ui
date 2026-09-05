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
