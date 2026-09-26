# Report — cortex-60, Order E: the lot 4 capture landed, and the absent `method` is a vintage

**Date:** 2026-09-26 · **Branch:** master · **Commits:** `89cd37d` (first half), `741d88d` (second half)
**Suite:** 114 files / 1715 tests green (baseline at `89cd37d`: 113 / 1688). `check:transport` ✓, `tsc --noEmit` ✓.

## The order

> to: cortex-ui/master
> `answering_artifact_id` is a caller claim. Read whether the desktop sends it on a safety turn and
> on the HAZ-1003 question; if not, add it from the drawn answer's artifact id, sealed. Bob's task
> dispatch is unreachable until it does. Then the lot 4 capture once Lane 1 names the path.

The first clause landed in `89cd37d`. This report covers the second — "the lot 4 capture" — which is
governed by **Order D item 1**:

> When Lane 1 places the real lot 4 capture: rebuild the export fixture from it, label the shape-only
> rows retired, and render the `method` block from the real wire. Report what arrived vs what the
> projector declares (threshold, threshold_defaulted).

## 1. What arrived vs what the projector declares

The projector's tuple for `CONTRIBUTION_RANKING`, read live from
`agent_fleet/presentation_agent/main.py`, names **seven** envelope fields. The capture carries five
of them, and two fields nobody declared.

| field | declared | on the wire | note |
|---|---|---|---|
| `value_label` | ✓ | `"Purchased value"` | |
| `value_unit` | ✓ | `"USD"` | also per row |
| `scope_label` | ✓ | `"Lot 4"` | |
| `threshold` | ✓ | `"0.25"` — **a STRING** | the engine sends `str(bound)`; a consumer comparing it numerically must coerce |
| `threshold_defaulted` | ✓ | `true` | **the engine's default, not a caller's choice** |
| `verdict` | ✓ | — | declared for the archetype; this measure does not emit one |
| `method` | ✓ | — | see §2 — declared AND emitted upstream, absent here |
| `source_persona` | — | `"COST_ANALYST"` | arrived undeclared |
| `subject_concept` | — | `null` | arrived undeclared; renders as the text `null` |

**On the pair the order asked about.** `threshold_defaulted: true` means `DEFAULT_CONCENTRATION_THRESHOLD`
— the caller named no bound. So this capture exercises exactly one arm of the pair, and the seal is
written to say *which* arm rather than to claim the pair works. ⚠ **One capture cannot distinguish an
engine default from a caller-supplied bound**, and nothing in these bytes says a caller-chosen bound
would arrive at all. A second capture with an explicit threshold is the only thing that closes that.

Row level: each row carries `above_threshold, amount, contribution, entity_id, entity_name, rank,
share_of_purchased, share_of_total, supplier, value_unit`. Four of those are undeclared by our
`ContributionRow` contract, and six declared fields (`acwp, bcwp, bcws, favourable, note,
variance_kind`) never arrive — both directions now asserted in `cardExport.test.tsx`.

⚠ Two quantities arrive twice in two spellings: `amount: "604963.20"` beside `contribution: 604963.2`,
and `share_of_purchased: "0.4100"` beside `share_of_total: 0.41`. That duplication is now the
no-formatter witness, and it is a **stronger** one than the signed integer it replaced: any formatter
collapses one spelling onto the other, so the pair failing to differ *is* the formatter — no guess
about formatted output is needed. (The real capture contains no negative number at all, so the old
witness has no referent.)

## 2. The `method` block: declared, emitted, and still absent — a vintage, not a gap

The order said "render the `method` block from the real wire". The real wire has none. That is **not**
the simple absence the fixture header first recorded:

- **DECLARED** — the projector's tuple names `method`. The parity seal's exact count went from SIX to
  SEVEN on this run, which is precisely why it was written `toHaveLength(6)` and not `>= 6`.
- **EMITTED** — `cost_supplier_concentration` builds one: a formula, five named inputs, a float
  `bound` and `bound_defaulted`. Added upstream in **`546e6bee`** (2026-09-24, *"every cost ranking
  states its own method, and the projector carries it"*). Asserted against that function's own body,
  not against a name found anywhere in a 1000-line module.
- **ABSENT** — no `method` key anywhere in Lane 1's bytes, proven by a key sweep with a control.

Both halves of the upstream contract are in place and the payload still arrived without one, so the
difference is an **image vintage**, not a missing feature. ⛔ **It cannot be resolved from the
capture:** those bytes carry no producer sha, no `fleet_sha` and no `code_hash` — asserted in
`cardExport.fixture.test.ts`. **Ask Lane 1 to capture the fleet sha beside the next fire**, or the
next absence reads exactly like this one.

**And the absence costs more than a formula.** The projector's allowlist strips the producer's `lot`,
`fiscal_year`, `purchased_value`, `largest_share` and `suppliers_above_threshold`. Three of those are
stated *among the method's inputs* — so **the method block is the only route by which they reach a
reader**. `fiscal_year` appears nowhere in the capture at all, not even in an event. A reader who
wants to recompute `share_of_purchased` from the card has the shares and no total.

Nothing was invented to satisfy the render clause. `LOT4_PRODUCER_METHOD_RAW` is the **pre-reader
shape**, transcribed from `_method`'s own `return`, and its header sorts every value into grounded
(from the capture's `threshold`, `scope_label`, `rows.length`), derived (the total, **recomputed** in a
seal rather than trusted), and ⛔ not-in-the-capture (`fiscal_year`, `producer_sha` — whose values say
so in words). The existing `LOT4_METHOD_PRESENT` stays a constructed example: being already in
`MethodBlock` shape, it cannot exercise the reading.

## 3. Three cortex-side gaps — REPORTED, NOT PATCHED

`readMethod` drops three things the producer sends:

| dropped | what it costs |
|---|---|
| `bound_defaulted` | the page states a bound and cannot say whose it is. The envelope pair survives by a different route, which is why this is a gap and not data loss |
| `producer_sha` | the method block cannot name the code that produced it — the same question §2 could not answer |
| each input's `unit` | `total purchased value: 1475520.00` renders with no USD beside it |

The producer's own docstring names the first and calls it *"a cortex-side gap, reported and not patched
from here."* That sentence is evidence about the producer's intent, **not** about this reader — a
docstring in another tree cannot know what this code does — so the drop is asserted here against
`readMethod` itself, and redproofed: a reader that keeps `bound_defaulted` turns it red.

**Not patched, deliberately.** No order covers widening `MethodBlock`, and the export renders what the
type carries, so a wider reader with no renderer would be a silent half-fix. **This needs a ruling.**

## 4. The filter failure — why a GREEN seal was already false

Lane 1 delivered the capture as `.md`. Every instrument in this repo that looks for producer payloads
globs `sessions/*payload*.json`. So on the day the bound pair was first observed on a wire, the seal
asserting it had **never** been observed stayed green — and would have stayed green indefinitely.

Fixed at the root: the fenced block is extracted to
`sessions/2026-09-26-payload-lot4-contribution-ranking.json`, inside the glob's reach, and
`cardExport.fixture.test.ts` asserts the two copies agree (EOL-normalised text **and** parsed) — which
retroactively seals the hand transcription too. Nothing checked that transcription before: every
export seal compares the document to the fixture, so a mistyped digit would have made them agree
about the wrong number. The parity seal now names the file, with the note **TWO FILES, ONE
OBSERVATION**, so counting files cannot overstate the evidence.

⚠ The loose name-search arm is instructive: `includes("threshold_defaulted")` over `sessions/` hits
**six** files, **four of them this lane's own reports discussing the field's absence**, all dated
before any capture carried it. A name search finds the prose about the name. A JSON-shaped matcher
(`"key"\s*:`) isolates the one real observation.

Scrub check on the committed payload: no JWT, bearer or key-shaped hit. The only `eyJ` hits in the
repo remain the bare three letters in prose describing this check, run down one by one rather than
counted; the pattern was proven to fire on a synthetic secret. `endpoint_url` arrives already redacted
by Lane 1; the `http://invincible-agent/cost#…` strings are ontology IRIs, not endpoints.

## 5. The two absence-assertions that reported their own end

Both were written as assertions so they could not quietly stop being true. Both fired:

- `expect(seen).not.toContain("CONTRIBUTION_RANKING")` in `cardExportFinance.test.ts` — the finding
  that sent the fixture question back to the architect, now flipped to `toContain`.
- `expect(fields).toHaveLength(6)` on the projector's envelope tuple — now SEVEN, which is how
  `546e6bee` was discovered at all. A `>=` bound would have let it through in silence.

## 6. Also done

- **The shape-only rows are retired, not deleted** — read literally. `RETIRED_SHAPE_ONLY_ROWS` stays,
  with a seal proving they are the **only witness left** for the absence branches (`favourable`,
  `note`, `variance_kind`) that the real capture cannot reach, and that they are foreign to this wire.
- **The corpus meets two envelope shapes.** The browser's `{final, events}` beside the producer's
  `{prompt, asked_as, fleet_sha, routing, projected}`, read by `projectionsOf` / `routingOf` rather
  than by rewriting the seals. Ten captures, nine projections, exactly one asserted both by count and
  by name — because an unrecognised third shape would otherwise read as a harmless absence.
- **The persona's source split in two.** The nine producer captures state it in `asked_as`; the
  browser capture only inside `route_decision`. Written as an explicit either/or with an assertion
  that the two sources are mutually exclusive — not as `readExportProvenance`'s own fallback chain,
  since an expectation computed by the code under test cannot indict it.
- **`question_asked` is not on the wire.** It comes from Lane 1's prose around the capture, not from
  any event, and the fixture now says so in a ⛔ note with a seal over the event stream.
- **A prediction corrected.** The 2026-09-25 report said the eight `method not supplied` assertions
  "WILL GO RED, by design" once a real capture landed. They stay green, because the producer sends no
  method for this archetype. A prediction about a test is owed the same suspicion as the test.
- **Redproofs:** a reader keeping `bound_defaulted` (1 red), a numeric-string normaliser inside
  `formatLeaf` (2 red — and the pairwise seal stays **green**, which is exactly why the hand-written
  48-cell leaf oracle exists: an oracle that routes through the walker cannot indict the walker), a
  one-cent doctored export, a tidied trailing zero (4 red), a mistyped total (2 red). One earlier
  attempt was **hollow** — `perl -0pi` stripped the backslashes out of `/^\d+\.\d+$/`, leaving a
  regex that never fired, and its EXIT 0 measured nothing. Re-applied with a printed sanity check on
  the regex itself.

## Open, and not covered by any order

1. **The `readMethod` widening** (§3) — needs a ruling. Reader and renderer must move together.
2. **A second lot 4 capture with a caller-supplied threshold**, to reach the other arm of the pair.
3. **The fleet sha beside the next capture** (§2) — without it, every absence is indistinguishable
   from every other.
4. `helm/cortex-ui/values.yaml:20` defaults to `tag: latest` and there is no `required` guard, so a
   never-built tag renders perfectly and fails minutes later at the kubelet on a release Helm already
   called a success.
5. **Held by explicit order:** ADR-0055 step 2, and the transport-guard blind spot at
   `src/api/client.ts:58` (a live undeclared `axios.get<Entitlements>` the guard's regex cannot see).

---

## Addendum, same day — the omission's justification is now half-false

Raised by the invincible-agent lane after this report was first committed, verified here against both
producer files rather than taken on report, and **corrected by one field** in the process.

The projector withholds one envelope field on purpose, with a reason stated at
`presentation_agent/main.py:748`: `suppliers_above_threshold` "is a count the card derives from the
rows it already has, and adding it would put two sources of the same fact on the wire — the kind of
pair that goes out of agreement silently. The bound is a DECLARATION the card cannot reconstruct; the
count is not."

`method` — added later, to fix an unrelated drop, and by its own comment "the FOURTH field this tuple
would otherwise have dropped" — walks through that rule. Its `inputs` carry **values**, and two of the
five are facts the card derives from the rows it already has: `suppliers` = `len(rows)`, and
`total purchased value` = the sum of the rows' `amount` strings.

⚠ **The sharpening as it reached me was off by one field**, and the two readings call for different
fixes. It is **not** `suppliers_above_threshold` that arrived by the back door — that count is in
neither the tuple nor the method block, and both are now asserted. What arrived is two *other*
derivable facts. So the rule was breached in principle while the field it was written about stayed off
the wire: **widening the allowlist would not fix this; deciding what a method block's inputs may
restate would.**

**Where the drift actually lives.** Inside one payload the two sources cannot disagree — the block is
built from the same locals as the rows, in the same call, which the producer says of the bound already.
The exposure is downstream, in any consumer that filters or drops rows: `suppliers: "4"` and a total
over four amounts keep describing a set the reader is no longer being shown.

⚠ **This side already carries the contradicting check.** `cardExport.fixture.test.ts` recomputes both
values from the capture's own rows rather than trusting the fixture — written for a different reason
(a transcription needs its own seal) and turning out to be exactly the cheap guard the producer's
reasoning implies, which neither side had written down.

**Recorded, not patched, on both sides.** Widening `MethodBlock` here and widening that allowlist
there are two halves of one ruling; no order covers either, and rulings originate in
`invincible-agent`. A wider producer with no reader is the mirror of a wider reader with no renderer.
Sealed in `projectedTupleParity.test.ts`, redproofed two ways: a deliberately wrong producer literal
(which proves the source read is live and not an empty string) and a flipped withheld-count assertion.

**Also settled with that lane:** `59fb2cb` is a cortex-ui commit and the capture was never in
`invincible-agent` — its durable record said so correctly; only the message inverted it. Neither lane
pushed cortex-ui master: it is **ahead 4**, which voids the condition Chris gave (push only if
`59fb2cb` stood alone), and the push is his call. Lane 1 has accepted capturing the fleet sha beside
the next fire, and stating how it was derived rather than only a timestamp.

**Suite after the addendum:** 114 files / 1716 tests green; `check:transport` ✓, `tsc --noEmit` ✓.

---

## Second addendum, same day — the rule was already contradicted, by the allowlist, a week earlier

The addendum above accepted the *frame* of the finding while correcting its field: the `method`
block, added later, restates two facts the rows carry, and so walks through the rule at
`main.py:748` that a count the card can derive must not also travel on the wire.

The invincible-agent lane then enumerated the class through `_inp` and reported three `len(rows)`
restatements and four row-sum totals, all in `cost_agent/measures.py`, and asked whether widening
the allowlist was the fix.

**That census was filtered, and the filter is the finding.** `_inp` is *one engine's* helper.
`finance_agent` builds no method block at all — its `"method"` is a row-level STRING naming the EAC
method, beside a row-level `"formula"` — so nothing reached through `_inp` could ever see what that
engine does at the envelope level. A census through a helper is a claim about the helper. It is the
same shape as this lane's own §4 failure one level up: a NULL from a filtered instrument is a claim
about the filter, not the population.

**What the unfiltered look found, stronger than the method-block finding in three ways:**

`methods_compared`, `methods_answered` and `all_methods_answered` are **explicitly named** in the
COMPETING_MEASURES tuple at `main.py:680-685`, and `methods_compared` is `len(rows)` at
`finance_agent/measures.py:89`.

| | the method-block finding | this one |
|---|---|---|
| who does it | a block that slipped past the allowlist | **the allowlist itself**, ~70 lines from the rule, same file |
| evidence | read from producer source | **observed on a real wire**: the 2026-09-19 EAC capture in this repo's corpus carries `methods_compared: 3` beside 3 rows, post-projector |
| when | `546e6bee`, 2026-09-26 | **a week earlier** — the rule was already false for another archetype when it was written down |

So "the added field broke the rule" is at best half the story, and **widening the allowlist fixes
nothing** — the allowlist is where the breach already lives.

**The ruling question widens again.** Not "may a method block restate a fact the rows carry" but
"may the WIRE restate one, and who reconciles the two sources". The method block is one instance of
a pattern the projector already blesses by name elsewhere. Still recorded, not patched: *the producer
should stop restating* and *the consumer should reconcile* are opposite fixes, and neither lane picks
one on a peer exchange.

**One thing measured that I expected to go the other way.** The third new seal was written to assert
that a row-level `method` string cannot be mistaken for a method block. Half of that is true — a bare
string is dropped. But a finance **row** passes `readMethod`, because it carries a `formula` and a
non-empty `formula` is the only thing the reader requires. What comes back is a plausible block with
the row's formula, no inputs and no bound, rendered under a heading that tells the reader the
*producer* accounted for its own arithmetic. That is fabricated provenance where the honest output
was a stated absence. **The guard therefore has to be the call site, not the reader** —
`CardExportButton.tsx:61` reads `method` off the component and the envelope and never off a row —
and that is what the seal now asserts. Narrowing `readMethod` to reject row-shaped input is the other
candidate and is deliberately not taken: a row could legitimately grow a field a block also has, and
then the reader would be guessing. The failing draft is left described here because the assertion I
first wrote would have passed for the wrong reason had `readMethod` been one line stricter.

**Redproof of the new describe — four mutations, each fires on the intended assertion and only it:**

| mutation | result |
|---|---|
| producer tuple loses `"methods_compared"` | 1 red — `expected [ 'spread', …(12) ] to include 'methods_compared'`; the vacuity controls (`length > 5`, `verdict`) still green, so the extractor read a real tuple |
| capture's `methods_compared` 3 → 4 | 1 red — `expected 4 to be 3` |
| `readMethod` additionally requires `inputs` | 1 red — `expected null not to be null` |
| call site pointed at `componentLevel?.rows` | 2 red — the new seal **and** the older props seal, two independent witnesses on that line |

⚠ **The first attempt at the first two measured nothing** and is recorded because it will recur: the
mutant paths were written bash-style (`/c/Users/...`), node resolved them as `C:\c\Users\...`, and
both runs exited 1 on `ENOENT` rather than on any assertion. An EXIT 1 for the wrong reason is the
same empty instrument as an EXIT 0 that cannot fail.

**Suite after this addendum:** 114 files / **1719** tests green; `check:transport` ✓ (9 sites, 7
files), `tsc --noEmit` ✓.

---

## Third addendum, same day — the second addendum's conclusion was wrong, and the real gap is on THIS side

The second addendum concluded that the withheld-count rule at `main.py:748` was *already false*,
because the COMPETING_MEASURES tuple names three counts a card could derive. The engine lane
disputed the conclusion while accepting the facts, and **it is right.** Verified here rather than
taken on report:

`main.py:658-664`, dated **2026-09-11**, states the exception and its reason twenty lines *above*
the entry I cited:

> `methods_compared` / `methods_answered` / `all_methods_answered` travel for the sibling reason: an
> undefined method KEEPS ITS ROW, and without these the card cannot say that three rows are not
> three answers. Dropping a row would turn a comparison of three into a comparison of two without
> appearing to.

**So the discriminator is not "derivable from the rows". It is derivable from rows THAT COULD HAVE
BEEN TRUNCATED WITHOUT TRACE.**

| field | what it is | ruling |
|---|---|---|
| `suppliers_above_threshold` | a property of the rows **present** — rows go missing, both copies are wrong the same way | withholding is right |
| `methods_compared` | a claim about the **completeness of the row set** — a card counting its own rows can never recover it, because the total and the parts come from the same parse | carrying it is right |

Both rules are correct as written. Reading the exception as a leak is what made the rule look false
a week early. **Every fact in the second addendum stands; its conclusion does not.**

⚠ **And my own seal was the demonstration all along.** Its second test asserts
`methods_compared === rows.length` on a real capture — green, and *that is the point*. The producer's
count must equal its rows on an intact payload. A consumer that derives the count instead reproduces
the same equality on a **truncated** payload, agreeing with whatever survived. The two states are
indistinguishable from the rows alone. I had the coincidence-defect shape under the cursor and read
it as evidence of redundancy.

### The gap is real and it is ours

The peer's closing point is the one that matters: **the discriminator lived in two comments and no
seal**, which is why three sessions argued it from source. It is stated in this repo too —
`CompetingMeasures.contract.ts` and that card's own test header carry nearly the producer's sentence,
in capitals. So the producer built a truncation detector and cortex **documented agreement with it
and then did not use it as one.** Three ways, all now measured:

1. `CompetingMeasures.contract.ts:164-166` — all three are **`required: false`**. A producer that
   omits the detector is accepted.
2. `CompetingMeasures.tsx:77` — absent, `asked` falls back to **`?? rows.length`**: the exact number
   the field exists to contradict. `complete` then falls back to `replied === asked`, self-consistent
   by construction. A truncated set renders a confident full comparison with nothing blank.
3. **Present and disagreeing, nothing compares them.** The heading prints `rows.length`, the banner
   prints `asked`, and the banner's only gate is `!complete` — which the producer's own
   `all_methods_answered: true` satisfies. Staged: three counted, three answered, one row lost
   downstream → the card renders **"2 methods"** and no incompleteness notice. Both numbers are on
   the card and it says nothing.

Four characterisation seals in `CompetingMeasures.test.tsx`, marked ⛔, with a control that the
banner *does* fire on a genuine blank row — so the silence above is not "this card can never speak".
**Reported, not patched:** making the pair required and reconciling it against `rows.length` is the
consumer half of a ruling whose producer half (must a completeness-bearing restatement be
*required*?) originates in `invincible-agent`.

### The instance that still wants a ruling, and it is smaller than either of us thought

`planning_agent/measures.py:1099` puts `change_count = len(entries)` **inside the payload key**, read
at `changes["rows"]["change_count"]` by `tests/planning/test_engine_p_routes.py:189`. A row-level
field needs no allowlist entry — the engine lane's own
`tests/finance/test_the_wire_carries_what_the_engine_declares.py:168`,
`test_row_level_fields_need_NO_declaration_and_that_is_why_favourable_survived`, names that design
outright. So `:748` cannot reach it at all, and whatever the ruling says about envelope declarations
governs the **smaller** surface. The peer's third option — classify each restating fact as
completeness-bearing or not, and *require* the completeness-bearing ones — is the only one of the
three that explains why both existing rules are right. Neither lane picks it; it originates there.

### Corrected in place

The parity seal's prose and both test names were rewritten: `2348cd9` asserted true facts under a
false heading, which is the failure this file exists to catch. The block now seals the
**discriminator** — including the producer's sentence, so the argument cannot be had a fourth time
from source — and carries the record of how it was wrong.

**Redproof, four mutations, each on the intended assertion:** the discriminator comment reworded → the
parity seal red; **the gap FIXED** (`complete` also requiring `asked === rows.length`) → the ⛔
truncation seal red, which is the property a characterisation seal must have, since it names its own
fix; the `?? rows.length` fallback changed → two red; `methods_compared` made `required: true` → the
contract seal red.

⚠ **Two self-inflicted instrument failures, recorded because both wasted a run and both were silent:**
an assertion on the producer's sentence **spanned a comment line wrap** and went red for a reason
unrelated to its claim; and a repo-wide `grep` over `invincible-agent` without excluding `.venv`
timed out at 120s — the same hazard this lane already wrote down and walked into again.

**Suite after this addendum:** 114 files / **1723** tests green; `check:transport` ✓, `tsc --noEmit` ✓
(one real type error caught and fixed: a blank row built by spreading `SEED()[1]` infers
`value: number` and will not take a null).

---

## Fourth addendum, same day — gaps 1 and 2 are unreachable today, and that is the argument FOR the fix

The engine lane reported that gaps 1 and 2 have **no reachable producer-side half**, and it verifies:

- `finance_agent/measures.py:84` — `if not exact: return None`, for the **whole** summary envelope,
  when no method produced an exact figure. That is precisely the payload that would hand this card an
  absent `asked`. ~~It cannot be built.~~ **Corrected in the fifth addendum: it is never built, which
  is not the same claim — `main.py:651` turns that `None` into `{}` and the keys go absent.**
- `tests/finance/test_eac_comparison.py:106`, `test_THE_PANEL_CAN_NEVER_COME_BACK_EMPTY` — that return
  is itself unreachable: `REMAINING_AT_BUDGET` is ACWP + (BAC − BCWP), arithmetic over figures that
  always exist, projecting **no index**, so it answers whenever the program does.

**And I checked the thing I actually suspected, which was wrong.** I went looking for a third filtered
population — a second engine emitting COMPETING_MEASURES outside that guard's reach. There isn't one:
`capabilities.py:402` binds the archetype to `fin:EstimateAtCompletionComparison` and nothing else in
`agent_fleet/` emits it. One producer, one guard, argument holds. Saying so plainly because the last
two rounds went the other way and a third would have been the easy assumption.

⚠ **The implication strengthens the consumer fix rather than retiring it, and the peer put it exactly
right.** `asked` is safe *only* because of one method's index-freeness in one engine, recorded in a
finance test docstring. Nothing at `contract.ts`, nothing in the projector's allowlist, and nothing on
this card knows that. Add an EAC archetype whose methods all project indices, change `_totals`, or
reuse CompetingMeasures for another comparison, and the absent-`asked` path goes live **with every
layer green**. "Reconcile against `rows.length` rather than falling back to it" stops being a
tidiness argument at that point.

### The measurable form of that fragility, on this side

**Not one of the six fixtures can reach the dangerous branch.** All six spread a single `ENVELOPE`, so
the pair is never absent; and the only `data-incomplete` fixture reaches the banner through the
producer's explicit `all_methods_answered: false`, never through the card's own `replied === asked`
derivation. The branch that would carry the failure is covered by the ⛔ seals of the third addendum
and by **nothing else in this repo**. A corpus whose every member states a field cannot report what
happens when it is absent. Sealed, with the banner fixture as the control so the claim is about the
*route* and not about missing coverage.

⚠ **A mutant survived that seal and the seal was wrong, not the mutation.** The first version asserted
`Object.keys(envelope)` contained the two names. A fixture written `methods_compared: undefined` keeps
the key, satisfies that, and still sends the card down `num(undefined) ?? rows.length` — so the seal
was blind to the exact state it claimed to exclude. Re-pointed at the **value** (`typeof === "number"`,
`typeof === "boolean"`), the same mutation now fires and names the offending fixture. *Presence of a
key is not availability of a figure* — the containment-versus-cardinality lesson one level in.

### A polarity the enumerated kinds did not have

The peer's `measures.py:84` is worth recording as its own kind: **a guard that cannot fire, whose
firing would CAUSE the downstream failure rather than prevent it.** Every other unreachable guard this
programme has found was either dead weight or a missing check. Deleting it is not the fix (`min()` over
an empty list is the alternative); whether the producer should instead emit the envelope with
`all_methods_answered: false` is the producer half of the ruling. Both halves stay Chris's.

**Suite after this addendum:** 114 files / **1724** tests green; `check:transport` ✓, `tsc --noEmit` ✓.

---

## Fifth addendum, same day — the hinge, and the rule the fix needs already exists in the card

### One sentence of the fourth addendum was wrong, and the wrong link matters

I wrote that the absent-pair payload "cannot be built". The engine lane supplied the link I had not
read: **`finance_agent/main.py:651` is `measures.SUMMARY[fn](rows) or {}`.** A `None` summary becomes an
**empty dict**, so the keys go **absent** — not null, which is the one state this card invents a value
for. The payload is exactly what that expression produces. What holds it off is *only* that
`if not exact:` never fires.

**It is never built; it is not unbuildable.** Every link now read rather than inferred:

```
measures.py:83  returns None
  → main.py:651  `or {}`         drops the keys
  → contract.ts:164-166          accepts their absence (required: false)
  → CompetingMeasures.tsx:77     asked = num(methods_compared) ?? rows.length
  → :81                          complete derived from the fallback
  → :144                         banner gated on !complete — silent
```

Six links, two repos, and `SUMMARY` has exactly one entry — so the whole chain is held off by one
arithmetic coincidence in one method of one engine. I had claimed to have read this path and had
inferred its second link.

### The rule the consumer half needs is already in this card, 31 lines above the line that breaks it

The lane's closing point, verified: the doctrine exists, twice, ratified nowhere.
`finance_agent/measures.py:124-127` — *"DECLARED, NEVER INFERRED … a verb absent from a table below
emits no such key, and the renderer keeps showing a bare number rather than guessing a currency this
payload never sent."* And `docs/rulings/README.md:64` there has cortex reading the lens "from the board
record, never inferred". ⚠ **That line is not in this repo's mirror** — noted, not numbered; rulings
originate there.

**And this component already practises it for every other absent envelope figure:**

| absent field | what the card does |
|---|---|
| `spread` | `data-spread-unreported` — and :108 says why, in the words that decide this: *"THE PRODUCER DID NOT REPORT IT, **and this card may not compute it**. Said rather than omitted."* |
| `lowest_value` / `highest_value` | `data-range-absent` — "no range" |
| `methods_compared` | ⛔ **silently computed from `rows.length`**, at :77 |

Five absences said, one inferred, **31 lines apart in one file.** `?? rows.length` is the exact inverse
of the doctrine the same card cites when it refuses to subtract two figures it can already see. And
structurally: six declared absence markers and not one means "how many were asked was not stated" —
`data-incomplete` is the only count-bearing marker and it is gated on `!complete`, which the fallback
renders false.

**So this is reclassified, and the ruling shrinks.** Not an open design question between two candidate
policies — a violation of a rule the card states itself. `complete` requiring `asked === rows.length`
*follows from* the card's own doctrine rather than competing with the producer half, and the ask of the
ruling is to **ratify absent-means-silent generally**, not to invent a policy. Still reported, not
patched: the fix changes what the card renders and no order covers it.

**Redproof, two mutations:** the card's own rule reworded → the seal reds, losing its subject, which is
correct since the contradiction is between two live claims; a seventh absence marker added → the
cardinality control reds.

**Also recorded from that lane, on their measurement not mine:** their wire seal iterated three of the
eight declaration tables and `SUMMARY` — the table producing these counts — was not among them, so the
field whose whole job is to survive to the consumer was verified before it travelled and nowhere after.
My fixtures begin after the wire and their suite stopped before it; the join belonged to neither side.
Closed there at `7b886e61`, asserted **on the value**, with the surviving mutant from the fourth
addendum as its specification. Their seal's docstring still claims a population it does not cover
(three of eight tables), named and left open there.

**Suite after this addendum:** 114 files / **1725** tests green; `check:transport` ✓, `tsc --noEmit` ✓.

---

## Sixth addendum, same day — a derived population cannot see a subject that never arrived

The engine lane closed their side at `ba56986a` and handed over the finding rather than the fix:
**a population derived from its consumer cannot see its subject REMOVED from that consumer.** Their
measurement: a corrupted value in a wired table reds the derived arm; an UNWIRED table leaves it
GREEN, because the table simply leaves the population and the arm iterates a smaller set. They asked
whether any of our 1725 derive a population the same way. **One does, and the mutation lands.**

### Measured here, not accepted — `src/lib/sessionIsolation.test.ts`

That file's whole purpose is that the purge list stays complete as stores are added; its docblock
says it "DERIVES the population — every `use*Store.ts` on disk". Two mutations on `useStageStore`
(localStorage-persisted under `cortex-stage`, and *not* one of the three stores pinned by name):

| | mutation | result |
|---|---|---|
| M1 | its persisted key corrupted to `cortex-stage-v2` | **EXIT 1** — the key seal names it. The arm is live. |
| M2 | a new `src/store/stageDraftStore.ts`, persisting to localStorage under `cortex-stage-draft`, purged nowhere | ⛔ **EXIT 0. All 13 green.** |

M2 *is* the leak the file exists to prevent — user-scoped state surviving an account switch —
shipping with the guard green. Invisible because it never enters the population: no `use` prefix, so
the regex skips it, so it is absent from `storeModules`, absent from `persistedStores`, and absent
from `undecided`. **The gap detector cannot report a gap it is not looking at.**

⚠ **And the floor could not cover for it.** `storeModules.length >= 7` was written when there were 7;
there are **11**, so four modules could leave before that control notices, and one that never arrived
costs nothing. Three of eleven are pinned by name. A floor is a ratchet against *shrinkage*; this is
non-arrival.

**Sealed:** two arms asserting the derivation's *reach* rather than its contents — every non-test
module in `src/store` must match the convention (so it faces every seal above) or be named a
non-store, and the directory must stay flat (a nested `use*Store.ts` escapes the same way).
`.tsx` deliberately in scope, since nothing makes a store `.ts`. Redproof: M2 replayed → EXIT 1 on
the first arm; a nested store → EXIT 1 on the second; each on its own seal, zero ENOENT.

### The criterion, and the three sites it CLEARS

What made this one real is not that the population is derived — it is that **production's reach is
wider than the test's.** Vite imports any filename; the seal matched one. Applying that criterion to
the rest of the class, and reporting the negatives because a sweep that only finds hits is a sweep
nobody can check:

- `taskKindParity` filters `.yaml` — but nothing on this side loads yaml at runtime (the only hit in
  `src/` is a comment). A `.yml` is not a shipping subject here. **No gap.**
- `assembleCapabilities` walks `src/lib` for `.ts` only, and `src/lib/meshPersonaConfig.tsx` exists —
  but the assertion is `exported.has(c.consumer)).toBe(true)`, so a missed export produces a **false
  RED**, not a false green. **Fails safe**, which is the opposite failure and an acceptable one.
- `projectedTupleParity`'s ledger and payload globs have floors *and* exact `toEqual` membership on
  what they find. Membership, not cardinality, is what makes them immune. **Already the strong form.**

**So the lesson is narrower and more useful than "ratchet your populations":** a derived population
needs a reach assertion exactly where the production loader accepts more than the test's filter does.
Where a miss reds, or where membership is pinned by name, the derivation is already honest. Both lanes
had ratchets against shrinkage and neither had one against non-arrival — found on their tree, fixed on
both.

---

## Seventh addendum, same day — my own fix was walkable, and partitioning the forced spelling found two unregistered keys

The engine lane's objection to the sixth addendum's fix was correct, and firing it beat arguing it:

> A convention arm makes the next store conform; it does not make an unconventional one visible.
> Ask what the shipping code is FORCED to spell and partition that.

**M3** — a persisted localStorage store at `src/components/planning/useDraftStore.ts`, purged nowhere
→ **EXIT 0, all 15 green.** One directory over and the file was blind again. The sixth addendum moved
the boundary from *filename* to *directory + filename*; it did not remove one.

### What is actually forced

Not the filename (Vite imports any), not the directory, not even the `persist()` config — **state
cannot outlive a reload without a `localStorage.setItem` call.** That is total over naming, location
and store-vs-hook, and partitioning it surfaced two keys no arm in this file could reach:

| key | site | why it escaped |
|---|---|---|
| `cortex-grounding-display-mode` | `useInterviewStore.ts:387` | The store IS in `storeModules` and IS named in `sessionIsolation.ts`, so `undecided` calls it decided — but it has **no `persist()`**, so it never enters `persistedStores` and the key seal never sees its key. ⛔ **Decided at store granularity, undecided at key granularity.** The register's own comment says "Persisted-store localStorage keys" — that scope *is* the gap. |
| `cortex-mock-grounding` | `mockGroundingEmitter.ts:80` | A lib module outside the store population altogether. No arm here could ever have reached it. |

Both are now classified **device-scoped, not user-scoped** — and that classification is *derived, not
deferred*: a display mode and a mock-mode toggle, neither holding interview content. Stated as a
derivation in the register so a human can contradict it in one line. ⚠ Recorded because the lane
opposite just paid for the other choice: they deferred a classification as "a judgment I am not making
unilaterally in a shared tree", and it was one grep from the envelope builder. **A stated reason for
not deciding reads as diligence and stops re-examination as effectively as a wrong answer does, and no
check suite can fire on a deferral — there is nothing to run.**

### Sealed, and why both instruments stay

A `DURABLE_WRITERS` register over every non-test module in `src/` that writes durable localStorage —
seven today — each entry carrying the argument for purging or not purging, reason length reviewed, and
**checked in both directions** so an entry whose module stopped writing cannot leave a stale argument
standing as live coverage. (That second direction is what caught the lane opposite: their checked
excuse list indicted its own author when a pattern consumed its anchor.)

The convention arms from the sixth addendum stay, because the two have **opposite blind spots** — the
engine lane's structural finding, and the reason neither alone is enough. The convention arms red on
naming drift inside `src/store` and are blind to a writer outside it; the register arm reds on any new
writer anywhere and is blind to naming drift inside the convention. They compose because they fail in
opposite directions.

**Redproof, three mutations, each on its own arm, zero ENOENT:** M3 replayed → EXIT 1; a hand-rolled
`setItem` in a brand-new module in a different directory, no zustand → EXIT 1; a registered writer made
to stop writing → EXIT 1 on the both-directions arm.

**Residual limits, stated rather than implied:** an indirect write through a wrapper, and a dependency
writing localStorage on our behalf, are invisible to a source grep. Cookies and IndexedDB are out of
scope and always were. `useComposerDraft` writes a **computed** key (`cortex-composer-draft:<owner>`),
which is why the partition had to be the *call site* and not the literal — a literal-key arm would have
missed a module that was already there.

**Suite:** 114 files / **1730** tests green; `check:transport` ✓, `tsc --noEmit` ✓.

---

## Eighth addendum, same day — my own correction came back as a defect in my own instrument

The correction I sent the engine lane — *partition the CALL, not the literal* — turned out to indict my
own seal one commit later. They fired it on their side (a computed envelope key travelled with all 22
arms green) and closed by walking the AST. **The same hole was in mine, in the other syntax.**

**M4** — a module doing `const ls = window.localStorage` and `window["localStorage"]`, then writing two
durable keys → **EXIT 0, all 18 green.** My partition was over the *call*, but the predicate matching it
was still a **text pattern**, and a text pattern for a call cannot see that call under another name.
Their f-string and my aliased `localStorage` are one defect in two languages, found a day apart.

**Closed the same way they did — by reading the syntax.** `typescript@5.9.3` is already here, so the
predicate now walks the AST: any `.setItem`/`.removeItem` call however the object was spelled, bracket
access included, and any `persist` call tracked by its **original import name**, so
`import { persist as p }` cannot dodge it. Widening it added one module to the register —
`api/client.ts`, which writes `cortex-session-id` to sessionStorage — and it **over-matches on
purpose**: over-matching costs a register entry with a stated reason, under-matching costs a leak.

**Redproof, each on its own arm, zero wrong-reason exits:** ~~M4 replayed → EXIT 1~~ **Corrected in the ninth addendum: the replay used a string-literal member, which this predicate handles by design. The same idea with the member in a VARIABLE was GREEN — the mutant logged here was the easy variant of the defect it stood for.**; `persist` imported
under an alias → EXIT 1; a registered writer made to stop touching storage → EXIT 1 on the
both-directions arm.

⚠ **Irreducible tail, stated in the seal rather than implied:** a member name held in a variable
(`const m = "setItem"; ls[m](v)`) is invisible to this too, as is a dependency writing storage on our
behalf. The partition is total over **spelling**, not over indirection.

### The drifted floor, measured instead of merely criticised

The sixth addendum named `storeModules.length >= 7` guarding eleven and then left it, which was half a
job. Following the engine lane's ratchet discipline — *measure a ratchet's cover, and delete it if it
covers nothing* — it is now `>= 11`, because **a shrinkage ratchet must equal the population at the
moment it is written or it is a bound drifting away from its own subject.**

And its cover was measured rather than asserted. ⚠ **I first wrote "sole cover for nothing" into the
seal and could not defend it, so it was corrected before it landed:**

| mutation | what reds |
|---|---|
| a store renamed out of the convention | the convention arm, on the unmatched file |
| a persisting store removed | the register's both-directions arm |
| an exempted store removed | the exemption arm ("no longer exists") |
| a plain store deleted outright | ⛔ **nothing else. This count is sole cover.** |

So it stays, with the honest statement of what it buys written beside it: **bookkeeping, not
leak-catching** — a deliberate deletion is not a defect, and what the ratchet forces is that the number
be re-stated by whoever did it. The instruction to delete it survives, conditioned on a future re-run
finding even that case covered.

**Suite:** 114 files / **1730** tests green; `check:transport` ✓, `tsc --noEmit` ✓.

## Ninth addendum, same day — I recorded the mutant as RED, and it was the easy variant of it

The peer asked two questions about the eighth addendum's evidence. Both were worth asking, and the
first one broke it.

**Their question 1 — "if any of your M4 arms' evidence is *this mutant used to red and now doesn't*,
that is not evidence yet."** Mine is the other direction (quiet before, red after), which is the
sound one. But re-firing the repertoire against the shipped instrument found something worse than a
direction error. My recorded `R6 EXIT 1` used `S["setItem"](v)` — a **string-literal** member my AST
predicate handles by design. Firing the same idea with the member in a **variable**:

```ts
const S = window.localStorage;
const verb = "setItem";
export const stash = (v: string): void => { S[verb]("cortex-quiet", v); };
```

→ **18/18 GREEN.** The mutant I logged as proof was the easy variant of the defect it stood for, and
so it inflated exactly the number it was measuring. That is my own recorded lesson, arriving from the
inside: *a mutation easier to detect than the defect it stands for inflates every number measured with
it.* Worse, the comment directly above the predicate had already written this case down as "⚠ THE
IRREDUCIBLE TAIL … total over SPELLING, not over indirection". It was not irreducible. A limit stated
in prose reads as diligence and stops the re-examination as effectively as a wrong answer.

**What actually fixes it is a change of subject, not a stricter rule.** The predicate enumerated the
dangerous verbs, so it could only ever be total over their spelling. Enumerating the SAFE ones
(`getItem`, `key`) and keying on the storage **object** makes every other form count by default — a
variable member resolves to no known read, so it counts. Fired after the change: variable member
**RED**, a storage object handed to a constructor **RED**, `export const S = window.localStorage`
with no call at all **RED**, and a pure `getItem` reader **GREEN** (which is the control that the
read allow-list is live rather than dead code).

**And the new predicate found a ninth durable writer that no verb-keyed rule could ever have seen.**
`src/auth/AuthProvider.tsx:10` hands `window.sessionStorage` to `oidc-client-ts`:

```ts
userStore: new WebStorageStateStore({ store: window.sessionStorage }),
```

There is no `setItem` in our source. The OIDC user record — the authenticated session itself — is
written durably by the **dependency**, from a storage object we pass as a value. Registered, with the
reason that it is deliberately not purged: this store is the owner signal `reconcileSessionOwner`
reads, so wiping it during an owner change would erase the evidence of the change being reacted to
and log the arriving user straight back out. Register: 8 → 9.

~~**I also planned an arm for the re-export residual and deleted it, because the measurement said it~~ **Corrected in the tenth addendum: the measurement was a ONE-FILE mutant and the arm is a two-file arm. With the binding site registered, a consumer importing the handle ships a durable key green — the arm is restored and is sole cover. What follows was true about the binding site and irrelevant to the consumer.** **The deleted claim, kept verbatim: it
had no cover of its own.** `export const S = window.localStorage` already reds the arrival arm — the
binding site names storage, so the holding module is already in the population. The residual paragraph
now states what is actually left (`globalThis["local" + "Storage"]`, or a dependency reaching `window`
with nothing passed from here) instead of a case that is covered.

**Their question 2 — "not *did the arm red* but *did it red through the arrival path or the departure
path*."** Re-run as an outright deletion rather than the `void 0` I had used: add a writer, register
it, confirm green, then delete the file. It reds through **"the register has not lost its subject —
both directions"**, with the arrival arm staying green because nothing arrived. That branch
attribution holds, and the `void 0` flag can be closed.

**Their D2 is live in this file, and it cost more than theirs did.** Their lesson — an excuse keyed on
a substring excuses whatever else shares it — applies verbatim to the completeness arm, which asked
`ISOLATION_SRC.includes(m)`: whether a store's name appeared **anywhere** in the file. A store that is
never purged and never exempted, named only in a **comment above the purge**, passed:

```
D2-mention-only   EXIT 0   18/18 GREEN
```

The module's own docstring says a store must "purge or be named in PURGE_EXEMPT_STORES with a reason.
There is no third option" — and the check granted a third, with a reason required of nobody. Now keyed
on identifiers inside `purgeUserScopedState`'s body: a comment is not a node, and `useStageStoreV2` is
a different identifier rather than a superstring. Measured before installing it: the 11 stores
partition exactly 6-purged / 5-exempt, so the tightening costs **zero** false REDs. Replayed: **RED.**

**Then the control I wrote for that fix failed its own redproof.** I asserted the derivation is
body-scoped via `useTemplateStore` — named in the file, not purged. Dropping the function NAME from
the derivation so it grabs **every** function body left all 19 arms **GREEN**, because
`useTemplateStore` sits in an object literal outside any function and the wider scan misses it too. A
control that passes under the drift it is named for is not a control. `OWNER_KEY` is the instrument
that separates them — named in `reconcileSessionOwner`'s body, absent from the purge's — and with it
the widening mutant reds. **Twice this beat a check of mine was hollow in a way only firing showed,
and the second one was the check written to protect the first.**

Added the partition assertion while there: a store both purged **and** exempted is two decisions with
one of them stale, which no arm above could see. Zero today.

Full mutant table, this beat, all on the shipped instrument:

| mutant | pre-fix | post-fix | arm it reds through |
|---|---|---|---|
| non-conventional module in `src/store` | RED | RED | convention |
| persisting store one directory over | RED | RED | arrival |
| `S[verb](v)` — member in a variable | **GREEN** | RED | arrival |
| storage object passed to a constructor | not run | RED | arrival |
| `export const S = window.localStorage`, no call | not run | RED | arrival |
| pure `getItem` reader | GREEN | GREEN (control) | — |
| registered writer deleted outright | — | RED | **departure**, arrival green |
| store named only in a comment | **GREEN** | RED | completeness |
| derivation widened past the named function | **GREEN** | RED | the control |

Gates: `check:transport` EXIT 0, `tsc --noEmit` EXIT 0, **114 files / 1731 tests** green.

**One honest note on the wrong-reason check itself, since this beat is about detectors missing
variants.** My harness greps each log for `ENOENT|Cannot find|SyntaxError` and reported **zero across
all 23 logs** — and that number is true and useless, because one run this beat *did* fail for the
wrong reason and the pattern could not see it. Mis-splicing the new derivation split a method chain,
and esbuild says `ERROR: Unexpected "."` — none of the three words. I caught it by reading the log.
The measurements in the table above were each confirmed by the **name of the failing arm**, not by the
exit code, which is the only reading that survives a detector this porous. The pattern is now known to
be incomplete; recorded rather than widened, because widening it to match today's phrasing would be
the same mistake one level along.

Both CompetingMeasures halves remain **reported, not patched**.

## Tenth addendum, same day — the peer asked what identifies the object, and my closed residual was open

The peer's closing question was the one I had answered too early: *"your enumeration keys on the
storage OBJECT, so it inherits whatever identifies that object. If the object is ever obtained rather
than imported — handed in, destructured, re-exported — the safe-form enumeration is total over the
accessors and silent about the object."* Fired, and it is right.

```
lib/storageHandle.ts    export const handle = window.localStorage;     (REGISTERED)
lib/quietConsumer.ts    import { handle } from "./storageHandle";
                        handle.setItem("cortex-quiet-2", v);            <- names no storage
```

**19/19 GREEN**, with a new durable key shipping from an unregistered module. The consumer owns the
key and is invisible, because no rule keyed on the object can see a module that never names it.

**And the arm that would have prevented it is the one I deleted in 62ad56e, one commit ago.** I
deleted it because `export const S = window.localStorage` already reds the arrival arm — which is
true, and irrelevant: the binding site being caught says nothing about the consumer. I measured a
two-file arm's cover with a **one-file mutant**, concluded "no cover of its own", and wrote that
conclusion into the ninth addendum as measured. The lesson is not "keep the arm" but **an arm's cover
has to be searched with the mutant that matters, not the nearest mutant to hand** — and the nearest
one is exactly the mutant already in your hand when you are about to delete something.

Restored, and stronger than planned: **forbidding the export** closes the hole at any number of hops,
where taint-tracking a handle across modules would need a fixpoint inside a unit test. Passing storage
as an *argument* stays allowed on purpose, because it is not silent — the call site names storage and
so is itself in the register, which is precisely `auth/AuthProvider.tsx`.

The first version of the arm **reddened on the real tree**, flagging `useInterviewStore` and
`usePersonaStore`: I had asked whether the initializer's subtree *contains* a storage reference, when
the rule I meant is whether the value *is* the storage object. Exporting a store that persists is the
normal case this register exists to describe. Narrowed, and the false positives became the control's
accepting half — see below.

**The peer's W3–W9 result turned back on my own file, and one branch was dead weight.** Their finding:
five of seven derivation-widenings QUIET, including one that reverted the fix the suite was written
for, with two structural causes — the derivations were untestable by construction (they read the real
source through a module-level constant) and nothing anywhere asserted a derivation's **output**. Both
were true here. So:

- `purgedInBody` became `purgedIn(src)` with the real source applied at the call site; `touchesStorage`
  and `exportsStorage` took an optional source defaulting to the real file. (`.filter(touchesStorage)`
  had to stop being point-free — `Array#filter` would have handed the new parameter the index, which
  `tsc` caught rather than any test.)
- A new arm drives all three against **doctored sources, in both directions**. Their §14 is the reason
  for the second half: a rule that refuses everything is exactly as useless as one that refuses
  nothing, and only the accepting half tells them apart.
- **Their W9 shape was live in my predicate.** Deleting the element-access branch of `verbOf` — which
  exists solely to excuse a bracket-form *read* — was QUIET: no arm exercised a bracket read, so the
  branch changed no result and was dead weight described as a check. It is now load-bearing, asserted
  by the accepting half. Their tell for the 15th kind (a guard whose subject was replaced by a better
  subject in the same change) fits a variation of mine: a branch whose *accepting* side nothing ever
  exercises, manufactured by tightening the refusing side.

Six widenings fired at the new control, each an edit to the seal, each read by the **name** of the
failing arm:

| widening | result | caught by |
|---|---|---|
| `isStorageValue` reverted to subtree-containment | RED | the arm **and** the control |
| conditional-branch handling dropped | RED | the control alone |
| `verbOf` element-access branch dropped | RED | the control alone |
| `isStorageRef`'s `window.X` half dropped | RED | positive control, departure arm, the control |
| `export { h }` handling dropped | RED | the control alone |
| destructured alias (`const { localStorage: ls } = window`) | RED | arrival arm — already covered |

Three have the control as **sole** cover. Regression of the earlier repertoire against the new
instrument: variable-verb RED, comment-mention RED, purge-derivation widening RED, pure-reader GREEN.
Nothing went quiet.

Gates: `check:transport` EXIT 0, `tsc --noEmit` EXIT 0, **114 files / 1733 tests** green. Both
CompetingMeasures halves remain **reported, not patched**, and the ninth addendum's residual paragraph
is corrected in place rather than rewritten.

## Eleventh addendum, same day — the peer's B1 found four quiet branches, and my own docstring was a mutant nobody had run

The peer's seventh message made two strikes. Both landed, and the second one landed on a sentence I
wrote myself one commit after learning the lesson it breaks.

**B1 — a branch whose obvious mutation is a no-op reads as covered.** Where a two-branch rule returns
the same allowed value either way, dropping one branch changes nothing, so its quiet is not evidence
of cover. Their property, fired on my `isStorageValue`:

| mutant | edit | before fix7/fix8 | after |
|---|---|---|---|
| N1 | conditional: drop `whenFalse` | **QUIET** | RED (doctored-sources arm) |
| N1b | conditional: drop `whenTrue` | — | RED |
| N2 | `??`/`||`: drop `left` | **QUIET** | RED |
| N2b | `??`/`||`: drop `right` | RED | RED |
| N4 | disable paren/`as`/non-null unwrapping | **QUIET** | RED |
| N5 | reason threshold `> 40` → `> 0` | **QUIET** | RED (handoff/reason arm) |
| N6 | `> 40` on `.length`, not `.trim().length` | — | RED |
| N7 | `isStorageRef` → `false` | — | RED |

Four holes, all of the same shape: **the case that runs THROUGH a branch is not the case that
distinguishes it.** Every refused case I had written took the far side, so the near side was decoration.
The fix is one case per branch, near side included, plus `as Storage` and `(window.localStorage)!`. N5
was a dead threshold — `> 40` where every real reason is 300–418 characters, so the number was inert on
the whole population; extracting `reasonIsReviewable` gave it something to be driven by.

**B2 — the floor's repair invitation.** Their strike: a count equal to the population invites a
two-part diff, delete the store and lower the number, whose second part is the repair the first
demands. Measured, and it was green. Two things came out of measuring it rather than conceding it:

- The "plain store" row of my own table was a claim about a subset whose size I had never counted.
  All eleven stores were dropped one at a time: **sole cover for exactly four** — useCanvasStore,
  useEvidenceStore, useHumanTaskStore, useInterviewStore — and doubled for the other seven. The
  property is general: **deletion is self-evidencing exactly when the subject is named twice.** A
  persisted key and an exemption entry live where the removing diff need not go, so they go stale and
  red; a purged store's name lives only in the purge body, which the same diff deletes.
- No stronger assertion exists for those four, so the improvement is the evidence a failure leaves.
  The population is now asserted BY NAME, both directions. Re-fired with both parts applied on the two
  plain unpinned stores, it reds on "a store named here is gone" — a third edit is required, and that
  edit is the record.

**And my own docstring was a mutant I never ran.** The export arm's comment said passing storage as an
argument "is deliberately not forbidden, because it is not silent", and that what remained unreachable
was "a callee holding the key while the caller holds the register entry; the entry's reason is where
that has to be said". Fired as the two-file pair that sentence specifies — `lib/writerCore.ts` writing
through a `Storage` parameter, `lib/callSite.ts` registered and passing `window.localStorage` —
**21/21 GREEN**, a new durable key shipping from a module no arm can see. "The entry's reason is where
that has to be said" is a hope about human discipline wearing a check's clothes. Struck in place;
`storagePassedToOurCode` now forbids the handoff to our own code and keeps the dependency case allowed
for a stated reason rather than by omission — measured first: all five real pass-sites in `src/` hand
storage to package imports, so the arm starts at zero false positives. Re-fired, X1 reds, and reds by
**only** that arm, because `writerCore.ts` writes through a parameter and the subject-keyed census
cannot see it.

*A prediction written into a docstring is a mutant nobody has run yet* — and this one carried my own
name, one commit after the peer taught me the same lesson about a one-file mutant against a two-file
arm.

**Two wrong-reason exits caught on the way, both silent.** A `sed` retarget of a mutant script whose
pattern did not match, so the re-fire measured the previous mutant; and a replay whose anchor regex
returned `null`, killing the patch process while `run.sh` printed EXIT 0 — a green that measured
nothing, invisible to my wrong-reason grep because the error was in a *different* process than the
vitest log. Mutant scripts now count their anchor and exit 9 on 0 or >1 matches. Third instance in two
days of the same class: **my wrong-reason detector only sees the log it greps.** And once more at the
end: the first B2 re-fire went red on the pinned-name assertion three lines above the new one, which
would have credited the new arm with cover it had not shown — caught by reading the failing
assertion's MESSAGE, not the exit code.

Seal: 18 → **23 arms**. Gates: `check:transport` EXIT 0, `tsc --noEmit` EXIT 0, **114 files / 1735
tests** green. `tsc` again caught what no test could — a point-free `.filter(touchesStorage)` would
have been handed the array index as its source argument.
