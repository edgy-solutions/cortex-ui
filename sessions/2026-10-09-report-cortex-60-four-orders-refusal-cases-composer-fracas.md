# Report: the four orders of 2026-10-09 (refusal, /cases, composer, FRACAS)

**For:** Chris and the architect. **From:** cortex-ui/master. **Date:** 2026-10-09.

## What was merged (sha and digest)

| Order | Merge sha | Image digest | Run |
|---|---|---|---|
| 4. PR #1, FRACAS bindings | `8b6a83f5d7191b35b5ff031dc1cd44a79da2174e` | `sha256:c1688a131b30ea58040e35bd1aa2b3bbec0823f9522dd2de3ec31eb1591e7adf` | 38021601645 |
| 1. PR #3, cards read `refusal` | `9bf80639c24418af0448a4d4ff1651f8dca13d40` | `sha256:1985ce7fe1aa378687b1f001e6441066f381ababed959c9296483eb687a49f86` | 38023535376 |

Both runs skipped 0 image steps. Each digest was read from GHCR by its bare full sha, with controls: the short sha 404, a fake sha 404, and `3ea967f` 200.

Lane 1 has the sha and digest for order 1 in `sessions/2026-10-09-packet-to-lane-1-cards-read-refusal-pin-is-9bf8063.md`. The same packet tells them to retire the two `_MIRROR_GAPS_AT_RATIFICATION` entries, now that the FRACAS bindings are merged.

## What is open as a PR (not merged)

- **2. PR #2, the `/cases` arrival seal** (`seal/cases-arrival` @ `0d371ff`). Its detector matches on JSON shape and scans `.json` files plus fenced json in `.md` files. `CAPTURE_FILES = []`. Three mutants were fired and restored.
- **3. PR #4, the ingest composer** (`feat/ingest-composer` @ `ac1f7ed`, `f9e2ac6`). It is not for 183. It goes in 184 after Chris has seen it.
  - Screenshots: `sessions/2026-10-09-ingest-composer-{chip,overlay}.png`, on the branch.
  - Departures from the ruling:
    - the kinds are the wire's upload set, pdf/cad/xml, not pcn/pdn;
    - there is no promotion task link to show, because the status card renders inline promote/reject verbs instead;
    - "Already processed" appears twice on a duplicate turn. This is a known nit.
  - Its full suite ran only before the last fix, so PR #4's CI run is the full-suite gate.

## Notes

- **The worktree reds.** Branches built under `.claude/worktrees/` run 6–8 cross-repo seals red with "no producer checkout found", because the sibling lookup cannot see `invincible-agent` from there. The main tree and CI pass them.
- **`.claude/settings.local.json` is invalid JSON**, at line 13, column 79: a string contains a literal line break. The allow list may be ignored as a whole. I did not touch it; it is Chris's file.
- **Two 0-byte strays blocked the local fast-forward.** They were `src/components/registry/RefusalCard.tsx` and `src/lib/refusalEnvelope.ts` in the main tree, both the empty blob `e69de29`. I removed them after checking.
