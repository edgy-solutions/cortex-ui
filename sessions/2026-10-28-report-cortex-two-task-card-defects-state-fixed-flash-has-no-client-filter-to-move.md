to: whoever sent the 10-28 two-defect directive (relay: Chris)
from: cortex-ui/master
date: 2026-10-28
re: Chris's liaison screenshot. (2) is fixed and sealed. (1) cannot be done as written: cortex has no audience filter to move before first paint.

Fix: PR #46 (`667a0a3`). Reads are at cortex `f96f533` and invincible-agent `origin/master`.

## (2) The task card showed "complete · 24h ago" under a PENDING header. FIXED.

**Cause.** `taskToArtifact` stamps every task-artifact `status: "complete"` on purpose, so the card displays. The task's lifecycle rides on `task_ref.task_state`. The header read the task state, but the tile's meta line (`StageCard.tsx`, `stage-tile-meta`) read `artifact.status`. It now reads `task_ref.task_state` on a task. Answers are unchanged.

**Seal.** `src/components/AgenticCanvas/StageCard.taskState.test.tsx`:
- "the producer really does stamp a task-artifact `complete` (the premise of this seal)"
- "a PENDING task reads pending, with its age"
- "every task state reads as itself, and none reads complete": all 15 TaskStates. The list is a `Record<TaskState, true>`, so tsc refuses a missing state. Proved: written with 13 of 15, it failed TS2739.
- "an answer still reads its own status (the task branch did not swallow it)"

The card is built through the real `taskToArtifact`.

Mutants:
- the old read reddens 2 arms, with `expected 'complete · 24h ago' to contain 'pending · '`. That is the screenshot's text exactly.
- a hard-coded "pending" reddens the population arm;
- the task branch taken for answers reddens the answer arm.

## (1) "Task cards render before the audience filter resolves." There is no such filter in cortex.

**Which tasks the browser holds is decided by the server, on one key, on both feeds:**
- REST `GET /me/human_tasks` (`gateway.py:1519` → `human_tasks.list_tasks_for`, `human_tasks.py:530`) filters on `WHERE recipient_id = %s AND status = %s`, with the caller's `authz_id` and `pending`.
- The Electric shape (`gateway.py:15214`) has a server-injected `recipient_id = '<authz_id>' AND status = 'pending'`.
- The docstrings say "REST and streaming agree by construction", and the code agrees.

**Cortex filters no task by audience, persona or entitlements.** `GET /me/entitlements` decides the persona picker and send scope. It plays no part in task visibility. So both proposed fixes have nothing to act on:
- "Filter before first paint": there is no client filter to move.
- "Skeletons until entitlements arrive": this would gate on a read that does not decide which tasks show.

**A previous user's state cannot paint first either.** `useSessionIsolation` (App.tsx) withholds the tree until this owner's purge has run (`sessionIsolation.ts`). The canvas and task stores are not persisted.

### What could make a card flash and vanish. Unmeasured; each needs evidence.

a. **A server-side materialization.** `human_tasks.py:10` materializes one row per actor when the task registers. A row whose `recipient_id` is the liaison would be delivered whatever their audience is now. If that row then leaves `pending`, the Electric shape sends a delete and the card goes. Only the platform lane that owns `human_tasks.py` can say whether a recipient can hold a row outside their audience.

b. **A cortex race. It would hide a LEGITIMATE card, not an out-of-audience one.** `seedFromRest` and the Electric stream start together. `replacePending` drops every pending task the REST snapshot lacks, so a task that Electric delivers after the REST read but before its response lands is removed. Electric does not re-send it. Cortex can fix this, but it does not match "a card outside the viewer's audience".

### What decides it

Chris (or whoever saw the flash) can supply the task id or title that flashed, and the viewer's login. With those, read the row's `recipient_id` and `audience`:
- if `recipient_id` is the viewer, the server put it in their feed, which is (a);
- if it is not, cortex rendered a row it was never sent, and that would be new.

A browser console capture also helps: the `[electric-tasks]` lines plus the Network tab for `/me/human_tasks` and `/electric/shape?table=human_task_projection`.

There is no seal for (1) until the mechanism is known. A seal on the existing owner gate would pass today and say nothing about this flash.

-- cortex-ui/master
