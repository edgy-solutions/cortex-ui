# 2026-11-12: "Export as…" on every notice card, and three display fixes (0.4.87)

**To:** Chris, the architect · **cc:** Lane 1
**From:** cortex-ui/master lane
**Commits:** `4cbe5e8` (item 1), `fb3162a` (item 2), on master
**Rides:** 0.4.87
**Image:** `ghcr.io/edgy-solutions/cortex-ui@sha256:37d6e0166938c3fc13c1a2d294ea56a16b0aae64c509af718121742ce9588972` (tag `fb3162a35316a4fd5cdaafe85ec7bb67d2a771ee`)

## What was asked

The architect's overnight order (via Chris): "by 07:00Z, one image:
1. 'Export as…' on every notice card, one notice at a time: shown to a viewer who holds ingest:exportBatch, may read
   the notice, and holds a profile whose exportable_states include its state. No review task required. Keep the
   Promote-page button.
2. The three display fixes (title bleed, clipped table, false 'sent today' line), as diagnosed.
Gate green, push, and send Lane 1 the digest."

**Both items shipped in one image.** Item 2 did not need to be dropped.

## Item 1: "Export as…" on every notice card (`4cbe5e8`)

- **The mount.** `IngestStatusCard` (the notice card) mounts `ReviewExportAs` after the review-task ternary, so it
  renders whether or not the viewer holds the review task. alice (grants, no task) now sees it beside "no review task
  visible to you".
  - It adds no gate of its own. `ReviewExportAs` already gates on:
    - the `reviewExport` flag;
    - `ingest:exportBatch` in `/me/entitlements`;
    - the row's `stage`;
    - a profile whose `exportable_states` lists that stage.
  - "May read the notice" is the card's own precondition: it draws only a row the status read served.
  - Clicks stop at a wrapper, so they never re-focus the canvas card.
- **The Promote-page button is unchanged.**
- **A defect found and fixed on the way: the dialog now portals to `document.body`.** The notice card lives on the
  canvas, under the camera transform. A `position: fixed` overlay inside a transformed ancestor is placed and scaled
  relative to that ancestor, so the "Export as…" dialog would have opened clipped and shrunk inside the card. The
  lasso bar never hit this, because it is not inside a card. React events still bubble through the portal to the
  card's stop wrapper.

**The seal, as ruled** (`IngestStatusCard.exportAs.test.tsx`):
- Only the wire is stubbed (`fetchEntitlements`, `fetchIngestExportProfiles`). The capability check and the profile
  filter run for real.
- Within each control pair, the only difference is the `capabilities` list.

| arm | viewer | `ingest:exportBatch` | sees "Export as…" |
|---|---|---|---|
| 1 | non-reviewer (alice's screen) | yes | **yes** |
| 2 | the same non-reviewer | no | no |
| 3 | reviewer | no | no |
| 4 | the same reviewer | yes | **yes** |
| 5 | non-reviewer, no profile lists the stage | yes | no |
| 6 | the dialog opens as a direct child of `body`, outside the card; no click inside it reaches the canvas | | |

Dialog tests now query `baseElement` (the body). `ExportSelectionDialog.test.tsx` gains an arm asserting the dialog
is outside the tree that mounted it.

## Item 2: the three display fixes (`fb3162a`)

| defect (Chris's screenshot) | cause | fix | capture seal |
|---|---|---|---|
| **A.** A focused card shows other cards' titles, magnified and faded ("Review 17 affected part(s) — notice OV-19-05", "PCN26-185 · … / complete · 32d ago") | Other cards stayed at a 0.4 dim, were zoomed with the camera, and showed through the focused card's glass face; the arrangement labels too | While a card is focused, every other card and dot is opacity 0, visibility hidden and pointer-events none; the labels unmount | `GlobalCanvasStage.focusAlone.test.tsx`: counts the visible roots (exactly one, the focused one) and the labels; no focus or unfocus shows all of them |
| **B.** The disposition table is clipped on the right (Disposition, LTB, SET DISPOSITION) | The split keyed on the **viewport** (`md:`), but the table lives in a canvas card far narrower than the viewport; the four columns overran the 5/12 track | The root is a container query (`@container`); side-by-side starts only when the **card** is 64rem or wider, and then the table takes its full width (`@5xl:grid-cols-[max-content_minmax(0,1fr)]`) | Chromium, by hand (CI runs no Playwright): `e2e/groupedReviewTableLayout.spec.ts`, using the 17 OV-19-05 MPNs at 1540/1030/800 px. CI tripwire: `GroupedReviewTable.layout.test.tsx` |
| **C.** "sent today: promoted, …" while Promote is held | The preview printed the verb regardless of the hold | One predicate, `promoteHeld`, drives both the button and the preview. When held, the preview reads "sent today: nothing; Promote is held" and "would be recorded with the promotion". When not held, the output is byte-identical to before. | `promotionRuns.test.tsx`, on the 402-part fixture: after one `j` the line is held and the verb (read from the button) is absent. Walking to promotable, the line names the verb exactly when the button is enabled, at every step, and both states are observed. |

Two existing arms had pinned bug C and were rewritten to assert the held text:
- "record preview" (it asserted "sent today: promoted" after one `j`, while held);
- "drafting a fix from the callout" (it asserted "1 row edits" sent, while held).

A dot (a card below the dot size) cannot be counted in jsdom, because focusing culls every dot from the DOM. The dot
rule is the same line of code as the card rule.

## Mutants (each fired alone, all restored, scored on the failure MESSAGE)

| id | mutation | reddened | reason |
|---|---|---|---|
| D1 | notice-card mount removed | arms 1, 4 | button absent |
| D2 | mount moved inside the reviewer branch | arms 1, 5 (4 green) | button absent for the non-reviewer |
| D3 | `ReviewExportAs`'s render early return `!can` → `false` | **survives** | redundant: the effect's own `if (!can) return` never loads profiles; removing that too reddens 2, 3 |
| P1 | dialog not portaled | both portal arms | "expected <div…> to be <body>" (its parent is the card's div) |
| P2 | the card's stop wrapper loses `stopPropagation` | arm 6 | "vi.fn() … called 2 times" (the canvas saw the clicks) |
| A | back to the 0.4 dim | focus arm | "exactly one card may be visible … got 3" |
| B | `md:` grid restored | tripwire | the class assertion; its message names the Chromium spec |
| B′ (Chromium) | old classes in the browser | 1030 and 800 fail; 1540 passes | "a Set disposition button ends at 459.5, past the scroller visible edge 423" |
| C | the preview ignores `promoteHeld` | 4 arms | the held marker is absent |

## Gate

The gate ran on git-archive exports of both repos: cortex at `fb3162a` (1153 files, matching `ls-tree`) and the
producer at the pin, `8c3eb9af`.
- **Steps:** transport, redproof, `npm run test` (report mtime 23:02:07 local), tsc, seals and `build:bundle` all
  exited 0.
- **Tests:** 326 of 326 files; 4915 passed, 1 skipped (the known `reviewShapes` yaml arm; see the 0.4.86 report §3),
  9 todo.
- **Seals:** INSTRUMENT "ran = 502, did not run = 0, files missing from report = 0".

The implementer's working-tree run showed 13 failures in 8 files. Every one was a seal that reads the sibling repo.
They came from the sibling checkout on disk, not the pin: the same seals pass at the pin above.

## CI and digest

- **Push:** master `0612fad..fb3162a` (both commits), 05:03Z.
- **CI:** run `43158821177` succeeded. These steps passed:
  - "Test suite, with both peers present";
  - "Cross-repo seals must have RUN, not merely passed";
  - "Prove the cross-repo seal guard can still fail";
  - "Typecheck".

  "Build and push frontend image (multi-arch)" ran; this is a code push, so it was not gated.
- **Digest:** `sha256:37d6e0166938c3fc13c1a2d294ea56a16b0aae64c509af718121742ce9588972`, read from the GHCR registry API
  using the bare full sha. Negative control `53caff9b…` → 404; positive control `01fa3134…` → 200.
- **Lane 1:** sent the digest in
  `invincible-agent/sessions/2026-11-12-packet-to-lane-01-from-cortex-fb3162a-is-built-37d6e016-for-the-0-4-87-train.md`.
- **Pin:** `fb3162a`. This report's own commit is sessions-only and builds no image.

## For the sandbox demo (Lane 1's side)

- alice can now export from the notice card on any notice whose state some profile of hers lists. By policy at
  `cc4104d4` she holds `ingest:exportBatch` and `can_export:part-list-reviewed`, which lists `review`.
- bob (the Promote reviewer): Lane 1's live Topaz read (04:55Z) shows he holds none of `ingest:exportBatch`,
  `can_export:part-list` and `can_export:part-list-reviewed` today. Tonight's train gives him all three as a user
  grant (the sample overlay, `grant_to: bob@example.com`). After the roll he should see "Export as…" on the Promote
  page and on the notice card, for notices in his cell domains (SUSTAINMENT admits PCN-2683). cortex gates on the
  capability, never the group, so nothing on our side depends on how the grant arrives.
- This image needs no value change beyond its digest: `reviewExport` is already on in sandbox. That meets Chris's
  values condition for the train.
- `GET /me/entitlements` as alice and as bob is Chris's read (Lane 1 does not sign in as people). It is the one
  check left that would confirm what the browser receives.

Answers Lane 1's `cortex-ui/sessions/2026-11-12-packet-to-cortex-ui-master-from-lane-01-tonights-0-4-87-train-send-the-digest-by-07-15z.md`,
committed with this report.

cortex-ui/master
