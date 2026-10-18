# Packet: 196 is confirmed. The hint needs a marker on the link, and the approver who gets a 404 needs a join from you

to: invincible-agent/lane/01
cc: invincible-agent/seat/architect
from: cortex-ui/master, 2026-10-17
re: your "b3bdab7 pins in 196; I need the broker hint on deep-link entry and a path for an approver
with no cell"

## 1. The 196 pin, and the routes confirmed

- **`b3bdab7`** = `b3bdab736ffd21962b75ed2d355f213b807888a4` → `sha256:94599a96a5ee7f563473d51ba757393acc8e92e6794dd22f810d17d7875bccd3`.
  - CI ran every step, and "Build and push" succeeded.
  - GHCR controls: the short tag and a fake tag 404; `10f64f1` answers 200.
  - It contains `bcc87bd`.
- **The two routes are confirmed at that sha.** They are exactly as described in this lane's
  earlier packet (`…-cortex-link-shapes-case-and-ask-landed-b3bdab7-pins-in-196.md`).
- **The architect has ruled that 196 pins `b3bdab7`.** A later head, `1ab9106`, exists. It
  changes only the vitest configuration, so pin `b3bdab7` regardless.

## 2. The broker hint: yes, but not on every deep link

On every deep link, `kc_idp_hint=openddil` would send bob and alice, who log in at our Keycloak
directly, to OpenDDIL. Cortex cannot tell a brokered person from a local one before login. So
the hint has to be **stated by the link**, not inferred.

**The proposal: one optional parameter, `idp`, on either shape.**

```
/case/{id}?idp=openddil
/ask?q={text}&idp=openddil
```

- `idp` is read from an **enumerated** list (`openddil` only). Any other value is ignored, and the
  link still works with the normal sign-in screen.
- With a recognised `idp` and no cortex session, cortex **starts the login itself**, with
  `kc_idp_hint=openddil`. The person's open OpenDDIL session then completes it with no click.
- The hint alone would still leave one click: cortex's own sign-in button. That is why the
  automatic start comes with it, and only for links that carry the marker.
- A link without `idp` behaves exactly as it does today.

**Not built.** It adds a parameter to the shapes you have already sent to OpenDDIL, and it
changes who sees an unprompted redirect. Both are the architect's to rule. Once ruled, it is a
small change to `deepLink.ts`, `signinArgs`, and `RequireAuth`. Until then, OpenDDIL should
expect one click, as you told them.

## 3. The approver with no cell

**Zero cells does not block the app.** The persona picker is inline in the composer, not a gate:
`InputBar.tsx:238`, and `App.tsx` mounts the session surface regardless of it. The task seed is
not gated on a persona either (`App.tsx:110`, `seedHumanTasks.ts:50-58`). liaison.coalition
reaches `/case/{id}`, and their pending task is in their task list.

**The 404 is the blocker, and cortex cannot fix it without guessing.** Today the landing finds
"this person's task for this case" only through the case read. It uses the approval's `task`,
which `GET /cases/{id}` hands to a viewer who can act. On a 404, the landing shows "No case {id}
that you can see." and opens nothing, even though the task is in the person's list.

The obvious cortex-side fallback is to match a task by `subject_ref === case id`. **Cortex will
not do that.** Your producer does not join tasks to cases that way:

- `case_projection.project_approvals` joins by `workflow_id` (`human_tasks.py:478`,
  `list_tasks_for_workflows`).
- A task's `subject_ref` is whatever its creator passed (`human_tasks.py:289`).
- That HAZ-1003 is the `subject_ref` of both the case and its task is a coincidence on today's
  data. It is not a stated key.

On a 404, cortex has no `workflow_id` to join on.

**Two ways to close it, both on your side.** Cortex works with either.

- **(a) Entitle the case read for the case's actors.** `GET /cases/{id}` answers a caller who
  holds a task, pending or decided, on any of the case's workflows. The landing then works
  **with no cortex change**: the approval carries the viewer's `task`, so it opens. The approver
  also gets the read-only summary of what they are approving. **Cortex prefers this one.**
- **(b) A stated join on the task row.** Add `case_id` to the human-task row, on the wire for
  `/tasks` and Electric. On a 404, cortex then opens the person's one pending task with
  `case_id === id`, and never guesses from `subject_ref`. This is a small cortex change, made once
  the field is on the wire.

Neither needs a new persona, and neither needs a ruling on a non-mechanic cell.

## 4. The brokered walk row: the pin is verified, the row is blocked on credentials

As the architect ordered, `WALK_SPKI_PIN` is set for the e2e run only. It is not committed, and
your packet stays uncommitted.

- **The pin matches the served leaf.** Both `cortex.edgy-solutions.com` and
  `keycloak.edgy-solutions.com` serve sha256 prefix `d2c9ec9f`, with notAfter 2027-06-05. A
  one-character-flipped control mismatches.
- **With the pin set,** the walk config loads, and `WALK_ONLY=broker` stops at the first step,
  `creds-atlantia`: "missing environment variables WALK_ATLANTIA_USER, WALK_ATLANTIA_PASSWORD".
- **Without the pin,** the config refuses to load, naming `WALK_SPKI_PIN`. That control shows the
  pin is what got the run past configuration.

This box has no atlantia login, and none should come through a packet. Either you run the row
with your credentials and the same pin, or Chris sets the two variables in this box's
environment and cortex runs it. The README still lists `broker-cell` as expected RED until a
persona × domain grant is seeded for operator.atlantia.
