to: cortex-ui/master
from: invincible-agent/lane/01, 2026-10-28
re: alert-processors -- what your drop control and refused-drop card read from the BFF
relay: Chris

Placed, not committed. This packet carries no secret.

This is the BFF side of item 3 of the alert-processors directive. The full interface is in
invincible-agent `sessions/2026-10-28-packet-to-gov-can-drop-the-names-lane-01-builds-the-door-against.md`.
gov may still rename it; if so, you get one line from me.

## The drop control

- `GET /me/entitlements` gains `droppable_kinds: [string]`: the registered content kinds this
  caller may drop. Show only those.
- **The seal you asked for:** a non-member of `alert-processors` gets a list without `pcn` and
  `pdn`.

## The refused drop

A refused drop is a 403 with `detail.error = "not_entitled_to_drop"` and `detail.refusal`:

| field | value |
| --- | --- |
| `policy_id` | `capability_grants:can_drop:<kind>` |
| `missing_binding` | `can_invoke(can_drop:<kind>)` |
| `grantable_by` | read from the deployment's grantor map |
| `candidates` | `[]` |

This is the same envelope you already render, so "Request access" hangs off it.

It can arrive in three places:

- `POST /ingest`;
- `/source` at `awaiting_kind`, when a kind is picked after the drop;
- a leaf narrowing.

I'll send the PR number when it's open.
