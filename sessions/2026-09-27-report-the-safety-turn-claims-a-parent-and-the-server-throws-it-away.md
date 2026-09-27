# The safety turn claims a parent, and the server throws it away

**Date:** 2026-09-27
**Order:** "Send `answering_artifact_id` on a safety turn from the drawn answer's artifact id,
sealed. The dispatch guard is unreachable until you do."
**Gate:** `check:transport` 0 · `tsc --noEmit` 0 · **119 files / 1842 tests passed** (from
118/1827) · 10 of 10 mutants indicted · a 5-case redproof of the cross-repo census arm.

---

## What the order asked for was already there

The send exists and has existed since the drawn-lineage beat. `useInterviewAgent.ts:527`:

```ts
const lineageClaim = answeringArtifactId ?? drawnLineageClaim(drawnAtTurnStart);
```

and `:649` spreads `answeringArtifactBody(lineageClaim)` into the `InterviewRequest`. A composer
turn — which `useInterviewAgent.ts:512` itself names as "how a safety question is asked, and how
`draft a risk assessment for HAZ-1003` was asked" — therefore claims the drawn answer as its
parent with no argument from the caller. Six arms in `useInterviewAgent.test.ts`
(`describe("what a composer turn posts")`) seal exactly which id is claimed, including the
ordering seal that the claim can never equal `artifact_id`. All six pass.

So the first sentence of the order was satisfied. The second sentence is the one that mattered.

## The guard, and what reaching it showed

`gateway.py:4872`:

```python
_answers_something = bool(request.bound_slots) or bool(request.spoken_answer)
_answering_artifact_id = (
    (request.answering_artifact_id or None) if _answers_something else None
)
if request.answering_artifact_id and not _answers_something:
    logger.warning("lineage claim REFUSED for run %s: ...")
```

That branch needs a body naming an ask while carrying no answer. **No cortex path could build one
before the drawn-card default:** both ask-card paths guard their payload in `rerouteDispatch`
(`NO_PHRASE`, empty bound slots, empty `spoken_answer`), and the composer sent no claim at all. It
was dead code on this client. Defaulting the claim made it reachable — and it fires on the exact
turn the change was built for.

**A composer turn carries neither clause, by design.** `boundSlotsBody(undefined)` and
`spokenAnswerBody(undefined)` both return `{}` deliberately, because `{}` posted is a claim that a
menu was answered. So the claim is refused, and `_answering_artifact_id` is nulled before **three**
consumers read it:

| Consumer | `gateway.py` | What the refusal costs |
|---|---|---|
| `_pre_resolved_from_ask(_answering_artifact_id or "")` | :4910 | the route reuse — /plan, /resolve and /classify_predicate all re-run |
| `_accumulated_slots(_answering_artifact_id or "")` | :4935 | slots bound at an earlier hop, so hop 3 cannot see hop 1 |
| `"derived_from_artifact_id": _answering_artifact_id` | :5189 | the lineage edge; the rail keeps two cards |

The cheap reading of this defect is "a missing arrow". It is three things, and the expensive one is
the route: the gateway's own log line calls it the branch that "silently costs the user 40 seconds".

## Six green arms over a discarded field

This is the shape, not the bug. Every existing arm asserts **which id is posted**; none asked
whether it survives. Cortex already knew the rule — `answeringArtifact.ts`'s header says the server
"honours it only when the turn actually carries an answer — a pick or words" — and that sentence sat
one function away from the code that posts the claim with nothing checking it.

`boundSlots.test.ts:140` is the near miss. It asserts the guard **exists**:

```ts
expect(src).toMatch(/_answers_something/);
```

A containment check over a guard's *name*, which cannot see what its condition is. It would pass
just as well if the condition were `False`.

## What was built

1. **`lineageClaimVerdict()`** in `src/api/answeringArtifact.ts` — cortex's mirror of
   `_answers_something`, provenanced to the Python it mirrors. **Three states, not a boolean:**
   `no_claim` / `honoured` / `refused`, one for one with the gateway's three audible branches,
   because "nothing was claimed" and "a claim was discarded" are the two outcomes this lane keeps
   confusing and a boolean spells them identically.
   - It mirrors **Python truthiness**: `bool({})` is False where `{}` is truthy, so the obvious JS
     spelling (`body.bound_slots || body.spoken_answer`) calls an empty map honoured and is wrong.
   - It is deliberately **laxer than cortex** on whitespace (`bool(" ")` is True to Python). It
     answers what the server *will do*, never what cortex *should have sent*.
2. **`src/api/lineageHonoured.test.ts`** (13 arms) — the unit arms, the arms over bodies assembled
   from the three real spread functions, and four live-gateway arms that read the guard's **own
   expression** rather than its name: a both-directions census asserting the clause set is exactly
   `{bound_slots, spoken_answer}`, that the claim is *nulled* and not merely logged beside, that all
   three consumers read the nulled value, and that the refusal branch is still spelled the way an
   operator greps for it.
3. **Two arms in `useInterviewAgent.test.ts`** — the verdict over the body the **real hook** posts,
   so it cannot agree with me about what a composer turn contains, plus the contrasting arm proving
   an answered ask *is* honoured today (without it, "refused" reads as the field never working).

## What cortex must not do, and the question that is not ours

Satisfying the guard means posting `spoken_answer`, which the gateway model pairs with
`spoken_slot`, and a composer turn **has no slot name**. Inventing one feeds the resolution ladder a
slot nobody resolved — trading a missing lineage arrow for a wrong route. Cortex cannot close this
and should not try.

**For the architect:** should a turn that names a drawn answer and carries the reader's typed words
in `message` count as answering it? The guard's comment says a turn with neither pick nor typed
reply "is an ordinary question" — and a safety question answered in prose is not an ordinary
question. Two sub-questions follow: does a third clause belong in `_answers_something`, or should
cortex stop posting a claim it knows will be refused (it currently emits a REFUSED warning on every
composer turn with a durable card drawn, which poisons the one diagnostic built to catch a confused
client)?

Stated with an owner rather than left symmetric. The arms assert the **refusal** as today's truth
and go red the day it is ruled either way — a tripwire on someone else's decision, not a shrug.

## Mutants

| # | Mutant | Verdict |
|---|---|---|
| L1 | `carriesPick` uses JS truthiness (empty map becomes honoured) | INDICTED |
| L2 | `carriesWords` trims, becoming stricter than the server | INDICTED |
| L3 | the `no_claim` state collapsed into `refused` | INDICTED |
| L4 | everything honoured | INDICTED |
| L5 | everything refused | INDICTED |
| L6 | the two clauses ANDed instead of ORed | INDICTED |
| L7 | `no_claim` swallows a real claim | INDICTED |
| H1 | **a composer turn starts posting `spoken_answer` — the candidate fix itself** | INDICTED |
| H2 | the ask-card pick stops reaching the body | INDICTED |
| H3 | the lineage claim stops being posted at all | INDICTED |

**10 of 10.** H1 is the one that matters: the arm fires on the *fix*, which is what makes it a
tripwire rather than a restatement. Every arm's baseline was confirmed GREEN under its own `-t`
filter before firing, because a filter matching nothing exits 1 and reads exactly like an
indictment.

The four live-gateway arms cannot be mutated — the peer repo is read-only — so they were redproofed
against mutated **copies** of the assignment line. The census passes on the real gateway and fails
on all four drifts: a clause added, a clause removed, the guard renamed, and the clauses rewritten
to read no `request` field.

## Ruled out, and why it is worth recording

`actOnHumanTask` (`src/api/client.ts:163`) was the leading candidate for "the dispatch" — a
`safety_redraft` task resolution posts `{decision, comment}` and carries no lineage claim at all.
**It is not the dispatch, and adding the field there would have invented a producer contract:**
`answering_artifact_id` is declared on `InterviewRequest` and on nothing else in `gateway.py`. The
`/act` body has no such field to read.

## Files

- `src/api/answeringArtifact.ts` — `+52`, the mirror
- `src/api/lineageHonoured.test.ts` — new, 13 arms
- `src/hooks/useInterviewAgent.test.ts` — `+45`, two arms over the real posted body

`src/hooks/useInterviewAgent.ts` is **byte-identical**. No runtime behaviour changed: the send was
already correct, and what it buys is the architect's to decide.
