/**
 * `illustrationFromPartRow`'s own fixtures — item 3b, Build §2. Three `WirePartRow` inputs, each
 * projected through the real function (never hand-written as an `IllustrationPayload` and called
 * "projected" by assertion), feeding `fromPartRow.test.tsx`'s seals.
 *
 * (a) and (c) read `MAINT_ACTION_APPROVED.work_order.parts` from `workflow-case`'s own bridge
 * fixtures BY INDEX, rather than importing `MAINT_PART_WITH_ICN`/`MAINT_PART_ROW_DEFAULT`
 * directly — neither constant is exported from that file, and this spec's own shell rule ("touch
 * only the paths this spec names") rules out adding an export to a `workflow-case` file while
 * other implementers are working in that same directory. `MAINT_ACTION_APPROVED` IS exported, and
 * `fixtures/maintenanceBridge.ts`'s own header fixes the order: `parts: [MAINT_PART_ROW_DEFAULT,
 * MAINT_PART_WITH_ICN]` — index 0 is the no-icn default, index 1 is the one with placeholders.
 */
import { illustrationFromPartRow } from "../fromPartRow";
import type { IllustrationPayload } from "../contract";
import { MAINT_ACTION_APPROVED } from "@/archetypes/workflow-case/fixtures/maintenanceBridge";
import type { WirePartRow } from "@/api/maintenanceBridgeTypes";

/**
 * (a) MAINT_PART_WITH_ICN, projected AS-IS (no opts) — `fixtures/maintenanceBridge.ts`'s own
 * header flags its icn/hotspot_id as PLACEHOLDER strings, not SDK-transcribed. No opts means no
 * `content_path`/`media_type`, so this renders the icn label with no bytes route (see
 * `contract.ts`'s header: "no route serves ICN bytes today").
 */
export const MAINT_PART_WITH_ICN_ROW: WirePartRow = MAINT_ACTION_APPROVED.work_order.parts[1];
export const MAINT_PART_WITH_ICN_ILLUSTRATION: IllustrationPayload | null =
  illustrationFromPartRow(MAINT_PART_WITH_ICN_ROW);

/**
 * (b) HAND-BUILT — not transcribed from any SDK fixture or capture (there is none; see
 * `contract.ts`'s header). `hotspot_id: "hot-001"` is one of `SVG_FIXTURE`'s real element ids
 * (`fixtures/index.ts`), and `content_path`/`media_type` are supplied via `opts` so the card
 * actually fetches and draws instead of stopping at a static "no bytes" state.
 */
export const HAND_BUILT_PART_ROW: WirePartRow = {
  item: "hand-built-part",
  part_ref: "hand-built-ref",
  quantity: 1,
  source_site: null,
  icn: "ICN-HAND-BUILT-0001",
  hotspot_id: "hot-001",
  lead_time_days: null,
  lead_time_source: null,
};
export const HAND_BUILT_ILLUSTRATION: IllustrationPayload | null = illustrationFromPartRow(HAND_BUILT_PART_ROW, {
  content_path: "/ingest/illustrations/hand-built-0001",
  media_type: "image/svg+xml",
});

/**
 * (c) the bridge's default part row — `MAINT_PART_ROW_DEFAULT`, `icn: null` — projected to
 * `null`: no icn means no illustration, never a payload with a fabricated or empty icn.
 */
export const BRIDGE_PART_ROW_NO_ICN: WirePartRow = MAINT_ACTION_APPROVED.work_order.parts[0];
export const BRIDGE_PART_ROW_NO_ICN_ILLUSTRATION: IllustrationPayload | null =
  illustrationFromPartRow(BRIDGE_PART_ROW_NO_ICN);

/**
 * A fourth case, needed by `fromPartRow.test.tsx`'s seal arm 4 (Build §2 names only a/b/c; this
 * one exists because that arm needs an icn WITH a null hotspot_id, which none of a/b/c is) —
 * HAND-BUILT, same reasoning as (b): `hotspot_id: null` with `icn` present and a servable
 * `content_path`/`media_type`, so the card draws but names no hotspot.
 */
export const HAND_BUILT_PART_ROW_NO_HOTSPOT: WirePartRow = {
  item: "hand-built-part-no-hotspot",
  part_ref: "hand-built-ref-2",
  quantity: 1,
  source_site: null,
  icn: "ICN-HAND-BUILT-0002",
  hotspot_id: null,
  lead_time_days: null,
  lead_time_source: null,
};
export const HAND_BUILT_NO_HOTSPOT_ILLUSTRATION: IllustrationPayload | null = illustrationFromPartRow(
  HAND_BUILT_PART_ROW_NO_HOTSPOT,
  { content_path: "/ingest/illustrations/hand-built-0002", media_type: "image/svg+xml" },
);
