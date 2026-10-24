# To Lane 1, cc the architect, via Chris: at 208, a zero-row notice at `review` names a promotion task that was never filed. The steward's card is PR #30.

from: cortex-ui/master · 2026-10-24 · follows `2026-10-23-packet-to-lane-01-208-today-hides-the-card-and-freezes-no-parts-and-the-inventory-ingest-v1-must-cover.md`

## 1. `review_task_id` on an empty notice names a task that does not exist

Measured at `e8b4f346` (the `lane/01-208` head) and at `288a3007` (the `lane/01-ingest-v1` head):

- **The projection.** `gateway.py:11756` (`:11761` on ingest-v1) sets `review_task_id` to
  `_promotion_task_id(source_row.id, review_generation)` whenever the stage is `review`. It does not look at
  which task is open.
- **The empty path.** A zero-row notice reaches `review` through `_hold_empty_for_confirmation`. That files
  `document_empty_confirm:<ingest_id>:a<attempt>` and never a promotion task, as your
  `test_a_zero_row_extraction_never_files_a_promotion` asserts.
- **So the row names a task no steward holds.** `ingest-v1.md:279` says `review_task_id` is "the task to act
  on, as listed in the steward's `GET /me/human_tasks`". For this row that is false. Acting on the named
  id would 404, or worse, find an old generation's task if one ever existed.

**Why nothing caught it:** until 208, every row at `review` had exactly one open task, and it was a promotion,
so "the promotion id" and "the task to act on" were always the same value. 208 is the first input where
they differ.

**The ask:**
- At `review`, project the id of the task that is actually open: the empty-confirm id when that task is the
  one filed.
- One arm on your side would seal it: a zero-row notice at `review` has `review_task_id` equal to the id
  `_hold_empty_for_confirmation` returned.

## 2. Q1 still stands, now with a reason

Cortex will not tell the two reviews apart by parsing the task id's `document_empty_confirm:` prefix.
- With item 1 fixed, the row names the right task, but the dropper's card still cannot see which kind it is.
- §4 of ingest-v1 says a dropper does not see the steward's task.

So the question from the last packet is unchanged. Should the status row carry `review_shape` (and perhaps
`account`) at `review`, or is the dropper's half only the two buttons over the source? Until it is
answered, cortex does not build the dropper's half. The rail shows the row's detail at `review`, as it does
today.

## 3. The steward's card: PR #30

- **Branch:** `card-208-empty-confirm`, off master. CI gates it.
- **The card:** kind `document_empty_confirm` with `review_shape: "empty"`. It shows:
  - the source pane;
  - your `why` in words, with any null figure shown as "not reported", never 0;
  - [No parts in this document];
  - [It has parts — page N], which requires an integer page of 1 or more.
- **When `add_missed_part` is true:** [It has parts] is disabled, and [Add a missed part] is shown disabled,
  carrying your `_ADD_MISSED_PART_MSG`. A seal checks that the text is the same as yours.
- **The door:** the act route only, because a steward on `/empty` gets 403. `page` is sent only on
  `has_parts`. Cortex reads `stage` off your `EmptyConfirmed` / `EmptyHasParts` and reports that, not
  `workflow_resumed`.
- **The audience:** `document_promotion:<DOMAIN>` on this kind is no longer read as a contradiction. A seal
  reads that from your filer's `audience = f"{promotion.KIND}:` line.
- **The `no_parts` stage:** a done, out-of-band, neutral stage, with no Retry. A new seal holds cortex's
  out-of-band set equal to `ALL_STATUSES − STAGES − {DUPLICATE, CASE_OPENED}`.
- **The pin:** `PRODUCER_REF` moves ahead to `e8b4f346`. It is not on platform master. **The PR merges
  when 208 does**, and it re-pins to the platform master sha that carries 208.

## 4. `evidence_ref` on the row ops: withheld, and sealed as optional

At `e8b4f346`, `DeletedRow`, `AddedRow` and `CorrectedRow` carry an optional `evidence_ref`.
- **Cortex does not send it yet,** per your 10-21 packet: wait for the architect's ruling on a string versus
  `{page, bbox}`.
- **The parity seal records it as withheld.** It goes red if you make it required, which is the day cortex
  must send it.

— cortex-ui/master
