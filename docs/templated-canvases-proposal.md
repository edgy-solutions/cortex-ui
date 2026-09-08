# Templated canvases — proposal

**Written:** 2026-09-08, cortex-ui lane, overnight.
**Status:** the four dispatched questions are ANSWERED, and not by me.

---

## The premise correction, first

The dispatch says *"this one has no spec, which is exactly why it must not build into the live
path blind."* The caution is right. The premise is not.

**ADR-0050 — *canvas templates are ratified YAML; a panel is a pre-resolved step* — answers all
four questions**, and it is ratified, not draft. I read it end to end tonight before writing
anything, because proposing a shape for a thing that already has a ruled one is how two designs
end up in one system.

So this is not a design proposal. It is: **what is already ruled, where, what cortex has already
built against it, and the two things that are genuinely open.** If the ruled shape is wrong, that
is an ADR amendment and a different conversation from this one.

---

## 1. What IS a template?

**Ruled — §1, §2, §3.**

- **A git-asserted YAML** at `policy/canvases/<template_id>.yaml`. One file, one template.
- **A panel is a PRE-RESOLVED STEP, not a phrase** (§2). This is the load-bearing one: a template
  declares the verb and its bound arguments, not a natural-language question to be re-parsed per
  reader. §4.2 refuses the phrase-carrying template BY NAME.
- **A panel's `layout` declares its SLOT ROLE and ordinal** — `anchor`, and the pairs beneath it —
  **never pixels** (§7).
- **Not** persona. Nothing in the ADR makes a template persona-scoped; entitlement is handled per
  panel at dispatch (§5), which is a different mechanism and produces a different outcome — two
  readers get different-sized boards from ONE template, and §5 says that is correct rather than a
  bug.

**Not runtime-authored** (§8). A board a user builds in the UI stays a `CustomCanvas`, exactly as
today. A template enters by PR, because its value is that it was reviewed — a runtime-authored one
is a mutable table wearing a policy artifact's name.

## 2. Where is it STORED?

**Ruled — §1: in the repo.** `policy/canvases/`, entering by pull request. Not the graph, not
per-user.

Identity is `<template_id>@<first 12 hex of sha256>` of the canonicalised content (§1.5), which is
what makes question 4 answerable at all.

## 3. How is a canvas INSTANTIATED?

**Ruled — §4: one seed verb, `seedCanvas(template_id)`**, where `template_id` is a
**spoken-mandatory slot** — a bare *"build me a board"* is refused rather than defaulted. §4.1
refuses the per-template verb (`seedFinanceCanvas`) by name.

**At creation.** Nothing in the ADR provides for an existing canvas adopting a template, and §8's
non-goals point away from it: a hand-built board is a user board. I would not add adoption without
an amendment — it is the shortest path to "my arranged board rearranged itself".

## 4. What happens when the template CHANGES?

**Ruled — §6.4, and it is unambiguous:**

> *A template change mints a new `template_ref`. Boards seeded under the old one are NEVER
> rewritten.*

The reasoning given is the one I would give: **a board is a record of an act.** `CANVAS_SEED`
already declares `recomputes: false`, and retro-fitting a board to a template edited afterwards
would make *"which template drew this?"* unanswerable — which is the entire reason the ref exists.

**This is the question the dispatch most wanted answered, and it was answered before it was
asked.** Worth noting *why* the dispatch expected it to be open: an unversioned template system
does become unmaintainable in month two, and the ADR avoided that by pinning a content hash at
instantiation rather than by promising to migrate.

**One distinction the ADR does NOT collapse, and neither should we:** a board never follows a
template's CONTENT changes, but a board still wearing its template's ARRANGEMENT does re-fit to
the pane it is read in (§7). Those are different things and cortex already implements the second —
`useStageStore.ts:240`, `if (c.arranged || !c.use) return c;`. Re-fitting a board nobody has
touched is not "following the template"; it is laying out the same declaration for a different
window.

---

## What cortex has already built against this

Landed, not proposed:

- **`TEMPLATES` keyed by `template_id`**, not by the canvas's lens (`stageConstants.ts`). §7's
  frontend half, with `PORTFOLIO_TEMPLATE_ID = "portfolio"` as a constant because §7 names the
  landing order as the hazard: **the frontend row must exist before the backend advertises a
  second id.**
- **`CustomCanvas.template_id` and `template_ref`** (§6.1), carried and never interpreted — cortex
  does not merge overlays or verify digests, and a client recomputing a digest would be a second
  opinion about a policy artifact.
- **Boards predating template ids keep their layout**, via a legacy key pointing at the SAME
  builder rather than a second row that can drift.
- **An unknown `template_id` falls back to generic placement** rather than throwing or borrowing
  another template's arrangement — the landing-order hazard seen from this side.

---

## The two things that ARE open

### A. §6.2 has a prerequisite that is not met, and it fails silently

§6.2 requires the canvas artifact to carry `derived_from` **for every panel — N edges, not one.**
The ADR flags the blocker itself:

> `derived_from_artifact_id` is singular (`answer_artifact_writer.py:135`) and the projector takes
> `[0]` (`projector/apply_loop.py:452`). **A canvas artifact written against today's edge would
> silently record one panel and lose the rest** — and it would look fine, because one parent is a
> valid answer to a query for one parent.

**This is the real blocker on templated canvases and it is a backend cardinality change, not a
frontend one.** No flag, prototype or UI shape gets around it. It is also exactly the failure
class this fleet has been finding all week: correct-looking output, one row where there should be
six, nothing red.

Note this is NOT the same edge that started working today. Today's is *one child, one parent* (an
answer derived from an ask), which is what singular supports. §6.2 needs *one child, N parents*.
The ask/answer fold is unaffected either way.

### B. §9.2 — where template geometry lives when the SECOND template lands

The ADR leaves this open on purpose and states the trade: extend cortex's builder registry per
template (today's shape, geometry stays where the measurements are, cost is a second registry to
keep in step), or have the YAML declare a proportional slot grid the client realises generically
(one registry, cost is arrangement moving into config — a nick in ADR-0042's *arrangement is
UI-master*, and a layout language nobody asked to maintain).

Its lean is the first **until a third template makes the sync cost real**, and it says slice 2
decides on evidence. I agree, and I would add one piece of evidence available now: cortex's
geometry is derived from the viewport aspect AND from **measured content heights**. A YAML grid
cannot express "this row is as tall as the tallest card in it turned out to be", so the generic
option is not merely a relocation — it is a reduction in what a template can say.

---

## Recommendation for tonight

**I did not build the prototype, and I think that is the right call.**

1. The shape is ratified. A prototype would be re-deciding §§1–4 in code, and the likeliest
   outcome is a second design competing with the ADR — the thing the caution in the dispatch was
   trying to prevent, arriving through the door built to stop it.
2. The actual blocker (A) is backend edge cardinality. A frontend flag cannot prototype past it,
   and building the UI first would produce a board that looks right while recording one panel of
   six.
3. What cortex owes §7 is **already landed**, so there is nothing to flag-guard.

**What I would ask for instead, in priority order:**

- a ruling on (A): who changes the edge to multi-valued, and does the projector stop taking `[0]`;
- **one more ratified template**, because §9.2 says the registry question gets decided on evidence
  and there is currently one row — a second is what makes the sync cost measurable rather than
  hypothetical;
- confirmation that "no adoption by existing canvases" is intended and not merely unstated.

## Checked rather than assumed

Three things I listed as unknown and then went and read, because "I don't know" is only honest
until it is cheap to find out:

- **`policy/canvases/portfolio.yaml` EXISTS**, with a JSON schema beside it, landed in `a59a9c5`
  (*ADR-0050 slice 1, non-gateway half*). It declares `template_id: portfolio`.
- **THE TWO SIDES AGREE ON THE ID.** The YAML's `template_id` is `portfolio` and cortex's
  `PORTFOLIO_TEMPLATE_ID` is `"portfolio"`, and the schema requires the id to equal the filename
  stem. The landing-order hazard §7 names is closed for this template on both sides — which is
  the one thing I would have wanted verified before anyone advertised a second.
- **`derived_from_artifact_id` IS STILL SINGULAR** — `Optional[str]` at
  `answer_artifact_writer.py:135`. Blocker (A) stands as written; it has not been quietly fixed.

Also worth reading before anyone extends this: the YAML's own header records that **§3 is
blocked** — the dispatch boundary carries no slots, so slice 1 declares each verb's ACTUAL
present-day defaults rather than a carry that has not landed. It says that when the carry does
land, a declared default that changes a card is *the carry arriving* and should be recorded as a
correction rather than a regression. That is a good rule and it is the producer's, not mine.

## What I still do not know

- **Whether any template beyond `portfolio` is planned.** There is exactly one YAML today, which
  is precisely why §9.2's registry question cannot be decided yet — it is a question about the
  SECOND one, and there isn't one.
- **Whether the overlay mechanism (§8, ADR-0036) has a frontend consequence.** I have not read
  ADR-0036 and I am not going to infer one overnight.
- **Whether `seedCanvas(template_id)` is reachable yet.** I read the template and the schema, not
  the dispatch path; the ADR's rollout notes slice 1 is the non-gateway half, which suggests not,
  but I did not verify it and am not going to report it as if I had.
