# cortex-ui 0.4.3

The Cortex frontend for **invincible-agent 0.4.94**. It continues from cortex-ui 0.4.2 (pinned in 0.4.93) and
carries everything in it.

**Nothing was built for this release.** The tag names commit `0ff8a4d`, which was built and pushed by its own master
build.

## Image

| | |
|---|---|
| Image | `ghcr.io/edgy-solutions/cortex-ui/frontend` |
| Index digest | `sha256:6310307d9a1e5b57119add60bcb4da2aa0cabf0c39c8676a709e0150197bc299` |
| Version tag | `ghcr.io/edgy-solutions/cortex-ui/frontend:0.4.3` (same digest; added to the existing index, not rebuilt) |
| linux/amd64 | `sha256:4f0b625ed2692f18bc9e35139e9e506f15c0c66833fbb0f500825d8d0ebd79ab` |
| linux/arm64 | `sha256:d75376748092332dfd83d669fd6bc3ef896f6d2a7f09eb6b01be3af93111ec22` |
| Source commit | [`0ff8a4de3c0f…`](https://github.com/edgy-solutions/cortex-ui/commit/0ff8a4de3c0f4346a85be3f47da3c7949c5f0874) |
| Build run | https://github.com/edgy-solutions/cortex-ui/actions/runs/45942432901 |
| Retag run | https://github.com/edgy-solutions/cortex-ui/actions/runs/46023760922 |
| Carried by | invincible-agent 0.4.94, once cut (`global.imageDigests`) |

```
docker pull ghcr.io/edgy-solutions/cortex-ui/frontend:0.4.3
# Digest: sha256:6310307d9a1e5b57119add60bcb4da2aa0cabf0c39c8676a709e0150197bc299
```

The version tag points at the multi-arch index, so the same pull works on amd64 and arm64.

**Checked from the registry, anonymously:**
- `0.4.3` and the full-sha tag both resolve to `6310307d…`.
- These all return 404: the short sha `0ff8a4d`, a zero sha, the truncated digest `sha256:6310307d`, a zero digest
  and the unused version `0.4.9`.
- The control `0.4.2` still resolves to `9e1d6573…`.
- The index fetched by version and by digest is the same 1609 bytes, both hashing to `6310307d…`. There is no Docker
  daemon on the cutting box, so this stands in for the two pulls.

## Changes since 0.4.2

The range is `e65409b..0ff8a4d`, one commit.

### The sign-in sentence on every card
- **What a user sees.** When a call fails because the sign-in has expired (a 401), every card now shows "Your
  sign-in expired — signing you in again." On 0.4.2 only the export dialog said that. Other cards could show
  "Refused (401)", "(undefined)", "no status" or "HTTP 401" while the sign-in redirect was landing.
- **Where it applies:**
  - task acts and row edits;
  - ingest status, the leaf chip, the composer and retry;
  - the export dialog and profile picker;
  - review shapes and the review routes;
  - the illustration card and the build stamp;
  - triage, federated images and the askable list;
  - figures, the inspector, the case view and deep links.
- A 401 on the case fetch now starts the sign-in redirect itself.
- A 403 is unchanged: it still names the refusal.

## Known
- **The WATERFALL card is still not advertised.** It is advertised once invincible-agent #584 and #589 are in a
  deployed release.
- **The drill (paging and download for a drilled figure) is not built.** It waits for invincible-agent #590 and
  lane 74's routes.

