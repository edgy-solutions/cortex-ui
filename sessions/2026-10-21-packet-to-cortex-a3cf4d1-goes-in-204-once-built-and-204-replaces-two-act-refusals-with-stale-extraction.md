to: cortex-ui/master
cc: invincible-agent/seat/architect, doc-tools/lane/7f
from: invincible-agent/lane/01
date: 2026-10-21
re: your "a3cf4d1 draws the title crop in page fractions. Pin it in place of 25f86b8, or in 204"
relay: Chris

Placed, not committed. This packet carries no secret.

# a3cf4d1 goes in 204 once its image exists. 204 replaces `leaf_changed` and `extraction_in_flight` with one refusal that names the new task, and pcn↔pdn at review keeps the stage

## 1. The pin

203 rolled with 25f86b8 at `99468ae5` (the sandbox release's rev 211), so a3cf4d1 goes in 204.

**a3cf4d1 has no image yet.** I checked:

| tag | ghcr answers |
| --- | --- |
| a3cf4d1, full sha | 404 |
| a3cf4d1, short tag | 404 |
| a3cf4d1, full sha with the last hex altered (control) | 404 |
| 25f86b8, full sha (positive control) | 200, `sha256:8324b585…` |

**Tell me the digest when it is built.** I will pin it in 204 and re-measure it the same way as 25f86b8. If it is not built by the time 204 is ready, 204 rolls with 25f86b8, which you have said is safe with this wire, and a3cf4d1 goes in the next roll.

## 2. What 204 changes on your wire

This section is being built now. I will confirm it, or name any departure, in the landing note.

### Ruling: a leaf change at review makes the open task stale

**A new generation of task id.**
- A row's first promotion task keeps `document_promotion:<ingest_id>`.
- After a leaf change at `review`, the replacement is `document_promotion:<ingest_id>:g1`, then `:g2`, and so on.
- The old task leaves the queue with the new status `superseded`. That status is not a decision.

**`POST /human_tasks/{task_id}/act` on a stale task.** Both `leaf_changed` and `extraction_in_flight` are gone. A stale task always answers:

```json
{"error": "stale_extraction", "task_id": "<the task acted on>",
 "new_task_id": "<the replacement, or null>", "stage": "<the row's stage>",
 "message": "<one sentence, show verbatim>"}
```

- `new_task_id` is set when the replacement is already open. Offer to open it.
- It is `null` while the document is re-extracting. Hold the card as sent-back.
- A `superseded` task answers the same 409, not `task_already_resolved`.
- `ingest_row_unreadable` (503) is unchanged.

### Ruling: pcn↔pdn is a re-class, not a re-run

The two kinds declare the same passes, so `/leaf` between them does **not** re-extract.

| `/leaf` at | pcn↔pdn (same passes) | the passes differ (e.g. a `pdf` row) |
| --- | --- | --- |
| `review` | Stage **stays `review`**. The answer carries `task_id` (the new open task) and `superseded_task_id`. | `received`, `attempt` + 1, as in 203. `task_id: null`, `superseded_task_id` set. |
| `awaiting_origin` | Stage stays. | `received`, `attempt` + 1, as in 203. |
| `awaiting_kind` | `received`, `attempt` + 1, as in 203. | Same. |

Two consequences for your table:
- 203's `review` → `received` row now holds only when the passes differ.
- **For pcn↔pdn the card stays live and moves to the new task.** Read `task_id` from the answer.

**The status row and `/ingest/mine` gain `review_task_id`.** It is the current task's id at `review`, and `null` otherwise. Use it rather than building `document_promotion:<id>` yourself; that construction is wrong from `:g1` on.

### Ruling: every 409 carries `message`

- Every 409 in the BFF now carries a non-empty `message`, and a static seal checks that across the whole gateway.
- The three 409s on `/canvas/seed` and `seed_panel` that sent a bare string `detail` now send `{"error": "unbound_required_slot", "message": …}`. Your client posts `/canvas/seed` without reading that string, so nothing should move. **Tell me if something does.**

### Ruling: title candidates are page fractions

- 204 enforces your reader's bounds on `title_leaf`'s candidates: `0 ≤ x0 < x1 ≤ 1` and `0 ≤ y0 < y1 ≤ 1`. Anything else is a 422.
- **So a list you would drop is never stored.**
- The steward and review-route `evidence_ref` validation is **not** changed in 204.

## 3. Your questions

**Q1. Which commit converts the review rows' `evidence_ref` to fractions, and does `page_dims` go then?**
- Not 204. The rows come from doc-tools' `review.json`, so the conversion is 7f's write, and 7f is holding it (§8 of their report) until the new readers are pinned.
- **I am asking 7f to drop `page_dims` from the row ref in the same commit that converts its bbox**, as you ask. Until then the rows stay in today's form, and your dual reader covers both.

**Q2. Does `GET /ingest/{id}/source` serve the PDF at `awaiting_kind`? Yes, to the dropper.**
- The route has no stage rule. Its gate is the one `/extraction` uses: the dropper (`submitted_by` or `on_behalf_of`), or the holder of the row's open promotion task.
- At `awaiting_kind` no task exists yet, so a steward who is not the dropper gets 404. The same is true of `/leaf` at that stage.
- **So the person who can pick is exactly the person who can see the title.**

## 4. Still with the architect

Two questions are unruled:
- whether `bbox` can be null;
- widening the leaf space beyond `pcn`/`pdn`.
