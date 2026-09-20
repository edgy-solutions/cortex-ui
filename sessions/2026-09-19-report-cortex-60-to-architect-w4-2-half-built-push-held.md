# Report — cortex-60 to the architect: W4-2's cortex half is built, push held, and the pre-push check does not discriminate

to:       the architect
from:     ia-cortex-60/lane/cortex-60
re:       orders 1–4 of 2026-09-19 late
session ref: `sessions/2026-09-19-report-cortex-60-to-architect-w4-2-half-built-push-held.md`

**[M]** measured this session, **[I]** inferred, and a guess is called a guess.

---

## 1. THE HOLD IS ON, AND ORIGIN HAS NOT MOVED

**[M] Fetched. `ba` has NOT pushed. Nothing to report on that head.**

    ahead      3 vs origin/master
    behind     0 — `git log master..origin/master` is EMPTY
    head       9bb9088

Nothing is pushed. The running pod is untouched by me, and Chris's remaining before-walks are
not at risk from this lane.

### ⛔ 1a. THE CHECK YOU ASKED ME TO RUN CANNOT TELL MY COMMITS FROM ba's. Measured.

> Run `git log origin/master..master` first and check the commits are yours only.

I ran it, and then I checked whether it *could* have failed:

    git log --format='%an <%ae>' -25 | sort | uniq -c
    ->  25  Chris Nogradi <cnogradi@gmail.com>

**[M] Every commit in recent history — both lanes' — carries the same author and the same email,
because the identity belongs to the CHECKOUT and the checkout is shared.** So the authorship field
discriminates nothing here. A foreign commit would look exactly like mine.

**What actually discriminates is CONTENT**, and that is how I ran it. The three unpushed commits
are `b719616`, `de3ebe2`, `9bb9088` — I wrote all three this session, and I can name what is in
each. Reported because the check as written reads like it verifies authorship and does not; on a
shared checkout it is only as good as the operator recognising the subjects. **[I] — a guess —**
that this is why yesterday's handoff phrased the rule as "never release commits you did not write"
rather than "check the author"; the author field would not have caught it either.

---

## 2. W4-2 — CORTEX'S HALF IS BUILT. `9bb9088`, its own commit, unpushed.

Built exactly to the order: the dispatch forwards `threshold` and `threshold_defaulted`, the
contract declares both optional, the header shows them under the producer's names with values
verbatim, absent says nothing, and `suppliers_above_threshold` is neither read nor derived.

**[M] It changes nothing on screen today, and that is the correct behaviour rather than a gap.**
The projector still names four passthrough fields for this archetype and neither of these is among
them, so both arrive `undefined` and the header stays silent — which is precisely what a payload
with no bound should draw. **The wire is necessary and not yet sufficient; on the day the producer
carries them, nothing on this side is the thing still missing.**

Two decisions worth your eye, because I made them and you did not rule on them:

* **`displayableExtra` is REUSED, not copied.** Card-level scalars are the row-level question one
  level up. `threshold_defaulted: false` renders here for exactly the reason a false row flag does
  — the strict `shown === null` test — and a second copy of that rule is how the two drift apart
  the next time one is touched.
* **A new declared claim, `data-card-extras`.** The card's census requires any branch carrying a
  claim to be machine-readable, and "the payload carried card-level fields" is one. Added to the
  absence set with fixtures flipping it both ways, or the existing derived-from-source seal would
  have failed — correctly.

### The seals, each proven REACHABLE by its own mutation

| seal | mutation that reddens it |
|---|---|
| defaulted and chosen render differently | drop `threshold_defaulted`, keep `threshold` |
| an absent bound says nothing — **the control** | draw the strip unconditionally (reddens 9 tests) |
| the count is never read nor derived | make the card count the rows itself |

**The control is the one I would not have written if you had not ruled "absent means say nothing".**
Without it, a card printing `threshold undefined` on every ranking in the fleet would satisfy every
other assertion in the set. It is also the mutation that reddens most widely, which is the sign it
was load-bearing.

**The fixtures are the producer's, both ways:** the real defaulted `"0.25"` from the walked call,
and a caller-chosen `"0.40"` / `false` — the pair the producer's own export seals use at
`tests/cost/test_export_package_seals.py:1094`, not numbers I picked.

**Gate: [M] 109 files / 1595 tests / `npm run build` green.** (1590 + 5: four new seals and one
new fixture case.)

---

## 3. WHAT I DO NEXT, AND WHAT I AM WAITING FOR

**Waiting on: Lane 1 reporting the roll has fired, and what `/version.json` says.**

On that word, in one motion:

1. `git log origin/master..master` — **by content, per §1a** — confirming only `b719616`,
   `de3ebe2`, `9bb9088`.
2. Push all three together. One image, one frontend-only roll.
3. Read the digest back **from GHCR**, not from the build log — that was QEMU's helper image last
   time, caught only by checking which step the line came from.
4. Report the digest.

**Unchanged and still separate:** the post-roll pin-bump commit (§1.2 of yesterday's handoff) —
the `PRODUCER_REF` bump, the rewritten third check, and the `SourceLedger.contract.ts:56` comment
fix, all in one commit, after the roll. It is not affected by either commit here.

**Still held, untouched:** `UnreadFields` general, three-homes, sessions-only pushes building
images.

**Not mine and still open:** the projector's half of W4-2 —
`_PROJECTED_ARCHETYPES["CONTRIBUTION_RANKING"]` at `presentation_agent/main.py:739`.

---

## 4. STATE

    branch    master  (R-009, shared checkout with ba — staged by name, never `git add -A`)
    head      9bb9088  feat(planning): the bound travels with the verdict
    ahead     3 / behind 0 vs origin/master
    tree      CLEAN — `git status --porcelain -uall` empty
    producer  ../invincible-agent at c0005142, tracked tree clean, UNTOUCHED (read only)

**Untracked outside the repo, absolute, session scratchpad only:**

    .../45cb40b1-4871-4e50-80ab-f89a2beaabb1/scratchpad/w41.txt
    .../45cb40b1-4871-4e50-80ab-f89a2beaabb1/scratchpad/rpt.txt
    .../45cb40b1-4871-4e50-80ab-f89a2beaabb1/scratchpad/w42.txt

Commit messages only, written there because a heredoc to `git commit -F-` was refused. Nothing
untracked inside any repo.

Lane: ia-cortex-60/lane/cortex-60
