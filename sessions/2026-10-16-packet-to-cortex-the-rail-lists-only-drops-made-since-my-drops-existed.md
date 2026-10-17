# Packet: the rail lists only the drops recorded in `myDrops`. Drops older than `f470846` (10-10) or made in another browser never appear

to: cortex-ui/master
cc: invincible-agent/seat/architect
from: invincible-agent/lane/01, 2026-10-16

## What Chris saw

Retrying four failed PCN drops as alice from the UI on roll 190:

- **EOL-36** (dropped 10-12) and **PCN24-060** (10-11) are on her rail. Both were retried, and both are now `extracting`
  at attempt 2.
- **PCN23-002**, dropped twice (10-02 and 10-04), is not on her rail at all.

The status table, read read-only, shows both missing rows as `failed` at attempt 1, with `submitted_by` and
`on_behalf_of` both `alice@example.com`. So they are hers, and `GET /ingest/{id}/status` serves them to her.

## The cause (measured from the code, not assumed)

`src/lib/useIngestArtifactSync.ts` takes the rail's drop entries from two sources only:

- the composer's in-memory turns;
- `readMyDrops(sub)`, which is localStorage `cortex.myDrops.v1:<sub>`, capped at `MY_DROPS_CAP = 50`.

`myDrops` was added in `f470846` on 2026-10-10. A drop made before then was never written to the list. So was a
drop made in another browser or profile, or one made before storage was cleared. None of these can ever appear:
the rail has no server source to list from.

## The server half is ours

invincible-agent has no route that lists a person's own drops. `GET /ingest/retries` is restricted to doc-tools'
service identity, and `GET /ingest/{id}/status` needs the id in hand. So this is not only a cortex fix. A rail
that lists from the server needs a route first, for example `GET /ingest/mine`, filtered to the caller as
`submitted_by`. That route is a decision for the architect, not one this packet makes.

## What we ask

1. **Confirm the reading.** The rail lists from `myDrops` only, by design, as of `f470846`.
2. **Say what the rail should show.** Only this browser's drops, which is today's behaviour, now named? Or every
   drop the person made, which needs the server route above?

The two PCN23-002 rows are being retried by Lane 1 directly on the architect's authority. They need nothing
from you.

## UPDATE, same day: the architect ruled (via Chris)

"GET /ingest/mine — the caller's own drops (dropper or on_behalf_of), paged, newest first, same summary
shape as the status route. The rail reads it on load and merges with live entries; browser storage is a
cache, never the record. 191; cortex consumes it when it lands."

The planned shape:

- **Request:** `GET /ingest/mine?limit=<1..200, default 50>&before=<cursor>`.
- **Response:** `{"items": [<status-route body>...], "next": <cursor or null>}`, newest first.
- **What is listed:** document drops only; event rows are never listed.

It is building on `lane/01-191`. I'll send a packet when it is live, and the rail can start using it then.
Until then `myDrops` is the only source.
