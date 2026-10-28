# Access-request cards: "Request access" and Grant / Deny

**Status:** SPEC. Build after invincible-agent ADR-0062 reads Proposed. The architect, 10-28: "cortex: the refusal card gets a 'Request access' action and the grantor's card gets Grant/Deny — spec now, build after the ADR is Proposed."

**Source:** ADR-0062 §7, "First slice", steps 1-4, read at draft PR #123 head `511e5927`. The verbs are those in ADR-0062 §2.

**Owner:** cortex-ui.

Every wire name marked PROPOSED is undeclared at this writing. Cortex builds against the declared names only.

## The flow, and which card draws each step

| §7 step | Who | Card | cortex action |
|---|---|---|---|
| 1. Propose | the refused caller | the refusal card (`RefusalCard` via `RefusalOrChoice`; the refused-drop card) | **Request access**: files a grant proposal (engine-r `propose`) to the envelope's `grantable_by` |
| 2. Review | the grantor | the review task (engine-r `review`), drawn on the review card layout (`docs/specs/promotion-review-card.md`) | **Grant**, or **Deny** |
| 3. Merge | engine-r | nothing to click | shows the merge sha and the sync's completion |
| 4. Retry | the requester | the original surface | the requester retries; nothing is retried automatically |

## 1. "Request access" on a refusal card

**Shown when** the envelope (`authz.refusal.refusal`: `policy_id`, `missing_binding`, `grantable_by`, `candidates`) carries a non-empty `grantable_by`. With no grantor named, the button is not drawn. The card says who could grant, or that no one is named.

**It files** one proposal, whose intent names:
- the envelope's `policy_id` and `missing_binding`;
- the requester.

The requester adds nothing else. Cortex never composes the grant row itself; the platform derives it from the binding.

**States** (`data-access-request`):

| state | what it shows |
|---|---|
| `idle` | the button |
| `filing` | the button disabled while the request is in flight |
| `filed` | the proposal id and the review task id, as returned by the platform. Never "granted": filing is not granting. |
| `refused` | the refusal's own envelope, drawn by the same card, e.g. a duplicate open proposal |

**Wire needed.** All of these are PROPOSED; Lane 1 names them:
- the propose route and its body (`policy_id`, `missing_binding`);
- the response (`proposal_id`, `head_sha`, `review_task_id`);
- its declared refusals.

**The Slice-3 request (`AccessDeniedCard`).** §7 says the slice replaces case-1 fulfilment (`human_tasks.write_grant_and_sync`). Whether `AccessDeniedCard`'s Slice-3 request becomes this proposal, or stays a separate path, is the architect's call. Until then, cortex keeps one "Request access" component and swaps only the route it calls.

## 2. Grant / Deny: the grantor's review card

This is the approval task engine-r's `review` files. It renders on the review card layout: top line, rows left, source right, actions.

| region | content |
|---|---|
| top line | the requester · `policy_id` · the missing binding · the proposal id · the head sha (short; the full sha is the tooltip) · the target ref |
| rows, left | the grant the proposal adds, one row per changed line of policy (e.g. `capability_grants.yaml`: subject, object, relation), from the task's diff |
| source, right | the diff of the proposal head against the target ref, as the task carries it, unedited |
| actions | **Grant** and **Deny**, plus a note. Deny requires a reason. |

**Rules:**
- **The proposer cannot approve.** ADR-0041's rule holds (ADR-0062 §2), and §7 lists it among the refusals to observe. Cortex hides Grant/Deny when the viewer is the proposer, and draws the refusal envelope if the server refuses anyway. The server is the enforcer; hiding is a courtesy.
- **Grant approves the reviewed head sha.** The card shows the sha it is approving. If the proposal moved after review, the merge refuses, and the card draws that refusal ("the proposal changed after review").
- **After Grant** the card shows the merge sha and the sync's state as the platform reports them. It never shows "access granted" before the sync completes.

**Wire needed.** All of these are PROPOSED:
- the review task's payload (requester, `policy_id`, binding, proposal id, head sha, target ref, the diff);
- the verb names the task declares for Grant and Deny. Cortex labels them from the task's `verbs`, as the promotion card does, and never from a hard-coded list;
- the post-merge status fields.

## Tests, when built

- No Request access without a `grantable_by`.
- `filed` shows the platform's ids and never "granted".
- The proposer sees no Grant/Deny.
- Grant names the head sha.
- A moved-proposal refusal renders.
- Each arm has a mutant that reddens it.
