# Report — overnight: the method block's reader, and a second peer nobody was checking out

Lane: `cortex-ui/master`. Beat: 2026-09-27 overnight.
Order: (1) `readMethod` aligned to ca's packet, sealed against the packet's fixture; (2) two-repo CI
job so the live half of the TS-mirror seal stops skipping; (3) if not done — fallback disclosure
rendering and the picker reading `shared_slots`.

Gate at the end of the beat: **119 test files / 1858 tests passed**, `tsc --noEmit` clean,
`check:transport` clean (9 sites / 7 files), the new `check:seals` clean (9 seal files censused,
122 cross-repo arms ran, 0 skipped), its redproof 12 of 12, `build.yml` parses.

---

## 1. `readMethod` aligned to ca's packet — done, and it was five defects, not one widening

The order reads like a widening: carry four more fields. It was not. Each field had its own way of
being wrong, and three of the five defects were invisible to both fixtures that already existed.

**The zero-bound truthiness trap.** The render edge said `m.bound ? draw : absent`, so a bound of
`0` — a real bound, and the most interesting one — rendered as *"the producer stated none"*. Neither
existing fixture could catch it: one carries `0.25` and one carries `null`, and **both render
correctly under the broken spelling**. The case had to be constructed. This is the recorded
coincidence-defect shape: a bug hidden because two readings agree on ordinary data.

**A tri-state that any coercion destroys.** `bound_defaulted` has three meanings — the producer's
own default, the caller's choice, and *no word either way*. `!!`, `Boolean()` and `?? null` each
collapse the third into one of the first two, which is the difference between "nobody said" and "the
caller chose". Only a real boolean is read as a statement; `"true"`, `1`, `0` and `{}` all read as
not-stated, and the mark is spelled **`not stated`**, deliberately a different word from the
**`absent`** used for a field the producer omitted.

**Absent vs unreadable.** A bound the producer *states* but cortex cannot parse must not render as a
bound that was never stated — that is cortex inventing a producer silence. Hence a cortex-only
`boundUnreadable` field and a third render branch that says the bound is there and that we could not
read it. Nulling it would have been the quiet lie.

**The display type's field spelling is the wire's.** `bound_defaulted`, not `boundDefaulted`,
against this file's own TS habit — because a camelCase rename forces the "which wire fields survive
the reader" seal to carry a hand-written wire→display mapping, and **a hand-written list cannot
notice a field the wire GAINS**. Spelled the wire's way, the census is `keyof WireMethodBlock` with
a compile-time assertion in both directions, and `boundUnreadable` is camelCase on purpose so the
census subtracts exactly the field that is ours.

**Formatting moved to the render edge.** `formatLeaf` is called in `methodSection`, not in
`readMethod`, so `4` stays distinguishable from `"4"` everywhere upstream of the HTML.

**The seal.** ca's executed `model_dump(mode="json")` was lifted out of the packet `.md` into
`src/lib/methodBlockPacketCapture.json`, because a capture in the wrong file type is invisible to a
`*payload*.json` glob — a hazard this lane has already paid for. Four arms tie back to the packet:
one asserts the packet holds exactly one ```json fence and that the extracted file equals it, so the
extraction cannot drift from its source; the rest assert the full field carry with types, that the
two nulls render as two different words, and that an explicit `null` and an absent key are one
state. Twelve further arms cover one case per branch, including the near sides.

**Mutants: 12 of 12 indicted** — but see §4, because the first survey's instrument was broken.

## 2. The two-repo CI job — and the order's target was already satisfied

⛔ **The order says "check out invincible-agent at the pinned producer sha". `build.yml` has done
that since `453e841` (2026-09-15), pinned since `5be2b52`, currently at `1c1005c2…`, with a
HEAD==pin assertion.** So the literal clause was twelve days old when the order arrived.

The order's *purpose* clause is the one that named a real gap: "the live half of the TS-mirror seal
stops skipping." The TS mirror is `src/api/meshSdkParity.test.ts`, and it reads
**`iagent-mesh-sdk`** — a different sibling repo from the producer. The producer checkout does
nothing for it. Confirmed from the last green run: `git show e52c979:.github/workflows/build.yml |
grep -c iagent-mesh-sdk` is **0**, so three of that seal's arms skipped on every CI build since it
landed. Same silent-coverage failure the producer checkout was added to fix, one repo over.

What was added to the `frontend` job:

- **The pin is read, not restated.** A step reads `provenance.sdk_sha` out of
  `src/api/meshSdkParity.json` into a step output. That file's own comment warns that a second
  literal is how the two drift; a sha typed into the workflow as well would let the extracted mirror
  and the checked-out SDK disagree while both files looked authoritative. An absent key reads as the
  string `"null"` through `jq -r`, which `actions/checkout` would take for a ref, so that is named
  as its own failure.
- **The checkout, then the same HEAD==pin assertion the producer step carries**, for the same
  reason: an empty ref makes checkout fall silently to the default branch, every arm still runs, the
  suite still passes, and the mirror is measured against models the fixture was not extracted from.
- **And the files the seal opens must be there.** A present-but-reorganised SDK passes the sha
  assertion and still skips every arm, because the gate is `existsSync(iagent_mesh/models.py)` and
  not "the directory exists". The paths come from the fixture's own `provenance.sources`, so an
  upstream rename lands as a red on the pin step instead of as three quiet skips. The source list is
  **counted before it is walked** — an empty list would make the loop a no-op that prints nothing and
  passes.

**⛔ And a skipped arm is still green, so the workflow now asks whether the arms RAN.**
`scripts/check-cross-repo-seals.mjs` reads a vitest JSON report and fails if any arm in any
cross-repo seal file did not run, if a censused file is missing from the report, if the report is
empty, or if the census is empty. **The population is censused, not listed** — keyed on the path
*reach* (`"../../../` or `CANDIDATE_ROOTS`), not on any peer's NAME, because a dozen files mention
`invincible-agent` inside a mesh URI and none of them reads a peer; a tenth seal added next month is
in scope by default. `npm run test` now writes the report alongside its console output, so one suite
run feeds both. `scripts/redproof-cross-repo-seals.mjs` doctors the REPORT — the peer checkouts are
read-only to this lane — asserts the clean case FIRST so a guard that rejects everything cannot
score a perfect redproof, and matches every rejection against the message it must carry.

**Deliberately NOT in `npm run build`.** A developer without the peers checked out must still be
able to build; that is the entire reason those arms are `skipIf`-gated. The guard is a CI step,
where the checkouts are guaranteed.

### ⛔ The probe that earned its keep: `fetch-depth`

**The local peers are not standing on the pins.** `../invincible-agent` is at `6cd4c14a…` against a
pin of `1c1005c2…`; `../iagent-mesh-sdk` is at `7e429d52…` against a pin of `b0abd3b7…`. So the
local green measured different peer states than CI will. The producer half needs no probe — CI ran
green on `e52c979` at 2026-09-28T02:13Z with `1c1005c2` live, which proves that half at its pin. The
SDK half had never run in CI at all.

So it was measured rather than assumed. A read-only `git diff` of the two seal sources between pin
and local HEAD showed **`models.py` gained 17 lines after the pin** — the local pass was the weaker
evidence, against a newer SDK. The seal was then pointed at the pinned sources and the suite run.

**It went red — and the red was the probe's, which is the point of checking the reason.** The arm
"no released version contains these FIELDS" shells out to `git describe --tags` and then
`git show <newest tag>:<file>`; my first probe used a plain copy of the two files, which is not a git
repository. That is the recorded hazard in its positive direction: a red for the wrong reason
measures nothing, and reporting "the pin is red" would have been wrong.

**But it exposed a real one.** That arm needs *tags and a tagged tree inside the checkout*, and
`actions/checkout@v4` defaults to a shallow fetch with no tags. The arm would have gone RED in CI
the moment it stopped skipping — trading a silent skip for a red that looks like a parity failure
and is really a checkout depth. The SDK checkout therefore carries **`fetch-depth: 0`**, with the
measurement written beside it. The producer checkout does not need it: that seal only reads files.

Re-probed properly — a scratchpad clone standing on `b0abd3b7` with tags, the shared checkout
verified unmoved at `7e429d52` before and after — **the suite is 119 files / 1858 tests green
against the pin CI will use.** The mirror is proven at its pin before CI sees it.

Incidentally, the redirect dropped the census from 9 files / 122 arms to 8 / 101, which is the
census demonstrating that it keys on the reach and not on a name.

## 3. Verified, not redone

- `b176a06` — fallback disclosure in the body. Live at HEAD: `AnswerBody.tsx` imports
  `readFallbackDisclosure` / `splitFallbackComponents` from `src/lib/fallbackDisclosure.ts`.
- `15552d0` — the picker reading `shared_slots`. Live at HEAD: `DockBar.tsx` calls
  `partitionTemplates`, and `templateCatalog.ts` has `needsBinding` keyed on
  `row.sharedSlots.length > 0`.

Both carry their own arms and both are inside the green suite above.

## 4. ⛔ The instrument broke before the code did

The first mutant survey reported **M7 SURVIVED**. It had not. The harness called a baseline GREEN on
`vitest run -t "<name>"` exiting 0, and **a `-t` filter that matches no test exits 0** and prints
"56 skipped". M7's filter was `"A BLANK bound is absent"` against an arm titled `"a BLANK bound is
absent…"`; `-t` is case-sensitive, so nothing ran, the baseline read green, and the mutant "survived"
while the code was never exercised.

This is the exact inverse of the hazard already written down in this lane, where a filter matching
nothing exits 1 and reads like an indictment. **The exit code is not the instrument in either
direction. A pass COUNT is.** The harness was rewritten to parse `Tests (\d+) passed` /
`(\d+) failed`, report `NO-MATCH` when nothing ran, and **refuse to fire over a non-matched
baseline**. An M0 control carrying the mistyped filter correctly reported NO-MATCH and refused to
fire. Refired: baseline PASS (ran=1), **M7 INDICTED**; 12 of 12.

The lesson is written into the header of `check-cross-repo-seals.mjs`, because that guard's whole
subject is arms that are green without having run.

## 5. Answered upstream while this was being built

The packet left open whether the `bound` / `bound_defaulted` XOR was enforced anywhere. **It is now:
the mesh SDK gained a `model_validator(mode="after")` requiring `(bound is None) ==
(bound_defaulted is None)`, ruled 2026-09-27**, reconciling the model with the fleet producer that
was already checking it. Found by diffing the pin against the local checkout while chasing the
`fetch-depth` question — not by asking.

This does **not** make the reader's branches dead, and the reader was left reading the two
independently on purpose: the combinations the validator forbids are exactly what an off-contract or
older producer emits, and a reader that assumed the pair agreed would draw a confident
half-statement instead of showing the halves. The branch arms covering those combinations are claims
about the reader, not about what the wire may carry. Recorded in `cardExport.ts` beside the
tri-state, so it is not re-derived.

⚠ **The mirror does not know about the validator yet** — `meshSdkParity.json` pins `b0abd3b7`,
which predates it. Whoever bumps that pin re-extracts, and *that* is when the XOR can become a seal
here instead of a sentence.

## 6. Amended

`src/components/registry/projectedTupleParity.test.ts` said *"Widening `MethodBlock` here and
widening that allowlist there are two halves of one ruling; no order covers either."* Half of that
went stale today: an order did cover the reader half, and it is done. The paragraph now says which
half moved and which is still open — whether a method block's `inputs` may restate a fact the rows
already carry, which needs a ruling and not a reader, and rulings originate in `invincible-agent`.
The dated session report that quotes the old sentence was left as written; it was true that day.

## 7. Still open, for whoever picks this up

- **For the architect**, unchanged from `e52c979`: should a turn that names a drawn answer and
  carries the reader's prose in `message` count as answering it — a third clause in
  `_answers_something` — or should cortex stop posting a claim it knows is refused?
- **Producer order to draft**: `sub_query` **and** `accepted_slots` on `_render_refusal_menu` /
  `_render_abstain_menu`, as a pair.
- Whether `completeness` / `total_available` ever reach the planning envelope.
- Ruling 5's consumer half: `row.method` → `method_label` in `CompetingMeasures`. Ruling 3 needs
  arch.
- `helm/cortex-ui/values.yaml:20` still defaults to `tag: latest` with **no `required` guard**, so a
  never-built tag renders perfectly and fails at the kubelet on a release Helm already called a
  success. `helm/` must stay off the build-gate allowlist.
- The next pin bump of `meshSdkParity.json` should re-extract and pick up the XOR validator (§5).

## Files

```
src/lib/cardExport.ts                              the reader, the render edge, the tri-state notes
src/lib/cardExport.fixture.ts                      LOT4_METHOD_PRESENT, with the sentence bound moved
src/lib/cardExport.test.tsx                        796 -> ~1090 lines; 16 new arms
src/lib/methodBlockPacketCapture.json              ca's executed model_dump, in a glob-visible type
scripts/check-cross-repo-seals.mjs                 did the cross-repo arms RUN, not merely pass
scripts/redproof-cross-repo-seals.mjs              12 checks; clean case first
.github/workflows/build.yml                        the SDK peer, fetch-depth: 0, the guard steps
package.json                                       test writes a report; check:seals(+:redproof)
src/components/registry/projectedTupleParity.test.ts   the stale half of one paragraph
```
