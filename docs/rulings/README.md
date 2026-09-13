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
