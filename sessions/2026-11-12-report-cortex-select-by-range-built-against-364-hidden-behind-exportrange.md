# 2026-11-12: "Select by range" is built against saf's #364 (`3a632cb3`), hidden behind `exportRange`

**To:** Chris, the architect · **cc:** Lane 1, saf, gov
**From:** cortex-ui/master lane
**Commits:** `7d31ed7` (range, pinned at `3a632cb3`) and `948e5cf` (re-pinned to the merge `47263e51`), on master
**Rides:** 0.4.88, since gov approved and #364 merged in time
**Image (pin this one):** `sha256:72dee5928f5bf2485ce159bd1bc9ef927bba6a4a029991870bef06c3683f9a8d` (built at `948e5cf`, run `43373914637`)

## What was asked

Chris: "0.4.88 image accepted. Build range against 3a632cb3 and unhide it in the same train if gov approves in time.
Otherwise it goes on 0.4.89."

## What is built

"Select by range" is back in the Export as… dialog. This is architect ruling 4 (11-10). It was built in `9dcffe9`,
then hidden in `f1210ce` because #356 served no way to get the ids in a range before download. #364 serves one.

- **The section:** From and To dates plus "Select by range". It is blocked while From is after To. Applying a range
  switches the dialog's source line to `received <from> to <to>`. "Back to selection" returns to the lasso's notices.
- **The flow:**
  1. Picking a profile runs the check-only export call (`POST /ingest/export/notices` with `{range, profile, check_only}`).
  2. The server returns the notices the range RESOLVED to, plus the unexportable ones.
  3. "Export N, skip M" counts those. The download sends only the cleared ids, never the range. That keeps the dialog's
     rule (only cleared ids are sent), and a range download would be refused whole on any unexportable notice.
- **Limits are the server's.** cortex names no day limit and no cap. A refusal (`export_range_invalid`,
  `export_range_too_large`, `export_selection_invalid`) shows the server's message verbatim, and the download stays
  disabled.
- **Where it shows:** on the lasso bar and the notice card. It never shows on the reviewer's Promote page, because there
  the server admits profiles for one notice, and a range would bypass that.
- **One limitation:** a refused notice from a range that is not on the canvas reads `drop <12 hex>`, because the check
  reply carries no notice number. If the architect wants the number there, the reply would need to serve it (saf).

## Hidden: how to unhide

- **The new flag is `exportRange`.** It is off unless the chart's `VITE_FEATURES` names it. With it off, the dialog is
  unchanged (seal R1).
- **Gov approved in time.** gov approved #364's head `df5e484b`, and it merged as `47263e51` (Lane 1's 05:10Z packet).
  So per Chris's order, the unhide rides THIS train (0.4.88), not 0.4.89.
- **The unhide takes two values changes, both Lane 1's, both in `values-sandbox.yaml`:**
  1. **Re-pin cortex** from `6a441d9` (`c4048781`, which #373 pins today) to `948e5cf` (digest below). `6a441d9` has
     no range code, so the flag alone does nothing on it. `948e5cf` carries everything 0.4.88 accepted, plus the range
     section and the re-pin to `47263e51`.
  2. **Add `exportRange` to `VITE_FEATURES`.** Sandbox today reads `canvasExport,ingest,promotionRuns,reviewExport`.
- **⚠ Only with a BFF at or after `47263e51`.** The deployed producer (`e29f7442`) still requires `notice_ids`, so every
  range check would be refused with a 422. The dialog would show the refusal and export nothing. If the train's BFF is
  cut before `47263e51`, keep the flag off and it goes on 0.4.89; the cortex re-pin alone is safe either way (seal R1:
  flag off, the dialog is unchanged).

## The pin

- `PRODUCER_REF`, `SOURCES.json` and the OpenAPI snapshot move from `8c3eb9af` to `3a632cb3`, saf's open #364 head.
- **This is a superset.** `8c3eb9af` is an ancestor of `3a632cb3`. Six commits lie between them, and the only wire
  change is the export-notices request.
- The generated `bff.ts` moved by 8 lines: `notice_ids` optional, `range` and `ExportRange` added. The `ingest-v1`
  snapshot is byte-identical.
- **Re-pinned to the merge in `948e5cf`**, as `a255a8e` did for #356: `PRODUCER_REF`, `SOURCES.json` (branch "master
  (merge of PR 364, second parent df5e484b)") and the snapshots move to `47263e51`.
  - `47263e51`'s parents are `70abe679` and `df5e484b`, the gov-approved head. `3a632cb3` is an ancestor.
  - The `ingest-v1` snapshot is byte-identical. The BFF document differs from `3a632cb3`'s only in two description
    strings, on `/export/cdrl` and `/export/cdrl/profiles` (fin #365). Cortex reads neither route. The generated files
    moved in their headers only.
  - The `task_kinds`/`review_shapes` files: no change `3a632cb3..47263e51` (36 files matched). The control
    `aac9900b..47263e51` shows 3 changed, so the instrument can see a change.
  - `iagent-mesh` is 0.9.19 at both shas.

## Seals (new `ExportSelectionDialog.range.test.tsx`; wire stubbed at axios only)

| arm | what | expect |
|---|---|---|
| R1 | flag off | no range section; the dialog as today |
| R2 | flag on, reviewer (`admitted` given) | no range section |
| R3 | From after To, or an end empty | apply disabled, "From is after To.", no check |
| R4 | range resolves `[A,B,C]`, B unexportable | the check body is exactly `{range, profile, check_only}` with no `notice_ids`; "Export 2, skip 1"; the download body's `notice_ids` is exactly `[A,C]` with no `range` |
| R5 | 422 `export_range_too_large` | the server's message shown under `data-range-refused`, download disabled |
| R6 | empty range | "Export 0, skip 0", download disabled |
| R7 | two applies, the first answers last | the second wins |
| R8 | apply, then back | the lasso's notices again, and the download sends them |
| R9 | the reader | the range reply's resolved ids are read; missing ones are malformed; an undeclared key is tolerated |

The request seal gains a range case, plus a negative arm: a misspelled selector key is refused as undeclared.

## Mutants (each fired alone, restored)

| id | mutation | reddened | message |
|---|---|---|---|
| X1 | section ignores the flag | R1 | "expected <div> to be null" |
| X2 | section ignores `admitted` | R2 | "expected <div> to be null" |
| X3 | download sends the range | R4, R7, R8, the existing download test | R4: "expected undefined to deeply equal ['A','C']" |
| X4 | cleared ignores `unexportable` | R4 | 'Export 3, skip 1' vs 'Export 2, skip 1' |
| X5 | check sends both selectors | R4, R9 | the body has a third key |
| X6 | the resolved ids ignored; lasso ids used | R4, R6, R7 | "['L1','L2'] vs ['A','C']" |
| X7 | refusal message not shown | R5 | '' vs the server's message |
| X8 | the older apply wins | R7 | 'Export 1, skip 0' vs 'Export 3, skip 0' |

## Gate, and the one red it showed

On a `git archive` export of `7d31ed7` (1160 files, matching `ls-tree`), with `CORTEX_PRODUCER_REF=3a632cb3`:

| step | rc | detail |
|---|---|---|
| check:transport | 0 | |
| check:transport:redproof | 0 | |
| npm run test | **1** | 4942 passed, **1 failed**, 1 skipped, 9 todo (4953): `openapi.seal` drift |
| tsc --noEmit | 0 | |
| check:seals | 0 | INSTRUMENT: 37 files censused; 502 arms ran, 0 did not run, 0 missing |
| build:bundle | 0 | |

**The red is the instrument, and it is proven.**
- The drift seal compares our snapshot against the producer document it FINDS ON DISK. That is the sibling checkout,
  which stands on master `55c720ef`, whose document is `8c3eb9af`'s.
- sha256 prefixes:
  - our snapshot `459e8d4c` equals the producer's document at `3a632cb3`, byte for byte;
  - the producer at `8c3eb9af` and the disk are both `61b529a4`.
- Re-run with `CORTEX_PRODUCER_ROOT` at a `git archive` of each sha: `3a632cb3` gives 6/6 passed (rc 0), and
  `8c3eb9af` gives 1 failed, exactly the gate's (rc 1).
- CI places the producer at `PRODUCER_REF` beside cortex-ui, so CI's run is the referee. Run `43371314134` on
  `7d31ed7` was green, the drift seal included.

**The re-pin `948e5cf`, gated the fixed way.** This time the gate ran with `CORTEX_PRODUCER_ROOT` set to a `git archive`
export of `47263e51` (2419 files, matching `ls-tree`), on an export of `948e5cf`:

| step | rc | detail |
|---|---|---|
| check:transport | 0 | |
| check:transport:redproof | 0 | |
| npm run test | 0 | 329 files; 4943 passed, 1 skipped, 9 todo (4953); report mtime 23:41:30, written by this run |
| tsc --noEmit | 0 | |
| check:seals | 0 | INSTRUMENT: 37 files censused; 502 arms ran, 0 did not run, 0 missing |
| build:bundle | 0 | |

4943 is the earlier 4942 plus the drift seal, which now passes. The total, 4953, is unchanged.

## CI and digest

Both pushes built an image. Each run's every step succeeded, including "Test suite, with both peers present", "Cross-repo
seals must have RUN", the seal-guard redproof, typecheck and **Build and push frontend image (multi-arch)**.

| sha | run | digest |
|---|---|---|
| `7d31ed7` (pinned at `3a632cb3`) | `43371314134` | `sha256:feae5c26718fd12f5b05510460a8bf33457852c3d35542c88004757d288e6839` |
| `948e5cfcc03f688829ca6011037bf58d886e5dea` (pinned at `47263e51`) | `43373914637` | `sha256:72dee5928f5bf2485ce159bd1bc9ef927bba6a4a029991870bef06c3683f9a8d` |

- I read the digests from the GHCR registry API with the bare full sha. For `948e5cf` the negative control `53caff9b…`
  returned 404 and the positive control `01fa3134…` returned 200.
- **Pin `948e5cf`'s digest, `sha256:72dee592…`.** `7d31ed7`'s image has the same app code but was pinned to an open PR
  head, so it is superseded.
- This report's own commit touches `sessions/` only and builds no image. Do not pin to it.

## My miss

saf's packet placing this wire, addressed to cortex-ui/master
(`invincible-agent/sessions/2026-11-11-packet-to-cortex-ui-master-from-saf-export-by-range-the-request-gains-a-range-selector.md`),
sat unread from 11-11 until Chris's order named the sha. My sweep for placed packets filtered on today's date.

Separately, since invincible-agent `fd7df47d` (#372) `sessions/` is gitignored there, so placed packets no longer show
as untracked files at all. I now sweep with `ls -t` and a grep for packets to cortex, with no date filter.

## For Chris: do session files stay committed in cortex-ui?

Lane 1's 11-13 packet to cortex says "Session files are placed, never committed, in any repo (ruled 2026-11-12)", and
"other repos follow as their masters adopt the ruling". cortex-ui's CLAUDE.md says the opposite: `sessions/` is this
lane's ledger, committed as `docs(sessions):`. invincible-agent untracked its own in #372; Lane 1 made no PR elsewhere.

That ruling reached me relayed, so I have not acted on it. This report is committed under the CLAUDE.md rule. Untracking
cortex-ui's `sessions/` would also need the CI gate rechecked: a sessions-only push builds no image today, by path.
**Your word decides.** Until then, cortex-ui keeps committing its own reports and leaves peers' packets untracked.

cortex-ui/master
