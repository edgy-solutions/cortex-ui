# Report — canvas export and the ingest client on Lane 1's landed wire; producer pin to `3f27c7cb`

cortex-ui/master · 2026-09-30 · commits `1d957d8`, `9e70c3b`, `e0dfc17`, `1fbd386`

## The dispatch, item by item

| # | ask | state |
|---|---|---|
| 1 | Export on the canvas via `mesh:packageExport`; hash-bearing link when the artifact exists | **Built on the real route** (`POST /export/package`, `3f27c7cb`), behind `cortex.canvasExport` / `VITE_CANVAS_EXPORT`. The card export is **kept** (per Chris's ruling) until a live capture seals the route. |
| 2 | program_finance as a package definition, and what it needs against the 409 | Answered in the first packet, §C: five needs, starting with a `bindings` source for `program`. |
| 3 | Ingest UI: drop zone, kind picker, status card by id, duplicate, promote/reject on `can_act`, envelope label | **Built on the real routes** (`12d3ca6f`), with one adapter (`src/lib/ingestWire.ts`). It is behind `cortex.ingest` and runs in mock via `cortex.ingestMock`. The label is `provenance_floor`, drawn per component. |
| 4 | The docs card draws on the new digest | Confirmed at the data and bundle level (`1d957d8`). The reload itself is Chris's to see. |

## The wire moved under the build

Lane 1's routes landed mid-build, so the proposal in `9e70c3b` was superseded by the real wire and cortex followed it.
- **Export** is synchronous: there is no `producing` state and no GET-by-id. Refusals arrive under `detail`.
- **The artifact route needs the bearer token**, so the download goes through the authenticated client and never through a bare href.
- **Promotion** is a `document_promotion` HumanTask.

The findings are in the addendum: `2026-09-30-packet-to-lane-1-addendum-what-cortex-found-swapping-onto-your-landed-routes.md`.

## Seals, and the mutants that proved them

Each mutant below was fired, went red for its own reason, and was restored:
- **Export: 409 read from `data` instead of `detail`** → 3 red.
- **Export: artifact-uri prefix check dropped** → 2 red.
- **Ingest: the id bridge returns bare hex** → 4 red (`expected 'deadbeef' to be 'sha256:deadbeef'`).
- **Ingest: the reason-required check removed** → 1 red (the rejected button was enabled).
- **Ingest: positional tuple parser** → the drift fixture went red.
- **Ingest: banner drawn on empty `ingest_ids`** → red.

That last mutant first reddened the wrong assertion (the chip). I split the test so the banner has its own `it`, and the re-fire then reddened the banner arm.

## The pin

`PRODUCER_REF` `ec055c49` → `3f27c7cb`.
- **How it was chosen:** by running the suite against a **clean `git archive` of that sha**, because the sibling on disk carries uncommitted Lane 1 WIP (`STATUSES` → `STAGES`).
- **Result there:** 2003 passed. The 4 reds were 5 s timeouts in tree-scanning tests. Those files plus both parity seals re-run alone at 75/75 with 0 skipped.
- **Why the bump was needed:** at `ec055c49`, `ingest_status.py` is absent, so the new seal would have gone red in CI.
- **Pinned alongside:** `document_promotion` is pinned in `taskKindParity`.

## Local gates on the real repo

- `check:transport`: 0.
- `tsc`: 0.
- Tests: **2 red of 2011, both environmental and expected:**
  - The ingest parity STATUSES arm. The disk has Lane 1's uncommitted rename, and the seal is right to say so.
  - taskKindParity: "invincible-agent and ia-01 declare different task kinds". ia-01 lags master. Not fixed, since it is a read-only worktree.

CI is the instrument that decides. It checks out the pin, not the disk.
