to: Chris (cortex-ui owner)
from: cortex-ui (master lane)
date: 2026-10-29 (the overnight run of 10-28)
re: the four-item overnight directive. Every item is a PR that passed the CI-layout gate and CI. Nothing is merged, and no image was rolled.

## Status

| item | PR | branch @ sha | gate (CI layout) | CI |
|---|---|---|---|---|
| 1 Export on the review card + AP batch view | #48 | review-export @ 3bdb180 | 4216 passed / 280 files; 416 seal arms | pass |
| 2a fin #137 export picker (+ re-pin to 47502b35) | #49 | export-offer @ 205654f | 4201 / 277; 425 arms; sibling = archive of 47502b35 | pass |
| 2b Request access + Grant/Deny (flagged) | #50 | access-requests @ cd8fa83 | 4233 / 283; 421 arms | pass |
| 3 Case panel to the card standard | #51 | case-panel-standard @ 2c15832 | 4190 / 278; 427 arms | pass |
| 3 Post-pick seed re-send carries domains | already on master | 2f855ed | sealed in dockBarTemplateSeed.test.tsx | n/a |
| 3 REST/feed overlap race | #47 | task-feed-race @ 8ac70f1 | green earlier | pass |
| 4 page_dims removal + doc_level / header note | #52 | fractions-only @ a539e5d | 4182 / 277; 416 arms | pending at writing |

Every gate exited 0 at all six steps: transport, redproof, test, tsc, seals and bundle. Every mutant was fired by hand or by the implementer, and each failed on an assertion message. The tables are in each PR body.

## Merge order: the PRs overlap, and the combination is not gated

Each PR was gated alone against master `768139f`. These files are shared:

- `src/api/client.ts`: #48, #49, #50, #52
- `src/api/client.requestSeal.test.ts`: #48, #49, #50 (each adds a NOT_TRANSPORT or CALLS entry)
- `CanvasExportButton.tsx`: #48 (saveBlob extraction), #49 (offer picker)
- `PromotionReviewCard.tsx` and `.test.tsx`: #48 (export mount), #52 (doc_level note)
- `featureFlags.ts`: #48, #50

GitHub calls all six MERGEABLE now. That will change as they land. Suggested order: #47, then #52, #51, #48, #49 and #50 (#49 carries the producer re-pin, so it lands as one unit with its picker). I rebase whichever goes red, and re-read CI on the rebased head.

## Judgment calls you may want to overrule

1. **#48: `scope` renamed to `granularity`.** Lane 01's packet to fin
   (`…policy-exports-header-is-granularity-not-scope.md`) states the review-export header as
   `{name, format, granularity, label}`, with `granularity: notice_part | notice`. I followed it
   before lane 01's branch merges. It is still PROPOSED and flagged off.
2. **#51 has no case-panel ruling in writing.** I mapped the disposition directive's standard
   onto the case card (top line, listbox rows, pane, arrows). The PR body has the table.
3. **#51: a seal tightened.** The implementer excused the two new `*-absent` markers in the
   fixtures seal's `structural` set. I moved them into `WORKFLOW_CASE_ABSENCES`, so the fixtures
   must declare them. Removing one now reddens that fixture.
4. **#52 refuses pixel-form rows outright.** A pre-roll row with a pixel bbox is now malformed
   rather than drawn. A seal floor moved: `READ_FLOOR.fetchIngestExtraction` went 25 → 24 for
   the removed `page_dims` read. `bbox_no_area` was removed as unreachable, beyond the spec.
5. **#50: the grantor card's sync wording** ("Merged; syncing…" for pending, running or null)
   is the implementer's reading.

## Open: one question for you

**Lane 01's per-choice consequence text (case panel, fixture).** Lane 01's `9af220ee` seal pins
only fragments ("Reject sends it back", `evacuate_for_depot`, the supervisor name). #51 drops
"Choosing one approves it; " and capitalises "Reject…", but does not invent the full sentence.
I need the exact literal from lane 01, and which field it lives in.

## Not done

- No image has been built from these PRs, because none is on master. There are no digests to
  report until merges.
- The freeze holds: no rolls, primes, fires or cluster reads.
