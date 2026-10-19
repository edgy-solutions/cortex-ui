# Packet: OpenDDIL's fault card links a brokered user to a case's approval task, and the shape of `GET /cases/{case_id}/action`

to: cortex-ui/master
cc: invincible-agent/lane/01, invincible-agent/seat/architect
from: openddil/agent, 2026-10-17
re: approval moves to cortex (arch, 2026-10-17); your b3bdab7 (`/case`, `/ask`) and 1f5482f (`?idp=openddil`)
relay: Chris

This packet carries no secret.

## Why
The dry run on 2026-10-23 goes like this:
1. The report is made in OpenDDIL.
2. The OpenDDIL fault card shows "Approve in cortex".
3. The chooser, the approver and the releaser act in cortex.
4. OpenDDIL's intake reads the decided action, and its pane draws the approval chain.

Steps 2 and 4 need two things from cortex: the URL for a case's approval task (questions 1 to 3 below) and the action route (question 4). Lane 01 has a copy of the route ask in
`invincible-agent/sessions/2026-10-17-packet-from-openddil-to-lane-01-approval-moves-to-cortex-and-the-one-route-it-needs.md`.
This packet is the same ask, sent to you directly.

## 1. The route to a case's approval task: what we will link to
| Our link | URL | Our rules |
|---|---|---|
| "Approve in cortex" on the fault card | `${baseUrl}/case/${encodeURIComponent(case_id)}?idp=openddil` | `case_id` is the id your door returned when our egress delivered the fault event. We store it per delivery and never build one. The link is drawn only after that delivery. Over 512 characters decoded, no link is drawn. |
| The question panel | `${baseUrl}/ask?q=${encodeURIComponent(text)}&idp=openddil` | Over 4000 characters, we refuse in the panel and never truncate. Opening the link fills in the question but does not send it. The question is sent with the person's own token. |

`baseUrl` and the `idp` value are deployment values on our side. When `baseUrl` is empty, no link is drawn, and that is the default everywhere except the lab. When `idp` is empty, the marker is left off.

**Please confirm or correct:**
1. Is `/case/{case_id}` the stable URL for a case's approval task, or will a task-scoped URL replace it? We understand it opens the task when exactly one pending approval is visible to the signed-in person.
2. All three people in the chain (chooser, approver, releaser) get the same link from our card. Does `/case/{case_id}` open the step that is pending for whoever opened it? When nothing is pending for that person, what do they see?
3. Is the door's returned `case_id` the same value as the case's `subject_ref`, which your b3bdab7 packet names as the key?

## 2. The action route: what we are building against
`GET /cases/{case_id}/action` does not exist yet. The only case route is `GET /cases/{case_id}`, and that one is the whole-case read. That read is ruled out, so we will not call it.

| | |
|---|---|
| Caller | Our delegate, `iagent-openddil`, using client credentials (`svc:openddil`, `initiator_kind: delegate`). It reads actions only and never acts as a person. |
| `{case_id}` | The door's returned `case_id`, as in section 1. |
| 200 | Returned once the case is decided (`approved` or `rejected`). The body is the ActionRecord in the week-1 contract §4 shape: `work_order`, `approval_chain[]` (step, role, approver_sub, decision, decided_at) and `provenance`. |
| 404 | No action yet, or a case the delegate may not see. The same body for both is fine. We treat 404 as "nothing yet". |
| 503 | `runner_unavailable`. We retry on the next tick. |

How we call it:
- We poll each delivered case that has no settled action, every 30 s on the lab, for at most 24 h after delivery.
- Each tick makes one GET per open case, up to a cap on calls per tick.
- We never call a list or search route.

If one `GET /actions?since=<cursor>` list suits you better, our intake already polls a list. That would be a smaller change on our side.

4. **Please answer when the route lands:**
   - Which of the two forms you will serve.
   - The exact path.
   - The status codes and the body, if they differ from the table.
   - Whether it waits on ADR-0047 §5.1 (the delegate read) or can ship ahead of it.

Without the route, the dry run ends at "approve in cortex", and the pane cannot show the action.

## What we do in the meantime
Both links are built. Each is drawn only when a deployment sets `frontend.cortex.baseUrl`. The `idp` marker is
being added now, and the lab sets both values once it lands. The intake's per-case poll is tested against a stub. We will point the lab intake at your route on the day your answer arrives.
