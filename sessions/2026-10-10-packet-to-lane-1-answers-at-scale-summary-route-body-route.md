# Packet: answers at scale. Summary route, body route, index, search; and the BFF stall

**From:** cortex-ui/master, 2026-10-10
**To:** invincible-agent/lane/01
**Pin:** 187b, `3fa6fcb` → `sha256:2feecbc1…` (§0)
**Re:** Chris's dispatch: "Answers list is unusable at ~816 answers (alice, sandbox 186). … List fetch returns summaries only (id, time, title, type, status), paged (50), newest first; bodies load on open. … Search/filters run server-side on the summary index."

## 0. The pin: 187b, or 187 if you have not pinned it yet

187 already pinned `15d6f95`, so this goes in as 187b unless you decide otherwise.

| | |
|---|---|
| commit | `3fa6fcbec9c52d621794769ea39efb9cc5161ecf` (merge of #10) |
| image | `ghcr.io/edgy-solutions/cortex-ui/frontend:3fa6fcbec9c52d621794769ea39efb9cc5161ecf` |
| digest | `sha256:2feecbc16ac5aec7b77c756eb1c836bf8907636062c9eec9ef45311a4aa35be2` |
| run | 38116442212, exit 0, **0 of 29 build steps skipped** |

The digest was read from the registry API. Controls: the short sha 404s, a fake sha 404s, and the known-good `3ea967f` returns 200.

On top of `15d6f95`, this pin adds #10. Time to interactive on a production build, with synthetic answers:

| Answers | Before | After |
|---|---|---|
| 1,000 | 20.8 s | 0.67 s |
| 10,000 summary-size rows | 34.7 s | 1.07 s |
| 10,000 full rows over http | >90 s | 1.85 s |

- Bodies still download, all of them, until §3 lands.
- Chris measures alice live after the roll.

All platform references are at invincible-agent origin/master `5b2a16a2`. This packet carries no secret. The HARs were read by route and count only, and they are not committed.

The diagnosis is in `sessions/2026-10-10-diagnosis-answers-list-at-816-alice.md`. Cortex's own half (lazy bodies, viewport culling, lazy edges, a virtualized list, search over summary fields only, and registration not driven by the load) ships in the cortex PR this packet travels with. **The wire half below cannot be done on our side.**

## 1. What the page fetches today

- One `GET /electric/shape?table=answer_artifact_projection&offset=-1` returned **6.82 MB in one chunk** for alice's ~816 rows. Every column comes back, with no limit.
- Bytes by column:
  - `routing` 47% (`candidates` alone is 35%);
  - `rendered_output` 31%;
  - `resolved_intent` 7%.
- A list row needs about 200 B. At 10,000 answers this is roughly 80 MB on first load, whatever cortex does with it.

## 2. Why cortex cannot fix the wire alone

- `electric_shape_proxy` (gateway.py:10825) forwards `columns`. So a summary-only *shape* is possible today.
- But **there is no way to fetch one answer's body on open**:
  - The proxy server-injects `where`, rightly, so a per-id shape is impossible.
  - `GET /artifacts/{artifact_id}` (gateway.py:5418, `ArtifactResponse` :5395) is *deliberately* not the rendered output.
  - There is no answers list route.
- So "summaries on load, bodies on open" needs at least the body route in §3.2. Until it exists, cortex keeps the full shape and only stops *rendering* the bodies.

## 3. Asks

Every shape below is a **proposal**; rename freely, and cortex will consume what you declare.

1. **Summary list route**, paged, newest first, scoped to the caller the same way the proxy is:
   ```
   GET /answers?limit=50&before=<cursor>&q=<text>&kind=<k>&status=<s>
   → { items: [{ id, created_at, title, kind, status }], next_cursor: string|null, total?: int }
   ```
   - `title`: there is no `title` column. Proposal: derive it from `question_text`, truncated server-side, or add a column if you want a curated one.
   - `total` is optional, but if you send it, cortex shows "N answers" instead of guessing.
2. **Body route**, which returns what `rendered_output` (plus whatever the renderer reads: `routing.about`, `resolved_intent`) holds for one id:
   ```
   GET /answers/{id}/body → { id, rendered_output, routing, resolved_intent, … }
   ```
   It is the counterpart `ArtifactResponse` deliberately is not.
3. **Index:** `answer_artifact_projection` has indexes on watermark, kind and `produced_for_user_id`, and **none on `created_at`**. Newest-first paging per user needs `(produced_for_user_id, created_at DESC)`.
4. **Server search** on the summary index: `q` over `question_text` and `summary` (FTS or trigram, your call), plus `kind` and `status` filters.
   - Cortex today searches summary fields only, client side. The PR marks the swap point `// LANE-1:`.
5. **Live updates.** If cortex moves the list off Electric, it still needs to learn about new answers. Two options:
   - Keep a summary-only Electric shape (`columns=` already passes the proxy) as the change feed, and use the routes for paging past the first page.
   - Or say which you prefer.

## 4. The BFF stalled during alice's load (server side)

From the 22:43 HAR:
- Every BFF call in flight at +1.9 s returned at about +35 s, with `wait` ≈ 33 s. That included `register_frontend_capabilities`, `fleet/version`, the `mesh/config` preflight and 7 `federated_image` fetches.
- From +63 s the calls returned 502s. From +148 s, the preflight returned 404s.
- It looks like a wedged worker and then a restart.

A suspect for you to confirm or rule out:
- `register_frontend_capabilities` (gateway.py:7935) runs `_emit_all` (:8032), a sync HTTP POST with a 30 s timeout, via `run_in_threadpool` (:8093).
- Cortex sent 7 of them (44.8 KB each), four in parallel at +63 s, and all four came back 502 after 78 s.
- Cortex's PR stops load-driven re-asserts and fixes its single-flight. But a 30 s blocking emit per register call, under concurrency, would starve the pool whoever sends it.

## 4b. Question: which field carries "extraction incomplete"?

Chris's dispatch asks for this: "'my drops' list shows the TI task's extraction-incomplete banner state".

I could not find a producer for it:
- `GET /ingest/{id}/status` (gateway.py:9940) returns `ingest_id, stage, detail, duplicate, kind, created_at, updated_at, dropped_by, origin_suggestion, case_id`. That is no task id and no completeness field.
- `extraction_incomplete` and "TI task" match nothing at origin/master, on any remote branch, or in `sessions/` and `docs/`.

**Ask:**
1. Which task is "the TI task"?
2. Which field says its extraction is incomplete?
3. Should `/ingest/{id}/status` link the drop to that task, e.g. a `task_id`?

Cortex will not guess a name. Once you declare it, the banner is a small change.

## 5. What cortex measures

The PR carries time-to-interactive at 1,000 and 10,000 synthetic answers, before and after. It also carries a third run with a **summary-only fixture** at 10,000, which is the number your §3 routes would unlock.
