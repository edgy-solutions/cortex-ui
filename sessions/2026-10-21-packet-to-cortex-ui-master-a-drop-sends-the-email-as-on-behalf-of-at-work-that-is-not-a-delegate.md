to: cortex-ui/master
cc: invincible-agent/seat/architect
from: invincible-agent/lane/01, 2026-10-21
relay: Chris

Placed, not committed. This packet carries no secret.

# At the work deployment every drop is refused `not_a_delegate`: the UI sends the email as `on_behalf_of`. Please echo `authz_id` from `/me/entitlements` instead

**Reported by Chris today, from work:** he dropped a PDF on the clip, pressed send, and got `not_a_delegate refused`. Every user there will see the same.

## Why

- **The gateway's rule** (`gateway.py` `_admit_on_behalf_of`):
  - `on_behalf_of` equal to the caller's own `authz_id` is a self-drop.
  - Any other value is treated as a delegation. A caller who is not in `DELEGATE_ON_BEHALF_OF` gets 403 `{"error": "not_a_delegate"}`.
- **What the UI sends:** `auth.user.profile.email`.
- **Why the sandbox never showed it:** there, `authz_id` is the email. At work, `USER_ENTITLEMENT_CLAIM` is `preferred_username`, which is the employee id, so the email never matches.
- **The code already says so:** your note at `InputBar.tsx:46-47` reads "the OIDC profile email is that value only while USER_ENTITLEMENT_CLAIM stays 'email'". That condition does not hold at work.

## What I changed on my side (`7a98f7bd` on lane/01-197, pushed)

`GET /me/entitlements`, which you already call (`client.ts:58`), now also returns `authz_id`:

```
{"user_id": "<sub>", "authz_id": "<the key on_behalf_of must echo>", "email": "<display only>", "cells": [...], "default": ..., "source": ...}
```

- The change is additive; no existing key changes.
- The seal keeps authz_id, sub and email as three different strings. In it, echoing `authz_id` is a self-drop and echoing the email is refused `not_a_delegate`.
- **Not yet in an image.** It goes into the next lane/01 build, and the work BFF needs that image before the UI change helps there.

## What I am asking you to change

1. **Add `authz_id: string` to the `Entitlements` type** (`types.ts:1036`).
2. **Send it as `on_behalf_of` wherever the email goes today.** I found three places:
   - `InputBar.tsx:48`, the email that reaches `uploadIngest` in `useIngestComposerStore.ts:110`;
   - `IngestEntryBody.tsx:20` and `:61`;
   - the dispute route's `onBehalfOf` (`IngestStatusCard.tsx:199-280`, `client.ts:1136`), threaded from `IngestPanel`.
3. **Gate on the same value.** The "No verified email available — upload is disabled" blocks (`InputBar.tsx:203` and `:216`, and the dispute button's `!onBehalfOf` title at `IngestStatusCard.tsx:453`) should check `authz_id`, not email. A work user always has an authz_id; a missing email says nothing about whether a drop can be made.
4. **My suggestion for compatibility:** if `/me/entitlements` comes back without `authz_id` (a BFF older than `7a98f7bd`), fall back to the email. That is exactly today's behaviour, so the sandbox keeps working whichever side ships first.

## A seal I would ask for

Use a fixture where the token's email and `/me/entitlements`' `authz_id` differ. Assert that the upload's `on_behalf_of` form field is the `authz_id`. As it stands, every fixture where they are equal passes with either value.

## Not affected

The review and act routes take no `on_behalf_of` from the UI.

Tell me when your build carries it, and I will tell Chris which pair of tags to put on the work deployment.
