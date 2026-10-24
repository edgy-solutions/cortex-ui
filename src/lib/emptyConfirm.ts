/**
 * THE `document_empty_confirm` TASK (producer spec 208), READ. The producer files this task when an
 * extraction finds NO PARTS and asks a steward whether that is true: "confirmed_no_parts" ends the
 * ingest at `no_parts` (terminal, not a failure); "has_parts" + a page sends it back to `received`
 * with the text fallback forced. Nothing here draws; `EmptyConfirmCard` does.
 *
 * KEYED ON THE KIND AND ON `review_shape === "empty"`, like `promotionReviewIngestId` keys on its
 * kind: a task of this kind whose payload does not claim the empty shape is not one this card can
 * honestly draw, so it gets the generic card. `emptyConfirmParity.test.ts` seals the kind, the
 * message and every payload key below against the producer's own code.
 *
 * A FIGURE THAT WAS NOT REPORTED IS NULL, NEVER 0. The producer sends each count as an int or None;
 * "0 tables" and "the extraction did not say" are different claims, and a card that coerced one to
 * the other would tell the steward the document was inspected and empty when it may not have been.
 * A boolean is not a figure either (`true` is not "1 table"), so it reads as not reported.
 */

export const EMPTY_CONFIRM_KIND = "document_empty_confirm";

/** The producer's refusal text for "Add a missed part" (409 `add_missed_part_not_built`; gateway.py
 *  `_ADD_MISSED_PART_MSG`). Shown beside the disabled button so the reader is told BEFORE pressing. */
export const ADD_MISSED_PART_NOT_BUILT_MESSAGE =
  "entering parts by hand on an empty extraction is not built yet (awaiting a ruling on where hand-entered parts land)";

export interface EmptyAccount {
  nTables: number | null;
  gridNoPartsCol: number | null;
  gridRowsEmitted: number | null;
  reviewReasons: string[];
  /** The producer's `why`; an OPEN vocabulary, so any non-blank string is carried as it came. */
  why: string | null;
}

export interface EmptyConfirmTask {
  ingestId: string;
  attempt: number | null;
  account: EmptyAccount;
  /** `=== true` only: the producer refusing hand entry is the safe reading of anything else too. */
  addMissedPart: boolean;
  forcedTextFallback: boolean;
  contentKind: string | null;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function nonBlank(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}
/** A non-boolean integer, else null. */
function figure(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) ? v : null;
}

export function readEmptyConfirmTask(kind: string, payload: unknown): EmptyConfirmTask | null {
  if (kind !== EMPTY_CONFIRM_KIND || !isObj(payload)) return null;
  if (payload.review_shape !== "empty") return null;
  const ingestId = nonBlank(payload.ingest_id);
  if (ingestId === null) return null;
  const acct = isObj(payload.account) ? payload.account : {};
  return {
    ingestId,
    attempt: figure(payload.attempt),
    account: {
      nTables: figure(acct.n_tables),
      gridNoPartsCol: figure(acct.grid_no_parts_col),
      gridRowsEmitted: figure(acct.grid_rows_emitted),
      reviewReasons: Array.isArray(acct.review_reasons)
        ? acct.review_reasons.filter((r): r is string => typeof r === "string" && r.trim() !== "")
        : [],
      why: nonBlank(acct.why),
    },
    addMissedPart: payload.add_missed_part === true,
    forcedTextFallback: payload.forced_text_fallback === true,
    contentKind: nonBlank(payload.content_kind),
  };
}

const UNKNOWN_WHY = "The extraction gave no account of why it found nothing.";

/** The `why` in words. Open vocabulary: an unrecognised value is SHOWN, not refused. */
export function whyInWords(why: string | null): string {
  switch (why) {
    case "no_table":
      return "No table was found in the document.";
    case "no_parts_column":
      return "Tables were found, but none has a part-number column.";
    case "zero_rows":
      return "Tables were found, but no part rows came out of them.";
    case "unknown":
    case null:
      return UNKNOWN_WHY;
    default:
      return why.trim() === "" ? UNKNOWN_WHY : `The extraction says: ${why}`;
  }
}
