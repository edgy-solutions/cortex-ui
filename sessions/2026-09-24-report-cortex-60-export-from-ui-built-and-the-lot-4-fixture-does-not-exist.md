# Export from the UI — built and sealed; and the lot 4 fixture does not exist

**Lane:** cortex-60 · cortex-ui/master · 2026-09-24
**Order:** OVERNIGHT: EXPORT FROM UI (from the architect, placed by Chris)
**Commit:** `8564bce` — `feat(export): a drawn card exports as one self-contained HTML file`
**State:** guard green (9 sites / 7 files), `tsc` clean, **1659 tests / 111 files** (baseline 1599 / 109)

---

## 1. The headline, first: the order's fixture has no referent

The order says *"Start with CONTRIBUTION_RANKING using the lot 4 fixture"* and seals the work
with *"Fixture from the real payload."* Measured against this repo on 2026-09-24, **neither phrase
names anything that exists**, and the order's own discipline — *"never invent it"* — forbids
manufacturing one and calling it real. So it is reported rather than papered over.

Three separate measurements, in increasing order of how much they settle:

**(a) There is no lot 4 fixture.** The string `Lot 4` occurs in exactly one file in the repo:
`src/components/planning/ContributionRanking.test.tsx`, five times, at lines 189, 197, 206, 214
and 224 — every one of them `scope_label="Lot 4"` on a `render()` call. It is a label passed to a
component in a test. There is no stored payload behind it.

**(b) No capture ever projected to CONTRIBUTION_RANKING.** The nine `sessions/*payload*.json`
files projected to KNOWLEDGE_DOCUMENT, VARIANCE_TREE (×2), SHORTFALL_GRID, MULTI_SERIES,
ELICITATION (×2), COMPETING_MEASURES — and one has no `projected` key at all.

**(c) The one capture that considered the archetype REFUSED it, and said why.** This is the
measurement that turns an absence into a finding. In
`2026-09-19-payload-finance-np-meridian-brief.json`, at `presentation_provenance.refusals[]`:

```
archetype: "CONTRIBUTION_RANKING"
reason:    "no typed contract for CONTRIBUTION_RANKING; and output_uri matched no capability,
            so nothing declared this archetype for this answer"
```

Twenty-four occurrences of the string in that file are all this one refusal, repeated through
`raw_events`. So the archetype is not missing from the captures because nobody asked — **the
producer declined it, with a stated cause, and recorded the declining.** Half of that cause has
since been answered on this side: `ContributionRanking.contract.ts` exists, so there IS a typed
contract now. The other half — `output_uri matched no capability` — is still open, and it is the
reason a real capture still cannot arrive. **That is the thing to fix if a real lot 4 payload is
wanted, and it is not on this side.**

This is the distinction the lane already has a name for: *absent from the menu is not refused.*
Here it is the inverse and the rarer case — a refusal that left evidence, which is worth more than
an absence that did not.

### What was built against instead, and how it is labelled

`src/lib/cardExport.fixture.ts` composes the most real material available and **labels each half
by how real it is**, in a header written to be read before the values are trusted:

| Part | Provenance | Real? |
|---|---|---|
| Rows (CA1/CA2/CA3) | `ContributionRanking.test.tsx`, annotated by its author *"The producer's real row shape, field for field"* | **Shape yes, values no.** Not a capture. |
| Envelope key set + order | The real `variance-drivers` capture's base fields, in its order, then the producer's own projector tuple in its order | Yes |
| `verdict` | The real capture's sentence, verbatim | Yes |
| Provenance (all six) | `2026-09-19-payload-finance-variance-drivers.json` — `asked_as.persona`, `routing.action.label`, `routing.handled_by.engine_name`, `fleet_sha`, `prompt` | **Yes, every field** |
| `method` | Nowhere. Absent by measurement | n/a |

So *"from the real payload"* is honoured for the provenance and the envelope, and explicitly is
**not** honoured for the rows. The rows carry uneven optional fields on purpose — CA1 has
`bcws/bcwp/acwp`, CA2 and CA3 do not — because a fixture where every row carries every optional
field cannot catch a renderer that assumes they are always present, and this card declares seven
separate absence attributes precisely because they are not.

**The ask:** if a real lot 4 CONTRIBUTION_RANKING capture exists outside this repo, hand it over
and the rows and envelope swap out with the seals unchanged. If the seals then fail, the fixture
was carrying the test rather than the test carrying the fixture, and that is worth knowing. If no
such capture exists, the open half of the producer's refusal is what to close first.

---

## 2. What was built

One pure module, one thin DOM module, one button, two seal files.

| File | Lines | What it is |
|---|---|---|
| `src/lib/cardExport.ts` | 460 | Pure. The whole document is decided here. |
| `src/lib/cardExportCapture.ts` | 84 | DOM only: read the stylesheets, read `outerHTML`, hand over a Blob. |
| `src/lib/cardExport.fixture.ts` | 165 | The fixture and its provenance header. |
| `src/lib/cardExport.test.tsx` | 31 tests | The builder's seals. |
| `src/lib/cardExportFinance.test.ts` | 29 tests | The same builder over all nine real captures. |
| `src/components/AgenticCanvas/CardExportButton.tsx` | 110 | The action. A click handler with a tooltip. |
| `src/components/AgenticCanvas/StageCard.tsx` | +19 / −1 | An import, a `bodyRef`, and the button in the answer face's header. |

The exported file carries four sections in the order the order named them:

1. **The card as rendered** — the live `outerHTML`, with the page's own CSS inlined.
2. **The full payload** — every leaf, at its dotted path, through no formatter.
3. **How the producer computed this** — formula, inputs, bound. Or the sentence.
4. **Provenance** — persona, verb, engine, roll sha, timestamp, question asked.

**Section 2 exists because of section 1.** The card formats for a reader: `-800000` draws as
`-800,000`, `0.62` draws as `62%`. Both are right for a card and neither is the value. An export
whose only numbers are the drawn ones cannot be checked against the producer. There is a seal
asserting that at least one verbatim value does **not** appear in the card markup — if that ever
failed, section 2 would be duplication and this module's premise would be wrong.

**Two deliberate small decisions, both in comments at their site:**

- The export captures the card **body**, not the whole card, because the header holds the export
  button itself and an export containing its own button is a picture of the app, not of the answer.
- The frame neutralises `position`/`inset`/`transform` on the outermost captured elements only.
  A stage card wraps its content in `absolute inset-0` for the camera and the preview branch adds
  a FitBox `scale()`; inlined into a plain document, the absolute child collapses out of flow and
  the scale renders a legible answer as a thumbnail. **That shell is canvas layout, not the card.**
  The card's internal layout is untouched, because that *is* the card as rendered.

---

## 3. Absence is rendered, never filled

`method` is in **no wire type and no capture** — `grep -in method src/api/types.ts` is empty, and
so is every payload file. The order says it *"arrives from the worker tonight"*, so the absent path
is the one that could be built and sealed today, and it was built as the primary path.

- `readMethod` returns null for anything that is not a method block, and **a block with no formula
  is dropped whole**. The formula is the claim; inputs and a bound are its colour. This is the same
  rule `readPresentation` applies to `selection_basis`, for the same reason.
- Null draws `method not supplied` — the order's exact words — never an empty section, never a
  dash. A blank section is indistinguishable from a section that failed to render, and the seal
  asserts *not a blank* **directly** rather than inferring it from the sentence being present.
- Nothing derives a method. No formula is reconstructed from the rows, no bound inferred from a
  threshold. There is a seal asserting no `=` appears anywhere in that section when `method` is
  null, so a future "helpful" reconstruction trips it.

The same discipline covers provenance, which will look mostly empty on real artifacts for a while.
**`roll sha` has no field of its own on the wire** — `fleet_sha`/`repo_sha` live on the session
capture *wrapper*, not on the artifact — so it is read from `produced_by.code_hash`, falls back to
`version`, and renders `absent` otherwise. Every provenance line renders a captured value or the
word absent; a seal asserts all six cells and that none is ever empty.

Each of the three fallback chains in `readExportProvenance` is named and justified at its site,
and the persona one is sealed against inputs where the two candidates **disagree** — they agree on
most rows, which is exactly why a test where they matched would not establish which is being read.

---

## 4. The verbatim seal, and the proof it can fail

The order's first seal is *"exported HTML contains every payload value verbatim."* The obvious
spelling is `for (v of values) expect(html).toContain(v)` and it is **weak in both directions**:
it cannot see a value that went missing under a path that still renders (`0.62` passes if it
appears anywhere at all, including inside a hex colour), and it cannot see one that crept in — a
duplicated row, a leaked field, a cell emitted twice all pass a containment sweep unchanged.

So the seal **parses** the document, extracts the payload table's path→value pairs, and compares
them to an independent flattening **pairwise, in order, with a count**, plus a cross-check that the
table's own declared `data-cx-payload-cells` agrees with what it emitted.

**Redproof — three mutations against the builder, baseline restored green after each:**

| Mutation | Tests red |
|---|---|
| Absent-method branch renders a blank instead of the sentence | 1 |
| `formatLeaf` formats numbers with `toLocaleString` | 3 |
| Walker silently skips boolean leaves | 1 → then 2 |

### The weakness the third mutant exposed

The boolean-skip mutant went red on **one** test — and **not the pairwise/count seal**. Because
that seal compares the document against `flattenPayload(payload)`, and *both sides run the same
walker*. A defect inside the walker moves both sides together: the document lost two cells, the
expectation lost the same two, and they agreed. **The cardinality seal measures "the builder
rendered what the walker produced", not "the walker found everything in the payload."**

Fixed with a **hand-written 25-leaf oracle** — every path and value of the fixture, spelled out —
which is now the only assertion in the file that can indict the walker itself. Re-running the same
mutant afterwards: **2 red**, including the oracle. That is the difference between a seal that is
right and a seal that is reachable.

The oracle also asserts `threshold` is **not** among the paths, so the day one arrives, the list is
what says so rather than quietly widening.

---

## 5. Finance panels — in the same commit, and against real payloads

The order says *"Finance panels second, same shape."* They are in the same commit because **there
was no per-archetype code to add**: the builder reads `rendered_output.components` and walks
whatever it finds. `"Same shape"` is therefore not asserted by inspection — it is asserted by the
identical builder being run over all nine real captures, covering six archetypes. If any needed
special handling, a test fails rather than a reviewer needing to notice.

This is also where *"Fixture from the real payload"* is genuinely honoured: these are producer
captures, not composed fixtures, and they are data this lane cannot edit. They live in a **separate
file** from the builder's seals on purpose — if the producer's captures change shape, that file
goes red while the fixture-based file stays green, and the difference between those two signals is
the point.

**Eight of the nine are captured answers. The ninth is not**, and it was kept deliberately.
`2026-09-19-payload-from-32-np-meridian-brief.json` matches the `*payload*` glob but is a different
document altogether — `{program_id, identity, findings, holes, rows, summary}`, with **no
`projected`, no `prompt`, no `routing`**. Not an empty projection: no projection key at all. Its
export renders one payload cell and six `absent` provenance lines, which is the correct rendering
of a document this surface knows nothing about.

It also caught a wrong assumption of mine: the provenance test was first written
`expect(get("question asked")).toBe(c.prompt)`, on the assumption that a file matching `*payload*`
is a captured answer. **That file is what said otherwise**, and the assertion is now
`?? ABSENT_MARK` with the reason recorded beside it.

A second wrong premise of mine was caught the same way. The absence-attribute seal first ran
against the **complete** fixture, which declares no absences — so it compared an empty set to an
empty set and passed while measuring nothing. The non-empty guard I had put beside it is what said
so. It now renders rows with `favourable` dropped, which is what makes the card emit
`data-no-verdict`, so there is something for the export to lose.

---

## 6. Two findings on the producer boundary, neither fixed here

**(a) A stale comment on this side, now measured false.**
`SemanticInterpreter.tsx`, at the CONTRIBUTION_RANKING case, says the producer's per-archetype
projector tuple *"names four fields which do not include"* `threshold` / `threshold_defaulted`.
Read from the producer at `agent_fleet/presentation_agent/main.py:752`:

```python
"CONTRIBUTION_RANKING": ("rows",
                        ("value_label", "value_unit", "scope_label", "verdict",
                         "threshold", "threshold_defaulted")),
```

It names **six** and it **does** include them. The producer added them after that comment was
written. **Left unfixed** — it is the interpreter's comment, not the export's, and the order is
about the export — but a reader who trusts it reaches the wrong conclusion about whose side a
missing bound is on. Flagged for a ruling on whether to correct it.

**(b) Declared by the projector, never observed on the wire.**
Those same two fields appear in **no** payload under `sessions/`. So they are in a third state,
distinct from both *"not wired"* and *"arriving"*: **declared and never seen.** The fixture omits
them for that reason — supplying them would test the card's bound-present branch against a shape
nothing has yet produced. That branch is sealed in the card's own tests, where it belongs.

The fixture's earlier draft omitted them citing the stale comment (a) as authority. That reasoning
was wrong even though the outcome was right, and the header now records the measured reason
instead. **A right answer reached through a false premise is one payload away from being a wrong
one.**

---

## 7. The transport guard's blind spot, from the other side

The guard failed the first full run with one undeclared site:

```
src/lib/cardExport.test.tsx:444  [fetch]
    const dirty = `<div onclick="steal()"><script>fetch('/x')</script><p>kept</p></div>`;
```

That is a **string literal** — fake dirty markup used to prove `stripExecutable` strips scripts.
It is a false **positive**, and the exact mirror of the false **negative** already recorded against
`src/api/client.ts:58` (a live `axios.get<Entitlements>` the regex cannot see). Same root cause
both ways: a line regex has no idea what is a call.

**Fixed by not writing a fake fetch** — the script body is now `alert(document.cookie)`. Declaring
a transport exception would have put a site that does not exist into the register whose entire job
is to list the ones that do. The guard was not weakened and its blind spot was not widened.

---

## 8. Evidence

A real export was emitted from the fixture through the real card (`renderToStaticMarkup` over
`ContributionRanking`) and verified **by counts, never by reading the generated HTML**:

```
payload rows in table : 25
declared cell count   : data-cx-payload-cells="25"
method marker         : data-cx-method="absent"
provenance lines      : 6
sections              : 4
"method not supplied" : 1
network refs          : 0   (no <script, no @import, no <link, no src="http)
headings              : The card as rendered / The full payload /
                        How the producer computed this / Provenance
```

10,891 bytes with no CSS inlined. The emitting test was temporary and was deleted; the file sits in
this session's scratchpad, uncommitted — it is generated output, and the repo already carries three
tracked generated files it should not.

---

## 9. Not done, on purpose

- **ADR-0055 step 2 stays held**, per the order. Untouched.
- **The transport-guard blind spot at `client.ts:58` stays held**, per the earlier order. The
  false positive in §7 is a *different* defect in the same guard and was resolved without touching
  the guard or the held site.
- **The stale `SemanticInterpreter` comment (§6a) is not corrected.** Needs a ruling.
- **`helm/` untouched.** The `tag: latest` default and the missing `required` guard, reported on
  2026-09-23, remain unfixed: a chart default is deploy-affecting and no order covers it.
- **No real lot 4 capture was manufactured.** See §1.

## 10. What a next lane should check first

When the worker's `method` block lands, the tests in `cardExportFinance.test.ts` that assert
`method not supplied` **will go red**, and that is by design — their failure is the notification
that the present-method path is now live on real data. The line to check first is where
`CardExportButton` looks for it: the component payload, then the `rendered_output` envelope. Both
plausible levels are read and neither is invented; if it arrives somewhere else, the export will
correctly say "not supplied" about a field the producer genuinely sent, and **that** is the failure
mode to watch for, because it is the one that looks like success.

Classify the level before assigning the bug: row-level arrives, envelope-level gets dropped.
