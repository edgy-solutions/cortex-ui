# Packet to Lane 1: the live BFF renamed `review` and cortex refused it; maintenance citations need the DMC on the wire

from: cortex-ui/master · 2026-10-03 (overnight)
re: overnight dispatch, "seal ingest end to end… MAINTENANCE answers render DMC citations, not chunk ids; seal on the rehearsal capture"
producer read: the deployed fleet, read from the pods, is uniform at `4c3b61a6` (chart 0.4.28)

## 1. ⛔ Live: every ingest row at `review` was refused by cortex. Fixed in `b49db01`.

- **The rename.** `1c10e28c` renamed the stage `awaiting_disposition` to `review`, and migrated the stored rows forward. `4c3b61a6` contains it, so the live BFF serves `review`.
- **The refusal.** The live frontend is cortex `21a32d0` (`f4bac439`). Its reader holds a closed stage set and returns nothing for an unknown stage. So every upload stalled at the stage where promotion happens.
- **The fix.** Cortex `b49db01` renames the stage, closed as before; it does not accept both names. It also bumps cortex's pinned producer to `4c3b61a6` in the same commit.
  - The bump's checks:
    - check 1, the pods: the fleet is uniform;
    - check 2, the declaration diff: `origin_confirmation` only, now pinned;
    - check 3, the SDK: `v0.9.5` → `012a24fb`, and `rows.py` is unchanged.
  - Image: `b49db013e7d670fc7b8cfb634373abf60a3db805` → `sha256:4976774636d704f05fa9632461ef1fdcd6b01b5d7e308a2b81acddcd8a1030f1` (run 37175798057, 34 steps, 0 skipped; short sha 404, fake 404, known-good `0fc5051` → `d8c652cb…`).
- **⚠ Pairing.** `0fc5051`, the pin named earlier, predates this fix and **refuses `review` too**. Any roll whose producer is at or after `1c10e28c` needs cortex `b49db01` or later. Conversely, `b49db01` refuses `awaiting_disposition`, so do not pair it with a producer before `1c10e28c`.
- **Why the parity seal missed it.** The seal that compares cortex's stages with `ingest_status.py` was green: it was pinned to `0f48fe2`, before the rename. A pinned seal sees drift only when the pin moves. The pin now moves to what is deployed.

## 2. Maintenance citations: measured at `4c3b61a6`, the DMC does not reach the source

**Cortex draws a source's `label`** (`src/components/HUD/SourcesTrail.tsx:140`). It never builds a citation itself.

**For a weaviate-retrieved chunk, the label and uri come from `agent_fleet/weaviate_expert/service.py:_collect_local`:**

| Field | Value |
|---|---|
| `label` | the chunk's `doc_id` property, or "Unknown Document" |
| `uri` | `source_url`, then `uri`, then `weaviate://<collection>/<uuid>`, a chunk id |

- No DMC property is read on that path. `git grep` for `dmc` / `dm_code` / `data_module_code` hits only `agent_fleet/neo4j_expert/main.py:709-715`, where the graph side carries `rec["dmc"]`.
- `tests/routing/STEP0_DOCS_PHASE_SPEC.md:174` says chunks are stored "with class + DMC metadata", but the retrieval never asks for it.

So whether a maintenance answer shows a DMC depends on what `doc_id` holds for an S1000D chunk. Nothing at `4c3b61a6` says, and no producer test puts an S1000D source on the wire.

**Ask.** A maintenance answer's sources carry the DMC as `label`, e.g. `DMC-SANDBOXRTX-C-95-40-00-00A-941A-A`. Alternatively, say which field carries it and cortex reads that field instead; cortex will not parse a DMC out of a uri.

**The seal cortex will write on the rehearsal capture:**
- every source of the maintenance answer draws text matching the DMC shape (`DMC-` followed by its hyphenated segments);
- none draws `weaviate://`, a uuid, or "Unknown Document";
- the count of drawn citations equals the count of sources served.

**Also checked on the capture:** the "View figures" trigger keys on ontology-URI labels (`#wpn-`, `#DataModule`, `mil#`). A DMC label would not fire it. Whether it should fire is the illustration packet's question.

## Captures still wanted (to `cortex-ui/sessions/` as `*payload*.json`, bearers scrubbed)

- **The rehearsal maintenance answer:** its SSE `sources` event as served, including `provenance_floor` (`b8e823dd`).
- **Ingest end to end** on the new image:
  - the status rows through `received` → `extracting` → `review` → `promoted`, plus one `rejected`;
  - the `document_promotion` task row;
  - the label after promotion.
- **HAZ-1003's row as served.**
- **A successful export response,** on which the card export retires.

None of these was in place at the time of writing.
