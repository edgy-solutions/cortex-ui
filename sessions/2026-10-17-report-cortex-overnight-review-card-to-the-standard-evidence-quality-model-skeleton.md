# Report: overnight 10-17. The review card is at the standard, evidence quality is drawn, and the MODEL skeleton is flagged

for: Chris, invincible-agent/seat/architect
from: cortex-ui/master, 2026-10-17

## Where things stand

| directive item | state | sha |
|---|---|---|
| (B) 1. Review card to the standard | done, pushed | `df7f429` |
| (B) 2. Chip rule: bordered = clickable; reason codes as muted text | done (in the card) | `df7f429` |
| 3. xml lift, /ingest/mine paging past 50, title = notice id | done earlier | `55d2e6a`, `8066347` |
| 4. e2e/walk "steward review" step | done, pushed | `760a313` (**no image**) |
| 7f's evidence quality (#132 inherited, region boxes) | done, pushed | `68f56bb` |
| Day 2: MODEL canvas skeleton (explainModel, read side, flagged) | done, pushed, flag off by default | `9b23135` |
| (A) OpenDDIL end to end | **No cortex item in the directive's list.** The existing pieces are unchanged: WORKFLOW_CASE draws `maint_fault_propose`, and the brokered-login walk row (10-16) still waits on the `keycloak-openddil-trust` PEM. Not walked tonight. | — |

**Pin for the next roll: `68f56bb`, `sha256:5d5b5dbbb1dc67e1f885170c5f316b6a2e6e139b9e92b75efa3015986187be06`.**
- Measured from GHCR with controls: the full sha returns 200; the short sha and a fake sha return
  404; the known-good `10f64f1` returns 200.
- It contains `55d2e6a` and `8066347`. 198 rolled `8fe23fc`, which has neither and has no review
  card. Lane 1 asked whether to take `8066347`; my answer is to take `68f56bb` instead
  (packet `4dfc74b`).
- `9b23135` (the MODEL card) also built: `sha256:5c41175694ee0ed52f5817f79ef7394a16685c5ff27d61fa29ef5507bf7fd6a6`, measured with the same controls. It is `68f56bb` plus the MODEL card, which is off unless `VITE_FEATURES` lists `modelCanvas`. Either pin is safe. Lane 1's packet names `68f56bb`; take `9b23135` only if you want the card reachable behind its flag.

## The card (B)

- **Payload.** It reads 193's shape: `ingest_id` on the task, plus `/extraction` and `/source`
  (Lane 1's 10-17 packets). It was built against a fixture of that shape. A pdf.js test proves the
  fixture honest: every row's box contains its mpn and its value, in both units.
- **Lane 1 says the routes are live at 198,** but neither has been called as a persona. Neither
  cortex nor Lane 1 has called them live. cortex's live walk needs `68f56bb` rolled first.
- **Pre-198 tasks** keep their old payload, which still carries `ingest_id`. The card fills the
  header from `/extraction` and flags any field on which the payload and the extraction disagree.
- **Keyboard:**
  - `j`/`k` move between rows;
  - `p` arms promote, and a second `p` or `Enter` sends it; `Esc` disarms;
  - `r` opens the reject codes, `1`–`9` picks one, and `Enter` sends.
  - Promote is armed rather than sent on a single key because one stray `p` should not promote a
    notice. A click on Promote still sends at once.
- **Reject codes are cortex's proposal:**
  - `wrong_value`, `wrong_part`, `missing_rows`, `not_a_notice`, `unreadable`, `duplicate`.
  - Nothing serves a list, so I asked Lane 1 to serve one or ratify these six.
- **Kind (PCN/PDN) is not served** on the payload or on `/extraction`. The top line says "kind not
  served"; asked.
- **Row edits:** the slot is there, but this task kind has no wire for them, so it says "no wire".
  `VITE_REVIEW_ROW_EDITS` is ON unless it is set to exactly `false`. Asked.

## Evidence quality (7f's packet)

`obtained_via` is doc-tools' `match_method`. The card now says what the outline **is**, and the safe
set is enumerated:

| method | outline | caption |
|---|---|---|
| `text_layer_cell` | solid | the cell |
| `region_preferred`, `unique` | dashed amber, and flagged | the whole table on pN, not the cell |
| `inherited_doc_level` | dashed violet | the date sentence on pN; "N rows inherit it: confirming it once confirms them all" |
| anything else | dashed slate, and flagged | not claimed to be the cell |

## Proof

- **Mutants**
  - Card and lib: 32 of 35 killed. The 3 survivors are redundant arms, each covered by a sibling,
    and each was checked by firing the mutant it was written for.
  - Evidence quality: 13 of 13 killed. That includes "sharing by page only": the runner's quoting
    broke on it, so I fired it by hand.
- **The walk caught a real bug.** `/source` is fetched as bytes, so a coded 404 `source_absent`
  arrived as an ArrayBuffer. The card read it as "route not served". The fix is `errorBody()`,
  which uses a cross-realm tag check, because `instanceof ArrayBuffer` failed under jsdom.
- **The walk's step split:**
  - step 3 is steward review: bob, title = notice id, rows drawn, PDF `ready`, row 1 outlined;
  - step 4 is promote.
  - Where the routes are not served, a plain 404 skips step 3 with its reason.
  - With `WALK_REQUIRE_REVIEW=1`, a plain 404 fails step 3.
  - The mock walk passes 7 of 7.
- **Checks:**
  - transport, `tsc`, e2e `tsc` and `build:bundle` all exit 0.
  - The suite is at the known baseline: 13 failures in 5 environmental parity files (meshSdkParity,
    canvasExport, ingestKindStatusParity, rowEditsWireParity, taskKindParity).
  - npm audit: 0 vulnerabilities on 621 dependencies. Dependabot reports 15, the known divergence.

## What broke, and an open question for you

**`760a313` built no image.** pdfjs-dist 6.3.289 declares Node ≥22.13 and calls
`Promise.withResolvers`. CI and the Docker builder run Node 20; this box runs 22.15. One fixture
test runs pdf.js under Node, so it passed here and failed in CI's test step, and the image steps
skipped.
- The fix is a test-scoped fill, `f15b88e`.
- It is proven both ways under a simulated Node 20: with the fill off, the run reproduces CI's
  TypeError; with it on, 4 of 4 pass.
- The browser bundle is unaffected.

**Open: bump CI and the Docker builder to Node 22, or keep the fill?** The fill is the smallest
change. A bump is the honest one, because the dependency says what it needs. This is your call, so
I have not made it.

## Gaps on our side, not fixed tonight

- **The rail can drop a row silently.** `readIngestMinePage` counts the `/ingest/mine` rows it
  cannot read, and the store throws that count away. A refused row vanishes without a word. I have
  asked Lane 1 for a raw item if alice's two timeouts don't show.
- **Fin's `reason_code`.** Fin's 10-17 packet notes that `readExportDocument` keeps `reason` and
  drops `reason_code`. Fin says no change is needed, and PR #69 is not merged or rolled. It is
  queued behind A and B, as the directive says.

## Day 2: the MODEL skeleton

**`9b23135`: the `MODEL_EXPLANATION` archetype, behind `modelCanvas`, which is off by default.**
It is ADR-0057's `explainModel`: "what the ratified model says about a class or property, and why".

- **No producer serves `explainModel`,** and no wire shape exists anywhere. The shape is cortex's
  proposal and lives in one file: `src/archetypes/model-explanation/contract.ts`.
  - Its question keys and states deliberately match the 10-15 `diffModel` ask (`a1db91e`), so one
    vocabulary covers both verbs.
- **What the card draws:**
  - the subject (class or property), its definition and super classes;
  - for a class, its properties with cardinality;
  - "ratified model @ sha", or "not stated" when the sha is absent;
  - ADR §2's eight questions.
- **Each question is in one of four states.** The first three are states the producer sends; the
  card reads only those three, spelled exactly:
  - answered, with its source: the "and why";
  - deferred, with its reason;
  - `not_recorded`: today's honest answer. No class in the ratified TTL carries a system-of-record
    or owning-domain annotation (origin/master `5d8800e0`).
  - Everything else is unreadable:
    - a missing key, drawn as "not on the wire";
    - `open`, which a ratified model cannot hold;
    - a blank value, or a deferral without a reason.
- **Read-only.** The card has no button, input, drag or link, and a seal enforces that across
  every fixture.
- **With the flag off,** a panel names the flag and shows the raw payload. It is never dropped
  silently.
- **To turn it on:** add `modelCanvas` to the chart's `VITE_FEATURES`, or set localStorage
  `cortex.modelCanvas=1` in one browser.
- **Proof:**
  - 18 of 18 mutants killed. The first sweep left 3 survivors (a mixed list, a non-empty array as
    `answers`, a blank `ratified_at`), and each was closed by an arm written for it.
  - The full suite is at the baseline.
  - `tsc`, transport and the bundle all exit 0.
- **Not built:** `diffModel`, the proposal board, the graph and the ratification mirror. They still
  wait on the 10-15 packet's Q1–Q6.
- **Asked of lane/74** (packet below):
  - Is this the shape?
  - Where will the answers live once they are ratified?
  - Does it arrive on the stream or from a route?
- **Asked of Lane 1:** does `can_view` gate it?

## Packets out

- **`4dfc74b`, to Lane 1** (cc architect, 7f): the card, five asks, the evidence-quality table, the
  rail answer, `/source` errors as JSON, and the pin.
  - Placed uncommitted in invincible-agent and doc-tools.
- **This commit, to lane/74 (cc Lane 1, architect):** explainModel's read side and the wire it assumes.
  - Placed uncommitted in invincible-agent.
