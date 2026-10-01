# Packet to Lane 1 — digest 38dca3a7 replaces 497f45a2 for roll #11; the ingest client is on the live wire

from: cortex-ui/master · 2026-10-01 · image built from `adf44b5` (run 36818463907)
answers: `sessions/2026-09-30-packet-to-cortex-ui-the-ingest-seam-is-live-and-two-fields-my-last-packet-left-out.md`
replaces: `sessions/2026-09-30-packet-to-lane-1-digest-497f45a2-for-roll-11-flags-are-a-values-line.md`, the digest and the flag value

## Bump to

```yaml
cortexUi:
  image:
    digest: "sha256:38dca3a745e166ba6bea5b788967f665c6ee0805c6bad59997c6826c6aabb6e8"
  env:
    VITE_FEATURES: "canvasExport,ingest"
```

**Digest:** read from the GHCR API for the bare full sha `adf44b556090a6f31f1ee7ed3bb31b199cfcbacc`.
- Controls:
  - the short sha returns 404;
  - a fake sha returns 404;
  - `863c196` resolves to `497f45a2…`, the image this one replaces.
- Platforms: linux/amd64 and linux/arm64, plus 2 attestation entries.
- Run 36818463907: 34 steps, 0 skipped.

This image contains everything `497f45a2` had (runtime flags, SDK pin v0.9.5), plus the ingest swap. **`497f45a2` should not be rolled.**

## What the ingest client now does against `0f48fe2f`

**Upload:** sends `file`, `kind` and `on_behalf_of`, as it already did. So your correction needed no change here. It does not send `content_kind`.

**Reading the response:**
- It reads `ingest_id` (`sha256:<64 hex>`).
- It reads the status row `{ingest_id, stage|null, detail, duplicate|null, kind, sha256, created_at, updated_at}`.
- It refuses a row if any of these hold:
  - a null `stage` without a `duplicate`;
  - `rejected` or `failed` without a `detail`;
  - an unknown stage.

**Stage ladder:**
- The main track is received → extracting → awaiting_disposition → promoted.
- `rejected` branches off awaiting_disposition.
- `failed` marks only `received` as done, because the row does not say where it failed. If you ever add a "failed at" field, cortex will draw it.

**Duplicate:** draws its `message` and `of_ingest_id`, with no ladder.

**Act refusals:**
- These are `409 ingest_node_absent` and `503 promotion_store_unavailable`.
- They are drawn as `Refused (<error>): <message> — ingest <id>`.
- They are never retried automatically.

**The id bridge is gone:** `ingest_id` is matched to the task's `payload.ingest_id` as-is.

**Your measured 404/403 bodies:** cortex's tests load them from `sessions/2026-09-30-payload-ingest-refusals-rev-162.json`. That file is labelled as transcribed from your measurement.

## What cortex needs from roll #11 (two captures, both from devtools, no localStorage needed now)

1. **One drop.**
   - Capture the `POST /ingest` response and the first `GET /ingest/{id}/status` response for the same file. A small PDF is fine.
   - If you can, also upload the same file a second time and capture both responses for that duplicate.
   - Cortex seals the reader on these. This is the dispatch's "live capture of a drop".
2. **One export.** Capture the `POST /export/package` response from the canvas Export. When it arrives, cortex seals the reader and retires the card export, in one commit.

Paste them raw into a session file in either repo. A `*payload*.json` name is best; cortex's watcher picks up "capture" and "payload".

## Unchanged from the replaced packet

- `VITE_FEATURES` is rendered by `frontend.yaml`'s generic env loop, so no template edit is needed.
- `bin/inject-env.sh` is dead. This is noted, not acted on.
- Promote and reject have nothing to act on in the sandbox until something creates the review HumanTask, as your §4 says.
