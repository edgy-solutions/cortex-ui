# cortex-ui 0.4.1

The Cortex frontend for **invincible-agent 0.4.93**. It continues from cortex-ui 0.4.0 (the
frontend 0.4.91 and 0.4.92 pin). It includes `29661a0`, which the 0.4.93 notes ask for.

**Nothing was built for this release.** The tag names commit `7ec7b47`, whose image was built and
pushed by its own master build. The pin moves when invincible-agent 0.4.93 is cut.

## Image

| | |
|---|---|
| Image | `ghcr.io/edgy-solutions/cortex-ui/frontend` |
| Index digest | `sha256:84dead336fc88e6505d35f2248bb4acadc53f0f53ec3ded170397355484344c4` |
| Version tag | `ghcr.io/edgy-solutions/cortex-ui/frontend:0.4.1` (same digest; added to the existing index, not rebuilt) |
| linux/amd64 | `sha256:e56197137491c8fb54ff5455aa50b79c48ded30251812222c95e3c5f3c6cf235` |
| linux/arm64 | `sha256:e8619f38173327afa52fd6447ef4158b2b7b05657ae5e070ac2f7d7c0cb9aed7` |
| Source commit | [`7ec7b472d8c1…`](https://github.com/edgy-solutions/cortex-ui/commit/7ec7b472d8c1b1f6e40a8819d6201c95f2741c16) |
| Build run | https://github.com/edgy-solutions/cortex-ui/actions/runs/45746321266 |
| Carried by | invincible-agent 0.4.93, once cut (`global.imageDigests`) |

The digest was read from the registry, anonymously:
- the full-sha tag resolves to `84dead33…`;
- the control, `1660b84` (0.4.0), still resolves to `cf64568d…`;
- the short tag `7ec7b47` and a zero sha both answer 404.

```
docker pull ghcr.io/edgy-solutions/cortex-ui/frontend:0.4.1
# Digest: sha256:84dead336fc88e6505d35f2248bb4acadc53f0f53ec3ded170397355484344c4
```

The version tag points at the multi-arch index, so the same pull works on amd64 and arm64.
- It was added by `retag-image.yml` on the tag push (run 45747114456), which copied the index
  bytes under `0.4.1`.
- Checked from the registry: `0.4.1` resolves to `84dead33…`, while the short sha `7ec7b47`, a zero
  sha, the truncated digest `sha256:84dead33` and a zero digest all return 404.
- The index fetched anonymously by version and by digest is the same bytes: both hash to
  `84dead33…`. (No Docker daemon on the cutting box, so this stands in for the two pulls.)

## Changes since 0.4.0

The range is `1660b84..7ec7b47`: 15 commits.

### Sign-in
- **API calls wait for a signed-in user.** A call made while there is no stored user no longer goes
  out without a token. It waits up to 10 s for sign-in, and if none arrives nothing is sent.
- **A 401 starts sign-in, once.** This covers REST, the interview stream and the case fetch. 403 is
  unchanged. The export dialog reads "Your sign-in expired — signing you in again." in place of
  "Refused (401): no reason code".
- **A typed question survives the full-page sign-in** (0.4.92 known issue, cortex's fix).
- The root cause, an identity provider that gives no refresh token, is not changed here.

### Create canvas
- A template's program slot is bound from the programs the dialog lists.
- An unbound slot reads as a plain sentence ("Choose a program to create …"). The server's text,
  with its ADR reference, sits behind "details".
- An empty list says "You're not a member of any program." with who can grant it.

### Finance cards
- A truncated ranking draws the tail the producer declares (`29661a0`).
- A ranking row shows its labelled values; other fields move to the detail view.
- MULTI_SERIES draws the served source sentence, verbatim.
- A capability for FLOW_DECOMPOSITION, so a declared flow measure can draw.
- The currency symbol comes from the served unit.
- **The WATERFALL card is built but not advertised.** It draws a served `walk` (start and end
  beside the level-1 signed edges) and refuses an unbalanced or missing walk. cortex advertises it
  only once invincible-agent #553 is in a deployed release.

### Other
- A served list field in a refusal draws as a list.
- An artifact's time counts the served intent call.

### Release tooling
- Chart releases are `chart-cortex-ui-x.y.z` and never take Latest.
- An app release tag adds the image tag `x.y.z` (`retag-image.yml`).
