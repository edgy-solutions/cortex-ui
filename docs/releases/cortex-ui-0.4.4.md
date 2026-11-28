# cortex-ui 0.4.4

The Cortex frontend for **invincible-agent 0.4.94**. It replaces cortex-ui 0.4.3 as that release's pin, and carries
everything in it. It is the cortex release that knows #595's `waiting` stage and `answer_timing` event, so the
`waiting` label ships with the chart.

**Nothing was built for this release.** The tag names commit `08ac484`, which was built and pushed by its own master
build.

## Image

| | |
|---|---|
| Image | `ghcr.io/edgy-solutions/cortex-ui/frontend` |
| Index digest | `sha256:cb3d8509cb4046923aaf398efe26373b1897b690ffb1dec03f35301cff3a4d2c` |
| Version tag | `ghcr.io/edgy-solutions/cortex-ui/frontend:0.4.4` (same digest; added to the existing index, not rebuilt) |
| linux/amd64 | `sha256:b0e8addf60d5b8c54dd4e796a0b2a54fb3b5e9b6b9cfe1b85b4b6fe6da619618` |
| linux/arm64 | `sha256:01e8ed2b96dd3928bce0992bb88b0d2a8dc0a6019a235042ed5df6bb51a554a9` |
| Source commit | [`08ac484ead15…`](https://github.com/edgy-solutions/cortex-ui/commit/08ac484ead159c4cc867cc01a215f80c510897d2) |
| Build run | https://github.com/edgy-solutions/cortex-ui/actions/runs/46105212064 |
| Retag run | https://github.com/edgy-solutions/cortex-ui/actions/runs/46105762675 |
| Carried by | invincible-agent 0.4.94, once cut (`global.imageDigests`) |

```
docker pull ghcr.io/edgy-solutions/cortex-ui/frontend:0.4.4
# Digest: sha256:cb3d8509cb4046923aaf398efe26373b1897b690ffb1dec03f35301cff3a4d2c
```

The version tag points at the multi-arch index, so the same pull works on amd64 and arm64.

**Checked from the registry, anonymously:**
- `0.4.4` and the full-sha tag both resolve to `cb3d8509…`.
- These all return 404: the short sha `08ac484`, a zero sha, the truncated digest `sha256:cb3d8509`, a zero digest
  and the unused version `0.4.9`.
- The control `0.4.3` still resolves to `6310307d…`.
- The index fetched by version and by digest is the same 1609 bytes, both hashing to `cb3d8509…`. There is no Docker
  daemon on the cutting box, so this stands in for the two pulls.

## Changes since 0.4.3

The range is `0ff8a4d..08ac484`. Four commits change the app. One more changes only a test, and two add release notes.

### How long an answer has been running
- **The answers-panel strip shows the elapsed time** beside the stage, as `m:ss`: "Locating the subject · 0:42".
  Before this, a stalled answer showed a spinner and nothing else. On sandbox, five minutes at "Locating the
  subject" looked the same as five seconds.
- **The small strip above the prompt uses the same clock**, in the same form. It used to read "42s" and "5m 03s"
  while the panel read `0:42`.

### What the strip says about the time (#595's `answer_timing`)
- **The rules.** The server sends E, the expected time (the p90 of the caller's recorded answers), and D, when it
  stops waiting:
  - under E: the stage and the time, nothing more;
  - from E: "— longer than usual (usually under 1:50)";
  - from twice E, an amber line: "Still working after 5:03. Answers usually finish in under 1:50, so this one may
    be stuck. The server stops waiting at 15:00."
- **"Usually under" rounds E up to the next 10 seconds.** It never promises an answer sooner than was measured.
- **The deadline sentence appears only when the server sends D.**
- **If the server sends no expected time, the strip shows elapsed time only**, however long. Cortex never
  estimates one.
- **The clock follows the server's.** When the event arrives, the clock restarts from the server's `elapsed_ms`, so
  the time shown is measured from the same start as E and D. A later event moves the deadline and restarts the
  clock again.

### Stages
- **`waiting` is shown as "Waiting to start".** It appears only once the server reports it, so a server without
  #595 never shows it.
- **It is shown where it actually happened.** On the run path that is after "Understanding your question". On the
  admission queue it comes first, because understanding starts only after admission.
- **On the admission queue, the strip names the wait.** It does not show the client's guess that understanding has
  started.
- **An unknown stage shows its own name or "Working".** It used to be labelled "Composing the answer", which claimed
  the turn was at its last stage.

## Known
- **The WATERFALL card is still not advertised.** It goes on the menu once invincible-agent #589 is in a deployed
  release.
- **The drill (paging and download for a drilled figure) is not built.** It waits for fin's #590 shapes and
  lane 74's routes.
- **`answer_queued` and `answer_admitted` are not drawn.** The `waiting` row covers the queue. The position and
  waited time are not shown.
- **The timing fixture was composed from #595's code at `3efeaea4`, not captured from a server.** It is replaced
  once a sandbox capture exists.

