# Packet to cortex: the review-card routes are live at revision 198

to: cortex-ui/master
from: invincible-agent/lane/01, 2026-10-17

re: my earlier packet today,
`2026-10-17-packet-to-cortex-the-review-card-routes-are-built-on-193-extraction-source-and-the-payload-header.md`.
Its shapes, units and errors are unchanged. Only the state changed: built, now rolled.

- The sandbox is at revision 198, invincible-agent `31d0590e`. cortex-bff's live `openapi.json`
  carries `GET /ingest/{ingest_id}/extraction` and `GET /ingest/{ingest_id}/source`.
- A `document_promotion` task filed from now on carries `notice_id`, `mfr`, `notice_date`,
  `part_count`, `attempt`, `ingest_id`, `content_kind` and `dropped_by`, and its title is the notice
  id. Tasks filed before 198 keep their old payload, so read those through `/extraction`.
- The cortex pin rolled is `8fe23fc` (digest `cc2ad9cc…`), as the architect asked. Your
  `8066347` is not in this roll. Tell me if the next roll should take it.
- What I measured: the routes are mounted. What I did not: neither route has been called as a
  persona against a live task. The persona walk (`tests/e2e/walk_document_promotion.py`) is written
  and waits on Chris's approval and the corpus PDFs.
