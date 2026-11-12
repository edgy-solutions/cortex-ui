# 2026-11-12: the export dialog names the notice, and the reviewer sees "Export as…" on the Promote page (0.4.88)

**To:** Chris, the architect · **cc:** Lane 1
**From:** cortex-ui/master lane
**Commit:** `6a441d9` (both items), on master
**Rides:** 0.4.88
**Image:** `sha256:c40487815f41132292043077d431cc25d13d1f24df9572e2d6a004f868abf2ab` (built at `6a441d9`, run `43250577656`)

## What was asked

The architect, via Chris: "the per-card export works for alice on 0.4.87. Two items for 0.4.88:
1. the Export as… dialog titles the notice by its number (PCN-2683), not its hash;
2. the bob Promote-page fix, from your diagnosis."

Chris, on item 2: "Find why the button at PromotionReviewCard.tsx:1364 doesn't render … and show it whenever the export
rule allows: exportBatch, may read the notice, a profile listing its state. Not tied to Promote being allowed. Seal: the
button visible on a held Promote review for a granted reviewer; absent without the grant."

## Item 2 first: why bob saw nothing, and the correction to my earlier diagnosis

**The cause is not the hold, and not the grant.**
- The mount at `PromotionReviewCard.tsx` (now line 1372) has no condition. It sits after the act/blocked ternary, so
  Promote being held never touched it.
- Lane 1's 15:04Z Topaz read shows bob holds `ingest:exportBatch` and both `can_export:*` live.

**The cause: the status route serves only the dropper.** The producer's `GET /ingest/{id}/status`
(`ingest_status_route`, at `e29f7442`) is "for the SUBMITTER or the on_behalf_of principal only … a caller who is
neither gets a plain 404".
- A reviewer who holds the open Promote task may read `/extraction` and `/source` (`_ingest_review_access`, reason
  `task_holder`). Neither body carries the notice's state.
- So for a notice someone else dropped, bob's status read is a 404. The store marks it not-found, the row never
  arrives, and `ReviewExportAs` saw `state === null` and drew nothing.
- On his own drop card (PCN# 20250213001.1) bob is the submitter, so the row arrives and the button shows. That is
  exactly the split Chris saw.

**My 0.4.87 diagnosis was incomplete.** I said bob saw no button because he held no grant. That was true then, and it
hid this second cause. The grant arrived at 14:14Z, and the button still could not appear on a review of someone else's
drop.

**The fix: ask the server the rule.**
- When the status read is refused, `ReviewExportAs` runs `check_only` (`POST /ingest/export/notices`) once per profile
  the viewer holds.
- That check is the export rule itself: domain ("may read the notice"), `accepts`, and `exportable_states` against the
  notice's real state.
- A profile is admitted when the check names no refusal for this notice. A check that fails admits nothing, because an
  unknown answer is not a yes.
- The button shows if at least one profile is admitted, and the dialog offers only those.

What did not change:
- Where the row is readable (the dropper, the notice card), the path is the 0.4.87 one, and no check is fired.
- Nothing in cortex names a state. The tempting shortcut, "a Promote review means stage `review`", would have
  hard-coded a state, and config names the case.

## Item 1: the dialog names the notice by its number

- The dialog's source line and each refused row now read the notice's own number (`PCN-2683`). With no number known
  yet, they read `drop <first 12 hex>`.
  - This is the same rule as the notice card's lead line (`ingestLeadLine`), reused, not a second one.
- Before, both printed the `sha256:` id. The server fills a refused row's `notice_id` with the ingest id.
- `ExportTarget` gains a display-only `label`. `data-unexportable` and the request body still carry ingest ids: the
  label never reaches the wire.
- The lasso labels each notice from its row, else the card's own ingest component.
- **The two items meet on the Promote page.** A reviewer has no status row, and so no number from it. The Promote card
  passes its own `notice_id` (from the task payload and the extraction header), so the reviewer's dialog says
  `PCN-2683`, not `drop 3f9a…`. A mutant pins this (M5 below).

## The seals

**`PromotionReviewCard.reviewerExport.test.tsx`** is new, the seal as ordered.
- It mounts through `ApprovalTaskCard`, the real dispatch, on a Promote that is held, and asserts the hold.
- Only the wire is stubbed: `fetchEntitlements`, `fetchIngestExportProfiles`, `checkNoticesExport`, and
  `fetchIngestStatus`, which answers the non-submitter's 404.
- The store's poll, the grant check and the profile filter run for real.

| arm | viewer | status read | check_only | "Export as…" |
|---|---|---|---|---|
| 1 Chris's screen | reviewer with `ingest:exportBatch` | 404 | one profile admits, one refuses | **shown**; the dialog offers only the admitted profile; the source reads `PCN-2683` |
| 2 the same reviewer, no grant (the only difference) | no `ingest:exportBatch` | 404 | not called | absent; no profile read, no check |
| 3 granted, nothing admits | with | 404 | both refuse | absent |
| 4 status still loading | with | pending | not called | absent |
| 5 a check that fails | with | 404 | one rejects, one refuses | absent |

Run before the fix, arm 1 failed with "button absent". That confirms the cause in code, not only in reading.

**`ReviewExportAs.noticeLabel.test.tsx`** is new, for item 1. Its arms:
- the source line is exactly `PCN-2683`, with no 12-hex run anywhere in the dialog;
- with no number, it reads `drop <12 hex>`;
- a refused row reads `PCN-2683:`, while `data-unexportable` stays the ingest id;
- the download body carries the ingest id.

The lasso arm is in `reviewExport.test.ts`.

**Existing assertions changed:**
- `ReviewExportAs.test.tsx`: the source line `toBe(ID)` became `toBe("drop abc")`. It had pinned the hash.
- `lassoTargets`' `toEqual` now includes the label.
- `PromotionReviewCard.test.tsx` "which card draws" now also asserts that the dropper path fires no check.

## Mutants (each fired alone, restored, scored on the message)

| id | mutation | reddened | message |
|---|---|---|---|
| N1 | `source={ingestId}` again | label arm 1 | the source is the sha |
| N2 | refused row prints `u.notice_id` | label arm 3 | the row text lacks `PCN-2683:` |
| N3 | labels sent instead of ids | label arm 4 | the body is not `[ID]` |
| N4 | `lassoTargets` drops `label` | lasso arm | the label is missing |
| M1 | reviewer path removed (`state === null` hides it again) | arms 1, 3, 5 | "button absent"; the checks were never called |
| M2 | shown when any profile is a candidate, ignoring the verdict | arms 3, 5 | "button shown though nothing admits" |
| M3 | "admitted" = the check resolved, ignoring `unexportable` | arms 1, 3, 5 | arm 1: "p-other offered" |
| M4 | the dialog ignores `admitted` | arm 1 | "p-other offered" |
| M5 | the card's `noticeId` ignored in the label | arm 1 | "expected 'drop 5b15f205aaaa' to be 'PCN-2683'" |
| M6 | checks fire before the 404 settles | arm 4 | "expected <button…> to be null" |

## Gate

On a `git archive` export of `6a441d9` (1157 files, matching `ls-tree`), with the producer pinned at `8c3eb9af`:

| step | rc | detail |
|---|---|---|
| check:transport | 0 | |
| check:transport:redproof | 0 | |
| npm run test | 0 | 328 files; 4925 passed, 1 skipped, 9 todo (4935); report mtime 09:40:52, written by this run |
| tsc --noEmit | 0 | |
| check:seals | 0 | INSTRUMENT: 37 cross-repo seal files censused; 502 arms ran, 0 did not run, 0 files missing from the report |
| build:bundle | 0 | |

## CI and digest

- **CI:** run `43250577656` (Build Containers) on `6a441d941ece9b09da3dea309c768ed225feece5`. Every step succeeded:
  - transport;
  - the test suite with both peers present;
  - "cross-repo seals must have RUN";
  - the seal-guard redproof;
  - typecheck;
  - **Build and push frontend image (multi-arch)**. The image step ran; this push was not sessions-only.
- **Digest**, read from the GHCR registry API with the bare full sha:
  - `6a441d941ece9b09da3dea309c768ed225feece5` → 200, `sha256:c40487815f41132292043077d431cc25d13d1f24df9572e2d6a004f868abf2ab`;
  - negative control `53caff9b…` → 404; positive control `01fa3134…` → 200.
- **Pin 0.4.88 to `sha256:c40487815f41132292043077d431cc25d13d1f24df9572e2d6a004f868abf2ab`.** This report's own commit is sessions-only and builds no image, so do not pin to it.

## For the producer (Lane 1): optional, not needed for 0.4.88

Two producer changes would make the check unnecessary. Either is the architect's call, and cortex works without
either:
- `GET /ingest/{id}/status` admits the open-task holder, as `_ingest_review_access` already does for the extraction;
- or the extraction body carries the notice's `stage`.

Today the reviewer's Promote page fires one `check_only` per profile they hold. bob holds two, plus any default
profiles.

## My miss: the demo-clicks addendum went unanswered

Lane 1's addendum
(`sessions/2026-11-12-packet-to-cortex-ui-master-from-lane-01-addendum-put-the-demo-clicks-in-your-07-15z-packet.md`)
asked for numbered demo clicks for alice, for bob and for a negative control, in my 07:15Z packet. It arrived as an
untracked file with no notice, and I did not list or read the placed packets before sending the 0.4.87 packet. So the
clicks were not in it. The addendum is committed with this report.

The 07:15Z window is past, and the architect confirmed alice's export works on 0.4.87. Below are the clicks for
0.4.88, with only the visible text I checked in code.

**bob, the Promote review (the 0.4.88 fix):**
1. Open bob's `document_promotion` review task for a SUSTAINMENT notice that bob did not drop (e.g. PCN-2683).
2. On the Promote page, below the Promoted / Rejected buttons, the button reads **Export as…**. It shows while Promote
   is held, in both the card and the full-screen view.
3. Click it. The dialog's header reads "Export as…", and its source line reads the notice number (**PCN-2683**), not
   `sha256:…`.
4. The picker offers only the profiles the server admits for this notice's state. Each shows its served label with
   `format / grain`. At `review` that is `part-list-reviewed`; `part-list` lists only `promoted` and is not offered.
5. Pick it. The button reads **Export 1, skip 0**. Click it to download.

**alice, the notice card (unchanged since 0.4.87; only the dialog's source line changed):**
- On the notice card, **Export as…** sits beside "no review task". Clicking it opens the same dialog, and the source line
  now reads the notice number.

**The negative control:**
- A notice whose state no granted profile lists, e.g. a drop still extracting (before `review`). Today's served
  profiles list only `review` and `promoted`, so the card shows no **Export as…**.
- On the Promote page, a reviewer without `ingest:exportBatch` sees no **Export as…** (seal arm 2).

cortex-ui/master
