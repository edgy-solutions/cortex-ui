# cortex-ui 0.3.0

The Cortex frontend exactly as the sandbox runs it at helm rev 215 (roll 206). It continues from
cortex-ui 0.2.1 (2026-09-30). This release is cited by the platform's v0.5.0 release.

**Nothing was rebuilt.** The image tag `0.3.0` was cut from the digest the gates passed, by copying
the image index byte for byte ([retag run](https://github.com/edgy-solutions/cortex-ui/actions/runs/39961486559)).

## Image

| | |
|---|---|
| Image | `ghcr.io/edgy-solutions/cortex-ui/frontend` |
| Tag | `0.3.0` |
| Index digest | `sha256:2359f48e70bfe44fa8f43a709bd6773d007769c81ffb2d56f7921bba96a2f9ce` |
| linux/amd64 | `sha256:d88c72652b9a900f0ec8e4ddd8cca35e4ddb6ad87003a1a0ff3f78a028a9fc63` |
| linux/arm64 | `sha256:42539805c6fe6e88692e3934917721b4a1d589e6a8f32a417881b6bd6a3f854f` |
| Source commit | [`c390a036d0190176201cb328acfc9a2f0adf8cd1`](https://github.com/edgy-solutions/cortex-ui/commit/c390a036d0190176201cb328acfc9a2f0adf8cd1) |
| Build run | https://github.com/edgy-solutions/cortex-ui/actions/runs/39815907710 |

Pin it by digest: `frontend.image.digest: sha256:2359f48e…a2f9ce`. The package is public, so pulling
it needs no credential.

This image was built before the 2026-10-23 labels ruling. Its config therefore carries no
`org.opencontainers.image.*` labels; the digest and the build run above identify it. Every image
built from `3a1bb80` on carries `revision`, `version` and `source`.

## Chart

| | |
|---|---|
| Chart | `cortex-ui` `0.3.0` (appVersion `0.3.0`) |
| Repository | `https://edgy-solutions.github.io/cortex-ui` (gh-pages `index.yaml`) |
| Package | [`cortex-ui-0.3.0.tgz`](https://github.com/edgy-solutions/cortex-ui/releases/download/cortex-ui-0.3.0/cortex-ui-0.3.0.tgz) |
| Package sha256 (= index digest) | `cb5c92fca1ef8c17cc8baa67e95b0bc9193f034d726cf46a5caa373a082a042c` |
| Git tag | `cortex-ui-0.3.0` at `e2d2d28` |
| Release run | https://github.com/edgy-solutions/cortex-ui/actions/runs/39961714171 |

The templates and values are byte-identical to those at `c390a03`; only `Chart.yaml`'s `version`
and `appVersion` differ (`git diff c390a03 e2d2d28 -- helm/`). The chart sets no default image: the
caller pins it.

## What a deployment must supply

**The image pin is required.** Set `frontend.image.digest` (preferred) or `frontend.image.tag`. The
chart refuses to render without one. A pin that was never built still renders, so check the digest
above.

**Runtime configuration** goes in as `frontend.env` and is read by the container at start
(`docker-entrypoint.sh`); nothing is baked in at build. These keys are the contract (`.env.example`):

| Key | |
|---|---|
| `VITE_API_URL` | the platform BFF's base URL |
| `VITE_KEYCLOAK_REALM_URL`, `VITE_KEYCLOAK_CLIENT_ID` | the OIDC realm URL and the client id (a browser client: no client secret is configured here) |
| `VITE_ELECTRIC_URL` | the Electric sync endpoint for the answers rail |
| `VITE_NO_AUTH` | dev only; leave unset in any shared environment |
| `VITE_FEATURES`, `VITE_MOCK_GROUNDING`, `VITE_SEND_FRONTEND_VERSION`, `VITE_REVIEW_ROW_EDITS`, `VITE_PROMOTION_ROW_EDITS` | feature flags; unset means the shipped default |

**Secrets:** none. The frontend holds no secret, and `global.imagePullSecrets` is needed only when
pulling through a private mirror.

**Optional values:** `global.imageRegistry`, `global.imagePrefix`, `frontend.ingress.*`,
`frontend.service.*`, `frontend.resources`, `frontend.replicaCount`.

## What changed since 0.2.1

There are 99 feature and fix commits, from 0.2.1 (`0427884`) to `c390a03`.

- **The composer drop.** A file dropped anywhere on the window, or on the composer, becomes the
  prompt: a chip, a kind picker and an ingest turn. PDF, CAD and XML are inferred from the extension
  and the file's leading bytes; the kind is asked only when it is ambiguous. A duplicate shows the
  original and its live status. A refused drop draws as a refusal, and a failed one can be retried
  by its dropper. The old ingest HUD trigger and panel are gone.
- **The rail.** A drop is an ingest turn on the answers rail. The rail reads `GET /ingest/mine` on
  load, so the server's list is the record. Each drop chip names the row's `content_kind`, a retried
  drop sits at its latest activity, and rows sit at their measured height.
- **The review card.** The `document_promotion` review card: rows on the left, the source PDF on the
  right, evidence outlined (a cell, a table box, or an inherited date's sentence). Promote is offered
  only on what the steward can see. Reject takes the ruled four codes, row and header corrections
  are sealed against the live act route, and a refused grouped act names every reason. A null or
  absent bbox reads "on page N, no box", and a superseded or stale task holds the card.
- **Deep links.** `/case/{id}` opens the viewer's task, or the case read-only. `/ask?q=` types the
  question and sends nothing. `?idp=openddil` starts OpenDDIL's login with no click.
- **The leaf chip.** The review card names the leaf with one source enum (`PCN · from title`,
  `? · not identified`) and its candidates, and draws the candidate's title crop in page fractions.
- **Needs you.** `awaiting_kind` is an amber rail row ("couldn't tell, pick one"), with PCN/PDN on
  the card, a header count and a toast. `awaiting_origin` and `review_rejected` are read, no longer
  frozen.
- **Paging.** `/ingest/mine` pages past 50, following `next` up to 10 pages (500 drops). The review
  source pane gives every page its own slot, with prev/next, a page box, and the `[` and `]` keys.

Also in this release:

- Archetype packages (ADR-0055): COMPETING_MEASURES, WORKFLOW_CASE, VARIANCE_TREE, MULTI_SERIES,
  SHORTFALL_GRID, DELTA_SET.
- An archetype draws what it declares, and every other key goes in one closed raw section.
- A refusal envelope draws as a refusal, never as an empty card.
- Hazard refusals name the hazard.
- Canvas export sends the board, and a refused export shows its reason.
- An S1000D illustration viewer, a DOORS extracted-table viewer, and the model explanation read
  (behind `modelCanvas`).
- Runtime feature flags are read at container start.
- A stale-version pill re-checks `/version.json` on focus and every 5 minutes.
- Labelled approval and ingest cards announce their refusals.
- `npm audit` is at 0.
- **P0 fix:** the pdf.js worker (`.mjs`) is served as JavaScript.

## Not in this release

The work on [PR #28](https://github.com/edgy-solutions/cortex-ui/pull/28) waits for the merge after
the dry run:
- the dropper's held Promote;
- the DeferralRiskCard;
- drops past 500 on demand;
- answer summaries with bodies read on open (behind a flag, off).
