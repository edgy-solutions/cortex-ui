# Handoff — cortex-60: SOURCE_LEDGER is built, the parity pin is stale by two rolls

to: ia-cortex-60/lane/cortex-60

Written 2026-09-19. Everything below is measured at the time of writing, not remembered — where
a value came from a pod or a `git` read, that is said.

## State

    local HEAD        a271817   feat(ledger): SOURCE_LEDGER
    origin/master     277d6ee
    unpushed          a271817 ONLY — one commit, fast-forward, no divergence
    suite             1587 passed at --maxWorkers=1, typecheck and bundle green

⛔ **THIS CHECKOUT IS SHARED AND THAT IS NEW.** `277d6ee` — *"chore(sessions): handoff — the M3.3
parity seal…"* — is in my local history and I did not write it. Another lane (ba, on the M3.3
parity work) is committing in this same working directory, and it pushed my `abb3dc1` and
`6c32930` along with its own. Nothing is broken by it and there is no divergence, but **do not
assume `git log` shows only your work**, and check `git status` before `git add -A` — I swept
someone else's untracked packet into a commit earlier today doing exactly that.

## Base sha and pin

    deployed bff / projector   91d8d34e01c5f0a2432e1d4f282db52225e2fc46   (read from the pods)
    deployed cortex-ui         frontend:latest — no sha tag; read /version.json in the pod
    CI PRODUCER_REF            cfa3f0d26aa75b4a203d599b62f4471144294cc6

⛔ **THE PIN IS STALE BY TWO ROLLS.** It was bumped to `cfa3f0d` when that was serving; the fleet
has since gone to `6acdcd4` and now `91d8d34`. The parity seal is therefore measuring a producer
nobody is running.

**Before bumping, do what the pin's own comment says:** read the deployed tag FROM THE POD, check
`git diff <old> <new> -- policy/task_kinds policy/overlays/sample/task_kinds` is empty (if it is
not, the bump can change the seal's result and that is a finding, not a formality), and confirm
`reachable_for` / `ROW_DISPOSITIONS` have not moved. The bump is one line — `PRODUCER_REF` is
declared ONCE at workflow scope and referenced twice; do not reintroduce a second literal.

## What is in flight

**`a271817` is unpushed and is the whole of it.** It is ADR-0055 step 2 — the `SOURCE_LEDGER`
package: contract, card, fixtures, binding, glyph, and the archetype declared at the four sites
the seals named. It is complete and green; it simply has not been pushed.

**22 is waiting on it.** Their `PRESENTATION_CAPABILITIES` row for
`mesh:StatefulSupportResponse → mesh:SourceLedger / SOURCE_LEDGER` is held on `lane/32`, and
their `test_the_two_MIRRORS_agree_FLEET_WIDE` is RED until both halves are on master. That red is
correct: one half existed and the other did not. It turns green on both sides in one step once
`a271817` lands and they push.

## Exact next step

1. **Push `a271817`** — architect's word required; it was not given before this handoff was
   written. Everything else waits on it.
2. **Tell 22 it is on master**, so their row lands and the mirror seal closes.
3. **Bump `PRODUCER_REF` to the deployed sha**, with the three checks above run first, in its own
   commit.

## What is NOT yours

The M3.3 parity seal and its pins are ba's — see `277d6ee`'s handoff in this directory.

The refusal menu and the abstain render (`45d562b`, `1878a96`) are landed on this side and have
**never been seen against a live payload**. When a walk exercises them, the two things to read on
the card are that the source line says *"what this one accepts"* rather than "everything of this
kind", and that `UnreadFields` stays SILENT on it — if it flags a key, the producer is sending
something neither side declared.

The export button stays held until the verb answers 200.

## Read

Read `2026-09-19-dispatch-cortex-60-the-three-safety-rows-on-cortex-menu.md` (Lane 1) — acted on
and closed at `df702ca`. Its persona correction was right and my premise was wrong; the reasoning
is in `frontendCapabilities.ts` beside the field.

Lane: ia-cortex-60/lane/cortex-60
