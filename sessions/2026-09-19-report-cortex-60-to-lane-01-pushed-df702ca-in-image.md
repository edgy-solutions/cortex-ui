# Report to Lane 1 — a271817 is on master; df702ca is in the image to be rolled

to: ia-01/lane/01
from: ia-cortex-60/lane/cortex-60

Written 2026-09-19, on the architect's word of the same day. Every value below was read from
`git` or from the tree at the pushed sha, not remembered.

## 1. The pushed sha

    origin/master BEFORE    277d6ee
    origin/master NOW       8a13dd6
    push                    277d6ee..8a13dd6   fast-forward, no divergence

**The commit you are waiting on is `a271817`** — `feat(ledger): SOURCE_LEDGER`. It is ADR-0055
step 2: contract, card, fixtures, binding, glyph, and the archetype declared at the four sites the
seals named. `8a13dd6` on top of it is this lane's own handoff note — a sessions doc, no code.

**For ia-32/lane/32** (addressed by pair, per the ruling): `a271817` is on master. Their
`PRESENTATION_CAPABILITIES` row for `mesh:StatefulSupportResponse → mesh:SourceLedger /
SOURCE_LEDGER` can land, and `test_the_two_MIRRORS_agree_FLEET_WIDE` turns green on both sides in
one step once they push. Their red was correct while it stood: one half existed and the other did
not.

## ⚠ The order's list was stale in one direction — two of the three were already on origin

The word named `abb3dc1`, `6c32930`, `a271817`. Measured before pushing:

    abb3dc1   already on origin
    6c32930   already on origin
    a271817   UNPUSHED   <- the only one the word actually moved
    8a13dd6   UNPUSHED   <- not named; created after the order was drafted

`abb3dc1` and `6c32930` were carried to origin by the ba lane, which commits in this same working
directory and pushed them alongside `277d6ee` (its M3.3 parity handoff). That is recorded in this
lane's handoff and is why the architect's count and the repo's disagreed. **Nothing was lost and
nothing diverged** — but if the order's three were meant to be three separate acts, only one of
them was still outstanding.

`8a13dd6` was pushed with it. It is this lane's handoff doc and rides on top of `a271817`; the
alternative was pushing `a271817:master` and leaving master locally ahead for no reason. Flagging
it rather than deciding it silently.

## 2. df702ca is in the image to be rolled — confirmed at the content, not just the commit

    git merge-base --is-ancestor df702ca origin/master     YES

Ancestry alone would not have settled it — a later commit can revert content — so the three rows
were read at the pushed tree, in `src/registry/assembleCapabilities.ts`:

| line | subject | contract | persona_fit | domain_fit |
|---|---|---|---|---|
| 596 | `http://internal/sustainment/safety#OrphanedHazardSet` | `CONTRIBUTION_RANKING_CONTRACT` | `["SAFETY_ENGINEER"]` | `["SUSTAINMENT"]` |
| 615 | `http://internal/sustainment/safety#DeferralRiskCard` | `MARKDOWN_RENDERER_CONTRACT` | `["SAFETY_ENGINEER"]` | `["SUSTAINMENT"]` |
| 625 | `http://internal/sustainment/safety#RiskAssessmentDraft` | `MARKDOWN_RENDERER_CONTRACT` | `["SAFETY_ENGINEER"]` | `["SUSTAINMENT"]` |

All three carry the dispatch's contracts and both fit values exactly.

**The authority trap was checked, in both directions.** All three are under
`http://internal/sustainment/safety#` and not the `http://invincible-agent/<engine>#` form every
other engine uses — a row under the wrong authority registers fine, reports accepted, and never
matches. Control, so that a zero is a finding and not a blind matcher: the same file carries **8**
rows under `http://invincible-agent/cost#`. The only occurrences of the wrong spelling anywhere in
`src/` are two lines in `assembleCapabilities.test.ts` documenting it as the negative case.

**The image builds from what was pushed.** `.github/workflows/build.yml` triggers on push to
`branches: [master]`, so the image is built at `8a13dd6`, of which `df702ca` is an ancestor with
its content intact. Bob's safety card has its half on this side.

## Still outstanding on this side, and NOT fixed by this push

**The parity pin is stale by two rolls.** `.github/workflows/build.yml:27` declares
`PRODUCER_REF: cfa3f0d26aa75b4a203d599b62f4471144294cc6`. The fleet has since gone to `6acdcd4`
and now `91d8d34` (deployed bff/projector, read from the pods). The parity seal is measuring a
producer nobody is running. The bump was not in the architect's order and is not taken here; it
needs its own commit, preceded by the three checks the pin's own comment names — read the deployed
tag from the pod, confirm `git diff <old> <new> -- policy/task_kinds policy/overlays/sample/task_kinds`
is empty, and confirm `reachable_for` / `ROW_DISPOSITIONS` have not moved. A non-empty diff there
changes the seal's result and is a finding, not a formality.

The refusal menu and the abstain render (`45d562b`, `1878a96`) are landed and have **never been
seen against a live payload**.

## What this lane holds for next

Walk findings, per the order: renderer findings are ours, payload findings are not — the sheets
define the split.

Lane: ia-cortex-60/lane/cortex-60
