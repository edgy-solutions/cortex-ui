# Handoff — cortex-ui-ba, the M3.3 task-kind parity seal

to: whoever picks up the parity seal / M3.3 cortex side

## STATE — green, and the gate is not waiting on cortex

    base sha        6c32930  (cortex-ui master, pushed)
    producer pin    cfa3f0d26aa75b4a203d599b62f4471144294cc6  — build.yml PRODUCER_REF
    seal            src/lib/taskKindParity.test.tsx — 21 local, 28 in CI, green
    gate            GREEN on the pinned state. `ca` is clear to cut over.

**The producer pin is declared ONCE, in `build.yml` `PRODUCER_REF`, and read from two places —
the checkout `ref` and the env the seal prints as its baseline. Bump it there and nowhere else.**
Two literals that must agree with nothing checking they do is how a seal measures one producer
and reports another.

## WHAT THE SEAL ASSERTS, in four arms that are not the same assertion

    floor                    non-empty composed set from seed AND overlay, real fields.
                             A red floor VOIDS the seal — it does not pass it.
    REGISTRY -> declarations every hardcoded kind is declared, render hints match.
                             `pcn_disposition` badge/title drift is pinned EXACT.
    declarations -> REGISTRY the declared-but-unregistered set is PINNED, with a
                             staleness control. Dies at cutover.
    THE WIRE                 every declared APPROVAL_TASK species renders its declared
                             verbs, in order, seeded through `useTaskKindStore` and
                             rendered with NO `declaration` prop.

**The last arm is the one that survives the cutover.** The first three measure the retirement
distance of a table that is being deleted. A prop-fed assertion tests a capability; that one
tests the connection — which is the wire the earlier arm passed over while nothing supplied it.

## THE PIN

`safety_redraft` is in `KNOWN_UNREGISTERED`, with the reasoning in place. It is a
**classification, not a waiver**: since `e837239` the card consults the served menu via
`useTaskKindStore`, so it renders its declared verbs with no table entry, and a REGISTRY row
would feed the table M3.3 deletes. `pcn_disposition`'s badge/title drift is pinned as an exact
expectation — **not `it.fails`**, because an xfail absorbs any second drift and never reports it.

**Both pins have staleness controls.** A pin that stops being a real gap goes red. Do not widen
either to make something green; that is the move that destroys the finding.

## IN FLIGHT — not mine, do not assume it landed

- **`ca`'s M3.3 cutover** is parked on `lane/ca-m33-cutover`, awaiting one seal change from
  Lane 1 (the unconfigured-overlay refusal), then merges. `_VERBS_BY_KIND` is **still standing**
  in `human_tasks.py` — verified, 2 occurrences. On merge it goes with the two runbook sites and
  the interval banner **in one act**.
- **Working tree is DIRTY WITH ANOTHER LANE'S WORK** at the time of writing:
  `ArchetypeGlyph.tsx`, `SemanticInterpreter.tsx`, `answerDisplay.ts`, `assembleCapabilities.ts`,
  untracked `src/components/ledger/`. **Not mine. Stage by explicit path, never `-A`.** Two lanes
  share this checkout and uncommitted work here has been discarded twice.
- **The `flags`/`excluded` narrowing waits on the consumer reading `disposal`** — not on the
  producer's word that it emits it. `readExclusions` required `verb` while the producer emitted
  `uri` and silently discarded every arity exclusion (`e74c88a`); both halves of that surface
  have now lied once each.

## EXACT NEXT STEP

**Nothing on the cortex side is required for M3.3 to close.** The next action is `ca`'s, not
this lane's.

When the cutover merges, the work here is **one edit**: delete the two REGISTRY-direction
`describe` blocks and the `KNOWN_UNREGISTERED` list from `taskKindParity.test.tsx`. They assert
a table that no longer exists. **Keep the floor, keep THE WIRE arm, keep the seal-ran guard.**
Then bump `PRODUCER_REF` to the sha the cutover rolled, measured from the pod rather than from a
branch.

Do not delete anything before the merge. **R-054: choice removed from code before its table
composes is choice DELETED, and it fails in the PERMISSIVE direction — and permissive states
pass every test written to catch broken ones.** The seal is the assertion that the new layer is
live before the old one is removed.

## TWO THINGS THAT WILL BITE YOU

**A mutation that applies to nothing is a VOID experiment, not a negative result.** Cutting the
card's store read was attempted against `fromStore`; the variable is `fromKinds`. The edit
applied to nothing, the run came back green, and that green read as "the seal doesn't bite".
Confirm the mutation LANDED before reading the colour — `if (s === before) throw`. Recorded as
R-043 instance two in `docs/rulings/README.md`.

**The seal asserts that it RAN, and that guard is only safe because the checkout resolver sits
under it.** It had never run in CI — not once — until `453e841`; `build.yml` checked out one repo
and all 28 assertions silently skipped on every green build. The resolver tries
`invincible-agent` then `ia-01` and **errors loudly when two resolve and disagree**, because a
silent pick is a confident answer about the wrong tree. A red meaning *"wrong directory"* teaches
readers to wave through red, and that immunity is what hides the one real failure.

## READ THESE FIRST

    docs/rulings/README.md                    R-039, R-043, and the wave-through-red note.
                                              A MIRROR — the register of record is
                                              invincible-agent/docs/rulings/. A ruling
                                              originating in cortex-ui is in the wrong place.
    src/lib/taskKindParity.test.tsx           the seal; every arm carries its own why.
    src/lib/taskDeclaration.ts                why the two orders differ, and why a MISSING
                                              declaration is not `declared: false`.
    src/store/useTaskKindStore.ts             why a store and not a per-row field.

read-by: cortex-ui-ba 2026-09-19

Lane: cortex-ui/master
