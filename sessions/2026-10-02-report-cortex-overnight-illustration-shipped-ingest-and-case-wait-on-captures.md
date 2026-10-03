# Report: overnight, 2026-10-02. Illustration viewer shipped; the ingest seal and case route wait on captures

from: cortex-ui/master · 2026-10-02 (overnight)
re: the OVERNIGHT dispatch (items 1–3)
producer read: invincible-agent origin/master `c914342c`

## Status by item

| # | Item | State |
|---|---|---|
| 3 | S1000D illustration viewer, hotspot by id, ADR-0055 package | **Done.** `d3cfff6`. Image built. Inert until served. |
| 1 | Seal ingest end to end · HAZ-1003 as served · the export retires the card export | **Blocked: no captures.** Roll #15 failed, so the post-roll captures were never taken. |
| 2 | WORKFLOW_CASE against the case route; safety acceptance as proof | **Blocked: no route.** There is still no `/cases` route at `c914342c`. Partial progress: see below. |

## Item 3: ILLUSTRATION (`d3cfff6`)

- **Package:** `src/archetypes/illustration/` (contract, row, Card, index, fixtures, tests).
- **Path guard:** `src/lib/illustrationPath.ts` fetches only a single-slash gateway-relative path. It refuses `//`, `://`, backslashes, `..` segments and control characters.
- **Sanitizer:** `src/lib/sanitizeSvg.ts` is an allowlist keyed on the SVG namespace plus the local name. It strips `on*` attributes, `style`, external `href`s and `javascript:` / non-fragment `url(` values, and it counts removed elements.
- **Hotspot:** matched by exact `id` equality and reported in one of four states: `found`, `not-found`, `ambiguous` or `none`. The fixture `hot-001`/`hot-0010` is the breaking input for a prefix match.
- **Fallback:** under a fallback, ILLUSTRATION is a CLAIM, so it is withheld and counted.
- **Mutants:** I1–I9 and I3b were each fired red and restored.
- **Image:** CI run 37095111550 succeeded with 0 skipped. The GHCR digest for `d3cfff6` is `sha256:562c4bb5123b08c07b63d228a73e1f68f7577d83f17315a64dba2498216cb620`.
  - Controls: the short sha returns 404, a fake sha returns 404, and the known-good `21a32d0` resolves to `f4bac439…`.
- **Not served yet:** nothing upstream serves an ICN, a hotspot or the bytes. The asks are in `2026-10-02-packet-to-lane-1-illustration-viewer-built-needs-icn-hotspot-and-a-bytes-route.md`.

## Found on the way: the bundle had been broken since roll #13 (`21a32d0`)

- The workflow-case fixtures had an unused `node:fs` import, which broke `vite build` inside the Docker step.
- CI's checks run outside Docker, so they stayed green.
- The pushes `a72dac4`, `1248a40` and `77506a1` have **NO image**. **Do not pin them.**
- The fix and a suite guard over the whole src population are in `src/lib/noNodeBuiltinsInTheBundle.test.ts`. Details are in `2026-10-02-report-cortex-bundle-broken-by-an-unused-node-fs-import-no-image-since-roll-13.md`.

**Last pushed images:** `21a32d0` and `d3cfff6`. Sessions-only pushes since then are gated.

## Items 1 and 2: what stands ready, and what is missing

- **Ingest e2e, HAZ-1003, export.** Nothing new could be sealed. This needs roll #15's captures: status stages, promotion, label, the HAZ-1003 row as served, and a successful export. They are taken after the human clears the NotReady node and the roll re-fires.
- **WORKFLOW_CASE.** The executor writes case records (`case_definition`, `case_id`, `emitted_by`, `workflow_definition_*`, `workflow_instance_id`), but no route serves an instance. The card still renders from transcribed definitions only.
  - **Partial progress (this push):** the maintenance case `maint_fault_propose` (openddil-lab overlay, `c914342c`) is transcribed into fixture 7: stages `proposed`→`awaiting_approval`, the four option labels, and the `maint_fault_approval` menu (6 verbs; reason required on `rejected` and `deferred`). The `it.todo` is now a real test through the SAME card, and the card stays free of maintenance words. Mutants MM1–MM3 were each fired red. The contract cannot hold `parts`, `spares`, `task_refs`, `battle_condition` and `nearest_spare` (non-scalar), or `classification` and `observable_state`; these are dropped. `interval` is a hand-built stand-in, because the producer's `walk` is a stub. The safety-acceptance `it.todo` stays until `/cases/{id}` is served.
- **`origin_confirmation` landed upstream,** and it renders through APPROVAL_TASK with no cortex code. But a case's `human_await` registers its task **without a payload**, so the steward would see no suggestion or evidence. The ask and the shape reconciliation are in `2026-10-02-packet-to-lane-1-origin-confirmation-landed-its-task-row-carries-no-payload.md` (`98ac0fa`).

## Deferred, deliberately

**`taskKindParity` is red locally against producer master, and green in CI.** CI pins `PRODUCER_REF 0f48fe2`. The local red is `origin_confirmation`, plus the known "two, they AGREE".

Pinning the kind alone would redden CI's stale-pin arm. The bump of `PRODUCER_REF` and the pin go together in one commit, once Lane 1 names the producer sha that the next roll carries.

## Digest for `0fc5051` (the maintenance fixture plus this report)

- CI run 37095992585: success, 34 steps, 0 skipped.
- GHCR `0fc505192551575dcb50a4519f9f9eae84aab775` resolves to `sha256:d8c652cb0454114c74e9dad88d08edce32923312ea1a35b0ff5b8b1f26be8c44`.
- Controls: the short sha returns 404, a fake sha returns 404, and the known-good `d3cfff6` resolves to `562c4bb5…`.
- **This is the latest sha with an image.** Pin it, or `d3cfff6`.
