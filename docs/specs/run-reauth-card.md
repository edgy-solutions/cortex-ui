# Paused-run sign-in card

**Status:** NAMES AGREED, NOT BUILT. Chris, 2026-11-03: "build behind a flag only if Lane 1 confirms the state is served". Lane 1 accepted the names and says nothing is served yet. Here "served" means the fields exist at a sha Lane 1 names, not that they are deployed, because #229 can't roll before the card. What this page says about #229 was read from the source, not run.

**The contract:** the architect, 2026-11-03: "a run in `awaiting_reauth` surfaces one card from the served state (run id, which call paused, what the person must do, a Sign in action that goes to Keycloak and resumes the run on return). Nothing in the card names a workflow or domain; the text comes from the served pause record. Feature-flagged."

**Source:** invincible-agent#229, merged at `7cbc2a53`, and Lane 1's packets of 2026-11-03. That merge has `run_id` and `reason` only.

**Owners:** cortex-ui draws the card. Lane 1 serves the pause record. Names marked AGREED were accepted by Lane 1 on 2026-11-03 and aren't built yet. Neither side renames them alone.

## The pause record

| Field | Type | Status | Use |
|---|---|---|---|
| `run_id` | string | on #229 | Addresses the door. Shown on the card. |
| `paused_call` | string | AGREED | Which call paused, as text a person can read. Not the opaque `call_id`, which changes on every poll. Drawn verbatim. |
| `instruction` | string | AGREED | What the person must do. Drawn verbatim. |
| `reason` | string | on #229 | Log code. Never drawn, never branched on. |

Lane 1 serves one record in two places, with the same fields:

- **The event:** `run_awaiting_reauth` on `POST /interview/stream`. `run_reauth_resumed` stays `{run_id}`.
- **AGREED read:** `GET /me/paused-runs` answers `{"paused": [record, ...]}`, for the caller's own runs only, using the door's gate. An empty list is the normal answer, not a 404. It means nothing is paused that this BFF pod knows of, because the pause state is in that pod's memory and a restart empties it.

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
| `resumed_detached` | The door answered 200 and this page has no stream for the run | "Resumed, but this page stopped following the run, so its answer won't be written. Ask again to get it." |
| `gone` | The door answered 404 | "This run can't be resumed. It has ended, or you signed in as someone else." |
| `failed` | Any other door answer or a network error | The status line, **Try again** |

- `paused_call` and `instruction` come only from the record. Cortex's own text is the generic control and status wording above, and it names no workflow, kind or domain.
- A record missing `paused_call` or `instruction` still draws the run id and **Sign in**, plus an amber line naming the missing fields. A run must not lose its way out over a missing label.
- A record with no `run_id` draws an amber refusal and no action, because there is nothing to address.
- `stream_end` or a `pipeline_error` removes the card for that run. The existing error line reports the failure.

## Sign-in uses a popup, not a redirect

The dispatch says "resumes the run on return". The return has to land where the stream still is:

- `/interview/stream` is a POST that launches a job, so it cannot be reopened to re-attach.
- A full-page redirect closes the stream, and as I read #229 the gateway writes the answer inside that stream's generator (`_dispatch_answer_artifact`). The run would resume and its answer would never be written. Lane 1 confirmed this by reading the code, and neither of us has run it. It holds for any client that leaves, so #229 didn't introduce it.

So **Sign in** calls `signinPopup`, and the same stream carries on. `redirect_uri` is the bare origin, which Keycloak already allows.

Reloading the page, or arriving from a new tab, is the only way into `resumed_detached`. On load, with the flag on, cortex reads `GET /me/paused-runs` once and draws those records.

## Three changes outside the card

These keep the rest of the app from defeating the card. All three apply only with the flag on.

1. **One `UserManager`.** `auth.signinPopup()` and `auth.signinSilent()` turn any failure into `auth.error`, and `RequireAuth` then replaces the whole app with "Retry Connection". Closing the popup would destroy the card and the stream. `AuthProvider` builds the manager in `src/auth/`, and the card calls it directly.
2. **A failed background renewal waits while a run is open.** Today `SilentRenewRecovery` removes the user and redirects, and `RequireAuth` blanks the app. With a stream open both hold back, and recovery runs when the stream ends.
3. **Flag off is today's behaviour.** The flag is `runReauth` in `VITE_FEATURES`, default off. Off means the events are ignored, nothing is read, the door is never called, and auth recovery is unchanged.

## Rollout

- **Pin order:** #229 rolls only with this card or a configured exchange. The flag goes on for the release carrying #229 and the agreed names.
- **The build starts** when Lane 1 names the sha carrying the agreed fields. A producer-seal arm then reads them from the gateway at that sha.
- **Not proved before a roll:** the real Keycloak popup round trip and the live wire.

## Lane 1's answers, 2026-11-03 (from reading the code, not from running it)

1. The names are accepted, and Lane 1 adds them. `paused_call` will come from the call being redeemed, with no workflow or domain name typed in code.
2. A run resumed after its client has gone writes no answer. Lane 1 opens a board item for the gap and tells cortex if it moves. If it moves, the `resumed_detached` wording changes.
3. A paused run with no stream joins the slot ruling that Lane 1 has put to the architect, which is still unanswered.
