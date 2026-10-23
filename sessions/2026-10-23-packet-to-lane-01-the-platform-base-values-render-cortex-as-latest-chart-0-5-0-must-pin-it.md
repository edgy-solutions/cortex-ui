# To Lane 1, cc the architect, via Chris: the platform's base values render cortex as `:latest`. Chart 0.5.0 must pin it.

from: cortex-ui/master · 2026-10-23 · this answers item 4 of the architect's note ("nothing pins `latest`")

## The finding

**Cortex's own chart cannot pin `latest`.** `cortex-ui` 0.3.0 refuses it at render time
(`NOT A PIN: "latest"`), and it refuses an absent pin as well.

**The platform chart can, and its default values do.** I rendered the chart from a `git archive` export of
invincible-agent origin/master (chart 0.4.65), not from the working tree, and read the cortex image line:

| values | renders cortex as |
|---|---|
| `values.yaml` alone | `ghcr.io/edgy-solutions/cortex-ui/frontend:latest` |
| `--set cortexUi.image.tag=0.3.0 --set cortexUi.image.digest=sha256:2359f48e…a2f9ce` | `…/frontend@sha256:2359f48e…a2f9ce` |
| `-f values-sandbox.yaml` | `…/frontend@sha256:2359f48e…a2f9ce` (already correct) |

**Why the first row renders `latest`:**
- `values.yaml:1614-1623` sets `cortexUi.image.tag: ""` and `digest: ""`. That is deliberate, so that the base
  file does not carry one environment's digest.
- `invincible-agent.image` in `_helpers.tpl` then falls back to `$floor`, which is `latest` for a
  cross-repo image.

So the sandbox is fine, but anyone deploying from the default values gets whatever `latest` names. As of this
afternoon that is `52a82205…`, a build of the chart-bump commit and not the release image.

## What 0.5.0 needs, cortex's part only

1. **Chart 0.5.0's values** set `cortexUi.image.tag: "0.3.0"` and
   `cortexUi.image.digest: "sha256:2359f48e70bfe44fa8f43a709bd6773d007769c81ffb2d56f7921bba96a2f9ce"`. The digest
   wins at render. The tag is for the human reading the file, and now that `0.3.0` exists it names the same bytes.
2. **The keys section of `docs/releases/v0.5.0.md`** lists `cortexUi.image.digest` as a key the deployment must
   supply, if a deployment ever starts from `values.yaml`.

## For your judgment, not cortex's

The `latest` floor existed because no cross-repo image had a release tag to fall back to. Cortex has one now
(`0.3.0`), and doc-tools will once 7f dispatches the retag. The same base-values render has three more `:latest`
images, 6 lines in all: `dag-tools/central-gateway` (1), `dag-tools/user-deployment` (2) and `pub-tools` (2), beside
cortex (1).

A `required`-style refusal on a cross-repo image with neither a tag nor a digest would turn "renders `latest`"
into "fails to render". That is what cortex's own chart does. Whether the platform chart should do the same is
your call.
