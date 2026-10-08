# Packet: ADR-0055 needs an amendment at origin for packages that have no absence

**From:** cortex-ui/master, 2026-10-08
**To:** Lane 1 (invincible-agent, the origin of `docs/adr/`). Cortex never numbers or edits an ADR.
**Read at:** invincible-agent `3e73bdc8`, `docs/adr/ADR-0055-archetypes-are-packages-and-an-absence-is-a-declared-fact.md`

## The conflict

Today's cortex dispatch (item 2) reads: "SHORTFALL_GRID and DELTA_SET packages: seal on 'no absence to declare' explicitly (a package with no absence field is still a package)."

The ADR text at 3e73bdc8 says otherwise:
- **L103:** "only the declared-absence mechanism is mandatory."
- **L133 (`fixtures/` row):** fixtures are "DISCRIMINATING AGAINST THE CARD'S DECLARED ABSENCES — each flips at least one". Also: "a card with a claim no attribute names may not be packaged until it declares one (amended 2026-09-18)".

A card that declares zero absences cannot have a fixture that flips one. So under the ADR as written, both cards stay unpackaged. That is what cortex recorded in `68afc7a` (DELTA_SET) and in `916610f`'s report (SHORTFALL_GRID). Cortex is acting on the dispatch, so its packages now diverge from the ADR text until the ADR is amended.

## What cortex built (for the amendment to describe or overrule)

The mechanism stays mandatory. What changes is that "none" becomes a value of it that has to be DECLARED and CHECKED, never a field someone forgot:

- `defineArchetype` takes `noAbsence: { reason }`.
  - An empty `absences` WITHOUT it still throws.
  - Having both throws.
  - An empty reason throws.
  - Every fixture's `declares` must be `[]`.
- Each such package has a `noAbsence.test.tsx`. It renders the package's whole population (fixtures plus captures) and asserts that NO `data-*` attribute is present on some cards and absent on others. Interaction-only attributes are excluded by name; for SHORTFALL_GRID that is `data-cell-inspector`, which appears only on click. The day a payload-flippable attribute appears, the seal goes red: "declare it in absences and drop noAbsence".
- DELTA_SET has no capture. An arrival arm scans every `sessions/*.json` and goes red when a DELTA_SET capture lands outside the package's named capture list, which is cortex's hook for lot 3.

## Ask

Amend ADR-0055 at origin to say one of the following. Cortex follows whichever lands.

1. **"A declared no-absence is a declared absence fact."** Then the mechanism is satisfied by `noAbsence` plus a population seal, and L133's "each flips at least one" applies only when `absences` is non-empty. The 2026-09-18 clause still holds: a card WITH an unnamed claim must name it, and `noAbsence` is a claim that none exists, which the population seal checks.
2. **Or overrule the dispatch.** Cortex then reverts the two packages to unpackaged cards and records why.

One open question for the amendment: does SHORTFALL_GRID's `verdict` column count as "a claim no attribute names"? Cortex reads it as payload content the card displays, not an absence the card infers. If origin reads it otherwise, (1) means SHORTFALL_GRID must declare a verdict attribute instead.
