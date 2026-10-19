to: cortex-ui/master
cc: invincible-agent/seat/architect
from: invincible-agent/lane/01, 2026-10-19 (overnight)
re: P0, "source pane says could not be read as a PDF", rows c75116ec and 734d9c94, seen as bob on 196
relay: Chris

Placed, not committed. This packet carries no secret.

# P0: `/source` is 200 `application/pdf` with the right bytes. The pdf.js worker `.mjs` is served as `application/octet-stream`, and the browser will not run it.

## 1. Bob's own browser session: the BFF answered 200 every time

The BFF has no cookie session. `get_current_user` is `OAuth2PasswordBearer` (`src/iagent/auth.py:29`),
and the card sends bob's Keycloak bearer through axios. So instead of replaying, I read bob's **real
browser requests** from the BFF log (24h window, `deploy/iagent-cortex-bff`):

| time (UTC, 10-19) | route | ingest | audit | access log |
| --- | --- | --- | --- | --- |
| 02:40:23 | source | `c75116ec…` | `caller=bob@example.com decision=allow reason=task_holder` | `200 OK` |
| 02:41:03 – 02:41:07 | source (x3) | `734d9c94…` | same | `200 OK` (x3) |
| 02:41:39 – 02:41:43 | source (x3) | `c75116ec…` | same | `200 OK` (x3) |

There is no 401, 403, 404 or 5xx on either id. The requests reach the BFF through Traefik directly, and
no ingress in `sandbox` carries a middleware, so nothing rewrites the body in between.

## 2. The bytes: a replay of the same handler, as bob (minted bearer, labelled as such)

| ingest | status | content-type | disposition | body | sha256(body) |
| --- | --- | --- | --- | --- | --- |
| `c75116ec…` | 200 | `application/pdf` | `inline; filename="PCN24-060.pdf"` | 50,111 B, `%PDF-1.7`, ends `%%EOF` | `c75116ec…`, **equals the ingest id** |
| `734d9c94…` | 200 | `application/pdf` | `inline; filename="EOL-36_BYV34-400,-BYV34-500.pdf"` | 163,821 B, `%PDF-1.7`, ends `%%EOF` | `734d9c94…`, **equals the ingest id** |

The ingest id is the content hash, so the body is exactly the dropped file. The response is streamed,
so there is no `Content-Length`. Axios with `responseType: "arraybuffer"` does not need one.

## 3. The fault: the worker asset's MIME type, measured on the live cortex-ui `1f3ae4ed`

I fetched `index.html`, walked its chunks, and fetched the worker URL that the `pdfSource` chunk
names:

```
/assets/pdf.worker.min-Dswkl-cV.mjs  200  application/octet-stream  1,265,413 B  (starts "/**\n * @licstart")
```

The worker **is** bundled and served, but with the wrong type:
- `nginx.conf:10–11` is `include mime.types;` then `default_type application/octet-stream;`.
- `nginx:1.25-alpine`'s `mime.types` has no `mjs` entry, so every `.mjs` falls back to the default.
- `X-Content-Type-Options: nosniff` is on `/assets/`.

Browsers apply strict MIME checking to module scripts. pdfjs-dist 6.3.289 starts the worker as
`new Worker(url, { type: "module" })`, which is refused. Its fallback, the "fake worker", is a
dynamic `import()` of the same URL, which is refused for the same reason. `getDocument(...).promise`
then rejects, and the pane shows the one sentence. This also explains why the extraction read these
bytes fine.

**Not the Node 22 build.** `aa1be53` changes the builder stage only. The served type comes from the
nginx stage, `FROM nginx:1.25-alpine`, which did not change. The `.mjs` worker arrived with the review
card, `df7f429`, and pdfjs-dist 6.x.

## 4. The fix is yours, with what I would check

- **The MIME type.** Map `mjs` in `nginx.conf`, after `include mime.types;`:
  `types { application/javascript mjs; }`. Check it with `nginx -t` in the image, then
  `curl -sI …/assets/pdf.worker.min-*.mjs` should show `application/javascript`.
- **The pane.** As the architect asked, show the real failure in the pane, not the generic sentence:
  - the `/source` HTTP status when the fetch fails;
  - otherwise pdf.js's own message.

  This fault would have read *"Setting up fake worker failed: …MIME type…"*.
- **A seal against the served image.** Assert the type of the served `.mjs`, not just its presence. A
  unit test with a stand-in pdf.js cannot see this.
- **Then pin.** Send me the new image digest. 197 rolls with your pin and 74's Q6 fix. I have a bob
  bearer, and I will re-read the worker type and `/source` after the roll.

## 5. What I did not do

- I did not see the browser console or pdf.js's error text. §3 is the mechanism read from the
  measured header and pdf.js's documented loading path. Your browser check confirms it or does not.
- I did not test any other `.mjs` asset. The walk found one worker reference across 3 chunks.
