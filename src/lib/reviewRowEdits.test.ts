/**
 * The VITE_REVIEW_ROW_EDITS flag (default ON, only exact "false" is OFF) and the send builders:
 * `buildRowEdits` (the row_edits object) and `buildActBody` (the /act body). The key sets are
 * sealed against the producer in rowEditsWireParity.test.ts; these arms pin the behaviour.
 */
import { afterEach, describe, expect, it } from "vitest";
import { buildActBody } from "@/api/client";
import {
  REVIEW_ROW_EDITS_DEFAULT,
  buildRowEdits,
  isReviewRowEditsEnabled,
  resolveReviewRowEdits,
  type RowEditDraft,
} from "./reviewRowEdits";

const setRuntime = (v: unknown) => {
  (window as { __RUNTIME_CONFIG__?: unknown }).__RUNTIME_CONFIG__ = v;
};
afterEach(() => setRuntime(undefined));

describe("the flag", () => {
  it("defaults ON", () => {
    expect(REVIEW_ROW_EDITS_DEFAULT).toBe(true);
  });
  it("unset (no runtime config at all) is ON", () => {
    setRuntime(undefined);
    expect(isReviewRowEditsEnabled()).toBe(true);
  });
  it('"" (what the entrypoint writes for an unset env) is ON', () => {
    setRuntime({ VITE_REVIEW_ROW_EDITS: "" });
    expect(isReviewRowEditsEnabled()).toBe(true);
  });
  it('"true" is ON', () => {
    setRuntime({ VITE_REVIEW_ROW_EDITS: "true" });
    expect(isReviewRowEditsEnabled()).toBe(true);
  });
  it('"false" is OFF', () => {
    setRuntime({ VITE_REVIEW_ROW_EDITS: "false" });
    expect(isReviewRowEditsEnabled()).toBe(false);
  });
  it('strict: "FALSE" and " false" are NOT off', () => {
    expect(resolveReviewRowEdits("FALSE")).toBe(true);
    expect(resolveReviewRowEdits(" false")).toBe(true);
    expect(resolveReviewRowEdits("false ")).toBe(true);
  });
});

const full = (): RowEditDraft => ({
  deleted: { "DEL-1": { reason: " dup " } },
  addedMpns: ["ADD-1"],
  corrected: { "COR-1": "COR-1X" },
  overrides: { "ADD-1": { disposition: "dispatchQualification", reason: " missed " } },
  addedEvidence: { "ADD-1": " p.2 " },
  correctedEvidence: { "COR-1": " p.3 " },
});

describe("buildRowEdits", () => {
  it("emits exactly the producer's key set per entry type, trimmed", () => {
    const e = buildRowEdits(full());
    expect(e).toEqual({
      deleted: [{ mpn: "DEL-1", reason: "dup" }],
      added: [{ mpn: "ADD-1", disposition: "dispatchQualification", reason: "missed", evidence: "p.2" }],
      corrected: [{ mpn: "COR-1", corrected_mpn: "COR-1X", evidence: "p.3" }],
    });
    expect(Object.keys(e.deleted[0]!).sort()).toEqual(["mpn", "reason"]);
    expect(Object.keys(e.added[0]!).sort()).toEqual(["disposition", "evidence", "mpn", "reason"]);
    expect(Object.keys(e.corrected[0]!).sort()).toEqual(["corrected_mpn", "evidence", "mpn"]);
  });
  it("never sends a blank required field: throws instead", () => {
    const blankAddEvidence = full();
    blankAddEvidence.addedEvidence["ADD-1"] = "  ";
    expect(() => buildRowEdits(blankAddEvidence)).toThrow(/row_edits incomplete: added ADD-1/);
    const blankCorrEvidence = full();
    blankCorrEvidence.correctedEvidence["COR-1"] = "";
    expect(() => buildRowEdits(blankCorrEvidence)).toThrow(/corrected COR-1/);
    const blankDelReason = full();
    blankDelReason.deleted["DEL-1"] = { reason: " " };
    expect(() => buildRowEdits(blankDelReason)).toThrow(/deleted DEL-1/);
    const sameMpn = full();
    sameMpn.corrected["COR-1"] = "cor-1";
    expect(() => buildRowEdits(sameMpn)).toThrow(/equals mpn/);
  });
  it("sends the EXTRACTED mpn of a delete or correction verbatim (it is the identity), trims typed values", () => {
    const d = full();
    d.deleted = { " DEL-1": { reason: "dup" } };
    d.corrected = { "COR-1 ": " COR-1X " };
    d.correctedEvidence = { "COR-1 ": "p.3" };
    const e = buildRowEdits(d);
    expect(e.deleted[0]!.mpn).toBe(" DEL-1");
    expect(e.corrected[0]).toEqual({ mpn: "COR-1 ", corrected_mpn: "COR-1X", evidence: "p.3" });
  });
  it("drops a correction on a row that was also deleted", () => {
    const d = full();
    d.deleted["COR-1"] = { reason: "gone" };
    expect(buildRowEdits(d).corrected).toEqual([]);
  });
});

describe("buildActBody", () => {
  const edits = buildRowEdits(full());
  it("an approve with edits sends row_edits and no reason_code", () => {
    const b = buildActBody("approved", "", undefined, edits, "not_a_notice");
    expect(Object.keys(b).sort()).toEqual(["comment", "decision", "row_edits"]);
  });
  it("an approve with no edits sends NO row_edits key (the producer defaults it)", () => {
    const b = buildActBody("approved", "", undefined, { deleted: [], added: [], corrected: [] });
    expect(Object.keys(b)).toEqual(["decision", "comment"]);
  });
  it("a reject sends reason_code, and never row_edits", () => {
    const b = buildActBody("rejected", "c", undefined, edits, "superseded_or_duplicate");
    expect(b.reason_code).toBe("superseded_or_duplicate");
    expect("row_edits" in b).toBe(false);
  });
});
