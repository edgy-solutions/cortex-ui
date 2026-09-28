# Report — roll #6's digest, both rulings closed, and the producer answered cortex's question behind two green tripwires

from:  ia-cortex-60/lane/cortex-60 — cortex-ui :: master, 2026-09-27
for:   the architect (cc: ia-01/lane/01)
re:    the loop-closing instruction of 2026-09-27, plus rulings 1 and 2 of the same day

---

## 0. THE FIVE-LINE VERSION

1. **Roll #6's frontend digest is `sha256:692954e9…`**, read back from GHCR's registry API for the
   push of `e52c979..a2e7701`, proven as a manifest list with both arches and with three negative
   controls. Packeted to Lane 1 as `1ea61cb`.
2. **Ruling 1 is `b7e365e`** — `tag: latest` gone, both pin keys `required`. Two things the ruling
   did not predict: nothing in this repo had ever *rendered* this chart, and it cannot render with
   its own values at all.
3. **Ruling 2 is `3636171`** — and the measurement that matters is that obeying it changed the
   snapshot by **one line**, because a fields-only mirror cannot see a rule. The mirror now captures
   validators. The proof of those arms caught two holes in itself before it was believed.
4. **The producer answered cortex's open question the same day (`d3944da8`) and both of cortex's
   tripwires for it stayed GREEN.** One was pinned to cortex's own copy of the producer's rule; the
   other censused an expression one address below where the change landed. Cortex was predicting
   `refused` for turns the server now keeps.
5. **v0.9.4 was cut four hours after ruling 2's premise was written down, and expired it.** The
   pin is now computed from the bytes rather than justified in prose, and the seal arm that reported
   this has been replaced by its own opposite.

Three commits are local and unpushed: `1ea61cb`, `b7e365e`, `3636171`, plus two uncommitted
working sets described in §6 and §7. **`git push` is not in this lane's permissions.**

---

## 1. THE DIGEST — the loop the instruction closed

> *"Tell cortex 'pushed; read the digest and packet Lane 1,' and that's the loop closed."*

```
tag     a2e7701fe3a98989365b6f751414b3aaaaa8b7e7
digest  sha256:692954e9aead0627303ef86199d3f4fff055452a1d022ef4695925b02c16a151
run     36373363744   (three commits, e52c979..a2e7701, one image)
```

Read from GHCR's **registry API** with an anonymous pull token, not from the build log, and verified
to be the OCI **image index** carrying `linux/amd64` and `linux/arm64` — the second is what the
fleet's nodes need and a single-arch manifest would have satisfied a naive digest read.

**Why the instrument was proven before it was believed.** Since `1e31d92` a sessions-only or
docs-only push builds no image, so a 404 from GHCR is now ambiguous **four** ways: not built yet,
deliberately skipped by the gate, no anonymous pull access, or a tag spelled short. All four return
the same message. Three queries on one token separated them, and the run's **step list** — six image
steps present or skipped — is the strong instrument, not the tag.

Full packet, with the controls: `sessions/2026-09-27-packet-to-lane-1-digest-692954e9-for-roll-6-and-the-sdk-arms-ran-in-ci.md`.

Lane 1 pins `sha256:692954e9…` as roll #6's frontend.

---

## 2. RULING 1 — the chart (`b7e365e`)

> *"`helm/cortex-ui/values.yaml:20` gets the doc-tools treatment: a digest path with a required
> guard, `tag: latest` removed as a default."*

Done. Both keys default to `""`, the template refuses an absent pin with `required`, and the guard
**enumerates the accepted forms** — a digest, a full 40-char sha, or a release version — so `nightly`
and `demo-week` are refused as a consequence without anyone having had to think of them. Both keys
set is refused rather than resolved in the digest's favour, because a file carrying a digest next to
`tag: latest` reads as though the tag is what ships. Chart `0.1.0 → 0.2.0`: removing a default is a
breaking values change, and the published `0.1.0` would otherwise remain the one carrying `latest`.

### Two findings the ruling did not predict

**(a) Nothing in this repo had ever rendered this chart.** chart-releaser *packages* it, and
`helm package` does not template. There was no place for an objection to be heard, which is why the
default survived being written down as a hazard in CLAUDE.md. `helm-release.yml` now runs the
redproof before chart-releaser — **the first render of `helm/cortex-ui` in CI.**

**(b) The chart cannot render with its own values at all.** `templates/configmap.yaml:10` reads
`.Values.invincibleAgent.*`, which `values.yaml` does not define, so a bare render dies on a nil
pointer before it ever reaches the image. That ConfigMap is consumed by nothing in this chart.
**Left alone deliberately** — deleting a ConfigMap from a deploy chart is not a pin change — which is
why the redproof passes those values in and why every refusal arm asserts it did *not* fail for that
reason. It wants its own decision; see §8.

`scripts/redproof-chart-image-pin.mjs`: 4 accepted + 12 refused forms, clean case first per arm,
asserted on the exact rendered reference. Three mutants, three distinct reds — including the digest
separator `@` changed to `:`, which renders fine and exits 0 and was caught **only** by the
accepted-side assertion. An exit-code-only proof would have missed it.

---

## 3. RULING 2 — the mirror (`3636171`), and what obeying it measured

> *"Bump the SDK mirror pin past `7e429d5` so the XOR validator is what the mirror mirrors; a pin
> that predates the rule it mirrors is the stale-sha defect again."*

**Bumping the pin changed the snapshot by one line.** The sha. Because until that day the parity
snapshot carried fields and, by an explicit decision in the extractor's own header, *not* validators
— so a fields-only mirror cannot see a rule, and "the XOR validator is what the mirror mirrors" was
satisfiable by a diff of one line with nothing gained for the thing it was for. Compliance with the
sentence, nothing for its purpose.

So the extractor now captures validators (decorator, kind, and the whole block so drift in the
**condition** is visible and not just drift in the name), and new arms read them. Five validators
across the mirrored classes; keying on `field_validator` alone would have taken 1 of 7.

### The proof caught two holes in itself, in this order

**(a) My scoring could report a mutant RED whose arm had stayed green.** The matcher fell back to
`stdout.includes("XOR")`, and the raw log carries the describe block's own title. A mutant whose XOR
arm never reddened was printed as "RED as required". Scoring is now on the **failed arm's name**
only — never the exit code (a filtered vitest run that matches nothing exits 0 and prints
"N skipped") and never the log.

**(b) With the scoring fixed, the XOR arm turned out to accept a commented-out raise.** The mutant
`pass  # was: raise ValueError` leaves the substring `raise ValueError` in place, and the arm
asserted the substring. A rule that had stopped forbidding anything passed. The arm is now anchored
to a line that *starts* with the raise (`/^\s*raise ValueError/m`), and the mutant was split into
"commented out" and "removed outright" — the commented-out case went from 1 failing arm to 2.

A control that can pass under the drift it names is not a control. The instrument was promoted into
the repo as `npm run check:parity:redproof` rather than run once, because nothing else covered those
arms.

**(c) And `tsc`, not vitest, found the shape.** vitest does not typecheck, so only `tsc --noEmit`
could see that the extractor's hand-written `.d.mts` still described a fields-only snapshot.

### The staleness measurement, for the record

`git branch -r --contains` answers from `refs/remotes` — a **cached** claim about the remote, stale
in both directions. Measured inside one session: `5ef95b6` was reported by *no* remote branch, and
twelve minutes later by `origin/lane/ca`, because the SDK lane pushed in between. The same local
command gave opposite answers about the same sha. The extractor's `--write` guard therefore reads
tips from `ls-remote` and accepts only a sha that is an ancestor of a tip the remote is serving *now*.
Nothing fetches: the SDK checkout belongs to another lane.

---

## 4. THE FINDING THAT MATTERS MOST — the producer answered, behind two green tripwires

`invincible-agent` `d3944da8` (2026-09-27) **widened** the lineage rule, answering cortex's own open
question from `e52c979` — and with neither of the two options cortex had framed.

The rule moved out of the handler to its own address, `src/iagent_pure/lineage_claim.py`, whose
docstring says why: *"with a rule inlined in a handler, a seal can only MIRROR it, and a mirror is
not a seal."* Prose naming an ask **is** honoured now, provided the graph vouches that the ask is
this caller's; the pre-resolved route keeps the narrow predicate.

### Both of cortex's tripwires for that ruling stayed GREEN

**(a) `useInterviewAgent.test.ts`'s composer arm promised in prose to "go RED the day it is ruled
either way".** It was ruled. It did not go red — because it asserted against `lineageClaimVerdict`,
which is **cortex's own copy of the producer's rule**. On the day the producer moved, the arm
compared the mirror against itself and passed. *A tripwire pinned to a mirror cannot report that the
mirror is stale.* An arm that means to hold someone else's decision has to read **their** artifact.

**(b) `lineageHonoured.test.ts`'s census arm explicitly anticipated "a THIRD way to satisfy the
guard appearing upstream" — and passed correctly.** The third way was added one level *up*, as a
separate predicate; `_answers_something` kept exactly its two clauses. *Mount on the population, not
the site you read.*

What reddened were the arms reading the peer's source **live**. That is the whole difference.

### What cortex had wrong, and what was changed

`lineageClaimVerdict` was predicting `refused` for turns the server now keeps. It gained a fourth
verdict, `ownership_decides`, which **names the decider** rather than guessing: the widened arm turns
on a server-side graph read (`_artifact_is_the_callers`) that a client genuinely cannot perform.
Collapsing it to `honoured` would promise an arrow the graph can refuse; collapsing it to `refused`
restores the exact defect. *"Undecided" is a shrug; "the graph decides" is an assignment.*

The seal was re-aimed at the rule's new single address (194 → ~330 lines, 22 arms), and the arm that
matters most to cortex was added: **the route gate cannot express the wider rule**, which is cortex's
real exposure. The stayed-green finding is recorded in the arm where it was learned, not only here.

20 mutants across 9 live arms establish predicate discrimination. Wiring is proven separately by the
real red observed today plus `check:seals` (125 → 134 arms, all ran).

### For upstream

- Cortex's `e52c979` question **is answered** by `d3944da8`. Nothing further is needed from us.
- `lineage_claim.py` names an **unmeasured race** on the answering arm — it returns before the graph
  read. Cortex's own pending-row ordering seal is adjacent to exactly that window. Flagging, not
  claiming.

---

## 5. v0.9.4 — ruling 2's premise expired in under four hours, in cortex's favour

Within an hour of ruling 2 landing, the seal arm *"no released version contains these FIELDS, which
is why it pins a SHA"* went **red**. Correctly: the SDK cut **v0.9.4**
(`c75587e96bbe9d93c192bd0dda2464c205001d51`, 2026-09-27 23:20:34), which carries every mirrored field
and the `bound`/`bound_defaulted` XOR. Its own failure message said what to do.

Measured before acting:

| question | answer |
|---|---|
| are the on-disk sources the release's bytes? | **identical**, both files, by hash |
| is the tag served by origin? | `refs/tags/v0.9.4` → `c75587e9…`, and it peels to a commit |
| where does the old pin sit? | `5ef95b6` **is** an ancestor of v0.9.4 |
| where does the checkout's HEAD sit? | `ed74f1f` is **not** — a naive re-extract would pin an unreleased commit again |

**The real lesson is about the fixture, not the tag.** The reason to pin a sha lived in
`meshSdkParity.json` as a *sentence*: "UNRELEASED — the newest tag (v0.9.3) contains neither
MethodBlock nor completeness … so a SHA is the only honest pin." True when typed, false four hours
later, and **a justification in prose does not expire when its premise does** — it just keeps reading
as current. That sentence was the standing reason the mirror pinned a commit on a lane branch, which
is a ref that can be rebased or deleted, instead of a tag anyone can fetch.

So `sdk_release` is now **computed** (`pinFor` in the extractor): the newest tag whose blobs for the
mirrored sources are byte-identical to what was just read off the disk wins, and the pin records that
tag with its **peeled commit**. Identity is on the content, not on ancestry — "HEAD is a descendant
of v0.9.4" would not say the files match. If no tag matches, the fallback message names which tag was
newest and how many sources it failed, so a sha pin carries its own reason rather than inheriting
last month's.

Re-extracted: `lane/ca @ 5ef95b6` → **`v0.9.4 @ c75587e9`**, and the diff is **three lines of
provenance only** — every class and field byte-identical, which is the honest outcome.

The expired arm was replaced by **its own opposite**, on the same three subjects so the reversal is
legible: `MethodBlock`'s fields and `EnumerateInstancesResponse.completeness` / `total_available`,
asserted **present** in the pinned release. Its positive control is tied to the population — the
census must visit *every* field the snapshot declares — after a first draft guessed
`toBeGreaterThan(20)` and went red at 15. A threshold picked without measuring can only fail loudly
once and then sit there passing while the real count halves.

### The pin arm has a branch no fixture can reach, and the proof reaches it

The invariant has two branches: the pin is a release whose blobs are the extracted bytes, **or** it
is a sha whose recorded reason names the release it could not use. Only the first runs against the
real checkout. So the redproof drives the far one from this side, via `provenance.sources` — the
fixture's own claim about which files it mirrors.

**And the first version of those two mutants was scored RED while reaching nothing.** They added a
path absent from every release; the arm reads each source off the **disk** first, so that path did
not exist on disk either and the read threw `ENOENT`. Arm red, branch never entered — *a mutant
standing in for the easy variant of its own defect.* Two consequences, both now in the repo:

- a mutant may name the **message** it must trip, checked on a run filtered to that one arm, because
  with several arms red an `AssertionError` cannot be attributed. Every mutant in the file now names
  one.
- the far-branch lever is **computed** from the checkout — a path on disk that is absent from the
  newest release — and if none qualifies the cases print **UNBUILT** and count *against* the proof. A
  mutant that was never fired proves nothing, and silently skipping it is how a redproof stops being
  one.

A third measurement, worth its own line: the filtered run initially reported **six** failing arms.
Under `shell: true` an unquoted `-t` pattern with spaces splits into extra positional arguments,
which vitest reads as more **file** filters. The pattern is now passed as a single quoted argument.

**And scoring on the reason immediately indicted itself twice more**, which is the argument for it:

- the matcher read `AssertionError:` only, so the mutant that points the pin back at **v0.9.3** was
  scored **NOT RED** while the arm was behaving exactly as designed — it reddens by the extractor
  *refusing* a ref where the mirrored classes are not declared, which is a **throw**, not an
  assertion. An arm that reddens by refusing is not a lesser red, and a matcher that understands
  only assertions quietly turns every refusing arm into an unproven one.
- that case therefore never reached the field census at all, so it **split in two**: the refusal, and
  the same pin narrowed to the one class v0.9.3 does declare —
  `EnumerateInstancesResponse`, which carries `instances` and `scoped_by` and **not** `completeness`
  or `total_available`. Two of the three subjects the expired arm named by hand. Firing only the
  refusing case would have left the census itself unexercised.

**Then the split case failed too, and the third time the fault was in the seal, not the proof.** The
narrowed v0.9.3 mutant reddened the right arm on the right assertion and reported:

    expected [ …(2) ] to deeply equal []

Two missing fields, **neither of them named** — vitest abbreviates the value, and `expect(missing)`
carried no message. So the line could not be told apart from any other `toEqual([])` in the file, by
the redproof or by a human reading CI. That is a real defect in the seal: a red that does not say
`EnumerateInstancesResponse.completeness` cannot distinguish *a release genuinely lacks the field*
from *the snapshot has a typo*. The assertion now names its subjects, so the red is attributable:

    expect(missing, `fields the pinned ref ${ref} does not carry: ${missing.join(", ")}`).toEqual([])

Worth being explicit that this mutant is **coarse**: narrowing `classes` to one entry reddens fifteen
arms, because most of the file is about the other three classes. That is not a problem for the claim —
the filtered run attributes the red to the one arm — but it is why the filtered run exists at all.

**And the lever could not say what kind of divergence it had found — so I guessed, and guessed wrong.**
The computed path came back as `iagent_mesh/write_results.py`, and I wrote down that it was divergent
only because the SDK's working tree is modified there: a lever that vanishes the moment another lane
commits or discards, taking both far-branch cases to UNBUILT on a day when nothing about cortex
changed. The ordering fix went in on that reasoning — `${tag}..HEAD` first, working tree as fallback,
**and print which kind it used.**

The print immediately contradicted the diagnosis. It reads `[committed]`, and the direct check agrees:

    $ git -C ../iagent-mesh-sdk diff --name-only v0.9.4..HEAD | grep -n write_results
    6:iagent_mesh/write_results.py
    $ git -C ../iagent-mesh-sdk status --short
     M .claude/settings.local.json

The path is a **committed** divergence, and the SDK's only dirty file is a settings file the mirror
never opens. `git diff --name-only <tag>` compares the *working tree* against the tag, which includes
committed changes — so the original query was never dirty-state-dependent *for this path*, and it also
could not have told me if it had been. **The fragility was inferred from an instrument that cannot
distinguish the two cases, which is exactly the defect class this session kept finding elsewhere.**

Keeping the fix and the correction together, because they say different things. The ordering is still
the right preference — a working-tree-only lever *is* fragile, and one day it will be the only one
available. But the reason it went in was a claim I never measured, and the thing that caught it was
adding the label, not the reordering. *An unlabelled answer is how a wrong diagnosis stays wrong.*

### Where it landed

`npm run check:parity:redproof` (renamed from `…:validators`, since it now proves the pin arms too):

    INSTRUMENT: far-branch lever (on disk, absent from the newest release) = iagent_mesh/write_results.py  [committed]
    INSTRUMENT: baseline first — the committed fixture must be GREEN, or every red below is noise.
      baseline: 25 passed, 0 failed
    INSTRUMENT: fixture restored byte-for-byte: true
    INSTRUMENT: 13 mutants, 0 failed to redden the arm they were for

Thirteen, not the six it had: six validator cases, three on the near branch of the release arm, two on
the far branch, and two on v0.9.3 — the refusal and the field census. **Each names the message it must
trip**, so the tally is a claim about which assertions are reachable and not only about which arms are.

The baseline line is load-bearing and goes first on purpose: eleven-for-eleven over a red baseline is
a thing this lane has already shipped once, and it measured nothing.

---

## 6. WHAT IS UNCOMMITTED, AND IN WHICH SHAPE

Two working sets, deliberately not one commit:

**(a) the lineage work** — `src/api/answeringArtifact.ts`, `src/api/lineageHonoured.test.ts`,
`src/hooks/useInterviewAgent.test.ts`.

**(b) the release pin** — `scripts/extract-mesh-sdk-parity.mjs`, `scripts/redproof-sdk-parity.mjs`
(renamed from `…-validators.mjs`, since it now proves the pin arms too), `src/api/meshSdkParity.json`,
`src/api/meshSdkParity.test.ts`, `package.json`.

---

## 7. A NOTE ON THREE FAILURES THAT WERE NOT FINDINGS

Three arms failed the full suite at 9724 ms / 6246 ms / — against a 5000 ms `testTimeout`, and passed
in isolation (2 files, 63 passed, exit 0). Parallel-load flakiness in AST-walking censuses under
repeated vitest runs, not defects. Recorded because a timeout that is filed as a finding costs a
session, and because the same three will do it again on a loaded box.

**The pre-commit run confirms it: 119 files, 1871 passed, exit 0, with `tsc --noEmit` exit 0 and the
transport guard clean at 9 sites across 7 files.** The same three arms that timed out mid-session
passed here, on the same box, with nothing about them changed — which is what "load, not defect"
predicts and is the only reason the earlier reds are filed this way rather than as findings.

Also recorded, because it produced a confident wrong answer:
`git show v0.9.4:src/iagent_mesh_sdk/models.py | grep -c 'bound_defaulted is None'` returned **0**.
The path was wrong — the mirrored paths are `iagent_mesh/models.py` and `iagent_mesh/enumeration.py`.
*A null from a filter is a claim about the filter.* Re-probed from a file using the fixture's own
`sources`: v0.9.4 does carry the rule.

And the reason every probe in this session ran from a **file**: a regex patch through `node -e`
reported "found 0 occurrences — NOT edited" because the shell ate the doubled backslashes. Its guard
correctly refused to write, which is the only reason it was cheap. `node -e` is not used here for
anything containing an escape.

---

## 8. OPEN, AND WHOSE

**Cortex's, needing a decision:**

- the chart-wide render defect from §2(b) — `configmap.yaml` reading undefined
  `.Values.invincibleAgent.*`, plus the orphaned ConfigMap. Wants its own finding and its own commit.

**Pushing:** `git push` is not in this lane's permissions, so `1e31d92`'s successors sit local.
**Pushing publishes chart `cortex-ui-0.2.0`** via `helm-release.yml`, and ruling 1's commit touches
`helm/`, `scripts/` and `.github/`, so the sessions-only gate will **not** fire — a new image builds.

**The producer's, not cortex's to close:**

- the order to draft `sub_query` **and** `accepted_slots` on `_render_refusal_menu` /
  `_render_abstain_menu`, as a pair;
- whether `completeness` / `total_available` ever reach the planning envelope;
- ruling 5's consumer half — `row.method` → `method_label` in `CompetingMeasures`;
- ruling 3 still needs the architect.
