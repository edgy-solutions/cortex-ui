# Inventory — every hand-kept site that names an archetype, in both repos

to:       the architect
from:     ia-cortex-60/lane/cortex-60
re:       the inventory ADR-0055 step 2 starts from. READ-ONLY; nothing was built.
session ref: `sessions/2026-09-19-inventory-cortex-60-every-hand-kept-archetype-site-in-both-repos.md`

    cortex-ui     901ef82  (master, this lane's HEAD at the time of reading)
    producer      9c7ea4b3690cef473b2885bd276eade155ae6d38  — ../invincible-agent, read off the disk
                  ⚠ the PIN and the DEPLOYED fleet are c0005142; 9c7ea4b is a descendant that the
                  shared checkout advanced to mid-session. Both shas are stated because the
                  inventory was read at 9c7ea4b and the fleet is running c0005142.

---

## ⛔ READ THIS BEFORE YOU RUN STEP 2 — EVERY COUNT BELOW IS A LOWER BOUND

**Placed at the top on the architect's order, 2026-09-23, because it is the thing that will bite
whoever extracts an archetype and it is buried in §0 where a person starts reading at §3.**

A search for an archetype id finds it in the shapes a grep *thinks* of — an `archetype:` field, an
`archetype ===`, a `case` in a dispatch. **It does not find the id where it is a bare member of a
type or a list**, and this repo has exactly that, twice, in one file:

    answerDisplay.ts:28    | "SOURCE_LEDGER"          ← a bare member of a TS UNION TYPE
    answerDisplay.ts:78      "SOURCE_LEDGER",         ← a bare member of a STRING ARRAY

Both are load-bearing. Both were **missed by the derivation that this inventory was built to be
more careful than**, and they were recovered only because the architect had four sites already
filed and two of them were not on my list. The inventory's numbers were then rebuilt as *every
occurrence of the 28 known ids*, which is complete **for site kinds that name the id** — and says
nothing about a site kind nobody has thought of yet.

> **WHAT THIS MEANS FOR AN EXTRACTION.** Move an archetype's rendering and leave one of these
> behind and nothing goes red: a union member that still lists the id keeps type-checking, an
> array member that still lists it keeps the old branch reachable, and the card renders from the
> new home while a stale list quietly still claims the name. The failure is *silent* and it
> surfaces as a card that draws from the wrong place under one caller.

**So before declaring any extraction complete, grep the id with NO syntactic anchor at all** —
the bare quoted string, comment-stripped, across both repos — and account for every hit by hand.
That is more hits than you want to read, and it is the only sweep that has not been wrong yet.

The two corrections that produced this warning are written up in full in §0 (ERROR 1, the
undercount; ERROR 2, the comment that counted as a site). **COMPETING_MEASURES goes first**, per
§4 — and note that `CONTRIBUTION_RANKING` is a *worse* first candidate for having been changed
recently, which is the opposite of the intuition that a fresh file is the safe one to move.

---

## 0. HOW THE LIST WAS DERIVED, AND THE TWO TIMES THE DERIVATION WAS WRONG

You asked me not to start from the runbook's six sites or the ADR's list. I did not. The universe
was built in two passes over the source, and **both passes were wrong in a way worth recording,
because each error is the shape this inventory exists to catch.**

**Pass 1 — the universe.** Every `SCREAMING_SNAKE` string literal sitting in a position where the
code ASSERTS it is an archetype: an `archetype:` field, an `archetype ===` comparison, or a `case`
in the dispatch or the glyph. That is a *derived* definition — personas (`COST_ANALYST`,
`SAFETY_ENGINEER`, `PORTFOLIO_LEAD`…), chart sub-variants (`SCATTER`, `ROW_TABLE`) and test
inventions (`NOT_A_REAL_THING`, `SOMETHING_NEW`) all fail it without my having to name them.
**28 archetypes.**

⛔ **ERROR 1 — MY OWN LIST WAS AN UNDERCOUNT, AND YOUR FOUR FILED SITES ARE WHAT CAUGHT IT.**
Pass 1 found `answerDisplay.ts:179` for `SOURCE_LEDGER` but **not** `:28` or `:78`. Those two sites
hold the archetype id in forms no pattern of mine could see:

    answerDisplay.ts:28    | "SOURCE_LEDGER"          ← a bare member of a TS UNION TYPE
    answerDisplay.ts:78      "SOURCE_LEDGER",         ← a bare member of a STRING ARRAY

So the very check you told me the four sites were proof of, they proved again — on the list built
to avoid the mistake. Counting was redone as *every occurrence of the 28 known ids*, which is
complete because the id set is fixed. **Any count in this file is still a lower bound for a site
kind nobody has thought of.**

⛔ **ERROR 2 — A SEARCH BY NAME FINDS PROSE ABOUT THE NAME.** The corrected count gave
`CONTRIBUTION_RANKING` 8 cortex sites. One was **a comment I wrote earlier tonight** in
`SemanticInterpreter.tsx` mentioning `_PROJECTED_ARCHETYPES["CONTRIBUTION_RANKING"]`. This repo
already has a seal written after exactly that bug (`contributionRankingFixtures.test.tsx` strips
comments first, and its header says why). **Every figure below is comment-stripped** — TS block
and line comments blanked, Python `#` stripped — and it moved real numbers: `CONTRIBUTION_RANKING`
fell 8→7 on the cortex side and 20→15 on the producer side.

**Tests are excluded throughout.** A test naming an archetype is not a site a contributor adding
one must edit.

---

## 1. THE SITE KINDS, AND WHICH ARE HAND-KEPT

| # | site | file | holds | hand-kept? |
|---|---|---|---|---|
| 1 | dispatch case | `src/components/registry/SemanticInterpreter.tsx` | which component draws it | **HAND-KEPT** |
| 2 | layout/acted-on test | same file, `archetype === "…"` chains | full-width vs inline; acted-on | **HAND-KEPT** |
| 3 | glyph case | `src/components/NeuralStream/ArchetypeGlyph.tsx` | the stream icon | **HAND-KEPT** |
| 4 | union member | `src/lib/answerDisplay.ts` (`AnswerArchetype`) | the type | **HAND-KEPT** |
| 5 | display list | `src/lib/answerDisplay.ts` (`DISPLAY_ARCHETYPES`) | what may not fall to the fallback | **HAND-KEPT** |
| 6 | label case | `src/lib/answerDisplay.ts` | the human label | **HAND-KEPT** |
| 7 | contract | `src/components/**/X.contract.ts` (`archetype:`) | fields, refusals, layout | **the declaration** |
| 8 | HUD contract map | `src/lib/unconsumedFields.ts` (`CONTRACTS`) | which contract measures which archetype | **HAND-KEPT** |
| 9 | capability row | `src/registry/assembleCapabilities.ts` | cortex's own menu row | **PARTLY DERIVED** — rows whose component exports a contract are assembled from it (ADR-0017 amendment); the rest are legacy literals |
| 10 | fixtures | `src/components/**/fixtures/*.ts` | discriminating payloads | **HAND-KEPT** |
| — | **producer** | | | |
| 11 | admission allowlist | `agent_fleet/presentation_agent/capability_admission.py` | which archetype ids may be registered at all | **HAND-KEPT** |
| 12 | projector tuple | `agent_fleet/presentation_agent/main.py` (`_PROJECTED_ARCHETYPES`) | payload key + the envelope fields carried | **HAND-KEPT** |
| 13 | capability row | `agent_fleet/presentation_agent/capabilities.py` (`PRESENTATION_CAPABILITIES`) | subject → archetype binding, one per BINDING | **HAND-KEPT** |
| 14 | walk census | `src/iagent_pure/walk_census.py` | the archetype's row key, for the census runner | **HAND-KEPT** |
| 15 | verb emission | `agent_fleet/*_agent/measures.py`, `main.py` | a verb naming its own archetype | **HAND-KEPT** |

**`policy/archetypes/` DOES NOT EXIST.** I checked the producer's `policy/` tree: `canvases`,
`decisions`, `graphs`, `measures`, `overlays`, `sync`, `task_kinds`, `workflows` — no
`archetypes`. So it is the planned extension point, **not a site anyone edits today**, and it
cannot appear in a census of current cost.

**The runbook's "six sites" is an undercount for every archetype in the table below.** The
cheapest card in the fleet touches nine.

---

## 2. THE CENSUS — 28 archetypes, comment-stripped, tests excluded

| archetype | cortex | producer | TOTAL |
|---|---:|---:|---:|
| KNOWLEDGE_DOCUMENT | 20 | 42 | **62** |
| CHART_WIDGET | 16 | 16 | 32 |
| APPROVAL_TASK | 14 | 12 | 26 |
| ELICITATION | 13 | 9 | 22 |
| CONTRIBUTION_RANKING | 7 | 15 | 22 |
| GROUPED_REVIEW | 15 | 4 | 19 |
| PROCESS_TOPOLOGY | 11 | 7 | 18 |
| MULTI_SERIES | 7 | 11 | 18 |
| SOURCE_LEDGER | 12 | 3 | 15 |
| ASSET_STATE_METRIC | 10 | 5 | 15 |
| HAZARD_DECLARATION | 10 | 5 | 15 |
| DECISION_RECORD | 7 | 8 | 15 |
| INSTANCES_BY_PROPERTY | 11 | 3 | 14 |
| SHORTFALL_GRID | 8 | 6 | 14 |
| TRIAGE_TASK | 10 | 2 | 12 |
| VARIANCE_TREE | 7 | 5 | 12 |
| DELTA_SET | 7 | 5 | 12 |
| INTERVAL_TIMELINE | 8 | 3 | 11 |
| THRESHOLD_GRID | 8 | 3 | 11 |
| COMPETING_MEASURES | 7 | 4 | 11 |
| MATRIX_GRID | 8 | 3 | 11 |
| FORECAST_MEASURE | 7 | 4 | 11 |
| STEP_LADDER | 6 | 5 | 11 |
| PERIOD_SERIES | 7 | 3 | 10 |
| NAMED_HOLE | 6 | 4 | 10 |
| WORKFLOW_OBSERVATION | 8 | 1 | 9 |
| DIGITAL_TWIN_3D | 5 | 1 | 6 |
| CANVAS_SEED | 3 | 2 | 5 |

**MOST SITES: `KNOWLEDGE_DOCUMENT`, 62** — and it is not a card, it is the **fallback**. Its
count is high for a different reason from everything else: every routing decision that gives up
names it, on both sides. It is the worst candidate for extraction and the best argument for the
abstraction, and those are the same fact.

Among things that are actually cards: **`CHART_WIDGET`, 32** — the archetype whose contract
already warns that it is the one exception to every rule (`chart_data` is a JSON *string*).

**FEWEST SITES: `CANVAS_SEED`, 5** — because it is barely an archetype: no glyph case, no
`answerDisplay` entry, an orchestration rather than a measure. **`DIGITAL_TWIN_3D`, 6**, is lower
still by intent — its dispatch was *removed* in June and only the glyph and label survive, which
makes it the measured cost of a card nobody draws: **six sites still naming something that cannot
render.**

---

## 3. THE RATIO

⛔ **THE CAPABILITY ROWS DO NOT COLLAPSE, AND THE FIRST VERSION OF THIS SECTION SAID THEY DID.**
A `PRESENTATION_CAPABILITIES` row is per **BINDING** — one subject to one archetype — not per
archetype. `CONTRIBUTION_RANKING` carries **six** of them:

    fin:VarianceDriverRanking · cost:LotCostBreakdown · cost:LaborComposition
    cost:CategoryBreakdown · cost:SupplierConcentration · safety:OrphanedHazardSet

Six producers, one archetype. Under *one package plus one row* those six stay six, because they
say different things. So the honest ratio counts only **structural** sites — the ones that exist
solely because the archetype exists:

| archetype | structural sites today | after ADR-0055 | ratio | bindings (unchanged) |
|---|---:|---:|---|---:|
| CONTRIBUTION_RANKING | 10 | 1 package + 1 | **5:1** | 6 |
| ELICITATION | 11 | 1 package + 1 | **5.5:1** | 1 |
| COMPETING_MEASURES | 9 | 1 package + 1 | **4.5:1** | 1 |
| SOURCE_LEDGER | 11 | 1 package + 1 | **5.5:1** | 1 |

Structural = cortex's 7 (dispatch, layout test, glyph, union, display list, label, contract) plus
the producer's admission entry, projector tuple and walk-census key where each exists, plus
fixtures where they are archetype-shaped rather than payload-shaped.

**So the abstraction is worth roughly a 5:1 reduction in structural edit sites, and 0:1 on
bindings.** That is a smaller headline than "six sites become one" and it is the one that will
survive contact with the sixth producer.

---

## 4. WHICH OF THE THREE TO EXTRACT FIRST — `COMPETING_MEASURES`

**Recommendation, not a start.**

| | COMPETING_MEASURES | CONTRIBUTION_RANKING | ELICITATION |
|---|---|---|---|
| total sites | **11 (lowest)** | 22 | 22 |
| bindings | **1** | **6** | 1 |
| producer files | 3 | 6 | 5 |
| projector tuple | yes | yes | yes, and it is **not** a plain row passthrough |
| fixtures | payload-shaped | payload-shaped | **5 archetype-named fixture sites** |
| special paths | none found | none found | emitted from `main.py` in two places; a `slot_disposition.py` URI; read by the census by `archetype ==` |

**`COMPETING_MEASURES` is cheapest on every axis I measured.** One binding, three producer files,
no second emission path, and its cortex sites are exactly the canonical seven. It is the closest
thing in the fleet to a control case: if the package shape cannot be made to fit this one, the
shape is wrong, and that is a finding worth having before six bindings are in play.

**`ELICITATION` is the trap.** Its total ties CONTRIBUTION_RANKING, but the sites are *different
in kind*: it is emitted from the presentation agent itself at two sites, it owns a URI in
`slot_disposition.py`, the census matches it by `archetype ==` rather than by a table, and five of
its cortex sites are fixtures that name the archetype. Extracting it first would mean designing
the extension point against the least typical member of the set.

### Does changing it twice tonight make CONTRIBUTION_RANKING better or worse to go first?

**Worse, and not for the reason it looks.** The changes themselves are an argument *for* it —
after W4-1 and W4-2 I know that card's branch census, its fixture set and its contract better than
anyone will next week, and both commits left it greener than they found it.

**But that is exactly the disqualification.** Its six bindings mean an extraction there is
simultaneously testing the package shape and the hardest binding case in the fleet, so a failure
would not say which of the two was wrong. And the card is **the one Chris has not yet walked**:
W4-1 changed what every row of a supplier-concentration card prints, and W4-2 wired a header that
draws nothing until the projector moves. **Step 2 starts after the walks record what these cards
look like today** — and this is the one card whose "today" changed twice in the last six hours and
has never been seen. Extracting it first would rebuild the thing whose baseline is least settled.

Do `COMPETING_MEASURES` first. Do `CONTRIBUTION_RANKING` second, when its walk is on paper and the
shape is already proven — at which point its six bindings become the *useful* test rather than a
confound.

---

## 5. WHERE `SOURCE_LEDGER` STANDS AGAINST THE PACKAGE SHAPE

**What it already has** — more than any other card, which is why it reads as a near-package:

* a contract declaring fields, refusals and the disposition vocabulary
  (`SourceLedger.contract.ts`), with `LEDGER_DISPOSITIONS` / `LEDGER_HOLE_DISPOSITIONS` exported
  rather than inlined;
* a **discriminating fixture set** with six payloads (`fixtures/sourceLedger.ts`), and a seal that
  flips each declared absence in both directions and scopes the flip **per producer clause** —
  the only card in the repo whose fixtures know that an absence can be *unreachable* rather than
  merely absent;
* the four ADR-0055 §2 declaration sites filed and landed;
* a glyph, a label, a display-list entry and a dispatch case — the full canonical seven.

**What it could not have, because no extension point exists:**

1. **No `policy/archetypes/` row.** The directory is not in the producer's `policy/` tree at all.
   Its binding lives as a hand-kept `PRESENTATION_CAPABILITIES` literal and an admission-list
   entry, because those are the only homes on offer.
2. **No projector entry — and it is the only one of the four that has none.** `SOURCE_LEDGER` does
   **not** appear in `_PROJECTED_ARCHETYPES`; cortex's dispatch hands it `component={comp}`
   whole. Measured by absence *with a control*: the same read finds `main.py` entries for
   `CONTRIBUTION_RANKING`, `COMPETING_MEASURES` and `ELICITATION`, so the empty result is about
   `SOURCE_LEDGER` and not about the read. **This is a real asymmetry, not a gap I am proposing to
   close tonight:** it is the only step-2-adjacent card whose envelope reaches the component
   intact, which means it is the one card where a W4-2-shaped defect could not occur.
3. **No declared home for the disposition vocabulary.** It is enforced in three places — cortex's
   contract, the producer's presentation agent, and now the `iagent-mesh` SDK — and the only
   mechanism holding them together is `dispositionJoin.test.ts`, which reads the producer's
   *source text*. A package shape with nowhere to put a shared vocabulary leaves that join as the
   sole arm.

---

## 6. MEASURED vs INFERRED

| # | claim | M/I | how |
|---|---|---|---|
| 1 | 28 shipped archetypes in cortex | **[M]** | derived from source in two passes; personas/chart-variants/test ids excluded by a rule, not by a list |
| 2 | the derivation undercounted union-type and array members | **[M]** | `answerDisplay.ts:28` and `:78` read directly after pass 1 missed them |
| 3 | one `CONTRIBUTION_RANKING` "site" was my own comment | **[M]** | identified by line; all counts re-run comment-stripped |
| 4 | per-archetype counts in §2 | **[M]** | full occurrence match of the 28 ids, comments stripped, tests excluded |
| 5 | `policy/archetypes/` does not exist | **[M]** | `git ls-files -- policy/` — eight dirs, none named archetypes |
| 6 | `SOURCE_LEDGER` has no `_PROJECTED_ARCHETYPES` entry | **[M]** | absence, with three other archetypes found in the same file as the control |
| 7 | `CONTRIBUTION_RANKING` has six capability bindings | **[M]** | six `archetype:` rows read in `capabilities.py` with their subjects |
| 8 | `assembleCapabilities.ts` is partly derived | **[M]** | the file's own ADR-0017 amendment note, read |
| 9 | the 5:1 structural ratio | **[I]** | arithmetic over [M] counts, against an *assumed* "one package + one row" end state. The end state is the ADR's, not something I measured. |
| 10 | `COMPETING_MEASURES` is cheapest to extract | **[I]** | inferred from [M] counts and site kinds. A recommendation. |
| 11 | `ELICITATION` would be the worst first candidate | **[I]** | inferred from its site *kinds*, not from attempting it |
| 12 | `DIGITAL_TWIN_3D`'s six sites name an undrawable card | **[M]** | the dispatch removal is documented in `SemanticInterpreter.tsx`'s import block; the glyph and label sites were read |
| 13 | a site kind nobody has thought of would change §2 | **[I]** — and a **guess** | two site kinds were already missed once tonight. I have no measurement of a third. |

---

**Nothing was built.** No `defineArchetype`, no card moved, no fixture touched, no
`policy/archetypes/` row. The producer was read only — `git status --porcelain` there is clean and
I wrote nothing into it.

Lane: ia-cortex-60/lane/cortex-60
