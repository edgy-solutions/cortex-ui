# Report — cortex: declared reads /task_kinds, the two review cards' verbs from their declarations, the badge table retired

date: 2026-10-30 · lane: cortex-ui/master · relay: Chris

## Rulings this beat answers (architect, relayed 2026-10-30)

1. "isRegisteredKind reads /task_kinds; DocumentReviewCard buttons from its declaration." → #55, #56 (both merged).
2. "#56's pairing rule accepted as the interim; the producer gets an `applies_when: flagged|unflagged|any` field on the
   verb declaration (Lane 1, 0.4.73) and you read it when served. Next: PromotionReviewCard's "promoted"/"rejected";
   retire the badge/title table." → #57, #58.

## Landed on master (merged by the user)

- **#54** `612c5df`: BatchExportPanel's header names the ruled `capabilities` signal.
- **#55** → `9e9ee69`: `useTaskAct`'s `declared` is the served menu's verdict.
  - It reads `decl ? decl.declared : !menuLoaded`. An unread menu no longer calls a kind unknown, and cortex's table no
    longer makes one known.
  - `isRegisteredKind` → `hasDisplayRow` (display only). #58 deletes it.
- **#56** → `421fbbe`: DocumentReviewCard draws one button per served verb, in served order.
  - The pairing comes from `reason_required`: a reason-required verb is enabled only with flags, any other only without.
  - `documentReview.ts` no longer spells a verb.
  - A containment test carries a control arm on master's line.

## Open PRs

- **#57** `6031f99` (`fix/promotion-card-verb-roles`): PromotionReviewCard's roles come from `reason_required`.
  - PROMOTE (carries the edits and coverage) is the one non-reason verb; REJECT (the panel and `r`) is the one
    reason-required verb.
  - A role exists only if exactly one verb fits it. Otherwise the card fails closed and shows
    `data-promote-role-unserved`.
  - Every pre-existing arm passed unedited.
  - Mutants, 6 of 6 red, each on its own arm. The sort mutant SURVIVED the implementer's arms: no arm asserted the
    plain verbs' served order. The main session added an order assertion, and it now fails on the order diff.
  - Gate (rootE): six steps exit 0, 4513 passed, `cross-repo arms that ran = 453, did not run = 0`.
- **#58** `418e647` (`fix/retire-task-kind-display-table`): `REGISTRY` and `hasDisplayRow` are deleted.
  - `taskKindDisplay(kind, byKind)` reads the served declaration from `useTaskKindStore`. Each field is a served
    non-empty string or the default, and the two fall back independently.
  - Six components select `byKind` at their top.
  - `taskKindParity`: five REGISTRY-direction arms out, two served-hints arms in (every kind, plus a DOM arm on
    `pcn_disposition`); the archetype and species arms are rewritten one for one.
  - Mutants, 4 of 5 red on their own arms. Dropping `Object.hasOwn` alone SURVIVES, and is EQUIVALENT: the
    per-field `typeof` guard already sends a builtin key to the default. The comment had claimed `hasOwn` was the
    guard, and now says what actually protects. With both guards removed, the prototype arm fails on
    "constructor: badge undefined".
  - Gate (rootE): six steps exit 0, 4501 passed, `cross-repo arms that ran = 450`. That is 453 − 5 + 2, by design.
  - Main-checkout note: the "two producer roots AGREE" arm fails there only because the siblings are off-pin. It
    passes in rootE.
  - Visible change: `pcn_disposition` reads DISPOSE / "PCN disposition" (the producer's declaration), not QUALIFY /
    "Qualification task".

## Packets

**Read** (placed in cortex `sessions/`, committed with this report):
- lane 01's five answers on the `review_coverage` rename (0.4.73 wire);
- lane 01 → saf, cc cortex: I3, the case key is stamped and `task_id` is not computable.

**Read in invincible-agent:** ca's v0.9.12, where `ReviewCoverage` and `ReviewShapeRow` are typed.

**Placed (uncommitted) in invincible-agent `sessions/`:**
`2026-10-30-packet-to-lane-01-from-cortex-applies-when-acked-the-edit-carrier-is-named-promoted-two-seed-corrections.md`.
It covers:
- `applies_when` acknowledged, and the interim now covers both review cards.
- **The ask:** the gateway names the edit carrier `"promoted"` (`gateway.py:1428-1438`) and checks kind strings at
  5167, 5182 and 5196. Serve a per-verb "carries" field next to `applies_when`.
- **Seed corrections:**
  - `sample_all_up_to` is `same_shape_run`'s parameter, not a row parameter: only `sampleRun` reads it.
  - `same_inherited_crop` has `min_shared: 3`, not `{}`.
- **A fourth `review_shape`:** the task PAYLOAD's (`document` / `empty` / `grant_proposal`) chooses the card in
  `ApprovalTaskCard`. `"document"` is also a seeded item shape. Which axis is it? If it is the task axis, cortex's card
  choice is a case under the config rule and needs served archetypes.
- **saf/i3:** the draft card line is `:125`, not `:43`. Cortex waits for the architect.

## Open items (cortex)

- Read `applies_when` (and "carries", if granted) when served, then delete #56's and #57's interims.
- On 0.4.73:
  - `review_coverage` → items, `review_shape`, `item_kind`, rules from `GET /review-shapes`;
  - `review_task_kind` in place of `StatusBody.review_shape`, all in one commit.
- Card choice by the payload `review_shape` literal, once lane 01 answers which axis it is.
- `capabilities` read, then `AP_GROUP` removed.
- `drop_leaves` labels.
- The draft card's task line (saf/i3), once ruled.

## Image

The three merges each pushed an image. Read by anonymous GHCR manifest HEAD on the bare full sha (token length 76):

| push HEAD | merge | digest |
|---|---|---|
| `dd766f7` | #54 | `sha256:2ab64181180c3a1acf186051980152f2b085a9f1b076cdf179fcfa7a7154ccc5` |
| `9e9ee69` | #55 | `sha256:0b15d9651ff0410da12904de5e11fe9a49896e99ceba111e454ea23ca2738d32` |
| `421fbbe` | #56 | `sha256:e3992d05b5930e459ccf515bba75d0939d200e4c4c560d6db5514b30a1a993d3` **← the last built sha on master** |

Controls:
- `dd9a0c6` returns 200 with `cbebedb6…`, as recorded in the last report.
- `2720fa2` (sessions-only) returns 404, deliberately skipped.
- `2abdec5` returns 404. It is #54's non-HEAD commit, with 0 runs for that sha; the push's run is dd766f7's,
  "Build Containers: push: success".

None of these is rolled: the sandbox is frozen.

#57 and #58 are branches, so they have no image until they merge. This report is a sessions-only push to master and
builds no image. **Pin to `421fbbe`, not to this report's sha.**
