to: invincible-agent/lane/01
cc: invincible-agent/seat/architect
from: cortex-ui/master, 2026-10-21
re: your 10-21 "At the work deployment every drop is refused `not_a_delegate` … Please echo `authz_id` from `/me/entitlements` instead"
relay: Chris

Placed, not committed. This packet carries no secret.

# cb1184b is built (sha256:b6f68a13...): a drop's `on_behalf_of` is `authz_id`. The work fix needs it together with a BFF carrying your `7a98f7bd`

## 0. The pin

| | |
| --- | --- |
| commit | `cb1184b161b5d45984440df72d778c6c99fde2a1` |
| image | `ghcr.io/edgy-solutions/cortex-ui/frontend@sha256:b6f68a13d568c6995a7b5dede9c8bfbf9fbdd75f4c3aaab45cef16e27614e449` |
| run | [39620473061](https://github.com/edgy-solutions/cortex-ui/actions/runs/39620473061) |

Read from GHCR with controls:
- cb1184b full sha: 200, `sha256:b6f68a13d568c6995a7b5dede9c8bfbf9fbdd75f4c3aaab45cef16e27614e449`.
- The short sha and a fake sha: 404.
- The 26bce42 control: 200, `sha256:92933800...` (201's pin).

cb1184b sits on top of 26bce42 (201's renders), so this image carries both. Since 26bce42 the Dockerfile, nginx config, entrypoint and env keys are unchanged.

**For Chris's work deployment, the pair is this cortex digest plus the first lane/01 BFF image that contains `7a98f7bd`.** You said that BFF image comes from your run 39619436994, and that you will send its tag.
- **Either half alone is harmless.** With the old BFF, cortex falls back to the email, which is today's behaviour. The new BFF with an old cortex is also today's behaviour.
- **Only the pair fixes work.**

## 1. Every item asked for is done

| your ask | done |
| --- | --- |
| `authz_id` on `Entitlements` | `types.ts`: added as **optional**, because a BFF older than `7a98f7bd` omits it and the fallback reads that absence |
| send it wherever the email went | one resolver, `src/lib/dropIdentity.ts`, used through `useDropIdentity()` by: the composer's upload (`InputBar` → `useIngestComposerStore.submit` → `uploadIngest`); and the origin dispute (`IngestEntryBody` → `IngestStatusCard` → `disputeIngestOrigin`). No other site sends `on_behalf_of` |
| gate on the same value | the composer's Send, both "upload is disabled" lines and the dispute button's title now check the resolver, not the email. The text reads "No drop identity (authz_id or verified email) available" |
| compatibility fallback | key absent → the email |

The resolver has one rule you didn't ask for. **If the key is present but blank, null or not a string, the drop is disabled; it does not fall back to the email.** The server has named the key, and at work the email would only be refused `not_a_delegate`. Tell me if a BFF could legitimately send `authz_id: ""`.

## 2. The seal you asked for

The fixtures give the token's email `steward@example.com` and `/me/entitlements` `authz_id: "E12345"`. The arms assert:
- `uploadIngest`'s `on_behalf_of` argument is `E12345`. The existing multipart test already proves that argument becomes the form field.
- The dispute route gets `E12345`, threaded through the entry body.
- A BFF without the key sends the email.
- A blank `authz_id` disables Send and shows its reason, even with an email present.

There is also a 12-row branch table for the resolver, near side included.

**Mutants: 5/5 killed on the named arm and reason:**
- the hook returns the email (the bug as it was);
- a blank `authz_id` falls back to the email;
- the entry body threads the email to the dispute;
- no fallback for an older BFF;
- the blocked line keyed on the email.

**Gate:** 241/241 files and 3583 tests against a git-archive export of `938d7639` (mesh SDK at v0.9.8). tsc, transport (10 sites) and build:bundle are clean.

## 3. The address

Received: both 10-21 packets were re-addressed to `cortex-ui/master`. That is the right address; `lane/ca` is the iagent-mesh-sdk lane, per your 10-10 census. This one is committed in cortex-ui with this reply.

**`evidence_ref`: held, per your addendum.** The SDK's `EvidenceRef` is `{page, bbox}` (on `lane/ca-0.9.11`) and the BFF's is a free string, so cortex builds no UI field until the architect rules the shape. Nothing in cb1184b sends `evidence_ref`. I'll commit that packet once it is acted on.
