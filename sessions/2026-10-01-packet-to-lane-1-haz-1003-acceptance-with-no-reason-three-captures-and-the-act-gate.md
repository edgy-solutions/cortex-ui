# Packet to Lane 1 — HAZ-1003 was accepted with no reason: what cortex found, three captures, and the act gate

from: cortex-ui/master · 2026-10-01
re: bob's decision on `risk-acceptance-HAZ-1003-medium` (14:17), the first end-to-end run of the safety feature

## Bump to (roll #12) — replaces d2e56047

```yaml
cortexUi:
  image:
    digest: "sha256:613b6c353a9a2e5feecf0a39a34ac3c15e2b657c2c04008ef2d8cb87d6d16d6d"
  env:
    VITE_FEATURES: "canvasExport,ingest"   # unchanged
```

**Digest:** read from the GHCR API for the bare full sha `0489d3683c2ea68108be58224af03b399217ee16`.
- Controls:
  - the short sha returns 404;
  - a fake sha returns 404;
  - `b97b9d5` resolves to `d2e56047…`.
- Platforms: linux/amd64 and linux/arm64, plus 2 attestation entries.
- Run 36947865678: 34 steps, 0 skipped.

This image contains everything in `d2e56047` (the ingest and export seals) plus this fix. **`d2e56047` should not be rolled.**

## What happened, as far as cortex can see

- Bob clicked **Approved**. Nothing asked for a reason, so cortex sent `{decision: "approved", comment: ""}`. The gateway accepted it.
- `risk_acceptance_medium` does not accept `approved`: its declaration is `accepts: [accepted, rejected, returned_for_rework]` and `reason_required: [accepted, rejected]`.
- So the record probably holds **a verb outside the real kind's vocabulary AND an empty reason**. Please confirm by reading it (ask 1).

**There are two causes, and only one of them is yours.**

1. **Cortex's: the served menu has never been read live.**
   - `GET /task_kinds` returns `{composed, kinds: {<kind>: decl}}`, where `kinds` is an object.
   - Cortex's `fetchTaskKinds` only accepted an array, so it read "unreachable".
   - So every approval card used its fallback verbs `approved/rejected`, with no reason gate.
   - The reason gate on the card was built correctly and was never given a declaration.
   - **This alone would have produced HAZ-1003's empty reason, even with the right kind.** It is fixed in `0489d36`; the digest is below.
2. **Yours: the row's kind is `workflow_ack`.** `workflow_ack` declares `approved/rejected` with no reason. So `/act`, validating against the row's kind, had nothing to refuse. Your worker fix for the kind rides roll #12.

**Why enforcing `reason_required` at `/act` is necessary but not sufficient:** it reads the row's kind. On the HAZ-1003 row as it was, that is `workflow_ack`, so it would still have returned 200. **The audience gave the contradiction away:** `risk_acceptance_medium:SUSTAINMENT` names a declared kind that is not the row's.

## Asks

1. **Read the decision record** for `risk-acceptance-HAZ-1003-medium` (bob, 14:17), and report its `decision` and `comment`/reason as stored. If it is `approved` with an empty reason, the record needs a human ruling: it is an acceptance outside the species' vocabulary with no rationale. Cortex will not act on it.
2. **Enforce at `/human_tasks/{id}/act`**, and seal it:
   - **(a)** `reason_required` → 422 on an empty or whitespace reason. Use `detail: {error, message}`: cortex draws `message` and shows `error` as a code, inline, with the buttons kept.
   - **(b)** refuse when the audience's `<kind>:` prefix names a declared kind other than the row's kind.
   - Cortex now refuses (b) on its side too (no buttons, the contradiction drawn). But a client check is not the gate.
3. **Three captures**, raw, into `cortex-ui/sessions/` as `*payload*.json`, with bearer tokens scrubbed:
   - **(i)** `GET /task_kinds` from the deployed gateway, the whole body. Cortex's new reader is sealed on a body shaped from `gateway.py`, not on a capture.
   - **(ii)** the HAZ-1003 task row **as served**, both from the REST listing cortex seeds from and, if you can, the Electric row. Cortex's contradiction check is sealed on a hand-built row from the screenshot until this arrives.
   - **(iii)** the `/act` response to bob's approve, if it is still in a log: specifically whether `workflow_resumed` was true. Cortex now shows the verb ("Accepted") only when the response says the workflow resumed, and otherwise "Recorded: … — workflow not resumed".

## Unchanged

- **The card export stays** until a successful (`status: "exists"`) export capture.
- **The faded "No content available" draft card** is the pre-fix answer. Re-asking after roll #12 should draw the six fields.
