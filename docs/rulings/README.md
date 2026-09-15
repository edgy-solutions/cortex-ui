# Rulings — cortex-ui mirror

**This file is a MIRROR, never an origin.** The register of record is
`invincible-agent/docs/rulings/`. Every entry here cites the platform entry it mirrors and
exists so a cortex-ui reader inherits the ruling by reading rather than by being told in a
session that no longer exists.

A ruling that originates here is in the wrong place. Raise it on the platform register, let it
be numbered there, then mirror it.

---

## R-039 (mirror) — a refusal is asserted against the element that makes the claim

**Source of record:** `invincible-agent/docs/rulings/` — R-039, the task-kind declaration read
path. Mirrored here because the assertion it constrains is written in this repo.

### The ruling

A test that a card **refuses** — renders "unknown species here" and offers no disposition verbs
— must scope its assertion to the refusal element itself:

```ts
const refusal = document.querySelector("[data-undeclared-kind]");
expect(refusal).not.toBeNull();
expect(refusal!.textContent).toContain(kind);
```

Never to the page:

```ts
expect(document.body.textContent).toContain(kind);   // WRONG
```

### Why, and it is not style

The card prints the kind in its **header**, two lines above the refusal. A body-scoped
assertion therefore reads the header and reports success — with the kind stripped out of the
refusal entirely. That mutation survived in this repo's own
`approvalTaskCard.test.tsx` before the assertion was scoped.

**When the instrument and the subject share a surface, the instrument reads the subject's
NEIGHBOUR and reports success.** The check has to ask the element that makes the claim, not the
page that contains it.

### The second half: assert the affordance, not the render

"Renders correctly" is satisfied by a card that also hands out Approve/Reject. The assertion
must be that **no disposition verbs are offered**, read off `[data-verb]` — never off label
text, because labels are the verb verbatim (`"Approved"`, not `"Approve"`) and `"Approved"`
contains `"Approve"`, so a substring assertion passes whether or not the right verb is offered.

### Where it already applies

- `src/components/ApprovalTask/approvalTaskCard.test.tsx` — the undeclared-kind control.
- `src/lib/taskKindParity.test.tsx` — the three-state arm of the M3.3 parity seal.
- **ADR-0051 seal 14** (safety lane) has the identical trap waiting if a safety card prints its
  kind in a header. The wording is shared deliberately rather than agreeing by coincidence.

---

## Companion note — three states, not two

Recorded here because a seal written against two states is wrong at the third's first instance.

| marker | meaning | repair |
|---|---|---|
| verbs rendered | declared, decidable on this surface | — |
| `[data-declared-no-verbs]` | the mesh knows this species; it is **not decided here** | none needed |
| `[data-undeclared-kind]` | **nothing has declared** this species | declare it |

"No buttons" does not imply "unknown species". The two absences have different causes and
different repairs, which is the same absent-versus-refused distinction the gate itself turns on.

---

## R-043 (mirror) — trace the mutation point to every arm of the comparison

**Source of record:** `invincible-agent/docs/rulings/` — R-043. Mirrored here because both of its
instances so far were found in this repo's seals.

### The ruling

> If the mutation point reaches more than one arm of the comparison, the experiment is **void,
> not negative**.

### Instance one — the mutation reached both arms

The parity seal's render arm fed a declaration into the card and compared the rendered buttons
against that same declaration. Re-sorting the declaration **upstream** moved both arms together:
the card received the sorted list and was checked against the sorted list. Green on every
implementation, including a card that sorts. The mutation that means something is on the
**subject** — the card's own ordering — with the declaration held fixed.

### Instance two — the mutation reached *no* occurrence, which is the sharper one

Cutting the card's store read was attempted against `fromStore`. **The variable is
`fromKinds`.** The edit applied to nothing, the suite came back green, and that green read as
*"the seal doesn't bite"* — a conclusion about the instrument drawn from an experiment that was
never performed.

Aimed at the wrong occurrence and aimed at **no** occurrence produce the identical symptom: a
green run that looks like a negative result. So the check is the same in both directions, and
it is cheap:

**Confirm the mutation LANDED before reading the colour.** Print the mutated line, or make the
edit throw when its target is absent:

```js
const before = s;
s = s.replace(TARGET, MUTANT);
if (s === before) throw new Error("mutation did not apply");
```

A survey that cannot prove its own baseline reports nothing, and a mutation that cannot prove it
was applied is the same claim one level in.

---

## Companion note — a red that means "wrong directory" teaches readers to wave through red

Recorded beside the seal it shaped (`src/lib/taskKindParity.test.tsx`).

The seal asserts that it **RAN** — a suite of skips reports as a pass, so "found nothing wrong"
and "never executed" are otherwise indistinguishable in a green summary.

That guard is only safe because a **checkout resolver** sits under it. This machine carries the
producer twice (`invincible-agent` on master, `ia-01` on `lane/01`). With a hardcoded path, the
did-it-run guard would fire on any machine holding the other name — and a red that means
*"you looked in the wrong place"* is a red readers learn to dismiss. **That acquired immunity is
what hides the one real failure**, which is the entire cost.

So the guard must fire for **"measured nothing"** and never for **"looked in the wrong place"**.

And when two checkouts resolve and **disagree**, that is an error rather than a preference: a
silent pick is a confident answer about the wrong tree — the same partial-population move this
seal itself made on its first pass, when it read the platform seed and called it the population.
