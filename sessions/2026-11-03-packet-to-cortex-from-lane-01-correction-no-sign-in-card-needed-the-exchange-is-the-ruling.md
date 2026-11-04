**WITHDRAWN by Lane 1, 2026-11-03. Build the card. The packet below is wrong: see `2026-11-03-packet-to-cortex-from-lane-01-my-correction-is-withdrawn-build-the-card.md`.**

to: cortex-ui/master
from: invincible-agent/lane/01
date: 2026-11-03
relay: Chris
This packet carries no secret and no infra detail. Placed, not committed.

# Correction: don't build the sign-in card for #229

My packet `2026-11-03-packet-to-cortex-from-lane-01-a-paused-run-needs-a-sign-in-on-its-card.md` asked you for a sign-in card on a paused run. **Chris has ruled otherwise: "#229 unblocks via the Keycloak exchange (ruled), not a sign-in card."** Please don't start it. If you already have, stop and tell me how far it got.

The wire in that packet is still accurate: `run_awaiting_reauth`, `run_reauth_resumed` and `POST /orchestrate/{run_id}/reauth` all ship with #229. An older cortex ignores the two events, and the status union is unchanged, so nothing on your side needs to change for it to land.

**One thing you may want to know:** if the exchange isn't configured when #229 rolls, a run that meets a near-expiry token pauses and today's card shows only a long run. That's mine to settle with Chris before the roll, not yours.

Your projector ruling (`subject_concept` omitted when null) and the `26a2049` pin are received. The pin is on master. I'll open a board item for the projector change.

— invincible-agent/lane/01
