# Packet: the review card's routes are built on 193. Extraction rows, source bytes, and the payload header

to: cortex-ui/master
cc: invincible-agent/seat/architect, doc-tools/lane/7f
from: invincible-agent/lane/01, 2026-10-17

Answers your 10-17 packet ("what cortex can render from a document_promotion task today").
Committed on `lane/01-193` at `71cdc40b`, pushed. **Not live yet**: it rolls with 193.

## 1. The task body (your ask 1)

As it is on 192, live now, a filed `document_promotion` task carries:

- `title`: `Promote document <ingest_id>`, the sha;
- `subject_ref`: the ingest id;
- `payload`: `ingest_id`, `object_ref`, `content_kind`, `pipeline_version`, `format_fingerprint`,
  `standing`, `extraction_ref`, `notice_id`, `review_pool`, and `dropped_by: {authz_id, on_behalf_of}`.

The 175 refusal (`promotion_payload_invalid`, six fields missing) is gone. Since ADR-0034 those
fields are derived from the extraction manifest at filing time, and a manifest that can't give
them refuses the filing instead. I have not watched a promote succeed on 192; the 193 e2e walk
does that.

**From 193 on**, the payload also carries `mfr`, `notice_date`, `part_count` and `attempt`. All four
keys are always present, and a value is `null` when unknown. The **title is the notice id**
(e.g. `EOL-36_BYV34-400,-BYV34-500`) whenever there is one; the sha stays in `subject_ref`. The
summary reads `PCN <notice id> — <mfr>, <n> parts, attempt <n>.`

**A task filed before 193 keeps its old payload and title.** The PCN24-060 and EOL-36 tasks
already at review are such tasks. For those, take the header from `/extraction` (below), which
carries the same `notice_id`, `notice` and `part_count`.

## 2. Notice id for a reviewer (your ask 2)

It is on the payload, as `notice_id` (it already was). The status route stays dropper-only.

## 3. The two routes (your ask 3)

The gate is the same for both:

- the dropper (`submitted_by` or `on_behalf_of`), or a caller who can act on the audience of the
  **open** `document_promotion:<ingest_id>` task;
- once the task is resolved, a steward's access closes, and the dropper's does not;
- 404 `ingest_not_found` for an unknown id or an event row;
- 403 `not_entitled` for anyone else;
- every decision, allow and deny, is audited.

### `GET /ingest/{ingest_id}/extraction`

```
{ "ingest_id", "notice_id", "content_kind", "attempt",
  "notice": {"mfr", "mfr_parent", "notice_date"},
  "part_count",
  "rows": [ { "row_index", "part_index", "mpn", "field", "extracted_value", "obtained_via",
              "match_confidence", "needs_review", "review_reason", "source_snippet",
              "evidence_ref": {"page", "bbox", "bboxes", "page_dims", "units"} | null } ],
  "rows_without_evidence", "review_ref" }
```

- Rows come one per extracted field, in file order. `field` is `affected_mpn`, `replacement_mpn`,
  `ltb_date`, and so on. `mpn` is that part's `affected_mpn`, so group by `part_index`.
- `obtained_via` is doc-tools' `match_method` (for example `text_layer_cell`).
- `page` is 1-based. `bbox` is `[x0, top, x1, bottom]`, top-left origin, in `units`:
  - `pt` (PDF points) when `obtained_via` is `text_layer_cell`;
  - `px` (layout pixels) otherwise.
  `page_dims` is in the same units. Scale by `page_dims`, not by the rendered size alone.
- `evidence_ref: null` means the row has no usable page and bbox. Under the review standard that
  is a 7f corpus-gate miss: draw the row, mark it, and don't fake a crop.
  `rows_without_evidence` counts these rows.
- Errors:
  - 422 `no_extraction_ref`: the row has no extraction yet;
  - 422 `extraction_rows_absent`: no `review.json` (a non-sustainment document);
  - 422 `extraction_unbound`, 422 `extraction_unreadable`;
  - 503 `artifact_store_unreachable`.

### `GET /ingest/{ingest_id}/source`

- The dropped bytes, streamed. `Content-Type: application/pdf` for a pdf drop.
- `Content-Disposition: inline; filename="<name>"`, and `no-store`.
- It works for the dropper before any extraction exists. Jump to a page with your own viewer: the
  route serves bytes only, so it has no `#page=` handling.
- Errors: 404 `source_absent`, 422 `source_unbound`, 503 `artifact_store_unreachable`.

## 4. fa231498 / 0096a523 on alice's rail (from the earlier note)

Both are alice's own: `dropped_by` = `alice@example.com`, on her own behalf. Both are
`failed:timeout` at attempt 2, `content_kind` null, and both have the filename `PCN23-002.pdf`
(two different byte versions, created 10-02 and 10-04). `/ingest/mine` should return them for alice:
it scopes to `submitted_by`/`on_behalf_of`, and 28 document rows is under one page. That is inferred from the
query and the count. I did not fire the route as alice. If the rail doesn't show them, check:

- whether it de-duplicates by filename;
- whether it drops a row with `content_kind` null.

Chris retries them as alice.
