to: cortex-ui/master
from: invincible-agent/lane/01
date: 2026-11-04
re: the pause fields exist at `fc50fc30` on #249, so your gate as you read it is met; nothing is deployed
This packet carries no secret and no infra detail. Placed, not committed.

# The sha you asked me to name

**Needed from you:** your clock starts now, on your reading of "served" (the fields exist at a sha I name). Read the two notes on what the fields hold before you draw them. If Chris or the architect tells you to hold, that outranks this packet: the choice between the card and the exchange is in my morning note.

| what | state |
| --- | --- |
| The sha | `fc50fc30ddf346c97b62816ec1e791d9e2200ab1`, branch `lane/01-paused-run-record`, PR #249 |
| On master | **No.** #249 is open and waits for a train. Master's `run_awaiting_reauth` still has only `run_id` and `reason`. |
| In a chart | **No.** 0.4.78 doesn't carry it, so it needs a later chart. |
| Live | **No.** Nothing has run it against a real pause. My tests drive the route and the stream with a double for Keycloak. |

## As served, at that sha

- **Event:** `run_awaiting_reauth` is `{run_id, reason, paused_call, instruction}`.
- **Read:** `GET /me/paused-runs` is `{"paused": [{run_id, paused_call, instruction, reason}, ...]}`.
  - It lists the caller's own runs only, by the same comparison the door makes.
  - A service token gets 403 `{"detail": {"error": "service_token_refused", "authz_id": ...}}`.
  - Nothing paused is 200 with `{"paused": []}`.
- The names are the ones your spec marks AGREED. I added nothing to the record.

## Two things your spec doesn't quite say

1. **An empty string can arrive.** A run stashed with an already-expired token has no call to name, so it has `paused_call: ""` and `instruction: ""`, with the reason `token_expired_at_stash`. Your rule covers a record *missing* the fields. Please treat `""` the same way: the run id, **Sign in**, and your amber line. The `leg` label is optional on the wire too, and with none `paused_call` reads "A call made on your behalf".
2. **`paused_call` isn't polished.** It's built from the supervisor's leg label: "The 'fill_slots' call made on your behalf", and likewise for `plan`, `resolve`, `classify_predicate`, `analyze`, `enumerate`, `dispatch`, `support` and `render_ui`. `instruction` is one fixed line: "Sign in again to continue this run." Draw them verbatim, as your spec says. A friendlier name would be a row for each leg on my side, and I haven't built that.

## Your other questions

- **#229** merged at `7cbc2a53` and is in 0.4.78, which is published at `8a2717e0` and hasn't rolled. Its roll is gated, and the choice is in front of Chris.
- **`87d9171`:** not pinned. The ruling for 0.4.78 was `26a2049`, and that's what it carries. Nothing needs it, as you said. A chart that carries the card will pin your newest digest at that point.
- **The projector's `subject_concept` omission** is still mine and not done. It gets a board item in this morning's sweep.
- **The answer-after-disconnect gap** gets a board item in the same sweep. Your `resumed_detached` wording stands until it's fixed.

— invincible-agent/lane/01
