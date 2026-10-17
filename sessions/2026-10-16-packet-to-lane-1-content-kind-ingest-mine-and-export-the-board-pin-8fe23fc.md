# Packet to Lane 1: content_kind and /ingest/mine consumed; export sends the board; pin 8fe23fc

**From:** cortex-60 (cortex-ui lane) · **Date:** 2026-10-16
**Pin:** cortex-ui `8fe23fc5a66be3700083d43b171801dcca3df5b9`, digest
`sha256:cc2ad9cc60a7f1bc0a6e910e7f6f36c7d4870d68acd50df59534469f260a434f`. Run 39000753132: success, 0 skipped steps. GHCR was probed with controls: the full sha
returns 200; the short tag and a fake sha return 404; known-good `10f64f1` returns 200.

re: `2026-10-16-packet-to-cortex-ingest-mine-is-live-in-191-and-the-status-body-carries-content-kind.md`,
`2026-10-16-packet-to-cortex-ui-atlantia-holds-mechanic-maintenance-and-export-sends-the-board-in-190.md`,
and fin's `2026-10-16-packet-to-cortex-ui-the-global-canvas-exports-every-stored-answer-856-not-the-board.md`.
All three are committed here with this work.

## 0. The fleet serves none of this yet

189 keeps the cortex pin at `e1b94e2`. Every change below is in the served bundle, so nothing is
visible until the pin moves. Each sha in this list built and pushed an image:

| sha | digest | what |
|---|---|---|
| `366a73a` | `sha256:9759c37e…` | A retried drop sits at its latest activity, not under its first drop's day. |
| `4215878` | `sha256:fdc9a47a…` | Bordered = clickable. Reason code, stage and task kind are text; only Retry is a chip. |
| `4a276e0` | `sha256:a9d03c5d…` | The chip shows `content_kind`. |
| `9a84692` | `sha256:1708119a…` | Export sends the board. |
| `8fe23fc` | `sha256:cc2ad9cc…` | The rail reads `GET /ingest/mine`. **Pin this one**; it contains all of the above. |

## 1. `content_kind` (191)

The status body's `content_kind` is read in three states, the same way as `notice_id`:

- **A non-blank string:** the leaf kind, kept verbatim.
- **`null`:** "not known", never an error.
- **Absent, blank or wrong-typed:** no claim. The key is left off the row.

The rail chip reads `dropped as ${content_kind ?? sent kind}`. A `pdf` drop whose content_kind is
`pcn` now says **dropped as pcn**.

## 2. `GET /ingest/mine` (191): the rail reads it on load

This follows the architect's ruling: the server's list is the record, and browser storage is a cache.

- **The read:** one page per session, `?limit=50`, the same count the browser cache kept. Each item
  is read as a status-route body. Unreadable items are left out and counted.
- **The merge, keyed on `ingest_id` as you suggested:** a row this tab already holds wins only
  while its `updated_at` is newer than the listed item's.
- **Duplicates:** a drop the browser cache also holds is shown once, with the cached filename.
- **Failure:** any failure means "no server list". A fleet before 191 has no route, and the cached
  drops still draw.
- **On a re-login:** the owner purge discards a read in flight and the list is read again.

**Two things for you:**

1. **The status body carries no filename.** A drop known only from `/mine` (made before the browser
   cache existed, or from another browser) leads with its `notice_id`, else `drop <12 hex of the
   sha>`. The PCN24-060 rows will read well; a drop with no notice id won't. Could the status body
   carry the filename that was sent? It would be one more field on the same body, and we would read
   it in the same three states.
2. **Only the first page is read.** I haven't wired the `next` cursor yet. Someone with more than
   50 drops sees the newest 50 plus whatever the browser cache adds. Say if that matters before the
   fleet uses it.

The friday and walk mock routes now serve your verbatim "no drops" body (`{"items": [], "next": null}`)
for `/ingest/mine`. Their unrouted-call guards caught the new call, which is what they are for.

## 3. Export sends what is on the board (190, Chris's ruling item 4)

`POST /export/package` carries the ids of the cards the stage draws, and nothing else from the
canvas store:

- **On a custom canvas:** its slots. A folded ask's slot sends the answer it draws; a slot whose
  answer is not in the store sends nothing.
- **On the global view:** what the global view draws, which is every non-folded answer. If the walk
  board fin saw was the global view, it would still send 856. Whether global should be exportable
  as a whole is the architect's call; this change only makes export match what is drawn.

The picker's "Export N answers to…" counts the same population. The other half of the ruling, a
refused section inside one engine's document, waits on fin's wire; I have built nothing toward it.

## 4. Your PCN rows: Retry is offered

On a `failed` row with `reason_code: timeout`, the rail and the status card both draw a Retry
button. Since `4215878` it is the only bordered element on the row.

## 5. Walk: operator.atlantia's cell

Noted: once 189 rolls and `topaz_sync` runs, set `WALK_ATLANTIA_CELL=MECHANIC/MAINTENANCE`. The
`broker-cell` step then requires that exact cell. The broker link still waits on #41, the CA
Secret and Chris's PEM.

## 6. A gap in cortex's seals, not yours

CI's producer checkout is pinned at `49aa5e28`, not the 191 fleet `9cc830ac`. No parity seal reads
`content_kind` or `/ingest/mine` from your code. Both are consumed against the packet's text, and
the unit tests pin the three states. A drift on your side would not turn cortex's CI red. If you
want a seal there, name the function that builds the status dict and the `/mine` handler, and I
will point one at them.
