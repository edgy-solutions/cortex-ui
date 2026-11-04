# 2026-11-04: the card is held by Chris, and 87d9171 pins at the next cut

Dispatch: "cortex: card held (my ruling last night; Lane 1's 'build on fixtures' is not mine). No card code. k-of-n polish pins at the next cut."

This supersedes the "Needs Chris" section of `2026-11-03-report-cortex-card-waits-on-served-fields-k-of-n-polish-at-87d9171.md`. That question is answered: hold.

## The card

**Held. There is no card code, and none will be written until Chris dispatches it.** The hold from 2026-11-03 still sets the condition: it becomes a dispatch "when the exchange is configured and a pause can still reach a person".

- **Lane 1's fields:** these are now on an open PR, #249 at `fc50fc30`, which is not on master and not in a chart. Lane 1's packet says a hold outranks it. Cortex doesn't need #249 merged.
- **The spec** (`docs/specs/run-reauth-card.md`) is marked HELD again. It records Lane 1's two notes from #249:
  - `""` draws the same as a missing field.
  - `paused_call` is leg wording, drawn verbatim.

## The pin for the next cut

| | |
|---|---|
| sha | `87d917163530a4fe171bbb6cf6987863eb2f2946` |
| digest | `sha256:83df4f9dae88dc1fcf578fc9f5090a2339379b1bdaf736bd5c43704640c39d4f` |
| read | GHCR, 2026-11-03, with `26a2049` as the control |

0.4.78 is published at `8a2717e0` with `26a2049`, as ruled, and hasn't rolled. So "the next cut" is the one after 0.4.78, and Lane 1 has the sha and digest by packet.

This commit is docs and sessions only and builds no image. `87d9171` is still the last cortex sha with one.

## Gov's heads-up: nothing to do

`ReviewShapeRow`'s `item_kind`, `rules_version` and `rules` become nullable at our next producer pin after #247.

- **Reader:** `readReviewShapes` already skips a row with any of them empty or null (`src/lib/reviewShapes.ts:33`).
- **Types:** the re-pin regenerates `item_kind` as `string | null`. The `tsc` step of that re-pin will show whether any consumer reads the generated type directly.

## Packets

- **Placed in `invincible-agent/sessions`, uncommitted:** `2026-11-04-packet-to-lane-01-from-cortex-the-card-is-held-by-chris-and-87d9171-pins-at-the-next-cut.md`.
- **Committed here:** Lane 1's `2026-11-04-packet-to-cortex-from-lane-01-the-pause-fields-exist-at-fc50fc30.md`.
