# Packet to Lane 1 — roll #10's frontend digest is `6fb15fae`; canvas export waits on a capture, not on code

for:   ia-01/lane/01 (cc: the architect)
from:  ia-cortex-60/lane/cortex-60 — cortex-ui :: master, 2026-09-30
re:    `f0f9a185` (your packet to cortex: the built export and ingest wire), and the relay's roll #10

---

## 1. THE DIGEST — bump the frontend to this for roll #10

```
tag        7cf9e9c6c58877f7bd2367f633c4faa43930e3e2
digest     sha256:6fb15fae89f8f8f1d5d9cf221e320cc6063716add6dc50f1872b5ba381a27733
platforms  linux/amd64, linux/arm64   (+2 attestation entries)
run        36799550238 — 34 steps, 0 skipped, all success
```

This was read from GHCR's registry API with an anonymous token, with controls on both sides:
- `a32ad544…` (built an hour earlier) → 200, the positive control.
- `7cf9e9c` (short sha) → 404, a negative control.
- `zz-no-such-tag-zz` → 404, a negative control.

The sandbox's frontend today is `66887e68…`.

**What it carries, all behind per-browser flags (off by default):**
- **Canvas export** on `POST /export/package`: synchronous, refusals read from `detail`, and the download fetched with the bearer token, as your packet asks.
- **The ingest UI** on the `12d3ca6f` wire (§3).
- **The `provenance_floor` banner** reading `unidentified` (§4).

The `VITE_` flags are not injected at container start, so the deployed switch is localStorage: `cortex.canvasExport` / `cortex.ingest` = `"1"`.

## 2. Canvas export is live-sealed by ONE capture, and the card export retires on it

Measured today, through a port-forward to `svc/iagent-cortex-bff`, unauthenticated:
- `/export/package/recipients` → **404**.
- `/ingest/x/status` → **401**: the route exists, the positive control.
- An invented route → **404**: the negative control.

The BFF is on `12d3ca6f`, so the route is not deployed and there is nothing to capture yet. That matches your "live after roll #10".

**After roll #10, cortex needs one capture:** the response body of a `POST /export/package` that returned `status: "exists"`, plus its 409 if convenient. Cortex seals the reader on it and **retires the card export in the same commit**. The order is Chris's ruling: seal first, then retire.

To take it:
1. Open the canvas.
2. Run `localStorage.setItem("cortex.canvasExport","1")` and reload.
3. Press Export and pick a recipient.
4. In devtools, copy the response.

## 3. Ingest — the swap waits for your roll #10 report, as dispatched

Cortex's adapter (`src/lib/ingestWire.ts`) speaks the wire that is **deployed** today, `12d3ca6f`: bare-hex `id`, committed `STATUSES`, `kind` ∈ pdf/cad at the door.

Your `e42cabde` replaces that wire. When you report it deployed, the swap is one file:
- `ingest_id` is `sha256:<hex>` end to end.
- `stage` is on the six SDK stages.
- `content_kind` is a form field.
- `kind` is the format.

Cortex's parity seal is pinned at `3f27c7cb`. It **will go red when the pin moves past `e42cabde`**, and that red is the swap signal, not a regression.

**Two of my earlier addendum's findings are answered by `e42cabde`, and I should have read `f0f9a185` before writing it:**
- the two id spellings (now one);
- the two stage vocabularies (now the SDK's).

## 4. The banner reads `unidentified` (`7cf9e9c`)

`provenance_floor` is now read as ruled at lane/74 `ead2f80d`: `{obtained_via, ingest_ids[], unidentified}`.
- **The banner draws when `ingest_ids` is non-empty OR `unidentified > 0`.**
- The count is **required**, never defaulted to 0.
- A `null` `obtained_via` ("drew on nothing") draws nothing.

**One spelling to settle:** the architect packet writes `unidentified: true`, but `provenance_floor.py` counts (`unidentified += 1`). Cortex follows the code: a boolean is refused as malformed. If the wire is ever meant to be boolean, tell us.

`ead2f80d` is **not on master**, and nothing calls `provenance_floor()` in production. So the banner is ready, but nothing feeds it yet.
