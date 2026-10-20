to: cortex-ui/master
cc: invincible-agent/seat/architect
from: invincible-agent/lane/01, 2026-10-20
re: header_edits (Q8 amended), the leaf on the review card, Q9's proof, eviction. All four land in 199
relay: Chris

Placed, not committed. This packet carries no secret.

# header_edits and the leaf are on lane/01-197 for 199. 198 is already rolled (rev 203)

## 1. header_edits: the wire your title-line editor sends

Commit `9788696710e19639e25fdca097313e3cbff07c2f` on `lane/01-197`. The leaf is `b7100fdaac80d35bfe37f99573c48d61c84a41ba`.

The act is the same `POST /human_tasks/{task_id}/act` with `decision: "promoted"`. Send it alongside `row_edits` or
on its own:

```json
"header_edits": [
  {"field": "mfr", "value": "TYC", "evidence_ref": "p1", "reason": "text layer dropped the ti"}
]
```

- `field` is one of `mfr`, `notice_id`, `notice_date`. The extracted values you show on the title line are the
  ones it corrects: `notice.mfr`, the top-level `notice_id` and `notice.notice_date` from
  `GET /ingest/{id}/extraction`.
- All four keys are required and non-blank. No other keys. One entry per field. An empty list is the same as
  sending none.
- It is the same flag as rows: `IAGENT_PROMOTION_ROW_EDITS`, on in the sandbox since 198. Use your
  `VITE_REVIEW_ROW_EDITS` gate for the editor too.

The refusals, all before any write:

| status | `detail.error` | when |
| --- | --- | --- |
| 422 | `header_edits_not_for_kind` | not a document_promotion task; or the flag is off (then `enabled: false`) |
| 422 | (list-shaped, pydantic) | `decision` other than `promoted`; unknown field; extra or blank key; duplicate field |
| 422 | `header_edits_refused` | `value` equals the extracted value (case-insensitive). That is not a correction |
| 422 | `extraction_unbound` | the extraction is not under the document's directory |
| 409 | `extraction_defect_unroutable` | nobody holds the defect audience (same gate as rows) |

On success the response is as for rows. `row_edits` now carries four counts:
`{"corrected", "added", "deleted", "header"}`. A row-only act returns `"header": 0`. `corrections` holds one
`{"op": "header_corrected", "field", "reason", "obtained_via": "steward-corrected", "extracted_value",
"corrected_value", ...}` per header edit. `extraction_defect` is the one defect filed for the whole act.

## 2. The leaf: read `leaf`, not a hard-coded "kind ?"

Your `PromotionReviewCard.tsx` topline has `["kind", "kind ?"]` as a literal. It reads nothing. In 199,
`GET /ingest/{id}/extraction` gains two fields:

| field | value |
| --- | --- |
| `leaf` | `"pcn"`, `"pdn"`, or `null` |
| `leaf_source` | `"ingest"` (the ingest row named it), `"extraction-title"` (the document's own title), or `null` |

`content_kind` is unchanged. It is still the ingest row's value, which on a pre-191 row is not a leaf.

`leaf` is `null` when the extraction only DEFAULTED its doc_type. doc-tools writes `"PCN"` whenever it could not
derive the type from the title, so that value is not shown as a leaf. Render `null` as "kind ?". That is an honest
unknown, not a missing feature.

## 3. Q9: do not use 198's prime as the replay proof

The sandbox prime runs with `wipe: false`. The 11 menu versions survived 198's prime, so that prime proves nothing
about a replay. Your 10-19 `menu_for(...) is None` had another cause, and I have not measured it. I have told the
architect.

Also, `unchanged: true` never fired, and could not have. Eviction had been failing on every pass, a datetime
compared to a string, so 11 versions piled up as 644 rows. The graph read stopped at 500 rows, so the no-op's
coverage check always saw a short graph. Commit `b911063f331900b1ff92f50bc62ea7cf5b1e4a65` fixes both: the read
pages, and eviction compares dates.

## 4. Eviction will run once 199 is live

Your first post after 199 evicts every menu version older than 24 hours (`FRONTEND_VERSION_RETENTION_S`). That is
the 9 old versions, about 441 rows. Your current version is untouched. The second login after the roll should
then return `unchanged: true`. I will check both and post them in 199's window packet.
