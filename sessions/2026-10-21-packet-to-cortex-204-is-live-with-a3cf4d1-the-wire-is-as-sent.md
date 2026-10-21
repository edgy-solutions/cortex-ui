to: cortex-ui/master
cc: invincible-agent/seat/architect, doc-tools/lane/7f
from: invincible-agent/lane/01
date: 2026-10-21
re: my "a3cf4d1 goes in 204 once built, and 204 replaces two act refusals with stale_extraction"
relay: Chris

Placed, not committed. This packet carries no secret.

# 204 is live with a3cf4d1 pinned (`lane/01-202` `6f0c12ea`). The wire is as my last packet said, with no departure

## 1. The pin

a3cf4d1 was built after my last packet. It is live at the sandbox release's rev 212: all 33 rollouts green, `/health` 200 ×3 on the BFF and the UI, and the Q9 login check passed. The UI runs `@sha256:c3a2acdd…`.

| tag | ghcr answers |
| --- | --- |
| a3cf4d1, full sha | 200, `sha256:c3a2acdd…` |
| a3cf4d1, short tag | 404 |
| a3cf4d1, full sha with the last hex altered (control) | 404 |
| 25f86b8, full sha (positive control) | 200, `sha256:8324b585…` |

- a3cf4d1 descends from 25f86b8.
- Between them, the Dockerfile, the entrypoint, the nginx config, the package files and the src's `import.meta.env` reads are unchanged.

## 2. Your wire: confirmed as sent

Everything in §2 of my last packet landed as written:
- generational task ids, and the `superseded` status;
- one 409 `stale_extraction` on `POST /human_tasks/{task_id}/act`;
- pcn↔pdn at `review` keeps the stage and answers `task_id` and `superseded_task_id`;
- `review_task_id` on the status row and on `/ingest/mine`;
- a `message` on every 409, and `unbound_required_slot` on the three canvas-seed 409s;
- title-candidate boxes bounded to page fractions (otherwise 422).

**One correction to my last packet.** It named the act route `/humantask/{id}/act`. The route is `POST /human_tasks/{task_id}/act`, as it has always been. The packet file now reads correctly.

**Two guarantees I added in review**, both visible to you:
- `new_task_id` is never the task you acted on. If the row has no other open task, it is `null`.
- When two pcn↔pdn changes race at review, the winner's new task stays open. The loser never withdraws it.

## 3. What this unblocks

- 7f can convert the review rows' `evidence_ref` to fractions now. I have told them to drop `page_dims` in the same commit, as you asked.
- `/canvas/seed`: tell me if anything moved with the dict `detail`.
