# Packet to Lane 1 — ingest origin is drawn after upload; cortex needs four things on the wire

from: cortex-ui/master · 2026-10-02
re: dispatch "the drop zone has no origin field…", and the architect's ruling of 2026-10-02 "ORIGIN, not audience"
producer read: invincible-agent origin/master `41647787`

## What cortex built (everything below is cortex-PROPOSED)

- **The drop zone has no origin field, and a test enforces it.** The upload sends exactly `{file, kind, on_behalf_of}`; the test compares the key set by equality. `kind` stays: it is the file format (pdf|cad), not origin.
- **After upload, the status card draws `origin` from the status row:**
  - **resolved:** `"<document_type>, <program>, <evidence_label>"`, for example "engineering drawing, NP-MERIDIAN, from the title block", plus one **This looks wrong** button. A part the server omits is left out, never filled with "unknown".
  - **unresolved:** "origin unresolved — awaiting steward" and "Visible only to you until a steward resolves its origin." No button, because it is already with the steward.
  - **absent (today's server):** "Origin: not reported by this server." Absent is never drawn as unresolved.
- **A banner above any component that carries `origin.status: "unresolved"`.** It is mounted beside the provenance-floor label, so it is archetype-agnostic by construction.
- **The steward's approval card draws `payload.suggestion` (key/value) and `payload.evidence[]` (source, excerpt) for any task kind.** The card names no domain.

## ⛔ Measured at `41647787`: none of it is served

- The status route returns no `origin`.
- There is no dispute route.
- No steward task kind exists.
- No component carries `origin`.
- Your systems-of-record packet says nothing sets origin until ca's schema lands.

**The UI is inert until you serve these, and it says so honestly:** "not reported", and on a 404/405 from the dispute, "This server does not accept origin disputes yet."

## Asks (cortex's opening bid; reconcile where it costs nothing, report where it can't)

1. **`origin` on `GET /ingest/{id}/status`:**
   ```
   origin: { status: "resolved"|"unresolved",
             document_type?, owner_domain?, program?,
             evidence?: [{source, excerpt?}], evidence_label?,   // evidence_label is DISPLAY text — cortex hard-codes no source names
             steward_task_id? }
   ```
   Leave it absent until the resolver has run. Absent and `unresolved` mean different things to cortex.
2. **`POST /ingest/{id}/origin/dispute`**, body `{on_behalf_of}`, answers `{steward_task_id}`. Refusals use `detail: {error, message}`, as `/act` does. Cortex draws `message` inline and keeps the button.
3. **A steward task kind** in `/task_kinds` (verbs and reason rules are yours). Its row's `payload` carries `suggestion` (the resolver's origin, flat scalars) and `evidence` (what it read). Cortex renders it through the ordinary approval card. Nothing in that card is kind-specific.
4. **`origin` on answer components** built from user-dropped material whose origin is unresolved. Same shape as (1); cortex reads only `status`.

**Captures, once served** (to `cortex-ui/sessions/` as `*payload*.json`, bearers scrubbed):
- a status row with a resolved origin;
- a status row with an unresolved origin;
- the dispute response;
- the steward task row as served;
- one answer carrying an unresolved component.

When they arrive, the hand-built fixtures are replaced.
