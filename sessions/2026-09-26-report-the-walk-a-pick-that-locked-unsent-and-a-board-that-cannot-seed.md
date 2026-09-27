# The walk of 2026-09-26 — two defects, both ours, and only one of them was in the click

Ordered: fix and seal item 1; **report before fixing** item 2. Item 1 is landed, sealed and
mutation-fired. Item 2 is measured and NOT touched — the recommendation is at the end, because
the cheapest fix turns out to use a field the producer is already sending us.

Lot 4 passed every sheet check and the ledger card drew for the first time. Nothing below
touches it.

---

## 1. The vintage pick — recorded, locked, and never sent

### What was happening

`AskCard` → `resolveAsk` → `onReroute` → `dispatchReroute` → `sendMessage` is fully wired at the
only mount (`SemanticInterpreter.tsx:652` → `AskCardConnected`), and every link behaved as
written. The pick died at the last one:

```ts
// useInterviewAgent.ts, before
if (mutation.isPending || !userInput.trim()) return;   // void — nobody could read either guard
```

A BIND sends the ask's `sub_query` **as the turn's entire phrase** (the pick rides beside it, in
`bound_slots` — composing `"<sub_query> (slot: v)"` is the one thing that path exists to forbid).
So an ask with no `sub_query` produced an empty phrase, the second guard dropped the turn, and
`sendMessage` returned nothing to say so. Meanwhile `AskCard.answer()` had already called
`setAnswered`, so the card marked the choice, killed the other options and drew a receipt — for a
turn that never ran. That is the "records it under what this one accepts, no re-ask" the walk saw;
`askFromRefusal.test.tsx:69` is where that phrase comes from, verbatim.

### Why the ask had no `sub_query`

Measured at the producer, `agent_fleet/presentation_agent/main.py`, 2026-09-26 — not from a
message. `_render_refusal_menu` and `_render_abstain_menu` return exactly:

```
slot, options, option_source, reason, message
```

**No `sub_query`, and no `accepted_slots`.** `rate_vintage` is a refusal-born ask
(`option_source: "refusal"`, `reason: "not_in_model"`), so it has never carried a phrase to
re-ask with. Our own contract permits this — `sub_query` is `required: false`, described as *"the
original phrase, so the re-route has something to re-speak"* — and the producer's
`_FLAT_ARCHETYPES` table mirrors our contract, so the permission originates **here**.

### Why every seal was green

Across the whole elicitation suite: **every fixture that gets clicked carries a non-empty
`sub_query`, and the only fixture without one is never clicked.** `askFromRefusal.test.tsx` holds
the one shape matching what the producer really emits, and it renders and reads it — no
`fireEvent` anywhere in the file. Two disjoint populations, so no case existed where the phrase
was absent *and* a pick was made. The refusal fixture covered what it tripped over.

### What landed

The fix is on the seam, not on the symptom, so it closes the class rather than the two instances:

- `sendMessage` now returns **whether the turn went out**. Both its guards are correct — a second
  turn while one streams must not queue, an empty phrase is not a turn — what was wrong is that
  `void` made them invisible to every caller, including any guard added later.
- `dispatchReroute`'s BIND arm refuses an ask with no phrase, the way its RESPEAK twin has always
  refused an empty answer. **The asymmetry was the whole defect**: one arm guarded its payload,
  the other guarded the slots and not the question.
- The RESPEAK arm gets the same check, which is the non-obvious half: `resolveAsk` sets a
  RESPEAK's `query` to `ask.sub_query` too, so answering a refusal ask **in words** landed in the
  identical empty turn. Guarding only the menu path would have left half the defect on the arm a
  reader falls back to when the menu does not fit.
- Either arm reports a turn the send path dropped (`NOT_SENT`), so an in-flight stream no longer
  eats a pick silently.
- `AskCard` locks **only on a dispatch that went**. The comment there claimed the card could not
  lock on an unsent answer; that was true of one path (a pick outside the menu throws from
  `resolveAsk`) and false of the other. A locked card is the worse failure: an unacknowledged
  click invites a second click, but a receipt tells the reader the system *has* their answer and
  leaves them waiting on a turn that never ran.
- `AskedSection`'s repick needed no change — it already read `blocked` — so it is fixed for free.

`void` still means "it went": an unwired card dispatches nothing and is not claiming a drop. That
near side is sealed on purpose, because reading it the other way would stop acknowledging every
pick in the app.

**Seals, and the mutants each one was written for.** 8 mutants fired, 8 indicted, every arm on the
case it was for, and each file restored green afterwards:

| Mutant | Reds |
|---|---|
| drop the BIND phrase guard | the BIND-no-phrase case (1) |
| drop the RESPEAK phrase guard | the RESPEAK-no-phrase case (1) |
| never read the send's answer | both drop-reported cases (2) |
| read a silent send as a drop | the void-is-not-a-drop case, and 2 more |
| lock regardless of the dispatch | both "leaves the card live" cases (2) |
| lock only on a truthy result | 10 of 12 — the near side is load-bearing |
| report every turn as sent | the in-flight and empty-phrase cases (2) |
| report every turn as dropped | the near side (1) |

Suite after: **114 files, 1757 tests green**, `check:transport` clean, `tsc --noEmit` clean.

### What is NOT fixed, and it is not ours to fix

**The re-ask still cannot happen for a refusal-born ask**, and cortex must not invent one. There
is no phrase available to it: the artifact carries no originating query (no such field on the
wire), `useAgent` exposes only `sendMessage`/`isProcessing`, and `ask.spoken` is absent from the
refusal projection too. Composing one would send the pick back through the filler and the
resolver, which makes a menu's selections suggestions again.

So the honest refusal above is the whole of our half. **The producer half is two fields on
`_render_refusal_menu` / `_render_abstain_menu`:**

1. **`sub_query`** — the original phrase. Without it the re-ask is impossible without composing.
2. **`accepted_slots`** — the slots the first turn already filled. **This is the quieter defect
   the loud one was hiding.** Our contract calls it LOAD-BEARING in as many words: *"a re-route
   binding only the answered slot would suppress every other slot the first turn got right."*
   Ship `sub_query` alone and "nothing happens" becomes "the re-ask silently drops your
   program_id" — which is the harder failure to see.

Recommend ordering both together, and stating on the producer side that they travel as a pair.

---

## 2. PROGRAM FINANCE STATUS draws an empty board — three findings, and the fix is already in hand

Report only; nothing changed.

### It is not that template. **No** template seeds from that picker.

`createCanvas` sets `items: []`, always, for every template. `template_id` records which ratified
arrangement will place items **that arrive later** — it is geometry, not content. The only path
that produces cards is `seedPortfolioCanvas`, and it takes a list of already-minted artifact ids,
reachable only from a server-declared `CanvasSeedReceipt`. Picking `portfolio_planning` in the
same dialog draws an equally empty board; that one merely *also* appears by the other path, which
is what made this look specific to finance.

So the six panels with the finance sheet's prompts are not a thing that exists and broke. That is
ADR-0050 §3's "six cards from one ask", and it is unbuilt on both sides.

### And that template could not seed today even if the path existed — by ratified design

`policy/canvases/program_finance.yaml` says so in its own header, at length:

- all six finance verbs take `program_id` as a **required keyword with no default**
  (`agent_fleet/finance_agent/measures.py`, verified there 2026-09-08);
- `finEacCalculation` takes a second, `method`, whose docstring says *"There is no default"* and
  which ADR-0045 makes spoken-mandatory;
- `shared_slots: [program]` is declared with nothing binding it, so **the platform's seed route
  answers 409** — *"panel(s) consuming shared slot(s) ['program'] that nothing binds yet"* (R-005);
- and, verbatim: **"Do not wire it into a seed path expecting cards."**

The file is ratified, schema-valid and deliberately unseedable. Its job today is to be the second
registry row ADR-0050 §9.2 needs.

**Cortex never sees that 409, because cortex never asks** — the seed path is local. So the empty
board is not a refusal that rendered badly. It is a board we invented where the platform would
have refused and named the reason.

### The producer already tells us, per row, and we drop it on the floor

`GET /templates` returns for each template: `template_id`, `title`, `description`,
`template_ref`, `panels`, **`shared_slots`**. `readTemplateCatalog` projects that faithfully to
`TemplateRow.sharedSlots` (`src/lib/templateCatalog.ts:44,77`).

**Nothing reads it.** `grep -rn sharedSlots src` outside the test files returns the declaration
and the assignment and no consumer. A correct field with no reader — the `available` defect,
ours, and the same one `askFromRefusal.test.tsx` opens by naming.

The consequence is the picker's shape. It has exactly two buckets: offerable, and *"cannot be
offered: <reason>"* for templates that fail to parse or validate. A ratified, schema-valid,
**unseedable** template has no bucket, so it lands in the offerable one and looks like a board on
offer. The missing state is "ratified, but needs a binding first" — and the evidence for it has
been arriving on the row all along.

### Recommendation, ranked

**A — read `sharedSlots` in the picker (do this).** A template with unbound shared slots is
marked as needing a binding rather than offered as a board: either moved out of the offerable
list with its reason, or offered with the ask stated. Cheapest possible fix, uses data already in
hand, no producer change, no new declaration. It does not make the board work — it stops us
inventing an empty one and puts the producer's reason in front of the reader.

**B — bind the slot (the actual feature).** Ask for `program` at create time, carry it to the
seed route, and let the 409 become six cards. This is ADR-0050 §3, needs the seed route wired
from cortex plus entitlement, and is the thing the walk expected to exist.

**C — a `seedable: false` flag from the producer (do NOT).** `shared_slots` non-empty with
nothing bound is already that fact. A flag would be a **third declaration** of one truth, and
this lane has paid for exactly that shape once this week already, with a pinned seal that went
stale while both halves it compared stayed true.

---

## Open, carried

- Ruling 5's consumer half is now unblocked — the producer landed `method` → `method_label` on
  the EAC rows, `CompetingMeasures` still reads `row.method`, and a producer test is red on
  purpose. Needs sequencing, not a silent rename.
- Ruling 3 (present-and-disagreeing) still needs arch.
- `helm/cortex-ui/values.yaml:20` still defaults to `tag: latest` with no `required` guard.
