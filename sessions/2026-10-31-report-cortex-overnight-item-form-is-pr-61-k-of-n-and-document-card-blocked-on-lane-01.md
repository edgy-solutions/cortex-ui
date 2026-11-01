# 2026-10-31 overnight — the item form is PR #61; items 2 and 3 wait on Lane 1

Dispatch: "review_coverage item-form switch (PR), then the New Canvas 'k of n' against Lane 1's served progress when it lands, then the DocumentReviewCard build when the three answers arrive."

## 1. The item-form switch: PR #61, open, CI green

- **Branch.** `feat/review-coverage-item-form`, head 477f72f, based on master b3f54fc. It is not stacked, so the CI gate ran.
- **What the card sends.** Only `ItemReviewCoverage` (ingest-v1 1.5.0).
  - `review_shape` and `item_kind` come from the extraction.
  - `rules_version` comes from the matching `GET /review-shapes` row.
  - Ids are `String(part_index)`.
  - The row's rules and params decide runs, shared facts, `min_run`, `per_run`, `sample_all_up_to` and `min_shared`.
  - The hard-coded `cortex.reviewRuns.v1` is gone.
- **When no coverage is sent.** In five cases the card sends none and the `data-coverage-unsent` line says why: no shape, no kind, no row, a kind mismatch, or a kind other than `part`.
- **Promote hold.** Promote is held only while the shapes load. A press before they load would otherwise drop a coverage that was about to be built.
- **Re-pin.** OpenAPI snapshots and CI `PRODUCER_REF` are now at 41230a7e (`invincible-agent-0.4.73`). The diff from 10ac02fe is additive; the task_kinds diff is empty (control: 133 files).
- **Mutants.** 18 fired and 17 were killed, each by its named arm with the matching message. The tree hash was the same before and after.
  - M17 survives by construction. It drops the card's `coverageRowProblem` call. The card builds the record from the row it checks against, so no input can make that check fail at the card. The function's own arms kill M12.
- **Local gate** (fresh export, producer sibling at 41230a7e):
  - transport, redproof, test, tsc, seals and bundle all exit 0;
  - tests: 4582 passed, 1 skipped, 9 todo;
  - INSTRUMENT: 32 files, 450 arms ran, 0 did not run.
- **CI run 41267439128.** Build Frontend passed, with the same INSTRUMENT: 450 ran, 0 did not, and 12 redproof checks with 0 failed. A PR builds no pushed image, so the digest comes at merge.
- **⚠ Roll order.** 0.4.72 (rolled) has no `/review-shapes`. Against it this cortex sends no coverage and still promotes.
  1. BFF ≥ 0.4.73 goes with this cortex or before it.
  2. Lane 1 deletes the parts form only after #61 is on master. They have been told not before.

## 2. New Canvas "k of n": blocked

- Lane 1's board item 01M6A9QDN1VP1N2GBNX3GA87NB, "Per-panel seed progress for POST /canvas/seed", is **open**.
- The producer master (2a042971) does not serve it.
- `src/lib/seedProgress.ts` keeps its PROPOSED field names until it lands.

## 3. DocumentReviewCard: blocked

- Board item 01M6A9QDN1Z65JPF81HJTQX901 is blocked on 01M6A9QDN1NDKZ65PFYF9DQ123, "Serve the section universe", which is **open**.
- No new answer packet has arrived.
- The card choice will read `/review-shapes`; `useReviewShapes` arrives with #61.

## Packets placed (uncommitted, in invincible-agent/sessions)

- **`2026-10-31-packet-to-lane-01-from-cortex-item-form-is-pr-61-and-cortex-board-corrections.md`**
  - #61 status, and "do not delete the parts form yet".
  - The roll order.
  - Board corrections:
    - 01M6A9QDN112 → review, #61;
    - D1/D2 → done (fe4d787);
    - drop-kind picker → done (d2536fc);
    - two missing New Canvas items.
  - **Open question:** should cortex commit its own items to invincible-agent's `board/`? The 10-31 board directive says each lane corrects its items in place. The 10-06 fleet directive says only the owning lane commits in a repo. Until someone rules on it, I sent the corrections as a packet.
- **`2026-10-31-packet-to-fin-from-cortex-the-raw-seal-exists-in-two-forms-which-one-does-tcpi-arrive-as.md`**
  - Answers fin's 10-31 TCPI packet. Both undeclared paths are already sealed:
    - an unknown archetype shows "no render registered";
    - unconsumed keys show "Raw — N field(s) with no declared rendering".
  - Asks for a capture of TCPI's `components[*].archetype`, so the arm binds to the real arrival.
  - Keeps the current wording.

## Still waiting / notes

- **Lane 1:** `carries` and `applies_when` (01M6A9QDN1X5Z55D7DDQJNP4TX); `capabilities` on entitlements, after which `AP_GROUP` is removed (01M6A9QDN1H2BGHWGD1407KPXM); `consumer`; `drop_leaves` labels.
- **The 0.4.74 cortex pin 5cc4241** excludes #59, #60 and #61.
- **`meshSdkParity`:** its snapshot `sdk_ref` is v0.9.8, while the producer's `uv.lock` is at v0.9.12. This needs a separate re-extract.
- **Sandbox freeze still in force:** no rolls. "On sandbox" for New Canvas waits on it.
- **After the merge:** once #61 merges, report the master digest and tell Lane 1 the sha.
