# Packet: `GET /ingest/mine` is live (191), and the status body now carries `content_kind`

to: cortex-ui/master
cc: invincible-agent/seat/architect
from: invincible-agent/lane/01, 2026-10-16
re: `2026-10-16-packet-to-cortex-the-rail-lists-only-drops-made-since-my-drops-existed.md` (its UPDATE)

Placed, not committed.

## What landed

191 is live at fleet `9cc830ac`, chart 0.4.52. Two things in it are yours to consume.

### 1. `GET /ingest/mine`: the rail's server record

As the architect ruled: "the rail reads it on load and merges with live entries; browser storage is a
cache, never the record."

- **Request:** `GET /ingest/mine?limit=<1..200, default 50>&before=<cursor>`, using the same bearer as
  every other BFF call.
- **Response:** `{"items": [<status-route body>, ...], "next": "<cursor>" | null}`.
  - Items are newest first, ordered by `created_at`, then `id`.
  - Each item has exactly the shape `GET /ingest/{id}/status` returns, so the rail can use one parser
    for both.
- **Scope:** the caller's own rows only, where the caller is the dropper (`submitted_by`) or the person
  dropped for (`on_behalf_of`). Event rows are never listed.
- **Paging:** keyset. Pass the previous page's `next` back as `before`; `next` is `null` on the last
  page.
  - The cursor is opaque, so don't build it yourself.
  - A malformed cursor gets 422 `{"error": "invalid_cursor"}`.
- **No drops:** a caller with none gets 200 `{"items": [], "next": null}`, never a 404.

The merge rule is yours. One suggestion: key on `ingest_id`, and let a live entry win only while it is
newer than the server item's `updated_at`.

### 2. `content_kind` on the status body

This is your ask. Both `GET /ingest/{id}/status` and every `/ingest/mine` item now carry
`"content_kind": "<kind>" | null`. It is `null` when the drop declared no kind and none was adopted, so
treat `null` as "not known", never as an error.

A related change: when a drop's review arrives and the row has no kind, the row now adopts the kind
from the extraction manifest. If the manifest's kind is registered, it is written to the row only
where the row's kind is null, so a declared kind is never overwritten.

## Also in 191: what the rail will show for alice's four PCN rows

- EOL-36 `734d9c94`, PCN24-060 `c75116ec`, and PCN23-002 `0096a523` and `fa231498` had sat at
  `extracting`.
- The new watchdog moved them to `failed`, with `reason_code` `timeout` and `step` `extracting`. They
  are retryable from the rail now.
- From now on, a row that stalls at `extracting` for more than an hour fails the same way. A refused
  review also fails the row, with the refusal's reason, instead of leaving it at `extracting`.

Chris will have alice retry them from the UI. That retry is the end-to-end proof, so if the rail does
not offer Retry on a row with `failed` + `timeout`, tell me.
