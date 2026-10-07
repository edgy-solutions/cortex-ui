/**
 * `illustrationFromPartRow` — item 3b. The order: "S1000D illustration viewer wired to a parts
 * row's icn/hotspot_id." A pure projector, `WirePartRow` in, `IllustrationPayload | null` out —
 * no fetch, no store, no route, same shape of purity as `fromMaintenanceBridge.ts`'s own
 * projector. Its only callers today are fixtures (`fixtures/fromPartRow.ts`); nothing in
 * `workflow-case` calls this yet, because drawing a part's illustration on the case card needs a
 * contract field the case `Card` does not have (ADR-0055's decision, not this function's — see
 * `fromMaintenanceBridge.ts`'s own `MAINTENANCE_BRIDGE_UNDRAWN` entries for `work_order.parts…`).
 *
 * `part.icn` is the only field this function treats as a GATE: null or "" means the row names no
 * illustration at all, so the caller gets `null` back rather than a payload with a fabricated or
 * empty `icn` (`contract.ts`'s `icn` is `string`, required — there is no honest empty value for
 * it, so "no icn" has to be "no payload", not "a payload with an empty icn").
 */
import type { IllustrationPart, IllustrationPayload } from "./contract";
import type { WirePartRow } from "@/api/maintenanceBridgeTypes";

export interface IllustrationFromPartRowOpts {
  /** Only source for `content_path` — `WirePartRow` carries no bytes-route field of its own.
   *  Omitted or null means null, so the card draws its own "unserved" absence (no route serves
   *  ICN bytes today — see `contract.ts`'s header). */
  content_path?: string | null;
  /** Only source for `media_type` — same reasoning as `content_path`. */
  media_type?: string | null;
}

/**
 * ── THE CENSUS, PARTITIONING `WirePartRow`'S OWN FIELD SET ───────────────────────────────────
 * Every field below is either READ by `illustrationFromPartRow` (this list) or deliberately
 * UNREAD (`PART_ROW_ILLUSTRATION_UNREAD`, right below) — `fromPartRow.test.tsx`'s census test
 * proves the two lists partition `MIRRORED_FIELDS.PartRow` exactly, the same proof shape
 * `fromMaintenanceBridge.test.tsx` runs over `MAINTENANCE_BRIDGE_MAPPED`/`_UNDRAWN`, so a field
 * added to `WirePartRow` and forgotten here fails that test, not a hand count.
 */
export const PART_ROW_ILLUSTRATION_READS = ["icn", "hotspot_id", "item"] as const satisfies readonly (keyof WirePartRow)[];

/**
 * `part_ref` is an OPAQUE SDK reference (an internal row key), NOT a manufacturer part number —
 * mapping it into `IllustrationPart.part_number` would print an internal id as if it were a
 * human-facing part number, so it is read nowhere in this file. `quantity`, `source_site`,
 * `lead_time_days` and `lead_time_source` have no field on `IllustrationPayload`/`IllustrationPart`
 * to land in at all.
 */
export const PART_ROW_ILLUSTRATION_UNREAD = [
  "part_ref",
  "quantity",
  "source_site",
  "lead_time_days",
  "lead_time_source",
] as const satisfies readonly (keyof WirePartRow)[];

export function illustrationFromPartRow(
  part: WirePartRow,
  opts?: IllustrationFromPartRowOpts,
): IllustrationPayload | null {
  // The gate: never fabricate an icn. "" is treated the same as null — both mean "this row names
  // no illustration," not "an illustration with an empty name."
  if (part.icn === null || part.icn === "") return null;

  const partRef: IllustrationPart = { item: part.item };

  return {
    icn: part.icn,
    // Only from opts — see IllustrationFromPartRowOpts's own comments.
    media_type: opts?.media_type ?? null,
    content_path: opts?.content_path ?? null,
    title: null,
    // Passed through exactly: null stays null, never defaulted to a guessed/first hotspot.
    hotspot_id: part.hotspot_id,
    part: partRef,
  };
}
