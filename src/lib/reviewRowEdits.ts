import { readRuntimeConfig } from "@/config";

/**
 * Grouped-review ROW EDITS (delete / add / correct an MPN) and the Reject control.
 *
 * FLAG. `VITE_REVIEW_ROW_EDITS`, default OFF, only the exact string "true" turns it on. With it off
 * the card looks and behaves as it always did and nothing is sent that the platform would discard.
 *
 * WHY OFF. `HumanTaskActRequest` (invincible-agent src/iagent/gateway.py:646) is
 * `{decision, comment, overrides?, on_behalf_of?}` — NO field for deleted, added or corrected rows,
 * and the model drops unknown fields silently. Separately, `decision: "rejected"` for a
 * `grouped_review` task is refused with 501 `grouped_reject_not_wired` (gateway.py:3593-3600), so
 * Reject sits behind the SAME flag. See the honour arm in reviewRowEdits.test.ts.
 */
export const REVIEW_ROW_EDITS_DEFAULT = false;

export function isReviewRowEditsEnabled(): boolean {
  const raw = readRuntimeConfig("VITE_REVIEW_ROW_EDITS").trim();
  return raw === "" ? REVIEW_ROW_EDITS_DEFAULT : raw === "true";
}
