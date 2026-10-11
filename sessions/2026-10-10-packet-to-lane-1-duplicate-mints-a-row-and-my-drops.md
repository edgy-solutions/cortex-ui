# Packet: a duplicate drop mints a row (server bug, as ruled); a "my drops" list route; cad extensions

**From:** cortex-ui/master, 2026-10-10
**To:** invincible-agent/lane/01
**Re:** Chris's walk of the P0 drawer on the cluster, and the architect's three amendments to cortex PR #4 (the composer, now approved by Chris for 186 or 187)

## 1. `POST /ingest` of a duplicate mints a new row. The architect rules that a server bug.

> "a duplicate must not mint a row; it shows the original's id and the original's current status … If the server mints a row for a dup, packet Lane 1 — that's a server bug."

**Measured at IA origin/master `3976a9e0`; read, not run.**
- `gateway.py:9378-9397`: when `find_primary_by_sha` hits, the route calls `ingest_status.record_duplicate_arrival`. That function **writes a new row**: `id = str(uuid.uuid4())`, `status = duplicate`, `duplicate_of = original.id` (`ingest_status.py:303-330`).
- The route then answers:
  ```
  {"ingest_id": <the NEW uuid>, "stage": <original's status at that moment>, "detail": …,
   "duplicate": {"of_ingest_id": <original id>, "message": …}}
  ```
- This is the `1191231e…` id Chris saw, with its own RECEIVED badge.

**The citation does not hold.** The docstring justifies the row with ADR-0041 §8: "records the arrival as provenance". That phrase is not in ADR-0041 at `3976a9e0`; `grep -i 'records the arrival'` finds nothing. The only duplicate text is R3, which is about `(issuer, document_number, revision)` identity, not about minting a row per re-drop.

**The ask:**
- the response's `ingest_id` is the **original's** id;
- no new row is written;
- if a record of the repeat arrival is still wanted, keep it somewhere that does not take an id or show up as a status row, for example a provenance or audit event against the original.

**Cortex does not wait on you.** The amended PR #4 takes `duplicate.of_ingest_id` as the turn's id. It polls `GET /ingest/{original}/status` for the live stage, and never shows the duplicate response's own `ingest_id` or `stage`. So it renders correctly against today's server and against the fixed one.

## 2. PCN24-060 "still at received": the architect asked you directly

The architect asked you directly to check whether PCN24-060 (sha `c75116ec…`) is past `received`, and if not, which stage stalled. Cortex adds one fact: in the drawer Chris walked (rev 182/182a), the duplicate card's badge came from the duplicate response's `stage`. That is the original's status **at the moment of the re-drop**, not its live status. So the drawer did report the original as `received` at that moment. Whether it is still there now is yours to check.

## 3. A server list of "my drops"

The second amendment's ruling is that closing a panel must never lose a status the server has. The status is re-fetched by id from a list of the user's own drops. Today there is no list route: `GET /ingest/{id}/status` is the only read.

So cortex keeps the list of ids **client-side**: per user, in browser storage, newest first, at most 50. That list is lost on another device or after storage is cleared.

**Ask (not urgent):** `GET /ingest?mine=1` (or a name you prefer), scoped like `/status`: rows where `submitted_by` or `on_behalf_of` is the caller, newest first, each with the same fields `/status` returns. Once it exists, cortex lists from it and keeps the local list only as a fallback.

## 4. cad extensions

Under the first amendment, cortex infers `pdf | cad | xml` from the extension plus sniffed bytes, and asks only when they disagree or there is no extension.

The platform declares no cad extension list, so cortex chose one:

| Extension | How cortex checks it |
|---|---|
| `.step` / `.stp` | bytes start `ISO-10303-21` |
| `.dwg` | bytes start `AC10` |
| `.dxf` | first non-blank line is `0` |
| `.igs` / `.iges`, `.stl` | extension only |

Confirm or correct that list, with doc-tools if it owns the cad extractor.
