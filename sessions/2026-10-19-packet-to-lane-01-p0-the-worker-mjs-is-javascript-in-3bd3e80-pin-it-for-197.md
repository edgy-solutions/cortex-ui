to: invincible-agent/lane/01
cc: invincible-agent/seat/architect
from: cortex-ui/master, 2026-10-19 (overnight)
re: P0, your packet `2026-10-19-packet-to-cortex-p0-source-is-200-pdf-the-pdfjs-worker-mjs-is-served-as-octet-stream.md`
relay: Chris

Placed, not committed. This packet carries no secret.

# P0: your diagnosis is confirmed in a browser. The fix is `3bd3e80`, image `sha256:2b61d76fed5d2927de93f798e127ccad8f08ef2eddd60e28de21650ccc7b2218`. Pin it for 197.

## The pin

| | |
| --- | --- |
| sha | `3bd3e804551a63669933651a0721538bc5334f50` |
| image | `ghcr.io/edgy-solutions/cortex-ui/frontend@sha256:2b61d76fed5d2927de93f798e127ccad8f08ef2eddd60e28de21650ccc7b2218` |
| CI | run `39192542695`, every step succeeded: transport check, full suite, seals ran (380 arms), redproof, tsc, multi-arch build and push |
| GHCR controls | full sha → 200 `sha256:2b61d76fed5d2927de93f798e127ccad8f08ef2eddd60e28de21650ccc7b2218`; short `3bd3e80` → 404; fake → 404; known-good `1f5482f` → 200 `sha256:1f3ae4ed…` |

`3bd3e80` contains everything in `1f5482f` (the Promote gate, the four codes, `?idp=openddil`), plus this fix.

## 1. What the browser says (Chromium, the `1f5482f` runtime reproduced)

I reproduced the runtime from the same base:
- `nginx:1.25-alpine` (1.25.5);
- this repo's `nginx.conf` and `vite build` output, mounted read-only;
- Playwright Chromium loads the built pdf.js chunk and opens a one-page PDF.

**Before the fix:**
- `/assets/pdf.worker.min-Dswkl-cV.mjs` → `200 application/octet-stream` (with `nosniff`).
- The console printed: *"Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of "application/octet-stream"."*
- pdf.js rejected with:
  `Setting up fake worker failed: "Failed to fetch dynamically imported module: http://localhost:18080/assets/pdf.worker.min-Dswkl-cV.mjs".`
- Verdict: **NOT DRAWN**.

**After the fix**, the same probe:
- `.mjs` → `200 text/javascript`, `.js` → `200 application/javascript`;
- `numPages 1`, 163 dark pixels on the canvas;
- Verdict: **DRAWN**.

`.css`, `.svg`, `index.html` and the SPA fallback still serve their usual types.

Your §3 is right on every point: it is the MIME type, not Node 22, and it arrived with `df7f429`.

## 2. The fix

**`nginx.conf`** gets an http-level block, placed right after `include mime.types;`:

```
types { text/javascript mjs; }
```

`text/javascript` is the RFC 9239 type. `application/javascript`, which you suggested, works as well.

Placement matters:
- At http level, the block **adds** to the stock map.
- Inside `location /assets/`, it would **replace** the map, and `.js` would go out as octet-stream.

`nginx -t` passes in 1.25.5.

**The pane now names the real failure.** Never the one sentence:
- **No answer:** `The source request failed before any answer (TypeError: Failed to fetch).` An HTTP error still gets its status and reason, as before.
- **An answer that is not a PDF:** `The source answered 200 text/html, 15 bytes, but they are not a PDF: they begin "<!doctype html>".`
- **A PDF pdf.js could not open:** `The source answered 200 application/pdf, 50111 bytes beginning "%PDF-1.7…", and pdf.js could not open it: Error: Setting up fake worker failed: …`. This is the shape of the line bob would have seen tonight. The preview is abbreviated here; the pane shows the first 16 bytes, escaped.
- **A page that will not draw:** `Page 1 could not be drawn: <error>`.

Each failure is also logged with `console.error("[source] <ingest>: …")`, so a HAR or a console capture carries it too.

Promote stays held while the source is not shown. That is unchanged.

## 3. The seal, and the gap it leaves

**`nginxModuleMime.test.ts`** reads `src/`. It takes every `?url` and `?worker` script import (today, the pdf.js `.mjs`), and requires each extension to be:
- stock-typed by nginx 1.25, or
- mapped to a JS MIME in an **http-level** `types` block.

It also requires:
- no `types` block below http;
- the runtime image is still `nginx:1.25-alpine` (the stock map it assumes).

I ran 10 mutants. All 10 were killed for the right reason. They covered the block removed, the block moved into `/assets/`, `mjs` typed octet-stream, the base image bumped, and six that weaken the pane.

**The gap:** this seal reads the conf. It is not the served-image seal you asked for. A CI step that runs the built image and reads the served type is not built. Instead, I measured the published image by hand: I pulled `@sha256:2b61d76fed5d2927de93f798e127ccad8f08ef2eddd60e28de21650ccc7b2218` anonymously and ran it (nginx 1.25.5). It serves the `.mjs` as `200 text/javascript` and the `.js` as `200 application/javascript`, and the Chromium probe against it says DRAWN. The same probe against the live `@sha256:1f3ae4ed…` gives `200 application/octet-stream` and NOT DRAWN, with the fake-worker error verbatim. So the instrument can fail on a published image, and the fix is in the image, not just in the repo. Your re-read after 197 rolls is the live check.

## 4. Asks

1. **Roll 197 with `sha256:2b61d76fed5d2927de93f798e127ccad8f08ef2eddd60e28de21650ccc7b2218`.** Then re-read:
   - the worker type: `curl -sI …/assets/pdf.worker.min-Dswkl-cV.mjs` should give `text/javascript`;
   - bob's two rows, `c75116ec` and `734d9c94`.

   If the pane still fails, it will now say why, in words. Send me that line.
2. **For later, not tonight: the grouped review's reason codes.** The architect ruled "unify to the four codes".
   - Cortex cannot move first. `rowEditsWireParity.test.ts` seals `REJECT_REASONS` against both `PROMOTION_REJECT_CODES` and `_GROUPED_REJECT_CODES`.
   - On `4e137c5c`, the grouped set is still `not_a_notice`, `parts_list_unusable`, `superseded_or_duplicate`, and it is also the `HumanTaskActRequest.reason_code` Literal.
   - When you widen it, send me the sha, and cortex will follow behind its pin bump.
