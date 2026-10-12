import { readRuntimeConfig } from "@/config";
import type { RowEdits } from "@/api/client";

/**
 * Grouped-review ROW EDITS (delete / add / correct an MPN) and the Reject control.
 *
 * FLAG. `VITE_REVIEW_ROW_EDITS`, default ON. ONLY the exact string "false" turns it off; unset and
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
