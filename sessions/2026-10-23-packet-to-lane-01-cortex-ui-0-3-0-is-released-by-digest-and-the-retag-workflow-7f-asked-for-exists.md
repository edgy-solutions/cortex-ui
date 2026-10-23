# To Lane 1 (release owner), cc doc-tools 7f and the architect, via Chris: cortex-ui 0.3.0 is released, by digest. The retag workflow 7f proposed already exists in cortex-ui and is proven.

from: cortex-ui/master · 2026-10-23 · during the freeze (registry and release only, no roll)

## For `docs/releases/v0.5.0.md`, the cortex row

The amendment makes this release **cortex-ui 0.3.0**, continuing from 0.2.1, not v0.5.0.

| field | value |
|---|---|
| image | `ghcr.io/edgy-solutions/cortex-ui/frontend` (the path includes `/frontend`, and `edgy-solutions/cortex-ui` is not an image) |
| tag | `0.3.0` (no `v`, like the platform's) |
| index digest | `sha256:2359f48e70bfe44fa8f43a709bd6773d007769c81ffb2d56f7921bba96a2f9ce` |
| platforms | linux/amd64 `sha256:d88c7265…a9fc63`, linux/arm64 `sha256:42539805…f3854f` (and 2 attestation manifests) |
| source commit | `c390a036d0190176201cb328acfc9a2f0adf8cd1` |
| build run | https://github.com/edgy-solutions/cortex-ui/actions/runs/39815907710 |
| retag run | https://github.com/edgy-solutions/cortex-ui/actions/runs/39961486559 |
| chart | `cortex-ui` `0.3.0`, package sha256 `cb5c92fca1ef8c17cc8baa67e95b0bc9193f034d726cf46a5caa373a082a042c`, repo `https://edgy-solutions.github.io/cortex-ui`, git tag `cortex-ui-0.3.0` at `e2d2d28` |
| release note | https://github.com/edgy-solutions/cortex-ui/releases/tag/cortex-ui-0.3.0, the same text as `docs/releases/cortex-ui-0.3.0.md` |

**Values a deployment must supply:**
- `frontend.image.digest` (preferred) or `.tag`. It is required, and the chart refuses an absent pin.
- `frontend.env` with `VITE_API_URL`, `VITE_KEYCLOAK_REALM_URL`, `VITE_KEYCLOAK_CLIENT_ID` and `VITE_ELECTRIC_URL`.
- Optional: the feature flags `VITE_FEATURES`, `VITE_MOCK_GROUNDING`, `VITE_SEND_FRONTEND_VERSION`, `VITE_REVIEW_ROW_EDITS` and `VITE_PROMOTION_ROW_EDITS`. `VITE_NO_AUTH` is dev only.

**Secrets:** none. The package is public; `global.imagePullSecrets` is needed only for a private mirror.

**The platform chart 0.5.0** pins cortex by `0.3.0` and the digest above. That is the same digest `values-sandbox.yaml:980` pins on invincible-agent origin/master (206), so the pin's bytes are unchanged.

## How it was verified

The anonymous registry reads use an empty credential.
- **The tag:** `0.3.0` resolves to `2359f48e…`. That digest is both the `Docker-Content-Digest` header and the sha256 of the bytes served, and the full source sha resolves to it too.
- **Platforms:** amd64 and arm64 both return 200, checked in the retag run.
- **Controls, all 404:** `v0.3.0`, `0.3`, `0.3.1`, `v0.5.0`, and a never-tagged control inside the run.
- **Later builds did not move it:** `3a1bb80` and `e2d2d28` built after the retag, and `0.3.0` still resolves to `2359f48e…`.

The chart package's sha256 equals the `digest:` in the gh-pages `index.yaml`. In that index, 0.3.0 is present and 0.3.1 is absent. `git diff c390a03 e2d2d28 -- helm/` shows only `Chart.yaml`'s `version` and `appVersion`.

## Item 4: done for cortex, and two things about it

`3a1bb80` adds `org.opencontainers.image.revision`, `.version` and `.source` to every pushed image, and they are confirmed on the registry. `3a1bb80`'s amd64 and arm64 configs both carry them.

1. **`version` on a by-sha build is the sha.** A release version is a tag cut later from a digest, and it cannot be written into a label without changing that digest. So "the release tag is the digest that passed" and "the image's version label says 0.3.0" cannot both hold. This needs the architect's wording if they meant the second.
2. **The 0.3.0 image itself carries no labels.** It predates the ruling. The note says so; the build run and the digest identify it.

Also in `3a1bb80`: build.yml **no longer triggers on `v*` git tags.** That path rebuilt and pushed `frontend:<tag>`. A git tag `v0.3.0` pushed by anyone would have put rebuilt bytes under the release name. ⚠ Lane 1 and 7f: check your own build workflows for a tag-triggered build that pushes the tag name.

## To 7f: the workflow you proposed is written, and it ran

7f's 10-23 report says the doc-tools retag is blocked on `write:packages` and offers a `workflow_dispatch` job instead, not yet written. Cortex wrote that job for the same block:
[`.github/workflows/retag-image.yml`](https://github.com/edgy-solutions/cortex-ui/blob/master/.github/workflows/retag-image.yml).

**How it works:**
- It uses `GITHUB_TOKEN` with `packages: write` and needs no human credential.
- It GETs the index at the digest and checks that the bytes hash to it. It requires an index with linux/amd64 and linux/arm64.
- It refuses to move an existing tag, and re-running it for the same digest is a no-op.
- It PUTs the same bytes under the tag, which preserves the digest.
- It verifies the tag's digest, that each platform returns 200, and that a never-tagged control returns 404.

**What it gave:** the run above wrote `0.3.0` in one dispatch, and the anonymous reads agree.

**To reuse it in doc-tools, change two things:**
- `REPO` drops the `/frontend` suffix, giving `edgy-solutions/doc-tools`.
- The tag check is `^[0-9]+\.[0-9]+\.[0-9]+$`, which refuses `v0.2.0`. Allow a leading `v`.

It runs only once it is on the default branch.

## Digests built today, all on GHCR

These are not release images.
- `3a1bb80` → `sha256:2b9316eb85be0508ed8c0740e244797a0a298d1a859bc044ebbfed654c2a5c00`
- `e2d2d28` → `sha256:52a822050937f511d7c8aa7cd02d6ecf16acac8597e6df8bed99610b83103ab0`, which `latest` now names. Nothing should pin `latest`.
- `e0d1c1b` was docs-only and built nothing: 6 image steps were skipped, and its sha returns 404.

None of these change what 0.3.0 names. Monday's merge of PR #28 builds the next one.
