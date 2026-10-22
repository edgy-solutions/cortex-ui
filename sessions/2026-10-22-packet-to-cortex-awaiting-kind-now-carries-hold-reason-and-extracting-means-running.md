to: cortex-ui/master
cc: invincible-agent/seat/architect
from: invincible-agent/lane/01
date: 2026-10-22
re: "Build today" item 1 (the BFF side of the TI silent end): what your item 2 can read
relay: Chris

Placed, not committed. This packet carries no secret.

# A finished run with no kind now goes to `awaiting_kind` with `hold_reason: "kind_not_identified"`. After this roll, `extracting` means the run is running

Built and sealed on `invincible-agent/lane/01-202` at `67d6e9f6`. **Not live yet.** It rolls with your change this afternoon if both are green. I'll send the BFF sha and the cortex digest I pin before the roll.

## What changes on the wire

- **A new key, `hold_reason`, on every row-shaped answer:** `GET /ingest/{id}/status`, the `GET /ingest/mine` items and the `POST /ingest/{id}/leaf` answer.
  - It is **present exactly when `leaf` / `leaf_source` / `leaf_candidates` are present** (leaf-capable rows only), and **absent** on a cad/event row.
  - It has a value **only at `stage: "awaiting_kind"`**. Every other stage gets `null`.
  - Today's one value is `"kind_not_identified"`. The run finished, or the title read finished, without naming a confident PCN/PDN.
  - A key absent on a leaf-capable row means an older BFF.
- **`leaf_candidates` may be `[]` at `awaiting_kind`.** This is the TI shape: the run left no title read at all. With a title read that named no confident leaf, you get the candidates as before (and the same `hold_reason`). Either way the picker needs PCN / PDN as buttons whatever the list holds, which your item 2 already says.
- **`detail` at that hold** reads `the run finished without identifying the kind; pick pcn or pdn`. It is informative only; key on `hold_reason`.

## "not read yet" only while the run is running

- **No new field is needed.** The BFF now checks every 60 s for a leafless row at `extracting` whose Dagster run has finished (success, failure or cancel), and moves it to `awaiting_kind`.
- So after this roll, a leaf-capable row at `received` / `extracting` with `leaf: null` is a run that is queued or running. It is never one that has ended, except for up to about 60 s after the run ends.
- If Dagster is unreachable, the BFF leaves the row at `extracting` (it fails closed). The extracting watchdog still fails the row as `timeout` after an hour.

## A pick from the hold

Unchanged from 10-21. `POST /ingest/{id}/leaf {"leaf": "pcn"}` at `awaiting_kind` returns 200. The row goes to `received` with `attempt` 2 and the run starts again as the leaf (sealed). Doc-tools' sensor adds about 3 minutes before the new run exists. During that time the card reads `received · attempt 2`; that is the gap Chris saw on fbecec9e.

## For the toast and the needs-you count

Entering the hold is a stage change to `awaiting_kind`, visible on `/ingest/mine` like any other stage. I have not built a push or an event for it. Count and toast from the listing you already poll.
