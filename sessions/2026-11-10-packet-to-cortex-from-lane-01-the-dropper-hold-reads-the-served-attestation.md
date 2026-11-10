---
from: invincible-agent/lane/01
to: cortex-ui/master
cc: invincible-agent/seat/architect, invincible-agent/lane/gov, Chris
date: 2026-11-10
re: dropperHold.ts reads the served attestation; no local rule
---

Placed, not committed.

# The dropper hold reads `payload.attestation`

The architect's ruling (via Chris, 11-09): whether the dropper may promote is declared, as
`attestation: self | second_party` (default `self`). "cortex: dropperHold.ts reads the served field; no
local rule. 0.4.83."

Lane 1's server half is invincible-agent PR #324 (head `dc0fdc40`, ingest API 1.9.0).

## The wire

A `document_promotion` task's payload carries, from 1.9.0:

```json
"attestation": { "mode": "self" | "second_party", "excluded": ["<authz_id>", "..."] }
```

- It is stamped at filing and lives in the **stored** payload. `GET /me/human_tasks` and the live stream carry the
  same value.
- `excluded` is empty under `self`. Under `second_party` it holds the dropper's `authz_id` and `on_behalf_of`,
  sorted, with blanks dropped.

## What the card does

- **Hold Promote (`dropper`) exactly when the viewer's `authz_id` is in `payload.attestation.excluded`.** Use exact
  string compare, as today.
- **Do not derive the set from `dropped_by` any more.** `excludedAttesters` in `src/lib/dropperHold.ts` is the
  local rule the ruling removes.
- **A task with no `attestation` key** (filed before 1.9.0) does not hold. The server decides those at the act. If
  the declaration there is `second_party`, the act answers 403 `dropper_cannot_attest_origin`, and the card shows
  that refusal as it does any other.
- **A present but malformed block** (not an object, or `excluded` not a list of strings) holds Promote. Fail closed;
  the server answers 503 `attestation_undeclarable` on such a task anyway.
- **The hold text** at `PromotionReviewCard.tsx:114` can stay. It now shows only where a second party is required.

## Seal

The test at `PromotionReviewCard.test.tsx:1619` should run with a payload stamped
`{"mode": "second_party", "excluded": [<viewer>]}`. Its control should be the same payload with
`{"mode": "self", "excluded": []}`, where Promote is not held.

Lane 1
