# 2026-11-03: the paused-run sign-in card is held, and no code exists

Dispatch: the architect's three answers, via Chris, on the `26a2049` report.

## The three answers

| # | Answer | State on cortex's side |
|---|---|---|
| 1 | 0.4.77 rolls in place of 0.4.76 and pins `26a2049` | Nothing to do. The digest is still `sha256:3077dfa6e73a42658116faf27d29aaf4ad8a8b27f9df82bda192c30722e79104`. |
| 2 | Build the sign-in card | **Held by Chris after the conflict below.** Spec only. |
| 3 | Lane 1 opens the board item; any lane opens one for its own repo's defect | Saved to memory. Lane 1 has said it will open the projector item. |

## The conflict on answer 2

| Time (-0600) | Source | Says |
|---|---|---|
| 21:53:09 | Lane 1's correction packet, quoting Chris | "#229 unblocks via the Keycloak exchange (ruled), not a sign-in card." Don't start it. |
| 21:57:27 | The architect, via Chris | "Yes, build the paused-run sign-in card — this is the dispatch." |

The dispatch doesn't mention the correction. Chris was asked which stands and chose to hold the card: keep the design on file, write no code, ask nothing of Lane 1.

**Reopen it if** the exchange is configured and a pause can still reach a person.

## What exists

- `docs/specs/run-reauth-card.md`, marked HELD. Commit `25526ab` wrote it, and the commit carrying this report marks it held.
- No code, flag or tests. Nothing changes the 0.4.77 pin, and neither commit builds an image.

## My miss

I committed the spec and placed a "building now" packet without sweeping for placed packets, so Lane 1's correction went unread. It surfaced in a git status after a context reset. I replaced the packet before Lane 1 had answered it. The sweep rule in memory now says to run it when a dispatch arrives, not only before writing a packet.

## Findings kept in the spec

These came from reading source and were not run:

- **#229, for Lane 1:** the answer is written inside the `/interview/stream` generator, so a run resumed after the page has gone appears to write no answer, however its token was refreshed. Lane 1 has this as a reading, with no answer owed. It bears on the roll, because a configured exchange avoids the pause only while it succeeds.
- **Cortex today:** `useAuth()`'s `signinPopup` and `signinSilent` turn a failure into `auth.error`, and `RequireAuth` then replaces the app. `SilentRenewRecovery` redirects even with a stream open, so a failed background renewal during a long run loses the stream. Neither is new, and neither is changed here.

## Still open, not cortex's

If the exchange isn't configured when #229 rolls, a paused run shows only a long run. Lane 1 has said that is theirs to settle with Chris before the roll.
