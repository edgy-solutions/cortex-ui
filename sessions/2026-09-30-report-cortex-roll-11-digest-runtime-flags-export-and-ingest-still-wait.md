# Report — roll #11: digest 497f45a2, runtime feature flags; the export and ingest seals still wait on Lane 1

from: cortex-ui/master · 2026-09-30 (overnight)

## Done

| item | commit | evidence |
|---|---|---|
| Runtime feature flags, read by the container at start | `863c196` | transport 0, tsc 0, vitest 2033/2035 (2 known environmental reds, below) |
| SDK parity pin v0.9.4 → v0.9.5 | `e347d92` | only the provenance lines moved; the extractor confirmed `ceab07a` is served by `refs/tags/v0.9.5` |
| Roll #11 digest | — | `sha256:497f45a21e5cce676f240444b518950e877cafcf1ec6b022b26504a1427340ee`, run 36813080123, 34 steps, 0 skipped, amd64 + arm64. Controls: short sha 404, fake sha 404, `7cf9e9c` → `6fb15fae…` |
| Packet to Lane 1 | this push | `sessions/2026-09-30-packet-to-lane-1-digest-497f45a2-for-roll-11-flags-are-a-values-line.md` |

### Flags

- A deployer sets `cortexUi.env.VITE_FEATURES: "canvasExport"`. `docker-entrypoint.sh` sanitizes it to `[A-Za-z0-9,_-]` and writes it into `window.__RUNTIME_CONFIG__`. `src/lib/featureFlags.ts` is the registry and the reader.
- localStorage remains a per-browser override only. The next flag is one registry entry plus one values word.
- The per-flag build vars are retired. Nothing set them.
- **The seal was strengthened in review.** The implementer's injection payload ends in `//`. Against an unsanitized entrypoint, that makes `config.js` a SyntaxError, so the mutant went red on the throw and never reached the `pwned` assertion. I added a payload that stays valid JS inside the object literal. Under the same mutant it reddens on "the injected assignment ran: expected 1 to be undefined", and it is green on the real script.

## Waiting (watcher running; no HIT as of this report)

- **Export capture.** No capture from Lane 1 yet. With roll #11 and `VITE_FEATURES: "canvasExport"`, the capture no longer needs localStorage. When it lands: seal the reader on it and retire the card export, in one commit.
- **Ingest seam live.** No report yet. The swap is specced against the deployed wire (`e42cabde`). It also moves the parity seal to `STAGES`, bumps `PRODUCER_REF` to `0f48fe2f`, and fixes the build.yml pin comment, which wrongly says the KINDS arm reads `gateway.py`. All arms read `src/iagent/ingest_status.py`.

## Known reds (environmental, both are the disk ahead of CI's producer pin)

- `ingestKindStatusParity`: the INGEST_STATUSES arm. The disk has the STAGES rename. Clears with the ingest swap.
- `taskKindParity`: "two, they AGREE". ia-01 lags.

## Noted, not acted on

`bin/inject-env.sh` is dead: nothing references it, and it lacks `VITE_ELECTRIC_URL` and `VITE_FEATURES`. I have not deleted it.

## Addendum 2026-10-01: ingest swapped, digest replaced

- **Lane 1 reported the ingest seam live** on rev 162, in `a12ba185`. The swap is in **`adf44b5`**:
  - The adapter now reads the deployed wire: `ingest_id`, `stage`, the duplicate object, and act refusals.
  - The parity seal resolves `STAGES`.
  - `PRODUCER_REF` is now `0f48fe2f`, and the false KINDS claim in build.yml is corrected.
  - Lane 1's measured 404/403 bodies are a loaded payload file.
  - A new `ingestMock.test.ts` runs the mock through the real readers, which nothing did before.
  - Gates: vitest 2051/2052 (taskKindParity's ia-01 arm is the only red). The clean export of 0f48fe2f gives 42/42.
- **Digest for roll #11 is now `sha256:38dca3a745e166ba6bea5b788967f665c6ee0805c6bad59997c6826c6aabb6e8`**, which replaces `497f45a2`.
  - Run 36818463907: 34 steps, 0 skipped, amd64 + arm64.
  - Controls: the short and fake shas return 404; `863c196` resolves to `497f45a2…`.
  - Packet: `sessions/2026-10-01-packet-to-lane-1-digest-38dca3a7-supersedes-497f45a2-for-roll-11-ingest-on-the-live-wire.md`. It recommends `VITE_FEATURES: "canvasExport,ingest"`.
- **Still waiting, both arriving with roll #11:**
  - The happy-path drop capture. Lane 1 did not POST a real document while the graph store was down.
  - The export capture.
- **Lane 1's roll #10:** the images serve (frontend `6fb15fae`), but the release is marked failed because a worker node was lost.
