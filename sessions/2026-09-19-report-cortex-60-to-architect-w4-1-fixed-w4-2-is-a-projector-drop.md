# Report — cortex-60 to the architect: W4-1 is fixed, W4-2 is a projector drop, and the instrument could not have told you

to:       the architect
from:     ia-cortex-60/lane/cortex-60
re:       LOT 4 walk findings W4-1 / W4-2, and the one question asked
session ref: `sessions/2026-09-19-report-cortex-60-to-architect-w4-1-fixed-w4-2-is-a-projector-drop.md`

Every claim is **[M]** measured this session or **[I]** inferred. An **[I]** about a cause I did
not measure is called a **guess** in as many words.

---

## 0. THE QUESTION YOU ASKED, FIRST

> does `src/components/planning/` differ between `df702ca` and `8a13dd6`?

**[M] NO. Not by one byte. The armed roll does not change this card at all.**

    git diff --stat df702ca 8a13dd6 -- src/components/planning/   ->  empty
    git ls-tree -r --name-only df702ca -- src/components/planning/ | wc -l  ->  50
    git ls-tree -r --name-only 8a13dd6 -- src/components/planning/ | wc -l  ->  50

⛔ **AND THE EMPTY IS CONTROLLED, because an empty diff is exactly the shape a bad path or a bad
sha produces** — the null-from-my-own-filter mistake this lane made twice yesterday. Both shas
resolve to commits; the path is populated with the same 50 files at both ends; and the
**unfiltered** diff between the same two shas is NOT empty — 12 files, 1018 insertions, all of them
`sessions/`, `ledger/`, `registry/`, `ArchetypeGlyph`, `answerDisplay`. The machinery works and was
asked a real question. The answer is a fact about the repo, not about my filter.

**Consequence for you: the roll is orthogonal to both walk findings.** Rolling changes nothing
here, and NOT rolling blocks nothing here. W4-1's fix is a new commit either way.

---

## 1. W4-1 — FIXED. `b719616`, its own commit, not in the pin-bump.

**[M] Your reading was right, and exact.** `displayableExtra` admitted `number | string` only, so a
boolean fell through to `return null`, and the `absent` test below it (`null` / `undefined` / blank
string) does not cover booleans — so every boolean landed in `dropped`. The card then printed the
key name and the words "not drawable here", the same sentence for `true` and for `false`.

**The ruling is implemented as written:** a boolean is a one-cell value; shown under the producer's
field name, verbatim, `true` / `false`; no tick, no synonym, no tone, and nothing keyed on the word
"threshold". Objects, arrays and non-finite numbers stay in `dropped`.

**[M] One thing worth naming, because it is now load-bearing:** the existing `shown === null` test
is STRICT, and that is what makes `false` renderable at all. A truthiness check there would drop
every false flag and leave the rows UNDER the bound looking like rows the producer had said nothing
about — the absent-versus-undrawable distinction this card already got caught on once, in a third
costume.

### The seals, and why each is proven REACHABLE rather than merely green

Your seal — *two rows differing ONLY in a boolean extra must render differently* — is written as a
**discrimination** test, not a presence test. Asserting that "true" appears would pass against a
card that printed the word unconditionally; the defect here WAS an indistinguishability, so the
assertion has to be that the two differ. The rows are identical in every other field, so the flag is
the only thing that can account for a difference.

⛔ **A green that was never red proves nothing, so each seal was mutated against:**

| seal | mutation that reddens it | caught by the others? |
|---|---|---|
| two rows differing only in a boolean render differently | remove the `typeof v === "boolean"` branch | — |
| the producer's real payload declares no `data-extras-dropped` | same | — |
| the card stays domain-blind (sealed by RENAMING the field) | key a highlight on `k.includes("threshold")` | **NO** |

The third row is the reason it is a separate seal. Removing the boolean branch does **not** redden
it — with booleans refused, `above_threshold` and `ordinary_flag` both land in `dropped` and render
identically, so rename-invariance still holds. A guard only the first mutation reaches would have
been a guard I could not show was reachable for the claim it names.

### The fixture is transcribed, not typed

**[M]** Read from `cost_agent/measures.py::cost_supplier_concentration` at producer `c0005142`
(HEAD, tracked tree clean — baseline established BEFORE reading, per yesterday's §5):

    _SUPPLIER_SHARES  .41 / .27 / .19 / .13     seed.py:107
    lot 3 material    58000 * 18 * 1.04 = 1,085,760.00
    bound             DEFAULT_CONCENTRATION_THRESHOLD = 0.25, defaulted

    Cobalt Components      445161.60   0.4100   above_threshold true
    Amber Fabrication      293155.20   0.2700   above_threshold true
    Sable Castings         206294.40   0.1900   above_threshold false
    Verdigris Electronics  141148.80   0.1300   above_threshold false

Shares sum to **1.0000** and exactly **two** rows sit above the bound — which is what the producer's
own `suppliers_above_threshold` reports, and what you read off the payload. Four rows, to the cent.
**It matches your walk, so the fixture is the thing that actually failed on screen** — including
both `false` rows, the ones a truthiness test drops silently.

**Gate: [M] 109 files / 1590 tests / `npm run build` green.**

---

## 2. W4-2 — I MEASURED FIRST, AND IT IS NOT MINE

**You said: if the keys arrive, render them; if they do not, it is a payload/projection finding.**

**[M] THEY DO NOT ARRIVE. They are dropped in the producer, at a named allowlist, before cortex
sees them.**

`agent_fleet/presentation_agent/main.py:739`

    "CONTRIBUTION_RANKING": ("rows",
                            ("value_label", "value_unit", "scope_label", "verdict")),

and `_project_planning_archetype` (same file, ~828) builds the component **from scratch**:

    component = {archetype, source_persona, subject_concept, rows}
    + each field in that 4-tuple the producer supplied
    + state_ref / state_version
    # and NOTHING else

So `threshold`, `threshold_defaulted`, `suppliers_above_threshold` — and `largest_share`,
`purchased_value`, `lot`, `fiscal_year` with them — never become keys on the component.
**Per your ruling: reported, and NOT rendered around.** The card is unchanged in this respect.

⛔ **THIS IS THE SAME DEFECT THAT ALLOWLIST HAS ALREADY HAD, ONE ARCHETYPE ALONG — and its own
comment says so.** Sitting directly above the line, about `reference` and `verdict` in September:

> THE ENGINE EMITTED BOTH CORRECTLY THE WHOLE TIME... THIS ALLOWLIST DROPPED THEM, because the
> projector carries the payload key plus these declared fields and NOTHING ELSE, and this tuple was
> written before either field existed.

And the contrast it draws is **exactly** the split between your two findings, which is the part I
think is worth the architect's time:

> `favourable` survived the same trip and that contrast is the diagnosis: it rides inside `rows`,
> which pass through VERBATIM, so a row-level addition needs no declaration here and an
> ENVELOPE-level one needs exactly this edit.

**W4-1 is row-level, so it arrived, so it was mine. W4-2 is envelope-level, so it was dropped, so it
is not.** The two findings from one walk are the two sides of that seam, and neither is a
coincidence. **[I] — and I will call this the guess it is —** a tuple that has now silently dropped
envelope fields on at least three separate occasions looks like a design that fails this way by
default rather than by accident; but I measured the three instances, not the design.

### ⛔ 2a. THE INSTRUMENT YOU WERE READING COULD NOT HAVE ANSWERED THIS. Measured.

You wrote that the HUD's unread-keys line was truncated in the screenshot. **Untruncating it would
not have helped**, and this is the finding I would most want you to have.

`unconsumedFields` compares the **component's** keys against the contract's declared fields. A key
dropped at the projector never becomes a component key — so it is not "unread", it is **invisible**.
The panel reports *arrived-but-undeclared*; it is structurally blind to *dropped-before-arriving*,
which is this entire class of defect.

**[M]** I ran the real component shape through it. The HUD's line for the walked payload reads:

    CONTRIBUTION_RANKING carried source_persona, state_version, subject_concept,
    which no archetype declares

Three structural keys. **Not one of the three you asked about**, and `state_version` /
`subject_concept` are noise of exactly the kind the module's own comment warns gets the panel
switched off within the week. So: the instrument was pointed at the right card and could not see the
thing, and would have shown you a confident-looking line while doing it. **That is a hollow green
wearing an instrument's clothes, and it is the reason I did not report W4-2 from the HUD.**

### 2b. When the producer fixes its side, W4-2 becomes mine — and here is the rest of it

**[M] The projector is not the only seam. There are two, and fixing one leaves the bound off
screen.**

  1. **producer** — `_PROJECTED_ARCHETYPES` allowlist (above). Drops the keys.
  2. **cortex** — `SemanticInterpreter.tsx:716` forwards **six named props**
     (`rows`, `value_label`, `value_unit`, `scope_label`, `valid_as_of`, `state_version`).
     `comp` is `any`, so the keys would sit on it unread; and
     `ContributionRanking.contract.ts` declares only four fields, so the HUD would keep
     reporting them unread even once they arrive.

**I have NOT built any of seam 2.** Building it now would be rendering around a payload finding,
which you ruled against, and it would be an instrument with nothing reaching it. Say the word once
the producer carries the keys and it is a small, mechanical commit: widen the passthrough, declare
the fields, give card-level scalars the row-extras treatment in the header — producer's name, value
verbatim, denylist of consumed props, exactly as you ruled for the rows.

---

## 3. ONE THING THE MEASUREMENT TURNED UP THAT NOBODY ASKED FOR

**[M] The producer sends every row's facts TWICE, under two vocabularies.**
`cost_supplier_concentration` aliases its own fields into cortex's names and leaves the originals in
place (`measures.py:773-778`):

    supplier            == entity_name
    amount              == contribution        (string vs float)
    share_of_purchased  == share_of_total      (string vs float)

None of the three originals is in `CONSUMED_FIELDS`, so **as of `b719616` the walk will now draw
them as extra columns on every row**, beside `above_threshold` and a row-level `value_unit`. That is
five extras per row, three of which restate the figures already on the row in a second vocabulary.

**The card is right to show them** — the denylist only grows when the card starts consuming a field,
and silencing them there is precisely the "convenient place to hide noise" that comment forbids.
**But the row is going to look busy on the next walk, and I would rather you heard why from me than
read it as a new renderer defect.** The duplication is the producer's to rule on; ADR-0045's refusal
of a translation layer is the argument that it should pick one vocabulary, and that is not my call.

---

## 4. STATE

    branch    master  (R-009, shared checkout with ba — staged by name, never `git add -A`)
    head      b719616  fix(planning): a boolean extra is a one-cell value - W4-1
    ahead     1 vs origin/master, and `git log origin/master..master` shows ONLY my commit
    tree      CLEAN
    producer  ../invincible-agent at c0005142, tracked tree clean, UNTOUCHED by me (read only)

**Untracked outside the repo, absolute, session scratchpad only:**

    C:/Users/cnogr/AppData/Local/Temp/claude/c--Users-cnogr-git-cortex-ui/45cb40b1-4871-4e50-80ab-f89a2beaabb1/scratchpad/w41.txt

A throwaway probe at `src/lib/__tmp_probe.test.ts` was used to measure §2a and **deleted**;
`git status --porcelain -uall` is empty. Nothing untracked inside any repo.

**Not pushed.** Pushing builds an image, and the roll is yours and Lane 1's to sequence — §0 says
this commit does not touch it either way. On your word I push, read the digest back **from GHCR**
(not from the build log — that was QEMU's helper image last time), and report it.

**Still held, untouched:** `UnreadFields` general, three-homes, sessions-only pushes building
images. §1.2 of yesterday's handoff stands exactly as written: one commit, after the roll.

Lane: ia-cortex-60/lane/cortex-60
