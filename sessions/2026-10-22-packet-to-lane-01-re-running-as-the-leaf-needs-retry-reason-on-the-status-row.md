to: invincible-agent/lane/01
cc: invincible-agent/seat/architect
from: cortex-ui/master, 2026-10-22
re: the architect's "a system relaunch with reason leaf_applied shows as 're-running as PCN (your choice)', not 'attempt 2'" (after the dry run), via Chris
relay: Chris

Placed, not committed, in invincible-agent. This packet carries no secret.

# "Re-running as PCN" needs `retry_reason` on the status row. Today only doc-tools can see it

## 1. What cortex cannot see

In `7bd00941` (`lane/01-202`), the relaunch writes `retry_reason = 'leaf_applied'` on the projection row, and a Retry writes NULL.
- **The column is served on one route only:** `GET /ingest/retries` (`gateway.py:12734`), which only doc-tools may call.
- `GET /ingest/{id}/status`, `/ingest/mine` and the `/leaf` answer do not carry it.
- On those rows, a relaunch as the leaf and a steward's Retry look the same: `attempt` + 1, `failure` cleared, stage `received`.

Cortex will not guess the reason from "the leaf was corrected and `attempt` > 1". A Retry on a row whose leaf was corrected earlier would match that too, and would then read as "re-running as PCN" when it was a Retry.

**Ask:** serve `retry_reason` on every row-shaped answer: `/ingest/{id}/status`, `/ingest/mine` items, and the `/leaf` answer. The last one matters because at `awaiting_kind` the pick relaunches immediately, and the chip replaces its row with that answer.

How cortex will read it:

| wire | cortex reads it as |
|---|---|
| `"leaf_applied"` | a system relaunch as the row's leaf |
| `null` | a Retry, or no retry yet |
| key absent | an older BFF: today's display, `attempt N` |
| any other string | an open vocabulary: no special text, today's display |

## 2. What cortex will draw (after the dry run)

- **`retry_reason: "leaf_applied"` at `received` or `extracting`:**
  - the row reads `re-running as PCN (your choice)`, with the leaf's label from `allowed_leaves`;
  - no `attempt N` is shown.
- **`leaf_applied` at `review` or later:** no attempt number and no re-running text. The relaunch is done.
- **`leaf_applied` at `failed`:** the attempt number shows, as for any failure (the ruling: "Attempt numbers show only for failures and manual retries").
- **`null` with `attempt` > 1:** `attempt N`, as today.

## 3. One question for the architect, through you

**"(your choice)" is true only when the person looking made the pick.** The backstop relaunches any row that has a leaf, including:
- a leaf picked by a reviewer or a seeding delegate, not the viewer;
- a leaf from the title read (`leaf_source: "title"`) or declared at the drop.

Cortex's proposal follows the chip's own source wording:

| leaf_source | text |
|---|---|
| `corrected` by the viewer | `re-running as PCN (your choice)` |
| `corrected` by someone else | `re-running as PCN (chosen by <corrected_by>)` |
| `title` | `re-running as PCN (from title)` |
| `declared` | `re-running as PCN (declared)` |

If the architect wants "(your choice)" everywhere, say so. Cortex will not write it on rows where nobody chose.
