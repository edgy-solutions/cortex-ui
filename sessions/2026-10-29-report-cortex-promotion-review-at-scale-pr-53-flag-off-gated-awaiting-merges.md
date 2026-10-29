to: Chris (cortex-ui owner)
from: cortex-ui (master lane)
date: 2026-10-29
re: promotion review at scale is PR #53, flag off. Nothing is merged, so there is no digest yet: your merges come first.

## What you asked for, and where it stands

| ruling | done | where |
|---|---|---|
| 1 Both no-auth shims revert; a seal keeps them out | yes. There were three shims: App.tsx, useDropIdentity.ts, and the card's owner | #53; `src/auth/noAuthReads.test.ts` |
| 2 Flag off by default, with a test | yes | #53; `featureFlags.test.ts` |
| 2 Merge after #47, #52, #51, #48, #49, #50 | **waiting on you.** My `gh pr merge` was refused as an unreviewed merge, so the merges are yours | list below |
| 3a sampled vs looked at, recorded on the promotion | **the branch lacked it.** Now built behind the flag, and **not sent**: the act body drops unknown keys today. Lane 1 has the shape | #53; packet below |
| 3b collapsed groups name their rule | **the branch lacked it.** Now built behind the flag | #53 |
| 4 digest, test counts, screenshot | counts and screenshot below; the digest comes after the merges | |

## Merge list, in order

1. #47 task-feed-race
2. #52 fractions-only
3. #51 case-panel-standard
4. #48 review-export (head `f947585`, which fixes the export refusal read to match lane 01's #154)
5. #49 export-offer (head `1adb2c2`, which removes a raw NUL byte that made GitHub treat a file as binary)
6. #50 access-requests: **it will conflict after #48.** The conflicts are additive in three files. I resolve them as the union and push.
7. #53 promotion-review-at-scale: **it will conflict after #50**, in `featureFlags.ts` (the union of the flag lists) and `PromotionReviewCard.tsx` (both blocks kept). I rebase it, with the flag off.

**All seven were rehearsed** on a local branch in that order, with the conflicts resolved as stated. Every gate step exited 0 (counts below). The two earlier rehearsals went red, and both times the cause was #53's own: its test data still used the pixel form that #52 refuses. #53 now serves fractions, which master accepts too.

## Test counts

- #53 alone (CI layout, head `e62db40`, producer `4a5ff6b6`): 4282 passed, 9 todo, 282 files; 416 cross-repo seal arms ran. Every gate step exited 0. GitHub CI: pass at `e62db40`.
- The six PRs stacked (`74ed5c7`, producer `47502b35`): 4320 passed, 9 todo, 289 files; 441 arms.
- All seven stacked: local `9082e9c` (#53 at `e62db40`), producer `47502b35`: 4423 passed, 9 todo, 294 files; 441 arms. Every gate step exited 0.
- 12 mutants on #53, each red on an assertion. The table is in the PR.

## Screenshot

The card on the scale fixture (PCN-SCALE-0402: 402 parts, the synthetic stand-in for PCN-2683), at #53's head `e62db40` with `promotionRuns` on. It was captured in Chromium through the real app:

- `sessions/2026-10-29-shot-promotion-review-at-scale-card.png` (the card)
- `sessions/2026-10-29-shot-promotion-review-at-scale-window.png` (the whole window)

Read from the page at the same moment, with no page errors:
- 15 run headers, each naming its rule and shape, e.g. "S1 FK2500037 → FK2500401 same shape FK9999999→FK9999999 ×40";
- one shared fact: "same crop: ltb_date 2027-03-31 · inherited from one crop on p1 · 402 rows";
- the record line: "proposed, not sent: … Looked at 0 of 402 parts, of which 60 were sampled; 380 covered by 15 runs, each grouped by the rule same_shape_run; 0 shared facts confirmed once".

**The screenshot caught a bug I had shipped.** The record line said "380 covered by 15 **rules**"; one rule grouped 15 runs. `e62db40` fixes the wording and pins it to the run count. No test had read that sentence.

## Two things to relay

- **To lane 01:** `sessions/2026-10-29-packet-to-lane-01-from-cortex-review-coverage-on-the-promotion-record.md` (committed on #53). It asks them to declare an optional `review_coverage` on `HumanTaskActRequest` and to carry it into `build_record` (provenance). It gives the shape, the invariant ("looked at" plus "covered" equals every part) and four questions. A tripwire in cortex fails the day our generated types show the field, and that is when cortex wires the send.
- **The flag stays off** until lane 01 declares the field and you turn it on.

## Not done

- No digest: nothing from this work is on master yet. After your merges I read each one from GHCR by full sha, with a positive and a negative control.
- No deploy, roll or cluster read (the freeze).
- The worktree, its junction and the local rehearsal branch are removed after #53 merges.
