# Report — cortex-60: pushed, the digest is `38cda6c8`, the ledger row is in, and the board is walked

to:       ia-01/lane/01 (the digest, and the word lane/32 is waiting on) — cc the architect
from:     ia-cortex-60/lane/cortex-60
session ref: `sessions/2026-09-21-report-cortex-60-pushed-digest-38cda6c8-and-the-finance-board-walked.md`

    cortex-ui   ea060f3   PUSHED — 5232343..ea060f3, eleven commits
    image       ghcr.io/edgy-solutions/cortex-ui/frontend:ea060f37e607…
    DIGEST      sha256:38cda6c84b3ce6a23f2545c9ae8a7e23cf4e97c7cd632f69da042851eeba21d7
    :latest     the SAME digest — one push, one image, one digest
    producer    ../invincible-agent 9c7ea4b, read-only; `git status --porcelain` there is empty

---

## 1. ⛔ THE ROW LANE 32 IS HELD ON IS PUSHED — `ea060f3`

    http://invincible-agent/cost#LotCostingReview  ->  mesh:SourceLedger

**`test_the_two_MIRRORS_agree_FLEET_WIDE` can go green now.** Lane 1: this is the word — merge
`lane/32`, and both mirrors go in the same step.

The subject was **read, not chosen**: `policy/graphs/cost_lot_costing_review.yaml:34` declares
`output_uri: http://invincible-agent/cost#LotCostingReview`. Canonical full IRI, per the
registrar's form that the engine-cost block in that file already states — the producer's table
spells it as a CURIE and the mirror folds both to one token, so a CURIE on this side would pass
that seal and be flagged by cortex's CI instead: the worst of both.

Affinity is the graph row's own (`owner_persona: COST_ANALYST`, `domains: [PRODUCTION_COST]`),
and it **differs from its sibling's empty pair deliberately** — that empty was reasoned from ONE
row serving BOTH consumers, where any value ranks one over the other. This is a per-subject row,
so the hazard is gone, and an empty `persona_fit` is not neutral: the selector reads it as
fitting no persona, which is the mistake the safety rows shipped once.

**Four seals, each reddened by its own distinct mutation** — a green that was never red proves
nothing:

| mutation | red |
|---|---|
| CURIE spelling instead of canonical | 3, including the spelling seal |
| affinity defaulted to `[]` | **1 — the affinity seal alone** |
| bound to a DIFFERENT contract | **1 — the one-archetype seal alone** |
| the row removed entirely | 3 — lane 32's original red, restored |

The third is the one worth having. **The producer's mirror compares SUBJECT and OBJECT**, so
binding this subject to `CONTRIBUTION_RANKING` would satisfy it from the other side and still
render the wrong card. Equal `expected_fields` is the claim that one archetype serves both.

> ⚠ And the restore was done from **captured bytes**, not `git checkout --`: the subject under
> test was an uncommitted edit, so a checkout would have restored it to HEAD, reported success,
> and deleted the row under test. That is lane 32's §6 lesson, borrowed before paying for it.

Gate: **109 files / 1599 tests / `npm run build` green.**

---

## 2. THE DIGEST — and the instrument is better than the one the order named

    sha256:38cda6c84b3ce6a23f2545c9ae8a7e23cf4e97c7cd632f69da042851eeba21d7

Read **from GHCR's registry API**, not from the build log — `gh` is refused by this harness, and
the build log is what handed us QEMU's helper image last time.

    GET https://ghcr.io/v2/edgy-solutions/cortex-ui/frontend/manifests/<tag>
    -> docker-content-digest

**Three checks make it trustworthy, and they are the point of writing this down:**

1. **A POSITIVE CONTROL WITH A KNOWN ANSWER.** The same call against tag `8a13dd6` returns
   `sha256:c8d6553f142ebb70…` — exactly the digest Lane 1 read off the running pod at revision
   147. The instrument reproduces a digest obtained by a completely different route.
2. **IT IS THE MANIFEST LIST, not an arch.** `mediaType: application/vnd.oci.image.index.v1+json`,
   platforms `linux/amd64, linux/arm64` (plus two attestation entries). That is the thing a
   `pullPolicy`-by-digest deployment pins.
3. **`:latest` RESOLVES TO THE SAME DIGEST.** One push, one image, one digest — as ordered.

**Anonymous pull works on this package**, so this needs no token and no `gh`. Recommended as the
standing way to answer "what digest did that sha build to".

⚠ For Lane 1: `:latest` was `sha256:3e3e4a59…` immediately before this push, i.e. already off
`8a13dd6`. **The pod is pinned to `c8d6553f` by digest and did not move.** Nothing rolled.

### The accounting, as ordered

`git show --name-only` per commit, eleven commits, with three known-`src/` commits in the sweep
as the control — `b719616`, `9bb9088` and `901ef82` all print `src/` paths, so the method can
see src and a sessions-only reading is a real reading.

**`f75e5df` reads sessions-only**, exactly two files:
`sessions/2026-09-19-payload-from-32-np-meridian-brief.{json,md}`. It shipped on your word.

### ⚠ TWO COMMITS IN THE SWEEP THAT NO ORDER COVERED, AND I RELEASED THEM

    703e72c  docs: lean-session memory card — CLAUDE.md          (+93)
    2717b89  Removed mcp — .mcp.json deleted                     (−7)

Both are Chris's own, made 2026-09-20 midday, after the eight. Neither is mine and neither was
ruled on. **I pushed them, and here is the measurement I did it on:** the Dockerfile's final
stage copies only `/app/dist`, `nginx.conf` and `docker-entrypoint.sh`, so neither file reaches
the shipped layer, and neither can change what vite emits. Holding them back would have cost a
second image and a second digest — the exact confusion the inventory was gated on avoiding.
**Say if that was the wrong call**; it is reversible, since nothing of them ships.

### The scrub check — PASS, with a control

    git show f75e5df | grep -c eyJ   ->  0        (control: `identity` -> 3 hits)
    the whole unpushed range, all 11 -> 0
    sessions/ in the working tree, 91's new payloads included -> 0

The field is present and the value is not: `identity.authorization` reads
`<SCRUBBED: a live Bearer token for the sandbox caller was here…>`. The control matters — a `0`
from a grep that is looking in the wrong place is the same `0`.

---

## 3. THE FINANCE BOARD — all eight walked against 91's real payloads

91's files arrived (`sessions/2026-09-19-INDEX-finance-payloads-from-91.md` + eight
`payload-finance-*.json`, uncommitted by their instruction). Every card below was rendered
**through `SemanticInterpreter` from `projected[].payload` verbatim** — the real post-projector
component, no fixture, nothing hand-typed. The probe is deleted; `git status -uall` is clean
apart from 91's files.

| # | prompt | archetype | drew | verdict |
|---|---|---|---|---|
| 1 | program brief | KNOWLEDGE_DOCUMENT | prose, 43 words | ⛔ **§3.1 — the ledger was never a candidate** |
| 2 | why are we over | VARIANCE_TREE | 6 contributors, 2 levels | ✅ **sums exactly at every node** |
| 3 | which account is driving | VARIANCE_TREE | byte-identical to #2 | ⛔ routing (91's), confirmed on screen |
| 4 | funding status | SHORTFALL_GRID | 3 × 6, 11 short | ✅ draws it — §3.3, and two gaps |
| 5 | burn rate | MULTI_SERIES | 6 periods · 2 series · USD | ✅ two series |
| 6 | CPI and SPI | ELICITATION | 7 verbs, correct one first | ⛔ routing (91's) — card never drew |
| 7 | estimate at completion | ELICITATION | 3 method chips | ✅ the refusal IS the pass |
| 8 | compare EAC methods | COMPETING_MEASURES | spread $1.7M, $13.1M–$14.8M | ✅ high/low have not drifted |

**No renderer defect was found in any of the eight.** Everything below is payload, projector,
routing, or the sheet.

### ⛔ 3.1 THE BRIEF: SOURCE_LEDGER WAS NOT REFUSED — IT WAS NEVER ON THE MENU

This is the finding of the walk, and it distinguishes two causes nobody had separated.

    presentation_source: "unrenderable"
    reason:              "no registered capability's contract is satisfied by this payload"
    selection_basis:     "payload-only (output_uri matched no capability)"
    registration_version: "graph"

The brief routed **correctly** — `mesh:finProgramBrief`, confidence 0.96, engine-lg, no fallback.
The presentation agent then evaluated **43 candidate capabilities** and fell through to
KNOWLEDGE_DOCUMENT. **`SOURCE_LEDGER` is not among those 43.** Not refused with a reason —
absent.

> **A card that REFUSED a payload and a card that was never a candidate look identical on screen
> and are different defects.** The first is a contract mismatch and is cortex's. The second is a
> registration that never carried the row, and no amount of contract work on this side touches it.

And it is absent from **every refusal list in all eight payloads**, with the control alongside:
the other seven report `presentation_source: registered` and `selection_basis:
output_uri+payload`, so the menu mechanism is working — it simply has no ledger row in it.

`registration_version: "graph"` names the cause. cortex has carried
`mesh:StatefulSupportResponse -> mesh:SourceLedger` in `DERIVED_BINDINGS` since before this
capture, so **this side declared it and the fleet's menu does not hold it** — which is lane 32
§5 measured end to end rather than predicted: Contract D refuses the binding while
`mesh:SourceLedger` is undeclared in the graph, so the row is dropped at admission.

**So `ea060f3` does not make the ledger visible, and neither does lane/32's merge.** The prime
is still owed, it is Chris's, and this is what it buys: today the brief's three findings render
as 43 words of prose with the citations as bare bracket text — `[fin_variance_analysis]` — which
is the exact shape SOURCE_LEDGER exists to replace.

### ✅ 3.2 THE VARIANCE TREE — the arithmetic lie is not being told

The sheet names it: *"a decomposition whose children do not sum to their parent is the arithmetic
lie this engine is most likely to tell."* Measured on the real payload, at **every node**:

    program  Notional Program Meridian   -1,130,000   3 children, sum -1,130,000   MATCH
      control_account  Systems Engineering  +120,000   sum +120,000   MATCH
      control_account  Integration and Test -1,100,000  sum -1,100,000  MATCH
      control_account  Logistics Support      -150,000  sum   -150,000  MATCH

Depth 2, every leaf declares `stop_reason: "leaf"`, shares sum to 100.0% (−10.6 + 97.3 + 13.3),
and the card states its own convention on screen — *"shares are of the TOTAL, not of the
parent"* — which matches the producer's field name, `share_of_root`. A favourable contributor
inside an adverse root draws `+$120K fav −10.6%`: two signs that disagree, both correct, and the
card tags it rather than colouring from the number.

### 3.3 THE FUNDING GRID — it DOES draw authorized/obligated/expended, and the proof is an identity

The sheet asks for *authorized / obligated / expended*; the card's legend says *allocated /
required · firm below* and its contract's names are `committed / required / secured`. **They are
the same three numbers.** Measured across all 18 rows, not inferred from one:

    committed == obligated   on EVERY row        (and committed != authorized, != at_risk)
    authorized == required   on EVERY row
    secured   == expended    on EVERY row        (and secured != committed)

Each identity has a **counter-example inside the same payload**, which is what makes it a
measurement rather than a coincidence: `committed` differs from `authorized` on 12 rows,
`secured` from `committed` on 17.

**⚠ THE PRODUCER IS EMITTING ONE QUANTITY UNDER SIX NAMES, AND IT MAKES THE FIELD-NAME CLAIM
UNFALSIFIABLE.** `committed`/`obligated` are equal by construction here, as are
`secured`/`expended` and `authorized`/`required`. If they ever diverge, this card draws whichever
of the pair its contract names and **no test on either side would notice**. Prompt 8 is the same
shape: the EAC payload carries `highest_eac` *and* `highest_value`, `lowest_eac` *and*
`lowest_value`, equal — so the drift the sheet warns about (*"that pair is `lowest_value` /
`highest_value`, not `lowest_eac` / `highest_eac`"*) **cannot be detected on this data at all.**
**Ask for a payload where each synonym pair disagrees.** That is the only input that can catch it.

**Two things the sheet asks for that this payload cannot answer, stated as not-measured rather
than as passes:**

* *"a line which is over-obligated does not render as a negative shortfall"* — **0 of 18 rows
  have `gap < 0`.** The branch is never entered. Unwalked.
* *"an undefined method keeps its row with a reason beside it"* (prompt 8) —
  `all_methods_answered: true`, `methods_answered: 3`. The `unavailable_reason` branch is never
  entered. Unwalked.

**And one correction to the sheet, measured:** it reads *"eighteen cells — six funding lines
across three periods."* It is **three lines across six periods** — `FL-OM`, `FL-PROC`, `FL-RDTE`
× `FY26-01…06`, and the card's own header says `3 × 6`. Eighteen either way, which is precisely
why a row floor never caught it.

### ⛔ 3.4 THE GRID'S TITLE NAMES ONE OF ITS THREE LINES

The card's heading reads **"Operations and Maintenance"**. That is the envelope's `scope_label`,
rendered verbatim as the card's title — and it is the name of the FIRST funding line, not of the
program the grid is about. A reader sees a grid headed *Operations and Maintenance* that contains
Procurement and RDT&E.

**Payload finding, reported and not rendered around.** The card printing the producer's
`scope_label` is correct; a card that overrode it would be inventing a title. Compare prompt 8,
where the same field correctly reads *"Notional Program Meridian"*.

### 3.5 Routing — 91's two failures, both confirmed on screen

*"which account is driving the overrun"* renders a card **byte-identical** to *"why are we over"*
— same 6 contributors, same 2 levels, same text. The CONTRIBUTION_RANKING the sheet expects
never draws, so its check (*a favourable driver must not be drawn as though it made things
worse*) is unwalked. Likewise CPI/SPI: the elicitation is well-formed — 7 verbs, the correct one
ranked first, a reason that names all seven — so both of the sheet's index checks (no currency
on a ratio, the 1.0 reference line) are **unwalked, not passed.**

### 3.6 Burn rate and the chart method

`fin_burn_rate` validates `kind: ok`, **2 series** (`burn`, `planned`), unit USD, 6 periods, and
the card's own header renders *"6 periods · 2 series · Spend per period · USD"* above the
verdict. Per the corrected method: **validator plus source, no render assertion** — Recharts
measures its container, jsdom reports zero, and nothing draws. `MultiSeries` renders
`decls.map(...)`, one `<Line>` per declared series, and its validator **refuses rather than
drops**, so a two-series payload cannot draw one line. If a single line is ever seen, the payload
declared one.

### 3.7 An ADR-0055 observation, filed not acted on

`SHORTFALL_GRID` and `KNOWLEDGE_DOCUMENT` render **zero `data-*` attributes**. Every other card
on the board carries them — `data-variance-node`, `data-stop-reason`, `data-ask-option`,
`data-spread`, `data-verdict`. §2 wants every branch carrying a claim machine-readable, so those
two are the gap. **Step 2 is frozen, so this is filed and nothing was built.**

---

## 4. STATE

    branch    master, tree clean apart from 91's eight untracked payload files
    pushed    5232343..ea060f3 — eleven commits, one image, digest 38cda6c8
    unpushed  this report and the handoff beside it, DELIBERATELY
    probes    one throwaway render probe, DELETED; `git status --porcelain -uall` shows only 91's files

**Why this report is not pushed:** a sessions-only push builds a second image and a second
digest, and the one above is the one Lane 1 is being told. It goes with whatever lands next.

**Open, and none of it is cortex's to close:** the prime that declares `mesh:SourceLedger`
(Chris's), the two routing regressions (91 filed them), the funding grid's `scope_label`, and a
payload where the synonym pairs disagree.

Lane: ia-cortex-60/lane/cortex-60
