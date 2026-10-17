# Packet: operator.atlantia holds MECHANIC/MAINTENANCE once 189 rolls; export sends the board's ids, in 190

to: cortex-ui/master
cc: invincible-agent/lane/fin, invincible-agent/seat/architect
from: invincible-agent/lane/01, 2026-10-16
re: your `2026-10-16-packet-to-lane-1-brokered-login-walk-row-seed-atlantia-pin-40f76a7.md`, and
fin's `2026-10-16-packet-to-cortex-ui-the-global-canvas-exports-every-stored-answer-856-not-the-board.md`

## 1. The cell you asked for: `WALK_ATLANTIA_CELL=MECHANIC/MAINTENANCE`

Chris's directive, item 5: "Seed operator.atlantia a cell via a group (openddil-maintainers →
MAINTENANCE), so cortex's brokered-login row can pass."

- On `lane/01-rev189`, `716256a2`: group `openddil-maintainers` grants MECHANIC/MAINTENANCE.
  This is the existing cell; MECHANIC is the only persona with a MAINTENANCE cell. operator.atlantia
  is seeded by its OpenDDIL sub, as a member of that group, with that cell as its `default`. It
  uses the group path because a direct user grant is invisible to the picker.
- `9c7138d5`: the s1000d fault walk's derived invokers now include the new member. The
  derived-invokers seal redded on `716256a2` until they did.
- **When it is live:** after 189 rolls, and after `topaz_sync` runs from 189's policy. I will tell
  you when it is. Until then, `broker-cell` stays red as you wrote.
- **The brokered login itself still waits on the flip** (#41). The flip waits on the CA Secret
  `keycloak-openddil-trust`, which waits on Chris's PEM. So `broker-screen` has no
  `#social-openddil` link until then. That red is not yours.

## 2. Export sends what is on the board: 190, yours to build

Chris's ruling (directive item 4, verbatim): "export sends what is ON THE BOARD, never the whole
store — 856 answers for a 3-card board is a bug; fix with cortex (board ids in the request). 190."

- **The ask:** the export POST carries the ids of the answers on the board being exported, and
  nothing else from the canvas store. The picker's "Export N answers to…" counts the board.
- **The other half of the same ruling:** "a cost export with one unexportable answer exports the
  others and renders the unexportable one as a refused section (same rule as per-engine split)".
  That is engine-side, and lane/fin builds it for 190.
  - The panel already draws per-engine refusals from `documents[]`; fin measured that live on
    188b.
  - A refused section *inside* one engine's document is new. When fin fixes the wire shape, it
    tells you. Don't build against a guess.

## 3. Pin

189 keeps cortex-ui at `e1b94e2`. You said `e1b94e2..40f76a7` touches only `e2e/walk/` and
`sessions/`. I move the pin only when a served-bundle change needs it.
