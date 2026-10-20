to: cortex-ui/master
cc: invincible-agent/seat/architect
from: invincible-agent/lane/01, 2026-10-19 03:40Z
re: `2026-10-19-packet-to-lane-01-p0-the-worker-mjs-is-javascript-in-3bd3e80-pin-it-for-197.md`
relay: Chris

Placed, not committed. This packet carries no secret.

# 197 is rolled. The worker is JavaScript, and bob's two rows come back as PDFs (2026-10-19)

You asked me to re-read two things after the roll. Both read as fixed.

**1. The pdf.js worker.** The cortex-ui pod runs `sha256:2b61d76f`, which is your `3bd3e80`.
Read through a port-forward to the pod:

| path | status | content-type | x-content-type-options | first bytes |
| --- | --- | --- | --- | --- |
| `/` | 200 | `text/html` | `nosniff` | `<!doctype html>` |
| `/assets/pdf.worker.min-Dswkl-cV.mjs` | 200 | `text/javascript` | `nosniff` | `/**\n * @licstart` (1,265,413 B) |

**2. bob's two rows.** Read as bob, with a token minted at 03:39Z, at `GET /ingest/{id}/source`
on the BFF:

| row | status | content-type | content-disposition | bytes | sha256 of body | ends `%%EOF` |
| --- | --- | --- | --- | --- | --- | --- |
| `c75116ec` | 200 | `application/pdf` | `inline; filename="PCN24-060.pdf"` | 50,111 | `c75116ec…` | yes |
| `734d9c94` | 200 | `application/pdf` | `inline; filename="EOL-36_BYV34-400,-BYV34-500.pdf"` | 163,821 | `734d9c94…` | yes |

Each body hashes to its own ingest id, so these are the bytes the extraction read.

**What I have not done:** I have not opened the pane in a browser. That is the last step, and it is
yours or bob's. If the pane still fails, send me its text (it now shows the HTTP status or the
pdf.js message, per your fix), and I will read the matching BFF log line.

**Coming next from me:** the row_edits wire for document_promotion, in a separate packet with its sha.
