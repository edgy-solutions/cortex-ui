/**
 * The VITE_REVIEW_ROW_EDITS flag (default ON, only exact "false" is OFF) and the send builders:
 * `buildRowEdits` (the row_edits object) and `buildActBody` (the /act body). The key sets are
 * sealed against the producer in rowEditsWireParity.test.ts; these arms pin the behaviour.
 */
import { afterEach, describe, expect, it } from "vitest";
import { buildActBody } from "@/api/client";
import {
  REVIEW_ROW_EDITS_DEFAULT,
  actFailureFallback,
  actRefusal,
  buildHeaderEdits,
  buildRowEdits,
  PROMOTION_ROW_EDITS_DEFAULT,
  isPromotionRowEditsEnabled,
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
    const b = buildActBody("rejected", "c", undefined, edits, "duplicate");
    expect(b.reason_code).toBe("duplicate");
    expect("row_edits" in b).toBe(false);
  });
});

// The platform's refusal bodies, verbatim from invincible-agent gateway.py at 8516762e (197).
const refusal = (status: number, detail: unknown) => ({ response: { status, data: { detail } } });

describe("actRefusal: a refused /act says what the platform said (197)", () => {
  it("row_edits_invalid lists EVERY problem, not just the first", () => {
    const problems = [
      "added mpn 'AAA-1' collides with an extracted row",
      "mpn 'ZZZ-9' is not a row of this review",
    ];
    expect(actRefusal(refusal(422, { error: "row_edits_invalid", message: problems[0], problems }))).toEqual({
      title: "Row edits refused — 2 problems; nothing was applied",
      description: problems.join("\n"),
    });
  });
  it("row_edits_invalid with one problem is singular; with none it falls back to message", () => {
    expect(actRefusal(refusal(422, { error: "row_edits_invalid", message: "m", problems: ["m"] }))?.title).toBe(
      "Row edits refused — 1 problem; nothing was applied",
    );
    expect(actRefusal(refusal(422, { error: "row_edits_invalid", message: "only m" }))?.description).toBe("only m");
  });
  it("reason_code_required names the codes the server will take", () => {
    const codes = ["not_a_notice", "unreadable", "parts_unusable", "duplicate"];
    expect(actRefusal(refusal(422, { error: "reason_code_required", message: "a grouped-review reject needs a reason_code", codes }))).toEqual({
      title: "a grouped-review reject needs a reason_code (one of: not_a_notice, unreadable, parts_unusable, duplicate)",
    });
  });
  it("row_edits_not_for_kind, and any other {error, message}, say both", () => {
    expect(actRefusal(refusal(422, {
      error: "row_edits_not_for_kind", kind: "document_promotion",
      message: "row edits are read only on a grouped review; sent here they would be lost",
    }))?.title).toBe("row_edits_not_for_kind: row edits are read only on a grouped review; sent here they would be lost");
  });
  it("FastAPI's validation list (how RowEdits's own rules arrive) names the field and every message", () => {
    const r = actRefusal(refusal(422, [
      { loc: ["body", "row_edits"], msg: "Value error, corrected_mpn must differ from mpn for 'A' (ignoring case)", type: "value_error" },
      { loc: ["body", "row_edits", "added", 0, "evidence"], msg: "Field required", type: "missing" },
    ]));
    expect(r?.title).toBe("Refused by the platform (422): row_edits: Value error, corrected_mpn must differ from mpn for 'A' (ignoring case)");
    expect(r?.description).toContain("row_edits.added.0.evidence: Field required");
  });
  it("nothing it can read is null, so the caller keeps its own line", () => {
    for (const e of [refusal(404, "Not Found"), refusal(500, {}), refusal(422, []), { message: "x" }, null, undefined]) {
      expect(actRefusal(e)).toBeNull();
    }
  });
  it("the fallback names the status, or that no answer came — never a bare 'failed'", () => {
    expect(actFailureFallback("Resolve", refusal(500, {}))).toBe("Resolve failed (HTTP 500)");
    expect(actFailureFallback("Reject", new TypeError("Failed to fetch"))).toBe("Reject failed before any answer (Failed to fetch)");
    expect(actFailureFallback("Resolve", null)).toBe("Resolve failed before any answer");
  });
});

describe("buildHeaderEdits", () => {
  const ext = { mfr: "Example Ltd", notice_id: "EOL-36", notice_date: "2026-09-30" };
  const d = { value: " Other Ltd ", evidence_ref: " p1 ", reason: " logo " };
  it("trims, and orders by field (mfr, notice_id, notice_date) whatever the draft order", () => {
    expect(buildHeaderEdits({ notice_date: { ...d, value: "2026-10-01" }, mfr: d }, ext)).toEqual([
      { field: "mfr", value: "Other Ltd", evidence_ref: "p1", reason: "logo" },
      { field: "notice_date", value: "2026-10-01", evidence_ref: "p1", reason: "logo" },
    ]);
  });
  it("throws on a blank value, evidence or reason", () => {
    for (const k of ["value", "evidence_ref", "reason"] as const) {
      expect(() => buildHeaderEdits({ mfr: { ...d, [k]: "  " } }, ext)).toThrow(/header_edits incomplete: header mfr/);
    }
  });
  it("throws on a value equal to the extracted one, ignoring case", () => {
    expect(() => buildHeaderEdits({ notice_id: { ...d, value: "eol-36" } }, ext)).toThrow(/equals the extracted value/);
  });
  it("an extracted value that is absent equals nothing", () => {
    expect(buildHeaderEdits({ mfr: d }, { ...ext, mfr: null })).toHaveLength(1);
  });
  it("buildActBody sends header_edits only on promoted, only when non-empty, and no row_edits key for a header-only promote", () => {
    const h = buildHeaderEdits({ mfr: d }, ext);
    const body = buildActBody("promoted", "c", undefined, undefined, undefined, h);
    expect(body).toEqual({ decision: "promoted", comment: "c", header_edits: h });
    expect("row_edits" in body).toBe(false);
    for (const v of ["approved", "rejected", "acknowledged"]) {
      expect("header_edits" in buildActBody(v, "", undefined, undefined, undefined, h)).toBe(false);
    }
    expect("header_edits" in buildActBody("promoted", "", undefined, undefined, undefined, [])).toBe(false);
  });
});

describe("the promotion flag (VITE_PROMOTION_ROW_EDITS)", () => {
  it("defaults OFF", () => {
    expect(PROMOTION_ROW_EDITS_DEFAULT).toBe(false);
  });
  it("unset (no runtime config) and empty are OFF", () => {
    setRuntime(undefined);
    expect(isPromotionRowEditsEnabled()).toBe(false);
    setRuntime({ VITE_PROMOTION_ROW_EDITS: "" });
    expect(isPromotionRowEditsEnabled()).toBe(false);
  });
  it('"true" is ON', () => {
    setRuntime({ VITE_PROMOTION_ROW_EDITS: "true" });
    expect(isPromotionRowEditsEnabled()).toBe(true);
  });
  it.each(["false", "TRUE", " true", "true "])("%j is OFF", (v) => {
    setRuntime({ VITE_PROMOTION_ROW_EDITS: v });
    expect(isPromotionRowEditsEnabled()).toBe(false);
  });
  it("cross-key: the grouped flag alone does not turn the promotion editor on", () => {
    setRuntime({ VITE_REVIEW_ROW_EDITS: "true" });
    expect(isPromotionRowEditsEnabled()).toBe(false);
  });
  it("cross-key: the promotion flag alone leaves the grouped flag at its default (ON)", () => {
    setRuntime({ VITE_PROMOTION_ROW_EDITS: "true" });
    expect(isReviewRowEditsEnabled()).toBe(true);
  });
  it("cross-key: promotion ON with grouped OFF", () => {
    setRuntime({ VITE_PROMOTION_ROW_EDITS: "true", VITE_REVIEW_ROW_EDITS: "false" });
    expect(isPromotionRowEditsEnabled()).toBe(true);
    expect(isReviewRowEditsEnabled()).toBe(false);
  });
});
