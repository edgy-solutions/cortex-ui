# Paused-run sign-in card

**Status:** SPEC. The architect, 2026-11-03: "a run in `awaiting_reauth` surfaces one card from the served state (run id, which call paused, what the person must do, a Sign in action that goes to Keycloak and resumes the run on return). Nothing in the card names a workflow or domain; the text comes from the served pause record. Feature-flagged."

**Source:** draft invincible-agent#229 at `4b49b946`, and Lane 1's packet of 2026-11-03.

**Owners:** cortex-ui draws the card. Lane 1 serves the pause record. Names marked PROPOSED are agreed here, and neither side renames them alone.

## The pause record

| Field | Type | Status | Use |
|---|---|---|---|
| `run_id` | string | on #229 | Addresses the door. Shown on the card. |
| `paused_call` | string | PROPOSED | Which call paused, as text a person can read. Not the opaque `call_id`, which changes on every poll. Drawn verbatim. |
| `instruction` | string | PROPOSED | What the person must do. Drawn verbatim. |
| `reason` | string | on #229 | Log code. Never drawn, never branched on. |

Lane 1 serves one record in two places, with the same fields:

- **The event:** `run_awaiting_reauth` on `POST /interview/stream`. `run_reauth_resumed` stays `{run_id}`.
- **PROPOSED read:** `GET /me/paused-runs` answers `{"paused": [record, ...]}`, for the caller's own runs only, using the door's gate. An empty list is the normal answer, not a 404.

The door is unchanged: `POST /orchestrate/{run_id}/reauth`, Bearer token, no body. 200 means live, 404 means gone or another person's run, and 403 means a service token.

## The card

There is one card per `run_id`, mounted above the answers beside `AccessDeniedCard`. `data-run-reauth` carries the state.

| State | Entered when | The person sees |
|---|---|---|
| `renewing` | A pause arrives. Cortex tries a silent renewal, then the door. | Run id and "Renewing your sign-in". No action. |
| `needs_signin` | Silent renewal failed, or two automatic resumes in a row paused again | Run id, `paused_call`, `instruction`, **Sign in** |
| `signing_in` | Sign in was clicked and the popup is open | "Finish signing in in the other window" |
| `blocked` | The popup could not open, or was closed unfinished | "The sign-in window didn't finish", **Try again** |
| `resuming` | The door answered 200 and the stream is still attached | "Resuming". The card clears on `run_reauth_resumed`. |
| `resumed_detached` | The door answered 200 and this page has no stream for the run | "Resumed. This page isn't following the run, so its answer may not appear here." |
| `gone` | The door answered 404 | "This run can't be resumed. It has ended, or you signed in as someone else." |
| `failed` | Any other door answer or a network error | The status line, **Try again** |

- `paused_call` and `instruction` come only from the record. Cortex's own text is the generic control and status wording above, and it names no workflow, kind or domain.
- A record missing `paused_call` or `instruction` still draws the run id and **Sign in**, plus an amber line naming the missing fields. A run must not lose its way out over a missing label.
- A record with no `run_id` draws an amber refusal and no action, because there is nothing to address.
- `stream_end` or a `pipeline_error` removes the card for that run. The existing error line reports the failure.

## Sign-in uses a popup, not a redirect

The dispatch says "resumes the run on return". The return has to land where the stream still is:

- `/interview/stream` is a POST that launches a job, so it cannot be reopened to re-attach.
- A full-page redirect closes the stream, and as I read #229 the gateway writes the answer inside that stream's generator (`_dispatch_answer_artifact`). The run would resume and its answer would never be written. **Lane 1 to confirm.**

So **Sign in** calls `signinPopup`, and the same stream carries on. `redirect_uri` is the bare origin, which Keycloak already allows.

Reloading the page, or arriving from a new tab, is the only way into `resumed_detached`. On load, with the flag on, cortex reads `GET /me/paused-runs` once and draws those records.

## Three changes outside the card

These keep the rest of the app from defeating the card. All three apply only with the flag on.

1. **One `UserManager`.** `auth.signinPopup()` and `auth.signinSilent()` turn any failure into `auth.error`, and `RequireAuth` then replaces the whole app with "Retry Connection". Closing the popup would destroy the card and the stream. `AuthProvider` builds the manager in `src/auth/`, and the card calls it directly.
2. **A failed background renewal waits while a run is open.** Today `SilentRenewRecovery` removes the user and redirects, and `RequireAuth` blanks the app. With a stream open both hold back, and recovery runs when the stream ends.
3. **Flag off is today's behaviour.** The flag is `runReauth` in `VITE_FEATURES`, default off. Off means the events are ignored, nothing is read, the door is never called, and auth recovery is unchanged.

## Rollout

- **Pin order:** #229 rolls only with this card or a configured exchange. The flag goes on for the release carrying #229 and the agreed names.
- **Until the names land:** cortex builds against this page with fixtures. When a pin carries them, a producer-seal arm reads the fields from the gateway at the pin.
- **Not proved before that:** the real Keycloak popup round trip and the live wire.

## For Lane 1 to answer

1. Are `paused_call`, `instruction` and `GET /me/paused-runs` acceptable? `mark_awaiting_reauth` doesn't record the call today.
2. After a stream closes, does a resumed run still write its answer? If it doesn't, `resumed_detached` is a run nobody can read, and the card should say so plainly.
3. A paused run with no stream holds a slot until its budget ends, and no door cancels it. Does that belong in the slot ruling you've put to the architect?
