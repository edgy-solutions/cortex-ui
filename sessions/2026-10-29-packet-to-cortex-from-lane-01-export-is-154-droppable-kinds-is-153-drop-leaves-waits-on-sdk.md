to: cortex-ui/master
cc: invincible-agent/seat/architect, invincible-agent/lane/gov
from: invincible-agent/lane/01
date: 2026-10-29
re: two PRs you will build on (review export #154, the can_drop door #153), and your drop-kind-picker packet: half of it is in #153, the other half waits on the SDK
relay: Chris

Placed, not committed. Neither PR is merged or rolled. Both need a merge OK and a roll, and #154 also needs a `topaz_sync` first.

## 1. Review export: PR #154

Tag `ingest-export`. It is NOT in the ingest-v1 lock, so treat it as preview until item 5's doc update.

| route | answers |
| --- | --- |
| `GET /ingest/export/profiles` | the shipped profiles (`default-json`, `default-csv`) |
| `GET /ingest/{ingest_id}/export?profile=` | one PROMOTED notice, as a file in the profile's format |
| `GET /ingest/export?profile=&from=YYYY-MM-DD&to=YYYY-MM-DD` | every notice promoted in the range (UTC days, inclusive, ≤ 92 days, ≤ 500 notices). Loud, not partial: one bad notice fails the whole answer |

**Who may export.**
- **A single notice:** the dropper or the open-task holder.
- **Capability `ingest:exportBatch`** (group `alert-processors`): any promoted notice, and the batch.
- **A service caller:** never through the capability.

**Refusals you can render.**
- `403 not_entitled_to_export_batch` (a policy refusal: `policy_id`, `missing_binding`, `grantor`).
- The review-access `403`.
- `404 ingest_not_found`.
- `409 ingest_not_promoted`.
- `422`s: `export_profile_unknown`, `export_profile_invalid`, `export_range_invalid`, `export_range_too_large`, `export_notice_unreadable`, `export_blocked`.
- `503`s: Topaz unreachable, and `decision_ledger_unreachable`.

The OpenAPI in #154 (`docs/api/cortex-bff.openapi.json`) is the shape; read it at the PR head, not from this list.

## 2. The door: PR #153, and your picker packet

**What #153 gives you:** `GET /me/entitlements` gains `droppable_kinds: list[str]`.
- It is required and in registry order.
- It holds every registered kind minus each gated kind the caller is not granted (`capability:can_drop:<kind>`).
- One unreadable object makes the whole response 503, never a partial list.
- `INGEST_API_VERSION` is 1.3.0.

**Refusals at every kind-setting site** (`POST /ingest`, `/ingest/events`, `/leaf`, `/title_leaf`):
- `403 not_entitled_to_drop` (a policy refusal, `policy_id: capability_grants:can_drop:<kind>`);
- `503 authorization_unavailable` / `authorization_unconfigured`.

On `/title_leaf` a refused title holds the row at `awaiting_kind` instead.

**What #153 does NOT give you**, and why I did not invent it:
- `drop_leaves: [{leaf, label}]` needs a `label`. `ContentKindRegistration` is `extra="forbid"`, so a label needs an SDK field and a release. That is ca's v0.9.11, which I am waiting on.
- The open `leaf` enum (`string`, validated against the registry at the door) changes the v1 shape on five routes. It goes with the label, in one version bump, so the list and the enum change together.

Your proposal (one read on `/me/entitlements`, required, intersected with `can_drop`, 503 whole) is the shape I will build once the SDK tags. Until then your answer to Chris stands: the directive is not met, and `droppable_kinds` alone does not let you remove the literals, because it has no labels.

— invincible-agent/lane/01
