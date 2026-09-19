# Note — the four extra declaration sites, evidence for ADR-0055 §2

to: ia-cortex-60/lane/cortex-60 (own file; **`ia-5f` has no live session**, so this is filed here
rather than sent)

Written 2026-09-19 on the architect's order. This is evidence, not a proposal — the
`UnreadFields` generalisation it bears on is **held until four walks draw**.

## The claim

Landing ONE new archetype end-to-end (`SOURCE_LEDGER`, `a271817`, ADR-0055 step 2) required the
archetype name to be declared at **four sites beyond its own package and its capability binding**.
None of the four was found by reading the code and intending to be thorough. **Each was named by a
seal that went red** — which is ADR-0055's own subject demonstrated on the first new archetype to
go through the extension point it describes.

## The four sites, measured at `8a13dd6`

| # | site | file:line | what it is |
|---|---|---|---|
| 1 | the glyph | `src/components/NeuralStream/ArchetypeGlyph.tsx:99` | icon + colour switch; no default that would draw something plausible |
| 2 | the closed union | `src/lib/answerDisplay.ts:28` | `AnswerArchetype` — the vocabulary itself; typecheck fails without it |
| 3 | `DISPLAY_ARCHETYPES` | `src/lib/answerDisplay.ts:78` | the dispatched-archetype list; its comment says *"no DISPATCHED archetype may fall into"* the unregistered path — the drift the list exists to catch |
| 4 | the label table | `src/lib/answerDisplay.ts:179` | `archetypeLabel()` — TYPE-group header and a11y name |

For contrast, the site that is NOT extra — the one anybody adding a card would find, because
without it nothing draws at all:

    src/components/registry/SemanticInterpreter.tsx:635   the render dispatch

And the binding, which is the act of advertising the capability:

    src/registry/assembleCapabilities.ts:653              contract: SOURCE_LEDGER_CONTRACT

## Why this is evidence for §2 and not just a chore list

§2's rule is that *a fixture discriminates against the card's declared absences — each flips at
least one.* The four sites are the same shape one level up: each is a place where **an absence is
silent unless something asserts against it.**

- Site 2 is the only one of the four that a compiler catches. The other three would have shipped
  green.
- Site 1 without its case draws **nothing or a default glyph** — a card that renders correctly
  under a symbol that names a different kind of answer.
- Site 3 without its entry puts a dispatched archetype on the unregistered path: the payload draws
  through the renderer, and the census that is supposed to notice says it was never dispatched.
- Site 4 without its case gives the group header and the screen-reader name a raw
  `SOURCE_LEDGER`, or an empty string.

Three of four are **invisible at runtime to the person adding the card**, because the card itself
looks right. That is the condition a seal exists for, and the reason all four were found by seals
rather than by reading.

## The naming decision the label site forced, recorded because it will recur

Site 4 is where the noun gets chosen, and `SOURCE_LEDGER` is the first archetype with **two
producers on day one** (a program brief and a cost lot review both emit ledgers). The label is
**"Ledger"** and deliberately not "Brief" or "Summary" — either would name one consumer's use of a
structure that already has two, and the name would then be wrong in the second caller's screen
while reading fine in the first. The same trap waits at site 1: the glyph is an accounting glyph,
not a list glyph, because a list says *"here are some things"* and the archetype's whole property
is *"here are ALL of them, including the ones that said nothing."*

## What this note does NOT claim

It does not claim four is the number for the NEXT archetype — it is the number the four seals
named for this one. Nor does it claim the four sites should be collapsed into one table; that is
the `UnreadFields` general question, and per the order it stays **held until four walks draw**.
Filing this now so the evidence is not reconstructed from memory when the walks land.

Lane: ia-cortex-60/lane/cortex-60
