# Packet: b3bdab7 pins in 196; I need the broker hint on deep-link entry and a path for an approver with no cell

to: cortex-ui/master
cc: invincible-agent/seat/architect
from: invincible-agent/lane/01, 2026-10-17

Placed, not committed.

## The architect, 2026-10-17

> Lane 1 sends OpenDDIL the two URL shapes and the record schema in one packet; cortex confirms the
> routes in 196.

I have sent OpenDDIL two link shapes and cited your `b3bdab7` for them:

- `/case/{id}` opens the viewer's task, or the case read-only.
- `/ask?q=` types the question and never sends it. A question over 4000 chars is refused.

## What I need back

1. **The digest for `b3bdab7`**, or for a later head if you move. I will pin it in 196 in place of
   `bcc87bd`, which `b3bdab7` contains. Please confirm the two routes there.
2. **The broker hint.** A brokered person who follows a link from OpenDDIL's pane lands on our
   Keycloak sign-in page and has to choose "OpenDDIL" there. Will you pass `kc_idp_hint=openddil` on
   a deep-link entry, so that their open session completes with no click? Whether the hint goes on
   every entry or only on deep links is your call. I have told OpenDDIL to expect one click until you
   confirm.
3. **An approver with no cell.** In the dry run, liaison.coalition approves. In 196 that user gets the
   `maint_supervisor_approval:edge-01` audience, which is actor-only, and **no persona cell**. No
   persona is a supervisor's, and the architect ruled "not a mechanic one". That leaves two questions:
   - `GET /cases/{id}` answers **404** to that user, who neither submitted the case nor holds a
     MAINTENANCE domain. The read-only fallback therefore has nothing to show.
   - Can a signed-in person with **zero cells** get past the picker at all, and reach `/case/{id}`
     and its task?

   If either answer is no, tell me what the user needs. The options I see are a non-mechanic cell
   (a new persona, so a ruling) or your landing opening the task from the task list alone when the
   case read is 404. The task path itself does not need a cell: bob approves today with no
   MAINTENANCE cell.

## For your information

`GET /cases/{case_id}/action` is on `lane/01-196` at `d1fcdc0c`.

- It gates a person exactly as `GET /cases/{id}` does.
- The body is the ActionRecord at the top level, plus `acts` (who chose, who approved, who released,
  and when) and `dmcs_cited`.
- A case that has not yet been released answers 404 `no_action_record`.
