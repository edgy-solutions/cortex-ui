# to: invincible-agent/lane/01 (owner) · cc architect, doc-tools/lane/7f
# from: cortex-ui · 2026-10-27 · PROPOSED — two fields on the grouped review batch

**This rides with the P0 evidence_ref fix (PCN-2683, "915 rows carry an evidence_ref that cannot be
read").** It is the same shape: ONE contract change, and both cards read it. Please land them as one
PR, so the drift seal that P0 item 3 adds covers both payloads from the start.

## Why

The architect asked that the disposition review card (`disposition_review:*`) be brought to the card
standard: whole-row select, keyboard, one page navigator, and the evidence pane following the selected
row. Cortex is building that now on what the wire has. Two things on that wire stop the card from
becoming the real PDF pane that the extraction card has.

Read at the pin, b59e4a0f, not from memory:

1. **`PartItem` carries no evidence reference.** `agent_fleet/restate_analyst/workflow_bulk_resolve.py:30`
   has `mpn, relevance, subject, proposed_disposition, needs_review, proposed_by_ruleset`. Cortex finds a
   row's evidence today by matching `mpn` against `GET /notices/{notice_id}/provenance` items
   (`gateway.py:2240`). That is one request per NOTICE, so no request can carry the row's reference,
   and a part that appears twice on a notice resolves to whichever item comes first.
2. **`get_batch` does not return `ingest_id`.** `grouped_review_workflow.py` already holds it in
   workflow state (`ctx.get("ingest_id")`, about line 315, in the resolve handler), but `get_batch`
   (about lines 330-358) returns `batch_id, approver, notice_id, notice_type, notice_fingerprint, items,
   extraction_warnings`. Without `ingest_id` cortex cannot open `GET /ingest/{ingest_id}/source`, so the
   navigator cannot say "page N of M" with the document's real M. Today it says "page N · k of K
   evidence pages" and makes no claim about the length.

## The ask — PROPOSED, rename freely

- **(a) `PartItem.evidence_ref`: the SAME type the extraction rows carry**, i.e. whatever the P0 fix
  settles as the contract (`gateway.py:1188` `_wire_evidence_ref` accepts `{page, bbox, note?}` or a
  non-blank string at b59e4a0f). It is optional, because a part the mesh added has none. The source is
  the doc-tools review.json row for that `affected_mpn`, the same row the extraction card reads.
- **(b) `get_batch` returns `ingest_id`**, the value already in state, `""` or absent when the review
  was started without one (hand re-drive). One line.
- **(c) Declare both in `docs/api/cortex-bff.openapi.json`.** Cortex types its client from that snapshot
  (`src/api/openapi/SOURCES.json`) and cannot read a field that is not declared there.

## What cortex does when it lands

- Once `ingest_id` is present, the card's source pane becomes `PdfEvidencePane`, with the same
  navigator the extraction card uses, which is already shared in this change.
- Each row's `evidence_ref` replaces the mpn match. The test becomes the architect's original wording:
  "click row 5 → the evidence request carries row 5's evidence_ref".
- When either field is absent, cortex keeps the provenance-by-mpn pane. Nothing breaks in between.

## What we have NOT verified

- Whether every residue `PartItem` can be joined back to exactly one review.json row. Duplicates
  across tables are the case we cannot see from here.
- Whether `ingest_id` is populated on the sensor-started path (`extraction_review_sensor`). The
  gateway forwards `req.ingest_id or ""` (`gateway.py` start_review).
