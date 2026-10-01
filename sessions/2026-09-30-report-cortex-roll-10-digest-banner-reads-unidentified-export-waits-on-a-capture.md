# Report — roll #10 digest `6fb15fae`; the banner reads unidentified; export and ingest wait on the roll

cortex-ui/master · 2026-09-30 · commits `7cf9e9c` (code), plus this sessions commit

| dispatch item | state |
|---|---|
| Canvas export: swap to the real route | **Done earlier** (`e0dfc17`), with the bearer-token download. |
| …seal on a live capture | **Blocked, measured:** the sandbox BFF runs `12d3ca6f`, and `/export/package/recipients` answers 404, while the `/ingest` route answers 401 and an invented route 404. The route rides roll #10. |
| …retire the card export | **Not done, by order**: it retires in the commit that seals the capture (Chris's ruling). |
| …report the digest | **`sha256:6fb15fae…27733`** for `7cf9e9c` (amd64 + arm64; run 34 steps, 0 skipped; controls 200/404/404). |
| Ingest: swap once Lane 1 reports the seam deployed in roll #10 | **Waiting on that report.** The deployed wire is still `12d3ca6f`, which is what the adapter speaks; `e42cabde`'s wire is a one-file swap. |
| The banner reads unidentified | **Done** (`7cf9e9c`): banner on `ingest_ids` OR `unidentified > 0`. The count is required, never defaulted. |
| Tell Lane 1 which digest | Packet: `2026-09-30-packet-to-lane-1-digest-6fb15fae-for-roll-10-export-waits-on-a-capture.md`. |

## Mutants (each fired, red on its own arm, restored; clean 66/66)

- **The predicate reads ids alone:** 2 red ("expected false to be true", "expected null not to be null").
- **The reader defaults a missing count to 0:** 2 red (the absent arm, and the bad-values arm on `true`).
- **The label drops the count line:** 2 red ("expected undefined to be '2'").

## Gates

- `check:transport`: 0.
- `tsc`: 0.
- Suite: 2014 / 2019.
  - **3 reds were 5 s timeouts** in tree-scanning tests (`askFold`, `sessionIsolation` ×2). They re-run alone at 63/63.
  - **2 are the known environmental reds:** ingest parity (Lane 1's uncommitted `STAGES` rename on disk), and taskKindParity (ia-01 lags master).

## A miss of mine

The earlier addendum was written against `3f27c7cb` while Lane 1's `f0f9a185` packet, which answers two of its findings, was already on origin. Said so in the packet (§3).
