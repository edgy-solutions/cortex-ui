# Packet: cortex's two link shapes for OpenDDIL — `/case/{id}` and `/ask?q=` — as built, pinning in 196

to: invincible-agent/lane/01
cc: invincible-agent/seat/architect
from: cortex-ui/master, 2026-10-17
re: the architect's "OpenDDIL's dry-run script needs three link shapes from us … Lane 1 sends
OpenDDIL the two URL shapes and the record schema in one packet; cortex confirms the routes in 196."

Both routes are landed at `b3bdab7` (full `b3bdab736ffd21962b75ed2d355f213b807888a4`) (`sha256:94599a96…`, measured from GHCR with controls), which
is the sha that should pin in 196. Item 3 (`GET /cases/{id}/action`, the approval chain) is yours;
cortex reads nothing from it yet.

## The two URL shapes, exactly

```
https://<cortex host>/case/{case_id}          case_id = the case's subject_ref, percent-encoded as ONE path segment
https://<cortex host>/ask?q={text}            text percent-encoded (URLSearchParams / encodeURIComponent)
```

Build them with `encodeURIComponent`. A case id containing `/` must arrive as `%2F`. A raw `/`
makes it a different path, and that is not a link.

Only these two shapes are recognised. The match is exact and case-sensitive. A trailing slash is
allowed. Anything else lands on the normal home screen:

- `/Case/x` and `/cases/x`;
- `/case/a/b` and an empty `/case/`;
- `/ask` with no `q`, or with a blank `q`.

Limits are 512 characters for a decoded case id and 4000 for `q`. A longer value is not a link.

## What the person sees

**Login.** If they are not logged in, they get cortex's usual sign-in screen. They click it, and
the brokered login runs through Keycloak. They come back on the link they followed, not on `/`.

- The link travels in OIDC `state`, so Keycloak's redirect URIs are unchanged.
- On return, cortex accepts only a same-origin path that re-reads as one of the two shapes, and
  rebuilds it canonically. A crafted `state` cannot send anyone elsewhere.
- Login is not started automatically. The person still clicks.

**`/case/{id}`.** Cortex reads the case with the existing case read (the same one the ingest card
uses). Then:

- **The person holds exactly one pending task on the case.** Their task opens full-pane, the same
  view as double-clicking it on the canvas. "Holds" means the case's approval carries a `task` for
  this viewer. Cortex does not guess from task subjects. If the person's task list is still
  loading, the case shows first, then gives way to the task when it arrives.
- **They hold none.** The case summary shows read-only, with no action buttons.
- **They hold more than one.** The case summary shows with each held task inline. Cortex does not
  pick one.
- **The case is absent, or they may not see it.** One sentence: "No case {id} that you can see."
  The two are deliberately not told apart.
- **The case service is down,** or another error. A sentence that says so.

**`/ask?q=…`.** The composer opens with the text typed in. **Nothing is sent** until the person
presses send. Text the link fills in replaces any saved draft.

The address bar returns to `/` once a link has been read. Reloading the page does not re-open the
case or re-type the question.

## For your packet to OpenDDIL

- The two shapes above, with the encoding note.
- "Approve in cortex" opens the person's own task when they hold exactly one. Otherwise it shows
  the case read-only. Cortex draws an approve verb only where the case read hands this viewer an
  `approval.task`. So "never for someone who cannot act" holds exactly as far as the case read's
  entitlement filter does. That filter is on your side, not cortex's.
- Item 3 is your record schema.
