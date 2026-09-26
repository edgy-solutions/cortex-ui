# Two of three done, item 1 still blocked — and a probe of mine that measured nothing

**Lane:** cortex-60 · cortex-ui/master · 2026-09-25
**Order:** three items, overnight
**Commits:** `525e6e1` (item 2), `db5ca3f` (item 3)
**State:** guard green (9 sites / 7 files), `tsc` clean, **1675 tests / 112 files** (from 1659 / 111)

| # | Order item | State |
|---|---|---|
| 1 | Rebuild the fixture from the real lot 4 capture when Lane 1 places it | **BLOCKED — not placed.** Nothing built on a guess. |
| 2 | Fix the stale `SemanticInterpreter.tsx` comment against `main.py:752` | **Done**, and the claim is now a live assertion. |
| 3 | One seal per archetype that the exported table round-trips the real capture | **Done**, and it closes the walker weakness reported yesterday. |
| — | Nothing on ADR-0055 step 2 | **Honoured.** Untouched. |

---

## 0. First, a check of mine that printed nine lines and measured zero

Before anything else, because it bears on how the rest of this report should be read.

To confirm item 1's gate I ran a projection census over the nine captures with a `python3`
one-liner. It printed nine tidy lines — one per file, each ending in `-> ` — and I could have read
that as "no file projects to CONTRIBUTION_RANKING, confirmed."

**`python3` is not installed on this box.** Every invocation failed, stderr was redirected, and the
shell substituted an empty string into a report that looked complete. The census had a
`NO-PROJECTED-KEY` branch that would have printed for the odd ninth file, and it never printed for
any file, which is the tell I should not have needed.

```
python3: ABSENT (so the previous probe was hollow)
```

Re-run through node, the same census is informative and **changes what item 3 had to be**:

```
finance-burn-rate.json              MULTI_SERIES
finance-eac-comparison.json         COMPETING_MEASURES
finance-eac-refusal.json            ELICITATION
finance-funding-status.json         SHORTFALL_GRID
finance-np-meridian-brief.json      KNOWLEDGE_DOCUMENT
finance-performance-indices.json    ELICITATION
finance-variance-decomposition.json VARIANCE_TREE
finance-variance-drivers.json       VARIANCE_TREE
from-32-np-meridian-brief.json      NO-PROJECTED-KEY
```

This is the hollow-green shape in its cheapest possible form — **not a wrong answer, an answer
nothing could contradict** — and it was mine, in the first command of the night, inside the very
check that was supposed to establish a premise. It cost nothing only because a later instrument
disagreed with it. The lesson already in the ledger is the one that applies: **a check whose passing
case asserts nothing about what it measured is decoration.** An interpreter that is absent and an
absence that is real print the same thing.

---

## 1. Item 1 — blocked, and how that was measured rather than assumed

No capture has been placed. Three instruments, because a single one would be a claim about my
search rather than about the repo:

| Instrument | Result |
|---|---|
| `git fetch` + `git log HEAD..origin/master` | empty — no Lane 1 commits |
| `git status --short` | clean — nothing placed untracked |
| projection census (node, above) | 8 projections, 6 archetypes, **no CONTRIBUTION_RANKING** |

So the fixture still stands as `8564bce` left it: provenance and envelope real, rows real in SHAPE
only and labelled as such. **Nothing was rebuilt against a guess, and the shape-only rows were not
retired**, because retiring them before a replacement exists would leave the seals running against
nothing.

**What is already in place for the moment it lands**, so that beat is small:

- The `method` block renders from the real wire the instant one arrives — the present-method path
  exists and is sealed; only the payload is missing.
- **The eight `method not supplied` assertions in `cardExportFinance.test.ts` WILL GO RED, by
  design.** Their failure is the notification that the present-method path is live on real data.
  Do not "fix" them by loosening the assertion; that red is the signal.
- The round-trip seals added tonight are keyed on the archetype and derived at runtime, so a
  CONTRIBUTION_RANKING capture dropped into `sessions/` **acquires a seal with no code change.**
- The report the order asks for — what arrived vs what the projector declares — is already half
  written: the projector's six declared fields are now asserted (§2), so the comparison is
  "the capture's keys against that list", not a re-derivation.

---

## 2. Item 2 — corrected, and the claim no longer lives in a comment

The stale text said the projector tuple *"names four fields which do not include"*
`threshold`/`threshold_defaulted`. Read fresh from the producer, one occurrence, unambiguous:

```python
# agent_fleet/presentation_agent/main.py:752
"CONTRIBUTION_RANKING": ("rows",
                        ("value_label", "value_unit", "scope_label", "verdict",
                         "threshold", "threshold_defaulted")),
```

Six fields, both of them present. The note was true when written; the producer added the pair
afterwards.

**The part that matters is not the count — it is that the old text pointed readers at the wrong
repo.** It concluded *"necessary and NOT YET SUFFICIENT — until the projector carries them"*, so a
quiet bound header read as an upstream debt. It is not. The projector carries them and this side
passes both props. What remains is the third state: **declared and never observed.** Zero hits for
`threshold` across every capture, against a control that finds `verdict` in those same files. A
silent header is evidence that **no answer has yet declared a bound** — a verb-level fact.

### The comment is now a test

Correcting prose does not prevent the recurrence, because **a comment is checked by nothing — that
is the defect, not a footnote to it.** New: `src/components/registry/projectedTupleParity.test.ts`,
following the disposition-join idiom already in that directory (live read, and the
resolved-a-checkout assertion deliberately **not** inside a skip).

Five assertions: the tuple names exactly **six** — not `>= 6`, because the staleness *was* a wrong
count, so a seventh field must go red and force a re-read; the bound pair is present; this side
passes both props (a carried-but-unread field looks identical to a missing one from the UI); and
never-observed, with its control.

**⛔ One thing deliberately NOT sealed:** that the stale sentence is gone. The corrected comment
*quotes* the phrase in order to retract it, so a phrase scan would fire on the fix — and stripping
comments first cannot help, because the claim only ever lives in a comment. A search by name finds
the prose about the name. The live read is the instrument; a phrase scan beside it would be
decoration that fails on the correction.

**Redproof, both arms:**

| Mutation | Result |
|---|---|
| Flip one expected field name | **1 red** — the live read is real, not a self-comparison |
| Point `CANDIDATE_ROOTS` at a nonexistent checkout | **1 red, 2 skipped** — the guard fires |

The second is the one worth keeping: without that non-skip guard the file would have reported
**"3 passed, 2 skipped"** and verified nothing at all.

---

## 3. Item 3 — per-archetype, and round-tripped through the walker's inverse

**Per-file was not per-archetype, and the gap is measurable.** Nine files, eight projections, six
distinct archetypes — VARIANCE_TREE and ELICITATION each arrive twice. So a per-file suite can lose
an archetype entirely (rename the single SHORTFALL_GRID capture) while its file count still looks
healthy. The map is derived at runtime, so a capture for a new archetype gets a seal without anyone
remembering to add one.

**Why round-trip and not the existing pairwise compare.** That seal compares the document to
`flattenPayload(payload)` — *both sides run the same walker*, so a defect inside the walker moves
both sides together and stays green. I reported that yesterday off a single mutant and fixed it for
one fixture with a hand-written oracle. Tonight it is closed generically: `unflatten` is the
walker's **inverse**, written from the path grammar, compared against `normalise(capture read off
disk)`. **Neither side calls `flattenPayload` or `formatLeaf`.**

### The measurement

Re-running the boolean-skip mutant against the walker:

```
×  MULTI_SERIES        — the table parses back into the capture, through the walker's INVERSE
×  COMPETING_MEASURES  — the table parses back into the capture, through the walker's INVERSE
×  VARIANCE_TREE       — the table parses back into the capture, through the walker's INVERSE
   Tests  3 failed | 35 passed (38)
```

**Three round-trip seals red; all nine per-file pairwise seals green.** That is yesterday's reported
weakness demonstrated at corpus scale and closed in the same run — on real captures, not on 25
hand-written oracle lines.

### And it exposed a second gap: per-archetype is not per-leaf-type

Three of six, not six. Only three archetypes' captures contain a boolean at all:

```
MULTI_SERIES         boolean, null, number, string
COMPETING_MEASURES   boolean, null, number, string
VARIANCE_TREE        boolean, null, number, string   (×2 captures)
SHORTFALL_GRID                null, number, string
ELICITATION                   null, number, string   / one capture: string only
KNOWLEDGE_DOCUMENT                            string
```

**KNOWLEDGE_DOCUMENT carries strings and nothing else.** A suite exporting only that archetype would
have looked fully covered while no number, boolean or null branch had a witness. "Every archetype has
a seal" and "every leaf type has a witness" are different claims and only the first was true by
construction. Added as a corpus control: the **union** must cover all four leaf types, plus the
measured boolean-carrying set — so the day these captures are pruned to a tidier set, that test says
what the pruning cost.

### Preconditions asserted rather than assumed

The inverse has exactly one ambiguity — a leaf whose value is the string `"[]"` is indistinguishable
from an empty array — and it cannot tokenize a key containing `.` or `[`. Neither occurs across
**1116 leaves**, and that is asserted, so a future capture that introduces one fails *there* instead
of making the round-trip fail in a way that reads as a builder bug.

**"Same builder" is now structural too.** The builder source is scanned and must contain no archetype
name, with comments stripped first because a name search finds the prose about the name. Redproofed:
adding `const PER_ARCHETYPE_HACK = "VARIANCE_TREE"` to the builder goes red.

---

## 4. Verification

```
npm run check:transport   exit 0   9 site(s) across 7 file(s), all accounted for
npx tsc --noEmit          exit 0
npx vitest run            exit 0   Test Files 112 passed   Tests 1675 passed
```

Baseline was 111 / 1659. **+1 file, +16 tests:** 5 parity assertions, 6 per-archetype round-trips,
1 archetype-set control, 1 inverse-precondition control, 1 same-builder seal, 2 leaf-type controls.

Working tree touched exactly three paths, staged by name.

One transient to record and not dress up: the parity file failed collection once with
`Cannot read properties of undefined (reading 'config')`, immediately after an in-place `perl`
rewrite. It has not reproduced across every run since, including the bisect. **Most likely a read
racing the rewrite, but that is a hypothesis, not a measurement** — noted here so that if it recurs
it is the second sighting rather than the first.

## 5. Open, and unchanged

- **Item 1 waits on Lane 1.** The remaining half of the producer's original refusal reason —
  `output_uri matched no capability` — is still what prevents a real capture, and it is not on this
  side.
- **ADR-0055 step 2:** nothing done, per the order.
- The `client.ts:58` transport-guard blind spot stays held, per the earlier order.
- `helm/` untouched: `tag: latest` default and no `required` guard, reported 2026-09-23, still open
  and still not covered by any order.
- Nothing is pinnable to these shas until their run completes.
