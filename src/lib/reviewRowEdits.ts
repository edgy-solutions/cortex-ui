import { readRuntimeConfig } from "@/config";
import type { HeaderEdit, RowEdits } from "@/api/client";
import { HeaderEdit_field } from "@/api/generated/bff";

/**
 * Grouped-review ROW EDITS (delete / add / correct an MPN) and the Reject control.
 *
 * FLAG. `VITE_REVIEW_ROW_EDITS`, default ON. Gates GROUPED REVIEW only; the promotion card has its own
 * flag (`VITE_PROMOTION_ROW_EDITS`, below). ONLY the exact string "false" turns it off; unset and
 * "" (what docker-entrypoint.sh writes for an unset env) are ON, and so is every other value.
 * "FALSE" and " false" are deliberately NOT off (strict, as the spec says) — note the entrypoint
 * strips everything outside `a-z0-9`, so "FALSE" reaches the browser as "" = ON; only lowercase
 * "false" survives it as an off switch.
 *
 * WHY ON. The live fleet (invincible-agent 49aa5e28, Lane 1 packet
 * sessions/2026-10-12-packet-to-cortex-f3617a9-is-live-notice-id-named-row-edits-accepted-flip-it.md)
 * declares `row_edits` and `reason_code` on `HumanTaskActRequest` (gateway.py) and accepts a
 * grouped-review reject. What cortex sends is sealed key-for-key against that model by
 * rowEditsWireParity.test.ts.
 */
export const REVIEW_ROW_EDITS_DEFAULT = true;

/** The resolution rule on a raw value: exactly "false" is OFF, anything else is ON. */
export function resolveReviewRowEdits(raw: string): boolean {
  return raw === "false" ? false : REVIEW_ROW_EDITS_DEFAULT;
}

export function isReviewRowEditsEnabled(): boolean {
  return resolveReviewRowEdits(readRuntimeConfig("VITE_REVIEW_ROW_EDITS"));
}

/**
 * PROMOTION-card editors (row editor + title-line header editor). Gated by their OWN flag
 * `VITE_PROMOTION_ROW_EDITS`, separate from VITE_REVIEW_ROW_EDITS above, because the scopes differ:
 * the grouped-review flag is default ON with no server flag, while the promotion editor's server half
 * (`IAGENT_PROMOTION_ROW_EDITS`) is ON only for "true" and set only in the sandbox. This flag takes the
 * server's rule: ONLY the exact lowercase "true" is ON; unset, "", "false", "TRUE" and " true" are OFF.
 * "TRUE" is off because docker-entrypoint.sh strips uppercase (charset `a-z0-9`), so it reaches the
 * browser as "". The server lowercases, so the two differ on "TRUE"; set values in lowercase "true".
 */
export const PROMOTION_ROW_EDITS_DEFAULT = false;

export function resolvePromotionRowEdits(raw: string): boolean {
  return raw === "true";
}

export function isPromotionRowEditsEnabled(): boolean {
  return resolvePromotionRowEdits(readRuntimeConfig("VITE_PROMOTION_ROW_EDITS"));
}

/** Everything the grouped-review card has drafted, keyed as the card keys it (by EXTRACTED mpn). */
export interface RowEditDraft {
  deleted: Record<string, { reason: string }>;
  addedMpns: string[];
  corrected: Record<string, string>;
  overrides: Record<string, { disposition: string; reason: string }>;
  addedEvidence: Record<string, string>;
  correctedEvidence: Record<string, string>;
}

const blank = (v: string | undefined) => (v ?? "").trim() === "";

/**
 * The `row_edits` wire object, built from the card's drafts. Every TYPED string is trimmed; the
 * EXTRACTED mpn of a delete or a correction is sent verbatim, because it is the identity the
 * workflow matches against the server-authored batch ("identity never moves", gateway.py
 * CorrectedRow) and a trimmed key could miss its row. A correction
 * on a row that was also deleted is dead and dropped (the platform refuses one mpn in both lists).
 * The card BLOCKS Resolve on any blank required field; this THROWS on one as defence in depth, so a
 * blank can never reach the wire (the platform's `_nonblank` would 422 it anyway).
 */
export function buildRowEdits(d: RowEditDraft): RowEdits {
  const bad: string[] = [];
  const deleted = Object.entries(d.deleted).map(([mpn, x]) => {
    if (blank(mpn) || blank(x.reason)) bad.push(`deleted ${mpn}: reason`);
    return { mpn, reason: x.reason.trim() };
  });
  const added = d.addedMpns.map((mpn) => {
    const o = d.overrides[mpn];
    const evidence = d.addedEvidence[mpn];
    if (blank(mpn) || !o || blank(o.disposition) || blank(o.reason) || blank(evidence)) {
      bad.push(`added ${mpn}: mpn/disposition/reason/evidence`);
    }
    return {
      mpn: mpn.trim(),
      disposition: o?.disposition ?? "",
      reason: (o?.reason ?? "").trim(),
      evidence: (evidence ?? "").trim(),
    };
  });
  const corrected = Object.entries(d.corrected)
    .filter(([mpn]) => !d.deleted[mpn])
    .map(([mpn, corrected_mpn]) => {
      const evidence = d.correctedEvidence[mpn];
      if (blank(mpn) || blank(corrected_mpn) || blank(evidence)) bad.push(`corrected ${mpn}: corrected_mpn/evidence`);
      if (corrected_mpn.trim().toLowerCase() === mpn.trim().toLowerCase()) {
        bad.push(`corrected ${mpn}: corrected_mpn equals mpn`);
      }
      return { mpn, corrected_mpn: corrected_mpn.trim(), evidence: (evidence ?? "").trim() };
    });
  if (bad.length) throw new Error(`row_edits incomplete: ${bad.join("; ")}`);
  return { deleted, added, corrected };
}

/** The `HeaderEdit.field` enum of the BFF snapshot (generated), in its order; not a hand list. */
export const HEADER_EDIT_FIELDS: ReadonlyArray<HeaderEdit["field"]> = HeaderEdit_field;

/**
 * The `header_edits` wire list, from the card's drafts, in field order. Typed strings are trimmed.
 * THROWS (as buildRowEdits does) on a blank value / evidence_ref / reason, or a value equal to the
 * EXTRACTED one ignoring case (the platform refuses that as header_edits_refused).
 */
export function buildHeaderEdits(
  drafts: Partial<Record<HeaderEdit["field"], { value: string; evidence_ref: string; reason: string }>>,
  extracted: { mfr: string | null; notice_id: string | null; notice_date: string | null },
): HeaderEdit[] {
  const bad: string[] = [];
  const out: HeaderEdit[] = [];
  for (const field of HEADER_EDIT_FIELDS) {
    const d = drafts[field];
    if (!d) continue;
    if (blank(d.value) || blank(d.evidence_ref) || blank(d.reason)) bad.push(`header ${field}: value/evidence/reason`);
    else if (extracted[field] !== null && d.value.trim().toLowerCase() === extracted[field]!.trim().toLowerCase()) {
      bad.push(`header ${field}: value equals the extracted value`);
    }
    out.push({ field, value: d.value.trim(), evidence_ref: d.evidence_ref.trim(), reason: d.reason.trim() });
  }
  if (bad.length) throw new Error(`header_edits incomplete: ${bad.join("; ")}`);
  return out;
}

/** What a refused /act said, for the toast: a title, and the itemised problems when there are any. */
export interface ActRefusal {
  title: string;
  description?: string;
}

const str = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";

/**
 * Read a refused grouped-review /act. NEVER one sentence for every refusal: on 196 a generic line hid
 * the real cause of the source P0, and a 422 here carries the steward's own fix. The platform's
 * shapes (gateway.py, 197):
 *  - `row_edits_invalid`: `problems[]`, every one of them (an added MPN colliding with an extracted
 *    row, a deleted/corrected MPN that is not a row of this review);
 *  - `row_edits_not_for_kind`, `reason_code_required` (+ `codes`): their `message`;
 *  - FastAPI's validation list `[{loc, msg}]`, which is how `RowEdits`'s own rules arrive;
 *  - any other `{error, message}`.
 * Returns null for anything else, so the caller keeps its status-specific lines.
 */
export function actRefusal(err: unknown): ActRefusal | null {
  const resp = (err as { response?: { status?: number; data?: { detail?: unknown } } } | null)?.response;
  const detail = resp?.data?.detail;
  if (Array.isArray(detail)) {
    const lines = detail
      .map((d) => {
        const e = d as { loc?: unknown; msg?: unknown };
        const loc = Array.isArray(e.loc) ? e.loc.filter((p) => p !== "body").join(".") : "";
        return str(e.msg) ? (loc ? `${loc}: ${e.msg}` : e.msg) : null;
      })
      .filter((l): l is string => l !== null);
    if (!lines.length) return null;
    return { title: `Refused by the platform (${resp?.status ?? "no status"}): ${lines[0]}`, description: lines.length > 1 ? lines.join("\n") : undefined };
  }
  if (!detail || typeof detail !== "object") return null;
  const d = detail as { error?: unknown; message?: unknown; problems?: unknown; codes?: unknown };
  if (d.error === "row_edits_invalid") {
    const problems = Array.isArray(d.problems) ? d.problems.filter(str) : [];
    const all = problems.length ? problems : str(d.message) ? [d.message] : [];
    return {
      title: `Row edits refused — ${all.length || "no"} problem${all.length === 1 ? "" : "s"}; nothing was applied`,
      description: all.length ? all.join("\n") : undefined,
    };
  }
  if (d.error === "reason_code_required") {
    const codes = Array.isArray(d.codes) ? d.codes.filter(str) : [];
    return { title: `${str(d.message) ? d.message : "A reject needs a reason code"}${codes.length ? ` (one of: ${codes.join(", ")})` : ""}` };
  }
  if (str(d.error) || str(d.message)) {
    return { title: [d.error, d.message].filter(str).join(": ") };
  }
  return null;
}

/** The last resort, which still names what happened: the HTTP status, or that no answer came. */
export function actFailureFallback(verb: "Resolve" | "Reject", err: unknown): string {
  const status = (err as { response?: { status?: number } } | null)?.response?.status;
  if (typeof status === "number") return `${verb} failed (HTTP ${status})`;
  const msg = (err as { message?: unknown } | null)?.message;
  return `${verb} failed before any answer${str(msg) ? ` (${msg})` : ""}`;
}
