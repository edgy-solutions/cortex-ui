# cortex-ui 0.4.2

The Cortex frontend for **invincible-agent 0.4.93**. It continues from cortex-ui 0.4.1 and **replaces it as the
0.4.93 pin**, since it carries everything in 0.4.1, including `29661a0`.

**Nothing was built for this release.** The tag names commit `e65409b`, the merge of #65. Its image was built and
pushed by its own master build.

## Image

| | |
|---|---|
| Image | `ghcr.io/edgy-solutions/cortex-ui/frontend` |
| Index digest | `sha256:9e1d65738fa75eb71c7c1578b15185cb02be0eec1466be6cf3d5fdb011a3c459` |
| Version tag | `ghcr.io/edgy-solutions/cortex-ui/frontend:0.4.2` (same digest; added to the existing index, not rebuilt) |
| linux/amd64 | `sha256:000a39a75d1ae9e24ec60eee9a6011cd5e087488457b7c07e5abb2cd266a8109` |
| linux/arm64 | `sha256:fbfdf8beb85aa27c7a0ef9782e6617b8a07f11d9017c94cb5af46eb13b34ab53` |
| Source commit | [`e65409b08e79…`](https://github.com/edgy-solutions/cortex-ui/commit/e65409b08e79f8bd5db2fa8dbc801dcaf2d722be) |
| Build run | https://github.com/edgy-solutions/cortex-ui/actions/runs/45753332795 |
| Retag run | https://github.com/edgy-solutions/cortex-ui/actions/runs/45873104162 |
| Carried by | invincible-agent 0.4.93, once cut (`global.imageDigests`) |

```
docker pull ghcr.io/edgy-solutions/cortex-ui/frontend:0.4.2
# Digest: sha256:9e1d65738fa75eb71c7c1578b15185cb02be0eec1466be6cf3d5fdb011a3c459
```

The version tag points at the multi-arch index, so the same pull works on amd64 and arm64.

**Checked from the registry, anonymously:**
- `0.4.2` and the full-sha tag both resolve to `9e1d6573…`.
- The short sha `e65409b`, a zero sha, the truncated digest `sha256:9e1d6573`, a zero digest and the unused version
  `0.4.9` all return 404.
- The control `0.4.1` still resolves to `84dead33…`.
- The index fetched by version and by digest is the same bytes: both hash to `9e1d6573…`. There is no Docker daemon
  on the cutting box, so this stands in for the two pulls.

## Changes since 0.4.1

The range is `7ec7b47..e65409b`: 15 commits, through #64 and #65.

### Producer pin
- The contract snapshots and generated types are taken at invincible-agent **0.4.92** (`f7c3f5e6`, deployed).
  - cortex-bff gains `GET /askable_measures`.
  - ingest-v1 moves 1.10.0 → 1.10.1 (`HumanTask.task_id` required).

### What can I ask? (#65)
- **The list follows the active persona.** It is fetched with the same `active_persona` and `active_domains` an ask
  is sent with. One resolver serves both, so the list and the ask always agree.
  - The heading names the served persona.
  - A persona switch re-fetches the list.
  - When the person has no access cell, the list says so in a plain line.
- **Refusals show the served reason, never an empty list:** `incomplete_override`, `cell_not_entitled` and
  `persona_not_held`. A server error with no reason reads as unreachable, with Retry.
- **Ask sends the picked measure.** It goes through the normal question send as `askable_pick`, labelled with the
  entry's name, and never carries a seed panel or a lineage claim.
  - A refused pick shows the server's words.
  - A pick the server could not route is drawn as a failure, never as an answer.

### Menu blocks (#64)
- The served menu blocks (`GET /menu_blocks`) are read and merged over the hand-written menu. This is tested against
  a served finance row's `menu:` block.

### Finance cards
- Five finance cards draw the served source sentence (`data_provenance`, #528) verbatim, on the answer and on a
  refusal: competing measures, shortfall grid, variance tree, contribution ranking and forecast.

## Known
- **The WATERFALL card is still not advertised.** It is advertised once invincible-agent #553 (with its projector
  mapping) and fin's declared shape are in a deployed release.
- **Other cards' 401 wording.** On 0.4.2, a card other than the export dialog may still show a status line, such as
  "Refused (401)", for a moment before the sign-in redirect lands. The fix is on master after this tag and goes in the
  next release.

