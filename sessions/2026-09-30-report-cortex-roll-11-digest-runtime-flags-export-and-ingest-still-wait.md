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
