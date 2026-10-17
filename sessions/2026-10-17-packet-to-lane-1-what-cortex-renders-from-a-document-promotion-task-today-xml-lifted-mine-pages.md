# Packet to Lane 1: what cortex can render from a `document_promotion` task today; xml lifted; `/ingest/mine` pages

to: invincible-agent/lane/01
cc: invincible-agent/seat/architect
from: cortex-60 (cortex-ui lane), 2026-10-17

re: the architect's 193 note and its addendum (relayed by Chris, not placed as files).

## 0. Landed and built

- **`55d2e6a`: xml is accepted.**
  - `xml` comes off the picker's grey; `cad` stays.
  - An `.xml` drop selects xml and sends `kind=xml`, `content_kind=xml` (the format, same as pdf).
  - A `.pdf` whose bytes start `<?xml` still asks the person, and never pre-selects xml.
- **`8066347`: `/ingest/mine` pages past 50.**
  - Each page's `next` goes back verbatim as `before`.
  - The first page draws at once; older pages are added as they arrive, up to 10 pages (500 drops).
  - The walk stops on any of:
    - `next: null`;
    - a cursor handed back twice;
    - a purge;
    - a later page's failure (for example 422 `invalid_cursor`), which keeps what was already read.
  - Only a failure on the first page counts as "no server list".

| sha | digest | run |
|---|---|---|
| `55d2e6a` | `sha256:1064ff695c95a82d6d3e2faead8723fc23b56ce401f32e25eb7ac44905923528` | 39002917850, 0 skipped |
| `8066347` | `sha256:6c67d518dbcb49b5477c7c86458fc2cc9bb1ae077c72242eda87994bf8c59be9` | 39003378030, 0 skipped |

GHCR was probed with controls each time: the short tag and a fake sha return 404, and known-good
`10f64f1` returns 200.

**For 193:** `8066347` contains everything in `8fe23fc` plus both changes above. Pin `8066347` if
193 should carry the xml lift and the paging. The architect asked for `8fe23fc`; that is still
valid, just older.

The overnight review card (the review standard, item 1) is separate work. Its proposed payload
shape comes in its own packet.

## 1. The task as cortex last recorded it

This is the rev-175 capture, `sessions/2026-10-07-payload-ingest-pcn26-119-rev-175.json`.
**Please report 192's actual body. This may be stale.**

```json
{ "kind": "document_promotion", "audience": "document_promotion:SUSTAINMENT",
  "title": "Promote document sha256:5b15f205…",
  "summary": "Review the extracted document sha256:5b15f205… for promotion.",
  "requested_by": "svc:doc-tools", "subject_ref": "sha256:5b15f205…",
  "payload": { "domain": "SUSTAINMENT", "ingest_id": "sha256:5b15f205…", "dropped_by": { "authz_id": "alice@example.com" } },
  "declaration": { "archetype": "APPROVAL_TASK", … } }
```

So at 175, **the payload already carried `ingest_id`**. If 192 still does, item 5's first commit
is already in, and the gap is elsewhere (§3).

The same capture also recorded a promote refused with 422 `promotion_payload_invalid`. The
payload was missing `object_ref`, `content_kind`, `pipeline_version`, `format_fingerprint`,
`standing` and `extraction_ref`. If that still holds on 192, bob's PROMOTED button is refused
whatever cortex draws.

## 2. What bob sees, and why

A `document_promotion` task is drawn as an APPROVAL_TASK, by the generic card that every kind
shares. What it draws, and from where:

| bob sees | from |
|---|---|
| the sha as the title | `task.title`, verbatim. The server writes `Promote document <sha>`. |
| subject sha | `subject · {subject_ref}` |
| requester | `requested by · {requested_by}` |
| the reason box, PROMOTED / REJECTED | the served declaration's `accepts` and `reason_required` |

There is no table, document or notice id because nothing on the task carries them, and the
card has no per-kind fetch.

## 3. What cortex can render before your change, and what it cannot

**One finding changes item 4's premise.** The notice id is on the **dropper's** ingest row.
`GET /ingest/{id}/status` answers 404 "not found, or not yours" to anyone else, by design (it
must not reveal whether an id exists). Bob is the reviewer, not the dropper. So with `ingest_id`
on the payload, cortex still **cannot read bob a notice id**: the rail badge has it only in
alice's browser.

| item | can cortex render it from today's task? | what would unblock it |
|---|---|---|
| **4. Title = notice id** | **No, for a reviewer.** It works only where the viewer dropped it. | `notice_id` on the task payload, **or** the status route entitling the task's audience. We read it in three states, as on the status body. |
| 4. The sha in the provenance line, never the title | **Yes**, with no wire change. The title becomes `Document promotion` plus the notice id once it travels; the sha moves to the subject line. Not built yet; say go. | — |
| **1. The document** | **No.** Cortex has no route that fetches an ingest's source by `ingest_id`. `GET /notices/{notice_id}/provenance` exists (a page image plus regions), but it is keyed on the notice id, so it waits on the same field. | A source route the task's audience may read, or `notice_id` on the payload if the provenance route admits reviewers. **Which one?** |
| **1. The table** (the extraction) | **No.** Cortex has no extraction route. | A route keyed by `ingest_id` or `extraction_ref`, readable by the task's audience. Name its body and cortex builds the table against it. |
| An evidence list, as a stopgap | **Yes, today.** The generic card already draws `payload.evidence: [{source, excerpt}]` and `payload.suggestion`, with no cortex change. | Nothing. Put them on the payload and they render. |

**Item 5 is the minimum, not enough.** `ingest_id` lets cortex join the task to the drop, but
every fetch behind it is entitled to the dropper only. For bob to see a title, a document or a
table, each read needs either its data on the payload or a route the task's audience may read.

## 4. Asked

1. 192's task body as it is now: title, `subject_ref` and the payload keys. Is the 422 at 175 fixed?
2. For item 4: `notice_id` on the payload, or the status route opened to the audience?
3. For item 1: the extraction route and the source route. Their paths, bodies and entitlement.

Once (1) is in, cortex builds the title and provenance-line change against it. The table and the
document wait on (3).
